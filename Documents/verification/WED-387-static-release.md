# WED-387 public Wedding-home control release

Date: 2026-11-21

## Outcome

The floating **Ask Sprout** control is removed from `https://omnyid.com/wedding/`.
The home no longer loads the public `wedding-agent.js` asset, so there is no hidden
dialog or deferred control to reappear after load. Authenticated workspace Sprout and
the intentionally retained public directory/article controls were not changed.

## Frozen source and artifact

- Base coordination SHA: `bbdfd704cf6db1debb9249ecec11bec261389718`.
- Implementation/static release SHA: `efad4b1cf7002649a7d53e3440c92f81cf01ca03`.
- Clean release worktree: `C:\temp\wt\omnyid-wed387-release-efad4b1c`.
- Deployed `wedding/index.html` SHA-256: `3ad2016aa58295c6c1b9b3bd26d2e68f5c6ed8d9eccc85a83309d659193d224e`.
- Previous file SHA-256: `e41a1f96a7fa4c0bb231b1bd5b76073e39cfd5fc34dead286c8544bb6df1a840`.
- Rollback file: `/home/ubuntu/omnyid-candidates/wed387-efad4b1cf7002649a7d53e3440c92f81cf01ca03/rollback/index.html.before-e41a1f96a7fa4c0bb231b1bd5b76073e39cfd5fc34dead286c8544bb6df1a840`.

Only the static home file was deployed. The Caddyfile hash matched the candidate before
release, so it was not replaced. The homeserver image, workspace assets, database,
migrations and environment were not changed.

## Clean-candidate verification

- `npm run test:wedding:ci`: pass; typecheck, both line budgets, public/security/site
  checks and 2,323/2,323 Wedding tests.
- `npm run build`: pass.
- `node wedding/tests/agent-directory-browser-smoke.mjs`: pass; the home has no button
  or dialog at 320 and 1280 px, while the directory and article retain accessible
  controls and focus return.
- Static smoke fails if `index.html` contains the agent loader, button identifier or
  Ask Sprout label.
- npm install reported the existing dependency audit summary: 38 moderate and one high
  finding. No dependency upgrade was mixed into this bounded static change.

## Hosted proof

Live Chromium at 320 x 760 and 1280 x 900 returned HTTP 200 and confirmed:

- no accessible Ask Sprout button;
- no Wedding Sprout dialog;
- no `wedding-agent.js` script element or network resource;
- no horizontal overflow or page errors;
- the “a wedding that feels like you” headline remains.

The deployed file hash matches the frozen candidate. The WED-386 native homeserver
image remains `sha256:f6ef45dee35b37772100c2798268af9315abc2f150a76b996cb22fad1a7c0e96`,
running with zero restarts. All seven Compose services are running. Caddy validation,
backup verification and bounded public requests for `/wedding/`,
`/workspace/rsvp.html`, the public quote comparison and `/docs/` passed.

Safety flags were unchanged: public RSVP and reminders remain off, test-to-self remains
on behind its reviewed authenticated allowlist, and vendor mail ingress/welcome mail
remain off. The post-release production proof is stored locally at
`C:\temp\wed387-oracle-proof-final`; its restore phase was skipped because this was a
static-only release and WED-386 had just completed a full isolated PostgreSQL restore
without any intervening database, image, migration or configuration change.
