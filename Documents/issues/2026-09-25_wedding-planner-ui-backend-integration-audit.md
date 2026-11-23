# Wedding Planner — UI & Backend Integration Audit

**Date:** 2026-09-25
**Scope:** `solid-ui/src/components/Wedding*.tsx`, `solid-ui/src/lib/wedding*.ts`, `src/server/` (Rust backend), and the `omnyid.com/wedding` → sign-in → workspace funnel.
**Type:** Audit only. No code was changed to produce this document.

This audit does **not** re-litigate items already fixed in the 2026-09-23 deploy (auto-balancing budget save, RSVP/seating dashboard tiles, Home-tab always-visible overview grid, Heroicons icon pass, CORS `allow_credentials`, unconditional Bearer-token attachment, new logo). Those are treated as the current baseline. Everything below is what remains open as of today.

---

## 1. Executive summary

| Area | Verdict |
|---|---|
| Empty-state cards clickable-through to the right field | **Partial.** Home-tab tiles and the decision-focus card do this correctly; several tab-level empty states (tasks, family rules, shared people, timeline fallback text) are inert. |
| A proactive "what should I do next" summary card | **Does not exist yet** for the wedding domain specifically. Two adjacent systems (`WeddingDecisionFocusCard`, `WeddingNavigationArrivalBanner`) already prove the pattern works and can be extended — see §5. |
| Cross-variable integration (guests ↔ budget ↔ seating ↔ timeline) | **Partial.** Guests → Seating is genuinely wired. Guests → Budget has a half-built hook (`estimatedCostPerGuest`) that is never actually connected. Budget and Timeline are fully isolated islands. |
| "All buttons work, no error pages" | **Not confirmed fixed.** The TDZ crash ("can't access lexical declaration 'jr'/'Ie' before initialization") was investigated again at length; the leading circular-import hypothesis was disproven, but no alternative root cause was confirmed either. A real, separate CORS gap (missing `DELETE` in allowed methods) was found. |
| AFP core-principle compliance | **Largely non-compliant for wedding domain data specifically.** The boundary/permissions subsystem is a good-faith AFP citizen; guests/budget/seating/timeline/helpers are not modeled as ledger objects, are not E2EE despite field names implying it, and bypass the app's A2UI rendering system entirely. |
| Backend persistence for planning data | **Missing.** Guest lists, budget line items, seating charts, and helper/task assignments have no backend endpoint at all — everything lives in client-side signals/localStorage only. |

---

## 2. Frontend findings

### 2.1 Empty-state cards — clickable vs. inert

**Working correctly (model to copy from):**
- `WeddingWorkspaceContextPanels.tsx:495` — "No overall budget set yet." — wrapped in a real `<button onClick={openBudget}>` (lines 531–543) that calls `onSelectMenu?.("budget")`.
- `WeddingWorkspaceContextPanels.tsx:1359-1370` — "No dated timeline yet" fallback card — the message text itself is inert, but the card includes a sibling `<button onClick={... open_tasks ...}>` (1365–1369), so the card as a whole is actionable.
- `WeddingDecisionFocusCard`'s budget/countdown tiles (`WeddingWorkspaceContextPanels.tsx:614-629`) — real `<button>`s wired to `onSidebarAction`.

**Inert — no click path to the relevant field (gaps to close):**
- `WeddingWorkspaceContextPanels.tsx:485/528` — "No upcoming timeline items yet." sits in a plain `<p>` *outside* the nearby `<button onClick={openCalendar}>` (520–527), which only wraps the countdown-detail line, not this message.
- `WeddingWorkspaceContextPanels.tsx:1166` — "No tasks are ready to assign yet. Add wedding tasks, import a list, or ask OmnyID to create the next planning checklist." — plain `<p>`, no button anywhere in that fallback block, despite the text itself describing three possible actions.
- `WeddingWorkspaceContextPanels.tsx:909-916` — "Next step" box under import-parser readiness — `nextActionLabels` render as plain `<li>` text with no click handler at all.
- `WeddingBoundaryManagementCard.tsx:318` — "No family rules are set yet." — static fallback, no link to wherever a rule is added.
- `WeddingBoundaryManagementCard.tsx:340` — "No shared people yet" — static fallback, no link to the sharing/invite flow.
- `WeddingTaskStageView.tsx:227` — "No completed wedding tasks yet." / "No open wedding tasks right now." — static fallback, no action.

**Recommendation:** every one of the inert cases above already has an obvious destination (Timeline tab, task list, boundary/rules editor, sharing panel, tasks tab). Wrap each empty-state message the same way `openBudget`/`openCalendar` already do — this is a small, mechanical fix once code changes are authorized, not a design problem.

### 2.2 Existing "what to do next" scaffolding — what's there today

Three components already do parts of what the requested summary card needs; none of them is quite it:

- **`WeddingDecisionFocusCard`** (`WeddingWorkspaceContextPanels.tsx:581-681`) — Fully dynamic: real summary label, a list of focus items with explanations/evidence, a primary CTA button wired to `onSidebarAction`. **But it is gated behind `<Show when={props.state.personalOsProjection.hasWeddingPersonalOsSignal}>` (line 599) with no fallback** — a brand-new plan (the exact "you just got engaged, haven't set a date yet" scenario the user described) sees nothing here at all. This is the single biggest structural gap standing between the current app and the requested feature.
- **`WeddingNavigationArrivalBanner.tsx`** — Templated, situational copy (title/subtitle/chips/body/actions all derived from real state via `weddingNavigationArrivalViewState.ts`), with working primary/secondary action buttons that route through `runAction` into real tab switches. It only appears on arrival/re-entry into the workspace, not as a persistent "what's next" surface.
- **`WeddingPlannerWalkthrough.tsx`** — A real, working 5-step guided tour with correct tab-following (`createEffect` keeps the background tab in sync with the current step), but the steps are hardcoded, not derived from the couple's actual data — it's onboarding, not an ongoing situational nudge.

None of the three re-evaluates "what's missing right now" on every visit the way the requested card should (wedding date unset → prompt for date; date set but budget unset → prompt for budget; etc.).

### 2.3 Menu/tab navigation — mostly sound

The tab bar and every in-card "jump to X" button located during this audit correctly funnel through `setWeddingWorkspaceMenu` (`ResponseQueueView.tsx:293`, tab bar wiring at line 936). No dead/mis-wired navigation buttons were found. The defects in this area are the *missing* buttons on inert empty states (§2.1), not broken ones.

### 2.4 Cross-variable integration

| Link | Status | Evidence |
|---|---|---|
| Guests → Seating | **Wired.** | `weddingResponseWorkspaceViewState.ts:1037-1038` builds `guestTracking` then passes it into `buildWeddingSeatingPlanState({ artifacts, guestTracking })`; `weddingSeatingPlanState.ts:332-333` derives `attendingCount`/`suggestedTableCount` from it. |
| Guests → Budget | **Half-built, not connected.** | `weddingGuestTrackingState.ts:141,325,371-374` defines `estimatedCostPerGuest` and a `budgetImpactAmount` calculation, but the only real call site (`weddingResponseWorkspaceViewState.ts:1037`) never supplies a cost figure — `budgetImpactAmount` is always `null` in production. Per-head catering cost never actually reaches the budget tracker. |
| Budget ↔ everything else | **Isolated island.** | `weddingBudgetTrackingState.ts` is built (`weddingResponseWorkspaceViewState.ts:1032-1036`) from `{ decisionRecords, selectedDecisionItems, artifacts }` only, *before* `guestTracking` even exists in that function. Budget category shares (`weddingBudgetGuidanceState.ts:17-29`) are static percentages, not guest-count-aware. |
| Timeline ↔ everything else | **Isolated island.** | `weddingGanttTimelineState.ts` builds purely from `projectionScheduleItems`/`taskItems` — no budget or guest figures feed into it. |

**Net finding:** there is no general reactive graph tying these tabs together — each recomputes independently from the shared `artifacts`/`decisionRecords` pool. The one real cross-tab derivation (Guests→Seating) was hand-wired at the top-level assembler, not produced by a systemic pattern, so it doesn't automatically extend to Budget or Timeline. Closing the Guests→Budget gap is mechanical (the hook already exists, it just needs a real cost input wired in); a Budget↔Timeline or Guests↔Timeline link does not exist in any form yet and would need to be designed from scratch.

### 2.5 The "can't access lexical declaration before initialization" crash

Investigated a second time, independently, specifically to try to move past the prior inconclusive static-analysis pass:

- An automated import-graph scan across all 1,067 `.ts`/`.tsx` files in `solid-ui/src` found ~30 apparent import cycles on a first pass. On manual inspection, **every one of them resolves to a type-only import in one direction** (`import type { ... }`, erased at build time and incapable of causing a runtime TDZ). Excluding type-only imports, **zero real circular dependencies exist in the codebase.** This means the "circular ES module import" theory — the standard explanation for this class of minified error — is not the cause here, or at least not a source-level one.
- The built `dist/` output was also checked at the chunk level (Rollup's `manualChunks` could in principle create a chunk-level cycle even without one at the source level). No such cycle was found; the large shared chunk `weddingTemplateEntryState-*.js` (~432KB, aggregating dozens of `wedding*State.ts` modules) has an acyclic dependency chain into `main-*.js`.
- **Conclusion: root cause still not found.** The size/fan-in of that shared chunk is flagged as a plausible risk factor (large minified scopes are exactly where subtle ordering bugs hide), but no concrete defect was located inside it. An alternative, unconfirmed possibility raised by this pass: the symptom could be a transient chunk-load/race condition (stale cache, prefetch reordering) rather than a deterministic source bug, which would explain the earlier user report that "Continue to Sign In" fails the first click but works the second. **This needs a live browser DevTools stack trace to resolve conclusively — two independent static-analysis passes have now failed to find it without one.**

---

## 3. Backend findings

### 3.1 What exists today

Real, working Rust endpoints for the wedding funnel (`src/server/user_management_routes.rs`, `src/server/mod.rs`):

- `POST /wedding/waitlist` — waitlist signups, persisted via `insert_wedding_waitlist_signup`.
- `GET/POST /wedding/onboarding-state` — the only per-user wedding funnel state that is durable server-side.
- `GET /wedding/vendors`, `POST /wedding/vendors/{id}/contact` — vendor directory and contact-request logging.
- Admin surface: `GET/POST /admin/wedding/vendors`, `PUT/DELETE /admin/wedding/vendors/{id}`, `GET /admin/wedding/ops-metrics`, `GET /admin/wedding/ai-routing-policy`, `GET /admin/wedding/waitlist`.

### 3.2 Gap — no persistence for the actual planning data

Grepped all 146 `solid-ui/src/lib/wedding*.ts` files for any `fetch`/`apiFetch` call: **zero matches.** Guest lists, budget line items, seating charts, and helper/task assignments never reach the backend in any form — they live entirely in client-side signals, with only 18 of the 146 files touching `localStorage` at all. **Practical consequence: clearing browser storage, or opening the workspace on a second device, loses all wedding planning content.** Only the vendor catalog, waitlist signups, and onboarding-state metadata survive today. This is the single largest backend gap and should be treated as higher priority than any of the UI polish items above.

### 3.3 Gap — CORS allowed-methods list is missing DELETE

`src/server/auth.rs:3844-3865` — `cors_layer()` correctly sets `allow_credentials(true)` with an explicit origin allowlist, but `allowed_cors_methods()` only permits `GET, POST, PUT, OPTIONS`. The admin vendor-delete route (`DELETE /admin/wedding/vendors/{id}`, `user_management_routes.rs:31`) is a cross-origin `DELETE` from the workspace's perspective (workspace origin vs. `api.omnyid.com`), so it will fail CORS preflight in the browser today. This is unrelated to the TDZ crash but is a concrete, confirmed defect.

### 3.4 Gap — no token-refresh concept

`apiFetch` (`solid-ui/src/lib/api.ts:3374-3422`) always attaches the Bearer token when a session exists and calls `clearSession()` on a 401 (excluding proxy-Basic-auth challenges). There is no refresh-token flow anywhere in `api.ts` — an expired session simply logs the user out locally with no explicit redirect-to-sign-in baked into the fetch layer itself (that depends on whichever UI component happens to be subscribed to the session-changed signal). Worth a design decision on whether silent re-auth is wanted, versus explicitly recommend an early full-page fallback whenever the session is invalidated mid-session, to avoid the "crash on click" experience reported earlier.

---

## 4. AFP core-principle compliance (wedding domain data)

The user asked that all data respect AFP core. Per-principle status, restricted to guests/budget/seating/timeline/helpers (the wedding-specific domain; the app's general boundary/permissions subsystem is a positive counter-example proving the pattern is achievable):

| Principle | Status | Evidence |
|---|---|---|
| Everything is an AFP ledger object (`type: ledger`, kind, supertags, typed references) | **Not met.** | Guest data is parsed by regex out of a markdown table embedded in `artifact.bodyText` (`weddingGuestTrackingState.ts:64-81`, fuzzy header matching at 344-350) — not a typed ledger row. Budget/seating/timeline are recomputed client-side each render from generic decision records/artifacts, not from dedicated ledger fields. The backend has no guest/budget/seating/timeline tables at all. **Counter-example that proves this is achievable:** `weddingBoundaryLedgerState.ts:466-482` (`weddingBoundaryLedgerObjectToAfpMessage`) does correctly emit `type: "ledger"`, `kind`, `subtype`, and `supertags` — this is the boundary/permission subsystem, not the planning data itself. |
| Topology/typed references for relationships (household, invitation, permission, decision) | **Partial.** | Present for permissions/boundaries (via the ledger object above). Absent for guest↔household, guest↔seating-table, task↔helper relationships, which are currently plain object fields, not typed links. |
| Private notes/decision rationales stay E2EE, couple-only | **Not met — field names imply encryption that doesn't happen.** | `weddingBoundaryLedgerState.ts:454-473` and `weddingBoundaryDecisionState.ts:53,77` carry fields literally named `privateRationaleCiphertext`/`privateNotesCiphertext`, but the actual code (`weddingBoundaryDecisionState.ts:53`) is a plain string-trim, not an encrypt call. The app's real E2EE primitive (`initLedgerKey`, `src/lib/profileLedger.ts:391`) is never imported by any wedding file. **Wedding rationale/notes are effectively plaintext today, encrypted only in field-naming intent.** This is worth flagging to the user as a real privacy gap, not just a code-quality nit — "private notes" that aren't actually encrypted is a meaningfully different promise to a couple than what the principle states. |
| Progressive disclosure, calm UI | **Mostly met, one known gap.** | The tab-based structure and gated `WeddingDecisionFocusCard` generally avoid overwhelm, but the same gating (§2.2) leaves brand-new users with a blank/under-informative Home tab rather than a calm, guided first impression — the opposite of the intended effect. |
| Human-in-the-loop approval gates for sensitive changes | **Met.** | Wedding tasks/decisions genuinely reuse the shared `reviewStatus`/`approvalState` fields and route into the general decision-queue system (`weddingGuestTrackingState.ts:246-247`, `weddingBoundaryLedgerState.ts:464`, `weddingBudgetAllocationState.ts:10`) — this principle is properly honored, not bypassed. |
| A2UI rendering (interfaces expressible as clean A2UI views) | **Not met.** | The app has a real, implemented A2UI system (`src/components/renderers/A2UIRenderer.tsx`, `A2UICard.tsx`, `A2UIFlowchartView.tsx`, `src/lib/a2uiContentState.ts`) — this is not aspirational/doc-only elsewhere in the codebase. However, all 24 `Wedding*.tsx` components are hand-built plain SolidJS with zero imports from the A2UI system. The wedding template is a fully parallel, disconnected UI stack relative to this principle. |

**Summary:** the wedding template was built quickly as its own vertical slice and did not inherit the AFP ledger/A2UI/E2EE substrate the rest of the platform is meant to stand on — only the human-in-the-loop approval-gate reuse and the separate boundary/permissions subsystem currently honor the doctrine. Bringing guests/budget/seating/timeline onto real ledger objects, real encryption, and real A2UI rendering would be a substantial migration, not a small patch — worth a dedicated design/scoping pass rather than folding into incremental UI fixes.

---

## 5. Proposed design for the requested "what should I do next" summary card

Not implemented — audit only — but concretely specified here since the two supporting patterns already exist in the code today and this is meant to extend them, not invent a new mechanism:

- **Placement:** top of the Home tab, above `WeddingHomeOverviewGrid`, always visible (unlike `WeddingDecisionFocusCard`, which should keep its current gate — this new card is specifically meant to cover the case that one doesn't).
- **Persona/voice:** reuse the same empathetic, reassuring copy register already established in `WeddingNavigationArrivalBanner`'s situational messaging and the walkthrough's tone — warm, brief, never alarmist about what's missing.
- **Situational logic (a priority-ordered checklist, first unmet condition wins):** wedding date unset → budget target unset → guest list empty/RSVPs not started → seating not started → helpers not assigned → (fallback) an encouraging "on track" message summarizing days remaining, RSVP rate, and budget headroom, all values already computed by `weddingResponseWorkspaceViewState.ts`. No new state modules are needed to source these values — see the fields already listed in §2.4 and used by `WeddingHomeOverviewGrid` today.
- **CTA:** a single primary button, same visual pattern as `WeddingDecisionFocusCard`'s CTA (`WeddingWorkspaceContextPanels.tsx:670-677`), wired the same way `openBudget`/`openCalendar` already are — `onSelectMenu("budget" | "guests" | "seating" | "helpers")` or, for the date field specifically, a menu switch plus a scroll/focus target (the walkthrough's `openLinkedSection` in `WeddingPlannerWalkthrough.tsx` already demonstrates the "switch tab and focus a specific field" pattern that would need to be reused here for the date field, since date is likely inside a sub-section rather than its own tab).
- **Dismissal:** should NOT be permanently dismissible the way `WorkspaceSetupBanner` is — since its message changes as the couple's situation changes, it should simply update/disappear naturally once every checklist condition is satisfied, converging into the "on track" fallback state rather than being closeable.

---

## 6. Prioritized recommendations (frontend vs. backend, kept separate per request)

### Frontend
1. **High** — Add a click-through to the 5 inert empty-state cards listed in §2.1 (mechanical fix, same pattern as the already-working `openBudget` button).
2. **High** — Build the always-visible "what's next" summary card per §5, since it directly closes the gap left by `WeddingDecisionFocusCard`'s gating and was explicitly requested.
3. **Medium** — Wire the already-defined `estimatedCostPerGuest`/`budgetImpactAmount` hook (§2.4) into the real budget tracker so guest-count changes actually move the budget numbers.
4. **Medium** — Get a live browser DevTools stack trace for the TDZ crash; two static-analysis passes have now ruled out the obvious circular-import cause without finding the real one.
5. **Low/scoping** — Decide whether Budget↔Timeline or Guests↔Timeline integration is wanted at all before building it; no existing hook suggests an intended design here, unlike the Guests→Budget case.

### Backend
1. **High** — Design and add real persistence (ledger-backed, per §4) for guest lists, budget line items, seating charts, and helper/task assignments — today this data does not survive a cleared browser or a second device.
2. **Medium** — Add `DELETE` to `allowed_cors_methods()` in `auth.rs:3863-3865` — confirmed, concrete cross-origin bug affecting the admin vendor-delete route.
3. **Medium** — Decide on a token-refresh or explicit re-auth-redirect strategy in `api.ts`'s 401 handling, to avoid session-expiry showing up to users as an unexplained crash.
4. **Low/scoping** — If private wedding notes/rationales are meant to actually be E2EE (the field names already claim this), wire `initLedgerKey`/the app's real encrypt path into `weddingBoundaryDecisionState.ts` rather than leaving `privateRationaleCiphertext` as a plain trimmed string.

---

## 7. Explicitly out of scope for this audit

- The two pre-existing, unrelated test issues noted in the previous work session (a flaky assertion in `wedding-response-workspace-operations-state.test.ts`, and pre-existing failing assertions in the untracked `workflow-timeline-card-presentation` files) were not re-investigated here; they are unrelated to this audit's UI/backend-integration scope.
- No code was modified. All recommendations above require separate authorization before implementation.
