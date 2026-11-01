# Family Boundaries Development Tasks

Task: WED-306
Order: dependency order, not UI order
Rule: extend the canonical AFP guest model and A2UI resolver; do not create a parallel guest or permission store.

## 0. Baseline and release controls

- [x] Read the current family-boundary requirements and inspect the existing boundary, guest, RSVP, seating and permission projections.
- [x] Register WED-306 and freeze its file scope.
- [x] Record exact pre-change and candidate SHAs.
- [x] Keep policy V2 and unrelated public/provider flags at their current approved values.
- [x] Build and deploy only a clean exact SHA; evidence must name that full SHA.

## 1. Immediate mobile and intake repairs

Depends on: 0

- [x] Remove technical WebP/size copy from couple-facing onboarding.
- [x] Make atmosphere photograph choices true toggles with exact-token matching so a second selection removes the choice without damaging typed words.
- [x] Remove the outer desktop glass border and redundant horizontal inset from authenticated Wedding mobile views while preserving internal card structure.
- [x] Add focused rendering tests for the helper copy, selected/unselected state and mobile shell classes.
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
- [x] Restore focus on collapse and focus the requested subsection on open.
- [ ] Add rendering, keyboard, screen-reader name and 320 px reflow tests.

## 4. Household and family-group foundation

Depends on: 3

- [x] Add typed `family_group` allocation and household assignment events to the existing boundary ledger contract.
- [x] Project household representative, group, named invitation count, allocation, RSVP status, pending request count and last activity.
- [x] Add sorting by attention, remaining allocation, RSVP status, activity and deadline.
- [x] Let the couple revise a household's group label, invitation allocation and request deadline by writing a successor household AFP object; do not keep a second local household store.
- [x] Add deterministic split/merge/archive previews that preserve stable guest/invitation references and refuse unsafe archive/merge states.
- [x] Connect those previews to server-authoritative split/merge/archive commands with stale-version protection.
- [ ] Add CSV/table import through the existing import and review pipeline; do not bypass parser/quarantine controls.
- [ ] Test divorced/blended family, adult privacy and invitation-group-versus-residential-household cases.

## 5. Structured policy builder and effective-rule projection

Depends on: 4

- [x] Extend the policy contract and couple-facing rule builder with type, scope, condition envelope, effect, authority, effective period, visibility, status and override policy.
- [x] Make conditional fields mandatory for allocations, deadlines and scoped rules.
- [x] Project effective rules with inherited source explanations.
- [x] Enforce type-aware precedence; a specific invitation rule cannot override system privacy.
- [x] Detect same-level conflicts and require resolution instead of choosing by an opaque numeric rank.
- [x] Add versioned supersede/archive commands and impact preview for rules affecting sent invitations.

## 6. Server-authoritative grants

Depends on: 4, 5

- [x] Define Couple, delegated Planner, Family helper and RSVP guest capability presets with record-level scopes; authenticated Planner/RSVP routes are owner-allowlisted and false-default.
- [x] Reuse the existing digest-only expiring/revocable capability boundary for the family-helper slice.
- [x] Enforce account, wedding, household, principal and action on the new helper routes.
- [x] Separate view and propose permissions; helper grants never receive approval authority.
- [x] Immediately refuse revoked or expired family-helper links.
- [x] Test forged household IDs, forwarded links, cross-tenant reads/writes and planner privilege escalation.
- [x] Give the couple one owner-facing access surface to inspect, create and revoke Family helper, Planner and RSVP-guest grants without redisplaying capability tokens.

## 7. Request lifecycle and atomic decisions

Depends on: 5, 6

- [ ] Implement draft, pending, approved, partially approved, declined, withdrawn, expired and auto-blocked transitions.
- [x] Require idempotency keys for helper request and couple decision commands.
- [x] Revalidate referenced rule versions, household revision, identity duplication and current allocation inside the add-guest approval transaction.
- [x] Reserve capacity and apply an approved add-guest mutation atomically, while keeping the invitation unsent.
- [x] Support single and configurable two-partner elevated approval without applying the first partial approval.
- [x] Return existing receipts on exact retry and reviewable conflicts on stale request, rule or household versions.
- [x] Test repeated/duplicate approval identities, partial approval without mutation, and exact second-partner application against disposable PostgreSQL.
- [x] Keep only pending and partially approved requests in the review queue; project an elapsed deadline as terminal expiry and refuse any later mutation.

## 8. Impact preview and reconciliation

Depends on: 7

- [x] Preview affected guest-list, invitation, RSVP, seating, catering, budget and task areas before add-guest approval.
- [x] Reconcile an approved add-guest request into the canonical household/guest/invitation ledger and emit one aggregate downstream impact receipt.
- [x] Never infer attendance, send an invitation, commit spend or change a vendor contract from the family-boundary approval.
- [x] Keep private seating-conflict reasons out of helper and guest projections.
- [x] Add retry-safe reconciliation and a visible explanation of connected updates.
- [x] Test removal after RSVP, household split after RSVP, sent-invitation policy change and seating conflict privacy.

## 9. Bulk operations

Depends on: 5, 7, 8

- [x] Assign households to a group through one stale-safe bulk command and affected-record receipt.
- [x] Change allocation through one stale-safe bulk command; the richer committed/named/accepted UI breakdown remains open.
- [x] Apply group plus-one policy while preserving authorised exceptions.
- [x] Change representatives with immediate old-grant revocation and pending-request review.
- [x] Close/reopen request windows without deleting submitted requests.
- [x] Require elevated confirmation for bulk changes affecting sent or accepted invitations.

## 10. Privacy, retention and audit

Depends on: 6, 7

- [x] Store sensitive private values in controlled mutable encrypted records; immutable events use references/redacted snapshots.
- [x] Minimise helper/guest projections field by field.
- [x] Add revocation, expiry and deletion/retention tests.
- [x] Record actor, causation, expected versions, decision and reconciliation references without duplicating private content.
- [x] Run security/privacy review for cross-scope disclosure and forwarded capabilities. Evidence: `Documents/verification/wed-312-family-boundary-access-assurance-2026-11-01.md`.

## 11. Accessibility, usability and rollout

Depends on: 1–10 as applicable

- [x] Run typecheck, focused tests, all Wedding tests, Rust route/database tests, line budgets and production build for the current local candidate.
- [ ] Run keyboard, focus restoration, screen-reader naming, colour-independent status, 320/375 px and 200% zoom checks.
- [ ] Run couple usability for request review, household attention and rule comprehension.
- [ ] Run delegated-helper usability with deliberately restricted data.
- [x] Verify exact-candidate hosted flags-off shadow before any capability cohort. Oracle release `eb398ebfecaec6a0277d7fe634e6c97198b44afe` serves the matching migration and routes while helper/delegate switches remain unset/false-default; unauthenticated delegated routes return 404.
- [ ] Release in an allowlisted cohort; observe authorisation refusals, stale conflicts, duplicate suppression and reconciliation errors.
- [ ] Promote only after objective rollout criteria pass.

## Current implementation boundary

The checked items now include the couple-facing and server-authority foundation: native mobile shell, reversible onboarding imagery, source-confirmed meal choices, compact boundary summary, typed family groups and rules, deterministic household and conflict previews, AFP-backed household revisions, false-default digest-only family-helper grants, minimum-necessary helper projections, idempotent request decisions, stale policy/household checks, and an atomic add-guest approval that creates an unsent invitation draft and one impact receipt.

WED-309 adds the next server-authority slices: atomic stale-safe household split/merge/archive and bounded bulk commands, explicit remove/plus-one/invitation/contact-label request mutations, configurable two-partner partial approval, authenticated minimum-necessary Planner/RSVP grants, opaque mutable encrypted private notes, serialized last-seat approvals, group plus-one policies with named exceptions, immediate representative-change grant revocation, a flags-off helper shadow assertion, and live disposable PostgreSQL/ClamAV evidence. The first partner approval records progress but applies no connected mutation; a different active couple-role identity must provide the second approval. Delegates can only see their scoped projection and submit a pending request; they never receive couple approval authority or private-note access.

WED-311 connects the review preview to the server's elevated-impact confirmation instead of trusting a field on the older request event. Removing a guest after an accepted RSVP now archives the active guest and closes the invitation while retaining the immutable RSVP response. Decision and household receipts list user-facing connected updates, preserve stable invitation references, carry actor/causation/expected-version references and replay exactly once. Planner, helper and RSVP-guest projections use explicit allowlists; dietary/contact/private-note and seating-conflict fields are excluded. The Couple surface now exposes server-authoritative rule replacement/archive and household split/merge/archive commands. Each command revalidates current versions, previews sent or accepted invitation impact, requires elevated confirmation when necessary, retains immutable response history and returns the original receipt on exact retry.

WED-312 adds the owner-facing access-management surface for Family helpers, authenticated Planners and RSVP guests. It reveals a helper token once, persists only its digest, distinguishes link access from account-bound access, exposes no owner/account identifiers through capability discovery, and keeps both rollout switches false by default. Allocation, deadline and scoped rules now reject incomplete structured conditions on both sides of the API. Only pending and partially approved requests remain reviewable; elapsed deadlines close requests without applying a guest, RSVP, invitation, budget or vendor mutation.

This is not the end of the roadmap. A controlled allowlisted Family cohort, the hosted accessibility/usability matrix, CSV/table import, the shared Plan/day-details meal editor and catalogue-replacement impact review remain open. Expiry, revocation, deletion retention, restricted projection allowlists, removal after RSVP and sent-invitation rule changes are covered locally. The exact-candidate flags-off Oracle shadow is recorded in `Documents/verification/wed-310-rsvp-release-2026-11-01.md`. `OMNYID_WEDDING_BOUNDARY_HELPERS_ENABLED` and `OMNYID_WEDDING_BOUNDARY_DELEGATES_ENABLED` stay false unless the remaining hosted rollout criteria pass.

Release evidence for this slice is in `Documents/verification/wed-306-native-mobile-meal-family-boundaries-2026-10-31.md`. The pre-change coordination SHA was `3bd1f79fdae00c370556b504e0fde1daf66cc36f`; the exact deployed application SHA is `3c626dd149d61ae57c739fa90cd26acecb0109aa`.
