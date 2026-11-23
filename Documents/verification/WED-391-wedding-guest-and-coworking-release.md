# WED-391 Wedding guest and couple-coworking release

Date: 22 November 2026  
Branch: `agent/codex/WED-391`  
Implementation and deployed static SHA: `8899d796ea6b6a5472d89bc751741f34685fb411`  
Implementation worktree: `C:/temp/wt/omnyid-wed389`  
Clean release worktree: `C:/temp/wt/omnyid-wed391-release-8899d796`

## Scope and provenance

Direct production inspection before implementation showed that the selected
Soft message was already live in both `wedding/index.html` and the landing
runtime: the headline remained “Less wedding admin. More of a wedding that feels
like you.” and the lede named an intimate ceremony, a micro wedding and a larger
celebration together. WED-391 retained that text and did not cherry-pick the
older WED-388 page wholesale.

The release adds only the requested compatible slices:

- a public discovery, setup, invitation, response and final-count guest journey
  backed by the existing guest/RSVP/approval records;
- a public two-independent-accounts collaboration journey that keeps personal
  account data private;
- strict RSVP-cell parsing and no surname-based household inference;
- membership-derived current, next and following collaboration actions;
- real accepted co-owner names as responsibility choices, persisted through the
  existing AFP Wedding task record.

It removes the unsupported accommodation-cluster map claim. It does not add a
parallel guest, RSVP, collaborator, task, decision or quote store. The broader
couple-coworking phases remain explicit open work in
`couple-coworking-tasks.md`.

## Clean candidate verification

The clean detached release worktree was checked at the exact 40-character SHA
with no tracked modifications. `npm ci` completed with the inherited audit
result of 39 vulnerabilities (38 moderate and 1 high); the task introduced no
dependency change.

- `npm run test:wedding:ci`: passed, including type-check, both line budgets,
  public/security checks and 2,342 Wedding tests.
- `npm run build`: passed. The existing large-chunk warning remains.
- Public smoke guards: passed after preserving the landing page's unique
  process-card contract.

Candidate archives:

| Artifact | SHA-256 |
| --- | --- |
| `workspace.tar.gz` | `8ec92778211eab7e0a807476690d9b65c84a53b0ff6091cb86fd5bf6631c3dba` |
| `wedding-public.tar.gz` | `f088bec24b4b641d24e8849f1b983c244d6bbfd75bd5dc17b8bbf55c65d935c8` |

Installed file proof:

| File | SHA-256 |
| --- | --- |
| Public `wedding/index.html` | `9debe2653d445b21d95390ac83f9191842a55abdff8c50a12bf6bfce5bdabd42` |
| Public `assets/js/landing-config.js` | `f3482cbb628ddfa81962853cef292ee38411527ecba5c37d521ad1d69cf9a680` |
| Workspace `index.html` | `04970a9a58d79b8e6948d17c735d049b946408e1e36a2ad0163866707a01547f` |
| `WeddingResponseWorkspaceView-D35Nj5jD.js` | `f1aba4ba098fbde15f5887804c0b8c7e3af390315dfad9de080498b50a0e56e1` |

## Oracle release and hosted proof

Release candidate and rollback root:
`/home/ubuntu/omnyid-candidates/wed391-8899d796ea6b6a5472d89bc751741f34685fb411`.
Before the additive static swap, the release retained the entire workspace
volume, the two replaced public files, Caddyfile, Compose metadata and full
container inventory. Root disk usage was 79%.

No image was built on the server. No migration, Caddy reload or homeserver
restart was required. Post-release proof:

- `/wedding/`, `/workspace/`, `/docs/`, the versioned landing runtime and the
  new Wedding workspace bundle returned HTTP 200;
- anonymous `/healthz` returned the expected protected HTTP 401;
- the live page contained the exact Soft headline, micro-wedding lede,
  `#guest-journey` and `#plan-together`, and no accommodation-cluster claim;
- Chromium at 390 by 844 reported a 390-pixel document width, no horizontal
  overflow, no console/page errors, and a successful Wedding sign-in workspace
  route;
- remote installed hashes matched the clean candidate hashes above;
- Caddy validated and its live Caddyfile hash matched the backup;
- Caddy retained image
  `sha256:1e40b251ca9639ead7b5cd2cedcc8765adfbabb99450fe23f130eefabf50f4bc`
  with zero restarts; homeserver remained `omnyid-homeserver` with zero
  restarts;
- `omnyid-wedding-monitor.timer` remained enabled and active; a post-release
  manual run completed with service result `success` and exit status 0.

Rollback is an additive restore from `rollback/workspace-before.tar.gz` plus the
saved public files. Because the release did not touch Caddy or application
images, their retained copies are provenance evidence rather than required
rollback steps.
