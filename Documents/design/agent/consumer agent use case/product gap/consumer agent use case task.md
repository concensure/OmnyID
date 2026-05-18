# Consumer Agent Use Case Task List

## Goal

Close the remaining consumer-agent product gap by extending the current OmnyID path, not by creating a new one. The relevant path already exists:

- `route_ui_command()` and related intent routing
- `MasterOrchestrator`
- AFP/a2ui card rendering
- the existing visual workflow builder

The task is to make those pieces work together more reliably for generalized consumer requests.

## Delivery Rules

- do not create a new orchestration branch family per sample use case
- treat response outcomes as part of intent routing plus orchestration preflight, not as a separate subsystem
- reuse the existing visual workflow builder as the inspection/expansion surface
- do not force every request into the workflow builder
- keep all user-visible states AFP-native
- optimize for token efficiency before deep planning or orchestration

## Dependency-Ordered Tasks

### 1. Document the current routing and execution paths for consumer requests

Capture the actual implemented paths first so the next work is anchored to reality:

- direct answer
- research
- planning view handoff
- orchestration
- approval/staged action

Deliverables:

- current-state routing map
- examples of which sample use cases land on which current path
- gap notes for misrouted, underpowered, and unsupported cases

Why first:

- the project already has routing and workflow surfaces; the remaining work should start from that baseline

### 2. Expand intent-routing coverage for generalized consumer requests

Build on the existing routing work in `route_ui_command()` so more consumer requests land in the right high-level path without unnecessary orchestration.

Focus areas:

- recommendation/comparison queries
- plan-shaped travel and logistics queries
- mixed research-plus-action queries
- broader household/productivity requests

Deliverables:

- expanded routing rules and prompt guidance
- better routing confidence and rationale capture
- regression cases for common consumer prompt families

Depends on:

- task 1

### 3. Add a post-routing context sufficiency gate

Once a request is routed, add a compact preflight that decides whether enough information exists to proceed.

Outcomes:

- proceed
- ask minimal clarification
- require confirmation due to ambiguity or risk

Deliverables:

- context sufficiency evaluator
- AFP clarification contract
- minimal follow-up rules to avoid multi-turn drift

Depends on:

- tasks 1 and 2

### 4. Add a post-routing tool and live-data sufficiency gate

After routing and context sufficiency, determine whether the selected path has the required capability and freshness.

Outcomes:

- answer from current context
- use research/live retrieval
- use orchestration with supported tools
- return a valid capability-unavailable result

Deliverables:

- tool/data sufficiency matrix
- capability-unavailable outcome contract
- downgrade rules for missing integrations

Depends on:

- tasks 1 to 3

### 5. Normalize execution outcomes across the existing paths

Standardize the outcome set produced by the current routing/orchestration stack:

- `answer`
- `research`
- `plan`
- `orchestrate`
- `clarification_required`
- `capability_unavailable`
- `policy_limited`

Deliverables:

- output contract for each outcome
- mapping from intent-routing result to final output shape
- AFP metadata conventions so downstream UI surfaces render consistently

Depends on:

- tasks 2 to 4

### 6. Improve token-efficiency gating in the current path

Reduce unnecessary cost by refining when a request escalates from routing into deeper planning or orchestration.

Deliverables:

- early-exit rules for direct-answer and lightweight research cases
- compact context-pack rules for routed consumer requests
- token-budget thresholds by outcome type

Depends on:

- tasks 2 to 5

### 7. Normalize recommendation and comparison handling

Generalized consumer requests often ask for recommendations, options, or comparisons. Add one reusable contract instead of special-casing shopping, courses, gifts, travel, and similar prompts separately.

Deliverables:

- comparison/recommendation output contract
- ranking rationale structure
- source freshness and evidence display rules

Depends on:

- tasks 2 to 6

### 8. Add policy-limited behavior for higher-risk domains

Extend the existing path with clearer behavior for health, finance, legal-adjacent, and similar requests.

Deliverables:

- policy-limited outcome rules
- domain-specific clarification/confirmation rules
- AFP-visible policy reason metadata

Depends on:

- tasks 2 to 6

### 9. Wire non-trivial runs into the existing workflow builder more consistently

The workflow builder already exists. The task is to improve when and how consumer requests appear there.

Principles:

- do not force trivial requests into the builder
- use the builder for inspection, approval, expansion, and recovery of non-trivial runs
- keep parity with card-based and thread-based UI

Deliverables:

- run-to-builder projection rules
- mapping from routed/orchestrated outcomes to workflow-builder entry points
- blocked/approval/recovery state handling in the existing builder

Depends on:

- tasks 4 to 8

### 10. Ensure workflow-builder states and normal UI states emit consistent AFP messages

The workflow builder, dashboard cards, approvals, and blocked outcomes should all reflect the same underlying run state.

Deliverables:

- AFP state contract for request accepted, clarification needed, staged action, approval required, blocked, completed, failed
- parity checks between workflow-builder rendering and standard feed rendering
- audit trail requirements

Depends on:

- tasks 5 and 9

### 11. Strengthen staged-action and approval handling through existing surfaces

Use current approval/banner/card/workflow patterns rather than inventing a new review UI.

Deliverables:

- consistent approve/reject/edit path for action-taking consumer requests
- AFP messages for staged, approved, rejected, executed, and failed
- reversible-action behavior where supported

Depends on:

- tasks 5, 8, 9, and 10

### 12. Add capability-unavailable and fallback UX through existing surfaces

If OmnyID cannot complete a request, it should still produce a valid result through the current UI stack.

Deliverables:

- capability-unavailable card/workflow treatment
- suggested next-step options
- consistent blocked-but-valid AFP outcome

Depends on:

- tasks 4, 5, 9, and 10

### 13. Build a generalized evaluation set against the current stack

Validate the updated routing/orchestration contract using prompts derived from, but not limited to, the sample list.

Coverage should include:

- direct answers
- research
- plan handoff
- orchestration
- clarification-required outcomes
- recommendations/comparisons
- approval flows
- capability-unavailable outcomes
- policy-limited outcomes

Deliverables:

- evaluation suite
- correctness rubric tied to routing, sufficiency, and outcome quality
- token-spend regression checks

Depends on:

- tasks 1 to 12

## Suggested Implementation Phases

### Phase A: Reality Baseline

- tasks 1 to 2

### Phase B: Preflight and Outcomes

- tasks 3 to 8

### Phase C: Workflow Builder and AFP Parity

- tasks 9 to 12

### Phase D: Validation

- task 13

## Definition of Done

This work is complete when a generalized consumer request can enter the existing OmnyID path and reliably:

- route correctly through the current intent layer
- ask only necessary clarifications
- determine whether capabilities and live data are sufficient
- avoid unnecessary escalation into deep planning or orchestration
- use the existing workflow builder appropriately for non-trivial runs
- emit AFP-consistent outputs across feed, approvals, and workflow views
