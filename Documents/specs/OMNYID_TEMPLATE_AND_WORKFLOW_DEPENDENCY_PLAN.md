# OmnyID Template And Workflow Dependency Plan

## Purpose

This document decides the best implementation order between:

- the current visual workflow builder work
- the new subagent template layer
- the efficiency recommendations such as bounded parallelism, model routing, context slicing, caching, and deterministic pruning
- the broader MasterAgent upgrade plan already tracked in:
  - `C:\Users\ozans\.claude\plans\elegant-inventing-goose.md`

It is designed to make the two planning tracks work together cleanly.

## Decision Summary

The best dependency-ordered course is:

1. continue the current workflow-builder track just enough to introduce the template layer
2. implement the subagent template foundation before the natural-language workflow generator
3. add the highest-leverage low-token efficiency improvements directly into the template/runtime layer
4. introduce bounded parallel execution only after the template and IR layers can express it cleanly
5. then return to the natural-language `describe -> generate -> edit` flow
6. after that, reconnect the result back into the broader MasterAgent plan

### Why this is the right order

If we build the natural-language workflow generator now, before templates exist, it will generate directly against:

- primitive nodes
- ad hoc preset starter graphs
- inconsistent orchestration patterns

That would create rework later when templates arrive.

If we try to implement all expanded suggestions first, including full parallel runtime, broad caching, and advanced optimization policies, we risk:

- bloating the architecture before the authoring model is stable
- introducing runtime complexity before the template contract exists
- slowing down the most important product milestone: editable generated workflows

So the correct move is not:

- `continue current builder exactly as-is and postpone templates`

and not:

- `stop everything and build the full advanced runtime first`

It is:

- `finish the missing template layer now, then continue into NL workflow generation, then extend execution sophistication under that stable contract`

## Guiding Rule

The system should evolve in this dependency chain:

1. primitive nodes
2. subagent templates
3. human-friendly preset nodes
4. natural-language workflow generation
5. bounded parallel and advanced runtime optimizations
6. full workflow-supervisor integration with the broader MasterAgent track

This keeps the builder, runtime, and protocol aligned.

## Relationship To Existing Plans

### Current workflow-builder plan

- [OMNYID_VISUAL_WORKFLOW_BUILDER_PLAN.md](C:/Users/ozans/Desktop/projects/Agenton/Documents/specs/OMNYID_VISUAL_WORKFLOW_BUILDER_PLAN.md)

This remains the primary product plan for the builder UX, graph model, persistence, compile flow, deployment flow, and workflow page.

### Broader MasterAgent plan

- `C:\Users\ozans\.claude\plans\elegant-inventing-goose.md`

This remains the broader execution/runtime plan for:

- executor capability maturity
- cost estimation
- decision surfaces
- generative-card lifecycle
- runner and orchestration parity

### Integration rule

The workflow-builder plan owns:

- graph authoring
- template authoring
- workflow generation
- workflow deployment and replay

The MasterAgent plan owns:

- execution substrate maturity
- real executor capability depth
- runtime and orchestration parity
- cost/decision/progress semantics

The template layer is the bridge between the two.

## Recommended Dependency Order

## Phase A: Finish The Missing Authoring Abstraction

### Goal

Introduce a reusable subagent template layer before building the natural-language generator.

### Deliverables

1. `SubagentTemplate` schema
2. template slot model
3. template registry
4. template-to-primitive expansion rules
5. template-to-runtime-IR compilation rules
6. mapping of the 8 human-facing presets onto templates

### Why first

This is the missing authoring abstraction. Without it:

- presets stay semi-bespoke
- the NL workflow generator has no stable target
- efficiency logic gets duplicated per preset

### Recommended initial template set

1. `LinearWorkerTemplate`
2. `BranchingWorkerTemplate`
3. `ResearchLoopTemplate`
4. `ActionGuardedTemplate`

### Slot model

Each template should define named slots, for example:

- `intake_slot`
- `context_slot`
- `planner_slot`
- `gather_slot`
- `check_slot`
- `approval_slot`
- `merge_slot`
- `finalize_slot`

Each slot is filled by primitive graph nodes plus policy/model metadata.

## Phase B: Add The Highest-Leverage Efficiency Features Under Templates

### Goal

Improve efficiency without waiting for fully parallel runtime.

### Implement immediately after templates

1. template-level short prompts
2. model routing per template slot
3. context slicing per node
4. deterministic-before-agentic heuristics
5. strong node result schemas
6. policy-driven pruning
7. early stop and confidence thresholds
8. branch budgets
9. cached intermediate artifacts
10. reusable capability bundles
11. micro-planners for branch/tool/model decisions

### Why these come before parallel runtime

These give major efficiency wins with much lower complexity than true concurrent execution.

They reduce:

- token waste
- repeated orchestration prompts
- unnecessary branch execution
- unnecessary deep reasoning

### Concrete implementation targets

#### 1. Template prompt inheritance

Move common orchestration instructions into the template contract, so preset nodes and generated workflows do not repeat them.

#### 2. ModelBroker integration by slot

Assign model classes by slot, for example:

- routing/classification: cheap
- synthesis: medium
- hard ambiguity: premium

#### 3. Context packets

Every node should receive a minimal structured context packet, not full thread history.

#### 4. Cacheable artifacts

Support cache keys for:

- search result sets
- extracted document structure
- merged evidence sets
- validated policies
- compiled IR

#### 5. Deterministic heuristics

Keep hardcoded low-token rules for:

- approval nodes
- policy block behavior
- route-label selection
- retry gating
- branch pruning

## Phase C: Make Preset Nodes Template-Backed Instead Of Bespoke

### Goal

Refactor the current starter subgraphs so the 8 human-facing presets are explicitly instances of templates.

### Deliverables

For each of:

1. Email Guardian
2. Calendar Coordinator
3. Receipt Tracker
4. Study Planner
5. Research Assistant
6. Finance Guardian
7. Travel Booker
8. Content Publisher

define:

- template id
- slot bindings
- node configs
- policy bundle
- model hints
- branch defaults
- approval defaults

### Why now

This prevents the current preset starter graphs from drifting into manual special cases.

## Phase D: Add Natural-Language Workflow Generation

### Goal

Resume the next builder milestone:

- connect preset starter graphs to a natural-language `describe workflow` builder flow

### Important dependency note

This should happen after templates exist, because the NL generator should target:

- template ids
- slot bindings
- graph generation rules

not arbitrary primitive compositions.

### Flow

1. user describes workflow
2. builder classifies intent
3. builder selects template
4. builder fills template slots
5. builder expands to primitive graph
6. user edits in the workflow page
7. user validates, compiles, deploys

### Output rule

The model should output structured JSON only:

- template id
- chosen preset category
- slot assignments
- graph metadata

then the app expands that into a workflow graph

## Phase E: Introduce Parallel-Ready IR

### Goal

Prepare the system for multiple subagents in parallel without yet requiring a fully general concurrent runtime.

### Deliverables

1. parallel-capable IR annotations
2. `parallel_group_id`
3. `max_concurrency`
4. `join_strategy`
5. `branch_id`
6. merge barrier semantics

### Where to use first

Only in templates that benefit clearly:

1. `ResearchLoopTemplate`
2. `ActionGuardedTemplate` compare paths
3. option-comparison and multi-source evidence gathering

### Why after NL generation

The product needs editable generated workflows before it needs full concurrency.

Parallel execution is powerful, but it is not the first dependency for the builder UX.

## Phase F: Bounded Parallel Runtime

### Goal

Let the workflow supervisor or future node runtime execute multiple ready branches concurrently.

### Constraints

- bounded fan-out only
- merge barrier required
- branch-level policy checks
- branch-level budget enforcement
- branch-level cancellation and failure rules

### Initial rollout

Free tier:

- max 2 parallel branches

Paid tier:

- configurable
- likely 4 to 8 initial cap

### Best first use cases

1. research fan-out
2. product comparison fan-out
3. multi-document extraction fan-out
4. safe validation/preparation work in parallel with non-external steps

## Phase G: Reconnect To The Broader MasterAgent Plan

### Goal

Once templates, NL generation, and bounded parallel IR exist, return to the broader MasterAgent plan and continue execution/runtime maturity from a better abstraction layer.

### What should be resumed there

1. executor depth and reliability
2. runner integration
3. real node runtime parity
4. richer execution states
5. generative-card orchestration parity
6. failure and reflection semantics
7. policy and approval parity

### New role of MasterAgent

At that point, the `MasterAgent` should evolve into a `WorkflowSupervisor` that:

- selects templates
- expands workflows
- chooses models
- enforces budget/policy
- schedules branches
- falls back to legacy behavior only when required

## Detailed Ordered Roadmap

## Step 1: Template foundation

Implement:

1. template schema
2. slot schema
3. template registry
4. preset-to-template mapping

## Step 2: Efficiency baseline under templates

Implement:

1. prompt inheritance
2. model routing by slot
3. context slicing
4. node result schemas
5. deterministic heuristics
6. policy pruning
7. early-stop thresholds

## Step 3: Template-backed preset nodes

Implement:

1. convert all 8 presets to template-backed definitions
2. remove preset drift from bespoke graph assembly
3. keep current visual editor compatible

## Step 4: Natural-language builder flow

Implement:

1. describe-workflow input
2. structured template selection output
3. slot filling
4. graph expansion
5. editable canvas result

This explicitly resumes the previously identified next step.

## Step 5: Cache and capability bundles

**Milestone recorded (2026-04-01):**

Implemented:

1. `TemplateCachePolicySchema` already existed in `workflows.ts`; now surfaced in `RuntimeNodeManifestSchema` as an optional `cache_policy` field
2. `WorkflowIRCapabilityBundleSchema` added to `workflows.ts` — groups cacheable tool nodes by capability_id
3. IR compiler (`compile_workflow_graph_to_ir` in `server.rs`) reads `template_bindings`, resolves slot efficiency policy via `workflow_builder_slot_efficiency_policy`, and injects `cache_policy` + `capability_bundle_id` onto matching manifests
4. `capability_bundles` array emitted in compiled IR — groups manifests sharing a bundle_id with artifact_family, cache_policy, and connector metadata

## Step 6: Parallel-ready IR

**Milestone recorded (2026-04-01):**

Implemented:

1. `WorkflowIRParallelGroupSchema` added to `workflows.ts` with `parallel_group_id`, `manifest_node_ids`, `max_concurrency`, `join_strategy`, `merge_barrier_manifest_node_id`
2. `parallel_group_id` and `max_concurrency` added to `RuntimeNodeManifestSchema` (optional)
3. `branch_id` and `join_strategy` added to `WorkflowIrEdgeSchema` (optional)
4. IR compiler emits `parallel_groups` array — one entry per unique `parallel_group_id` found in manifests; identifies merge barrier for `research_loop` gather→merge patterns
5. Edges from parallel-group nodes to the merge barrier are annotated with `branch_id` and `join_strategy: all_required`
6. Two new unit tests: `compile_workflow_graph_to_ir_emits_parallel_group_for_research_loop_gather_slot` and `compile_workflow_graph_to_ir_emits_capability_bundle_for_cache_enabled_slot` — both pass clean; full 300-test suite green

## Step 7: Bounded parallel scheduler

**Milestone recorded (2026-04-01):**

Implemented:

1. `BranchOutcome` enum — `Completed | Failed | Cancelled` with `manifest_node_id`, `output/error`, `cost_cents`
2. `ParallelGroupResult` — per-group result: branch outcomes, merge barrier, join strategy, total cost, succeeded flag, failure reason
3. `SchedulerRunResult` — top-level result: all group results, total cost, `all_groups_succeeded`
4. `IrBranchScheduler` — reads `parallel_groups` from compiled IR JSON; per-group semaphore bounded by `min(group.max_concurrency, self.max_branches_per_group)` (free-tier default = 2); accepts a generic `execute_fn` async closure for runtime integration
5. Ready queue: pre-flight budget check separates over-limit branches (instant `Failed`) from the ready queue; ready branches are dispatched to `tokio::spawn` under the semaphore
6. Bounded concurrency: per-group `Arc<Semaphore>` with `effective_limit = min(pg.max_concurrency, self.max_branches_per_group)`
7. Branch budgets: `with_branch_budget(cents)` — any branch whose `estimated_cost_cents` exceeds the cap is rejected before scheduling with a descriptive error
8. Failure propagation: `all_required` fails the group and records all failure reasons; `first_wins` passes if any branch succeeded; `any_threshold` requires majority (> half)
9. Merge synchronisation: all branch `JoinHandle`s are awaited before the merge barrier is released; `merge_barrier_manifest_node_id` is propagated into `ParallelGroupResult`
10. 5 new unit tests added: `scheduler_all_required_succeeds_when_all_branches_complete`, `scheduler_all_required_fails_on_branch_failure`, `scheduler_budget_pre_flight_rejects_over_limit_branch`, `scheduler_respects_max_branches_per_group_cap`, `scheduler_first_wins_succeeds_on_any_success` — all pass; full 305-test suite green

## Step 8: Resume broader MasterAgent/runtime track

**Milestone recorded (2026-04-01):**

Implemented:

1. `task_graph_from_ir(ir: &serde_json::Value) -> Result<TaskGraph, String>` — free function in `workflow_supervisor.rs`; maps IR manifest `node_id` → `TaskGraphNode.id`, `runtime_kind` → `NodeKind`, `policy.task_type` or `execution_path` → `task_type`; IR edges wired into `depends_on` lists
2. `WorkflowSupervisor::run_from_ir()` — public `Box::pin` entry point; accepts compiled IR JSON + runtime params; no LLM planning step
3. `run_from_ir_inner()` — calls `task_graph_from_ir` → `PolicyGraph::validate` → `execution_levels()`; partitions each level into `parallel_ids` (routed through `IrBranchScheduler`) and `sequential_ids` (semaphore-gated `tokio::spawn`, identical to `run_inner`); converts all outcomes to `NodeResult`; returns `SupervisorResult { objective: "workflow_ir_execution", ... }`
4. `IrBranchScheduler` closure inside `run_from_ir_inner` builds synthetic `TaskGraphNode`, issues delegation key via `generate_delegated_key`, calls `spawner_call_sync`, converts `NodeResult` → `BranchOutcome`, updates shared `prior_results` map on success
5. 3 new unit tests: `task_graph_from_ir_converts_linear_manifests`, `task_graph_from_ir_wires_depends_on_from_edges`, `task_graph_from_ir_fails_without_manifests_key` — all pass; full 308-test suite green

All items from the broader MasterAgent plan (`elegant-inventing-goose.md`) were found already implemented in `python-sdk/afp/` (executor plugins, cost engine, decision framework, generative card flow). The `run_from_ir` bridge is the integration point that connects the IR compiler output to the bounded scheduler.

## What Should Not Be Done Yet

Do not do these before templates:

1. full natural-language graph generation directly into primitives
2. broad true parallel runtime everywhere
3. many bespoke high-level preset runtimes
4. large-scale custom-node synthesis as a default path

These are likely to create rework.

## Efficiency Recommendations Included In This Plan

This plan includes the previously recommended improvements:

1. subagent templates
2. bounded parallelism
3. model routing
4. context slicing
5. deterministic-before-agentic execution
6. cached intermediate artifacts
7. early stop / confidence thresholds
8. strong result schemas
9. branch budgets
10. capability bundles
11. micro-planners
12. policy-driven pruning
13. reusable slot-based orchestration

## Explicit Resume Marker

After the template layer is implemented, the next product milestone to resume is:

- connect preset starter graphs to a natural-language `describe workflow` builder flow, so the user can start from intent text and receive one of these editable graph skeletons instead of always building from the palette manually

This should happen before the full bounded parallel runtime.

## Success Criteria

This dependency plan is successful if:

1. templates become the stable authoring abstraction
2. presets are defined through templates, not bespoke graphs
3. NL generation targets templates, not raw graph primitives
4. the builder stays low-token and explainable
5. parallel execution arrives only after graph and IR semantics are stable
6. the broader MasterAgent plan resumes on top of a stronger workflow abstraction instead of competing with it
