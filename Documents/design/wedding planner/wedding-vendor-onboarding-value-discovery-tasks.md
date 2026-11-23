# Wedding Vendor Onboarding and Value Discovery Tasks

Companion spec: `wedding-vendor-onboarding-value-discovery-spec.md`

Branch/worktree: `agent/codex/WED-215` / `C:\Users\ozans\Desktop\projects\OmnyID-WED-215`

Build base: `f6b00e8a4dabf319ac7a8aefd7cece87cb9c89a9`

## 1. Programme rules

- Extend current claim, portal, response, quote, relay, attachment and billing foundations.
- AFP events are canonical; email, portal, Wedding and future templates are projections.
- Use existing A2UI and decision cards before adding a type.
- Use existing OCR and malware scanning; do not build another OCR service.
- Keep policy V2 and vendor mail disabled until their established gates pass.
- Never deploy vendor source data or secrets with application artifacts.
- No new file exceeds 999 lines; split existing large files rather than bloating them.
- Run focused checks after each atomic slice and the full wedding/build matrix before release.

## 2. Dependency map

```text
WED-263 foundation inventory and event contract
  +--> WED-264 entry, claim and progressive profile
  +--> WED-265 owned-enquiry capture
         +--> WED-266 response and quote completion
                +--> WED-267 value proof and outcomes
                       +--> WED-268 transparent plan conversion
WED-264..268 --> WED-269 accessibility, security, eval and dark release
WED-269 --> WED-270 allowlisted vendor cohort
```

## WED-263 — Freeze the current foundations and AFP contract

Goal: prevent parallel identity, enquiry, quote or billing models.

Tasks:

1. Record the exact base SHA, merge-base and production SHA.
2. Inventory existing vendor claim routes, proof methods, portal pages, owner authorization, profile
   editor, email/provider paths, quote engine, attachments, A2UI registry and billing entitlements.
3. Map current events to the spec concepts and identify genuine gaps.
4. Define versioned schemas for enquiry, fact, draft revision, quote approval, value event and outcome.
5. Specify idempotency keys, parent references, actor authority, tenant/business/location scope and
   retention.
6. Add schema fixtures and reject cross-vendor references, client-declared ownership and client-
   declared send/payment completion.
7. Record architecture decisions before migrations or public routes.

Acceptance:

- One reviewed event diagram covers portal, email and couple projections.
- Existing compatible events are reused.
- No LLM, UI or email header can grant ownership or entitlement.
- Replay and tenant-isolation tests pass.

## WED-264 — Build progressive claim and profile activation

Goal: let a vendor verify identity and correct useful details without a long setup wall.

Tasks:

1. Add “Is this your business?” to eligible unverified profiles with clear consequence copy.
2. Reuse the current Google/business-email auth entry; add Apple only through the shared identity
   architecture and a separate provider review.
3. Project available proof methods: matching work domain, DNS/meta proof and supported connected
   business social identity.
4. Keep authentication and ownership proof visibly distinct.
5. Pre-fill public profile details and require confirmation only for fields needed by the first action.
6. Save edits as immutable vendor profile revisions; publish only after claim authority.
7. Show profile preview and completion nudges based on real missing fields.
8. Link claimed users directly to the vendor portal and their pending enquiry, when present.

Tests:

- claim replay/collision/expiry;
- mismatched domain and reserved-address rejection;
- cross-vendor authorization;
- 360 px keyboard/screen-reader claim flow;
- profile correction and rollback; and
- no premium upsell blocks contact/privacy corrections.

## WED-265 — Accept the vendor's own enquiry on day one

Goal: demonstrate value even when the lead did not originate in OmnyID.

Tasks:

1. Add “Paste an enquiry” and reviewed email-forward/import entry paths.
2. Strip quoted history and signatures using the current email/parser path.
3. Accept PDF, DOCX, TXT and image attachments through current upload, malware and OCR controls.
4. Extract bounded structured facts once and store source spans, authority and unknowns.
5. Ask the vendor to confirm or correct material facts before generation.
6. Deduplicate the same source using content/source fingerprints.
7. Create a lightweight follow-up record without requiring CRM migration.
8. Allow outcome tracking for external enquiries without implying OmnyID sourced the lead.

Acceptance:

- A vendor reaches a reviewable enquiry brief in one short session.
- Unknown and withheld facts stay explicit.
- Imported content cannot change a couple's canonical profile.
- Reopening an unchanged enquiry does not repeat extraction or spend.

## WED-266 — Complete a response and quote with explicit approval

Goal: let the vendor finish the real job that justified sign-up.

Tasks:

1. Present the exact permitted couple context and label withheld fields.
2. Generate a grounded response only on explicit request using cached prompt prefixes and the shared
   model/cost ladder.
3. Reuse vendor-approved packages and pricing facts; never infer a binding price.
4. Let the vendor prepare or attach a quote through existing quote intelligence.
5. Show a private calculation worksheet and a couple-facing normalized preview separately.
6. Support rich text and approved attachments on mobile.
7. Show exact sender, recipient, body, attachments and shared data before approval.
8. Append draft revisions and source/cost metadata; edits alone do not call a model.
9. Send only through an authorized provider path. Masked sending stays fail-closed until its gates pass.
10. Project delivery and normalized quote back into the couple's in-context workflow and Documents.

Tests:

- pricing inclusions/exclusions/conditions;
- stale permission snapshot rejection;
- attachments and malware result;
- retry/replay and provider receipt reconciliation;
- own email versus mask selector;
- no send on preview/open/format; and
- quote parity between vendor, couple response and Documents projections.

## WED-267 — Show credible value and follow-through

Goal: make ongoing value visible without invented conversion claims.

Tasks:

1. Define auditable value events for brief reviewed, response approved, quote completed, follow-up
   resolved and outcome recorded.
2. Establish a per-vendor baseline only after enough observations.
3. Display response time, completed work, outstanding follow-ups and estimated minutes saved.
4. Label estimates and expose their input event count/method summary.
5. Add site-visit, quote accepted, booking, lost and unknown outcomes with correction history.
6. Keep organic ranking and paid workflow metrics separate.
7. Add a weekly email summary only after explicit notification consent.
8. Provide CSV/AFP export and deletion coverage.

Acceptance:

- Empty/new accounts say “baseline forming”.
- Every metric traces to tenant-scoped events.
- Corrected outcomes update projections without erasing history.
- No open tracking or sensitive couple inference is introduced.

## WED-268 — Introduce the paid plan after demonstrated value

Goal: convert fairly at the moment the vendor understands the benefit.

Tasks:

1. Define free limits and paid capabilities in the canonical entitlement service.
2. Place upgrade prompts after first value or at a stated limit, never before public-detail correction.
3. Show completed value, affected next action, exact allowance, price, billing period, cancellation,
   export and ranking-independence copy.
4. Permit draft export when a send/automation allowance is exhausted where commercially approved.
5. Add vendor-approved package templates, team assignment, branded quote and analytics entitlements.
6. Implement payment-provider sandbox, webhook replay, entitlement reconciliation, cancellation and
   refund-support flows through existing billing architecture.
7. Ensure failed billing cannot corrupt enquiry, quote or profile records.

Tests:

- free/paid boundary table;
- webhook signature/replay/out-of-order delivery;
- cancellation and export;
- no paid organic-rank boost;
- accessible paywall and mobile overflow; and
- user-facing decline/retry copy without provider internals.

## WED-269 — Run dark product, security and usability gates

Goal: establish evidence before provider or cohort enablement.

Tasks:

1. Run typecheck, all wedding tests, relevant Rust tests, production build, site/CSP smoke and both
   line-budget guards.
2. Run tenant isolation, IDOR, claim takeover, SSRF, upload, stored-XSS, prompt-injection, secret scan,
   logging/redaction and retention tests.
3. Run keyboard, screen reader, zoom, 360 px and reduced-motion coverage.
4. Evaluate structured extraction and quote normalization against reviewed fixtures.
5. Conduct at least five vendor usability sessions across owner-operator and coordinator roles.
6. Measure time to first useful preview and first approved response; capture failures and corrections.
7. Run provider smoke only with authorized credentials and recipients.
8. Keep all sends/payments dark while validating shadow AFP projections.
9. Produce a rollback plan and verify no source dataset or secret is in the release bundle.

Exit gates:

- no unresolved critical/high security issue;
- no serious/critical automated accessibility issue and human keyboard/screen-reader sign-off;
- quote/extraction accuracy threshold met on the frozen corpus;
- permission wording approved;
- vendor usability acceptance met; and
- rollout flags remain off until evidence is reviewed.

## WED-270 — Observe a small allowlisted vendor cohort

Goal: prove reliability and useful conversion before broad release.

Tasks:

1. Freeze the tested commit and publish a cohort manifest.
2. Enable only named businesses/users and approved provider routes.
3. Start with explicit-send and payment-preview modes.
4. Monitor delivery, corrections, complaints, deletion requests and support load for at least seven
   days.
5. Verify organic ranking is unchanged by plan status.
6. Reconcile provider receipts, AFP events, value metrics and entitlements daily.
7. Obtain product, privacy, security, accessibility and operations sign-off.
8. Roll back immediately on cross-tenant exposure, unauthorized send/payment, misleading quote or
   unbounded cost.

## 3. Verification matrix

| Area | Required evidence |
| --- | --- |
| AFP | schema, replay, lineage, authority and tenant tests |
| Claim | proof expiry, collision, mismatch and takeover tests |
| Enquiry | source dedupe, bounded extraction, unknown/withheld facts |
| Response | revision, permission, exact preview, no implicit send |
| Quote | source spans, normalized parity, conditional price labels |
| Attachments | type/size, malware, OCR reuse, ownership and retention |
| Value | event trace, baseline threshold and correction history |
| Billing | signed webhook, replay, reconciliation, cancel/export |
| UX | 360 px, 200% zoom, keyboard, screen reader, touch targets |
| Operations | dark flags, provider smoke, rollback and production SHA |

## 4. Required handoff per slice

Each completed slice records:

- exact commit and dependency SHAs;
- files and contracts changed;
- migrations and rollback;
- tests with counts/results;
- flags and provider state;
- unresolved issues and human gates; and
- the next safe action.

Do not call a slice complete merely because code exists. Completion requires the acceptance evidence
for that slice, and production enablement requires WED-269 and WED-270 sign-off.
