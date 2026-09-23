# Wedding Planning Template Specification

Date: 2026-09-11

## Purpose

This document defines the Wedding Planning template as an OmnyID-native planning workflow, not a separate wedding application.

The template should let a user ask naturally for wedding help and receive a rich agent response similar to the travel-planning experience: text, images, map/location blocks, timeline cards, budget tables, vendor comparisons, email drafts, checklists, and a continuing chat surface in one smooth response. It should also create a dedicated response workspace where the user can open all files created for that planning response, including research notes, spreadsheets, run sheets, email drafts, vendor shortlists, contracts, moodboards, maps, gift registry drafts, and decision logs.

The commercial aim is to make OmnyID feel like a private wedding operations room that remembers decisions, coordinates people, and turns messy planning into reusable AFP-backed artifacts.

## Product Positioning

The Wedding Planning template is a high-stakes life-event template inside the existing personal agent.

It should use OmnyID's existing strengths:

- AFP messages as the canonical event log.
- Supertags for automatic organization.
- Knowledge Graph topology for dependencies and tradeoffs.
- Calendar events as first-class AFP messages.
- Files and artifact retention for research documents, contracts, spreadsheets, and drafts.
- Email and chat drafting with approval.
- Maps/location context for venues, vendors, travel, guest logistics, and accommodation.
- Task and workflow surfaces for deadline-driven planning.
- Privacy, encryption, and explicit sharing as differentiators.

It should not become a siloed "wedding app." Wedding objects must remain visible through existing OmnyID surfaces: Threads, Files, Calendar, Tasks, Email, Knowledge Graph, Search, Reports, Workflows, and Templates.

## Core User Experience

### 1. Rich Planning Response

When the user asks for wedding help, the agent should return a rich response with:

- A concise planning summary.
- A visual hero or moodboard strip when imagery is useful.
- Map/location cards for venues, guest travel, accommodation clusters, photo locations, and transport timing.
- Budget and guest count snapshot.
- Decision cards with clear tradeoffs.
- Timeline/run-sheet preview.
- Vendor shortlist cards with source/provenance labels.
- Email draft cards for vendors, family, planner, celebrant, or venue.
- A "created files" section listing generated artifacts.
- A continuing chat composer scoped to the planning response.

The response must be useful even when the user provides little context. The agent should ask only the next necessary question instead of front-loading a long questionnaire.

### 2. Dedicated Response Workspace

Every substantial wedding-planning response should create a response workspace that the user can open separately from the chat response.

This workspace is not a new top-level product. It is a generated artifact hub linked to the originating AFP response message.

The workspace should show:

- Research documents.
- Vendor comparison tables.
- Budget spreadsheets.
- Guest list drafts.
- Seating chart drafts.
- Run sheet and timeline files.
- Email/message drafts.
- Contract summaries.
- Gift registry drafts.
- Moodboard/image references.
- Map/location collections.
- Decision log.
- Open tasks and calendar events generated from the response.

Each item should be searchable, exportable, and traceable back to the originating AFP message, source, and user approval state.

### 2A. Frictionless Onboarding Imports

The wedding workspace should support one-click imports for existing planning material:

- Spreadsheet exports from Excel, Google Sheets, The Knot, and similar tools.
- Guest lists, RSVP sheets, seating notes, dietary/accessibility records, vendor lists, budget sheets, quotes, and payment trackers.
- The workspace should support both file-picker import and drag-and-drop import so the user can bring in existing planning material without leaving the planning surface.
- CSV, TSV, plain-text tabular exports, and readable modern XLSX workbook sheets should be synthesized immediately in the browser into private wedding artifacts.
- Browser-side CSV/TSV/text synthesis should be capped to a safe row limit and file-size limit, with a visible warning when only the first rows were synthesized.
- Binary Excel files that cannot be safely parsed in-browser, including legacy XLS files, should still be saved as private import artifacts with a clear parser-needed status until a backend spreadsheet parser is connected.
- The response workspace should expose import-parser readiness in the planning sidebar, including synthesized count, review-needed count, parser-needed count, blockers, and next actions.
- Signed-in imports should attempt to save the original uploaded file to OmnyID Files and preserve the upload source message ID, attachment ID, hash, filename, MIME type, size, and storage receipt in the generated artifact metadata.
- Original upload receipts should survive AFP artifact projection and persisted workspace reload, so Search, Files, readiness checks, and future parser execution can reconnect the synthesized artifact to the source file.
- Binary spreadsheet imports with saved source receipts should expose a parser-job request payload containing the artifact ID, source message ID, source attachment ID, hash, filename, MIME type, size, and storage receipt, while imports without those receipts should remain blocked with a clear storage-missing reason.
- Guest/local-only imports may still synthesize planning artifacts, but production readiness should remain blocked until the original uploaded file has a durable storage receipt.
- Any binary spreadsheet import should keep the wedding planner in a fail-closed production state and create a projection-ready parser/storage task until server-side XLS/XLSX parsing has a durable proof receipt, or until the user converts the file to CSV/TSV/text.

After import, the agent should treat the uploaded file as user-provided planning evidence:

- Preserve the original filename, source kind, row count, column labels, file size, and last-modified timestamp where available.
- Preserve original upload retention status, source message ID, attachment ID, hash, storage receipt, and failure reason where available.
- Preserve browser XLSX parser provenance, including parser name and parsed sheet name, when modern spreadsheet sheets are decoded without a backend parser.
- Skip hidden XLSX sheets during browser synthesis and surface a warning, so scratch/private workbook tabs are not silently treated as planning evidence.
- Preserve cached XLSX formula values but flag formula-cell counts, surface them in import readiness, and create a verification task, so calculated budget/payment totals are treated as review-required evidence before deposits, contracts, or vendor commitments.
- For XLS/XLSX files, preserve enough source identifiers to submit a deterministic backend parser job later without asking the user to upload the same file again.
- Infer the planning area conservatively as guest list, budget sheet, vendor table, or general research.
- Create AFP-ready wedding artifact messages so the file can be saved to Files and reused by Search, Tasks, Budget, Guest Operations, Seating, Knowledge Graph, and follow-up chat.
- Create background synthesis instructions for the AI agent to update guest counts, dietary/accessibility summaries, budget/payment review tasks, vendor evidence, knowledge-graph links, and open-loop warnings.
- Store imported artifacts under the current user/account scope as well as the response workspace scope, so two users on the same browser do not see each other's local imports.
- Keep imports private by default and require explicit approval before sharing guest, budget, vendor, registry, or family details externally.

### 3. Continue Chat In Context

The user must be able to continue the conversation from both:

- The original rich response UI.
- The dedicated response workspace.

Continuation should carry:

- Wedding plan ID.
- Response workspace ID.
- Active artifact ID when applicable.
- Relevant supertags.
- Selected vendors, venues, deadlines, budget assumptions, guest count, and cultural constraints.
- The provenance of any external research used.

## AFP-Native Architecture

### Canonical Rule

The canonical record is always AFP. Derived UI state, local indexes, spreadsheets, graph nodes, and workspace summaries are projections.

No wedding-specific entity should be stored only inside a component state or isolated local blob if it matters for future retrieval.

### AFP Message Families

Use existing AFP families wherever possible before introducing new message types.

Recommended message family mapping:

| Wedding concept | AFP treatment |
|---|---|
| Wedding brief | `note` or `planning_brief` projection with wedding metadata |
| Planning response | `ui_presentation` plus linked artifact bundle |
| Created artifact bundle | `artifact_collection` or workflow result metadata |
| Vendor research | `research_result`, `knowledge_card`, or file artifact |
| Vendor comparison table | file artifact plus table view metadata |
| Budget sheet | file artifact plus spreadsheet/table metadata |
| Guest list | file artifact initially; later structured table projection |
| Run sheet | task/calendar/workflow projection plus exportable document |
| Email draft | email draft AFP message requiring approval |
| Calendar event | first-class `calendar_event` AFP message |
| Task/deadline | first-class task AFP message |
| Decision | `decision_record` or note with decision supertags |
| Approval | existing approval/action audit messages |
| Contract summary | retained file plus extracted summary artifact |
| Gift registry draft | file artifact plus external-link metadata |

Introduce a wedding-specific subtype only when a generic AFP type cannot express the object clearly.

### Required Metadata

All wedding-generated messages and artifacts should carry a small, consistent metadata envelope:

```json
{
  "template": "wedding_planning",
  "wedding_plan_id": "wedding_plan:<stable-id>",
  "response_workspace_id": "response_workspace:<stable-id>",
  "source_response_id": "afp:<message-id>",
  "artifact_kind": "vendor_research | budget_sheet | guest_list | run_sheet | email_draft | map_collection | registry_draft | decision_log",
  "supertags": [
    "template:wedding_planning",
    "event:wedding",
    "wedding_plan:<stable-id>"
  ],
  "privacy_scope": "private | shared_partner | shared_family | shared_vendor",
  "approval_state": "draft | pending_user_approval | approved | sent | archived"
}
```

### Supertag Contract

Use stable, migration-friendly tags:

- `template:wedding_planning`
- `event:wedding`
- `wedding_plan:<id>`
- `response_workspace:<id>`
- `wedding_role:couple`
- `wedding_role:planner`
- `wedding_role:vendor`
- `wedding_role:family`
- `wedding_vendor:venue`
- `wedding_vendor:caterer`
- `wedding_vendor:photography`
- `wedding_budget`
- `wedding_guest_list`
- `wedding_run_sheet`
- `wedding_legal`
- `wedding_noim`
- `wedding_registry`
- `wedding_culture:<label>`
- `location:<place>`
- `approval:required`
- `source:agent_research`
- `source:user_upload`

Avoid encoding sensitive personal details into tags. Store sensitive data inside encrypted content and expose only safe labels in indexes.

## Knowledge Graph Topology

The wedding plan should appear as a graph of dependencies:

- Wedding plan root.
- Couple priorities.
- Budget.
- Guest list.
- Venue.
- Ceremony.
- Reception.
- Legal requirements.
- Vendors.
- Contracts.
- Payment/deposit schedule.
- Accommodation and transport.
- Cultural/religious requirements.
- Weather and contingency plans.
- Tasks and calendar events.
- Created artifacts.
- Email drafts and sent messages.

Example topology edges:

- `venue requires capacity_for guest_list`
- `venue constrains caterer`
- `ceremony_date creates_deadline noim_due_date`
- `photographer contract creates_payment deposit_due`
- `outdoor_ceremony requires contingency wet_weather_plan`
- `guest_accessibility_need constrains transport_plan`
- `cultural_requirement requires vendor_capability`
- `budget_change affects vendor_shortlist`

The graph should explain why a recommendation matters. For example: "This venue is risky because it has no wet-weather backup and your ceremony is outdoors in November."

Source verification should also be visible in topology:

- Consequential artifacts such as vendor tables, budget sheets, legal notes, registry drafts, map collections, and research documents should carry `source_linked`, `source_labelled`, or `source_unverified` evidence status.
- If one of those artifacts has no source URL, the Knowledge Graph should create a source-verification risk node linked to the artifact and response workspace.
- Source-verification risks must be conservative. They should ask the user to verify pricing, availability, legal, map, registry, or vendor claims; they must not claim the artifact is wrong.
- Source-verification recommendation cards should use explicit `source verification` badges and next actions that ask the user to add or verify source URLs before acting.
- Guest lists, timelines, and approval-gated email drafts should not be treated as source-verification failures merely because they are private planning artifacts.

Second-order planning must be first-class:

- Weather, wet-weather, transport, access, vendor no-response, deposit, and legal timing risks should be treated as loops to close, not one-off notes.
- The response workspace should show whether a backup plan is evidenced, whether a task/date exists to verify it, and what is still missing.
- Decision-heavy work should be narrowed into a bounded focus set, so the couple sees the few budget, guest, vendor, evidence, or logistics decisions that matter now while lower-priority choices stay in backlog context. The focus set should be actionable and durable: opening Tasks, Calendar, or Decision Queue must carry the focus packet so the destination can explain what came over, and exported planning packets should preserve the focus summary without copying unrelated backlog details.
- Email drafts and vendor contacts should remain approval-gated, then create or point to follow-up tasks so unanswered vendors, celebrants, venues, and family contacts do not disappear after a draft is created.
- If no existing task closes a weather/backup or contact-response loop, the workspace should create a projection-ready AFP task candidate through the existing task projection path rather than leaving the loop as passive advice.
- Legal, deposit, payment, contract, cancellation, minimum-spend, NOIM, and celebrant timing evidence should produce a commitment-timing loop card and, where no task already owns the loop, a projection-ready verification task before signing, paying, lodging, or treating the commitment as closed.
- Transport, access, accommodation, parking, mobility, seating, and guest-logistics evidence should produce a logistics loop card and, where no task already owns the loop, a projection-ready verification task before treating a venue or guest plan as ready.
- Budget sheets, quotes, unknown estimates, TBC costs, minimum spends, overtime, taxes, service fees, travel fees, cancellation terms, and exclusions should produce a budget-drift loop card and, where no task already owns the loop, a projection-ready budget verification task.
- Loop status must be derived from AFP evidence such as artifacts, tasks, calendar events, sent/contact receipts, and approval receipts. Do not claim live weather checks, live vendor availability, or sent emails unless connected providers have actually executed them.
- Later weather, email, calendar, and contact-provider integrations should write back to the same task, calendar, approval-receipt, and artifact shapes rather than creating a parallel wedding workflow.

## Need-To-Know Probing

The template should not start with a long form.

Initial questions should be minimal:

- Approximate date or season.
- Location or target region.
- Guest count range.
- Budget range or comfort level.
- Top three priorities.
- Whether there are cultural, religious, accessibility, dietary, or family constraints the agent should respect.

Further questions should appear only when they unblock a concrete recommendation.

Examples:

- Ask about cultural traditions when recommending ceremony structure, vendors, outfits, food, music, or family rituals.
- Ask about dietary restrictions when selecting caterers or menu options.
- Ask about accessibility when recommending venues, transport, accommodation, or seating.
- Ask about budget details when a recommendation would materially change spend.
- Ask about privacy/sharing before drafting emails to vendors or inviting family/planners into the workspace.

## Rich Response UI Contract

The wedding response should use a modular card layout compatible with existing `ui_presentation` and renderer patterns.

Recommended sections:

1. `Overview`: short narrative summary and key assumptions.
2. `Map`: venue/vendor/accommodation/travel markers when locations exist.
3. `Timeline`: countdown, planning milestones, day-of run sheet preview.
4. `Budget`: total estimate, category breakdown, unknown-cost warnings.
5. `Vendor Shortlist`: ranked options with source and fit reasons.
6. `Decisions`: tradeoff cards requiring user choice.
7. `Tasks`: next actions and critical path warnings.
8. `Drafts`: emails/messages ready for approval.
9. `Artifacts`: generated files with open/export actions.
10. `Continue`: scoped chat composer.

Each card should have:

- Title.
- Short explanation.
- Evidence/source label.
- Evidence status showing whether the artifact is source-linked, source-labelled, or still needs source verification.
- Action buttons.
- Export/open action when an artifact exists.
- Approval state when an action is consequential.

Preference capture:

- Users may state preferences in the continuing chat, but shortlist tables should also provide a visible decision checkbox or equivalent button fallback.
- Shortlist tables should surface conservative preference-fit hints when explicit user or artifact context exists, such as budget control, accessibility, wet-weather backup, waterfront feel, catering/dietary fit, public/registry path, or guest logistics. These hints should appear as fit, missing-evidence, or tradeoff labels rather than opaque scores.
- Preference-fit hints must not imply booking suitability, live availability, pricing accuracy, legal compliance, or vendor quality. They are decision support labels grounded in the current AFP/artifact context.
- For venue, celebrant, vendor, and other option shortlists, ticking one row means "treat this as the selected option for follow-up reports and next actions."
- Once a row is selected, the workspace should collapse the unticked alternatives by default while keeping them reversible by unticking the selected row.
- Follow-up chat/report handoffs must carry the selected option label and detail so the agent produces scoped outputs from the chosen option instead of re-reporting the full shortlist.
- Unticked alternatives remain auditable in the source artifact and can be reopened for comparison.
- When saved, selected rows should become first-class AFP decision records addressed to Wedding Planning, Decision Queue, Search, and Knowledge Graph.
- Saved decision records should preserve the visible preference-fit summary and labels so future reports can explain why the selected path fit the user's stated constraints without re-parsing the original table.
- Reopened workspaces should reload saved selected rows from `wedding_decision_selection` AFP messages and show them as decision-scope evidence beside context, approvals, tasks, dates, and second-order loops.
- Continue-chat, report, graph, task, calendar, and export handoffs should carry selected-decision scope labels and structured metadata so the agent treats the selected row as the preferred planning path unless the user asks to compare alternatives again.
- Destination arrival banners should show a selected-decision scope card and compact selected-count chip when a handoff is scoped to a chosen venue, celebrant, vendor, registry, or other shortlist item.
- Destination arrival banners should also summarize source-linked, source-labelled, and source-unverified artifact counts when a compact workspace handoff packet is carried, so downstream surfaces inherit trust context without loading full artifact bodies.
- Destination arrival copy should explain how that selected scope affects the current surface: chat answers from it first, maps verify it first, calendar/task views prioritize its follow-up, graph highlights its dependencies and risks, approvals name it explicitly, and exports foreground it while preserving alternatives as audit context.
- Saved selected rows should also become decided Knowledge Graph nodes linked to their source shortlist artifact, so topology can show the chosen planning path and related evidence without treating the same choice as still unresolved.
- Markdown, printable HTML/Save-as-PDF, and Word-openable `.doc` planning packet exports should include a selected-decision scope section so downloaded reports state the chosen item while leaving unticked alternatives auditable in the original shortlist artifact.
- Packet exports should include an evidence-status section with source-linked, source-labelled, and source-unverified counts plus per-included-file caveats, so downloaded reports do not lose source-verification context.
- Native ZIP, DOCX, JPG, and PNG packet exports should remain visibly planned and disabled until real conversion workers exist. Word-openable `.doc` is acceptable as an immediate practical bridge only if it uses the same privacy-filtered packet content and is clearly not native DOCX.
- Approval previews for sending, sharing, contacting, exporting, or other consequential actions should name the selected shortlist item and warn that unticked alternatives should not be included unless the user explicitly requests comparison.
- Second-order weather/backup and email/contact closure loops should name the selected planning path when one exists, so backup plans, response deadlines, and follow-ups are aimed at the chosen venue/vendor/celebrant first.
- Selected-scope second-order task candidates should carry the chosen item in the title or notes where useful, so Tasks, Search, completion sync, and future follow-up reports can close loops against the selected venue/vendor/celebrant instead of the full shortlist.

## Dedicated Response Workspace Contract

The response workspace should be accessible from a button such as `Open planning files`.

The workspace should include:

- Header: wedding plan name, date/season, region, guest count, budget range, privacy state.
- Left rail: artifact categories.
- Main panel: selected artifact preview with metadata, source links, conservative evidence status, structured preview, raw body, export actions, and approval preview.
- Right rail: related tasks, calendar events, decisions, and chat continuation.
- Search: query across artifacts, vendors, budget rows, emails, decisions, sources, and evidence status such as `source linked`, `source labelled`, or `source unverified`.
- Filter chips: artifact kind, approval state, export target, evidence status, vendor, and location.
- Destination handoff: compact non-body packets should carry artifact counts, linked dates/tasks, approval prompts, selected decisions, decision-focus counts, projection readiness, sensitive-export exclusions, and evidence-status counts.
- Export: bundle export where safe.

Initial artifact categories:

- `Research`
- `Vendors`
- `Budget`
- `Guests`
- `Timeline`
- `Emails`
- `Legal`
- `Registry`
- `Maps`
- `Decisions`

The workspace should be generated from AFP metadata and artifact indexes, not by copying data into a separate silo.

## Created Artifact Types

### Research Documents

Research documents should include:

- Source URLs or file references.
- Search date.
- Agent assumptions.
- Confidence/availability caveats.
- Next verification action.

### Vendor Tables

Vendor tables should include:

- Vendor name.
- Category.
- Location.
- Estimated price or unknown.
- Capacity.
- Fit reasons.
- Risk flags.
- Contact details when available.
- Source/provenance.
- Draft email action.

### Budget Sheets

Budget sheets should include:

- Category.
- Estimated cost.
- Confirmed cost.
- Paid amount.
- Due amount.
- Due date.
- Vendor link.
- Hidden-cost warning.
- Confidence label.
- Evidence check for unknown/TBC costs, due amounts, unpaid rows, and warning rows.

Budget previews must not infer total spend, payment completion, live quote accuracy, deposits, or vendor pricing from weak text. If exact structured amounts and currencies are not reliable, the UI should show risk/evidence counts rather than totals.

### Email Drafts

Email drafts should:

- Require explicit approval before sending.
- Preserve tone instructions.
- Include recipient, subject, body, and source context.
- Show what the email does and does not disclose.
- Create an action receipt when sent.

### Gift Registry Drafts

Registry drafts should initially be simple artifact files with:

- Items or categories.
- Budget bands.
- Priority.
- Store/source links.
- Notes.
- Privacy/sharing state.

External registry integrations should be later-phase only.

## Calendar And Task Requirements

Wedding deadlines and appointments must become first-class AFP messages.

Examples:

- Venue tour.
- Vendor call.
- Deposit due.
- Contract review.
- NOIM reminder.
- Dress fitting.
- Menu tasting.
- RSVP deadline.
- Final numbers due.
- Rehearsal.
- Ceremony.
- Reception.

Calendar events must be visible in OmnyID's Calendar view and searchable by wedding tags. They must carry `wedding_plan_id`, `response_workspace_id`, source response ID, location, participants, and approval state.

Tasks should remain separate from calendar events when they are not time-bound.

## Privacy And Sharing

Default state: private to the user.

Sharing must be explicit and scoped:

- Share with partner.
- Share with planner.
- Share selected artifact with family.
- Share selected draft with vendor.
- Share day-of run sheet only.
- Share no financial or guest private data by default.

Vendor access should never expose guest list, budget ceiling, family notes, or unrelated vendor comparisons unless explicitly approved.

## Integrations

P1 should rely on existing OmnyID surfaces and local/exportable artifacts.

Integration priority:

1. Calendar events in OmnyID Calendar.
2. Files/artifact workspace.
3. Email draft approval flow.
4. Maps/location cards using existing map capability.
5. Export to Markdown, HTML/PDF-ready, Word-compatible HTML, CSV for tables.
6. Optional Google Calendar sync.
7. Optional Gmail/email sending.
8. Later vendor directories, weather, payment, registry services.

Do not claim live vendor availability, legal filing, payment processing, or registry publishing until integrations exist and are tested.

## Australian Wedding Context

Australian context is useful but should be handled conservatively.

The agent may track:

- NOIM reminder and celebrant coordination.
- Whether the couple has downloaded the official NOIM form.
- Whether the couple will use their own authorised marriage celebrant or wants help comparing public/registry-style celebrant options.
- Venue state/territory labels.
- GST/service-fee warnings.
- Weather contingency reminders.
- Public holiday/date risk notes.
- Follow-up loops for unanswered vendors, celebrants, family contacts, or planner actions.

Australian legal setup responses should display practical context:

- How to find or download the NOIM form.
- When the NOIM should be given to an authorised celebrant.
- Where to find authorised celebrants or registry/public ceremony options.
- How much to budget for by prompting for celebrant, registry, document, and ceremony-fee questions rather than inventing fixed prices.
- What remains unverified and should be confirmed with the celebrant, registry, or official authority.

The agent must not claim it can submit legal forms or guarantee legal compliance unless a verified workflow exists. It should prompt the user to confirm requirements with their celebrant or relevant authority.

## Export Requirements

Wedding artifacts should support:

- Markdown.
- HTML/PDF-ready print.
- Word-compatible HTML.
- CSV for structured tables.
- Image/JPG export later for moodboards, maps, and seating charts.
- Bundle export later for the full response workspace.

Exports must preserve:

- Source labels.
- Evidence-status counts and per-file source-verification caveats.
- Decision state.
- Approval state.
- Generated-at timestamp.
- Wedding plan ID.
- Privacy warning where relevant.

## Guardrails

- Do not create a separate wedding database as canonical state.
- Do not expose sensitive guest, family, finance, or cultural information through unsafe tags.
- Do not send emails, share files, contact vendors, publish registries, or book appointments without approval.
- Do not overclaim live pricing, availability, legal compliance, or vendor quality.
- Do not infer ethnicity, religion, family structure, or budget from weak evidence.
- Do not ask sensitive questions unless they unblock a specific planning choice.
- Keep artifacts modular; avoid adding a single monolithic wedding component or file.

## Admin Data-Sharing Consent

- The wedding template must show an explicit top-level opt-in toggle before any generated wedding plan or user-submitted wedding response is copied to an admin review interface.
- The toggle must default off and include an info icon or hover message explaining that copied data is anonymized and excludes names, direct contact details, guest identities, sensitive documents, and private relationship details unless the user separately chooses to share them.
- Admin-submitted planning packets must carry consent source, workspace or plan identifiers, anonymized status, submitted-response count, and audit timing.
- Admin data sharing must not be inferred from ordinary template usage.

## Delegation And Contacts

- The template must let users delegate detailed responsibility categories, not only broad roles.
- Initial categories should include legal/NOIM, celebrant, venue selection, vendor research, vendor outreach, budget/pricing, RSVP, seating, run sheet, weather backup, payments/contracts, vows/ceremony, and travel/accommodation.
- Each delegated person should capture name, relationship or role, phone or email, and optional notes.
- Complete delegated people should become Contacts-view-compatible contact drafts so the user can later find the relationship, name, phone number, email, and responsibility from the existing Contacts surface.
- Incomplete delegated responsibilities should remain visible as setup blockers rather than disappearing from the plan.

## Timeline And Gantt View

- The wedding template should use the project's existing timeline/task infrastructure where possible and expose a Gantt-ready state for visual timing hierarchy.
- Gantt rows should be generated from dated Tasks, Calendar events, and planning artifacts rather than a separate wedding-only task store.
- Categories should include legal, venue, vendor, outreach, budget/pricing, guest, run sheet, weather, ceremony, travel, and general planning.
- Each category should have a default color and allow user color overrides without changing the underlying AFP task/calendar data.
- Undated items should stay in the existing Tasks timing hierarchy; the Gantt should show a clear empty/blocked state when no dated evidence exists.

## Australian Legal And Stale Pricing Differentiation

- Australian NOIM tracking is a first-class differentiator, not generic legal advice. For Australian couples, the template should track the one-calendar-month latest-date check and 18-month earliest window from official-source guidance when an exact wedding date exists.
- The product must not claim that OmnyID lodged the NOIM, booked a celebrant, or verified legal compliance unless a future connected executor and user approval explicitly prove that action.
- Vendor pricing must be treated as stale unless it is source-linked, recently checked, or confirmed by the vendor through an approved contact/executor path.
- Reports, vendor tables, and Gantt budget rows should show stale-pricing warnings before recommending deposits, contracts, or final shortlist decisions.

## MVP Definition

The Wedding Planning template is MVP-ready when:

- A user can ask for wedding planning help and receive a rich response with text, cards, map placeholders, timeline, budget, vendor shortlist, tasks, drafts, and artifacts.
- The response creates a response workspace with generated files grouped by category.
- The user can continue chat from the response or workspace with the same context.
- Calendar events and tasks are created as first-class AFP-compatible objects.
- Email drafts require approval.
- Generated artifacts are searchable and exportable.
- The Knowledge Graph shows wedding dependencies and artifact links.
- The system remains private by default and sharing is explicit.

## Final Direction

The Wedding Planning template should feel like a private, agentic event-planning command center built on OmnyID's existing memory, AFP, topology, Files, Calendar, Email, Maps, and workflow surfaces.

The differentiator is not "AI wedding checklist." The differentiator is that every recommendation, file, draft, deadline, map, vendor comparison, and decision becomes connected memory that the user can inspect, continue, export, approve, and reuse.
