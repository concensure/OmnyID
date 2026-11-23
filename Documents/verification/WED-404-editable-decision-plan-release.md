# WED-404 editable decision-plan release evidence

Date: 2026-11-23  
Exact deployed static SHA: `22e6a226224e7103697c66a993207c29b606704c`  
Release worktree: `C:/temp/wt/omnyid-wed404-release-22e6a226`

## Delivered scope

- Added one shared Personal Agent/Wedding plan-edit contract for explicit
  `not_applicable`/`restored` outcomes and user-authored decisions.
- Kept Snooze and Wedding Defer as time-based choices; the visible general dismiss
  affordance no longer ambiguously means “ask me again”.
- Added a pre-save causal-follow-up preview, immediate Undo, durable Plan Restore and
  current-graph suppression so independent decisions remain visible.
- Preserved existing notes, evidence, quotes, bookings, answers, task completions and
  approval records. Later evidence offers Restore rather than silently resurfacing a
  settled exclusion.
- Added Plan-level custom decisions and linked follow-up decisions from active,
  completed and not-applicable cards. Only the question is required; choices, due
  date and note are optional.
- Scoped Personal Agent state to the current account and Wedding state to the
  canonical response workspace for authorised partner projection.
- Kept task suggestions, vendor/guest messages, bookings, payments and every other
  external commitment behind the existing approval boundary.

## Clean exact-candidate proof

The detached worktree was clean at the full gate. TypeScript, both line budgets, all
93 public/security Wedding pages, and all 2,388 Wedding tests passed. The production
build transformed 1,859 modules. Focused lifecycle and render coverage passed 7/7,
including local optimistic reload, partner-scope AFP shape, causal-only suppression,
explicit restore and both Personal/Wedding controls.

Workspace archive SHA-256:
`4f7f5e3238800f58bac32fad3107e28c9626d3a6babfe5ec000bbf444aa1d0bf`.

## Oracle production proof

This was an additive static Workspace release. The prior Workspace volume was
archived before copying the exact candidate. Candidate and live SHA-256 values match:

| Asset | SHA-256 |
|---|---|
| `main-ClLGywef.js` | `98ab205ba9702345bc3c91744d82e08fcbf104128b1e808a3085c9dbb4d35e1c` |
| `WeddingResponseWorkspaceView-DKivj0tQ.js` | `2810803415adf6d40b933ac0fbc52a73381ea76c254c8a938e77109453cdfbb8` |

The authenticated read-only monitor passed all eight checks: public Wedding,
Workspace shell, password login, authenticated session, bootstrap, health, readiness
and current Workspace asset. Caddy validates. Homeserver revision remains
`618ceee7c95bf2f49f9f79531115227e41d1551d`; homeserver and Caddy both have zero
restarts. No backend image, database, migration, Caddy route or public Wedding file
changed.

Rollback is retained at
`/home/ubuntu/omnyid-candidates/wed404-22e6a226224e7103697c66a993207c29b606704c/rollback/workspace-before.tar.gz`
with SHA-256
`cc0d62b81510c8c4f6c766e544d7eba6c31c8110e31fc1557f5a2708b5338174`.
Root use remains 91% with about 4.4 GiB free. The earlier WED-402 disposable restore
drill still needs roughly 3.1 GiB additional headroom; this static release did not
attempt or weaken that preflight.
