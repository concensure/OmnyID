# WED-338 Invite Proposals Oracle release

## Released candidate

- Application SHA: `50837982047f4b197c31928fca5538c29517c79a`
- Branch: `agent/codex/WED-338`
- Source worktree: `C:\Users\ozans\Desktop\projects\OmnyID-GROWTH-001`
- Clean release checkout: `C:\temp\wt\omnyid-wed338-release-5083798`
- Oracle `SOURCE_COMMIT`: exact match
- Oracle `oracle-runtime-manifest.json`: exact match
- Production migration: `0148_wedding_invite_proposal_opportunities`

## User-visible result

- Date, location, guest count and category budget are canonical Wedding
  projections and open their existing in-place editing controls.
- The recipient picker has been replaced with a category proposal opportunity.
- `Proposals` follows `Enquired` in the vendor lifecycle filters.
- Claimed vendors receive only matching category/service-area opportunities.
- An unclaimed vendor can respond through a high-entropy, expiring, revocable
  capability link. The reusable plaintext token is never stored.
- Admin sees category-level opportunity, response, claimed-view and secure-link
  creation totals without couple or proposal content.
- The panel uses the available mobile viewport width without shrinking its
  controls or type.

## Security and AFP evidence

- Publication remains false-default in code and is enabled in production only
  for three known operator/test accounts through the email allowlist.
- Authenticated couple, vendor and admin endpoints return `401` without a
  session through the hosted Caddy routes.
- A malformed public capability returns `404`.
- Valid public capability responses set `no-store`, `noindex, nofollow,
  noarchive` and `no-referrer`; the public vendor shell carries equivalent
  robots/referrer metadata.
- Share tokens are 256-bit URL-safe values with SHA-256 digests only in
  Postgres. Links expire after 14 days, opportunities after 45 days, and close
  or republish atomically revokes prior grants.
- Response fingerprints suppress retries. Couple-visible response content is
  stored only in the couple's tenant-private AFP ledger; global operational
  tables retain routing/fingerprint data and bounded aggregate events.
- Publish and close actions also record tenant-private AFP lifecycle events.

## Exact-candidate verification

- TypeScript typecheck: pass.
- Anti-monolith and Wedding 999-line budgets: pass.
- Public Wedding metadata, CSP, catalogue, quiz, confirmation, lead-magnet and
  countdown checks: pass.
- Wedding suite: 2,219 passed, 0 failed.
- Production Vite build: pass.
- Oracle Compose forwarding regression: pass.
- Caddy proposal-route regression: pass.
- Rust library check on the immediately preceding deployment-contract candidate
  `f93e8c59741f944c7d24632795d978006f9a4454`: pass; Rust source is byte-identical
  in the final candidate.
- Focused Rust opportunity tests: 2 passed.
- Migration catalogue parity: pass.
- Disposable pgvector API proof: pass for cross-tenant denial, digest-only
  tokens, noindex response headers, replay suppression, private AFP response and
  lifecycle events, admin aggregates and revocation.

## Oracle evidence

- Caddy contains exactly one handle for each couple, claimed-vendor, public
  capability and admin proposal route family.
- Hosted route checks: couple `401`, vendor `401`, admin `401`, malformed public
  capability `404`.
- Homeserver rollout: enabled with three allowlist entries; this is not general
  availability and does not authorize unsolicited vendor email.
- Homeserver, Caddy, Postgres and backup services are running; ClamAV is healthy.
- Backup verification: pass.
- Isolated restore drill: pass.
- Final root use: 79%, with 9.7 GB available.

## Operational notes

The first promotion found a two-day-old ClamAV container whose `freshclam`
process was alive but whose `clamd` process had exited. Restarting only that
container restored a healthy scanner before service promotion. Cold image builds
then consumed restore headroom. Only unused Docker builder cache was removed;
no images in use, volumes, backups or application data were deleted. A final
synchronous production proof passed after the cleanup.

