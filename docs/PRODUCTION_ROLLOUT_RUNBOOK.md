# OmnyID Production Rollout Runbook

This runbook is the minimum operator path for a production deployment.

It is intentionally short. The goal is to remove improvisation from deploy, verify, and rollback.

## Preconditions

- A production env file exists and includes:
  - `OMNYID_ENV=production`
  - a non-default `DATABASE_URL`
  - a real `OMNYID_DELEGATION_MASTER_KEY_HEX`
  - background daemons are expected to stay healthy in readiness by default; set `OMNYID_READYZ_REQUIRE_HEALTHY_DAEMONS=false` only if you are deliberately relaxing that production gate during a controlled incident
  - any file-backed secret values such as `OMNYID_SESSION_SECRET_FILE` already exist on disk and are non-blank; relative paths are resolved from the env file directory during preflight
  - no unsafe overrides such as `OMNYID_ALLOW_INSECURE_UNSIGNED=true`
  - no plaintext-storage override such as `OMNYID_ALLOW_PLAINTEXT_STORAGE=1`
  - if Stripe self-serve billing is configured, valid Stripe secret, webhook secret, Pro price id, and workspace return URL base settings
- The candidate build passed:
  - Rust correctness
  - `api_flows` integration lane
  - startup-policy lane
  - frontend build/test lanes as applicable
- A recent backup exists, or one will be taken immediately before rollout.

## Preflight

Before touching the remote environment, validate the env contract locally:

```bash
bash scripts/startup-policy-check.sh .env.production
```

```powershell
./scripts/startup-policy-check.ps1 -EnvFile .env.production
```

If this fails, stop. Do not deploy first and debug on the server.

For a broader local rehearsal before rollout:

```bash
bash scripts/release-readiness.sh .env.production
```

```powershell
./scripts/release-readiness.ps1 -EnvFile .env.production
```

This local release gate now includes frontend and SDK verification in addition to the Rust/runtime checks:

- `typescript-sdk`: typecheck, build, package export continuity tests
- `solid-ui`: typecheck, local-router tests, production build

If you want a report artifact for the rollout record:

```bash
bash scripts/release-readiness.sh .env.production artifacts/release-readiness
```

```powershell
./scripts/release-readiness.ps1 -EnvFile .env.production -OutDir artifacts/release-readiness
```

Production-scoped release readiness now requires a real backup directory so backup verification and restore drill cannot be skipped:

```bash
bash scripts/release-readiness.sh .env.production artifacts/release-readiness /path/to/backup_dir
```

```powershell
./scripts/release-readiness.ps1 -EnvFile .env.production -OutDir artifacts/release-readiness -BackupDir C:\path\to\backup_dir
```

If you want one command that also performs live endpoint verification against a deployment candidate:

```bash
bash scripts/deployment-rehearsal.sh .env.production artifacts/deployment-rehearsal /path/to/backup_dir https://api.omnyid.example https://app.omnyid.example/workspace/
```

```powershell
./scripts/deployment-rehearsal.ps1 -EnvFile .env.production -OutDir artifacts/deployment-rehearsal -BackupDir C:\path\to\backup_dir -BaseUrl https://api.omnyid.example -WorkspaceUrl https://app.omnyid.example/workspace/
```

Production-scoped deployment rehearsal now also requires a live `BaseUrl`/`OMNYID_BASE_URL`; health and readiness verification can no longer be skipped on production-labeled runs.

If you want one top-level ship / do-not-ship verdict that also folds in the current Oracle and personalOS commercial-readiness state:

```powershell
./scripts/production-go-no-go.ps1 -EnvFile .env.production -BackupDir C:\path\to\backup_dir -OutDir artifacts/production-go-no-go
```

This wrapper combines:

- local release readiness
- the current commercial readiness snapshot
- one consolidated blocker list for operator decision-making

If you want the command to fail CI or a promotion job when the verdict is not `go`, add `-Enforce`.

If you want the promotion gate to require the tighter audited posture rather than the default promotable posture, add:

- `-MaxFrontendBundleWarnings 1` to cap accepted frontend bundle warnings more aggressively
- `-RequireExecutedOracleRemediation` to require a live executed Oracle cleanup plus re-proved evidence instead of accepting an older `dry_run` remediation state

Treat only the `*-current` artifact directories as the live decision record during rollout. Historical bundles elsewhere under `artifacts/` may deliberately preserve older `not_ready`, `dry_run`, or pre-remediation states for audit traceability.

Current audited policy lanes as of Tuesday, August 25, 2026:

| lane | commercial snapshot policy | go/no-go result | intended use |
| --- | --- | --- | --- |
| default | `-MaxFrontendBundleWarnings 2` and no executed-remediation requirement | `ready` / `go` | promotable posture for the current audited release |
| strict | `-MaxFrontendBundleWarnings 1 -RequireExecutedOracleRemediation` | `ready` / `go` | fully closed rollout evidence after executed Oracle cleanup and proof recheck |

If you want to refresh the main readiness artifacts in one pass before checking the final gate:

```powershell
./scripts/production-readiness-refresh.ps1 -OutDir artifacts/production-readiness-refresh
```

By default that wrapper reuses the current checked Oracle proof and inventory artifacts, rebuilds the cleanup plan, and copies the current Oracle remediation artifact into the refresh bundle so downstream reports have a complete artifact set without touching the live host.

The refresh bundle now records reused Oracle artifacts with their `generated_at`, `age_hours`, and `stale` fields so operators can see when a report was built from older audited evidence rather than a fresh host check.

That refresh now also emits `storage-hygiene-report/storage-hygiene-report.{json,md}` inside the bundle so the operator has one place to review:

- safe local rebuildable disk usage that does not belong on Oracle
- the current Oracle restore-gap size
- the top Oracle review-cleanup target group
- the recommended local delete order before another staging or upload pass

Add `-RefreshOracleProof`, `-RefreshOracleInventory`, and `-RefreshOracleRemediation` only when you want that wrapper to regenerate those Oracle artifacts instead of reusing the current audited ones.

If you do want a full live Oracle refresh and expect the restore proof to run longer than your shell session, add `-StartDetached`. That launches the refresh in a hidden local PowerShell process and writes progress metadata to `production-readiness-refresh-detached.json` plus stdout/stderr logs inside the chosen output directory.

To inspect a detached refresh without reading raw logs:

```powershell
./scripts/production-readiness-refresh-status.ps1 -OutDir artifacts/production-readiness-refresh
```

For a strict pre-promotion pass that enforces both a lower frontend warning ceiling and executed Oracle remediation:

```powershell
./scripts/production-readiness-refresh.ps1 -OutDir artifacts/production-readiness-refresh-strict -RunReleaseReadiness -MaxFrontendBundleWarnings 1 -RequireExecutedOracleRemediation -RefreshOracleProof -RefreshOracleInventory -RefreshOracleRemediation
./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-strict -MaxFrontendBundleWarnings 1 -RequireExecutedOracleRemediation -Enforce
```

If release readiness has already been recorded and you only need to rerun the policy gate against refreshed artifacts, use the artifact-only path:

```powershell
./scripts/production-go-no-go.ps1 -CommercialSnapshotPath artifacts/commercial-readiness-snapshot-strict-current/commercial-readiness-snapshot.json -OutDir artifacts/production-go-no-go-strict-current -MaxFrontendBundleWarnings 1 -RequireExecutedOracleRemediation -SkipReleaseReadiness -Enforce
```

## Rollout

### Oracle path

If using the Oracle helper:

```powershell
./scripts/deploy-oracle.ps1 -EnvFile .env.production
```

The helper now runs startup-policy validation before uploading the env file.
It also uploads every local secret file referenced by `*_FILE` entries and rewrites those env values to `/run/secrets/...` for the remote container runtime, so the Oracle env file should keep host-side paths such as `.secrets/omnyid_session_secret` and `.secrets/omnyid_operational_endpoint_token`.

After rollout, prove the Oracle host actually has a usable backup root and a fresh verified backup without forcing a full restore replay on every routine deploy:

```powershell
./scripts/oracle-production-proof.ps1 -SkipRestoreDrill -OutDir artifacts/oracle-production-proof-current
```

This fast proof leaves a machine-readable artifact covering the remote backup directory, latest archive, backup verification, and whether the live proof skipped the restore drill.

Record a separate full restore-proof artifact on a slower cadence, or immediately after meaningful backup, storage, or database changes:

```powershell
./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-restored
```

The commercial readiness gate now accepts a skipped live restore drill only when a separate successful restore-proof artifact exists within the recent restore window. The default window is 168 hours, which is 7 days.

Use `-UseDetachedRemoteAudit` for long-running Oracle restore rehearsals. It launches the remote audit under `nohup` and polls for completion, which is more reliable than holding one SSH session open through the full restore drill.

### In-place upgrade path

If upgrading an existing self-hosted node:

```bash
OMNYID_ENV_FILE=/srv/omnyid/.env.oracle bash scripts/omnyid-upgrade.sh
```

The upgrade helper now validates startup policy before rebuild/restart, then takes a backup, rebuilds, restarts, and waits for health.

## Verification

After rollout, verify all of the following:

1. `/healthz` returns success.
2. `/readyz` returns success and does not report Gmail OAuth, Composio, Stripe billing, or stale daemon-heartbeat failures unless intentionally disabled.
3. The workspace route is not still behind Basic auth.
4. Authenticated dashboard bootstrap succeeds.
5. One real login/session flow succeeds.
6. One critical integration flow succeeds for the deployment tier being rolled out.

Suggested checks:

```bash
bash scripts/verify-deployment.sh
```

```powershell
./scripts/verify-deployment.ps1
```

If `/healthz` and `/readyz` are token-gated in production, set `OMNYID_OPERATIONAL_ENDPOINT_TOKEN`, `OMNYID_OPERATIONAL_ENDPOINT_TOKEN_FILE`, or pass `-OperationalEndpointToken` to the PowerShell script. `verify-deployment` now sends that token as `x-omnyid-ops-token` automatically.

Optional workspace verification:

```bash
OMNYID_WORKSPACE_URL=https://omnyid.com/workspace/ bash scripts/verify-deployment.sh
```

## Current 2026-08-25 Residuals

As of Tuesday, August 25, 2026, both the default and strict audited promotion lanes are passing. Operators should still keep these follow-up items in view:

- The current audited Oracle proof is passing with root usage at `77%` and `11G` free.
- The cleanup plan still classifies about `1 GiB` of host-log cleanup as safe-now reclaim scope, but the last live `journalctl --vacuum-time=7d` attempt reclaimed `0B`; treat it as optional housekeeping rather than a readiness blocker.
- The current Oracle proof already includes a successful restore drill, and the separate recent restore-proof artifact remains available as independent evidence within the 7-day window.
- The current Oracle host still contains non-runtime review groups outside OmnyID proper: `other_review`, `shared_host_coolify`, and `shared_host_n8n`.
- Older OmnyID backup generations are now pruned down to the current retention posture, but `omnyid_backup_retention` remains the top review-class storage group in the cleanup plan because the latest generation must stay on host.

If you want to re-close the rollout record after another cleanup pass, rerun the safe-now cleanup path and regenerate proof immediately after:

```powershell
./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current -Execute
./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current
./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current -RequireExecutedOracleRemediation
./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current -RequireExecutedOracleRemediation -Enforce
```

The remediation helpers now keep destructive review cleanup opt-in even during execute runs. `oracle-remediation-sequence.ps1 -ExecuteCleanup` executes only the safe-now cleanup path unless you also add exactly one of:

- `-IncludeReviewTargetCleanup`
- `-IncludeBackupRetentionCleanup`
- `-IncludeCombinedReviewCleanup`

That keeps the default live path bounded while still recording the recommended higher-risk follow-through in the remediation artifact.

The same remediation sequence now carries two bounded-history maintenance steps for database growth that should never behave like product archives:

- `-ExecuteSyntheticMessageCleanup` executes the latest-only synthetic snapshot cleanup.
- `-ExecuteOperationalHistoryCleanup` executes the rolling operational-history cleanup for daemon audit rows, reflection traces, workflow trigger observations, replay nonces, token usage, and external-tool usage rows.

If those steps are left in dry-run mode, the generated remediation and commercial-readiness artifacts still record the row counts, cleanup mode, and exact command so operators can see whether history pressure remains unresolved.

Under the strict lane, bounded operational-history pressure is treated as a rollout blocker when the snapshot still reports `operational_history_present`, row volume remains materially elevated, and cleanup has not been executed. In that case, run the recorded bounded-cleanup follow-through command first: prune the operational history, rerun `oracle-production-proof`, refresh `commercial-readiness-snapshot`, then refresh `production-go-no-go` before treating the host as promotion-ready again. The current commercial snapshot and go/no-go artifacts now both record that exact operator command as the canonical next step.

## Rollback

Rollback is required if:

- the homeserver does not become healthy
- `/readyz` fails due to a new deployment regression
- login/bootstrap regresses
- a migration or integration path is broken in a way that blocks normal use

Rollback path:

1. Stop the rollout and preserve logs.
2. Restore the last known good build or image.
3. If data corruption or a destructive migration occurred, use the latest known good backup:

```bash
bash scripts/omnyid-restore.sh /path/to/backup_dir
```

4. Confirm recovery with `healthz`, `readyz`, login, and one critical flow.

## Recovery drill discipline

Run restore drills before you need them:

```bash
bash scripts/omnyid-restore-drill.sh /path/to/backup_dir
```

A backup is not operationally real until restore has been rehearsed, but that rehearsal no longer needs to block every routine deploy if a recent dedicated restore-proof artifact already exists.

## Staging on the Oracle host

`staging.omnyid.com` runs as the separate `omnyid-staging` compose project
(`docker-compose.oracle.staging.yml`) next to production. It has its own Postgres volume, keys
and seed user, runs with `OMNYID_ENV=production`, and has no mail provider or paid API keys.

```bash
bash scripts/staging-up.sh                      # create secrets once, start, seed
# Test a release candidate before touching production:
docker build -t omnyid-homeserver:candidate .
OMNYID_STAGING_HOMESERVER_IMAGE=omnyid-homeserver:candidate bash scripts/staging-up.sh
```

- The dashboard shell is behind basic auth (`OMNYID_STAGING_USER` and
  `OMNYID_STAGING_PASSWORD_HASH` in `.env.oracle`). API paths are not, because Bearer tokens
  share the `Authorization` header.
- The seed login is in `.secrets-staging/seed_user_password` on the server.
- Staging shares the host's disk, RAM and Docker daemon with production, so it does not
  rehearse host-level failures. Stop it with
  `docker compose -p omnyid-staging -f docker-compose.oracle.staging.yml stop`.
