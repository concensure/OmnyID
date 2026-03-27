# Omnyid Phase 6 SDK Stabilization

## Phase 6: SDK Stabilization

Status: in progress

Purpose: keep the SDKs ergonomic while making the secure shared-thread model obvious to developers.

## What Was Landed

### Shared Agent API Shape

- Both SDKs now keep:
  - low-level `send(...)`
  - high-level `act(...)`
  - action helpers such as `label(...)`, `reply(...)`, and `summarise(...)`
- Both SDKs now also expose:
  - verified discovery helpers
  - WebSocket relay subscriptions
  - thread-scoped watchers
  - WebSocket send with HTTP fallback

### Updated Examples

- [python-sdk/example.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/example.py) now demonstrates:
  - raw AFP message send
  - declarative label action
  - threaded reply action
- [python-sdk/example_phase2.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/example_phase2.py) now demonstrates reading the same shared thread after a summary request.
- [python-sdk/example_discovery.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/example_discovery.py) now uses verified discovery instead of unsigned lookup.
- [typescript-sdk/example.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/example.ts) now mirrors the threaded reply flow.

### Reliable Python Environment Baseline

- Python 3.14.3 is now installed and usable on the development machine.
- [scripts/setup-python-sdk.ps1](/c:/Users/ozans/Desktop/projects/Agenton/scripts/setup-python-sdk.ps1) now bootstraps a project-local virtual environment and editable install.
- [python-sdk/.venv](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/.venv) is now the expected local SDK runtime path.
- The SDK has been validated by:
  - editable install
  - import smoke check
  - `compileall` over the package and examples

### Security Baseline Remains Visible

- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py) and [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts) still keep signing, encryption, discovery trust mode, and transport preference as explicit inputs or env-backed defaults.
- The SDKs still model the agent inbox as AFP thread access, not a separate inbox abstraction.

### Transport Rollout Baseline

- [typescript-sdk/src/index.ts](/c:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/index.ts) now supports:
  - `webtransport`
  - `websocket`
  - `http`
  - `auto`
- The TypeScript SDK now fetches [transport capabilities](/c:/Users/ozans/Desktop/projects/Agenton/src/server.rs) and prefers WebTransport first when policy says it should.
- If WebTransport is unavailable or the server rollout is not ready, it falls back to WebSocket and then HTTP.
- This makes the public SDK transport story match the chosen production direction without breaking current compatibility.
- The homeserver now has a real QUIC relay listener, so the TypeScript SDK’s WebTransport send path is no longer targeting a placeholder rollout state.
- The TypeScript SDK now also exposes `openThreadSubscription(...)`, which prefers WebTransport for live thread watching and falls back to WebSocket when QUIC is unavailable.
- [python-sdk/afp/client.py](/c:/Users/ozans/Desktop/projects/Agenton/python-sdk/afp/client.py) now follows the same rollout policy:
  - `auto`
  - `webtransport`
  - `websocket`
  - `http`
- The Python SDK now uses `aioquic` for a real WebTransport send path and transport-aware `watch_thread(...)` behavior, while still falling back cleanly to WebSocket and HTTP when QUIC is unavailable.
- Python local-dev WebTransport now has explicit env controls for:
  - `OMNYID_WEBTRANSPORT_URL`
  - `OMNYID_WEBTRANSPORT_CA_CERTS`
  - `OMNYID_WEBTRANSPORT_INSECURE`

## Still Remaining In Phase 6

- publish-ready packaging and release workflow automation
- richer attachment helpers and attachment examples
- versioned API compatibility notes across Rust, Python, and TypeScript
- additional example apps for notes, actions, and discovery-on-send

## Validation So Far

- `cargo test --lib` passes with 43 tests
- `npm run typecheck` passes in `typescript-sdk`

## Notes

Phase 6 is still open, but the public SDK story is now much closer to the intended Omnyid developer experience: one shared thread model, secure defaults, and minimal-code actions.
