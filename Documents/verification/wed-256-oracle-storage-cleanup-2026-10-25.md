# WED-256 Oracle storage cleanup evidence

Date: 2026-10-25 Australia/Sydney (2026-10-24 UTC)
Host scope: Oracle production runtime at `152.67.110.187`
Source parent: `3c4007d7fb9c20d3af42cf07d2e4e5a1131f0679`

## Before state

- Root disk: 39 GB of 45 GB used (87%), 6.1 GB available.
- Docker build cache: 9.72 GB; Docker reported 6.609 GB private and 9.72 GB reclaimable.
- Docker images: 13.88 GB total and 11.99 GB reported reclaimable.
- OmnyID backups: seven archives, 6.0 GB total.
- Systemd journal: 479.9 MB.
- `curator_run_audit`: 8,172,004 live rows, including 1,942,284 older than seven days; 6.526 GB including indexes.
- The most recent 10,000 skipped rows referenced only 24 source messages. The twelve hottest sources each repeated about 704–705 times.
- Legacy `background_watcher` and `state_synthesizer` registrations were incorrectly parsed as `KnowledgeCurator`; recent runaway rows used the `background_watcher:*` daemon ID.

## Actions and boundaries

1. Paused only the affected account's `knowledge_curator`, `background_watcher`, and `state_synthesizer` registrations. Other accounts and daemon kinds were not paused.
2. Ran `docker builder prune -af`.
3. Removed the reviewed obsolete `4aeb95d...` raw/release tags and `f839fa...` release/`rollback-before-wed-mob-t26` tags. Preserved every running image, both `latest` application tags, the staging `release-67c1559...` pair and both `rollback-before-wed-179-180` tags.
4. Added `curator_run_audit_created_at_idx` concurrently, fixed one UTC cutoff, and deleted 1,942,708 stale rows in 195 independently committed batches of at most 10,000.
5. Ran `VACUUM (FULL, ANALYZE) curator_run_audit` during the contained writer window.
6. Verified the then-newest backup before deletion, removed only the four explicitly reviewed oldest initial archive paths, and set `OMNYID_BACKUP_RETAIN=3` (days) in the root-owned mode-0600 Oracle environment file.
7. Recreated only the backup service. Its post-cleanup database archive `20261024T202446Z` completed and passed the repository verifier. The job reported SeaweedFS unavailable and recorded no SeaweedFS mirror in that archive; two retained prior archives remain as the additional recovery points.
8. After the new backup completed, removed the now-oldest retained archive by its verified absolute path, leaving exactly the newest three.
9. Ran `journalctl --vacuum-size=100M`.

No message rows, vendor source data, running application images, current rollback tags, mail flags, ranking-policy flags, release flags, payment state, Coolify volumes or n8n volumes were deleted or enabled.

## After state

- Root disk: 23 GB of 45 GB used (52%), 22 GB available.
- Docker build cache: 0 bytes.
- Docker images: 4.707 GB total. The remaining reported reclaimable space belongs chiefly to deliberately retained rollback/staging images.
- OmnyID backups: three archives, 2.6 GB total.
- Systemd journal: 98.7 MB.
- `curator_run_audit`: 6,230,304 rows, 2.522 GB including indexes. A later exact query found 13,152 rows beyond the moving seven-day cutoff; the committed runtime retention drains such boundary drift in bounded batches.
- The affected account produced zero new audit rows in the final two-minute observation window; its latest row remained at `2026-10-24T20:30:47.147457Z`.
- Production application, Postgres, Electric, Caddy, SeaweedFS and backup containers remained running; Electric reported healthy. Authenticated health routes remained protected and returned the expected unauthenticated 401 rather than exposing operational detail.

## Code correction

- Curator-ineligible, ephemeral, short and noise messages now receive one content-free internal skip marker and no `skipped` audit row. The existing source-card join prevents retrying that source.
- Active curator lookup now requires the exact persisted `knowledge_curator` label. Unknown legacy daemon kinds can no longer fall through to `KnowledgeCurator`.
- Health maintenance deletes curator audits older than seven days in 5,000-row committed batches, with a 100,000-row per-pass ceiling.
- Migration `0118_curator_audit_retention` provides the retention index; a focused operations script supports reviewed dry-run, batched deletion and explicit vacuum modes.

The code correction is committed in the advanced worktree but is not promoted as part of this storage-only operation. The three affected registrations must remain paused until a reviewed release containing WED-256 is deployed; the current production startup would otherwise reactivate the old exact curator registration.
