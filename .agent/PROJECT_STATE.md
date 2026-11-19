# Current Project State

Implementation branch: `agent/codex/WED-382`
Frozen Oracle release source: `ae1ac01a2c285ac10b09404cffe3db67fbaaa034`
Release authority: `Documents/verification/WED-382-release-evidence.json`
Runtime authority: authenticated `/healthz`; the release artifact records the
observed image, health, billing and browser results. No candidate GitHub CI or
upload was performed because delivery was explicitly Oracle-only.
Task authority: `.agent/TASKS.yaml`; WED-375/380/382 are closed for the bounded
implementation and internal HTTP rollout scope. General production automation
and UI execution activation remain separate and disabled.

The following baseline notes predate that release and are historical context.

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
