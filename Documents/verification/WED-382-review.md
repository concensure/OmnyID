# WED-382 bounded application cohort review

Security/privacy cross-review of frozen source `ae1ac01a2c285ac10b09404cffe3db67fbaaa034`
found no additional blocker for internal HTTP cohorts: exact authenticated owner,
definition digest/version and step, expiry rechecked after locking, recent human
authentication for tool approval/execution, immutable approved arguments,
encrypted credentials, pinned destinations, private receipts, and reconciliation
without resending. Application requests cannot choose providers or cost policy.

This review does not establish general production activation, UI execution
availability, or interoperability with arbitrary external providers. The review
API intentionally reports execution_available:false. Production flags stay off.
The marker provider is isolated; no real vendor messages or bookings are sent.

## Historical candidate results (not final release evidence)

Source `7f8abcf41bf06e72b3b995047cffe71ce7de05da`: 36 model attempts, all usage
known, 17,810 microunits. 35 structurally accepted and one low-confidence rejection.
Three classification expectation failures: Luna low and medium classified
within_budget as relevant; Sol medium classified over_budget as needs_review.
All 12 drafts met their semantic expectations and required approval. Actual HTTP
Luna-medium draft cost127microunits, retained private provenance and replayed
without a second call. Cross-review supports only the draft-only cohort;
classification is excluded by the admission policy.

The historical integration test used owner:a as an invalid identifier, contrary
to the shared grammar. Final source now explicitly accepts colon and rejects
slash. That failed run is retained. Historical model13 and tool16 PostgreSQL
tests passed, including expiry during provider execution and replay prevention.
Final candidate verification must be collected again and name ae1ac01a in full.
