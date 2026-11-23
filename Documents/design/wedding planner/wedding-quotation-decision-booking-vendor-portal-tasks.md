# Decision and Booking Closure with Lightweight Vendor Response Portal - Task Plan

Prepared: 2026-10-17

Status: proposed

Programme: WED-215

Specification: `wedding-quotation-decision-booking-vendor-portal-spec.md`

Nominated base: `052acc73316f864500703cb975f72a77e889ee82`

## 1. Execution rules

1. Create `C:\Users\ozans\Desktop\projects\OmnyID-WED-215` as a clean worktree on
   `agent/codex/WED-215` from exact commit `052acc7`.
2. Use GPT-6 Astra (`gpt-6-astra`) at high reasoning for primary implementation.
3. Do not implement in `.worktrees/WED-187`; it currently has 48 changed/untracked paths.
4. Reconcile completed WED-187 work through reviewed commits. Never copy its whole dirty
   tree or overwrite ongoing R10-R12/human-judge work.
5. Keep `052acc7` in ancestry. It contains the implemented generic quotation closure,
   vendor-context, clarification, replay, and dark-release controls.
6. Preserve AFP v1 envelopes. Add typed domain payloads and references rather than
   changing generic AFP wire shape.
7. Use existing auth, vendor claims, AgentCards, federation, email, reply matching,
   parser/OCR, DecisionOS, A2UI, budget, timeline, and feature-gate services.
8. No new file may exceed 999 lines. New production files should normally stay under
   500 lines. Split before the limit, not after it.
9. Do not add code to an already oversized file except a minimal registration/import
   that cannot be isolated. Record the exception and line delta.
10. Every route mutation requires tenant/vendor/capability authorization, expected
    revision, stable idempotency, bounded input, and audit-safe failure text.
11. Models can draft and extract only. Deterministic code owns permissions, arithmetic,
    transitions, replay, and booking readiness.
12. Keep all new feature flags off until their own release gates pass.
13. A commit or deploy does not prove health. CI, runtime checks, and readiness artifacts
    remain the authorities defined in `AGENTS.md`.

## 2. Programme dependency map

```text
DBV-00 baseline and contract audit
  |
  +--> DBV-01 decision/closure persistence API
  |      +--> DBV-02 couple DecisionOS/A2UI integration
  |      +--> DBV-03 contract/deposit/booking adapters
  |
  +--> DBV-04 response capability and grant hardening
         +--> DBV-05 canonical vendor response contract
                +--> DBV-06 claimed-vendor AFP path
                +--> DBV-07 secure-link session and portal
                +--> DBV-08 structured revision upload
                +--> DBV-09 email/federation convergence

DBV-02 + DBV-03 + DBV-06 + DBV-07 + DBV-08 + DBV-09
  --> DBV-10 end-to-end replay, security, and evaluation
  --> DBV-11 dark deployment and staged canary
```

DBV-09's vendor-relay portion also depends on WED-185 security and provider gates. It may
ship with email fallback disabled if those gates remain incomplete. DBV-11 depends on the
applicable WED-213 quotation readiness evidence; it cannot convert missing evidence into a
pass.

## 3. Week allocation

| Week | Goal | Tasks |
| --- | --- | --- |
| 3 | Freeze contracts and make closure durable | DBV-00, DBV-01, DBV-02 |
| 4 | Complete evidence-backed booking and template projection | DBV-03, DBV-04 |
| 5 | Add one canonical vendor response path and claimed-vendor experience | DBV-05, DBV-06, DBV-07 |
| 6 | Add revisions/email convergence, prove security, stage rollout | DBV-08, DBV-09, DBV-10, DBV-11 |

The weeks describe dependency order, not permission to bypass unfinished gates. Move
incomplete slices to the next week rather than merging partial authority or security work.

## 4. Standard verification

Run the smallest focused suite during development and the full applicable suite before a
task is marked done.

Baseline commands, adjusted to actual package scripts at DBV-00:

```powershell
cargo fmt --check
cargo check
cargo test --test quotation_closure --quiet
cargo test --test quotation_vendor_context --quiet
cargo test --test quotation_afp --quiet
cargo test --test api_flows --quiet
npm run typecheck --prefix solid-ui
npm run test:wedding --prefix solid-ui
npm run build --prefix solid-ui
npm run test:line-budget --prefix solid-ui
powershell -NoProfile -File scripts/verify-quotation-readiness.ps1 -IncludeBrowser
git diff --check
```

The inherited line-budget failure for existing oversized wedding workspace files is not a
waiver. Do not modify those files for this programme; extract an adapter or component. If
they are touched by a prerequisite merge, split them before adding portal responsibilities.

For database work, execute the existing temporary-Postgres API lane with
`TEST_DATABASE_URL`. A skipped test is not a pass. For browser work, cover 360x740 and a
desktop viewport, keyboard flow, serious/critical Axe findings, focus return, escaped
content, and horizontal overflow.

## DBV-00 - Clean baseline, dependency audit, and contract freeze

### Objective

Create the clean worktree, prove the base, and inventory what actually exists for vendor
claiming, AFP replies, email, magic links, and quotation closure. Resolve ledger/code
discrepancies before implementation.

### File scope

- `.agent/TASKS.yaml`
- `.agent/DECISIONS.md`
- `.agent/HANDOFF.md`
- `Documents/verification/quotation-vendor-portal-baseline.md`
- existing files read-only unless a minimal test fixture is required

### Work

- Create the branch/worktree from `052acc7`; record full SHA and merge-base evidence.
- Confirm WED-187 remains untouched and list only reviewed commits proposed for merge.
- Audit actual implementations for WED-169, WED-170, WED-171, WED-185, WED-210,
  WED-211, WED-212, and WED-214.
- Classify each capability as implemented, schema-only, UI-only, gated, or absent.
- Confirm the current vendor portal entrypoint, claim ownership checks, AgentCard binding,
  enquiry envelope endpoints, encryption boundary, and reply UI.
- Confirm which email path is currently owner-approved and which relay flags remain off.
- Record that the exposed Cloudflare token is invalid; do not restore or rotate it without
  a separately authorized secret-management task.
- Freeze the generic response payload, reference roles, closure transitions, grant
  purposes, A2UI actions, feature flags, and route namespaces.
- Create golden fixtures: claimed AFP response, secure-link response, email response,
  quote revision, contract change, booking confirmation, revocation, and replay.
- Record baseline file line counts for all likely touch points.

### Acceptance

- The implementation branch is clean and retains `052acc7` in ancestry.
- No dirty WED-187 content was copied.
- Every claimed reusable dependency has a source file, test, and status; task-ledger text
  alone is not accepted as evidence.
- Missing WED-170/WED-171 runtime work is explicitly scheduled rather than assumed.
- Contracts are template-neutral and wedding appears only in adapters/transports.
- All golden fixtures are synthetic and contain no real couple/vendor data.

### Verification

- `git status --short --branch`
- `git merge-base --is-ancestor 052acc7 HEAD`
- existing quotation verifier without live provider calls
- line-count report and `git diff --check`

## DBV-01 - Persisted decision and closure orchestration API

### Objective

Expose the existing deterministic selection/closure state machine through authenticated,
tenant-private, replayable AFP routes.

### Suggested file scope

- `src/server/quotation_routes/decision_routes.rs`
- `src/server/quotation_routes/closure_routes.rs`
- `src/server/quotation_routes.rs` for minimal registration
- `src/quotation/closure.rs` only for proven contract gaps
- `src/quotation/afp.rs`
- `tests/quotation_decision_api.rs`
- `tests/quotation_closure_api.rs`
- `tests/api_flows.rs`

### Work

- Add selection and closure transition endpoints against tenant-visible quotation threads.
- Reload active quotation/comparison/closure state server-side; never trust client state.
- Require exact expected state, quotation version, comparison revision, user authority,
  and evidence/source references.
- Store compact private AFP events with canonical and typed references.
- Return the original result for a duplicate idempotency key.
- Reject stale versions, invalid leaps, cross-tenant references, and evidence not visible
  to the caller with generic responses.
- Add deterministic replay for selection and closure events if not already wired into the
  authenticated state route.
- Keep payment execution hard-coded false at every transport boundary.

### Acceptance

- A shuffled, duplicated event set reconstructs one active decision and closure state.
- A quote successor invalidates stale decision actions without deleting history.
- Selection is not booking; deposit recorded is not payment execution.
- Only evidence-backed booking confirmation can produce a budget commitment input.
- Cross-tenant and wrong-thread tests disclose no object existence.

### Verification

- focused closure/AFP integration tests
- temporary-Postgres authenticated HTTP tests
- `cargo check`, formatting, and diff checks

## DBV-02 - Couple DecisionOS and A2UI closure integration

### Objective

Make review, clarification, selection, context sharing, and closure understandable and
actionable in the existing consumer workflow without a new card framework.

### Suggested file scope

- `solid-ui/src/lib/quotationDecisionClosureState.ts`
- `solid-ui/src/lib/quotationDecisionClosureApi.ts`
- `solid-ui/src/components/QuotationClosureTimeline.tsx`
- existing `QuotationClosureCard.tsx` for bounded composition only
- a small wedding workspace adapter outside oversized workspace files
- `solid-ui/tests/quotation-decision-closure-state.test.ts`
- `solid-ui/tests/e2e/quotation-decision-closure.spec.ts`

### Work

- Project active server replay into existing `review`, `clarify`, `compare`, `choose`,
  `approve_act`, and `record` patterns.
- Reuse `comparison_table`, `stat_row`, `constraint_badges`, `insight_line`, `callout`,
  `action_chips`, and `decision` A2UI nodes.
- Add a field-level "What the vendor will see" grant preview.
- Bind actions to decision, quotation, comparison, closure, and grant revisions.
- Show contract material changes with source links before acknowledgement.
- Show explicit "records only - OmnyID will not make a payment" language.
- Replace stale cards when successors arrive; do not leave two active closure actions.
- Keep the single-quote state evidence-based and free of comparative winner language.
- Ensure mobile actions remain in the card and do not conflict with swipe gestures.

### Acceptance

- No foundational decision-card type or parallel renderer is added.
- Every action displays its consequence and stale action failures are recoverable.
- Grant preview exactly matches the vendor projection test fixture.
- Booking, cancellation, refund, and supersession have distinct status text and icons.
- Mobile and desktop meet accessibility requirements.

### Verification

- pure state and A2UI snapshot tests
- Playwright at mobile/desktop sizes with Axe and keyboard paths
- full wedding suite, typecheck, build, line budget

## DBV-03 - Contract, deposit, booking, and template adapters

### Objective

Complete evidence ingestion and downstream projections for booking closure while keeping
the generic engine independent from wedding.

### Suggested file scope

- `src/quotation/closure_evidence.rs`
- `src/server/quotation_routes/closure_evidence_routes.rs`
- existing document-ingest service by interface only
- `solid-ui/src/lib/quotationWeddingClosureAdapter.ts`
- a generic template adapter interface
- focused Rust/Solid tests

### Work

- Accept contract, deposit request, payment evidence, booking confirmation, cancellation,
  and refund sources through existing private document/message ingestion.
- Reuse OCR/PDF parser selection; never add OCR code.
- Compare validated contract commercial terms to the selected active quotation.
- Require review for every material difference before later transitions.
- Preserve deposits as cash-flow schedules; classify a fee only from explicit evidence.
- Project only confirmed booking into the existing wedding budget commitment.
- Project contract/deposit due dates into existing wedding tasks/reminders.
- Make all projection IDs deterministic and quotation/evidence-version bound.
- Define a small generic adapter interface for future OmnyID templates.

### Acceptance

- Unsupported or unavailable parsing produces manual review, not invented contract facts.
- A retry creates no duplicate commitment or planning task.
- Cancellation/refund/supersession closes or updates derived open tasks without erasing
  prior facts.
- A non-wedding fixture can consume the generic closure output through a test adapter.
- No payment provider or legal interpretation is introduced.

### Verification

- contract-change, money, deadline, replay, and adapter tests
- existing wedding budget aggregation tests
- parser/OCR unavailable-path tests

## DBV-04 - Response capability and vendor-context hardening

### Objective

Turn the existing field-level vendor-context projection into an invitation-safe authority
boundary for claimed and unclaimed vendors.

### Suggested file scope

- `src/quotation/vendor_context.rs`
- `src/quotation/response_capability.rs`
- `src/server/quotation_response_capability_routes.rs`
- additive migration for response capabilities if needed
- `tests/quotation_response_capability.rs`
- `tests/quotation_vendor_context.rs`

### Work

- Extend grants with allowed actions, question IDs, projection fingerprint, not-before,
  and exact response recipient binding where absent.
- Add hashed high-entropy response capabilities; never store a raw link token.
- Keep authentication magic links separate from transaction capabilities.
- Implement issue, exchange, consume, revoke, expire, and rotate lifecycles.
- Revoke on grant revocation, quote supersession, claim dispute, or terminal closure.
- Exchange the link for an HttpOnly, Secure, SameSite=Strict transaction session.
- Add CSRF, one-time submission nonces, token-prefix/IP/vendor/thread rate limits, and
  generic not-found behaviour.
- Ensure prohibited classes cannot be projected even with tampered fact IDs.
- Emit content-free audit events for issue/exchange/revoke/consume.

### Acceptance

- Token DB compromise does not reveal usable response URLs.
- A link grants neither account access nor another transaction.
- Wrong vendor, wrong thread, expired, revoked, consumed, stale, and disputed cases fail
  closed without an existence oracle.
- Projection output matches the couple's approved preview byte-for-byte after canonical
  serialization.
- Competitor, score, private note, hidden preference, full plan, and unapproved budget
  fields are unprojectable.

### Verification

- property tests for token entropy/hash/lookup and lifecycle transitions
- cross-tenant/vendor/thread HTTP matrix with temporary Postgres
- log-capture assertion that raw tokens and private fields are absent
- independent security review checklist

## DBV-05 - Canonical vendor response contract and reconciliation

### Objective

Define one generic response model that AFP, secure-link, upload, and email channels feed.

### Suggested file scope

- `schemas/quotation/vendor-response.v1.json`
- `src/quotation/vendor_response.rs`
- `typescript-sdk/src/quotation.ts` or a small sibling module
- `tests/quotation_vendor_response.rs`
- `typescript-sdk/tests/quotation-vendor-response.test.mjs`

### Work

- Define bounded question answers, typed commercial facts, source references,
  attachments, availability, explanation, and vendor attestation.
- Require vendor, thread, grant, active quotation version, projection fingerprint,
  channel, and channel receipt.
- Deny unknown fields and bound counts/string lengths/amounts/dates/currencies.
- Canonicalize and fingerprint semantically identical responses across channels.
- Distinguish draft, submitted, received, reviewed, rejected, and superseded.
- Convert structured fields into ordinary source-linked extraction/review proposals.
- Require exact evidence for material confirmed facts; otherwise mark them proposed or
  unknown.
- Define duplicate vs successor rules for later emails/uploads.

### Acceptance

- Equivalent AFP/link/email inputs reconcile to one response fingerprint.
- A different material answer creates a parent-linked successor.
- `submitted` never implies user acceptance or booking.
- The response contract is free of `wedding_plan_id`; wedding data appears only through
  references/adapters.
- Rust, TypeScript, and JSON schema fixtures agree.

### Verification

- schema round-trip and deny-unknown tests
- cross-language golden fixtures
- duplicate/shuffle/successor replay property tests

## DBV-06 - Claimed-vendor AFP response path

### Objective

Allow a legitimately claimed vendor to review granted context and submit a signed,
encrypted AFP response through its existing identity.

### Suggested file scope

- existing vendor claim/AgentCard routes for minimal binding helpers
- a small vendor transaction API module
- existing enquiry envelope service or a new module only if DBV-00 proves it absent
- `solid-ui/src/lib/vendorQuotationResponseState.ts`
- `solid-ui/src/components/vendor/VendorQuotationResponsePanel.tsx`
- focused server/SDK/UI tests

### Work

- Require active claim ownership, non-disputed state, deterministic vendor Agent ID, and
  matching signed AgentCard capability.
- Load only invitations addressed to that vendor and projection.
- Reuse `wedding_enquiry_response` as the transport envelope where compatible.
- Preserve client-side encryption for the existing enquiry protocol; do not send
  plaintext through the ciphertext table.
- Validate signature, recipient, nonce, expiry, size, replay, and grant state.
- Add vendor-side local decrypt/project logic if DBV-00 finds it missing.
- Provide a minimal own-transaction inbox, not a general CRM.
- Return durable accepted/failed receipts and safe retry.

### Acceptance

- Claiming a listing does not expose historic or unrelated transactions.
- Server storage remains ciphertext-only where the protocol promises it.
- An AgentCard key replacement invalidates old signature assumptions safely.
- The vendor can answer and submit without seeing competitor/private fields.
- Enquiry access is not paywalled.

### Verification

- signature, encryption-boundary, replay, key-change, claim-dispute, and IDOR tests
- browser test with a synthetic claimed vendor and encrypted fixture
- no plaintext commercial body assertion on `wedding_enquiry_envelopes`

## DBV-07 - Secure-link portal for optional vendor response

### Objective

Deliver a mobile-first, no-install transaction portal for a vendor who does not use an
OmnyID claimed account, while preserving the email alternative.

### Suggested file scope

- `solid-ui/quotation-response.html`
- `solid-ui/src/quotation-response-main.tsx`
- `solid-ui/src/components/vendor-response/*` with each file under 500 lines
- `solid-ui/src/lib/quotationResponseSessionApi.ts`
- `solid-ui/src/lib/quotationResponseFormState.ts`
- scoped server session/routes from DBV-04
- focused unit and E2E tests

### Work

- Exchange the URL token immediately and remove it from browser history/location.
- Render vendor identity, purpose, expiry, own quote, approved requirements/questions,
  response controls, and email-alternative copy.
- Use A2UI for read-only stat/callout/action projection where supported.
- Use typed Solid form controls for amounts, dates, inclusion state, availability, and
  bounded explanation if A2UI lacks safe input primitives.
- Support draft only for authenticated or safely re-openable scoped sessions.
- Preview exact submission, show validation errors, and submit idempotently.
- Show a durable receipt without revealing internal AFP IDs unnecessarily.
- Add `Referrer-Policy: no-referrer`, CSP, frame denial, no-store caching, and analytics
  exclusion for token/session routes.

### Acceptance

- Portal use is optional and email support is visible.
- The token is absent from post-exchange URL, logs, telemetry, and error reports.
- Refresh/retry cannot duplicate a response.
- Expired/revoked/stale links reveal no commercial context.
- 360px mobile, keyboard, screen reader, focus, and no-JavaScript failure copy are safe.

### Verification

- Playwright token-exchange, history, Referer, CSP, CSRF, replay, mobile, and Axe tests
- network assertion that no analytics request contains capability/session data
- typecheck, build, line budget, and safe-text XSS fixtures

## DBV-08 - Structured quotation revision and attachment ingestion

### Objective

Let a vendor submit structured revisions or a revised document without forking quotation
ingestion, extraction, review, or OCR.

### Suggested file scope

- vendor-response upload route/service adapter
- existing `document_ingest_service.rs` by interface
- `src/quotation/vendor_response.rs`
- portal upload component under the DBV-07 folder
- focused upload/extraction/replay tests

### Work

- Accept bounded PDF/image/text/DOCX types already supported by ingestion.
- Use existing malware/active-content, size, ownership, SSRF, OCR, and PDF parser rules.
- Attribute the immutable source to the vendor response and active grant.
- Use deterministic structured validation when the vendor completes typed fields.
- Route free-form document extraction through the existing shared LLM ladder and exact
  anchor validation.
- Present all proposed material changes to the couple's existing review card.
- Create a quotation successor only after validation/review policy permits it.
- Revoke or stale outstanding invites bound to the replaced quotation version.

### Acceptance

- No OCR, parser, storage, or extraction stack is duplicated.
- Upload failure preserves safe draft fields and gives an honest blocker.
- A revised quote never mutates the prior version.
- Material changes trigger comparison re-evaluation and stale-decision handling.
- Unsupported facts remain unknown rather than guessed.

### Verification

- supported/unsupported/encrypted/oversized/parser-unavailable fixtures
- exact-anchor and prompt-injection tests
- quotation successor and decision invalidation tests

## DBV-09 - Email and federation convergence

### Objective

Ensure vendors can remain email-first and that email, AFP federation, and portal responses
produce the same canonical review workflow.

### Suggested file scope

- existing quotation clarification send/source adapters
- existing Gmail sender and inbound matcher
- existing federation receipt/retry modules
- WED-185 relay modules only behind their existing gates
- `src/quotation/vendor_response_reconciliation.rs`
- focused channel/reconciliation tests

### Work

- Generate invitation email content only from the approved context/questions.
- Reuse deterministic Message-ID, send reservation, and ambiguity reconciliation.
- Match inbound replies to thread and invitation without guessing by prose alone.
- Prepare email bodies/attachments through the existing quotation source path.
- Convert matched email and verified AFP payloads to DBV-05 responses.
- Deduplicate channel retries using response and source fingerprints.
- Preserve delivery accepted, received, parsed, reviewed, and resolved as separate states.
- Keep Cloudflare vendor relay disabled until WED-185 inventory, inbound signature,
  security review, credential, and canary gates pass.
- Do not use the invalid exposed Cloudflare token or substitute platform account mail as
  a vendor relay.

### Acceptance

- A vendor may ignore the portal and complete the flow by replying to approved email.
- Ambiguous send remains reserved and cannot blindly resend.
- Email/portal/AFP duplicates reconcile without duplicate quote successors.
- Provider delivery never becomes booking evidence by itself.
- With relay flags off, the UI is honest about the available approved channel.

### Verification

- Gmail/federation unit tests and synthetic inbound fixtures
- no-send local suite plus separately authorized allowlisted provider smoke
- provider receipt/reconciliation and duplicate-channel tests

## DBV-10 - End-to-end replay, security, accessibility, and evaluation

### Objective

Prove the programme's authority, privacy, resilience, and usefulness before any production
feature enablement.

### Suggested file scope

- `tests/quotation_vendor_portal_e2e.rs`
- `tests/api_flows.rs`
- `solid-ui/tests/e2e/quotation-vendor-portal.spec.ts`
- `scripts/verify-quotation-vendor-portal-readiness.ps1`
- `Documents/verification/quotation-vendor-portal-readiness.md`
- aggregate metrics modules

### Work

- Run the seven specification scenarios plus negative matrices.
- Add property tests for shuffled/duplicate AFP events and deterministic projections.
- Test tenant, vendor, grant, thread, quotation, attachment, and session IDOR dimensions.
- Test token brute force/rate limits, CSRF, XSS, upload attacks, replay, stale revisions,
  session fixation, Referer leakage, and cache leakage.
- Verify logs and metrics contain no tokens, email/content, quote values, or raw IDs where
  disallowed.
- Add content-free funnel and latency metrics.
- Measure extraction material accuracy against the existing quotation corpus.
- Conduct an independent security/privacy review and record unresolved findings.
- Conduct usability sessions for couple and vendor mobile flows.
- Require human review of booking/permission wording; machine tests cannot approve it.

### Acceptance

- Material money/currency exact-match and inclusion-state thresholds retain WED-213's
  fail-closed minima.
- No critical/high security issue remains open for an enabled feature.
- No serious/critical Axe issue exists in the tested flow.
- All privacy-negative assertions pass.
- Readiness is `untested`, `blocked`, `failed`, or `verified`; missing evidence never
  defaults to verified.
- Metrics answer the four source-brief investment questions without storing content.

### Verification

- reproducible readiness script and artifact digest
- full Rust, SDK, Solid, wedding, browser, migration, Postgres, and line-budget suites
- independent reviewer sign-off references

## DBV-11 - Dark deployment, canary, rollback, and evidence handoff

### Objective

Package the capability safely, deploy with every new flag off, then run independently
authorized canaries in increasing-risk order.

### Suggested file scope

- existing Docker/Compose/staging scripts for minimal configuration only
- `scripts/verify-quotation-vendor-portal-readiness.ps1`
- feature configuration modules
- `.agent/TASKS.yaml`
- `.agent/DECISIONS.md`
- `.agent/HANDOFF.md`

### Work

- Add fail-closed environment plumbing and deployment packaging tests.
- Verify schema and A2UI registry files are included in runtime images.
- Apply additive migrations in staging/disposable environments first.
- Deploy dark and verify `/healthz`, `/readyz`, route presence, runtime SHA, and flags off.
- Canary a synthetic claimed vendor before secure links.
- Canary secure links with an allowlisted synthetic transaction and immediate revocation.
- Run an email canary only with user authorization and satisfied provider/security gates.
- Monitor aggregate failures, latency, duplicates, revocations, and privacy alarms.
- Document rollback: flags off, revoke outstanding links, retain AFP evidence, stop new
  invitations, and roll back application code without deleting commercial history.
- Update the task ledger and handoff from machine evidence.

### Acceptance

- Dark deployment changes no user-visible behaviour.
- Disabled means no invite creation, link exchange, vendor response, or booking action.
- Runtime SHA and configuration match the recorded artifact.
- Rollback is rehearsed without erasing AFP lineage.
- Wider cohort requires explicit approval, verified readiness digest, and the applicable
  WED-213/WED-185 gates.

### Verification

- packaging self-tests and deployment dry run
- staging migration/replay test
- Oracle production proof and scoped health/version checks when deployment is authorized
- seven-day allowlisted cohort evidence before any broad enablement

## 5. Pull request and commit boundaries

Use reviewable commits/PRs; do not land the programme as one large change.

Suggested boundaries:

1. `WED-215 audit decision and vendor response foundations` - DBV-00
2. `WED-216 persist quotation decision and closure transitions` - DBV-01
3. `WED-217 integrate closure DecisionOS and A2UI` - DBV-02
4. `WED-218 complete evidence-backed booking adapters` - DBV-03
5. `WED-219 harden quotation response capabilities` - DBV-04
6. `WED-220 define canonical quotation vendor responses` - DBV-05
7. `WED-221 add claimed-vendor AFP response flow` - DBV-06
8. `WED-222 add scoped vendor response portal` - DBV-07
9. `WED-223 ingest vendor quote revisions` - DBV-08
10. `WED-224 reconcile email AFP and portal responses` - DBV-09
11. `WED-225 verify quotation closure and vendor portal` - DBV-10
12. `WED-226 stage gated vendor response rollout` - DBV-11

Reserve these IDs in `.agent/TASKS.yaml` when implementation begins and update statuses
from evidence. If another branch has already claimed an ID, allocate the next free IDs
without changing dependency order.

## 6. Programme definition of done

- Decision and closure mutations are authenticated, tenant-private, AFP-backed, replayable,
  stale-safe, and idempotent.
- Contract, deposit, booking, cancellation, refund, and supersession remain distinct.
- Booking creates one evidence-linked budget commitment and no payment execution.
- The optional portal is transaction-scoped and vendor/field/action limited.
- Claimed AFP, secure-link, uploaded revision, email, and federation inputs converge on one
  response/review/successor model.
- Vendors can remain email-only and are not required to adopt an OmnyID CRM.
- Couples preview and approve exactly what a vendor can see.
- Competitor and private context are unprojectable by default and under tampering.
- Existing OCR, parser, sender, inbox, auth, claim, AgentCard, DecisionOS, A2UI, budget,
  timeline, and wedding planner foundations are reused.
- Security, privacy, replay, cross-tenant, accessibility, mobile, upload, and provider
  failure tests pass with retained evidence.
- Feature flags default off and rollout remains independently gated.
- No new file exceeds 999 lines and existing oversized files are not bloated.
- Coordination files accurately record commits, tests, unresolved gates, and next action.

## 7. Explicit non-tasks

Do not add any of the following under this programme:

- payment execution or stored payment credentials;
- legal advice, contract drafting, or e-signatures;
- a general vendor CRM, sales pipeline, marketing automation, or mailbox;
- another quotation store or couple/vendor copy of commercial truth;
- a new OCR engine, parser provider, LLM ladder, email provider, or queue;
- automated selection, negotiation, discounting, acceptance, or booking;
- vendor-visible competitor comparisons or internal recommendation scores;
- broad wedding-plan access hidden inside a context grant;
- production enrichment, ranking policy-v2 rollout, or human-judge completion from the
  dirty WED-187 programme; or
- feature enablement merely because a dark deployment succeeded.

