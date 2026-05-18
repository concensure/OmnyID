# Consumer Agent Use Case Product Gap

## Scope

This review assesses the sample use cases in [agent use case.md](C:/Users/ozans/Desktop/projects/OmnyID/Documents/design/agent/consumer%20agent%20use%20case/agent%20use%20case.md) against the current OmnyID implementation, with emphasis on:

- the existing `route_ui_command()` intent-routing layer
- the current `MasterOrchestrator`
- AFP message flow and a2ui rendering
- the already-built visual workflow builder

The goal is to identify the remaining product gap for generalized consumer requests without inventing a new orchestration branch or pretending existing shipped surfaces do not exist.

## Current Progress That Should Be Recognised

The project has already shipped meaningful foundations that reduce the gap:

- intent routing improvements are marked done in `OMNYID_TASKS.md`, including task-keyword fallback in `route_ui_command()` and stronger task-vs-research classification
- plan intent routing already exists, with search-bar queries able to route into the planning view
- the visual workflow builder already exists as a real product surface, not a future concept
- AFP-native UI patterns already exist for cards, approvals, dashboard rendering, and workflow-related views
- cost-aware orchestration and master-agent orchestration already exist

Because of that, two earlier assumptions would be inaccurate:

- "human-facing visual workflow" is not missing as a product surface
- "response mode" should not be treated as a net-new standalone subsystem separate from intent routing

Instead:

- intent routing should own the first-pass request classification
- the workflow builder should be reused as the human-facing inspection and expansion surface when a request becomes plan- or workflow-shaped

## Summary Verdict

There is still a product gap, but it is narrower than "consumer workflows do not exist."

The real gap is that the current routing, orchestration, and workflow surfaces are not yet unified into a single generalized consumer-request contract. OmnyID can already classify many requests and can already render workflows, but it does not yet consistently turn arbitrary consumer requests into a valid end-to-end path that:

- routes correctly at intake
- checks whether enough context exists
- checks whether the necessary tools or live data exist
- chooses the lightest valid execution path
- falls back safely when integrations are missing
- projects non-trivial runs into the existing workflow builder and AFP surfaces coherently

## Updated Use Case Family Assessment

| Use case family from sample list | Current status | Remaining gap |
|---|---|---|
| Summarize / draft / explain / translate | Mostly supported through direct answer, summarization, and existing routing | Consistent context sufficiency and output normalization |
| To-do / schedule / reminders / budgeting | Partially supported through task routing and planning/orchestration | Better intake-to-plan handoff and approval/staging consistency |
| Recommendations (books, gifts, playlists, courses) | Partially supported through research/routing patterns | Comparison/ranking contract and evidence freshness handling |
| Travel / flights / hotels / route planning | Partial | Live-data sufficiency, missing integration fallback, route-to-plan consistency |
| Health / finance / legal-adjacent advice | Partial | Policy-limited behavior and clarification/escalation rules |
| Home / shopping / comparison / negotiation | Partial | Tool sufficiency, comparison output structure, action staging |
| Coding / analysis / report / dataset insights | Partial to strong | Better compact context packaging and orchestration/tool dispatch consistency |

## Confirmed Product Gaps

### 1. Intent routing exists, but generalized consumer routing coverage is incomplete

The project already has intent routing and has shipped improvements to `route_ui_command()`. That means the missing work is not "invent response modes from scratch."

The actual gap is:

- broaden routing coverage for generalized consumer requests
- make routing outcomes explicit and reusable across direct-answer, research, planning, and orchestration paths
- prevent valid multi-step consumer requests from falling into weak or overly generic routing buckets

In practice, "response mode" in this project should be treated as the normalized output of intent routing plus orchestration preflight, not a separate rival subsystem.

### 2. Context sufficiency and clarification gating are still under-specified

Many sample requests still need a reusable intake check for whether enough information was provided:

- flights need origin, destination, and date window
- meal plans need dietary constraints
- comparisons need budget, target, or criteria
- negotiation help needs item, channel, and baseline price

The routing layer can classify the request, but classification alone does not guarantee a valid answer. The product still needs a compact next-step contract:

- proceed
- ask minimal clarification
- require confirmation because ambiguity or risk is too high

### 3. Tool and live-data sufficiency checks are still not unified enough

Several consumer requests depend on current or external data:

- prices
- flights and hotels
- maps and routes
- weather
- current schedules or market conditions

The current stack has research flows and some integrations, but it still needs a consistent sufficiency check after routing and before expensive execution:

- answer from existing context
- retrieve current data
- route into orchestration with supported tools
- stop with a valid capability-unavailable outcome

This remains one of the main reasons the master agent can produce plausible but incomplete consumer answers.

### 4. The workflow builder exists, but run projection into it is not yet a complete generalized contract

The human-facing visual workflow is already built in the visual workflow builder, so building a new visual workflow surface is not the gap.

The real remaining gap is integration:

- non-trivial consumer requests should project cleanly into the existing workflow builder when inspection, approval, or expansion is useful
- trivial requests should not be forced into the builder first
- workflow state, approvals, blocked states, and staged actions should stay in AFP parity with the builder and normal card-based UI

This aligns with the existing route-intelligence requirement that the workflow builder remain an inspection or expansion tool, not the only request UI.

### 5. Output normalization across answer, research, plan, and staged action is still incomplete

The current product has cards, approvals, dashboard rendering, and workflow views, but the master-agent path still lacks a sufficiently normalized set of result shapes for generalized consumer queries.

The gap is not "no UI." The gap is that the same consumer request family can still land in uneven output forms depending on which path it took:

- direct answer
- research result
- planning result
- orchestration result
- blocked or unavailable outcome

That inconsistency makes generalized support weaker than it should be.

### 6. Token-efficiency gating should happen earlier in the existing routing/orchestration path

Cost-aware orchestration exists, but the remaining product gap is earlier and more structural:

- avoid deeper planning when routed intent is already direct-answer shaped
- avoid live retrieval when the user has already provided enough information
- avoid large context replay when a compact slice would suffice
- avoid forcing simple requests into orchestration or workflow expansion

This is a routing-and-preflight refinement gap, not a missing cost system.

### 7. High-risk policy behavior is still too implicit for consumer breadth

The sample list includes health and finance use cases. The product still needs clearer reusable policy behavior for these categories:

- educational answer only
- ask for clarification
- require user confirmation before action
- advise verification with a professional or authoritative source
- block certain outcomes

That policy should plug into the existing routing and orchestration path rather than introduce a separate branch family.

## Non-Gaps

The following should not be described as missing in this project:

- the visual workflow builder itself
- intent routing as a product capability
- AFP/a2ui rendering surfaces
- the master agent or orchestration layer existing at all

The remaining work is integration depth, generalized coverage, and execution correctness.

## Recommended Product Direction

Enhance the existing stack in this order:

1. use intent routing as the first-pass classifier for consumer requests
2. add a compact post-routing preflight for context sufficiency and tool/data sufficiency
3. normalize the allowed execution outcomes
4. keep trivial requests in direct-answer or research/card flows
5. project non-trivial runs into the existing workflow builder when inspection, approval, or expansion is useful
6. keep all stages AFP-native so workflow, cards, and audit paths stay aligned

A practical normalized outcome set for the current architecture is:

- `answer`
- `research`
- `plan`
- `orchestrate`
- `clarification_required`
- `capability_unavailable`
- `policy_limited`

These should be treated as routing/orchestration outcomes within the existing pipeline, not as a new standalone system parallel to intent routing.

## Acceptance Standard For Closing The Gap

The gap is closed when an arbitrary consumer-style request can enter the current OmnyID path and reliably:

- route through the existing intent layer into the correct high-level path
- ask only necessary clarifying questions
- determine whether current data and integrations are sufficient
- stay lightweight for simple requests
- use the existing workflow builder for non-trivial inspection, approval, or expansion cases
- emit AFP-consistent outputs across cards, workflow states, approvals, and blocked outcomes
