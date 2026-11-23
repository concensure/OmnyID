# Omnyid Oracle Cloud Deployment

## Current Oracle Host

- Date checked: 2026-08-25 (last verified)
- Public IP: `152.67.110.187`
- Hostname: `vnic-syd-prod`
- SSH user: `ubuntu`
- SSH command:

```powershell
ssh -i "<path-to-your-oracle-private-key>" ubuntu@152.67.110.187
```

## Current Server Reality

The host is reachable, running the Omnyid runtime, and is currently in a commercially ready audited state. Verified on 2026-08-25:

- Docker `29.3.0`
- Docker Compose `v5.1.0`
- direct Omnyid TCP ingress through Caddy on `80/tcp` and `443/tcp`
- direct Omnyid QUIC/WebTransport ingress on `443/udp`

- Oracle root filesystem at `77%` use with about `11G` free
- latest audited backup under `/var/backups/omnyid` is `20260825T050754Z`
- backup verification is currently `pass`
- restore-drill status is currently `pass`
- current Oracle proof status is `pass`
- current runtime script integrity is `pass`

Treat the checked artifacts as the operator source of truth for promotion, not this narrative summary alone.

For the consolidated readiness verdict and artifact index, also see [docs/COMMERCIAL_READINESS_STATUS.md](/c:/Users/ozans/Desktop/projects/OmnyID/docs/COMMERCIAL_READINESS_STATUS.md).

## Recommended Oracle Shape

Use [docker-compose.oracle.minimal.yml](/c:/Users/ozans/Desktop/projects/OmnyID/docker-compose.oracle.minimal.yml) on this host.

That profile:

- runs Postgres, SeaweedFS, the Omnyid homeserver, and Caddy only
- binds Omnyid HTTP on `127.0.0.1:18080`
- binds Omnyid WebTransport on public `443/udp`
- terminates HTTPS on Caddy for `omnyid.com`, `api.omnyid.com`, `cloud.omnyid.com`, and `wt.omnyid.com`
- keeps Postgres and SeaweedFS internal to the compose network

This is the current deployed shape on Oracle.

## Deployment Notes

1. Stage a runtime-only deployment tree from this workstation:

```powershell
./scripts/stage-oracle-runtime.ps1 -OutputDir C:\temp\omnyid-oracle-runtime
```

2. Sync that staged runtime tree to the Oracle host under a directory such as `/home/ubuntu/omnyid`.
3. Copy [oracle-cloud.env.example](/c:/Users/ozans/Desktop/projects/OmnyID/oracle-cloud.env.example) to a gitignored runtime file such as `.env.oracle`.
   - keep the filled runtime env file outside git; do not rely on a repo-tracked local secret draft
4. Fill that env file with:
   - Omnyid signing key
   - Omnyid encryption key
   - Gmail OAuth credentials
   - SeaweedFS root password
   - `OMNYID_BACKUP_DIR` pointing at the host backup mount used by the Oracle backup container, typically `/var/backups/omnyid`
   - file-backed Postgres and homeserver secrets using `POSTGRES_PASSWORD_FILE` and `DATABASE_URL_FILE`
   - `COMPOSIO_API_KEY` only if this deployment should host live Composio-backed Connected Apps
   - `OMNYID_VERIFY_COMPOSIO_LIVE=true` for staging or pre-release validation if you want startup-policy checks to fail when the key is rejected upstream
5. Start with:

```bash
docker compose --env-file .env.oracle -f docker-compose.oracle.minimal.yml up -d --build
```

From this workstation, the same sync path can now be run with `scripts/deploy-oracle.ps1`. Always pass `-ProjectRoot` explicitly — the default is a stale path:

```powershell
& scripts/deploy-oracle.ps1 -EnvFile 'C:\path\to\your\gitignored\oracle-cloud.local.env'
```

Update: `scripts/deploy-oracle.ps1` now stages a runtime-only bundle before upload, the default `-ProjectRoot` resolves to the OmnyID repo root, and the helper runs a remote preflight proof before upload unless `-SkipRemotePreflight` is used.

The staged Oracle runtime bundle intentionally keeps:

- runtime source and Docker build inputs
- Caddy-served `docs/`
- selected backup, restore, migration, startup-policy, and deployment verification scripts
- `solid-ui` and `typescript-sdk` source/build inputs required by the Docker build
- the small simulated sample data fixture `benchmarks/sample.jsonl`

The staged Oracle runtime bundle intentionally excludes local-only residue such as:

- `target`
- `artifacts`
- `training_data`
- `.git`
- `.dev-launch`
- `.kilo`
- `python-sdk`
- local `node_modules`

The restore tooling is now split into three distinct operator checks:

- `scripts/omnyid-backup-verify.sh`
  - verifies the local archive shape without mutating live services
- `scripts/omnyid-restore.sh`
  - performs the actual Postgres and object-store restore
- `scripts/omnyid-restore-drill.sh`
  - replays the archive into disposable targets for both Postgres and the S3-compatible object-store path

That means the restore drill is no longer Postgres-only. It now proves that the mirrored `seaweedfs/` archive can also be replayed into a clean disposable bucket and that the restored object count matches the backup manifest.

To prove those checks on the actual Oracle host instead of only on a workstation snapshot, run:

```powershell
./scripts/oracle-production-proof.ps1 -OutDir artifacts/oracle-production-proof
```

By default this audits the remote runtime, confirms the backup and homeserver services are running, verifies the latest archive under `OMNYID_BACKUP_DIR`, and runs the remote restore drill against that latest archive. Use `-SkipRestoreDrill` only for a lighter operational audit when you explicitly do not want to spend time on a disposable drill run.

To turn the latest runtime inventory into a non-destructive cleanup script plan, run:

```powershell
./scripts/oracle-runtime-cleanup-plan.ps1 -OutDir artifacts/oracle-runtime-cleanup-plan-current
```

To preview the exact remote cleanup commands without executing them, run:

```powershell
./scripts/oracle-runtime-cleanup-execute.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-runtime-cleanup-execute-current
```

Only add `-Execute` when you are ready to apply the cleanup plan on Oracle.

To run the full remediation flow as one operator sequence, use:

```powershell
./scripts/oracle-remediation-sequence.ps1 -CleanupPlanPath artifacts/oracle-runtime-cleanup-plan-current/oracle-runtime-cleanup-plan.json -OutDir artifacts/oracle-remediation-sequence-current
```

That wrapper:

- runs the cleanup executor in dry-run mode by default
- can apply cleanup only when `-ExecuteCleanup` is added explicitly
- runs synthetic-message and bounded operational-history cleanup in dry-run mode by default
- can execute synthetic-message cleanup only when `-ExecuteSyntheticMessageCleanup` is added explicitly
- can execute bounded operational-history cleanup only when `-ExecuteOperationalHistoryCleanup` is added explicitly
- can run deploy and final proof in the same sequence when `-Deploy` is supplied with `-EnvFile`

If inventory or the cleanup plan shows bounded machine-generated history growing materially, you can run the dedicated operational-history cleanup directly. For strict-lane readiness work, treat it as a follow-through chain rather than a standalone prune so the proof and gate artifacts reflect the new retention state:

```powershell
./scripts/oracle-prune-operational-history.ps1 -VacuumMode analyze
./scripts/oracle-production-proof.ps1 -UseDetachedRemoteAudit -OutDir artifacts/oracle-production-proof-current
./scripts/commercial-readiness-snapshot.ps1 -OracleRemediationPath artifacts/oracle-remediation-sequence-current/oracle-remediation-sequence.json -OutDir artifacts/commercial-readiness-snapshot-current
./scripts/production-go-no-go.ps1 -OutDir artifacts/production-go-no-go-current
```

That cleanup is meant for rolling audit-style tables such as daemon operational AFP entries, reflection traces, token usage, replay nonces, workflow trigger observations, and external-tool usage rows. It keeps them behaving like capped operational footage rather than append-only product records.

**Important:** the current production runtime expects file-backed database secrets. Your gitignored Oracle env file must point at secret files with `DATABASE_URL_FILE` and `POSTGRES_PASSWORD_FILE`, and the referenced files must exist under the staged `.secrets/` directory. Plaintext `DATABASE_URL` and `POSTGRES_PASSWORD` are now rejected by the startup policy checks in production. Do not record live secret values in this document.

## DNS Status

At the time of this note, DNS on the Oracle host for `www.omnyid.com` resolves to Cloudflare addresses, not directly to the Oracle box:

- `172.67.207.179`
- `104.21.61.84`
- `2606:4700:3032::ac43:cfb3`
- `2606:4700:3030::6815:3d54`

That indicates Cloudflare is already in front of the domain. Public cutover for `api.omnyid.com`, `cloud.omnyid.com`, and `wt.omnyid.com` still needs to be validated separately.

Cloudflare does not need the GitHub repo for standard DNS or proxying. Linking a GitHub repo is only useful if you later use Cloudflare Pages or Workers build workflows.

## WebTransport Status On This Host

Omnyid's intended public transport is still WebTransport-first with WebSocket fallback.

`wt.omnyid.com` is now expected to be `DNS-only` in Cloudflare and resolves directly to the Oracle public IP. The Omnyid homeserver reports:

- `public_transport.primary = webtransport`
- `public_transport.fallback = websocket`
- `internal_transport.grpc_enabled = false`

Verified local endpoints:

- `http://127.0.0.1:18080/healthz`
- `http://127.0.0.1:18080/readyz`
- `http://127.0.0.1:18080/transport/capabilities`

Verified public endpoints:

- `https://omnyid.com/`
- `https://api.omnyid.com/healthz`
- `https://wt.omnyid.com/transport/capabilities`

Current homepage behavior:

- `omnyid.com` serves the static preview from `docs/`
- preview access is protected with HTTP basic auth
- the preview now supports:
  - email/password Agent ID creation
  - Google OAuth popup sign-in
  - seeded test agents for live message send testing
  - seeded structured demo knowledge across profile, people, objectives, values, projects, and relationships
  - a private dashboard bootstrap for agents, messages, and action logs

Oracle-backed accounts use the same server bootstrap path as local accounts. That means first-run seeded demo data is inserted through the normal AFP/private-message storage flow and is available through the same notes, thread, retrieval, and dashboard surfaces on Oracle without a separate cloud import step.

For Google console setup, use [GOOGLE_OAUTH_SETUP.md](/c:/Users/ozans/Desktop/projects/OmnyID/Documents/deployment/GOOGLE_OAUTH_SETUP.md).

Current certificate status:

- a real Let's Encrypt certificate for `wt.omnyid.com` has been issued on-host
- the homeserver reads it through:
  - `/letsencrypt/live/wt.omnyid.com/fullchain.pem`
  - `/letsencrypt/live/wt.omnyid.com/privkey.pem`
- the host-side certificate material currently lives under:
  - `/home/ubuntu/letsencrypt/live/wt.omnyid.com/fullchain.pem`
  - `/home/ubuntu/letsencrypt/live/wt.omnyid.com/privkey.pem`
- automated renewal is handled by [oracle-renew-wt-cert.sh](/c:/Users/ozans/Desktop/projects/OmnyID/scripts/oracle-renew-wt-cert.sh)
- the host cron currently runs that renewal flow daily at `03:17 UTC`

## Preview Access Credentials

- Username: `preview`
- Password: `preview2025`
- (Caddy HTTP basic auth gate on `omnyid.com`)

Note: the username is `preview`, not an email address.

## Deployment History

| Date | Change |
|---|---|
| 2026-03-21 | Initial Oracle stack deployed; Caddy TLS certificates obtained |
| 2026-03-24 | Workspace route 404 fix (Caddyfile `handle_path`); RunPod env vars added |
| 2026-05-09 | Phase 16-A deployed (multi-modal ingest routes + renderers); duplicate route panic fixed (`/agent/fs/thread/:id` registered twice); database/runtime env wiring added for the Oracle stack; Agent Dashboard UX overhaul deployed; all 6 containers healthy with 0 restarts |

## Required Env Vars

| Variable | Purpose | Added |
|---|---|---|
| `OMNYID_RUNPOD_API_KEY` | RunPod API key for QWEN 3.5 inference | 2026-03-24 |
| `OMNYID_RUNPOD_ENDPOINT_ID` | RunPod endpoint ID (`sdr11n90qjwjy2`) | 2026-03-24 |
| `DATABASE_URL_FILE` | Required production secret-file path for the homeserver SQLx connection string, typically `.secrets/database_url` | 2026-08-15 |
| `POSTGRES_PASSWORD_FILE` | Required production secret-file path for the Postgres `afp` user password, typically `.secrets/postgres_password` | 2026-08-15 |
| `COMPOSIO_API_KEY` | Optional Composio project key for live Connected Apps OAuth handshakes; without a valid key, the per-user registry still works but provider-backed Composio apps cannot complete auth | 2026-08-15 |
| `OMNYID_MINERU_URL` | Optional: MinerU REST endpoint for PDF ingest (P16-A) | 2026-05-09 |
| `OMNYID_LLAMAPARSE_KEY` | Optional: LlamaParse API key for PDF ingest fallback (P16-A) | 2026-05-09 |
| `OMNYID_WHISPER_URL` | Optional: Whisper endpoint for audio transcription (defaults to OpenAI) | 2026-05-09 |
| `OMNYID_OPENAI_API_KEY` | Required if using OpenAI Whisper for audio ingest (P16-A) | 2026-05-09 |

## Connected Apps On Oracle

The server-backed Connected Apps flow now supports Composio OAuth handshakes through the OmnyID backend rather than browser-only local state.

For that flow to work on Oracle:

- `OMNYID_SESSION_SECRET` must be set so the callback state token can be signed and verified
- one of `OMNYID_WORKSPACE_BASE_URL`, `OMNYID_UI_BASE_URL`, or a derivable `OMNYID_HOMESERVER_URL` must be set so the callback URL can be generated correctly
- `COMPOSIO_API_KEY` must be a valid Composio project key

If the Composio project key is missing or failing verification, `/tools/connections` still remains per-user and server-backed, but live Composio-backed app enablement will stay blocked until the key is fixed.

The production startup-policy scripts also support an opt-in live Composio probe:

- `OMNYID_VERIFY_COMPOSIO_LIVE=true`
- optional `OMNYID_COMPOSIO_API_BASE_URL` override for staging or local mock validation

When enabled, startup validation performs `GET /api/v3.1/tools?limit=1` with the resolved `COMPOSIO_API_KEY` and fails on `401`, `403`, `429`, other non-success responses, or network reachability failures.

## Admin Shared Wedding Tools On Oracle

The Usage admin panel can enable shared provider tools for all users or only for wedding-planner work. These controls cover Google Maps Platform, WeatherAPI, Twilio Messaging, Stripe, and Cloudinary. Users should not need to bring their own keys for admin-funded wedding planner tools.

For Oracle, set:

- `OMNYID_ADMIN_THIRD_PARTY_TOOL_POLICY_FILE=/var/lib/omnyid/admin-third-party-tool-policy.json`
- `OMNYID_ADMIN_TOOL_<PROVIDER>_ALL_USERS_ENABLED=false`
- `OMNYID_ADMIN_TOOL_<PROVIDER>_WEDDING_TEMPLATE_ENABLED=false`
- optional quota labels with `OMNYID_ADMIN_TOOL_<PROVIDER>_MONTHLY_FREE_QUOTA_LABEL` and `OMNYID_ADMIN_TOOL_<PROVIDER>_QUOTA_USED_LABEL`

For live wedding vendor search specifically, set the server-side provider secret and the non-secret wedding sharing toggle:

- Brave Search: `OMNYID_ADMIN_BRAVE_SEARCH_API_KEY_FILE` or `OMNYID_BRAVE_SEARCH_API_KEY_FILE`, plus `OMNYID_ADMIN_TOOL_BRAVE_SEARCH_API_WEDDING_TEMPLATE_ENABLED=true`
- Google Places: `OMNYID_ADMIN_GOOGLE_PLACES_API_KEY_FILE`, `OMNYID_GOOGLE_PLACES_API_KEY_FILE`, or `GOOGLE_PLACES_API_KEY_FILE`, plus `OMNYID_ADMIN_TOOL_GOOGLE_PLACES_API_WEDDING_TEMPLATE_ENABLED=true`

Google Places keys used by the server must allow server-side Places API calls. If Google returns `Requests from referer <empty> are blocked`, the key is restricted to browser HTTP referrers; create or update a server-compatible Places key, for example API-restricted to Places API and IP-restricted to the Oracle egress IP.

If `OMNYID_ADMIN_THIRD_PARTY_TOOL_POLICY_FILE` already exists, the saved admin policy can override these env defaults. After changing Oracle env values, open the Usage admin panel and confirm Brave Search and Google Places are enabled for the wedding template, or update the policy file to match.

The admin UI source label means:

- `Deployment defaults`: settings came from the env file.
- `Saved admin policy`: settings came from the server-side policy file after an admin save.
- `Saved in this browser`: the UI kept the change locally because server persistence was not configured or failed.

Provider secrets still belong in server-side secret files or provider-specific connected-app storage. The shared-tool policy records scope and quota labels only; it must not contain API keys.

## Workspace Route Fix (2026-03-24)

`omnyid.com/workspace/` was returning 404 due to a Caddyfile bug (`handle` vs `handle_path`).
Fixed: Caddyfile now uses `handle_path /workspace*` with `try_files {path} /index.html`.

## Is The Project Ready To Deploy?

Partially ready on Oracle now:

- the Oracle stack is deployed and serving
- Caddy has obtained public certificates for the main Omnyid hostnames
- the homeserver health and readiness endpoints are green
- WebTransport is configured as the public primary path with WebSocket fallback

Still needed for fuller production hardening:

- replace Gmail placeholder env values with real OAuth credentials
- add Cloudflare API token based DNS-01 renewal later if zero-downtime renewal becomes a requirement
- continue hardening backups, secrets, and rollout automation
- remove stale non-Omnyid runtime debris from the Oracle host and restore free disk capacity
- redeploy the current staged runtime bundle so backup verification and restore-drill scripts are present on-host
- refresh backups until `oracle-production-proof` reports a recent verified archive and a passing restore drill

For the dedicated QUIC-capable Oracle path beyond this single-node setup, see [OMNYID_WEBTRANSPORT_DEPLOYMENT.md](/c:/Users/ozans/Desktop/projects/OmnyID/Documents/deployment/OMNYID_WEBTRANSPORT_DEPLOYMENT.md) and [docker-compose.oracle.quic.yml](/c:/Users/ozans/Desktop/projects/OmnyID/docker-compose.oracle.quic.yml).
