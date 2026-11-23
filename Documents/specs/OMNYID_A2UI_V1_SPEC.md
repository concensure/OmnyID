# OmnyID A2UI v1 Specification

## Purpose

This document defines a formal **A2UI-style** schema for OmnyID that fits the current architecture:

- AFP remains the transport and audit envelope
- `views[]` remains the renderer entrypoint
- `generative_card` remains the streaming task container
- `a2ui.v1` becomes the declarative UI schema for screens, panels, and components

The goal is to improve:

1. UI rendering efficiency and performance
2. UX clarity and consistency
3. engaging, structured agent output
4. token efficiency by replacing verbose presentational prose with compact typed UI payloads

This spec is intentionally additive. It does **not** require replacing the existing renderer system.

---

## Current State

OmnyID already has an A2UI-like architecture:

- agents emit AFP messages with `views[].format`
- the frontend dispatches by `views[].format` in `solid-ui/src/components/ViewDispatcher.tsx`
- `generative_card` + `card_section_update` already provides streaming structured task UI
- `ui_blueprint` already provides a safe allowlisted structured renderer

What is missing is a **formal, versioned, typed UI schema**.

---

## Design Principles

### 1. AFP-first

All A2UI payloads travel inside AFP messages:

- AFP message = transport, identity, thread, signatures, encryption, audit
- `views[]` = rendering attachment point
- `a2ui.v1` = typed UI content

### 2. Declarative only

Agents must not emit:

- raw HTML
- JavaScript
- CSS
- arbitrary frontend code

Agents emit typed nodes and actions. The client maps those to known components.

### 3. Versioned and extensible

Formats must be explicit and future-safe:

- `a2ui.v1`
- `a2ui.patch.v1`

### 4. Stream-friendly

The schema must support incremental updates with stable IDs so the UI can patch live content efficiently.

### 5. Safe action contract

Actions are declarative intents, not code:

- `submit_decision`
- `open_thread`
- `open_url`
- `copy_text`
- `retry_step`
- `request_replan`
- `switch_panel`
- `open_runner_file`

---

## Integration Model

### AFP message integration

Recommended message shape:

```json
{
  "id": "msg_123",
  "thread_id": "thread_123",
  "type": "agent_ui",
  "content": {},
  "views": [
    {
      "format": "a2ui.v1",
      "priority": 100,
      "content": {
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "layout": { "type": "stack", "gap": "md" },
        "nodes": []
      }
    }
  ]
}
```

### Coexistence rules

OmnyID should support these formats together:

- `generative_card`
- `calendar`
- `canvas`
- `table`
- `search_result`
- `task_card`
- `ui_blueprint`
- `a2ui.v1`

Recommended rule:

- use `generative_card` for streaming task lifecycle
- use `a2ui.v1` for structured panels/screens/components
- use existing specialized renderers where already mature

---

## Core Schema

## 1. View Envelope

```json
{
  "schema_version": "a2ui.v1",
  "kind": "panel",
  "meta": {
    "state_id": "card_123",
    "streamable": true,
    "patch_mode": "by_node_id"
  },
  "title": "Execution Summary",
  "description": "Structured output from the agent",
  "layout": {
    "type": "stack",
    "gap": "md"
  },
  "nodes": []
}
```

### Envelope fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `schema_version` | string | yes | must be `a2ui.v1` |
| `kind` | string | yes | `panel`, `screen`, `modal`, `sidebar`, `drawer` |
| `meta.state_id` | string | recommended | stable UI state identity |
| `meta.streamable` | boolean | recommended | whether patches may follow |
| `meta.patch_mode` | string | recommended | currently `by_node_id` |
| `title` | string | no | optional top-level title |
| `description` | string | no | optional secondary text |
| `layout` | object | yes | root layout object |
| `nodes` | array | yes | top-level node list |

---

## 2. Layout Model

Supported root/container layouts in v1:

- `stack`
- `grid`
- `split`
- `tabs`

### Stack

```json
{ "type": "stack", "gap": "md", "align": "stretch" }
```

### Grid

```json
{ "type": "grid", "columns": 2, "gap": "md" }
```

### Split

```json
{ "type": "split", "direction": "horizontal", "ratio": [2, 1] }
```

### Tabs

```json
{
  "type": "tabs",
  "tabs": [
    { "id": "summary", "label": "Summary" },
    { "id": "sources", "label": "Sources" }
  ],
  "default_tab_id": "summary"
}
```

---

## 3. Node Model

Every node must have:

```json
{
  "id": "node_id",
  "type": "callout",
  "props": {}
}
```

### Base fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | string | yes | stable node identity |
| `type` | string | yes | allowlisted node type |
| `props` | object | yes | node payload |
| `children` | array | no | for container nodes |

### v1 allowlisted node types

- `text`
- `markdown`
- `callout`
- `stat`
- `stats_grid`
- `list`
- `table`
- `timeline`
- `decision`
- `code`
- `attachment_list`
- `link_list`
- `constraint_badges`
- `status_badges`
- `thread_preview`
- `runner_file_editor`
- `empty_state`
- `section`

---

## 4. Node Definitions

### `text`

```json
{
  "id": "text_1",
  "type": "text",
  "props": {
    "label": "Summary",
    "value": "The run completed within the expected envelope.",
    "tone": "default"
  }
}
```

### `callout`

```json
{
  "id": "callout_1",
  "type": "callout",
  "props": {
    "tone": "warning",
    "title": "Planner proposal blocked",
    "body": "OmnyID blocked doc_gen because the active replan constraints avoid it."
  }
}
```

Allowed tones:

- `info`
- `success`
- `warning`
- `danger`
- `strategy`

### `stats_grid`

```json
{
  "id": "stats_1",
  "type": "stats_grid",
  "props": {
    "items": [
      { "label": "Runtime", "value": "~4.2s" },
      { "label": "Spend", "value": "$0.0081" },
      { "label": "Tokens", "value": "1,530" }
    ]
  }
}
```

### `table`

```json
{
  "id": "table_1",
  "type": "table",
  "props": {
    "columns": ["Source", "Cost", "Status"],
    "rows": [
      ["Anthropic", "$0.01", "ok"]
    ],
    "caption": "Execution costs"
  }
}
```

### `decision`

```json
{
  "id": "decision_1",
  "type": "decision",
  "props": {
    "decision_id": "dp_123",
    "question": "Proceed with this spend?",
    "category": "confirmation",
    "options": [
      { "id": "confirm", "label": "Proceed", "is_default": true },
      { "id": "cancel", "label": "Cancel" }
    ]
  }
}
```

### `constraint_badges`

```json
{
  "id": "constraints_1",
  "type": "constraint_badges",
  "props": {
    "items": [
      { "kind": "avoid_capability", "label": "web_search" }
    ]
  }
}
```

### `runner_file_editor`

```json
{
  "id": "runner_file_1",
  "type": "runner_file_editor",
  "props": {
    "file_id": "file_123",
    "label": "planner.py",
    "language": "python",
    "editable": true,
    "content_ref": "workspace://runner/file_123"
  }
}
```

This node is intentionally reference-based. Large file contents should not be embedded in every UI payload.

---

## 5. Action Model

Actions are typed intents:

```json
{
  "type": "retry_step",
  "thread_id": "thread_123",
  "step_id": "step_123",
  "mode": "downgraded_path"
}
```

### v1 action types

- `submit_decision`
- `open_thread`
- `open_url`
- `copy_text`
- `retry_step`
- `request_replan`
- `switch_panel`
- `open_runner_file`

Actions may be attached to:

- node props
- buttons in `decision`
- links in `link_list`

---

## 6. Patch Protocol

For streaming updates:

```json
{
  "schema_version": "a2ui.patch.v1",
  "target_state_id": "card_123",
  "ops": [
    {
      "op": "replace_node",
      "node_id": "callout_1",
      "node": {
        "id": "callout_1",
        "type": "callout",
        "props": {
          "tone": "success",
          "title": "Execution completed",
          "body": "The run stayed within the expected envelope."
        }
      }
    }
  ]
}
```

### v1 patch ops

- `append_node`
- `replace_node`
- `remove_node`
- `update_props`
- `insert_after`

Patch operations must target existing `state_id` and stable `node_id` values.

---

## Mapping From Current OmnyID UI

Recommended mapping from current section types:

| Current type | A2UI node candidate |
|---|---|
| `planning_guardrail` | `callout` + `constraint_badges` |
| `reflection_summary` | `callout` or `section` |
| `retry_summary` | `callout` + `stats_grid` |
| `replan_summary` | `callout` + `constraint_badges` + `text` |
| `execution_summary` | `callout` + `stats_grid` + `text` |
| `execution_failure` | `callout` + `text` + `stats_grid` |
| `decision_point` | `decision` |
| `search_result` | `section` + `link_list` |
| `ui_blueprint.stats` | `stats_grid` |
| `ui_blueprint.links` | `link_list` |
| `ui_blueprint.table` | `table` |

---

## Validation Rules

### Backend validation

Before emitting `a2ui.v1`:

- reject unknown node types
- reject unknown action types
- reject missing `id`
- reject nested structures beyond the allowed node/container rules
- reject payloads over size thresholds

### Frontend validation

If a node is invalid:

- render a safe fallback card
- log a structured warning
- do not crash the entire view

---

## Rollout Plan

### Phase 1

Specification only:

- freeze `a2ui.v1` envelope
- freeze node allowlist
- freeze patch op list

### Phase 2

Frontend foundation:

- add `a2ui.v1` to known formats
- implement `A2UIRenderer`
- support a small initial node set:
  - `text`
  - `callout`
  - `stats_grid`
  - `table`
  - `constraint_badges`
  - `decision`

### Phase 3

Backend adoption:

- emit `a2ui.v1` for:
  - `planning_guardrail`
  - `reflection_summary`
  - `retry_summary`
  - `replan_summary`

### Phase 4

Streaming adoption:

- introduce `a2ui.patch.v1`
- let `generative_card` carry or reference A2UI state

### Phase 5

Runner/editor surfaces:

- `runner_file_editor`
- `thread_preview`
- `status_badges`

---

## Recommendation

OmnyID should adopt A2UI as:

- a **formal UI schema**
- carried inside AFP `views[]`
- versioned as `a2ui.v1`
- additive to the current renderer system

This provides the benefits of A2UI without throwing away the current architecture.

The current system is already close. The right move is to standardize it, not replace it.
