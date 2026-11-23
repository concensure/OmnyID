# WED-388 Wedding database and message release

Date: 2026-11-21

## Outcome

Wedding plans now project into Database as installed, source-linked views rather
than asking the couple to construct or install them. The installed Wedding plan
contains Budget, Timeline, Guest list, RSVP, Seating, Run sheet and Selected
vendors tables with fixed, useful columns and record counts. The enhanced
`wedding_runsheet.v1` table is registered automatically for each Wedding plan
unless an existing dedicated run-sheet database already satisfies that role, so
its existing structured controls remain available without a duplicate install.

RSVP rows are derived at read time from the current canonical guest/event response
ledger. Selected-vendor rows are derived from the latest persisted Wedding decision
per category and retain the source decision reference. No second RSVP, vendor,
run-sheet or decision store was added. Guest and RSVP projections no longer stop at
80 people; a 200-person regression proves both tables retain all 200 rows.

The public Wedding home retains the general “a wedding that feels like you”
headline. Supporting copy now calmly names intimate ceremonies and micro weddings
alongside larger celebrations, uses inclusive small-celebration imagery, removes
unsupported live-availability language and labels the visible plan as a fictional
24-person sample. Ask Sprout remains absent from the public home.

## Frozen source and clean verification

- Branch: `agent/codex/WED-388`.
- Application/static source: `b4371ec6fadc3c2b375ece644669c39002cdc0b0`.
- Clean detached release worktree:
  `C:\temp\wt\omnyid-wed388-release-b4371ec6`.
- `npm run test:wedding:ci`: pass, including typecheck, both line budgets,
  public/security checks and 2,325 Wedding tests.
- `npm run build`: pass. Existing Tailwind object-screen and large-chunk warnings
  remain warnings.
- Focused database registry/projection tests: pass, including installed run sheet,
  no duplicate, canonical RSVP/latest selected vendor and 200-person coverage.
- `npm run test:wedding-site`: pass.
- Local Chromium at 375 x 844 and 1440 x 1000: pass with no horizontal overflow.
- The existing lockfile still reports 38 moderate and one high npm advisory. No
  dependency or lockfile change was mixed into this release.

## Oracle release

The release updated only the compiled workspace volume and two public Wedding
files. It did not rebuild or restart the homeserver, change Caddy, apply a
migration, change environment flags or write Wedding account data.

- Workspace archive SHA-256:
  `29c77371849a7f91af0c5c459e1616f9692da057cdbf19fe8625a2f909c68660`.
- Deployed `wedding/index.html` SHA-256:
  `71ba9df6ddfc0ff2b8922a6a4940b3a21ed1b5af5fff4f97f69d644652a7bbe6`.
- Deployed `landing-config.js` SHA-256:
  `f52a7cded1df160caf6eb174028690f2811b6cbc002be40635bd9e2bbf77ef41`.
- Deployed `DatabaseView-6QFJcYvN.js` SHA-256:
  `a338b3f0eba3abdb84d01de952ff13f91abf41b70029e1a95b00917f3d246767`.
- Deployed `main-DUQf76Rv.js` SHA-256:
  `addce184371bec259638e8a0c42504b8aa6c7284058ceee2cb713104a3ea376d`.

The live hashes match the clean candidate byte-for-byte. The first volume-write
probe stopped safely before mutation because the running Caddy container mounts
the workspace read-only. The final swap used a one-shot helper attached only to
the named workspace volume; Caddy and the application were not restarted.

The prior workspace archive, prior public files, Caddyfile, Compose file, container
inventory and disk state are retained at:

`/home/ubuntu/omnyid-candidates/wed388-b4371ec6fadc3c2b375ece644669c39002cdc0b0/rollback`

The previous public hashes were `3ad2016aa58295c6c1b9b3bd26d2e68f5c6ed8d9eccc85a83309d659193d224e`
for `index.html` and `4daa53444b2994942d542ab1aa836d4b22bee11a765dca837a41c6be181bf396`
for `landing-config.js`. The rollback workspace archive hash is
`d6a69b3aa3c7ea5bb8cda1b9079082324a9e70f9051274ac9e0fa20b77164888`.

## Hosted proof

- `/wedding/`, `/workspace/`, `/workspace/rsvp.html`, the no-login quote page and
  `/docs/` return 200. Anonymous `/healthz` retains its expected authenticated 401.
- Live Chromium passed at 375 and 1440 pixels: the general headline, micro-and-
  larger wording and inclusive hero are present; Ask Sprout and its loader are
  absent; no page error or horizontal overflow occurred.
- The live no-login quote minimum-spend/scenario browser journey still passes at
  390 pixels.
- Publicly served main and DatabaseView bundle hashes match the clean build.
- Caddy validates. All listed production and staging containers remain running.
- Homeserver image
  `sha256:f6ef45dee35b37772100c2798268af9315abc2f150a76b996cb22fad1a7c0e96`
  remains running with zero restarts.
- The production proof at `C:\temp\wed388-oracle-proof-final` passed backup
  service, backup manifest verification and runtime-script integrity. Root usage
  is 71%.

The restore drill was deliberately skipped for this static-only release. WED-386's
immediately preceding isolated restore proof remains applicable because no database,
runtime image, migration, configuration or environment changed. No celebrant,
vendor or couple account was mutated: role-specific account testing was not needed
for deterministic read-time projections, which are covered by the exact-SHA unit
suite, while the hosted proof verifies that the resulting bundle is the one served.
