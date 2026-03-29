# OmnyID

OmnyID is a privacy-first agent infrastructure stack built around AFP v1, the Agent First Protocol, an append-only protocol for signed and encrypted agent messaging.

This repository contains the open-source OmnyID core:

- AFP v1 protocol and message schemas
- Rust homeserver reference implementation
- Postgres and ElectricSQL-oriented storage setup
- Python and TypeScript SDKs
- AgentCard discovery and alias resolution
- AFP signing, E2EE envelope handling, and validation
- Docker Compose for self-hosting

## Why This Exists

Privacy is becoming a universal requirement, not a niche preference. If agents are going to act on behalf of real people, then privacy, verifiable identity, and user control cannot be optional layers added later. They have to be part of the foundation.

Too much of modern software still asks people to accept a quiet trade: convenience in exchange for trust in infrastructure they do not control. In agent systems, that trade gets worse. The software becomes more capable, the data becomes more sensitive, and the boundary between assistance and delegation becomes much thinner.

OmnyID is built from the ground up around a different assumption: people should be able to use powerful agent systems without giving up ownership of identity, message history, or deployment choice. That is why the protocol work in this repository centers signed identity, encrypted transport, explicit discovery, and local-first sync boundaries instead of treating them as secondary features.

The audit, crypto, and local-sync work in this project all point in the same direction: privacy must be technically true, zero-trust communication must be explicit, and offline-capable local state must be designed in early if it is going to matter later.

## Vision

OmnyID is aimed at a simple long-term goal: give everyone a privacy-first agentic identity that can travel across runtimes, domains, and devices.

In this project, that identity is meant to be flexible in how it is used:

- as the foundation for a full self-hosted agent stack
- as Agent ID, discovery, and encrypted relay infrastructure under an existing runtime
- as a portable protocol layer that is not locked to one UI, one cloud, or one orchestration style

That flexibility is reflected in the project documents and code already in this repo family: Agent IDs are protocol-scoped, AgentCards are signed and discoverable, and the product docs explicitly describe an `Agent ID only` path for people who already have agents elsewhere.

## Repository Layout

- `proto/` AFP v1 protobuf contract
- `src/` Rust homeserver and core protocol handling
- `postgres/` bootstrap SQL and migrations
- `python-sdk/` AFP Python SDK
- `typescript-sdk/` AFP TypeScript SDK
- `scripts/` local setup helpers
- `docs/protocol/` protocol and discovery docs
- `docs/examples/` minimal SDK examples

## Quick Start

```bash
cp .env.example .env
docker compose up --build
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up --build
```

Then verify the configured homeserver health endpoints:

- `/healthz`
- `/readyz`

## Development

```bash
cargo test
cd typescript-sdk && npm install && npm run typecheck
cd ../python-sdk && python -m venv .venv && . .venv/bin/activate && pip install -e .
```

## License

Apache License 2.0. See `LICENSE`.
