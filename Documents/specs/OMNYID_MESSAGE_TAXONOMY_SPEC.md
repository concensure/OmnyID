# OmnyID Message Taxonomy

## Summary

AFP message `type` values should stay broad, stable, and easy to reason about.
Do not create a new top-level `type` for every semantic variation.

Use this layering instead:

- `type`: broad protocol category such as `research`, `email`, `note`, `task`, `calendar`, `capability`
- `subtype`: optional finer grouping inside the broad category
- `content.kind`: semantic classifier used by agents and renderers
- `metadata`: optional structured routing or context data that should not explode the top-level taxonomy

This keeps routing logic simple for agents, makes the dashboard easier to filter, and keeps the protocol maintainable over time.

## Recommended Shape

```json
{
  "protocol": "afp-v1",
  "id": "msg_01j8k9xyz789",
  "thread_id": "thread_research_001",
  "from": "agent:researcher@omnyid.com",
  "to": ["agent:student@omnyid.com"],
  "timestamp": "2026-03-27T00:00:00Z",
  "type": "research",
  "subtype": "content",
  "content": {
    "kind": "academic",
    "topic": "solid-state batteries",
    "summary": "...",
    "sources": []
  },
  "metadata": {
    "domain": "material_science",
    "confidence": 0.92,
    "is_citation": false
  },
  "views": [],
  "references": []
}
```

## Design Rules

### 1. Keep `type` small and durable

Good:

- `research`
- `email`
- `note`
- `task`
- `calendar`
- `capability`
- `action`
- `agent`

Avoid:

- `academic_research`
- `material_research`
- `personal_research`
- `research_citation`
- `research_summary`

### 2. Use `subtype` for protocol grouping

Examples:

- `type: "research", subtype: "content"`
- `type: "research", subtype: "citation"`
- `type: "research", subtype: "note"`
- `type: "task", subtype: "status"`
- `type: "email", subtype: "incoming"`
- `type: "email", subtype: "outgoing"`
- `type: "action", subtype: "intent"`
- `type: "action", subtype: "result"`
- `type: "action", subtype: "approval_decision"`
- `type: "agent", subtype: "orchestration_card"`

### 3. Use `content.kind` for semantic interpretation

Examples:

- `content.kind: "academic"`
- `content.kind: "personal"`
- `content.kind: "market_scan"`
- `content.kind: "weekly_digest"`

### 4. Use `metadata` for structured routing context

Examples:

- `metadata.domain`
- `metadata.confidence`
- `metadata.is_citation`
- `metadata.origin`
- `metadata.transport`

`metadata` should be structured and machine-readable. It should not replace the main `content` payload.

## Routing Examples

Academic research summaries:

```text
type == "research" && subtype == "content" && content.kind == "academic"
```

Citation lists:

```text
type == "research" && subtype == "citation"
```

Workspace-generated preview cards:

```text
metadata.origin == "workspace_command_preview"
```

Operational action audit:

```text
type == "action" && subtype == "result" && metadata.capability_id == "cap_stripe_charge"
```

Outbound email requiring approval:

```text
type == "email" && subtype in ["outgoing", "reply", "forward"]
```

## Current Implementation Guidance

- Rust `AFPMessage` supports optional `subtype` and optional message-level `metadata`
- AFP protobuf transport carries `subtype` and `metadata` additively
- Solid workspace `AfpMessage` type supports both fields
- Python SDK `Message` supports both fields and includes them in signing and encryption AAD
- Storage-boundary guidance for tenant-local vs shared message writes is documented in `OMNYID_MESSAGE_STORAGE_BOUNDARY.md`

## Compatibility

Both `subtype` and `metadata` are optional.
Existing AFP messages without these fields remain valid.

Agents and services should:

- preserve them when forwarding or transforming messages
- prefer broad `type` values for new message families
- use `subtype`, `content.kind`, and `metadata` before inventing a new top-level `type`

## Audit Workflow

Use the read-only audit CLI before planning any historical cleanup or backfill:

```bash
cargo run --bin omnyid_taxonomy_audit
```

Useful variants:

- `cargo run --bin omnyid_taxonomy_audit -- --limit 50`
- `cargo run --bin omnyid_taxonomy_audit -- --json`

The command reads from `DATABASE_URL`, reports legacy flat message types still present in
`messages`, shows top canonical `type` + `subtype` counts, and prints suggested mappings
for any stored residue.
