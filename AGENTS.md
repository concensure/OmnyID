# Agent Session Protocol

This repo is shared by multiple coding agents. Agents coordinate through
artifacts and observable events, not conversation history.

## Canonical Coordination Files

Read these before substantive work:

1. `AGENTS.md`
2. `.agent/PROJECT_STATE.md`
3. `.agent/TASKS.yaml`
4. `.agent/DECISIONS.md`
5. `.agent/HANDOFF.md`

The root `PROJECT_STATE.md`, `TASKS.yaml`, `DECISIONS.md`, and `HANDOFF.md`
files are compatibility pointers only. The `.agent/` copies are canonical.

## Start-Of-Session Synchronisation

Before changing code or project state:

1. Read the canonical coordination files listed above.
2. Inspect `git status --short --branch`.
3. Inspect the recent git log, usually `git log --oneline -10`.
4. Inspect relevant commits made by the other agent before modifying dependent
   contracts or files.
5. Check current CI/build/deployment status where tooling is available.
6. Identify the task you are working on in `.agent/TASKS.yaml`.
7. Determine whether another active task overlaps the files you intend to
   modify.
8. Do not overwrite another agent's active work.
9. If another agent implemented a dependency, consume it rather than
   independently reimplementing it.

If the task is missing, add it to `.agent/TASKS.yaml` with an owner, lifecycle
status, branch, dependencies, file scope, and acceptance criteria before doing
substantive work.

## Local Worktree Storage

- Put disposable verification and release worktrees under `C:\temp\wt\`; do
  not scatter new throwaway checkouts through Desktop, `.worktrees`, or user
  Temp folders.
- Reuse `CARGO_TARGET_DIR=C:\cargo-target` across retained worktrees. Do not
  create another multi-gigabyte per-worktree Cargo `target/` unless a task
  explicitly requires isolated compiler output.

## Branch And PR Boundaries

Do not casually work on `main` for implementation tasks. Use task branches:

```text
main
  |
  +-- agent/codex/WED-142
  +-- agent/claude/WED-143
  +-- agent/codex/WED-144
```

Use PRs as the review boundary between agents, even for solo development.

Preferred collaboration pattern:

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

Avoid permanently assigning one agent to frontend and the other to backend.
Cross-review is part of the system.

## Machine-Owned Operational Truth

Do not manually declare build, test, deployment, staging, or production health
as passing in project-state docs.

Use these authorities:

| Domain | Authority |
|---|---|
| Code | Git |
| Tasks | `.agent/TASKS.yaml` |
| Architecture | `.agent/DECISIONS.md` |
| Build | GitHub Actions |
| Tests | GitHub Checks |
| Deployment | GitHub Deployments/environments |
| Runtime health | `/healthz`, `/readyz`, and future `/api/health` |
| Runtime version | future `/api/version` |
| Agent handoff | `.agent/HANDOFF.md` |

When available, compare local HEAD to deployed SHA. If they differ, assume the
code you are reading has not reached that environment.

## Finish-Of-Session Checklist

Before finishing substantive work:

1. Run required tests for the files changed.
2. Run the required build when the change affects buildable code or deployment.
3. Update the relevant task state in `.agent/TASKS.yaml`.
4. Record important architecture decisions in `.agent/DECISIONS.md`.
5. Write a concise handoff in `.agent/HANDOFF.md` describing:
   - what changed
   - why
   - files changed
   - tests performed
   - unresolved problems
   - assumptions
   - recommended next action
6. Commit the work with the task ID when working on a task branch and the user
   has asked for commits or the repo workflow requires them.

If a test, build, CI query, deployment query, or commit cannot be completed,
record why in `.agent/HANDOFF.md` and in the final response.

## Wedding Blog Publication Catalogue

Every new or updated post published under `wedding/blog/` must be reconciled
with `Documents/marketing/wedding planning/posts/blog/blog-publication-catalogue.csv`
in the same change. Record the canonical URL, publication state and the
relevant searchable tags: stakeholder, one of the six wedding-planning stages,
location when applicable, and emotion. Keep only the intentionally featured
tag visible on the blog card; the richer catalogue tags remain available to
article metadata and blog search. Run `scripts/reconcile-wedding-blog.ps1`
when practical rather than editing generated catalogue fields by hand.

## Public Page Metadata Contract

Every indexable page that does not require sign-in under `docs/`, `wedding/`,
or another public OmnyID surface must ship with the page content, not as a
later SEO patch. Use `en-AU`, one truthful self-referencing canonical, complete
Open Graph and Twitter metadata, and JSON-LD containing the OmnyID Pty Ltd
Organization, the applicable SoftwareApplication, and a WebPage or Article.
Articles identify Casper Wu and include visible, machine-readable publication
dates. Campaign-only duplicates must be `noindex` and absent from the sitemap;
indexable landing pages use their own canonical. Never add unsupported entity,
availability, price, review, or business claims to structured data.

Add each indexable public route to `docs/sitemap.xml` and run
`node scripts/reconcile-wedding-seo.mjs` plus
`node wedding/tests/public-metadata-smoke.mjs`. The reconciler covers both the
root public site and Wedding pages despite its legacy filename. A new root HTML
page must either appear in the sitemap and pass this contract or explicitly be
`noindex`; transactional confirmation, reset, and authenticated pages stay out
of the sitemap.

## Future Project Control Plane

The desired long-term shape is a project MCP or AFP-backed development ledger
with operations such as:

- `project.get_state()`
- `project.get_tasks()`
- `project.claim_task()`
- `project.get_ci_status()`
- `project.get_deployment()`
- `project.get_production_health()`
- `project.get_recent_commits()`
- `project.get_decisions()`
- `project.write_handoff()`

The event ledger should use a subset of AFP where practical. Useful event
kinds include:

- `development.task.created`
- `development.task.claimed`
- `development.implementation.started`
- `development.file.modified`
- `development.test.executed`
- `development.test.failed`
- `development.test.passed`
- `development.commit.created`
- `development.pull_request.created`
- `development.review.completed`
- `development.build.started`
- `development.build.passed`
- `development.deployment.started`
- `development.deployment.completed`
- `development.production.health_verified`
- `development.task.completed`

The point is compact, inspectable state: task, actor, commit, changed contract,
evidence, timestamp, and next action.
