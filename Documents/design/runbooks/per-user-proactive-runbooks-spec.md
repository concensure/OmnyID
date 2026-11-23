# Per-User Proactive Runbooks Specification

Status: Proposed
Task: WED-308
Source brief: `prompts/runbook.md`
Baseline reviewed: `agent/codex/WED-308` at `8bb33709a5b0d289baaae97f93f82f530dd8445f`

## 1. Outcome

OmnyID should turn a small, structured event into a bounded, auditable sequence of useful work without running the full master-agent loop for every recurring situation.

The runbook layer is per user and per homeserver. It does not create a global mutable runtime catalogue, a second event bus, a parallel memory store, or new authority. It reuses the existing proactive event ingestion, Watcher, State Synthesizer, policy/autonomy decisions, approval surfaces, provenance records, outcome memory, AFP ledger, and A2UI projections.

## 2. Core invariants

1. AFP remains the source of truth. Definitions, instances, step traces, escalations, approvals, follow-up events, and outcomes are append-only AFP objects.
2. Replacing a definition or derived state writes a successor with `parent_id` or an explicit `supersedes_id`; it never silently rewrites history.
3. Every read and write is scoped by authenticated owner and the user's private schema. A caller-supplied owner is never trusted.
4. A runbook may narrow authority but never widen it. Effective tools are the intersection of the definition allowlist, connected capabilities, account policy, autonomy policy, and step-specific approval boundary.
5. Deterministic steps run without an LLM. Model calls are allowed only for explicit `classify`, `reason`, or `draft` steps with a schema, evidence references, token ceiling, and cost record.
6. Missing facts create an epistemic escalation. They do not invite the model to guess.
7. External communication, spending, irreversible changes, publication, booking, or policy-required actions use the existing approval system.
8. Follow-up timers are visible AFP events and are cancellable. There are no hidden sleeps or in-memory-only timers.
9. Retrieval is structure-first: kind, subtype, metadata, references, topology, state snapshot, then a bounded evidence packet. Broad history or unbounded RAG is prohibited.
10. UI is a projection. Runbook state is not maintained independently in browser storage.

## 3. Existing components to reuse

| Concern | Existing authority | Runbook integration |
| --- | --- | --- |
| Event ingress | `POST /events/passive` in `src/server/proactive_routes.rs`; Watcher/runtime AFP events | Normalize the stored event into the runbook matcher after persistence. Do not add another public event endpoint in v1. |
| Zero-token matching | `src/proactive_engine.rs` and extended heuristic packs | Reuse condition semantics and source filtering; add typed runbook matching in a small module rather than expanding the heuristic struct into an executor. |
| Watcher | `background_watcher.rs`, `background_watcher_runtime.rs` | Accept Watcher AFP outputs and resolution events as trigger types; preserve source references and cooldown signals. |
| State/evidence | `state_synthesizer.rs`, `state_synthesizer_contract.rs` | Request or reuse a scoped snapshot/handoff; build a compact evidence packet from referenced records only. |
| Strategic surface policy | `proactive_policy.rs` | Apply the same surface/defer/suppress/approval policy to runbook-generated suggestions. |
| Authority | `autonomy_policy.rs` and account capability policy | Cap the runbook's requested autonomy using existing `AutonomyDecision`; a definition cannot grant authority. |
| Approval UI | `server/approval_surfaces.rs` and current DecisionOS projections | Emit the existing approval/action AFP contract with a runbook instance and step reference. |
| Provenance | `proactive_provenance.rs`, `provenance_record.rs` | Use the generic action provenance builder and hash the definition, event, evidence packet, and model output where applicable. |
| Outcome learning | `proactive_outcome_memory.rs`, proactive outcomes | Record a heuristic family such as `runbook:<definition_id>:<step_id>` so acceptance/cooldown logic remains shared. |
| Per-user packs | `user_heuristic_packs`, pack routes | Default runbooks are immutable code templates copied as AFP definitions into each user's ledger; pack enablement may seed them but is not the mutable store. |
| Model resolution and cost | current user inference resolution and token logs | Resolve BYOK/shared inference through the existing ladder and record model, prompt version, tokens, and cost on the step trace. |
| UI | existing proactive, approval, fleet/activity and A2UI resolvers | Add semantic runbook objects and render with existing cards, badges, timelines, and approval components. |

`src/server/proactive_routes.rs` already exceeds the project's preferred file size. New logic must live in focused modules and the route should receive only small calls to the dispatcher and projection handlers.

## 4. AFP contracts

All examples omit standard AFP envelope fields. Public content must not copy secrets or private message bodies.

### 4.1 `runbook_definition`

```json
{
  "runbook_id": "vendor_quote_received",
  "version": 3,
  "name": "Review a new vendor quote",
  "description": "Normalise a quote, expose gaps, and prepare the next decision.",
  "enabled": true,
  "priority": 80,
  "dedupe_group": "vendor_quote_processing",
  "trigger": {
    "event_types": ["wedding_vendor_quote_received"],
    "filters": [{"path": "metadata.wedding_id", "op": "exists"}]
  },
  "steps": [
    {"step_id": "load_quote", "kind": "read", "input_refs": ["event.source_refs"]},
    {"step_id": "normalise", "kind": "tool", "tool": "quotation.normalise"},
    {"step_id": "explain", "kind": "draft", "output_schema": "quote_explanation_v1"},
    {"step_id": "surface", "kind": "emit", "output_kind": "proactive_suggestion"}
  ],
  "tools_allowlist": ["quotation.normalise", "wedding.quote.project"],
  "success_criteria": [{"path": "instance.outputs.normalised_quote_ref", "op": "exists"}],
  "escalate_when": ["missing_wedding_context", "low_extraction_confidence", "policy_denied"],
  "follow_up_events": ["vendor_quote_review_due"],
  "max_autonomy": "draft_only",
  "status": "active",
  "supersedes_id": "runbook_definition:vendor_quote_received:v2"
}
```

### 4.2 `proactive_event`

The existing `passive_event` is the transport-compatible source. The adapter produces or interprets this normalized content without duplicating the source event.

```json
{
  "event_id": "01...",
  "event_type": "wedding_vendor_quote_received",
  "source_refs": ["message:01...", "document:01..."],
  "entity_refs": ["wedding:w_1", "vendor:v_1"],
  "payload_summary": {"document_kind": "venue_quote", "revision": 1},
  "urgency": "normal",
  "confidence": 0.98,
  "occurred_at": "2026-11-01T10:00:00Z",
  "caused_by_event_id": null
}
```

Large bodies, credentials, raw attachments, and decrypted history are excluded.

### 4.3 `runbook_instance`

```json
{
  "instance_id": "01...",
  "runbook_id": "vendor_quote_received",
  "runbook_version": 3,
  "trigger_event_id": "01...",
  "thread_id": "runbook:01...",
  "instance_key": "sha256(owner,event,definition,version)",
  "status": "awaiting_approval",
  "current_step_id": "surface",
  "completed_step_ids": ["load_quote", "normalise", "explain"],
  "next_follow_up_at": null,
  "wait_expires_at": null,
  "definition_ref": "runbook_definition:vendor_quote_received:v3",
  "evidence_packet_ref": "context_packet:01...",
  "latest_trace_ref": "runbook_step_trace:01...",
  "revision": 4
}
```

Allowed status transitions are:

`matched -> running -> waiting_for_input | awaiting_approval | waiting_for_event | completed | failed | cancelled`.

Resuming writes a successor instance revision. A terminal instance cannot return to `running`; retry creates a new instance linked by `retry_of_instance_id`.

### 4.4 `runbook_step_trace`

```json
{
  "trace_id": "01...",
  "instance_id": "01...",
  "step_id": "explain",
  "step_kind": "draft",
  "status": "completed",
  "input_refs": ["normalised_quote:01..."],
  "output_refs": ["draft_artifact:01..."],
  "tool_id": null,
  "model": "gpt-6-luna",
  "prompt_version": "quote_explanation_v1",
  "input_tokens": 820,
  "output_tokens": 240,
  "cost_microunits": 202000,
  "approval_ref": null,
  "provenance_ref": "provenance:01...",
  "started_at": "2026-11-01T10:00:01Z",
  "completed_at": "2026-11-01T10:00:03Z"
}
```

### 4.5 `epistemic_escalation`

```json
{
  "escalation_id": "01...",
  "instance_id": "01...",
  "step_id": "normalise",
  "status": "open",
  "missing_fields": ["wedding_date"],
  "attempted_refs": ["wedding_profile:01...", "quote:01..."],
  "question": "What wedding date should this quote be checked against?",
  "why_needed": "The quote's date and expiry cannot be assessed without it.",
  "answer_schema": {"type": "string", "format": "date"},
  "resume_event_type": "runbook_input_supplied",
  "expires_at": "2026-11-08T10:00:00Z"
}
```

## 5. Deterministic matching and dispatch

Matching is model-free and has a hard input/output bound.

```text
dispatch(owner, stored_event):
  assert stored_event belongs to owner's private ledger
  event = normalize_existing_proactive_event(stored_event)
  definitions = latest_enabled_definition_per_runbook(owner)
  candidates = definitions
    .filter(event_type_matches)
    .filter(all_typed_filters_match)
    .filter(not_expired_or_superseded)
    .sort(priority DESC, filter_specificity DESC, version DESC, runbook_id ASC)

  winners = first candidate in each non-empty dedupe_group
            plus every candidate without a dedupe_group
  winners = winners.take(MAX_RUNBOOKS_PER_EVENT = 5)

  for definition in winners:
    key = sha256(owner_id, event_id, definition_id, version)
    if instance_with_key_exists(owner, key): continue
    thread = new_runbook_thread(owner, definition, event)
    append matched instance and provenance
    enqueue bounded execution(owner, instance_id)
```

Filters support only reviewed operators: `eq`, `in`, `exists`, `gte`, `lte`, `contains_tag`, and `ref_kind`. Unknown fields or operators fail closed. Definitions are size-limited and validated before activation.

## 6. Execution

### 6.1 Step kinds

- `read`: structure-first lookup by typed references and bounded limits.
- `transform`: deterministic local calculation or projection.
- `tool`: existing registered capability with schema-validated arguments.
- `classify`: LLM allowed; structured output only.
- `reason`: LLM allowed; produces a bounded recommendation, not authority.
- `draft`: LLM allowed; always an AFP draft with source refs, cost, approval state, and revision history.
- `emit`: append an allowed AFP output or follow-up event.
- `wait`: append a visible wait condition and resume event type.
- `approval`: use the current DecisionOS approval boundary.
- `complete`: check success criteria and close the instance.

Each step is idempotent on `(owner_id, instance_id, step_id, input_hash)`. A retry returns the recorded trace when inputs are unchanged.

### 6.2 Evidence packet

The packet contains:

- trigger event and its typed source/entity references;
- relevant State Synthesizer fields and confidence;
- at most the runbook-defined number of referenced AFP records;
- explicit missing fields;
- policy/autonomy result;
- stable hashes for provenance.

It must not contain the whole thread history, unrelated wedding history, secrets, or records outside the user's scope.

### 6.3 Authority and approval

```text
effective_tools = definition.tools_allowlist
  INTERSECT connected_capabilities
  INTERSECT account_policy_allowlist
  INTERSECT step_allowlist

effective_autonomy = min(
  definition.max_autonomy,
  per-runbook user override,
  current ProactiveAutonomyTier,
  AutonomyDecision,
  action-specific policy ceiling
)
```

Policy denial creates a trace and either an escalation or a failed instance. It is never converted into an LLM judgment. Approval cards show recipient/target, exact content or mutation, shared information, consequences, provenance, and what remains unchanged.

### 6.4 Follow-up events

A step may emit only an event type listed in `follow_up_events`. The event carries `caused_by_event_id`, `caused_by_instance_id`, due time, cancellation key, and source refs. The existing daemon/watcher scheduler should wake on the AFP due record. Cancelling writes a resolution event; it does not delete the scheduled record.

The instance's optional `wait_expires_at` is distinct from `next_follow_up_at`:
delivery becoming due does not expire the wait. When an expiry is present, it
must follow the delivery time. Timeout resolution uses the expiry deadline and
appends a terminal revision; cancellation and timeout clear both pending times.

## 7. Starter pack copied per user

The code repository may contain immutable templates. First setup copies chosen definitions into the user's ledger, after which their versions and enablement are user-owned.

| Runbook | Trigger | Deterministic work | Human boundary |
| --- | --- | --- | --- |
| `no_reply_followup` | email/vendor thread idle | Check last outbound, reply, reminder, and cooldown | Draft only; approval before send |
| `calendar_conflict` | calendar event created/changed | Detect overlap, travel buffer, and immutable commitments | Ask which event moves; no silent calendar edit |
| `vendor_quote_received` | vendor quote stored | Normalize once, link original, expose inclusions/gaps | Couple approves quote/booking separately |
| `quote_missing_items` | normalized quote incomplete | Compare required categories and prepare questions | Approval before vendor message |
| `budget_threshold` | commitment/forecast changed | Recalculate category and total exposure | Escalate if category target missing; no spend |
| `wedding_task_deadline` | task due window entered | Surface task, owner, dependencies, and next action | Assignment/message uses existing authority |
| `rsvp_non_response` | RSVP reminder due | Verify invite state and reminder permission | Approval before reminder send |
| `runsheet_change` | confirmed timing changed | Project affected people/vendors and version diff | Approval before publishing shared run sheet |
| `email_commitment_due` | extracted commitment due | Verify evidence and prepare completion/follow-up | Ask if evidence is ambiguous |
| `workflow_failure` | workflow failed | Gather run/error refs and safe retry eligibility | Approval for consequential retry |
| `file_requires_review` | import/parser review required | Link file, parser status, and next review action | Never auto-trust quarantined content |
| `info_gap_generic` | explicit required fact missing | Record what was tried and one precise question | Wait for answer; never invent the fact |

## 8. Model recommendation

The runbook engine itself is deterministic and should make zero model calls for matching, filtering, policy, state transitions, waits, approvals, and tool invocation.

For frequent bounded `classify`, `reason`, and `draft` steps, the recommended runtime model is **`gpt-6-luna` at low or medium reasoning**, with cached prompt prefixes and strict structured outputs. Official OpenAI model-selection guidance describes Luna as the efficient choice for scoped tasks, triage, and frequent automations. Use **`gpt-6.1-sol` at medium reasoning** only as a policy-controlled escalation for complex, conflicting evidence or a deliverable that fails Luna acceptance criteria. See [OpenAI model-selection guidance](https://developers.openai.com/api/docs/guides/model-selection).

For implementing this cross-module feature, **`gpt-6.1-sol` at medium reasoning** is the best fit because the work is a complex technical change with coordinated deliverables and regression tests. Model availability must still be resolved through the user's configured inference backend; no model name should bypass BYOK or account policy.

Acceptance evaluation must compare representative runbooks on required facts, schema validity, unsupported claims, tool arguments, latency, review/repair time, and token cost. Keep the lightest model that passes.

## 9. UI and A2UI

- Activity/Fleet projects active instances with status, current step, evidence cue, next follow-up, pause/cancel, and thread link.
- Decision Queue projects existing approval objects and `epistemic_escalation` cards. It does not invent a separate approval component.
- Settings projects the user's latest runbook definitions: enabled, trigger summary, maximum autonomy, tools, version, and outcome trend.
- Definition editing uses typed A2UI controls and preview validation. Raw JSON is an advanced export/debug view only.
- Every action has consequence-specific copy: `Review draft`, `Approve send`, `Answer question`, `Cancel follow-up`, not generic `Run` or `Approve`.
- Mobile cards use one primary action, visible status text plus colour, 44 px targets, and no horizontal scrolling.

## 10. Privacy, security, and failure behaviour

- Definitions contain capability identifiers, never credentials.
- The dispatcher derives owner from authentication or the daemon partition; it does not accept owner from event content.
- Instance queries include owner and private-schema scope on every path.
- Tool arguments are schema validated and reject unknown fields.
- Model prompts receive redacted bounded packets; sensitive fields follow existing decrypt-budget rules.
- Prompt/tool output cannot add tools or follow-up event types.
- A forged event reference, stale definition version, duplicate event, invalid transition, or cross-user reference fails closed and emits a content-light audit record.
- Repeated failures use existing cooldown/outcome memory and stop retrying after the definition's bounded limit.
- Deleting an account removes its private definitions, instances, traces, scheduled events, and projections under the existing account-erasure contract.

## 11. Rollout and observability

Metrics are owner-safe aggregates: matched, started, completed, waiting, escalated, approval accepted/declined, duplicate suppressed, policy denied, tool failed, token/cost, and latency. Logs contain IDs and hashes, not private content.

Rollout order:

1. schema/validator and pure matcher tests;
2. flags-off shadow matching with no instance execution;
3. internal allowlist, deterministic steps only;
4. draft-only LLM steps;
5. approval-gated tools;
6. reversible within-limit actions only after outcome and security criteria pass.

No runbook receives `auto_execute` merely because its acceptance rate is high. Current policy and consequence checks always win.

## 12. Acceptance criteria

- User A definitions and instances can never match, read, or mutate User B records.
- The same event/definition/version produces at most one instance.
- The correct definition wins each dedupe group under stable ordering.
- Missing required facts pause with one precise epistemic escalation.
- An unallowlisted tool or follow-up event is refused before execution.
- Consequential action creates an existing approval card and cannot run before approval.
- A permitted follow-up is an AFP event, visible and cancellable.
- Every model step records source refs, definition/prompt version, model, tokens, cost, output ref, and provenance hash.
- Outcomes feed the existing proactive outcome/cooldown path.
- Active instances and escalations render through A2UI on desktop, 320/375 px mobile, keyboard, and screen reader.
- New files remain under 999 lines, and `proactive_routes.rs` is not materially enlarged.
