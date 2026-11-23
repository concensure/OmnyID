# WED-409 Wedding landing claims release evidence

Date: 2026-11-23  
Exact deployed static SHA: `9a6c2b56f733e654b44265b7de957d5c8e494d46`  
Release worktree: `C:/temp/wt/omnyid-wed409-release-9a6c2b56`

## Delivered scope

- Reconciled the supplied stale audit against the current shared Wedding source and
  Oracle production state.
- Exposed both free Binder PDFs directly and made email delivery conditional on the
  existing readiness endpoint rather than promising a disabled service.
- Qualified privacy, calendar and legal-date wording; labelled the sample's actual
  91% budget allocation; corrected public countdown copy from 65 to the shared 64.
- Extended the existing private guest import with an immediate and preserved review
  of people, explicit households, ungrouped people, pending RSVPs and uncertain RSVPs.
- Added public regression checks so the corrected claims cannot silently return.

## Requested confirmations

- Partner invitations use a seven-day server and database expiry, require an
  authenticated matching-email account and reject expired/non-pending acceptance.
- Guest imports count only explicit household labels; blank values stay ungrouped,
  ambiguous RSVP text stays pending and all counts are preserved with the artifact.
- Read-only production SQL returned 1,934 `Celebrant` rows: 1,933 `active`, one
  `hidden`, zero `archived`; every service-area label is NSW. No row was changed.

## Clean exact-candidate proof

The detached exact-SHA worktree was clean before the gate. It passed:

- TypeScript typecheck;
- source and Wedding line budgets;
- 2,394 Wedding tests;
- all public-site, CSP, metadata, quiz, magnet, countdown and quote scenario checks,
  including 95 sitemap pages;
- production build of 1,862 modules.

Archive SHA-256 values:

| Archive | SHA-256 |
|---|---|
| Workspace | `9194566f94d0e32c7bbfe51720d5fda5d2ccf790782222fbaba1cecffd31d3f4` |
| Public overlay | `f3016e67ef3e89e90c2cddad5f5b37f5dac2a36ea4997c4206e32538bc45fc45` |

## Oracle proof

Both archives were checksum-verified before installation. Candidate, host and served
Workspace hashes match:

| Asset | SHA-256 |
|---|---|
| Workspace `index.html` | `32a5fbaec530220a5fdf517ec2d4ed7d0ced0dae323be4fb6f6806a47a9719af` |
| `main-DMPYBCCk.js` | `83b91b2ba972a22eab99d59bf6ad7ecb1ce1980e670203da15b6c1706d856741` |
| `ResponseQueueView-CJuNuNgH.js` | `0a768ba5446ebe00e08a13d0c65d8e856814e920e700e3aed22ca502ac9b6b3d` |

All six public overlay files match the exact candidate hashes. Hosted checks confirm
the 64-task wording, direct Binder links, processor-aware privacy wording, qualified
deadline wording, 64-task checklist metadata and `llms.txt`. Both Binder PDFs return
HTTP 200. The authenticated read-only monitor passed all eight checks: public Wedding,
Workspace shell, password login, authenticated session, bootstrap, health, readiness
and current Workspace asset. Caddy validates; homeserver and Caddy restart counts are
zero. Root use is 72% with about 13 GB free. This was a static release: the exact
WED-408 backend image and database schema were not changed.

## Rollback

Rollback archives are retained under
`/home/ubuntu/omnyid-candidates/wed409-9a6c2b56f733e654b44265b7de957d5c8e494d46/rollback`:

- `workspace-before.tar.gz` —
  `3afded5c3f88f5e0f50ec64152993929b305cfe4cee41f055d53ecd5824511a8`
- `public-before.tar.gz` —
  `ef027d924fc05803f4fa4583cb0a3818f7b495bb658e2fb5d43baf10e62587d7`
