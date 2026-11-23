# OmnyID Document-to-Table and Everyday Automation Plan

Source references:
- `README.md`
- `docs/A2UI_CONTRACT.md`
- `src/server/ingest_routes.rs`
- `src/server/export_routes.rs`
- `src/export.rs`
- `src/planning_tools.md`
- `python-sdk/afp/capabilities/chart_generate.py`
- `runtime-templates/python-runner-chat/runner_chat.py.tpl`
- `solid-ui/src/components/ViewDispatcher.tsx`
- `solid-ui/src/components/renderers/A2UIRenderer.tsx`
- `solid-ui/src/components/renderers/ParsedDocumentRenderer.tsx`

Goal:
Assess whether OmnyID can reliably support practical flows such as:
- extract relevant data from a PDF and export it to Excel
- draw a graph for a weather forecast or similar everyday data
- generalise those flows without breaking the current AFP, A2UI, SolidJS, and runner architecture

Expanded product objective:
Turn OmnyID into a smooth ingest -> process -> digest automation surface for practical consumer and prosumer agent work, where the same architectural lane can support:
- web search and live external data
- user attachments and workspace files
- existing AFP messages and thread context
- adaptive output as A2UI cards, structured datasets, exports, charts, drafts, reminders, and shareable artifacts

Target experience rules:
- every major workflow should reduce to canonical AFP artifacts rather than hidden UI state
- low-confidence outputs must remain reviewable before any expensive or risky downstream action
- export, chart, share, send, and scheduling actions must chain from the same thread artifacts
- mobile use must remain first-class, with review and output cards usable without hover-only affordances

## Consumer Use Case Expansion

The following 20 practical use cases are in scope and should be supported by extending the current architecture rather than introducing a separate product layer:

### Productivity and Work

1. Auto-generate a weekly meal plan based on dietary preferences, budget, and local grocery store deals.
2. Draft and send a personalized email to a client or colleague, using context from past conversations and calendar events.
3. Summarize and highlight key points from a 2-hour meeting recording, with timestamps for important decisions.
4. Create a dynamic to-do list that reprioritizes tasks based on deadlines, importance, and real-time schedule changes.
5. Translate and localize a business presentation into Spanish, French, and Mandarin, including cultural nuances and idioms.

### Travel and Logistics

6. Book a 5-star hotel in Tokyo for a 7-day stay in July, with a refundable rate and a view of Mount Fuji.
7. Find and book a rental car in Barcelona for 3 days, with automatic transmission and under EUR200 total.
8. Plan a 10-day road trip across Australia’s East Coast, including scenic stops, budget estimates, and real-time weather adjustments.
9. Track and rebook a delayed flight to minimize layover time and ensure the cheapest alternative under AUD200.
10. Compare and purchase travel insurance for a family of four, covering medical emergencies and trip cancellations for a 2-week European vacation.

### Finance and Shopping

11. Monitor and alert when a specific stock such as Tesla hits a target price of USD180, with a 1-hour window to act.
12. Negotiate a lower price for a used car listed online, using market data and the seller’s history.
13. Create a personalized budget for a freelancer, categorizing income and expenses and predicting cash flow for the next 6 months.
14. Find and apply discount codes at checkout for a shopping cart across 5 different online stores.
15. Automatically switch utility providers such as electricity or internet to the cheapest available option in the user’s area.

### Health and Wellness

16. Design a 30-day fitness plan tailored to a user’s goals, with daily workout videos and meal suggestions.
17. Schedule and remind for annual health check-ups such as dental and eye exams based on age, gender, and medical history.
18. Analyze sleep data from a smartwatch and recommend adjustments to improve sleep quality.

### Entertainment and Lifestyle

19. Curate a playlist for a road trip, blending genres based on the mood and the preferences of all passengers.
20. Generate a custom short story for a child’s bedtime, featuring their name, favorite animals, and a moral lesson.

## Architectural Grouping For The 20 Use Cases

These use cases cluster cleanly into reusable architecture lanes:

1. Ingest lanes
   - attachment or workspace file ingest
   - web or API search ingest
   - audio or meeting transcript ingest
   - existing AFP message reuse
   - live external data fetch such as weather, prices, schedules, and provider quotes

2. Process lanes
   - parse and normalize into `parsed_document`, `transcript`, or raw external records
   - derive `tabular_dataset`, `document_extract_result`, `chart_spec`, `task`, `calendar`, `email`, or other canonical AFP artifacts
   - run review and confidence gates before irreversible actions
   - preserve provenance, source identity, and tool diagnostics in-thread

3. Digest lanes
   - A2UI cards for review, summaries, plans, dashboards, and charts
   - export artifacts such as CSV, XLSX, PDF, DOCX, presentations, and media
   - outbound action proposals for email, booking, reminders, purchasing, or provider switching
   - share surfaces such as Gmail, Slack, WhatsApp, and download/copy actions

The same lane should be used whether the user is asking for:
- meal planning from grocery deals
- meeting summaries from recordings
- road-trip plans from weather and travel data
- freelancer budgets from uploaded statements
- bedtime stories from prompt context

## Capability Matrix Needed For Those Use Cases

The 20 use cases do not require 20 isolated systems. They require a stable set of reusable capability families:

1. Source connectors and fetchers
   - web search
   - live weather
   - travel inventory and logistics
   - finance and price feeds
   - shopping and offer discovery
   - calendar and email connectors
   - attachment and workspace file resolution

2. Normalizers
   - document-to-text
   - transcript-to-summary
   - source-to-dataset
   - source-to-task list
   - source-to-calendar proposal
   - source-to-email draft

3. Reviewable action surfaces
   - dataset review
   - approval requests
   - booking or purchase approval
   - outbound-send approval
   - chart and export review

4. Output surfaces
   - A2UI chart, table, planning, and digest cards
   - export files
   - share actions
   - in-thread canonical results

## Architecture Guardrails For Expansion

To keep the current design intact while enabling these use cases:

1. Every durable result must land as a typed AFP message.
2. A2UI remains the primary adaptive digest surface.
3. Connectors and external APIs remain replaceable behind normalized capability contracts.
4. Derived relational state remains acceleration only, not the canonical source of truth.
5. High-risk actions such as purchase, booking, switching providers, and external sending must stay approval-gated.
6. Mobile-friendly card interaction is mandatory for review, export, share, and approve flows.

## Search Bar Delivery Rule

These use cases do not need to appear as permanent dedicated frontend screens or buttons.

Preferred delivery pattern:
- the user asks in the unified search bar or command bar
- the backend resolves intent into one of the existing architecture lanes
- the result comes back as canonical AFP messages plus an adaptive preview message
- the search surface renders the answer using existing `ViewDispatcher` and A2UI-compatible cards

This means:
- weather, budgeting, meeting summaries, travel planning, playlist generation, and similar flows should be callable from natural-language search
- dedicated frontend entry points are optional accelerators, not the primary requirement
- any flow that graduates beyond a preview must still land in-thread as durable AFP artifacts when history storage is enabled

Current implementation direction:
- weather forecast questions are handled in the command bar and return canonical `tabular_dataset` plus `chart_spec` artifacts
- budget projection questions are handled in the command bar and return canonical `tabular_dataset` plus `chart_spec` artifacts
- transcript and parsed-document summary questions are handled in the command bar when a thread is in context, and return canonical `content_digest_result` artifacts
- both flows use preview-only artifacts when history storage is off, and durable in-thread AFP messages when it is on

Command-bar context rule:
- artifact digestion flows such as "summarize this meeting" or "digest this document" should use the active thread context from the workspace
- the backend should resolve the latest relevant AFP artifact in that thread rather than guessing across unrelated history

Implementation principle:
Do not bolt on a separate app-specific pipeline. Extend the existing architecture:
- ingestion and persistence remain AFP-message based
- structured outputs remain declarative A2UI views plus AFP messages
- execution happens through first-party capabilities, workflow nodes, and the Python runner
- any relational projection remains disposable acceleration, not canonical truth

## Hybrid Workflow Builder Direction

The workflow builder should support both:
- human-facing semantic nodes for flexibility
- reusable workflow templates for reliability

This should be treated as a hybrid compilation model, not as two separate systems.

### Human-facing semantic nodes

Users should be able to assemble clear outcome-oriented nodes such as:
- `PDF`
- `Spreadsheet`
- `Weather`
- `Chart`
- `Meeting Recording`
- `Digest`
- `Budget`

These are not new runtime primitives. They are human-facing semantic nodes or semantic graph intents layered on top of the existing primitive workflow graph.

### Template suggestion rule

When a user-created graph strongly matches a known reliable workflow family such as:
- `PDF -> Spreadsheet`
- `Weather -> Chart`
- `Meeting Recording -> Digest`
- `Budget -> Chart`

OmnyID should:
- suggest the matching reusable workflow template during validation or graph review
- explain why the template is more reliable
- allow the user to reject the suggestion and keep customizing the graph

The suggestion must remain advisory. It must not invalidate the custom graph or force conversion.

### Compilation rule

The system should keep three distinct layers:
- semantic user-facing nodes
- primitive graph nodes and template bindings
- compiled runtime manifests

That means:
- the user may see and connect `PDF` and `Spreadsheet`
- the backend may compile or map that relationship into extract, review, export, and termination primitives
- the runtime still executes only validated primitive and manifest contracts

### Current implementation track

The current implementation track should proceed in this order:
1. detect semantic workflow families from the graph and suggest matching templates
2. keep the suggestion non-blocking so advanced custom graphs remain valid
3. add first-class reusable templates for the strongest families
4. later expose semantic node starters in the visual builder that compile into those template-backed paths

Current implementation progress:
- validation-time semantic template suggestion is now in place
- semantic starter nodes should now be treated as first-class builder inputs
- accepting or dismissing a template suggestion should persist as graph metadata rather than forcing `template_id`
- template adoption metadata should influence future suggestions without claiming a full template conversion has already happened
- accepting a template suggestion may now scaffold missing support nodes such as extraction, review, or dataset-preparation steps into the current graph while preserving editability
- accepted and scaffolded workflows can now be promoted into reusable saved workflow family assets, and those assets can spawn new workflow instances without a separate registry service
- reusable workflow family assets now carry a lightweight parameter schema so new instances can vary source mode, format, chart style, review mode, horizon, and similar knobs without manual graph editing first
- family-instance parameters are now represented explicitly as `instance_inputs` on the workflow graph and compiled IR rather than living only as already-mutated node config
- downstream digest and export artifacts should inherit `workflow_family_context` so reusable workflow-family provenance survives beyond run-time observability and remains visible on output cards/files
- canonical dataset and chart artifacts should also carry `workflow_family_context`, whether inherited from an upstream artifact or synthesized from a known workflow family such as weather-to-chart or budget-projection
- run history and thread artifact lists should be lineage-filterable by workflow family, reusable family asset, and concrete family instance so users can inspect outputs and pauses by reusable workflow provenance rather than only by thread chronology
- dashboard artifact feeds and search-result answer cards should expose the same lineage, so reusable workflow provenance remains visible even when the user stays in the command bar or the saved-message dashboard instead of drilling into a thread
- saved custom dashboard views should also be able to persist workflow-family, family-asset, and instance filters so users can keep durable lineage-based lenses such as "outputs from this PDF-to-spreadsheet family asset"
- the main dashboard and focused feed surfaces should persist lineage filter presets independently, so users can reopen family-aware dashboard lenses without creating a dedicated custom tab first
- persisted dashboard lineage presets should be promotable into reusable custom views, so a useful family-aware lens can become a first-class saved workspace surface instead of remaining tied to one dashboard feed
- `skill_capsule` should be treated as the execution and safe user-extensible skills layer, so OmnyID can let users define reusable higher-level skills/templates while keeping activation, hooks, permissions, and artifact persistence under a deterministic runtime
- the first `skill_capsule` integration slice should be a backend bridge rather than a bespoke OmnyID skill engine: authenticated homeserver routes should proxy deterministic `classify`, `match`, `compose`, `prepare`, `activate`, `verify`, and artifact-inspection operations into the installed `skill_capsule` runtime so workflow nodes and future UI surfaces can rely on one stable capability family
- workflow compilation and builder semantics should recognize `skill_capsule` as a first-class connector family, so reusable workflow assets and semantic starter nodes can target the deterministic skill runtime through stable manifest contracts instead of ad hoc raw-node config
- workflow run start should execute `skill_capsule` manifests through the shared bridge for supported operations such as `compose`, `prepare`, `activate`, and `verify`, and fold those real runtime outcomes back into workflow timeline entries and run summaries instead of leaving those nodes as purely simulated completions
- `omnymem` should be treated as the backend memory and orchestration-state layer, so long-horizon workflows, handoffs, approvals, and reusable family instances can use tiered, invalidation-aware memory instead of relying on prompt-only recall or ad hoc thread history
- memory-system integrations should be benchmarked against `memory-validity-index` or an equivalent deterministic evaluation path before becoming default orchestration dependencies, so retrieval quality, staleness control, and budget efficiency remain measurable rather than assumed
- the first `omnymem` integration slice should remain read-only and retrieval-first: a homeserver proxy plus agent-dashboard memory tab that exposes tier/harness retrieval, pointer bundles, warnings, and handoff context before OmnyID attempts memory mutation or promotion actions
- workflow run-start enrichment should be the second `omnymem` slice: manifests with memory-aware scopes should receive compact pointer-bundle handoff context during run activation so supervisor/delegation prompts can use retrieval-backed continuity without introducing direct memory writes into the hot path

## Assessment

### What is already in place

1. Document ingest exists and stores a `parsed_document` AFP message
   - `POST /ingest/document` already accepts a document source, selects a parser, and stores a `parsed_document` message in-thread.
   - Evidence: `src/server/ingest_routes.rs:7-10`, `src/server/ingest_routes.rs:235-318`.

2. Spreadsheet export exists at the file-serialization layer
   - The backend can already serialize structured rows into CSV or XLSX.
   - Evidence: `src/export.rs:160-248`, `src/server/export_routes.rs:110-196`.

3. The UI can already render parsed documents and export cards
   - `ViewDispatcher` routes `parsed_document`, `export_request`, and `export_result`.
   - Evidence: `solid-ui/src/components/ViewDispatcher.tsx:66-67`, `solid-ui/src/components/ViewDispatcher.tsx:92-93`, `solid-ui/src/components/ViewDispatcher.tsx:170-188`.

4. The runner already registers native chart and document capabilities
   - The runtime template loads `chart_generate`, `export_document`, `calendar_event`, and `qr_generate`.
   - Evidence: `runtime-templates/python-runner-chat/runner_chat.py.tpl:816-836`.

5. The planning surface already anticipates everyday tools
   - `weather_forecast` is declared as live in the planning registry.
   - `export_to_file` is also declared as live.
   - Evidence: `src/planning_tools.md:39-48`, `src/planning_tools.md:87-95`.

### What is not yet reliable

1. PDF ingest is text extraction, not structured data extraction
   - The current document flow ends at `parsed_document` text.
   - There is no first-class AFP message for extracted rows, fields, schema confidence, or human review.
   - The parsed-document renderer is also presentation-only.
   - Evidence: `src/server/ingest_routes.rs:267-318`, `solid-ui/src/components/renderers/ParsedDocumentRenderer.tsx:19-129`.

2. The ingest route is URL-oriented, not workspace-file or attachment-native
   - `IngestDocumentRequest` requires `source_url`; `source_attachment_id` is optional metadata only.
   - The route does not resolve a stored attachment by id before parsing.
   - This is a reliability issue for normal user PDFs dropped into OmnyID.
   - Evidence: `src/server/ingest_routes.rs:13-24`, `src/server/ingest_routes.rs:251-264`.

3. The export route does not actually write the promised `export_result` AFP message
   - The comments say the file is referenced back to an AFP `export_result` message.
   - The implementation returns JSON directly and stops there.
   - That breaks append-only thread consistency and makes downstream automation less robust.
   - Evidence: `src/server/export_routes.rs:116-121` versus `src/server/export_routes.rs:162-195`.

4. The chart path has a contract mismatch
   - The documented and emitted capability shape is `chart_view` with `chart_type` and nested `data`.
   - The current `A2UIRenderer` expects `kind`, `labels`, and `datasets` at the top level.
   - That means a native `chart_generate` result is not a reliable everyday graph path yet.
   - Evidence: `docs/A2UI_CONTRACT.md:90`, `python-sdk/afp/capabilities/chart_generate.py:186-231`, `solid-ui/src/components/renderers/A2UIRenderer.tsx:530-590`.

5. The planning registry says weather is live, but there is no implementation in the inspected codebase
   - I found the tool declaration, but not a concrete executor or service implementation for `weather_forecast`.
   - That means the everyday weather example is architecturally intended, not proven end to end.
   - Evidence: `src/planning_tools.md:39-48`.

## Conclusion

OmnyID is close to supporting these use cases structurally, but it is not yet reliable for them end to end.

Current maturity by use case:
- PDF to text in-thread: partially real
- PDF to validated rows/fields: missing core step
- PDF to Excel export: backend serializer exists, workflow-grade extraction contract is missing
- Everyday charting from structured data: partially real, but blocked by chart contract mismatch
- Weather graph: not production-ready because the weather tool path is only declared, not evidenced as implemented

The main gap is not storage or UI rendering. The main gap is the missing middle layer:
- normalize external input into structured AFP messages
- keep extraction provenance and confidence
- allow lightweight human correction
- then export or visualize from that structured state

## Architecture-Fit Plan

The correct extension is a new structured automation lane inside AFP, not a special-case PDF feature.

### Phase 1 - Lock the canonical message shapes

Add new AFP message types for structured extraction and output planning:
- `document_extract_request`
- `document_extract_result`
- `tabular_dataset`
- `dataset_revision`
- `chart_spec`

Rules:
- `parsed_document` remains the raw extracted text artifact
- `document_extract_result` stores field-level or row-level extraction with provenance
- `tabular_dataset` becomes the canonical structured table used for export and charting
- `dataset_revision` captures human fixes without mutating prior state
- `chart_spec` stores a normalized declarative chart request independent of any one renderer

Required content shape for `document_extract_result`:
- `source_message_id`
- `extraction_mode`: `fields` | `rows` | `hybrid`
- `schema`
- `records`
- `confidence_summary`
- `cell_provenance`
- `warnings`

Required content shape for `tabular_dataset`:
- `dataset_id`
- `title`
- `columns`
- `rows`
- `source_message_ids`
- `quality_status`: `draft` | `reviewed` | `approved`

Dependency:
- none

### Phase 2 - Make document ingest attachment-native

Extend ingest so normal user files can flow through the same pipeline without requiring a public URL.

Tasks:
- resolve `source_attachment_id` into a fetchable internal blob before calling external parsers
- support file-drop and workspace-file ingestion paths in addition to raw URLs
- preserve `source_attachment_id`, MIME, filename, and checksum in the resulting AFP metadata
- store parser diagnostics and extraction warnings for QA

Design rule:
- do not expose parser-specific blobs directly to the UI
- convert them into stable AFP artifacts immediately after parse

Suggested file touches:
- `src/server/ingest_routes.rs`
- attachment or file-store helpers already used elsewhere in the server
- `solid-ui/src/lib/api.ts`

Dependency:
- phase 1

### Phase 3 - Introduce a structured extraction capability

Add a first-party extraction capability that consumes `parsed_document` and produces `document_extract_result` plus `tabular_dataset`.

Recommended behavior:
- mode 1: `extract_fields`
- mode 2: `extract_rows`
- mode 3: `extract_table_candidates`

The extractor should:
- accept a schema hint when the user knows the target columns
- support schema inference when no schema is provided
- emit confidence per row and per cell
- emit provenance pointers back to source page or source span when available
- fail closed into `review_required` when confidence is low

Implementation fit:
- capability registration through the Python runner like the existing native capabilities
- orchestration through Master Agent or workflow nodes
- AFP output only; no raw ad hoc JSON side-channel

Suggested file touches:
- new capability under `python-sdk/afp/capabilities/`
- `runtime-templates/python-runner-chat/runner_chat.py.tpl`
- capability descriptors or workflow node registry if those are surfaced in the builder

Dependency:
- phases 1 and 2

### Phase 4 - Add a dataset review surface in A2UI

Before export, users need a fast correction path for low-confidence extraction.

Add A2UI dataset-review components:
- `table` for the editable dataset preview
- `callout` for warnings and confidence
- `constraint_badges` for parse issues
- `diff_view` or a lightweight review card for dataset revisions

Recommended view pattern:
- left: extracted table preview
- top badges: parser, source, confidence, page count
- right or footer actions: `approve`, `edit`, `re-run`, `export_csv`, `export_xlsx`, `chart`

Design rule:
- stay within the existing A2UI contract
- do not add bespoke Solid-only state as the source of truth
- Solid renders the latest AFP state; user edits become `dataset_revision` messages

Suggested file touches:
- `docs/A2UI_CONTRACT.md`
- `solid-ui/src/components/renderers/A2UIRenderer.tsx`
- optionally a dedicated `DatasetReviewRenderer` if the A2UI branch becomes too large

Dependency:
- phase 3

### Phase 5 - Repair the export contract

Bring `POST /export/file` into line with its own contract and AFP design rules.

Tasks:
- require `thread_id` and optional `dataset_message_id` on export requests
- after file creation, write an `export_result` AFP message into the thread
- include filename, format, row count, column count, source dataset id, storage mode, and download metadata
- keep the JSON response for immediate UX, but make the AFP message canonical

This is required for:
- auditability
- replayability
- workflow chaining
- export history in-thread

Suggested file touches:
- `src/server/export_routes.rs`
- `src/message.rs`
- `solid-ui/src/components/renderers/ExportRenderer.tsx`

Dependency:
- phases 1 and 4

### Phase 6 - Normalize charting around one `chart_view` contract

Fix the chart path before adding more chart workflows.

Preferred direction:
- keep the documented `chart_view` contract from `docs/A2UI_CONTRACT.md`
- update `A2UIRenderer` to support:
  - `chart_type`
  - `data.labels`
  - `data.datasets`
  - `options`
- optionally preserve backward compatibility with the current `kind/labels/datasets` shape during migration

Do not change `chart_generate` to match the current renderer, because the capability already matches the documented contract better than the renderer does.

Once fixed, add a thin dataset-to-chart step:
- `tabular_dataset` -> `chart_spec` -> `chart_generate` or direct `a2ui_render`

Suggested file touches:
- `solid-ui/src/components/renderers/A2UIRenderer.tsx`
- `docs/A2UI_CONTRACT.md` if migration notes are needed
- tests for both current and canonical payload shapes

Dependency:
- phase 1

### Phase 7 - Make weather and other everyday data first-class workflow templates

The weather example should be implemented as a reusable general pattern:
- fetch external structured data
- normalize into `tabular_dataset`
- render summary plus chart
- optionally export CSV/XLSX

Tasks:
- implement the currently declared `weather_forecast` tool for real, or mark it stub until real
- add a workflow template: `Forecast -> Dataset -> Chart -> Export`
- add at least one everyday preset:
  - monthly weather outlook
  - weekly spending summary
  - travel ETA comparison

Design rule:
- external data fetch is one capability
- normalization into dataset is a separate capability
- charting and export are downstream consumers of the same dataset

Suggested file touches:
- actual implementation behind `src/planning_tools.md` contracts
- workflow templates and builder metadata
- `solid-ui` workflow cards if the preset is exposed in the UI

Dependency:
- phases 5 and 6

## Critical Path

1. Phase 1: define canonical AFP message shapes for extraction and datasets.
2. Phase 2: support attachment-native document ingest.
3. Phase 3: add structured extraction capability.
4. Phase 4: add dataset review surface.
5. Phase 5: repair export so it writes `export_result` AFP messages.
6. Phase 6: fix `chart_view` contract mismatch.
7. Phase 7: wire weather and other everyday templates onto the same dataset pipeline.

## Detailed Task Document

This section turns the plan into an implementation-grade task ledger.

### Track A - Ingest

1. Add source-type aware ingest request contracts
   - Support `web_url`, `attachment_id`, `afp_message_id`, and `workspace_file`.
   - Keep `source_url` as backward-compatible shorthand for `web_url`.
   - Done when one request model can describe all supported ingest entrypoints without ambiguous optional-field combinations.

2. Resolve attachment and AFP-message backed sources before parser dispatch
   - Attachment ingest must dereference stored blobs using authenticated server-side access.
   - AFP-message ingest must support extracting from message attachments or message body content where appropriate.
   - Done when the parser layer receives one normalized fetchable document payload regardless of source.

3. Persist ingest provenance uniformly
   - Record source kind, source id, original filename, mime type, checksum, parser used, and created message ids.
   - Done when downstream extraction and export messages can point back to original source artifacts without ad hoc metadata.

### Track B - Process

1. Add canonical extraction AFP types
   - Introduce `document_extract_request`, `document_extract_result`, `tabular_dataset`, `dataset_revision`, `chart_spec`.
   - Done when extraction, review, charting, and export no longer overload `parsed_document`.

2. Implement structured extraction capability
   - Input: `source_message_id`, `schema_hint`, `extraction_mode`, `output_mode`.
   - Output: `document_extract_result` and optionally `tabular_dataset`.
   - Done when one capability can convert parsed text into field- or row-oriented structured data with confidence metadata.

3. Add low-confidence review gate
   - Extraction below a threshold must route to review instead of silently exporting.
   - Done when the pipeline can fail safe and preserve trust for receipts, invoices, statements, and schedules.

### Track C - Digest

1. Normalize `chart_view` rendering
   - Accept canonical `chart_type` + `data.labels` + `data.datasets`.
   - Preserve compatibility with the older `kind` + `labels` + `datasets` shape during migration.
   - Done when capability output and UI renderer use the same contract.

2. Add adaptive A2UI card actions
   - Whole-card actions: `copy`, `download`, `share`.
   - Download behavior adapts by content type:
     - table -> CSV
     - chart -> CSV or JSON-safe structured output
     - text/code/callout -> TXT
     - media/file cards -> direct file open/download
   - Done when an A2UI output card is usable as a practical endpoint, not just a display artifact.

3. Add multi-target sharing affordances
   - Support system share where available.
   - Support Gmail and WhatsApp share links directly.
   - Provide a Slack-oriented flow that copies content first and then opens Slack.
   - Done when the card can move output into common everyday channels with minimal friction.

4. Make A2UI digest interactions mobile-safe
   - Hover-only affordances must become always-visible or tap-revealed on narrow/touch layouts.
   - Tables and charts must remain horizontally scrollable without clipping controls.
   - Done when the same card is usable on desktop and mobile without hidden critical actions.

### Track D - Export

1. Repair export persistence
   - `POST /export/file` must emit a canonical `export_result` AFP message in-thread.
   - Done when export history is replayable and attributable.

2. Add dataset-aware export metadata
   - Include source dataset id, row count, column count, file format, storage mode, and downloadable artifact reference.
   - Done when exports are inspectable and auditable from thread history.

3. Add digest-to-export workflow affordances
   - Review cards should expose `export_csv`, `export_xlsx`, and `chart`.
   - Done when the user can move from reviewed dataset to artifact without leaving the thread surface.

### Track E - Everyday Templates

1. Implement the declared weather tool or downgrade its status
   - Do not keep `live` status without a real path.
   - Done when weather forecasting is either implemented or honestly marked as pending.

2. Add one end-to-end everyday template
   - Recommended first template: `Weather forecast -> dataset -> chart -> export`.
   - Done when one non-document everyday flow proves the general pipeline.

3. Add one end-to-end document template
   - Recommended first template: `Receipt/invoice PDF -> extracted line items -> reviewed dataset -> XLSX`.
   - Done when one semi-structured PDF flow proves the document pipeline.

## Delivery Slices

### Slice 1 - Digest Layer Hardening

Scope:
- A2UI hover/tap action strip
- mobile-safe action visibility
- `chart_view` contract normalization
- `media_card` and `error_callout` renderer coverage

Files:
- `solid-ui/src/components/renderers/A2UIRenderer.tsx`
- `docs/A2UI_CONTRACT.md`

Acceptance:
- A2UI cards expose copy/download/share.
- Cards remain usable on mobile.
- Canonical chart payloads render.

### Slice 2 - Export Contract Repair

Scope:
- emit `export_result` AFP messages
- attach dataset-aware metadata

Files:
- `src/server/export_routes.rs`
- `src/message.rs`
- `solid-ui/src/components/renderers/ExportRenderer.tsx`

Acceptance:
- every generated file is represented in-thread by an AFP message
- UI can render export state from thread history alone

### Slice 3 - Source-Normalized Ingest

Scope:
- source-type aware ingest requests
- attachment and AFP-message source resolution

Files:
- `src/server/ingest_routes.rs`
- related storage helpers
- `solid-ui/src/lib/api.ts`

Acceptance:
- ingest no longer assumes only public URLs

### Slice 4 - Structured Extraction

Scope:
- extraction capability
- canonical extraction/result dataset messages
- review threshold routing

Files:
- `python-sdk/afp/capabilities/`
- `runtime-templates/python-runner-chat/runner_chat.py.tpl`
- message/type definitions in Rust if stored server-side

Acceptance:
- parsed documents can become reviewed datasets

## Current Implementation Start

Started now:
- digest-layer implementation in `A2UIRenderer`
- card-level `copy`, `download`, `share` actions
- mobile-friendly action visibility strategy
- canonical `chart_view` payload support in the renderer
- `media_card` and `error_callout` renderer support
- workflow family `instance_inputs` are now part of compiler semantics, not only UI metadata:
  manifest `input_schema` and manifest metadata can now describe per-node family-instance bindings such as weather location, chart type, export format, or review mode
- workflow family `instance_inputs` are now part of runtime behavior as well:
  run enrichment injects resolved instance-input payloads into manifest `runtime_context` and connector `runtime_defaults`, and supervisor task content now carries a compact instance-input summary so execution does not depend on UI-prebaked node config alone
- workflow-family context now also enters the shared node-manifest model:
  `WorkflowNodeManifest` can carry semantic role, family identity, and resolved instance inputs, and both the supervisor and master orchestrator now append that context to delegation prompts so sub-agents can execute with explicit family-instance constraints
- workflow-family context now appears in run observability:
  approval waits, wait/resume descriptors, timeline entries, and run result summaries can carry a compact `workflow_family_context`, and the workflow run review UI now shows that context during approval/review flows so users can see which family-instance contract governed the step

Next recommended implementation target:
- export contract repair, because it is the shortest backend path that materially improves the pipeline after digest actions land

## Risks To Lock Early

- Schema drift risk:
  If `parsed_document`, `document_extract_result`, and `tabular_dataset` are not clearly separated, the system will accumulate one-off payloads that are hard to automate.

- Provenance risk:
  Exported rows without source span or source page references will be hard to trust for invoices, receipts, statements, and other semi-structured PDFs.

- UI ownership risk:
  If extraction review lives only in ad hoc Solid local state, it will break the append-only AFP model and make agent collaboration harder.

- Contract risk:
  The chart mismatch between capability output and renderer input should be fixed before advertising charting as a reliable everyday feature.

- Product honesty risk:
  `weather_forecast` is currently described as live in the planning registry, but I did not find its implementation in the inspected code. Either implement it or downgrade the status.

## Done Criteria

- A dropped or attached PDF can be parsed into `parsed_document`, extracted into a reviewed `tabular_dataset`, and exported to CSV/XLSX from the same thread.
- Every export writes an `export_result` AFP message into thread history.
- `chart_generate` output renders correctly through the canonical `chart_view` path in Solid.
- At least one everyday template, such as monthly weather graphing, works end to end using the same dataset pipeline.
- The full flow stays consistent with AFP append-only history, A2UI declarative rendering, and the existing Python-runner capability model.
