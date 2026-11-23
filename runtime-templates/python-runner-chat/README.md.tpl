# OmnyID Python Runner + Chat Window

This workspace belongs to:

- user: `{{OWNER_EMAIL}}`
- owner user id: `{{OWNER_USER_ID}}`
- framework: `Python runner + chat window`
- GUI: `{{GUI_NAME}}`

What this runtime is for:

- a Coolify-friendly single-container runtime for non-technical "Zapier for agents" workflows
- a browser chat window plus logs, traces, prompt history, replay, and review queue
- controlling a private per-user Python runner with natural-language commands
- OmnyID-managed model defaults, with bring-your-own model/API keys available in `.env`

Privacy rules:

- This runtime is isolated per user.
- Do not share logs, secrets, or volumes across users.
- Agent relay messages stay in OmnyID AFP threads.
- Human inbox linkage is optional and separate from agent relay.
- This runtime should be exposed only behind the user's authenticated OmnyID path or a dedicated private route.

Starter files:

- `.env`: runtime-scoped secrets and OmnyID token
- `docker-compose.yml`: Coolify-friendly single-container definition
- `Dockerfile`: prebuilds the isolated Python runtime so restarts do not reinstall the toolchain
- `workspace/runner_chat.py`: lightweight control-plane chat window and runner
- `workspace/tool_registry.py`: capability-gated tool registry
- `workspace/runtime_policy.json`: sandbox, model, tool, and channel defaults
- `workspace/starter_templates.json`: day planner, research, and appointment starters
- `workspace/agent_profile.json`: starter runner profile
- `requirements.txt`: daily-use Python toolchain

Daily-use toolchain already included in `requirements.txt`:

- `requests`, `beautifulsoup4`, `playwright`
- `stripe`, `google-api-python-client`
- `ollama`
- `chromadb`, `duckdb`
- `python-docx`, `openpyxl`, `python-pptx`, `reportlab`, `Pillow`
- `duckduckgo_search`

Bring your own model key or local runtime:

- Put a user-approved LLM key into `.env`
- Or replace the runtime image with a local-only inference stack
- `AGENT_ID`, `PRIVATE_KEY_PATH`, and `OLLAMA_HOST` are already wired into the runtime contract
- The runner will read `/user/llm-config` and `/user/agent-preferences` at task time, then fall back to `.env` and `runtime_policy.json` only if the API is unavailable

Deployment:

```bash
docker compose up -d
```

The first deploy now builds a workspace-local image that caches Python dependencies up front.
That makes later restarts and refreshes much faster than reinstalling packages on each boot.

Security baseline:

- non-root runtime user
- read-only root filesystem
- `no-new-privileges`
- `cap_drop: ALL`
- writable paths restricted to `/workspace` data and `/tmp`
- resource caps are scaffolded into Compose and the runtime policy
- high-risk capabilities go through a trust filter before execution
