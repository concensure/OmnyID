# Current Project State

Current branch: `main`
Current release: latest local git tag `v0.1.0`
Current HEAD: `c3c0399`
Production SHA: see GitHub Deployment for the `production` environment

## Working

- AFP ledger persistence
- Vendor search
- Decision cards
- A2UI projection

## In Progress

- Wedding vendor recommendation pipeline
- Approval to enquiry workflow
- Shared Claude/Codex coordination protocol

## Known Failures

- Venue availability state can become stale
- Email enquiry retry is not idempotent
- Build/test/deployment/production state is not yet fully queryable from a
  shared project tool.

## Current Architecture

- AFP ledger is the source of truth
- UI is a projection
- Postgres/Supabase persistence
- SolidJS frontend
- Agent coordination uses `.agent/` files as the current project ledger

## Machine-Owned Verification

Agents must not manually declare `Build: PASS`, `Tests: PASS`,
`Staging: PASS`, or `Production: HEALTHY` in this file.

Use these authorities instead:

| Signal | Authority |
|---|---|
| Code | Git |
| Tasks | `.agent/TASKS.yaml` |
| Architecture | `.agent/DECISIONS.md` |
| Build | GitHub Actions |
| Tests | GitHub Checks |
| Staging deployment | GitHub Deployment environment |
| Production deployment | GitHub Deployment environment |
| Production health | Runtime health check / monitoring |
| Agent commentary | `.agent/HANDOFF.md` |

## Last Maintained

- File updated: 2026-10-05
- Branch and HEAD above were read from local Git.
- Release above was read from local Git tags.
