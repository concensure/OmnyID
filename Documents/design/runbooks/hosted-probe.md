# Bounded Oracle Runbook probe

WED-378 adds `runbook-rollout-probe`, an operator executable for a new empty
`wed378_runbook_probe` database on an internal-only Docker network. It is not
an application worker, endpoint, or production rollout switch.

The runner supplies the frozen full source SHA, isolated database URL and
`RUNBOOK_PROBE_ISOLATED=wed378-disposable`. The database hostname must be
`omnyid-wed378-probe-postgres`. All Runbook enable flags remain false. Do not
pass application encryption/signing keys or provider API credentials. The
network must contain only the probe and its dedicated Postgres, with no host
ports or route to external providers. The executable enforces a 180-second
window, rejects nonempty databases before migration and creates two synthetic
non-login accounts representing 24-guest/AUD18000 and 120-guest/AUD45000 weddings.

Shadow phase: nine persisted definitions, eight enabled, one disabled; one
persisted workflow_failed event. Expect five matches, one dedupe suppression,
two cap suppressions. Replay expects five duplicate suppressions. Owner mismatch
must fail. Instance and trace records remain zero throughout this phase.

Deterministic phase: two concurrent dispatches return one receipt and five
instances. Only one instance starts and executes the real bounded read adapter.
Two concurrent reads return one receipt and one trace. Foreign dispatch, foreign
instance and foreign read requests fail. Stale start, changed read replay and
restart after cancellation fail. The foreign account has no instances or traces.
No transform, emit, model or provider adapter is invoked. No invented result
hashes stand in for executor output.

The database uses tmpfs and is stopped at completion. Its ephemeral encryption
keys are not retained. Only machine evidence and diagnostics survive; this is
not a retained, decryptable fixture database.

JSON output records source SHA, definition pack hash, synthetic account IDs,
expected/observed counts, duration and limitations. The runner must attach binary
hash, network inspection, container command, exit status and pre/post production
image observations. Preserve failures separately; a failed run cannot become
passing evidence by changing only its label.

This adds hosted fixture evidence to the rollout gates. It does not alone close
the deterministic application-worker, model evaluation, reviewed provider sandbox
or final production release gates. Production remains on its existing release.
Per the user's instruction, delivery is to Oracle; GitHub upload is not required.
