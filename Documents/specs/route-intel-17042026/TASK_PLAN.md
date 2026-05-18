# OmnyID Route Intelligence Interactive Assistant Dependency-Ordered Task Plan

## Purpose

This document turns the route intelligence assistant requirements into a dependency-ordered execution plan. The plan assumes the implementation must **extend the current OmnyID architecture** rather than build a parallel route-planning subsystem.

Primary rule:

- prefer modifying or extending existing orchestration, travel, AFP, A2UI, workflow, policy, and sharing paths over rewriting similar behaviour from scratch

## Implementation Update (2026-04-17)

The route-intelligence plan is now running on top of a completed cost/profit orchestration base.

Completed platform dependencies:

- Cost-aware orchestration foundation: DONE
  - budget preflight and downgrade/block paths in orchestrator
  - staged retrieval and interaction-gated expensive card loading
  - cost tracking by user/workflow/node/card/API
  - budget endpoints and live run context endpoints
- Profitability and optimisation layer: DONE
  - tier-aware budget and max-stage caps
  - deep-query daily limits and margin protection guardrails
  - admin profitability summary endpoints and user-facing effort/depth indicators
  - template cost profiles and tiered Chile-trip execution example endpoint

Implication for this route plan:

- Route intelligence phases should consume these shared primitives instead of adding route-specific budget/profit systems.

---

## 1. Delivery Strategy

The implementation should be delivered in phased order because several parts depend on upstream contract choices:

- routing and orchestrator-mode selection depend on clear message and UI contracts
- route UI rendering depends on route component definitions
- editable assumptions depend on stable route state storage
- sharing depends on stable renderable route snapshot shapes
- tests depend on all of the above being stable enough to assert

The correct order is therefore:

1. contract alignment
2. orchestration entry and mode selection
3. route state model
4. specialist/tool integration
5. route surface rendering
6. interactive edits and follow-up actions
7. sharing and copy
8. testing, rollout, and hardening

---

## 2. Reuse-First Rules For Implementation

Before each phase, apply these checks:

- If a needed behaviour already exists in `MasterOrchestrator`, extend it.
- If a route/travel capability already exists, refine it before adding a new unrelated capability family.
- If A2UI v1 can express the UI by extension, do not add a second UI transport.
- If workflow presets already cover travel orchestration, reuse those shapes as scaffolding.
- If policy and approval logic already gates the action class, route through that logic rather than implementing route-specific approval code.

---

## 3. Phase Overview

| Phase | Subtitle | Depends On | Main Outcome |
|---|---|---|---|
| 0 | Baseline Audit And Contract Decision | none | Freeze the extension strategy and avoid duplicate architecture |
| 1 | AFP And A2UI Route Contract | Phase 0 | Canonical route message and UI shape |
| 2 | Search-Bar Routing And Orchestrator Mode | Phase 1 | Route queries enter the correct orchestration flow |
| 3 | Persistent Route State And Assumptions | Phase 2 | Structured route session state becomes durable and editable |
| 4 | Specialist And Tool Execution Layer | Phase 3 | Route-specific evidence gathering and ranking work end-to-end |
| 5 | Route Surface Rendering | Phase 1, 3, 4 | Persistent route interaction surface renders correctly |
| 6 | Interactive Edits And Follow-Up Loop | Phase 3, 5 | Assumption edits and action chips trigger incremental refresh |
| 7 | Copy, Share, And Public Snapshot | Phase 5 | Route cards can be copied and safely shared |
| 8 | Validation, Metrics, And Rollout | Phases 1-7 | Feature is testable, observable, and safe to ship |

---

## 4. Phase 0 - Baseline Audit And Contract Decision

### Objective

Freeze the extension strategy before code changes begin so the team does not accidentally implement a second route orchestrator or a second route UI protocol.

### Dependencies

- none

### Tasks

1. Audit the current search-bar flow from `SearchBar` to `App.handleSearch` to `POST /ui/command`.
2. Audit the current orchestration path in `src/server/mod.rs`, including workflow preview generation and orchestration launch behaviour.
3. Audit `MasterOrchestrator` task decomposition, task allowlists, approval gates, and snapshot behaviour.
4. Audit current message taxonomy constraints in:
   - `OMNYID_MESSAGE_TAXONOMY_SPEC.md`
   - `OMNYID_CANONICAL_MESSAGE_SHAPES.md`
   - `OMNYID_AFP_NODE_MESSAGE_SPEC.md`
5. Audit current A2UI v1 renderer support and identify which requested route components do not exist yet.
6. Audit current travel-related assets, especially:
   - `travel_booker`
   - `travel.compare_options`
   - any travel-oriented workflow or presentation helpers
7. Record the chosen contract decision:
   - broaden current master orchestrator
   - keep search bar entry
   - keep AFP broad `type`
   - keep A2UI v1 as the declarative UI path

### Deliverables

- confirmed reuse inventory
- list of true gaps
- final contract decision written into implementation notes

### Exit Criteria

- the team can state exactly which existing modules will be extended
- the team has explicitly rejected building a duplicate orchestrator or duplicate route UI transport

---

## 5. Phase 1 - AFP And A2UI Route Contract

### Objective

Define one canonical route interaction contract that fits OmnyID's existing taxonomy and renderer model.

### Dependencies

- Phase 0

### Tasks

1. Formalize the canonical AFP message family for route UI updates:
   - `type: "agent"`
   - `subtype: "a2ui_render"`
2. Decide where the persistent surface identity lives:
   - `meta.state_id`
   - `view_id`
   - mirrored metadata
3. Define the route interaction content contract:
   - `interaction_mode`
   - `surface_id`
   - `state_revision`
   - `route_state_ref` or embedded state summary
4. Define the route component contract for:
   - `insight_line`
   - `route_card`
   - `map_card`
   - `conditions_card`
   - `comparison_card`
   - `assumptions_card`
   - `action_chips`
   - `task_board`
5. Decide whether route components are:
   - newly allowlisted A2UI nodes, or
   - route composites compiled into existing A2UI nodes
6. Define a patch/update strategy for incremental surface refresh.
7. Define copy and share action props for each eligible route component.
8. Define a compatibility fallback so older clients fail safely.

### Deliverables

- route UI contract spec
- surface identity contract
- incremental patch/update contract
- compatibility fallback rules

### Exit Criteria

- backend and frontend teams can implement against one agreed route payload shape
- there is no ambiguity about whether route UI is sent as raw prose, generative-card-only sections, or A2UI content

### Risks To Resolve Here

- current `A2UIRenderer` does not yet support the requested route-specific components
- existing `a2ui_render` content struct in Rust is older and narrower than current `views[].format = "a2ui.v1"` practice

---

## 6. Phase 2 - Search-Bar Routing And Orchestrator Mode

### Objective

Ensure route-style queries entered in the search bar enter the correct interactive orchestration mode using the existing path.

### Dependencies

- Phase 1

### Tasks

1. Extend `/ui/command` intent routing so route-style queries reliably classify into the broadened orchestration path.
2. Add a route-intelligence decision signal, for example:
   - `interaction_mode: "route_intelligence"`
   - or an equivalent structured orchestration mode marker
3. Keep the existing orchestration branch as the launch point.
4. Ensure orchestration preview behaviour remains compatible with route mode.
5. Decide when route queries should:
   - stay lightweight and answer directly with the route surface
   - create a workflow draft in parallel
   - ask for clarification through structured assumptions first
6. Ensure route mode is compatible with current user preferences such as auto-approve behaviour.

### Deliverables

- improved router heuristics or classifier prompt
- route-intelligence orchestration mode selector
- preview/launch behaviour for route queries

### Exit Criteria

- a query like "best way to get to Brisbane avoiding tolls" enters orchestration route mode from the search bar without a new frontend entrypoint
- a general non-route orchestration query still behaves correctly

### Notes

- Do not create `/agent/route-orchestrate` unless absolutely required by a proven architectural constraint.
- Prefer adding route mode to existing orchestration request/response shapes.

---

## 7. Phase 3 - Persistent Route State And Assumptions

### Objective

Add a durable, inspectable route session state that supports incremental follow-ups and editable assumptions.

### Dependencies

- Phase 2

### Tasks

1. Introduce a structured route state model with at least:
   - `goal`
   - `origin`
   - `destination`
   - `time_context`
   - `constraints`
   - `inferred_preferences`
   - `resolved_entities`
   - `live_conditions`
   - `route_options`
   - `ranked_routes`
   - `confidence`
   - `missing_info`
2. Define how route state is persisted:
   - snapshot messages
   - ledger entries
   - or both with clear separation of concerns
3. Add revision semantics so each refresh can explain what changed.
4. Define assumption fields, editability rules, and inferred-vs-confirmed markers.
5. Define which assumption edits should trigger:
   - full rerun
   - partial rerank
   - only UI refresh
6. Ensure the state model is replayable from AFP history.

### Deliverables

- route state schema
- route assumption schema
- state revision policy
- persistence rules

### Exit Criteria

- one route thread can survive follow-up refinements without depending on prompt-only memory
- the system can distinguish inferred assumptions from confirmed user edits

### Risks To Resolve Here

- duplicated state between thread history, ledger, and UI payloads
- lack of stable route option IDs causing patch failures and incorrect UI refreshes

---

## 8. Phase 4 - Specialist And Tool Execution Layer

### Objective

Make the route-intelligence mode capable of gathering evidence, generating options, and ranking them through existing orchestration patterns.

### Dependencies

- Phase 3

### Tasks

1. Break route intelligence into bounded specialist responsibilities:
   - intent and constraint parsing
   - location/entity resolution
   - live conditions collection
   - preference modelling
   - route generation
   - ranking
   - UI planning
2. Reuse existing travel capability boundaries first.
3. Refactor or extend the current travel capability so route planning has structured operations rather than vague query-style tool calls.
4. Define capability IO contracts for:
   - location resolution
   - route generation
   - live condition lookup
   - ranking
5. Extend policy/task allowlists only where genuinely required.
6. Decide whether route work fits into existing task types or needs narrowly scoped new ones.
7. Ensure all route tool results produce machine-readable outputs suitable for UI patching.
8. Include freshness timestamps and confidence hints in tool outputs.

### Deliverables

- route specialist boundaries
- route tool contracts
- updated policy mapping if needed
- route ranking input/output contract

### Exit Criteria

- the orchestrator can produce at least two ranked route candidates with supporting evidence when sources exist
- route ranking can explain why the top route changed after an assumption or condition update

### Notes

- Prefer extending `travel` capability family over creating disconnected tool names unless a clean boundary cannot be expressed that way.
- Preserve approval boundaries for anything that moves from comparison into booking or outbound communication.

---

## 9. Phase 5 - Route Surface Rendering

### Objective

Render the persistent route interaction surface through A2UI-compatible components.

### Dependencies

- Phase 1
- Phase 3
- Phase 4

### Tasks

1. Implement renderer support for the chosen route component contract.
2. Add support for a mandatory `insight_line`.
3. Implement `route_card` rendering with route IDs, trade-offs, confidence, and copy/share affordances.
4. Implement `conditions_card` rendering with freshness and impact metadata.
5. Implement `comparison_card` rendering for side-by-side route comparison.
6. Implement `assumptions_card` rendering with field-level edit affordances.
7. Reuse existing `task_board` support where appropriate.
8. Ensure the route surface respects one stable `route_interaction_surface` identity.
9. Support incremental node replacement or patching without forcing a full surface reset.

### Deliverables

- route-aware A2UI renderer support
- stable route interaction surface
- fallback rendering for unknown or incomplete route payloads

### Exit Criteria

- the frontend can render a persistent route response with the required cards
- a second update can patch the same route surface without creating a visually unrelated new result

### Risks To Resolve Here

- route payload shape drift between backend and renderer
- accidental duplication between generative-card sections and A2UI route nodes

---

## 10. Phase 6 - Interactive Edits And Follow-Up Loop

### Objective

Turn the route surface from a static result into an interactive planning surface.

### Dependencies

- Phase 3
- Phase 5

### Tasks

1. Define typed action intents for route follow-ups and assumption edits.
2. Implement edit handling for assumptions fields.
3. Implement action chips that map into structured follow-up requests.
4. Add orchestration logic that determines whether a user action requires:
   - re-resolution
   - condition refresh
   - reranking only
   - UI-only mutation
5. Preserve thread continuity and surface identity across each follow-up.
6. Emit updated state revisions and UI patches after each action.
7. Ensure low-confidence or missing information requests appear inside the route surface instead of as raw-text prompts.

### Deliverables

- action intent contract
- edit handlers
- rerun/rerank decision logic
- follow-up patch flow

### Exit Criteria

- a user can change one assumption and see relevant cards update in-place
- a follow-up chip can trigger a valid route refresh without resetting context

### Notes

- This phase is not complete if edits only update one local UI field without re-running dependent reasoning.

---

## 11. Phase 7 - Copy, Share, And Public Snapshot

### Objective

Make route results portable without weakening OmnyID's privacy model.

### Dependencies

- Phase 5

### Tasks

1. Implement declarative copy actions for eligible route components.
2. Add share action support to eligible route cards.
3. Define the route snapshot payload to be rendered publicly.
4. Build or extend the public snapshot generation path so it can render route surfaces.
5. Ensure the public snapshot is read-only and detached from the user's private runner.
6. Ensure the original owner thread remains encrypted and append-only.
7. Add expiry, audit, and revocation considerations for shared route snapshots if the platform supports them.

### Deliverables

- copy action support
- share action support
- route public snapshot shape
- public renderer compatibility

### Exit Criteria

- a route card can be shared without exposing the full private AFP thread
- copy and share behaviour is consistent across route card types

---

## 12. Phase 8 - Validation, Metrics, And Rollout

### Objective

Verify the feature technically and product-wise before broader rollout.

### Dependencies

- Phases 1 through 7

### Tasks

1. Add backend tests for:
   - route query classification
   - route-intelligence orchestration mode selection
   - route state revision behaviour
   - AFP payload validity
   - policy and approval compliance
2. Add frontend tests for:
   - route surface rendering
   - patch/update behaviour on stable surface IDs
   - assumption edits
   - copy/share action presence
3. Add integration tests for:
   - search bar to route surface path
   - one-turn clarification through assumptions
   - one-turn follow-up rerank
4. Add observability fields and logs for:
   - route interaction mode
   - route state revisions
   - confidence shifts
   - source freshness
   - user-edited assumptions
5. Define MVP quality metrics:
   - unnecessary clarification rate
   - first recommendation acceptance rate
   - follow-up continuity success rate
   - route freshness compliance
   - average latency by stage
6. Roll out behind a feature flag if possible.

### Deliverables

- automated tests
- observability hooks
- quality metrics
- rollout guardrail

### Exit Criteria

- the feature is testable from search bar to final route surface
- regressions in non-route orchestration paths are covered
- the team can measure whether the interaction is actually useful

---

## 13. Suggested Work Breakdown By Code Area

This is not a strict file-level implementation order, but it reflects likely ownership boundaries.

### Backend Routing And Orchestration

- `src/server/mod.rs`
- `src/master_orchestrator.rs`
- `src/policy_engine.rs`
- message/state helpers used by orchestration

### Message And Contract Layer

- `src/message.rs`
- route-specific spec updates under `Documents/specs/`
- any shared type definitions used by frontend/backend

### Frontend Rendering

- `solid-ui/src/App.tsx`
- `solid-ui/src/components/ViewDispatcher.tsx`
- `solid-ui/src/components/renderers/A2UIRenderer.tsx`
- any new route-specific UI helpers

### Workflow And Travel Reuse

- existing travel preset generation in `src/server/mod.rs`
- workflow schema/template docs if the route mode needs preset alignment

---

## 14. Dependency Rules That Must Be Respected

Do not start renderer-heavy work before the route component contract is frozen.

Do not start assumption-edit interactivity before the route state revision model exists.

Do not add public sharing before the route surface can already render deterministically from structured payloads.

Do not add new route task types or capability families until the team has proven existing `travel` boundaries cannot cleanly express the needed operation.

Do not implement route mode as a separate top-level orchestrator.

---

## 15. Recommended MVP Cut

If delivery must be staged, the MVP cut should stop after:

- Phase 1
- Phase 2
- Phase 3
- Phase 4
- Phase 5
- the minimal subset of Phase 6 needed for editable assumptions and one follow-up rerank

The MVP should include:

- search-bar initiated route mode
- persistent route surface
- insight line
- at least two route options
- editable assumptions
- live conditions card
- comparison card
- one round of follow-up reranking

The MVP may defer:

- advanced map visualisation
- richer public sharing controls
- broad multi-vertical planning reuse beyond route mode

---

## 16. Definition Of Done

The route intelligence interactive assistant is done for this slice when:

- it begins from the existing search bar
- it uses the existing master orchestration path as the owning conversation manager
- it emits AFP-native structured route UI on one persistent surface
- it exposes editable assumptions and route trade-offs
- it can refresh results in response to follow-up edits
- it reuses existing travel, workflow, policy, and A2UI primitives wherever they fit
- it does not introduce a duplicate orchestrator or duplicate route UI protocol

That is the bar for a correct implementation.
