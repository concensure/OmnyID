# Vendor-Side Completion and Operator Email Relay Tasks

Companion spec: `vendor-side-completion-and-operator-email-relay-spec.md`

Branch/worktree: `agent/codex/WED-318` / `C:\Users\ozans\Desktop\projects\OmnyID-WED-318`

Build base: `c4d7cf410b88493a1b28548e1eb8d2455be332c9`

## Programme rules

- Extend existing auth, claim, AFP, quotation, file, A2UI and provider paths.
- Keep every new capability independently false-default.
- Do not enable the relay until exact sender, alias, DMARC, HMAC, destination and replay tests pass.
- Do not treat provider acceptance as receipt or a couple decision as vendor confirmation.
- Run focused tests after every slice and the Wedding/build matrix before release.

## Dependency order

```text
WED-318A audit and release boundary
  +--> WED-318B operator relay contracts and storage
  |      +--> WED-318C Worker/server ingress and authenticated send
  |             +--> WED-318D reply correlation and controlled provider proof
  +--> WED-318E missing-listing proposal
  +--> WED-318F vendor quote builder
             +--> WED-318G two-sided booking closure
WED-318E..G --> WED-318H unified vendor mobile journey and release evidence
```

## WED-318A — Freeze audit and Family release boundary

1. Record WED-317 exact deployed SHA, manifest and hosted health.
2. Record that the real-couple/helper gates were approved by the owner without inventing reports.
3. Preserve explicit helper/delegate kill switches.
4. Decide and test global versus owner-allowlisted delegate semantics; never infer an owner ID.
5. Verify account-cache network-only behavior on hosted assets.
6. Record rollback and current Oracle disk headroom.

Acceptance: the feature is available only to the intended cohort and can be disabled without a code
rollback.

## WED-318B — Add relay contract and content-free persistence

1. Add an additive migration for relay threads and events.
2. Store only alias, digests, encrypted recipient, message IDs, receipt state and timestamps.
3. Add a dedicated file-backed relay encryption key.
4. Add strict parsers for alias, sender, destination, To command and threading headers.
5. Reject multiple recipients, OmnyID loops, HTML-only input, attachments and unsafe headers in v1.
6. Add replay, wrong-sender, wrong-alias, cross-thread and ciphertext tests.

Acceptance: no plaintext body or recipient enters operational logs/events, and duplicate ingress
cannot send twice.

## WED-318C — Authenticate ingress and send through Cloudflare

1. Read only the first `Authentication-Results` header.
2. Require `mx.cloudflare.net` and `dmarc=pass` for operator aliases.
3. Require exact HMAC-bound sender and alias allowlists.
4. Keep operator relay and vendor mail feature flags independent.
5. Build Cloudflare payload with exact alias, one To, operator BCC and alias Reply-To.
6. Persist the provider Message-ID and per-recipient state.
7. Add Worker fixtures for valid Cloudflare auth, forged later auth header and DMARC failure.
8. Add mocked provider tests for queued, delivered, bounced, suppressed and rejection states.

Acceptance: an outsider and a forged From cannot produce a provider request.

## WED-318D — Preserve reply threads and run controlled proof

1. Correlate only exact provider Message-ID references.
2. Resolve authorised operator replies to the stored encrypted recipient.
3. Accept external replies only from that exact recipient.
4. Preserve bounded In-Reply-To and References values.
5. BCC the operator on alias-to-recipient sends.
6. Demonstrate one initial command, BCC receipt, operator reply, external reply, replay suppression and
   outsider rejection with redacted evidence.
7. Restore the alias route/flag and compare Cloudflare inventory when the proof ends.

Acceptance: both directions stay in one logical thread without exposing an open relay.

## WED-318E — Let a vendor propose a missing listing

1. Add a “My business is not listed” action after fuzzy suggestions.
2. Capture minimum private fields and duplicate-match candidates.
3. Create a pending identity and immutable proposal receipt.
4. Continue through existing ownership proof; do not publish/rank before verification and review.
5. Add tenant, collision, expiry, reserved-name, SSRF and mobile accessibility tests.

## WED-318F — Complete the vendor quote builder

1. Extend the current transaction panel with typed itemised lines and conditions.
2. Reuse attachment, OCR, malware and quotation normalisation services.
3. Separate private calculation notes from couple-visible quote facts.
4. Validate totals, tax, dates, guest basis, currency and expiry deterministically.
5. Show the exact normalised couple preview before approval.
6. Append a source/cost/revision-bearing AFP draft and explicit approval.
7. Project one quote successor to the couple workflow and Documents.

## WED-318G — Add evidence-backed two-sided booking

1. Replace misleading one-sided `Book` consequence with `Request booking` where appropriate.
2. Bind proposal to exact quote, vendor, date, amount, conditions and evidence.
3. Add vendor accept/change/decline/clarify actions to the existing inbox.
4. Require current claim and representative attestation at mutation time.
5. On exact acceptance, run one idempotent booking/budget/task/decision reconciliation.
6. Test stale quote, changed terms, double submit, cross-vendor ID, claim dispute and cancellation.

## WED-318H — Unify the mobile vendor journey and release

1. Order the portal by the next useful action rather than setup modules.
2. Add clear Inbox, Quotes, Bookings, Profile and Photos navigation without parallel stores.
3. Verify 320/375 px, 200% text zoom, keyboard, screen reader and reduced motion.
4. Run claim/photo/transaction regression, quotation Rust tests, disposable Postgres, Wedding tests,
   TypeScript, production build and both line budgets.
5. Freeze one candidate, generate provenance evidence and deploy only independently approved flags.

## Immediate implementation slice

Implement WED-318B and WED-318C first. They are self-contained, remove the Gmail/DMARC blocker and
do not require redesigning vendor commercial state. Keep the live relay disabled until WED-318D
controlled proof is ready.

## Candidate status — 2026-11-02

- WED-318A: Family release names exact SHA
  `5f1539e657a0cb7e8fa51943f42d9ed2fd77726b`. `SOURCE_COMMIT` and
  `oracle-runtime-manifest.json` match, the homeserver is running with helper/delegate switches and
  the explicit `*` cohort, the latest backup verifies, and the bounded post-deploy proof passes.
  The full disposable restore drill remains skipped because Oracle does not currently have enough
  free space for its calculated restore requirement.
- WED-318B/C: implemented behind `OMNYID_OPERATOR_EMAIL_RELAY_ENABLED=false`. Persistence is
  content-free, addresses are encrypted, sender/alias/DMARC/HMAC checks fail closed, delivery uses
  one recipient plus operator BCC, and safe reply headers are correlated to provider Message-IDs.
- WED-318D: deterministic replay, wrong-party and provider-state tests are implemented. A live
  allowlisted command/BCC/reply/restore proof remains required before enabling any alias.
- WED-318E: implemented behind `OMNYID_VENDOR_LISTING_PROPOSALS_ENABLED=false`. A proposed listing
  remains hidden through ownership proof and moves to operator review before publication.
- WED-318F: the existing protected response panel now has a deterministic itemised quote draft,
  explicit tax/expiry/conditions, a normalised preview and the existing protected attachment path.
- WED-318G: the unsafe one-sided `Book` writer is removed. Accepted quotes now lead to
  `Review booking terms`; a vendor-confirmed exact-revision proposal and its connected
  reconciliation remain open and must be completed before booking can be called end-to-end.
- WED-318H: focused checks are in progress. Keep relay, listing proposal and any future booking
  request switches false until exact-SHA release evidence exists.

## Verification snapshot — 2026-11-02

- Cloudflare Worker fixtures: 8 passed.
- Operator relay provider boundary: 4 passed.
- Operator relay parser, trusted-auth and ciphertext binding: 3 passed.
- Listing proposal validation: 2 passed; migration catalogue: 1 passed.
- Existing ownership API: 2 passed; claim rules: 4 passed; licensed photo processing: 3 passed.
- Quotation library: 33 passed; vendor portal contract: 7 passed; response contract: 9 passed.
- Wedding UI suite: 2,147 passed; focused vendor UI/state tests: 14 passed.
- TypeScript check, production UI build and line budget pass.
- The disposable listing-proposal HTTP test is compiled but not executed because the local Docker
  engine is unavailable. This does not justify enabling the proposal flag.
- The relay controlled provider/BCC/reply proof and two-sided booking closure remain open. Relay,
  missing-listing and booking switches therefore remain false.
