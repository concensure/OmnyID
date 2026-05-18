| Change File | What changed |
| :--- | :--- |
| **OnboardingWizard.tsx** | **Reconfigure modal top-aligned:** `items-center` → `items-start pt-14`; cards now appear near the top of the screen. |
| **NavBar.tsx** | **Plan + Database removed from navbar:** Removed; Automations added to main tabs. |
| **NavBar.tsx** | **Compact search in navbar:** Input appears in right cluster for all non-chat views; press Enter to query. |
| **App.tsx** | **Right sidebar removed:** The entire `<aside>` with Mask/Plaza/LoRA/session panel is gone. |
| **App.tsx** | **Search bar hidden in non-chat views:** Full SearchBar + greeting + suggestions wrapped in `<Show when={activeView() === "search"}>`. |
| **App.tsx** | **Dynamic running summary:** "Your private AI workspace" replaced with live count of completed tasks, upcoming events, and waiting emails. |
| **AutomationsView.tsx + App.tsx** | **Automations view:** New view wrapping `DaemonPanel` + `AgentTriggersView`; linked from navbar. |
| **DashboardFeed.tsx** | **Agent feed text fix:** Encoding fix: "â—‹" → "○", "â ¿â ¿" → "≡≡". |
| **DashboardFeed.tsx** | **AFP card corner radius:** `rounded-[20px]/rounded-[22px]` → `rounded-xl`. |
| **ToolsView.tsx** | **Tools "More" link:** Shows first 3 categories; "▼ More (N more categories)" expands the rest. |
| **KnowledgeGraphView.tsx** | **Background Daemons link:** Clickable underlined link navigates to the Automations view. |


Plan Intent Routing (Search Bar → Planning View)
src/server/mod.rs — Added "plan" as a new intent to the LLM classifier system prompt with clear rules ("best way to get to X", "options for", "travel planning" → always plan). Added a plan match arm that returns intent: "plan", suggested_view: "planning", and echoes the cleaned query in bullets[0]. Updated preferred_view_for_intent().

solid-ui/src/components/PlanningView.tsx — Added initialQuery prop + onMount that auto-submits when a query is passed in (triggered by the search bar routing).

solid-ui/src/App.tsx — When handleSearch receives intent === "plan", it sets planInitialQuery and navigates to the planning view, which then auto-runs the query. A 100ms timeout clears the seed so re-visiting planning later starts fresh.

Tool View
solid-ui/src/components/NavBar.tsx — Added "tools" to ViewName union type and inserted a "Tools" nav button in the core nav strip.

solid-ui/src/components/ToolsView.tsx (new, ~280 lines) — Full tool marketplace UI with:

23 curated tools across 7 categories (Communication, Project Management, Productivity, Storage, Design, Dev & Data, Automation, CRM & Finance)
Clearbit CDN logos with deterministic color + initials fallback
Search/filter across tools
Login gate for unauthenticated users
Connect modal (MCP server URL + API key) per tool
Connected tools section with inline disconnect confirmation
"How it works" info strip explaining AFP routing
Backend Tool Connection Storage
postgres/migrations/0043_mcp_tool_connections.sql — New table mcp_tool_connections (user_id, tool_slug, tool_name, mcp_server_url, api_key_enc, connected_at).

src/db/migration_catalog.rs — Registered the migration (count: 39 → 40).

src/db.rs — Added list_tool_connections, upsert_tool_connection, delete_tool_connection methods.

src/server/mod.rs — Added GET /tools/connections, POST /tools/connections, DELETE /tools/connections/{slug} route handlers using authenticated_user gating.

solid-ui/src/lib/api.ts — Added McpToolConnection type, fetchToolConnections, connectTool, disconnectTool API functions.