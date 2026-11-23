# OmnyID Route Intelligence Interactive Assistant Requirements

## Document Intent

This document defines the requirements for adding a **route-intelligence-led interactive planning assistant** to OmnyID by **broadening the existing master orchestrator and orchestration flow**, not by introducing a second master agent.

The assistant begins from the existing **search bar** entrypoint and should feel like a goal-oriented, interactive planning surface rather than a chat transcript. Route planning is the first concrete high-frequency scenario, but the implementation must fit the wider "general-purpose, interactive planning assistant" direction already described in OmnyID design materials.

This document is intentionally aligned to current implementation so the work reuses existing orchestration, AFP, A2UI, workflow, approval, and policy boundaries wherever possible.

## Status Update (2026-04-17)

Relevant platform layers required by this spec are now implemented and available for reuse:

- Cost-aware orchestration engine: DONE
- Budget model + enforcement + staged retrieval: DONE
- Lazy loading/card gating via shared cost strategy: DONE
- Cost tracking and budget endpoints: DONE
- Profit-aware tier controls and margin guardrails: DONE
- User-facing effort/depth indicators and internal profitability dashboard APIs: DONE

Requirement interpretation update:

- Route intelligence must use the shared cost/profit orchestration contracts, not create a route-only budget or pricing subsystem.

---

## 1. Architectural Decision

**Decision:** "Route Intelligence Orchestrator" is a **mode and responsibility expansion** of the current OmnyID orchestration layer, not a new top-level orchestrator.

Implications:

- The existing search bar remains the user entrypoint.
- The existing `/ui/command` routing path remains the first server-side classifier.
- The existing orchestration branch remains the launching point for complex planning flows.
- The existing Rust `MasterOrchestrator` remains the primary planning/delegation authority.
- Existing workflow presets and travel-related building blocks should be reused where they already overlap the requested behaviour.
- Existing AFP and A2UI contracts should be extended, not bypassed.

This directly avoids the failure mode of building "another orchestrator" that duplicates current orchestration behaviour with slightly different prompts and message shapes.

---

## 2. Current Implementation Baseline To Preserve

The following existing implementation must be treated as foundational, not disposable:

- Search-bar initiated user requests already flow through `solid-ui/src/components/SearchBar.tsx` and `solid-ui/src/App.tsx`, then into `POST /ui/command`.
- `/ui/command` already classifies user intent and can route requests into the orchestration path.
- `src/master_orchestrator.rs` already decomposes natural-language objectives into typed tasks, applies policy, delegates scoped work, and aggregates results.
- `src/policy_engine.rs` already enforces task-type allowlists, capability scoping, and approval rules.
- `Documents/specs/OMNYID_A2UI_V1_SPEC.md` already establishes A2UI v1 as an additive declarative UI contract.
- `solid-ui/src/components/renderers/A2UIRenderer.tsx` already renders a limited allowlisted A2UI node set.
- `src/server/mod.rs` already has orchestration preview and workflow draft generation paths.
- The workflow preset system already includes `travel_booker`, and the preset already references a `travel.compare_options` style capability boundary.
- Existing message taxonomy docs already prefer broad `type` values with nuance expressed via `subtype`, `content.kind`, and `metadata`.

The new feature must build on those facts. Where the requested prompt conflicts with current OmnyID contracts, this document resolves that conflict by adapting the prompt to OmnyID's established architecture rather than regressing the platform into duplicate or ad hoc behaviour.

---

## 3. Product Goal

OmnyID shall provide a **manager-led, stateful, interactive planning assistant** that:

- starts from a user query entered into the search bar
- interprets route-planning and travel-planning intent as a first-class orchestration mode
- keeps the conversation on one persistent route interaction surface
- maintains explicit machine-readable planning state
- emits only AFP-native UI updates
- supports iterative follow-ups without resetting context
- exposes assumptions, trade-offs, confidence, and next actions through structured UI rather than raw prose

The route-planning experience is the first vertical expression of the broader interactive planning assistant, not a one-off exception.

---

## 4. Scope

### In Scope

- Search-bar initiated route-planning and route-comparison requests
- Broadening the current orchestration flow so the master orchestrator can run an interactive planning loop
- Persistent route interaction state within a single thread
- Structured AFP-native UI rendering for route intelligence
- Clarification through editable assumptions instead of raw-text back-and-forth where possible
- Multiple route options, ranking, trade-off presentation, and follow-up chips
- Reuse of existing travel preset and travel capability boundaries where they fit
- Share and copy affordances on route UI cards
- Progressive UI updates on one persistent surface

### Out of Scope For This Slice

- Replacing the whole existing orchestration framework
- Replacing the search bar with a new frontend entrypoint
- Replacing the current A2UI framework with raw custom React/Solid components that bypass A2UI
- Full autonomous booking and payment execution
- A broad new generic web-browsing agent unrelated to route intelligence
- A brand-new top-level message taxonomy specifically for route mode

---

## 5. Non-Goals

The implementation must **not**:

- create a second master orchestrator that competes with `MasterOrchestrator`
- create a new top-level AFP `type` just for route planning
- bypass `views[]` / A2UI and emit UI-specific HTML or freeform UI payloads
- replace existing workflow preview and approval concepts with a separate one-off route system
- introduce a raw-text chatbot path for route planning when structured UI is expected
- destroy or sidestep current policy and approval gates

---

## 6. Core Behavioural Requirements

### 6.1 Search Bar Is The Entry Point

The assistant must begin from the existing search bar flow.

Requirements:

- The user enters a natural-language query in the existing search bar.
- The existing `/ui/command` classification step remains the first decision point.
- Queries that look like route planning, destination planning, itinerary comparison, local travel advice, or travel trade-off questions must be routable into the broadened orchestration flow.
- This route-intelligence flow must be reachable without asking the user to switch to a dedicated travel page first.

### 6.2 The Existing Master Orchestrator Owns The Conversation

The existing master orchestrator must own:

- the user-facing thread
- the route-planning state
- specialist selection
- result synthesis
- final AFP UI output

Hidden specialist workers may support the flow, but they must remain subordinate to the single conversation owner.

### 6.3 Orchestration Workflow Order

The route-intelligence mode must follow this logical order:

1. Receive user query.
2. Parse intent and identify whether route intelligence mode applies.
3. Resolve locations and entities.
4. Infer constraints, preferences, and missing assumptions.
5. Fetch live conditions and domain evidence.
6. Generate at least two route options when data allows.
7. Rank routes.
8. Render or patch the persistent route interaction surface.
9. Offer follow-up chips and editable assumptions for the next iteration.

This workflow may be implemented through multiple underlying AFP messages, but the conversation contract must behave as one coherent orchestration loop.

### 6.4 Mandatory State Model

The orchestrator must maintain a machine-readable state model that is sufficient to support incremental follow-ups without rereading raw prose only.

Minimum logical state fields:

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

Additional recommended fields:

- `traveller_profile`
- `assumptions`
- `decision_history`
- `source_freshness`
- `selected_route_id`
- `interaction_mode`
- `last_user_edit`
- `shareable_snapshot_state`

This state should be reconstructible from AFP history and/or checkpointable via `agent` messages such as `snapshot`, not hidden in ephemeral prompt text only.

### 6.5 Clarification Must Prefer Editable Assumptions

When the query is ambiguous, the system should prefer:

- showing inferred assumptions in structured UI
- allowing the user to edit them inline or via constrained controls
- rerunning downstream route ranking from the edited assumptions

It should ask raw-text clarification only when the UI cannot safely express the ambiguity.

Examples of assumptions that must be representable:

- departure time
- arrival deadline
- number of travellers
- adult/child mix
- pet/travel companion flags
- driving vs transit preference
- avoid tolls
- walking tolerance
- luggage burden
- cost sensitivity
- reliability sensitivity

### 6.6 Always Show Alternatives

When feasible, the assistant must provide at least two route options and should prefer three when evidence quality supports comparison.

Each option should carry:

- summary
- duration
- cost estimate when available
- reliability or confidence indicator
- trade-off explanation
- assumptions or dependency notes

### 6.7 Follow-Up Questions Must Stay In The Same Interaction Surface

All follow-up questions and refinements must stay on one persistent route surface associated with the same thread.

Examples:

- "leave 20 minutes later"
- "avoid tolls"
- "now compare train"
- "I am travelling with one child"
- "show the most reliable option instead of the fastest"

The system must update the existing route interaction surface instead of spawning a brand-new surface per turn.

---

## 7. AFP And Message Contract Requirements

### 7.1 Canonical Message Taxonomy

To stay aligned with OmnyID's existing taxonomy, route-interaction UI messages must use:

- `type: "agent"`
- `subtype: "a2ui_render"`

The route prompt's wording about `type: "a2ui_render"` must be interpreted as **subtype intent**, not as justification for a new top-level AFP message family.

### 7.2 UI Payload Contract

Every user-visible route intelligence response must be an AFP message that contains declarative A2UI content.

Requirements:

- UI content must be delivered through `views[]` with `format: "a2ui.v1"` as the primary renderer path.
- If OmnyID keeps mirrored UI payload data in `content`, that mirrored data must remain structurally consistent with the A2UI view payload.
- No raw HTML, CSS, or direct prose-only response is allowed as the user-facing route answer.

### 7.3 Persistent Route Surface Identity

The route interaction surface must keep one stable identity for the entire conversation:

- required logical value: `route_interaction_surface`

Compatibility requirement:

- represent this persistent identity through `view_id`, `meta.state_id`, or an equivalent canonical field supported by OmnyID's A2UI contract
- preserve the same stable identity across updates
- patch or replace nodes incrementally rather than discarding the whole conversation state

### 7.4 Thread Continuity

State continuity must be anchored by the AFP `thread_id`.

Requirements:

- every route interaction update must remain associated with the same thread unless the user explicitly branches
- all clarification, edits, re-ranking, and follow-up actions must be traceable in the same thread
- if divergent exploration is needed, it may use existing fork mechanics, but the main route interaction surface must remain legible from the parent thread

### 7.5 Shared Ledger And Snapshot Compatibility

The implementation should reuse existing ledger and snapshot concepts rather than inventing separate state stores.

Requirements:

- append-only route interaction state must be recoverable through AFP history
- route assistant checkpoints should map cleanly onto existing `agent/snapshot` semantics
- long-lived route assumptions or session memory may use a `note/ledger` thread when persistent shared-memory behaviour is required

---

## 8. A2UI Requirements For Route Intelligence

### 8.1 Route Assistant Component Set

The route assistant may only emit the following route-specific logical component kinds for the user-facing surface:

- `insight_line`
- `route_card`
- `map_card`
- `conditions_card`
- `comparison_card`
- `assumptions_card`
- `action_chips`
- `task_board`

Compatibility requirement:

- because current OmnyID A2UI v1 uses an allowlisted node model, these route components must be implemented as either newly allowlisted A2UI node types or approved domain composites that compile into A2UI v1 nodes without bypassing validation
- the implementation must choose one canonical path and avoid keeping two competing render contracts for the same route UI

### 8.2 Mandatory Insight Line

Every route intelligence response must include one `insight_line`.

It must contain:

- a primary insight summarizing the best option and why
- an optional secondary trade-off
- a confidence badge or equivalent confidence field

### 8.3 Assumptions Card Must Be Editable

The assumptions surface is mandatory whenever uncertainty, inference, or implicit defaults exist.

Requirements:

- assumptions must be broken into discrete fields, not one blob of text
- fields must support editing
- fields should support suggestions, pickers, or dropdowns when reasonable
- updating an assumption must trigger downstream refresh of dependent cards
- the user must be able to see which values were inferred versus explicitly confirmed

### 8.4 Conditions Card

Live conditions must surface input evidence that materially changes route quality.

Examples:

- traffic
- weather
- transit delays
- closures
- local events
- parking uncertainty

The system must distinguish between:

- observed condition
- inferred impact
- confidence or freshness

### 8.5 Comparison Card

When more than one viable option exists, the assistant must provide a structured comparison card.

Minimum comparison dimensions:

- duration
- cost or fare estimate when available
- transfer or stop count when relevant
- walking burden when relevant
- reliability/confidence
- key trade-off

### 8.6 Action Chips

The surface must support structured follow-up chips such as:

- leave later
- avoid tolls
- optimise for cost
- optimise for reliability
- compare train
- compare rideshare
- travelling with child

These actions must map to typed intents rather than freeform UI-only behaviours.

### 8.7 Task Board

`task_board` is optional for simple route replies but required when the assistant moves into multi-step travel planning.

Use cases:

- booking preparation checklist
- unresolved dependency tracking
- pending clarifications
- travel planning sub-steps

This should reuse the existing `task_board` rendering capability where possible.

---

## 9. Copy And Share Requirements

### 9.1 Copy

Every user-facing route card that can sensibly be copied must expose copy behaviour.

Allowed formats:

- plain text
- JSON
- image or file export when supported

The copy behaviour must be declarative through A2UI actions or approved component props, not custom ad hoc DOM logic per response.

### 9.2 Share

Every route card should support sharing when safe to do so.

Requirements:

- route cards should expose `actions: ["share"]` or the canonical equivalent supported by the final A2UI route component contract
- share actions must create a public snapshot view rather than exposing the private encrypted AFP thread directly

### 9.3 Public Snapshot Behaviour

Shared route surfaces must follow this behaviour:

- OmnyID generates a dedicated public snapshot page
- the snapshot is rendered by a cloud-side public renderer service, not by the user's private runtime
- encryption is disabled only for the shared public snapshot payload
- the owner's original AFP ledger and thread history remain encrypted and append-only
- the shared page is read-only

This keeps sharing compatible with OmnyID's privacy model while allowing practical route-result sharing.

---

## 10. Specialist And Tooling Requirements

### 10.1 Hidden Specialist Pattern

The orchestrator may call hidden specialists, but the master orchestrator must remain the single owner of:

- conversation state
- UI output
- ranked recommendation

Recommended specialist responsibilities:

- intent parser
- location/entity resolver
- preference and constraint modeller
- live conditions collector
- route option generator
- ranking and trade-off scorer
- response/UI planner

### 10.2 Reuse Existing Travel Capability Boundaries

Where possible, the system must extend existing travel-related assets before inventing new domain contracts.

Reuse candidates include:

- `travel_booker` preset
- `travel.compare_options` style tool boundary
- workflow approval behaviour for externally consequential actions
- existing orchestration preview and workflow draft generation

If route planning needs more granular travel operations, those should be introduced as structured extensions of the travel capability family rather than a disconnected set of bespoke tool names.

### 10.3 Tool Contract Requirements

Route and conditions tools must use explicit structured inputs and outputs.

Good examples:

- `resolve_location(query, locale_bias, user_profile_context)`
- `find_routes(origin, destination, depart_time, arrive_by, travellers, transport_modes, avoid_tolls, walking_tolerance_mins)`
- `fetch_live_conditions(origin, destination, depart_window, route_ids)`
- `rank_routes(route_candidates, priorities, constraints, live_conditions)`

Avoid vague single-string query tools such as:

- `search_routes(query)`

### 10.4 Freshness And Validation

Time-sensitive route outputs must carry freshness-aware handling.

Requirements:

- live data sources must include fetched-at timestamps or freshness metadata
- stale conditions must reduce confidence
- the assistant must avoid presenting speculative live conditions as confirmed facts

---

## 11. Policy, Safety, And Approval Requirements

The assistant must preserve OmnyID's progressive autonomy model.

### Silent

- read-only route lookup
- weather checks
- traffic checks
- event checks
- comparison and ranking

### Soft Confirm

- saving assumptions
- pinning route preferences
- setting travel defaults
- storing route templates or recurring commute preferences

### Hard Confirm

- bookings
- payments
- message sending
- irreversible external actions

The route assistant must not circumvent existing approval gates simply because the UI looks conversational.

---

## 12. Observability And State Reconstruction Requirements

The route assistant must be inspectable.

Requirements:

- emitted AFP messages must make planning state transitions legible
- important state revisions should be checkpointed or summarised
- follow-up edits must be attributable to user input or inference changes
- ranking changes should be explainable from changed assumptions, conditions, or preferences
- the system should support replay/debugging without depending on hidden prompt-only memory

Recommended observability fields:

- `interaction_mode: "route_intelligence"`
- `surface_id: "route_interaction_surface"`
- `state_revision`
- `route_query_kind`
- `ranking_strategy`
- `source_freshness`
- `confidence_reason`

---

## 13. Compatibility Requirements

### 13.1 With Existing A2UI

The implementation must not break existing generic A2UI panels.

Requirements:

- route UI extensions must remain additive
- unknown route nodes must fail safely during rollout
- the frontend must not crash if it receives a partially adopted route payload

### 13.2 With Existing Orchestration Preview

Current orchestration preview and workflow draft generation should remain available.

Requirements:

- route-intelligence mode may still generate or reference a workflow draft when useful
- route-specific interaction should not force all route queries into the visual workflow builder first
- the workflow builder remains an inspection or expansion tool, not the only route UI

### 13.3 With Existing Message Taxonomy

Requirements:

- no new broad top-level AFP type for route mode
- route semantics should be expressed through `subtype`, `content.kind`, `metadata`, and A2UI payloads
- snapshot and ledger semantics should stay aligned to existing specs

---

## 14. Acceptance Criteria

The feature is acceptable when all of the following are true:

- A user can enter a route-style natural-language query in the existing search bar and be routed into route intelligence mode.
- The current master orchestration path handles the interaction without introducing a separate top-level orchestrator.
- The user receives a persistent structured route interaction surface tied to one thread.
- Every route response is AFP-native and rendered through A2UI-compatible payloads.
- The surface includes a mandatory insight line.
- At least two route options are shown when data exists.
- Assumptions are visible, fielded, and editable.
- Editing assumptions updates the rest of the route surface.
- Live conditions materially affecting recommendations are surfaced with freshness and confidence signals.
- Copy and share affordances exist on eligible cards.
- Approval gates remain intact for consequential actions.
- The route assistant can survive at least one follow-up refinement without losing state.
- The implementation reuses existing orchestration, travel, A2UI, and approval structures rather than duplicating them.

---

## 15. Implementation Guidance Summary

The safest implementation path is:

1. Expand the current search-bar classification and orchestration path to recognise route intelligence as a first-class orchestration mode.
2. Extend the existing master orchestrator with persistent structured interaction state for route planning.
3. Reuse the current travel preset and capability family where they overlap, then add route-specific capability granularity only where required.
4. Normalize route UI output onto the existing `agent/a2ui_render` plus `views[].format = a2ui.v1` contract.
5. Add route-specific A2UI components or approved composites in a way that remains allowlisted and renderer-safe.

This preserves OmnyID's current architecture while delivering the requested interactive assistant behaviour.
