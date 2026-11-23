D	Feature	File(s) changed
7a	Sticky "What just happened?" banner — appears top-right for 4 s when agent routes to a new view	App.tsx
7b	"Agent is typing" animated dots + rotating phase text ("Classifying intent…" → "Routing to agent…" → "Preparing response…") while searchBusy	App.tsx
7c	1.8 s "Restored last view: Email" flash pill on load when a non-default view was saved	App.tsx
7d	"Try instead:" reformulation chips when the agent returns a sparse/empty response	App.tsx
7e	One-time keyboard shortcut strip at bottom (8 s auto-hide; / key handler added to focus search from anywhere)	App.tsx
7f	Confidence badge (● High / ◐ Medium / ○ Low) on every message card, derived from message type and metadata	DashboardFeed.tsx
7h	View-aware compact search placeholder in NavBar (e.g. "Search your inbox…" on Email view)	NavBar.tsx
7i	"Recently used" row at top of Tools catalog — persisted to localStorage, updates on every Connect click	ToolsView.tsx
7j	First-run demo card in empty Dashboard feed with "EXAMPLE" watermark and guidance text	DashboardFeed.tsx

SearchBar.tsx

8j — Placeholder greets by time of day ("Good morning/afternoon/evening…")
8b — Capability hints cycle every 5s below input when empty, stop when typing
8c — Date/time detected in query shows a chip ("📅 Mon 19 May, 3:00 PM — correct?"); clicking opens a full monthly calendar popup with month navigation and clickable-year editing
8d — Mic button using Web Speech API; hidden on browsers without support; pulses red while listening
8e — Token estimate ("~120 tokens") shown live below input, colour-coded green/amber/red
DashboardFeed.tsx

8k — Copy button (⎘) appears in card header only on hover, flashes ✓ for 1.5s
8l — Cards capped at max-h-48; "Show more ▼ / Show less ▲" toggle at card bottom
8n — Star (☆/★) only visible on hover when unpinned; stays visible (★) when pinned
NavBar.tsx

8h — Numeric badge on Email and Calendar tabs fed from parent props
8t — "Dark mode 🌙 / Light mode ☀️" toggle in hamburger dropdown; persists to localStorage; toggles dark class on <html>
App.tsx

8a — Command palette opens on Ctrl+K; fuzzy-searches all views + custom views; keyboard navigable (↑/↓/Enter/Esc)
8f — Breadcrumb trail below NavBar showing last 4 distinct views, each clickable
8i — F key toggles ambient/focus mode hiding the NavBar; "Exit focus" button restores; Esc also exits
8r — Floating "Getting started" checklist (bottom-left); 5 tasks auto-check; progress bar; dismissible; persisted
8s — After 30 min idle an overlay shows today's query/view counts
AgentDashboard.tsx

8g — New "History" tab shows last 50 queries from localStorage with search filter
8o — "Running Workflows" section in History tab shows live executing/planning tasks
ToolsView.tsx

8q — "Select" button enters multi-select mode; checkboxes appear on cards; bulk "Connect selected" / "Disconnect selected" action bar appears

NavBar.tsx (9a, 9c, 9d, 9m)

9a: Each tab button gets a title attribute showing description · Alt+N · last-used time — drawn from tabLastUsedLabel() on render
9c: Active tab shows its shortcut key (Alt+1 etc.) inline as a small monospace suffix
9d: All core tabs are draggable=true with onDragStart/DragOver/Drop/DragEnd handlers; order persists to omnyid.tab-order in localStorage; drop target highlighted with ring-2 ring-primary/50
9m: Hamburger menu now contains a "Persona" section (Assistant / Analyst / Creative / Executor) — selection persists to omnyid.persona
DashboardFeed.tsx (9f, 9g, 9h, 9i, 9j, 9q, 9s)

9f: Research messages get a ✓ Sourced sky-blue badge in the card header
9g: Reading time = ceil(chars / 1000) min, shown next to "Show more ▼" (e.g. Show more ▼ · 2 min read)
9h: Low-confidence cards show a "▼ Why low confidence?" toggle that expands an explanation
9i: Cards with thread-siblings show a purple N in thread badge; clicking it expands a side-by-side comparison strip below the header
9j: New onRunAgain? prop; hover-only ↺ button in card header sends query back
9q: Right-click anywhere on a card header opens a context menu with "🔍 Explain this", "⎘ Copy content", "💬 Open thread"
9s: metadata.latency_ms renders as a green/amber/red badge in the card header
App.tsx (9b, 9e, 9k, 9p, 9r, 9t)

9b: SearchBar reports draft text via new onDraftChange prop; a floating "↩ Back to chat" pill appears when draft is non-empty and user is on a non-chat view
9e: Navigating to any tab shows a 4-second "Switched to X — Undo" toast at bottom-center
9k: Workflows view gets a "⏸ Pause workflows / ▶ Resume workflows" toggle + amber banner while paused
9p: "What can I do? →" button opens AgentCapabilityPanel modal with 8 capability cards (Email, Calendar, Research, Notes, Workflows, Python, Trip planning, Orchestration)
9r: Routing banner gets a "Why? ▼" disclosure button expanding a one-sentence explanation of how the agent chose the view
9t: navigator.onLine tracked via window events; amber top banner appears when offline
AutomationsView.tsx (9l)

9l: "Dry run OFF/ON" toggle button in header; when active shows a sky-blue info bar and the flag is available to pass to daemon/trigger components
AgentSettingsView.tsx (9n, 9o)

9n: Notification sounds toggle — uses Web Audio API to play a 880Hz beep when toggled on; persisted to omnyid.sound
9o: Font size switcher (Small / Default / Large) — sets data-fontsize on <html> and persists to omnyid.fontsize

10a — Pinned card shelf: Pinned cards float to the top of the dashboard in a dedicated "Pinned" row, visually separated from the rest of the feed with a subtle header bar.

10b — "Last response" quick-recall strip: A pill below the search bar shows the last response type + first sentence, with a "→ scroll to" button to jump back to it in the feed without re-running the query.

10c — Tab activity pulse: Tabs that received new agent output since last visited pulse once with a soft glow (not a hard badge) to indicate freshness.

10d — Skeleton loading cards: Show shimmer placeholder cards while the dashboard is loading instead of an empty state, giving a clearer sense of content structure.

10e — Card collapse to summary line: Triple-click a card header to collapse it to just the type badge + one-line summary — a denser view mode for power users with many cards.

10f — Per-view keyboard shortcut overlay: Press ? anywhere in the app to show a modal listing all keyboard shortcuts relevant to the current view (not just global ones).

10g — Agent response streaming indicator: When an agent task is live, show the card in a "streaming" state with a left-border animation — rather than appearing all at once after completion.

10h — "Save to Notes" button on cards: One-click button on each card that appends the card's summary text as a new note entry in the Notes view.

10i — Thread timeline view: In the Threads view, display messages for the selected thread in a vertical timeline with timestamps, rather than a flat list — making conversation arc easier to follow.

10j — Smart empty state actions: When a view has no content, surface 2-3 specific suggested actions (e.g. "Email is empty — try 'Summarise my last 5 emails'") as clickable chips that pre-fill the search bar.

10k — Card tag system: Let users tag cards with free-text labels (e.g. #work, #todo). Tags are filterable via a tag bar above the feed. Stored in localStorage.

10l — Session continuity restore: On sign-in after a refresh, show "Welcome back — you had X pinned cards and were last working in Y" with a one-click "Restore session" option.

10m — Agent task ETA estimate: In the Activity tab and on running workflow badges, show a rough "est. X min" completion estimate based on average task duration from history.

10n — "Did I already ask this?" duplicate detection: Before submitting a query, fuzzy-match it against the last 20 history entries and show a small "You asked something similar 3h ago → see result" chip.

10o — View-specific sidebar toggle: Each view can optionally reveal a contextual right sidebar (e.g. Notes → quick-add pane, Email → labels panel) toggled with a ⟩ button on the right edge.

10p — Agent "thinking time" display: Show how many seconds the agent spent on each task as a small annotation on the card — separate from network latency, giving insight into model compute cost.

10q — Batch card export: Multi-select cards via checkbox (like the ToolsView select mode), then export selected cards as a single Markdown or JSON file via browser download.

10r — "Focus this view" shortcut: Press Ctrl+Shift+F to hide all views except the current one, maximising working space — a more targeted alternative to full ambient mode.

10s — Inactivity nudge: After 10 minutes of no interaction (less than the 30-min idle summary), show a subtle "Still there? Try: …" with a rotating suggestion — keeps the agent top of mind without being intrusive.

10t — Card version history: Track every time a card's content changes (e.g. from a card_section_update) and add a "History ▼" dropdown on the card showing previous versions with timestamps.

11a — Adaptive card density DashboardFeed.tsx
Toggle between Comfortable / Compact / Cozy density modes. Compact removes card padding and timestamps; Cozy is current default. Persisted to omnyid.card-density. Dropdown in feed header.

11b — Pinned view drag-to-reorder DashboardFeed.tsx
When pinnedOnly is true, cards get drag handles (⠿) and can be reordered. Order persisted to omnyid.pinned-order in localStorage. Uses native HTML5 drag events, no extra library.

11c — Search result confidence sparkline DashboardFeed.tsx
Research cards show a tiny inline SVG bar chart (5–6 bars) representing token probability distribution across the top sentences — built from metadata.confidence_scores[] if present, otherwise hidden.

11d — Inline thread reply DashboardFeed.tsx
Clicking a thread badge in a card opens a minimal 2-line reply textarea directly below the card (not a modal). Sends to /ui/command with thread_id and collapses on success.

11e — Per-tab unread counters from real data NavBar.tsx
Email/Calendar/Threads tab badges are currently prop-fed with static numbers. Replace with a createEffect that re-derives counts from the AFP message stream every time messages change, so badges update live.

11f — Voice-to-search replay App.tsx
After a mic query is submitted, a "🎤 Replay" chip appears next to the last-response strip. Clicking replays the same query without retyping, useful for refining intent.

11g — Card sentiment indicator DashboardFeed.tsx
A 3-px left-border colour on each card: green (positive/resolved), amber (neutral/pending), red (urgent/error) — derived from a simple word-list scan of card text. Overridable via right-click context menu.

11h — Keyboard-driven card navigation DashboardFeed.tsx
j / k keys move focus between cards (highlighted with ring-2 ring-primary/60); Enter opens thread; p pins focused card; x dismisses. Focus state stored in a signal, reset on view change.

11i — Smart date grouping in feed DashboardFeed.tsx
Cards with timestamps are grouped under sticky date dividers ("Today", "Yesterday", "Mon 12 May") when the feed has more than 8 cards. Divider is a thin border-t line with a centered label, no extra height.

11j — Notice channel real-time badge pulse ThreadsListView.tsx
If a channel accordion has unread items its header badge animates animate-ping once on first render. Stops after 3 seconds. Re-triggers if item count increases.

11k — Expandable metadata inspector DashboardFeed.tsx
A {} icon in the card hover toolbar opens a small <pre> panel showing raw msg.metadata JSON, syntax-highlighted with simple span coloring (string=teal, number=amber, bool=violet). Closes on click-outside.

11l — Query auto-correct suggestion App.tsx
After a response with confidence < 0.4, a strip appears: "Did you mean: [corrected query]?" — the correction is generated by calling /ui/command with intent: "spell_check" in the background while the main response renders.

11m — Ambient background gradient shift App.tsx
The main background gradient slowly shifts hue over 60 s between two presets (e.g. soft lavender ↔ warm peach) using a CSS @keyframes animation applied to <body>. Off by default; toggled in hamburger "Appearance" section alongside dark mode.

11n — Card action history undo DashboardFeed.tsx
Dismissing or unpinning a card shows a 5-second "Undo" toast at bottom of feed. Action is stored in a undoStack signal (max depth 5). Undo re-inserts the card at its original position.

11o — Search query templates App.tsx
A [ ] button next to the search bar opens a small popover with 6 pre-written query templates ("Summarise my inbox", "What's on my calendar today?", etc.). Clicking fills the input. Templates stored in omnyid.query-templates and editable inline.

11p — Progressive onboarding tooltips App.tsx
First-session users see a guided tooltip sequence (5 steps): Search bar → NavBar tabs → Pinned view → Tools → Settings. Each tooltip is a small absolute positioned card with Prev/Next/Skip. Progress stored in omnyid.onboarding-step.

11q — Per-channel notice muting ThreadsListView.tsx
Long-pressing a channel accordion header in the Notice tab shows a "Mute for 1h / 8h / forever" mini-menu. Muted channels show a 🔕 icon on their header and their badge count is greyed out. Mute state persisted to omnyid.muted-channels.

11r — Card word-count and reading level DashboardFeed.tsx
In the card footer (alongside existing reading-time badge): a Gr. N Flesch-Kincaid grade level computed client-side from word/sentence count. Color-coded: ≤8 green, 9–12 amber, 13+ red. Hidden on cards < 50 words.

11s — Live typing indicator in Thread inline reply DashboardFeed.tsx
While the agent processes the reply submitted via 11d, the reply area shows animated dots and the last message in the thread gets a ⋯ placeholder card with border-l-4 border-l-primary animate-pulse — same treatment as 10g streaming cards.

11t — Cross-view global search overlay App.tsx
Ctrl+/ opens a full-width overlay (covers NavBar + feed) with a large search field that searches across: card content, thread IDs, query history, and custom view names — all client-side, no API call. Results grouped by source type, keyboard-navigable, closes on Esc.


13a — Focus Mode (E, P)
A "Focus" toggle in the hamburger that collapses everything except the active thread or pinned cards. All non-essential chrome fades to 10% opacity. Pressing Escape exits. Reduces cognitive load during deep work.

13b — Accessible Colour-Blind Palette (A)
Add a "Colour-blind friendly" option in the Appearance section. Replaces red/green sentiment borders and status dots with pattern fills (diagonal hatching for urgent, solid ring for positive) and adds aria-label to every coloured badge. Uses no hue-only encoding anywhere in the UI.

13c — Agent Action Explainer (I, Eth)
Before any agent executes an action that touches external systems (email send, calendar write, browser action), show a one-sentence plain-language explanation card: "I'm about to send an email to X — here's what it will say." Tapping the card expands the full draft. This surface already exists as the Approval Banner; extend it with the explainer text rather than adding a new surface.

13d — Persistent Scroll Position (E)
Restore the feed scroll position when returning to the Dashboard or Threads view. Store the position per-view in sessionStorage and reapply on onMount. No data loss when navigating between views.

13e — Smart Empty States (I, E)
Replace generic "No items" placeholders with context-sensitive prompts. If threads are empty: "Try asking your agent to check your inbox." If Skills tab is empty: "Add a capability from the Workflow Builder." Each empty state has exactly one action button — no choice paralysis.

13f — Inline Thread Composer (E, P)
Instead of navigating away to start a new thread, add a one-line "New thread…" input at the top of ThreadsListView. Pressing Enter creates a new thread AFP message and opens it immediately. Eliminates the round-trip for the most frequent action.

13g — Skip-to-Content Link (A)
Add a visually-hidden "Skip to main content" link as the first focusable element in the DOM. It becomes visible on keyboard focus. Required for screen-reader and keyboard-only users to bypass the NavBar on every page.

13h — Card Action Disclosure (I, Eth)
Every dashboard card action button (Reply, Pin, Archive, Share) should show a tooltip on hover/focus that describes exactly what the action will do and whether it is reversible. "Pin — keeps this card at the top of your feed. Undo within 5 seconds." Builds trust and teaches the interface passively.

13i — Reduced Motion Mode (A, E)
Honour prefers-reduced-motion media query. When active: disable animate-ping, animate-pulse, animate-gradient-shift, fadeUp animations, and card hover lift transforms. Replace with instant opacity transitions only. Currently none of these animations check the media query.

13j — Contextual Undo (E)
Extend the existing 5-second undo for unpin to cover all destructive card actions: archive, mute, delete draft reply. A single, shared toast at the bottom of the screen shows the last undoable action. Only one undo is offered at a time (the most recent action), keeping the UI uncluttered.

13k — Agent Confidence Disclosure (Eth, I)
When a card's confidence score is below 0.6, add a small "?" icon that opens a popover explaining: "This summary was generated with lower confidence — the source data may be incomplete." Distinguishes high-confidence facts from speculative summaries without alarming users with raw numbers.

13l — Time-Relative Timestamps with Absolute on Hover (I, A)
Replace all raw toLocaleString() timestamps with time-relative labels ("3 minutes ago", "Yesterday at 2pm"). On hover or focus, show the exact ISO timestamp in a tooltip. Reduces reading burden for recency while preserving precision for screen readers and power users.

13m — Workflow Run Progress Indicator (I, E)
In the Activity tab of Agent View, when a task is executing, show a linear progress bar that fills based on elapsed time vs. the agent's estimated duration (from a duration_estimate_ms field in the task). If no estimate exists, show an indeterminate shimmer. Currently only a pulsing dot is shown.

13n — Keyboard Shortcut Reference Card (I, A)
Add a "Keyboard shortcuts" entry to the hamburger menu that opens a modal listing all active shortcuts: j/k (card navigation), Ctrl+/ (global search), Alt+1–5 (agent tabs), ? (onboarding), Escape (dismiss overlays). Discoverable by keyboard users who may not find shortcuts through exploration.

13o — Feed Card Focus Trap Prevention (A)
Currently, the metadata inspector and inline reply panels open within the card without trapping focus, which means screen readers lose context. Apply a proper focus management pattern: when a panel opens, move focus to the first interactive element inside it; when closed, return focus to the trigger button.


13q — Adaptive Density Auto-Suggestion (I, E)
When more than 12 cards are visible in the feed, show a one-time suggestion strip: "You have 12+ cards — switch to compact view?" with Accept / Dismiss. Storing the dismissal in localStorage. Removes friction for users who haven't discovered the density selector.

13r — Voice Command Transcript (A, I)
When a voice query is submitted (via the existing voice replay chip infrastructure), show the transcribed text in the search bar for 2 seconds before submission. This gives deaf users and anyone in a noisy environment a chance to verify and correct the transcript before the query fires.

13s — Session Handoff Summary Card (E, Eth)
At the end of each session (detected by 10 minutes of inactivity or explicit logout), emit a session_summary AFP card to the Dashboard Feed: "In this session: 3 searches, 2 replies sent, 1 workflow triggered." Clicking expands the full session log. Respects the user's time by closing the loop on what the agent did.

13t — Announcement Region for Live Updates (A)
Add an ARIA live region (role="status", aria-live="polite") that announces feed updates to screen readers: "3 new cards added to your feed." Currently the feed silently inserts cards with no accessible notification. Essential for users relying on assistive technology to stay informed of dynamic content changes.


Intuitive

14a — Conversational undo history panel
A persistent "What I've changed" sidebar panel (toggled with Ctrl+Z history icon) listing the last 10 reversible actions (pin, tag, reply, mute) with one-click revert for each. More discoverable than a transient toast.

14b — Card action keyboard ring
When a card is j/k-focused, pressing Tab cycles through its action buttons (pin, copy, reply, history) without a mouse. Current state has no keyboard path to header actions on a focused card.

14c — Search result preview on hover
When the global search overlay shows a result, hovering the row renders a 2-line excerpt preview in a right-side panel instead of requiring a full navigation. Reduces round-trips.

14d — Smart query spelling correction UI
Expose the auto-correct suggestion as an inline chip inside the search bar (à la Google's "Did you mean…") rather than in a separate div — it's currently easy to miss.

14e — Workflow step breadcrumb
Inside the Workflows view, show a horizontal step pill trail (Draft → Planning → Executing → Done) for the active workflow instance, with the current step highlighted. This gives users a clear "where are we?" orientation.

Inclusive

14f — Dyslexia-friendly font toggle
Add an "OpenDyslexic" font option in the Appearance hamburger section (alongside dark mode). Applies a font-family: OpenDyslexic, sans-serif class to :root. Serve the font from the static bundle.

14g — High-contrast mode
A "High contrast" toggle in Appearance that applies a CSS class disabling glass/blur surfaces and switching to solid border-heavy containers. Improves legibility for users with low vision without requiring OS-level settings.

14h — Voice command shortcut
A persistent mic button in the search bar that starts browser speech recognition and types the transcript directly. Complements the existing voice replay chip (which replays previous queries) — this is for new input.

14i — Language / locale selector
A locale picker in Agent Settings → Appearance. Changes the <html lang=""> attribute and date formatting locale stored in localStorage. Currently dates always use the browser locale with no override.

14j — Keyboard-navigable approval queue
In the Approval banner, pressing A approves and R rejects the top task when the banner is focused. Non-mouse users currently have no shortcut to the most time-sensitive action in the app.

Empathetic

14k — Calm mode toggle
"Calm mode" strips all pulsing animations (status dots, daemon pulse, streaming shimmer) and hides unread counts from the nav. Intended for focus-intensive work where motion and badges add cognitive load beyond what "Focus mode" addresses.

14l — Task completion celebration
When an agent task status transitions from executing → completed, briefly show a subtle green sweep animation on the task row (not a modal, not confetti — just a 400 ms ease-in sweep) and announce "Task complete" via the ARIA live region (13t).

14m — Stale session warning
If the last API response was >15 minutes ago and the user returns to the tab, show a non-blocking pill: "Session may be stale — refresh to resync." Prevents acting on outdated agent state.

14n — Agent "thinking" state micro-copy
During a planning phase, replace the generic executing status badge with rotating micro-copy: "Drafting plan…", "Evaluating tools…", "Preparing response…". Reduces perceived wait time through purposeful feedback.

14o — Error state sympathy copy
When an agent task fails, augment the failed badge with a one-line plain-language sentence: "The agent couldn't complete this — check your model config or try again." Hides jargon from the error state visible in the activity log.

Purposeful

14p — Card digest export (PDF/Markdown)
Add "Export digest" to the dashboard toolbar: collects all pinned cards into a single Markdown (or print-to-PDF) document with headings derived from msg.type and timestamps. Gives pinned cards a clear output path.

14q — Agent budget pre-flight check
Before running a workflow, show a one-line budget estimate: "This may use ~$0.03 — you have $1.24 remaining." Sourced from the existing budget data and the workflow's token estimate. Prevents surprise overruns for users on tight budgets.

14r — Workflow output diff view
When a card is updated by a new agent run, instead of replacing the card, show a diff toggle: "View changes ↕" opens a side-by-side before/after comparison using the existing card history data. Closes the loop on what changed and why.

14s — Session handoff summary AFP card
At the end of each session (tab close, idle timeout), emit an agent_memory AFP message summarising key decisions and actions. Surface it as the first card on next login with a "Resuming from last session" header. Makes continuity visible rather than invisible.

Ethical

14t — Capability activity log
Each capability listed in the Skills tab shows a "Last used" timestamp (sourced from the existing activity log filtered by capability name). Users can see when each capability was exercised without needing to search through the full log — directly serving transparency about what the agent did with its permissions.


Intuitive

15a — Thread title inference. Currently thread IDs (thread_abc123) are shown as titles. Derive a human-readable title from the first message's intent or content and display it as the thread name. Makes the list immediately scannable.

15b — Pinned card name editing. Let users rename pinned cards inline (double-click the title). Stored locally per card ID. A pinned card called "Q3 roadmap" is far more useful than msg_1748....

15c — Bulk approval for queued tasks. When 3+ tasks are pending, add "Approve all low-risk" that auto-approves tasks where taskExplainer returns read-only actions (search/research/fetch). Reduces repetitive approval friction.

15d — Workflow canvas minimap. In WorkflowsView, add a fixed small minimap (bottom-right corner) showing the full graph with a viewport indicator rectangle. Prevents disorientation on large workflow canvases.

15e — Inline date picker for calendar intent. When a query is routed to the calendar, show an inline date picker chip next to the "Schedule a meeting" suggestion row rather than making users type the date.

Inclusive

15f — Screen reader-first card summary. Each card should have a visually hidden <p class="sr-only"> with a composed accessibility summary: type + confidence + timestamp + one-line content. Ensures screen reader users get the same density as visual users.

15g — Keyboard tab order audit for modals. The shortcut modal, command palette, and approval banner should implement a focus trap (Tab cycles within the modal, Esc closes). Currently focus can escape to underlying content.

15h — Language selector for agent responses. Add a response language preference (English, French, Spanish, etc.) persisted in localStorage. Passed as a query parameter hint. Supports non-English speakers.

15i — Minimum touch target enforcement. Several action buttons (8px dot indicators, 9px "✕" close buttons) fall below WCAG 2.1's 44×44px touch target requirement. Audit and bump minimum to 36×36px with min-h-9 min-w-9 on all interactive elements.

Empathetic

15j — Failure recovery breadcrumb. When a task fails, show a recovery path below the failed status: "Try rephrasing your request" → chips with simplified re-runs of the original query. Moves from dead end to action.

15k — "Last seen" agent pulse. In the fleet status pill, show "Last active N minutes ago" when the agent is idle, rather than just "0 active / N idle". Gives users confidence the agent is responsive.

15l — Onboarding re-entry button. Add a "Restart guided tour" option in the hamburger menu for users who dismissed it too quickly. First-run tours get dismissed in haste; this gives a graceful way back.

15m — Empty approval queue affirmation. When the pending count drops to 0 (user just approved the last task), show a brief "All tasks reviewed — you're up to date ✓" toast. Closes the loop empathetically.

Purposeful

15n — Spaces view stub fulfillment. The space view design doc describes a rich feature that's currently unimplemented. Add a basic Spaces scaffold: a list of space containers (type: "space" AFP messages), each with a thread list inside. Even a skeleton closes the expectation gap.

15o — Thread ID → human title migration. Change ThreadsListView to show the first message's content snippet (truncated to ~40 chars) as the thread title instead of the raw thread_id. This is the single highest-impact readability improvement in the current threads view.

15p — Budget spend sparkline on pre-flight warning. When the budget pre-flight warning fires, show a mini sparkline of the last 7 days of spend inline so users have context for why the warning appeared, not just the abstract percentage.

15q — Capability dependency graph. In the Skills tab, add a collapsed "Dependencies" section for each capability showing which other capabilities it requires. Helps users understand why disabling one skill might break another.

15r — Smart notification batching. Group notice-tab items by sender rather than by channel (email/slack/chat). "3 messages from Alice" is more actionable than "3 email messages". Group them by the sender field from AFP metadata.

Ethical

15s — Agent action audit log export. Add an "Export full audit log" button in the History tab that generates a signed, timestamped JSON log of every agent action taken this session. Supports accountability and helps users understand what the agent did on their behalf.

15t — Data retention disclosure. Add a one-time info banner (dismissible, stored in localStorage) explaining OmnyID's data model: messages stay on the homeserver, no training on user data, E2EE by default. Shows on first sign-in. Builds informed trust rather than assumed trust.

Feed & Dashboard

16a — Progressive card expand/collapse: New AFP cards arrive in collapsed one-line summary state; click to expand full content. Reduces overwhelm on busy feeds, mirrors Grok Canvas disclosure pattern.
16b — Per-card export button: Each dashboard card gets a ⬇ Export button (hover-visible) that downloads the AFP message as JSON or markdown. Consistent with Grok Canvas per-chunk download affordances.
16c — Staggered card entrance animations: New cards animate in with fade-in + slide-up staggered by index × 40ms. Prevents the "wall of content" snap-in that currently makes batch updates feel abrupt. Respect prefers-reduced-motion.
16d — Inline confidence meters: Replace the high/medium/low confidence text label with a narrow horizontal bar (4px height) below the card type chip, coloured green/amber/red. Glanceable at scale.
16e — Type-specific card renderers: Dispatch AFP type to a typed renderer: email → compact mail layout, calendar_event → time-block layout, report → collapsible table. Uses existing type field, no protocol change needed.
Threads

16f — Unread count badge on thread list: Show a bold pill count next to each thread item for messages received since last open. Store lastReadTs per thread in localStorage.
16g — Thread search with highlight: Add a filter input at the top of ThreadsListView that filters thread titles in real-time and highlights the matching substring with a <mark> element.
16h — Swipe-to-archive on mobile: Touch-friendly swipe-left gesture on thread rows reveals an archive button. Use touchstart/touchend delta detection (≥48px threshold).
16i — Sender avatar initials: In the Notice tab sender groups ("3 emails from Sarah"), show a 28×28px circle with initials derived from the sender name, coloured by hash of sender string. Adds visual identity without requiring profile photos.
Workflows

16j — Node quick-duplicate: Right-click (or long-press) a node to show a context menu with "Duplicate node". Copies the node at position + {80, 80} with a _copy suffix on the label. Saves repeated node configuration.
16k — Workflow run ETA chip: During an active run, show an estimated remaining time chip in the canvas header, derived from mean step duration × remaining steps from run history.
16l — Edge label edit in-place: Click an SVG edge label to show an inline <input> for editing the condition label, without opening the full edge panel. Matches the pinned-card rename pattern already in DashboardFeed.
16m — Canvas empty state with template picker: When no workflow is selected, the canvas area shows 4 template cards (Summarise & Send, Research Loop, Approval Gate, Data Pipeline) instead of a blank rectangle. Reduces time-to-first-workflow.
Agents

16n — Agent capability search: Add a filter input in the SkillsTab that filters capabilities by name/tag in real-time. Currently the list grows with no way to scan it quickly on large agent fleets.
16o — Task priority badge: Render a coloured dot (🔴 urgent / 🟡 normal / ⚪ low) beside each pending task label in the approval queue, derived from task.priority or keyword heuristics (same isLowRisk pattern). Helps triage at a glance.
16p — Agent "sleeping" indicator: When an agent has been idle >10 minutes, show a 💤 chip on its status bar instead of just "Last active N min ago". Friendlier and immediately scannable.
Navigation & Global

16q — Keyboard shortcut: jump to thread: Add G T (go to threads) and G W (go to workflows) global keyboard shortcuts registered in App.tsx's shortcut handler. Listed in the shortcut modal.
16r — Reduced-motion preference guard: Wrap all animate-* Tailwind classes in motion-safe: variants (or check window.matchMedia('(prefers-reduced-motion: reduce)') on mount and gate all JS-driven animations). Currently no motion guards exist.
16s — Onboarding step progress bar: Replace the step dots in the onboarding overlay with a thin linear progress bar at the top of the modal. Shows completion percentage, more conventional and accessible.
16t — Search history dropdown: When the search bar is focused and empty, show the last 5 queries (stored in localStorage as omnyid.search-history) as clickable suggestion chips below the input. Reduces re-typing repeated lookups.
20 More UX Improvements (Batch 17 — Grok Canvas-Inspired)
Grok-Canvas-Derived Patterns

17a — Typed response dispatch in chat/search results: When OmnyID's LLM returns a structured response, detect result_type in the JSON and render: table → sortable grid, timeline → vertical time strip, comparison → side-by-side columns. Directly from Grok Canvas's component dispatch.
17b — Collapsible prose sections: Long AI-generated content (agent summaries, workflow descriptions) gets auto-collapsed after 3 lines with a "Show more" chevron. Matches Grok Canvas progressive disclosure for dense text.
17c — Sortable/filterable inline tables: When an AFP message contains tabular data (type === "report" with array content), render a lightweight sortable table with a CSV export button — no external library needed, pure JS sort on click.
17d — Animated route visualization for geo data: If an AFP message contains lat/lng coordinates (e.g., from a logistics workflow), render a small Leaflet map stub with a pulsing marker. Falls back gracefully to a "📍 Location data" chip if Leaflet isn't loaded.
17e — Witty skeleton loading messages: Replace generic "Loading…" text across the app with rotating contextual messages: "Fetching your threads…", "Warming up the agents…", "Reading the workflow graph…". Stored as a static array, selected by Math.random().
17f — Inline citation chips in AI output: When an agent task result includes a sources array, render each source as a small [1]-style superscript chip that expands on hover to show the URL/title. Matches Grok Canvas citation pattern.
17g — Confidence heatmap on workflow nodes: Overlay a subtle colour wash on workflow canvas nodes based on their historical success rate (from run history). Green = >90% success, amber = 60–90%, red = <60%. Uses existing run data.
17h — Staggered agent fleet card entrance: When AgentDashboard mounts or agents are added, fleet cards animate in with opacity-0 → opacity-100 + translateY(8px → 0) staggered by index. Respects prefers-reduced-motion.
17i — Per-message action palette: Hovering a dashboard card reveals a 3-button inline toolbar (Archive, Pin, Export) that appears with a scale-95 → scale-100 micro-animation. Keeps primary surfaces clean while making actions discoverable.
17j — Thread "tl;dr" chip: For threads with ≥3 messages, show a one-sentence AI-generated summary chip at the top of the thread (derived from the first message's summary field, or a truncated concatenation). Matches Grok Canvas's one-line preview before expand.
Accessibility & Ethics (Design Principles alignment)

17k — Focus-visible ring tokens: Audit and replace ad-hoc focus:ring-* classes with a consistent focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 token applied globally via Tailwind's @layer base. Ensures keyboard users see a consistent, predictable indicator.
17l — Error message humanisation: Replace technical error strings ("Network error 503", "CORS policy") with plain-language explanations + one suggested action. Example: "Couldn't reach your inbox — check your connection and try again." Aligns with the Empathetic principle.
17m — Agent action dry-run preview: Before an agent executes a write action (send email, create event), show a diff-style preview panel ("This is what will be sent") with Approve / Edit / Cancel. Aligns with the Ethical principle — human oversight before irreversible actions.
17n — Data source transparency chip: Each dashboard card shows a small Source: Gmail / Source: Slack chip derived from msg.metadata.source. Users see exactly where each piece of data came from — Purposeful transparency.
17o — Colour-blind safe status palette: Audit all status colours (red/green/amber) and add a secondary shape indicator (✓ ✕ !) so status is never conveyed by colour alone. Aligns with WCAG 1.4.1 (Use of Color) and the Inclusive principle.
Polish & Delight

17p — Canvas node kind icons: Add a small icon prefix to each workflow node card based on node.kind: 🔔 trigger, 🤖 agent, ✋ approval, 🔀 condition, ⚙ transform. Faster visual scanning on dense graphs.
17q — Drag-and-drop thread reorder: Allow threads in the Threads tab to be manually reordered via drag-and-drop (HTML5 drag API), with order persisted to localStorage under omnyid.thread-order. Power users frequently want to surface important threads.
17r — Budget gauge ring: Replace the linear budget sparkline with a circular ring gauge (SVG stroke-dasharray) showing % of budget used. More space-efficient and immediately readable as a ratio.
17s — Shortcut modal search: Add a filter input inside the keyboard shortcuts modal that filters shortcuts by keyword in real-time (includes() match on label + key string). The modal grows long with 15+ shortcuts.
17t — Welcome-back greeting: When OmnyID loads and detects a returning user (session token present, lastLogin in localStorage > 0), show a one-line greeting above the feed: "Welcome back, {name} — {N} new messages since you left." Dismisses after 4 seconds. Warm and purposeful.

Confidence decay indicator — Suggestions older than 6h show a faded "stale" badge on the confidence meter. The meter bar colour shifts from primary to muted.

Suggestion snooze — "Snooze 1h" option on ProactiveSuggestionCard; records outcome as snoozed and re-queues the suggestion after delay.

Pack suggestion mini-card variant — When is_pack_suggestion: true, the DashboardFeed card shows a distinctive layout with pack icon, heuristic count, and a one-click "Enable" that calls the pack API — no settings navigation needed.

Autonomy tier chip on suggestion cards — Small badge showing ask / notify / auto so users immediately know how this suggestion will behave.

Suggestions counter badge on ThreadsListView tab bar — The "Suggestions (N)" tab label already counts items; animate it when a new suggestion arrives (pulse animation).

Heuristic feedback shortcut — After dismissing a card, show a 2-second inline "Too many of these?" prompt with a "Reduce" link that opens the heuristic's autonomy settings directly.

Pack onboarding prompt in empty DashboardFeed — When feed has no messages AND no packs are enabled, show a "Get started with heuristic packs" call-to-action with pack icons instead of a generic empty state.

Audit log filter by autonomy tier — In Agent Settings audit log, add all / ask / notify / auto filter chips above the list.

Dry-run preview accessible from suggestion card — "Preview action" secondary link on ProactiveSuggestionCard (confidence < 0.95) opens the DryRunPreviewPanel inline instead of requiring the confidence threshold to be hit.

Temporal summary sparkline in memory context — GET /memory/context now returns temporal data; surface a compact frequency sparkline on the AgentPreferencesPanel showing "how often each event type fires" — helps users understand why suggestions appear.

Entity-based thread merge in DashboardFeed — If multiple proactive_suggestion messages share entity_id in the same render pass, group them into a single collapsible "3 suggestions about [entity]" card instead of three separate cards.

Pack acceptance rate in settings — Next to each pack toggle, show aggregate acceptance rate for that pack's heuristics (from heuristic_acceptance_rates data). Low acceptance rate → amber warning "Adjust confidence in settings".

Keyboard shortcut for suggestion cards — Y to accept, N to dismiss, S to snooze — when a suggestion card has keyboard focus. Uses onKeyDown on the card wrapper.

Quick-enable pack from Suggestions tab empty state — The empty state in the Suggestions tab includes direct pack buttons ("Enable Meeting Intelligence", "Enable Email Intelligence") instead of just routing to settings.

Suggestion history drawer — "Show dismissed" link in the Suggestions tab reveals a second list of dismissed suggestions with timestamps and dismiss reasons — useful for auditing and reversing accidental dismissals.

Smart notification batching digest — When deep_work_protect heuristic fires, batch all pending medium/low suggestions into a single "While you were in deep work" digest message emitted when the session ends.

Auto-detect and suggest transport pack — If the user has 2+ off-site calendar meetings in a week, emit a pack suggestion for the Transport pack with: "You have off-site meetings — enable Mobility & Transit for departure timing alerts."

Proactive suggestion in ThreadView header — When a thread has an active entity-matching proactive suggestion, show a subtle amber banner at the top of ThreadView: "Agent has a suggestion about this thread" with a "View" button.

Toast position preference — Let users choose toast position (top-right / bottom-right / top-left) via a single setting stored in localStorage, applied to the NotifyThenActToast fixed positioning.

Pack suggestion confidence tuning slider — In the pack settings section, add a global "suggestion sensitivity" slider (0.5–0.9) that sets the minimum confidence threshold for all heuristics in that pack at once — replaces the need to tune each heuristic individually for new users.

DashboardFeed
18a — Inline message reactions: Single-click emoji reaction strip on each feed card (👍 ✅ 📌 🔁) stored locally. Counts shown in a small pill. Useful for quick triage without opening a thread.

18b — Message age fading: Cards older than 48h get 10% reduced opacity. Cards older than 7 days get 20% reduced + "Archived" chip. Keeps feed feeling fresh without deleting.

18c — Pinned card reminder pulse: If a card has been pinned >7 days without any action, its pin badge pulses amber once per session to nudge review.

18d — Batch dismiss: A "Clear suggestions" button appears when ≥3 proactive_suggestion cards are visible. One click dismisses all with a recorded accepted: false outcome for each.

18e — Card source tracing: Each card shows a 1-line provenance footnote: Source: Email thread · 2h ago or Source: Calendar event · Meeting prep pulled from metadata.source or references[0].

Search / Chat view
18f — Query intent chip: After submitting a query, show a small pill under the input: Routed as: research, Routed as: task, Routed as: schedule. Sourced from commandResult().intent. Builds trust in routing.

18g — Live token counter: Faint counter below the chat input showing estimated tokens for the current draft (~N tokens). Updates on keypress. Warns in amber at >1000 tokens.

18h — Suggested follow-ups from result: After any command result, show 2-3 contextual follow-up chips computed from the result's bullets. Clicking re-fires the search with the chip text.

Workflows view
18i — Node collapse: Double-click a node to collapse it to a compact chip showing just its kind icon and label. Collapsed nodes still participate in edges. Reduces visual clutter for large graphs.

18j — Run diff badge: When viewing the run history of a workflow, if the graph changed between two runs, show a small "Graph changed" badge between them in the timeline to flag potential cause-effect.

18k — Workflow tags: A free-text tag input on each saved workflow. Tags appear as coloured chips under the workflow title in the rail. Filter by tag with a chip filter above the workflow list.

Threads / Messages
18l — Message summarise button: A "Summarise thread" button at the top of any thread with >5 messages. Calls /ui/command with "Summarise this thread" and injects the thread_id. Result appears as a pinned card in the thread.

18m — Thread star + sort by stars: A ⭐ button on each thread card in ThreadsListView. Starred threads float to the top. Stored in localStorage.

18n — Unread dot on thread list: ThreadsListView adds a small blue dot on threads that have received a new message since the user last opened them. Track last-opened timestamp per thread_id in localStorage.

Agent Settings / Proactivity
18o — Proactivity schedule: In the Proactivity Level section, add a "Working hours only" toggle. When enabled, proactivity level drops to 1 outside 9am-6pm (checked on each event ingest client-side via current time). Stored in localStorage.

18p — Heuristic pack preview: In the Heuristic Packs card, each pack gets an expandable "Preview" section showing the first 3 heuristics (id + description). Collapsed by default. Helps users understand what they're enabling before toggling.

18q — Audit log export: In the autonomous action log section of AgentSettingsView, add a "Download CSV" button. Serialises the audit log rows to CSV and triggers a browser download.

NavBar / Global
18r — Shortcut chord display: When the user presses g (for g+t / g+w chord), show a small floating badge near the NavBar: g · t threads  g · w workflows. Auto-dismisses after 2s or on next keypress.

18s — View quick-jump popover: Ctrl+G opens a compact popover showing all views as a keyboard-navigable list (arrow keys + Enter to jump). Closes on Escape. More discoverable than remembering individual shortcuts.

18t — Last-run workflow quick-launch: In the NavBar right cluster, a small ▶ Resume chip appears if there's a workflow run from the last 24h in a non-terminal state. Clicking it opens the Workflows view and selects that run.

Feed & Dashboard

19a — Card action confirmation micro-dialog: For destructive card actions (archive, mute), replace the immediate action with a 1.5s inline confirmation row: "Archive this? [Yes] [Cancel]" — prevents fat-finger mistakes without a full modal.

19b — Reaction analytics strip: In the card expanded view, show a horizontal bar chart of reaction tallies (👍 3 · ✅ 1) — makes the locally-stored reaction data visible and reinforces its utility.

19c — Feed sort control: A dropdown above the feed: Sort by: Latest | Oldest | Confidence | Urgency. Applies a client-side sort to the messages array. Stored in omnyid.feed-sort.

19d — Inline card note: A small "Add note" pencil icon on each card. Clicking opens a 2-line textarea below the card body; saved text persists in omnyid.card-notes keyed by msg.id. Notes appear as a bordered aside inside the card.

19e — Suggestion frequency graph: Above the proactive suggestions list, a tiny sparkline SVG (12 bars, 7-day history) showing how many suggestions fired each day. Derived from dismissedIds timestamps.

Search / Chat

19f — Query reformulation on empty result: When commandResult().bullets is empty, auto-generate 2 alternative phrasings via a follow-up /ui/command call with intent "reformulate" and display as chips.

19g — Last query repeat shortcut: Alt+R re-submits the last query from omnyid.query-history[0] without typing. A tooltip on the search bar documents it.

19h — Result confidence explainer tooltip: The "Routed as: X" intent chip gets a ? icon. Hovering shows a 2-sentence explanation of what that routing decision means and how confident the agent was.

Workflows

19i — Node comment annotation: Right-click a node → "Add comment". A small sticky-note chip (🗒) appears anchored to the node; clicking it shows/edits the text. Stored in omnyid.node-comments.

19j — Workflow run replay: In the run history, an "↺ Replay" button re-triggers the same workflow with the same input. POSTs to /workflow/trigger with the original input_payload from run history.

19k — Canvas zoom indicator: A + / - / reset button cluster in the canvas bottom-left showing current zoom %. Complements pan/zoom already in use; makes zoom level discoverable.

Threads

19l — Thread archive action: A swipe-right or ⊗ button on each thread card archives it (removes from default list). Archived threads visible via a "Show archived" toggle at the top. State in omnyid.archived-threads.

19m — Thread mention detector: Scan thread messages for @username patterns. When detected, add a small "@" badge to the thread card header and sort mentioned threads above unread ones.

19n — Inline thread title edit: Double-click a thread title in the list to edit it inline (same pattern as WorkflowsView node labels). Stored in omnyid.thread-titles overrides map.

Agent Settings

19o — Heuristic confidence threshold preview: Next to each heuristic's autonomy tier dropdown, a read-only mini-badge shows the current effective threshold (e.g. >0.70). Makes the tier-to-threshold mapping visible without requiring the user to know the internals.

19p — Schedule export: In the Proactivity section, an "Export schedule" button that downloads a .json file containing the user's level, working-hours setting, and per-heuristic overrides — useful for backup or transferring to a new device.

19q — Audit log search: A filter input above the autonomous action log (when visible) that searches heuristic_id and accepted fields client-side. Rows update live; no API call needed.

NavBar / Global

19r — Tab hover preview card: When hovering a nav tab for >600ms, show a popover with the tab's last 2 feed items (cards) as mini-previews. Dismisses on mouseout. Makes tab switching more confident.

19s — Global status summary command: Typing status or /status in the search bar returns a synthesised text card: "You have 3 pinned items, 2 unread threads, 1 active workflow, and 0 pending approvals." Assembled client-side from existing signals — no API call.

Feed & Dashboard

20a — Card "snooze until tomorrow" action: A ⏰ button on each card hides it until midnight, then re-surfaces it at the top of the feed. State in omnyid.snoozed-cards as Record<msgId, isoDate>. Cards snoozed until a future date are filtered from the default feed view, like archive but time-bounded.

20b — AI card labelling: A one-click "🏷 Auto-label" button per card calls /ui/command with intent: "label" and the card's summary. The returned label string (e.g. "Follow-up needed", "Decision", "FYI") is stored in omnyid.card-labels and shown as a colour-coded chip on the card header.

20c — Feed density heat-stripe: A 4px vertical stripe on the far left of the feed container whose colour shifts from cool blue (few cards) to warm amber (many cards, >15) — a glanceable busyness indicator. No numbers, just colour.

20d — Card "remind me in X" timer: Right-click context menu option "⏰ Remind me in…" with presets (15m, 1h, tomorrow). Sets a setTimeout for short durations or stores in omnyid.reminders for longer ones. On trigger, re-surfaces the card with a pulsing amber border.

20e — Related cards panel: Clicking a new "🔗 Related" button on a card queries POST /ui/command with intent: "find_related" and the card's thread_id. Returns 2-3 related message summaries shown in a collapsible panel below the card.

Search / Chat

20f — Inline result citation panel: When a research result contains a sources array, render a collapsible "📚 Sources (N)" section below the result summary listing each source with its title, URL, and a snippet — mirrors the 17f citation chip but as a full panel for power users who need the raw references.

20g — Query complexity estimator: Before submitting, estimate query complexity (word count × entity density) and show a micro-badge: "Simple", "Moderate", "Complex". Complex queries get a soft warning: "This may take longer — using extended timeout." No API call needed; computed client-side.

20h — Conversation branching: A "↗ New branch" button on any command result opens a fresh search bar pre-seeded with the result summary as context, sent as context_msg_id in the body. Lets users explore a tangent without losing the original thread.

Workflows

20i — Node dependency visualiser: When a node is selected/inspected, highlight all its upstream dependencies with a blue left-border and all downstream dependents with a green right-border — traces the critical path without extra UI chrome.

20j — Workflow version history: Each time a workflow is saved, push a snapshot ({nodes, edges, savedAt}) to omnyid.workflow-versions[id] (capped at 10). A "History ▼" button in the canvas header shows a dropdown of versions; clicking one restores the canvas state.

20k — Idle node detector: A "Find bottlenecks" button in the canvas toolbar scans the run history for nodes with >0 failed runs and nodes that have never executed. Highlights them with a dashed amber border and shows a tooltip explaining why.

Threads

20l — Thread merge: Multi-select 2 threads (via checkboxes in a new "Select" mode), then "Merge" combines them into a single thread by re-pointing all messages to the first thread's ID via POST /ui/command. Useful when the same topic was split across conversations.

20m — Smart thread grouping: Add a "Group by topic" toggle above the thread list. When on, cluster threads by derived topic (computed client-side by grouping thread titles that share 2+ significant words). Groups collapse/expand, each showing a topic label derived from the shared words.

20n — Thread read-aloud: A small 🔊 button on each thread card reads the thread's latest message aloud via window.speechSynthesis. Respects user's browser TTS settings. Useful for accessibility and glancing at a thread without scrolling into it.

Agent Settings

20o — Heuristic A/B split test mode: In the heuristic packs section, a toggle "A/B mode" on any pack randomly assigns 50% of suggestion events to the pack and 50% to a control group. Acceptance rate is tracked per group and shown as "A: 72% | B: 61%". Stored client-side; useful for validating whether a pack is actually improving outcomes.

20p — LLM response cost estimator: Below the LLM config section, show a live estimate of "~$X / 1000 queries" based on the selected model's public pricing and a 500-token average. Updates when the model dropdown changes. Static lookup table — no API call.

20q — Agent soul editor diff view: When editing the soul.md field (if present), show a side-by-side diff between the current saved soul and the draft using a simple line-diff algorithm (split by \n, highlight added/removed lines with green/red backgrounds). Replaces the plain textarea for the soul field only.

NavBar / Global

20r — View activity timeline: A Ctrl+H shortcut opens a mini timeline overlay showing the last 10 view switches with timestamps (derived from tabLastUsed data). Each entry is clickable to jump back to that view. Makes navigation history visible and reversible.

20s — Ambient focus music toggle: A 🎵 button in the hamburger "Appearance" section starts a looping 40Hz binaural tone via Web Audio API (OscillatorNode + GainNode). Frequency and volume configurable (40Hz default, 0.05 gain). Stops when toggled off or when the tab is hidden (visibilitychange event).

20t — Smart tab badge colour: Nav tab badges (email unread, calendar upcoming) get colour-coded by urgency: red if unread > 10 or calendar event is within 30 minutes, amber if within 2 hours, otherwise the default primary blue. Currently all badges use a flat primary colour regardless of urgency.