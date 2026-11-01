# WED-316 Oracle provenance and retention evidence

Date: 2 November 2026 (Australia/Sydney)

## Exact release

- Branch: `agent/codex/WED-316`
- Release commit: `10250f2033c666ca33fcffc98aa6608c7d9e076c`
- Clean release checkout: `C:\Users\ozans\AppData\Local\Temp\omnyid-wed316-heartbeat-10250f2`
- Oracle runtime directory: `/home/ubuntu/omnyid`
- `SOURCE_COMMIT`: `10250f2033c666ca33fcffc98aa6608c7d9e076c`
- `oracle-runtime-manifest.json` `source_commit`: `10250f2033c666ca33fcffc98aa6608c7d9e076c`

The staging script now creates both records from the same full 40-character
Git SHA. The deployment script rejects a missing, malformed or mismatched
marker locally and repeats that verification after extraction on Oracle.

## Retention and abandoned watcher

Migration `0130_operational_retention_and_legacy_watcher` is applied in
production. It revokes legacy `background_watcher` registrations and adds the
global rate-limit retention index used by the bounded cleanup.

Read-only production observations after the release:

- Active `background_watcher` registrations: `0`.
- Rate-limit records older than 48 hours: `0`.
- Curator audit records older than seven days: `0`.
- Curator audit total fell from `1,509,667` during the release audit to
  `1,497,387` during the 2 November verification; it is not refilling from the
  previous skip loop.
- Active `ledger_ingestion` and `health_maintenance` registrations continue to
  refresh `last_heartbeat_at`.

Heartbeat history is now sampled only when metrics differ from the most recent
stored value in the bounded comparison window. A restart produced 19 meaningful
initial samples across the active daemons. The total then remained exactly
`500,001` in two observations 15 seconds apart. Liveness continues through the
registration row without appending a history row for every unchanged pulse.

## Safe production cleanup

- The bounded rate-limit cleanup removed old rows without touching account,
  message or workspace data.
- `docker builder prune -f` reclaimed 4.931 GB of unused build cache.
- Old image tags were not removed because some are still attached to staging
  containers.
- Oracle root filesystem at the final read-only check: 45 GB total, 37 GB used,
  7.3 GB free, 84% used.

## Detached deployment checkout

The unique detached commit from
`C:\temp\omnyid-oracle-deploy-53450ed-20260928` was preserved as branch
`archive/oracle-deploy-53450ed-20260928` before that temporary worktree was
removed. The archive proof commit is `fef9cd2`.

## Verification performed

- Rust check: passed.
- Runtime marker and manifest: matching full SHA on Oracle.
- Public workspace smoke: HTTP 200 during release verification.
- Fifteen-second heartbeat growth check: no additional rows.
- Production database retention queries: no legacy watcher, no rate-limit row
  older than 48 hours, and no curator audit row older than seven days.

## Privacy and landing release boundary

The supplied privacy patch also describes the Wedding Day Binder, optional
double-opt-in planning tips and first-party site measurement. Those behaviours
are not all in the deployed release. Therefore the patch has deliberately not
been applied or published yet. It must be applied to the final implementation
candidate and released atomically with WLP-02 and WLP-03; only its 48-hour
rate-limit statement is already supported by production behaviour.
