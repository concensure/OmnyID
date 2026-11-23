# WED-401 Workspace recovery and plan-change release

Date: 2026-11-23 (Australia/Sydney)

## Released candidate

- Branch: `agent/codex/WED-401`
- Source worktree: `C:/temp/wt/omnyid-wed401`
- Clean release worktree: `C:/temp/wt/omnyid-wed401-release-9ff9a74f`
- Exact application/static SHA: `9ff9a74fef888b0e124c3b9fbf71d4491c6a5862`
- Workspace archive SHA-256:
  `a5da0af5fc3aa0b7b38c8d24993399a58f2eee3368240a00220bd3cf6e907bea`

The earlier `8fcb12cea5e7baf1e60e2027c60dd0e994937e30` package was inspected but not
deployed because Vite had merged its recovery code into the main module graph. The
final candidate moves that guard to an independent public script, and was rebuilt and
retested from the new exact SHA.

## Behaviour released

- Workspace HTML displays a loading surface before modules execute. The independent
  boot guard catches resource errors, rejected startup promises and timeouts and
  offers a fresh-copy reload while preserving the account session.
- Service-worker v17 does not cache Workspace HTML, JavaScript, CSS or API responses,
  preventing mixed old/new module graphs after a deployment.
- Planning facts are revisioned. Identical values stay idempotent; changed guest
  count, budget or saved preferences retain a before/after successor.
- Guest-count decisions prefer explicit vendor terms. Without one, a change is
  material at 20 guests, or at 10 guests when that is at least 20% of the prior count.
  Only affected capacity or per-person categories are asked to reconfirm, and vendor
  contact remains approval-gated.
- A lowered budget produces one preference-aware trade-off choice from saved vision,
  priorities, quotes, allocation history and commitments. It proposes negotiation,
  scope reduction or deferral; it never silently cancels, contacts or pays a vendor.
- Both behaviours reuse the existing Wedding task, DecisionOS, evidence, ranking,
  settlement and approval records.

## Verification

The clean candidate passed TypeScript, both line budgets, public and security Wedding
checks, all 2,372 Wedding tests, production build and the OAuth-shaped Playwright
handoff. The built `index.html` references the independent `workspace-boot.js`.

After additive static publication to Oracle:

- `/workspace/`, its boot guard, exact main and Wedding bundles, `/wedding/`, `/docs/`
  and the Wedding sign-in entry returned 200.
- Exact hosted file hashes matched the release manifest.
- A real synthetic-account sign-in mounted non-empty Workspace content, removed the
  boot fallback, reached `api.omnyid.com/auth/session` with status 200 and emitted no
  page error.
- When the browser deliberately aborted the live main module, the page showed
  “Workspace could not finish loading” and “Reload a fresh copy”; it was not blank.
- The read-only production monitor passed its eight public, login, session, bootstrap,
  health, readiness and asset checks.
- Caddy validated and both Caddy and homeserver remained running with zero restarts.

No Caddyfile, homeserver image, database migration or authentication service was
changed in this static release.

## Rollback

The pre-release Workspace volume archive and its checksum are retained at:

`/home/ubuntu/omnyid-candidates/wed401-9ff9a74fef888b0e124c3b9fbf71d4491c6a5862/rollback`

The release used additive extraction, so prior hashed assets remain available. A
rollback restores the retained archive; no container image rollback is required.
