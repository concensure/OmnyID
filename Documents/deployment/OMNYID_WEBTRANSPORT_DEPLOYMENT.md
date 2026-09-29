# Omnyid WebTransport Deployment

## Goal

Keep WebTransport as the primary public transport while preserving WebSocket fallback.

## Current Oracle Constraint

Originally, on `152.67.110.187`, `coolify-proxy` owned:

- `80/tcp`
- `443/tcp`
- `443/udp`
- `8080/tcp`

That prevented Omnyid from becoming the primary public WebTransport endpoint on the shared host.

Current state after host reconfiguration:

- `coolify-proxy` still owns:
  - `80/tcp`
  - `443/tcp`
  - `8080/tcp`
- `443/udp` has been freed for Omnyid
- `api.omnyid.com` and `cloud.omnyid.com` now have a Traefik dynamic route to `http://host.docker.internal:18080`

That means the shared-host Oracle topology can now support:

- WebSocket and HTTPS through Traefik on `443/tcp`
- direct Omnyid QUIC/WebTransport on `443/udp`

The remaining deployment blocker is certificate and DNS setup for `wt.omnyid.com`, not the port ownership itself.

## Three Viable Ways To Keep WebTransport Primary

### 1. Recommended: dedicated QUIC ingress on Oracle

Keep the current Oracle host for HTTP/WebSocket or app traffic, but give Omnyid its own QUIC-capable ingress for `wt.omnyid.com`.

This can be:

- a second Oracle VM, or
- a second Oracle public IP attached to a dedicated Omnyid host, or
- any Oracle shape where Omnyid owns `443/udp`

Then:

- point `wt.omnyid.com` to that dedicated QUIC endpoint
- keep `api.omnyid.com` on the regular HTTP/WebSocket path
- run [docker-compose.oracle.quic.yml](/c:/Users/ozans/Desktop/projects/OmnyID/docker-compose.oracle.quic.yml) there

Why this is the best option:

- preserves WebTransport as primary
- avoids breaking the existing Coolify/Supabase host
- keeps rollout risk low

### 2. Move Omnyid to a dedicated Oracle host entirely

Give Omnyid its own VM that owns:

- `80/tcp`
- `443/tcp`
- `443/udp`

Then the normal bundled ingress model can be used more directly.

Why this works:

- simplest network story
- best long-term for a privacy-first primary service

Tradeoff:

- more infrastructure overhead immediately

### 3. Reconfigure the existing shared public proxy

This means changing the host that currently runs `coolify-proxy` so it can proxy or terminate QUIC/WebTransport for `wt.omnyid.com`.

Why this is possible:

- it keeps one public host

Why I do not recommend it first:

- highest blast radius
- easiest way to disrupt other services already on the machine
- proxy support for WebTransport/QUIC routing is more operationally fragile than simply owning `443/udp`

This path has now been partially applied in the safer form:

- Traefik keeps TCP ingress
- Omnyid can take UDP `443` directly
- no QUIC proxying through Traefik is required

## What To Change In Oracle

### If you keep the current shared host

Do this:

1. keep [docker-compose.oracle.yml](/c:/Users/ozans/Desktop/projects/OmnyID/docker-compose.oracle.yml) for the shared host
2. keep WebTransport disabled there
3. create a dedicated QUIC endpoint for `wt.omnyid.com`
4. deploy [docker-compose.oracle.quic.yml](/c:/Users/ozans/Desktop/projects/OmnyID/docker-compose.oracle.quic.yml) on that QUIC-capable endpoint

### If you create a dedicated Oracle Omnyid host

Do this:

1. open `443/udp` and `443/tcp`
2. mount the QUIC certificate and key
3. use [oracle-cloud.quic.env.example](/c:/Users/ozans/Desktop/projects/OmnyID/oracle-cloud.quic.env.example)
4. start with:

```bash
docker compose --env-file .env.oracle-quic -f docker-compose.oracle.quic.yml up -d --build
```

## What To Change In This Project

Already added:

- [docker-compose.oracle.yml](/c:/Users/ozans/Desktop/projects/OmnyID/docker-compose.oracle.yml)
  - safe shared-host Oracle profile
- [docker-compose.oracle.quic.yml](/c:/Users/ozans/Desktop/projects/OmnyID/docker-compose.oracle.quic.yml)
  - dedicated QUIC/WebTransport Oracle profile
- [oracle-cloud.env.example](/c:/Users/ozans/Desktop/projects/OmnyID/oracle-cloud.env.example)
  - shared-host env baseline
- [oracle-cloud.quic.env.example](/c:/Users/ozans/Desktop/projects/OmnyID/oracle-cloud.quic.env.example)
  - dedicated QUIC env baseline

This means the repo now supports both:

- shared-host Oracle deployment with WebSocket public fallback
- dedicated QUIC Oracle deployment with WebTransport primary

## Practical Recommendation

For your current Oracle setup, the cleanest path is:

1. keep `api.omnyid.com` on the existing shared Oracle host
2. keep `wt.omnyid.com` reserved for a dedicated QUIC-capable Omnyid endpoint
3. use the shared host for application rollout first
4. bring up the dedicated QUIC endpoint next so WebTransport becomes the true primary public path without destabilizing the host you already use
