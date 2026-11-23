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

- `C:\Users\joes\.claude\plans\elegant-inventing-goose.md`

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

Future integration readiness note:

- after the initial 8 agentic nodes are stable, the workflow builder should be able to connect to common external tools mostly by adding executor adapters rather than changing the graph model
- priority connector families should include:
  - data storage: Google Sheets, Airtable, Notion
  - notifications: Slack, Discord, Telegram
  - sales and CRM: HubSpot, Stripe, Salesforce
  - AI services: OpenAI, Pinecone, Claude
  - development systems: GitHub, Jira, PostgreSQL
- the builder should assume most automation can create the node contracts, auth fields, dry-run behavior, output mapping, and runtime call surfaces
- manual work will still be required per connector for credentials, OAuth or API key setup, tenant-specific field mapping, permission scoping, rate-limit handling, and final production testing
- current execution-inspector work should therefore keep node and edge runtime metadata extensible enough to later show connector name, action, auth state, request outcome, and retry or failure reasons without redesigning the canvas
- the trace contract should explicitly distinguish simulated workflow traces from derived orchestration traces so future live connector traces can slot into the same inspector without a schema reset
- live connector traces should also reserve room for provider request ids, provider status text, and latency so external-tool runs can expose operational evidence instead of only workflow-derived summaries
- live connector traces should be able to carry ordered provider event trails such as auth challenge, retry scheduling, rate-limit handling, and completion so the inspector can explain external execution lifecycles step by step
- deployment and runtime environment should be able to resolve connector defaults like auth mode, route tier, and side-effect policy at run start so dev and prod can diverge without mutating the graph itself
- deployment records should persist explicit per-environment connector overrides in the IR snapshot so runtime traces can explain not just inferred defaults, but the actual deploy-time routing and auth policy chosen for that environment
- the deployment UI should eventually expose override controls at global, connector-family, and per-node scopes so different Slack, GitHub, OpenAI, or storage paths can coexist safely within one deployed workflow
- the canvas and node inspector should reflect whether a tool node is inheriting deployment defaults or running with deployment-wide, family-level, or node-level overrides so connector policy is visible during debugging without opening the deployment panel
- deployment history and rollback UX should compare connector policy snapshots per node so users can understand what changed between deployments before restoring an older environment snapshot
- rollback should use a preview-first confirmation flow that compares the active deployment against the selected target snapshot before applying connector policy restoration
- deployment should also use a preview-first summary that compares the active environment snapshot against the pending override draft so connector-policy changes are reviewable before shipping a new deployment
- deployment records should persist a canonical connector-policy change summary in metadata so deployment history, rollback preview, and future audit views can reuse one stable explanation of what changed
- run history and replay surfaces should reference the persisted deployment-change summary so users can connect execution outcomes back to the exact deployment policy delta that introduced them
- replay initiation should compare the original run deployment against the current active deployment so users can see whether a replay is validating the same policy snapshot or a newer one
- replayed step traces should carry matched-vs-drifted deployment comparison metadata so timeline cards can explain replay context without relying only on run-level summaries
- the run timeline should support deployment-context and replay-drift filtering so users can quickly isolate the steps most affected by a changed deployment policy during replay analysis
- deployment and replay summary surfaces should be able to activate those timeline filters directly so users can jump from run-level context into the relevant execution steps without manually hunting through the timeline
- deployment-change and replay-diff node cards should be able to focus the matching canvas node and narrow the timeline to that node's affected steps so policy drift review stays anchored to a concrete part of the workflow
- deployment history, rollback preview, and replay preview should reuse that same node-focused review flow so every policy-diff surface can drive canvas selection plus filtered timeline investigation consistently
- timeline steps should be able to link back to the exact deployment snapshot they reference so provenance analysis can move from execution traces back into deployment history without losing context
- timeline steps should also surface node-specific connector-policy field deltas from the referenced deployment snapshot so users can see exactly which auth, tier, route, or side-effect fields changed for the executing node
- during run review, the canvas should surface compact node-level policy-delta badges for affected tool nodes so deployment or replay drift is visible on the graph before users open the timeline
- those canvas policy-delta badges should also be interactive so clicking them can jump directly into the matching node-focused timeline review and deployment snapshot context
- edge-level branch review should reuse the same policy-delta navigation so changed or skipped routes can point to the responsible node drift and deployment snapshot directly from the graph
- run detail should summarize node-level and edge-level deployment or replay drift counts up front so users can estimate policy impact before diving into the canvas or timeline
- execution-history run cards and replay previews should expose the same drift counts so users can compare policy impact across runs before opening a specific run detail
- execution history should support drift-aware sorting and filtering so high-impact deployment or replay runs can be surfaced before purely recent ones when users are triaging regressions
- drift triage state should persist across refreshes, including history filter, sort mode, and the last selected run per workflow, so regression review context survives navigation
- deeper drift investigation state should also persist per workflow, including selected branch, timeline filter, focused node, and selected deployment snapshot, so a review session can be restored end-to-end
- drift investigation state should also be URL-addressable so a workflow, run, branch focus, timeline filter, and deployment snapshot can be shared or reopened across browsers without relying only on local storage
- the run review UI should expose an explicit share-link action so users can copy the current investigation state without manually inspecting or editing the browser URL
- recipients of a shared investigation link should see a lightweight banner that confirms the view was restored from shared URL state, so the deep-linked context is immediately understandable
- shared investigations should also offer a one-click reset back to the ordinary workflow view, clearing the imported deep-link context without forcing users to edit the URL or manually unwind each focus state
- shared investigation state should also restore correctly across browser back/forward navigation so URL-backed review links behave like real navigation history instead of only restoring on first page load
- the shared investigation banner should summarize the restored workflow, run, branch, filter, and deployment context so recipients can immediately understand what the link contains before interacting with the canvas or timeline
- sharing should support both a full investigation link and a clean workflow link so users can choose between deep-linked review context and a neutral workflow entry point
- share actions and copy feedback should explicitly explain whether a copied link is clean or preserves the current run-review context, so users do not have to infer the difference from button labels alone
- clean workflow entry points should offer a one-click way to resume the last stored shared investigation for that workflow, so neutral sharing and deep review links stay connected instead of forcing users to manually recover prior context
- stored shared-review resume actions should show when that review context was last captured, so users can judge whether they are reopening a fresh or stale investigation before restoring it
- stored shared-review resume actions should also preview the saved run, filter, focus, and deployment context so users can tell what will be reopened before they trigger the restore
- stored shared-review controls should also let users explicitly clear stale saved investigation context for a workflow, so resume actions remain trustworthy without forcing a full local storage reset
- stored shared-review previews should warn when newer deployments or runs exist than the saved investigation timestamp, so users can spot likely-stale review context before resuming it
- stale stored shared-review warnings should offer a one-click refresh from the current view, so users can update the saved investigation context without needing to recopy a new share link first
- stored shared-review controls should also indicate when the current view already matches the saved investigation context, so refresh actions can collapse into a reassuring up-to-date state instead of always looking required
- stored shared reviews should retain environment and deployment scope and warn when the current workflow context no longer matches that saved scope, so resume actions do not look equally valid across unrelated deployment lineages
- workflows should be able to retain multiple stored shared-review snapshots instead of a single overwrite-only entry, with a compact selector so users can switch which saved investigation they want to preview, resume, refresh, or forget
- multi-snapshot shared-review selectors should use human-readable labels derived from run, deployment, environment, or drift mode instead of generic ordinal names, so multiple saved investigations can be distinguished quickly at a glance
- users should be able to rename and pin especially important stored shared-review snapshots, so a few canonical investigations remain recognizable and easy to keep at the top as new runs accumulate
- shared-review selectors should provide a compact overflow path for older saved investigations beyond the first visible chips, so scaling the saved-review list does not hide useful named or pinned snapshots
- expanded shared-review selectors should support lightweight filtering by label so larger saved-investigation sets remain navigable without relying only on visual scanning
- expanded shared-review selectors should group pinned investigations separately from recent unpinned ones, so canonical review snapshots retain visual priority even when the saved-review list grows
- expanded shared-review selectors should offer a lightweight sort toggle between priority-first grouping and strict recency, so users can switch between preserving canonical context and scanning the newest saved investigations first
- saved-review selector UI state should persist per workflow, including expanded or collapsed mode, selected saved snapshot, filter text, and sort mode, so investigation context survives refreshes alongside the broader drift review state
- shareable investigation URLs should also be able to restore saved-review selector state, including the selected saved snapshot, expanded mode, filter text, and sort mode, so deep-linked review sessions preserve both the active context and the surrounding saved-review workspace
- shared investigation entry points should summarize saved-review workspace state as well as run-review state, so recipients can tell when a link also restored a saved snapshot, expanded selector view, filter text, or alternate saved-review sort mode
- investigation sharing should support both full-workspace links and core-review-only links, so users can choose between sharing the exact saved-review shell or just the underlying run, filter, and focus context
- stored shared-review snapshots should persist which share mode created them, so resume, preview, and selector surfaces can clearly distinguish full workspace snapshots from core-review-only investigation snapshots
- saved-review selectors should support filtering by share mode, with that mode filter participating in persisted and shareable selector state, so larger investigation sets can be narrowed quickly to workspace snapshots or core-review-only snapshots
- saved-review selectors should show lightweight counts for workspace and core snapshots directly on the share-mode filter chips, so users can gauge investigation mix before narrowing the list
- saved-review selector empty states should explain what kind of share action creates workspace versus core snapshots, so mode-specific filters teach users how to populate empty buckets instead of only saying nothing matched
- saved-review chips themselves should surface share mode directly, so workspace and core snapshots remain distinguishable at a glance even before users open preview details or apply mode filters
- saved-review selectors should show a lightweight composition summary for total, pinned, workspace, and core snapshots, so users can understand investigation mix before scanning the individual chips
- saved-review composition summaries should be interactive, so clicking workspace, core, pinned, or total chips can immediately apply the matching selector focus instead of acting as passive counts
- pinned composition focus should behave as a true pinned-only selector filter rather than only a sort bias, so users can narrow the saved-review list to canonical investigations directly from the summary row
- pinned-only focus should offer a one-click escape hatch in the selector toolbar, so users can step back to the broader saved-review workspace without clearing share-mode or text filters
- share-mode focus should also offer a one-click escape hatch in the selector toolbar, so users can clear workspace-only or core-only focus without disturbing pinned-only or text-filter state
- saved-review text filtering should offer its own narrow clear action in the selector toolbar, so users can remove the search term without backing out of pinned-only or share-mode focus
- saved-review selectors should expose a compact active-filter strip for pinned-only, share-mode, and search state, so users can understand and clear the current narrowing from one place instead of spotting separate reset controls
- saved-review active-filter strips should use a stable, priority-aware ordering, so stronger constraints like pinned-only or share-mode focus appear before plain search text and remain easy to scan as the filter model grows
- saved-review active-filter strips should visually differentiate filter types, so pinned-only, share-mode, and search constraints are distinguishable by tone as well as by label order
- saved-review composition summary chips should mirror the same filter-type color language as the active-filter strip, so summary-focus controls and active narrowing state read as parts of one coherent review workspace
- expanded saved-review selectors should include a lightweight, context-sensitive tone legend or helper text, so only the relevant focus tones are explained and the color language stays self-explanatory without unnecessary visual noise
- legend entries for pinned and share-mode tones should be directly actionable when they map cleanly to a saved-review focus, so users can move from explanation to interaction without leaving the selector workspace
- the generic search or general legend entry should become actionable only when a search term is active, so it can serve as a clear-search affordance without pretending to represent a concrete focus target when no search state exists
- saved-review preview panels should also reflect the active selector context, so the selected review summary stays aligned with current pinned, share-mode, search, expansion, and sort narrowing instead of describing the saved snapshot alone
- saved-review preview panels should visually separate selected-review metadata from selector-context metadata, so users can immediately distinguish the saved snapshot itself from the current narrowing applied to the selector workspace
- selector-context chips inside the saved-review preview should be directly actionable, so users can clear expansion, pinned-only, share-mode, search, or sort narrowing without leaving the preview area
- saved-review preview context chips should reuse the same tone language as the selector toolbar and legend, so pinned, share-mode, search, and general selector state remain visually consistent across all review surfaces
- saved-review preview panels should explicitly explain that selector-context chips are clickable clear actions, so the reset behavior is obvious without trial and error
- saved-review toolbar and legend actions should expose descriptive hover text and accessible labels, so every clickable selector-state chip advertises what it will focus or clear before interaction
- saved-review composition summary chips should also expose descriptive focus labels, so top-level saved-review scope changes are as self-explanatory as the toolbar, legend, and preview controls
- saved-review selector empty states should expose direct recovery actions for active search, share-mode, or pinned-only narrowing, so users can recover from over-filtering inline instead of hunting for the right control above
- saved-review selector surfaces should expose a compact reset-all action when multiple narrowing states are active, so heavily filtered review workspaces can be recovered in one click without clearing each constraint separately
- saved-review preview selector-context areas should mirror that reset-all affordance when several narrowing chips are active, so recovery is consistent across toolbar, empty-state, and preview surfaces
- saved-review share-mode and sort controls should expose the same descriptive focus labels as the rest of the selector system, so every filter button communicates its effect consistently before interaction
- saved-review selector chips themselves should expose descriptive open/reopen labels, so choosing a specific saved investigation is as self-explanatory as the filters and reset controls around it
- saved-review selector expand and collapse controls should expose descriptive labels too, so the final navigation affordances in the selector communicate their effect as clearly as the chips and filters around them
- saved-review filter inputs should explicitly describe what fields they match, so the final remaining selector control is as legible and self-explanatory as the rest of the saved-review system
- the node inspector should expose each selected node's compiled runtime manifest contract, so capability boundaries, model assignment, retry behavior, and AFP-aligned binding details are visible without reading backend JSON directly
- the workflow inspector should expose a compact compiled manifest roster and entry-runtime overview, so users can see how the whole graph decomposes into runtime units and capability-bounded contracts without selecting nodes one by one
- the workflow inspector should also expose compiled route topology from the IR, so users can see how manifests connect and where branch labels land in the compiled execution graph without reading backend JSON or backend logs
- the compiled runtime view should also make AFP alignment explicit, so users can distinguish manifests that already map cleanly onto AFP capability or decision boundaries from generic orchestration scaffolds instead of inferring that split from backend implementation details
- the node inspector should mirror that AFP alignment signal at the selected-node level, so users can see a node's likely AFP boundary role and message family mapping directly where they edit the node itself
- the canvas should surface a lightweight compiled AFP readiness badge per node, so users can distinguish capability-boundary nodes from orchestration scaffolds at a glance before opening the inspector
- those canvas AFP readiness badges should be interactive, so clicking one jumps directly into the selected node's compiled runtime contract section instead of leaving AFP readiness as passive canvas decoration
- workflow-level compiled manifest and route rows should drive that same contract-focused inspector state too, so every compiled-runtime surface leads users into the same highlighted node contract view instead of splitting navigation behavior
- eventually, capability-node communication should be guaranteed end-to-end through AFP contracts, so the visual workflow builder, master-agent orchestration layer, runtime messaging, storage, SDK, and cloud runner all standardize node-to-node communication around AFP rather than ad hoc payload shapes

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
- `type: "agent", subtype: "capability_offer"` — used for MCP tool/resource discovery responses

### Tool Calling and External Integration

Do not create a separate protocol for OpenAI function calls, MCP, or A2A.

Bridge all three into AFP via optional metadata fields:

- `metadata.tool_call` — present only when the message initiates an external tool call (OpenAI function, MCP tool, or internal capability)
- `metadata.tool_result` — present only on the result message returned by the executor
- `metadata.store: false` — marks the message as ephemeral; it must be processed but never written to ElectricSQL; enforced server-side by the policy layer

External integration adapter families for `ExecutorNode`:

- `openai_function` — maps OpenAI function calling to `metadata.tool_call` / `metadata.tool_result`
- `mcp` — maps MCP tool/resource discovery to `subtype: "capability_offer"` + `metadata.tool_call` execution
- `a2a` — maps Google A2A agent delegation to `DelegationNode` AFP agent messages; this is agent-to-agent task handoff, not tool invocation, and must not be conflated with MCP

A2A and MCP are distinct:
- MCP = LLM-to-tool: an LLM requests a capability from a server; maps to `ExecutorNode` + `capability_offer`
- A2A = agent-to-agent: an agent delegates a task to another autonomous agent; maps to `DelegationNode` + existing AFP delegation message families

Normal messages (notes, emails, research outputs) must never carry `tool_call` or `tool_result` fields.
Pure tool-call messages should use `type: "agent", subtype: "node_request"` with `metadata.tool_call` set, not a new top-level type.

Token cost savings from tool calling come from the compiler and `ModelBrokerNode` routing `ToolNode` instances with known connector families to direct HTTP executor paths rather than LLM agent paths. The schema alone does not deliver the savings; the compiler must detect connector family and bypass LLM for non-reasoning tool nodes.

### AFP v1 Tool Call Envelope (reference shape)

```json
{
  "protocol": "afp-v1",
  "type": "agent",
  "subtype": "node_request",
  "content": { "kind": "tool_invocation" },
  "metadata": {
    "store": true,
    "tool_call": {
      "call_id": "call_abc123",
      "connector_family": "openai_function",
      "tool_name": "search_web",
      "parameters": { "query": "..." }
    }
  }
}
```

Result message:

```json
{
  "type": "agent",
  "subtype": "node_result",
  "content": {},
  "metadata": {
    "store": false,
    "tool_result": {
      "call_id": "call_abc123",
      "status": "success",
      "data": { ... }
    }
  }
}
```

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
4. define AFP node message contract, including:
   - `metadata.tool_call` and `metadata.tool_result` optional fields for OpenAI function calling and MCP tool execution
   - `metadata.store: false` ephemeral semantics for intermediate tool-call messages
   - `subtype: "capability_offer"` for MCP tool/resource discovery responses
   - A2A delegation message families under `DelegationNode` (distinct from MCP; see section 7)
   - connector family taxonomy: `openai_function`, `mcp`, `a2a`, `internal`
5. freeze a canonical trigger taxonomy that cleanly separates:
   - manual entry
   - time-based triggers
   - event-based triggers
   - delayed continuation
   - hybrid trigger orchestration
6. define typed trigger config contracts for:
   - cron and recurring schedules
   - one-off scheduled runs
   - timezone-aware schedule evaluation
   - external event ingress
   - internal event ingress
   - delayed wake-up and wait-until semantics
   - event-plus-condition-plus-time orchestration
7. extend the workflow IR with trigger descriptors rather than leaving trigger nodes as generic goal-intake placeholders, so deploy and runtime can register and execute schedule, event, and hybrid activation explicitly
8. extend the AFP node message contract with trigger-oriented message families and metadata for:
   - trigger initiation
   - scheduled wake-up
   - delayed continuation
   - event dispatch
   - correlation id
   - causation id
   - workflow run id
   - trigger origin metadata
   - subscription metadata
9. define durable wait and resume semantics that are shared by approval pauses, timer wake-ups, delayed continuation, and future event-driven resume behavior instead of implementing separate pause systems per feature
10. compile shared wait/resume contracts into IR manifests and top-level descriptors so approval gates, timer wake-ups, and hybrid delayed continuation expose one canonical runtime shape before live scheduler and resume services are implemented

### Phase 2: Supervisor Refactor

1. convert current `MasterAgent` into `WorkflowSupervisor`
2. split current responsibilities into hidden runtime nodes
3. keep legacy monolithic fallback during migration
4. add a scheduler and wake-up runtime that can start workflows from schedules and resume workflows from stored future wake-up records
5. add an event ingress and dispatch runtime that can start workflows from:
   - webhook events
   - email ingress
   - file-drop or watcher adapters
   - callback events
   - internal workflow runtime events
6. add durable delayed-continuation execution so a workflow can pause after an event and resume at a future time without losing state
7. add first-class hybrid trigger orchestration in the supervisor and runtime so combinations like schedule-plus-condition, event-then-delay, and event-plus-approval-plus-time are compiled and executed explicitly rather than improvised through ad hoc node hacks
8. keep trigger execution policy-aware, with mask, approval, auth, egress, and budget checks applied before trigger-fired runs are allowed to continue
9. guarantee that capability-node communication for trigger initiation, delayed continuation, and downstream execution moves through AFP contracts end to end rather than ad hoc payload shapes
10. persist workflow wait/resume records per run so approval pauses, timer wake-ups, and future hybrid delayed continuation share one durable backend record model before the live scheduler loop is introduced
11. add a minimal due-wake dispatch processor that turns pending timer or hybrid wait/resume records into AFP `wake_request` dispatch plans and marks them as dispatched before the background scheduler loop is introduced
12. start a background wait/resume poller at server boot that periodically scans tenant wait/resume records, emits AFP wake dispatches for due timer or hybrid entries, and prepares the system for a later full scheduler and resume-execution loop
13. advance due timer or hybrid wait/resume records into persisted run-state transitions so wake processing updates workflow runs and marks those waits as `resumed_pending_execution` instead of stopping at dispatch planning
14. route human approval decisions through the same durable wait/resume model so approval waits mutate workflow runs and wait records through AFP-shaped approval dispatches instead of remaining a separate manual side path
15. continue queued workflow execution after timer wakes or approval resumes by replaying the deployment snapshot from the paused point, so resumed waits drive real downstream status changes instead of stopping at `resumed_pending_execution`
16. whenever resumed execution hits a second approval or timer gate, derive and persist the next wait/resume record from the continued run so multi-pause workflows stay durable across repeated waits instead of only supporting a single pause/resume cycle
17. treat second-pass timer and hybrid waits as first-class resumed run states in both runtime and UI, so repeated delayed continuation is legible and durable beyond approval-only pause loops
18. expose the full persisted wait/resume chain in run detail so operators can review historical waits, active follow-up waits, and resolved resume outcomes directly from the builder instead of only seeing the latest paused status
19. carry wait-chain visibility into run history list and timeline step summaries so operators can spot multi-pause runs before opening a specific run detail — pause/resume badges appear on history rows, the timeline footer line includes pause/resume counts, and wait-resume-dispatch timeline steps render with sky-toned cards and a labeled Wait / resume event callout showing resume family, kind, and wait-resume ID
20. refactor WorkflowsView.tsx, server.rs, and db.rs — extracted WorkflowNodeDraft/WorkflowEdgeDraft/WorkflowGraphDraft types and constants to workflowGraphTypes.ts; extracted 20 pure analysis functions (edgeLine, runEdgeStates, timelineStepNarrative, branchExecutionLogEntries, etc.) to workflowRunAnalysis.ts; extracted 25 pure deployment/AFP helper functions to workflowDeploymentHelpers.ts; replaced local definitions with imports in WorkflowsView.tsx; added 18 domain section comment headers to db.rs and 28 section headers to server.rs; all without moving any Rust code — typecheck, build, and cargo check all pass clean

### Phase 3: Builder Backend

**Milestones recorded (2026-03-31):**
21. AFP tool-call / external integration spec — anchored OpenAI function calling, MCP, and A2A into the AFP contract (Section 7): optional metadata.tool_call / tool_result fields; metadata.store:false ephemeral semantics; connector_family taxonomy (openai_function, mcp, a2a, internal); A2A vs MCP distinction; connector adapter registry spec; token-saving compiler requirement documented in plan
22. Phase 3 missing steps implemented — cargo check passes clean:
23. Phase 4 node detail editor panels — typecheck + build pass clean:
    - **api.ts additions**: `listWorkflowTriggerRegistrations`, `updateWorkflowTriggerRegistrationStatus`, `getWorkflowConnectorAdapters` client functions wired to the three new backend routes
    - **connector adapters loaded on mount**: `onMount` fetches GET /workflows/connector-adapters non-fatally; result stored in `connectorAdapters` signal for future family-description lookup
    - **trigger registrations loaded on workflow load**: `loadWorkflow` fetches GET /workflows/{id}/trigger-registrations non-fatally after loading deployments and runs; stored in `triggerRegistrations` signal
    - **ToolNode panel** (violet): connector_family selector (openai_function/mcp/a2a/internal), MCP server URL + tool name sub-panel (shown when mcp selected), capability_id input, metadata_store checkbox (stores in node.config.metadata_store; defaults true; uncheck marks message ephemeral and saves ElectricSQL write cost)
    - **DelegationNode panel** (cyan): connector_family selector (a2a/internal), target_role input, A2A agent ID + endpoint inputs (shown for a2a), handoff_instruction textarea
    - **TriggerNode panel** (teal): trigger_family selector (manual/schedule/webhook/event/delayed_continuation/hybrid); family-specific sub-panels: schedule (cron expr, description, timezone), webhook (endpoint path, event source), event (trigger_kind, event source, event type), delayed (delay_seconds, resume_condition), hybrid (composition type + guardrail warning); trigger registration status panel shows registered/paused/unhealthy per-node registrations with pause/resume actions wired to updateWorkflowTriggerRegistrationStatus
22. Phase 3 missing steps implemented — cargo check passes clean:
    - **node registry** (`workflow_node_registry_manifest`): static function returning AFP message families, execution_path, model_profile, and retry defaults for all 10 Layer B node kinds; emitted in each compiled IR manifest under `node_registry`
    - **connector adapter registry** (`workflow_connector_adapter_spec`, `workflow_connector_adapter_registry`, `ALLOWED_CONNECTOR_FAMILIES`): static registry mapping openai_function / mcp / a2a / internal to execution path, AFP subtypes, auth modes, bypass_llm_routing flag, metadata_store_default
    - **ToolNode/DelegationNode connector_family validation**: `validate_workflow_graph_json` now errors on unknown connector_family values; warns when a2a is used on a tool node; warns when tool node has neither connector_family nor capability_id
    - **connector_family in IR manifests**: `compile_workflow_graph_to_ir` now emits connector_family, execution_path (direct_http / delegation / llm_agent / …), metadata_store_default in connector_binding; routes tool/mcp/openai_function nodes to direct_http execution path (bypasses LLM, reducing token cost); node_registry manifest appended to each compiled manifest
    - **workflow_trigger_registrations DB table**: new tenant-scoped table with registration_id, idempotency_key (UNIQUE), dedup_hash, registration_status (preview/registered/paused/unhealthy/retired), descriptor_json, retry_count; indexes on deployment + workflow
    - **WorkflowTriggerRegistrationRecord struct** and CRUD: `upsert_workflow_trigger_registration`, `list_workflow_trigger_registrations`, `update_workflow_trigger_registration_status`, `retire_workflow_trigger_registrations_for_deployment`
    - **deploy action trigger registration write**: deploy action now iterates IR activation_descriptors and upserts WorkflowTriggerRegistrationRecord per trigger node; non-fatal (logs warning on error, does not fail the deploy); response now includes trigger_registrations_written count
    - **trigger registrations HTTP routes**: GET /workflows/{id}/trigger-registrations, POST /workflows/{id}/trigger-registrations/{id}/status
    - **connector adapters route**: GET /workflows/connector-adapters returns full adapter registry
    - **legacy agent_triggers reconciliation**: `reconcile_workflow_legacy_triggers` function documents and detects overlaps between legacy agent_triggers (agent_instance_id bound) and new workflow_trigger_registrations (deployment_id bound); surfaces double-firing risk with recommendations

### Phase 3: Builder Backend

1. graph validation service
2. graph compiler
3. node registry
4. workflow save/load/favorite API
5. deployment manifest API
6. extend graph validation so trigger nodes validate:
   - schedule syntax
   - recurrence shape
   - timezone requirements
   - event source configuration
   - hybrid trigger composition
   - delayed continuation constraints
   - trigger policy and safety rules
7. add a workflow trigger registry that stores versioned trigger activation definitions per deployment and environment instead of merely storing graph JSON or legacy trigger rows
8. make deploy and rollback register, update, and tear down workflow triggers for:
   - schedules
   - webhooks
   - event subscriptions
   - pollers
   - delayed wake-up registrations
9. ensure trigger activation is environment-aware, so dev and prod can differ in endpoints, polling adapters, secrets, and routing without mutating the graph itself
10. add trigger idempotency, deduplication, retry, replay protection, and bounded failure handling at the backend registration and dispatch layer — **complete 2026-04-01**: `trigger_replay_nonce()` (SHA-256 of deployment_id+trigger_node_id+activation_id), `trigger_next_retry_at()` (exponential backoff capped at 3600s), replay protection guard in `workflow_run_start_http`, `check_and_claim_replay_nonce()` on `public.trigger_replay_nonces`, `dedup_hash` migrated from `DefaultHasher` to SHA-256 (`src/server.rs`); migration `0028_trigger_hardening.sql` and MIGRATIONS array updated to 28 entries (`src/db.rs`)
11. add trigger observability records that capture:
   - trigger source
   - trigger time
   - trigger payload summary
   - schedule metadata
   - delayed resumption reason
   - hybrid decision chain
   - run initiation trace
   — **complete 2026-04-01**: `TriggerObservabilityRecord` struct in `src/db.rs`; `write_trigger_observation()` and `list_trigger_observations()` DB methods; per-tenant `workflow_trigger_observations` table (bootstrapped in `ensure_tenant_schema()`); observability record written non-fatally in `workflow_run_start_http` for all non-manual trigger kinds
12. explicitly reconcile the legacy `agent_triggers` storage model with the workflow-builder trigger model so there is one canonical activation path instead of parallel storage-only and workflow-only trigger concepts — **complete 2026-04-01**: `list_all_triggers_for_user()` DB method added; `reconcile_workflow_legacy_triggers()` dead_code removed and wired into deploy + rollback responses with `legacy_trigger_reconciliation` field; overlap detection surfaces `potential_double_firing` risks for overlapping cron/event triggers
13. expose compiled trigger registration previews in IR snapshots and deployment metadata so scheduler, ingress, wake-up, and hybrid runtime dependencies are visible before live trigger registration is implemented — **complete** (prior session): `workflow_trigger_registration_preview()` wired into `compile_workflow_graph_to_ir` output and embedded in IR `metadata.trigger_registration_preview` at deploy and rollback time
14. add a connector adapter registry that maps connector families (`openai_function`, `mcp`, `a2a`, `internal`) to executor adapter implementations, auth modes, AFP message shapes, and direct HTTP execution paths — **complete** (prior session): `workflow_connector_adapter_spec()`, `ALLOWED_CONNECTOR_FAMILIES`, `workflow_connector_adapter_registry()`, `GET /workflows/connector-adapters` endpoint; compile path routes `ToolNode` via `connector_family → execution_path` (direct_http for non-internal, llm_agent for internal); `metadata.store:false` enforced in `db.rs`
15. extend graph validation to reject `ToolNode` entries missing a `connector_family` field so the compiler never falls through to untyped execution paths for external tool nodes — **complete 2026-04-01**: `validate_workflow_graph_json` upgraded from warning to hard error for tool nodes missing both `connector_family` and `capability_id`

**Trigger trust boundaries hardening — complete 2026-04-01:**
- `trigger_dispatch_signing_secret(seed, registration_id)` — SHA-256 derived per-registration secret, no DB column required
- `generate_trigger_dispatch_token(seed, registration_id, timestamp_secs)` — HMAC-SHA256 time-bound token for scheduler/webhook callers
- `verify_trigger_dispatch_token(seed, registration_id, token, timestamp_secs, now_secs)` — ±300s window constant-time validation
- `POST /workflows/{id}/trigger-registrations/{registration_id}/dispatch` — trusted dispatch endpoint: validates bearer auth + HMAC token + registration_status="registered" + replay nonce before writing observability record and updating `last_fired_at`
- 11 new unit tests; 339 total tests green (was 328)

### Phase 4: Builder Frontend

**Items 1–10 complete as of 2026-04-01.**

1. add `Workflows` navigation item — **complete** (prior session)
2. create full-screen graph builder page — **complete** (prior session)
3. add generated preset-node canvas — **complete** (prior session)
4. add node detail editor — **complete** (prior session): connector-family selector, `metadata.store` toggle, MCP discovery panel, A2A delegation target panel
5. add deploy/replay/version UI — **complete** (prior session)
6. add dedicated trigger-node editing — **complete** (prior session): cron, once, timezone, webhook, event source, delayed continuation, hybrid composition with runtime warning
7. make trigger families visually distinct on the canvas — **complete 2026-04-01**: canvas node idle `statusClass` now branches on `node.config.trigger_family` when `node.kind === "trigger"` (teal = schedule, sky = event/webhook, violet = hybrid/delayed_continuation, gray = manual); trigger family badge rendered as coloured pill below the kind label for non-manual families — `WorkflowsView.tsx`
8. add edit-time trigger diagnostics — **complete 2026-04-01**: `validationResult()` errors and warnings filtered by `selectedNodeId()` shown inline in the trigger inspector panel before the family selector; rose border for errors, amber for warnings — `WorkflowsView.tsx`
9. expose deploy-time trigger registration state and health in the builder — **complete** (prior session): trigger registration status panel in inspector with registered/paused/unhealthy/retired chips and status update buttons
10. add run-review trigger provenance UX — **complete 2026-04-01**: `triggerFamilyFromKind()` and `triggerProvenanceChipClass()` helpers; family-coloured provenance chip replaces plain gray "trigger {kind}" in run timeline first-step action and in run history cards; tooltip shows family + kind; `listWorkflowTriggerObservations` API function added; `GET /workflows/{id}/trigger-observations` backend endpoint added (`src/server.rs`, `solid-ui/src/lib/api.ts`)

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

**Milestones recorded (2026-04-01):**

1. `CustomNodeManifest` dataclass — full node contract: `node_id`, `capability_id`, `display_name`, `node_kind`, `runtime_kind`, `connector_family`, `execution_path`, `allowed_tools`, `afp_message_families`, `input_schema`, `output_schema`, `system_prompt`, `model_profile`, `retry_policy`, `scope` (temporary/reusable), `dry_run_result` — in `python-sdk/afp/custom_node_builder.py`
2. `CustomNodeRegistry` — in-memory registry with `register`, `get_temporary`, `get_reusable`, `get`, `retire_temporary`, `list_reusable`, `list_temporary`; temporary nodes keyed by `(workflow_id, node_id)`, reusable by `capability_id`
3. `CustomNodeBuilderAgent` — orchestrates proposal → validation → dry-run → register pipeline; `propose_and_register()` returns None on any failure so the caller falls back to legacy orchestration; `propose_only()` for UI preview; dry-run is schema-only for `direct_http`/`delegation` paths and an LLM probe for `llm_agent` paths
4. `_validate_manifest_fields()` — enforces: required fields present; `capability_id` must match `[a-z][a-z0-9_]{1,62}`; `connector_family` ∈ `{internal, openai_function, mcp, a2a}`; `execution_path` ∈ `{llm_agent, direct_http, delegation}`; `node_kind` ∈ allowed set; `system_prompt` ≤ 300 tokens; `retry_policy.max_retries` is non-negative int
5. `_synthetic_input_from_schema()` — generates minimal valid input dict from JSON Schema for dry-run probing
6. AFP node message contract extended in `src/message.rs`: 10 new subtype constants (`workflow_manifest`, `node_request`, `node_result`, `node_progress`, `decision_request`, `decision_result`, `policy_block`, `replan_request`, `workflow_summary`, `capability_offer`); `AfpToolCallMetadata` and `AfpToolResultMetadata` structs; `afp_node_message_families(node_kind)` helper; `metadata_store_flag(metadata_str)` parser
7. `metadata.store: false` enforced server-side in `db.rs` `store_message` and `store_private_message` — early return `Ok(false)` without SQL insert when `metadata_store_flag` returns false; import of `metadata_store_flag` from `message` module
8. 318 total tests green (was 308); 10 new message module unit tests covering AFP families, store flag, and tool call/result serialization
9. `python-sdk/afp/__init__.py` updated to export `CustomNodeBuilderAgent`, `CustomNodeManifest`, `CustomNodeRegistry`, `DryRunResult`, `NodeScope`

### Trigger Execution Dependency Rules

Trigger work must stay dependency ordered.

- do not treat visual trigger chips or UI forms as real trigger support unless the same trigger family is:
  - representable in the graph schema
  - compiled into IR trigger descriptors
  - registered at deploy time
  - executed by runtime
  - observable in run review
- do not treat runtime trigger metadata such as `trigger_kind` on a run record as full trigger support unless that metadata originates from a real scheduler, event dispatcher, delayed wake-up, or hybrid activation path
- do not implement hybrid triggers as UI-only composition before the runtime supports durable state-dependent wake-up and resume semantics
- use AFP for trigger initiation, delayed continuation, internal trigger dispatch, and downstream capability-node communication rather than introducing a separate trigger protocol
- treat the following as foundational and blocking before production-grade trigger UX:
  - canonical trigger taxonomy
  - typed trigger schema
  - AFP trigger message contract
  - durable wait/resume model
  - scheduler and event-dispatch runtime
  - deploy-time trigger registration
- treat the following as additive after the above foundations are in place:
  - human-friendly schedule builders
  - connector-specific trigger adapters
  - richer trigger health panels
  - preset-level trigger templates
- treat the following as hardening and must not be skipped before production claims:
  - idempotency
  - deduplication
  - retry and backoff policy
  - replay protection
  - trigger trust boundaries
  - observability and audit trails

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

- compiled-contract inspector focus should be visibly resettable, so users can return from runtime-contract deep links to ordinary node editing without losing the selected node
- compiled-contract inspector focus should preserve its navigation origin, so canvas AFP badges, compiled manifest rows, and compiled route rows can explain how the user arrived in a deep runtime-contract view
- workflow-level compiled runtime views should highlight the manifest or route that launched the current contract-focus session, so deep-linked runtime inspection stays legible across inspector and workflow-level surfaces
- workflow-level compiled runtime views should let users clear manifest or route emphasis locally, so runtime-contract review can stay focused on the selected node without forcing workflow-level highlight state to persist
- workflow inspector headers should surface a compact AFP-readiness summary from the latest compiled snapshot, so capability-boundary vs scaffold balance is visible before users drill into compiled runtime details
- workflow inspector AFP-readiness summaries should be interactive, so clicking a boundary or scaffold count narrows the compiled runtime roster to the matching AFP contract slice and gives users a direct path back to the full manifest set
- AFP category focus from workflow-level summaries should propagate onto the canvas, so nodes that match the active capability-boundary or scaffold slice are visible directly on the graph instead of only through the compiled manifest roster
- canvas surfaces should expose their own AFP focus summary and clear action, so graph-level AFP slicing remains understandable and resettable without requiring users to look back to the workflow inspector header
- canvas AFP focus summaries should provide direct review actions into the filtered compiled manifest roster and the first matching node contract, so graph-level AFP slicing becomes a true navigation surface instead of a passive overlay
- active AFP category focus should extend to branch edges as well as nodes, so the canvas can show which routes fully connect matching compiled manifests and which only partially intersect the current AFP slice
- canvas AFP focus overlays should summarize route participation counts as well as node counts, so users can quickly see how much of the current branch topology fully or partially belongs to the active AFP slice
- canvas AFP route-count summaries should be actionable, so users can focus the graph on fully matching routes or partial routes while preserving the broader AFP category slice
- canvas AFP route focus should include its own small legend, so users can distinguish full-route focus, partial-route focus, and dimmed nonfocused graph elements without inferring the meaning from opacity changes alone
- canvas AFP route focus should propagate into compiled route topology review, so the workflow inspector highlights the same full-route or partial-route compiled edges instead of leaving route focus as a graph-only view state
- compiled route topology focus should be able to select the matching canvas edge as well as the source node, so route-focused inspector review and graph-level branch selection stay synchronized both ways
- compiled route topology rows should expose whether they resolve to a concrete graph edge or only to manifest/source-node context, so users can tell how complete the compiled-to-canvas route linkage currently is
- compiled route topology headers should summarize graph-linked versus manifest-only routes, so users can gauge compiled-to-canvas linkage quality before inspecting individual route rows
- compiled route topology linkage summaries should be actionable, so users can focus only graph-linked or only manifest-only compiled routes without losing the broader AFP route-review context
- compiled route linkage focus should mirror onto canvas edge emphasis as well, so filtering to graph-linked or manifest-only compiled routes in the inspector visibly changes the corresponding edge subset on the graph
- canvas surfaces should include a small linkage-focus legend when compiled route linkage filtering is active, so users can distinguish linkage-based dimming from AFP slice or AFP route-focus dimming at a glance
- canvas review overlays should be unified into a single stacked review rail, so AFP slice controls, AFP route focus, linkage focus, and branch legends read as one coordinated investigation surface instead of several independently positioned floating panels
- canvas review rails should expose a shared header and coordinated reset path, so AFP route focus, linkage focus, and branch review feel like one review workspace instead of adjacent cards with unrelated controls
- canvas review rail mode chips should be actionable, so AFP route focus, linkage focus, and branch-review state can be cleared or reopened directly from the shared rail header instead of only from the individual cards below
- canvas review rails should indicate which active mode is primary when AFP route focus, linkage focus, and branch review overlap, so users can tell what is currently driving the strongest graph emphasis without inferring it from the canvas alone
- canvas review rail primary-focus badges should navigate into the matching compiled route review or branch-edge focus, so the rail not only explains the dominant mode but also serves as the shortest path into its detailed investigation surface
- canvas review rail primary-focus badges should expose an explicit unavailable state when no compiled route or traced branch edge can satisfy the current mode, so the shared rail fails gracefully instead of implying navigation that does not exist
- canvas review rail mode chips should use explicit action language and unavailable states too, so the shared rail communicates whether each chip clears focus, reopens branch review, or has no current destination instead of reading like a passive status strip
- canvas review rail reset controls and subordinate review cards should use the same explicit action language as the shared chips, so the canvas review system reads like one coherent interaction model rather than a mix of “show all,” “reset,” and implicit legend behavior
- compiled manifest and route review surfaces should use the same focus/clear vocabulary as the canvas review rail, so graph-side investigation and inspector-side investigation feel like one continuous review model instead of two adjacent dialects
- compiled manifest and route review surfaces should expose explicit unavailable and recovery states when no graph node or branch edge link exists, so inspector-side review fails as gracefully as the canvas rail instead of relying on disabled controls alone
- compiled runtime inspectors should surface a compact review-health summary for manifests and routes, so users can see overall graph-linked versus inspector-only coverage before scanning individual compiled review rows
- compiled runtime review-health summaries should be actionable, so users can jump directly from aggregate linkage counts into node-linked, inspector-only, graph-linked, or inspector-only subsets instead of treating the health panel as read-only telemetry
- manifest review-health focus should mirror back onto the canvas too, so choosing node-linked versus inspector-only manifests in the compiled inspector makes the corresponding graph subset or zero-match state visually legible on the canvas
- canvas surfaces should include a small manifest-health legend when manifest review-health focus is active, so node-linked emphasis and inspector-only zero-match state are distinguishable from AFP slice and route-linkage review at a glance
- canvas review rails should treat manifest health as a primary focus mode too, so node-linked and inspector-only manifest emphasis participates in the same dominant-mode and shared-navigation logic as AFP route, route linkage, and branch review

## 16. MasterAgent Decompose-and-Spawn Upgrade

The current `MasterOrchestrator` decomposes an objective via LLM and orchestrates pre-registered task types through `ALLOWED_TASK_TYPES`. This is orchestration, not spawning. The supervisor must become able to:

1. **Break down tasks recursively**: Given an arbitrary objective, the supervisor LLM decomposes it into a task graph (not a flat list), identifies which tasks require existing nodes and which require new capabilities, and decides spawning paths before issuing any delegation keys.
2. **Spawn sub-agents by type, not just invoke them**: For each node type in the decomposed plan, the supervisor should dynamically instantiate the correct hidden runtime node (`GoalIntakeNode`, `PlanNode`, `ExecutorNode`, etc.) rather than iterating a fixed task list. This mirrors how NemoClaw kernels spawn sandboxed child processes per task — the supervisor spawns bounded node instances.
3. **Spawn `CustomNodeBuilderAgent` for unknown capabilities**: When `CapabilityRouterNode` identifies a missing capability during planning, the supervisor spawns a `CustomNodeBuilderAgent` inline, validates the result through `PolicyNode` and `ModelBrokerNode`, and registers the new node before continuing the task graph.
4. **Recursive sub-workflow delegation**: For complex sub-tasks that expand into their own multi-step graphs, the supervisor should be able to spawn a child `WorkflowSupervisor` instance scoped to that sub-graph, delegated via its own AFP delegation key, rather than flattening all sub-steps into the parent orchestration loop.
5. **Strict task-graph contract before any spawning**: No delegation key is issued until the full task graph is validated by `PolicyNode` and `ModelBrokerNode`. This is the structural equivalent of NemoClaw's pre-flight capability and budget check before a sandbox is created.

Add the following to Phase 2 (after item 20):

21. replace flat task-list decomposition in `MasterOrchestrator` with a structured task-graph model: each task node carries type, capability, estimated cost, node kind, and dependency edges; supervisor validates the graph through `PolicyNode` before executing any step
22. add a spawner interface to `WorkflowSupervisor` that instantiates hidden runtime nodes by kind (`GoalIntakeNode`, `PlanNode`, `ExecutorNode`, `ReflectionNode`, etc.) rather than dispatching to a single generic executor loop; each spawned node receives its own scoped delegation key and runs concurrently under the semaphore limit
23. add recursive sub-workflow delegation: when `PlanNode` produces a sub-graph with 3 or more nodes, `WorkflowSupervisor` spawns a child supervisor instance scoped to that sub-graph with a child delegation key derived from the parent; child supervisor result is returned as a `node_result` AFP message to the parent
24. add inline `CustomNodeBuilderAgent` invocation to `CapabilityRouterNode`: when the capability registry returns no match, spawn and await `CustomNodeBuilderAgent`, pipe result through `PolicyNode` dry-run validation, and register the node before continuing task graph execution; failure here escalates to `ReflectionNode` for replan or downgrade decision

## 17. Security and Context Hardening — Anchored from NemoClaw Evaluation

All three statements are confirmed true against the current implementation. They are anchored below in dependency order: Statement 2 must be implemented before Statement 1 (the gateway can only enforce a node's allowlist if the delegation key carries the node's policy); Statement 3 is additive and does not block 1 or 2 but should follow them so the context snapshot reflects the already-validated, already-policy-enriched delegation.

### 17.1 Per-Node Capability Dispatch Validation (Statement 2 — implement first)

**Confirmed gap**: `MasterOrchestrator.run()` calls `PolicyEngine.can_run(task_type, mask)` against global `ALLOWED_TASK_TYPES` only. The `AgentDelegation` key is then issued regardless of the specific node's `allowed_capabilities` field. A node configured with `allowed_capabilities: ["read_email_metadata", "summarise"]` can currently receive a delegation for `email_send` if it passes the global check.

**Fix (no schema changes required)**:
- Before calling `generate_delegated_key()`, `MasterOrchestrator` must retrieve the target `WorkflowNodeDraft` from the compiled IR and intersect the requested task type against `node.allowed_capabilities`
- If the requested task is not in `node.allowed_capabilities`, emit an AFP `policy_block` message and escalate to `ReflectionNode`
- The check must happen at delegation time in the orchestrator, not inside the spawned agent
- `AgentDelegation` should carry the resolved `allowed_capabilities` slice so downstream components can verify without re-fetching the node manifest

Add to Phase 2:

25. add per-node capability validation to delegation issuance: before `generate_delegated_key()`, fetch the target node's `allowed_capabilities` from the compiled IR manifest; intersect the requested task type against those capabilities; emit AFP `policy_block` and escalate to `ReflectionNode` if the task falls outside the node's allowed set; attach the resolved `allowed_capabilities` slice to the `AgentDelegation` record so subsequent gateway checks do not need to re-query the manifest

### 17.2 Outbound Allowlist Enforcement at the Gateway (Statement 1 — implement second)

**Confirmed gap**: `rest_adapter.rs` `execute_action()` signs outbound HTTP requests with Ed25519 and gates on `IntegrationCapability.approval_mode`, but performs no per-node URL allowlist check. `WorkflowNodeDraft.policy.outbound_allowlist` exists in the schema but is stored config the agent is trusted to respect — a prompt-injected agent could reach any host that passes `approval_mode`.

**Fix (no AFP schema changes required)**:
- The `AgentDelegation` record (already carrying `allowed_capabilities` from 17.1) should also carry `outbound_allowlist: Vec<String>` extracted from the compiled IR node manifest at delegation time
- In `rest_adapter.rs` `execute_action()`, before any HTTP call, extract the target host from the request URL and check it against `delegation.outbound_allowlist`; if not listed, return a `policy_block` error immediately — no request is made, no Ed25519 signature is computed
- The deny must be structural: the gateway cannot be overridden by agent-generated headers or prompt-injected tool parameters
- For `ToolNode` instances with `connector_family: mcp`, the MCP server endpoint must also be in the allowlist
- For `DelegationNode` A2A entries, the target agent endpoint must be in the allowlist

Add to Phase 2:

26. extend `AgentDelegation` to carry `outbound_allowlist: Vec<String>` populated from the compiled IR node manifest at delegation time (flows naturally from item 25 which already retrieves the node manifest); add an outbound allowlist check to `rest_adapter.rs` `execute_action()` that extracts the target host before any HTTP execution and returns a `policy_block` error if the host is not in the allowlist; the check must precede Ed25519 signing so unauthorized calls do not generate valid signatures; MCP server endpoints and A2A target agent endpoints must also pass this check

### 17.3 Context Pre-loading in the Delegation Payload (Statement 3 — implement third)

**Confirmed gap**: `AgentDelegation` struct carries `scope`, `mask`, `delegated_key_hex`, `expires_at`, `task_id` only. `SubAgentHandle` in the Python SDK posts to `/agent/invoke` with delegation_id as Bearer token and no pre-loaded context. Sub-agents make round-trip callbacks to fetch AFP thread slices, prior step results, and their node's instruction prompts, adding LLM round-trips and latency.

**Fix (additive, no schema break)**:
- Add `context_snapshot: Option<ContextSnapshot>` to `AgentDelegation`
- `ContextSnapshot` should carry: relevant AFP thread slice (trimmed to token budget), prior step results keyed by task_id, the node's `system_prompt` and `instruction_prompt` from the compiled IR manifest, and a `token_budget_remaining` hint for the receiving agent
- The supervisor populates `context_snapshot` at delegation time using the same compiled IR manifest fetch that 17.1 and 17.2 already perform — zero additional round-trips
- Receiving sub-agents should start reasoning from `context_snapshot` and only make AFP callbacks if they need information not covered by the snapshot
- `context_snapshot` is optional: legacy delegations without it continue to work; sub-agents check for presence before deciding whether to fetch context

Add to Phase 2:

27. add `context_snapshot: Option<ContextSnapshot>` to `AgentDelegation`; define `ContextSnapshot` with fields: `afp_thread_slice` (trimmed AFP messages relevant to the current task), `prior_step_results` (map of task_id → node_result content from already-completed steps in the current run), `system_prompt` and `instruction_prompt` (from the compiled IR node manifest, already fetched by item 25), `token_budget_remaining` (advisory hint); populate `context_snapshot` in the supervisor at delegation time using the manifest fetch already performed for capability validation (items 25–26); sub-agents check for `context_snapshot` presence before making AFP thread-fetch callbacks

### 17.4 Dependency Order Summary

```
Item 25 (per-node capability validation)
  → Item 26 (outbound allowlist at gateway)     [depends on delegation carrying node policy from 25]
    → Item 27 (context pre-loading)             [additive; reuses manifest fetch from 25; no hard dep on 26]
```

Items 25, 26, and 27 must be implemented in this order within Phase 2. Items 21–24 (decompose-and-spawn upgrade) are independent of 25–27 and can be developed in parallel, but the spawner interface (item 22) must be available before items 25–27 can be wired into it at full scope.
- compiled runtime snapshot headers should explicitly surface the current primary review driver too, so workflow-level compiled review can state when manifest health, AFP route focus, route linkage, or contract focus is the dominant investigation mode instead of leaving that hierarchy implicit
- compiled runtime snapshot primary-driver callouts should be actionable too, so the workflow-level dominant-mode summary becomes a direct shortcut into the first matching manifest, route, or contract-focus target instead of staying purely descriptive
- compiled runtime snapshot primary-driver callouts should expose explicit unavailable states too, so workflow-level dominant-mode summaries fail gracefully when no matching manifest or route target exists instead of implying a dead-end shortcut
- dominant-mode unavailable messaging should be unified across the canvas rail and compiled snapshot, so missing manifest, route, or branch targets use the same recovery language instead of drifting into slightly different explanations on each surface
- dominant-mode success messaging should be unified across the canvas rail and compiled snapshot too, so available manifest, route, branch, and contract-focus shortcuts use the same action language instead of mixing “jump,” “open,” and “reopen” phrasing
- subordinate review controls should use the same shared open/clear/unavailable message helpers as the dominant-mode callouts, so secondary chips and reset buttons do not drift back into one-off interaction wording
- row-level manifest and route review actions should use the same shared open/unavailable/recovery language too, so compiled roster entries do not become the last place where interaction wording drifts away from the rest of the review system
- row-level manifest and route linkage badges and helper captions should use the same review-availability vocabulary too, so compiled inspector status cues read as actionable review context instead of passive linkage labels
- canvas node chips and review-rail focus legends should use that same review-availability vocabulary too, so graph-side AFP, linkage, and route-focus cues do not drift back into passive status wording
- compiled review-health chips and primary-driver labels should use that same review-availability vocabulary too, so top-level inspector summaries match the graph, rail, and row-level review language instead of reverting to older linkage terms
- helper paragraphs, empty states, and filter titles should use that same review-availability vocabulary too, so non-interactive compiled-review copy does not drift back into low-level linkage wording after the controls have been unified
- the workflow inspector should expose AFP contract-gap focus as well as AFP boundary counts, so users can isolate generic boundaries, missing memory scope, missing trace provenance, and orchestration scaffolds before the builder claims stronger AFP end-to-end readiness than the compiled manifests actually support
- the workflow inspector and node contract view should expose likely master-agent orchestration units versus delegated bounded sub-agent units, so users can see how the compiled runtime decomposes supervision, delegated capability work, delegated decisions, and workflow-summary handoff instead of treating every manifest as the same kind of agentic runtime
- the workflow-level master-agent decomposition summary should be actionable and propagate onto the canvas, so users can focus supervisor orchestration units versus delegated capability, decision, or summary units the same way they already focus AFP boundaries and contract gaps
- orchestration-role focus should join the canvas review rail with its own summary, primary-mode behavior, and reset path, so master-agent decomposition is as legible and navigable on the graph as manifest health, AFP route focus, and route linkage review
- orchestration-role focus should propagate into compiled route topology too, so users can inspect which routes connect supervisor-owned orchestration units versus delegated capability, delegated decision, or workflow-summary units instead of only seeing the node slice in isolation
- compiled route endpoint role chips should be actionable too, so users can pivot directly from a supervisor-owned or delegated endpoint label into the matching orchestration-role focus instead of treating route decomposition as read-only annotation
- compiled route topology should expose aggregate route counts per orchestration role too, so users can see how many routes currently touch supervisor orchestration versus delegated capability, delegated decision, or workflow-summary units before drilling into individual route rows
- orchestration-role route-count chips should be actionable too, so users can focus the compiled route topology directly on supervisor-owned versus delegated routes instead of treating those summary counts as passive telemetry
- orchestration-role focus should summarize route participation in the canvas review rail too, so users can see branch-review-ready versus inspector-only routes for the active supervisor/delegated slice without leaving the graph
- orchestration-role route participation in the canvas review rail should be actionable too, so users can pivot directly into branch-review-ready versus inspector-only route focus for the active role without leaving the graph
- compiled route topology should summarize overlapping orchestration-role and route-linkage focus too, so combined supervisor/delegated plus branch-review-ready or inspector-only review state is equally legible in the inspector and on the canvas
- combined orchestration-role and route-linkage summary chips in compiled route topology should be actionable too, so users can clear route narrowing or return to the broader role slice without losing the active supervisor/delegated focus
- canvas orchestration-role route-summary chips should mirror the same overlap-reset behavior too, so graph-side role review can clear route narrowing or broaden back to the full role slice just like the compiled topology does
- canvas rail and compiled topology should share the same helper copy for overlap-reset guidance too, so “broaden role slice” and “clear route narrowing” read identically across graph and inspector review surfaces
- orchestration-role legends and empty states should share helper copy too, so decomposition guidance, dimmed-state explanations, and role-specific zero states stay consistent across canvas and compiled review surfaces
- orchestration-role action titles should share helper copy too, so decomposition buttons, route-role chips, and route-count controls all use the same focus-review vocabulary across the compiled inspector
- non-role route action titles should share helper copy too, so route-linkage chips, route-filter resets, and route-review entry actions use the same review vocabulary across rail and compiled topology
- the workflow-level AFP readiness card should summarize end-to-end readiness too, so users can see how many manifests are actually AFP-ready, how many still need contract work, and how many compiled handoffs already connect AFP-ready units before drilling into boundary or gap filters
- the workflow-level AFP end-to-end readiness summary should be actionable too, so users can pivot directly into AFP-ready manifest review, AFP-ready handoff review, or contract-work review slices instead of treating those counts as passive telemetry
- AFP end-to-end readiness focus should propagate onto the canvas too, so AFP-ready manifests, AFP-ready handoffs, and contract-work review slices are visible on nodes, routes, and the canvas review rail instead of only inside the compiled inspector
- AFP end-to-end readiness focus should participate in the compiled snapshot's primary review-driver system too, so workflow-level dominant review cues can treat AFP-ready manifests and AFP-ready handoffs as first-class review modes instead of only secondary filters
- master-agent decomposition should surface AFP readiness by orchestration role too, so users can see which supervisor orchestration, delegated capability, delegated decision, and workflow-summary units are already AFP-ready versus still contract-work-heavy without treating orchestration and AFP readiness as separate review systems
- compiled route rows and node runtime contracts should surface the combined orchestration-readiness model too, so users can see which specific handoffs are AFP-ready and which specific supervisor/delegated units are still contract-work-heavy instead of relying only on aggregate role-level readiness counts
- compiled route readiness chips and node contract readiness chips should be actionable too, so detailed handoff and unit views can pivot directly into AFP-ready versus contract-work review slices instead of treating the combined orchestration-readiness labels as passive detail

Do not start by hand-building bespoke product agents first.

Build the reusable foundation first, then package human-friendly presets on top.
