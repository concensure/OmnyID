# Invite Proposals dependency-ordered tasks

Task: WED-333
Companion: `invite-proposals-spec.md`

The order below is a dependency graph, not permission to build a parallel
system. Each slice must consume the existing Wedding AFP, A2UI, vendor search,
outreach, Documents, quote, budget and booking authorities.

## IP-00 — Reconcile contracts and guidance

- [x] Read the supplied feature guidance.
- [x] Inventory existing vendor search, ranking V2, favourites, outreach
  approval, relay, quote normalization, Documents, booking and referral flows.
- [x] Record non-goals, security boundaries and rollout boundaries in the spec.
- [x] Confirm that directory-listing proposals are a different contract.

Acceptance: architecture reuse is explicit and no new ledger is proposed.

## IP-01 — Reusable private brief contract

Depends on: IP-00

- [x] Add a pure state builder for category, request, relevant wedding facts,
  category budget, missing material facts, recipients and share controls.
- [x] Add a stable AFP serializer for a private proposal-invitation draft.
- [x] Mark the saved event `pending_user_approval` and `external_action: false`.
- [x] Include source references plus A2UI and Markdown views without secrets.
- [x] Test known facts, privacy defaults, unknown recipients and the cap.
- [x] Add a server-side tenant-scope rejection test for the external-recipient
  transition.

Acceptance: building/saving a brief cannot contact a vendor or mark one
Enquired.

## IP-02 — Dual-mode Wedding Home card

Depends on: IP-01

- [x] Replace the static Find vendors heading with accessible Find vendors and
  Invite Proposals tabs.
- [x] Preserve the mounted search state and lifecycle filters across switches.
- [x] Show the brief and missing facts in the same card.
- [x] Select up to five current comparison vendors.
- [x] Preview explicit share controls; budget and phone remain off by default.
- [x] Save a private draft through the existing `saveProjection` authority.
- [ ] Add 320px/375px, keyboard, focus and axe coverage.

Acceptance: the couple can prepare a persisted private draft in place and is
told unambiguously that no vendor has been contacted.

## IP-03 — Eligibility and recipient policy

Depends on: IP-01, IP-02

- [x] Reuse directory ownership/contact evidence and listing claim state.
- [x] Distinguish direct authenticated vendor, verified contact, unclaimed
  referral-capable vendor and ineligible vendor.
- [x] Enforce category/service-area compatibility and suppression/opt-out.
- [x] Return user-facing exclusion reasons without leaking internal policy.
- [x] Add per-wedding, vendor and destination rate limits. Preview is free;
  only a new approved fingerprint consumes quota.

Current boundary: the UI policy fails closed and the approval route re-runs the
same tenant, listing, category, service-area, suppression and channel checks on
the server before any external transition.

Acceptance: only eligible vendors can enter an approval request; exclusion is
honest and inspectable.

## IP-04 — Convert draft to existing approval-gated enquiries

Depends on: IP-03

- [x] Convert each selected recipient to the existing vendor outreach draft.
- [x] Reuse the current permissions fingerprint and exact-content preview.
- [x] Require one explicit approval for the displayed batch revision while
  retaining one idempotent delivery/thread per vendor.
- [x] Stop or safely resume a partial batch without duplicating sends.
- [x] Reproject successful sends through existing Enquired and follow-up state.
- [x] Test provider acceptance separately from delivery/receipt evidence.

Acceptance: no external action occurs before approval and retry cannot create a
duplicate conversation.

## IP-05 — Vendor response and unclaimed-vendor access

Depends on: IP-04

- [x] Reuse the existing vendor portal/thread and email-reply projection rather
  than adding a proposal inbox.
- [x] Let an unclaimed vendor receive and reply through its verified private
  business email without creating an account. Keep the existing expiring,
  revocable quote capability for a later quote transaction; do not imply that
  an initial email already created a public response link.
- [ ] Capture price, inclusions, exclusions, assumptions, availability evidence,
  validity and attachments as structured response evidence.
- [x] Keep vendor real identity and couple private identity separated by the
  current relay policy.
- [x] Test cross-tenant and replay protection on the new batch transition;
  forged, expired and revoked quote-capability coverage remains owned by the
  existing quotation-response authority.

Acceptance: claimed and unclaimed vendors can respond to only their invitation
without gaining broader account access. Rich structured proposal actions remain
a post-pilot enhancement rather than a second response system.

## IP-06 — Normalize and compare proposals

Depends on: IP-05

- [ ] Send quote attachments through existing scan/storage/parser paths.
- [ ] Run quote normalization once per changed source fingerprint.
- [ ] Project proposal and normalized quote evidence into Documents.
- [ ] Extend the existing comparison artifact with confirmed, conditional,
  missing and excluded rows.
- [ ] Explain ranking in couple-facing evidence language.
- [ ] Never treat source verification as availability or suitability proof.

Acceptance: comparable evidence appears in existing vendor and Documents
surfaces with original evidence preserved.

## IP-07 — Decision, budget and booking closure

Depends on: IP-06

- [ ] Surface the next proposal action through the existing Today decision
  queue and vendor follow-up card.
- [ ] Pause further invitations after enough useful proposals are received.
- [ ] Reuse quote acceptance and booking confirmation authorities.
- [ ] Verify that acceptance updates category commitment, booking, task and
  decision records with one visible reconciliation explanation.
- [ ] Verify expiry, withdrawal, decline and vendor non-response paths.

Acceptance: the couple never manually reconciles connected records.

## IP-08 — Optional AI assistance

Depends on: IP-01, IP-04

- [ ] Add an explicit “Help write this” action; do not generate on input.
- [ ] Retrieve only relevant structured ledger facts.
- [ ] Use the existing funded gateway, cached prefix and cost limits.
- [ ] Persist sources, model, tokens, cost, revision and approval state.
- [ ] Fall back to the deterministic template when unavailable or over budget.

Acceptance: core proposal operation works with AI off and generated claims are
traceable.

## IP-09 — False-default pilot and release evidence

Depends on: IP-03 through IP-08

- [x] Keep multi-recipient send disabled outside an allowlisted cohort.
- [ ] Run tenant-isolation, security/privacy, hosted accessibility and
  couple/vendor usability evidence on one frozen commit.
- [ ] Observe up to 10 couples and 15 vendors for 30 days.
- [ ] Measure useful proposal rate, response time, declines, abuse reports,
  comparison completion and booking progression without storing message body
  in analytics.
- [ ] Prove rollback disables new sends without hiding existing records.

Acceptance: release evidence names the exact full SHA and enabled cohort;
general availability is a separate decision.
