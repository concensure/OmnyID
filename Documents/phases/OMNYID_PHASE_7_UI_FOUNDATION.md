# Omnyid Phase 7 UI Foundation

## Phase 7: UI Foundation

Status: completed

Purpose: turn the prototype workspace into a real agent-native renderer over AFP thread history, where every view is driven by the `views[].format` field on AFP messages rather than hardcoded UI configuration.

## What Was Landed

### Config Validation Baseline (earlier pass)

- [ui/schema.ts](/c:/Users/joes/Desktop/projects/Agenton/ui/schema.ts) defines layout section types, width presets, shared thread data types, and a runtime parser for `ui/config.json`.
- This gave the UI a first typed contract instead of treating the JSON file as unchecked shape.

### Shared Thread Demo Surface (earlier pass)

- [ui/App.tsx](/c:/Users/joes/Desktop/projects/Agenton/ui/App.tsx) renders one thread-centric dashboard shell that prefers a real homeserver thread fetch from `/thread/{thread_id}` and falls back to a demo thread.
- The workspace drives multiple React renderer components from a single AFP thread model: email inbox, notes canvas, database/action log, calendar timeline, encrypted attachment preview.

### Realtime Thread Refresh (earlier pass)

- [ui/App.tsx](/c:/Users/joes/Desktop/projects/Agenton/ui/App.tsx) opens a thread-scoped relay subscription on `/relay/ws` and refreshes the active thread when `thread_snapshot` or `message_stored` events arrive.

### Solid Shell — Agent-Native View Registry (this pass)

The Solid shell in [solid-ui](/C:/Users/joes/Desktop/projects/Agenton/solid-ui) now implements a complete agent-native workspace where the AFP message `views[].format` field controls what the workspace renders.

#### AFP Types in api.ts

- [solid-ui/src/lib/api.ts](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/lib/api.ts) now defines `AfpMessage`, `AfpView`, `AfpAttachment`, and `AfpReference` types that mirror the AFP v1 schema from `template.json`.
- `fetchThread(threadId)` fetches all messages from `GET /thread/{id}`.
- `pickView(message, known)` selects the highest-priority `views[]` entry whose format is in the known renderer set.
- `KNOWN_VIEW_FORMATS` declares the six supported formats: `email`, `canvas`, `table`, `calendar`, `attachments`, `approvals`.

#### Renderer Components

Each renderer in [solid-ui/src/components/renderers/](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/components/renderers/) receives a full `AfpMessage` and an optional pre-selected `AfpView`. All renderers fall back gracefully when the view content uses simpler shapes.

- [InboxRenderer.tsx](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/components/renderers/InboxRenderer.tsx) — email-style inbox card with encrypted attachment badges. Format: `email`.
- [CanvasRenderer.tsx](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/components/renderers/CanvasRenderer.tsx) — Notion-style block canvas for headings, bullets, code, and quotes driven by `views[].content.blocks`. Format: `canvas`.
- [TableRenderer.tsx](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/components/renderers/TableRenderer.tsx) — compact data table driven by `views[].content.columns` and `views[].content.rows`. Format: `table`.
- [CalendarRenderer.tsx](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/components/renderers/CalendarRenderer.tsx) — timeline event cards driven by `views[].content.events`. Format: `calendar`.
- [AttachmentsRenderer.tsx](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/components/renderers/AttachmentsRenderer.tsx) — metadata-first encrypted attachment panel (storage backend, encryption scheme, SHA-256 prefix). Format: `attachments`.
- [ApprovalsRenderer.tsx](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/components/renderers/ApprovalsRenderer.tsx) — approval queue with Approve/Reject buttons wired to `POST /actions/decision`. Format: `approvals`.

#### ViewDispatcher

[solid-ui/src/components/ViewDispatcher.tsx](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/components/ViewDispatcher.tsx) is the central renderer registry:

1. Calls `pickView` to find the highest-priority known format in the message's `views` array.
2. If no view hint exists, applies a heuristic fallback based on the message `type` string.
3. Dispatches to the correct renderer.
4. Shows a format badge and an "agent view" label when the format came from the agent's `views` field.

This is the agent-native contract: agents control workspace rendering by writing `views[].format` into AFP messages. No UI code changes are required when an agent adopts a new rendering style.

#### ThreadView

[solid-ui/src/components/ThreadView.tsx](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/components/ThreadView.tsx) fetches a full AFP thread from the homeserver and renders each message through `ViewDispatcher`. It shows a format count summary (e.g. "email · 4, canvas · 2") and a back button.

#### Thread Browser

- [solid-ui/src/App.tsx](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/App.tsx) now has a `threads` view with a `ThreadListFallback` component that lists unique thread IDs derived from dashboard bootstrap messages and opens them in `ThreadView`.
- Thread pills in `DashboardFeed` also open the thread view directly from the feed.

#### Updated Components

- [solid-ui/src/components/DashboardFeed.tsx](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/components/DashboardFeed.tsx) now renders each AFP message through `ViewDispatcher` instead of plain text cards, and shows thread-browser pills.
- [solid-ui/src/components/NavBar.tsx](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/src/components/NavBar.tsx) now has four views: Search, Dashboard, Threads, Runner. The `ViewName` type is exported.

### Landing Page → Workspace Navigation (this pass)

- [docs/index.html](/c:/Users/joes/Desktop/projects/Agenton/docs/index.html) now has a "Continue as guest" button in the auth modal.
- [docs/app.js](/c:/Users/joes/Desktop/projects/Agenton/docs/app.js) now redirects to `/workspace/` after successful login, registration, or Google sign-in instead of revealing the old agent-console section on the landing page.
- Guest access clears any stored session and redirects to `/workspace/` where the SolidJS shell shows the guest mode banner.
- [Caddyfile](/c:/Users/joes/Desktop/projects/Agenton/Caddyfile) now serves `/workspace*` from `/srv/workspace` with `try_files` SPA fallback, keeping the landing page at the domain root.
- [docker-compose.oracle.minimal.yml](/c:/Users/joes/Desktop/projects/Agenton/docker-compose.oracle.minimal.yml) mounts `./solid-ui/dist` as `/srv/workspace`.
- [solid-ui/vite.config.ts](/C:/Users/joes/Desktop/projects/Agenton/solid-ui/vite.config.ts) sets `base: "/workspace/"` so all built assets resolve correctly.

## Still Remaining In Phase 7

- persist layout preferences (active view, preferred thread) as AFP state or local synced config via ElectricSQL
- add relay WebSocket subscription inside `ThreadView` so threads refresh in real time without manual reload
- add decrypted attachment access on trusted clients (client-side key material needed)
- layout editor for configurable widget sizes in the dashboard grid view

## Notes

Phase 7 is now grounded in the correct agent-native product model:

- every AFP message carries `views[].format` which tells the workspace how to render it
- agents can change the workspace rendering for any message by updating its `views` array without any UI code changes
- the same append-only AFP thread history drives both the human workspace surfaces (inbox, canvas, calendar, table, approvals) and the agent code path
- the Solid shell is now the production UI path; the older React `ui/` remains as a thread-model prototype reference
