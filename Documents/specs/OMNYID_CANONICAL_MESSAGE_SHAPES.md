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
    "plan_id": "plan_123_v1",
    "status": "pending",
    "objective": "Turn a natural-language goal into a structured execution plan.",
    "progress": {
      "completed": 0,
      "total": 3,
      "pct": 0
    },
    "todos": [
      {
        "todo_id": "todo_01",
        "title": "Review calendar constraints",
        "status": "pending",
        "priority": "high",
        "depends_on": [],
        "capability_hint": "calendar"
      },
      {
        "todo_id": "todo_02",
        "title": "Draft deep-work blocks",
        "status": "pending",
        "priority": "normal",
        "depends_on": ["todo_01"],
        "capability_hint": "study_planning"
      }
    ],
    "next_actions": [
      "Inspect calendar state",
      "Propose an initial schedule"
    ],
    "revision": {
      "number": 1,
      "reason": "initial_plan"
    }
  },
  "metadata": {
    "origin": "agent_runtime",
    "plan_scope": "thread",
    "replayable": true
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
- `workflow_summary`
- `snapshot`

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

### Ledger Note

```json
{
  "type": "note",
  "subtype": "ledger",
  "content": {
    "kind": "ledger",
    "title": "Travel Research Ledger",
    "summary": "Persistent shared-memory thread for flights, hotels, and approvals.",
    "entries": [
      {
        "entry_id": "entry_01",
        "label": "Preferred airport",
        "value": "Sydney"
      },
      {
        "entry_id": "entry_02",
        "label": "Budget ceiling",
        "value": "$1800"
      }
    ]
  },
  "metadata": {
    "memory_scope": "shared_thread",
    "append_only": true
  }
}
```

## Snapshot Decision

`snapshot` should be a new `agent` subtype.

Use:

- `type: "agent"`
- `subtype: "snapshot"`

Do not reuse `workflow_summary` for snapshot/checkpoint semantics.

Reason:

- `workflow_summary` is already established for workflow-end and compression-oriented summaries
- `snapshot` is better for checkpointed current state of a long-running thread, project, CRM record, or shared ledger
- separating them keeps lifecycle and query semantics clearer without breaking AFP principles

Preferred snapshot shape:

```json
{
  "type": "agent",
  "subtype": "snapshot",
  "content": {
    "kind": "thread_snapshot",
    "thread_id": "thread_travel_01",
    "snapshot_id": "snap_01",
    "state": {
      "selected_flights": 3,
      "selected_hotels": 2,
      "approval_state": "pending"
    },
    "summary": "Current shortlisted options with approval still pending."
  },
  "metadata": {
    "source_thread_id": "thread_travel_01",
    "window_start_message_id": "msg_101",
    "window_end_message_id": "msg_145",
    "replayable": true
  }
}
```

## Compatibility

Legacy flat message names like `agent_plan`, `task_update`, `email_incoming`,
`action_result_*`, and `public_article` may still exist in stored history.

New writes should prefer the canonical shapes above.
