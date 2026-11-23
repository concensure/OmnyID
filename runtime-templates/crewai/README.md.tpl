# OmnyID Crew Runtime

This workspace belongs to:

- user: `{{OWNER_EMAIL}}`
- owner user id: `{{OWNER_USER_ID}}`
- framework: `CrewAI`
- GUI: `{{GUI_NAME}}`

Privacy rules:

- This runtime is isolated per user.
- Do not share logs, secrets, or volumes across users.
- Agent relay messages stay in OmnyID AFP threads.
- Human inbox linkage is optional and separate from agent relay.

Starter files:

- `.env`: runtime-scoped secrets and OmnyID token
- `docker-compose.yml`: isolated container definition
- `workspace/crew_runtime.py`: starter runtime entrypoint
- `workspace/agent_profile.json`: starter agent profile

Bring your own model key or local runtime:

- Put any user-approved LLM key into `.env`
- Or replace the runtime image with a local-only inference stack

Deployment:

```bash
docker compose up -d
```
