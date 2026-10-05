# OmnyID - Document Index

Project documentation organised by topic. Files here do not affect compilation or deployment.

**Last updated: 2026-10-05**

## Current Status

Use [../AGENTS.md](../AGENTS.md) and the `.agent/` project ledger for live
project state:

- [../.agent/PROJECT_STATE.md](../.agent/PROJECT_STATE.md) for concise current facts and authority map
- [../.agent/TASKS.yaml](../.agent/TASKS.yaml) for owned task lifecycle and dependencies
- [../.agent/DECISIONS.md](../.agent/DECISIONS.md) for durable architecture decisions
- [../.agent/HANDOFF.md](../.agent/HANDOFF.md) for agent commentary and session notes

Build, test, deployment, and production health verdicts are machine-owned by
GitHub Actions, GitHub Checks, GitHub Deployments/environments, and runtime
monitoring. Do not treat hand-written documentation as the authority for those
states.

## Folders

| Folder | Contents |
|--------|----------|
| [deployment/](deployment/) | Oracle Cloud, Caddy, Cloudflare, Google OAuth, WebTransport, and discovery deployment guides |
| [specs/](specs/) | Agent ID specification, stack version pins, agent template plan |
| [phases/](phases/) | Phase 0.5 through Phase 14 build plans (historical reference) |
| [roadmap/](roadmap/) | `OMNYID_TASKS.md` - live task document and backlog |
| [strategy/](strategy/) | Consumer privacy strategy, production decisions |
| [marketing/](marketing/) | Landing page content and design prompts |
| [testing/](testing/) | macOS validation notes |
| [engineering/](engineering/) | UX proposals and internal design documents |

## Quick Links

- **Live task backlog** -> [roadmap/OMNYID_TASKS.md](roadmap/OMNYID_TASKS.md)
- **Oracle deployment** -> [deployment/OMNYID_ORACLE_DEPLOYMENT.md](deployment/OMNYID_ORACLE_DEPLOYMENT.md)
- **personalOS terminology contract** -> [personalOS/PERSONALOS_TERMINOLOGY_CONTRACT.md](personalOS/PERSONALOS_TERMINOLOGY_CONTRACT.md)
- **Stack versions** -> [specs/OMNYID_STACK_VERSIONS.md](specs/OMNYID_STACK_VERSIONS.md)
- **Agent ID spec** -> [specs/OMNYID_AGENT_ID_SPEC.md](specs/OMNYID_AGENT_ID_SPEC.md)
