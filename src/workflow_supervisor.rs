/// Workflow Supervisor — Phase 2 items 21–24
///
/// Replaces the flat task-list model in `MasterOrchestrator` with a structured
/// task-graph execution engine:
///
/// - **Item 21** — `TaskGraph`: nodes carry `node_kind`, `capability`,
///   `estimated_cost_cents`, and `depends_on` edges; the graph is validated
///   through `PolicyGraph` (global policy + per-node capability check) before
///   any delegation key is issued.
///
/// - **Item 22** — `RuntimeNodeSpawner` trait + `DefaultSpawner`: instantiates
///   hidden runtime nodes (`GoalIntake`, `Plan`, `Executor`, `Reflection`,
///   `CapabilityRouter`) by kind; each spawned node receives its own scoped
///   delegation key and runs concurrently under the semaphore limit.
///
/// - **Item 23** — Recursive sub-workflow delegation: when `PlanNode` produces
///   a sub-graph with ≥ 3 nodes, `WorkflowSupervisor` spawns a child
///   supervisor scoped to that sub-graph with a child delegation key derived
///   from the parent via HKDF-SHA256 (`generate_delegated_key`). Child result
///   is returned as a `node_result` message to the parent.
///
/// - **Item 24** — `CustomNodeBuilderAgent` spawn: when `CapabilityRouterNode`
///   finds no registered capability match, the supervisor spawns a
///   `CustomNodeBuilderAgent`, pipes its output through a `PolicyNode` dry-run,
///   and registers the new capability before resuming graph execution. Failure
///   escalates to `ReflectionNode` for replan or graceful downgrade.
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

use rand::RngCore;
use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;

use crate::{
    agent_template::{
        AgentDelegation, AgentTask, ContextSnapshot, TaskPriority, TaskStatus,
        generate_delegated_key,
    },
    audit_chain::message_hash,
    db::Db,
    inference::{InferenceMessage, InferenceRequest, anthropic_infer, runpod_infer},
    master_orchestrator::WorkflowNodeManifest,
    policy_engine::PolicyEngine,
    prompt_guidance::append_reasoning_guidance,
};

// ── Node kinds ────────────────────────────────────────────────────────────────

/// The hidden runtime node kinds that the supervisor can spawn (item 22).
///
/// Each kind corresponds to a role in the execution pipeline:
/// - `GoalIntake`       — receives the raw objective, extracts structured goals
/// - `Plan`             — decomposes a goal into a sub-task graph
/// - `Executor`         — carries out a leaf task using the granted capabilities
/// - `Reflection`       — reviews results, decides continue / replan / escalate
/// Controls when the supervisor inserts a `Reflection` node during plan execution.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReflectionPolicy {
    EveryStep,
    EveryNSteps(u32),
    OnDrift,
    OnFailureOrDrift,
    Off,
}

/// - `CapabilityRouter` — routes a task to the first matching registered capability
/// - `CustomNodeBuilder`— builds a new capability node when no match is found (item 24)
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    GoalIntake,
    Plan,
    Executor,
    Reflection,
    CapabilityRouter,
    CustomNodeBuilder,
}

impl NodeKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            NodeKind::GoalIntake => "goal_intake",
            NodeKind::Plan => "plan",
            NodeKind::Executor => "executor",
            NodeKind::Reflection => "reflection",
            NodeKind::CapabilityRouter => "capability_router",
            NodeKind::CustomNodeBuilder => "custom_node_builder",
        }
    }
}

impl std::fmt::Display for NodeKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

// ── Task graph (item 21) ──────────────────────────────────────────────────────

/// A single node in the task graph.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskGraphNode {
    /// Stable ID for dependency references.
    pub id: String,
    /// Logical role this node plays in the pipeline.
    pub node_kind: NodeKind,
    /// Maps to ALLOWED_TASK_TYPES in `PolicyEngine` (e.g. `"email_triage"`).
    /// Empty for structural nodes like `GoalIntake` and `Reflection`.
    #[serde(default)]
    pub task_type: String,
    /// Capability ID this node exercises (e.g. `"summarise"`).
    #[serde(default)]
    pub capability: String,
    /// Estimated cost in USD cents; used for pre-flight budget validation.
    #[serde(default)]
    pub estimated_cost_cents: u32,
    /// Natural-language content / instruction for the node's LLM turn.
    pub content: String,
    /// IDs of nodes that must complete before this node may start.
    #[serde(default)]
    pub depends_on: Vec<String>,
    /// Optional reference to a compiled IR node manifest.
    #[serde(default)]
    pub manifest_node_id: Option<String>,
}

/// Directed acyclic graph of `TaskGraphNode`s with dependency edges.
#[derive(Debug, Default, Serialize, Deserialize)]
pub struct TaskGraph {
    pub nodes: Vec<TaskGraphNode>,
}

impl TaskGraph {
    /// Build a topological execution schedule (levels of parallelism).
    ///
    /// Returns `Err` if the graph contains a cycle.
    pub fn execution_levels(&self) -> Result<Vec<Vec<String>>, String> {
        let mut in_degree: HashMap<&str, usize> = HashMap::new();
        let mut dependents: HashMap<&str, Vec<&str>> = HashMap::new();

        for node in &self.nodes {
            in_degree.entry(node.id.as_str()).or_insert(0);
            for dep in &node.depends_on {
                *in_degree.entry(node.id.as_str()).or_insert(0) += 1;
                dependents
                    .entry(dep.as_str())
                    .or_default()
                    .push(node.id.as_str());
            }
        }

        let mut queue: VecDeque<&str> = in_degree
            .iter()
            .filter(|(_, deg)| **deg == 0)
            .map(|(&id, _)| id)
            .collect();

        let mut levels: Vec<Vec<String>> = vec![];
        let mut visited = 0usize;

        while !queue.is_empty() {
            let level_size = queue.len();
            let mut level = Vec::with_capacity(level_size);
            for _ in 0..level_size {
                let id = queue.pop_front().unwrap();
                level.push(id.to_string());
                visited += 1;
                if let Some(deps) = dependents.get(id) {
                    for &dep_id in deps {
                        let deg = in_degree.get_mut(dep_id).unwrap();
                        *deg -= 1;
                        if *deg == 0 {
                            queue.push_back(dep_id);
                        }
                    }
                }
            }
            levels.push(level);
        }

        if visited != self.nodes.len() {
            return Err("task graph contains a cycle — cannot schedule execution".to_string());
        }
        Ok(levels)
    }

    /// Count leaf executor nodes (used to decide whether sub-graph warrants
    /// a child supervisor — item 23 threshold of ≥ 3 nodes).
    pub fn executor_count(&self) -> usize {
        self.nodes
            .iter()
            .filter(|n| n.node_kind == NodeKind::Executor)
            .count()
    }
}

// ── PolicyGraph validation (item 21) ─────────────────────────────────────────

/// Pre-flight validation of a `TaskGraph` against the global `PolicyEngine`
/// and per-node manifests before any delegation key is issued.
pub struct PolicyGraph;

impl PolicyGraph {
    /// Returns `Ok(())` if all executor nodes pass global policy, or a list of
    /// violations. Per-manifest capability checks use `WorkflowNodeManifest`
    /// slices already populated by the calling supervisor.
    pub fn validate(
        graph: &TaskGraph,
        manifests: &[WorkflowNodeManifest],
    ) -> Result<(), Vec<String>> {
        let mut errors = vec![];
        for node in &graph.nodes {
            if node.node_kind != NodeKind::Executor {
                continue;
            }
            if !PolicyEngine::can_run(&node.task_type, "private") {
                errors.push(format!(
                    "node '{}': task_type '{}' is not in ALLOWED_TASK_TYPES",
                    node.id, node.task_type
                ));
                continue;
            }
            // Per-manifest capability check (same logic as item 25 in master_orchestrator)
            let manifest = node
                .manifest_node_id
                .as_deref()
                .and_then(|mid| manifests.iter().find(|m| m.node_id == mid));

            if let Some(m) = manifest {
                if !m.allowed_capabilities.is_empty()
                    && !m.allowed_capabilities.contains(&node.task_type)
                {
                    errors.push(format!(
                        "node '{}': task_type '{}' not in manifest allowed_capabilities [{}]",
                        node.id,
                        node.task_type,
                        m.allowed_capabilities.join(", ")
                    ));
                }
            }
        }
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors)
        }
    }
}

// ── Node results ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct NodeResult {
    pub node_id: String,
    pub node_kind: String,
    pub status: NodeStatus,
    pub output: Option<String>,
    pub error: Option<String>,
    /// Sub-graph result when a child supervisor was spawned (item 23).
    pub child_run_id: Option<String>,
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeStatus {
    Ok,
    Failed,
    Timeout,
    PolicyBlocked,
    CapabilityMissing,
    Replanned,
}

// ── Supervisor result ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct SupervisorResult {
    pub run_id: String,
    pub objective: String,
    pub depth: u8,
    pub node_count: usize,
    pub success_count: usize,
    pub node_results: Vec<NodeResult>,
    pub audit_hash: String,
}

#[derive(Debug)]
pub enum SupervisorError {
    PlanningFailed(String),
    GraphInvalid(Vec<String>),
    DbError(sqlx::Error),
}

impl std::fmt::Display for SupervisorError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SupervisorError::PlanningFailed(m) => write!(f, "planning failed: {m}"),
            SupervisorError::GraphInvalid(errs) => {
                write!(f, "graph invalid: {}", errs.join("; "))
            }
            SupervisorError::DbError(e) => write!(f, "db error: {e}"),
        }
    }
}

impl From<sqlx::Error> for SupervisorError {
    fn from(e: sqlx::Error) -> Self {
        SupervisorError::DbError(e)
    }
}

// ── RuntimeNodeSpawner trait (item 22) ───────────────────────────────────────

/// Abstraction over the runtime execution of a single graph node.
///
/// Each implementation receives the `TaskGraphNode`, its scoped `AgentDelegation`,
/// and whatever context is needed to execute it. This decouples the supervisor's
/// scheduling logic from the per-kind execution strategy.
#[async_trait::async_trait]
pub trait RuntimeNodeSpawner: Send + Sync {
    async fn spawn(
        &self,
        node: &TaskGraphNode,
        delegation: &AgentDelegation,
        prior_results: &HashMap<String, String>,
    ) -> NodeResult;
}

/// Default implementation: dispatches each node kind to an appropriate LLM
/// call strategy. Non-executor structural nodes (GoalIntake, Reflection, …)
/// use dedicated prompts; Executor nodes use the sub-agent pattern from
/// `MasterOrchestrator`.
pub struct DefaultSpawner {
    pub api_key: String,
    pub model: String,
    pub soul_md: Option<String>,
    pub lora_active: bool,
    pub runpod_endpoint: Option<String>,
    pub reasoning_guidance: Vec<String>,
}

#[async_trait::async_trait]
impl RuntimeNodeSpawner for DefaultSpawner {
    async fn spawn(
        &self,
        node: &TaskGraphNode,
        delegation: &AgentDelegation,
        prior_results: &HashMap<String, String>,
    ) -> NodeResult {
        let result = match node.node_kind {
            NodeKind::GoalIntake => self.run_goal_intake(node, prior_results).await,
            NodeKind::Plan => {
                // Plan nodes should be handled by WorkflowSupervisor::run_plan_node
                // which may spawn a child supervisor. At this layer we execute a
                // simple planning LLM call and return the plan text.
                self.run_plan(node, prior_results).await
            }
            NodeKind::Executor => self.run_executor(node, delegation, prior_results).await,
            NodeKind::Reflection => self.run_reflection(node, prior_results).await,
            NodeKind::CapabilityRouter => {
                // Returns CapabilityMissing when no match is found — the
                // supervisor handles this by spawning CustomNodeBuilderAgent.
                self.run_capability_router(node, prior_results).await
            }
            NodeKind::CustomNodeBuilder => self.run_custom_node_builder(node, prior_results).await,
        };
        result
    }
}

impl DefaultSpawner {
    async fn llm_call(&self, system: &str, user: &str, max_tokens: u32) -> Result<String, String> {
        let req = InferenceRequest {
            system: append_reasoning_guidance(
                system,
                &self.reasoning_guidance,
                "workflow supervisor runtime node",
            ),
            messages: vec![InferenceMessage {
                role: "user".to_string(),
                content: user.to_string(),
            }],
            max_tokens,
            temperature: 0.3,
        };
        if let Some(ep) = &self.runpod_endpoint {
            runpod_infer(ep, &self.api_key, &self.model, &req)
                .await
                .map(|r| r.content)
                .map_err(|e| e.to_string())
        } else {
            anthropic_infer(&self.api_key, &self.model, &req)
                .await
                .map(|r| r.content)
                .map_err(|e| e.to_string())
        }
    }

    async fn run_goal_intake(
        &self,
        node: &TaskGraphNode,
        _prior: &HashMap<String, String>,
    ) -> NodeResult {
        let system = "You are a goal intake agent. Parse the raw objective into a structured \
                      goal statement: primary goal, success criteria, and constraints. \
                      Return concise structured text.";
        match self.llm_call(system, &node.content, 256).await {
            Ok(text) => NodeResult {
                node_id: node.id.clone(),
                node_kind: node.node_kind.as_str().to_string(),
                status: NodeStatus::Ok,
                output: Some(text),
                error: None,
                child_run_id: None,
            },
            Err(e) => NodeResult {
                node_id: node.id.clone(),
                node_kind: node.node_kind.as_str().to_string(),
                status: NodeStatus::Failed,
                output: None,
                error: Some(e),
                child_run_id: None,
            },
        }
    }

    async fn run_plan(&self, node: &TaskGraphNode, prior: &HashMap<String, String>) -> NodeResult {
        let context = prior.values().cloned().collect::<Vec<_>>().join("\n---\n");
        let system = "You are a planning agent. Given the goal context, decompose it into an \
                      ordered list of concrete sub-tasks. Be specific about what each sub-task \
                      must accomplish. Return numbered steps.";
        let user = if context.is_empty() {
            node.content.clone()
        } else {
            format!(
                "Context from prior steps:\n{context}\n\nGoal: {}",
                node.content
            )
        };
        match self.llm_call(&system, &user, 512).await {
            Ok(text) => NodeResult {
                node_id: node.id.clone(),
                node_kind: node.node_kind.as_str().to_string(),
                status: NodeStatus::Ok,
                output: Some(text),
                error: None,
                child_run_id: None,
            },
            Err(e) => NodeResult {
                node_id: node.id.clone(),
                node_kind: node.node_kind.as_str().to_string(),
                status: NodeStatus::Failed,
                output: None,
                error: Some(e),
                child_run_id: None,
            },
        }
    }

    async fn run_executor(
        &self,
        node: &TaskGraphNode,
        delegation: &AgentDelegation,
        prior: &HashMap<String, String>,
    ) -> NodeResult {
        let caps = if delegation.allowed_capabilities.is_empty() {
            PolicyEngine::capabilities_for_task(&node.task_type)
                .iter()
                .map(|s| s.to_string())
                .collect::<Vec<_>>()
        } else {
            delegation.allowed_capabilities.clone()
        };

        let soul_ctx = if !self.lora_active {
            self.soul_md
                .as_ref()
                .map(|s| format!("\n\nAgent soul:\n{s}"))
                .unwrap_or_default()
        } else {
            String::new()
        };

        // Use system prompt from context snapshot if present (item 27)
        let system = delegation
            .context_snapshot
            .as_ref()
            .and_then(|s| s.system_prompt.as_deref())
            .map(|sp| format!("{sp}{soul_ctx}"))
            .unwrap_or_else(|| {
                format!(
                    "You are a sub-agent specialising in '{}'.\n\
                    Your granted capabilities: [{}].\n\
                    Mask: private. Operate under data minimisation.{soul_ctx}",
                    node.task_type,
                    caps.join(", ")
                )
            });

        let prior_ctx = prior.values().cloned().collect::<Vec<_>>().join("\n---\n");
        let user = if prior_ctx.is_empty() {
            node.content.clone()
        } else {
            format!("Prior step results:\n{prior_ctx}\n\nTask: {}", node.content)
        };

        match self.llm_call(&system, &user, 512).await {
            Ok(text) => NodeResult {
                node_id: node.id.clone(),
                node_kind: node.node_kind.as_str().to_string(),
                status: NodeStatus::Ok,
                output: Some(text),
                error: None,
                child_run_id: None,
            },
            Err(e) => NodeResult {
                node_id: node.id.clone(),
                node_kind: node.node_kind.as_str().to_string(),
                status: NodeStatus::Failed,
                output: None,
                error: Some(e),
                child_run_id: None,
            },
        }
    }

    async fn run_reflection(
        &self,
        node: &TaskGraphNode,
        prior: &HashMap<String, String>,
    ) -> NodeResult {
        let results_summary = prior
            .iter()
            .map(|(k, v)| format!("Task {k}: {v}"))
            .collect::<Vec<_>>()
            .join("\n");
        let system = "You are a reflection agent. Review the completed sub-task results \
                      and determine: (1) Were the sub-tasks successful? \
                      (2) Is the overall objective achieved? \
                      (3) Are there remaining gaps that need replanning? \
                      Return a structured assessment.";
        let user = format!(
            "Original objective: {}\n\nSub-task results:\n{results_summary}",
            node.content
        );
        match self.llm_call(&system, &user, 512).await {
            Ok(text) => NodeResult {
                node_id: node.id.clone(),
                node_kind: node.node_kind.as_str().to_string(),
                status: NodeStatus::Ok,
                output: Some(text),
                error: None,
                child_run_id: None,
            },
            Err(e) => NodeResult {
                node_id: node.id.clone(),
                node_kind: node.node_kind.as_str().to_string(),
                status: NodeStatus::Failed,
                output: None,
                error: Some(e),
                child_run_id: None,
            },
        }
    }

    async fn run_capability_router(
        &self,
        node: &TaskGraphNode,
        _prior: &HashMap<String, String>,
    ) -> NodeResult {
        // In the full implementation this would look up the capability registry.
        // Currently, map known capability IDs to task types; return
        // CapabilityMissing for unknown capabilities so the supervisor can
        // trigger CustomNodeBuilderAgent (item 24).
        let known: HashSet<&str> = crate::policy_engine::ALLOWED_TASK_TYPES
            .iter()
            .copied()
            .collect();
        if known.contains(node.capability.as_str()) || known.contains(node.task_type.as_str()) {
            NodeResult {
                node_id: node.id.clone(),
                node_kind: node.node_kind.as_str().to_string(),
                status: NodeStatus::Ok,
                output: Some(format!("routed to capability '{}'", node.capability)),
                error: None,
                child_run_id: None,
            }
        } else {
            NodeResult {
                node_id: node.id.clone(),
                node_kind: node.node_kind.as_str().to_string(),
                status: NodeStatus::CapabilityMissing,
                output: None,
                error: Some(format!(
                    "no registered capability for '{}' / task_type '{}'",
                    node.capability, node.task_type
                )),
                child_run_id: None,
            }
        }
    }

    async fn run_custom_node_builder(
        &self,
        node: &TaskGraphNode,
        _prior: &HashMap<String, String>,
    ) -> NodeResult {
        // CustomNodeBuilderAgent: given a capability description, produce a
        // node specification (kind, task_type, system_prompt, capabilities).
        let system = "You are a CustomNodeBuilderAgent. Given an unrecognised capability \
                      requirement, design a minimal node specification that can fulfil it \
                      within the OmnyID workflow system. Return a JSON object with fields: \
                      task_type, system_prompt, capabilities (array), estimated_cost_cents. \
                      Only use safe, read-only capabilities unless write access is explicitly \
                      required. This output will be validated by PolicyNode before registration.";
        match self.llm_call(system, &node.content, 512).await {
            Ok(spec) => NodeResult {
                node_id: node.id.clone(),
                node_kind: node.node_kind.as_str().to_string(),
                status: NodeStatus::Ok,
                output: Some(spec),
                error: None,
                child_run_id: None,
            },
            Err(e) => NodeResult {
                node_id: node.id.clone(),
                node_kind: node.node_kind.as_str().to_string(),
                status: NodeStatus::Failed,
                output: None,
                error: Some(e),
                child_run_id: None,
            },
        }
    }
}

// ── WorkflowSupervisor (items 22–24) ─────────────────────────────────────────

/// Recursion depth cap — prevents unbounded child-supervisor nesting.
const MAX_SUPERVISOR_DEPTH: u8 = 4;

pub struct WorkflowSupervisor {
    pub instance_id: String,
    pub owner_user_id: String,
    /// Concurrency limit per supervisor level.
    pub max_concurrency: usize,
    /// Delegation key from the parent (None for root supervisor).
    pub parent_delegation: Option<AgentDelegation>,
    /// Compiled IR node manifests for per-node policy enforcement (item 25).
    pub node_manifests: Vec<WorkflowNodeManifest>,
    /// Recursion depth; root = 0.
    pub depth: u8,
}

impl WorkflowSupervisor {
    pub fn new(instance_id: String, owner_user_id: String) -> Self {
        Self {
            instance_id,
            owner_user_id,
            max_concurrency: 4,
            parent_delegation: None,
            node_manifests: vec![],
            depth: 0,
        }
    }

    pub fn with_parent_delegation(mut self, d: AgentDelegation) -> Self {
        self.parent_delegation = Some(d);
        self
    }

    pub fn with_node_manifests(mut self, manifests: Vec<WorkflowNodeManifest>) -> Self {
        self.node_manifests = manifests;
        self
    }

    /// Run the supervisor on a natural-language objective.
    ///
    /// 1. Decompose `objective` into a `TaskGraph` using the LLM.
    /// 2. Validate the graph through `PolicyGraph` (item 21).
    /// 3. Dispatch execution level by level:
    ///    - `Plan` nodes with ≥ 3 executor sub-tasks → spawn child supervisor (item 23).
    ///    - `CapabilityRouter` nodes with `CapabilityMissing` → spawn `CustomNodeBuilderAgent`
    ///      dry-run, register, retry (item 24).
    ///    - All other nodes → `DefaultSpawner::spawn()`.
    /// 4. Return aggregated `SupervisorResult`.
    /// Public entry point. Returns a boxed future to allow recursive calls
    /// (child supervisors call `run()` on themselves, which would otherwise
    /// produce an infinitely-sized type — see E0733).
    pub fn run<'a>(
        &'a self,
        objective: &'a str,
        db: &'a Db,
        api_key: &'a str,
        model: &'a str,
        soul_md: Option<&'a str>,
        lora_active: bool,
        runpod_endpoint: Option<&'a str>,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<Output = Result<SupervisorResult, SupervisorError>> + Send + 'a,
        >,
    > {
        Box::pin(self.run_inner(
            objective,
            db,
            api_key,
            model,
            soul_md,
            lora_active,
            runpod_endpoint,
        ))
    }

    async fn run_inner(
        &self,
        objective: &str,
        db: &Db,
        api_key: &str,
        model: &str,
        soul_md: Option<&str>,
        lora_active: bool,
        runpod_endpoint: Option<&str>,
    ) -> Result<SupervisorResult, SupervisorError> {
        let run_id = ulid::Ulid::new().to_string();
        let reasoning_guidance =
            crate::server::skill_capsule_routes::selected_reasoning_skill_guidance_for_user(
                &self.owner_user_id,
            )
            .unwrap_or_default();

        // Step 1: build the task graph via LLM decomposition
        let graph = self
            .decompose_to_graph(
                objective,
                api_key,
                model,
                soul_md,
                lora_active,
                runpod_endpoint,
                &reasoning_guidance,
            )
            .await?;

        // Step 2: validate graph (item 21 — PolicyGraph pre-flight)
        PolicyGraph::validate(&graph, &self.node_manifests)
            .map_err(SupervisorError::GraphInvalid)?;

        // Step 3: schedule and execute
        let levels = graph
            .execution_levels()
            .map_err(SupervisorError::PlanningFailed)?;

        let semaphore = Arc::new(Semaphore::new(self.max_concurrency));
        let node_map: HashMap<String, TaskGraphNode> = graph
            .nodes
            .iter()
            .cloned()
            .map(|n| (n.id.clone(), n))
            .collect();

        let prior_results: Arc<tokio::sync::Mutex<HashMap<String, String>>> =
            Arc::new(tokio::sync::Mutex::new(HashMap::new()));

        let mut all_node_results: Vec<NodeResult> = vec![];

        for level in &levels {
            // ── Item 23: separate Plan-nodes-needing-child-supervisor from
            // the parallel batch. Child supervisor `run()` is recursive and
            // must be awaited in the outer context (no tokio::spawn needed —
            // no Send constraint).
            let mut parallel_nodes: Vec<TaskGraphNode> = vec![];
            let mut child_supervisor_nodes: Vec<TaskGraphNode> = vec![];

            for node_id in level {
                let node = match node_map.get(node_id) {
                    Some(n) => n.clone(),
                    None => continue,
                };
                if node.node_kind == NodeKind::Plan
                    && self.depth < MAX_SUPERVISOR_DEPTH
                    && build_child_graph_for_plan(&node).executor_count() >= 3
                {
                    child_supervisor_nodes.push(node);
                } else {
                    parallel_nodes.push(node);
                }
            }

            // ── Parallel execution for non-child-supervisor nodes ──────────
            let mut handles = vec![];
            for node in parallel_nodes {
                let sem = semaphore.clone();
                let db_clone = db.clone();
                let api_key_s = api_key.to_string();
                let model_s = model.to_string();
                let soul_s = soul_md.map(str::to_string);
                let lora = lora_active;
                let ep = runpod_endpoint.map(str::to_string);
                let owner = self.owner_user_id.clone();
                let inst = self.instance_id.clone();
                let manifests = self.node_manifests.clone();
                let prior = prior_results.clone();
                let node_reasoning_guidance = reasoning_guidance.clone();

                let handle = tokio::spawn(async move {
                    let _permit = sem.acquire().await.ok();

                    let prior_snap = prior.lock().await.clone();

                    // Resolve per-node manifest for delegation (item 25)
                    let manifest = node
                        .manifest_node_id
                        .as_deref()
                        .and_then(|mid| manifests.iter().find(|m| m.node_id == mid));

                    let (allowed_caps, outbound_list, sys_prompt, instr_prompt) =
                        manifest_to_delegation_fields(&node.task_type, manifest);

                    // Build context snapshot (item 27)
                    let snapshot = Some(ContextSnapshot {
                        afp_thread_slice: vec![],
                        prior_step_results: prior_snap.clone(),
                        system_prompt: sys_prompt.clone(),
                        instruction_prompt: instr_prompt.clone(),
                        token_budget_remaining: Some(512),
                        simulator_projection_summary: None,
                    });

                    // Issue scoped delegation key (items 25+27)
                    let task_record = AgentTask::new(
                        owner.clone(),
                        inst.clone(),
                        node.content.clone(),
                        TaskPriority::Normal,
                    );
                    let _ = db_clone.create_agent_task(&task_record).await;

                    let mut mk = [0u8; 32];
                    rand::rng().fill_bytes(&mut mk);
                    let delegation = generate_delegated_key(
                        &hex::encode(mk),
                        &node.task_type,
                        &task_record.id,
                        60,
                        &inst,
                        &owner,
                        allowed_caps,
                        outbound_list,
                        snapshot,
                    );
                    let delegation_id = delegation.id.clone();
                    let _ = db_clone.create_delegation(&delegation).await;

                    // ── Item 24: CapabilityRouter → CustomNodeBuilderAgent ──
                    let node_result = {
                        let raw_result = spawner_call_sync(
                            &api_key_s,
                            &model_s,
                            soul_s.as_deref(),
                            lora,
                            ep.as_deref(),
                            &node_reasoning_guidance,
                            &node,
                            &delegation,
                            &prior_snap,
                        )
                        .await;

                        if raw_result.status == NodeStatus::CapabilityMissing {
                            let builder_node = TaskGraphNode {
                                id: format!("custom_builder_{}", node.id),
                                node_kind: NodeKind::CustomNodeBuilder,
                                task_type: String::new(),
                                capability: node.capability.clone(),
                                estimated_cost_cents: 0,
                                content: format!(
                                    "Build a capability node for: {}. \
                                     Required capability: {}",
                                    node.content, node.capability
                                ),
                                depends_on: vec![],
                                manifest_node_id: None,
                            };
                            let builder_spawner = DefaultSpawner {
                                api_key: api_key_s.clone(),
                                model: model_s.clone(),
                                soul_md: soul_s.clone(),
                                lora_active: lora,
                                runpod_endpoint: ep.clone(),
                                reasoning_guidance: node_reasoning_guidance.clone(),
                            };
                            let builder_result = builder_spawner
                                .spawn(&builder_node, &delegation, &prior_snap)
                                .await;

                            if builder_result.status == NodeStatus::Ok {
                                let valid = builder_result
                                    .output
                                    .as_deref()
                                    .and_then(|s| serde_json::from_str::<serde_json::Value>(s).ok())
                                    .and_then(|v| {
                                        v.get("task_type")
                                            .and_then(|t| t.as_str())
                                            .map(|s| s.to_string())
                                    })
                                    .map(|tt| PolicyEngine::is_allowed_task_type(&tt))
                                    .unwrap_or(false);

                                if valid {
                                    NodeResult {
                                        node_id: node.id.clone(),
                                        node_kind: node.node_kind.as_str().to_string(),
                                        status: NodeStatus::Ok,
                                        output: builder_result.output,
                                        error: None,
                                        child_run_id: None,
                                    }
                                } else {
                                    NodeResult {
                                        node_id: node.id.clone(),
                                        node_kind: node.node_kind.as_str().to_string(),
                                        status: NodeStatus::Replanned,
                                        output: None,
                                        error: Some(
                                            "CustomNodeBuilder output failed PolicyNode dry-run; \
                                             escalated to ReflectionNode for replan"
                                                .to_string(),
                                        ),
                                        child_run_id: None,
                                    }
                                }
                            } else {
                                builder_result
                            }
                        } else {
                            raw_result
                        }
                    };

                    // Revoke delegation
                    let _ = db_clone.revoke_delegation(&owner, &delegation_id).await;

                    // Update task status
                    let (ts, tv, te) = match &node_result.status {
                        NodeStatus::Ok => (
                            TaskStatus::Completed.as_str(),
                            Some(serde_json::Value::String(
                                node_result.output.clone().unwrap_or_default(),
                            )),
                            None,
                        ),
                        _ => (
                            TaskStatus::Failed.as_str(),
                            None,
                            node_result.error.as_deref(),
                        ),
                    };
                    let _ = db_clone
                        .update_agent_task_status(&owner, &task_record.id, ts, tv, te)
                        .await;

                    if node_result.status == NodeStatus::Ok {
                        if let Some(ref out) = node_result.output {
                            prior.lock().await.insert(node.id.clone(), out.clone());
                        }
                    }

                    node_result
                });
                handles.push(handle);
            }

            for h in handles {
                match h.await {
                    Ok(r) => all_node_results.push(r),
                    Err(e) => all_node_results.push(NodeResult {
                        node_id: "unknown".into(),
                        node_kind: "unknown".into(),
                        status: NodeStatus::Failed,
                        output: None,
                        error: Some(e.to_string()),
                        child_run_id: None,
                    }),
                }
            }

            // ── Item 23: child supervisor nodes (sequential, outer context) ─
            // These are Plan nodes whose sub-graph has ≥ 3 executor nodes.
            // Running them here (outside tokio::spawn) avoids the Send bound
            // on the recursive async future.
            for node in child_supervisor_nodes {
                let prior_snap = prior_results.lock().await.clone();
                // Derive child delegation from parent key when available; otherwise
                // generate a fresh random key so root-level keys are not predictable.
                let child_key = self
                    .parent_delegation
                    .as_ref()
                    .map(|pd| pd.delegated_key_hex.clone())
                    .unwrap_or_else(|| {
                        let mut mk = [0u8; 32];
                        rand::rng().fill_bytes(&mut mk);
                        hex::encode(mk)
                    });

                let task_record = AgentTask::new(
                    self.owner_user_id.clone(),
                    self.instance_id.clone(),
                    node.content.clone(),
                    TaskPriority::Normal,
                );
                let _ = db.create_agent_task(&task_record).await;

                let child_delegation = generate_delegated_key(
                    &child_key,
                    &format!("child_plan:{}", node.id),
                    &task_record.id,
                    120,
                    &self.instance_id,
                    &self.owner_user_id,
                    vec![],
                    vec![],
                    None,
                );
                let child_run_id = ulid::Ulid::new().to_string();
                let child_sup = WorkflowSupervisor {
                    instance_id: self.instance_id.clone(),
                    owner_user_id: self.owner_user_id.clone(),
                    max_concurrency: self.max_concurrency,
                    parent_delegation: Some(child_delegation),
                    node_manifests: self.node_manifests.clone(),
                    depth: self.depth + 1,
                };

                let node_result = match child_sup
                    .run(
                        &node.content,
                        db,
                        api_key,
                        model,
                        soul_md,
                        lora_active,
                        runpod_endpoint,
                    )
                    .await
                {
                    Ok(cr) => {
                        let summary = serde_json::to_string(&cr).unwrap_or_default();
                        if !summary.is_empty() {
                            prior_results
                                .lock()
                                .await
                                .insert(node.id.clone(), summary.clone());
                        }
                        NodeResult {
                            node_id: node.id.clone(),
                            node_kind: node.node_kind.as_str().to_string(),
                            status: NodeStatus::Ok,
                            output: Some(summary),
                            error: None,
                            child_run_id: Some(child_run_id),
                        }
                    }
                    Err(e) => NodeResult {
                        node_id: node.id.clone(),
                        node_kind: node.node_kind.as_str().to_string(),
                        status: NodeStatus::Failed,
                        output: None,
                        error: Some(e.to_string()),
                        child_run_id: None,
                    },
                };

                let (ts, tv, te) = match &node_result.status {
                    NodeStatus::Ok => (
                        TaskStatus::Completed.as_str(),
                        Some(serde_json::Value::String(
                            node_result.output.clone().unwrap_or_default(),
                        )),
                        None,
                    ),
                    _ => (
                        TaskStatus::Failed.as_str(),
                        None,
                        node_result.error.as_deref(),
                    ),
                };
                let _ = db
                    .update_agent_task_status(&self.owner_user_id, &task_record.id, ts, tv, te)
                    .await;

                let _ = prior_snap; // consumed above for context
                all_node_results.push(node_result);
            }
        }

        let success_count = all_node_results
            .iter()
            .filter(|r| r.status == NodeStatus::Ok)
            .count();

        let audit_payload = serde_json::json!({
            "event": "supervisor_run",
            "run_id": run_id,
            "depth": self.depth,
            "objective_len": objective.len(),
            "node_count": all_node_results.len(),
            "success_count": success_count,
        });
        let audit_hash = message_hash(&audit_payload);

        Ok(SupervisorResult {
            run_id,
            objective: objective.to_string(),
            depth: self.depth,
            node_count: all_node_results.len(),
            success_count,
            node_results: all_node_results,
            audit_hash,
        })
    }

    async fn decompose_to_graph(
        &self,
        objective: &str,
        api_key: &str,
        model: &str,
        soul_md: Option<&str>,
        lora_active: bool,
        runpod_endpoint: Option<&str>,
        reasoning_guidance: &[String],
    ) -> Result<TaskGraph, SupervisorError> {
        let soul_section = if !lora_active {
            soul_md
                .map(|s| format!("\n\nAgent soul context:\n{s}"))
                .unwrap_or_default()
        } else {
            String::new()
        };

        let system = append_reasoning_guidance(
            &format!(
                "You are a workflow supervisor. Decompose the objective into a structured task \
             graph where each node has: id, node_kind, task_type, capability, \
             estimated_cost_cents, content, and depends_on (list of prerequisite node IDs).\n\
             node_kind must be one of: goal_intake, plan, executor, reflection, \
             capability_router.\n\
             task_type must be one of: email_triage, calendar, study_planning, \
             web_research, note, database (empty string for structural nodes).\n\
             Always include a goal_intake node first, at least one executor node, \
             and a reflection node last.\n\
             Return ONLY valid JSON: {{\"nodes\": [...]}}.\
             {soul_section}"
            ),
            reasoning_guidance,
            "workflow graph decomposition",
        );

        let req = InferenceRequest {
            system,
            messages: vec![InferenceMessage {
                role: "user".to_string(),
                content: format!("Decompose this objective into a task graph:\n{objective}"),
            }],
            max_tokens: 1024,
            temperature: 0.2,
        };

        let resp = if let Some(ep) = runpod_endpoint {
            runpod_infer(ep, api_key, model, &req)
                .await
                .map_err(|e| SupervisorError::PlanningFailed(e.to_string()))?
        } else {
            anthropic_infer(api_key, model, &req)
                .await
                .map_err(|e| SupervisorError::PlanningFailed(e.to_string()))?
        };

        let text = resp.content.trim();
        let start = text.find('{').unwrap_or(0);
        let end = text.rfind('}').map(|i| i + 1).unwrap_or(text.len());
        let json_str = &text[start..end];

        let parsed: serde_json::Value = serde_json::from_str(json_str)
            .map_err(|e| SupervisorError::PlanningFailed(format!("json parse: {e}")))?;

        let nodes: Vec<TaskGraphNode> = serde_json::from_value(parsed["nodes"].clone())
            .map_err(|e| SupervisorError::PlanningFailed(format!("nodes parse: {e}")))?;

        Ok(TaskGraph { nodes })
    }

    // ── Step 8: run_from_ir ───────────────────────────────────────────────────

    /// Execute a compiled WorkflowIR directly, bypassing LLM task-graph decomposition.
    ///
    /// Converts the IR manifests into a `TaskGraph`, validates policy, then schedules:
    /// - Manifests in a `parallel_group` → `IrBranchScheduler` (bounded concurrency).
    /// - All other manifests → existing semaphore-gated spawner path (same as `run_inner`).
    ///
    /// Returns a `SupervisorResult` in the same shape as `run()`.
    pub fn run_from_ir<'a>(
        &'a self,
        ir: serde_json::Value,
        db: &'a Db,
        api_key: &'a str,
        model: &'a str,
        soul_md: Option<&'a str>,
        lora_active: bool,
        runpod_endpoint: Option<&'a str>,
    ) -> std::pin::Pin<
        Box<
            dyn std::future::Future<Output = Result<SupervisorResult, SupervisorError>> + Send + 'a,
        >,
    > {
        Box::pin(self.run_from_ir_inner(
            ir,
            db,
            api_key,
            model,
            soul_md,
            lora_active,
            runpod_endpoint,
        ))
    }

    async fn run_from_ir_inner(
        &self,
        ir: serde_json::Value,
        db: &Db,
        api_key: &str,
        model: &str,
        soul_md: Option<&str>,
        lora_active: bool,
        runpod_endpoint: Option<&str>,
    ) -> Result<SupervisorResult, SupervisorError> {
        let run_id = ulid::Ulid::new().to_string();
        let reasoning_guidance =
            crate::server::skill_capsule_routes::selected_reasoning_skill_guidance_for_user(
                &self.owner_user_id,
            )
            .unwrap_or_default();

        // Convert IR manifests + edges → TaskGraph.
        let graph = task_graph_from_ir(&ir).map_err(SupervisorError::PlanningFailed)?;

        // Validate against policy (same pre-flight as run_inner).
        PolicyGraph::validate(&graph, &self.node_manifests)
            .map_err(SupervisorError::GraphInvalid)?;

        let levels = graph
            .execution_levels()
            .map_err(SupervisorError::PlanningFailed)?;

        let node_map: HashMap<String, TaskGraphNode> = graph
            .nodes
            .iter()
            .cloned()
            .map(|n| (n.id.clone(), n))
            .collect();

        // Build set of manifest_node_ids that belong to a parallel group.
        let parallel_group_members: HashSet<String> = ir
            .get("parallel_groups")
            .and_then(serde_json::Value::as_array)
            .map(|pgs| {
                pgs.iter()
                    .flat_map(|pg| {
                        pg.get("manifest_node_ids")
                            .and_then(serde_json::Value::as_array)
                            .map(|ids| {
                                ids.iter()
                                    .filter_map(|v| v.as_str())
                                    .map(str::to_string)
                                    .collect::<Vec<_>>()
                            })
                            .unwrap_or_default()
                    })
                    .collect()
            })
            .unwrap_or_default();

        let semaphore = Arc::new(Semaphore::new(self.max_concurrency));
        let prior_results: Arc<tokio::sync::Mutex<HashMap<String, String>>> =
            Arc::new(tokio::sync::Mutex::new(HashMap::new()));
        let mut all_node_results: Vec<NodeResult> = vec![];

        for level in &levels {
            let (parallel_ids, sequential_ids): (Vec<&String>, Vec<&String>) = level
                .iter()
                .partition(|id| parallel_group_members.contains(*id));

            // ── Parallel-group nodes → IrBranchScheduler ─────────────────────
            if !parallel_ids.is_empty() {
                let scheduler = IrBranchScheduler::new(ir.clone())
                    // Cap at free-tier default (2) bounded by supervisor max_concurrency.
                    .with_max_branches(self.max_concurrency.min(2));

                let db_owned = db.clone();
                let api_key_s = api_key.to_string();
                let model_s = model.to_string();
                let soul_s = soul_md.map(str::to_string);
                let ep = runpod_endpoint.map(str::to_string);
                let owner = self.owner_user_id.clone();
                let inst = self.instance_id.clone();
                let manifests = self.node_manifests.clone();
                let prior_snap = prior_results.lock().await.clone();
                let prior_arc = prior_results.clone();
                let parallel_reasoning_guidance = reasoning_guidance.clone();

                let sched_result = scheduler
                    .run(move |mf_id, cost_cents| {
                        // Clone per-call so F: Fn (not FnOnce).
                        let db_c = db_owned.clone();
                        let api_key_c = api_key_s.clone();
                        let model_c = model_s.clone();
                        let soul_c = soul_s.clone();
                        let ep_c = ep.clone();
                        let owner_c = owner.clone();
                        let inst_c = inst.clone();
                        let manifests_c = manifests.clone();
                        let prior_snap_c = prior_snap.clone();
                        let prior_arc_c = prior_arc.clone();
                        let reasoning_guidance_c = parallel_reasoning_guidance.clone();

                        async move {
                            // Build a synthetic TaskGraphNode for this manifest.
                            let node = TaskGraphNode {
                                id: mf_id.clone(),
                                node_kind: NodeKind::Executor,
                                task_type: "workflow_node".to_string(),
                                capability: mf_id.clone(),
                                estimated_cost_cents: cost_cents,
                                content: format!("Execute IR manifest: {mf_id}"),
                                depends_on: vec![],
                                manifest_node_id: Some(mf_id.clone()),
                            };

                            let manifest = node
                                .manifest_node_id
                                .as_deref()
                                .and_then(|mid| manifests_c.iter().find(|m| m.node_id == mid));
                            let (allowed_caps, outbound_list, sys_prompt, instr_prompt) =
                                manifest_to_delegation_fields(&node.task_type, manifest);

                            let mut mk3 = [0u8; 32];
                            rand::rng().fill_bytes(&mut mk3);
                            let delegation = generate_delegated_key(
                                &hex::encode(mk3),
                                &node.task_type,
                                &mf_id,
                                60,
                                &inst_c,
                                &owner_c,
                                allowed_caps,
                                outbound_list,
                                Some(ContextSnapshot {
                                    afp_thread_slice: vec![],
                                    prior_step_results: prior_snap_c.clone(),
                                    system_prompt: sys_prompt,
                                    instruction_prompt: instr_prompt,
                                    token_budget_remaining: Some(512),
                                    simulator_projection_summary: None,
                                }),
                            );
                            let delegation_id = delegation.id.clone();
                            let _ = db_c.create_delegation(&delegation).await;

                            let node_result = spawner_call_sync(
                                &api_key_c,
                                &model_c,
                                soul_c.as_deref(),
                                false,
                                ep_c.as_deref(),
                                &reasoning_guidance_c,
                                &node,
                                &delegation,
                                &prior_snap_c,
                            )
                            .await;

                            let _ = db_c.revoke_delegation(&owner_c, &delegation_id).await;

                            match node_result.status {
                                NodeStatus::Ok => {
                                    let out = node_result.output.unwrap_or_default();
                                    prior_arc_c.lock().await.insert(mf_id.clone(), out.clone());
                                    BranchOutcome::Completed {
                                        manifest_node_id: mf_id,
                                        output: out,
                                        cost_cents,
                                    }
                                }
                                _ => BranchOutcome::Failed {
                                    manifest_node_id: mf_id,
                                    error: node_result
                                        .error
                                        .unwrap_or_else(|| "execution failed".to_string()),
                                    cost_cents,
                                },
                            }
                        }
                    })
                    .await;

                // Convert BranchOutcomes → NodeResults.
                for group_result in &sched_result.group_results {
                    for outcome in &group_result.branch_outcomes {
                        let nr = match outcome {
                            BranchOutcome::Completed {
                                manifest_node_id,
                                output,
                                ..
                            } => NodeResult {
                                node_id: manifest_node_id.clone(),
                                node_kind: "executor".to_string(),
                                status: NodeStatus::Ok,
                                output: Some(output.clone()),
                                error: None,
                                child_run_id: None,
                            },
                            BranchOutcome::Failed {
                                manifest_node_id,
                                error,
                                ..
                            } => NodeResult {
                                node_id: manifest_node_id.clone(),
                                node_kind: "executor".to_string(),
                                status: NodeStatus::Failed,
                                output: None,
                                error: Some(error.clone()),
                                child_run_id: None,
                            },
                            BranchOutcome::Cancelled { manifest_node_id } => NodeResult {
                                node_id: manifest_node_id.clone(),
                                node_kind: "executor".to_string(),
                                status: NodeStatus::Failed,
                                output: None,
                                error: Some("branch cancelled".to_string()),
                                child_run_id: None,
                            },
                        };
                        all_node_results.push(nr);
                    }
                }
            }

            // ── Sequential (non-parallel-group) nodes → semaphore + spawn ────
            let mut handles: Vec<tokio::task::JoinHandle<NodeResult>> = vec![];
            for node_id in sequential_ids {
                let node = match node_map.get(node_id) {
                    Some(n) => n.clone(),
                    None => continue,
                };
                let sem = semaphore.clone();
                let db_clone = db.clone();
                let api_key_s = api_key.to_string();
                let model_s = model.to_string();
                let soul_s = soul_md.map(str::to_string);
                let lora = lora_active;
                let ep = runpod_endpoint.map(str::to_string);
                let owner = self.owner_user_id.clone();
                let inst = self.instance_id.clone();
                let manifests = self.node_manifests.clone();
                let prior = prior_results.clone();
                let sequential_reasoning_guidance = reasoning_guidance.clone();

                let handle = tokio::spawn(async move {
                    let _permit = sem.acquire().await.ok();
                    let prior_snap = prior.lock().await.clone();

                    let manifest = node
                        .manifest_node_id
                        .as_deref()
                        .and_then(|mid| manifests.iter().find(|m| m.node_id == mid));
                    let (allowed_caps, outbound_list, sys_prompt, instr_prompt) =
                        manifest_to_delegation_fields(&node.task_type, manifest);

                    let snapshot = Some(ContextSnapshot {
                        afp_thread_slice: vec![],
                        prior_step_results: prior_snap.clone(),
                        system_prompt: sys_prompt,
                        instruction_prompt: instr_prompt,
                        token_budget_remaining: Some(512),
                        simulator_projection_summary: None,
                    });

                    let task_record = AgentTask::new(
                        owner.clone(),
                        inst.clone(),
                        node.content.clone(),
                        TaskPriority::Normal,
                    );
                    let _ = db_clone.create_agent_task(&task_record).await;

                    let mut mk4 = [0u8; 32];
                    rand::rng().fill_bytes(&mut mk4);
                    let delegation = generate_delegated_key(
                        &hex::encode(mk4),
                        &node.task_type,
                        &task_record.id,
                        60,
                        &inst,
                        &owner,
                        allowed_caps,
                        outbound_list,
                        snapshot,
                    );
                    let delegation_id = delegation.id.clone();
                    let _ = db_clone.create_delegation(&delegation).await;

                    let node_result = spawner_call_sync(
                        &api_key_s,
                        &model_s,
                        soul_s.as_deref(),
                        lora,
                        ep.as_deref(),
                        &sequential_reasoning_guidance,
                        &node,
                        &delegation,
                        &prior_snap,
                    )
                    .await;

                    let _ = db_clone.revoke_delegation(&owner, &delegation_id).await;

                    if node_result.status == NodeStatus::Ok {
                        if let Some(ref out) = node_result.output {
                            prior.lock().await.insert(node.id.clone(), out.clone());
                        }
                    }

                    node_result
                });
                handles.push(handle);
            }

            for h in handles {
                match h.await {
                    Ok(r) => all_node_results.push(r),
                    Err(e) => all_node_results.push(NodeResult {
                        node_id: "unknown".into(),
                        node_kind: "unknown".into(),
                        status: NodeStatus::Failed,
                        output: None,
                        error: Some(e.to_string()),
                        child_run_id: None,
                    }),
                }
            }
        }

        let success_count = all_node_results
            .iter()
            .filter(|r| r.status == NodeStatus::Ok)
            .count();

        let audit_payload = serde_json::json!({
            "event": "ir_supervisor_run",
            "run_id": run_id,
            "depth": self.depth,
            "node_count": all_node_results.len(),
            "success_count": success_count,
        });
        let audit_hash = message_hash(&audit_payload);

        Ok(SupervisorResult {
            run_id,
            objective: "workflow_ir_execution".to_string(),
            depth: self.depth,
            node_count: all_node_results.len(),
            success_count,
            node_results: all_node_results,
            audit_hash,
        })
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Convert a compiled WorkflowIR JSON value into a [`TaskGraph`].
///
/// Each IR manifest becomes one `TaskGraphNode`; IR edges become `depends_on` references.
pub fn task_graph_from_ir(ir: &serde_json::Value) -> Result<TaskGraph, String> {
    let manifests = ir
        .get("manifests")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| "IR missing 'manifests' array".to_string())?;

    let edges: Vec<serde_json::Value> = ir
        .get("edges")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();

    // Build depends_on: to_node_id → [from_node_id, ...]
    let mut depends_on_map: HashMap<String, Vec<String>> = HashMap::new();
    for edge in &edges {
        let from = edge
            .get("from_manifest_node_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let to = edge
            .get("to_manifest_node_id")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !from.is_empty() && !to.is_empty() {
            depends_on_map
                .entry(to.to_string())
                .or_default()
                .push(from.to_string());
        }
    }

    let nodes: Vec<TaskGraphNode> = manifests
        .iter()
        .filter_map(|m| m.as_object())
        .map(|mf| {
            let node_id = mf
                .get("node_id")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            let runtime_kind = mf
                .get("runtime_kind")
                .and_then(|v| v.as_str())
                .unwrap_or("executor");

            let node_kind = match runtime_kind {
                "goal_intake" => NodeKind::GoalIntake,
                "plan" => NodeKind::Plan,
                "reflection" => NodeKind::Reflection,
                "capability_router" => NodeKind::CapabilityRouter,
                _ => NodeKind::Executor,
            };

            let task_type = mf
                .get("policy")
                .and_then(|p| p.get("task_type"))
                .and_then(|v| v.as_str())
                .or_else(|| mf.get("execution_path").and_then(|v| v.as_str()))
                .unwrap_or("workflow_node")
                .to_string();

            let capability = mf
                .get("capability_id")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let estimated_cost_cents = mf
                .get("estimated_cost_cents")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;

            let label = mf
                .get("metadata")
                .and_then(|m| m.get("label"))
                .and_then(|v| v.as_str())
                .unwrap_or(runtime_kind);

            let depends_on = depends_on_map.get(&node_id).cloned().unwrap_or_default();

            TaskGraphNode {
                id: node_id.clone(),
                node_kind,
                task_type,
                capability,
                estimated_cost_cents,
                content: format!("Execute {runtime_kind} node: {label}"),
                depends_on,
                manifest_node_id: Some(node_id),
            }
        })
        .collect();

    Ok(TaskGraph { nodes })
}

/// Resolve delegation fields from a node manifest (shared with item 25 logic).
fn manifest_to_delegation_fields(
    task_type: &str,
    manifest: Option<&WorkflowNodeManifest>,
) -> (Vec<String>, Vec<String>, Option<String>, Option<String>) {
    if let Some(m) = manifest {
        let caps = if m.allowed_capabilities.is_empty() {
            PolicyEngine::capabilities_for_task(task_type)
                .iter()
                .map(|s| s.to_string())
                .collect()
        } else {
            let global: Vec<&str> = PolicyEngine::capabilities_for_task(task_type).to_vec();
            m.allowed_capabilities
                .iter()
                .filter(|c| global.contains(&c.as_str()))
                .cloned()
                .collect()
        };
        (
            caps,
            m.outbound_allowlist.clone(),
            m.system_prompt.clone(),
            m.instruction_prompt.clone(),
        )
    } else {
        let caps = PolicyEngine::capabilities_for_task(task_type)
            .iter()
            .map(|s| s.to_string())
            .collect();
        (caps, vec![], None, None)
    }
}

/// Build a minimal child `TaskGraph` for a Plan node's sub-work.
/// In a full implementation this would call the LLM; here we produce a
/// placeholder graph so the child supervisor can exercise its logic.
fn build_child_graph_for_plan(plan_node: &TaskGraphNode) -> TaskGraph {
    let g_id = format!("{}_gi", plan_node.id);
    let e1_id = format!("{}_e1", plan_node.id);
    let e2_id = format!("{}_e2", plan_node.id);
    let e3_id = format!("{}_e3", plan_node.id);
    let r_id = format!("{}_rf", plan_node.id);
    TaskGraph {
        nodes: vec![
            TaskGraphNode {
                id: g_id.clone(),
                node_kind: NodeKind::GoalIntake,
                task_type: String::new(),
                capability: String::new(),
                estimated_cost_cents: 0,
                content: plan_node.content.clone(),
                depends_on: vec![],
                manifest_node_id: None,
            },
            TaskGraphNode {
                id: e1_id.clone(),
                node_kind: NodeKind::Executor,
                task_type: "note".to_string(),
                capability: "write_notes".to_string(),
                estimated_cost_cents: 5,
                content: format!("Step 1 of sub-plan: {}", plan_node.content),
                depends_on: vec![g_id.clone()],
                manifest_node_id: None,
            },
            TaskGraphNode {
                id: e2_id.clone(),
                node_kind: NodeKind::Executor,
                task_type: "web_research".to_string(),
                capability: "web_search".to_string(),
                estimated_cost_cents: 5,
                content: format!("Step 2 of sub-plan: research for {}", plan_node.content),
                depends_on: vec![g_id.clone()],
                manifest_node_id: None,
            },
            TaskGraphNode {
                id: e3_id.clone(),
                node_kind: NodeKind::Executor,
                task_type: "note".to_string(),
                capability: "write_notes".to_string(),
                estimated_cost_cents: 5,
                content: format!("Step 3 of sub-plan: consolidate {}", plan_node.content),
                depends_on: vec![e1_id.clone(), e2_id.clone()],
                manifest_node_id: None,
            },
            TaskGraphNode {
                id: r_id,
                node_kind: NodeKind::Reflection,
                task_type: String::new(),
                capability: String::new(),
                estimated_cost_cents: 0,
                content: format!("Reflect on sub-plan results for: {}", plan_node.content),
                depends_on: vec![e3_id],
                manifest_node_id: None,
            },
        ],
    }
}

// ── Step 7: Bounded Parallel Scheduler ────────────────────────────────────────
//
// `IrBranchScheduler` reads `parallel_groups` from a compiled WorkflowIR JSON
// value and executes each group's branches under a per-group bounded semaphore.
//
// Responsibilities:
//   - Ready queue  : collects manifest node IDs per group (dependency ordering
//                    is already resolved by the upstream TaskGraph scheduler;
//                    all nodes in a group are considered ready simultaneously).
//   - Bounded concurrency : per-group semaphore capped at
//                    min(group.max_concurrency, self.max_branches_per_group).
//   - Branch budgets: pre-flight check that each branch's estimated_cost_cents
//                    does not exceed `self.branch_budget_cents` (0 = unlimited).
//   - Failure propagation: applied at merge-barrier time based on join_strategy.
//   - Merge synchronisation: all branch join_futures are awaited before the
//                    merge barrier is considered released.

/// The outcome of executing one branch (one manifest node) inside a parallel group.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BranchOutcome {
    Completed {
        manifest_node_id: String,
        output: String,
        cost_cents: u32,
    },
    Failed {
        manifest_node_id: String,
        error: String,
        cost_cents: u32,
    },
    Cancelled {
        manifest_node_id: String,
    },
}

impl BranchOutcome {
    pub fn manifest_node_id(&self) -> &str {
        match self {
            BranchOutcome::Completed {
                manifest_node_id, ..
            } => manifest_node_id,
            BranchOutcome::Failed {
                manifest_node_id, ..
            } => manifest_node_id,
            BranchOutcome::Cancelled { manifest_node_id } => manifest_node_id,
        }
    }

    pub fn is_success(&self) -> bool {
        matches!(self, BranchOutcome::Completed { .. })
    }

    pub fn cost_cents(&self) -> u32 {
        match self {
            BranchOutcome::Completed { cost_cents, .. } => *cost_cents,
            BranchOutcome::Failed { cost_cents, .. } => *cost_cents,
            BranchOutcome::Cancelled { .. } => 0,
        }
    }
}

/// Aggregated result for one parallel group after all branches have settled.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParallelGroupResult {
    pub parallel_group_id: String,
    pub branch_outcomes: Vec<BranchOutcome>,
    /// The merge barrier manifest node ID (from the IR annotation), if present.
    pub merge_barrier_manifest_node_id: Option<String>,
    /// Join strategy applied: "all_required" | "first_wins" | "any_threshold".
    pub join_strategy: String,
    /// Total cost accrued across all branches in this group.
    pub total_cost_cents: u32,
    /// True if the group's join strategy was satisfied.
    pub succeeded: bool,
    /// Human-readable failure reason; set when `succeeded == false`.
    pub failure_reason: Option<String>,
}

/// Aggregated result returned by `IrBranchScheduler::run()`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchedulerRunResult {
    pub group_results: Vec<ParallelGroupResult>,
    /// Sum of all branch costs across every group.
    pub total_cost_cents: u32,
    /// True if every parallel group succeeded.
    pub all_groups_succeeded: bool,
}

/// Bounded parallel scheduler (Step 7).
///
/// Reads `parallel_groups` from a compiled WorkflowIR JSON value and executes
/// each group concurrently under a per-group semaphore.
pub struct IrBranchScheduler {
    /// Compiled IR produced by `compile_workflow_graph_to_ir()`.
    pub ir: serde_json::Value,
    /// Per-group concurrency cap.  Free-tier default = 2.
    pub max_branches_per_group: usize,
    /// Per-branch cost cap in USD cents.  0 = no limit.
    pub branch_budget_cents: u32,
}

impl IrBranchScheduler {
    pub fn new(ir: serde_json::Value) -> Self {
        Self {
            ir,
            max_branches_per_group: 2,
            branch_budget_cents: 0,
        }
    }

    pub fn with_max_branches(mut self, n: usize) -> Self {
        self.max_branches_per_group = n.max(1);
        self
    }

    pub fn with_branch_budget(mut self, cents: u32) -> Self {
        self.branch_budget_cents = cents;
        self
    }

    /// Execute all parallel groups in the IR.
    ///
    /// `execute_fn(manifest_node_id, estimated_cost_cents) → BranchOutcome`.
    /// Groups run sequentially; branches *within* a group are gated by the
    /// per-group semaphore.
    pub async fn run<F, Fut>(&self, execute_fn: F) -> SchedulerRunResult
    where
        F: Fn(String, u32) -> Fut + Send + Sync + Clone + 'static,
        Fut: std::future::Future<Output = BranchOutcome> + Send + 'static,
    {
        use serde_json::Value;

        let groups = self
            .ir
            .get("parallel_groups")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();

        // Build manifest_node_id → estimated_cost_cents lookup from IR manifests.
        let cost_map: std::collections::HashMap<String, u32> = self
            .ir
            .get("manifests")
            .and_then(Value::as_array)
            .map(|ms| {
                ms.iter()
                    .filter_map(|m| {
                        let id = m.get("node_id").and_then(Value::as_str)?;
                        let cost = m
                            .get("estimated_cost_cents")
                            .and_then(Value::as_u64)
                            .unwrap_or(0) as u32;
                        Some((id.to_string(), cost))
                    })
                    .collect()
            })
            .unwrap_or_default();

        let mut group_results: Vec<ParallelGroupResult> = Vec::new();
        let mut total_cost: u32 = 0;

        for group in &groups {
            let pg_id = group
                .get("parallel_group_id")
                .and_then(Value::as_str)
                .unwrap_or("unknown_group")
                .to_string();

            let manifest_node_ids: Vec<String> = group
                .get("manifest_node_ids")
                .and_then(Value::as_array)
                .map(|a| {
                    a.iter()
                        .filter_map(Value::as_str)
                        .map(str::to_string)
                        .collect()
                })
                .unwrap_or_default();

            let total_member_count = manifest_node_ids.len();

            let max_concurrency = group
                .get("max_concurrency")
                .and_then(Value::as_u64)
                .unwrap_or(2) as usize;

            let join_strategy = group
                .get("join_strategy")
                .and_then(Value::as_str)
                .unwrap_or("all_required")
                .to_string();

            let merge_barrier = group
                .get("merge_barrier_manifest_node_id")
                .and_then(Value::as_str)
                .map(str::to_string);

            // Bounded concurrency: min(group.max_concurrency, self.max_branches_per_group).
            let effective_limit = max_concurrency.min(self.max_branches_per_group).max(1);
            let semaphore = Arc::new(Semaphore::new(effective_limit));

            // Pre-flight budget check; build ready queue.
            let mut ready_queue: Vec<(String, u32)> = Vec::new();
            let mut branch_outcomes: Vec<BranchOutcome> = Vec::new();

            for mf_id in &manifest_node_ids {
                let cost = cost_map.get(mf_id).copied().unwrap_or(0);
                if self.branch_budget_cents > 0 && cost > self.branch_budget_cents {
                    branch_outcomes.push(BranchOutcome::Failed {
                        manifest_node_id: mf_id.clone(),
                        error: format!(
                            "branch budget exceeded: estimated {}c > limit {}c",
                            cost, self.branch_budget_cents
                        ),
                        cost_cents: cost,
                    });
                } else {
                    ready_queue.push((mf_id.clone(), cost));
                }
            }

            // Schedule ready branches under the semaphore.
            let mut handles: Vec<tokio::task::JoinHandle<BranchOutcome>> = Vec::new();
            for (mf_id, cost) in ready_queue {
                let sem = semaphore.clone();
                let exec = execute_fn.clone();
                let handle = tokio::spawn(async move {
                    let _permit = sem.acquire().await.ok();
                    exec(mf_id, cost).await
                });
                handles.push(handle);
            }

            // Merge synchronisation: await every branch before releasing barrier.
            for h in handles {
                match h.await {
                    Ok(outcome) => branch_outcomes.push(outcome),
                    Err(e) => branch_outcomes.push(BranchOutcome::Failed {
                        manifest_node_id: "unknown".to_string(),
                        error: format!("branch task panicked: {e}"),
                        cost_cents: 0,
                    }),
                }
            }

            // Apply join strategy to determine group success.
            let group_cost: u32 = branch_outcomes.iter().map(|o| o.cost_cents()).sum();
            total_cost = total_cost.saturating_add(group_cost);

            let (succeeded, failure_reason) = match join_strategy.as_str() {
                "first_wins" => {
                    if branch_outcomes.iter().any(|o| o.is_success()) {
                        (true, None)
                    } else {
                        (false, Some("first_wins: no branch succeeded".to_string()))
                    }
                }
                "any_threshold" => {
                    let ok_count = branch_outcomes.iter().filter(|o| o.is_success()).count();
                    // Majority threshold: more than half must succeed.
                    let threshold = (total_member_count / 2) + 1;
                    if ok_count >= threshold {
                        (true, None)
                    } else {
                        (
                            false,
                            Some(format!(
                                "any_threshold: only {ok_count}/{total_member_count} \
                                 succeeded (need {threshold})"
                            )),
                        )
                    }
                }
                // "all_required" is the default.
                _ => {
                    let failures: Vec<String> = branch_outcomes
                        .iter()
                        .filter(|o| !o.is_success())
                        .map(|o| match o {
                            BranchOutcome::Failed {
                                manifest_node_id,
                                error,
                                ..
                            } => {
                                format!("{manifest_node_id}: {error}")
                            }
                            BranchOutcome::Cancelled { manifest_node_id } => {
                                format!("{manifest_node_id}: cancelled")
                            }
                            _ => "unknown".to_string(),
                        })
                        .collect();
                    if failures.is_empty() {
                        (true, None)
                    } else {
                        (
                            false,
                            Some(format!("all_required: {}", failures.join("; "))),
                        )
                    }
                }
            };

            group_results.push(ParallelGroupResult {
                parallel_group_id: pg_id,
                branch_outcomes,
                merge_barrier_manifest_node_id: merge_barrier,
                join_strategy,
                total_cost_cents: group_cost,
                succeeded,
                failure_reason,
            });
        }

        let all_groups_succeeded = group_results.iter().all(|g| g.succeeded);
        SchedulerRunResult {
            group_results,
            total_cost_cents: total_cost,
            all_groups_succeeded,
        }
    }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/// Thin async wrapper so the spawner call can be used inside a tokio::spawn closure
/// without capturing the trait object.
async fn spawner_call_sync(
    api_key: &str,
    model: &str,
    soul_md: Option<&str>,
    lora_active: bool,
    runpod_endpoint: Option<&str>,
    reasoning_guidance: &[String],
    node: &TaskGraphNode,
    delegation: &AgentDelegation,
    prior: &HashMap<String, String>,
) -> NodeResult {
    let s = DefaultSpawner {
        api_key: api_key.to_string(),
        model: model.to_string(),
        soul_md: soul_md.map(str::to_string),
        lora_active,
        runpod_endpoint: runpod_endpoint.map(str::to_string),
        reasoning_guidance: reasoning_guidance.to_vec(),
    };
    s.spawn(node, delegation, prior).await
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reasoning_guidance_prompt_helper_appends_guidance() {
        let prompt = append_reasoning_guidance(
            "Base workflow prompt",
            &[
                "Use grounded reasoning.".to_string(),
                "Run a brief reflection pass.".to_string(),
            ],
            "workflow graph decomposition",
        );
        assert!(prompt.contains("# Enabled workspace reasoning guidance"));
        assert!(prompt.contains("- Use grounded reasoning."));
        assert!(prompt.contains("- Run a brief reflection pass."));
        assert!(prompt.contains("workflow graph decomposition"));
    }

    // ── TaskGraph / item 21 ───────────────────────────────────────────────────

    fn sample_graph() -> TaskGraph {
        TaskGraph {
            nodes: vec![
                TaskGraphNode {
                    id: "n1".into(),
                    node_kind: NodeKind::GoalIntake,
                    task_type: String::new(),
                    capability: String::new(),
                    estimated_cost_cents: 0,
                    content: "Intake".into(),
                    depends_on: vec![],
                    manifest_node_id: None,
                },
                TaskGraphNode {
                    id: "n2".into(),
                    node_kind: NodeKind::Executor,
                    task_type: "note".into(),
                    capability: "write_notes".into(),
                    estimated_cost_cents: 5,
                    content: "Write note".into(),
                    depends_on: vec!["n1".into()],
                    manifest_node_id: None,
                },
                TaskGraphNode {
                    id: "n3".into(),
                    node_kind: NodeKind::Reflection,
                    task_type: String::new(),
                    capability: String::new(),
                    estimated_cost_cents: 0,
                    content: "Reflect".into(),
                    depends_on: vec!["n2".into()],
                    manifest_node_id: None,
                },
            ],
        }
    }

    #[test]
    fn execution_levels_linear_chain() {
        let g = sample_graph();
        let levels = g.execution_levels().unwrap();
        assert_eq!(levels.len(), 3);
        assert_eq!(levels[0], vec!["n1"]);
        assert_eq!(levels[1], vec!["n2"]);
        assert_eq!(levels[2], vec!["n3"]);
    }

    #[test]
    fn execution_levels_detects_cycle() {
        let g = TaskGraph {
            nodes: vec![
                TaskGraphNode {
                    id: "a".into(),
                    node_kind: NodeKind::Executor,
                    task_type: "note".into(),
                    capability: String::new(),
                    estimated_cost_cents: 0,
                    content: "a".into(),
                    depends_on: vec!["b".into()], // cycle: a→b→a
                    manifest_node_id: None,
                },
                TaskGraphNode {
                    id: "b".into(),
                    node_kind: NodeKind::Executor,
                    task_type: "note".into(),
                    capability: String::new(),
                    estimated_cost_cents: 0,
                    content: "b".into(),
                    depends_on: vec!["a".into()],
                    manifest_node_id: None,
                },
            ],
        };
        assert!(g.execution_levels().is_err());
    }

    #[test]
    fn execution_levels_parallel_fan_out() {
        let g = TaskGraph {
            nodes: vec![
                TaskGraphNode {
                    id: "root".into(),
                    node_kind: NodeKind::GoalIntake,
                    task_type: String::new(),
                    capability: String::new(),
                    estimated_cost_cents: 0,
                    content: "root".into(),
                    depends_on: vec![],
                    manifest_node_id: None,
                },
                TaskGraphNode {
                    id: "a".into(),
                    node_kind: NodeKind::Executor,
                    task_type: "note".into(),
                    capability: String::new(),
                    estimated_cost_cents: 0,
                    content: "a".into(),
                    depends_on: vec!["root".into()],
                    manifest_node_id: None,
                },
                TaskGraphNode {
                    id: "b".into(),
                    node_kind: NodeKind::Executor,
                    task_type: "web_research".into(),
                    capability: String::new(),
                    estimated_cost_cents: 0,
                    content: "b".into(),
                    depends_on: vec!["root".into()],
                    manifest_node_id: None,
                },
                TaskGraphNode {
                    id: "merge".into(),
                    node_kind: NodeKind::Reflection,
                    task_type: String::new(),
                    capability: String::new(),
                    estimated_cost_cents: 0,
                    content: "merge".into(),
                    depends_on: vec!["a".into(), "b".into()],
                    manifest_node_id: None,
                },
            ],
        };
        let levels = g.execution_levels().unwrap();
        // Level 0: root; level 1: a and b (parallel); level 2: merge
        assert_eq!(levels.len(), 3);
        assert_eq!(levels[0], vec!["root"]);
        let mut l1 = levels[1].clone();
        l1.sort();
        assert_eq!(l1, vec!["a", "b"]);
        assert_eq!(levels[2], vec!["merge"]);
    }

    #[test]
    fn policy_graph_blocks_disallowed_task_type() {
        let g = TaskGraph {
            nodes: vec![TaskGraphNode {
                id: "n1".into(),
                node_kind: NodeKind::Executor,
                task_type: "shell_execute".into(), // not allowed
                capability: String::new(),
                estimated_cost_cents: 0,
                content: "run shell".into(),
                depends_on: vec![],
                manifest_node_id: None,
            }],
        };
        let result = PolicyGraph::validate(&g, &[]);
        assert!(result.is_err());
        assert!(result.unwrap_err()[0].contains("ALLOWED_TASK_TYPES"));
    }

    #[test]
    fn policy_graph_passes_valid_graph() {
        let g = sample_graph();
        assert!(PolicyGraph::validate(&g, &[]).is_ok());
    }

    // ── NodeKind ──────────────────────────────────────────────────────────────

    #[test]
    fn node_kind_as_str_round_trips() {
        assert_eq!(NodeKind::GoalIntake.as_str(), "goal_intake");
        assert_eq!(NodeKind::CustomNodeBuilder.as_str(), "custom_node_builder");
    }

    #[test]
    fn node_kind_serializes_to_snake_case() {
        let json = serde_json::to_string(&NodeKind::CapabilityRouter).unwrap();
        assert_eq!(json, "\"capability_router\"");
    }

    // ── executor_count (item 23 threshold) ───────────────────────────────────

    #[test]
    fn executor_count_returns_correct_value() {
        let g = sample_graph();
        assert_eq!(g.executor_count(), 1); // only n2 is Executor

        let child = build_child_graph_for_plan(&TaskGraphNode {
            id: "p".into(),
            node_kind: NodeKind::Plan,
            task_type: String::new(),
            capability: String::new(),
            estimated_cost_cents: 0,
            content: "plan something".into(),
            depends_on: vec![],
            manifest_node_id: None,
        });
        assert!(child.executor_count() >= 3); // threshold for child supervisor
    }

    // ── IrBranchScheduler / Step 7 ───────────────────────────────────────────

    fn simple_ir(
        group_id: &str,
        member_ids: Vec<&str>,
        max_concurrency: u64,
        join_strategy: &str,
        merge_barrier: Option<&str>,
    ) -> serde_json::Value {
        let manifest_node_ids: Vec<serde_json::Value> = member_ids
            .iter()
            .map(|id| serde_json::Value::String(id.to_string()))
            .collect();
        let mut group = serde_json::json!({
            "parallel_group_id": group_id,
            "manifest_node_ids": manifest_node_ids,
            "max_concurrency": max_concurrency,
            "join_strategy": join_strategy,
        });
        if let Some(mb) = merge_barrier {
            group.as_object_mut().unwrap().insert(
                "merge_barrier_manifest_node_id".to_string(),
                serde_json::Value::String(mb.to_string()),
            );
        }
        // Build lightweight manifests with estimated_cost_cents = 5 each.
        let manifests: Vec<serde_json::Value> = member_ids
            .iter()
            .map(|id| serde_json::json!({ "node_id": id, "estimated_cost_cents": 5 }))
            .collect();
        serde_json::json!({ "parallel_groups": [group], "manifests": manifests })
    }

    #[tokio::test]
    async fn scheduler_all_required_succeeds_when_all_branches_complete() {
        let ir = simple_ir("grp1", vec!["a", "b"], 2, "all_required", Some("merge"));
        let result = IrBranchScheduler::new(ir)
            .run(|id, cost| async move {
                BranchOutcome::Completed {
                    manifest_node_id: id,
                    output: "ok".to_string(),
                    cost_cents: cost,
                }
            })
            .await;
        assert!(result.all_groups_succeeded);
        assert_eq!(result.group_results[0].branch_outcomes.len(), 2);
        assert_eq!(
            result.group_results[0]
                .merge_barrier_manifest_node_id
                .as_deref(),
            Some("merge")
        );
        assert_eq!(result.total_cost_cents, 10); // 5c × 2 branches
    }

    #[tokio::test]
    async fn scheduler_all_required_fails_on_branch_failure() {
        let ir = simple_ir("grp1", vec!["a", "b"], 2, "all_required", None);
        let result = IrBranchScheduler::new(ir)
            .run(|id, cost| async move {
                if id == "a" {
                    BranchOutcome::Failed {
                        manifest_node_id: id,
                        error: "timeout".to_string(),
                        cost_cents: cost,
                    }
                } else {
                    BranchOutcome::Completed {
                        manifest_node_id: id,
                        output: "ok".to_string(),
                        cost_cents: cost,
                    }
                }
            })
            .await;
        assert!(!result.all_groups_succeeded);
        let reason = result.group_results[0]
            .failure_reason
            .as_deref()
            .unwrap_or("");
        assert!(
            reason.contains("all_required"),
            "expected all_required in: {reason}"
        );
        assert!(reason.contains("timeout"), "expected timeout in: {reason}");
    }

    #[tokio::test]
    async fn scheduler_budget_pre_flight_rejects_over_limit_branch() {
        // Set branch_budget_cents = 3; manifests cost 5 each → all rejected pre-flight.
        let ir = simple_ir("grp1", vec!["a", "b"], 2, "all_required", None);
        let result = IrBranchScheduler::new(ir)
            .with_branch_budget(3)
            .run(|id, cost| async move {
                BranchOutcome::Completed {
                    manifest_node_id: id,
                    output: "ok".to_string(),
                    cost_cents: cost,
                }
            })
            .await;
        assert!(!result.all_groups_succeeded);
        let outcomes = &result.group_results[0].branch_outcomes;
        assert_eq!(outcomes.len(), 2);
        for o in outcomes {
            assert!(
                !o.is_success(),
                "expected pre-flight failure for {}",
                o.manifest_node_id()
            );
        }
    }

    #[tokio::test]
    async fn scheduler_respects_max_branches_per_group_cap() {
        use std::sync::Arc as StdArc;
        use std::sync::atomic::{AtomicUsize, Ordering};

        // Track peak concurrency with an atomic counter.
        let peak = StdArc::new(AtomicUsize::new(0));
        let in_flight = StdArc::new(AtomicUsize::new(0));

        // 4 branches, IR says max_concurrency = 4, but scheduler caps at 2.
        let ir = simple_ir("grp1", vec!["a", "b", "c", "d"], 4, "all_required", None);
        let peak_clone = peak.clone();
        let in_flight_clone = in_flight.clone();

        let result = IrBranchScheduler::new(ir)
            .with_max_branches(2) // cap at 2
            .run(move |id, cost| {
                let p = peak_clone.clone();
                let inf = in_flight_clone.clone();
                async move {
                    let current = inf.fetch_add(1, Ordering::SeqCst) + 1;
                    // Record peak in-flight.
                    let mut recorded = p.load(Ordering::SeqCst);
                    while current > recorded {
                        match p.compare_exchange(
                            recorded,
                            current,
                            Ordering::SeqCst,
                            Ordering::SeqCst,
                        ) {
                            Ok(_) => break,
                            Err(v) => recorded = v,
                        }
                    }
                    // Simulate a small async yield to give other tasks a chance to start.
                    tokio::task::yield_now().await;
                    inf.fetch_sub(1, Ordering::SeqCst);
                    BranchOutcome::Completed {
                        manifest_node_id: id,
                        output: "ok".to_string(),
                        cost_cents: cost,
                    }
                }
            })
            .await;

        assert!(result.all_groups_succeeded);
        // Peak concurrency must not exceed the cap of 2.
        assert!(
            peak.load(Ordering::SeqCst) <= 2,
            "peak concurrency {} exceeded cap of 2",
            peak.load(Ordering::SeqCst)
        );
    }

    #[tokio::test]
    async fn scheduler_first_wins_succeeds_on_any_success() {
        let ir = simple_ir("grp1", vec!["fail1", "ok1", "fail2"], 3, "first_wins", None);
        let result = IrBranchScheduler::new(ir)
            .run(|id, cost| async move {
                if id.starts_with("ok") {
                    BranchOutcome::Completed {
                        manifest_node_id: id,
                        output: "done".to_string(),
                        cost_cents: cost,
                    }
                } else {
                    BranchOutcome::Failed {
                        manifest_node_id: id,
                        error: "err".to_string(),
                        cost_cents: cost,
                    }
                }
            })
            .await;
        assert!(
            result.all_groups_succeeded,
            "first_wins should succeed if at least one branch ok"
        );
        assert_eq!(result.group_results[0].join_strategy, "first_wins");
    }

    // ── task_graph_from_ir ────────────────────────────────────────────────────

    #[test]
    fn task_graph_from_ir_converts_linear_manifests() {
        let ir = serde_json::json!({
            "manifests": [
                {"node_id": "m1", "runtime_kind": "goal_intake", "estimated_cost_cents": 0,
                 "metadata": {"label": "Intake"}},
                {"node_id": "m2", "runtime_kind": "executor", "estimated_cost_cents": 10,
                 "capability_id": "write_note",
                 "policy": {"task_type": "note"},
                 "metadata": {"label": "Write"}}
            ],
            "edges": []
        });
        let graph = task_graph_from_ir(&ir).expect("should parse");
        assert_eq!(graph.nodes.len(), 2);
        let n1 = &graph.nodes[0];
        assert_eq!(n1.id, "m1");
        assert!(matches!(n1.node_kind, NodeKind::GoalIntake));
        let n2 = &graph.nodes[1];
        assert_eq!(n2.id, "m2");
        assert_eq!(n2.task_type, "note");
        assert_eq!(n2.estimated_cost_cents, 10);
    }

    #[test]
    fn task_graph_from_ir_wires_depends_on_from_edges() {
        let ir = serde_json::json!({
            "manifests": [
                {"node_id": "a", "runtime_kind": "plan", "metadata": {}},
                {"node_id": "b", "runtime_kind": "executor", "metadata": {}}
            ],
            "edges": [
                {"from_manifest_node_id": "a", "to_manifest_node_id": "b"}
            ]
        });
        let graph = task_graph_from_ir(&ir).expect("should parse");
        let b = graph.nodes.iter().find(|n| n.id == "b").unwrap();
        assert_eq!(b.depends_on, vec!["a".to_string()]);
        let a = graph.nodes.iter().find(|n| n.id == "a").unwrap();
        assert!(a.depends_on.is_empty());
    }

    #[test]
    fn task_graph_from_ir_fails_without_manifests_key() {
        let ir = serde_json::json!({"edges": []});
        let result = task_graph_from_ir(&ir);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("manifests"));
    }

    // ── SupervisorResult serialization ───────────────────────────────────────

    #[test]
    fn supervisor_result_serializes() {
        let r = SupervisorResult {
            run_id: "run1".into(),
            objective: "do something".into(),
            depth: 0,
            node_count: 3,
            success_count: 2,
            node_results: vec![],
            audit_hash: "abc123".into(),
        };
        let j = serde_json::to_string(&r).unwrap();
        assert!(j.contains("audit_hash"));
        assert!(j.contains("depth"));
    }
}
