# WED-402 release evidence

Date: 2026-11-23  
Implementation tip: `5cf3eb3e7facb0855c35438c8c7525b9da1a6c19`  
Exact release snapshot: `618ceee7c95bf2f49f9f79531115227e41d1551d`  
Release worktree: `C:/temp/wt/omnyid-wed402-release-618ceee7`

The snapshot has the same Git tree as the implementation tip. GitHub native ARM64
workflow run `45091480617` checked out that full snapshot SHA, built the homeserver
and uploaded artifact `14782355536`. The archive SHA-256 is
`897e808ce9a2662243839a544a68e3d4a19b08f177ee72c09318a57e271c8f84`.
Its OCI configuration records `linux/arm64` and the exact release revision. Oracle
runs manifest
`sha256:61d4734d4dd792446e6af435cc3d02d1f635e8a363bda2fe09f0a751c35da83b`.

## Delivered scope

- Reconciled T1-T16 in the existing small-wedding alignment task document.
- Kept the general Soft headline while naming intimate, micro and larger formats.
- Carried optional format through the existing revisioned intake and planning paths.
- Added first-100 founding-couple/two-year and founding-vendor/lifetime pricing labels.
- Used the existing eucalyptus wreath SVG as the Wedding persona icon.
- Shared one authenticated bounded Wedding assistant between Master Agent and Sprout.
- Limited actions to allowlisted current-account navigation and reviewable drafts;
  project/admin/secret/other-user data and external commitments remain unavailable.
- Added first-party Wedding guide suggestions and the account-scoped Today image flow.
- Recovered mobile timeline width and endpoint/date-label legibility.
- Added and deployed the explicit `/wedding/assistant` Caddy proxy route.

## Exact-candidate verification

- TypeScript and both line-budget checks passed.
- All 93 public-site and security page checks passed.
- Wedding suite passed 2,378 of 2,378 tests.
- Production build completed with 1,855 modules.
- Native ARM64 release workflow passed from the exact snapshot.
- Caddy validation passed before and after deployment.

Candidate and live hashes match:

| Asset | SHA-256 |
|---|---|
| `Caddyfile` | `a42af9c9956f52154ed6809c54e312bd50dcd53af3346dfc807ec6e4700c326e` |
| `wedding/index.html` | `9ffc6dae75e0e6981f4d0d047429469a3ecdda1e8d52ccbd9e624a3d0343e4ca` |
| `wedding/pricing.html` | `5c347c3f579b8960151ef5820c428f5d03097a7a165b39c54abd00238e66f89c` |
| Workspace `index.html` | `76742bcfaefa04c5d2fe99a61ef3fab04783f7cf26c4dbc1daadac5b62154c10` |
| Eucalyptus persona SVG | `c2663796c9a5b20b548057ec3637bbbdf2fbca880afa4de83102b96ae1e7b34e` |

## Production proof and rollback

The exact homeserver revision and Caddy are running with zero restarts. Public
Wedding, pricing, Workspace, Docs and persona-icon routes return successfully.
The assistant route is proxied rather than exposed as a static file. The scheduled
twice-daily authenticated Wedding monitor passed all eight checks. An authenticated
assistant smoke returned the bounded `open_view:budget` action and one first-party
guide without mutating the workspace.

Rollback is retained at
`/home/ubuntu/omnyid-candidates/wed402-618ceee7c95bf2f49f9f79531115227e41d1551d/rollback`,
including the preceding image tag, Caddyfile and static archives.

Backup integrity and manifest verification pass. The disposable restore drill was
not started because its safe preflight required 8,060,983,148 bytes while only
4,776,591,360 bytes were free. At least about 3.1 GiB must be recovered before the
drill is rerun. No production data or container was modified by that failed preflight.

Broad repository CI is still red for two pre-existing classes outside this product
slice: Linux PowerShell tests assume `$TEMP`, and the existing Rust lockfile has
newly published dependency advisories. This document does not relabel those checks
as passing.
