# WED-411 seating canvas release

## Scope

- Extend the existing visual seating planner without copying the supplied reference UI or introducing a second seating authority.
- Make guest names directly draggable from the unseated list and between tables while retaining tap and keyboard placement.
- Add useful room-layout controls for round, rectangular and head tables, including capacity changes and rotation for large table shapes.
- Persist the visual layout in the existing account-scoped AFP seating projection and keep older assignment-only plans readable.

## Implementation evidence

Worktree: `C:/temp/wt/omnyid-wed411`

Base SHA: `79d4f6ea1fbcabedf1e947f706c357df9e97a5e6`

- `npm run typecheck`: passed.
- `npm run test:line-budget`: passed.
- Focused seating and rendering contracts: 22 passed.
- `npm run test:wedding`: 2,402 passed.
- `npm run test:wedding-site`: 95 public/security pages and the supporting magnet/countdown/quote contracts passed.
- `npm run build`: passed with 1,863 modules.

The change is frontend and AFP-payload additive. The existing protected seating
projection route accepts the same canonical optimization artifact; it stores the new
bounded `table_layout` content alongside assignments. No migration, backend image,
Caddy route or database mutation is required.

## Release evidence

- Exact implementation and deployed static SHA: `d9b6afb8c0d996a64be03386a395444ab2657ce8`.
- Clean release worktree: `C:/temp/wt/omnyid-wed411-release-d9b6afb8`.
- Workspace archive SHA-256: `9480595aff17bf584cb0645d02fba634fcd31fa0e3ddff4004250d89d518a5f2`.
- Hosted `index.html` SHA-256: `5a037553d644d1fedb1874145f0869b4a58f5f3d131be2c134162f2d8e2fb75e`.
- Hosted `assets/main-SrYAkum_.js` SHA-256: `00f671c087dde1982410851f2ecfa214a78ab060f15495cd6e5e64ae0ec82d4a`.
- Candidate and hosted assets contain the bounded Wedding guest drag MIME type and rotation control copy.
- `/`, `/wedding/`, `/workspace/` and `/docs/` return 200. Anonymous `/healthz` remains correctly protected with 401; the authenticated monitor passed public Wedding, Workspace shell, password login, session, bootstrap, health, readiness and current-asset checks 8/8.
- Caddy validates. Caddy and homeserver remained running with zero restarts. Root disk use remained 79% with about 9.4 GiB free.
- Rollback is retained at `/home/ubuntu/omnyid-candidates/wed411-d9b6afb8c0d996a64be03386a395444ab2657ce8/rollback`; its Workspace archive SHA-256 is `dcfa9c2984b59f18ab0180035bdb9ba3d823031eb1fbe41246b0d6a35c5c1a84`.
- Oracle release manifest SHA-256: `f3e5f9d09d9357aa7305aae3f127fd9d2c36051d984623627fe3b68e6741be2f`.

The rollout was additive and static. It changed no database rows, migrations,
homeserver image, Caddyfile or running-container lifecycle.
