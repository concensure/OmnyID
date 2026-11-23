# WED-403 release evidence

Date: 2026-11-23  
Exact deployed static SHA: `21357b6d6d7cef7dfa8ed2910c0c170c84d9909b`  
Release worktree: `C:/temp/wt/omnyid-wed403-release-21357b6d`

## Delivered scope

- Added a deliberate two-column vendor sign-in experience on desktop.
- Added a desktop claim/search layout with a sticky, explanatory next-steps panel.
- Preserved the single-column mobile layouts and existing claim/proof/dashboard flows.
- Added `hello@omnyid.com` links with subject `vendor listing claim` and explicit
  missing-listing-first guidance before and after sign-in.
- Routed only the exact signed-in `admin@omnyid.com` account from `vendor.html` to
  the existing main Workspace. The rule is navigation only and grants no authority.
- Kept ordinary vendors, public proposals, special management and celebrant links on
  their existing paths.
- Changed the runtime starting-context hero CTA from `Build my wedding plan` to
  `Start planning free`, matching the static Wedding home.

## Clean-candidate proof

The detached exact-SHA worktree was clean before test and build. The following passed:

- TypeScript.
- Both source line-budget gates.
- All 93 public-site metadata/security pages and Wedding site smokes.
- 2,381 of 2,381 Wedding tests.
- Production build with 1,856 modules.
- Focused exact-admin and lookalike-account routing tests.
- 1440px and 390px browser render checks with no horizontal overflow.

The Workspace archive SHA-256 was
`8e81fb76c3b979c591ce64f41a65a005d53e12a2fabfd4771a733d01c182234e`.

## Oracle production proof

The release was static-only and additive. The previous Workspace and landing-context
file were archived first. Candidate and live hashes match:

| Asset | SHA-256 |
|---|---|
| Wedding `landing-config.js` | `963d723fe22a1edf91c3ceda4f196c798f63f182022e209260f2b1198c754401` |
| Workspace `vendor.html` | `f5edb6f76d82aae548212ec38149afff0235ef5072b9dd390f342c2b04b74031` |

Production browser proof returned the desktop heading, visible claim next-steps panel,
pre-addressed email link, `/workspace/` for the exact admin session, and `Start planning
free` after the Wedding landing-context script ran. Both vendor and Wedding mobile
checks had no horizontal overflow.

The homeserver remains on exact WED-402 revision
`618ceee7c95bf2f49f9f79531115227e41d1551d`. Homeserver and Caddy report zero
restarts, Caddy validates, and the authenticated scheduled monitor passed public
Wedding, Workspace, password login, session, bootstrap, health, readiness and asset
checks.

Rollback is retained at
`/home/ubuntu/omnyid-candidates/wed403-21357b6d6d7cef7dfa8ed2910c0c170c84d9909b/rollback`.

Oracle root use was 91% after release. The pre-existing WED-402 restore drill capacity
follow-up remains and is not caused by this static product change.
