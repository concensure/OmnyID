# Quotation decision, closure, and vendor response baseline

Status: verified local baseline; implementation features remain disabled  
Task: WED-215 / DBV-00  
Recorded: 2026-10-17 (Australia/Sydney)  
Branch: `agent/codex/WED-215`

## 1. Provenance

- Exact base and current `HEAD`: `052acc73316f864500703cb975f72a77e889ee82`.
- `git merge-base HEAD 052acc73316f864500703cb975f72a77e889ee82` returned that full SHA.
- `git merge-base --is-ancestor 052acc73316f864500703cb975f72a77e889ee82 HEAD`
  returned exit code 0.
- The worktree was created clean at
  `C:\Users\ozans\Desktop\projects\OmnyID-WED-215`.
- The dirty WED-187 implementation was read only. Its two WED-215 planning documents were
  deliberately transferred into this branch; no dirty source, test, migration, generated
  artifact, or runtime configuration was copied.
- WED-187 currently has 50 changed or untracked paths, including those two planning
  documents. It must be reconciled only after its active R10-R12/human-judge work is
  committed and reviewed.

The latest GitHub Actions runs visible to `gh` are failed March 2026 runs against unrelated,
older SHAs. They are not evidence about this branch. The base was deployed to Oracle in dark
mode according to the repository deployment handoff; all quotation flags remained off.

## 2. Evidence standard

A ledger claim is reusable only when this base contains a source implementation and a
focused test or executable verification path. Classifications are:

- **implemented**: source and test evidence exist;
- **partial**: a useful subset exists but does not satisfy the task acceptance contract;
- **schema-only**: persistence exists without the required runtime;
- **UI-only**: presentation exists without a durable service boundary;
- **gated**: implementation exists but the fail-closed release flag is off; and
- **absent**: the named runtime file/contract does not exist.

## 3. Dependency audit

| Dependency | Classification on `052acc7` | Source evidence | Test/evidence | Consequence |
| --- | --- | --- | --- | --- |
| WED-169 claim wizard | Partial UI and API | `solid-ui/src/vendor-claim-main.tsx`, `VendorClaimFlow.tsx`, `vendorClaimApi.ts`, claim/photo routes | claim/AgentCard route unit tests plus UI build coverage; no end-to-end auth return test | Reuse the portal entry point, claim lookup, and photo editor. Preserve the auth return target before adding responses. |
| WED-170 AFP enquiry protocol | Absent runtime; schema foundations only | migrations `0093`, `0103`, AgentCard capabilities; no `wedding_enquiry_routes.rs`, `wedding_enquiries.rs`, or `weddingEnquiry.ts` | no enquiry protocol test set | DBV-05/06 must define and implement the generic response contract. Do not assume encrypted enquiry dispatch, receipts, or replay already exist. |
| WED-171 vendor inbox | Absent | no `vendorEnquiryStore.ts` or vendor enquiry dashboard; current portal only claims/photos | no vendor inbox tests | DBV-06/07 must add a small response workspace rather than extend a nonexistent inbox. |
| WED-185 vendor email relay | Partial and gated | `vendor_mail_provider.rs`, email contract/replay modules, Gmail gateway and outreach routes | provider configuration, contract, replay, and workflow tests | Vendor relay defaults disabled and must not use Gmail as its platform provider. Existing owner-approved Gmail continuity remains the only current email route. |
| WED-210 clarification loop | Implemented and release-gated | quotation clarification core, authenticated send route, Gmail Message-ID reconciliation, source preparation | `quotation_clarification.rs` integration tests and Gmail/route unit tests | Reuse approval binding, reservations, receipts, inbound source preparation, and successor review. No second sender or parser. |
| WED-211 closure | Implemented domain/UI; persistence API absent | `src/quotation/closure.rs`, closure Solid state/card, wedding adapter | closure integration and wedding adapter tests | DBV-01 must persist/replay transitions through private AFP routes; do not rewrite the transition machine or booking adapter. |
| WED-212 vendor context | Implemented domain contract; persistence API absent | `src/quotation/vendor_context.rs` | `tests/quotation_vendor_context.rs` | Extend the grant fields and add orchestration routes. Preserve fail-closed deny rules. |
| WED-214 quotation AFP | Implemented and gated where applicable | `src/quotation/afp.rs`, `src/server/quotation_routes.rs` | `tests/quotation_afp.rs`, `tests/api_flows.rs` | Reuse authenticated tenant-private storage, deterministic IDs, replay, and source visibility checks. |

## 4. Current vendor boundary

### Portal and ownership

- Entry point: `/workspace/vendor.html`, bootstrapped by
  `solid-ui/src/vendor-claim-main.tsx`.
- Unauthenticated users are sent to
  `/workspace/?auth=signin&source=vendor_claim`; the return target is not yet preserved.
- The current page can start/load a claim and manage licensed photos. It has no response
  inbox, transaction list, quote editor, or booking controls.
- Claim and photo mutations query the active listing and require
  `claimed_by_user_id == authenticated_user.id` with a permitted claim status.
- Claim intake is rate limited and prevents a different claimant from taking a listing.
- There is no implemented authentication magic-link route on this base. Response
  capabilities must not be implemented as account-login magic links.

### Agent identity and encryption

- Claimed vendors can publish a signed AgentCard only while retaining the matching claim.
- Public AgentCards are returned only for `claimed` or `verified` listings.
- AgentCards support an X25519 `encryption_public_key_hex` and advertised enquiry
  capabilities; legacy cards remain readable.
- Browser key custody creates non-extractable signing/encryption keys and an encrypted
  recovery backup.
- These pieces do not constitute an encrypted enquiry envelope service. No server route,
  local decrypting inbox, dispatch receipt, or response verifier exists for WED-170/171.

### Email

- `OMNYID_VENDOR_MAIL_ENABLED` defaults false and
  `OMNYID_VENDOR_MAIL_PROVIDER` defaults `disabled`.
- The vendor relay rejects Gmail, SMTP, Outlook, and user-mailbox provider names.
- When explicitly enabled, Cloudflare requires a platform token plus worker shared secret;
  Resend requires its API and webhook secrets. The mask domain is fixed to
  `mail.omnyid.com`.
- The currently approved continuity path is the existing user/owner-authorized Gmail flow,
  including quotation clarification send and deterministic reply reconciliation. This does
  not authorize turning Gmail into the vendor relay.
- The previously exposed Cloudflare token was checked on 2026-10-17 and returned HTTP 401,
  `success: false`, error code `1000`. It is invalid/unusable. This task will not restore,
  rotate, or replace it.

## 5. Frozen generic contracts

These names are frozen for WED-216 onward. Wedding-specific code may adapt them but must
not become the authority.

### 5.1 Decision and closure

- Decision kind: `quotation_vendor_selected`.
- Closure kind: `quotation_closure_transition`.
- Reuse `ClosureState` exactly: `selected`, `contract_received`, `contract_reviewed`,
  `deposit_requested`, `deposit_recorded_paid`, `booking_confirmed`, `cancelled`,
  `refunded`, `superseded`.
- A command binds `thread_id`, `quotation_id`, active `quotation_version_id`, optional
  active `comparison_id` and comparison revision, exact `expected_state`, target state,
  user authority, idempotency key, time, and visible evidence sources.
- The server reloads active state and totals. It never accepts client totals or a client
  closure snapshot as truth.
- `booking_confirmed` is the only state that may project an idempotent budget commitment.
  All states retain `external_payment: false`.

### 5.2 Vendor response payload

Schema version: `quotation.vendor_response.v1`.

Required envelope fields:

- `response_id`, `invite_id`, `grant_id`, `thread_id`, `vendor_id`;
- `quotation_id`, `quotation_version_id`, `projection_fingerprint`;
- `channel`: `claimed_afp`, `secure_link`, or `email`;
- `answers`: bounded entries keyed by approved `question_id` or `fact_id`;
- `source_refs` and optional bounded attachment refs;
- `occurred_at`, `idempotency_key`, optional `parent_response_id`; and
- a channel receipt reference, never raw token, email body, or private key material.

Allowed answer value types are `boolean`, `unknown`, bounded text, money with ISO currency
and minor units, date, availability interval, quantity/unit, and an evidence-backed
quotation patch. Unknown is distinct from false or absent. A submitted response is
evidence for review; it never selects a vendor, accepts a contract, confirms a booking,
or changes a budget by itself.

Canonical lifecycle kinds:

- `quotation_vendor_response_invited`;
- `quotation_vendor_response_draft`;
- `quotation_vendor_response_submitted`;
- `quotation_vendor_response_received`; and
- `quotation_vendor_response_reviewed`.

Transport may use a future `wedding_enquiry_response` envelope, but the generic quotation
response remains the commercial contract and template-neutral source of truth.

### 5.3 Reference roles

Use singular role names: `quotation`, `quotation_version`, `comparison`, `clarification`,
`grant`, `vendor`, `thread`, `source`, `approval`, `delivery_receipt`, and `parent`.
Canonical `references` and `typed_refs` must be identical. Parent AFP linkage also uses
the envelope `parent_id`. References must resolve inside the caller's tenant or scoped
response capability.

### 5.4 Context grant

Preserve the implemented purposes `resolve_quote_gaps`, `refine_vendor_package`, and
`confirm_booking_details`. `submit_revision` is an allowed action under
`refine_vendor_package`, not a breaking purpose rename.

Additive grant bindings may include quotation version, clarification, approved question
IDs, allowed actions, not-before time, and optional claimed Agent ID. A grant remains:

- exact-vendor and exact-thread bound;
- field allowlisted and projection-fingerprint bound;
- approval-receipt bound;
- expiring, revocable, and single-use or bounded-reuse;
- unable to reveal competitor data, private notes, hidden preferences, full-plan data,
  internal scores, or comparison scores.

### 5.5 A2UI actions

Reuse existing patterns and primitives. Frozen action IDs/patterns are:

| Action ID | Pattern | Purpose |
| --- | --- | --- |
| `quotation.select` | `choose` / `approve_act` | Select exact active quotation/comparison revision |
| `quotation.closure.transition` | `record` / `approve_act` | Record evidence-backed closure transition |
| `quotation.context.share` | `approve_act` | Approve exact field/question projection |
| `quotation.context.revoke` | `approve_act` | Revoke an active grant |
| `quotation.vendor_response.review` | `review` | Accept/reject response facts into ordinary review |

Use `comparison_table`, `stat_row`, `constraint_badges`, `insight_line`, `callout`,
`action_chips`, and `decision`. No new foundational decision, comparison, or booking card
is justified by the audit. Typed portal inputs may remain accessible Solid controls.

### 5.6 Routes

Match the existing singular `/quotation` namespace:

- `POST /quotation/decisions`;
- `POST /quotation/closure-transitions`;
- `POST /quotation/context-grants`;
- `POST /quotation/context-grants/{grant_id}/revoke`;
- `POST /quotation/context-grants/{grant_id}/invites`;
- `POST /quotation/response-links/exchange`;
- `GET /quotation/response-session`;
- `PUT /quotation/response-session/draft`;
- `POST /quotation/response-session/submit`;
- `GET /api/vendor/quotation-responses`; and
- `POST /api/vendor/quotation-responses/{invite_id}/submit`.

`GET /quotation/state` will gain decision/closure projections rather than introducing a
second state endpoint. Public link exchange is isolated from authenticated quotation
routes and creates only an HttpOnly, Secure, SameSite=Strict transaction session.

### 5.7 Feature flags

Keep the existing fail-closed release-evidence gate and flags:

- `OMNYID_QUOTATION_CLOSURE_ENABLED`;
- `OMNYID_QUOTATION_VENDOR_GRANTS_ENABLED`; and
- the extraction, recommendation, clarification-draft, and clarification-send flags.

Add independently gated flags only when their runtime lands:

- `OMNYID_QUOTATION_CLAIMED_VENDOR_RESPONSE_ENABLED`;
- `OMNYID_QUOTATION_SECURE_RESPONSE_LINK_ENABLED`; and
- `OMNYID_QUOTATION_EMAIL_RESPONSE_RECONCILIATION_ENABLED`.

Disabled means no invite, capability exchange, response mutation, or closure mutation.

## 6. Golden fixture set

`tests/fixtures/quotation/vendor_response_closure_golden.json` contains synthetic,
non-deliverable examples for:

1. claimed AFP response;
2. secure-link response;
3. email response;
4. quote revision;
5. contract change;
6. booking confirmation;
7. grant revocation; and
8. deterministic replay expectations.

No name, address, mailbox, token, quote, or vendor identifier in that file belongs to a
real person or business.

## 7. Line-budget baseline

| File | Lines | Rule |
| --- | ---: | --- |
| `src/server/wedding_vendor_claim_routes.rs` | 795 | Do not add response responsibilities; split new modules. |
| `src/server/wedding_vendor_photo_routes.rs` | 530 | Leave response work out. |
| `src/agentcard.rs` | 387 | Add only proven backward-compatible capability fields. |
| `VendorClaimFlow.tsx` | 83 | Keep claim flow focused; compose a separate response workspace. |
| `vendorAgentKeys.ts` | 169 | Reuse keys; do not add inbox state. |
| `vendor_mail_provider.rs` | 190 | Configuration only. |
| `wedding_vendor_outreach_routes.rs` | 835 | Do not expand; reuse through a new orchestration module. |
| `src/quotation/closure.rs` | 287 | Change only for a proven domain gap. |
| `src/quotation/afp.rs` | 334 | Split decision/closure/response message builders before growth approaches the cap. |
| `src/quotation/vendor_context.rs` | 257 | Additive grant contract changes are acceptable. |
| `src/server/quotation_routes.rs` | 365 | Register submodules only; new handlers go in new files. |
| `clarification_routes.rs` | 575 | Read/reuse only. |
| `quotationWeddingClosureAdapter.ts` | 203 | Wedding adapter only. |
| `solid-ui/src/App.tsx` | 5,363 | Do not modify for this programme. |
| `src/server/mod.rs` | 43,550 | Registration-only edits, if unavoidable. |

All new source, test, fixture, and documentation files must remain below 1,000 lines.
Coordination ledgers are already oversized and receive only the entries mandated by
`AGENTS.md`.

## 8. DBV-00 conclusion

The generic quotation, review, clarification, closure, vendor-context, persistence, OCR,
parser, Gmail, claim, AgentCard, decision-card, and A2UI foundations should be reused.
The vendor enquiry/response runtime and local-first vendor inbox must be treated as
missing. WED-216 may now implement the authenticated decision and closure persistence API
without waiting for dirty WED-187, provided no WED-187 implementation is merged until its
overlaps are independently reviewed.

## 9. Local verification result

After installing the lockfile-pinned `solid-ui` and `typescript-sdk` dependencies in the
fresh worktree, `scripts/verify-quotation-readiness.ps1` passed without live provider
calls:

- 57 focused quotation Rust integration tests passed;
- the API-flow target compiled and completed, but real Postgres assertions remain
  conditional because `TEST_DATABASE_URL` was not supplied;
- 29 focused route, parser/OCR boundary, Gmail, and model-ladder unit executions passed;
- `cargo check` passed;
- Solid type checking and 23 focused Solid tests passed; and
- Git whitespace checks passed inside the verifier.

The inherited unused `user_id` warning in `src/server/email_group_routes.rs` remains. An
`npm ci` audit reported pre-existing Solid dependency advisories; no automatic or breaking
dependency update was attempted as part of this contract-only task.
