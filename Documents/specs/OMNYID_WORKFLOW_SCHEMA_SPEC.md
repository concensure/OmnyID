# OmnyID Workflow Schema Specification

## Purpose

This document defines the first shared contract for the visual workflow builder.

It complements:

- [OMNYID_VISUAL_WORKFLOW_BUILDER_PLAN.md](/C:/Users/joes/Desktop/projects/Agenton/Documents/specs/OMNYID_VISUAL_WORKFLOW_BUILDER_PLAN.md)
- [OMNYID_SUBAGENT_TEMPLATE_SPEC.md](/C:/Users/joes/Desktop/projects/Agenton/Documents/specs/OMNYID_SUBAGENT_TEMPLATE_SPEC.md)
- [OMNYID_A2UI_V1_SPEC.md](/C:/Users/joes/Desktop/projects/Agenton/Documents/specs/OMNYID_A2UI_V1_SPEC.md)
- [OMNYID_CANONICAL_MESSAGE_SHAPES.md](/C:/Users/joes/Desktop/projects/Agenton/Documents/specs/OMNYID_CANONICAL_MESSAGE_SHAPES.md)

The executable TypeScript schema for this spec lives in:

- [workflows.ts](/C:/Users/joes/Desktop/projects/Agenton/typescript-sdk/src/workflows.ts)

## Layering

The workflow builder uses three layers:

1. `WorkflowGraph`
This is the user-editable visual graph.

2. `WorkflowIR`
This is the compiled execution plan.

3. `RuntimeNodeManifest`
This is the per-node runtime contract executed by workers.

This now sits alongside a reusable template layer:

4. `SubagentTemplate`
This is the reusable orchestration skeleton used by presets and future NL workflow generation.

The rule is strict:

- never execute directly from `WorkflowGraph`
- always validate and compile into `WorkflowIR`
- always run from `RuntimeNodeManifest` records

## WorkflowGraph

`WorkflowGraph` is the visual representation shown in the builder.

Core fields:

- `workflow_id`
- `title`
- `description`
- `status`
- `environment`
- `owner_user_id`
- `root_node_ids`
- `nodes`
- `edges`
- `presets`
- `optimization_mode`

### Primitive node kinds

Allowed primitive graph node kinds:

- `trigger`
- `condition`
- `transform`
- `tool`
- `agent`
- `delegation`
- `policy`
- `approval`
- `merge`
- `termination`

Each graph node must include:

- stable `id`
- `kind`
- `label`
- canvas `position`
- `inputs`
- `outputs`
- per-node `policy`
- optional `prompt`
- `config`

## RuntimeNodeManifest

`RuntimeNodeManifest` is the hidden runtime contract used by worker nodes.

Core fields:

- `manifest_version`
- `node_id`
- `runtime_kind`
- `source_graph_node_id`
- `objective`
- `input_schema`
- `output_schema`
- `policy`
- `memory_scope`
- `model_assignment`
- `retry_policy`

### Hidden runtime kinds

Initial hidden runtime node kinds:

- `goal_intake`
- `context`
- `ambiguity`
- `plan`
- `policy_runtime`
- `model_broker`
- `capability_router`
- `executor`
- `reflection`
- `approval_runtime`
- `merge_runtime`
- `termination_runtime`

These are not the main visual vocabulary for non-technical users.

## WorkflowIR

`WorkflowIR` is the deployable compiled output of the builder.

It contains:

- `entry_manifest_node_ids`
- `manifests`
- `edges`
- `policy_snapshot`
- deployment metadata

`WorkflowIR` should be:

- deterministic
- replayable
- policy-frozen
- versioned

## Preset Nodes

Preset nodes are the user-friendly building blocks that appear first in the product.

Initial preset kinds:

- `email_guardian`
- `calendar_coordinator`
- `receipt_tracker`
- `study_planner`
- `research_assistant`
- `finance_guardian`
- `travel_booker`
- `content_publisher`

A preset node is not a separate runtime type.

It is a controlled expansion over graph primitives plus hidden runtime manifests.

It should also be backed by a `SubagentTemplate`, not by bespoke graph assembly.

## Subagent Templates

The workflow schema now includes a template layer for reusable orchestration skeletons.

Initial template ids:

- `linear_worker`
- `branching_worker`
- `research_loop`
- `action_guarded`

Each template defines:

- slot bindings
- default primitive/runtime mappings
- template-level efficiency hints
- expansion rules for graph and IR generation

`WorkflowGraph` may optionally carry:

- `template_id`
- `template_version`
- `template_bindings`

This keeps hand-authored primitive workflows valid while allowing presets and future NL generation to target templates first.

## Node Policy Contract

Every node carries a policy block with:

- `mask`
- `approval_mode`
- `allowed_tools`
- `allowed_capabilities`
- `max_steps`
- `max_cost_cents`
- `outbound_allowlist`

This policy must be checked:

- when graph is built
- when graph is compiled
- before node execution

## Model Contract

Every runtime manifest carries a model assignment.

Initial fields:

- `strategy`
- `provider`
- `model`
- `max_input_tokens`
- `max_output_tokens`

This lets OmnyID use a `ModelBrokerNode` to choose the cheapest acceptable model per node instead of forcing the entire workflow through one model.

## Saved Workflow Record

Initial persistence shape:

- `workflow_id`
- `owner_user_id`
- `title`
- `description`
- `favorite`
- `preset_kinds`
- `graph`
- `latest_ir`
- `created_at`
- `updated_at`
- `archived_at`

This should eventually back the dedicated `Workflows` navigation area.

## Builder UX Implications

The schema is designed for two editing modes:

### Default mode

The user edits:

- preset nodes
- labels
- prompts
- parameters
- approvals
- policy knobs

### Advanced mode

The user can inspect and modify:

- primitive graph nodes
- edges
- per-node prompt blocks
- model settings
- execution constraints

## First Implementation Rule

Before building a full canvas UI, all services should share the same schema definitions from:

- [workflows.ts](/C:/Users/joes/Desktop/projects/Agenton/typescript-sdk/src/workflows.ts)

That file is the first source of truth for:

- frontend graph editing
- backend validation
- standalone workflow-builder compatibility
- future AFP node runtime integration
