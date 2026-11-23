# RSVP Guest Coordination and Seating Tasks

Status: dependency-ordered delivery plan  
Parent: WED-346  
Specification: `rsvp-guest-coordination-seating-spec.md`

## Delivery rules

- Extend existing RSVP, Family Boundaries, guest and seating authorities.
- Append durable commands to the account/wedding-scoped AFP ledger; do not store parallel UI truth.
- External messages are draft-first and explicitly approved.
- Complete focused tenant-isolation, replay and accessibility tests at each phase.

## Phase 0 — Contract inventory and fixtures

- [x] Identify the existing RSVP setup/response, guest tracking, Family Boundaries and seating projectors.
- [x] Document canonical events, source references and privacy classes in the specification.
- [ ] Add shared Mia/Jordan and Priya/Sam fixtures covering two weddings, households, invitations, requests and tables.
- [ ] Add identifier-swap negative cases for every new command/read.

Depends on: none.

## Phase 1 — Deterministic response reconciliation

- [ ] Add one reconciliation command for link, email/agent, phone, text and verbal responses.
- [ ] Preserve source channel/ref and couple-confirmed precedence without copying source bodies.
- [ ] Stop reminder eligibility immediately after an attending/not-attending response.
- [ ] Surface contradictory or incomplete responses as exceptions.
- [ ] Project replied, pending, needs-details and unreachable counts into the existing Guest view.

Depends on: Phase 0.

## Phase 2 — Structured guest requests and boundaries

- [ ] Add request classes for accessibility/visibility, dietary/allergy, sit-with, preference, plus-one, replacement and other.
- [ ] Reuse Family Boundaries to compute automatic, delegated or couple-required authority.
- [ ] Keep “unknown” distinct from “not permitted” and “rejected”.
- [ ] Apply safe spelling/contact corrections with an audit receipt.
- [ ] Require approval for entitlement, replacement and sensitive seating changes.

Depends on: Phase 1.

## Phase 3 — Guest coordination projection

- [ ] Add the in-place Guest coordination summary and filtered lists.
- [ ] Show the relevant planning/catering consequence beside unresolved responses.
- [ ] Link each exception to its source and action surface.
- [ ] Emit one connected impact receipt after an accepted change updates RSVP, meal, seating and tasks.

Depends on: Phases 1–2.

## Phase 4 — Seating canvas first-use reliability

- [x] Add concise three-step first-use guidance scoped to the wedding.
- [x] Show seated, unassigned and table counts plus accessible placement feedback.
- [x] Allow selected seated guests to return to the unassigned list.
- [x] Retain fit, pan, zoom, full screen, table rename and single/multi-guest placement on the existing assignment model.
- [ ] Add keyboard movement between tables and a reversible last-action command.
- [ ] Show capacity overflow before applying and preserve guest selection when a table cannot accept everyone.
- [ ] Persist table geometry as a revision instead of treating layout as transient display state.

Depends on: Phase 0; Phase 3 for live request indicators.

## Phase 5 — Reminder eligibility and approval

- [ ] Add configurable proposed timings for approaching, overdue, escalation and catering cut-off.
- [ ] Support pause, awaiting clarification, verbally confirmed and unreachable states.
- [ ] Build template-first reminder drafts with exact recipients and disclosed shared fields.
- [ ] Require approval before provider execution and store provider acceptance/delivery separately.
- [ ] Suppress replay, duplicate sends and reminders after a reconciled response.

Depends on: Phases 1 and 3.

## Phase 6 — Ambiguous message interpretation

- [ ] Invoke an LLM only when deterministic classification cannot resolve a message or the couple asks for diplomatic wording.
- [ ] Store source refs, model/cost, structured interpretation, approval state and revision history.
- [ ] Add correction controls and use corrected structured facts for later projections.
- [ ] Enforce account/wedding spend caps and graceful model fallback.

Depends on: Phases 2 and 5. Optional for deterministic launch.

## Phase 7 — Security, accessibility and hosted proof

- [ ] Prove anonymous, cross-account, cross-wedding, revoked and expired capabilities fail closed.
- [ ] Prove replay produces one response/request/assignment/send receipt.
- [ ] Run 375px touch, keyboard, focus, screen-reader and reduced-motion checks.
- [ ] Run disposable Postgres end-to-end journeys with separate browser contexts.
- [ ] Run provider sandbox delivery and duplicate suppression before a controlled allowlist.
- [ ] Record exact full SHA, flags, cohort, restore diff and hosted health evidence.

Depends on: all release phases.

## Current WED-346 slice

- [x] Reuse the Budget evidence hub for uploaded and message-sourced quotes.
- [x] Add list, normalized reading and side-by-side quote modes.
- [x] Make Forecast range open the same intake surface.
- [x] Preserve conversational Master Agent queries rather than displaying Boolean retrieval text.
- [x] Improve first-use seating guidance without creating a parallel seating store.
- [ ] Complete focused type, state, accessibility and production build checks.
