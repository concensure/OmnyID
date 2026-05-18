# OmnyID AFP Node Message Specification

## Purpose

This document defines how workflow-runtime nodes should communicate over AFP.

It is designed to:

- integrate with the current OmnyID protocol
- avoid creating a second internal protocol
- keep the top-level message taxonomy broad and stable
- make workflow execution replayable and inspectable

This spec works with:

- [afp.proto](/C:/Users/ozans/Desktop/projects/Agenton/proto/afp.proto)
- [OMNYID_CANONICAL_MESSAGE_SHAPES.md](/C:/Users/ozans/Desktop/projects/Agenton/Documents/specs/OMNYID_CANONICAL_MESSAGE_SHAPES.md)
- [workflows.ts](/C:/Users/ozans/Desktop/projects/Agenton/typescript-sdk/src/workflows.ts)

## Rule

Workflow node traffic should use:

- `type: "agent"`

and express node/runtime nuance through:

- `subtype`
- `content.kind`
- `metadata`

Do not create a flat list of top-level message types like:

- `workflow_node_request`
- `workflow_node_result`
- `workflow_node_replan`

Use broad stable `type`, with detailed `subtype`.

## Initial Node Subtypes

Initial workflow node subtypes:

- `plan`
- `workflow_manifest`
- `node_request`
- `node_result`
- `node_progress`
- `decision_request`
- `decision_result`
- `policy_block`
- `replan_request`
- `workflow_summary`
- `snapshot`

## Shared Content Fields

Most node-runtime AFP messages should include:

- `workflow_id`
- `workflow_run_id`
- `node_id`
- `payload`

Recommended metadata fields:

- `parent_node_id`
- `parent_message_id`
- `mask`
- `model_profile`
- `policy_checkpoint`
- `replayable`

Planning and checkpointing guidance:

- `type: "agent", subtype: "plan"` is the canonical structured planning message for master-agent and planner loops
- `type: "agent", subtype: "workflow_summary"` remains the execution-summary and compression-summary message
- `type: "agent", subtype: "snapshot"` is the checkpoint message for compact current-state captures
- `type: "note", subtype: "ledger"` is the shared-memory note primitive and is not an agent-family message

## Canonical Shapes

### Agent Plan

```json
{
  "type": "agent",
  "subtype": "plan",
  "content": {
    "kind": "task_plan",
    "workflow_id": "wf_01",
    "workflow_run_id": "run_01",
    "node_id": "plan_01",
    "objective": "Collect options and produce a ranked recommendation.",
    "plan_id": "plan_01_v2",
    "status": "in_progress",
    "progress": {
      "completed": 1,
      "total": 3,
      "pct": 33
    },
    "todos": [
      {
        "todo_id": "todo_collect",
        "title": "Collect candidate options",
        "status": "done",
        "depends_on": []
      },
      {
        "todo_id": "todo_rank",
        "title": "Rank candidates against constraints",
        "status": "in_progress",
        "depends_on": ["todo_collect"]
      }
    ],
    "next_actions": [
      "Finish ranking",
      "Draft recommendation"
    ],
    "revision": {
      "number": 2,
      "reason": "constraints_refined"
    }
  },
  "metadata": {
    "mask": "private",
    "replayable": true
  }
}
```

### Workflow Manifest

```json
{
  "type": "agent",
  "subtype": "workflow_manifest",
  "content": {
    "kind": "workflow_manifest",
    "workflow_id": "wf_01",
    "workflow_run_id": "run_01",
    "node_id": "plan_01",
    "payload": {
      "entry_node_ids": ["goal_01"],
      "manifest_ids": ["goal_01", "policy_02", "executor_03"]
    }
  },
  "metadata": {
    "mask": "private",
    "replayable": true
  }
}
```

### Node Request

```json
{
  "type": "agent",
  "subtype": "node_request",
  "content": {
    "kind": "workflow_node_request",
    "workflow_id": "wf_01",
    "workflow_run_id": "run_01",
    "node_id": "executor_03",
    "payload": {
      "capability": "web_search",
      "input": {
        "query": "best travel cards"
      }
    }
  },
  "metadata": {
    "parent_node_id": "router_02",
    "mask": "private",
    "model_profile": "cheap_reasoning"
  }
}
```

### Node Progress

```json
{
  "type": "agent",
  "subtype": "node_progress",
  "content": {
    "kind": "workflow_node_progress",
    "workflow_id": "wf_01",
    "workflow_run_id": "run_01",
    "node_id": "executor_03",
    "payload": {
      "status": "streaming",
      "pct": 45,
      "summary": "Search results collected; synthesis pending."
    }
  },
  "metadata": {
    "parent_node_id": "router_02",
    "replayable": true
  }
}
```

### Node Result

```json
{
  "type": "agent",
  "subtype": "node_result",
  "content": {
    "kind": "workflow_node_result",
    "workflow_id": "wf_01",
    "workflow_run_id": "run_01",
    "node_id": "executor_03",
    "payload": {
      "status": "completed",
      "output": {
        "summary": "Top 3 cards compared."
      }
    }
  },
  "metadata": {
    "parent_node_id": "router_02",
    "replayable": true
  }
}
```

### Decision Request

```json
{
  "type": "agent",
  "subtype": "decision_request",
  "content": {
    "kind": "workflow_decision_request",
    "workflow_id": "wf_01",
    "workflow_run_id": "run_01",
    "node_id": "approval_04",
    "payload": {
      "decision_point_id": "approval_gate",
      "title": "Confirm travel booking",
      "options": [
        {"option_id": "confirm", "label": "Proceed"},
        {"option_id": "cancel", "label": "Cancel"}
      ]
    }
  },
  "metadata": {
    "mask": "private",
    "policy_checkpoint": "pre_external_action"
  }
}
```

### Decision Result

```json
{
  "type": "agent",
  "subtype": "decision_result",
  "content": {
    "kind": "workflow_decision_result",
    "workflow_id": "wf_01",
    "workflow_run_id": "run_01",
    "node_id": "approval_04",
    "payload": {
      "decision_point_id": "approval_gate",
      "selected_option_id": "cancel"
    }
  },
  "metadata": {
    "parent_message_id": "msg_prev",
    "replayable": true
  }
}
```

### Policy Block

```json
{
  "type": "agent",
  "subtype": "policy_block",
  "content": {
    "kind": "workflow_policy_block",
    "workflow_id": "wf_01",
    "workflow_run_id": "run_01",
    "node_id": "policy_02",
    "payload": {
      "reason": "public mask forbids outbound action",
      "blocked_capability": "content_publish"
    }
  },
  "metadata": {
    "mask": "public",
    "policy_checkpoint": "pre_tool_call"
  }
}
```

### Snapshot

```json
{
  "type": "agent",
  "subtype": "snapshot",
  "content": {
    "kind": "thread_snapshot",
    "workflow_id": "wf_01",
    "workflow_run_id": "run_01",
    "node_id": "merge_05",
    "snapshot_id": "snap_01",
    "summary": "Three ranked candidates remain after policy filtering.",
    "state": {
      "candidate_count": 3,
      "approval_state": "pending"
    }
  },
  "metadata": {
    "mask": "private",
    "replayable": true,
    "source_thread_id": "thread_research_01"
  }
}
```

## UI Relationship

These node messages do not replace:

- `generative_card`
- `card_section_update`

Instead:

- node-runtime messages are the execution audit and coordination layer
- `generative_card` remains the higher-level user presentation layer

In practice:

- node messages feed observability, replay, and debug views
- the UI can choose to summarize them into a generative card or timeline

## Decision Notes

- Use `snapshot` as a dedicated `agent` subtype instead of overloading `workflow_summary`
- keep `workflow_summary` for workflow-end summaries and thread-compression summaries
- keep `ledger` under the `note` family so shared-memory threads do not blur into agent-runtime events

## Storage Guidance

If a workflow run belongs to an authenticated workspace user:

- store node-runtime messages in tenant-local storage by default

If the message is public/shared infrastructure traffic:

- use shared transport rules from the existing storage boundary spec

See:

- [OMNYID_MESSAGE_STORAGE_BOUNDARY.md](/C:/Users/ozans/Desktop/projects/Agenton/Documents/specs/OMNYID_MESSAGE_STORAGE_BOUNDARY.md)

## First Implementation Rule

The first workflow-builder/runtime implementation should:

1. use these subtypes only
2. keep `type` broad and stable
3. avoid introducing a second event envelope
4. preserve replayability and policy provenance in `metadata`
