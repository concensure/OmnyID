/*
 * @module-id: integration.skill-capsule-bridge
 * @primary-capability: skill-capsule-runtime-bridge
 * @sub-capabilities: classify-match-compose, hook-phase-execution, artifact-inspection
 * @locs-version: 2.0
 * @stability: active
 * @owner: omnyid-runtime
 */

#![allow(dead_code)]

use super::*;
use std::path::PathBuf;

mod bridge;
#[cfg(test)]
mod tests;

use bridge::{
    artifact_query_to_value, build_skill_capsule_bridge_context,
    collect_skill_capsule_bridge_warnings, ensure_skill_capsule_bridge_ready,
    load_workspace_skill_selection, run_skill_capsule_operation, save_workspace_skill_selection,
    selected_reasoning_skill_guidance_from_ids, selected_workspace_skill_summaries_from_catalog,
};
pub(crate) use bridge::{
    invoke_skill_capsule_operation, selected_reasoning_skill_guidance_for_user,
    selected_workspace_skill_summaries_for_user,
};

const OMNYID_WORKSPACE_SKILLS_FILE: &str = "omnyid.workspace.skills.json";

pub(super) fn routes() -> Router<Arc<AppState>> {
    Router::new()
        .route("/skill-capsule/catalog", get(skill_capsule_catalog_http))
        .route(
            "/skill-capsule/workspace",
            get(skill_capsule_workspace_http),
        )
        .route(
            "/skill-capsule/workspace",
            post(skill_capsule_workspace_update_http),
        )
        .route("/skill-capsule/doctor", get(skill_capsule_doctor_http))
        .route("/skill-capsule/classify", post(skill_capsule_classify_http))
        .route("/skill-capsule/match", post(skill_capsule_match_http))
        .route("/skill-capsule/compose", post(skill_capsule_compose_http))
        .route("/skill-capsule/prepare", post(skill_capsule_prepare_http))
        .route("/skill-capsule/activate", post(skill_capsule_activate_http))
        .route("/skill-capsule/verify", post(skill_capsule_verify_http))
        .route(
            "/skill-capsule/artifacts",
            get(skill_capsule_artifact_list_http),
        )
        .route(
            "/skill-capsule/artifacts/summary",
            get(skill_capsule_artifact_summary_http),
        )
        .route(
            "/skill-capsule/artifacts/lineage/{run_id}",
            get(skill_capsule_artifact_lineage_http),
        )
        .route("/skill-capsule/generate", post(skill_capsule_generate_http))
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub(crate) struct WorkspaceSkillSelection {
    pub selected_skill_ids: Vec<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq, Eq)]
pub(crate) struct WorkspaceSkillSummary {
    pub id: String,
    pub title: String,
    pub category: String,
    pub capsule_kind: String,
    pub integration_mode: String,
    pub surfaces: Vec<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
struct WorkspaceSkillSelectionResponse {
    selected_skill_ids: Vec<String>,
    updated_at: String,
    reasoning_guidance: Vec<String>,
    selected_skill_summaries: Vec<WorkspaceSkillSummary>,
}

#[derive(Debug, Clone, serde::Serialize)]
struct SkillCapsuleCatalogEntry {
    id: &'static str,
    title: &'static str,
    category: &'static str,
    capsule_kind: &'static str,
    description: &'static str,
    integration_mode: &'static str,
    existing_runtime_fit: &'static str,
    surfaces: &'static [&'static str],
    tags: &'static [&'static str],
    compose_placeholder: Option<&'static str>,
    compose_scaffold: Option<&'static str>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
struct SkillCapsuleCatalogItem {
    id: String,
    title: String,
    category: String,
    capsule_kind: String,
    description: String,
    integration_mode: String,
    existing_runtime_fit: String,
    surfaces: Vec<String>,
    tags: Vec<String>,
    compose_placeholder: Option<String>,
    compose_scaffold: Option<String>,
}

impl From<&SkillCapsuleCatalogEntry> for SkillCapsuleCatalogItem {
    fn from(value: &SkillCapsuleCatalogEntry) -> Self {
        Self {
            id: value.id.to_string(),
            title: value.title.to_string(),
            category: value.category.to_string(),
            capsule_kind: value.capsule_kind.to_string(),
            description: value.description.to_string(),
            integration_mode: value.integration_mode.to_string(),
            existing_runtime_fit: value.existing_runtime_fit.to_string(),
            surfaces: value
                .surfaces
                .iter()
                .map(|surface| surface.to_string())
                .collect(),
            tags: value.tags.iter().map(|tag| tag.to_string()).collect(),
            compose_placeholder: value.compose_placeholder.map(str::to_string),
            compose_scaffold: value.compose_scaffold.map(str::to_string),
        }
    }
}

#[derive(Debug, serde::Deserialize)]
struct WorkspaceSkillSelectionUpdateRequest {
    selected_skill_ids: Vec<String>,
}

const SKILL_CAPSULE_CATALOG: &[SkillCapsuleCatalogEntry] = &[
    SkillCapsuleCatalogEntry {
        id: "reasoning.react_grounded",
        title: "Grounded ReAct",
        category: "Reasoning",
        capsule_kind: "reasoning",
        description: "Use bounded thought-action-observation steps so the agent stays grounded in tools and user data.",
        integration_mode: "master_loop_overlay",
        existing_runtime_fit: "Extends the existing preflight + ReAct loop rather than replacing it.",
        surfaces: &["chat", "workflow", "fleet"],
        tags: &["react", "grounding", "tool-use"],
        compose_placeholder: None,
        compose_scaffold: None,
    },
    SkillCapsuleCatalogEntry {
        id: "reasoning.recommendation_debate",
        title: "Recommendation Debate",
        category: "Reasoning",
        capsule_kind: "reasoning",
        description: "Use bounded internal role debate for recommendation quality: persona custodian, discovery scout, critic.",
        integration_mode: "orchestration_overlay",
        existing_runtime_fit: "Maps to current orchestrate/delegation paths with bounded internal role prompts.",
        surfaces: &["chat", "workflow", "fleet"],
        tags: &["recommendation", "debate", "confidence"],
        compose_placeholder: None,
        compose_scaffold: None,
    },
    SkillCapsuleCatalogEntry {
        id: "reasoning.self_reflection_guard",
        title: "Self-Reflection Guard",
        category: "Reasoning",
        capsule_kind: "reasoning",
        description: "Apply fact, constraint, and tone reflection before high-stakes outputs are surfaced.",
        integration_mode: "reflection_overlay",
        existing_runtime_fit: "Extends the existing reflection budget and bounded recovery logic.",
        surfaces: &["chat", "workflow", "fleet", "note", "email"],
        tags: &["reflection", "safety", "quality"],
        compose_placeholder: None,
        compose_scaffold: None,
    },
    SkillCapsuleCatalogEntry {
        id: "content.email.professional_reply",
        title: "Professional Email Reply",
        category: "Content",
        capsule_kind: "content",
        description: "Draft clear, context-aware professional replies with a concise structure and explicit next step.",
        integration_mode: "editor_compose",
        existing_runtime_fit: "Fits the existing email editor and draft review flow cleanly.",
        surfaces: &["email"],
        tags: &["email", "reply", "professional"],
        compose_placeholder: Some(
            "Draft a professional reply with a clear answer, rationale, and next step.",
        ),
        compose_scaffold: Some(
            "Hi [Name],\n\nThanks for your message about [topic].\n\n[Direct answer or update]\n\n[Key details / rationale]\n\nNext step: [action or question]\n\nBest,\n[Your name]",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "content.email.follow_up",
        title: "Follow-Up Email",
        category: "Content",
        capsule_kind: "content",
        description: "Create polite follow-ups that restate context, unblock decisions, and keep momentum.",
        integration_mode: "editor_compose",
        existing_runtime_fit: "Works as a reusable email compose mode in the existing Tiptap email editor.",
        surfaces: &["email"],
        tags: &["email", "follow-up", "workflow"],
        compose_placeholder: Some(
            "Draft a concise follow-up that references prior context and asks for the next decision.",
        ),
        compose_scaffold: Some(
            "Hi [Name],\n\nFollowing up on [previous topic / thread].\n\nWe are currently at: [current status].\n\nCould you confirm [decision / input] by [timeframe]?\n\nThanks,\n[Your name]",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "content.marketing.frameworks",
        title: "Marketing Framework Writer",
        category: "Content",
        capsule_kind: "content",
        description: "Apply proven structures like AIDA or PAS for landing-page copy, campaigns, and outbound messaging.",
        integration_mode: "editor_compose",
        existing_runtime_fit: "Fits note and workspace editor surfaces as a structured draft scaffold.",
        surfaces: &["note", "space"],
        tags: &["marketing", "aida", "pas", "copywriting"],
        compose_placeholder: Some(
            "Choose AIDA or PAS and draft conversion-focused marketing copy for the selected goal.",
        ),
        compose_scaffold: Some(
            "Framework: [AIDA or PAS]\nAudience: [target audience]\nGoal: [conversion goal]\nOffer: [product / service]\n\nDraft:\n1. Attention / Problem\n2. Interest / Agitation\n3. Desire / Solution\n4. Action",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "content.social.platform_post",
        title: "Platform-Optimized Social Post",
        category: "Content",
        capsule_kind: "content",
        description: "Generate short-form posts tailored to LinkedIn, X, Threads, or similar channels.",
        integration_mode: "editor_compose",
        existing_runtime_fit: "Fits note and workspace drafting flows before publishing through connected tools.",
        surfaces: &["note", "space"],
        tags: &["social", "linkedin", "x", "threads"],
        compose_placeholder: Some(
            "Draft a platform-specific post with a strong hook, concise body, and CTA.",
        ),
        compose_scaffold: Some(
            "Platform: [LinkedIn / X / Threads]\nTopic: [topic]\nHook: [first line]\nKey point 1: [...]\nKey point 2: [...]\nCall to action: [...]",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "content.note.refine_expand",
        title: "Refine and Expand Note",
        category: "Content",
        capsule_kind: "content",
        description: "Expand rough notes into polished prose while preserving the original intent and structure.",
        integration_mode: "editor_compose",
        existing_runtime_fit: "Complements the existing note editor and AI actions without replacing them.",
        surfaces: &["note"],
        tags: &["notes", "rewrite", "expansion"],
        compose_placeholder: Some(
            "Expand this rough note into polished prose while preserving facts and intent.",
        ),
        compose_scaffold: Some(
            "Goal: Refine and expand the note below.\nAudience: [self / team / customer]\nTone: [clear / warm / formal]\n\nSource note:\n[Paste or write bullet points here]",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "content.presentation.deck_builder",
        title: "Presentation Deck Builder",
        category: "Content",
        capsule_kind: "content",
        description: "Prepare slide outlines and deck-ready structure for presentation workflows using tools such as Presenton, Slidev, or PPT generators.",
        integration_mode: "editor_compose",
        existing_runtime_fit: "Fits note and workspace drafting flows before export or deck-generation handoff.",
        surfaces: &["note", "space"],
        tags: &["presentation", "slides", "ppt", "outline"],
        compose_placeholder: Some(
            "Draft a slide deck outline with title, audience, narrative arc, and slide-by-slide bullets.",
        ),
        compose_scaffold: Some(
            "Deck goal: [goal]\nAudience: [audience]\nDesired length: [5 / 10 / 20 slides]\n\nSlides:\n1. Title and outcome\n2. Context\n3. Key insight\n4. Evidence\n5. Recommendation\n6. Next steps",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "content.website.prototype",
        title: "Website Prototype Generator",
        category: "Content",
        capsule_kind: "content",
        description: "Prepare landing-page and feature-view structure suitable for UI generators such as Bolt, vx.dev, or OpenUI.",
        integration_mode: "editor_compose",
        existing_runtime_fit: "Fits workspace and note surfaces as a structured prototype brief before code generation.",
        surfaces: &["note", "space"],
        tags: &["website", "frontend", "prototype", "ui"],
        compose_placeholder: Some(
            "Draft a clear product/page spec with sections, interactions, and implementation notes for a generated UI prototype.",
        ),
        compose_scaffold: Some(
            "Product/page goal: [goal]\nPrimary audience: [audience]\nCore sections:\n- Hero\n- Proof\n- Features\n- CTA\n\nInteractions:\n- [interaction]\n\nImplementation notes:\n- Stack\n- Components\n- Data needs",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "developer.fullstack.scaffold",
        title: "Full-Stack App Scaffold",
        category: "Developer",
        capsule_kind: "developer",
        description: "Prepare architecture, route, schema, and delivery plans for full-stack generators such as GPT Pilot, Wasp, or Amplication.",
        integration_mode: "workspace_planning",
        existing_runtime_fit: "Fits current workspace planning, runner, and draft-review flows before execution.",
        surfaces: &["space", "workflow", "fleet"],
        tags: &["backend", "fullstack", "scaffold", "architecture"],
        compose_placeholder: Some(
            "Draft a production-oriented app scaffold plan with frontend, backend, auth, data model, and rollout notes.",
        ),
        compose_scaffold: Some(
            "App goal: [goal]\nUsers: [users]\nCore entities: [entities]\nFrontend: [views]\nBackend: [services / routes]\nData model: [tables]\nAuth: [auth]\nRisks: [risks]\nNext implementation slice: [slice]",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "crm.relationship.local_intelligence",
        title: "Local Relationship Intelligence",
        category: "CRM",
        capsule_kind: "integration",
        description: "Bridge notes, contacts, and reminders into a privacy-first personal CRM workflow using MCP-connected local CRM patterns.",
        integration_mode: "connected_tool",
        existing_runtime_fit: "Fits current personal memory, relationship follow-up, and proactive continuity flows.",
        surfaces: &["home", "note", "workflow", "fleet"],
        tags: &["crm", "contacts", "relationships", "reminders"],
        compose_placeholder: Some(
            "Prepare a relationship brief with recent interactions, open loops, next follow-up, and suggested reminder timing.",
        ),
        compose_scaffold: Some(
            "Contact: [name]\nRelationship context: [context]\nRecent interactions:\n- [...]\nOpen loops:\n- [...]\nSuggested follow-up:\n- [...]\nReminder timing: [timing]",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "research.deep.autonomous_brief",
        title: "Deep Research Brief",
        category: "Research",
        capsule_kind: "research",
        description: "Prepare a multi-step research plan and evidence brief suitable for deep-research MCP or live extraction workflows.",
        integration_mode: "orchestration_overlay",
        existing_runtime_fit: "Fits current continuity, semantic retrieval, and prepared-context pathways without replacing them.",
        surfaces: &["chat", "space", "workflow", "fleet"],
        tags: &["research", "web", "analysis", "brief"],
        compose_placeholder: Some(
            "Turn this question into a bounded research brief with hypotheses, sources to inspect, evidence criteria, and final deliverable shape.",
        ),
        compose_scaffold: Some(
            "Research question: [question]\nDecision to support: [decision]\nHypotheses:\n- [...]\nSource targets:\n- [...]\nEvidence criteria:\n- [...]\nOutput format: [brief / memo / table]",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "research.social.discovery",
        title: "Live Social Discovery",
        category: "Research",
        capsule_kind: "integration",
        description: "Prepare cross-platform research prompts and evidence structure for live social, community, and sentiment extraction tools.",
        integration_mode: "connected_tool",
        existing_runtime_fit: "Fits existing research, recommendation, and watcher-style discovery flows.",
        surfaces: &["chat", "space", "workflow"],
        tags: &["social", "reddit", "x", "sentiment"],
        compose_placeholder: Some(
            "Draft a live social discovery brief with platforms, search terms, sentiment cues, and synthesis questions.",
        ),
        compose_scaffold: Some(
            "Topic: [topic]\nPlatforms: [Reddit / X / TikTok / LinkedIn]\nSearch terms:\n- [...]\nSignals to collect:\n- sentiment\n- objections\n- recurring needs\nSynthesis question: [question]",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "content.marketing.pipeline",
        title: "Marketing Content Pipeline",
        category: "Content",
        capsule_kind: "content",
        description: "Plan research-to-outline-to-SEO-to-publish workflows for blogs, campaigns, and conversion content.",
        integration_mode: "workflow_scaffold",
        existing_runtime_fit: "Fits current content drafting and workflow composition surfaces as a structured pipeline brief.",
        surfaces: &["note", "space", "workflow"],
        tags: &["marketing", "seo", "pipeline", "publishing"],
        compose_placeholder: Some(
            "Draft a content pipeline plan from research to publication for the selected topic or campaign.",
        ),
        compose_scaffold: Some(
            "Topic: [topic]\nAudience: [audience]\nResearch questions:\n- [...]\nOutline:\n- Intro\n- Core sections\n- CTA\nSEO targets:\n- keywords\n- intent\nPublish checklist:\n- review\n- assets\n- channels",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "infrastructure.local_private_ai",
        title: "Local Private AI Runtime",
        category: "Infrastructure",
        capsule_kind: "integration",
        description: "Prepare local-first runtime plans for private AI execution using LocalAI- or Goose-style hybrid patterns.",
        integration_mode: "runtime_strategy",
        existing_runtime_fit: "Fits current local-first, E2EE, and autonomy-policy directions without changing product shape.",
        surfaces: &["space", "workflow", "fleet"],
        tags: &["localai", "privacy", "runtime", "hybrid"],
        compose_placeholder: Some(
            "Draft a local/private runtime plan with model routing, privacy boundaries, fallback behavior, and operational tradeoffs.",
        ),
        compose_scaffold: Some(
            "Goal: [goal]\nSensitive data classes:\n- [...]\nLocal path:\n- [...]\nCloud path:\n- [...]\nRouting policy:\n- [...]\nFallback behavior:\n- [...]\nOperational risks:\n- [...]",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "entertainment.discovery.streaming",
        title: "Streaming Discovery",
        category: "Entertainment",
        capsule_kind: "integration",
        description: "Prepare watchlist, discovery, and availability queries for TMDb-, YouTube-, and streaming-oriented MCP integrations.",
        integration_mode: "connected_tool",
        existing_runtime_fit: "Fits entertainment recommendation and retrieval flows without introducing a separate discovery UI.",
        surfaces: &["chat", "home", "space"],
        tags: &["streaming", "tmdb", "youtube", "recommendations"],
        compose_placeholder: Some(
            "Draft a discovery brief for what to watch, including mood, genres, constraints, and service availability preferences.",
        ),
        compose_scaffold: Some(
            "Mood / goal: [goal]\nGenres: [genres]\nConstraints: [runtime / language / rating]\nServices: [Netflix / Disney+ / YouTube]\nDecision criteria:\n- [...]\nOutput: ranked watchlist with reasons",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "social.publishing.multiplatform",
        title: "Multiplatform Social Publishing",
        category: "Social",
        capsule_kind: "integration",
        description: "Prepare unified posting plans and channel-specific copy for tools such as Venice or Ayrshare.",
        integration_mode: "connected_tool",
        existing_runtime_fit: "Fits current social drafting and approval-gated outbound publishing flows.",
        surfaces: &["note", "space", "workflow"],
        tags: &["social", "publishing", "venice", "ayrshare"],
        compose_placeholder: Some(
            "Draft a multiplatform posting plan with per-channel tone, asset needs, and publish order.",
        ),
        compose_scaffold: Some(
            "Campaign / message: [message]\nChannels: [LinkedIn / X / Threads / Bluesky]\nPer-channel notes:\n- Hook\n- Body\n- CTA\nAssets needed:\n- [...]\nPublishing order:\n- [...]",
        ),
    },
    SkillCapsuleCatalogEntry {
        id: "infrastructure.oauth.unified_auth",
        title: "Unified OAuth Integration",
        category: "Infrastructure",
        capsule_kind: "integration",
        description: "Prepare secure multi-platform authentication plans for connected tools such as Arcade-backed OAuth bridges.",
        integration_mode: "integration_planning",
        existing_runtime_fit: "Fits existing integrations and tool settings surfaces as a bounded auth-planning capability.",
        surfaces: &["space", "workflow", "fleet"],
        tags: &["oauth", "arcade", "auth", "integrations"],
        compose_placeholder: Some(
            "Draft an integration auth plan with providers, scopes, risk notes, and review boundaries.",
        ),
        compose_scaffold: Some(
            "Integration goal: [goal]\nProviders: [YouTube / X / Reddit / GitHub]\nRequired scopes:\n- [...]\nUser-consent boundary:\n- [...]\nSecurity considerations:\n- [...]\nReview / approval points:\n- [...]",
        ),
    },
];

fn safe_user_scope_id(user_id: &str) -> String {
    user_id
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '_' || c == '-' {
                c
            } else {
                '_'
            }
        })
        .take(64)
        .collect()
}

fn custom_capsules_dir(project_root: &PathBuf, user_id: &str) -> PathBuf {
    project_root
        .join(".skillcapsule")
        .join("users")
        .join(safe_user_scope_id(user_id))
        .join("capsules")
}

fn load_user_custom_skill_catalog(
    project_root: &PathBuf,
    user_id: &str,
) -> Result<Vec<SkillCapsuleCatalogItem>, (StatusCode, String)> {
    let capsules_dir = custom_capsules_dir(project_root, user_id);
    if !capsules_dir.exists() {
        return Ok(Vec::new());
    }
    let mut entries = Vec::new();
    for dir_entry in std::fs::read_dir(&capsules_dir).map_err(|err| {
        tracing::error!(error = %err, path = %capsules_dir.display(), "failed to read custom capsule directory");
        internal_http_error(err)
    })? {
        let dir_entry = dir_entry.map_err(|err| {
            tracing::error!(error = %err, path = %capsules_dir.display(), "failed to read custom capsule entry");
            internal_http_error(err)
        })?;
        let path = dir_entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let raw = std::fs::read_to_string(&path).map_err(|err| {
            tracing::error!(error = %err, path = %path.display(), "failed to read custom capsule file");
            internal_http_error(err)
        })?;
        let item = serde_json::from_str::<SkillCapsuleCatalogItem>(&raw).map_err(|err| {
            tracing::error!(error = %err, path = %path.display(), "custom capsule file contains invalid JSON");
            internal_http_error(err)
        })?;
        entries.push(item);
    }
    entries.sort_by(|left, right| {
        left.title
            .cmp(&right.title)
            .then_with(|| left.id.cmp(&right.id))
    });
    Ok(entries)
}

fn skill_catalog_for_user(
    project_root: &PathBuf,
    user_id: &str,
) -> Result<Vec<SkillCapsuleCatalogItem>, (StatusCode, String)> {
    let mut catalog: Vec<SkillCapsuleCatalogItem> = SKILL_CAPSULE_CATALOG
        .iter()
        .map(SkillCapsuleCatalogItem::from)
        .collect();
    catalog.extend(load_user_custom_skill_catalog(project_root, user_id)?);
    Ok(catalog)
}

fn workspace_skill_catalog_ids(
    project_root: &PathBuf,
    user_id: &str,
) -> Result<std::collections::HashSet<String>, (StatusCode, String)> {
    Ok(skill_catalog_for_user(project_root, user_id)?
        .into_iter()
        .map(|entry| entry.id)
        .collect())
}

#[derive(serde::Deserialize)]
struct SkillCapsuleTaskRequest {
    task: Value,
    budget: Option<u32>,
    run_id: Option<String>,
    parent_artifact_id: Option<String>,
}

#[derive(serde::Deserialize)]
struct SkillCapsuleAtomRequest {
    atom_id: String,
    task: Value,
    run_id: Option<String>,
    parent_artifact_id: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
struct SkillCapsuleArtifactQuery {
    kind: Option<String>,
    #[serde(alias = "runId")]
    run_id: Option<String>,
    #[serde(alias = "parentArtifactId")]
    parent_artifact_id: Option<String>,
    #[serde(alias = "atomId")]
    atom_id: Option<String>,
    status: Option<String>,
    #[serde(alias = "taskType")]
    task_type: Option<String>,
    limit: Option<usize>,
}

#[derive(Debug)]
struct SkillCapsuleBridgeContext {
    node_bin: String,
    runtime_root: PathBuf,
    project_root: PathBuf,
    config_path: PathBuf,
}

async fn skill_capsule_catalog_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let bridge = build_skill_capsule_bridge_context();
    let selection = load_workspace_skill_selection(&bridge.project_root, &user.id)?;
    let catalog = skill_catalog_for_user(&bridge.project_root, &user.id)?;
    let doctor = if bridge.runtime_root.exists() && bridge.config_path.exists() {
        run_skill_capsule_operation(
            &bridge,
            serde_json::json!({
                "op": "doctor"
            }),
        )
        .await
        .ok()
    } else {
        None
    };
    Ok(Json(serde_json::json!({
        "catalog": catalog,
        "workspace": WorkspaceSkillSelectionResponse {
            selected_skill_ids: selection.selected_skill_ids.clone(),
            updated_at: selection.updated_at.clone(),
            reasoning_guidance: selected_reasoning_skill_guidance_from_ids(&selection.selected_skill_ids),
            selected_skill_summaries: selected_workspace_skill_summaries_from_catalog(
                &selection.selected_skill_ids,
                &catalog,
            ),
        },
        "configured": bridge.config_path.exists(),
        "available": bridge.runtime_root.join("dist").join("runtime.js").exists() && bridge.config_path.exists(),
        "warnings": collect_skill_capsule_bridge_warnings(&bridge),
        "doctor": doctor.and_then(|value| value.get("data").cloned()),
    })))
}

#[derive(serde::Deserialize)]
struct SkillCapsuleGenerateRequest {
    description: String,
}

async fn skill_capsule_generate_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SkillCapsuleGenerateRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let bridge = build_skill_capsule_bridge_context();

    let description = body.description.trim().to_string();
    if description.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "description is required".to_string(),
        ));
    }

    // Build a URL-safe slug from the description
    let slug: String = description
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .take(40)
        .collect();

    let capsule_id = format!("user.custom.{}", slug);

    // Build a title from the first 6 words of the description
    let title: String = description
        .split_whitespace()
        .take(6)
        .collect::<Vec<_>>()
        .join(" ");
    let title = {
        let mut t = title;
        if let Some(c) = t.get_mut(0..1) {
            c.make_ascii_uppercase();
        }
        t
    };

    // Template capsule JSON
    let capsule_json = serde_json::json!({
        "id": capsule_id,
        "version": "0.1.0",
        "type": "capsule",
        "title": title,
        "category": "Custom",
        "capsule_kind": "user_defined",
        "description": description,
        "integration_mode": "agent_assist",
        "existing_runtime_fit": "User-defined custom skill capsule created from natural language description.",
        "surfaces": ["note", "space", "threads"],
        "tags": ["custom", "user-defined"],
        "compose_placeholder": format!("Apply the following capability: {}", description),
        "compose_scaffold": format!("Goal: {}\nContext: [Provide any relevant context]\nOutput format: [Describe the desired output]\n", description),
        "atoms": [],
        "always_active_atoms": [],
        "default_budget": 400,
        "risk_policy": { "low": "S", "medium": "O", "high": "X" },
        "deactivation_policy": {
            "in_flight_tasks": "complete_under_old_rules",
            "next_request": "uses_default_behaviour",
            "scope_cleanup": "auto"
        },
        "status": "draft"
    });

    // Write capsule file into a user-scoped directory so one user's private
    // custom capsule cannot appear in another user's catalog by default.
    let capsules_dir = custom_capsules_dir(&bridge.project_root, &user.id);
    let file_path = capsules_dir.join(format!("{}.capsule.json", capsule_id));
    std::fs::create_dir_all(&capsules_dir).map_err(|err| {
        tracing::error!(error = %err, path = %capsules_dir.display(), "failed to create custom capsule directory");
        internal_http_error(err)
    })?;
    let content = serde_json::to_string_pretty(&capsule_json).map_err(internal_http_error)?;
    std::fs::write(&file_path, content).map_err(|err| {
        tracing::error!(error = %err, path = %file_path.display(), "failed to persist custom capsule");
        internal_http_error(err)
    })?;

    Ok(Json(serde_json::json!({
        "entry": {
            "id": capsule_id,
            "title": title,
            "category": "Custom",
            "capsule_kind": "user_defined",
            "description": description,
            "integration_mode": "agent_assist",
            "existing_runtime_fit": "User-defined custom skill capsule created from natural language description.",
            "surfaces": ["note", "space", "threads"],
            "tags": ["custom", "user-defined"],
            "compose_placeholder": format!("Apply the following capability: {}", description),
            "compose_scaffold": format!("Goal: {}\nContext: [Provide any relevant context]\n", description),
        },
    })))
}

async fn skill_capsule_workspace_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<WorkspaceSkillSelectionResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let bridge = build_skill_capsule_bridge_context();
    let selection = load_workspace_skill_selection(&bridge.project_root, &user.id)?;
    Ok(Json(WorkspaceSkillSelectionResponse {
        selected_skill_ids: selection.selected_skill_ids.clone(),
        updated_at: selection.updated_at.clone(),
        reasoning_guidance: selected_reasoning_skill_guidance_from_ids(
            &selection.selected_skill_ids,
        ),
        selected_skill_summaries: selected_workspace_skill_summaries_for_user(&user.id)?,
    }))
}

async fn skill_capsule_workspace_update_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<WorkspaceSkillSelectionUpdateRequest>,
) -> Result<Json<WorkspaceSkillSelectionResponse>, (StatusCode, String)> {
    let user = authenticated_user(&state.db, &headers).await?;
    let bridge = build_skill_capsule_bridge_context();
    let selection =
        save_workspace_skill_selection(&bridge.project_root, &user.id, body.selected_skill_ids)?;
    Ok(Json(WorkspaceSkillSelectionResponse {
        selected_skill_ids: selection.selected_skill_ids.clone(),
        updated_at: selection.updated_at.clone(),
        reasoning_guidance: selected_reasoning_skill_guidance_from_ids(
            &selection.selected_skill_ids,
        ),
        selected_skill_summaries: selected_workspace_skill_summaries_for_user(&user.id)?,
    }))
}

async fn skill_capsule_doctor_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let bridge = build_skill_capsule_bridge_context();

    let runtime_root_exists = bridge.runtime_root.exists();
    let config_exists = bridge.config_path.exists();
    let node_configured = !bridge.node_bin.trim().is_empty();

    if !runtime_root_exists || !config_exists || !node_configured {
        return Ok(Json(serde_json::json!({
            "configured": false,
            "available": false,
            "node_bin": bridge.node_bin,
            "runtime_root": bridge.runtime_root,
            "project_root": bridge.project_root,
            "config_path": bridge.config_path,
            "warnings": collect_skill_capsule_bridge_warnings(&bridge),
        })));
    }

    let data = run_skill_capsule_operation(
        &bridge,
        serde_json::json!({
            "op": "doctor"
        }),
    )
    .await?;

    Ok(Json(serde_json::json!({
        "configured": true,
        "available": data.get("ok").and_then(Value::as_bool).unwrap_or(false),
        "node_bin": bridge.node_bin,
        "runtime_root": bridge.runtime_root,
        "project_root": bridge.project_root,
        "config_path": bridge.config_path,
        "warnings": collect_skill_capsule_bridge_warnings(&bridge),
        "doctor": data.get("data").cloned().unwrap_or(Value::Null),
    })))
}

async fn skill_capsule_classify_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SkillCapsuleTaskRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let bridge = ensure_skill_capsule_bridge_ready()?;
    let result = run_skill_capsule_operation(
        &bridge,
        serde_json::json!({
            "op": "classify",
            "task": body.task,
        }),
    )
    .await?;
    Ok(Json(result))
}

async fn skill_capsule_match_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SkillCapsuleTaskRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let bridge = ensure_skill_capsule_bridge_ready()?;
    let result = run_skill_capsule_operation(
        &bridge,
        serde_json::json!({
            "op": "match",
            "task": body.task,
        }),
    )
    .await?;
    Ok(Json(result))
}

async fn skill_capsule_compose_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SkillCapsuleTaskRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let bridge = ensure_skill_capsule_bridge_ready()?;
    let result = run_skill_capsule_operation(
        &bridge,
        serde_json::json!({
            "op": "compose",
            "task": body.task,
            "budget": body.budget,
            "run_id": body.run_id,
            "parent_artifact_id": body.parent_artifact_id,
        }),
    )
    .await?;
    Ok(Json(result))
}

async fn skill_capsule_prepare_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SkillCapsuleAtomRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let bridge = ensure_skill_capsule_bridge_ready()?;
    let result = run_skill_capsule_operation(
        &bridge,
        serde_json::json!({
            "op": "prepare",
            "atom_id": body.atom_id,
            "task": body.task,
            "run_id": body.run_id,
            "parent_artifact_id": body.parent_artifact_id,
        }),
    )
    .await?;
    Ok(Json(result))
}

async fn skill_capsule_activate_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SkillCapsuleAtomRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let bridge = ensure_skill_capsule_bridge_ready()?;
    let result = run_skill_capsule_operation(
        &bridge,
        serde_json::json!({
            "op": "activate",
            "atom_id": body.atom_id,
            "task": body.task,
            "run_id": body.run_id,
            "parent_artifact_id": body.parent_artifact_id,
        }),
    )
    .await?;
    Ok(Json(result))
}

async fn skill_capsule_verify_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SkillCapsuleAtomRequest>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let bridge = ensure_skill_capsule_bridge_ready()?;
    let result = run_skill_capsule_operation(
        &bridge,
        serde_json::json!({
            "op": "verify",
            "atom_id": body.atom_id,
            "task": body.task,
            "run_id": body.run_id,
            "parent_artifact_id": body.parent_artifact_id,
        }),
    )
    .await?;
    Ok(Json(result))
}

async fn skill_capsule_artifact_list_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<SkillCapsuleArtifactQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let bridge = ensure_skill_capsule_bridge_ready()?;
    let result = run_skill_capsule_operation(
        &bridge,
        serde_json::json!({
            "op": "artifact_list",
            "query": artifact_query_to_value(query),
        }),
    )
    .await?;
    Ok(Json(result))
}

async fn skill_capsule_artifact_summary_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<SkillCapsuleArtifactQuery>,
) -> Result<Json<Value>, (StatusCode, String)> {
    let _user = authenticated_user(&state.db, &headers).await?;
    let bridge = ensure_skill_capsule_bridge_ready()?;
    let result = run_skill_capsule_operation(
        &bridge,
        serde_json::json!({
            "op": "artifact_summary",
            "query": artifact_query_to_value(query),
        }),
    )
    .await?;
    Ok(Json(result))
}

async fn skill_capsule_artifact_lineage_http(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Path(run_id): Path<String>,
) -> Result<Json<Value>, (StatusCode, String)> {
    // `user` (not `_user`) is intentional: the user ID is forwarded in the
    // payload so the Node bridge can enforce per-user run ownership.
    let user = authenticated_user(&state.db, &headers).await?;
    let bridge = ensure_skill_capsule_bridge_ready()?;
    let result = run_skill_capsule_operation(
        &bridge,
        serde_json::json!({
            "op": "artifact_lineage",
            "run_id": run_id,
            "requesting_user_id": user.id,
        }),
    )
    .await?;
    Ok(Json(result))
}
