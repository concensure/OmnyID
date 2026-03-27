# OmnyID Visual Workflow Builder Plan

## Status

This document is a new plan for the visual workflow builder and node-based orchestration system.

It is intentionally designed to sit on top of the existing OmnyID stack:

- AFP remains the inter-node and inter-agent protocol
- the current `MasterAgent` becomes a workflow supervisor over nodes
- the existing generative-card and decision-point UI remains the execution UX
- the existing executor registry remains the capability substrate

This work is a new track.

The current MasterAgent upgrade plan we are already implementing is here:

- `C:\Users\ozans\.claude\plans\elegant-inventing-goose.md`

After the visual workflow builder is implemented, we should return to that plan and continue from the next unfinished phase item there.

## 1. Product Direction

The workflow builder must not start as a collection of bespoke products like:

- Receipt Tracker
- Email Guardian
- Calendar Agent
- Study Planner

Instead, OmnyID should build:

1. hidden runtime nodes with strict capability boundaries
2. composable graph primitives
3. human-friendly preset nodes built on those primitives

This preserves:

- predictability
- replayability
- lower token usage
- clearer model selection
- better policy enforcement
- easier future standalone extraction

## 2. Layered Model

The system should be built in 3 layers.

### Layer A: Hidden Runtime Nodes

These are not the main thing non-technical users drag around.

These are internal agentic runtime nodes used by the supervisor and execution engine. They are AFP-speaking bounded agents.

Start with these 12 hidden runtime nodes:

1. `GoalIntakeNode`
2. `ContextNode`
3. `AmbiguityNode`
4. `PlanNode`
5. `PolicyNode`
6. `ModelBrokerNode`
7. `CapabilityRouterNode`
8. `ExecutorNode`
9. `ReflectionNode`
10. `ApprovalRuntimeNode`
11. `MergeRuntimeNode`
12. `TerminationRuntimeNode`

These nodes split the current black-box `MasterAgent` process into understandable capability-bounded units.

### Layer B: Graph Primitive Nodes

These are the workflow-builder primitives.

They are the stable graph abstraction used by the visual editor, graph compiler, and deploy flow.

Start with these 10 primitive graph nodes:

1. `TriggerNode`
2. `ConditionNode`
3. `TransformNode`
4. `ToolNode`
5. `AgentNode`
6. `DelegationNode`
7. `PolicyNode`
8. `ApprovalNode`
9. `MergeNode`
10. `TerminationNode`

These are the first visual foundation nodes.

Users may eventually edit these directly in an advanced full-screen workflow page, but the default non-technical experience should not begin here.

### Layer C: Human-Friendly Capability Presets

These are the nodes non-technical users should see first.

Start with these 8 preset nodes:

1. `Email Guardian`
2. `Calendar Coordinator`
3. `Receipt Tracker`
4. `Study Planner`
5. `Research Assistant`
6. `Finance Guardian`
7. `Travel Booker`
8. `Content Publisher`

Each preset is a controlled template over primitive graph nodes, not a special runtime.

Example:

- `Research Assistant` may expand to:
  - `AgentNode` for task understanding
  - `PolicyNode` for mask and budget
  - `ToolNode` for search
  - `AgentNode` for synthesis
  - `ConditionNode` for retry or browse escalation
  - `MergeNode` for final answer

## 3. How the Current MasterAgent Should Be Split

The current monolithic loop in `python-sdk/afp/master.py` should be decomposed as follows.

### Existing Responsibilities

Today the `MasterAgent` roughly does:

- understand the objective
- fetch context
- choose a capability
- estimate cost
- choose strategy
- ask clarifications
- ask approvals
- execute
- reflect
- retry or replan
- emit generative UI

### New Responsibility Split

#### `GoalIntakeNode`

Purpose:

- normalize the user objective
- identify requested outcome
- infer task class
- identify likely workflow preset

Maps today to:

- top of `run()`
- intent parsing

#### `ContextNode`

Purpose:

- fetch only the minimal memory, thread, file, and workspace context needed
- produce structured context packet

Benefit:

- reduces token waste
- gives later nodes smaller context windows

#### `AmbiguityNode`

Purpose:

- determine whether the objective is underspecified
- produce structured clarification choices

Maps today to:

- ambiguity detection
- `decision_point` generation

#### `PlanNode`

Purpose:

- build a workflow plan
- choose primitive graph nodes
- estimate node count for free/paid gating

Output:

- `WorkflowGraphDraft`

#### `PolicyNode`

Purpose:

- enforce data mask
- tool access
- egress rules
- output control
- spend limits

Must run:

- at design time
- at compile time
- before every execution edge

#### `ModelBrokerNode`

Purpose:

- assign the cheapest acceptable model to each runtime node
- choose local, hosted, or premium models per subtask

This is where major token and cost savings should come from.

#### `CapabilityRouterNode`

Purpose:

- pick which executor or sub-agent should handle a node
- decide between existing capability vs custom-node generation

#### `ExecutorNode`

Purpose:

- wrap current executor plugins behind stable node contracts

Subfamilies should include:

- web search
- browsing
- file ops
- document generation
- vector memory
- code sandbox
- ecommerce
- integration actions

#### `ReflectionNode`

Purpose:

- reason about failure
- classify retry vs downgrade vs escalate vs replan

Maps today to:

- `_reflect(...)`

#### `ApprovalRuntimeNode`

Purpose:

- turn human gates into durable runtime nodes
- emit AFP `user_decision` / `decision_result` messages

#### `MergeRuntimeNode`

Purpose:

- merge branch outputs
- reconcile partial results
- maintain stable output schema

#### `TerminationRuntimeNode`

Purpose:

- produce final output
- attachments
- structured summary
- deployment-ready result state

## 4. Relationship Between Hidden Runtime Nodes and Graph Primitive Nodes

The hidden runtime nodes are not the same thing as the graph primitive nodes.

The correct mapping is:

- graph primitive nodes are what the compiler understands
- hidden runtime nodes are what the execution engine uses internally

Example mappings:

- `AgentNode` may compile to `GoalIntakeNode`, `PlanNode`, or `ReflectionNode`
- `ToolNode` may compile to a specific `ExecutorNode`
- `ApprovalNode` may compile to `ApprovalRuntimeNode`
- `MergeNode` may compile to `MergeRuntimeNode`

This keeps the visual graph stable while allowing the runtime to stay more expressive and more efficient.

## 5. Free vs Paid Workflow Generation Rules

### Free Tier

The workflow supervisor should fully generate the visual workflow only if:

- the objective can be accomplished in 5 or fewer graph nodes
- and the user has fewer than 3 favorited workflows

If either limit is exceeded:

- still show the partial workflow
- show why the rest is gated
- allow continue-in-chat fallback
- do not silently revert to black-box execution without explanation

### Paid Tier

For paid users:

- no limit on workflow node count
- always generate the full graph when relevant nodes exist
- if a required node does not exist, attempt custom-node synthesis
- if safe custom synthesis is not possible, fall back to current orchestration path with explanation

## 6. Custom Node Generation

Do not let the supervisor invent arbitrary runtime logic inline.

Instead create a bounded custom-node generation path:

1. `CapabilityRouterNode` identifies missing capability
2. `CustomNodeBuilderAgent` proposes new node manifest
3. `PolicyNode` validates allowed tools and mask
4. `ModelBrokerNode` assigns model class
5. node implementation stub is generated
6. dry-run validation occurs
7. node is registered as:
   - temporary for this workflow
   - or reusable in the capability registry

This preserves auditability and keeps “on the fly” generation bounded.

## 7. AFP Contract Between Nodes

Do not create a separate node protocol.

Use AFP for node-to-node traffic.

Preferred message families:

- `type: "agent", subtype: "workflow_manifest"`
- `type: "agent", subtype: "node_request"`
- `type: "agent", subtype: "node_result"`
- `type: "agent", subtype: "node_progress"`
- `type: "agent", subtype: "decision_request"`
- `type: "agent", subtype: "decision_result"`
- `type: "agent", subtype: "policy_block"`
- `type: "agent", subtype: "replan_request"`
- `type: "agent", subtype: "workflow_summary"`

### Example

```json
{
  "type": "agent",
  "subtype": "node_request",
  "content": {
    "kind": "workflow_node_request",
    "workflow_id": "wf_01",
    "workflow_run_id": "run_01",
    "node_id": "research_02",
    "node_type": "ExecutorNode",
    "capability": "web_search",
    "input": {
      "query": "best noise cancelling headphones under 300"
    }
  },
  "metadata": {
    "parent_node_id": "plan_01",
    "mask": "private",
    "model_profile": "cheap_reasoning"
  }
}
```

## 8. Workflow Graph Schema

The visual graph must compile through a strict intermediate representation.

### 8.1 User-Facing Graph

This is what the workflow builder edits.

Core types:

- nodes
- edges
- parameters
- prompts
- policies
- deployment settings

### 8.2 Compiled IR

This is what the runtime executes.

It should include:

- resolved node manifests
- node-level model assignments
- node capability boundaries
- policy checkpoints
- retry strategy
- approval gates
- replay metadata

### 8.3 Rule

Never execute directly from user-edited graph JSON.

Always do:

1. validate graph
2. compile to IR
3. execute IR

## 9. UX Model

### Default UX

Default workflow-builder experience for non-technical users:

- user describes a workflow in natural language
- OmnyID generates human-friendly preset nodes
- user adjusts labels, prompts, parameters, and policies
- user saves the workflow
- user deploys with one click

The user should not need to begin with raw graph primitives.

### Advanced UX

There should be a dedicated full-screen page for workflow inspection and editing.

Recommended new navigation item:

- `Workflows`

Inside this area:

- left panel: third layer agentic nodes organised by category e.g. research assistant node under "Web" category, that user can drag and drop onto the canvas
- center: full-screen drag/drop graph canvas with a toggle to switch between current visual workflow and saved and favorited workflows
- right panel: node properties, prompt editor, policy editor, model/budget info
- bottom or side inspector: execution timeline, replay, and logs

### Node Editing Requirements

Users should be able to:

- add or remove user-facing preset nodes
- inspect the primitive graph behind a preset
- edit prompts for a node
- edit parameters for a node
- edit policy mask and approval behavior
- save as favorite
- clone workflow
- deploy workflow
- open execution history

## 10. Saved Workflows

Add a first-class saved workflow concept.

Each saved workflow should include:

- workflow id
- owner user id
- title
- description
- preset category
- visible graph JSON
- compiled IR snapshot
- prompt versions
- policy bundle
- deployment versions
- favorite flag
- created at / updated at

Free tier rules:

- less than 3 favorited workflows

Paid tier:

- unlimited favorited workflows

## 11. Recommended Build Order

### Phase 1: Runtime Foundations

1. define hidden runtime node manifests
2. define graph primitive schema
3. define workflow IR schema
4. define AFP node message contract

### Phase 2: Supervisor Refactor

1. convert current `MasterAgent` into `WorkflowSupervisor`
2. split current responsibilities into hidden runtime nodes
3. keep legacy monolithic fallback during migration

### Phase 3: Builder Backend

1. graph validation service
2. graph compiler
3. node registry
4. workflow save/load/favorite API
5. deployment manifest API

### Phase 4: Builder Frontend

1. add `Workflows` navigation item
2. create full-screen graph builder page
3. add generated preset-node canvas
4. add node detail editor
5. add deploy/replay/version UI

### Phase 5: Preset Nodes

Start with these 8:

1. Email Guardian
2. Calendar Coordinator
3. Receipt Tracker
4. Study Planner
5. Research Assistant
6. Finance Guardian
7. Travel Booker
8. Content Publisher

Each preset must map to primitive graph nodes and hidden runtime nodes.

### Phase 6: Custom Nodes

1. add `CustomNodeBuilderAgent`
2. add safe temporary-node registry
3. add validation and dry-run gates

## 12. Initial Preset Mapping

### Email Guardian

Likely primitive composition:

- `TriggerNode`
- `PolicyNode`
- `AgentNode`
- `ToolNode`
- `ConditionNode`
- `ApprovalNode`
- `TerminationNode`

### Calendar Coordinator

- `TriggerNode`
- `AgentNode`
- `ConditionNode`
- `ToolNode`
- `MergeNode`
- `ApprovalNode`
- `TerminationNode`

### Receipt Tracker

- `TriggerNode`
- `ToolNode`
- `TransformNode`
- `PolicyNode`
- `MergeNode`
- `TerminationNode`

### Study Planner

- `TriggerNode`
- `ContextNode` equivalent via `AgentNode`
- `TransformNode`
- `ConditionNode`
- `ToolNode`
- `TerminationNode`

### Research Assistant

- `AgentNode`
- `ToolNode`
- `ConditionNode`
- `AgentNode`
- `MergeNode`
- `TerminationNode`

### Finance Guardian

- `TriggerNode`
- `TransformNode`
- `ConditionNode`
- `PolicyNode`
- `ApprovalNode`
- `TerminationNode`

### Travel Booker

- `AgentNode`
- `ToolNode`
- `ConditionNode`
- `MergeNode`
- `ApprovalNode`
- `TerminationNode`

### Content Publisher

- `AgentNode`
- `TransformNode`
- `PolicyNode`
- `ToolNode`
- `ApprovalNode`
- `TerminationNode`

## 13. Integration With Existing OmnyID Project

This plan should integrate with the current repository as follows.

### Reuse

- AFP transport and thread model
- current message taxonomy
- current generative-card UI
- current executor registry
- current policy and approval work
- current tenant-local thread/message storage

### New Modules Expected

- workflow graph schema
- workflow IR compiler
- node registry
- workflow supervisor
- workflow persistence APIs
- workflow builder UI
- preset registry

### Current MasterAgent Transition Rule

Until the node runtime reaches parity:

- the current `MasterAgent` remains available
- the new workflow supervisor can fall back to current behavior
- fallback must be explicit and logged

## 14. Standalone Project Compatibility

This design should also work as a standalone project if separated later.

Standalone shape:

- SolidJS workflow builder frontend
- FastAPI control plane
- Python node runtime
- Postgres + Redis
- AFP bridge for inter-node messaging

In OmnyID-integrated mode:

- OmnyID remains the identity, protocol, and thread-history backbone
- the workflow builder becomes an advanced control plane on top

## 15. Immediate Next Deliverables

Start with:

1. workflow-builder architecture spec
2. graph TypeScript schema
3. workflow IR schema
4. node manifest schema
5. AFP node message subtype spec
6. saved workflow persistence model
7. full-screen `Workflows` page plan
8. preset mapping spec for the initial 8 nodes

Do not start by hand-building bespoke product agents first.

Build the reusable foundation first, then package human-friendly presets on top.
