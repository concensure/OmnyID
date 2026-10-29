# WED-301 / WED-294 Oracle release evidence

Date: 2026-10-30 (Australia/Sydney)

## Release identity

- Application SHA: `b5f493d8d092b16609f6a0cb81ad704b4fafc43a`
- Branch: `agent/codex/WED-294`
- Development worktree: `C:\Users\ozans\Desktop\projects\OmnyID-WED-286`
- Clean release checkout: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed301-release-b5f493d`
- Deployment target: Oracle production at `/home/ubuntu/omnyid`
- Simulated data: excluded
- Existing remote environment: retained; no local environment file was uploaded

The coordination/evidence commit written after this record is not a new application candidate. Oracle runs the exact application SHA above.

## User-facing outcome

- Vendor comparison cards accept current bounded owner media, approved first-party media and catalogue-backed Google media.
- Expired catalogue-backed Google photo names are refreshed from the existing protected provider. The old catalogue URL changes only after the refreshed media succeeds.
- A syntactically valid provider photo name is not public merely because it is well formed; it must already be catalogued.
- Master-search suggestions close after submission and reopen only after the query changes.
- Wedding Overview task rows use stable owner and action columns on desktop and preserve the existing stacked mobile layout.
- The Wedding run-sheet Database profile now includes deterministic evidence-labelled conflicts, buffer suggestions and six A2UI-compatible context cards. Suggestions do not become confirmed facts.

## Exact-candidate verification

The clean release checkout was verified at the full 40-character SHA before deployment.

| Check | Result |
| --- | --- |
| TypeScript | Pass |
| Source and Wedding line budgets | Pass (2 tests) |
| Wedding public-site smoke suites | Pass |
| Wedding tests | Pass (2,056) |
| Production UI build | Pass |
| Oracle runtime staging self-test | Pass (58 paths with simulated data, 57 without) |
| Focused Google Places/photo Rust tests | Pass (8) |
| New photo-proxy module line count | 252 lines |

The production build retains the pre-existing 1.66 MB minified `ResponseQueueView` chunk warning. `npm ci` reports 39 inherited audit findings (38 moderate and 1 high); no forced dependency rewrite was applied during this release.

## Deployment chronology

1. Candidate `9b64f95922e4e337ff73f67fb52645d38acc92a9` made catalogue-backed media publicly retrievable without exposing the provider key. Its first hosted probe correctly rejected arbitrary media but revealed that the stored provider photo names themselves had expired: the catalogue request returned provider HTTP 400, surfaced as gateway HTTP 502.
2. The final candidate added one bounded refresh attempt. It derives only the place ID embedded in an already-catalogued reference, obtains current photo metadata server-side, verifies current media and then transactionally replaces the stale catalogue URL.
3. The first upload of the final candidate lost its SSH connection and produced an incomplete archive. Extraction failed before image build or container replacement; production remained on the prior healthy release.
4. The idempotent retry uploaded and extracted the complete archive. Its preflight backup verification was transiently unhealthy and explicitly reported, but the existing production containers remained up during the image build.
5. Compose replaced the application containers, the workspace returned HTTP 200 and the mandatory post-deploy production proof passed, including backup verification.

## Hosted media boundary proof

A production row whose stored Google media name had expired was requested through the public comparison-media endpoint.

| Observation | Result |
| --- | --- |
| Catalogue-backed request | HTTP 200 |
| Content type | `image/jpeg` |
| Response size | 136,094 bytes |
| Catalogue URL changed from expired reference | Yes |
| Old reference count after refresh | 0 |
| Well-formed but uncatalogued reference | HTTP 404 |

The probe printed no provider credential or private account token. Refreshing media does not alter vendor rank, recommendation language, suitability evidence or source authority.

## Hosted runtime proof

- Oracle production proof: pass
- Backup service: running
- Homeserver: running
- Backup verification: pass
- Restore drill: deliberately skipped because this release followed recent restore evidence and did not change storage contracts
- Ten representative server/UI source hashes: exact match to the clean release checkout
- Hosted Database bundle contains `Buffer review`: yes
- Hosted Database bundle contains `No evidence-backed timing conflict found`: yes
- `/workspace/`: HTTP 200 during deployment smoke

Production proof output is retained locally at:

`C:\Users\ozans\AppData\Local\Temp\oracle-production-proof-wed301-b5f493d-postdeploy`

## False-default controls

The effective homeserver environment was inspected after replacement:

- `OMNYID_WEDDING_RUNSHEET_SHARING_ENABLED=false`
- `OMNYID_VENDOR_MAIL_ENABLED=false`
- `OMNYID_VENDOR_SENDER_MASK_ENABLED=false`
- `OMNYID_VENDOR_MAIL_INGRESS_ENABLED=false`

No release action enabled Policy V2, hosted run-sheet grants or vendor email transport beyond their existing approved/default state.

## Capacity and follow-up

At final proof, Oracle root disk was 69% used with 14 GB free. The core production containers were running.

Recommended next major task: WED-295, focused on run-sheet distribution readiness and operational review while preserving the WED-293 false-default grant boundary. WED-286's provider-observed bounce/complaint evidence remains an independent prerequisite for external vendor-mail activation. The inherited `ResponseQueueView` bundle should then be split to improve first-load performance.
