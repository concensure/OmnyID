# OmnyID

OmnyID is an open-source, self-hosted private agent infrastructure stack built around AFP v1, an append-only protocol for signed, encrypted agent messaging.

The public core includes:

- the AFP v1 protocol specification and message schema
- a Rust homeserver built with Tokio, Axum, gRPC, WebTransport, and WebSocket fallback
- Postgres plus ElectricSQL setup for local-first sync with per-user schema boundaries
- Python and TypeScript SDKs
- AgentCard discovery and alias resolution
- AFP signing, encryption, validation, and relay handling
- Docker Compose for self-hosting

OmnyID is designed for developers who want to run private agent infrastructure on their own machine or server, inspect the full protocol, and contribute to an open implementation.

## Why OmnyID

- self-host first: the default path is local development and self-hosted deployment
- protocol first: AFP v1 is documented in this repository
- encrypted by design: signed messages, encrypted envelopes, and validation hooks are part of the core
- multi-language: official Rust, Python, and TypeScript surfaces ship together
- local-first ready: ElectricSQL and Postgres are included for sync-oriented deployments

## Repository Layout

- `proto/` AFP v1 protobuf contract
- `docs/protocol/` protocol and discovery specifications
- `homeserver/` Rust reference homeserver
- `postgres/` database bootstrap and migrations
- `python-sdk/` AFP Python SDK
- `typescript-sdk/` AFP TypeScript SDK
- `docker/compose/` self-hosting stack
- `installer/` one-command setup scripts

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/omnyid/omnyid.git
cd omnyid
```

### 2. Copy the environment template

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 3. Generate local development keys

```powershell
powershell -ExecutionPolicy Bypass -File scripts/omnyid-dev-keys.ps1
```

Paste the generated placeholder-safe values into `.env`.

### 4. Start the stack

```bash
docker compose -f docker/compose/docker-compose.yml up --build
```

This starts:

- Postgres
- ElectricSQL
- the OmnyID homeserver
- an optional local reverse proxy

### 5. Verify the server

Open:

- `http://localhost:8080/healthz`
- `http://localhost:8080/readyz`

## Self-Hosting Notes

- OmnyID ships with placeholder domains only. Replace them with your own hostname when deploying outside local development.
- The public repository does not include managed cloud infrastructure, hosted control-plane features, or premium UI surfaces.
- Email gateway integrations are optional and should be configured only with your own credentials.

## SDKs

### Python

```bash
cd python-sdk
python -m venv .venv
. .venv/bin/activate
pip install -e .
python ../docs/examples/python/basic_send.py
```

### TypeScript

```bash
cd typescript-sdk
npm install
npm run build
node ../docs/examples/typescript/basic-send.ts
```

## Protocol Docs

Start here if you want to understand or extend AFP v1:

- `docs/protocol/AFP_V1_SPEC.md`
- `docs/protocol/AFP_MESSAGE_SHAPES.md`
- `docs/protocol/AGENT_ID_SPEC.md`
- `docs/protocol/AGENTCARD_DISCOVERY.md`
- `docs/protocol/E2EE_AND_SIGNING.md`

## Development

### Rust

```bash
cd homeserver
cargo test
```

### Python SDK

```bash
cd python-sdk
pytest
```

### TypeScript SDK

```bash
cd typescript-sdk
npm run typecheck
```

## Security And Sanitisation

- all public examples use placeholder domains and dummy Agent IDs
- no production secrets, hosted credentials, or cloud-only infrastructure are included
- the repository is intended for self-hosting and local development

If you discover a security issue, please open a private security report with enough detail to reproduce the problem safely.

## Contributing

Issues, protocol discussions, SDK improvements, and self-hosting fixes are welcome.

If you are contributing a protocol change, update the docs in `docs/protocol/` and keep the Rust, Python, and TypeScript implementations aligned.

## License

Apache License 2.0. See `LICENSE`.
