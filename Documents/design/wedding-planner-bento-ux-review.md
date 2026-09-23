# Wedding Planner Template — Bento UX Review

Scope: the **Wedding Planner template inside the Solid UI workspace** (`solid-ui/src/components/Wedding*.tsx` and the generic views it hooks into — `ResponseQueueView`, `DecisionQueueView`, `FilesView`, `MonthlyCalendarView`, `KnowledgeGraphView`, `renderers/LedgerBoardRenderer.tsx`). Not the wedding-website-facing frontend.

This is a **review + proposal document only** — no code was changed. Recommendations are written for a Solid app, so they lean on live client state, drag/resize, inline editing, and other interactivity a static site couldn't offer — not generic responsive-web caution.

## 1. What exists today (as read from the code)

- **There is no single "wedding planner screen."** The wedding template is a set of components (`WeddingResponseWorkspaceView`, `WeddingWorkspaceContextPanels`, `WeddingTaskStageView`, `WeddingDecisionFocusCard`, `WeddingNavigationArrivalBanner`, etc.) that get *injected into* six pre-existing, general-purpose OmnyID views: Response Queue, Decision Queue, Files, Calendar, Knowledge Graph, and a Ledger Board renderer. Each of those views renders a `WeddingNavigationArrivalBanner` at the top when a wedding is active.
- **The app already has a real bento engine** — `BentoGrid.tsx` — a draggable/resizable tile grid (`packTiles`, `TILE_LAYOUT_POLICIES`, tiers 1–4, responsive column counts 1/2/4/6/8) used for the general home dashboard (Chat, Email, Decision Queue, Calendar, Tasks tiles, etc.). **The wedding content does not participate in this system at all.** It lives in its own, separate, single/two-column stacked-card layout.
- **`WeddingWorkspaceContextPanels`** (the sidebar shown alongside the response workspace) renders roughly **15 full-width cards stacked vertically**: Decision focus, Production go/no-go, Background automation, Collaboration access, Import readiness, Budget tracker, Guest operations, Seating draft, Delegated responsibilities, Wedding Gantt timeline, Need-to-know context, Provider handoff audit, Vendor follow-ups, Expected-behavior audit, Approval receipts, Saved decision scope, Smart Actions, Topology recommendations. Every card uses the same visual weight (`rounded-[24px]`, `p-3`/`p-4`, `shadow-card`) regardless of how important or how often-used it is.
- **A `showTechnicalDetails` boolean** gates about half of those cards, but several system/engineering-flavored cards (Collaboration access, Budget, Guest ops, Seating, Delegation, Gantt, Need-to-know) are **always visible**, so "advanced" content and "everyday" content are interleaved rather than cleanly separated. This is fine as the showTechnicalDetails boolean actually hides production related, technical user related content, as opposed to actual wedding logistics.
- **Terminology leaks internal/engineering vocabulary directly into user-facing copy**: "personalOsProjection", "decisionLoadRelief", "AFP decision records", "Topology recommendations", "Second-order loop", "provider handoff audit", "expected behavior audit", "production go/no-go packet", "background automation coverage". A person planning their wedding has no mental model for any of this. Keep the internal vocabulary, but make the user facing equivalent more user friendly, to the point that a 15 year old would understand.
- **Color is used decoratively, not semantically.** Thirteen-plus distinct Tailwind hues appear across the wedding cards (rose, teal, pink, lime, fuchsia, indigo, orange, stone, cyan, amber, sky, emerald, violet) with no consistent mapping to a domain (e.g. "budget is always green," "guests are always blue"). The color changes card-to-card with no pattern a user could learn.
- **Type scale skews very small.** Body copy is overwhelmingly `text-[10px]`/`text-[11px]` (roughly 7–8.5px depending on rendering), even for primary numbers and status labels. This is a real accessibility/readability issue for a consumer product likely used by a broad age range (couples, parents, older relatives helping plan).
- **Good things worth keeping:**
  - The file-import flow (`WeddingResponseWorkspaceView`, drag-and-drop) has genuinely plain-language copy: "Import existing spreadsheets, guest lists, budgets, Google Sheets exports, or The Knot exports."
  - Export as Markdown / Printable page / Word document with a simple dropdown is the right level of abstraction for a non-technical user.
  - `WeddingTaskStageView`'s "anytime tasks first, then grouped by preparation stage" hierarchy, and letting users un-tick a completed task, is a sound, forgiving interaction model.
  - The arrival banner pattern (badge + title + subtitle + primary/secondary actions + body chips) is a reasonable, reusable "orientation" component — the problem is where it's used, not how it's built.
  - `DecisionOSHomeView` already has confetti-on-completion, keyboard shortcuts, and mood-based filtering — there's an existing appetite in this codebase for delight and progressive disclosure that the wedding template hasn't inherited yet.

## 2. The core problem, in one sentence

**The wedding planner asks a non-technical user to navigate a power-user information architecture (Response Queue / Decision Queue / Files / Calendar / Knowledge Graph) to find scattered, unevenly-weighted cards, instead of giving them one bento home that already knows what a wedding is.**

## 3. Proposed direction: a "Wedding Command Center" bento home

Give weddings their own bento-driven landing view, built on the *existing* `BentoGrid.tsx` engine (same tile-packing, drag/resize, responsive column logic) rather than the current bespoke stacked layout. The four other views (Response Queue, Files, Calendar, Knowledge Graph) remain as drill-down destinations *reached from* a tile, not as the primary way to discover wedding content. Keep the Decision Queue card prominent.

### 3.1 Tile inventory (mapped from existing state, renamed for humans)

| Tier | Tile | Backing state already in code | Plain-language framing |
|---|---|---|---|
| 1 (hero) | **Countdown & next step** | wedding date + `decisionLoadRelief.focusItems[0]` | "62 days to go — next: confirm venue deposit" |
| 1 | **Budget** | `budgetTracking` | Big number: spent / total, one bar, one line of "on track" / "over" |
| 1 | **Guests** | `guestTracking` | RSVP yes/no/pending as three big numbers, not prose |
| 2 | **Tasks & timeline** | `WeddingTaskStageView` stages + `ganttTimeline` | Checklist view *and* a visual timeline view, same tile, tab-switch |
| 2 | **Seating** | `seatingPlan` | Table count + unassigned-guest count + a "finish seating" CTA |
| 2 | **Vendors** | `vendorContactCards`, `delegation` | One card per vendor with status (booked/waiting/urgent), not a wall of text |
| 3 | **Documents** | `workspace.results` (planning files) + export bundle | Search + list, opens the existing Files/detail panel |
| 3 | **Decisions waiting on you** | `WeddingDecisionFocusCard` | Only the items that actually need a yes/no |
| 4 (opt-in) | **Advanced / automation** | Production gate, background automation, provider handoff, expected-behavior audit, topology recommendations, AFP decision records | Collapsed by default behind one real "Show technical details" switch, consistent everywhere — not per-card |

This mirrors `BentoGrid.tsx`'s existing tier system (`tier: 1..4`, `defaultColSpan`/`defaultRowSpan`) almost exactly — tier 1 tiles get the large hero slots, tier 3–4 collapse to compact mode on small screens exactly the way `resolvePackedDisplayMode` already does for the general dashboard. **This is not new infrastructure, it's applying infrastructure that already exists elsewhere in the app.**

### 3.2 Visual hierarchy fixes

- **One domain → one color**, applied consistently everywhere the domain appears (tile, chip, banner accent): Budget = emerald, Guests = sky, Vendors = amber, Timeline/Tasks = violet/rose (keep the current rose for the overall wedding brand accent), Documents = slate, Decisions = indigo. Drop the other ad hoc hues. This gives the user a color vocabulary they can learn in one glance, the same way the existing `TILE_BG`/`ACCENT` maps already do for the general bento grid — just apply that same discipline to wedding tiles. However, keep the card's advanced option to change card color.
- **Raise the floor on type size.** Primary numbers (countdown, budget total, RSVP counts) at minimum 24–32px; supporting labels at minimum 13–14px; reserve anything under 12px for true metadata (timestamps, IDs) that isn't part of the primary reading path. A wedding-planning tool will be read by grandparents on a phone in bad light — err large.
- **Stop stacking 15 same-weight cards in a column.** Bento's whole value proposition is that *size communicates importance*. A budget snapshot and a "topology recommendations" card should never occupy the same visual footprint.

### 3.3 Language pass

Replace every internally-coined term before it reaches the UI:

| Internal term | User-facing replacement |
|---|---|
| "Decision focus" / "decisionLoadRelief" | "What needs your yes/no" |
| "AFP decision records" / "Saved decision scope" | "Choices you've locked in" |
| "Topology recommendations" | (drop from default view; if kept, "Suggested connections") |
| "Second-order loop" / "Smart Actions" | "Follow-up we can handle for you" |
| "Provider handoff audit" | (advanced-only; "Vendor system connections") |
| "Expected behavior audit" | (advanced-only; "Automation health check") |
| "Production go/no-go packet" | (advanced-only; "Launch readiness") |
| "Background automation coverage" | (advanced-only; "What's running automatically") |
| "Response workspace" / "Planning files" | "Your wedding documents" |

A simple naming rule going forward: **if a term originates from the underlying agent/orchestration system rather than from how a couple would describe their own wedding, it belongs behind the Advanced toggle or should be renamed.**

### 3.4 Navigation

- Make the Wedding Command Center the landing destination when a wedding workspace is active (today the same arrival banner is duplicated across five separate views, which itself signals the IA is fragmented — a user shouldn't need to already be in "Decision Queue" or "Knowledge Graph" to be reminded a wedding exists).
- Keep `WeddingNavigationArrivalBanner` only as a lightweight "you have a wedding open" strip on the *other* views, always pointing back to the Command Center as primary action, rather than duplicating full context there.
- Tiles are the entry point to detail: clicking the Vendors tile opens the existing vendor detail flow; clicking Documents opens `WeddingArtifactDetailPanel`; clicking Tasks opens the full `WeddingTaskStageView`. Nothing here requires new detail screens — it requires a home that routes to the ones that already exist.

### 3.5 Because this is Solid, not a static site — lean into it

Since this template isn't bound by static-site constraints, the following are legitimate given the existing reactive infrastructure (`createSignal`, `createMemo`, drag state already in `BentoGrid.tsx`):

- **Inline-editable tiles**: let a user tick off a task, nudge a budget line, or mark an RSVP directly on the tile face — no navigation required — using the same optimistic-update pattern `WeddingTaskStageView` already uses (`completedOverrides` + background sync).
- **Live recompute, no refresh**: budget bar and guest counts should visibly animate when a change lands, reusing the transition classes already present (`transition-[width] duration-500` in `CostDashboardTile`).
- **Drag-to-reprioritize** using the exact same `saveBentoGridLayout`/`loadBentoGridLayoutState` local-storage layout persistence the general bento grid already has — a couple could put Budget first if that's their stress point, or Guests first if RSVPs are the current crunch.
- **Milestone celebration**: extend the confetti effect already implemented for `DecisionOSHomeView` (`appendDecisionOsConfetti`) to fire when a wedding task stage is fully completed, or the final RSVP comes in. This is a case where a bit of static-site-inappropriate delight (motion, celebration) is exactly right for the emotional register of the product.
- **Two-person presence**: if both partners use the workspace, a small presence indicator on the Command Center (who's online, what they last touched) turns solo planning into shared planning — something no static site could offer, and something this app's real-time infrastructure likely already supports elsewhere.
- **Command-K style quick add** ("add guest," "log vendor payment," "add task") anchored to the Command Center, following the existing `BentoQuickAdd` components already built for Calendar/Task/Email tiles — just extended with wedding-specific quick-add types (guest, vendor, budget line).

## 4. Suggested phasing

1. **Language + color pass** on existing cards (no layout change) — lowest risk, immediate clarity win.
2. **Collapse the sidebar stack behind tiers**: hide tier-4 "advanced" cards behind one real toggle; this alone removes roughly half the vertical noise.
3. **Port wedding cards into `BentoGrid.tsx`'s tile system** as new `TileViewId`s (e.g. `wedding_budget`, `wedding_guests`, `wedding_vendors`, `wedding_timeline`, `wedding_seating`) reusing `TILE_LAYOUT_POLICIES` tiers, so wedding gets the same responsive packing, drag, and resize behavior the rest of the app already has.
4. **Wedding Command Center as landing view**, with the other five views demoted to drill-down destinations.
5. **Delight layer**: celebration, presence, inline editing, quick-add — once the structural bento layout is in place.

## 5. Files referenced

- `solid-ui/src/components/BentoGrid.tsx` — the existing bento engine to extend
- `solid-ui/src/components/WeddingResponseWorkspaceView.tsx`
- `solid-ui/src/components/WeddingWorkspaceContextPanels.tsx`
- `solid-ui/src/components/WeddingTaskStageView.tsx`
- `solid-ui/src/components/WeddingNavigationArrivalBanner.tsx`
- `solid-ui/src/components/DecisionOSHomeView.tsx` — source of the confetti/keyboard-shortcut/mood-filter patterns worth reusing
- Injection points: `ResponseQueueView.tsx`, `DecisionQueueView.tsx`, `FilesView.tsx`, `MonthlyCalendarView.tsx`, `KnowledgeGraphView.tsx`, `renderers/LedgerBoardRenderer.tsx`
