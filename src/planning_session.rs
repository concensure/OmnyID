/*
 * @module-id: rust.planning-session
 * @primary-capability: rust.source-module
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid
 */

/// Planning Session â€” Interactive Planning Assistant
///
/// Implements the manager-led, stateful orchestration loop described in the
/// "Building a General-Purpose, Interactive Planning Assistant" design:
///
///   Interpret intent ? Inspect state ? Decide next specialist ? Execute ?
///   Normalise result into state ? Decide certainty ? Compose structured output.
///
/// The orchestrator uses AFP messages for all agent-to-agent communication.
/// Session state is machine-readable (no raw chat history reasoning).
/// Progressive autonomy: silent (read-only) specialists never prompt the user.
use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::{
    inference::{InferenceBackend, InferenceMessage, InferenceRequest, dispatch_infer},
    message::{
        AFP_SUBTYPE_PLANNING_ASSUMPTION_CHANGE, AFP_SUBTYPE_PLANNING_RESULT, AFP_TYPE_PLANNING,
        AFPMessage,
    },
    prompt_guidance::append_reasoning_guidance,
};

// -- Tool registry -------------------------------------------------------------
//
// Embedded at compile time from `src/planning_tools.md`.
// Add new APIs/tools by editing that file â€” no Rust changes needed.
static TOOLS_MD: &str = include_str!("planning_tools.md");

/// One entry from the planning_tools.md registry.
#[derive(Debug, Clone)]
#[allow(dead_code)]
struct ToolDefinition {
    id: String,
    /// One-liner injected into the intent parser for every query (low token cost).
    hint: String,
    /// Full schema injected only when this tool is selected (progressive disclosure).
    /// api_key_env values are stripped â€” never injected into prompts.
    schema: String,
    /// If true, the tool isn't wired to a real API yet; informs the LLM to use
    /// general knowledge while setting confidence to medium/low.
    stub: bool,
    /// Name of the env var holding this tool's primary API key (never sent to LLM).
    api_key_env: Option<String>,
    /// Name of the env var holding a backup API key, if any.
    backup_api_key_env: Option<String>,
}

/// Parse the markdown registry into typed definitions.
/// Sections start with `## <id>`, followed by `hint:`, `schema:` block, `status:`.
///
/// `api_key_env` and `backup_api_key_env` lines are parsed into struct fields
/// and are NEVER included in the schema text sent to the LLM.
fn load_tool_registry() -> Vec<ToolDefinition> {
    let mut tools = Vec::new();
    for section in TOOLS_MD.split("\n## ").skip(1) {
        let mut lines = section.lines();
        let id = match lines.next() {
            Some(l) if !l.trim().is_empty() => l.trim().to_string(),
            _ => continue,
        };
        let mut hint = String::new();
        let mut schema_lines: Vec<&str> = Vec::new();
        let mut in_schema = false;
        let mut stub = true;
        let mut api_key_env: Option<String> = None;
        let mut backup_api_key_env: Option<String> = None;

        for line in lines {
            if line.starts_with("hint:") {
                hint = line["hint:".len()..].trim().to_string();
                in_schema = false;
            } else if line.trim() == "schema:" {
                in_schema = true;
            } else if line.starts_with("status:") {
                in_schema = false;
                stub = !line.contains("live");
            } else if line.starts_with("api_key_env:") {
                // Security: extract env var name, do NOT add to schema text.
                api_key_env = Some(line["api_key_env:".len()..].trim().to_string());
                in_schema = false;
            } else if line.starts_with("backup_api_key_env:") {
                backup_api_key_env = Some(line["backup_api_key_env:".len()..].trim().to_string());
                in_schema = false;
            } else if in_schema && !line.starts_with('#') {
                schema_lines.push(line);
            }
        }

        if !hint.is_empty() {
            tools.push(ToolDefinition {
                id,
                hint,
                schema: schema_lines.join("\n").trim().to_string(),
                stub,
                api_key_env,
                backup_api_key_env,
            });
        }
    }
    tools
}

/// Compact list of hints â€” injected into every intent parser call (~1 token per tool).
fn format_tool_hints(tools: &[ToolDefinition]) -> String {
    if tools.is_empty() {
        return String::new();
    }
    let lines: Vec<String> = tools
        .iter()
        .map(|t| format!("  - {}: {}", t.id, t.hint))
        .collect();
    format!(
        "Available tools (select only those relevant to this query):\n{}",
        lines.join("\n")
    )
}

/// Full schemas for selected tools â€” injected only into the compose step.
fn format_tool_schemas(tools: &[&ToolDefinition]) -> String {
    if tools.is_empty() {
        return String::new();
    }
    let sections: Vec<String> = tools.iter()
        .map(|t| {
            let note = if t.stub {
                " [stub â€” live data not wired; use best general knowledge, set confidence medium/low]"
            } else {
                " [live]"
            };
            format!("[{}{}]\n{}", t.id, note, t.schema)
        })
        .collect();
    format!(
        "Tool contracts for selected tools:\n{}",
        sections.join("\n\n")
    )
}

// -- Confidence levels ---------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

impl std::fmt::Display for Confidence {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Confidence::High => write!(f, "high"),
            Confidence::Medium => write!(f, "medium"),
            Confidence::Low => write!(f, "low"),
        }
    }
}

// -- Autonomy level ------------------------------------------------------------

/// How much autonomy a specialist action requires.
/// Matches the design's Progressive Autonomy model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AutonomyLevel {
    /// Read-only tasks â€” no user prompt needed.
    Silent,
    /// Reversible actions â€” soft confirmation shown in UI.
    SoftConfirm,
    /// Irreversible actions â€” hard gate; block until explicit approval.
    HardConfirm,
}

// -- Assumption ---------------------------------------------------------------

/// A single editable assumption shown in the Context Strip.
///
/// When the user edits an assumption the frontend sends a
/// `planning_assumption_change` AFP message; the session re-runs specialists
/// whose outputs depend on the changed field.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanAssumption {
    /// Stable key used to match follow-up changes (e.g. "departure_time").
    pub key: String,
    /// Human-readable label shown in the Context Strip.
    pub label: String,
    /// Current value as a string (parsed by specialist if needed).
    pub value: String,
    /// Whether the user is allowed to edit this assumption in the UI.
    #[serde(default = "bool_true")]
    pub editable: bool,
}

fn bool_true() -> bool {
    true
}

// -- Plan option (ranked result card) -----------------------------------------

/// One ranked option surfaced to the user as an interactive card.
///
/// Cards are ordered best-first. The first card carries the primary recommendation;
/// subsequent cards are alternatives.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanOption {
    /// Short headline shown as the card title.
    pub title: String,
    /// Human-readable summary of this option.
    pub description: String,
    /// Why this option was ranked here (rationale).
    pub rationale: String,
    /// Estimated duration, cost, or key metric for this option.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metric_label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metric_value: Option<String>,
    /// Data freshness / reliability of this specific option.
    pub confidence: Confidence,
    /// Optional risk flags (e.g. "Major event nearby", "Weather alert").
    #[serde(default)]
    pub risk_flags: Vec<String>,
    /// One-tap follow-up chips shown below the card
    /// (e.g. "Leave 20 mins later", "Avoid tolls").
    #[serde(default)]
    pub follow_up_chips: Vec<String>,
}

// -- Comparison row ------------------------------------------------------------

/// A single row inside the optional comparison table.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ComparisonRow {
    pub label: String,
    pub values: Vec<String>,
}

// -- Planning result -----------------------------------------------------------

/// The structured output composed by the Response/UI Planner specialist.
///
/// This is what the frontend renders as the Results Canvas.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlanningResult {
    /// Short summary sentence for the Context Strip header.
    pub summary: String,
    /// Ranked options (best first).
    pub options: Vec<PlanOption>,
    /// Editable assumptions that drove these results.
    pub assumptions: Vec<PlanAssumption>,
    /// Optional comparison table (column headers, then rows).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comparison_headers: Option<Vec<String>>,
    #[serde(default)]
    pub comparison_rows: Vec<ComparisonRow>,
    /// Unresolved ambiguities the user should clarify.
    #[serde(default)]
    pub unresolved: Vec<String>,
    /// Correlation ID linking all AFP messages in this session.
    pub correlation_id: String,
    /// The original goal, normalised.
    pub goal: String,
}

// -- Session state (working memory) --------------------------------------------

/// Machine-readable session state â€” the orchestrator reasons over this,
/// not over raw chat history.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PlanningSessionState {
    /// Normalised user goal (set after intent parsing).
    pub goal: Option<String>,
    /// Extracted constraints from the latest query.
    pub constraints: HashMap<String, String>,
    /// Current assumptions (may be edited by the user).
    pub assumptions: Vec<PlanAssumption>,
    /// Evidence gathered by specialists so far.
    pub evidence: HashMap<String, serde_json::Value>,
    /// Ambiguities that have not yet been resolved.
    pub unresolved: Vec<String>,
    /// Correlation ID for this session's AFP thread.
    pub correlation_id: String,
    /// Parent thread ID for follow-up chaining.
    pub thread_id: String,
}

// -- PlanningSession -----------------------------------------------------------

pub struct PlanningSession {
    pub owner_user_id: String,
    pub agent_instance_id: String,
}

impl PlanningSession {
    pub fn new(owner_user_id: String, agent_instance_id: String) -> Self {
        Self {
            owner_user_id,
            agent_instance_id,
        }
    }

    /// Execute a full planning query.
    ///
    /// Steps:
    /// 1. Intent & Constraint Parser â€” extracts goal, constraints, ambiguities.
    /// 2. Preference Modeller â€” infers assumptions from user context.
    /// 3. Live Conditions Analyser â€” fetches constraints (stubbed; wired via tool layer).
    /// 4. Response/UI Planner â€” composes structured PlanningResult.
    /// 5. Wraps result as an AFP `planning:result` message.
    pub async fn run(
        &self,
        query: &str,
        prior_state: Option<PlanningSessionState>,
        backend: &InferenceBackend,
        model: &str,
        operational_soul_md: Option<&str>,
        output_persona_md: Option<&str>,
    ) -> Result<(PlanningResult, AFPMessage), String> {
        let correlation_id = ulid::Ulid::new().to_string();
        let thread_id = prior_state
            .as_ref()
            .map(|s| s.thread_id.clone())
            .unwrap_or_else(|| format!("planning:{}", &correlation_id[..16]));
        let reasoning_guidance =
            crate::server::skill_capsule_routes::selected_reasoning_skill_guidance_for_user(
                &self.owner_user_id,
            )
            .unwrap_or_default();

        // Load tool registry (embedded at compile time â€” zero I/O).
        let tools = load_tool_registry();

        // Step 1: intent + constraint parsing + tool selection
        // The intent parser sees one-liner hints for all tools and returns which
        // tool IDs are needed. Full schemas are NOT injected yet.
        let parsed = self
            .run_intent_parser(
                query,
                prior_state.as_ref(),
                backend,
                model,
                operational_soul_md,
                &tools,
                &reasoning_guidance,
            )
            .await?;

        // Resolve selected tools from the registry.
        let selected_tools: Vec<&ToolDefinition> = tools
            .iter()
            .filter(|t| parsed.tools_needed.contains(&t.id))
            .collect();

        // Step 2: preference modelling (merges prior assumptions with new constraints)
        let assumptions = self.model_preferences(&parsed, prior_state.as_ref());

        // Step 3: live conditions â€” passes selected tool schemas + returns evidence
        let evidence = self.analyse_conditions(&parsed, &selected_tools).await;

        // Build tool context string for the compose step (full schemas, selected tools only).
        let tool_schemas = format_tool_schemas(&selected_tools);

        // Step 4: compose structured result
        let result = self
            .compose_result(
                query,
                &parsed,
                &assumptions,
                &evidence,
                &correlation_id,
                backend,
                model,
                operational_soul_md,
                output_persona_md,
                &tool_schemas,
                &reasoning_guidance,
            )
            .await?;

        // Step 5: wrap as AFP message
        let afp = self.result_to_afp(&result, &thread_id);

        Ok((result, afp))
    }

    // -- Specialist: Intent & Constraint Parser --------------------------------

    async fn run_intent_parser(
        &self,
        query: &str,
        prior: Option<&PlanningSessionState>,
        backend: &InferenceBackend,
        model: &str,
        soul_md: Option<&str>,
        tools: &[ToolDefinition],
        reasoning_guidance: &[String],
    ) -> Result<ParsedIntent, String> {
        let prior_context = prior
            .map(|s| {
                format!(
                    "\nPrior goal: {}\nPrior constraints: {}",
                    s.goal.as_deref().unwrap_or("(none)"),
                    serde_json::to_string(&s.constraints).unwrap_or_default()
                )
            })
            .unwrap_or_default();

        // Progressive disclosure phase 1: all tool hints live in the system message.
        // Each hint is ~1 token â€” negligible cost regardless of tool count.
        let tool_hints_block = if tools.is_empty() {
            String::new()
        } else {
            format!("\n\n{}", format_tool_hints(tools))
        };

        // Context belongs in the system message; the task belongs in the user message.
        let system = append_reasoning_guidance(
            &format!(
                "{soul}You are the intent & constraint parser for the planning assistant.\n\
            Extract the goal, constraints, and relevant tool IDs from user queries.\n\
            Return ONLY valid JSON â€” no prose, no code fences.{tool_hints_block}",
                soul = soul_md.map(|s| format!("{s}\n\n")).unwrap_or_default(),
            ),
            reasoning_guidance,
            "planning intent parsing",
        );

        let user_prompt = format!(
            "Parse this planning query.{prior_context}\n\n\
            Return JSON:\n\
            {{\n\
              \"goal\": \"<normalised goal, one sentence>\",\n\
              \"constraints\": {{\"<key>\": \"<value>\"}},\n\
              \"ambiguities\": [\"<question that needs clarification>\"],\n\
              \"tools_needed\": [\"<tool_id from Available tools>\"]\n\
            }}\n\n\
            Query: {query}"
        );

        let req = InferenceRequest {
            system,
            messages: vec![InferenceMessage {
                role: "user".to_string(),
                content: user_prompt,
            }],
            max_tokens: 512,
            temperature: 0.1,
        };

        let resp = dispatch_infer(backend, model, &req)
            .await
            .map_err(|e| format!("intent parser failed: {e}"))?;

        let text = resp.content.trim();
        let start = text.find('{').unwrap_or(0);
        let end = text.rfind('}').map(|i| i + 1).unwrap_or(text.len());

        serde_json::from_str::<ParsedIntent>(&text[start..end])
            .map_err(|e| format!("intent parse error: {e}"))
    }

    // -- Specialist: Preference Modeller ---------------------------------------

    fn model_preferences(
        &self,
        parsed: &ParsedIntent,
        prior: Option<&PlanningSessionState>,
    ) -> Vec<PlanAssumption> {
        // Start from prior assumptions so iterative follow-ups preserve context.
        let mut assumptions: HashMap<String, PlanAssumption> = prior
            .map(|s| {
                s.assumptions
                    .iter()
                    .map(|a| (a.key.clone(), a.clone()))
                    .collect()
            })
            .unwrap_or_default();

        // Fold new constraints into assumptions (constraints override priors).
        for (key, value) in &parsed.constraints {
            assumptions.insert(
                key.clone(),
                PlanAssumption {
                    key: key.clone(),
                    label: key_to_label(key),
                    value: value.clone(),
                    editable: true,
                },
            );
        }

        // Ensure a minimum set of planning assumptions are always present.
        for (key, label, default) in default_assumption_seeds() {
            assumptions
                .entry(key.to_string())
                .or_insert_with(|| PlanAssumption {
                    key: key.to_string(),
                    label: label.to_string(),
                    value: default.to_string(),
                    editable: true,
                });
        }

        // Return sorted by key for stable ordering.
        let mut result: Vec<PlanAssumption> = assumptions.into_values().collect();
        result.sort_by(|a, b| a.key.cmp(&b.key));
        result
    }

    // -- Specialist: Live Conditions Analyser ----------------------------------

    /// Runs selected tools against live APIs.
    /// Currently all tools are stubs â€” returns a status notice per tool so the
    /// LLM knows which tools were considered and sets confidence appropriately.
    /// Wire real API calls here as tools transition from stub ? live in planning_tools.md.
    async fn analyse_conditions(
        &self,
        _parsed: &ParsedIntent,
        selected_tools: &[&ToolDefinition],
    ) -> HashMap<String, serde_json::Value> {
        let mut evidence: HashMap<String, serde_json::Value> = HashMap::new();
        for tool in selected_tools {
            if tool.stub {
                // Let the compose step know this tool was selected but has no live data.
                evidence.insert(
                    format!("{}_status", tool.id),
                    serde_json::json!("stub â€” no live data; LLM should use general knowledge"),
                );
            }
            // When tool.stub == false: call the real API here and insert results.
        }
        evidence
    }

    // -- Specialist: Response/UI Planner ---------------------------------------

    async fn compose_result(
        &self,
        original_query: &str,
        parsed: &ParsedIntent,
        assumptions: &[PlanAssumption],
        evidence: &HashMap<String, serde_json::Value>,
        correlation_id: &str,
        backend: &InferenceBackend,
        model: &str,
        operational_soul_md: Option<&str>,
        output_persona_md: Option<&str>,
        tool_schemas: &str,
        reasoning_guidance: &[String],
    ) -> Result<PlanningResult, String> {
        let assumptions_json = serde_json::to_string(assumptions).unwrap_or_default();
        let evidence_json = if evidence.is_empty() {
            "(none yet â€” use general knowledge, set confidence to medium/low)".to_string()
        } else {
            serde_json::to_string(evidence).unwrap_or_default()
        };

        // Progressive disclosure phase 2: full tool schemas belong in the system message
        // alongside the soul/identity â€” they are authoritative context, not user input.
        // The master orchestrator owns this full context; the user message carries only
        // the specific planning data for this request.
        let tool_block = if tool_schemas.is_empty() {
            String::new()
        } else {
            format!("\n\n{tool_schemas}")
        };
        let persona_block = output_persona_md
            .map(|s| format!("\n\nUser-facing output persona:\n{s}"))
            .unwrap_or_default();

        let system = append_reasoning_guidance(
            &format!(
                "{soul}You are the planning assistant orchestrator.\n\
            Compose ranked option cards given a planning context.\n\
            Return ONLY valid JSON â€” no prose, no code fences.{tool_block}{persona_block}",
                soul = operational_soul_md
                    .map(|s| format!("{s}\n\n"))
                    .unwrap_or_default(),
            ),
            reasoning_guidance,
            "planning result composition",
        );

        let user_prompt = format!(
            "Planning query: {original_query}\n\n\
            Extracted context:\n\
            Goal: {goal}\n\
            Constraints: {constraints}\n\
            Assumptions: {assumptions_json}\n\
            Evidence: {evidence_json}\n\n\
            Return JSON:\n\
            {{\n\
              \"summary\": \"<one sentence result header>\",\n\
              \"options\": [\n\
                {{\n\
                  \"title\": \"<short headline>\",\n\
                  \"description\": \"<detail>\",\n\
                  \"rationale\": \"<why ranked here>\",\n\
                  \"metric_label\": \"<e.g. Travel time>\",\n\
                  \"metric_value\": \"<e.g. 32 min>\",\n\
                  \"confidence\": \"high|medium|low\",\n\
                  \"risk_flags\": [\"<flag>\"],\n\
                  \"follow_up_chips\": [\"<chip label>\"]\n\
                }}\n\
              ],\n\
              \"comparison_headers\": [\"<col>\"],\n\
              \"comparison_rows\": [{{\"label\": \"<row>\", \"values\": [\"<val>\"]}}],\n\
              \"unresolved\": [\"<question>\"]\n\
            }}\n\n\
            Generate 2-4 ranked options. Include a comparison table when 3+ options exist.\n\
            follow_up_chips: =5 words each. Use \"high\" confidence only when backed by live data.",
            goal = parsed.goal,
            constraints = serde_json::to_string(&parsed.constraints).unwrap_or_default(),
        );

        let req = InferenceRequest {
            system,
            messages: vec![InferenceMessage {
                role: "user".to_string(),
                content: user_prompt,
            }],
            max_tokens: 2048,
            temperature: 0.3,
        };

        let resp = dispatch_infer(backend, model, &req)
            .await
            .map_err(|e| format!("result composer failed: {e}"))?;

        let text = resp.content.trim();
        let start = text.find('{').unwrap_or(0);
        let end = text.rfind('}').map(|i| i + 1).unwrap_or(text.len());
        let json_str = &text[start..end];

        let partial: serde_json::Value = serde_json::from_str(json_str)
            .map_err(|e| format!("result parse error: {e}; raw: {json_str}"))?;

        let options: Vec<PlanOption> =
            serde_json::from_value(partial["options"].clone()).unwrap_or_default();

        let comparison_headers: Option<Vec<String>> =
            serde_json::from_value(partial["comparison_headers"].clone()).ok();

        let comparison_rows: Vec<ComparisonRow> =
            serde_json::from_value(partial["comparison_rows"].clone()).unwrap_or_default();

        let unresolved: Vec<String> =
            serde_json::from_value(partial["unresolved"].clone()).unwrap_or_default();

        let summary = partial["summary"]
            .as_str()
            .unwrap_or("Planning complete")
            .to_string();

        Ok(PlanningResult {
            summary,
            options,
            assumptions: assumptions.to_vec(),
            comparison_headers,
            comparison_rows,
            unresolved,
            correlation_id: correlation_id.to_string(),
            goal: parsed.goal.clone(),
        })
    }

    // -- Assumption change fast-path -------------------------------------------

    /// Fast-path for Context Strip edits: skip the intent parser entirely.
    ///
    /// When a user edits an assumption, we already know the goal and tool selection â€”
    /// we only need to re-run the compose step with the merged assumption.
    /// This saves one full LLM round-trip compared to a regular follow-up query.
    ///
    /// An AFP `planning:assumption_change` message is stored alongside the result
    /// to provide an audit trail of how session state evolved.
    pub async fn run_assumption_change(
        &self,
        key: &str,
        value: &str,
        prior_state: PlanningSessionState,
        backend: &InferenceBackend,
        model: &str,
        operational_soul_md: Option<&str>,
        output_persona_md: Option<&str>,
    ) -> Result<(PlanningResult, AFPMessage, AFPMessage), String> {
        let correlation_id = ulid::Ulid::new().to_string();
        let thread_id = prior_state.thread_id.clone();
        let reasoning_guidance =
            crate::server::skill_capsule_routes::selected_reasoning_skill_guidance_for_user(
                &self.owner_user_id,
            )
            .unwrap_or_default();

        // Merge the single assumption change into the prior state.
        let mut updated_assumptions = prior_state.assumptions.clone();
        if let Some(existing) = updated_assumptions.iter_mut().find(|a| a.key == key) {
            existing.value = value.to_string();
        } else {
            updated_assumptions.push(PlanAssumption {
                key: key.to_string(),
                label: key_to_label(key),
                value: value.to_string(),
                editable: true,
            });
        }

        // Build an AFP `planning:assumption_change` audit message.
        let change_afp = AFPMessage {
            protocol: "afp-v1".to_string(),
            id: format!("assump-{}", &correlation_id[..16]),
            thread_id: thread_id.clone(),
            parent_id: None,
            from: self.agent_instance_id.clone(),
            to: vec![self.owner_user_id.clone()],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: AFP_TYPE_PLANNING.to_string(),
            kind: None,
            supertags: vec![],
            subtype: Some(AFP_SUBTYPE_PLANNING_ASSUMPTION_CHANGE.to_string()),
            content: serde_json::json!({ "key": key, "value": value }),
            metadata: Some(serde_json::json!({ "store": true, "autonomy": "silent" })),
            signature: String::new(),
            encryption: None,
            views: vec![],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        };

        // Reconstruct parsed intent from prior state (no LLM call needed).
        let parsed = ParsedIntent {
            goal: prior_state.goal.clone().unwrap_or_default(),
            constraints: prior_state.constraints.clone(),
            ambiguities: vec![],
            tools_needed: vec![],
        };

        let tools = load_tool_registry();
        let selected_tools: Vec<&ToolDefinition> = tools
            .iter()
            .filter(|t| {
                prior_state
                    .evidence
                    .contains_key(&format!("{}_status", t.id))
            })
            .collect();
        let tool_schemas = format_tool_schemas(&selected_tools);

        // Re-run only the compose step.
        let result = self
            .compose_result(
                &format!("Assumption update: {} = {}", key, value),
                &parsed,
                &updated_assumptions,
                &prior_state.evidence,
                &correlation_id,
                backend,
                model,
                operational_soul_md,
                output_persona_md,
                &tool_schemas,
                &reasoning_guidance,
            )
            .await?;

        let result_afp = self.result_to_afp(&result, &thread_id);
        Ok((result, result_afp, change_afp))
    }

    // -- AFP message builder ---------------------------------------------------

    fn result_to_afp(&self, result: &PlanningResult, thread_id: &str) -> AFPMessage {
        AFPMessage {
            protocol: "afp-v1".to_string(),
            id: format!("plan-{}", &result.correlation_id[..16]),
            thread_id: thread_id.to_string(),
            parent_id: None,
            from: self.agent_instance_id.clone(),
            to: vec![self.owner_user_id.clone()],
            timestamp: chrono::Utc::now().to_rfc3339(),
            r#type: AFP_TYPE_PLANNING.to_string(),
            kind: None,
            supertags: vec![],
            subtype: Some(AFP_SUBTYPE_PLANNING_RESULT.to_string()),
            content: serde_json::to_value(result).unwrap_or_default(),
            metadata: Some(serde_json::json!({
                "store": true,
                "autonomy": "silent",
            })),
            signature: String::new(),
            encryption: None,
            // views are pure routing hints â€” data lives in content, not duplicated here.
            views: vec![serde_json::json!({
                "format": "planning_result",
                "priority": 10,
            })],
            references: vec![],
            typed_refs: vec![],
            attachments: vec![],
            store_in_relational: true,
            prev_hash: None,
        }
    }
}

// -- Internal helpers ----------------------------------------------------------

#[derive(Debug, Deserialize)]
struct ParsedIntent {
    goal: String,
    #[serde(default)]
    constraints: HashMap<String, String>,
    #[serde(default)]
    #[allow(dead_code)]
    ambiguities: Vec<String>,
    /// Tool IDs the intent parser selected for this query (progressive disclosure).
    #[serde(default)]
    tools_needed: Vec<String>,
}

fn key_to_label(key: &str) -> String {
    key.replace('_', " ")
        .split_whitespace()
        .map(|w| {
            let mut chars = w.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Returns `(key, label, default_value)` for assumptions that should always
/// be present in a planning session so the Context Strip is never empty.
fn default_assumption_seeds() -> &'static [(&'static str, &'static str, &'static str)] {
    &[
        ("priority", "Priority", "Fastest"),
        ("walking_tolerance", "Walking tolerance", "10 mins"),
    ]
}

// -- Tests ---------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_to_label_converts_snake_case() {
        assert_eq!(key_to_label("departure_time"), "Departure Time");
        assert_eq!(key_to_label("avoid_tolls"), "Avoid Tolls");
        assert_eq!(key_to_label("priority"), "Priority");
    }

    #[test]
    fn model_preferences_merges_prior_and_new_constraints() {
        let session = PlanningSession::new("user1".into(), "agent1".into());
        let prior = PlanningSessionState {
            assumptions: vec![PlanAssumption {
                key: "priority".into(),
                label: "Priority".into(),
                value: "Cheapest".into(),
                editable: true,
            }],
            ..Default::default()
        };
        let parsed = ParsedIntent {
            goal: "Get to the city".into(),
            constraints: {
                let mut m = HashMap::new();
                m.insert("departure_time".into(), "6:30 PM".into());
                m
            },
            ambiguities: vec![],
            tools_needed: vec![],
        };
        let assumptions = session.model_preferences(&parsed, Some(&prior));
        let keys: Vec<&str> = assumptions.iter().map(|a| a.key.as_str()).collect();
        // Prior "priority" preserved, new "departure_time" added, defaults filled
        assert!(keys.contains(&"priority"));
        assert!(keys.contains(&"departure_time"));
        assert!(keys.contains(&"walking_tolerance"));
        // Prior value preserved when no override
        let priority = assumptions.iter().find(|a| a.key == "priority").unwrap();
        assert_eq!(priority.value, "Cheapest");
    }

    #[test]
    fn plan_option_round_trips_json() {
        let option = PlanOption {
            title: "Train to CBD".into(),
            description: "Catch the 6:35 PM express.".into(),
            rationale: "Fastest option with no tolls.".into(),
            metric_label: Some("Travel time".into()),
            metric_value: Some("28 min".into()),
            confidence: Confidence::High,
            risk_flags: vec![],
            follow_up_chips: vec!["Leave 20 mins later".into()],
        };
        let j = serde_json::to_string(&option).unwrap();
        let back: PlanOption = serde_json::from_str(&j).unwrap();
        assert_eq!(back.title, "Train to CBD");
        assert_eq!(back.confidence, Confidence::High);
    }

    #[test]
    fn planning_result_default_is_valid() {
        let r = PlanningResult::default();
        assert!(r.options.is_empty());
        assert!(r.assumptions.is_empty());
        let j = serde_json::to_string(&r).unwrap();
        assert!(j.contains("options"));
    }

    #[test]
    fn reasoning_guidance_prompt_helper_is_noop_without_guidance() {
        let base = "Base planning prompt";
        assert_eq!(
            append_reasoning_guidance(base, &[], "planning intent parsing"),
            base
        );
    }

    #[test]
    fn reasoning_guidance_prompt_helper_appends_guidance() {
        let prompt = append_reasoning_guidance(
            "Base planning prompt",
            &[
                "Use grounded reasoning.".to_string(),
                "Run a brief reflection pass.".to_string(),
            ],
            "planning result composition",
        );
        assert!(prompt.contains("# Enabled workspace reasoning guidance"));
        assert!(prompt.contains("- Use grounded reasoning."));
        assert!(prompt.contains("- Run a brief reflection pass."));
        assert!(prompt.contains("planning result composition"));
    }

    #[test]
    fn result_to_afp_sets_correct_type_and_view() {
        let session = PlanningSession::new("user1".into(), "agent1".into());
        let result = PlanningResult {
            summary: "3 routes found".into(),
            goal: "Get to the city".into(),
            correlation_id: "01J0000000000000000000000A".into(),
            ..Default::default()
        };
        let afp = session.result_to_afp(&result, "planning:test-thread");
        assert_eq!(afp.r#type, "planning");
        assert_eq!(afp.subtype.as_deref(), Some("planning:result"));
        assert_eq!(afp.thread_id, "planning:test-thread");
        assert!(!afp.views.is_empty());
        assert_eq!(afp.views[0]["format"].as_str(), Some("planning_result"));
    }
}
