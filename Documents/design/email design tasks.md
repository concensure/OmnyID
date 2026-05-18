# Email Design Tasks

Source references:
- `Documents/design/brand`
- `Documents/design/email view`

Goal:
Replace the current lightweight email panel in `solid-ui/src/components/EmailView.tsx` with a full Email View that matches the established Note View shell, tokens, motion, and interaction model.

Current workspace gap:
- `solid-ui/src/components/EmailView.tsx` is still a compact Gmail connection and agent-actions panel.
- `solid-ui/src/components/NoteView.tsx` already contains the fuller layout system, token usage, responsive behavior, and interaction patterns the Email View should align with.

Implementation principle:
- Build the shell and interaction model first, then map real data into it. Do not block the UI redesign on perfect email metadata.

## System Daemon Dependencies

The Email View depends on a shared background-daemon model that already exists at the platform level, even when parts of the UI still rely on fallback AFP fields.

- `Email Gateway Daemon`
  - Monitors IMAP/SMTP and provider sync loops for inbound and outbound mail events.
  - Converts inbound email into AFP messages and emits outbound AFP email intents through real delivery channels.
  - Operates with delegated email scope only under the Master Agent.

- `Relational Sync Worker`
  - Watches AFP messages marked `store_in_relational: true`.
  - Projects structured, disposable relational views into Postgres for fast folder, thread, and mailbox-style queries.

- `Archive & Cold Storage Daemon`
  - Watches `archive_after` and `expires_at`.
  - Moves older AFP messages into MinIO-backed cold storage while preserving lightweight lookup/index records in Postgres.

- `Health & Maintenance Daemon`
  - Runs during idle windows.
  - Re-indexes embeddings, detects duplicate content/thread fragments, and cleans graph state that supports labels, backlinks, and related-message suggestions.

Shared rules:

- All daemons are spawned by the Master Agent with delegated scoped keys.
- All daemons operate on AFP messages or AFP-derived indexes only.
- All daemon flows are asynchronous and must not block core inbox rendering.
- No daemon may break E2EE or append-only history rules.

## Dependency-Ordered Tasks

1. Audit and extract reusable Note View patterns
   - Compare `solid-ui/src/components/EmailView.tsx` against `solid-ui/src/components/NoteView.tsx`.
   - Identify which shell pieces should be reused or mirrored: top bar, left sidebar, main content region, right sidebar, responsive collapse rules, focus treatment, and motion timings.
   - Decide whether to share tokens/helpers directly or copy the proven patterns into Email View with minimal divergence.
   - Dependency: none.

2. Define the Email View data model and view state
   - Introduce Email View-specific UI state for mailbox filter, selected folder, selected thread/message, composer open/closed state, search query, and hover action visibility.
   - Map existing `DashboardBootstrap.messages` data into an email-list model that can drive cards, preview, summaries, tags, and timestamps.
   - Establish placeholders or fallbacks for fields the current AFP messages do not always provide yet, so the view can render without backend changes.
   - Treat mailbox-like relational tables and archive indexes as derived accelerators, not canonical truth. The canonical source remains AFP thread history plus daemon-produced projections.
   - Dependency: task 1.

3. Rebuild the page shell to match the Note View structure
   - Refactor `solid-ui/src/components/EmailView.tsx` into the same four-zone layout described in the design doc: top bar, left sidebar, main list, right preview/composer panel.
   - Apply the brand constraints from `Documents/design/brand`: 56px top bar, 240px collapsible sidebar, 320px right panel, base-8 spacing, Inter typography, sunset orange only for primary emphasis.
   - Preserve the existing Gmail connection flow, but reposition it so it fits the new shell rather than dominating the entire view.
   - Dependency: task 2.

4. Implement the top bar interactions
   - Add the inbox-wide search field with the same calm rounded treatment as Note View.
   - Add the `New Email` primary CTA using the sunset orange accent.
   - Add the view toggle for `Inbox`, `Sent`, `Drafts`, and `Archive`.
   - Ensure keyboard focus, active states, and compact behavior follow the brand/accessibility requirements.
   - Dependency: task 3.

5. Implement the left sidebar information architecture
   - Add standard folders: `Inbox`, `Sent`, `Drafts`, `Archive`, `Trash`.
   - Add a Smart Folders section for AI-derived folders such as `Travel`, `Finance`, and `Waiting for Reply`.
   - Add Labels / Supertags sourced from available message metadata or temporary seed values when unavailable.
   - Support sidebar collapse below the Note View breakpoint so the Email View stays consistent across workspace views.
   - Dependency: task 3.

6. Replace the current message feed with email cards
   - Convert the main content area from generic stacked `ViewDispatcher` cards into dedicated email list cards.
   - Each card should support sender avatar/name, subject, unread emphasis, summary or first-line preview, supertag pills, timestamp, and hover quick actions.
   - Add selected, unread, hover, and keyboard-focus states matching the brand motion and accent rules.
   - Keep rendering resilient when data is sparse by falling back to AFP message content where email-specific fields are missing.
   - Dependency: tasks 2, 3, 4, and 5.

7. Build the right sidebar preview state
   - When an email is selected, show a readable preview panel in the right sidebar rather than a generic renderer card.
   - Surface related notes/research backlinks when those links exist in AFP message content.
   - Keep the preview layout visually aligned with the Note View context panel instead of introducing a new visual language.
   - Dependency: task 6.

8. Add the recommended composer interaction as an overlay side drawer
   - Implement `New Email` as a shadowed overlay with a right-side composer drawer, not a full-view replacement.
   - Keep the inbox visible and dimmed behind the composer, with smooth open/close transitions and preserved context.
   - Reuse the right sidebar width logic so the composer feels like a natural extension of the preview panel.
   - Preserve the existing send/connect logic where possible, but isolate composer UI state from preview state.
   - Dependency: tasks 4 and 7.

9. Reintroduce agent actions in a secondary, non-dominant way
   - Keep `Auto-Label`, `Draft Replies`, `Unsubscribe`, and `Daily Summary`, but move them into a subordinate panel or contextual area so they support the inbox instead of replacing it.
   - Ensure action feedback states (`idle`, `pending`, `done`, `error`) still render clearly inside the new design.
   - Make clear in UI copy or behavior that auto-labeling, draft suggestions, and thread cleanup may arrive asynchronously from daemon activity instead of synchronous user actions.
   - Dependency: tasks 3 and 7.

10. Wire responsiveness and accessibility end-to-end
   - Match the Note View breakpoints: collapse the sidebar below 1024px and stack into a mobile-friendly layout below 640px.
   - Enforce 44px minimum touch targets, visible keyboard focus, and contrast-compliant text/pill/button combinations.
   - Verify the composer, quick actions, and folder navigation remain keyboard reachable.
   - Dependency: tasks 4 through 9.

11. Verify integration with existing workspace routing and dashboard data
   - Confirm the Email tab in `solid-ui/src/App.tsx` still mounts correctly and that no assumptions in `DashboardBootstrap` break the new UI.
   - Check whether any helper extraction is needed in `solid-ui/src/lib/api.ts` or adjacent UI utilities to keep `EmailView.tsx` maintainable.
   - Keep `ViewDispatcher` usage only where it still adds value, instead of letting generic renderers define the Email View layout.
   - Dependency: tasks 6 through 10.

12. Final polish and regression review
   - Review visual consistency against the brand and email-view docs.
   - Confirm no sunset orange overuse, no accidental divergence from Note View motion/spacing, and no layout jank after send/open/close flows.
   - Smoke test connected and disconnected Gmail states, empty inbox states, and partial-data states.
   - Dependency: tasks 1 through 11.

## Critical Path

The shortest path to a working redesign is:
1. Task 1: audit reusable Note View patterns.
2. Task 2: define Email View state and fallback data mapping.
3. Task 3: rebuild the shell.
4. Task 4: add top bar controls.
5. Task 5: add sidebar structure.
6. Task 6: replace generic cards with email cards.
7. Task 7: add the preview panel.
8. Task 8: add the composer drawer.
9. Task 10: finish responsive and accessibility behavior.
10. Task 12: polish and regression review.

Tasks 9 and 11 should happen before merge, but they should not delay the initial visual and interaction conversion if the shell is still in flight.

## Suggested File Touches

- `solid-ui/src/components/EmailView.tsx`
- Possibly extracted helpers/components under `solid-ui/src/components/` if Email View becomes too large
- `solid-ui/src/App.tsx` only if the Email tab mount contract needs minor adjustment
- `solid-ui/src/lib/api.ts` only if the current bootstrap typing is too weak for the new UI

## Risks and Decisions to Lock Early

- Data shape risk: current AFP message payloads may not consistently expose sender, subject, snippet, tags, or thread-level grouping. The UI should define fallback extraction rules early instead of stalling on backend cleanup.
- Derived-state risk: relational mailbox views and archive indexes are intentionally disposable. The Email View should degrade gracefully to direct AFP-derived fields when those projections lag, rebuild, or are temporarily absent.
- Scope risk: the design asks for a full inbox experience, but the current view also owns Gmail connection and agent actions. Those flows need to remain present but visually subordinate.
- Reuse risk: copying large chunks from `NoteView.tsx` will be faster short term, but shared helpers or extracted shell primitives may be worth it if more workspace views will follow the same frame.
- Renderer boundary risk: `ViewDispatcher` is useful for message cards, but it should not dictate the overall Email View structure once the inbox becomes a dedicated product surface.

## Done Criteria

- Email View uses the same core shell logic and brand tokens as Note View.
- Inbox is the primary experience; Gmail connection and agent actions are secondary.
- The composer opens as a dimmed right-side drawer instead of replacing the inbox.
- Sidebar, list, preview, and composer all work on desktop and mobile breakpoints.
- The screen remains functional when email metadata is incomplete.

## Reflection-Driven Improvements Applied

- Added a critical path so the team can sequence the redesign without treating every task as equally blocking.
- Added explicit risk notes around incomplete AFP/email data, since that is the most likely source of implementation churn.
- Clarified the implementation principle: ship the structural redesign first and rely on fallback mapping where backend fields are missing.
