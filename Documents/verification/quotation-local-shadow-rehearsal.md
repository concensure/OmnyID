# Quotation local dark-shadow rehearsal and ClamAV receipt

Date: 2026-10-24 (Australia/Sydney)

## Scope and source identity

This is machine evidence from a local disposable Docker environment. It is
bound to tested application source commit
`fbf55288e8db42940fb2325ec7323723c0caba0b`. The later working-tree changes at
the time of execution were limited to the corpus generator, evidence files and
human-review form; they did not modify the exercised quotation or scanner code.

This rehearsal is deliberately classified as **local dark-shadow evidence**.
It is not a hosted-runtime shadow record and does not satisfy the WED-225
`hosted_shadow` sign-off by itself.

## Safety posture

The following controls were explicitly disabled for the run:

- quotation release gate and release evidence SHA
- extraction, recommendation and clarification-draft features
- clarification send and booking-closure actions
- vendor grants and vendor mail
- wedding vendor ranking policy V2

No Oracle deployment, hosted provider call, email, payment, vendor permission,
cohort change or production-data mutation was performed.

## Disposable services

PostgreSQL ran locally at `127.0.0.1:55432/omnyid_test` and accepted
connections. Container identity:

- ID: `1a833fee42e7426ab43dbff278d300cee71fb844500270d8db030520b1175336`
- image SHA: `sha256:b48c110f4911eb3d73ba7b6bd8964a5f26be740c2d580158530471c3c0f66487`
- started: `2026-10-18T10:13:56.630703284Z`

ClamAV ran as a healthy local daemon at `127.0.0.1:33310`. Container identity:

- ID: `1bde123a954e0e6b329ab732efe361662212a7e5d951d03d2e3dd8ba44b66832`
- image SHA: `sha256:001eb4aed5df1f1a756935c41691c654ae1c22447e92259ec6f68d24fe46415d`
- engine/database: `ClamAV 1.5.2/28161/Thu Oct 22 06:24:11 2026`
- started: `2026-10-18T10:13:56.629735831Z`

No service credential is recorded in this receipt.

## Live disposable ClamAV receipt

`cargo test --test clamav_live -- --nocapture` passed 1 of 1 tests against the
live daemon. A bounded plain-text upload was reported clean.

`cargo test --lib gateway::clamav -- --nocapture` passed 3 of 3 parser-boundary
tests: clean response, infected response and clamd error response.

Relevant source hashes:

| Path | SHA-256 |
| --- | --- |
| `tests/clamav_live.rs` | `da4d5b7d8780ae5467a904ea15a1e9ecface39b78444bc6f46ab0eb3779e43e9` |
| `src/gateway/clamav.rs` | `5446d01a696739132f8fc3c49b16a235af18d6b08b52aa1441b5639e0ed5c82f` |

This proves current local integration with a real disposable scanner. It is
not represented as an independent security reviewer or external WED-225
`clamav_clean_scan` approval.

## Dark rehearsal result

With the local endpoints and disabled flags above,
`scripts/verify-quotation-readiness.ps1 -IncludeBrowser` passed:

- quotation Rust integration suites and the disposable-Postgres HTTP flow
- 33 quotation route unit tests and 3 document-ingest tests
- Gmail, inbound SMTP/MIME, federation and wedding LLM-ladder checks
- `cargo check`
- 6 TypeScript SDK tests
- 44 Solid quotation tests
- 11 Playwright tests across mobile and desktop

Verifier script SHA-256:
`178fdcba764238cd402d7afd8e4ac777d83abfac6e418a8a8230e94e256d38b1`.

Only the inherited unused Rust field and Tailwind advisory were emitted; they
did not fail the run.

## Gate interpretation

The local dark path is reproducible and passed with consequential features
off. WED-225 remains blocked on its separately named accuracy, provider,
independent review, hosted accessibility/usability/wording, true hosted-shadow
and allowlisted-cohort records. WED-226 remains downstream-blocked. This receipt
does not authorize a feature flag, vendor mail, policy V2 or release change.
