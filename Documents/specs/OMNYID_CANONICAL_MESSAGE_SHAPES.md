# OmnyID Canonical Message Shapes

## Purpose

This note complements `OMNYID_MESSAGE_TAXONOMY_SPEC.md` by showing the preferred
modern wire shapes for the main message families used across OmnyID.

The rule is simple:

- keep `type` broad and stable
- express operational nuance with `subtype`
- use `content.kind` for semantic intent
- use `metadata` for routing and provenance

## Agent

```json
{
  "type": "agent",
  "subtype": "plan",
  "content": {
    "kind": "task_plan",
    "intent": "Organise my week",
    "task_id": "task_123",
    "status": "pending"
  },
  "metadata": {
    "origin": "agent_runtime"
  }
}
```

Other common agent subtypes:

- `provisioned`
- `step`
- `result`
- `research_result`
- `approval_request`
- `approval_granted`
- `approval_rejected`
- `conflict_detected`
- `triage`
- `message`
- `escalation`
- `orchestration_card`
- `dashboard_panel`
- `runner_editor`

## Task

```json
{
  "type": "task",
  "subtype": "status",
  "content": {
    "kind": "task_status",
    "status": "done",
    "result": "hello from AFP!"
  },
  "metadata": {
    "domain": "task_tracking"
  }
}
```

## Research

```json
{
  "type": "research",
  "subtype": "content",
  "content": {
    "kind": "web_research",
    "query": "solid state batteries",
    "summary": "...",
    "sources": []
  },
  "metadata": {
    "origin": "workspace_command_preview",
    "source_count": 4
  }
}
```

Public feed content should prefer:

```json
{
  "type": "research",
  "subtype": "public_article"
}
```

## Email

```json
{
  "type": "email",
  "subtype": "incoming",
  "content": {
    "subject": "Hello",
    "body": "Message body"
  },
  "metadata": {
    "channel": "smtp",
    "transport": "smtp"
  }
}
```

Outbound operational variants:

- `outgoing`
- `reply`
- `forward`

## Action

```json
{
  "type": "action",
  "subtype": "result",
  "content": {
    "capability_id": "cap_stripe_charge",
    "status": "completed",
    "output": {}
  },
  "metadata": {
    "domain": "integration_action",
    "capability_id": "cap_stripe_charge",
    "provider": "stripe",
    "operation": "charge"
  }
}
```

Other common action subtypes:

- `intent`
- `result`
- `approval_decision`

## Note / Page Structure

```json
{
  "type": "note",
  "subtype": "block_update",
  "content": {
    "kind": "page_block",
    "text": "This is a normal human paragraph about taxes."
  },
  "metadata": {
    "domain": "page_structure"
  }
}
```

## Compatibility

Legacy flat message names like `agent_plan`, `task_update`, `email_incoming`,
`action_result_*`, and `public_article` may still exist in stored history.

New writes should prefer the canonical shapes above.
