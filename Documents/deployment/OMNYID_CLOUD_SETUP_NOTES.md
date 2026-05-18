# Omnyid Cloud Setup Notes

## Production Targets

- Primary server target: Oracle Cloud
- Secondary target: OVHcloud
- Main domain: `omnyid.com`
- Public subdomains:
  - `api.omnyid.com`
  - `cloud.omnyid.com`
  - `wt.omnyid.com`

## Secret Handling

Sensitive values must not be committed.

Keep these outside git:

- cloud SSH keys
- Oracle Cloud API credentials
- OVHcloud API credentials
- provider OAuth client secrets
- Gmail refresh tokens
- Agent signing seeds
- AFP encryption keys
- provider token key-encryption keys
- user LLM secret references and exports
- MinIO access key and secret key (`MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`)
- image generation API keys (`XAI_API_KEY`, `FLUX_API_KEY`)
- Google Calendar refresh token (`OMNYID_GCAL_REFRESH_TOKEN`) and client secret (`OMNYID_GCAL_CLIENT_SECRET`)
- Outlook Calendar refresh token (`OMNYID_OUTLOOK_REFRESH_TOKEN`) and client secret (`OMNYID_OUTLOOK_CLIENT_SECRET`)

## Key Separation Policy

Omnyid production keeps three separate key domains:

1. AFP relay keys
   - signing
   - end-to-end message encryption
2. provider token protection keys
   - wraps Gmail and mail-provider OAuth tokens at rest
   - wraps Google Calendar and Outlook Calendar OAuth tokens at rest
3. user LLM and integration secret domain
   - BYO-LLM keys
   - external integration API secrets
   - image generation backend API keys (xAI / BFL Flux)

These domains must stay separate so that:

- agent-relay E2EE remains intact
- BYO-LLM does not share cryptographic material with mail-provider auth
- token compromise does not imply message compromise

## MinIO Object Storage

Omnyid uses MinIO for storing user-generated media (images, QR codes, generated documents).

- Default endpoint: `minio.omnyid.cloud:9000`
- Default public URL: `https://minio.omnyid.cloud`
- Default bucket: `omnyid-user-media`
- Object path pattern: `{user_id}/{subfolder}/{prefix}-{date}-{uuid}.{ext}`
- Credentials are injected via `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` only — never present in AFP messages or agent-visible surfaces.

On Oracle Cloud, MinIO should run as a Docker service on the same host or a dedicated storage node. The service account credentials go in the gitignored `.env` file only.

## Oracle Cloud Setup Inputs Needed Later

Current Oracle input now known:

- public IP: `152.67.110.187`
- hostname: `vnic-syd-prod`
- SSH username: `ubuntu`
- private key path:
  - `C:\Users\ozans\Documents\cloud\Oracle Cloud\private key\ssh-key-2026-03-16.key`
- Docker version:
  - `29.3.0`
- Docker Compose version:
  - `v5.1.0`

Current Oracle host constraint now known:

- `coolify-proxy` is already bound to:
  - `80/tcp`
  - `443/tcp`
  - `8080/tcp`

Current Oracle host adjustment now completed:

- `coolify-proxy` no longer binds `443/udp`
- Traefik dynamic routes for `api.omnyid.com` and `cloud.omnyid.com` have been added on-host

That means Omnyid's default bundled Caddy deployment is still not suitable for this host unchanged, but the shared-proxy WebTransport topology is now possible.

Use:

- [docker-compose.oracle.yml](/c:/Users/ozans/Desktop/projects/Agenton/docker-compose.oracle.yml)
- [oracle-cloud.env.example](/c:/Users/ozans/Desktop/projects/Agenton/oracle-cloud.env.example)
- [OMNYID_ORACLE_DEPLOYMENT.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_ORACLE_DEPLOYMENT.md)
- [docker-compose.oracle.quic.yml](/c:/Users/ozans/Desktop/projects/Agenton/docker-compose.oracle.quic.yml)
- [oracle-cloud.quic.env.example](/c:/Users/ozans/Desktop/projects/Agenton/oracle-cloud.quic.env.example)
- [OMNYID_WEBTRANSPORT_DEPLOYMENT.md](/c:/Users/ozans/Desktop/projects/Agenton/OMNYID_WEBTRANSPORT_DEPLOYMENT.md)

## OVHcloud Setup Inputs Needed Later

To help with OVHcloud later, I will need:

- public IP or load balancer endpoint
- SSH username
- whether OVHcloud Load Balancer is in front of the app
- whether QUIC is enabled on the OVHcloud Load Balancer
- whether UDP `443` is allowed in firewall rules

## Transport Rollout

- WebTransport is the default public transport target.
- The current relay listener binds separately via `OMNYID_WEBTRANSPORT_BIND_ADDR` and should sit behind Oracle Cloud or OVHcloud UDP `443` forwarding for `wt.omnyid.com`.
- WebSocket is the mandatory fallback.
- gRPC remains internal-only.

## Notes

I can help you prepare commands, config, DNS records, firewall steps, and deployment files for Oracle Cloud and OVHcloud.
Oracle Cloud SSH access has now been verified from this machine.

GitHub is not required for Omnyid Oracle deployment.

Cloudflare benefits from DNS and proxy configuration, not from the GitHub repo itself, unless the product later uses Cloudflare Pages or Workers CI/CD.
