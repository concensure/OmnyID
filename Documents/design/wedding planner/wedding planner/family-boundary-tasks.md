# Family Boundaries Development Tasks

Task: WED-306
Order: dependency order, not UI order
Rule: extend the canonical AFP guest model and A2UI resolver; do not create a parallel guest or permission store.

## 0. Baseline and release controls

- [x] Read the current family-boundary requirements and inspect the existing boundary, guest, RSVP, seating and permission projections.
- [x] Register WED-306 and freeze its file scope.
- [ ] Record exact pre-change and candidate SHAs.
- [ ] Keep policy V2 and unrelated public/provider flags at their current approved values.
- [ ] Build and deploy only a clean exact SHA; evidence must name that full SHA.

## 1. Immediate mobile and intake repairs

Depends on: 0

- [x] Remove technical WebP/size copy from couple-facing onboarding.
- [x] Make atmosphere photograph choices true toggles with exact-token matching so a second selection removes the choice without damaging typed words.
- [x] Remove the outer desktop glass border and redundant horizontal inset from authenticated Wedding mobile views while preserving internal card structure.
- [ ] Add focused rendering tests for the helper copy, selected/unselected state and mobile shell classes.
- [ ] Verify at 320 px, 375 px and 200% text zoom.

## 2. Canonical meal-choice catalogue

Depends on: 0

- [x] Add a deterministic projector for explicit structured `meal_choices`, `meal_options` or `menu_options` fields in venue/package, vendor-conversation and run-sheet evidence.
- [x] Add a couple-confirmed `wedding_meal_choice_catalogue` AFP event with source reference, revision, zero model calls and couple-only visibility.
- [x] Remove invented default meals from RSVP setup.
- [x] Let the couple choose a source, edit choices and explicitly confirm the current catalogue before saving RSVP setup.
- [x] Use the confirmed catalogue as the guest meal selector while preserving an explicit manual-current-choice path.
- [ ] Add a Plan/day-details editor over the same catalogue event rather than a second store.
- [ ] Add quote-normalisation output mapping for explicit meal/menu arrays; never extract a choice from prose without reviewed structured evidence.
- [ ] Preview affected RSVP responses before replacing a catalogue already used by guests.
- [ ] Add tests for provenance, workspace isolation, revisions, deduplication and separation from dietary/allergy facts.

## 3. Compact Family boundaries card

Depends on: 0

- [x] Replace ambiguous Rules/People/Shared headline metrics with Requests and Households.
- [x] Collapse detailed controls by default and open Requests or household/visibility context from the corresponding metric.
- [x] Retain the current AFP-backed request, rule and visibility controls behind disclosure.
- [x] Add plain-language privacy/suggestion-versus-approval help.
- [ ] Restore focus on collapse and focus the requested subsection on open.
- [ ] Add rendering, keyboard, screen-reader name and 320 px reflow tests.

## 4. Household and family-group foundation

Depends on: 3

- [ ] Add typed `family_group` allocation and household assignment events to the existing boundary ledger contract.
- [ ] Project household representative, group, named invitation count, allocation, RSVP status, pending request count and last activity.
- [ ] Add sorting by attention, remaining allocation, RSVP status, activity and deadline.
- [ ] Support safe split/merge/archive commands with preview and stable guest/invitation references.
- [ ] Add CSV/table import through the existing import and review pipeline; do not bypass parser/quarantine controls.
- [ ] Test divorced/blended family, adult privacy and invitation-group-versus-residential-household cases.

## 5. Structured policy builder and effective-rule projection

Depends on: 4

- [ ] Extend rule creation with type, scope, condition, effect, authority, effective period, visibility, status and override policy.
- [ ] Make conditional fields mandatory for allocations, deadlines and scoped rules.
- [ ] Project effective rules with inherited source explanations.
- [ ] Enforce type-aware precedence; a specific invitation rule cannot override system privacy.
- [ ] Detect same-level conflicts and require resolution instead of choosing by an opaque numeric rank.
- [ ] Add versioned supersede/archive commands and impact preview for rules affecting sent invitations.

## 6. Server-authoritative grants

Depends on: 4, 5

- [ ] Define Couple, delegated Planner, Family helper and RSVP guest capabilities with record-level scopes.
- [ ] Reuse the existing digest-only expiring/revocable capability boundary where possible.
- [ ] Enforce account, wedding, household, principal and action on every route.
- [ ] Separate view, propose and approve permissions.
- [ ] Immediately refuse revoked links and delegated access.
- [ ] Test forged household IDs, forwarded links, cross-tenant reads/writes and planner privilege escalation.

## 7. Request lifecycle and atomic decisions

Depends on: 5, 6

- [ ] Implement draft, pending, approved, partially approved, declined, withdrawn, expired and auto-blocked transitions.
- [ ] Require idempotency keys for request and decision commands.
- [ ] Revalidate rule version, allocation version, identity conflicts and current capacity inside the approval transaction.
- [ ] Reserve capacity and apply an approved guest mutation atomically.
- [ ] Support single and configurable two-partner elevated approval without applying the first partial approval.
- [ ] Return existing receipts on retry and reviewable conflicts on stale versions.
- [ ] Test two simultaneous requests for the last seat and repeated approval clicks.

## 8. Impact preview and reconciliation

Depends on: 7

- [ ] Preview affected guests, invitation entitlement, RSVP, seating, catering exposure, budget forecast and tasks before material approval.
- [ ] Reconcile approved changes into the canonical guest projection and emit one downstream receipt per projector.
- [ ] Never infer attendance, send an invitation, commit spend or change a vendor contract without separate authority.
- [ ] Keep private seating-conflict reasons out of helper and guest projections.
- [ ] Add retry-safe reconciliation and a visible explanation of connected updates.
- [ ] Test removal after RSVP, household split after RSVP, sent-invitation policy change and seating conflict privacy.

## 9. Bulk operations

Depends on: 5, 7, 8

- [ ] Assign households to a group with affected-record preview.
- [ ] Change allocation with committed, named, accepted and expected quantities shown separately.
- [ ] Apply group plus-one policy while preserving authorised exceptions.
- [ ] Change representatives with immediate old-grant revocation and pending-request review.
- [ ] Close/reopen request windows without deleting submitted requests.
- [ ] Require elevated confirmation for bulk changes affecting sent or accepted invitations.

## 10. Privacy, retention and audit

Depends on: 6, 7

- [ ] Store sensitive private values in controlled mutable records; immutable events use references/redacted snapshots.
- [ ] Minimise helper/guest projections field by field.
- [ ] Add revocation, expiry and deletion/retention tests.
- [ ] Record actor, causation, expected versions, decision and reconciliation references without duplicating private content.
- [ ] Run security/privacy review for cross-scope disclosure and forwarded capabilities.

## 11. Accessibility, usability and rollout

Depends on: 1–10 as applicable

- [ ] Run typecheck, focused tests, all Wedding tests, Rust route/database tests, line budgets and production build.
- [ ] Run keyboard, focus restoration, screen-reader naming, colour-independent status, 320/375 px and 200% zoom checks.
- [ ] Run couple usability for request review, household attention and rule comprehension.
- [ ] Run delegated-helper usability with deliberately restricted data.
- [ ] Verify exact-candidate hosted flags-off shadow before any capability cohort.
- [ ] Release in an allowlisted cohort; observe authorisation refusals, stale conflicts, duplicate suppression and reconciliation errors.
- [ ] Promote only after objective rollout criteria pass.

## Current implementation boundary

The checked items constitute the first couple-facing slice: native mobile shell, reversible onboarding imagery, source-confirmed meal choices, and a compact boundary summary over the existing ledger. Server-authoritative grants, atomic allocation decisions, bulk household operations and full reconciliation remain required before presenting Family Boundaries as complete governance for outside family helpers.
