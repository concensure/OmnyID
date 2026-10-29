# WED-298 Oracle release evidence

Date: 2026-10-29 Australia/Sydney

Application commit: `fb1eb49d3e06ccc77ac7d499cf76c591f6538740`

Release checkout: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed298-release-fb1eb49`

Branch: `agent/codex/WED-298`

## Scope

- Restore the public root presentation without replacing its content.
- Repair Wedding task ownership, follow-up, import feedback, Documents, persona/customizer, labels and hover regressions.
- Restore a provider-accepted account confirmation-email path.
- Preserve account-scoped AFP authority and keep vendor-mail kill switches off.

## Root cause and repair

The live root HTML hash matched `docs/index.html`. The page looked chaotic because the static Tailwind build scanned `./*.html` relative to the `solid-ui` invocation directory, producing a 4,860-byte reset-only stylesheet. The config now resolves content relative to `docs/tailwind.config.cjs`; the generated stylesheet is 26,730 bytes and the HTML uses a cache-versioned URL.

The CSP/static smoke test now fails if representative layout/responsive utilities disappear or the generated stylesheet becomes trivially small.

## Frozen candidate checks

All checks ran from the clean detached checkout of the full SHA above:

- TypeScript typecheck: pass.
- Wedding test suite: 2,041 passed, 0 failed.
- Source and Wedding line-budget guards: pass.
- Static homepage and CSP smoke: pass.
- Minimal Oracle Compose parse without interpolation: pass.
- Production UI build: pass; only the existing large-chunk advisory remains.
- `cargo test --lib gateway::smtp_out -- --nocapture`: 7 passed, 0 failed.

## Transactional email

Read-only diagnosis before release:

- Legacy Gmail OAuth token exchange returned HTTP 400.
- SMTP authentication was unavailable.
- The protected Oracle Cloudflare token returned HTTP 200 from the account Email Sending suppressions API.

The existing protected token file, account ID and configured `hello@omnyid.com` sender are now mapped to the separate transactional variables in `.env.oracle`. A timestamped server-side backup was created before the edit. Secret values were neither printed nor committed.

After restart, the transactional account ID, sender and token-file path were non-empty and the token file was readable inside the homeserver. The existing controlled account `concensure+testing@gmail.com` was confirmed unverified, then registration was retried with a throwaway request password. The API returned `verification_required: true` and the successful check-inbox wording, rather than the delivery-unavailable wording. No transactional/provider error appeared in the homeserver log.

This is provider-acceptance evidence. Independent mailbox receipt was not inspected; the account owner should confirm receipt in Gmail.

## Oracle release proof

- Deployment used the existing remote environment and excluded simulated data.
- Preflight proof: pass.
- Post-deploy proof: pass; failure step `none`.
- Isolated restore drill: pass.
- Root disk after cleanup: 81% used.
- Vendor-mail, vendor ingress and sender-mask flags: `false,false,false`.
- Eight representative deployed source files matched the clean checkout by SHA-256.

Hosted checks:

- `/`: HTTP 200.
- `/tailwind.css?v=20261029-wed298`: HTTP 200, 26,730 bytes, responsive grid utilities present.
- `/workspace/`: HTTP 200.
- Root HTML references the versioned stylesheet.
- Headless Chromium at 1440 × 1000 rendered without horizontal overflow and showed the intended styled homepage.

## Provenance note

Oracle runs application commit `fb1eb49d3e06ccc77ac7d499cf76c591f6538740`. The later coordination/evidence commit changes only this report and canonical agent state; it is not a different deployed application candidate.
