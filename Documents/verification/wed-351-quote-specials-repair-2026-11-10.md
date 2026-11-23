# WED-351 hosted quote and Limited Specials repair

Date: 2026-11-10  
Branch: `agent/codex/WED-351`  
Application commit: `4277e50bdfc7775a881439719d7357a133097fac`  
Clean release checkout: `C:\temp\wt\omnyid-wed351-release-4277e50`

## What changed

- The quote page now loads its HTML, CSS, deterministic calculation engine and
  controller under one versioned browser contract. The non-user honeypot is
  hidden in HTML, so an old stylesheet cannot expose it as a blank field.
- Analyse, clear analysis, source-field selection, extract from selection, and
  add/remove line-item controls initialise and provide visible feedback.
- Explicit analysis can apply only exact-source, high-confidence extracted
  fields that remain unset. Ambiguous suggestions remain choices.
- Missing core pricing is `null`, not zero. It is not divided by guest count,
  described as the cheaper proposal, or rendered as `undefined`.
- Limited Specials permits OpenStreetMap tiles in the workspace CSP, reports
  tile failures, and invalidates the Leaflet viewport after the panel becomes
  visible. Guest/category/location edits remain local draft state until
  **Update map**, preventing a resource reload on every field edit.
- **Show all vendor categories** applies the all-category filter immediately.
- **Prepare date enquiry** now opens the existing reviewed enquiry composer in
  place. It includes the generated draft, recipient, attachments,
  information-sharing choices and existing send/retry path; it no longer
  redirects through a synthetic vendor search.

## Exact-SHA verification

From the clean release checkout:

- `npm ci --no-audit --no-fund`: passed.
- `npm run test:wedding:ci`: passed, including TypeScript, both line budgets,
  public Wedding checks, and all 2,249 Wedding tests.
- `NODE_OPTIONS=--max-old-space-size=12288 npm run build`: passed; 1,669 modules
  transformed.
- `node wedding/tests/quote-decoder-browser-smoke.mjs` against the local build:
  passed at 390 px and 1,440 px.

The browser smoke proves:

- the honeypot is not visible;
- the mapping dropdown is populated;
- line items add and remove;
- quote text is not sent before explicit analysis;
- grounded per-head values apply without turning a component subtotal into a
  whole-package amount;
- an unchanged analysis uses the local structured cache;
- selection extraction and clear analysis work;
- absent pricing is explained as insufficient rather than A$0; and
- comparison output contains no `undefined` value or mobile overflow.

## Oracle and hosted evidence

- The clean release bundle was deployed to Oracle.
- Oracle `SOURCE_COMMIT` and `oracle-runtime-manifest.json` both contain the
  full application SHA above.
- The existing ClamAV updater was alive but its scanner had been unhealthy for
  about one day before this release. The stateless scanner container was
  restarted without bypassing scanning; it returned `healthy` before the
  homeserver and Caddy were started.
- The public quote page and both versioned JavaScript assets return HTTP 200.
- The quote browser smoke passed again against `https://omnyid.com`, including
  all interaction checks above.
- The live workspace CSP includes only
  `https://*.tile.openstreetmap.org` as the added map-image authority.
- The deployed workspace bundle contains **Update map** and
  **Review this date enquiry**.
- The final detached Oracle audit reports `STATUS=pass`, homeserver and backup
  running, runtime scripts present, manifest verification passed, and backup
  verification passed. The restore drill was intentionally skipped for this
  release proof. Root and `/var` usage were both 81%.

Proof artifacts are outside the repository under
`C:\temp\wt\proofs\wed351-release-4277e50`.
