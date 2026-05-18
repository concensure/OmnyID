# OmnyID Subagent Template Specification

## Purpose

This document defines the missing template layer that sits between:

- primitive workflow graph nodes
- hidden runtime node manifests
- human-friendly preset nodes

It complements:

- [OMNYID_VISUAL_WORKFLOW_BUILDER_PLAN.md](/C:/Users/ozans/Desktop/projects/Agenton/Documents/specs/OMNYID_VISUAL_WORKFLOW_BUILDER_PLAN.md)
- [OMNYID_TEMPLATE_AND_WORKFLOW_DEPENDENCY_PLAN.md](/C:/Users/ozans/Desktop/projects/Agenton/Documents/specs/OMNYID_TEMPLATE_AND_WORKFLOW_DEPENDENCY_PLAN.md)
- [OMNYID_WORKFLOW_SCHEMA_SPEC.md](/C:/Users/ozans/Desktop/projects/Agenton/Documents/specs/OMNYID_WORKFLOW_SCHEMA_SPEC.md)

The executable schema lives in:

- [workflows.ts](/C:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/workflows.ts)

## Why Templates Exist

Templates are the reusable orchestration skeletons that prevent the system from becoming:

- a collection of bespoke high-level preset agents
- a direct NL-to-primitive graph generator with no stable abstraction
- a prompt-heavy orchestration model that repeats the same reasoning boilerplate

Templates should:

- reduce token waste
- improve development speed
- keep preset behavior predictable
- make later bounded parallel execution cleaner

## Layering

The intended authoring and execution stack is:

1. primitive graph nodes
2. subagent templates
3. human-facing preset nodes
4. natural-language workflow generation
5. compiled runtime IR

Templates are not a separate runtime protocol.

They are a structured expansion and coordination layer over the existing workflow graph and runtime manifest model.

## Initial Template Set

Initial supported template ids:

1. `linear_worker`
2. `branching_worker`
3. `research_loop`
4. `action_guarded`

These templates should cover the first product needs without creating a large template taxonomy too early.

## Template Shape

Each `SubagentTemplate` includes:

- `template_id`
- `version`
- `label`
- `description`
- `category`
- `default_optimization_mode`
- `allowed_preset_kinds`
- `slot_bindings`
- `expansion_rules`
- `metadata`

## Slot Model

Templates use named slots instead of fixed child nodes.

Initial slot names:

- `intake_slot`
- `context_slot`
- `planner_slot`
- `gather_slot`
- `check_slot`
- `approval_slot`
- `merge_slot`
- `finalize_slot`

Each slot binding defines:

- whether the slot is required
- which primitive kinds are allowed there
- the default primitive kind
- the default runtime kind
- default config, policy, and prompt blocks
- an optional efficiency policy

This lets different presets use the same orchestration skeleton with different downstream combinations.

## Efficiency Policies In Templates

Templates are the right place to define compact reusable efficiency rules.

Initial template-level efficiency fields include:

- prompt inheritance
- model hints
- context slicing
- cache policy
- early-stop confidence
- deterministic pruning
- optional future parallel group metadata

These are meant to reduce token and coordination cost before full parallel runtime is introduced.

## Expansion Rules

Each template defines how it expands into graph/runtime form.

Initial rules include:

- `root_slot_names`
- `terminal_slot_names`
- `supports_parallel_fanout`
- `requires_merge_for_parallel`

These rules make later IR compilation and bounded fan-out semantics much cleaner.

## Mapping To Human-Friendly Presets

The first 8 user-facing presets should map to templates rather than bespoke graphs.

Recommended initial mapping:

### `email_guardian`

- template: `action_guarded`

### `calendar_coordinator`

- template: `action_guarded`

### `receipt_tracker`

- template: `linear_worker`

### `study_planner`

- template: `branching_worker`

### `research_assistant`

- template: `research_loop`

### `finance_guardian`

- template: `branching_worker`

### `travel_booker`

- template: `action_guarded`

### `content_publisher`

- template: `action_guarded`

This keeps the user-facing taxonomy small while letting the internal compositions differ.

## Workflow Graph Relationship

Templates should not replace `WorkflowGraph`.

Instead, a workflow graph may optionally include:

- `template_id`
- `template_version`
- `template_bindings`

This means:

- hand-authored primitive workflows remain valid
- preset workflows can still declare their template origin
- NL-generated workflows can target templates first, then expand

## Runtime Relationship

Templates do not bypass the runtime manifest layer.

They should compile through:

1. slot binding resolution
2. primitive graph expansion
3. hidden runtime manifest compilation
4. workflow IR generation

This preserves the existing rule:

- never execute directly from user-authored graph state

## Natural-Language Builder Relationship

The NL workflow builder should target templates, not raw graph primitives.

Recommended model output shape:

- `template_id`
- `preset_kind`
- `slot_assignments`
- optional workflow title/description
- policy/mask hints

Then OmnyID expands that structured output into:

- `WorkflowGraph`
- `WorkflowIR`

This is the cleanest path to the next builder milestone.

## Parallelism Relationship

Templates should be made parallel-ready before the runtime becomes fully parallel.

That means a template may declare:

- whether parallel fan-out is supported
- whether a merge barrier is required
- which slots are fan-out candidates

But full concurrent execution should remain a later implementation phase.

## First Implementation Rule

Before adding the natural-language `describe workflow` flow, the project should first:

1. define template schemas
2. define slot schemas
3. define preset-to-template mappings
4. make the current preset starter graphs template-backed

That ensures the next stage of the product targets a stable abstraction instead of a moving one.
