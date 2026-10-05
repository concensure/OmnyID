# Decisions

This file records project architecture and coordination decisions. It is
project truth, not a running diary.

## 2026-10-05: Agent Sessions Begin With Synchronisation

Every Claude or Codex session must start by reading `AGENTS.md` and the
canonical `.agent/` project-state files, then checking git status, recent git
history, relevant other-agent commits, machine-owned CI/build/deployment state
where available, and file-scope overlap against active tasks.

Every substantive session should finish by running the relevant tests/builds,
updating task state, recording architecture decisions, writing a concise
handoff, and committing with the task ID when working on a task branch and the
repo workflow calls for a commit.

## 2026-10-05: Separate Truth From Commentary

Agents must keep concise project facts in `.agent/PROJECT_STATE.md`, active
work in `.agent/TASKS.yaml`, architecture decisions in this file, and
conversational handoff notes in `.agent/HANDOFF.md`.

Validation status is machine-owned. Agents must not manually stamp build,
test, staging, deployment, or production health as passing in project-state
documents. Those states belong to GitHub Actions, GitHub Checks, GitHub
Deployments/environments, and runtime monitoring.

Authority map:

| Domain | Authority |
|---|---|
| Code | Git |
| Tasks | `.agent/TASKS.yaml` |
| Architecture | `.agent/DECISIONS.md` |
| Build | GitHub Actions |
| Tests | GitHub Checks |
| Deployment | GitHub Deployment environment |
| Production health | Health check / monitoring |
| Agent work notes | `.agent/HANDOFF.md` |

## 2026-10-05: Branches And PRs Are Agent Boundaries

Implementation tasks should not casually happen on `main`. Agents should use
task branches such as `agent/codex/WED-142` and `agent/claude/WED-143`, then
use PRs as boundary objects for cross-agent review.

The division of labor is situational rather than permanent:

| Work Type | Primary | Secondary |
|---|---|---|
| Architecture | Claude | Codex critiques |
| Implementation | Codex | Claude reviews |
| UX/frontend | Claude | Codex tests |
| Complex refactor | Codex | Claude architectural review |
| Tests | Codex | Claude examines missing cases |
| Security | Claude | Codex adversarial tests |
| Bug diagnosis | both independently | compare hypotheses |
| Final PR | Agent B | reviews Agent A |

## 2026-10-05: AFP Ledger Is Canonical

The AFP ledger remains the source of truth. UI surfaces are projections over
ledger and persistence state, not independent authorities.

Implications:

- UI state should be replayable or reconstructable from persisted facts.
- Agents should prefer appending facts/events over mutating historical records.
- Any derived view can be stale; the fix belongs in projection refresh,
  invalidation, or evidence sourcing rather than hand-editing project state.

## 2026-10-05: Task Ownership Prevents Agent Collisions

Every non-trivial task should have a single owner, lifecycle status, branch,
file scope, dependencies, and acceptance criteria in `.agent/TASKS.yaml`.

Agents may read other tasks, but should not rewrite another active task's
owned files or contracts without recording coordination in `.agent/HANDOFF.md`.

## 2026-10-05: Development Ledger Should Dogfood AFP

The long-term coordination system should become an AFP-compatible development
event ledger rather than a set of handwritten Markdown files. Agents should be
interchangeable actors against the same project protocol.

Useful event kinds include task creation/claim/completion, implementation
start, file modification, test execution, commit creation, PR creation, review
completion, build status, deployment status, and production health verification.

This should expose AFP weaknesses in ownership, conflicting writes, stale
state, approval semantics, provenance, and event projection while the product
is being built.

## 2026-10-05: Wedding Vendor Search Is Directory-First

`POST /wedding/vendor-search` accepts the optional, backward-compatible
`source_policy` field. `directory_only` returns immediately after the existing
vendor-directory pass with a receipt that records the directory count, skipped
paid calls, and whether a client-side suitability check should request the
single online-capable fallback. Absent or `online_capable` retains the existing
provider behavior.

The shortlist policy is pure and consumes the existing ranking output; it does
not introduce another fit score. It uses a stable material fingerprint,
canonical identity de-duplication, bookable-then-verify ordering, and explicit
verified-photo versus placeholder presentation semantics.

## 2026-10-05: Wedding MVP Uses Durable-First Projection Boundaries

Vendor outreach draft UI becomes editable only after its existing AFP draft
builder has been successfully appended. The active workspace receives quote
DecisionOS requests through the existing AFP save/refresh path; stable quote
identity and the persisted `idempotency_key` suppress duplicate projection on
refresh or reload. The temporary onboarding launch guard uses a
fingerprinted browser-storage record until comparison artifact fingerprints
are available as a first-class persisted projection field.

Sent wedding quote replies close their DecisionOS request by appending a
separate `decision_result` AFP successor. Active and resolved messages have
different stable idempotency keys, so closure never mutates quote history and
reloads cannot append either projection twice.

## 2026-10-05: Oracle Vendor CSV Has a Stable Normalized Export Contract

The Oracle vendor CSV uses the persisted `wedding_vendors` fields
`vendor_id`, `vendor_name`, `category`, `service_area`, `website_url`,
`source_url`, and `status`. Its `photo_count` is intentionally derived from
the existing stable `(vendor_id, slot)` `wedding_vendor_photos` rows, rather
than duplicated on the vendor record. Migration `0096` creates
`wedding_vendor_directory_export` with those exact eight columns, preserving
the CSV contract without count drift.

The 2026-10-05 snapshot has no unrepresented source fields: 130 unique rows,
valid status values, and non-negative photo counts. Any future source fields
must be retained as evidence/provenance before an import is accepted; they
must not be silently discarded by a schema reshape.
