# WED-352 vendor proposal feeds and Wedding database projections

Date: 2026-11-10  
Branch: `agent/codex/WED-352`  
Application commit: `ce0cada97dd6e2fe4c17da4c6a8ca08947050dc0`  
Clean release checkout: `C:\temp\wt\omnyid-wed352-release-ce0cada`

## Delivered

- Operators and verified listing claimants can create, rotate and revoke a
  private 30-day vendor lead-feed URL. Only a SHA-256 digest of its 256-bit
  bearer token is stored.
- The no-login feed is bound to one active vendor listing and rechecks category
  and service-area eligibility on every read and response. It exposes only the
  context a couple published through Invite Proposals.
- A vendor can respond privately with a proposal, an indicative suitable date,
  or a request that OmnyID notify the couple. The existing response table and
  tenant-private AFP document projection are reused; an offered date is not a
  hold or booking.
- The operator dashboard lists submitted intents with the couple email and the
  shared category, date, location, guest count, status, views and replies, and
  can issue or revoke a selected vendor's feed.
- The Database view synthesizes a read-only **Wedding plan** database from the
  account-scoped ledger. It opens on Budget and exposes Budget, Timeline and
  Seating without copying those facts into a second store. User-created
  databases and the run-sheet profile remain available.

## Security properties

- New issuance revokes the prior feed for that listing; revocation, expiry and
  active-listing state are enforced at request time.
- Reads and replies are token-scoped and rate-limited. Reply fingerprints make
  retries idempotent.
- Every route in the proposal API, including rejected/expired bearer requests,
  receives `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and
  `X-Robots-Tag: noindex, nofollow, noarchive`.
- Operator detail access remains operator-only and does not read unrelated
  messages, documents, budget or wedding history.

## Verification

- `cargo check --tests`: passed.
- Disposable loopback/tmpfs PostgreSQL integration test
  `wedding_invite_proposal_opportunity_api`: 1 passed. It covers account and
  listing authority, digest-only storage, matching, suitable-date persistence,
  admin detail visibility, link rotation, replay handling and privacy headers
  on revoked tokens.
- TypeScript: passed.
- Focused registry/projection/feed tests: 8 passed.
- Wedding line-budget checks: 2 passed.
- Full Wedding suite: 2,252 passed before the final backend-only privacy-header
  change; the final integration test and Rust check cover that change.
- Production Vite build: passed (known chunk-size advisory only).

## Oracle evidence

- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both contain the
  full application SHA above.
- Migration 0154 is active: the
  `wedding_invite_proposal_vendor_feed_grants` table exists and proposal
  responses contain `response_kind` and `available_date`.
- A hosted invalid-token request returns HTTP 404 with `no-store`,
  `no-referrer`, and `noindex` headers.
- Caddy, homeserver, PostgreSQL, Electric, SeaweedFS, ClamAV and backup services
  are running.
- The post-deploy production proof reports `status=pass`; manifest and backup
  verification pass and the restore drill passes. Root and `/var` usage are
  both 79%.
- Proof artifacts are outside the repository under
  `C:\temp\wt\proofs\wed352-release-ce0cada`.

