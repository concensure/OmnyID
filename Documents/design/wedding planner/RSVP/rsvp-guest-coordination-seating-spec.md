# RSVP Guest Coordination and Seating Integration Specification

Status: implementation specification  
Task: WED-346  
Date: 2026-11-09

## Outcome

OmnyID should close the loop from invitation to response, guest request, approval, seating and catering without asking the couple to reconcile the same fact in several views. Family Boundaries remains the permission and approval authority; **Guest coordination** is the couple-facing experience.

This extends the existing RSVP, guest tracking, Family Boundaries and visual seating projections. It does not create a second guest list, RSVP database, reminder ledger or seating model.

## Product principles

1. The canonical account- and wedding-scoped AFP ledger is the source of durable state. UI cards are projections.
2. A response received by link, email, agent message, phone or conversation becomes one reconciled RSVP state with source evidence.
3. Accessibility, allergy and safety requirements are not presented as optional preferences.
4. A request is not an entitlement. Plus-one, replacement guest and sensitive seating changes require the configured authority.
5. Routine deterministic work does not require an LLM. Templates and rules handle deadlines, status, entitlements, capacity and reminders.
6. An LLM may classify ambiguous free text or draft a tactful reply, but its output is an AFP draft with source references, cost, revision and approval state. It never sends or rejects a sensitive request autonomously.
7. Every accepted change visibly explains its connected effects on guest count, meal totals, seating, catering deadline and outstanding decisions.

## Existing authorities to reuse

- `weddingRsvpSetupState`, invitation capabilities and RSVP response commands for event questions and response state.
- `weddingGuestTrackingState` for guest counts and response status.
- `WeddingGuestOperationsCard`, Guest view and RSVP setup/operations panels for couple-facing work.
- `weddingBoundary*` and Family Boundaries for household rules, visibility, delegated authority and approval.
- `weddingSeatingOptimizationState`, `WeddingSeatingPanel` and `WeddingSeatingCanvas` for assignments and the room canvas.
- Existing AFP send, references and account-scoped workspace metadata.
- Existing provider relay and approval-bound outbound messaging for reminders.

## Canonical events and projections

No event stores a separate copy of a guest profile when a stable guest or invitation reference exists.

| Event | Purpose | Important fields |
|---|---|---|
| `wedding_rsvp_setup_revision` | Revisioned questions and deadlines | event, deadline, enabled questions, meal-option source refs |
| `wedding_rsvp_response_recorded` | One reconciled response | invitation ref, attendance, source channel, received time |
| `wedding_guest_request_recorded` | Structured request | request type, requirement/preference class, guest ref, source ref |
| `wedding_guest_request_decided` | Approval outcome | request ref, authority, decision, reason, affected projections |
| `wedding_rsvp_reminder_draft` | Approval-bound reminder | recipients, template/version, deadline reason, source refs |
| `wedding_rsvp_reminder_sent` | Delivery evidence | draft ref, provider receipt, delivery state |
| `wedding_seating_assignment_revision` | Seating changes | guest refs, table refs, prior revision, actor |
| `wedding_guest_coordination_impact` | Connected update receipt | changed guest/meal/seating/task projections and explanation |

Projectors must be replay-safe, tenant/wedding scoped and deterministic. Sensitive dietary, accessibility and relationship details follow the existing encrypted/private field policy; operational counts may be projected without exposing those details.

## Couple experience

### Guest coordination summary

The Guest view shows invited, replied, awaiting reply and requests needing review. Each count opens the matching list in place. The summary identifies the next real deadline and separates “approaching” from “overdue”.

### Response reconciliation

- Link responses update the canonical invitation.
- A couple can record a verbal, phone, text or email response and retain the source label.
- Recording a response stops reminders for that guest.
- Contradictory responses open a review exception; the newest message does not silently overwrite a couple-confirmed state.

### Requests and boundaries

Structured request types include accessibility/visibility, dietary/allergy, sit-with, general seating preference, plus-one, replacement guest and other. Low-risk corrections may apply with an audit receipt. Entitlement or sensitive changes use Family Boundaries and couple approval.

### Seating canvas

The canvas uses the existing seating assignment projection. First-use guidance explains select, place, arrange and save. It supports keyboard/tap selection, single and multi-guest movement, unassigning, table rename, capacity feedback, fit, pan, zoom and full screen. Hover/focus reveals relevant guest notes without exposing private notes to shared/vendor views.

### Reminder sequence

Suggested defaults are configurable and presented as proposals: 14 days and 3 days before the RSVP deadline, 1 day after, 3 days after escalation, and a final catering-cut-off review. A couple can pause a guest, mark unreachable, or confirm through another channel. External sends remain approval-bound.

## A2UI behavior

Actions are intent-led rather than route-led: `rsvp.record_response`, `guest_request.review`, `seating.assign`, `seating.unassign`, `reminder.review` and `guest.open`. The action surface opens in place on mobile and desktop. A2UI receives projection identifiers and action capabilities, never an alternative copy of the underlying state.

## Privacy and security

- All reads and commands require account and wedding authorization.
- Guest-facing capabilities are high-entropy, expiring, revocable and scoped to one invitation/event.
- Shared helper/vendor views receive only explicitly granted fields.
- Reminder drafts disclose the exact recipient, message and shared fields before approval.
- Accessibility and dietary details are not included in analytics, generic research prompts or notification previews.
- AFP references retain provenance without duplicating source message bodies.

## AI and cost policy

Use deterministic rules for deadlines, reminder eligibility, entitlements, capacity, completion and projection updates. Use the configured low-cost wedding model only after an ambiguous message or explicit drafting request. Cache template prefixes, store structured interpretation once, and regenerate only after source facts change. Per-account and per-wedding budgets apply.

## Acceptance measures

- A phone response stops the same reminder sequence as a link response.
- A plus-one request cannot change the invitation without authority.
- An accessibility requirement is visible to authorised planners and seating, but not treated as a preference or leaked to vendors.
- Moving a guest updates one seating revision and all count projections after replay.
- A first-time mobile user can seat and unseat a guest without external instructions.
- No cross-wedding guest, request, seating or reminder state is returned after identifier swapping.
- The UI always distinguishes approaching, overdue, awaiting clarification and unreachable states.

## Rollout

Ship deterministic reconciliation and first-use seating first. Keep automatic external reminders false-default until provider delivery, duplicate suppression, permission wording and hosted tenant isolation evidence pass. Measure administration time saved and unresolved exceptions at the catering cut-off; do not publish unsupported reduction claims.
