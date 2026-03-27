# Omnyid Oracle Cloud Deployment

## Current Oracle Host

- Date checked: March 21, 2026
- Public IP: `152.67.110.187`
- Hostname: `vnic-syd-prod`
- SSH user: `ubuntu`
- SSH command:

```powershell
ssh -i "C:\Users\ozans\Documents\cloud\Oracle Cloud\private key\ssh-key-2026-03-16.key" ubuntu@152.67.110.187
```

## Current Server Reality

The host is reachable and now running as an Omnyid-first node with:

- Docker `29.3.0`
- Docker Compose `v5.1.0`
- direct Omnyid TCP ingress through Caddy on `80/tcp` and `443/tcp`
- direct Omnyid QUIC/WebTransport ingress on `443/udp`

The earlier placeholder stack (`coolify`, `supabase-*`, `n8n`) has been removed from the active runtime path for this box. The Oracle host is now functioning as a minimal Omnyid role instead of a shared experiment host.

## Recommended Oracle Shape

Use [docker-compose.oracle.minimal.yml](/c:/Users/ozans/Desktop/projects/Agenton/docker-compose.oracle.minimal.yml) on this host.

That profile:

- runs Postgres, MinIO, the Omnyid homeserver, and Caddy only
- binds Omnyid HTTP on `127.0.0.1:18080`
- binds Omnyid WebTransport on public `443/udp`
- terminates HTTPS on Caddy for `omnyid.com`, `api.omnyid.com`, `cloud.omnyid.com`, and `wt.omnyid.com`
- keeps Postgres and MinIO internal to the compose network

This is the current deployed shape on Oracle.

## Deployment Notes

1. Copy the repo to the Oracle host under a directory such as `/home/ubuntu/omnyid`.
2. Copy [oracle-cloud.env.example](/c:/Users/ozans/Desktop/projects/Agenton/oracle-cloud.env.example) to a gitignored runtime file such as `.env.oracle`.
   - a prepared local secure draft now exists at [oracle-cloud.local.env](/c:/Users/ozans/Desktop/projects/Agenton/oracle-cloud.local.env)
3. Fill that env file with:
   - Omnyid signing key
   - Omnyid encryption key
   - Gmail OAuth credentials
   - MinIO root password
4. Start with:

```bash
docker compose --env-file .env.oracle -f docker-compose.oracle.minimal.yml up -d --build
```

From this workstation, the same sync path can now be run with [deploy-oracle.ps1](/c:/Users/ozans/Desktop/projects/Agenton/scripts/deploy-oracle.ps1).

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

- `omnyid.com` serves the static preview from [docs](/c:/Users/ozans/Desktop/projects/Agenton/docs)
- preview access is protected with HTTP basic auth
- the preview now supports:
  - email/password Agent ID creation
  - Google OAuth popup sign-in
  - seeded test agents for live message send testing
  - a private dashboard bootstrap for agents, messages, and action logs

For Google console setup, use [GOOGLE_OAUTH_SETUP.md](/c:/Users/ozans/Desktop/projects/Agenton/GOOGLE_OAUTH_SETUP.md).

Current certificate status:

- a real Let's Encrypt certificate for `wt.omnyid.com` has been issued on-host
- the homeserver reads it through:
  - `/letsencrypt/live/wt.omnyid.com/fullchain.pem`
  - `/letsencrypt/live/wt.omnyid.com/privkey.pem`
- the host-side certificate material currently lives under:
  - `/home/ubuntu/letsencrypt/live/wt.omnyid.com/fullchain.pem`
  - `/home/ubuntu/letsencrypt/live/wt.omnyid.com/privkey.pem`
- automated renewal is handled by [oracle-renew-wt-cert.sh](/c:/Users/ozans/Desktop/projects/Agenton/scripts/oracle-renew-wt-cert.sh)
- the host cron currently runs that renewal flow daily at `03:17 UTC`

## Preview Access Credentials

- Username: `preview`
- Password: `preview2025`
- (Caddy HTTP basic auth gate on `omnyid.com`)

Note: the username is `preview`, not an email address.

## New Env Vars (2026-03-24)

| Variable | Purpose |
|---|---|
| `OMNYID_RUNPOD_API_KEY` | RunPod API key for QWEN 3.5 inference |
| `OMNYID_RUNPOD_ENDPOINT_ID` | RunPod endpoint ID (`sdr11n90qjwjy2`) |

## Workspace Route Fix (2026-03-24)

`omnyid.com/workspace/` was returning 404 due to a Caddyfile bug (`handle` vs `handle_path`).
Fixed: Caddyfile now uses `handle_path /workspace*` with `try_files {path} /index.html`.

## Is The Project Ready To Deploy?

Ready on Oracle now:

- the Oracle stack is deployed and serving
- Caddy has obtained public certificates for the main Omnyid hostnames
- the homeserver health and readiness endpoints are green
- WebTransport is configured as the public primary path with WebSocket fallback

Still needed for fuller production hardening:

- replace Gmail placeholder env values with real OAuth credentials
- add Cloudflare API token based DNS-01 renewal later if zero-downtime renewal becomes a requirement
- continue hardening backups, secrets, and rollout automation

For the dedicated QUIC-capable Oracle path beyond this single-node setup, see [OMNYID_WEBTRANSPORT_DEPLOYMENT.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_WEBTRANSPORT_DEPLOYMENT.md) and [docker-compose.oracle.quic.yml](/c:/Users/ozans/Desktop/projects/Agenton/docker-compose.oracle.quic.yml).
