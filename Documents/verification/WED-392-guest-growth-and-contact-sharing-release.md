# WED-392 Guest growth and selected-contact sharing release

Date: 22 November 2026  
Branch: `agent/codex/WED-392`  
Exact deployed source: `afd6d5cc04d3c5996256ca1df131ba7e1de659fb`  
Implementation worktree: `C:/temp/wt/omnyid-wed389`  
Clean release worktree: `C:/temp/wt/omnyid-wed392-release-ba6fbdd5`

## Outcome

The public Wedding page now uses the guest-list report through the customer
growth journey: spreadsheet pain, a labelled illustrative review, truthful
import/review proof, a privacy boundary and a guest-specific activation. It does
not describe a literal public guest journey or unsupported Excel, PDF, OCR or AI
import. The selected Soft headline remains unchanged and small weddings remain
named beside larger celebrations.

The next dependency-safe coworking slice closes COW-05 over the existing
encrypted selected-contact grant. Couples select a recipient, contacts and
optional fields, review exact values and private omissions, then confirm.
Incoming and outgoing grants show human provenance; only the original sharer can
revoke. Server operations bind canonical owner, plan, workspace and active
membership, and member removal revokes grants in either direction. No personal
address book, membership, RSVP, task or decision store was duplicated.

The authenticated `/wedding/partners/*` paths are explicitly proxied before the
static Wedding site. A source test and deployment smoke assertions preserve that
boundary.

## Verification

- Clean exact-SHA `npm run test:wedding:ci`: pass, including typecheck, both line
  budgets, public/security suites and 2,345 Wedding tests.
- Clean production UI build: pass. The inherited Tailwind screens and large
  Wedding chunk warnings remain warnings.
- Focused shared-contact tests: 3/3 pass.
- Disposable PostgreSQL HTTP proof: owner bootstrap, partner acceptance,
  guessed-workspace and role-escalation refusal, selected-field redaction,
  human provenance, sharer-only revoke, partner-to-owner sharing, member-removal
  revocation and post-revoke denial all pass.
- Local and hosted Chromium at 390 and 1440 pixels: the default Soft and guest
  contexts render without overflow, page errors or failed requests.
- Hosted registration workspace at 390 pixels: HTTP 200, no overflow or page
  error.

## Oracle release

Final candidate/evidence root:
`/home/ubuntu/omnyid-candidates/wed392-afd6d5cc04d3c5996256ca1df131ba7e1de659fb`.

- ARM64 image:
  `sha256:b4568e0e1433df09676c2f9fdd6ec87ac7345244efd218a8db7a120e9a6f4554`.
- OCI revision: the full deployed SHA above.
- Native binary SHA-256:
  `bd6a04d486bf88e109e27b2e78edb18a72c0da07926059de3779968beb3ee821`.
- Caddyfile SHA-256:
  `a3c24e8af0d99fda4cceaa26679fc467512c151ad4f98bd50c998ba658d557fa`.
- Public `wedding/index.html` SHA-256:
  `f7ee4a16308ab725ed16227296bcd9d97e6f46ca9a00cddc9e8ddb640e4797ff`.
- Public landing config SHA-256:
  `ddacb9fcc54fa1b4ed090d99de6d2680ee832d8373a8974e166334b52d85eb1f`.
- Public style SHA-256:
  `90e5dd6d4614663fb6269b3d60b423690f304005c8cb3a56be63ed1175afdbd6`.
- Workspace `index.html` SHA-256:
  `015bb791d8c6cc75eac0c70bab987deedc44460560c2fb14dde071c275400191`.
- Main bundle SHA-256:
  `04d81bfd05be464de7d1d31efda335d3204fef6cabf58cef7b0a44bb297a4c8a`.
- Wedding workspace bundle SHA-256:
  `835eb87ea0cef4ac9269637579e9d1a87686f39d69da8c6bbb82a38947254656`.

Public Wedding, workspace, Docs and both new bundles return 200. Anonymous
health/readiness retain their protected 401 boundary. Partner GET/DELETE probes
return scope validation 400 and an empty POST returns request validation 422,
proving the requests reach the application rather than static hosting. The
read-only production monitor passes and its twice-daily timer remains enabled
and active. Homeserver and Caddy both report zero restarts.

The first full restore proof failed closed because 6.76 GB free was below its
8.06 GB preflight requirement. Only recoverable expanded candidate directories,
an unused amd64 WED-386 image and the superseded WED-392 intermediate image were
removed. No volume, backup, database, current image or true rollback image was
removed. The rerun completed with `STATUS=pass`, backup verification, runtime
integrity and isolated restore all passing; root use returned to 82%.

The detached local collector again failed to notice the completed remote exit
file. Preserved full remote stdout SHA-256:
`a4003d2dbd8e9a1b4c2172540cea7ae8c407915979b4a92dc0672769a0d1f4fc`.
The subsequent machine-readable light proof passed with JSON SHA-256:
`fc0def50314a4411ba7edf4d8f71e837bbaced20eb25dbaff27539ef684179a0`.

## Rollback

The final rollback directory retains:

- exact WED-391 workspace archive, SHA-256
  `5b6e84e6c9719185c81c5bd68ca21077285e71f52cccf3cc36433b212a916cd2`,
  whose shell hash matches the WED-391 release record;
- post-release WED-392 workspace archive;
- prior Caddyfile and pre-final container inspection;
- the public-file rollback and original pre-release evidence in the preceding
  WED-392 candidate directory.

The true pre-release homeserver remains tagged
`omnyid-homeserver:wed392-rollback-3a3301fa`. Restoring that image, the prior
Caddyfile/public files and the retained WED-391 workspace archive returns the
stack to its pre-WED-392 state.

Broader COW-03 and later cross-domain, canonical projection, activity, AI and
live-delivery phases remain open and are not release claims.
