# Wedding RSVP implementation tasks

Status: active
Parent: WED-303
Specification: `wedding-rsvp-spec.md`
Baseline: `f119f48ee96a44117b52eba3c60966af86cf794f`

## Working rules

- Extend the existing guest/boundary AFP objects, `WeddingGuestTrackingState`, Guest Operations, People/Home aggregates and Seating projection.
- Do not introduce a second guest store, duplicate response counter or browser-authoritative RSVP state.
- Every durable mutation is account- and wedding-scoped and idempotent.
- A2UI emits bounded intents; authoritative handlers validate and append AFP events.
- Sensitive fields are couple-only by default and vendor sharing is false-default with preview and approval.
- New files remain below 999 lines. Split existing files before they approach the limit.
- Core projection, validation and counts make zero model calls.
- Run focused tests after each slice; run typecheck, Wedding tests, build and line budgets before a release candidate.

## WED-303A — shared response projection and persistence repair

Status: in progress

### Work

- [x] Add lifecycle fields to the existing event-invitation contract: response source, viewed/responded/locked timestamps, prior status and revision.
- [x] Round-trip guest contact, meal, dietary and accessibility values through the existing AFP serializer/parser.
- [x] Default newly created guest profiles containing private logistics to `couple_only`.
- [x] Preserve multiple event invitations per person instead of selecting one by `person_id`.
- [x] Add a pure RSVP response summary projector over the existing guest rows/invitations.
- [x] Derive complete, incomplete, awaiting, changed and locked states without treating unknown as complete.
- [x] Add provenance and private-data labels to Guest View.
- [x] Make the existing Home guest tile use the same response totals and call out incomplete/changed replies.
- [x] Keep manual response entry on the existing AFP writer and record it as couple-entered.

### Acceptance

- A persisted manual RSVP rehydrates the same contact, meal, dietary and accessibility fields.
- Two event invitations for one person both survive projection.
- Attending without a required meal is visibly incomplete.
- Home and Guests return identical total/replied/awaiting counts from one projector.
- Changed and manual responses have truthful provenance.
- No public guest route or feature flag is enabled.

### Tests

- [x] RSVP response projector unit tests.
- [x] guest tracking multi-event and rehydration tests.
- [x] persisted boundary object round-trip tests.
- [x] Home overview shared-count tests.
- [x] Guest card render and 320-pixel layout tests.

## WED-303B — canonical response event and command validation

Depends on: WED-303A

- [x] Define a versioned `wedding_rsvp_response.v1` AFP object compatible with the A projection.
- [x] Add random response IDs, invitation/person/event references, source, revision, idempotency key and supersedes reference.
- [x] Separate public attendance from encrypted private answer payloads.
- [x] Add server validation for wedding/invitation/event scope, entitlements, controlled questions, required fields and response lock.
- [x] Append response and impact receipt atomically; reject stale revisions and replay exact idempotency keys.
- [x] Project the response object into the same `WeddingGuestTrackingState` contract.
- [x] Add deterministic consequence explanations for Home, seating, catering, tasks and final count.
- [x] Add cross-account, cross-wedding, cross-household and forged-reference tests.

Acceptance: a valid command produces one response event and one bounded impact receipt; retries do not double-count; invalid scope fails closed without revealing guest existence.

## WED-303C — invitation capability service

Depends on: WED-303B

- [x] Add a migration for invitation capability digests, scope, expiry, revocation and rate-limit metadata only if existing share-grant infrastructure cannot be safely generalized.
- [x] Reuse the run-sheet share grant security pattern where applicable: 256-bit token, digest at rest, exact scope, expiry, revoke and constant-shape errors.
- [x] Generate/regenerate/revoke links through authenticated couple commands.
- [x] Prevent raw capability values in AFP, logs, traces and analytics.
- [x] Add open/submit throttles and abuse telemetry without answer content.
- [x] Add disposable-Postgres tests for collision, expiry, revocation, replay and concurrent submission.
- [x] Keep the production flag false.

Acceptance: only a live capability can read the exact invitation scope; a capability cannot enumerate or reach another household, wedding or account.

## WED-303D — controlled RSVP setup in Guests

Depends on: WED-303B

- [x] Add event setup/reuse, deadline and controlled question library to the existing Guests surface.
- [x] Support attendance, meal choice, dietary/allergy category + detail, accessibility, travel, accommodation and a bounded custom question.
- [x] Add per-person/per-event entitlements, named/unnamed plus-one and child age/seat/meal requirements.
- [x] Preview the exact invitation for each household before publishing.
- [x] Add paper/phone/manual-response flow through the canonical response command.
- [x] Add A2UI cards for setup gaps and bounded actions.
- [x] Make publish/send an explicit, confirmation-gated action.

Acceptance: setup changes existing AFP records; preview and link creation send nothing; no free-form schema can bypass field/privacy rules.

## WED-303E — public mobile guest response surface

Depends on: WED-303C, WED-303D

- [x] Add a small public RSVP route that exchanges a capability without persisting it in browser history or telemetry.
- [x] Render couple/event identity, named recipients and only entitled fields.
- [x] Add household shortcut with visible per-person results.
- [x] Apply conditional steps so declined guests skip irrelevant questions.
- [x] Show collection notice before sensitive fields and make optional fields explicit.
- [x] Add review, submit receipt and amendment flow.
- [x] Provide generic invalid/expired/revoked states and a safe couple-contact fallback.
- [x] Add 320/375/1280 pixel, 200% zoom, keyboard, screen-reader and slow-network tests.
- [x] Keep attribution optional and secondary; never require account creation.

Acceptance: the core no-special-needs path is short and comprehensible, no other household data is visible, focus survives validation, and one submission produces one AFP response.

## WED-303F — automatic downstream reconciliation

Depends on: WED-303B

- [x] Update seating eligibility/unassigned counts from canonical attendance.
- [x] Update catering/headcount projection while preserving contractual commitments.
- [x] Create deterministic missing-meal/dietary/accessibility follow-up candidates.
- [x] Create late-change exception after catering/seating lock rather than overwriting committed state.
- [x] Show connected-change explanation and source links.
- [x] Add final-count and budget-impact tests.
- [x] Prove Home, Guests, People, Seating and export count agreement.

Acceptance: a response is entered once and every dependent view reconciles; no vendor commitment changes silently.

## WED-303G — reminders and communications

Depends on: WED-303B, WED-303C

- [x] Build household-level outstanding/reminder candidates from the shared projector.
- [x] Respect deadline, viewed/responded state, quiet hours, contact permissions and prior reminder receipt.
- [x] Allow optional deterministic template or requested small-model draft.
- [x] Persist any generated draft with sources, model/cost, approval and revision history.
- [x] Require exact recipient/content/channel preview and approval before sending.
- [x] Record provider acceptance, delivery/failure and retry decisions separately.
- [x] Never message declined/complete households or use contacts for marketing.

Acceptance: reminders are deduplicated, approval-gated and limited to outstanding scoped recipients.

Implementation note: the server reloads the exact couple-owned AFP draft and
approval before sending one permitted recipient through the reviewed mail
adapter. A deterministic reservation prevents concurrent duplicates, while
provider acceptance, delivery, failure and retry decisions remain distinct AFP
events. `OMNYID_WEDDING_RSVP_REMINDER_SEND_ENABLED` remains false by default.

## WED-303H — exports and minimum-necessary vendor sharing

Depends on: WED-303F

- [x] Add couple CSV export with provenance and event-specific responses.
- [x] Add caterer and venue projections over the same guest IDs.
- [x] Exclude contact, private notes and accessibility details by default.
- [x] Require exact field/recipient preview and explicit approval for a vendor brief.
- [x] Record export/share receipt, correction and revocation where supported.
- [x] Distinguish allergy, coeliac and preference; never infer health facts from meal choice.

Acceptance: exports reconcile with the UI and every sensitive vendor field has purpose, preview and approval evidence.

## WED-303I — rollout evidence

Depends on: WED-303A through WED-303H

- [x] Freeze one full 40-character SHA and use a clean release worktree.
- [x] Run typecheck, full Wedding tests, production build and line budgets.
- [x] Run focused Rust, migration and disposable-Postgres suites.
- [x] Run adversarial token, cross-tenant, forged event, duplicate/retry and late-lock scenarios.
- [ ] Run hosted accessibility and couple/guest usability scenarios.
- [x] Run hosted shadow with RSVP publish/send/provider flags off.
- [ ] Pilot with an allowlisted cohort and explicit rollback.
- [ ] Record exact deployed SHA, health/version, feature flags and rollback evidence. Exact SHA, routes, flags, backup and health are recorded for `eff62d1c44d3140d9fa2edae04cc4cbfcd65ba21`; a new rollback drill is still outstanding.

Acceptance: evidence distinguishes local simulation, hosted shadow, provider acceptance and actual guest receipt; no gate is marked passed by assertion alone.

## Scenario matrix

At minimum, automate these scenarios before enabling public collection:

1. one adult accepts with no special requirements;
2. one adult declines and sees no meal questions;
3. two-person household splits attendance;
4. one person has different responses to ceremony and reception;
5. named child requires age band, meal and seat;
6. allowed unnamed plus-one is added within entitlement;
7. unentitled plus-one is rejected without revealing policy internals;
8. allergy detail is private and excluded from a general export;
9. accessibility answer is optional and private;
10. response is incomplete because a required meal is missing;
11. couple enters a phone response with manual provenance;
12. guest amends before lock;
13. guest attempts amendment after lock and creates an exception;
14. expired and revoked capabilities return a generic safe result;
15. another household/account cannot read or write the invitation;
16. duplicate submission is idempotent;
17. concurrent stale submission loses safely;
18. Home, Guests, People and Seating counts agree after each event;
19. reminder excludes completed/declined households;
20. approved vendor brief contains only previewed fields.

## Definition of done for the current session

- [x] Source direction inspected.
- [x] Existing guest/RSVP architecture inventoried.
- [x] Specification written against current architecture.
- [x] Dependency-ordered implementation plan written.
- [x] WED-303A code and focused tests complete.
- [x] Required repository checks complete.
- [x] Coordination records and commit complete.
