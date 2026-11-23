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

Pending exact clean-SHA packaging, Oracle installation, rollback capture and hosted
smoke checks.
