# Microwedding invitation and RSVP UX extension tasks

Status: implementation in progress on WED-386
Parent: WED-385 planning slice; implementation: WED-386
Specification: `microwedding-invitation-rsvp-ux-spec.md`
Research: `microwedding invitation wedding research.md`
Extends: WED-303; do not replace its guest, RSVP, capability or reminder authorities

## Working rules

- Extend current AFP objects, projections, commands and UI surfaces; do not introduce a second invitation or response store.
- Treat preview, test, production delivery, capability open and response as distinct evidence.
- Keep private response plaintext out of the returning public projection.
- Core validation and lifecycle projection are deterministic and make zero model calls.
- Any external test/send action uses exact-recipient/content approval and durable provider receipts.
- Keep production feature flags false-default until exact-SHA hosted evidence passes.
- Each task below must add focused tests before moving to the next dependency.

## MI-RSVP-01 — freeze the reuse and evidence contracts

Priority: P0
Depends on: existing WED-303 implementation

- [x] Inventory the current setup, household preview, capability, response, reminder and decision contracts at the implementation SHA.
- [ ] Record which canonical event fields supply host, date, local time, venue, address, directions and calendar data.
- [ ] Define a pure household-experience projection consumed by both couple preview and public RSVP rendering.
- [ ] Define distinct `preview`, `test` and `production` modes; prove preview/test cannot call the production response command or increment production open evidence.
- [x] Define the guest-safe latest-response projection: attendance, non-sensitive answers, revision, completeness and private-answer-present flags. Lock state remains follow-up work.
- [x] Define the household lifecycle projection over existing capability, provider receipt, open, response and reminder evidence.
- [x] Add contract tests proving the implementation reads existing AFP/capability authorities and adds no response store.

Acceptance: the three projections have explicit source objects, privacy classifications and mutation boundaries before UI work begins.

## MI-RSVP-02 — preview as this household

Priority: P0
Depends on: MI-RSVP-01

- [x] Extend the existing invitation preview projection with host, event, deadline, named-recipient and question/privacy facts.
- [x] Add **Preview as this household** to `WeddingRsvpPublishingPanel`.
- [ ] Render the production guest component in non-submitting Preview mode.
- [x] Show recognisable host identity, named recipients, event, deadline, entitlements and question/privacy treatment available from the current RSVP authority.
- [ ] Add RSVP, Directions and Add to calendar actions only when their source facts exist.
- [ ] Show one material preflight gap with a direct action to fix or inspect its source.
- [ ] Add 320 px, 200% zoom, keyboard and no-horizontal-scroll coverage.

Acceptance: the Rivera missing-address scenario passes and no preview interaction changes capability open counts, invitation lifecycle or responses.

## MI-RSVP-03 — bounded test-to-self delivery

Priority: P1
Depends on: MI-RSVP-02

- [ ] Add a short-lived non-submitting test grant or equivalent authenticated preview URL that cannot be used at production endpoints.
- [ ] Add **Open test view** with no external side effect.
- [ ] Add optional **Send test to me** using the existing approved-message and provider-receipt infrastructure.
- [ ] Preview the exact recipient, subject, recognisable host/sender label, fallback URL and message body.
- [ ] Mark Test in the document title, visible heading and accessible name.
- [ ] Record provider accepted/delivered/failed truthfully without changing the selected household's lifecycle.
- [ ] Add expiry, replay, production-endpoint refusal and recipient-scope tests.

Acceptance: test-to-self can be reviewed and exercised without creating a production reply or making the household appear contacted.

## MI-RSVP-04 — return to latest confirmation

Priority: P0
Depends on: MI-RSVP-01

- [x] Extend capability open with the guest-safe latest-response projection for only the scoped invitations.
- [x] Keep private answer values and ciphertext out; return only question IDs and a saved/private-present marker.
- [x] Make a reopened valid link land on **Your RSVP confirmation** when a response exists.
- [x] Show every named person/event, non-sensitive choice, completion state, revision and submitted time.
- [x] Keep a new/unanswered household on the existing response form.
- [x] Keep expired/revoked links on the generic safe state without prior-response disclosure.
- [x] Extend the existing capability isolation/revocation tests and public expired-link browser journey with latest-response disclosure checks.

Acceptance: reopening the Rivera link shows only Rivera confirmation facts and never returns private allergy/accessibility plaintext.

## MI-RSVP-05 — append-only edit and resilient receipt

Priority: P0
Depends on: MI-RSVP-04

- [x] Rename/shape the receipt action as **Edit RSVP** and hydrate current non-sensitive answers.
- [x] Explain that private answers must be re-entered to replace them while unchanged people remain saved.
- [x] Append only changed person/event response revisions through the existing command and idempotency contract.
- [x] Preserve successful rows if another row fails; existing idempotency keys provide exact retry semantics.
- [ ] Show downstream impact using the existing response impact receipt.
- [ ] Route locked edits to Contact the couple / late-change review rather than silently overwriting committed facts.
- [ ] Add concurrent edit, stale revision, partial failure, retry and locked-change tests.

Acceptance: changing Sam's meal leaves Alex's response and prior revisions intact, updates shared projections once, and produces a truthful receipt.

## MI-RSVP-06 — one actionable household follow-up card

Priority: P1
Depends on: MI-RSVP-01, MI-RSVP-05

- [x] Implement the pure household lifecycle projection without a new persistence table.
- [x] Reconcile link-created, provider, capability-open, response completeness, reminder and deadline evidence. Lock evidence remains follow-up work.
- [x] Extend `WeddingDecisionRsvpFollowUp` instead of adding a second dashboard.
- [x] Show incomplete/unanswered households, literal source evidence, due state and one bounded next action; omit completed households.
- [ ] Reuse Preview reminder, Record phone reply, Fix delivery and Review incomplete answer actions.
- [ ] Exclude complete/not-due households and preserve quiet-hour/prior-reminder policy.
- [ ] Add A2UI intents only where the existing resolver lacks the bounded action.
- [x] Prove provider accepted is not rendered as delivered and capability open is not rendered as email open.

Acceptance: the three-household lifecycle scenario in the specification produces the expected action list and Guest Operations counts agree.

## MI-RSVP-07 — integration, accessibility and adversarial evidence

Priority: P0 release gate
Depends on: MI-RSVP-02 through MI-RSVP-06

- [x] Run focused TypeScript tests for projections and response amendments. Rust compile/database proof remains required because the local Windows rustc process crashed before diagnostics completed.
- [ ] Run disposable-Postgres cross-account, cross-wedding, cross-household, expiry, revocation, replay and stale-revision tests.
- [x] Run public browser journeys at 320/375/1280 px and 200% text zoom with Axe.
- [ ] Test preview/test mode cannot submit or mutate production evidence.
- [x] Test returning confirmation with named people, private-answer markers, safe edit hydration and changed-person-only submission. Mixed/multiple-event coverage remains.
- [ ] Test screen-reader names, focus movement, slow network, partial failure and safe recovery.
- [x] Run full Wedding typecheck, 2,321-test suite, build and line budgets in the task worktree. Clean frozen-SHA release proof remains a release step.

Acceptance: machine evidence names the exact source SHA and all privacy, accessibility and non-mutation gates pass.

## MI-RSVP-08 — false-default hosted rollout

Priority: P1 release gate
Depends on: MI-RSVP-07

- [ ] Deploy first with production publish/test-send flags off.
- [ ] Verify existing RSVP and wedding routes remain healthy.
- [ ] Run an allowlisted synthetic couple/household preview and return-confirmation exercise.
- [ ] Enable test-to-self only after provider receipt and non-mutation evidence passes.
- [ ] Record previous image/config, rollback path, runtime SHA and feature flags.
- [ ] Do not broaden the cohort without usability review of the three selected workflows.

Acceptance: rollout can be disabled without losing canonical setup or responses, and no unsupported research ideas are implied as shipped.

## Deferred backlog — not part of this extension

- invitation animation, music and theme marketplace;
- free-form invitation designer;
- automatic SMS or WhatsApp delivery;
- email tracking pixels;
- multilingual generation;
- guest accounts;
- private-answer plaintext in returning public links;
- autonomous reminders.
