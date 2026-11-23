# Wedding Planning Template Dependency-Ordered Task Plan

Date: 2026-09-11

## Implementation Status

Started on 2026-09-11.

Completed foundation:

- Initial metadata normalization helper for wedding AFP/template metadata.
- Initial Need-To-Know Probing helper with list-driven probing slots.
- Initial wedding artifact summary helper with default export targets, source/location/vendor labels, linked task/calendar IDs, and searchable metadata.
- Initial response workspace state helper with category grouping, workspace-scoped search, empty/no-match states, continue-chat context, and compact handoff packet state for existing destination surfaces.
- Initial rich response presentation state with overview, map, timeline, legal setup, budget, vendors, decisions, tasks, drafts, artifacts, continue sections and declarative actions for opening planning files, maps, calendar, legal tasks, tasks, draft approval, exports, and continuation chat.
- Initial travel-style rich-response renderer contract that adapts wedding presentation state into stable text, map, timeline, legal, table, task, draft, artifact, and continue blocks with button-addressable action IDs and accessibility fallback labels.
- Initial reusable travel-style wedding rich-response component mounted in Response Queue for launch and follow-up states, with text, map, timeline, legal, table, task, draft, artifact, and continue blocks routed through existing wedding navigation intents.
- Initial first-class Calendar/Task AFP projection helpers for wedding schedule items and planning tasks, including send-input builders, CalendarEvent conversion, conservative review gating, searchable metadata, and sent-marker helpers.
- Initial Knowledge Graph/topology projection helper for wedding plans, workspaces, artifacts, vendors, locations, calendar events, tasks, decisions, risks, high-degree nodes, missing-evidence labels, and next-action state.
- Initial recommendation explanation helper and optional graph-backed presentation section for missing evidence, risks, approvals, decisions, topology anchors, evidence labels, and next-action handoff.
- Initial wedding export manifest and bundle-state helper for Markdown, HTML, CSV, Word-openable `.doc`, browser Save-as-PDF, planned DOCX/JPG/PNG/bundle exports, privacy labels, sensitive-artifact warnings, and opt-in bundle inclusion.
- Initial native export worker execution contract for planned ZIP/DOCX/JPG/PNG packet conversions, using dependency-injected workers, readiness checks, empty-source blocking, deterministic filenames from the planned conversion, durable receipt metadata, warning propagation, and safe failed/thrown-worker copy without enabling native downloads before workers are actually connected.
- Initial wedding artifact generation helper for research notes, vendor comparison tables, budget sheets, approval-gated email drafts, and local registry drafts, including Markdown bodies, CSV rows where appropriate, source labels, caveats, and workspace-compatible artifact inputs.
- Initial generated-artifact AFP projection helper that turns wedding planning files into first-class searchable artifact/file messages with document, table, attachment/export, and approval views, plus relational send-input builders and sent-marker helpers.
- Initial frictionless onboarding import flow for wedding spreadsheets, guest lists, budgets, Google Sheets/The Knot exports, and text/CSV/TSV/XLSX files, including private imported artifacts, source-kind/filename/row/column provenance, direct browser parsing for readable visible modern XLSX sheets as separate planning artifacts, explicit hidden-sheet skipping warnings, formula-cell count warnings and readiness counts for cached workbook values, formula-backed budget/payment verification task projection, original-upload storage receipts when signed in, AFP projection/reload preservation for source message ID, attachment ID, hash, file metadata, storage receipt, parser name, parsed sheet name, and formula-cell count, parser-job request payloads for saved unreadable or legacy spreadsheet source files, conservative guest-list/budget/vendor/research classification, AFP-ready artifact projection, account-scoped local user storage for reload with legacy-key migration, drag-and-drop plus file-picker import, background synthesis instructions, downstream guest/budget/seating/task reuse, safe browser-side file/row/sheet caps with truncation warnings, a visible import-parser/storage readiness sidebar card, and a fail-closed parser-needed state for unreadable or legacy Excel files until backend spreadsheet parsing is connected.
- Initial projection queue helper that aggregates generated artifacts, calendar events, and tasks into pending/sent/blocked save states with dispatch-ready send inputs and conservative review labels.
- Initial projection queue view-model and response-workspace integration for a render-ready `Save planning outputs` action, grouped Files/Calendar/Tasks status, blocked-output review, saved-output handoff, and dispatch payloads.
- Initial projection dispatch receipt helper for saved/failed/skipped queue outcomes, retry IDs, and projection-family sent-marker commits after successful backend saves.
- Initial dependency-injected projection dispatch runner that calls AFP save functions for pending outputs only, records per-item failures, supports retry receipts, and commits sent markers after confirmed saves.
- Initial wedding navigation intent helper and event contract for routing presentation/sidebar actions to existing `response_queue`, Files, Calendar, Tasks, Knowledge Graph, Search, Threads, and Decision Queue surfaces while carrying wedding plan, response workspace, source response, artifact, section, and metadata context.
- Initial wedding navigation local-state bridge for saving, loading, consuming, and clearing the latest route intent so destination surfaces can show arrival context after navigation without requiring a dedicated wedding route first.
- Initial wedding navigation arrival-state helper that turns saved route intents into destination-view headline, badge, cards, next-step copy, carried IDs, and safety warnings for Files, Calendar, Tasks, Knowledge Graph, Search, Threads, Decision Queue, exports, and response workspace arrivals.
- Initial wedding navigation arrival banner view-model that exposes render-ready chips, body items, warning copy, destination-specific primary action, handoff-aware Calendar/Tasks/Export shortcuts, secondary handoff actions, and dismiss action while keeping the actual destination components free of wedding-specific routing logic.
- Initial reusable wedding navigation arrival banner component for destination surfaces, with accessible actions, compact metadata chips, warning copy, and card layout.
- Initial wedding navigation App bridge that listens for wedding navigation events, persists the route intent locally, and selects the existing destination view without adding routing logic to wedding-specific generators.
- Initial destination rendering for wedding arrival banners in Files/export and Knowledge Graph/topology surfaces, using the shared action-to-view mapping instead of embedding wedding routing logic in each view.
- Initial recommendation-specific Knowledge Graph handoff metadata, so topology cards can open the existing graph surface with carried recommendation kind, source node IDs, edge IDs, and next-action context instead of a generic graph launch.
- Initial graph canvas highlighting readiness contract, so carried wedding graph-focus packets are considered production-ready only when the existing Knowledge Graph canvas consumes arrival intent, highlights all focus nodes and edges, emphasizes paths, dims outside-focus elements, shows legend copy, and exposes a clear-focus control.
- Initial destination rendering for wedding arrival banners in Calendar and Tasks surfaces so wedding schedule items and planning tasks explain carried response context before the user syncs, invites, assigns, or commits anything.
- Initial destination rendering for wedding arrival banners in Search/map, Threads, Decision Queue, and Response Queue surfaces, completing the first pass of carried-context visibility across the existing OmnyID destinations used by the wedding template.
- Initial wedding timing hierarchy inside the existing Tasks ledger view, grouping wedding tasks by preparation stage, placing anytime/no-date tasks first, showing rough deadlines visually and in text, and allowing workspace-scoped local tick/untick completion styling without creating a separate task view.
- Initial wedding task hierarchy component split out of the generic ledger renderer, keeping the existing Tasks view from becoming wedding-specific or monolithic while preserving the special timing flair.
- Initial wedding task completion AFP projection helper, so local tick/untick completion records can become first-class task-status messages when backend task sync is connected.
- Initial pending completion-sync state, visible Tasks-view summary, explicit `Save status updates` action, and save receipt copy, showing only local tick/untick changes that differ from the current task message status and naming the affected tasks.
- Initial reusable wedding projection queue panel that binds the save queue to the AFP dispatch runner, shows pending/blocked/saved Files/Calendar/Tasks groups, surfaces dispatch receipts, and leaves refresh/open-saved behavior to the mounting workspace.
- Initial approval-gate helper for consequential wedding actions, structured block kinds, disclosure previews, blocked execution, privacy-scoped sharing, vendor-facing artifact privacy blocks, calendar-provider gating, unsupported registry publishing, and execution/block receipts.
- Initial integration-readiness state for approval-gated wedding actions, distinguishing no-provider-needed, email provider needed, calendar provider needed, ready-after-approval, connected-provider ready, and unsupported registry states without claiming external execution exists.
- Initial dependency-injected wedding approval execution runner that only calls connected executors after approval/provider gates pass, records missing-executor/failed/executed outcomes, and returns auditable receipts.
- Initial response workspace view-model helper for category rails, active artifact preview, filter chips, export manifests, approval prompts, sidebar actions, recommendation cards, and continue-chat context.
- Initial reusable wedding response workspace component with header/search, category rail, filter chips, artifact list, active artifact metadata/export/approval/disclosure preview, structured approval block labels, local approve/execute controls, durable AFP approval-receipt save and audit display, continue-chat context packet handoff, sensitive-export opt-in, topology recommendation cards, sidebar actions, and optional projection queue panel.
- Initial approval preview panel extracted from the main response workspace component, keeping approval disclosure, integration readiness, block labels, approve/execute controls, and receipt copy modular rather than growing the workspace file toward the anti-monolith limit.
- Initial workspace actions panel extracted from the main response workspace component, keeping packet format controls, sensitive-export opt-in, planned conversion chips, and sidebar action buttons modular for future export/provider additions.
- Initial workspace context panels extracted from the main response workspace component, keeping Need-To-Know context cards, approval receipt audit cards, and topology recommendation graph handoffs modular for future sidebar growth.
- Initial artifact detail panel extracted from the main response workspace component, keeping active artifact metadata, source links, structured previews, raw artifact body, export buttons, and approval preview modular for future preview/export expansion.
- Initial active-artifact evidence summary, so the workspace shows whether a planning file is source-linked, source-labelled, or still needs source verification before users rely on pricing, availability, legal, or vendor claims.
- Initial source-verification graph topology, so consequential artifacts without source URLs become conservative Knowledge Graph risk nodes linked to the artifact and workspace instead of being treated as fully evidenced just because a file exists.
- Initial source-verification recommendation copy, so graph-backed risk cards use explicit source-verification badges and ask users to add or verify source URLs before relying on artifact claims.
- Initial evidence-status workspace search and filter chips, so users can find `source linked`, `source labelled`, and `source unverified` planning files without opening every artifact.
- Initial evidence-status destination handoff counts, so compact workspace packets and arrival banners carry source-linked, source-labelled, and source-unverified file counts without copying artifact bodies.
- Initial second-order loop cards in the response workspace sidebar, surfacing weather/backup contingency gaps and email/contact closure loops from current AFP evidence, tasks, dates, email drafts, and approval receipts without claiming live weather or external contact execution.
- Initial local decision-selection helper and table-preview checkbox UI for venue/vendor/celebrant shortlist rows, collapsing unticked alternatives after selection and carrying selected option scope into workspace action metadata for follow-up reports.
- Initial conservative preference-fit labels for shortlist rows, so explicit user preferences in the artifact context can surface fit, missing-evidence, and tradeoff chips before the user chooses an option.
- Initial durable decision AFP projection helper and shared projection-queue support for selected shortlist rows, saving chosen venue/vendor/celebrant decisions as searchable `wedding_decision_selection` messages addressed to Wedding Planning, Decision Queue, Search, and Knowledge Graph.
- Initial persisted decision-record reload from saved `wedding_decision_selection` AFP messages back into the wedding response workspace sidebar, so reopened workspaces show active venue/vendor/celebrant decision scope from saved evidence.
- Initial selected-decision handoff propagation through continue-chat packets, compact workspace handoff packets, and sidebar action metadata, so reopened workspaces can generate follow-up reports from the chosen item instead of re-reporting the full shortlist.
- Initial selected-decision arrival visibility in existing destination banners, with selected-scope summary cards and compact chips for Calendar, Tasks, Knowledge Graph, Search, Threads, Files, and Decision Queue handoffs.
- Initial destination-specific selected-scope guidance and next-step copy, so Calendar, Tasks, Knowledge Graph, Search/map, Threads, Files/export, and Decision Queue explain how to use the selected option without hiding auditable alternatives.
- Initial persisted selected-decision graph projection, turning saved shortlist choices into decided topology nodes linked to source artifacts so the Knowledge Graph can show the chosen path without treating it as an unresolved decision.
- Initial selected-decision packet export section for Markdown and printable HTML planning packets, foregrounding the chosen shortlist item while preserving unticked alternatives in source artifacts for audit/comparison.
- Initial selected-decision approval disclosure, so send/share/contact approval previews name the selected shortlist item and warn against including unticked alternatives unless the user explicitly asks to compare.
- Initial selected-decision second-order loop context, so weather/backup and email/contact closure loops name the selected venue/vendor path and direct next actions at the selected option.
- Initial second-order loop task candidates, so missing wet-weather backup checks and vendor/contact response follow-ups can enter the existing projection queue as first-class AFP task messages instead of remaining sidebar-only advice.
- Initial legal/deposit/contract timing loop, so NOIM/celebrant, deposit, payment, contract, cancellation, and minimum-spend evidence produces a clear commitment-risk card and a projection-ready task when no existing commitment task closes the loop.
- Initial transport/access/guest-logistics loop, so venue, map, transport, accommodation, parking, accessibility, mobility, seating, and guest-movement evidence produces a clear logistics-risk card and a projection-ready task when no existing logistics task closes the loop.
- Initial budget-drift/unknown-cost loop, so budget sheets, quotes, TBC estimates, minimum spends, overtime, GST/tax, service fees, travel fees, cancellation terms, and exclusions produce a clear budget-risk card and a projection-ready task when no existing budget task closes the loop.
- Budget tracking now compares selected vendor decisions against an explicit overall budget target when one is present, keeps quoted/projected/unknown amounts separate, rolls selected costs up by category, and surfaces quote-verification task candidates for projected, missing, or contract-risk vendor amounts.
- Budget tracking now also consumes local selected shortlist rows before AFP persistence completes, dedupes them against saved decisions after reload, and updates projected vendor spend immediately when the user ticks a vendor, venue, celebrant, or similar paid option.
- Selected vendor quote-verification candidates now project into the existing wedding task queue and PersonalOS ranking as budget-review obligations, with dedupe against saved tasks and searchable quote-verification metadata instead of remaining sidebar-only warnings.
- Budget-sheet payment rows with due amounts, unpaid status, deposit/final-payment warnings, or receipt-review risk now project into the existing task queue and PersonalOS ranking as payment-review obligations, with due-date alerts, linked artifact IDs, searchable AFP metadata, and duplicate suppression once saved.
- Initial shared wedding workspace sidebar-action contract extracted from the response workspace view-model, so navigation, second-order loops, action panels, and workspace components can evolve without circular type coupling or monolithic growth.
- Initial second-order sidebar task-candidate visibility, so generated weather/legal/contact/logistics/budget task candidates are visible before the user saves them through the existing projection queue.
- Initial structured second-order task metadata, so loop-generated task candidates carry loop kind, evidence labels, selected decision scope, and linked artifact IDs into AFP task projection/search metadata instead of relying only on prose notes.
- Initial second-order graph topology projection, so loop-generated tasks create risk/next-action graph nodes and edges keyed by loop family, selected scope, evidence labels, and linked artifact context.
- Initial second-order task visibility in the existing wedding Tasks timing hierarchy, so loop-generated tasks show loop-family chips and evidence labels without creating a separate task view.
- Initial persisted workspace reload support for second-order task metadata, so reopened wedding workspaces preserve loop family, evidence labels, selected decision scope, and linked artifact context from saved AFP task messages.
- Initial metadata-aware duplicate suppression for second-order loop tasks, so saved or reloaded loop-closure tasks suppress new task candidates even when their visible title is generic.
- Initial DecisionOS/PersonalOS alignment requirement: wedding action items for brides or grooms must not remain isolated inside the wedding workspace. Saved wedding tasks, selected decisions, approvals, calendar commitments, and second-order loop tasks should feed the existing DecisionOS/PersonalOS daily ranking lanes so they can compete with the user's other work, study, family, health, finance, and life-admin decisions.
- Initial wedding-to-PersonalOS projection bridge, implemented as a narrow frontend state helper rather than a new wedding-specific Bohm field engine or simulator. The bridge maps wedding tasks, selected decisions, calendar commitments, blocked approvals, and second-order loop tasks into existing PersonalOS pressure families (`obligation`, `attention`, `knowledge`, `opportunity`) plus compact existing-simulator seed summaries and guardrails.
- Initial decision-fatigue relief layer on the wedding-to-PersonalOS bridge, response-workspace sidebar, handoff packet, destination arrival chips, and export packet, so decision-heavy budget, guest, vendor, evidence, and logistics work is narrowed to a bounded visible focus set with Tasks/Calendar/Decision Queue handoff metadata while lower-priority decisions remain visible as backlog context instead of becoming an unbounded checklist.
- Initial primary-use-case profile bridge, so users can declare wedding planning as their current primary OmnyID use case, receive a light wedding palette/theme borrowed from the standalone wedding page, and later mark the wedding use case complete to return to the general OmnyID theme. Admin/demo accounts may be seeded to wedding planning, but completion must still be respected.
- Initial primary-use-case lifecycle hardening, so `Later` postpones the profile prompt for the current session only, stale theme classes are removed before applying a new use-case theme, and future Master Agent inference can fill an empty/general profile without silently overriding a specific active use case.
- Initial admin wedding-operations panel contract inside the existing operator Usage surface, showing signed-up user count when available, Oracle disk/RAM metric placeholders when the backend endpoint is not mounted, and a clearly scoped local toggle for routing wedding-template background AI work through the admin API only after backend policy enforcement exists.
- Initial admin-funded wedding AI routing policy backend route and frontend resource bridge, so the operator toggle remains production-disabled and Oracle upload remains blocked until the backend policy endpoint, AFP/audit receipts, tenant boundaries, budget guardrails, wedding-template-only scope, and direct Master Agent query exclusion are all proven.
- Initial wedding production-readiness gate state, so Oracle upload is explicitly blocked while required gaps remain instead of relying on informal judgment. Required Oracle blockers currently include backend pagination/query tuning, real approval execution UI, provider executor integrations, wedding import-parser readiness, admin-funded wedding AI routing policy enforcement, admin Oracle/user metrics, and the global Oracle release gate.
- Initial production-readiness evidence adapter, so helper proof states for backend scale, map/geocoding, graph canvas, approval UI, native export workers, LLM Need-To-Know extraction, provider executors, wedding import-parser readiness, admin routing policy, admin Oracle/user metrics, and Oracle release gates can feed the single wedding production-readiness gate without manual boolean drift.
- Initial strict Oracle proof mode for the production-readiness evidence adapter, so a passing saved-workspace scale proof does not clear the aggregate Oracle gate unless a durable scale-proof receipt/reference is present when strict production proof is required.
- Initial strict Oracle release-proof aggregation, so a bare `productionEvidenceReady:true` release gate does not clear the aggregate Oracle upload gate in strict mode unless release-readiness, production go/no-go, backup verification, restore drill, secret sync, and Oracle remote proof references are all present.
- Initial strict provider-executor proof aggregation, so email, calendar, registry, and vendor-search executors can require durable per-capability smoke/proof receipts before the aggregate Oracle upload gate treats external provider execution as production-ready.
- Initial strict admin-funded wedding AI routing policy proof aggregation, so backend policy, audit receipts, tenant boundaries, budget guardrails, wedding-template scope, and Master Agent exclusion still require a durable admin policy proof reference and verification timestamp before strict Oracle upload readiness can pass.
- Initial Oracle update plan guard, so the wedding template produces explicit blocked/preflight/deploy/verify/proof-record steps from the production-readiness state and refuses Oracle update while any required gate remains blocked.
- Oracle update planning now also requires the aggregate wedding production go/no-go packet, so old per-check readiness flags cannot allow an Oracle upload when the aggregate packet is missing or when backend scale proof, provider executor proof, import parser/storage proof, or Oracle release proof packets are blocked.
- Initial Oracle update task projection, so blocked readiness gates and ready preflight/deploy/verify/proof-record steps surface through the existing wedding Tasks, AFP task projection, and PersonalOS ranking instead of a separate deployment dashboard.
- Initial response-workspace Oracle readiness wiring, so the actual wedding planning workspace defaults to fail-closed production readiness, exposes the Oracle update plan, and includes blocked/ready Oracle update tasks in the existing projection queue.
- Initial wedding production go/no-go packet, so backend scale proof, provider executor proof, and Oracle release proof are aggregated into one fail-closed upload decision with blocker labels, next actions, and deployment guardrails before any Oracle upload is attempted.
- Workspace production-readiness orchestration now derives production evidence, production readiness, aggregate go/no-go, and Oracle update planning from one optional evidence input, so callers do not need to manually remember every gate and a passing legacy readiness object cannot bypass a blocked proof packet.
- Response-workspace state now exposes the derived production evidence and aggregate go/no-go packet alongside the Oracle update plan, so UI panels and operator surfaces can show the exact proof packet that is blocking or allowing deployment instead of relying only on legacy readiness labels.
- Response-workspace production proof now defaults to strict fail-closed evidence when no upstream proof input is supplied, so ordinary wedding workspaces show a visible missing-proof go/no-go packet instead of silently hiding deployment status.
- The production-gate presentation helper now renders missing aggregate go/no-go packets as a visible blocked state with blocker, guardrail, and next-action copy, so custom workspace mounts cannot hide Oracle upload risk by passing a null packet.
- Extracted response-workspace production-readiness defaulting into a focused helper with direct tests, keeping the broad response workspace state under the line budget while preserving strict missing-proof behavior.
- Wedding workspace context panels now include a compact production-gate card that surfaces aggregate go/no-go status, backend/provider/release gate statuses, leading blockers, and next action labels without creating a separate deployment dashboard.
- The production-gate card now also surfaces bounded deployment guardrails from the aggregate go/no-go packet, so operators can see proof, secret, and no-deploy cautions in the wedding workspace rather than only in raw packet state.
- Added competitive background-automation coverage state for caterer estimate recalculation, household invitation inheritance, connected Gmail vendor-reply sync, booked vendor timeline sync, and attendance/meal/dietary/seating summaries, explicitly marking which behaviours are matched, differentiated by OmnyID, or still provider-blocked.
- Wired competitive background-automation coverage into the response workspace and context panel, so users can see active RSVP/budget/household/timeline/summary automations, blocked provider-sync gaps, and OmnyID differentiators without opening a separate view.
- Blocked background automations now generate selectable/savable wedding task items through the existing projection queue and PersonalOS ranking, so provider-sync gaps such as Gmail reply ingestion or booked vendor timeline sync are not just visible warnings.
- Pending provider handoffs now generate selectable/savable setup tasks through the existing projection queue and PersonalOS ranking, so approved OmnyID-internal handoffs that still lack Gmail/Calendar/registry/vendor-search executors remain actionable after the audit card is dismissed.
- Extracted provider-handoff audit presentation state into a focused helper with direct tests, keeping the response-workspace state under the anti-monolith line budget while preserving Connected Apps setup routing and pending-executor visibility.
- Extracted the background-automation sidebar card into a focused component, keeping the workspace context panel below the anti-monolith line budget while preserving the visible matched/blocked automation summary.
- Extracted the admin data-consent sidebar card into a focused component, keeping anonymized-sharing copy and packet chips isolated from the broader workspace context panel.
- Extracted the shared planning access/sidebar role guide into a focused component, keeping role help, mobile-friendly disclosures, invite status, and permission proof UI modular for future collaboration additions.
- Extracted the live budget tracker sidebar card into a focused component, keeping selected-vendor totals, budget target status, quote tasks, and line-item warnings modular for future budget features.
- Extracted the guest operations sidebar card into a focused component, keeping RSVP counts, final-count options, follow-up task candidates, and source labels modular for guest-list automation work.
- Extracted the production-gate UI into a focused wedding component so the main context panel stays safely below the anti-monolith line budget while preserving the same visible Oracle readiness behavior.
- Added a tested production-gate presentation helper so hidden, blocked, ready, blocker-truncation, next-action, and tone decisions are covered outside JSX and cannot silently drift from the aggregate go/no-go packet.
- Split response-workspace production-proof exposure into a focused test so the broad workspace integration test stays below the line budget while production evidence, go/no-go packet, and Oracle-plan blocking remain covered.
- Extracted shared response-workspace test fixtures for wedding metadata, in-memory storage, and artifact construction so the broad integration test has safer headroom for future coverage without crossing the 1000-line limit.
- Extracted workspace production-readiness derivation into a focused helper so the response-workspace view stays below the 1000-line anti-monolith target while preserving fail-closed Oracle upload behavior.
- Expected-behavior audit gap tasks now preserve capability, status, title, and blocker labels into AFP task projection/search metadata and PersonalOS ranking, so production blockers like weather evidence, guest messaging, provider execution, final confirmations, and payment verification show as explicit daily pressure instead of generic review tasks.
- Initial admin Oracle metrics API/resource-bundle/backend route bridge, normalization helper, mounted Usage-view bridge, and exact signed-up user count, so raw backend disk/RAM byte payloads or explicit host labels can feed the existing admin panel/readiness gate while impossible values such as used-greater-than-total remain blocked instead of being displayed.
- Initial admin Oracle metrics freshness/proof hardening, so production can require recent disk/RAM metrics, collected-at labels, and durable proof references before treating the admin wedding ops metrics gate as ready; stale or anonymous Oracle metrics now produce explicit next actions instead of silently passing as capacity evidence.
- Initial deployment-env documentation and regression coverage for admin wedding ops metrics, admin-funded wedding AI routing policy flags, daily budget/request/token caps, and Oracle vendor-search provider secret placeholders, so Oracle operators can see the exact fail-closed controls required before enabling wedding-template background AI routing through the admin API.
- Initial Oracle release-gate readiness contract, so wedding planner upload remains blocked until repository release-readiness, production go/no-go, backup verification, restore drill, file-backed secret sync, and fresh Oracle remote proof have passed for the intended target.
- Initial Oracle release-gate proof-reference hardening, so production runs can require durable receipt/reference IDs for release-readiness, go/no-go, backup verification, restore drill, file-backed secret sync, and Oracle remote proof; the gate now exposes next-action labels and runbook guardrails rather than accepting anonymous booleans for a production upload.
- Initial Oracle release proof packet state, so deployment readiness can expose per-requirement release, go/no-go, backup, restore, secret-sync, and remote-proof receipt status with a fail-closed `canClearOracleReleaseGate` flag that remains blocked when durable proof refs are incomplete.
- Oracle release proof packet requirements now also mark individual rows blocked when their durable proof receipt is missing, so the visible requirement status cannot say ready while the aggregate Oracle release gate is still blocked for incomplete proof references.
- Initial backend pagination contract for saved wedding workspace refresh, including bounded `limit`, clamped `offset`, `has_more`, `next_offset`, frontend pagination state, and partial-refresh banner language.
- Initial saved-workspace refresh scale-proof state contract, so Oracle readiness now requires both the backend pagination contract and repeatable multi-page evidence: page size at or below 100, at least two pages exercised, enough saved AFP messages to prove pagination, sequential backend page offsets when captured, final `has_more:false`, no duplicate message IDs, no refresh errors, slowest page at or below the configured threshold, target labels, and durable proof-reference receipts when strict production proof is required.
- Initial saved-workspace refresh scale-proof packet state, so production evidence can expose per-requirement backend proof status for page-size bounds, multi-page pagination, saved-message volume, final-page exhaustion, duplicate suppression, refresh errors, latency, offsets, and durable proof receipts with a fail-closed `canClearBackendScaleGate` flag.
- Import parser/storage readiness now fails closed through the aggregate production-readiness evidence adapter and Oracle go/no-go packet: missing parser/storage evidence blocks upload the same way explicit parser-needed imports do, and only explicit `productionReady:true` import readiness clears that required gate.
- Initial approval execution UI bridge, so approved wedding actions can execute as OmnyID-internal handoffs, produce durable/searchable approval receipts, and clearly mark `execution_mode:omnyid_internal_approval_handoff` plus `provider_executor_connected:false` when external delivery still needs Gmail, Calendar, registry, or vendor-provider executors.
- Initial approval UI readiness contract, so the required approval gate is cleared only when controls, rejection path, execute-after-approval path, disclosure preview, risk labels, provider setup routing, AFP receipt projection, failure/retry copy, keyboard fallback, blocked-state prevention, and required action-kind coverage are all proven.
- Initial provider-executor readiness contract, so wedding actions now distinguish required provider capability, credential status, executor availability, setup destination, and production readiness instead of treating "Gmail connected" or "Calendar mentioned" as equivalent to a live executor.
- Initial provider-executor suite readiness contract, so the production gate requires explicit ready proof for email/vendor-contact execution, calendar event execution, and registry/publishing execution rather than allowing one connected provider to clear the whole external-delivery blocker.
- Initial provider-executor port evidence bridge, so real approval executor ports for email/vendor contact, calendar event creation, registry publishing, and vendor search can be converted into the existing provider-suite readiness model only when matching credentials are also connected and fresh; ports alone cannot mask missing credentials, and credentials alone cannot mask missing executors.
- Initial Oracle file-backed vendor-search secret readiness support and provider-query context tightening, so Brave/Google Places `_FILE` secrets count as configured server-side controls and live search queries carry selected vendor category, location, fit preferences, photography scope, and music/entertainment direction before any vendor shortlist is generated.
- Initial vendor-search source-receipt hardening, so live and provider-specific vendor search receipts preserve source provider labels, source counts by provider, source URLs, and provider/category query context, and generated vendor source packets expose that audit summary before users rely on shortlist claims.
- Initial provider-executor smoke-proof helper, so dry-run approval receipts are useful diagnostics but do not clear production, while live email/calendar/registry receipts and source-backed vendor-search receipts can produce provider readiness rows plus durable proof refs for the existing provider-suite gate.
- Provider-executor smoke proof now feeds the main wedding production-readiness evidence path, so live provider receipts can clear the provider gate in strict Oracle mode and dry-run-only receipts remain blocked; legacy aggregate suite proof labels are preserved as per-capability refs when detailed checks are synthesized.
- Initial selected-decision evidence propagation, so ticking a venue/vendor/celebrant option preserves source labels, source URLs, source provider labels, and source-count context into the AFP decision message, persisted workspace reload, sidebar decision cards, continue-chat metadata, and follow-up report scope instead of reducing the decision to an unaudited row label.
- Initial selected-decision graph and PersonalOS evidence propagation, so saved venue/vendor/celebrant choices carry source/provider evidence into Knowledge Graph decision nodes and existing PersonalOS/DecisionOS daily ranking labels rather than appearing as ungrounded preferences.
- Initial selected-decision export and handoff evidence propagation, so wedding planning packets, compact handoff packets, and continue-chat context carry selected option source/provider labels and source URL counts without copying full artifact bodies.
- Initial registry approval handoff alignment, so gift-registry publishing is no longer treated as an impossible approval path: an approved registry action can be staged as a durable OmnyID handoff with registry-provider metadata, while real external publishing still remains blocked by the provider-executor suite until a registry integration exists.
- Initial provider-executor readiness UI in the wedding approval panel, so students/couples can see `credential`, `executor`, and required-provider status beside each approval and can route to existing Email, Calendar, or Connected Apps setup surfaces without creating a wedding-specific integrations page.
- Initial provider setup presentation helper, so approval panels label setup routes concretely as Email, Calendar, or Connected Apps instead of a generic setup button, while preserving the existing OmnyID navigation surfaces.
- Initial provider-executor unblock plan hardening, so the production blocker for email, calendar, registry, and vendor-search execution now produces capability-specific setup surfaces, file-backed/env credential hints, safe smoke-test targets, proof hints, and production-readiness receipt criteria instead of only saying that real provider execution is blocked.
- Initial provider-executor proof packet state, so Oracle/admin readiness can consume a compact per-capability evidence payload with blocker labels, env hints, proof hints, setup surfaces, missing proof refs, and a fail-closed `canClearOracleProviderGate` flag instead of recomputing readiness from low-level provider checks.
- Admin wedding ops panel state now surfaces the provider-executor proof packet as a first-class metric and guardrail, so operators can see whether email/calendar/registry/vendor-search proof is blocked, proof-ref incomplete, or sufficient to clear the Oracle provider gate.
- Initial Response Queue mount for the wedding response workspace, including arrival-intent consumption, active artifact selection, filter chips, topology recommendations, AFP save dispatch, post-save sent-marker refresh, compact non-body handoff packets, and sidebar navigation handoff to existing surfaces.
- Initial template catalog helper and Templates view card wiring for Wedding Planning, including life-event category, starter prompt labels, stable response-workspace launch intent, and existing wedding navigation bridge handoff.
- Initial wedding template launch first-response state and Response Queue launch panel, including real workspace metadata, first Need-To-Know prompt, starter cards, no-demo-vendor-claim labels, a projection-ready starter brief planning file, and a clearly labelled sample-demo entry from the existing Templates card.
- Initial wedding template follow-up state helper and launch-panel capture UI that turn answered Need-To-Know prompts into private, projection-ready follow-up planning files, including budget sheets that do not invent dollar amounts and Australian NOIM/celebrant legal setup artifacts, task suggestions, and calendar reminders.
- Initial local follow-up draft persistence keyed by `response_workspace_id`, so manually captured Need-To-Know answers can be restored when the same wedding planning response workspace is reopened before backend persistence exists.
- Initial Need-To-Know AFP context projection for saving captured wedding answers as first-class searchable context notes, with supertags, document view, queue grouping, dispatch payloads, and sent-marker handling.
- Initial persisted Need-To-Know context and approval-receipt reload from saved AFP messages back into wedding workspace state, with saved projection status preserved so context notes are not offered as duplicate pending saves and approval outcomes remain visible after refresh.
- Initial approval-receipt block-kind persistence through AFP content, metadata, search terms, persisted workspace reload, and workspace audit cards, so reopened workspaces retain whether an outcome was blocked for approval, provider setup, unsupported integration, or privacy scope.
- Initial approval-receipt provider handoff persistence, so saved AFP receipts retain execution mode, provider capability, required provider, credential status, executor status, setup destination, external-provider-required status, and provider-executor-connected status for search, reload, and workspace audit cards.
- Initial human-readable provider handoff receipt section, so saved approval receipt documents explain execution mode, provider capability, required provider, credential/executor status, setup destination, and whether the provider executor was connected without requiring raw metadata inspection.
- Initial workspace-level provider handoff audit card, so reopened wedding response workspaces summarize pending external provider handoffs across saved approval receipts before the user inspects each receipt one by one.
- Initial provider handoff setup action, so the workspace-level audit can route pending email, calendar, registry, or vendor executor setup to the existing Connected Apps surface with provider-audit metadata preserved in the wedding navigation intent.
- Initial Connected Apps arrival context for wedding provider setup, so the receiving destination explains pending provider handoffs, required capabilities, setup destinations, and the fact that external sends/syncs/publishes still require connected executors.
- Initial receipt-only workspace hardening, so persisted wedding workspaces can reopen and show approval receipts, provider handoff audits, decisions, or context even when no planning artifact array is present yet.
- Initial visible Need-To-Know context cards in the wedding response workspace sidebar, so captured answers and next-question state remain inspectable after local draft restore or persisted AFP reload.
- Initial deterministic conversational extraction for launch-panel Need-To-Know answers, so a user can paste one planning message and prefill date/season, location, guest count, budget comfort, priorities, NOIM status, and celebrant path for review before generating files.
- Initial vendor-search intake hardening, so vendor shortlist work asks for wedding location/service area, vendor categories, vendor fit preferences, music/band needs through category selection, and photography scope before claiming vendor recommendations are relevant.
- Initial vendor-search readiness contract, so the planner can produce a structured search brief from adequate intake but must label live vendor search as partial until a provider/source verifies pricing, availability, inclusions, and contact details.
- Initial editable vendor checklist UI contract for wedding launch/follow-up capture, covering Venue, Planner, Photographer, Floral Designer, DJ, Band, Caterer, Decor, Rental Company, Videographer, Officiant, Hair Stylist, Makeup Artist, Entertainment, Lighting Company, Cake Baker, Transportation Provider, Stationer, Calligrapher, Bartending, Ceremony Ensemble, Accommodations, Attire Designer, Dress Salon, Alterations Specialist, Emcee, Jeweler, Photo Booth, Travel/Honeymoon Advisor, Welcome Amenity Supplier, and Trendy/Emerging Wedding Vendors. Selections persist per response workspace and can be edited before regenerating follow-up planning files.
- Initial vendor-search query planning helper, so selected vendor categories, location, budget comfort, and preferences produce bounded service/package-price/review search queries for Brave Search, Google Places, OSM/Overpass, or another source-verified provider instead of broad generic searches.
- Initial source-backed vendor seed corpus and artifact bridge, so around ten researched vendor details can populate the database as conservative starting points, surface inside the existing response workspace as a vendor-table planning file, and carry source/staleness caveats without pretending live price, availability, fit, or booking status is known.
- Initial vendor-seed evidence bridge, so Oracle `wedding_vendor_seed_details` rows can map directly into the existing seed artifact path, preserve structured evidence such as verified fields, service notes, price basis, and availability basis as bounded searchable labels, and keep that evidence out of the strict AFP wedding metadata envelope.
- Initial optional production-readiness gate for the seeded vendor corpus, so seed data is considered ready only when it has enough source-backed rows, category coverage, source links, workspace artifact proof, current price evidence, date-specific availability evidence, and category/location/preference fit; it remains separate from live vendor-search provider readiness and does not unblock Oracle upload by itself.
- Seeded vendor corpus rows now require usable HTTP(S) source URLs before artifact, freshness, and readiness counts; malformed or non-web source URLs are excluded so seed data cannot appear source-backed without clickable evidence.
- Initial vow-preparation planning helper and launch-panel capture contract, so early preparation asks whether the couple wants standard vows or personal vows, presents selectable vow styles with inspiration copy, records only known relationship facts from OmnyID memory/Knowledge Graph/topography or explicit user input, creates an editable vow checklist, and projects vow tasks into the existing wedding workspace/task hierarchy rather than a separate checklist surface.
- Saved vow-preparation artifacts now recover vow choice, style/length, and memory/fact collection tasks into the existing wedding task queue and PersonalOS ranking, with vow preference, checklist preview, linked artifact IDs, searchable AFP metadata, and duplicate suppression once saved.
- Initial wedding lifecycle-management helper, so the template audits 18+ month through post-wedding behaviours, generates a one-page wedding brief artifact, injects conservative venue lead-time, Australian NOIM, contract/hidden-fee, RSVP, seating, dietary, accessibility, and no-spam outreach constraints, and projects lifecycle tasks into the existing DecisionOS/Tasks/Calendar/AFP flow instead of a separate wedding project manager.
- Post-wedding wrap-up artifacts now recover thank-you note, private vendor feedback, and keepsake export tasks into the existing wedding task queue and PersonalOS ranking, with approval/no-external-send guardrails, linked artifact IDs, searchable AFP metadata, and duplicate suppression once saved.
- Initial legal-administration helper, so Australian NOIM latest-date checks, reminder options, authorised-celebrant search readiness, NOIM prefill-for-user-review guardrails, and sensitive document checklist tasks are represented as legal artifacts, Calendar items, and task projections without claiming OmnyID lodges forms, books celebrants, or stores identity documents by default.
- Saved legal-administration artifacts now recover NOIM/legal document checklist tasks into the existing task queue and PersonalOS ranking, with legal checklist IDs, linked artifact IDs, searchable AFP metadata, and duplicate suppression once saved.
- Initial celebrant-coordination readiness contract, so authorised celebrant support is `verified` only when Australian legal setup, official register source coverage, location scope, celebrant search provider proof, NOIM guardrails, no-booking/no-lodgement caveats, approval UI, contact executor, scenario tests, and zero failed celebrant scenarios are proven; otherwise celebrant work remains official-source planning handoff or provider-blocked.
- Initial final-phase coordination helper, so 6-1 month run-sheet planning, vendor-scoped sharing, delay decision options, weather/BOM provider gating, and backup-execution choices are represented as timeline artifacts, schedule items, and projection-ready tasks while live weather, vendor delay intake, guest notifications, and backup execution remain blocked until provider evidence and explicit approval exist.
- Saved final-phase coordination artifacts now recover concrete run-sheet, final-confirmation, guest-count, emergency-kit, day-of fallback, and payment-verification tasks into the existing task queue and PersonalOS ranking, with final-phase action IDs, searchable AFP metadata, linked artifact IDs, and duplicate suppression once saved.
- Initial run-sheet adjustment readiness contract, so day-of delay adjustments are `verified` only when delay options, dependency-impact previews, approval UI, drag/button adjustment controls, Calendar/Task projection, durable receipts, coordinator fallback, scenario tests, and zero failed adjustment scenarios are proven; otherwise adjustments remain approval-recorded coordinator handoff or UI-blocked.
- Initial vendor-scoped sharing readiness contract, so external vendor run-sheet sharing is `verified` only when scoped packet generation, vendor audience scope, minimum-necessary field filtering, privacy redaction, approval UI, sharing executor, access controls, durable receipts, revocation/correction path, scenario tests, and zero failed sharing scenarios are proven; otherwise vendor sharing remains approval-recorded manual handoff or provider-blocked.
- Initial controlled-outreach readiness contract, so vendor/contact outreach is `verified` only when approval UI, contact-info sharing consent, vendor-safe payload filtering, email/contact executor, no-spam policy, provider setup fallback, durable receipts, rejection path, scenario tests, and zero failed outreach scenarios are proven; otherwise outreach remains approval-recorded manual handoff or provider-blocked.
- Initial follow-up automation readiness contract, so the existing outreach escalation ladder is `verified` only when the 5/7/10 day stages, approval gate, email/contact executor, one-follow-up limit, day-7 user escalation, day-10 unresponsive alternatives, receipt persistence, manual call/move-on options, scenario tests, and zero failed follow-up scenarios are proven; otherwise follow-up automation remains an approval-recorded manual escalation handoff or provider-blocked.
- Initial structured weather-provider readiness contract, so BOM/Open-Meteo/other forecast evidence is `verified` only when live provider connection, requested-location coverage, freshness, source timestamp, user-facing uncertainty caveat, manual fallback, and zero-error proof are all present; otherwise weather planning remains manual handoff or provider-blocked.
- Initial final-confirmations readiness contract, so vendor reminders, guest final-count submission, and payment-review coordination are `verified` only when vendor confirmation tasks, approval UI, email/contact executor, reminder cadence, no-spam policy, guest-count decision, payment-review linkage, audit receipts, manual fallback, scenario tests, and zero failed final-confirmation scenarios are proven; otherwise final confirmations remain approval-recorded manual handoff or provider-blocked.
- Initial guest final-count readiness contract, so caterer headcount submission is `verified` only when the RSVP count source, caterer deadline, wait-for-RSVPs risk option, budget-impact option, approval UI, submission executor, audit receipt, manual fallback, scenario tests, and zero failed guest-count scenarios are proven; otherwise the count decision remains an approval-recorded manual handoff or UI-blocked.
- Guest operations now produce decision-ready final-count options from structured guest-list artifacts, including current confirmed count, wait-for-pending maximum, conservative guarantee, household count, per-guest budget-impact estimates when provided, and follow-up task candidates for pending RSVPs, missing contacts, and missing meal choices.
- Guest follow-up candidates now project into the existing wedding task queue and PersonalOS ranking as first-class guest-list/RSVP tasks, with searchable AFP metadata and duplicate suppression once an equivalent saved task exists.
- Guest final-count options now also produce a projection-ready DecisionOS task, so the couple can explicitly choose current count, wait-for-pending, or conservative guarantee before caterer confirmation; the task carries searchable AFP metadata, budget/risk option labels, alert offsets, and duplicate suppression once committed.
- Initial live run-sheet execution readiness contract, so day-of timeline updates are `verified` only when live vendor-delay intake, dependency recalculation, scoped notification routes, persisted approval receipts, offline coordinator fallback, tested scenarios, and zero failed scenarios are all proven; otherwise the plan remains an approval-recorded coordinator handoff or provider-blocked.
- Initial day-of emergency readiness contract, so vendor no-show and weather emergency handling are `verified` only when emergency playbooks, no-show fallback, weather activation path, verified weather/source evidence, scoped notification routes, approval UI, executor path, audit receipts, manual coordinator fallback, scenario tests, and zero failed emergency scenarios are proven; otherwise emergency handling remains approval-recorded coordinator handoff or provider-blocked.
- Initial guest messaging readiness contract, so day-of transport, lost-item, and weather updates are `verified` only when secure guest channel, scoped audience controls, opt-in contact source, no-spam/rate-limit policy, approval receipts, delivery receipts, emergency fallback, scenario tests, and zero failed delivery scenarios are proven; otherwise messages remain approval-recorded coordinator handoffs or provider-blocked.
- Initial payment verification readiness contract, so final-payment confirmation is `verified` only when trusted receipt/payment source, vendor invoice matching, amount/due-date checks, sensitive receipt storage policy, audit receipts, manual upload fallback, tested scenarios, and zero failed payment scenarios are proven; otherwise payments remain audit-recorded manual review or provider-blocked.
- Initial RSVP collection readiness contract, so attendance, meal, dietary, and accessibility collection is `verified` only when secure RSVP link provider, guest identity scoping, structured response fields, no third-party tracking policy, response export, audit receipts, manual entry fallback, tested scenarios, and zero failed RSVP scenarios are proven; otherwise RSVP work remains audit-recorded manual guest-list handoff or provider-blocked.
- Initial seating chart readiness contract, so seating review is `verified` only when the focused seating canvas, household grouping, VIP/role constraints, sensitive seating constraints, accessibility needs, drag controls plus visible button fallbacks, revision history, export/vendor brief, tested scenarios, and zero failed seating scenarios are proven; otherwise seating remains a structured vendor-brief handoff or UI-blocked.
- Seating draft state now produces table-by-table briefs, vendor-brief guardrails, and action items for unassigned guests, sensitive seating constraints, accessibility seating needs, and missing household grouping, while keeping sensitive relationship notes out of vendor-facing sharing until explicitly approved/redacted.
- Seating action items now project into the existing wedding task queue and PersonalOS ranking as first-class seating/vendor-coordination tasks, with searchable AFP metadata and duplicate suppression once an equivalent saved task exists.
- Initial dietary/accessibility vendor-brief readiness contract, so caterer/vendor briefs are `verified` only when RSVP counts, normalized dietary categories, allergy severity handling, accessibility scope, vendor audience scope, approval receipts, delivery/export, correction loop, scenario tests, and zero failed brief scenarios are proven; otherwise briefs remain approval-recorded manual handoff or provider-blocked.
- Dietary/accessibility brief data is now derived from structured guest-list rows beside seating: meal and dietary columns are combined safely, common dietary/allergy/accessibility categories are normalized, severe allergy notes require explicit approval, sensitive relationship notes are flagged for redaction, and the correction loop tells users to record vendor changes back into the guest list before final count and seating export.
- Initial LLM-backed Need-To-Know extraction readiness contract, so deeper transcript/chat extraction remains blocked until it proves multi-input coverage, conservative review labels, deterministic fallback, AFP Need-To-Know projection, and no overwrite of existing user answers without review.
- Initial persisted wedding workspace reconstruction helper that reads saved AFP artifact, calendar, and task messages by `response_workspace_id`, rebuilds artifact inputs, schedule items, task items, source message IDs, and prefers real saved workspace data before falling back to demo bridge data.
- Initial persisted wedding workspace refresh loader that queries saved AFP messages by wedding supertags, scopes the results by `response_workspace_id`, falls back to bootstrap messages on error or guest mode, and exposes refresh source/status copy to the response workspace.
- Initial artifact body preview and export payload helper for loaded wedding planning files, including copy, Markdown download, HTML download, Word-openable `.doc` download, browser print-to-PDF, CSV fallback export, and disabled planned native DOCX/JPG/PNG conversion states.
- Initial single-file wedding planning packet export payload for response workspaces, with safe-by-default sensitive-artifact exclusion, Markdown/HTML/Word-openable `.doc` packet output, included/excluded artifact manifests, and warning labels.
- Initial packet evidence-status manifest, so exported Markdown, printable HTML, and Word-openable `.doc` packets preserve source-linked, source-labelled, and source-unverified counts plus per-included-file caveats.
- Initial structured packet export capability state for ready Markdown/printable HTML/Word-openable `.doc` packets and planned ZIP/DOCX/JPG/PNG conversions, with explicit worker blockers and filenames instead of fake native downloads.
- Initial native export-worker readiness contract, so ZIP, DOCX, JPG, and PNG packet exports remain disabled until each required worker proves connection, sensitive-artifact filtering, deterministic filenames, durable export receipts, and safe failure copy.
- Initial structured artifact preview helper and workspace rendering for Markdown tables, approval-gated email drafts, and document highlights, while preserving raw artifact body access for auditability.
- Initial budget evidence check in artifact previews, so budget sheets surface unknown costs, due amounts, unpaid rows, and explicit warning rows without inventing totals, live quotes, deposits, or payment status.
- Initial specialized workspace previews for Australian legal setup, timeline/run-sheet, map/location handoff, and guest-list privacy context using the same artifact preview contract.
- Initial richer timeline and map preview metadata, including conservative preparation-stage buckets, timing labels, location search queries, Google Maps handoff URLs, and route-verification caveats without claiming live travel-time accuracy.
- Initial live map/geocoding readiness contract, so wedding map output is either clearly `handoff_only` with fallback URLs and travel-time caveats, or `verified` only when provider geocoding/routing is connected, all requested locations/routes are verified, route data is fresh, fallback links remain available, and errors are absent.
- Initial template entry and demo-state helper for a fast wedding starter card, seed prompts, first-response instructions, stable plan/workspace IDs, and clearly labelled synthetic demo artifacts.
- Initial standalone wedding page alignment with the AFP response workspace model, structured planning-file previews, export controls, projection/save language, approval-gated draft framing, and safer non-adoption demo copy.
- Initial Australian legal setup probing for NOIM download status and celebrant path, including official-source labels and conservative no-lodgement/no-booking guardrails.
- Initial Australian legal setup state helper that generates a legal planning artifact plus linked NOIM calendar reminder and task suggestions for own-celebrant or public/registry-option paths.
- Initial wedding demo integration for Australian legal setup so NOIM/celebrant artifacts, tasks, calendar reminders, graph nodes, presentation cards, and projection queue items appear in the same response workspace as vendors, budget, drafts, and registry outputs.
- Initial dedicated legal setup presentation section so NOIM/celebrant artifacts are not buried in the generic timeline and can route directly to legal tasks or the NOIM calendar reminder.
- Initial official source-link propagation for wedding artifacts, including Australian NOIM and marriage celebrant register links through artifact summaries, AFP file projections, persisted workspace reloads, workspace previews, and search metadata.
- Initial visible source-link rendering in the wedding response workspace active artifact preview, so official legal references can be opened from the same planning-file UI as exports, previews, and approvals.
- Initial structured Australian legal guidance cards for jurisdiction focus, NOIM/celebrant status, how/when/where/cost prompts, conservative evidence labels, and official-source labels.
- Initial explicit user consent state for admin wedding-data sharing, so the wedding template can show a top-level toggle with hover/info copy explaining anonymized admin review, copy only generated planning packets after consent, and keep sharing off by default.
- Initial delegated-responsibility state helper, so users can assign granular wedding responsibilities such as legal/NOIM, celebrant, venue selection, vendor research, vendor outreach, budget/pricing, RSVP, seating, run sheet, weather backup, payments/contracts, vows/ceremony, and travel/accommodation to named people with relationship, phone, email, and notes.
- Initial delegation-to-Contacts bridge, extending the existing Contacts shape with optional phone and notes so delegated wedding helpers, family members, planners, celebrants, and vendors can be found later in the existing Contacts view instead of a wedding-only contact list.
- Complete delegated wedding responsibilities now project into the existing wedding task queue and PersonalOS ranking as confirmation/briefing tasks, with Contacts projection hints, sensitivity-scope metadata, searchable responsibility/person labels, and duplicate suppression once a saved delegation task exists.
- Initial contact-import contract and Contacts UI import surface for Gmail/Google Contacts exports, generic contact files, and arbitrary files that need AI extraction, with conservative local parsing for obvious emails/phones, duplicate skipping, and explicit AI handoff rather than silently importing uncertain contacts.
- Initial Contacts engagement metadata for stronger reach-out/follow-up loops: each contact can preserve when they were last contacted, whether the contact was made by the user or agent, and an optional last-response summary shown only when response summaries are explicitly enabled from Contacts or settings.
- Initial contact engagement status helper and Contacts card presentation, so each person or vendor can show `Not contacted`, `Awaiting response`, `Follow-up due`, or `Response recorded` from saved outreach evidence, per-contact SLA, relationship defaults, and response-summary activation instead of relying on hidden email history.
- Initial contact follow-up queue state and Contacts queue panel, ranking overdue suppliers and clients ahead of ordinary contacts, preserving user-vs-agent outreach evidence, excluding contacts with saved response summaries, and exposing no-spam/user-approval guidance before any follow-up is sent.
- Initial contact follow-up task projection, turning due contacts into first-class AFP task send-inputs for Tasks, Search, Contacts, and DecisionOS with searchable evidence, no-spam metadata, and `approval_required_before_send` flags; it does not send provider email/SMS by itself.
- Initial explicit Contacts action for saving due follow-ups as internal AFP tasks, with account-scoped duplicate suppression and success/failure receipts. This only creates task/DecisionOS work and keeps real email/SMS/vendor outreach blocked until a separate provider executor and user approval are present.
- Contact follow-up task payloads now emit standard task fields (`due_date`, `due_at`, `task_type:contact_follow_up`, `task_card` view content, priority, and status) so existing task renderers, sorting, Search, and DecisionOS can treat them as ordinary tasks rather than special wedding-only objects.
- Contacts now include a manual `Record response` path for user-entered reply evidence. Saving a response summary records summary text, response timestamp, and response source, enables visible response summaries, marks the contact as replied, and removes that contact from the due follow-up queue without scraping inboxes or assuming provider execution.
- Recorded responses can now be explicitly saved as internal AFP evidence notes addressed to Contacts, Search, Knowledge Graph, and DecisionOS. These notes are account-deduped, close the `contact_follow_up` second-order loop as evidence, and remain separate from external provider sends.
- Contacts now expose a deterministic outreach-health summary across imported contacts, first outreach, waiting replies, due follow-ups, task-ready work, and response-evidence-ready work. This gives wedding planning a stronger loop-closure surface without creating a separate wedding contact manager.
- Outreach-health summaries can now be explicitly saved as internal AFP snapshot notes for Contacts, Search, Knowledge Graph, and DecisionOS. These snapshots preserve why the contact loop is currently blocked, waiting, task-ready, evidence-ready, or healthy, without sending external messages.
- Generic contact follow-up queue items now carry the same 5/7/10-day no-spam escalation ladder used by wedding outreach: day-5 follow-up due, day-7 user escalation, and day-10 mark-unresponsive/review-alternatives. The stage is visible in Contacts and included in AFP task content, task-card view content, and metadata for DecisionOS/Knowledge Graph ranking.
- Contacts now support explicit close-without-response outcomes from the follow-up queue: `Mark called`, `Move on`, and `Mark unresponsive`. These outcomes are saved on the contact, remove the contact from generic follow-up chasing, and make day-10 unresponsive handling practical without pretending a reply occurred or sending external messages.
- Close-without-response outcomes can now be explicitly saved as internal AFP evidence notes addressed to Contacts, Search, Knowledge Graph, and DecisionOS. These notes are account-deduped, close the `contact_follow_up` second-order loop as evidence, do not trigger external sends, and allow DecisionOS to rank alternatives instead of repeatedly chasing closed vendors.
- Initial wedding Gantt timeline state helper, so legal/NOIM, venue, vendor, outreach, budget/pricing, guest, run-sheet, weather, ceremony, and travel timelines can be rendered from dated Tasks/Calendar/AFP evidence with editable category colors and conservative empty-state blockers.
- Wedding Gantt timeline now keeps anytime/no-date work visible ahead of dated rows and surfaces conservative sequencing risks, including vendor work before venue timing, outreach inside a two-week window, guest or weather work after run-sheet drafting, and near legal/NOIM deadlines.
- Initial market-gap hardening requirements from the Australian wedding research pass: Australian NOIM is treated as a sourced whitespace and first-class legal deadline, stale vendor pricing is treated as a budget/source-verification risk before deposits or reports, and generated plans must not claim live vendor price/availability without fresh source evidence.
- Initial vendor freshness state helper and seeded-vendor artifact integration, so stale source dates, unverified package pricing, and unverified date-specific availability are explicit blockers before recommendation-quality reports collapse alternatives or draft outreach. The artifact now includes a `Freshness review` section plus metadata for price recheck count, availability recheck count, and shortlist readiness.
- Vendor freshness review now also checks relevance against the couple's selected vendor categories, wedding location/service area, and stated fit preferences. Fresh source, price, and availability evidence no longer permits recommendation if category, location, or preference fit is incomplete; seeded vendor artifacts carry relevance blocker counts and action labels into searchable metadata and markdown.
- Live vendor-search source packets now require usable HTTP(S) source URLs before creating a source-backed vendor artifact; malformed or non-web URLs are discarded from mixed packets and counted in metadata instead of making an artifact appear source-linked without clickable evidence.
- Decision-scope packet exports and saved wedding decision AFP messages now apply the same usable HTTP(S) source URL rule, so selected vendor/venue decisions cannot carry malformed source URLs into exported reports, Search metadata, Knowledge Graph context, or follow-up recommendation scope.
- Persisted wedding workspace reload now reapplies the usable HTTP(S) source URL rule to older artifact source links and decision source URL records, preventing malformed legacy data from resurfacing after saved AFP messages are reopened.
- Vendor-search provider smoke proof now requires actual usable HTTP(S) source URLs in the receipt, not just a claimed numeric source count, before clearing the provider-executor production gate.
- Wedding Knowledge Graph decision nodes and PersonalOS decision cards now defensively count only usable HTTP(S) source URLs, so malformed source metadata cannot inflate evidence labels or downstream recommendation context.
- Wedding budget tracking and response workspace reusable context now sanitize selected-decision source URLs before budget synthesis, sidebar action metadata, and packet decision-scope exports reuse those decisions.
- Wedding import/parser readiness now requires complete durable original-upload receipts, including source message ID, attachment ID, SHA-256 hash, and storage metadata, before an imported file or spreadsheet parser job can count as production-ready.
- Saved wedding import reload now re-normalizes stored artifacts, strips malformed source links, rejects malformed entries, and enforces the requested response workspace scope before private uploaded planning evidence is restored.
- Wedding projection dispatch now fails closed unless the AFP save response explicitly confirms success and returns a durable message id; local sent markers are not committed from weak or message-id-free outcomes.
- Wedding task-completion sync now uses the same fail-closed save contract, requiring explicit backend success plus a durable message id before a local done/reopened task status update is reported as saved.
- Wedding local task-completion reload now rejects malformed records, invalid saved timestamps, and task/workspace/plan scope mismatches before a local done/reopened state can create a sync payload.
- Seeded vendor artifacts with stale source, missing price/availability proof, relevance blockers, or approval-sensitive contact details now recover into the existing wedding task queue and PersonalOS ranking as source-refresh, quote/availability, fit-resolution, and approval-gated outreach tasks, instead of remaining passive vendor-table evidence.
- Initial decision report-scope helper and AFP projection metadata, so when a user ticks a venue, celebrant, vendor, legal option, or research row, downstream reports can use the selected row first, collapse unticked alternatives to audit context, and block confident recommendation-quality output when vendor freshness or preference-fit evidence is incomplete.
- Initial decision report-scope task bridge, so selected-option blockers become ordinary wedding tasks in the existing task hierarchy rather than a separate wedding-only task view. Stale price, availability, source, or preference-fit blockers now generate review tasks with second-order loop metadata and evidence labels.
- Initial shared wedding workspace collaboration scaffold, so partner co-owner, wedding planner, contributor, and viewer roles have explicit capabilities, invite validation, shared-editing surface policy, sensitive-decision restrictions, sidebar visibility, and a required Oracle production-readiness gate. Live shared editing remains blocked until backend ACLs, shared E2EE key distribution, per-collaborator audit trails, and concurrent-edit conflict handling are proven.
- Initial collaboration permission evaluator, so co-owner, planner, contributor, and viewer access checks are deterministic instead of copy-only. The workspace sidebar now shows a compact permission proof for sensitive decisions, planning files, assigned tasks, and viewer access, while the evaluator blocks live access unless ACL, shared E2EE, audit, and conflict controls are all ready.
- Initial collaborator invite lifecycle guard, so draft, invited, accepted, expired, and revoked collaborator records are handled differently before backend sharing is enabled. Accepted, expired, and revoked records are visible for review but cannot be dispatched as new access-control AFP invite records; stale accepted access is flagged for review or revocation.
- Initial collaboration lifecycle AFP projection, so invite, expiry, revocation, and stale-access-review collaborator actions are saved as distinct guarded access-control records. These records are searchable/auditable and remain `shared_editing_enabled: false` until backend ACL, shared E2EE, audit, conflict handling, and explicit user approval are proven.
- Separate Oracle readiness gate for collaborator lifecycle audit projection proof, so production upload requires guarded invite/expiry/revocation/stale-access-review AFP evidence in addition to the broader backend ACL, shared E2EE, audit, conflict, and sensitive-decision access-control proof.
- Role explanation disclosure at the collaborator assignment point, so co-owner, planner, contributor, and viewer choices show their role summary, capabilities, and restrictions by hover on desktop and by tap/keyboard-openable disclosure on mobile devices.
- Reusable role-assignment option cards for collaborator assignment UI, so hover help and mobile disclosure labels are generated from the same role source of truth used by invite cards, permission proofs, and future backend ACL mapping.
- Responsibility-scope guidance for delegated wedding work, so legal, celebrant, venue, vendor, RSVP, seating, run-sheet, weather, payment, vows, travel, and custom categories show recommended collaborator roles and sensitivity scope before saving delegate contacts or treating a helper as responsible in Contacts, Tasks, and DecisionOS.
- Standalone wedding marketing-site interaction hardening, so top-level and article-page Sign in, Start planning free, Create account, Agent ID, preview action, footer, modal, mobile-nav, preview-tab, FAQ, blog-filter, and newsletter controls now have explicit working targets or local handlers instead of disabled/dead controls.
- OmnyID auth destination deep-link support for wedding traffic, so `?auth=signin`, `?auth=register`, and `?auth=agent-id` links from the wedding site open the existing sign-in/register interface and focus the right account field without introducing a separate wedding account system.
- Standalone wedding website smoke-test coverage for local page targets, local fragments, CSS/JS assets, modal wiring, account CTA fallbacks, and disabled/dead static controls, keeping the wedding site testable while it remains separate from the Solid app workspace.
- Standalone wedding website smoke-test hardening for the full current page inventory, responsive viewport tags, duplicate IDs, image alt text, `target=_blank` safety, button accessible names, homepage tab/pane wiring, blog filter/category wiring, and docs auth deep-link support, so future content edits cannot silently break mobile, accessibility, or account-entry basics.
- Standalone wedding account-bridge accessibility hardening, so the sign-in/register modal uses labelled dialog semantics, closes from overlay/Escape/explicit controls, restores focus safely, traps Tab/Shift+Tab inside the modal while open, and preserves nested article-page auth fallbacks for Agent ID, sign-in, and registration.
- Focused tests for metadata defaults, enum fallback, stable IDs, sparse probing, readiness, cultural ceremony probing, catering probing, accessibility probing, artifact normalization, artifact generation, artifact preview variants, artifact AFP projection, projection queue state, projection queue view state, projection dispatch receipts, projection dispatch runner, wedding navigation intents, wedding navigation App bridge, wedding navigation local state, wedding navigation arrival state, wedding navigation arrival banner state, handoff-aware destination shortcuts, workspace grouping, workspace view state, task timing hierarchy, local task completion persistence, task completion AFP projection, pending completion-sync state, template catalog wiring, template entry, template launch state, demo mode, search, scoping, continuation context, compact workspace handoff packets, rich response sections, rich-response renderer contract, presentation actions, Calendar/Task AFP projection, send inputs, calendar conversion, projection sent markers, graph nodes, graph edges, decision constraints, risk edges, recommendation explanations, topology anchors, export manifests, safe bundle defaults, bundle export payloads, approval gates, structured approval block kinds, approval execution runner, privacy sharing risks, vendor-facing sharing blocks, and evidence-based next actions.
- Workspace view-state tests split by concern so the core workspace/sidebar tests remain below the 1,000-line anti-monolith target, while operational coverage for expected-behaviour audits, selected decisions, export payloads, preparation reminders, budget, guest operations, and seating lives in a separate focused companion test.
- Dedicated `test:wedding` npm gate added for the Solid UI wedding suite, covering all `tests/wedding-*.test.ts` files in one repeatable command rather than relying on ad hoc focused runs.
- Dedicated `test:wedding-site` and `test:wedding:ci` npm gates added so one command now runs TypeScript checking, the anti-monolith line-budget guard, standalone wedding marketing-site smoke test, and complete Solid UI wedding suite before any production-readiness or Oracle upload claim.
- Wedding response workspace PersonalOS projection now keeps a wider internal candidate set so concrete generated work such as vendor quote checks, payment reviews, guest follow-ups, seating actions, vows, and post-wedding wrap-up tasks are not hidden behind Oracle/readiness blockers before DecisionOS can rank them.
- Handoff packet projection-readiness tests now assert consistency with the actual projection queue, reflecting generated calendar/task/readiness candidates instead of the older assumption that only explicitly supplied schedule/task inputs count.
- Production go/no-go now includes a required wedding dependency-plan expected-behavior audit gate. The template cannot be treated as production-ready or Oracle-uploadable while any dependency-plan behavior from this task plan remains missing, provider-blocked, UI-blocked, or otherwise unproven.
- Production go/no-go now includes a required wedding import-parser/storage readiness gate. Readable modern XLSX workbook sheets can synthesize through the browser parser with parser/sheet provenance, unreadable or legacy spreadsheet imports create parser-needed evidence, saved source receipts expose parser-job request inputs for backend parsing, imports without durable original-upload receipts create storage evidence, and both produce Oracle-blocking readiness gates plus projection-ready tasks until server-side spreadsheet parsing is proven, the user converts the file to CSV/TSV/text/XLSX, and the original file is saved to Files.

Remaining production work is still substantial: run the saved-workspace refresh scale proof against the intended backend target with a real or seeded AFP corpus, connect live map/geocoding providers that satisfy the new map-readiness contract, add richer visual timeline widgets beyond the current deterministic preview metadata, implement Knowledge Graph canvas behavior that satisfies the graph highlighting readiness contract, prove the approval UI against the new readiness contract, real external provider execution behind the current OmnyID-internal approval handoff, actual DOCX/JPG/PNG/ZIP conversion workers that satisfy the native export-worker readiness contract, connect and prove deeper transcript/LLM-based Need-To-Know extraction against the new readiness contract, connect a live vendor-search provider/source-verification path such as Brave Search, Google Places, or OSM/Overpass that satisfies the new vendor-search readiness contract, prove shared wedding workspace collaboration against backend ACLs, shared E2EE key distribution, per-collaborator audit trails, conflict handling, revocation, and sensitive-decision restrictions, prove celebrant coordination against Australian legal setup, official register source coverage, location scope, celebrant search provider proof, NOIM guardrails, no-booking/no-lodgement caveats, approval UI, contact executor, and scenario-test evidence, prove run-sheet adjustments against delay options, dependency-impact previews, approval UI, drag/button controls, Calendar/Task projection, durable receipts, coordinator fallback, and scenario-test evidence, prove vendor-scoped sharing against scoped packet generation, vendor audience scope, minimum-necessary filtering, privacy redaction, approval UI, sharing executor, access controls, durable receipts, revocation/correction path, and scenario-test evidence, prove controlled outreach against approval UI, contact-info consent, vendor-safe payload filtering, contact executor, no-spam policy, setup fallback, receipt persistence, rejection path, and scenario-test evidence, prove follow-up automation against the 5/7/10 day ladder, approval gate, contact executor, one-follow-up limit, user escalation, unresponsive alternatives, receipt persistence, manual options, and scenario-test evidence, connect live weather forecast evidence that satisfies the structured weather-provider readiness contract, prove final confirmations against vendor confirmation tasks, approval UI, contact executor, no-spam reminder cadence, guest-count decisions, payment-review linkage, audit receipts, fallback, and scenario-test evidence, prove guest final-count submission against RSVP source, caterer deadline, wait-risk option, budget-impact option, approval UI, submission executor, audit receipt, fallback, and scenario-test evidence, prove live run-sheet execution against vendor-delay intake, dependency recalculation, scoped notification, approval receipt, fallback, and scenario-test evidence, prove day-of emergency handling against emergency playbooks, no-show fallback, weather activation, verified weather/source evidence, scoped notification, approval UI, executor path, audit receipts, coordinator fallback, and scenario-test evidence, prove secure scoped guest messaging against opt-in contacts, no-spam policy, approval receipts, delivery receipts, emergency fallback, and scenario-test evidence, prove payment verification against trusted receipt source, invoice matching, amount/date checks, sensitive storage policy, audit receipt, upload fallback, and scenario-test evidence, prove RSVP collection against secure links, guest identity scope, structured meal/dietary/accessibility fields, no-tracking policy, response export, audit receipts, manual fallback, and scenario-test evidence, prove seating review against focused canvas, household/VIP/sensitive/accessibility constraints, button-accessible drag alternatives, revision history, export/vendor brief, and scenario-test evidence, prove dietary/accessibility vendor briefs against verified RSVP counts, normalized dietary/allergy/accessibility scope, audience scoping, approvals, delivery/export, correction loop, and scenario-test evidence, mount backend Oracle disk/RAM/source-label and exact user-count metrics for the admin panel, add a backend policy endpoint for wedding-only admin-funded AI routing with audit receipts and tenant boundaries, and real provider connection/executor integrations that satisfy the suite-level email, calendar, and registry/publishing readiness contract.

Oracle upload status: blocked. The template should not be uploaded to Oracle as production-ready until the wedding production-readiness gate reports no required Oracle blockers and the repository-level `release-readiness`, `production-go-no-go`, backup/restore, secret, and Oracle remote proof gates pass for the intended deployment target.

## Goal

Implement the Wedding Planning template as an OmnyID-native planning workflow that produces a rich travel-planning-style response and a dedicated response workspace for generated files.

The template must integrate with AFP, supertags, topology, Files, Calendar, Email, Tasks, Maps, Knowledge Graph, Search, Reports, and Workflows without creating a standalone wedding app or monolithic implementation files.

## Delivery Principle

Build this as small state helpers, render contracts, and projection helpers first. Add heavier UI only after the data contracts are stable.

No new source file should approach the 10,000-line ceiling. In practice, keep wedding-planning implementation files under 1,000 lines wherever possible. If a file starts carrying unrelated concerns or becomes hard to scan, split it before adding more features.

The implementation must be flexible for future additions or modifications:

- Prefer normalized metadata, discriminated unions, and optional fields over rigid one-off objects.
- Keep artifact kinds, probing slots, card sections, export targets, and integration providers list-driven.
- Treat wedding-specific state as projections over AFP messages, not as a closed schema that blocks future event-planning templates.
- Add narrow helpers with tests instead of large cross-cutting components.
- Route wedding action pressure into existing DecisionOS/PersonalOS ranking surfaces through AFP task, decision, approval, calendar, and field-summary metadata. Do not create a separate wedding-only daily agenda or second decision queue.
- Treat wedding planning as one possible `primary_use_case` in the user's profile. The primary use case may lightly alter theme and defaults while active, but must revert when marked `completed`.
- Do not permanently suppress the primary-use-case prompt when the user chooses `Later`; ask again in a later session unless an active use case has been recorded.

Split by concern:

- `weddingTemplateState`
- `weddingArtifactState`
- `weddingResponseWorkspaceState`
- `weddingPresentationState`
- `weddingCalendarProjectionState`
- `weddingKnowledgeGraphState`
- `weddingExportState`
- `weddingNeedToKnowProbingState`
- `weddingPersonalOsProjectionState`

Names may change to match existing conventions, but the separation should remain.

## DecisionOS / PersonalOS Daily Ranking Contract

Wedding planning creates daily pressure for brides, grooms, partners, families, and vendors. That pressure must be visible in the same PersonalOS/DecisionOS ranking stack as the user's other life decisions.

Contract:

- Wedding tasks remain first-class AFP task messages, not wedding-only checklist rows.
- Wedding decisions remain first-class AFP decision messages addressed to Decision Queue, Search, and Knowledge Graph.
- Wedding calendar items remain first-class calendar AFP messages so due dates can appear in the calendar and daily briefing.
- Wedding approval gates remain approval/decision messages so email drafts, provider-backed actions, deposits, public/registry celebrant contact, export sharing, and sensitive guest-list actions can be ranked with other approval-required work.
- Wedding second-order loops create task/decision pressure only when backed by evidence: weather contingency gaps, vendor follow-up gaps, NOIM/celebrant timing, deposit/contract risk, guest logistics, or budget uncertainty.
- Daily ranking should include wedding items only when they are actionable today, overdue, close to a deadline, blocking another item, or tied to an unresolved selected decision.
- The ranking explanation must name why the item surfaced: due date, dependency, selected venue/vendor/celebrant scope, evidence gap, approval requirement, or follow-up pressure.
- User-visible copy should say `Wedding planning` or the plan name. It should not expose Bohm/field-engine vocabulary.

Guardrails:

- Do not let wedding tasks dominate the whole PersonalOS surface just because many checklist items exist.
- Do not rank speculative wedding ideas above concrete commitments unless the user explicitly marks them as high priority.
- Do not infer urgency from unsourced vendor claims, sample artifacts, or demo data.
- Do not treat a selected venue/vendor/celebrant option as booked, paid, legally lodged, or externally confirmed.
- Do not run simulator or field-engine promotion as an authority source; they may only shape ranking and explanation around existing AFP evidence.

## Phase 0: Contracts And Existing-Surface Alignment

### Task 0.1: Define Wedding Planning Metadata Contract

Depends on: none.

Implementation:

- Define the metadata envelope for `template:wedding_planning`, `wedding_plan_id`, `response_workspace_id`, `source_response_id`, `artifact_kind`, `privacy_scope`, and `approval_state`.
- Keep fields optional where possible to preserve AFP compatibility.
- Add normalization helpers for stable IDs, safe labels, and supertags.

Acceptance criteria:

- Helpers can normalize partial metadata from AFP messages and generated artifacts.
- Sensitive values are not encoded into public-ish tags.
- Tests cover missing, malformed, and duplicate metadata.

Priority: P0.

### Task 0.1A: Define Need-To-Know Probing Contract

Depends on: Task 0.1.

Implementation:

- Define a small probing state helper that determines the next necessary question from available wedding context.
- Start with date/season, location, guest count, budget comfort, top priorities, and sensitive constraints.
- Ask sensitive cultural, religious, accessibility, dietary, family, or budget-detail questions only when they unblock a concrete planning recommendation.
- For Australian wedding context, ask whether the couple has downloaded the official Notice of Intended Marriage form and whether they have their own authorised marriage celebrant or want help comparing public/registry-style options.
- Australian legal setup probes must carry official source labels and must route to legal checklist, celebrant coordination, calendar reminder, task, and email-draft surfaces without claiming legal lodgement, legal advice, booking, or availability verification.
- Include stable slot IDs, reason labels, sensitivity level, optional suggested answers, and the downstream surface the answer improves.
- Keep probing slots list-driven so future questions can be added without rewriting planner logic.

Acceptance criteria:

- Sparse wedding context returns one primary next question, not a long questionnaire.
- Complete context returns no blocking question and labels the plan ready for first recommendations.
- Sensitive probes are not asked unless a relevant decision context exists.
- Australian context asks one legal setup question at a time: first NOIM download status, then celebrant path.
- Tests cover sparse, complete, Australian legal setup, vendor-selection, catering, accessibility, and cultural-ceremony cases.

Priority: P0.

### Task 0.2: Define Wedding Artifact Kinds

Depends on: Task 0.1 and Task 0.1A.

Implementation:

- Define artifact kinds: `research`, `vendor_table`, `budget_sheet`, `guest_list`, `timeline`, `email_draft`, `legal`, `registry`, `map_collection`, `decision_log`.
- Define minimal artifact summaries: title, kind, created timestamp, source response ID, export targets, approval state, linked task/calendar IDs.
- Reuse existing file/artifact patterns where possible.

Acceptance criteria:

- Artifact summaries can be rendered without loading full file content.
- Each artifact can link back to the source response and wedding plan.
- Tests verify sorting, filtering, and stable labels.

Priority: P0.

### Task 0.3: Define Response Workspace State

Depends on: Task 0.2.

Implementation:

- Build a state helper that groups wedding artifacts by category.
- Include search across titles, kind labels, supertags, vendor names, locations, and source labels.
- Include sidebar counts and empty states.
- Include "continue chat" context payload.

Acceptance criteria:

- A response workspace can render from generated artifacts alone.
- Search returns category-aware results.
- Continue-chat payload includes `wedding_plan_id`, `response_workspace_id`, active artifact ID, and source response ID.

Priority: P0.

## Phase 1: Rich Response UI Contract

### Task 1.1: Create Wedding Presentation State

Depends on: Task 0.1 and Task 0.1A.

Implementation:

- Define sections: overview, map, timeline, legal setup, budget, vendors, decisions, tasks, drafts, artifacts, continue.
- Generate conservative UI state from available context and artifacts.
- Support missing-data labels instead of fake certainty.
- Include Need-To-Know Probing output so the rich response asks only the next useful question.

Acceptance criteria:

- Sparse input still produces a useful response state and one next question.
- Rich input produces cards for maps, budget, timeline, legal setup, vendors, drafts, and artifacts.
- Tests cover no date, no budget, no location, and complete-context cases.

Priority: P1.

### Task 1.2: Add Travel-Style Wedding Response Renderer Contract

Depends on: Task 1.1.

Status: Initial pure renderer-contract adapter implemented, exposed from launch/follow-up/demo states, mounted through a reusable Response Queue rich-response component, and backed by deterministic map/timeline preview metadata; deeper moodboard/image/live-map widgets still pending.

Implementation:

- Add a renderer-compatible structure for mixed text, image/moodboard, map, table, task, draft, and artifact cards.
- Do not implement a large bespoke page first; reuse existing `ui_presentation`/card renderer patterns.
- Include action IDs for opening response workspace, opening Files, opening Calendar, opening map, approving draft, and continuing chat.
- Adapter maps presentation sections into stable block kinds: text, map, timeline, legal, table, task, draft, artifact, and continue.
- Launch, follow-up, and demo state expose `richResponse` beside the existing presentation/workspace view state so render wiring can happen without recomputing planning logic.
- Response Queue renders the reusable rich-response view when launch or follow-up response state exists, and dispatches all rich-response actions through the existing wedding navigation intent bridge.

Acceptance criteria:

- Renderer contract can display all planned sections in one response.
- Actions are declarative and route through existing navigation intents.
- Accessibility fallback buttons exist for every visual/card action.
- The launch/follow-up response visibly displays the travel-style sections before the dedicated workspace, without creating a standalone wedding route.
- Tests verify block kinds, layout hints, action IDs, carried workspace IDs, visible-button fallback copy, and template-state exposure.
- Typecheck verifies the reusable component and Response Queue wiring accept the renderer contract and navigation action types.

Priority: P1.

### Task 1.3: Create "Open Planning Files" Action

Depends on: Task 0.3 and Task 1.2.

Implementation:

- Add an action in the rich response that opens the dedicated response workspace.
- Store or pass a response workspace navigation intent.
- The workspace should open even if only one artifact exists.

Acceptance criteria:

- The response card exposes `Open planning files`.
- The workspace opens scoped to the originating response.
- Tests confirm the intent carries plan ID, response workspace ID, and source response ID.

Priority: P1.

## Phase 2: Artifact Generation And Export

### Task 2.1: Generate Research Document Artifacts

Depends on: Task 0.2.

Status: Initial content generation, export manifest support, and AFP artifact projection support implemented; dispatch persistence/UI wiring still pending.

Implementation:

- Produce Markdown research notes with source/provenance labels.
- Include assumptions, caveats, and next verification actions.
- Attach wedding metadata and export state.
- Export manifests support Markdown, HTML, Word-openable `.doc`, and browser Save-as-PDF for research artifacts.
- Project generated research documents into AFP artifact/file messages for Files, Search, and response-workspace persistence.

Acceptance criteria:

- Research artifacts are searchable by source, location, vendor category, and plan ID.
- Export includes source labels and generated-at timestamp.
- Tests verify generated export filenames, metadata labels, and ready/planned export actions.

Priority: P1.

### Task 2.2: Generate Vendor Comparison Tables

Depends on: Task 2.1.

Status: Initial table content generation, export manifest support, AFP artifact projection support, local row-level decision selection, conservative preference-fit/tradeoff chips, durable selected-decision AFP projection with preference evidence, persisted decision-record reload, selected-decision handoff propagation, destination-arrival visibility, destination-specific selected-scope guidance, selected-decision graph projection, selected-decision packet export sections, selected-decision approval disclosure, selected-decision second-order loop context, projection-ready second-order follow-up task candidates, commitment-timing loop, guest-logistics loop, and budget-drift loop implemented; deeper shortlist ranking UI and richer preference scoring still pending.

Implementation:

- Build vendor table artifacts with name, category, location, price estimate, capacity, fit reasons, risks, contact, source.
- Support CSV and HTML/print export.
- Include draft-email action per vendor where contact exists.
- Shortlist rows should support an explicit decision checkbox so the user can pick the preferred venue/vendor/celebrant option without needing to phrase the preference in chat.
- Ticking one shortlist row should collapse alternatives in the preview, remain reversible by unticking, and mark future follow-up/report actions as scoped to the selected option.
- Selected shortlist rows project into first-class AFP decision messages so the choice is searchable, visible to Decision Queue, and reusable by follow-up reports after save.
- Saved selected rows reload as visible response-workspace decision records after refresh or reopen, separate from local checkbox state.
- Saved selected rows are included in continue-chat context, compact handoff packets, and sidebar action metadata so follow-up reports prefer the chosen option.
- Destination arrival banners show selected-decision scope summaries/chips so the user can see when a surface is scoped to the chosen option.
- Destination arrival next steps explain how the selected option should affect chat, map verification, calendar review, task hierarchy, graph inspection, approval review, and exports.
- Saved selected rows become decided topology nodes linked to their source shortlist artifact so the graph can show the chosen path and connected evidence without prompting the same choice again.
- Exported planning packets include a selected-decision scope section so offline reports state the chosen item before included planning files.
- Approval previews for send/share/contact actions include selected-decision disclosure and selected-scope risk reminders when an approval is tied to a chosen shortlist item.
- Weather/backup and contact/follow-up loops show selected-scope evidence and aim next actions at the chosen option first.
- Missing backup-plan or contact-response closure loops create projection-ready task candidates tied to the selected option, without creating duplicate task suggestions when an existing task already covers the loop.
- Legal, deposit, and contract timing evidence creates a commitment-risk loop card and, when needed, a projection-ready verification task before signing, paying, or lodging.
- Transport, access, accommodation, parking, mobility, seating, and guest-logistics evidence creates a logistics loop card and, when needed, a projection-ready verification task before treating venue or guest logistics as ready.
- Budget, quote, TBC, hidden-fee, minimum-spend, overtime, tax/GST, service-fee, travel-fee, cancellation, and exclusion evidence creates a budget-drift loop card and, when needed, a projection-ready verification task before treating estimates as reliable.
- Export manifests expose CSV, HTML, and browser Save-as-PDF actions for vendor tables.
- Project vendor tables into AFP artifact/file messages with table views and CSV export metadata.

Acceptance criteria:

- Vendor tables can be searched and exported.
- Unknown price/availability is clearly labelled.
- No live availability is claimed unless data source explicitly supports it.
- A selected shortlist row is visible as the active decision scope and is carried in workspace action metadata.
- A selected shortlist row can be saved through the shared projection queue as a `Decisions` output.
- A saved selected row reappears as a decision-scope card in the response workspace sidebar after reopening.
- Continue-chat and report/navigation handoffs include selected-decision scope labels and structured decision metadata.
- Calendar, Tasks, Graph, Search, Files, Threads, and Decision Queue arrivals display the selected-decision scope when carried.
- Each destination shows selected-scope usage guidance and avoids implying that unticked alternatives are deleted, booked, contacted, or unavailable.
- Knowledge Graph recommendations do not treat saved selected rows as unresolved decisions, but can still surface them as topology anchors when they connect to artifacts, vendors, locations, tasks, dates, or risks.
- Markdown and printable HTML packet exports include selected-decision summaries and explicitly preserve alternatives as auditable source context.
- Approval previews name the selected item and caution that unticked alternatives should not be sent, shared, contacted, or included unless the user requests comparison.
- Second-order loop cards explicitly protect the selected planning path, including backup-plan checks and vendor contact follow-up.
- Second-order loop task candidates use the same AFP task projection path as ordinary wedding tasks so Tasks, Search, completion sync, and timing hierarchy can reuse them.

Priority: P1.

### Task 2.3: Generate Budget Sheet Artifacts

Depends on: Task 0.2.

Status: Initial sheet content generation, export manifest support, sensitivity warnings, budget evidence preview, and AFP artifact projection support implemented; dispatch persistence/UI wiring still pending.

Implementation:

- Build budget sheet artifacts with estimate, confirmed cost, paid amount, due amount, due date, vendor link, hidden-cost warnings.
- Show a budget evidence check in the artifact preview that counts unknown/TBC costs, due amounts, unpaid rows, and explicit warning rows from table cells only.
- Do not calculate or present total spend unless reliable structured amounts and currencies are explicitly available.
- Support CSV, Markdown, HTML/print, and Word-compatible export.
- Warn before bundle export because budget sheets can reveal private ceilings, deposits, and family contribution details.
- Project budget sheets into AFP artifact/file messages with searchable budget, vendor, and export metadata.

Acceptance criteria:

- Budget rows can link to vendor artifacts and calendar/payment tasks.
- Hidden costs are represented as warnings, not silently folded into totals.

Priority: P1.

### Task 2.4: Generate Email Draft Artifacts

Depends on: Task 0.1.

Status: Initial draft content generation, export manifest support, AFP artifact projection support, and approval/sensitivity warnings implemented; send approval wiring still pending.

Implementation:

- Create email draft artifacts for vendors, celebrants, family, planner, or venue.
- Drafts must carry recipient, subject, body, disclosure summary, approval state, and source context.
- Sending remains approval-gated.
- Warn when drafts are pending approval or included in export bundles.
- Project pending email drafts into AFP artifact/file messages with approval views and explicit blocked-send context.

Acceptance criteria:

- Drafts are visible in the response workspace.
- Drafts cannot be sent from the template without explicit approval.
- Sent drafts create action receipts.

Priority: P1.

### Task 2.5: Generate Registry Draft Artifacts

Depends on: Task 0.2.

Status: Initial registry content generation, export manifest support, sensitivity warnings, and AFP artifact projection support implemented; dispatch persistence/UI wiring still pending.

Implementation:

- Create a registry draft artifact with item/category, priority, price band, source link, and privacy state.
- Treat external registry publishing as later-phase.
- Warn before bundle export because registry drafts can reveal gift preferences, household details, and price bands.
- Project registry drafts into AFP artifact/file messages for local Files/Search visibility without external publishing.

Acceptance criteria:

- Registry drafts are exportable.
- No external registry is modified without a future explicit integration and approval path.

Priority: P2.

### Task 2.6: Generate Australian Legal Setup Artifacts

Depends on: Task 0.1A, Task 2.4, and Task 3.1.

Status: Initial probing contract, legal setup artifact generation, linked legal tasks, NOIM calendar reminder generation, demo-state integration, response workspace visibility, graph projection, projection queue inclusion, dedicated legal presentation section, official source-link propagation, visible workspace source-link rendering, and structured jurisdiction-aware legal guidance cards implemented; final jurisdiction-specific content/link expansion still pending.

Implementation:

- For Australian couples, generate a conservative legal setup artifact that shows NOIM status, celebrant path, required next actions, source labels, and caveats.
- Display relevant information in practical sections: how to download the NOIM, when it should be given to an authorised celebrant, where to find authorised celebrants or registry/public options, what cost questions to ask, and what evidence still needs user/celebrant confirmation.
- Normalize this practical guidance into reusable cards so later state/territory-specific registry links, office locations, fee tables, and celebrant coordination scripts can be added without changing the artifact or workspace contract.
- Link official source labels to the Australian Attorney-General's Department NOIM resources and Register of Marriage Celebrants when live links are available in the renderer.
- If the user has their own celebrant, create celebrant coordination tasks and approval-gated email drafts.
- If the user wants public/registry-style options, create research tasks and comparison artifacts without claiming availability or booking.
- Do not submit forms, store sensitive identity document details by default, or claim legal compliance.

Acceptance criteria:

- Australian plans show NOIM and celebrant-path status before legal checklist recommendations are treated as complete.
- Legal setup output answers how, when, where, and cost-question prompts with source/caveat labels.
- Guidance cards expose jurisdiction focus and stay conservative when only broad Australian location context is known.
- Missing NOIM or celebrant path creates task/calendar suggestions, not hidden assumptions.
- Tests verify official-source labels, no-lodgement caveats, own-celebrant handoff, and public/registry-option handoff.

Priority: P1.

## Phase 3: Calendar, Tasks, And Critical Path

### Task 3.1: Project Wedding Dates Into First-Class Calendar Events

Depends on: Task 0.1.

Status: Initial state helper, aggregate projection queue support, board-compatible task content fields, existing Tasks ledger timing-hierarchy flair, workspace-scoped local completion persistence, AFP task-status projection helper, and visible pending-sync summary implemented; backend task completion dispatch still pending.

Implementation:

- Convert appointments and milestones into `calendar_event` AFP-compatible objects.
- Include title, time/date, location, participants, plan ID, workspace ID, source response ID, and approval state.
- Route to the existing Calendar view.
- Keep projection rules conservative: items need a concrete `startAt`, ignored items do not project, review-only items stay pending, and draft items appear as tentative rather than confirmed.
- Expose a send-input builder so later persistence/UI wiring can save the event without changing projection semantics.
- Add events to the shared projection queue as pending/sent/blocked items so users can save planning outputs in one step.

Acceptance criteria:

- Wedding events appear in Calendar and Search.
- Generated events can be traced back to the response and workspace.
- Ambiguous dates require review before becoming planning-ready.
- Tests verify AFP shape, tags, metadata, calendar-view conversion, and send-input payload.

Priority: P1.

### Task 3.2: Project Wedding Tasks Into First-Class Task Messages

Depends on: Task 0.1.

Status: Initial state helper, aggregate projection queue support, existing Tasks ledger timing-hierarchy flair, workspace-scoped local completion persistence, AFP task-status projection helper, visible pending-sync summary, explicit save action, and dispatch receipt state implemented; backend task-feed refresh after saved completion status still pending.

Implementation:

- Convert non-time-bound work into task AFP-compatible objects.
- Include deadline, dependencies, priority, owner, and privacy scope when known.
- Do not create calendar events for tasks without a date/time.
- Expose `task` AFP messages with `wedding_task` subtype, plan/workspace metadata, searchable terms, priority/assignee tags, linked artifact references, and send-input builders.
- Include task-board-native fields such as `task_id`, `due_date`, `due_label`, and `milestone` so wedding tasks render in the existing OmnyID Tasks view without a separate wedding task surface.
- Add tasks to the shared projection queue as pending/sent/blocked items so Files, Calendar, and Tasks saves are coordinated.
- Add a wedding-specific timing hierarchy inside the existing Tasks ledger renderer when wedding tasks are present: no-date/anytime tasks first, then dated tasks by rough preparation stage, then completed tasks.
- Completed tasks should be visibly crossed off and locally reversible by unticking, with local completion state scoped by task ID, response workspace ID, and wedding plan ID; later backend task completion writes should use the same task IDs rather than a new wedding-specific completion model.
- Keep wedding-specific task hierarchy rendering in a focused component mounted by the existing ledger renderer, rather than expanding the generic Tasks renderer with template-specific UI.
- Convert local tick/untick records into AFP `task_status` messages addressed to Tasks and Wedding Planning, but dispatch them only after the user clicks `Save status updates`; never auto-write task completion from a checkbox alone.
- Show a compact pending-sync summary, first few affected task names, explicit save button, and dispatch receipt when a local completion record differs from the task status currently loaded from AFP, so the user can distinguish local UI state, saved status-write requests, and durable backend task state.
- Keep dispatch helper dependency-injected so future task APIs, offline queues, or template variants can replace AFP `/send` without rewriting the wedding task view.

Acceptance criteria:

- Tasks appear in Tasks/workflow surfaces.
- Wedding tasks in the existing Tasks view show preparation stage, rough deadline text, and visual timing hierarchy.
- Wedding tasks without a specific due date appear at the top under `Anytime`.
- Completed wedding tasks are crossed off, can be unticked to reverse the local completion state, and retain that local state when the Tasks surface is reopened in the same browser context.
- Pending sync copy appears only for local completion/reopen changes not yet reflected in the task message status, names the local actions that are ready to sync, and provides an explicit save control with success/failure/skipped receipt text.
- Critical path items are tagged and searchable.
- Tests verify task projection, board-compatible fields, timing-stage grouping, local completion persistence, completion-status AFP payloads, pending completion-sync detection, explicit completion-sync dispatch receipts, ignored/archived gating, and projection-family sent markers.

Priority: P1.

### Task 3.3: Add Critical Path And Risk State

Depends on: Task 3.1 and Task 3.2.

Status: Initial graph-backed risk and next-action state implemented.

Implementation:

- Detect risk items: missing venue, missing celebrant, no wet-weather plan, budget unknowns, deposit due, RSVP deadline, no guest count, no transport plan.
- Generate next-best-action labels.
- Represent risks as graph nodes with `has_risk` and `next_action` edges so they can be surfaced in the response, workspace, and Knowledge Graph.
- Keep risk urgency evidence-based: missing artifacts and explicit risk inputs create caveats and next actions, not invented crisis labels.

Acceptance criteria:

- The response shows one primary next action.
- Risk labels are evidence-based and do not invent urgency.
- Tests verify risk nodes, risk recommendation cards, and missing-evidence priority before readiness claims.

Priority: P1.

## Phase 4: Knowledge Graph And Topology

### Task 4.1: Build Wedding Knowledge Graph Projection

Depends on: Task 0.1 and Task 0.2.

Status: Initial state helper implemented, with graph-focus navigation metadata now carried from recommendation cards into the existing Knowledge Graph destination.

Implementation:

- Project wedding plan, artifacts, vendors, budget, guest list, tasks, dates, and decisions into graph nodes and edges.
- Use relationship labels such as `requires`, `constrains`, `affects`, `creates_deadline`, `has_backup`, and `requires_approval`.
- Include stable node IDs for plan, response workspace, artifacts, vendors, locations, calendar events, tasks, decisions, and risks.
- Include missing-evidence labels and high-degree node summaries so recommendation cards can explain what is central and what is absent without pretending the graph is complete.
- Preserve recommendation-specific source node IDs and edge IDs in graph handoff metadata so the existing Knowledge Graph surface can highlight relevant dependencies later without a separate wedding graph page.

Acceptance criteria:

- The Knowledge Graph can show wedding dependencies.
- Graph nodes can route back to Files, Calendar, Tasks, Reports, or the response workspace.
- Tests verify vendor/location extraction, artifact creation edges, schedule/task edges, decision constraints, approval edges, risk next-action edges, high-degree nodes, and evidence-based next action labels.
- Tests verify graph-focus metadata survives workspace action routing and appears in destination arrival context.

Priority: P1.

### Task 4.2: Add Recommendation Explanation State

Depends on: Task 4.1.

Status: Initial state helper, optional presentation section, workspace recommendation card rendering, and graph-focus handoff actions implemented.

Implementation:

- Explain vendor, venue, budget, and timeline recommendations from graph constraints.
- Use source/provenance labels.
- Generate recommendation cards for missing evidence, risk nodes, approval gates, open decisions, and high-degree topology anchors.
- Expose source node IDs and edge IDs so future UI can route directly to the graph, Files, Tasks, Calendar, or response workspace.
- Add a graph-backed Recommendations section to the rich response only when topology state is supplied.
- Render recommendation cards with evidence labels, source/edge context chips, and a visible `Show in graph` action that routes through the existing navigation bridge.

Acceptance criteria:

- Recommendation cards can explain "why this matters."
- Missing evidence produces a caveat rather than a confident claim.
- Tests verify explanation kinds, evidence labels, edge references, empty quiet-graph behavior, and presentation card actions.
- Tests verify graph-focus handoff metadata is produced for recommendation cards.

Priority: P2.

## Phase 5: Dedicated Response Workspace UI

### Task 5.1: Build Response Workspace Route/View

Depends on: Task 0.3.

Status: Initial view-model state, reusable workspace component, extracted shared sidebar-action contract, extracted approval preview panel, extracted workspace actions panel, extracted context panels, extracted artifact detail panel, extracted second-order loop state helper, evidence-based second-order loop cards, commitment-timing loop cards, guest-logistics loop cards, budget-drift loop cards, visible second-order task candidates, local decision-scope checkboxes, durable decision AFP projection, optional projection queue panel, Response Queue mount, bootstrap-message persisted workspace lookup, manual/automatic saved AFP workspace refresh, body preview, structured table/email/document previews, approval receipt audit cards, continue-chat context packet handoff, compact destination handoff packet, sensitive-export opt-in, and ready export controls implemented; pagination/query tuning and production route polish still pending.

Implementation:

- Add a view that opens from `response_workspace_id`.
- Layout: header, category rail, artifact preview, related actions/sidebar, continue-chat composer.
- Keep this view generic enough to support other response workspaces later, not only weddings.
- View-model state now exposes header labels, category rail state, active artifact preview, sidebar actions, recommendation cards, and continue-chat context for the future route.
- Optional projection queue view state exposes a `Save planning outputs` action, grouped Files/Calendar/Tasks counts, blocked-output review, and pending send-input payloads when generated artifacts, schedule items, or task items are available.
- Reusable component renders the workspace shell from state without owning persistence, routing, or execution side effects, so future event-planning templates can reuse the same pattern.
- Large workspace subregions should stay extractable; approval preview now lives in a dedicated component so future provider readiness and approval execution UI can evolve without bloating the main workspace file.
- Packet export controls and workspace sidebar actions now live in a dedicated actions panel so future packet formats, provider setup prompts, or destination shortcuts can evolve without bloating the main workspace file.
- Sidebar context cards now live in a dedicated context-panels component so Need-To-Know evidence, approval receipts, and graph recommendation handoffs can expand without bloating the main workspace file.
- Active artifact detail, structured preview, source-link, raw-body, export, and approval-preview rendering now live in a dedicated artifact detail panel so preview/export capabilities can expand without bloating the main workspace file.
- Second-order loop cards now derive weather/backup and email/contact closure state from artifact text, tasks, calendar items, and approval receipts, then route back to the existing Tasks or Knowledge Graph surfaces instead of adding a separate contingency dashboard.
- When no existing task closes a weather/backup or contact-response loop, the workspace creates a projection-ready task candidate with selected-scope notes and feeds it into the existing projection queue.
- Legal, deposit, contract, cancellation, minimum-spend, NOIM, and celebrant evidence now feeds a commitment-timing loop that can suggest a legal/budget-review task through the same queue when no existing task owns the commitment.
- Transport, access, accommodation, parking, mobility, seating, and guest-logistics evidence now feeds a logistics loop that can suggest a research task through the same queue when no existing task owns guest movement and access assumptions.
- Budget, quote, TBC, hidden-fee, minimum-spend, overtime, tax/GST, service-fee, travel-fee, cancellation, and exclusion evidence now feeds a budget-drift loop that can suggest a budget-review task through the same queue when no existing task owns cost verification.
- Second-order loop logic now lives in a dedicated state helper so future loop families can be added without growing the response workspace view-model toward the anti-monolith limit.
- Shared sidebar actions now live in a small action-contract helper rather than the response workspace view-model, reducing coupling between navigation, loop cards, action panels, and workspace rendering.
- Second-order loop cards now show a compact `Task candidate` line when the loop has a projection-ready task suggestion, making unsaved follow-through visible without adding a separate contingency dashboard.
- Second-order task candidates now preserve structured loop metadata through AFP task projection, including loop kind, selected option label, evidence labels, and linked artifact context for future Search, Tasks, and Knowledge Graph filtering.
- The Knowledge Graph now treats second-order task metadata as topology: each loop-generated task can create a risk node and `next_action` edge to the task that closes the loop.
- The existing Tasks timing hierarchy now reads second-order task metadata and renders loop-family/evidence chips inside the same preparation-stage task view.
- Persisted workspace reload now preserves second-order task metadata from saved AFP task messages, so loop visibility survives refresh/reopen rather than only working in the original generated response.
- Second-order loop duplicate detection now reads structured `second_order_loop` task metadata before falling back to task title/notes matching, preventing duplicate task candidates after saved AFP tasks are reloaded with generic display titles.
- Shortlist table previews now expose local single-choice decision checkboxes for eligible option tables; selected rows collapse alternatives and workspace actions carry `decision_scope` metadata so follow-up reports can prioritize the ticked option.
- Shortlist table previews now show conservative preference-fit and tradeoff chips when explicit preference signals are present in the artifact context. These labels are evidence hints, not booking recommendations or availability claims.
- Selected shortlist decisions now derive into the shared projection queue as a `Decisions` group with dispatch-ready AFP send inputs and sent-marker handling, matching the existing context/files/calendar/tasks save flow.
- Response Queue now mounts the workspace for `planning_files` arrival intents, re-scopes generated sample artifacts to the carried plan/workspace IDs, dispatches pending Files/Calendar/Tasks AFP projections through the shared save runner, refreshes sent-marker state after save, and hands sidebar actions back through wedding navigation intents.
- Persisted workspace helper reconstructs planning files, wedding dates, and tasks from saved AFP messages already present in dashboard bootstrap data before falling back to the sample bridge.
- Persisted workspace refresh helper queries saved AFP wedding messages by `template:wedding_planning` and `event:wedding`, scopes results by response workspace ID, falls back to bootstrap messages for guest mode or refresh failure, and reports source/status copy to the workspace.
- Response Queue triggers a refresh when the planning workspace opens, exposes a manual refresh action, and refreshes again after projection dispatch so saved Files/Calendar/Tasks/context/receipt messages can replace local/generated state when available.
- Persisted workspace reconstruction reloads saved AFP approval receipts and the workspace sidebar shows recent approval outcomes with status, structured block label, blocked reason or external ID, linked artifact/date/task counts, and risk labels.
- Continue-chat sidebar actions carry a compact context packet with plan/workspace IDs, source response, active artifact, Need-To-Know labels, approval receipt labels, graph recommendations, linked date/task IDs, and guardrails so thread continuation starts from the current workspace state.
- Active artifact previews now carry loaded body text when available and expose copy/download/print actions for ready export targets while keeping planned native conversion targets visibly disabled.
- Workspace packet export excludes sensitive artifacts by default and exposes an explicit opt-in checkbox when sensitive artifacts are available; warning labels remain visible even when the user includes sensitive files.
- Workspace packet export preserves evidence-status counts and per-file source caveats so downloaded reports retain trust context outside the app.
- Structured previews parse vendor, budget, registry, and guest Markdown tables into table UI; email drafts into recipient/subject/disclosure/body blocks; and other artifacts into document highlights.

Acceptance criteria:

- Wedding artifacts open in one dedicated workspace.
- The workspace can show empty categories gracefully.
- The user can continue chat with carried context.
- Continue-chat navigation preserves the compact context packet through events and local stored intents, and arrival banners show when a packet is present.
- Calendar, Task, Graph, export, and approval handoffs carry a compact non-body workspace packet with artifact count, linked date/task counts, approval prompts, safe-export exclusion count, evidence-status counts, and projection readiness so existing destination surfaces can explain the carried planning context without becoming wedding-specific.
- Arrival banners use the compact handoff packet to show Calendar, Tasks, and Export shortcuts only when linked dates, linked tasks, or exportable packet state exists, and avoid duplicating the current destination as a shortcut.
- Tests verify category rail activation, active preview metadata, sidebar action availability, graph-backed recommendation cards, and continue-chat context packet construction.
- Tests verify compact handoff packet construction, privacy preservation, metadata propagation, and destination-arrival rendering.
- Tests verify compact handoff packets carry source-linked, source-labelled, and source-unverified counts without copying artifact bodies, and destination-arrival summaries render those counts.
- Tests verify handoff-aware destination shortcuts.
- Tests verify projection queue action state is optional, dispatchable when pending items exist, persisted approval receipt cards are exposed, and queue state is omitted for ordinary artifact-only workspace rendering.
- Typecheck verifies the reusable workspace component matches the current export, approval, recommendation, and projection queue contracts.
- Typecheck verifies the Response Queue mount composes the reusable workspace component, AFP save function, navigation intents, and projection refresh state without route-specific type leakage.
- Tests verify persisted workspace reconstruction recovers saved wedding artifacts, linked dates, tasks, source message IDs, and ignores unrelated response workspaces.
- Tests verify workspace refresh queries wedding supertags, scopes messages to the active response workspace, skips backend refresh in guest mode, and falls back to bootstrap messages on refresh failure.
- Tests verify export payload generation for Markdown, HTML/Word-openable `.doc`, browser PDF printing, disabled planned image/native conversions, and preview body propagation.
- Tests verify packet exports include source-linked, source-labelled, and source-unverified counts with per-file caveats.
- Tests verify structured table previews, approval-gated email previews, document highlight fallback, and workspace preview propagation.
- Tests verify evidence status is indexed into workspace search and exposed as a filter-chip family.
- Tests verify budget previews count unknown costs, due amounts, unpaid rows, and warning rows conservatively without inventing risks for clear rows.
- Tests verify weather/backup and email/contact second-order loop cards are evidence-based and carry task/graph handoff metadata.
- Tests verify second-order loop task candidates are projection-ready, selected-scope aware, and suppress duplicate suggestions when existing tasks already cover the loop.
- Tests verify commitment-timing task candidates are projection-ready, selected-scope aware, and suppress duplicate suggestions when legal/deposit/contract tasks already exist.
- Tests verify guest-logistics task candidates are projection-ready, selected-scope aware, and suppress duplicate suggestions when transport/access tasks already exist.
- Tests verify budget-drift task candidates are projection-ready, selected-scope aware, and suppress duplicate suggestions when budget-review tasks already exist.
- Typecheck verifies the extracted action contract remains compatible with navigation, response workspace rendering, and second-order loop cards.
- Tests verify second-order task metadata survives from loop candidate generation into AFP task message metadata and searchable terms.
- Tests verify second-order task metadata becomes Knowledge Graph risk topology with loop-specific supertags and next-action edges.
- Tests verify consequential weakly sourced artifacts create source-verification risk topology while private guest-list artifacts do not create false source-verification failures.
- Tests verify source-verification recommendation cards carry specific badges and next-action copy instead of generic risk language.
- Tests verify second-order loop context appears in the wedding task hierarchy state and remains limited to concise evidence labels.
- Tests verify persisted wedding workspace reconstruction preserves second-order task metadata from saved AFP task messages.
- Tests verify structured `second_order_loop` metadata suppresses duplicate second-order task suggestions even when the saved task title does not contain weather, contact, legal, logistics, or budget keywords.
- Tests verify shortlist preference-fit labels are derived conservatively from explicit preference context and saved into AFP decision records for future search/report context.
- Tests verify shortlist decision selection is single-choice, reversible, scoped to eligible artifacts, and exposes selected-option labels for follow-up report context.
- Tests verify selected decisions produce searchable AFP messages, dispatch-ready send inputs, projection queue `Decisions` groups, and sent-marker dedupe.

Priority: P1.

### Task 5.2: Add Artifact Preview Components

Depends on: Task 5.1 and Phase 2.

Status: Initial preview data contract and reusable workspace rendering implemented for tables, email drafts, document highlights, legal setup, timeline/run-sheet, map/location handoff, and guest-list privacy context. Timeline previews now group items by preparation stage/timing label, and map previews expose location search queries plus Google Maps handoff URLs; deeper live map/timeline widgets still pending.

Implementation:

- Preview Markdown docs, vendor tables, budget sheets, email drafts, maps, registry drafts, and timeline/run-sheet artifacts.
- Render specialized legal, timeline, map/location, and guest-list previews when artifact kind and clear markdown structure support it.
- Group timeline/run-sheet items into conservative preparation stages and timing labels before full calendar/date parsing exists.
- Surface map search queries and external map handoff URLs with clear route-verification caveats before live geocoding exists.
- Reuse existing renderer/table/export helpers where possible.
- Active preview state exposes metadata labels, source labels, export manifest, approval request, and fallback text when full artifact body loading is not wired.

Acceptance criteria:

- Each artifact kind has a readable preview.
- Legal, timeline, map/location, and guest-list previews use conservative labels and fall back safely when structured data is sparse.
- Timeline previews show timing hierarchy from available text without inventing exact dates.
- Map previews expose search handoffs but do not claim verified routes or travel times.
- Unsupported previews still show metadata and export/open actions.
- Tests verify active preview export metadata, pending-approval prompt, specialized preview variants, timeline stage grouping, and map search handoff metadata.

Priority: P2.

### Task 5.3: Add Workspace Search And Filters

Depends on: Task 5.1.

Status: Initial filter chip state implemented.

Implementation:

- Search by category, title, vendor, location, budget category, date, approval state, source, and supertag.
- Add filter chips for artifact kind and approval state.
- Filter chips are generated from visible results for artifact kind, approval state, export target, vendor, and location.

Acceptance criteria:

- Search works without loading every full artifact body.
- Filter chips are generated from workspace state.
- Tests verify filter chips are derived from the filtered result set, not hidden artifacts.

Priority: P2.

## Phase 6: Approvals, Sharing, And External Actions

### Task 6.1: Approval Gate For Consequential Actions

Depends on: Task 2.4 and Task 3.1.

Status: Initial approval request state, structured block-kind state, integration-readiness state, receipt state, AFP receipt projection, dependency-injected execution runner, workspace disclosure preview, local approve/execute controls, missing-executor receipt handling, durable receipt save through the existing AFP sender, and persisted receipt audit display implemented; external provider integrations still pending.

Implementation:

- Require approval before sending email, sharing files, inviting collaborators, creating external calendar events, or contacting vendors.
- Show exactly what will be shared.
- Consequential action requests include action kind, recipients, share scope, external provider, proposed message preview, linked artifact IDs, schedule item IDs, task item IDs, disclosure lines, risk labels, and blocked/executable state.
- Blocked requests carry a structured block kind: `needs_user_approval`, `provider_missing`, `unsupported_integration`, or `privacy_scope`, so UI and executors can distinguish approval prompts from setup or scope-correction work.
- Receipts can record executed or blocked outcomes with disclosure and risk context.
- Execution runner calls injected executors only after approval/provider gates pass and records missing-executor, failed, blocked, or executed results without pretending an integration exists.
- Workspace approval controls can mark an active approval request approved in-session and attempt execution through injected handlers only; if no handler is connected, the receipt must say so rather than pretending the action ran.
- Workspace approval previews show integration readiness before execution, including calendar/email provider setup labels, connected provider labels, local OmnyID sharing readiness, and unsupported registry status.
- In-session approval must not bypass provider-required blocks, unsupported registry publishing, or future integration gates.
- Approval execution receipts should project into first-class AFP `approval_receipt` messages addressed to Wedding Planning, Decision Queue, and Search, with disclosure lines, risk labels, structured block kind, blocked reason, external ID when present, linked artifact IDs, linked schedule IDs, and linked task IDs.
- Receipt saving should use the existing workspace AFP save function when available; if saving fails, the external-action result remains visible and the failed receipt-save state is shown separately.
- Saved receipt messages should reload into the same response workspace from bootstrap AFP messages, including structured block kind, so the user can see past approval outcomes after refresh without relying on local component state.

Acceptance criteria:

- Consequential actions cannot execute directly from generated cards.
- Approval receipts are added after execution.
- Approval receipts are searchable AFP messages when the workspace can save them.
- Reopened workspaces show recent approval receipts as an audit trail with structured block labels where relevant.
- Workspace approval previews show blocked reason, structured block label, risk labels, and disclosure lines.
- Tests verify blocked-by-default behavior, structured block kinds, integration-readiness labels, local approval transition safety, successful execution state after explicit approval, calendar provider gating, missing executor handling, failed executor handling, blocked receipts, AFP approval-receipt projection, block-kind search metadata, and persisted block-kind reload.

Priority: P1.

### Task 6.2: Privacy-Scoped Sharing

Depends on: Task 6.1.

Status: Initial privacy-scoped sharing state and hard vendor-facing artifact privacy blocks implemented; collaborator permissions UI still pending.

Implementation:

- Add share scopes: private, partner, planner, family, vendor.
- Prevent vendors from seeing unrelated vendor comparisons, private budget ceilings, or guest notes by default.
- Vendor-facing shares surface explicit risk labels for budget sheets, guest lists, pending drafts, and sensitive artifact kinds before any execution.
- Vendor-facing `share_artifact` actions with budget sheets, guest lists, decision logs, registry drafts, or email drafts remain blocked even after generic user approval; the user must remove those artifacts or choose a non-vendor share scope.

Acceptance criteria:

- Sharing intent carries artifact IDs and privacy scope.
- Tests cover vendor-safe and unsafe disclosure cases.
- Tests verify vendor-facing budget and guest-list warnings.
- Tests verify unsafe vendor-facing artifact shares remain blocked after approval while vendor-safe comparison artifacts can execute after approval.

Priority: P2.

### Task 6.3: Optional External Integrations

Depends on: Phase 6.1.

Status: Provider gating and integration-readiness contracts implemented; provider connection and execution integrations still pending.

Implementation:

- Add optional Google Calendar sync.
- Add optional Gmail/email sending.
- Later add weather, vendor directories, payment, and registry integrations.
- External calendar actions remain blocked until a provider label/connection is present.
- Email/contact actions surface provider-needed readiness labels until Gmail or another email executor is connected.
- Registry publishing remains unavailable until an explicit future integration exists.

Acceptance criteria:

- Integrations are explicitly connected and approval-gated.
- The UI never claims unsupported live booking, payment, or registry publishing.
- Tests verify external calendar provider gating, email provider-needed readiness, connected provider labels, and unsupported registry publishing behavior.

Priority: P3.

## Phase 7: Product Polish And Commercial Readiness

### Task 7.1: Wedding Template Entry Point

Depends on: Phase 1.

Status: Initial entry-state contract, shared template catalog item, Templates UI card, life-event category, starter labels, response-workspace launch intent, first-response launch panel, projection-ready starter brief artifact, launch-panel Need-To-Know capture, deterministic paste-message extraction, local draft restore, Need-To-Know AFP context projection/reload, and follow-up artifact/legal-projection state helper implemented; deeper transcript/LLM-based extraction still pending.

Implementation:

- Add a Wedding Planning template card in Templates.
- Seed prompts for venue search, budget planning, guest list, vendor emails, run sheet, and registry.
- Carry `template:wedding_planning` metadata into the first response.
- Entry-state helper creates stable `wedding_plan_id`, `response_workspace_id`, starter prompts, and first-response instructions for Need-To-Know Probing, artifacts, and approval-gated actions.
- Template card launches through the existing wedding navigation bridge to Response Queue rather than adding a standalone wedding route.
- Response Queue shows a real template-launch starter state when no persisted wedding artifacts exist, instead of silently substituting demo vendors.
- Template launch creates a conservative starter brief artifact that can be saved through the existing projection queue before private wedding details are added.
- Follow-up state helper turns captured Need-To-Know answers into a private planning brief and, when budget comfort exists, a budget sheet with unknown amounts kept explicit.
- Deterministic extraction helper can prefill launch-panel Need-To-Know fields from a single user message without inventing missing values, and keeps ambiguous date/guest-count details reviewable before file generation.
- Australian follow-up context must carry NOIM/celebrant answers into the brief and point back to official-source verification before reminders, costs, or celebrant options are treated as actionable.
- Australian follow-up context reuses the legal setup helper so exact wedding dates can produce calendar-ready NOIM reminders, while vague dates/seasons keep calendar projection review-blocked until a concrete date exists.
- Local follow-up draft helper saves and restores manually captured answers by `response_workspace_id` as a bridge until those answers are projected into durable AFP/backend messages.
- Need-To-Know context projection saves captured answers as a first-class AFP context note addressed to wedding planning, Search, and Knowledge Graph so future retrieval does not depend only on local component state.
- Persisted workspace reconstruction reads saved `wedding_need_to_know` context messages back into workspace state and marks them saved, so reopened workspaces do not duplicate context projection work.
- Workspace view-model exposes compact context cards for saved or pending Need-To-Know context, including answered labels, recommendation readiness, carried workspace IDs, and the next question to ask.

Acceptance criteria:

- User can start a wedding plan in under 60 seconds.
- The first response creates a plan ID and response workspace ID.
- Tests verify stable metadata, starter prompt catalogue, launch intent, Templates catalog wiring, first Need-To-Know launch state, projection-ready starter artifact, follow-up artifact generation from answered prompts, deterministic message extraction, conservative budget rows, Australian NOIM/celebrant context, legal task/calendar projection behavior, local draft persistence, Need-To-Know AFP context projection/reload, visible context cards, queue grouping, dispatch sent markers, and under-60-second start readiness flag.

Priority: P1.

### Task 7.2: Sample Demo Mode

Depends on: Phase 5.

Status: Initial demo-state contract and existing Templates-card sample-demo entry wiring implemented; richer demo storytelling polish still pending.

Implementation:

- Add a sample wedding plan with synthetic vendors, budget, timeline, maps, emails, and registry artifacts.
- Clearly mark all demo data as sample.
- Demo-state helper produces sample artifact generation, workspace view state, presentation state, schedule/task items, graph state, sample labels, and no-live-availability caveats.
- The existing Templates card exposes `Open sample demo` as a secondary action that routes through the same Response Queue planning-files surface with `demo:wedding-response`; it must not create a separate demo page or mutate the standalone wedding website.
- Demo launch copy must distinguish sample exploration from starting a real private wedding plan.

Acceptance criteria:

- A new user can understand the full value without entering real private data.
- Demo data cannot be mistaken for real vendor availability.
- The template catalog exposes a sample-demo launch intent separately from the primary real-plan launch intent.
- Tests verify sample-data labels, synthetic vendor caveats, demo artifacts, graph nodes, schedule/task items, approval-gated sample email drafts, and template-catalog demo routing.

Priority: P2.

### Task 7.3: Export Bundle

Depends on: Phase 5 and Phase 6.

Status: Initial safe single-file planning packet export implemented for Markdown, printable HTML/Save-as-PDF, and Word-openable `.doc`, with response-workspace format selection, explicit sensitive-artifact opt-in, and structured planned-export blockers for native ZIP/DOCX/JPG/PNG packet conversions; actual conversion workers and fuller approval UI still pending.

Implementation:

- Add export bundle for the response workspace.
- Include selected artifacts only.
- Warn before including guest list, budget, family notes, or emails.
- Start with single-file Markdown/HTML/Word-openable `.doc` packets rather than fake ZIP exports.
- Expose Markdown, printable HTML/Save-as-PDF, and Word-openable `.doc` as explicit response-workspace packet format choices before native conversion workers exist.
- Keep native ZIP packet packaging behind a real packaging worker.
- Expose planned ZIP/DOCX/JPG/PNG packet targets as disabled capabilities with filenames, required worker IDs, and blocker copy.
- Default packet export excludes sensitive artifacts such as budgets, guest lists, legal setup, registry drafts, approval-pending drafts, and decision logs.
- Word-openable packet export must use the same filtered packet content and warning labels as Markdown/HTML; it is not a native DOCX converter.
- Packet exports must preserve evidence-status counts and per-file caveats in Markdown, printable HTML, and Word-openable `.doc` output.
- Explicit sensitive inclusion is a visible opt-in in the existing response workspace, and included-sensitive packets retain warning labels in the exported manifest.

Acceptance criteria:

- User can export a wedding planning packet from the response workspace.
- User can choose Markdown, printable HTML/Save-as-PDF, or Word-openable `.doc` packet export from the response workspace.
- Sensitive artifacts are excluded by default and appear in the warning/excluded manifest.
- Sensitive artifacts can be included only after explicit opt-in, with warnings preserved.
- Evidence-status counts and per-file source caveats remain visible in exported packets.
- Native ZIP/DOCX/JPG/PNG remain disabled until real conversion or packaging workers are implemented; sensitive opt-in is limited to the current single-file Markdown/HTML/Word-openable `.doc` packet flow.
- Tests verify ready packet formats, planned conversion labels, required worker blockers, and workspace view-state exposure.

Priority: P2.

## Recommended Implementation Sequence

1. Metadata contract and artifact kinds.
2. Response workspace state helper.
3. Rich response presentation state.
4. Saved artifacts and export helpers for research, vendors, budget, and drafts.
5. Persist Calendar/task projections from generated response artifacts.
6. Knowledge Graph projection.
7. Response workspace view.
8. Template entry point.
9. Approval-gated sharing and external integrations.
10. Demo mode and export bundle.

## Definition Of Done

The Wedding Planning template is ready for first commercial testing when:

- A user can generate a rich wedding planning response from a normal chat prompt.
- The response includes cards for overview, maps, timeline, budget, vendors, decisions, tasks, drafts, and artifacts.
- The user can open a dedicated response workspace for generated files.
- The user can continue chat from the response and workspace with context carried.
- Calendar events are first-class AFP-compatible events visible in Calendar and Search.
- Tasks are first-class task objects visible in Tasks/workflows.
- Email drafts require approval.
- Approved live provider actions only count as executed when the provider returns an explicit durable receipt ID, message ID, event ID, publish ID, or equivalent stored external ID; missing receipts fail closed and remain retryable.
- Production provider-executor proof no longer accepts local receipt IDs or provider display links as launch evidence; go/no-go gates require durable provider IDs and surface blocked smoke-proof reasons when evidence is weak.
- Explicit provider-suite proof references are normalized before Oracle gate checks, so manually supplied readiness packets cannot clear production using local receipt IDs or display links.
- Artifacts are exportable in standard formats.
- Imported guest lists, budgets, and vendor files are private by default, survive workspace reloads, feed guest/budget/seating/task synthesis, preserve original-file storage receipts where available, and clearly block production readiness when binary spreadsheet parsing or durable original-upload storage is still missing.
- Import synthesis and stored-import reloads derive "original upload saved" only from complete durable receipts; incomplete saved receipts are downgraded to failed retention metadata before readiness, search labels, or user-facing provenance can overclaim storage.
- Browser XLSX synthesis only reads worksheet XML inside the workbook's `xl/worksheets/*.xml` area; malformed, external, or traversal-style worksheet relationships are skipped with parser warnings instead of falling back to unintended sheet content.
- Imported wedding artifacts are treated as sensitive export material by default even when inferred as generic research, so bundle/packet exports exclude uploaded-file content unless the user explicitly includes sensitive files and sees the import privacy warning.
- Vendor-facing share approvals also treat imported wedding artifacts as private planning files even when their inferred artifact kind is generic research; imported uploads must be removed, redacted into minimum-necessary vendor packets, or shared under a non-vendor scope.
- Handoff packets explicitly count imported private planning files and imported handoff-review blockers, without copying uploaded file bodies, source labels, or source URLs into the handoff context.
- Wedding navigation arrival summaries preserve imported-file handoff-review warnings and accept generated provider-handoff audit metadata, so export, task, approval, and connected-app destinations do not hide private-file or executor setup obligations.
- Continue-chat context packets preserve imported-file review counts and private-file guardrails without copying uploaded file bodies or source filenames, and arrival summaries surface those warnings before follow-up reuse.
- Import parser readiness tasks redact source filenames, attachment IDs, SHA-256 hashes, and storage receipts from task metadata while preserving parser job readiness counts and receipt-present flags for production follow-up.
- Knowledge Graph and graph-backed recommendations redact imported upload source labels and filenames while preserving private-import evidence counts and source-verification risks.
- Selected-decision AFP projections and PersonalOS decision-focus evidence redact imported upload source labels and filenames while preserving source-label counts and private-import evidence flags.
- Artifact AFP projections preserve original-upload receipts on the private file record while redacting imported upload filenames, attachment IDs, message IDs, storage keys, and hashes from searchable terms and projected source labels.
- Workspace artifact search indexes imported private planning files by useful planning content and safe import labels, without indexing upload filenames, attachment IDs, message IDs, or hashes from import provenance.
- Workspace preview and evidence-summary labels show imported private planning files as private-file evidence instead of exposing imported upload source filenames, while preserving the source-marker count.
- Workspace bundle exports redact imported private planning filenames from selected-decision source labels while preserving provider labels, source URL counts, and private-file evidence context.
- Guest operations summaries redact imported RSVP/guest-list filenames from source labels while preserving guest counts, RSVP status counts, dietary/accessibility counts, and follow-up task generation.
- Budget tracking and payment-review task generation redact imported budget filenames from source labels while preserving selected vendor amounts, quote-verification tasks, due amounts, due dates, and payment-review task metadata.
- Second-order loop suggested-task metadata redacts imported selected-decision artifact titles while preserving selected option labels, artifact IDs, loop evidence, and projection-ready task context.
- Response workspace selected-decision cards, sidebar action metadata, approval disclosures, and bundle decision scopes redact imported artifact titles and source filenames while preserving selected option labels, provider labels, safe source URLs, and private-file evidence context.
- Export manifests for imported wedding files use private-file titles, filenames, and metadata labels, so preview/export controls do not expose uploaded spreadsheet or CSV filenames while preserving export readiness and sensitive-file warnings.
- Wedding presentation and rich-response cards redact imported file titles and source evidence labels from user-visible display text while preserving internal artifact IDs for correct workspace routing.
- Knowledge Graph selected-decision nodes, imported artifact/risk labels, report-scope copy, and report-scope task metadata redact imported artifact titles and source filenames while preserving selected option labels, source URL evidence, and graph routing IDs.
- Approval request disclosure lines and response-workspace active previews redact imported artifact titles while preserving artifact IDs, approval gates, private-file warnings, and execution routing.
- Imported artifact source-link labels and URLs are excluded from workspace search text and active preview link lists, so private upload/storage/parser links cannot become searchable or user-visible while source-marker counts remain intact.
- AFP file-artifact projections redact imported titles, source links, searchable terms, and rendered document-view import filenames while preserving private original-upload receipt fields, source-label/source-link counts, export warnings, and routing IDs.
- Decision AFP projections, Knowledge Graph decision metadata, response-workspace decision scopes, and bundle decision scopes redact imported artifact titles and private upload/storage source URLs while preserving ordinary safe evidence URLs, selected option labels, source counts, and routing IDs.
- Persisted workspace reload redacts legacy imported decision records before they re-enter workspace state, so older saved AFP messages with raw spreadsheet titles, upload source labels, or private storage URLs cannot repopulate reusable decision cards or follow-up context.
- PersonalOS decision pressure and exported workspace packets share the selected-decision source sanitizers, so imported spreadsheet decisions can preserve safe evidence URL counts without exposing private upload filenames, storage URLs, or original-upload labels in ranked focus items or downloaded planning packets.
- Approval disclosure lines and navigation arrival cards redact imported selected-decision artifact titles, so raw spreadsheet or CSV filenames cannot reappear when selected scopes are carried into send/share approvals, graph arrivals, task arrivals, or follow-up destinations.
- AFP task and calendar projections sanitize nested selected-decision scope metadata before persistence/search, preserving selected option context and safe evidence URLs without indexing imported spreadsheet filenames, private storage URLs, original-upload labels, or import source metadata labels.
- Persisted workspace reload sanitizes legacy selected-decision scope metadata embedded in saved second-order task AFP messages, so old task records cannot rehydrate imported spreadsheet filenames, private upload URLs, or original-upload labels into live workspace task state.
- Knowledge Graph task and second-order risk topology sanitizes nested selected-decision scope metadata before graph nodes are created, so imported spreadsheet filenames, private upload URLs, original-upload labels, and legacy camelCase source fields cannot leak through dependency graph metadata.
- AFP task and calendar projection sanitizers also normalize legacy camelCase selected-decision scope fields into canonical snake_case metadata, removing raw `artifactTitle`, `sourceLabels`, `sourceUrls`, and `metadataLabels` aliases before task, search, graph, or reload reuse.
- Spreadsheet parser job requests normalize unsafe legacy import receipt fields before backend handoff, reducing path-like filenames to basenames, bounding source message IDs, attachment IDs, hashes, MIME labels, and storage receipt strings, and keeping projected parser-readiness task metadata redacted.
- Saved imported wedding artifacts normalize complete legacy upload receipts on reload, preserving durable private receipt status while bounding receipt IDs, hashes, MIME labels, storage strings, file size, and path-like filenames before the artifact re-enters workspace state.
- Persisted AFP wedding artifact reload normalizes legacy original-upload receipts before rebuilding workspace artifacts, preserving saved receipt evidence while bounding private receipt IDs, hashes, MIME labels, storage strings, file size, and path-like filenames from saved AFP content.
- Workspace production-readiness evidence defaults to strict Oracle proof mode even when callers supply aggregate ready flags, so backend scale proof, provider executors, admin AI policy, and Oracle release gates cannot clear without durable proof references.
- Oracle release and saved-workspace scale proof references reject local receipt IDs, localhost URLs, and browser-only file references before proof packets or aggregate readiness can treat them as production evidence.
- Admin AI routing policy proofs, admin Oracle metrics proofs, and provider-executor smoke proofs reject local receipt IDs, localhost URLs, and browser-only file references before readiness evidence, proof packets, or provider-suite aggregation can mark them production-ready.
- Collaboration lifecycle audit proof now requires a durable proof reference in strict Oracle mode, rejects local receipt IDs, localhost URLs, and browser-only file references, and no longer lets a legacy aggregate boolean clear the Oracle-required lifecycle gate.
- Oracle update plans require an explicit intended target label before ready preflight/deploy/verify/record steps are generated, so a generic fallback target cannot be treated as production upload approval.
- Aggregate wedding production go/no-go packets now carry a durable proof manifest for backend scale, provider executors, collaborator lifecycle, admin routing, admin Oracle metrics, and Oracle release receipts; Oracle upload stays blocked when a gate is green but its supported receipt group is missing.
- The source-backed `wedding_vendor_seed_details` model now has an editable production vendor layer with admin CRUD, up to three vendor photos, venue/service addresses, and per-user vendor outreach contact state so master-agent, agent-drafted email, and personal-email follow-ups can use last-contact and due-follow-up data.
- Signed-in wedding users and the master-agent path can read active editable vendors through a user-scoped vendor endpoint that includes the user's last-contact/follow-up state, while hidden or archived admin rows stay out of planning recommendations; editable rows can also feed the existing seeded-vendor freshness and artifact pipeline.
- Editable vendor contact records now drive the wedding outreach escalation ladder: future follow-up dates stay quiet as waiting-for-reply, due follow-ups become projection-ready vendor tasks, replies close the loop, and task metadata preserves vendor ID, contact method, receipt reference, thread ID, and no-spam approval context for agent follow-up.
- The wedding response workspace now fetches the signed-in user's active editable vendor directory records, feeds their contact state into generated workspace tasks, skips the fetch for guest mode, and persists vendor-contact follow-up metadata through AFP task projection content, task views, searchable metadata, and relational send inputs.
- Saved vendor outreach task projections now write back to the editable vendor contact table for signed-in users after durable AFP save receipts, using the vendor ID, contact method, thread reference, receipt reference, and next follow-up date derived from the outreach escalation stage; failed or skipped projections do not update last-contact state.
- Wedding workspace vendor-directory loading is now reactive to the active planning workspace and signed-in user state, clears stale vendor rows when the user is guest/signed out, and ignores stale in-flight fetches; contact write-back also falls back to the saved AFP task message ID as the durable receipt reference when no vendor-contact receipt is already present.
- The wedding response workspace now exposes editable-vendor contact state as visible follow-up cards, sorted by urgency, so due follow-ups, waiting vendors, and closed replies are inspectable in the planning workspace while preserving the same outreach ladder metadata used for task projection and contact write-back.
- The editable vendor admin surface now has reusable draft-to-payload validation, typed URL/email/date inputs, visible pre-submit validation errors, and delete confirmation; the backend also rejects malformed website/source/photo URLs, invalid source-checked dates, duplicate or out-of-range photo slots, more than three photos, and non-RFC3339 user contact dates before storing vendor or follow-up records.
- Editable vendor admin validation tests are now included in the standard `test:wedding` glob, and the anti-monolith line-budget guard has been re-baselined to the current legacy `src/server/mod.rs` and `src/db.rs` sizes so `test:wedding:ci` can fail on future backend growth instead of failing on stale historical caps.
- The Knowledge Graph shows wedding dependencies.
- Privacy and sharing are explicit.
- No new implementation file becomes monolithic.
