# Wedding Planner Template — Critical Review of the Menu-Split Redesign

Follow-up to [`wedding-planner-bento-ux-review.md`](./wedding-planner-bento-ux-review.md). This document reviews the **menu-split redesign already implemented** in `solid-ui/src/components/ResponseQueueView.tsx`, `WeddingResponseWorkspaceView.tsx`, and `WeddingWorkspaceContextPanels.tsx`, plus `solid-ui/src/lib/weddingWorkspaceMenuState.ts`. Review + proposal only — no code changed.

## 1. What changed, and what it fixed

Cards are no longer one undifferentiated stack. A horizontal pill nav (`WEDDING_WORKSPACE_MENU_ITEMS` in `ResponseQueueView.tsx:88-152`) now drives an `activeMenu` signal (`weddingWorkspaceMenu`, `ResponseQueueView.tsx:205`) that is threaded down through `WeddingResponseWorkspaceView` into `WeddingWorkspaceContextPanels`, where each card is wrapped in `<Show when={activeMenu() === "..."}>`. Seven sections: **Home, Budget, Guests, Seating, Who helps, Queue, Timeline**.

This is real, measurable progress against the previous review:

- **Cognitive load per screen dropped** from ~15 stacked cards to typically 1–2 per tab.
- **Color is now a genuine domain system**, not decorative: pink=Home, emerald=Budget, amber=Guests, sky=Seating, fuchsia=Who helps, slate=Queue, indigo=Timeline — and the same hues are reused for the card itself (e.g. `WeddingWorkspaceContextPanels.tsx:272` seating card is `border-sky-100`/`bg-sky-50`, matching the sky "Seating" pill). This is exactly the fix the previous review asked for.
- **Type scale improved**: primary numbers now render at `text-2xl` (budget remaining, countdown, seating counts — `WeddingWorkspaceContextPanels.tsx:113,117,285,289,293`), and most body copy moved from `text-[10px]`/`[11px]` to `text-xs`/`text-sm`.
- **Language pass landed in most places**: "What needs your yes/no," "Choices you've locked in," "Follow-ups we can handle," "Suggested connections," "Who is helping" all read as plain English now, versus the raw internal terms flagged before.
- Each nav pill carries a `title` tooltip explaining what's inside in one sentence (`ResponseQueueView.tsx:100,108,116,124,132,140,148`) — a good, low-cost orientation aid.

## 2. Critical findings

### 2.1 The "advanced" cards ignore the menu — the core problem resurfaces silently

`WeddingWorkspaceContextPanels.tsx` gates nine cards purely on `props.showTechnicalDetails`, with **no `activeMenu` check at all**: Setup details banner (183), Production gate (189), Background automation (191), Import check (206-261), Connected apps for sending (565), Expected-behavior audit / "Automation health" (644), Approval history (706), Choices you've locked in (750), Follow-ups we can handle (790), Suggested connections (841).

The toggle for `showTechnicalDetails` only lives inside the **Home** tab's document card (`WeddingResponseWorkspaceView.tsx:283-289`, "Show setup details" button). But the boolean it flips is a signal owned by the parent, so once a user turns it on and then clicks over to **Budget** or **Seating**, all nine advanced cards render underneath the Budget or Seating card anyway — because those `Show` blocks don't check which tab is active.

**This silently recreates the exact "15 cards on screen" problem the tab split was built to solve**, just gated behind one extra click instead of zero. A first-time user who curiously opens "Show setup details" once (to see what it does) will now see a permanently noisier app on every tab thereafter, with no obvious way to connect the noise back to a switch they flipped on a different screen. Fix: either scope every technical card to `activeMenu() === "home"` (simplest — advanced content only ever shows on Home) or give "Setup details" its own dedicated tab/pill so its content is genuinely tab-scoped like everything else.

### 2.2 "Share the Plan" is neither a tab nor a true overlay

`showWeddingSharePlan` is a separate header button (`ResponseQueueView.tsx:755-767`) next to the tab row, not one of the seven pills, yet it renders `WeddingCollaborationAccessCard` (`WeddingWorkspaceContextPanels.tsx:202-204`) with the same visual weight as any tab's primary card — and it stacks on top of whatever tab is currently open. A user on "Timeline" who clicks "Share the Plan" now sees the Timeline card and the Collaboration card together, breaking the one-focus-per-screen model the other seven sections just established. Since collaboration is arguably as central to wedding planning as budget or guests (two partners planning together is the norm, not the edge case), it deserves the same first-class, single-focus treatment: either make it the 8th tab, or make it an unambiguous global overlay (e.g. a slide-over panel) that's visually distinct from "a tab's content," not a card that quietly stacks into the current tab.

### 2.3 The nav isn't operable as a tab list

The pills use `<nav>` + `<button aria-pressed>` (`ResponseQueueView.tsx:711-730`). That's the ARIA pattern for a toggle-button group, not for mutually-exclusive views. The correct pattern here is `role="tablist"` on the container, `role="tab"` + `aria-selected` on each button, `role="tabpanel"` on the content region, and arrow-key roving focus between tabs. Right now a screen-reader user gets "Budget, button, pressed" with no sense that this is 1-of-7 in a set, and keyboard users can only reach each pill via sequential Tab, not arrow keys. For a first-time, possibly non-technical user relying on assistive tech, this is a real operability gap, not a cosmetic one — and it's a markup/attribute change, not a redesign.

### 2.4 No indication of where you are without data

None of the seven pills show a live count or status dot, even though every number they'd need already exists in state one level down: `budgetTracking` could flag "over budget," `guestTracking` could show pending-RSVP count, `seatingPlan.unassignedAttendingCount` could badge "Seating," `vendorContactCards` filtered by `tone === "urgent"` could badge "Queue." A first-time user scanning seven identical-looking pills has no signal for "which of these actually needs me today" — they have to click into each one to find out. This is the single highest-leverage, lowest-cost fix available (see §3 for why it's specifically cheap in Solid).

### 2.5 Switching tabs is instant and stateless — no confirmation, no memory

- **No transition**: `Show` mounts/unmounts content with no CSS transition (`grep` for `transition-`/`animate-` in both files returns nothing beyond hover states). A click swaps the whole panel in one frame. For a first-time user this can read as "did my click do anything?" — there's no perceptible acknowledgment of the action beyond the pill's own color change.
- **No persistence**: `weddingWorkspaceMenu` is a plain `createSignal("home")` with no `localStorage` backing. Refresh the page, or come back tomorrow, and you're back on Home regardless of where you left off — even though the exact persistence pattern already exists in this codebase for bento tile layout (`bentoGridLocalState.ts`'s `saveBentoGridLayout`/`loadBentoGridLayoutState`).
- **No deep link**: the tab isn't reflected in the URL, so "send my partner a link straight to Seating" isn't possible. (The app has no router in general — this isn't unique to the wedding template — but a scoped fix using the History API for just this tab state is still low-risk and high-value for a two-planner household.)

### 2.6 Content fully unmounts on tab switch, losing in-panel state

`Show` removes the DOM subtree of the non-active tab entirely. `WeddingCollaborationAccessCard` keeps an `openRole` signal for its expandable "What people can do" `<details>` (`WeddingCollaborationAccessCard.tsx:9`) — if a user opens a role's detail, switches tabs, and comes back (or if it's re-triggered by the sharePlanOpen toggle rather than a tab), that local expand state is gone. Scroll position within a long tab (e.g. Timeline with six-plus Gantt rows) is also lost on every switch. None of this is destructive, but it's friction a first-time user notices as "the app forgot what I was doing."

### 2.7 Icon glyphs are ambiguous placeholders

The nav icons are bare characters in circles: `H`, `$`, `G`, `S`, `+`, `Q`, `T` (`ResponseQueueView.tsx:98,106,114,122,130,138,146`). `$` for Budget and `G` for Guests are guessable; `+` for "Who helps" reads as "add something," not "helpers," and `H`/`S`/`Q`/`T` are just first letters, which stops working the moment two sections start with the same letter (Seating vs. "Setup details," if that ever becomes its own tab). The codebase already has a real icon component (`RailIcon` from `@/components/RailIcons`, used throughout `BentoGrid.tsx`) — these placeholders read as scaffolding that was never swapped for the real thing.

### 2.8 A few terminology rough edges remain

"Approval history" (approval of *what*, from the reader's point of view — a vendor quote? a sent message?), "Access check" inside the Share-the-Plan card, and "Queue" as a tab label (still a step removed from how a couple would describe "messages I need to reply to") are holdovers from the previous vocabulary pass. Minor compared to §2.1–2.4, but worth a second pass once the structural issues are fixed.

## 3. Solid's dynamic-interface strengths that this template isn't using yet

The brief specifically asked to dig into this: Solid is not a virtual-DOM diffing framework — it compiles to fine-grained reactive updates on real DOM nodes, and the codebase already demonstrates several patterns the wedding tabs don't use.

- **Live nav badges are near-free here, unlike in a vDOM framework.** A `createMemo` reading `budgetTracking.isOverBudget` or `guestTracking.pendingCount` and rendering a small dot/count on the "Budget"/"Guests" pill only re-runs and re-touches the DOM node for that one badge when the underlying value changes — it does not re-render the pill, the tab content, or anything else. This is the mechanism that makes §2.4's fix cheap: it's a `<span>{count()}</span>` bound to an existing derived value, not a new subscription or a re-render concern.
- **`createResource` + `<Suspense>` for per-tab progressive loading — precedent already exists in this exact codebase** (`App.tsx`, `FilesView.tsx`, `KnowledgeGraphView.tsx`, even the sibling `UsageAdminWeddingVendorsPanel.tsx` all use `createResource`/`Suspense`), but `WeddingResponseWorkspaceView` receives one fully-precomputed `WeddingResponseWorkspaceViewState` regardless of which tab is active, meaning Seating's table-assignment logic and the Gantt timeline's date math are computed up front even if the user only ever opens Home. Wrapping the heavier tabs (Seating, Timeline) in their own `createResource` keyed on `activeMenu` would mean a first-time user's first paint (Home) is not paying for the other six tabs' computation, and switching to a heavier tab could show a lightweight skeleton for a beat instead of blocking.
- **Keep inactive tab panels mounted instead of unmounting them.** Because Solid's cost model is "how many DOM nodes and subscriptions exist," not "how large is the vDOM tree to diff," it's cheap to render all seven panels once and toggle a `style={{ display: activeMenu() === id ? "block" : "none" }}` (or a `classList` toggle) instead of `<Show>`'s mount/unmount. That single change fixes §2.6 for free — `WeddingCollaborationAccessCard`'s `openRole` signal, scroll position, and any future in-tab form drafts simply survive, because the component instance never gets torn down.
- **A transition primitive for the swap.** Solid doesn't need a virtual-DOM-diffing library to animate this — a plain CSS `transition: opacity` keyed off a `data-active` attribute (toggled by the same signal already driving `Show`) gives the "did my click register" feedback from §2.5 with no new dependency, though `solid-transition-group` (not currently installed) is a drop-in option if enter/exit choreography is wanted later.
- **`localStorage`-backed last-tab memory**, reusing the exact `save*/load*LocalState` shape already established by `bentoGridLocalState.ts`, so `weddingWorkspaceMenu` initializes from storage instead of always defaulting to `"home"`. Trivial to add, directly fixes half of §2.5.
- **`GuidedTour.tsx` and `OnboardingWizard.tsx` already exist in this codebase** and are not currently wired into the new tab bar at all. A first-time user's very first encounter with seven unlabeled-by-experience pills is exactly the scenario these components were built for — a two-or-three-step coach-mark ("These are your wedding sections. Start with Budget or Guests.") costs no new infrastructure, just a call site.
- **The `compact` prop is already computed reactively** (`compactMode()` in `WeddingResponseWorkspaceView.tsx:90`) but only changes card padding/radii. On small screens, the same reactive signal could drive a genuinely different nav shape — a fixed bottom tab bar with icons, which is the mobile-idiomatic pattern for exactly this kind of 5-8-destination switcher — rather than a horizontally-scrolling pill row that hides the later tabs off-screen with no scroll affordance shown.

## 4. Wedding-planning-perspective suggestions for a first-time user

- **Home should actively notice what's missing, not just show what's decided.** If there's no wedding date yet, no budget set, and no guests added, "What needs your yes/no" and "Days to wedding: Add date" (the existing fallback string, `WeddingWorkspaceContextPanels.tsx:55`) is a weak first impression. A first-time user's Home should read more like a short setup checklist ("Add your date," "Set a budget," "Start your guest list") that resolves itself into the current decision-focus view once those exist — the difference between an empty *state* and an empty *product*.
- **Not all seven tabs matter on day one.** A newly engaged couple's first real actions are almost always date, budget ballpark, and guest count — Seating and Timeline are meaningless until those exist. Consider a small "not started" affordance on tabs that have no data yet (distinct from the live-badge idea in §2.4/§3, which is about *urgency* on tabs that already have data), so a first-time user's eye is drawn to Budget/Guests first without being told to via copy.
- **"Who helps" (delegation) is a stronger retention feature than its current placement suggests.** Couples planning together, plus parents/bridal party pitching in, is a core wedding-planning behavior — right now it's tab 5 of 7 with a `+` icon that reads as "add." Given the collaboration overlay problem in §2.2, consider whether "Who helps" and "Share the Plan" are actually the same underlying concept (people + roles + access) that's currently split into two different UI mechanisms (a tab vs. a header toggle) for no clear reason to the end user.
- **Empty states should feel like the next step of onboarding, not a dead end.** The existing empty-state copy ("No helpers added yet. Start with legal forms, venue choice...") is good — plain language, concrete suggestions. Extend that same voice to a first-run Seating and Timeline state that explains *why* the tab looks empty (needs a guest list / needs dated tasks first) and links straight to the tab that unblocks it, rather than requiring the user to guess the dependency between tabs themselves.

## 5. Suggested phasing

1. **Fix the containment bug (§2.1)** — scope every `showTechnicalDetails` card to `activeMenu() === "home"`, or give it its own tab. This alone restores the tab split's core promise.
2. **Resolve the Share-the-Plan/Who-helps overlap (§2.2, §4)** — decide whether it's a tab or a true global overlay, and whether it should merge with "Who helps."
3. **Tab semantics + live badges (§2.3, §2.4)** — markup/attribute fix plus a handful of `createMemo`s; both are small, high-value, and don't touch visual design.
4. **Persistence + keep-alive panels (§2.5, §2.6, §3)** — reuse `bentoGridLocalState.ts`'s pattern for last-tab memory; switch `Show` to a display-toggle so panel-local state survives.
5. **Wire in `GuidedTour.tsx`** for first-time users, and swap the placeholder letter icons for `RailIcon`s.
6. **Progressive loading for heavier tabs** via `createResource`/`Suspense`, following the precedent already in `FilesView.tsx`/`KnowledgeGraphView.tsx`, once the structural issues above are settled.

## 6. Files referenced

- `solid-ui/src/components/ResponseQueueView.tsx` — tab bar, menu state, Share-the-Plan toggle, upload button
- `solid-ui/src/components/WeddingResponseWorkspaceView.tsx` — Home-tab document card, `showTechnicalDetails`/`showPlanningFiles` toggles, `compact` styling
- `solid-ui/src/components/WeddingWorkspaceContextPanels.tsx` — all per-tab cards and the always-on advanced cards
- `solid-ui/src/components/WeddingCollaborationAccessCard.tsx` — `openRole` local state example for §2.6
- `solid-ui/src/lib/weddingWorkspaceMenuState.ts` — the `WeddingWorkspaceMenuId` union
- `solid-ui/src/lib/bentoGridLocalState.ts` — the persistence pattern to reuse for last-tab memory
- `solid-ui/src/components/GuidedTour.tsx`, `OnboardingWizard.tsx` — existing, unused-here onboarding infrastructure
- `solid-ui/src/components/RailIcons.tsx` — existing icon component to replace the letter-glyph placeholders
- `solid-ui/src/components/FilesView.tsx`, `KnowledgeGraphView.tsx`, `UsageAdminWeddingVendorsPanel.tsx` — existing `createResource`/`Suspense` precedent
