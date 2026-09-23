# Wedding Planning Second-Order Implementations

Date: 2026-09-13

## Purpose

This document defines which second-order wedding planning behaviors are worth building, how they improve the user experience, and how they must fit OmnyID's existing AFP, supertag, topology, task, calendar, approval, and response-workspace architecture.

Second-order planning means the agent does not stop at "here is a venue shortlist" or "here is an email draft." It also tracks the consequences: weather fallback, legal deadlines, deposit risk, unanswered vendors, transport constraints, accessibility needs, contract review, and follow-up loops.

The goal is not to add a separate wedding operations app. The goal is to make the existing wedding response workspace feel trustworthy because it shows what is evidenced, what is missing, and what loop needs to be closed next.

## Product Judgment

The idea has merit if implemented conservatively.

It improves user experience because weddings are not just information searches. They are dependency-heavy projects where forgotten follow-ups create real stress. A good wedding planning response should therefore surface:

- what has been researched or drafted
- what has been decided
- what still needs a user decision
- what needs explicit approval before an external action
- what needs a task, date, or reminder
- what cannot be claimed until an external provider or source confirms it

The idea is aligned with OmnyID's core when every loop is represented through existing systems:

- AFP messages remain the durable record.
- Supertags make loops searchable.
- Tasks and calendar events remain first-class projections.
- The Knowledge Graph explains dependencies and consequences.
- Approval receipts prove whether email/contact/calendar actions actually happened.
- The response workspace is the coordination surface, not a new silo.

The idea becomes misaligned if the product invents live weather, vendor availability, legal compliance, payment status, or sent-message status from text alone. Every second-order card must distinguish evidence from recommendation.

## Current Implemented Foundation

Already implemented:

- Weather and wet-weather backup loop cards in the response workspace.
- Email/contact closure loop cards in the response workspace.
- Selected shortlist decision scope carried into loop copy and task suggestions.
- Projection-ready AFP task candidates when no existing backup/follow-up task closes a loop.
- Existing task projection queue reuse, so loop tasks can become searchable task messages.
- Approval gating for vendor-facing contact/send/share actions.
- Destination arrival guidance for selected decisions, Tasks, Calendar, Knowledge Graph, Files, Search, Threads, and Decision Queue.
- Dedicated second-order loop state helper so weather, contact, commitment, logistics, and budget loop logic does not bloat the response workspace view-model.
- Shared sidebar-action contract so second-order loops, navigation, action panels, and workspace components can share handoff semantics without importing back through the response workspace view-model.
- Visible task-candidate copy in the second-order sidebar cards before the candidate is saved through the existing projection queue.
- Structured second-order task metadata on generated task candidates, including loop kind, evidence labels, selected decision scope, and linked artifact IDs.
- AFP task projection preserves second-order loop metadata and searchable terms so future Tasks, Search, and Knowledge Graph refinements can filter by loop family without parsing notes.
- Knowledge Graph projection now converts second-order task metadata into risk nodes and `next_action` edges, making loop closure visible as topology rather than only as a task list entry.
- The existing wedding Tasks timing hierarchy now shows loop-family and evidence chips for second-order tasks without creating a separate contingency task board.
- Persisted workspace reload preserves second-order task metadata from saved AFP task messages, so loop context survives refresh, search reload, and reopened response workspaces.
- Loop duplicate detection now treats structured `second_order_loop` metadata as closure evidence before falling back to keyword matching in task titles and notes, so generic saved task titles do not cause repeated task suggestions.

## Implementation Principles

Second-order loops should follow these rules:

- Evidence first: derive status from artifacts, task items, schedule items, approval receipts, selected decisions, and saved context.
- Conservative language: say `Needs check`, `Evidence found`, `Task suggested`, or `Provider not connected`; do not claim closure without an AFP task/calendar/receipt.
- Existing surfaces only: route tasks to Tasks, dates to Calendar, dependencies to Knowledge Graph, files to Files, and decisions to Decision Queue.
- Approval before execution: never send, share, contact, book, invite, publish, or modify external calendars without explicit approval and a connected executor.
- Selected scope first: when a user ticks a venue/vendor/celebrant, loop tasks and next actions should target that option while preserving alternatives as auditable comparison context.
- No duplicate noise: do not create a suggested task when a matching task already exists; prefer structured `second_order_loop` metadata over brittle prose matching.
- Searchable by design: task notes and metadata should include the loop kind, selected scope, plan/workspace IDs, and linked artifact where available.
- Provider-ready later: weather, email, calendar, payment, registry, vendor-directory, or map integrations should write back to the same AFP task/calendar/approval/artifact shapes.

## High-Value Loop Families

### 1. Weather And Backup Loop

Purpose:

- Prevent outdoor or location-dependent plans from looking complete before backup evidence exists.

Evidence:

- Venue/location/outdoor language in artifacts.
- Backup, contingency, wet-weather, fallback, indoor-option language.
- Existing backup/weather tasks.
- Existing weather-check dates.
- Selected venue/vendor scope.

User experience:

- Show whether backup evidence exists.
- Suggest one task if no task closes the loop.
- Route to Tasks or Knowledge Graph rather than a new contingency page.

Status: initial implementation complete.

### 2. Email And Contact Closure Loop

Purpose:

- Prevent approval-gated drafts and vendor contacts from disappearing after generation.

Evidence:

- Email draft artifacts.
- Approval receipts for `send_email` or `contact_vendor`.
- Existing vendor follow-up tasks.
- Selected venue/vendor/celebrant scope.

User experience:

- Show draft count, sent/contact receipt count, and follow-up task count.
- Suggest one response-follow-up task if no follow-up task exists.
- Keep execution approval-gated.

Status: initial implementation complete.

### 3. Legal, Deposit, And Contract Timing Loop

Purpose:

- Prevent critical commitments from being treated as safe before legal timing, deposit timing, and contract review are visible.

Evidence:

- NOIM/legal/celebrant artifacts and tasks.
- Deposit due dates, payment language, contract-review dates, or contract-summary artifacts.
- Calendar items with `deposit_due`, `contract_review`, or `noim_reminder` kinds.
- Existing tasks with legal, deposit, contract, payment, terms, or review language.

User experience:

- Show whether commitment timing has evidence.
- Distinguish legal timing from financial/contract timing when possible.
- Suggest one task to verify legal/deposit/contract commitments if none exists.
- Do not claim a form has been lodged, a deposit paid, or a contract reviewed unless an explicit AFP receipt or user-provided evidence says so.

Status: initial implementation complete.

### 4. Transport, Access, And Guest Logistics Loop

Purpose:

- Prevent venue recommendations from ignoring how guests actually arrive, move, sit, and leave.

Evidence:

- Guest count, accessibility, transport, accommodation, parking, shuttle, taxi, mobility, stairs, pram, elderly guest, or wheelchair language.
- Map/location artifacts.
- Existing transport/accessibility tasks.

User experience:

- Show whether transport/access assumptions are known or missing.
- Suggest a task only when venue/location evidence exists and no logistics task exists.
- Later route to map/search providers, but initially stay as task/graph evidence.

Status: initial implementation complete.

### 5. Budget Drift And Unknown-Cost Loop

Purpose:

- Prevent shortlist recommendations from hiding unknown costs, minimum spends, overtime, tax, service fees, travel fees, or cancellation terms.

Evidence:

- Budget sheet artifacts.
- Unknown/TBC/estimate/caveat labels.
- Vendor table pricing.
- Existing budget review tasks.

User experience:

- Show hidden-cost warnings.
- Suggest a budget-review task when estimates are present but verification is missing.
- Do not invent totals from incomplete evidence.

Status: initial implementation complete.

## UX Contract

Second-order cards should be compact and practical:

- `Title`: names the loop.
- `Status`: short evidence state, such as `Needs backup check` or `Commitment timing needs review`.
- `Detail`: one sentence explaining why the loop matters.
- `Evidence strip`: compact labels from artifacts, tasks, dates, receipts, and selected decisions.
- `Next action`: one deterministic action.
- `Action button`: opens existing Tasks, Calendar, Knowledge Graph, or approval surface.
- `Suggested task`: optional projection-ready task candidate when no existing task closes the loop.

Every suggested task should be reversible because it enters the normal projection queue before persistence. The user can review and save it like other planning outputs.

## Trust Guardrails

- Do not claim live weather has been checked unless a weather provider writes a dated result.
- Do not claim a vendor has been contacted unless an approval receipt or connected provider result exists.
- Do not claim a legal form is lodged unless the user uploads proof or an integration/source confirms it.
- Do not claim a deposit is paid unless a user-provided receipt or payment integration confirms it.
- Do not claim a contract is safe; say `contract review needed` unless reviewed evidence exists.
- Do not create multiple tasks for the same loop if one task already covers it.

## Implementation Order

1. Preserve weather/backup and contact/follow-up loops.
2. Add legal/deposit/contract timing loop.
3. Add transport/access/guest logistics loop.
4. Add budget drift/unknown-cost loop.
5. Add provider-backed weather/email/calendar evidence writers later.

## Production Readiness Criteria

- Loop cards are evidence-based and tested.
- Suggested tasks enter the existing projection queue as AFP task messages.
- Existing tasks suppress duplicate suggestions, including metadata-only saved tasks with generic titles.
- Selected decision scope appears in loop text and task notes.
- Destination surfaces do not become wedding-specific beyond arrival banners and task hierarchy flair.
- Typecheck and line-budget tests pass.
