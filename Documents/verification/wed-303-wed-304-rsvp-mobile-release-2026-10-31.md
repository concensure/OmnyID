# WED-303 / WED-304 RSVP provider and mobile planner release

Date: 2026-10-31 (Australia/Sydney)

## Release identity

- Development worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`
- Branch: `agent/codex/WED-303`
- Clean release worktree: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed304-release-eff62d1`
- Deployed application SHA: `eff62d1c44d3140d9fa2edae04cc4cbfcd65ba21`
- Simulated data was excluded from the release bundle.

The first candidate, `da70a39fffd18084baa38c93a223ecc7258ace02`,
failed during the remote UI build because the staging manifest omitted
`solid-ui/rsvp.html`. No production container had been replaced. Commit
`eff62d1c44d3140d9fa2edae04cc4cbfcd65ba21` corrected and self-tested that
manifest before the successful release.

## Delivered behavior

- Venue-research decisions now use `Open shortlist` when relevant results
  exist and `Search vendors` otherwise. The action opens the existing
  in-place Vendor surface and does not record a false approval or completion.
- Mobile navigation calls the combined planning surface `Plan`; Timeline and
  the other planning views remain available inside it.
- Saved contributions immediately appear in the canonical Budget projection
  and total without being misclassified as committed spend.
- Today, Wedding Overview and Vendors reflow at narrow widths. Overview tiles
  no longer overlay their values, labels and status chips, while vendor filter
  rails remain horizontally reachable.
- RSVP reminder delivery is server-authoritative. It rehydrates the exact
  tenant-private draft and approval, reserves deterministic idempotency before
  provider use, and records provider accepted, delivered, failed and retry
  decisions as distinct AFP events.
- Browser input cannot replace the approved recipient or content. Reminder
  approval and provider send remain separate user actions.
- `/wedding/rsvp/reminders/*` is explicitly proxied to the protected backend.

## Clean-SHA verification

Run against the clean release worktree and exact deployed SHA:

- `npm run typecheck`: passed.
- `npm run test:line-budget`: 2 passed.
- `npm run test:wedding`: 2,089 passed.
- `npm run build`: passed.
- Oracle runtime staging self-test: passed with 59 simulated-data paths and
  58 production paths, proving that `rsvp.html` is present in both cases.
- `cargo test --lib wedding_rsvp -- --nocapture`: 16 passed. The environment-
  backed cases reported their documented skip when no disposable Postgres URL
  was supplied; the earlier WED-303 candidate retained real-Postgres evidence.
- Focused Playwright at 320, 390 and 1280 CSS pixels: 5 passed, with no
  horizontal overflow and no serious or critical Axe findings.

## Hosted evidence

- Production containers started successfully and the Caddy configuration
  validated.
- `https://omnyid.com/workspace/`: HTTP 200 through the Oracle loopback.
- `https://omnyid.com/wedding/`: HTTP 200 through the Oracle loopback.
- Unauthenticated `/wedding/rsvp/reminders/status`: HTTP 401. This proves the
  route reaches the protected backend instead of a public/static fallback.
- Loaded Caddy configuration contains `handle /wedding/rsvp/reminders/*`.
- Deployed `WeddingResponseWorkspaceView-tWtQeC5k.js` contains the release
  markers `Open shortlist`, `Search vendors` and `Send approved reminder`.
  Its hosted SHA-256 is
  `6392c44bb2ffb69e8480b2386798efe1a0fb1f3403e56676f1ff3932bba67c70`.
- Post-deploy production proof passed backup/runtime checks. The newest backup
  manifest, Postgres archive and SeaweedFS mirror are internally consistent.
- Root disk after build cleanup settled at 74%, approximately 12 GB free.

## Rollout state

The application is live, but public/provider RSVP rollout remains deliberately
disabled:

- `OMNYID_WEDDING_RSVP_REMINDER_SEND_ENABLED`: unset, default false.
- `OMNYID_WEDDING_RSVP_PUBLIC_ENABLED`: unset, default false.
- `OMNYID_VENDOR_MAIL_ENABLED`: false.
- `OMNYID_VENDOR_SENDER_MASK_ENABLED`: false.
- `OMNYID_VENDOR_MAIL_INGRESS_ENABLED`: false.

No rollout flag was changed. The post-deploy proof verified the current backup
but skipped a second restore drill; this document therefore does not claim a
new WED-303 allowlisted-pilot or full rollback-drill gate. Hosted couple/guest
usability, accessibility and the allowlisted pilot remain separate rollout
work.
