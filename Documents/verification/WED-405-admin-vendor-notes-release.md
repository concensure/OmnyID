# WED-405 release evidence

Date: 2026-11-23  
Exact implementation and deployed SHA: `0704ea99171a7946aa6a82f2580f6f8ff83e0e64`  
Task worktree: `C:/temp/wt/omnyid-wed405`  
Clean release worktree: `C:/temp/wt/omnyid-wed405-release-0704ea99`

GitHub native ARM64 workflow run `45128138875` checked out the full SHA above,
verified a clean `aarch64` runner and uploaded artifact `14797136899`. The image
archive SHA-256 is
`79c0004e30e782451ddd234ea0fcde166cd2e5a573f477111927a936fb1a84dd`.
The loaded Oracle image is `sha256:b8c5012cf356086d7ea5b34982dcdfe7a1532b48b1429a199cb47d6cf7519b6f`;
its OCI revision is the exact deployed SHA and its architecture is `arm64`.

## Delivered scope

- The exact normalized `admin@omnyid.com` entry remains in the general Workspace
  before and after OAuth refresh. This changes presentation only; the server's
  `operator` result remains the authority for every admin panel, read and command.
- The existing operator vendor panel now loads the complete bounded catalogue,
  filters it by category, provides typo-tolerant local search, shows the canonical
  claim state and invokes the existing operator-only availability-link authority
  from each result.
- Notes retains canonical AFP storage and conflict handling while exposing one
  visible save action, explicit save state, a wider editor and collapsible left
  hierarchy and inspector. Folders lead the hierarchy; Tags and System domains
  start collapsed. Ask/AI, summary, backlinks and history are inspector sections.

## Exact-candidate verification

- 15 focused admin-routing, vendor-directory, claim-state and Notes contracts passed.
- TypeScript and both line-budget checks passed.
- All 2,388 Wedding tests and all 93 public/security page checks passed.
- The production build completed with 1,861 modules.
- Focused Rust coverage for the public/admin vendor-list bounds passed.
- The native ARM64 workflow passed from the exact committed source.

Candidate and publicly served Workspace hashes match:

| Asset | SHA-256 |
|---|---|
| Workspace `index.html` | `645ea019018530eee3f04c2aab81aec831d9d94b0454fb65b8381ebda91e3620` |
| `main-Dc6FmZIv.js` | `1d302cb7062d963cf99a044e535781ef3816bfce6a3973c50ac96b5fdb3c7e3b` |
| `NoteView-KaydD6Sg.js` | `ec5ff4a62b112d2bc283b03fadaa350f333d189035f147c366311a726ec1b9e5` |
| `UsageView-DK2GWoOM.js` | `030b97275474c88843b5ae2d48a79f10d07d1e798a15a05dec2c4849993e79d1` |

The live Usage chunk contains the claim-state and Generate calendar link controls;
the live Notes chunk contains the single Save changes control, Hide inspector and
Ask / AI affordances. A non-operator authenticated production account receives
`403` from the admin vendor endpoint on `api.omnyid.com`. No live availability
capability was generated merely for smoke testing, because that would create a
real bearer link; the button reuses the already operator-gated batch authority.

## Production proof and rollback

The scheduled read-only monitor passed all eight checks after deployment: public
Wedding, Workspace shell, password login, authenticated session, Workspace
bootstrap, health, readiness (including database and daemon dependencies), and the
hashed Workspace asset. Wedding, Workspace and Docs return HTTP 200. Caddy validates
unchanged and has zero restarts. The homeserver has zero restarts and no severe log
entries after the swap.

Rollback is retained at
`/home/ubuntu/omnyid-candidates/wed405-0704ea99171a7946aa6a82f2580f6f8ff83e0e64/rollback`.
It contains the preceding Workspace archive, Caddyfile, Compose file, container
inventory and full homeserver/Caddy inspections. The preceding image remains tagged
`omnyid-homeserver:wed402-618ceee7-arm64`. The two large upload archives were removed
from Oracle only after checksums, image load and hosted proof passed; copies remain
locally and in GitHub artifact `14797136899` for its three-day retention window.

Oracle root use is 93% with about 3.4 GB free after staging cleanup. This is enough
for the running release but still below the previously recorded safe disposable
restore-drill headroom; do not relabel that separate capacity follow-up as complete.
