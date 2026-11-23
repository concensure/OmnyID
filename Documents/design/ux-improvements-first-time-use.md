# OmnyID — UX Improvements: First-Time Use
> Authored against the LOCS skill capsule `uiux-first-time-use.md`
> Organised: **Aspect → View**

---

## 1. Immediate Value (Arrive, don't learn)

### 1a. Global / App Shell
**Problem:** A first-time user lands on the Dashboard and sees a near-empty layout with no indication of what OmnyID does or where to begin. The nav bar lists ~12 views immediately, none labelled with intent ("Why would I click Planning?").

**Proposal:**
- Add a single-line hero subtitle beneath the agent name on first load: *"Your personal AI workspace — ask anything, or pick a view below."*
- Dim / collapse all nav items except the top 3 (Dashboard, Email, Tasks) until the user has completed at least one action. Restore full nav after first successful interaction.

---

### 1b. Search Bar (Chat)
> **Note:** The suggestion chips (Plan my route, Book a flight, Schedule a meeting, Brainstorm ideas, Research a topic) already exist in the search view. The improvements below are additive.

**Existing:** 5 clickable suggestion cards are rendered below the search bar in `App.tsx`.

**Remaining gap:** The rotating placeholder text doesn't exist yet — the bar shows a static greeting. First-time users who don't notice the chips still have no hint about what kinds of queries work.

**Proposal:**
- Rotate the placeholder through concrete examples on a 4 s interval (only before the user's first query this session):
  - *"Plan a weekend in Tokyo"*
  - *"Schedule lunch with Sam next Tuesday"*
  - *"Summarise my last 5 emails from work"*
  - *"Find me a good Python testing library"*
- After the first successful query, lock the placeholder to the existing static greeting so it doesn't distract power users.

---

### 1c. Dashboard Feed
**Problem:** On first load with no messages the feed is empty with no guidance. Users have no sense of what populates it or what actions produce content.

**Proposal:**
- Replace the empty feed with a single **demo card** (visually identical to a real message card but labelled with a subtle "EXAMPLE" badge):
  - Show a mock agent summary card: *"You have 3 tasks due this week and 2 unread emails from your team."*
- Add a single CTA under the card: **"Connect your email or create your first task to see real results."**
- Remove the demo card permanently after the user's first real action creates content.

---

## 2. Progressive Disclosure (Show only what's needed)

### 2a. NavBar — view count
**Problem:** 12+ nav items on first login overwhelms a zero-day user. Views like "Cofounder Studio", "Knowledge Graph", "Automations", "Python Runner", "Spaces" are power-user features that confuse new users.

**Proposal:**
- On first login, show only: Dashboard, Email, Tasks, Planning, Calendar, Tools.
- Show a collapsed **"More"** item at the bottom of the nav. Clicking it expands to reveal Workflows, Agents, Knowledge Graph, Automations, etc.
- After 5+ sessions or explicit user toggle, default to expanded nav permanently.

---

### 2b. Agent Settings / Preferences
**Problem:** The OnboardingWizard asks about personality, tone, goals, and rules before the user has seen any output — it is feature-first, not task-first.

**Proposal:**
- Defer the OnboardingWizard to *after* the first successful agent response.
- Present it as: *"Personalise your agent — takes 30 seconds."* with a Skip button.
- Reduce it from 4 steps to 2 on first visit: Goals (what do you use it for?) and Tone (how should it talk to you?). Surface personality and rules as "Advanced settings" accessible from the profile menu.

---

### 2c. Tools View
**Problem:** 23 tools displayed in a grid on first entry. For a new user who hasn't even used the search bar yet, this is overwhelming.

**Proposal:**
- Show only the **top 8 tools** by default (Slack, GitHub, Google Calendar, Notion, Linear, Google Drive, Zapier, Stripe), ordered by popularity.
- Add a **"Show all tools"** button that expands the full grid.
- Category filter pills (Communication, Productivity, etc.) remain visible to enable quick scanning.

---

## 3. Empty States as Teaching Tools

### 3a. Email View
**Problem:** When no email account is connected the view is likely blank or shows a loading state with no guidance.

**Proposal:**
- Show a clear empty state with:
  - Icon: envelope outline
  - Heading: *"Your emails will live here"*
  - Body: *"Connect your Gmail or Outlook account so your agent can read, triage, and draft replies."*
  - Single CTA button: **"Connect Gmail"** (primary) + smaller link: "Connect Outlook"
- Include a mini mock showing what a populated email card looks like (sender, subject, date, 1-line summary).

---

### 3b. Tasks / Notes Views
**Problem:** An empty tasks list shows nothing, giving no sense of what a task looks like or how to create one.

**Proposal:**
- Tasks: Show one ghost/skeleton task card: *"Your first task will look like this — try adding one."* with a `+` New Task button above.
- Notes: Show a placeholder note with faint text: *"Your notes and summaries will appear here. Start by asking your agent to take a note."*
- Both: Never show a completely blank white area. Even a 1-sentence description + one CTA maintains momentum.

---

### 3c. Planning View
**Problem:** First visit shows only a search bar — no sense of what the output will look like, or what kinds of queries work.

**Proposal:**
- Show 3–4 example query chips below the bar:
  - `Weekend trip to Kyoto`
  - `Best way to get from Sydney airport to CBD`
  - `Comparing team offsite venues`
  - `Moving to a new city — where to start?`
- Include a collapsed **"What does this do?"** accordion (single line when collapsed): *"Planning mode gives you structured options with pros and cons — like a smart travel agent."*

---

## 4. Onboarding & Anxiety Reduction

### 4a. Guest Mode Gate
**Problem:** Features gated behind login (Tools connection, email, etc.) show a hard block with no way to explore. Guests leave before understanding the value.

**Proposal:**
- For Tools View: the current guest banner is a blocker. Replace with a soft nudge at the top of the page (not a full takeover): *"Sign in to connect tools — or explore what's available first."*
- Allow guests to browse all tool cards and open the ConnectModal, but show the sign-in prompt *inside* the modal when they click "Connect".
- For Email/Calendar: Allow read-only demo mode with canned sample data so guests can see the populated UI before committing.

---

### 4b. Registration Flow
**Problem:** There's no progress indicator or indication of what happens after registration. New users who just registered land directly in an empty workspace with no transition.

**Proposal:**
- After successful registration, show a brief (2 s) welcome screen: *"Welcome, [name]. Your workspace is ready."* with a subtle animation, then auto-navigate to Dashboard.
- Immediately (not on next login) trigger the condensed OnboardingWizard (see §2b above).
- End the wizard with a concrete action: *"Ask your agent something to get started"* with focus set on the search bar.

---

### 4c. Setup Progress Indicator
**Problem:** New users don't know what "fully set up" looks like or how far they are from a complete workspace.

**Proposal:**
- Add a dismissable **Setup checklist** widget on the Dashboard for new users (appears until all items are checked or user dismisses):
  ```
  [ ] Connect your email
  [ ] Create your first task
  [ ] Try the agent in the search bar
  [ ] Connect a tool (optional)
  ```
- Each item is a link to the relevant view.
- Show completion percentage in the top-right: "Setup: 2/4 complete" until dismissed.

---

## 5. Forgiveness & Reversibility

### 5a. Destructive Actions (disconnect tool, delete note, delete task)
**Problem:** Currently the ToolsView has a 2-step confirm for disconnect (good), but other destructive actions may not.

**Proposal:**
- Standardise all destructive actions to use a **toast-with-undo** pattern instead of a modal confirm:
  - Deleting a note → shows toast: *"Note deleted — Undo (5 s)"*
  - Disconnecting a tool → shows toast: *"Slack disconnected — Undo (5 s)"*
  - This is faster and less anxiety-inducing than modal confirms for reversible actions.
- Reserve modal confirms only for irreversible actions (e.g., deleting an account, purging all data).

---

### 5b. Search Bar — Error Recovery
**Problem:** If the backend returns an error or classification fails, the user likely sees a generic error message with no path forward.

**Proposal:**
- On agent error: show the failed query text in an editable input so the user can refine and retry without retyping.
- Add 1–2 suggested reformulations: *"Try: 'Schedule a meeting' instead of 'book time'."*
- Never clear the input on error — preserve user intent.

---

## 6. Least Surprise / Platform Conventions

### 6a. Keyboard Navigation
**Problem:** Power users expect keyboard shortcuts; the current UI likely has none.

**Proposal:**
- `/` or `Cmd+K` → focus the search bar from anywhere
- `Esc` → close any open modal or panel, return focus to last active view
- `Cmd+Enter` → submit the current search bar query
- Show a keyboard hint next to the search bar: `⌘K` on Mac, `Ctrl+K` on Windows.

---

### 6b. Back / Escape from modals
**Problem:** Pressing Escape should close modals. Opening a modal and finding no keyboard dismiss is a source of frustration.

**Proposal:**
- Audit all modals (ConnectModal, OnboardingWizard, TaskDetailModal, etc.) to confirm they close on `Escape` keydown.
- Clicking the backdrop (outside the modal box) should also dismiss non-critical modals.

---

### 6c. Hover States & Affordances
**Problem:** If clickable elements don't show cursor changes or hover states, users don't know what is interactive.

**Proposal:**
- Ensure all interactive elements have `cursor: pointer` and a subtle hover state (background lightening or border highlight).
- Nav items should show a tooltip with a 1-line description on hover (only for views the user hasn't visited yet): e.g., hover "Knowledge Graph" → *"Visualise connections between your notes and messages."*

---

---

## 7. Additional UX Improvements (10 More)

### 7a. Sticky "What just happened?" banner after agent actions
**View:** Search / Dashboard
**Problem:** After submitting a query, the response appears in the feed but the connection between the user's input and the agent output is lost — especially if the view changes automatically (e.g., intent routes to Calendar). Users don't know what the agent did.
**Proposal:** Show a dismissable 3-second banner at the top of the new view: *"Agent routed your request to Calendar — here's what was created."* Fades out after 3 s but is clickable to see the full action log.

---

### 7b. "Agent is typing" live indicator during processing
**View:** Search Bar
**Problem:** After submitting a query, the only feedback is the button text changes to "Routing…". For queries that take 3–8 seconds there's no sense the system is alive.
**Proposal:** Show an animated three-dot indicator inside the search bar area while the agent is processing. Add a short phrase that rotates: *"Classifying intent…"* → *"Routing to agent…"* → *"Preparing response…"* — gives users a real-time mental model.

---

### 7c. Last-visited view memory on refresh
**View:** Global
**Problem:** Refreshing the page resets to the default view (search/dashboard), losing context.
**Proposal:** Already persisted in `loadPrefs()` / `savePrefs()`. **Verify** this is restored correctly on hard refresh and that it also restores open thread ID. Add a subtle *"Restored last view: Email"* flash for 1.5 s so users know the restore happened.

---

### 7d. Contextual "Did you mean?" after no-result agent responses
**View:** Search / Dashboard
**Problem:** When an agent returns empty results or an unhelpful response, users don't know whether to rephrase or try a different view.
**Proposal:** After an empty agent response, show 2 alternative reformulation chips under the result: *"Try: Plan a trip instead"* / *"Switch to Planning view"*. Derived from the classified intent — if intent was unclear, offer the 3 most common alternatives.

---

### 7e. View-specific keyboard shortcut bar (power users)
**View:** All views (shown once, then auto-hides)
**Problem:** Power shortcuts like `/` for search focus, `Esc` for modal dismiss, etc. are invisible. Users who want keyboard efficiency have to discover them by accident.
**Proposal:** Show a one-time keyboard shortcut hint strip across the bottom of the screen on first authenticated login: `/ Focus search · Esc Dismiss · ↑↓ Navigate results`. Auto-hides after 8 s or on first shortcut use. Re-accessible via `?` in search bar.

---

### 7f. Agent output confidence indicator
**View:** Search results / Dashboard feed
**Problem:** Agent responses (especially planning, research) may be low-confidence but there's no visual signal. Users can't calibrate how much to trust the output.
**Proposal:** Add a subtle confidence badge to agent messages: `● High` / `◐ Medium` / `○ Low`. Shown as a small chip next to the message metadata. Clicking it opens a 1-line explanation: *"This response used external search — verify key facts."*

---

### 7g. Onboarding checklist as a persistent sidebar widget (not modal)
**View:** Dashboard (first 7 days)
**Problem:** The setup checklist proposal (§4c) was modal-based. A modal blocks the workspace and creates anxiety. A sidebar widget is non-blocking.
**Proposal:** Render a collapsible progress card in the right panel (visible when `rightOpen` is true or always visible for the first 7 days): `Setup: 2/4 · Connect email · Create first task`. Each item is a direct link. Widget disappears permanently once all 4 items are checked or user clicks "Dismiss".

---

### 7h. Search bar placeholder adapts to the active view
**View:** Search Bar (in NavBar compact mode)
**Problem:** The compact search bar in the NavBar always shows the same placeholder regardless of the current view. A user on the Email view may want to search their inbox, not trigger the global agent.
**Proposal:** When `activeView === "email"`, placeholder: *"Search your inbox…"*. When `activeView === "planning"`, placeholder: *"Where do you want to go?"*. When `activeView === "calendar"`, placeholder: *"Check my schedule for…"*. This dramatically reduces intent mismatch for new users who type into the wrong bar.

---

### 7i. "Recently used" section at the top of the Tools catalog
**View:** Tools View
**Problem:** Once a user has connected tools, navigating back to the Tools view shows the full catalog first, pushing their connected tools below the fold.
**Proposal:** Show a "Connected" section at the very top (already planned), but also add a "Recently used" subsection listing the last 3 tools the agent invoked via MCP (derived from AFP message metadata). This creates a shortcut layer for power users who run the same tool repeatedly.

---

### 7j. First-run demo message in the Dashboard feed
**View:** Dashboard / Feed
**Problem:** The feed is empty on first login. New users have no example of what an agent message looks like, making the whole interface feel inert.
**Proposal:** On first authenticated login, pre-populate the feed with one read-only demo AFP message — visually identical to a real message but watermarked with `EXAMPLE` in the corner. Content: *"Your agent summarised today's briefing: 0 tasks due, inbox clear, nothing on calendar."* Clicking it opens a tooltip: *"This is what real agent output looks like — try typing a request above."* Deleted automatically after the first real agent message appears.

---

## Priority Order (highest impact first)

| # | Aspect | View | Effort | Impact |
|---|--------|------|--------|--------|
| 1 | Empty State | Email View | Low | High — blocks new users from understanding value |
| 2 | Onboarding | Registration → wizard flow | Medium | High — new user activation |
| 3 | Progressive Disclosure | NavBar collapse | Medium | High — reduces overwhelm |
| 4 | Empty State | Planning View chips | Low | Medium |
| 5 | Immediate Value | Search Bar rotating placeholder | Low | Medium |
| 6 | Forgiveness | Toast-with-undo pattern | Medium | Medium |
| 7 | Least Surprise | Keyboard shortcuts | Low | Medium |
| 8 | Anxiety Reduction | Setup checklist sidebar widget (7g) | Medium | Medium |
| 9 | Progressive Disclosure | Tools View top-8 default | Low | Low–Medium |
| 10 | Least Surprise | Modal Escape/backdrop | Low | Medium |
| 11 | Feedback | "Agent is typing" live indicator (7b) | Low | High — reduces bounce |
| 12 | Feedback | Sticky "what just happened" banner (7a) | Low | Medium |
| 13 | Contextual help | "Did you mean?" reformulation chips (7d) | Medium | Medium |
| 14 | Power users | View-specific keyboard hint bar (7e) | Low | Low-Medium |
| 15 | Trust | Agent output confidence indicator (7f) | Medium | Medium |
| 16 | Retention | First-run demo message in feed (7j) | Low | High — counters blank-slate anxiety |
| 17 | Efficiency | View-aware search bar placeholder (7h) | Low | Medium |
| 18 | Efficiency | Recently-used tools section (7i) | Low | Medium |
| 19 | Context | Last-visited view memory flash (7c) | Low | Low |
| 20 | Trust | Agent confidence badge (7f) | Medium | Medium |
