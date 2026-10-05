# Decisions

This file records project architecture and coordination decisions. It is
project truth, not a running diary.

## 2026-10-05: Master Agent Suggestions Do Not Preempt Their Result

The Master Agent always remains on the Search result after a direct command.
`suggested_view` may seed an available workflow handoff, but it does not
navigate away before the locally rendered result is visible. A rich encrypted
preview is decrypted in browser memory; if it cannot unlock, the UI renders the
response's safe summary and explicitly tells the user that the detailed view is
still locked.

## 2026-10-05: Command Previews Decrypt at the Client Render Boundary

An encrypted `preview_message` returned directly by the Master Agent command
endpoint is decrypted in browser memory before it enters the command-result
render signal. This uses the existing per-account E2EE key and never writes
plaintext to local storage or sends it back to the server. If the device cannot
obtain or use its key, the renderer retains its explicit unlock placeholder.

## 2026-10-05: Mobile Wedding Triage Is an AFP Projection, Not a Queue Store

The phone focus deck is a view over the existing wedding decision and quote
reply projections. Navigation is local view state; approve/defer creates a
privacy-minimised append-only `decision_triage` AFP event. Wedding deferral
also continues to use the existing `wedding_decision_deferral` path, so the
existing resurfacing policy remains authoritative. The deck cannot directly
send a vendor email: ready-to-send replies require the established confirmation
and send workflow.

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

## 2026-10-05: Saved Model State Is Not Inference Health

The Master Agent model pill identifies a saved workspace configuration only; it
is not a connectivity or provider-health claim. When a command falls back after
a saved configuration cannot yield a usable response, the server sends explicit
`model_configured` fallback metadata and the UI directs the user to test that
model instead of saying no model is connected.

Platform-funded wedding AI remains separate from user BYOK and direct Master
Agent queries. Wedding vendor outreach requires an explicit server policy,
enforceable daily request limit, and a tenant-scoped shared-tool usage receipt;
the route fails closed if any are unavailable.

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

## 2026-10-05: Google Vendor Photos Use the Authenticated API Fetch Path

Google Places photo URLs remain same-purpose, server-side proxies; they are
not copied into Seaweed FS. Browser image elements cannot attach the workspace
Bearer token, especially when the API host differs from the static workspace
host. The comparison card therefore retrieves only the narrow, validated
Google proxy path via the existing authenticated API base, renders a temporary
object URL, and revokes it on cleanup. This preserves the server-side Places
credential boundary while retaining the existing truthful placeholder for a
failed image response.

## 2026-10-05: Static Docs Mount Is Deny-by-Format for Internal Sources

The Oracle Caddy container bind-mounts `docs/` for a small public static site.
That mount is also a deployment input and must not make operational Markdown,
TypeScript, SQL, review, or CSV files downloadable. Caddy rejects those
formats before static resolution at both the root and `/docs/` aliases.
Public HTML legal pages, static assets, and `/.well-known/security.txt` remain
available. Internal documents should be kept outside `docs/`; the deny rule is
defence in depth for an accidental staged file.
