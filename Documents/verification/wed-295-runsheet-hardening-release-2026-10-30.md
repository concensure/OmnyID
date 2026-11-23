# WED-295 run-sheet hardening release evidence

Date: 2026-10-30 (Australia/Sydney)

## Release identity

- Application SHA: `27bb198aece93a71999bbe4f386fd5ae2f71030c`
- Branch: `agent/codex/WED-295`
- Development worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`
- Clean release checkout: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed295-release-27bb198`
- Deployment target: Oracle production at `/home/ubuntu/omnyid`
- Simulated data: excluded
- Existing remote environment: retained; no local environment file or secret value was uploaded

The coordination/evidence commit written after this record is documentation-only. Oracle runs the exact application SHA above.

## Delivered behavior

- Legacy, duplicate and replayed run-sheet projections resolve to one deterministic effective row. Detached/manual rows remain untouched.
- Rebuilds are checkpoint-chained in bounded batches of at most 80 writes and retry one stale-checkpoint conflict from a fresh server projection.
- `Review rebuild` reports intended changes without writing them.
- A sanitized, account/database/plan-scoped snapshot supports up to 72 hours of explicitly read-only offline viewing with a visible last-synchronized time.
- Offline snapshots exclude source references, fingerprints, private notes and contact fields, and are capped at 500 rows / 1 MB.
- Projection telemetry contains counts and zero model/token/cost values, not row content.
- Generic databases retain their existing behavior; run-sheet deduplication is profile-scoped.
- Sharing, vendor mail, vendor sender masks and vendor-mail ingress remain disabled.

## Exact-candidate verification

The release checkout was clean and at the full 40-character SHA before every candidate build/test group.

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Generic Database state tests | Pass (27) |
| Wedding tests | Pass (2,063) |
| Source and Wedding line budgets | Pass |
| Production UI build | Pass |
| Responsive/Axe/zoom/focus/forced-colour/PDF Playwright checks | Pass (5) |
| Run-sheet projection Rust route tests | Pass (3) |
| Run-sheet sharing Rust route tests | Pass (2) |
| Disposable-Postgres atomic failure/retry/concurrency scenario | Pass |
| Disposable-Postgres expiry/revocation/acknowledgement scenario | Pass |
| Oracle staging self-test | Pass (58 paths with simulated data, 57 without) |

The real-Postgres tests also cover outsider and wrong-plan refusal, cross-tenant revocation refusal and the absence of a checkpoint after a refused projection. The performance fixture projects 205 sources into three bounded batches and leaves 500 generic database rows unchanged. No model call is involved.

The build retains the inherited approximately 1.66 MB minified `ResponseQueueView` warning. `npm ci` reports 39 inherited audit findings (38 moderate and 1 high); no forced dependency rewrite was applied in this release.

Repository-wide `cargo fmt --check` remains affected by pre-existing unrelated formatting differences. The two changed Rust files were formatted directly and their focused tests pass.

## Deployment and runtime proof

1. Oracle preflight passed.
2. The exact clean release checkout staged 57 reviewed runtime paths and excluded simulated data.
3. The first invocation stopped locally before remote work because a clean checkout correctly lacked the gitignored connection configuration. The retry passed the existing connection values into the clean release script without printing or uploading them.
4. The production UI, backup and homeserver images built; Compose replaced the relevant containers; `/workspace/` returned HTTP 200 through Caddy.
5. The detached post-deploy audit exited 0. Backup service, homeserver and runtime-script integrity passed; backup verification passed; the isolated restore drill passed.
6. The local detached-audit polling wrapper did not return after the remote job had exited. Only that local wrapper was stopped. A fresh read-only production proof then passed without repeating the restore drill.
7. Eight representative deployed source files match the release checkout by SHA-256.
8. The hosted Database bundle returned HTTP 200 and contains `Review rebuild`, `read-only` and `Try reconnecting` markers.

The fresh production proof records a verified backup generated during the release. Oracle root storage settled at 73% used with about 13 GB free.

## Hosted flags-off shadow

The effective homeserver environment reported:

- `OMNYID_WEDDING_RUNSHEET_SHARING_ENABLED=false`
- `OMNYID_VENDOR_MAIL_ENABLED=false`
- `OMNYID_VENDOR_SENDER_MASK_ENABLED=false`
- `OMNYID_VENDOR_MAIL_INGRESS_ENABLED=false`

Content-free database counts before the shadow were 0 grants and 0 acknowledgements. On the API origin:

- `POST /database/wedding-runsheet/shares/open` returned HTTP 404.
- `POST /database/wedding-runsheet/shares/acknowledge` returned HTTP 404.

Counts after the requests remained 0 grants and 0 acknowledgements. No external delivery was attempted. A probe against the marketing origin returned HTTP 405 because that origin does not host the API; the correct API-origin requests above prove the application gate fails closed.

## Release boundary and follow-up

This release makes the disabled sharing implementation operationally reviewable; it does not authorize or enable public run-sheet sharing. Any future activation remains a separate reviewed rollout action.

The highest-value next frontend task is splitting the inherited `ResponseQueueView` bundle so Wedding Today and response workflows do not pay for the entire 1.66 MB surface up front. WED-286's provider-observed bounce/complaint evidence remains independently open before vendor-mail transport may be enabled.
