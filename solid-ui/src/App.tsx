import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { AgentFleetView } from "@/components/AgentFleetView";
import { AgentSettingsView } from "@/components/AgentSettingsView";
import { AlternateViewsInspector } from "@/components/AlternateViewsInspector";
import { DashboardFeed } from "@/components/DashboardFeed";
import { EmailView } from "@/components/EmailView";
import { GlassPanel } from "@/components/GlassPanel";
import { GuidedTour, shouldShowTour } from "@/components/GuidedTour";
import { LoraStatusWidget } from "@/components/LoraStatusWidget";
import { MaskSwitcher } from "@/components/MaskSwitcher";
import { NavBar, type ViewName } from "@/components/NavBar";
import { OnboardingWizard } from "@/components/OnboardingWizard";
import { MonthlyCalendarView } from "@/components/MonthlyCalendarView";
import { PublicFeedView } from "@/components/PublicFeedView";
import { PythonRunnerView } from "@/components/PythonRunnerView";
import { DecisionQueueView } from "@/components/DecisionQueueView";
import { ResponseQueueView } from "@/components/ResponseQueueView";
import { SearchBar } from "@/components/SearchBar";
import { ThreadView } from "@/components/ThreadView";
import { ViewDispatcher } from "@/components/ViewDispatcher";
import { WorkflowsView } from "@/components/WorkflowsView";
import { CofounderStudioView } from "@/components/CofounderStudioView";
import { TemplatesView } from "@/components/TemplatesView";
import { ContactsView } from "@/components/ContactsView";
import { ConnectedAppsView } from "@/components/ConnectedAppsView";
import { CostDashboardView } from "@/components/CostDashboardView";
import { EditProfileModal } from "@/components/EditProfileModal";
import { DatabaseView } from "@/components/DatabaseView";
import { ToolsView } from "@/components/ToolsView";
import { AfpInspector } from "@/components/AfpInspector";
import { KnowledgeGraphView } from "@/components/KnowledgeGraphView";
import { SpacesView } from "@/components/SpacesView";
import { DiaryView } from "@/components/DiaryView";
import { DiscoverView } from "@/components/DiscoverView";
import { BentoGrid } from "@/components/BentoGrid";
import { PulseFeed } from "@/components/PulseFeed";
import { HomeQueuesSection } from "@/components/HomeQueuesSection";
import { AgentPersonaFAB } from "@/components/AgentPersonaFAB";
import { FloatingFormatBar } from "@/components/FloatingFormatBar";
import { ViewCustomizer } from "@/components/ViewCustomizer";
import { ToastContainer } from "@/components/Toast";
import {
  apiFetch,
  API_BASE,
  type AfpMessage,
  fetchEncKey,
  fetchLlmConfig,
  loadPrefs,
  orchestrate,
  readSession,
  savePrefs,
  SESSION_CHANGED_EVENT,
  type Session,
  writeSession,
  type DashboardBootstrap,
  type LlmConfig,
  type RuntimeWorkspaceFileEntry,
  type RuntimeWorkspaceFileResponse,
  type UiCommandResponse
} from "@/lib/api";
import { checkBrowserAiAvailable, classifyWithBrowserAi, getBrowserAiLabel } from "@/lib/browserAi";
import {
  buildRouteCardPreviewMessage,
  buildRouteComparisonPreviewMessage,
  buildSocialComposerPreviewMessage,
  buildSpaceFeedPreviewMessage,
  travelPreviewPrefersComparison,
} from "@/lib/commandPreviewSurfaces";
import { buildDecisionOsUpdateDetail } from "@/lib/decisionosContinuity";
import { hasConsentBeenAsked } from "@/lib/profileLedger";
import { ProfilingConsentModal } from "@/components/ProfilingConsentModal";

let decryptModulePromise: Promise<typeof import("@/lib/decrypt")> | null = null;

// Views that must never be auto-navigated to from a search result suggestion
const NAV_BLOCKLIST = new Set(["agent_settings", "connected_apps", "cost_dashboard", "sovereignty_audit"]);

const VIEW_LABELS: Partial<Record<ViewName, string>> = {
  home: "Home", search: "Chat", threads: "Threads", workflows: "Workflows",
  email: "Email", note: "Notes", calendar: "Calendar", database: "Database",
  templates: "Templates", runner: "Runner", agent_settings: "Agent Settings",
  diary: "Diary", discover: "Discover", cofounder_studio: "Co-Founder",
  space_feed: "Spaces", public_feed: "Public Feed",
  knowledge_graph: "Knowledge Graph", sovereignty_audit: "Sovereignty",
  contacts: "Contacts", connected_apps: "Connected Apps", decision_queue: "Decision Queue", tasks: "Tasks", response_queue: "Response Queue",
  cost_dashboard: "Cost Dashboard",
  tools: "Tools",
  pulse: "Pulse Feed",
  goals: "Goals",
};

function loadDecryptModule() {
  if (!decryptModulePromise) {
    decryptModulePromise = import("@/lib/decrypt");
  }
  return decryptModulePromise;
}

function dispatchDecisionOsBootstrap(payload: DashboardBootstrap) {
  const detail = buildDecisionOsUpdateDetail(payload);

  window.dispatchEvent(
    new CustomEvent("omnyid:decision-os-update", {
      detail,
    })
  );
}

function buildRunnerEditPanel(command: UiCommandResponse, query: string): Record<string, unknown> {
  const draft = command.runner_draft;
  const targetFile = draft?.target_file_id ?? "runner_chat_py";
  const rows = (command.bullets ?? []).length > 0
    ? (command.bullets ?? []).map((item) => [item])
    : [
        ["Review the generated patch before applying it"],
        ["Confirm tool and policy changes before redeploying"],
        ["Run a test or dry-run after saving the draft"],
      ];

  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: query ? `Runner draft for "${query}"` : "Runner draft",
    description:
      "The agent prepared a safe, review-first Python runner draft with clear next steps before execution.",
    layout: { type: "stack", gap: "md" },
    nodes: [
      {
        id: "runner-edit-summary",
        type: "callout",
        props: {
          tone: "strategy",
          title: "Runner draft ready for review",
          body: command.summary,
        },
      },
      {
        id: "runner-edit-stats",
        type: "stats_grid",
        props: {
          items: [
            { label: "Target file", value: targetFile },
            { label: "Review", value: draft?.requires_confirmation ? "Required" : "Optional" },
            { label: "Workspace", value: "Python runner" },
          ],
        },
      },
      {
        id: "runner-edit-workflow",
        type: "section",
        props: {
          title: "Suggested workflow",
          layout: { type: "stack", gap: "sm" },
        },
        children: [
          {
            id: "runner-edit-checklist",
            type: "table",
            props: {
              columns: ["Review checklist"],
              rows,
              caption: "Safe editing flow",
            },
          },
          {
            id: "runner-edit-tip",
            type: "text",
            props: {
              label: "Tip",
              value:
                "Keep the command bar open while reviewing the draft so the agent can revise the code in place before you save it.",
            },
          },
        ],
      },
      {
        id: "runner-edit-code",
        type: "code",
        props: {
          title: targetFile.endsWith("_json")
            ? "Draft code (json)"
            : targetFile.endsWith("_txt")
              ? "Draft code (text)"
              : "Draft code (python)",
          language: targetFile.endsWith("_json")
            ? "json"
            : targetFile.endsWith("_txt")
              ? "text"
              : "python",
          code: draft?.content ?? "",
        },
      },
    ],
  };
}

function buildDashboardFocusPanel(command: UiCommandResponse, query: string): Record<string, unknown> {
  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: query ? `Workspace focus for "${query}"` : "Workspace focus",
    description:
      "Pivot the workspace toward recent agent output, runtime health, and the next useful control surface.",
    layout: { type: "stack", gap: "md" },
    nodes: [
      {
        id: "dashboard-focus-summary",
        type: "callout",
        props: {
          tone: "info",
          title: "Dashboard focus ready",
          body: command.summary,
        },
      },
      {
        id: "dashboard-focus-stats",
        type: "stats_grid",
        props: {
          items: [
            { label: "Primary view", value: "Dashboard" },
            { label: "Status panel", value: "Agent fleet" },
            { label: "Detail view", value: "Threads and runtime" },
          ],
        },
      },
      {
        id: "dashboard-focus-guidance",
        type: "section",
        props: {
          title: "Suggested pivots",
          layout: { type: "stack", gap: "sm" },
        },
        children: [
          {
            id: "dashboard-focus-table",
            type: "table",
            props: {
              columns: ["Focus area", "What happens"],
              rows: (command.bullets ?? []).length > 0
                ? (command.bullets ?? []).map((item) => [item, "Suggested workspace focus"])
                : [
                    ["Recent messages", "See the latest agent output and thread activity."],
                    ["Agent status", "Check running, idle, and blocked agents at a glance."],
                    ["Runtime health", "Inspect runner state, logs, and recent changes."],
                  ],
              caption: "High-value next views",
            },
          },
          {
            id: "dashboard-focus-tip",
            type: "text",
            props: {
              label: "Tip",
              value:
                "Use the agent status panel to jump from green completed tasks to orange in-progress work before opening the full thread view.",
            },
          },
        ],
      },
    ],
  };
}

function buildGenericCommandPanel(
  command: UiCommandResponse,
  query: string,
  sourceLinks: Array<{ title: string; url: string; snippet: string }>,
): Record<string, unknown> {
  const a2uiNodes: Array<Record<string, unknown>> = [
    {
      id: "command-summary",
      type: "callout",
      props: {
        tone: command.intent === "runner_edit" ? "strategy" : "info",
        title: query ? `Command result for "${query}"` : "Command result",
        body: command.summary,
      },
    },
  ];
  if ((command.bullets ?? []).length > 0) {
    a2uiNodes.push({
      id: "command-next-steps",
      type: "table",
      props: {
        columns: ["Checklist"],
        rows: (command.bullets ?? []).map((item) => [item]),
        caption: "Next steps",
      },
    });
  }
  if (command.runner_draft) {
    a2uiNodes.push({
      id: "runner-draft-stats",
      type: "stats_grid",
      props: {
        items: [
          { label: "Target file", value: command.runner_draft.target_file_id },
          { label: "Review", value: command.runner_draft.requires_confirmation ? "Required" : "Optional" },
          { label: "Workspace", value: "Python runner" },
        ],
      },
    });
    a2uiNodes.push({
      id: "runner-draft-code",
      type: "code",
      props: {
        title: command.runner_draft.target_file_id.endsWith("_json")
          ? "Draft code (json)"
          : command.runner_draft.target_file_id.endsWith("_txt")
            ? "Draft code (text)"
            : "Draft code (python)",
        language: command.runner_draft.target_file_id.endsWith("_json")
          ? "json"
          : command.runner_draft.target_file_id.endsWith("_txt")
            ? "text"
            : "python",
        code: command.runner_draft.content,
      },
    });
  }
  if (sourceLinks.length > 0) {
    a2uiNodes.push({
      id: "command-sources",
      type: "link_list",
      props: {
        title: "Sources",
        items: sourceLinks.map((link) => ({
          title: link.title || link.url,
          url: link.url,
          subtitle: link.snippet,
        })),
      },
    });
  }

  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: query ? `Command result for "${query}"` : "Command result",
    description: command.intent === "runner_edit"
      ? "The agent prepared a safe, review-first runner draft."
      : "The agent routed your request into the workspace.",
    layout: { type: "stack", gap: "md" },
    nodes: a2uiNodes,
  };
}

function buildSearchResultPanel(
  command: UiCommandResponse,
  query: string,
  sourceLinks: Array<{ title: string; url: string; snippet: string }>,
): Record<string, unknown> {
  const nodes: Array<Record<string, unknown>> = [
    {
      id: "search-summary",
      type: "callout",
      props: {
        tone: "info",
        title: query ? "Research summary" : "Research result",
        body: command.summary,
      },
    },
  ];

  if ((command.bullets ?? []).length > 0) {
    nodes.push({
      id: "search-bullets",
      type: "table",
      props: {
        columns: ["Key points"],
        rows: (command.bullets ?? []).map((item) => [item]),
        caption: "Research highlights",
      },
    });
  }

  if (sourceLinks.length > 0) {
    nodes.push({
      id: "search-sources",
      type: "link_list",
      props: {
        title: "Sources",
        items: sourceLinks.map((link) => ({
          title: link.title || link.url,
          url: link.url,
          subtitle: link.snippet,
        })),
      },
    });
  }

  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: query ? `Search result for "${query}"` : "Search result",
    description: "Structured research view companion for the current search result.",
    layout: { type: "stack", gap: "md" },
    nodes,
  };
}

function buildOrchestrationCompanionPanel(command: UiCommandResponse, query: string): Record<string, unknown> {
  const lowered = query.toLowerCase();
  const approvalTokens = [
    "send",
    "email",
    "book",
    "purchase",
    "buy",
    "pay",
    "delete",
    "cancel",
    "message someone",
    "contact",
    "submit",
    "apply",
    "transfer",
  ];
  const ambiguityTokens = [
    "this",
    "that",
    "something",
    "someone",
    "somebody",
    "it",
    "things",
    "stuff",
    "sort it out",
    "handle it",
  ];
  const broadActionTokens = ["organise", "organize", "manage", "plan", "handle", "set up"];
  const isApproval = approvalTokens.some((token) => lowered.includes(token));
  const isClarification = !isApproval && (
    ambiguityTokens.some((token) => lowered.includes(token)) ||
    (lowered.split(/\s+/).filter(Boolean).length <= 4 && broadActionTokens.some((token) => lowered.includes(token)))
  );
  const gate = isApproval ? "Approval" : isClarification ? "Clarification" : "None";
  const gateExplainer = isApproval
    ? "The orchestrator detected a higher-risk action boundary and will wait for approval."
    : isClarification
      ? "The orchestrator needs one planning preference before it commits to the next path."
      : "The orchestrator can begin immediately with the current objective.";

  return {
    schema_version: "a2ui.v1",
    kind: "panel",
    title: query ? `Orchestration preview for "${query}"` : "Orchestration preview",
    description:
      "Structured companion view for the orchestration card, useful for inspectors and alternate renderers.",
    layout: { type: "stack", gap: "md" },
    nodes: [
      {
        id: "orchestrate-summary",
        type: "callout",
        props: {
          tone: isApproval ? "warning" : isClarification ? "strategy" : "info",
          title: "Orchestration ready",
          body: command.summary,
        },
      },
      {
        id: "orchestrate-stats",
        type: "stats_grid",
        props: {
          items: [
            { label: "Card", value: command.card_id ?? "card.preview.local" },
            { label: "Gate", value: gate },
            { label: "Status", value: "streaming" },
          ],
        },
      },
      {
        id: "orchestrate-guidance",
        type: "section",
        props: {
          title: "Execution posture",
          layout: { type: "stack", gap: "sm" },
        },
        children: [
          {
            id: "orchestrate-gate-note",
            type: "text",
            props: {
              label: "Gate behavior",
              value: gateExplainer,
            },
          },
          {
            id: "orchestrate-next-steps",
            type: "table",
            props: {
              columns: ["Next step", "Purpose"],
              rows: isApproval
                ? [
                    ["Wait for approval", "Do not cross the action boundary prematurely."],
                    ["Resume only if approved", "Continue in the same card after confirmation."],
                  ]
                : isClarification
                  ? [
                      ["Ask for a preference", "Resolve ambiguity before execution starts."],
                      ["Lock the strategy", "Resume with the selected planning mode."],
                    ]
                  : [
                      ["Plan the run", "Break the objective into structured tasks."],
                      ["Start execution", "Begin the first safe step immediately."],
                    ],
              caption: "Expected flow",
            },
          },
        ],
      },
    ],
  };
}

function commandResponseToPreviewMessage(command: UiCommandResponse, query: string): AfpMessage {
  const timestamp = new Date().toISOString();
  const base: AfpMessage = {
    id: `preview.${command.intent}.${timestamp}`,
    thread_id: `preview.thread.${command.intent}`,
    from: "omnyid://workspace/command-bar",
    to: ["omnyid://workspace/user"],
    timestamp,
    type: "agent",
    subtype: "preview",
    content: {},
    metadata: { origin: "workspace_command_preview" },
    views: [],
    attachments: [],
    references: [],
    encryption: null,
  };

  const sourceLinks = (command.links ?? []).map((link) => ({
    title: link.title,
    url: link.url,
    snippet: link.kind === "source" ? "Source link" : link.kind,
  }));

  if ((command.preferred_view ?? "") === "search_result" || command.intent === "web_research") {
    const searchContent = {
      query,
      summary: command.summary,
      bullets: command.bullets ?? [],
      sources: sourceLinks,
    };
    const a2uiCompanion = buildSearchResultPanel(command, query, sourceLinks);
    return {
      ...base,
      type: "research",
      subtype: "content",
      content: {
        ...searchContent,
        kind: "web_research",
      },
      metadata: { origin: "workspace_command_preview", intent: command.intent, source_count: sourceLinks.length },
      views: [
        {
          format: "search_result",
          priority: 100,
          content: searchContent,
        },
        {
          format: "a2ui.v1",
          priority: 80,
          content: a2uiCompanion,
        },
      ],
    };
  }

  if (command.intent === "task" || (command.preferred_view ?? "") === "task_board") {
    const firstBullet = command.bullets?.[0] ?? "";
    const description = command.summary === firstBullet || !firstBullet
      ? command.summary
      : `${command.summary}\n${firstBullet}`;
    const taskContent = {
      kind: "task_preview",
      title: query || "Task",
      description,
      priority: "normal",
      task_type: "general",
      status: "pending",
    };
    return {
      ...base,
      type: "task",
      subtype: "card",
      content: taskContent,
      metadata: { origin: "workspace_command_preview", intent: command.intent },
      views: [
        {
          format: "task_card",
          priority: 100,
          content: taskContent,
        },
      ],
    };
  }

  if (command.intent === "note" || (command.preferred_view ?? "") === "ledger_canvas") {
    const noteContent = {
      kind: "workspace_note",
      title: query || "Note",
      blocks: [{ type: "paragraph", text: command.summary }],
    };
    return {
      ...base,
      type: "note",
      subtype: "content",
      content: noteContent,
      metadata: { origin: "workspace_command_preview", intent: command.intent },
      views: [
        {
          format: "canvas",
          priority: 100,
          content: noteContent,
        },
      ],
    };
  }

  if (command.intent === "social" || (command.preferred_view ?? "") === "social_composer") {
    return buildSocialComposerPreviewMessage(base, command, query);
  }

  if (command.intent === "spaces" || (command.preferred_view ?? "") === "spaces") {
    return buildSpaceFeedPreviewMessage(base, command, query);
  }

  if (
    command.intent === "travel"
    || (command.preferred_view ?? "") === "route_card"
    || (command.preferred_view ?? "") === "comparison_table"
  ) {
    const bullets = command.bullets ?? [];
    if (travelPreviewPrefersComparison(query, command.preferred_view, bullets)) {
      return buildRouteComparisonPreviewMessage(base, command, query);
    }
    return buildRouteCardPreviewMessage(base, command, query);
  }

  if (command.intent === "schedule" || (command.preferred_view ?? "") === "draggable_calendar") {
    const events = (command.bullets ?? []).map((bullet, index) => ({
      id: `preview-event-${index}`,
      title: bullet,
      start: timestamp,
      description: command.summary,
      status: "tentative",
    }));
    const calendarContent = {
      kind: "schedule_plan",
      title: query || "Schedule preview",
      description: command.summary,
      events,
    };
    return {
      ...base,
      type: "calendar",
      subtype: "plan",
      content: calendarContent,
      metadata: { origin: "workspace_command_preview", intent: command.intent },
      views: [
        {
          format: "calendar",
          priority: 100,
          content: calendarContent,
        },
      ],
    };
  }

  // ── Universal UI Presentation (intent: "trip_planner" or any orchestrate with rich content)
  // Produces a ui_presentation AFP message that PresentationCardRenderer renders as
  // interactive, domain-aware UI cards. Domain + card set are detected client-side
  // from the query, so no server changes are needed for new domains.
  // To add a new domain: update DOMAIN_SIGNALS + DOMAIN_DEFAULT_CARDS in presentationState.ts.
  const isPresentation = command.intent === "trip_planner"
    || (command.preferred_view ?? "") === "trip_planner"
    || (command.preferred_view ?? "") === "ui_presentation";

  if (isPresentation) {
    const presentationContent = {
      query,
      summary: command.summary,
      bullets: command.bullets ?? [],
      sources: (command.links ?? []).map((l) => ({ title: l.title, url: l.url })),
    };
    return {
      ...base,
      type: "agent",
      subtype: "ui_presentation",
      content: presentationContent,
      metadata: { origin: "workspace_command_preview", intent: command.intent },
      views: [
        {
          format: "ui_presentation",
          priority: 100,
          content: presentationContent,
        },
      ],
    };
  }

  if (command.intent === "orchestrate" || (command.preferred_view ?? "") === "orchestrate_progress") {
    const cardId = command.card_id ?? "card.preview.local";
    const generativeContent = {
      card_id: cardId,
      query,
      status: "streaming",
      optimization_mode: "balanced",
      provider: "omnyid",
      model: "",
      sections: [
        {
          id: "summary",
          type: "summary",
          order: 1,
          status: "complete",
          content: {
            text: command.summary,
          },
        },
        {
          id: "progress",
          type: "progress",
          order: 2,
          status: "running",
          content: {
            label: "Planning the orchestration path",
            value: 0.2,
          },
        },
        {
          id: "plan",
          type: "plan",
          order: 3,
          status: "pending",
          content: {
            steps: (command.bullets ?? []).length > 0 ? command.bullets : ["Break the goal into structured tasks"],
          },
        },
      ],
    };
    const a2uiCompanion = buildOrchestrationCompanionPanel(command, query);
    return {
      ...base,
      type: "agent",
      subtype: "orchestration_card",
      content: {
        kind: "orchestration",
        card: generativeContent,
      },
      metadata: { origin: "workspace_command_preview", intent: command.intent },
      views: [
        {
          format: "generative_card",
          priority: 100,
          content: generativeContent,
        },
        {
          format: "a2ui.v1",
          priority: 80,
          content: a2uiCompanion,
        },
      ],
    };
  }

  if (command.intent === "dashboard_focus") {
    const panel = buildDashboardFocusPanel(command, query);
    return {
      ...base,
      type: "agent",
      subtype: "dashboard_panel",
      content: panel,
      metadata: { origin: "workspace_command_preview", intent: command.intent },
      views: [
        {
          format: "a2ui.v1",
          priority: 100,
          content: panel,
        },
      ],
    };
  }

  const panel = command.intent === "runner_edit"
    ? buildRunnerEditPanel(command, query)
    : buildGenericCommandPanel(command, query, sourceLinks);

  return {
    ...base,
    type: command.intent === "runner_edit" ? "agent" : "agent",
    subtype: command.intent === "runner_edit" ? "runner_editor" : "workspace_panel",
    content: panel,
    metadata: { origin: "workspace_command_preview", intent: command.intent },
    views: [
      {
        format: "a2ui.v1",
        priority: 100,
        content: panel,
      },
    ],
  };
}

function App() {
  const [session, setSession] = createSignal(readSession());

  // Stable user ID at initialization — available before dashboard loads
  const initUserId = readSession()?.user?.id ?? "";
  // User-scoped localStorage key builders — reads use initUserId, writes use userId()
  const mkWfKey    = (uid: string) => uid ? `omnyid.workflow.new_result.${uid}` : "omnyid.workflow.new_result";
  const mkThreadKey = (uid: string) => uid ? `omnyid.thread.seen_count.${uid}` : "omnyid.thread.seen_count";
  const mkAdvKey   = (uid: string) => uid ? `omnyid.nav.advanced.${uid}` : "omnyid.nav.advanced";
  const _prefs = loadPrefs(initUserId);
  const [activeView, setActiveView] = createSignal<ViewName>(
    (_prefs.activeView as ViewName) ?? "search"
  );
  const [openThreadId, setOpenThreadId] = createSignal<string | null>(_prefs.openThreadId);
  const [navTrail, setNavTrail] = createSignal<ViewName[]>([(_prefs.activeView as ViewName) ?? "search"]);

  const [rightOpen, setRightOpen] = createSignal(false);
  const [fleetOpen, setFleetOpen] = createSignal(false);

  const [loraScore, setLoraScore] = createSignal(0);
  const [loraActive, setLoraActive] = createSignal(false);
  const [fleetActiveCount, setFleetActiveCount] = createSignal(0);
  const [fleetIdleCount, setFleetIdleCount] = createSignal(0);
  const [fleetActiveNames, setFleetActiveNames] = createSignal<string[]>([]);
  const [searchFocusTick, setSearchFocusTick] = createSignal(0);
  const [fleetLoaded, setFleetLoaded] = createSignal(false);
  const [workflowNewResult, setWorkflowNewResult] = createSignal(
    localStorage.getItem(mkWfKey(initUserId)) === "1"
  );
  const [threadBadge, setThreadBadge] = createSignal(0);
  let seenThreadCount = parseInt(localStorage.getItem(mkThreadKey(initUserId)) ?? "0", 10);

  // Browser AI
  const [browserAiLabel, setBrowserAiLabel] = createSignal<string | null>(null);

  // LLM config (for agent status line)
  const [llmConfig, setLlmConfig] = createSignal<LlmConfig | null>(null);

  // Agent settings focus: scroll to AI Model Config when opening from pill link
  const [agentSettingsFocusLlm, setAgentSettingsFocusLlm] = createSignal(false);

  // UI state
  const [advanced, setAdvanced] = createSignal(localStorage.getItem(mkAdvKey(initUserId)) === "1");

  // Onboarding / tour state
  const [showTour, setShowTour] = createSignal(shouldShowTour(initUserId));
  const [showOnboarding, setShowOnboarding] = createSignal(false);
  const [showProfilingConsent, setShowProfilingConsent] = createSignal(false);
  const [showEditProfile, setShowEditProfile] = createSignal(false);
  const [showAuthModal, setShowAuthModal] = createSignal(
    new URLSearchParams(window.location.search).get("open_auth") === "1"
  );
  const [authNotice, setAuthNotice] = createSignal<AuthModalFeedback | null>(null);

  // U-01: update-ready toast — shown when the service worker has a new version waiting.
  const [updateReady, setUpdateReady] = createSignal(false);
  let pendingUpdateSw: ServiceWorker | null = null;

  function applyUpdate() {
    pendingUpdateSw?.postMessage({ type: "SKIP_WAITING" });
    // Reload after a brief delay so the new SW can activate.
    setTimeout(() => window.location.reload(), 250);
  }

  function persistPrefs(view: ViewName, threadId: string | null) {
    savePrefs({ activeView: view, openThreadId: threadId }, userId());
  }

  // Track when active fleet drops to 0 — set "new result" badge until Workflows is opened
  let prevActiveCount = 0;
  createEffect(() => {
    const current = fleetActiveCount();
    if (prevActiveCount > 0 && current === 0) {
      localStorage.setItem(mkWfKey(userId()), "1");
      setWorkflowNewResult(true);
    }
    prevActiveCount = current;
  });

  function addToNavTrail(view: ViewName) {
    setNavTrail((prev) => {
      const existing = prev.lastIndexOf(view);
      if (existing >= 0) return [...prev.slice(0, existing), view];
      return [...prev.slice(-4), view];
    });
  }

  function selectView(view: ViewName) {
    if (view === "workflows") {
      localStorage.removeItem(mkWfKey(userId()));
      setWorkflowNewResult(false);
    }
    if (view === "threads") {
      setThreadBadge(0);
      const total = new Set((dashboard()?.messages ?? []).map((m) => m.thread_id)).size;
      seenThreadCount = total;
      localStorage.setItem(mkThreadKey(userId()), String(total));
    }
    // Reset breadcrumb to a single entry when returning to top-level views
    if (view === "home" || view === "search") {
      setNavTrail([view]);
    } else {
      addToNavTrail(view);
    }
    setActiveView(view);
    persistPrefs(view, openThreadId());
  }

  function openThread(threadId: string) {
    setOpenThreadId(threadId);
    selectView("threads"); // selectView calls persistPrefs with the current openThreadId — set ID first
  }

  const [dashboard, setDashboard] = createSignal<DashboardBootstrap | null>(null);
  const [searchBusy, setSearchBusy] = createSignal(false);
  const [searchFeedback, setSearchFeedback] = createSignal("");
  const [isSearchError, setIsSearchError] = createSignal(false);
  const [commandResult, setCommandResult] = createSignal<UiCommandResponse | null>(null);
  const [lastQuery, setLastQuery] = createSignal("");
  const [lastEngine, setLastEngine] = createSignal("auto");
  const [lastOptMode, setLastOptMode] = createSignal("balanced");
  const [queryChipDismissed, setQueryChipDismissed] = createSignal(false);
  const [runnerFiles, setRunnerFiles] = createSignal<RuntimeWorkspaceFileEntry[]>([]);
  const [activeFile, setActiveFile] = createSignal<RuntimeWorkspaceFileResponse | null>(null);
  const [editorValue, setEditorValue] = createSignal("");
  const [runnerFeedback, setRunnerFeedback] = createSignal(
    "Deploy a Python runner and load a file to edit code here."
  );
  const [runtimeLogs, setRuntimeLogs] = createSignal<string[]>([]);
  const [runtimeLogSource, setRuntimeLogSource] = createSignal("bootstrap");
  const [runtimeBusy, setRuntimeBusy] = createSignal(false);
  const [serverOffline, setServerOffline] = createSignal(false);
  const [retrying, setRetrying] = createSignal(false);
  let dashboardFetchSeq = 0;
  let runnerFilesFetchSeq = 0;
  let loraIntervalId: ReturnType<typeof setInterval> | null = null;
  let dashboardDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  function loadDashboard() {
    if (dashboardDebounceTimer !== null) clearTimeout(dashboardDebounceTimer);
    dashboardDebounceTimer = setTimeout(() => { dashboardDebounceTimer = null; void _loadDashboard(); }, 120);
  }

  async function _loadDashboard() {
    if (!session()?.token) { setDashboard(null); return; }
    const seq = ++dashboardFetchSeq;
    try {
      const payload = await apiFetch<DashboardBootstrap>("/dashboard/bootstrap");
      if (seq !== dashboardFetchSeq) return;
      // Decrypt AFP messages in-memory before rendering — plaintext never re-stored
      const { decryptMessages } = await loadDecryptModule();
      payload.messages = decryptMessages(payload.messages);
      setDashboard(payload);
      dispatchDecisionOsBootstrap(payload);
      const total = new Set(payload.messages.map((m) => m.thread_id)).size;
      if (activeView() === "threads") {
        // User is already reading threads — keep seenCount current so no badge fires on next load
        seenThreadCount = total;
        localStorage.setItem(mkThreadKey(userId()), String(total));
      } else if (total > seenThreadCount) {
        setThreadBadge(total - seenThreadCount);
      }
      const monitor = payload.runtime_deployment?.runtime_monitor;
      if (monitor) {
        setRuntimeLogs(monitor.lines ?? []);
        setRuntimeLogSource(monitor.source || "bootstrap");
        setRunnerFeedback(
          `Runtime ${payload.runtime_deployment?.status ?? monitor.status} via ${monitor.source || "bootstrap"} at ${monitor.updated_at}.`
        );
      }
    } catch (error) {
      if (seq !== dashboardFetchSeq) return;
      // Background load errors should not overwrite the search feedback slot
      console.warn("Dashboard load failed:", (error as Error).message);
    }
  }

  async function loadRunnerFiles() {
    if (!session()?.token) { setRunnerFiles([]); setActiveFile(null); setEditorValue(""); return; }
    const seq = ++runnerFilesFetchSeq;
    try {
      const payload = await apiFetch<{
        framework: string;
        active_file_id?: string | null;
        files: RuntimeWorkspaceFileEntry[];
      }>("/runtime/workspace-files");
      if (seq !== runnerFilesFetchSeq) return;
      setRunnerFiles(payload.files);
      const fileId = payload.active_file_id || payload.files[0]?.file_id;
      if (fileId) await selectFile(fileId);
    } catch (error) {
      if (seq !== runnerFilesFetchSeq) return;
      setRunnerFeedback((error as Error).message);
    }
  }

  async function deployPythonRunner() {
    if (!session()?.token) return;
    setRuntimeBusy(true);
    setRunnerFeedback("Deploying your private Python runner...");
    try {
      await apiFetch("/runtime/deploy", {
        method: "POST",
        bodyJson: { framework: "python-runner-chat" }
      });
      loadDashboard();
      await loadRunnerFiles();
      await loadRuntimeLogs();
      setRunnerFeedback("Python runner deployed. Logs and files are ready.");
      selectView("runner");
    } catch (error) {
      setRunnerFeedback((error as Error).message);
    } finally {
      setRuntimeBusy(false);
    }
  }

  async function handleRuntimeAction(action: "start" | "stop" | "restart") {
    if (!session()?.token) return;
    setRuntimeBusy(true);
    setRunnerFeedback(`Sending ${action} command to the isolated runner...`);
    try {
      await apiFetch("/runtime/action", {
        method: "POST",
        bodyJson: { action }
      });
      loadDashboard();
      await loadRuntimeLogs();
      setRunnerFeedback(`Runtime ${action} completed.`);
    } catch (error) {
      setRunnerFeedback((error as Error).message);
    } finally {
      setRuntimeBusy(false);
    }
  }

  async function refreshRunnerMonitor() {
    setRuntimeBusy(true);
    try {
      loadDashboard();
      await loadRuntimeLogs();
      setRunnerFeedback("Runtime monitor refreshed.");
    } catch (error) {
      setRunnerFeedback((error as Error).message);
    } finally {
      setRuntimeBusy(false);
    }
  }

  async function selectFile(fileId: string) {
    try {
      const payload = await apiFetch<RuntimeWorkspaceFileResponse>(
        `/runtime/workspace-file?file_id=${encodeURIComponent(fileId)}`
      );
      setActiveFile(payload);
      setEditorValue(payload.content);
      setRunnerFeedback(`Loaded ${payload.relative_path}.`);
    } catch (error) {
      setRunnerFeedback((error as Error).message);
    }
  }

  async function saveActiveFile() {
    const currentFile = activeFile();
    if (!currentFile) return;
    try {
      const payload = await apiFetch<RuntimeWorkspaceFileResponse>("/runtime/workspace-file", {
        method: "POST",
        bodyJson: { file_id: currentFile.file_id, content: editorValue() }
      });
      setActiveFile(payload);
      setEditorValue(payload.content);
      setRunnerFeedback(`Saved ${payload.relative_path} at ${payload.updated_at}.`);
    } catch (error) {
      setRunnerFeedback((error as Error).message);
    }
  }

  async function loadRuntimeLogs() {
    if (!session()?.token) { setRuntimeLogs([]); return; }
    try {
      const payload = await apiFetch<{ lines: string[]; source?: string }>("/runtime/logs");
      setRuntimeLogs(payload.lines ?? []);
      setRuntimeLogSource(payload.source || "runtime/logs");
    } catch (error) {
      setRuntimeLogs([`[error] Failed to load runtime logs: ${(error as Error).message}`]);
      setRuntimeLogSource("runtime/logs");
    }
  }

  function startLoraPolling() {
    if (loraIntervalId !== null) return;
    void loadLora();
    loraIntervalId = setInterval(() => { if (session()?.token) void loadLora(); }, 30_000);
  }

  async function bootstrap() {
    try {
      await apiFetch("/healthz");
      setServerOffline(false);
    } catch (e) {
      const msg = (e as Error)?.message ?? "";
      const isNetwork = !msg
        || msg.toLowerCase().includes("failed to fetch")
        || msg.toLowerCase().includes("networkerror")
        || msg.toLowerCase().includes("load failed");
      if (isNetwork) {
        setServerOffline(true);
        return;
      }
      // 4xx/5xx from /healthz still means the server is reachable — clear any prior offline state
      setServerOffline(false);
    }
    void loadDashboard();
    void loadRunnerFiles();
    void loadRuntimeLogs();
  }

  async function loadLora() {
    try {
      const fleet = await apiFetch<{
        instance?: { lora_confidence_score?: number; lora_genome_active?: boolean };
        active_count?: number;
        idle_count?: number;
        active_agents?: string[];
      }>("/agent/fleet");
      if (fleet.instance) {
        setLoraScore(fleet.instance.lora_confidence_score ?? 0);
        setLoraActive(fleet.instance.lora_genome_active ?? false);
      }
      setFleetActiveCount(fleet.active_count ?? 0);
      setFleetIdleCount(fleet.idle_count ?? 0);
      setFleetActiveNames(fleet.active_agents ?? []);
    } catch { /* ignore */ }
    setFleetLoaded(true);
  }

  async function handleSearch(query: string, engine: string, optimizationMode = "balanced") {
    setSearchBusy(true);
    setSearchFeedback("");
    setIsSearchError(false);
    setLastQuery(query);
    setLastEngine(engine);
    setLastOptMode(optimizationMode);
    setQueryChipDismissed(false);
    try {
      // Try browser AI classification as a hint for the server (used when no server LLM configured)
      let browserIntent: string | undefined;
      let browserParsed: Record<string, unknown> | undefined;
      if (browserAiLabel()) {
        const result = await classifyWithBrowserAi(query);
        if (result) {
          browserIntent = result.intent;
          browserParsed = result.parsed;
        }
      }
      const payload = await apiFetch<UiCommandResponse>("/ui/command", {
        method: "POST",
        bodyJson: { query, engine, active_file_id: activeFile()?.file_id, browser_intent: browserIntent, browser_parsed: browserParsed, optimization_mode: optimizationMode }
      });
      setCommandResult(payload);
      // Reload dashboard to pick up any new AFP messages the agent created
      void loadDashboard();
      const suggested = payload.suggested_view as ViewName | undefined;
      if (suggested && !NAV_BLOCKLIST.has(suggested)) {
        selectView(suggested);
      } else if (!suggested) {
        selectView("search");
      }
    } catch (error) {
      setSearchFeedback((error as Error).message);
      setIsSearchError(true);
    } finally {
      setSearchBusy(false);
    }
  }

  function applyCommandDraft() {
    const draft = commandResult()?.runner_draft;
    if (!draft) return;
    if (activeFile()?.file_id !== draft.target_file_id) {
      void selectFile(draft.target_file_id).then(() => {
        setEditorValue((current) => `${current}${draft.content}`);
      });
    } else {
      setEditorValue((current) => `${current}${draft.content}`);
    }
    setRunnerFeedback("Command-bar draft inserted into the editor. Review and save when ready.");
    setCommandResult(null);
    selectView("runner");
  }

  const runtimeDeployment = createMemo(() => dashboard()?.runtime_deployment ?? null);
  const userId = createMemo(() => dashboard()?.user.id ?? session()?.user?.id ?? "");

  // Clear search state only when transitioning *away from* "search" — not on initial mount
  let prevView: ViewName | null = null;
  createEffect(() => {
    const view = activeView();
    if (prevView === "search" && view !== "search") {
      setCommandResult(null);
      setSearchFeedback("");
      setIsSearchError(false);
    }
    prevView = view;
  });

  const commandPreviewMessage = createMemo(() => {
    const result = commandResult();
    if (!result) return null;
    if (result.preview_message) return result.preview_message;
    return commandResponseToPreviewMessage(result, lastQuery());
  });

  onMount(async () => {
    // U-01: listen for service worker update-ready events fired by main.tsx
    function onSwUpdate(e: Event) {
      const detail = (e as CustomEvent<{ sw: ServiceWorker }>).detail;
      // CGAP-014: suppress toast when the search pipeline or any agent in the fleet
      // is actively running — a reload mid-run would lose orchestration context.
      if (searchBusy() || fleetActiveCount() > 0) return;
      pendingUpdateSw = detail.sw;
      setUpdateReady(true);
    }
    window.addEventListener("omnyid:update-ready", onSwUpdate);
    onCleanup(() => window.removeEventListener("omnyid:update-ready", onSwUpdate));

    // Initialize E2EE: fetch encryption key and set up client-side decryption
    if (session()?.token) {
      try {
        const keys = await fetchEncKey();
        const { initDecrypt } = await loadDecryptModule();
        await initDecrypt(keys.enc_key_hex);
      } catch { /* no key configured — messages shown in ciphertext-aware mode */ }

      // Check if onboarding wizard is needed (authenticated only, after tour)
      if (localStorage.getItem("omnyid.onboarding.done") !== "true") {
        setShowOnboarding(true);
      }
    }

    // Load LLM config for agent status line
    if (session()?.token) {
      fetchLlmConfig().then(setLlmConfig).catch(() => {});
    }

    // Auto-expand sidebar on first authenticated session — scoped per user so each user sees it once
    const sidebarSeenKey = initUserId ? `omnyid.sidebar.seen.${initUserId}` : "omnyid.sidebar.seen";
    if (session()?.token && !localStorage.getItem(sidebarSeenKey)) {
      setRightOpen(true);
      localStorage.setItem(sidebarSeenKey, "1");
    }

    // Show profiling consent on first session
    if (!hasConsentBeenAsked()) {
      setShowProfilingConsent(true);
    }

    const currentUrl = new URL(window.location.href);
    if (currentUrl.pathname === "/verify-email") {
      const token = currentUrl.searchParams.get("token");
      setShowAuthModal(true);
      void (async () => {
        if (!token) {
          setAuthNotice({
            tone: "error",
            text: "Verification link is incomplete. Request a fresh verification email and try again.",
          });
          window.history.replaceState({}, "", "/?open_auth=1");
          return;
        }
        try {
          const response = await fetch(`${API_BASE}/auth/verify-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
          });
          if (!response.ok) {
            const text = await response.text();
            throw new Error(text || response.statusText);
          }
          setAuthNotice({
            tone: "success",
            text: "Email verified. You can sign in now.",
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Verification failed.";
          setAuthNotice({
            tone: "error",
            text: message || "Verification failed.",
          });
        } finally {
          window.history.replaceState({}, "", "/?open_auth=1");
        }
      })();
    }

    // Detect browser-native AI (Gemini Nano on Chrome, Phi on Edge)
    const label = getBrowserAiLabel();
    if (label) {
      checkBrowserAiAvailable().then((ok) => { if (ok) setBrowserAiLabel(label); });
    }

    // Keyboard shortcuts: Ctrl/Cmd+1–7 for nav items
    const SHORTCUT_VIEWS: ViewName[] = ["search", "threads", "workflows", "email", "note", "calendar", "database", "templates"];
    function onGlobalKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "k") {
        e.preventDefault();
        selectView("search");
        setSearchFocusTick((n) => n + 1);
        return;
      }
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < SHORTCUT_VIEWS.length) {
        e.preventDefault();
        selectView(SHORTCUT_VIEWS[idx]);
      }
    }
    document.addEventListener("keydown", onGlobalKeyDown);
    function onNavigate(event: Event) {
      const custom = event as CustomEvent<{
        view?: string;
        threadId?: string | null;
        messageId?: string | null;
      }>;
      const view = custom.detail?.view;
      if (!view) return;
      if (view === "threads" && custom.detail?.messageId) {
        const threadId = dashboard()?.messages.find((message) => message.id === custom.detail?.messageId)?.thread_id;
        if (threadId) {
          openThread(threadId);
          return;
        }
      }
      if (view === "threads" && custom.detail?.threadId) {
        openThread(custom.detail.threadId);
        return;
      }
      selectView(view as ViewName);
    }
    window.addEventListener("omnyid:navigate", onNavigate as EventListener);

    function onSessionChanged(e: Event) {
      const detail = (e as CustomEvent<Session | null>).detail;
      setSession(detail);
      if (!detail) setShowAuthModal(true);
    }
    window.addEventListener(SESSION_CHANGED_EVENT, onSessionChanged);

    onCleanup(() => {
      document.removeEventListener("keydown", onGlobalKeyDown);
      window.removeEventListener("omnyid:navigate", onNavigate as EventListener);
      window.removeEventListener(SESSION_CHANGED_EVENT, onSessionChanged);
    });

    void bootstrap();
    if (session()?.token) {
      startLoraPolling();
      onCleanup(() => { if (loraIntervalId) { clearInterval(loraIntervalId); loraIntervalId = null; } });
    }
    if (session()?.token) {
      void import("@/lib/sync").then(({ initSync }) =>
        initSync(
          API_BASE,
          session()?.token ?? null
        )
      );
    }
  });


  return (
    <main class="min-h-screen p-4 md:p-6 text-on-surface">
      <Show when={showAuthModal()}>
        <AuthModal
          onClose={() => { setShowAuthModal(false); setAuthNotice(null); }}
          notice={authNotice()}
          onClearNotice={() => setAuthNotice(null)}
          onLogin={() => {
            setShowAuthModal(false);
            setAuthNotice(null);
            setServerOffline(false);
            const loginUserId = readSession()?.user?.id ?? "";
            if (loginUserId && shouldShowTour(loginUserId)) setShowTour(true);
            void loadDashboard();
            void loadRunnerFiles();
            void loadRuntimeLogs();
            startLoraPolling();
            void import("@/lib/sync").then(({ initSync }) =>
              initSync(
                API_BASE,
                session()?.token ?? null
              )
            );
          }}
        />
      </Show>
      <Show when={showEditProfile()}>
        <EditProfileModal onClose={() => setShowEditProfile(false)} />
      </Show>

      {/* U-01: Update-ready toast — hidden while fleet is active (CGAP-014) */}
      <Show when={updateReady() && !searchBusy() && fleetActiveCount() === 0}>
        <div class="fixed bottom-5 right-5 z-[9999] flex items-center gap-3 rounded-2xl border border-primary/20 bg-white/90 shadow-lg backdrop-blur-md px-4 py-3 text-sm animate-fade-in">
          <span class="text-on-surface font-medium">Update available</span>
          <button
            type="button"
            onClick={applyUpdate}
            class="rounded-lg bg-primary px-3 py-1 text-[12px] font-semibold text-white transition hover:bg-primary/80"
          >
            Update Now
          </button>
          <button
            type="button"
            onClick={() => setUpdateReady(false)}
            class="text-on-surface-variant/50 hover:text-on-surface-variant transition text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </Show>

      {/* Guided tour — first-time visitors */}
      <Show when={showTour()}>
        <GuidedTour userId={userId()} onComplete={() => {
          setShowTour(false);
          // If authenticated and not onboarded, let onboarding wizard show next
        }} />
      </Show>

      {/* Onboarding wizard — authenticated users, after tour */}
      <Show when={!showTour() && showOnboarding() && Boolean(session()?.token)}>
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      </Show>

      {/* Profiling consent — shown once, after tour and onboarding */}
      <Show when={!showTour() && !showOnboarding() && showProfilingConsent()}>
        <ProfilingConsentModal onDismiss={() => setShowProfilingConsent(false)} />
      </Show>

      {/* Homeserver offline banner */}
      <Show when={serverOffline()}>
        <div class="mx-auto mb-4 max-w-[1700px] flex items-center justify-between gap-4 rounded-2xl border border-red-200/50 bg-red-50/60 px-5 py-3 text-sm text-on-surface-variant backdrop-blur-sm animate-fade-in">
          <span>
            <strong class="text-on-surface">Homeserver offline</strong> — cannot reach the OmnyID backend.
            Start it with <code class="font-mono text-xs">docker compose up</code> or <code class="font-mono text-xs">dev.ps1</code>.
          </span>
          <button
            type="button"
            disabled={retrying()}
            onClick={async () => { setRetrying(true); try { await bootstrap(); } finally { setRetrying(false); } }}
            class="glass-button btn-shimmer rounded-xl px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {retrying() ? "Checking…" : "Retry →"}
          </button>
        </div>
      </Show>

      {/* Guest mode banner */}
      <Show when={!session()?.token}>
        <div class="mx-auto mb-4 max-w-[1700px] flex items-center justify-between gap-4 rounded-2xl border border-amber-200/50 bg-amber-50/60 px-5 py-3 text-sm text-on-surface-variant backdrop-blur-sm animate-fade-in">
          <span>
            You're in <strong class="text-on-surface">guest mode</strong> — most actions require a signed-in account.
          </span>
          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            class="glass-button btn-shimmer rounded-xl px-4 py-2 text-sm font-medium text-white shadow-sm"
          >
            Sign in →
          </button>
        </div>
      </Show>

      {/* NavBar is outside GlassPanel so its fixed children are positioned relative to the viewport,
          not the backdrop-filter stacking context of GlassPanel */}
      <NavBar
        activeView={activeView()}
        onSelect={selectView}
        signedIn={Boolean(session()?.token)}
        advanced={advanced()}
        onToggleAdvanced={() => { const next = !advanced(); setAdvanced(next); localStorage.setItem(mkAdvKey(userId()), next ? "1" : "0"); }}
        activeCount={fleetActiveCount()}
        idleCount={fleetIdleCount()}
        activeAgentNames={fleetActiveNames()}
        onFleetClick={() => setFleetOpen((v) => !v)}
        workflowBadge={fleetActiveCount() > 0 ? fleetActiveCount() : undefined}
        workflowNewResult={workflowNewResult()}
        fleetLoaded={fleetLoaded()}
        threadBadge={threadBadge() > 0 ? threadBadge() : undefined}
        ctrlKPulse={searchFocusTick()}
        onSignIn={() => setShowAuthModal(true)}
        onEditProfile={() => setShowEditProfile(true)}
        userId={userId()}
      />

      <GlassPanel class="mx-auto max-w-[1700px] p-5 pl-[76px] lg:p-8 lg:pl-[80px]">

        {/* Fleet pane — slides in below nav when user clicks active/idle badge */}
        <Show when={fleetOpen()}>
          <div class="mt-4 glass-surface animate-slide-down rounded-[20px] border border-white/50 p-5 shadow-panel overflow-auto max-h-[70vh]">
            <AgentFleetView onClose={() => setFleetOpen(false)} onNavigate={(v) => { setFleetOpen(false); selectView(v as import("@/components/NavBar").ViewName); }} />
          </div>
        </Show>

        {/* Chat bar — always visible */}
        <div class="mt-7">
          {/* Breadcrumb trail — shows navigation path, clickable to jump back */}
          <Show when={navTrail().length > 1}>
            <div class="mb-2.5 flex items-center gap-0.5 text-xs text-on-surface-variant/60 animate-fade-in">
              <For each={navTrail()}>
                {(view, idx) => (
                  <span class="flex items-center gap-0.5">
                    <Show when={idx() > 0}>
                      <span class="px-0.5 text-outline/30 select-none">›</span>
                    </Show>
                    <Show when={idx() < navTrail().length - 1} fallback={
                      <span class="rounded px-1.5 py-0.5 font-medium text-on-surface/70">
                        {VIEW_LABELS[view] ?? view}
                      </span>
                    }>
                      <button
                        type="button"
                        onClick={() => selectView(view)}
                        class="rounded px-1.5 py-0.5 transition hover:bg-on-surface/5 hover:text-on-surface"
                      >
                        {VIEW_LABELS[view] ?? view}
                      </button>
                    </Show>
                  </span>
                )}
              </For>
            </div>
          </Show>
          <div data-search-host>
            <SearchBar onSubmit={handleSearch} busy={searchBusy()} focusTrigger={searchFocusTick()} userId={userId()} />
          </div>
          <div class="mt-2.5 flex flex-wrap items-center justify-center gap-3">
            <Show when={searchFeedback()}>
              <p
                class={`text-center text-sm leading-7 ${isSearchError() ? "text-error" : "text-on-surface-variant"}`}
                role={isSearchError() ? "alert" : undefined}
              >
                {searchFeedback()}
              </p>
            </Show>
            <AgentStatusPill
              llmConfig={llmConfig()}
              browserAiLabel={browserAiLabel()}
              signedIn={Boolean(session()?.token)}
              onSettingsClick={() => { selectView("agent_settings"); setAgentSettingsFocusLlm(true); }}
              onSignIn={() => setShowAuthModal(true)}
            />
            {/* Approval-gate notice — surfaces when orchestration is waiting for a decision */}
            <Show when={commandResult()?.intent === "orchestrate"}>
              <span class="flex items-center gap-2 rounded-full border border-amber-300/60 bg-amber-50/80 px-3 py-1 text-xs font-medium text-amber-700 animate-pulse">
                <span class="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                Approval may be required — review the card below
              </span>
            </Show>
          </div>

          {/* Last-search context chip — re-run or dismiss */}
          <Show when={lastQuery() && !searchBusy() && !queryChipDismissed()}>
            <div class="mt-2.5 flex items-center justify-center animate-fade-in">
              <div class="flex items-center gap-1.5 rounded-full border border-white/40 bg-white/30 py-1 pl-3 pr-1.5 text-xs text-on-surface-variant">
                <span class="text-on-surface-variant/60">Last:</span>
                <span class="max-w-[200px] truncate font-medium text-on-surface">"{lastQuery()}"</span>
                <button
                  type="button"
                  disabled={searchBusy()}
                  onClick={() => void handleSearch(lastQuery(), lastEngine(), lastOptMode())}
                  class="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary transition hover:bg-primary/20 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ↺ Re-run
                </button>
                <button
                  type="button"
                  aria-label="Dismiss"
                  onClick={() => setQueryChipDismissed(true)}
                  class="rounded-full p-0.5 text-on-surface-variant/40 transition hover:text-on-surface-variant"
                >
                  ×
                </button>
              </div>
            </div>
          </Show>

          {/* Setup checklist — visible until LLM is configured */}
          <Show when={Boolean(session()?.token) && !llmConfig()}>
            <div class="mt-3 flex items-center gap-3 rounded-2xl border border-amber-200/60 bg-amber-50/70 px-4 py-2.5 animate-fade-in">
              <span class="flex-shrink-0 text-amber-500">⚙</span>
              <div class="flex-1 min-w-0">
                <p class="text-xs font-semibold text-amber-800">Quick setup</p>
                <div class="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5">
                  <span class="text-[11px] text-green-700 flex items-center gap-1">
                    <span>✓</span> Signed in
                  </span>
                  <a
                    role="button"
                    class="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
                    onClick={() => { selectView("agent_settings"); setAgentSettingsFocusLlm(true); }}
                  >
                    <span class="text-amber-500">○</span> Connect AI model →
                  </a>
                </div>
              </div>
              <span class="text-[10px] text-amber-600/70 flex-shrink-0">Step 1 of 2</span>
            </div>
          </Show>
        </div>

        {/* Main content area */}
        <div class="mt-5" style="min-height: 620px">
          <div class="min-w-0 overflow-hidden">

            {/* Home — bento workspace grid */}
            <Show when={activeView() === "home"}>
              <div class="space-y-4">
                <HomeQueuesSection bootstrap={dashboard()} />

                <div class="view-enter">
                <BentoGrid
                  bootstrap={dashboard()}
                  onOpenView={(view) => selectView(view)}
                />
                </div>
              </div>
            </Show>

            {/* Chat / search view */}
            <Show when={activeView() === "search"}>
              <div class="view-enter space-y-5">
                {/* Search result card — shown when a command has been run */}
                <Show when={commandPreviewMessage()}>
                  {(preview) => (
                    <div class="space-y-3">
                      <ViewDispatcher
                        message={preview()}
                        onViewWorkflow={() => selectView("workflows")}
                      />
                      <Show when={advanced()}>
                        <AlternateViewsInspector message={preview()} compact />
                      </Show>
                      {/* Canvas switch pill — shown for orchestrate/workflow intents */}
                      <Show when={
                        commandResult()?.intent === "orchestrate" ||
                        commandResult()?.intent === "trip_planner"
                      }>
                        <div class="flex justify-end">
                          <button
                            type="button"
                            class="animate-fade-in rounded-full border border-outline-variant/40 bg-white/50 px-4 py-1.5 text-xs font-medium text-on-surface-variant transition hover:border-primary/40 hover:text-primary"
                            onClick={() => selectView("workflows")}
                          >
                            View workflow on canvas →
                          </button>
                        </div>
                      </Show>
                    </div>
                  )}
                </Show>
                <DashboardFeed
                  bootstrap={dashboard()}
                  commandSummary={commandResult() ? undefined : undefined}
                  advanced={advanced()}
                  onOpenThread={openThread}
                  onNavigate={(view, _hint) => selectView(view as import("@/components/NavBar").ViewName)}
                />
              </div>
            </Show>

            {/* Threads view */}
              <Show when={activeView() === "threads"}>
                <div class="view-enter">
                  <Show
                    when={openThreadId()}
                    fallback={
                      <ThreadListFallback
                        messages={dashboard()?.messages ?? []}
                        onOpen={openThread}
                      />
                    }
                  >
                    <ThreadView
                      threadId={openThreadId()!}
                      advanced={advanced()}
                      onBack={() => { setOpenThreadId(null); persistPrefs("threads", null); }}
                    />
                  </Show>
                </div>
              </Show>

              <Show when={activeView() === "workflows"}>
                <div class="view-enter"><WorkflowsView /></div>
              </Show>

              <Show when={activeView() === "cofounder_studio"}>
                <div class="view-enter">
                  <CofounderStudioView onNavigateBack={() => selectView("templates")} />
                </div>
              </Show>

              {/* Templates view */}
              <Show when={activeView() === "templates"}>
                <div class="view-enter">
                  <TemplatesView onLaunch={(view) => selectView(view)} />
                </div>
              </Show>

              {/* Email view */}
              <Show when={activeView() === "email"}>
                <div class="view-enter">
                  <EmailView bootstrap={dashboard()} signedIn={Boolean(session()?.token)} />
                </div>
              </Show>

            {/* Note view — notes feed + Knowledge Graph section */}
            <Show when={activeView() === "note"}>
              <div class="view-enter flex flex-col gap-6">
                <DashboardFeed
                  bootstrap={(() => {
                    const d = dashboard();
                    if (!d) return null;
                    return { ...d, messages: d.messages.filter((m) => m.type.includes("note")) };
                  })()}
                  onOpenThread={openThread}
                />
                <div class="rounded-3xl border border-white/50 bg-white/35 p-5 backdrop-blur shadow-card">
                  <KnowledgeGraphView messages={dashboard()?.messages ?? []} />
                </div>
              </div>
            </Show>

            {/* Calendar view — monthly interactive calendar */}
            <Show when={activeView() === "calendar"}>
              <div class="view-enter"><MonthlyCalendarView /></div>
            </Show>

            {/* Database view — structured grid per DATABASE_VIEW_DETAILED_DESIGN.md */}
            <Show when={activeView() === "database"}>
              <div class="view-enter">
                <DatabaseView bootstrap={dashboard()} />
              </div>
            </Show>

            {/* Tasks view — pending AFP task messages not yet due */}
            <Show when={activeView() === "tasks"}>
              <div class="view-enter">
                <TasksView bootstrap={dashboard()} onAddTask={() => selectView("calendar")} />
              </div>
            </Show>

            {/* Decision Queue view — continuity-backed approvals and actions */}
            <Show when={activeView() === "decision_queue"}>
              <div class="view-enter">
                <DecisionQueueView bootstrap={dashboard()} />
              </div>
            </Show>

            {/* Response Queue view — dedicated conversational follow-up surface */}
            <Show when={activeView() === "response_queue"}>
              <div class="view-enter">
                <ResponseQueueView bootstrap={dashboard()} />
              </div>
            </Show>

            {/* Cost Dashboard — cost oracle budgeting, tracking, and analysis */}
            <Show when={activeView() === "cost_dashboard" && !session()?.token}>
              <GuestGate label="Cost Dashboard" onSignIn={() => setShowAuthModal(true)} />
            </Show>
            <Show when={activeView() === "cost_dashboard" && Boolean(session()?.token)}>
              <div class="view-enter">
                <CostDashboardView initialSnapshot={dashboard()?.cost_snapshot ?? null} />
              </div>
            </Show>

            {/* Tools view — MCP tools and skill capsules */}
            <Show when={activeView() === "tools"}>
              <div class="view-enter"><ToolsView signedIn={Boolean(session()?.token)} /></div>
            </Show>

            {/* Runner view — advanced only, signed-in only */}
            <Show when={activeView() === "runner" && !session()?.token}>
              <GuestGate label="Python Runner" onSignIn={() => setShowAuthModal(true)} />
            </Show>
            <Show when={activeView() === "runner" && Boolean(session()?.token) && advanced()}>
              <PythonRunnerView
                files={runnerFiles()}
                activeFile={activeFile()}
                editorValue={editorValue()}
                logs={runtimeLogs()}
                logSource={runtimeLogSource()}
                feedback={runnerFeedback()}
                runtimeStatus={runtimeDeployment()?.status ?? "not_deployed"}
                runtimeFramework={runtimeDeployment()?.framework ?? null}
                advanced={advanced()}
                runtimeStatusPanel={runtimeDeployment()?.runtime_status_panel ?? null}
                runtimeStatusViews={runtimeDeployment()?.runtime_status_views ?? null}
                runtimeUpdatesPanel={dashboard()?.runtime_updates?.panel ?? null}
                runtimeBusy={runtimeBusy()}
                hasRuntime={Boolean(runtimeDeployment())}
                commandDraft={commandResult()}
                signedIn={Boolean(session()?.token)}
                onSelectFile={(fileId) => void selectFile(fileId)}
                onEditorChange={setEditorValue}
                onSave={() => void saveActiveFile()}
                onApplyDraft={applyCommandDraft}
                onDeploy={() => void deployPythonRunner()}
                onRefreshLogs={() => void refreshRunnerMonitor()}
                onRuntimeAction={(action) => void handleRuntimeAction(action)}
              />
            </Show>
            <Show when={activeView() === "runner" && Boolean(session()?.token) && !advanced()}>
              <div class="view-enter glass-surface rounded-3xl border border-white/50 p-10 text-center shadow-card">
                <p class="text-sm text-on-surface-variant">Enable <strong class="text-on-surface">Advanced ▾</strong> in the top nav to access the Python runner.</p>
              </div>
            </Show>

            {/* Agent Settings view */}
            <Show when={activeView() === "agent_settings" && !session()?.token}>
              <GuestGate label="Agent Settings" onSignIn={() => setShowAuthModal(true)} />
            </Show>
            <Show when={activeView() === "agent_settings" && Boolean(session()?.token)}>
              <div class="view-enter">
                <AgentSettingsView
                  browserAiLabel={browserAiLabel()}
                  focusLlm={agentSettingsFocusLlm()}
                  onFocusDone={() => setAgentSettingsFocusLlm(false)}
                  onViewWorkflows={() => selectView("workflows")}
                />
              </div>
            </Show>

            {/* Diary view */}
            <Show when={activeView() === "diary"}>
              <div class="view-enter"><DiaryView /></div>
            </Show>

            {/* Discover view */}
            <Show when={activeView() === "discover"}>
              <div class="view-enter"><DiscoverView /></div>
            </Show>

            {/* Pulse Feed view */}
            <Show when={activeView() === "pulse"}>
              <div class="view-enter h-full"><PulseFeed /></div>
            </Show>

            {/* Contacts view */}
            <Show when={activeView() === "contacts"}>
              <div class="view-enter"><ContactsView /></div>
            </Show>

            {/* Connected Apps view */}
            <Show when={activeView() === "connected_apps"}>
              <div class="view-enter"><ConnectedAppsView /></div>
            </Show>

            {/* Space Feed view */}
            <Show when={activeView() === "space_feed"}>
              <div class="view-enter"><SpacesView /></div>
            </Show>

            {/* Public Feed view */}
            <Show when={activeView() === "public_feed"}>
              <div class="view-enter"><PublicFeedView isAnon={!session()?.token} /></div>
            </Show>

            {/* Knowledge Graph — standalone full view */}
            <Show when={activeView() === "knowledge_graph"}>
              <div class="view-enter">
                <div class="rounded-3xl border border-white/50 bg-white/35 p-5 backdrop-blur shadow-card">
                  <KnowledgeGraphView messages={dashboard()?.messages ?? []} />
                </div>
              </div>
            </Show>

            {/* Sovereignty Audit — data ownership metrics */}
            <Show when={activeView() === "sovereignty_audit"}>
              <div class="view-enter">
                <SovereigntyAuditView messages={dashboard()?.messages ?? []} signedIn={Boolean(session()?.token)} />
              </div>
            </Show>
          </div>
        </div>
      </GlassPanel>

      {/* Floating agent persona FAB */}
      <AgentPersonaFAB
        activeCount={fleetActiveCount()}
        justCompleted={workflowNewResult()}
        onOpenSettings={() => selectView("agent_settings")}
        loraScore={loraScore()}
        loraActive={loraActive()}
        urgentPending={(() => {
          const msgs = dashboard()?.messages ?? [];
          return msgs.filter((m) => {
            if (m.type === "decision_request") return true;
            if (m.type === "agent" && (m.subtype === "approval_request" || m.subtype === "orchestration_card")) return true;
            if (m.type === "watcher_alert") {
              const c = m.content as Record<string, unknown>;
              return c.severity === "urgent" || c.urgency === "high";
            }
            return false;
          }).length;
        })()}
      />

      {/* View customizer — floating + for image background and custom A2UI cards (non-home views only) */}
      <Show when={activeView() !== "home"}>
        <ViewCustomizer viewId={activeView()} />
      </Show>

      {/* Floating format bar — appears when a contenteditable is focused */}
      <FloatingFormatBar />

      {/* AFP Metadata Inspector — fires on afp:inspect custom event */}
      <AfpInspector />

      {/* Global toast notifications */}
      <ToastContainer />
    </main>
  );
}

function TasksView(props: { bootstrap: DashboardBootstrap | null; onAddTask: () => void }) {
  const now = new Date();
  const pending = createMemo(() =>
    (props.bootstrap?.messages ?? [])
      .filter((m) => {
        const c = m.content as Record<string, unknown>;
        if (m.type !== "task" && c?.kind !== "task") return false;
        if (c?.status === "completed" || c?.completed === true) return false;
        const due = c?.due_date as string | undefined;
        if (due) return new Date(due) >= now;
        return true;
      })
      .sort((a, b) => {
        const da = ((a.content as Record<string, unknown>)?.due_date as string | undefined);
        const db2 = ((b.content as Record<string, unknown>)?.due_date as string | undefined);
        return (da ?? "9999") < (db2 ?? "9999") ? -1 : 1;
      })
  );
  const overdue = createMemo(() =>
    (props.bootstrap?.messages ?? []).filter((m) => {
      const c = m.content as Record<string, unknown>;
      if (m.type !== "task" && c?.kind !== "task") return false;
      if (c?.status === "completed") return false;
      const due = c?.due_date as string | undefined;
      return due ? new Date(due) < now : false;
    })
  );

  return (
    <div class="animate-fade-in space-y-5">
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-outline">Tasks</p>
          <h2 class="mt-1 text-xl font-bold text-on-surface">Active To-Dos</h2>
          <p class="mt-0.5 text-sm text-on-surface-variant">AFP task messages not yet completed or overdue.</p>
        </div>
        <button type="button" onClick={props.onAddTask}
          class="mt-2 flex-shrink-0 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/80">
          + Add Task
        </button>
      </div>

      <Show when={overdue().length > 0}>
        <div class="rounded-2xl border border-red-200/60 bg-red-50/60 p-4 space-y-2">
          <p class="font-mono text-[9px] uppercase tracking-wider text-red-500">Overdue</p>
          <For each={overdue()}>
            {(m) => {
              const c = m.content as Record<string, unknown>;
              return (
                <div class="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-xs">
                  <span class="h-2 w-2 rounded-full bg-red-400 flex-shrink-0" />
                  <span class="flex-1 font-medium text-on-surface">{String(c.title ?? "Task")}</span>
                  <span class="text-red-400 text-[10px]">
                    {c.due_date ? new Date(String(c.due_date)).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : ""}
                  </span>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      <Show when={pending().length > 0} fallback={
        <div class="rounded-2xl border border-white/40 bg-white/30 p-10 text-center">
          <p class="text-3xl mb-2">✓</p>
          <p class="text-sm font-medium text-on-surface">All caught up</p>
          <p class="mt-1 text-xs text-on-surface-variant/60">No pending tasks. Add one via calendar or the + button above.</p>
        </div>
      }>
        <div class="space-y-2">
          <For each={pending()}>
            {(m) => {
              const c = m.content as Record<string, unknown>;
              const due = c?.due_date as string | undefined;
              return (
                <div class="flex items-start gap-3 rounded-2xl border border-white/50 bg-white/40 px-4 py-3 shadow-card">
                  <span class="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded border-2 border-primary/40" />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-on-surface">{String(c?.title ?? "Task")}</p>
                    <Show when={c?.description}>
                      <p class="text-xs text-on-surface-variant mt-0.5 line-clamp-1">{String(c?.description)}</p>
                    </Show>
                  </div>
                  <Show when={due}>
                    <span class="flex-shrink-0 rounded-full border border-primary/20 bg-primary/8 px-2 py-0.5 text-[10px] text-primary">
                      {new Date(due!).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}

function SovereigntyAuditView(props: { messages: AfpMessage[]; signedIn: boolean }) {
  const encryptedCount = () => props.messages.filter((m) => m.encryption !== null).length;
  const totalCount = () => props.messages.length;
  const e2eePercent = () => totalCount() > 0 ? Math.round((encryptedCount() / totalCount()) * 100) : 0;
  const typeBreakdown = () => {
    const counts: Record<string, number> = {};
    for (const m of props.messages) counts[m.type] = (counts[m.type] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  };

  return (
    <div class="space-y-5 animate-fade-in">
      <div>
        <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-outline">Data Sovereignty</p>
        <h2 class="mt-1 text-xl font-bold text-on-surface">Your data, your control</h2>
        <p class="mt-0.5 text-sm text-on-surface-variant">E2EE status and ownership metrics for your AFP message log.</p>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total messages", value: totalCount(), color: "text-on-surface" },
          { label: "E2EE encrypted", value: encryptedCount(), color: "text-emerald-600" },
          { label: "Plaintext", value: totalCount() - encryptedCount(), color: "text-amber-600" },
          { label: "E2EE coverage", value: `${e2eePercent()}%`, color: e2eePercent() >= 80 ? "text-emerald-600" : "text-amber-600" },
        ].map((stat) => (
          <div class="rounded-2xl border border-white/50 bg-white/40 p-4 backdrop-blur shadow-card">
            <p class="text-xs text-on-surface-variant">{stat.label}</p>
            <p class={`mt-1 text-2xl font-bold ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div class="rounded-2xl border border-white/50 bg-white/40 p-4 backdrop-blur shadow-card">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Message types</p>
        <div class="space-y-2">
          {typeBreakdown().map(([type, count]) => (
            <div class="flex items-center gap-3">
              <span class="w-28 truncate font-mono text-[10px] text-on-surface-variant">{type}</span>
              <div class="flex-1 h-1.5 rounded-full bg-on-surface/8">
                <div
                  class="h-1.5 rounded-full bg-primary/60 transition-all"
                  style={{ width: `${Math.round((count / (totalCount() || 1)) * 100)}%` }}
                />
              </div>
              <span class="w-6 text-right font-mono text-[10px] text-on-surface-variant">{count}</span>
            </div>
          ))}
          {typeBreakdown().length === 0 && (
            <p class="text-sm text-on-surface-variant/50">No messages yet.</p>
          )}
        </div>
      </div>

      <div class="rounded-2xl border border-white/50 bg-white/40 p-4 backdrop-blur shadow-card text-sm space-y-2">
        <p class="font-semibold text-on-surface">Storage guarantees</p>
        <ul class="space-y-1 text-on-surface-variant text-xs list-none">
          <li class="flex items-center gap-2"><span class="text-emerald-500">✓</span> All AFP messages stored on your self-hosted homeserver</li>
          <li class="flex items-center gap-2"><span class="text-emerald-500">✓</span> E2EE messages encrypted before leaving your device</li>
          <li class="flex items-center gap-2"><span class="text-emerald-500">✓</span> No vendor lock-in — export your data at any time</li>
          <li class="flex items-center gap-2">
            <span class={props.signedIn ? "text-emerald-500" : "text-amber-400"}>{props.signedIn ? "✓" : "○"}</span>
            {props.signedIn ? "Signed in to your homeserver" : "Guest mode — sign in for full ownership"}
          </li>
        </ul>
      </div>
    </div>
  );
}

function GuestGate(props: { label: string; onSignIn: () => void }) {
  return (
    <div class="view-enter glass-surface rounded-3xl border border-white/50 p-10 text-center shadow-card animate-fade-in">
      <p class="text-base font-semibold text-on-surface">{props.label} requires a signed-in account</p>
      <p class="mt-2 text-sm text-on-surface-variant">
        Create a free OmnyID account to access this feature. Your data stays on your homeserver.
      </p>
      <button
        type="button"
        onClick={props.onSignIn}
        class="mt-5 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/80"
      >
        Sign in →
      </button>
    </div>
  );
}

function AgentStatusPill(props: {
  llmConfig: LlmConfig | null;
  browserAiLabel: string | null;
  signedIn: boolean;
  onSettingsClick?: () => void;
  onSignIn?: () => void;
}) {
  const label = () => {
    const cfg = props.llmConfig;
    if (cfg) {
      const backendLabel: Record<string, string> = {
        byok: "BYOK",
        ollama: "Ollama",
        runpod: "RunPod",
        hosted: "Hosted",
      };
      const be = backendLabel[cfg.backend] ?? cfg.backend;
      return `Agent · ${cfg.model} via ${be}`;
    }
    if (props.browserAiLabel) return `Agent · ${props.browserAiLabel}`;
    return null;
  };
  return (
    <Show when={label()} fallback={
      <span class="rounded-full border border-red-300/60 bg-red-50/80 px-3 py-1 font-mono text-[11px] font-semibold text-red-600 shadow-sm">
        ⚠ No AI model —{" "}
        <Show when={props.signedIn} fallback={
          <button
            type="button"
            onClick={props.onSignIn}
            class="underline text-red-700 hover:text-red-900 transition font-bold"
          >
            Sign in to continue
          </button>
        }>
          <button
            type="button"
            onClick={props.onSettingsClick}
            class="underline text-red-700 hover:text-red-900 transition font-bold"
          >
            Set up in Agent Settings
          </button>
        </Show>
      </span>
    }>
      <span class="rounded-full border border-primary/25 bg-primary/10 px-3 py-0.5 font-mono text-[10px] text-primary">
        {label()}
      </span>
    </Show>
  );
}

const MSG_TYPE_COLORS: Record<string, string> = {
  task:             "bg-blue-100/60 text-blue-700",
  note:             "bg-yellow-100/60 text-yellow-700",
  research_result:  "bg-purple-100/60 text-purple-700",
  email:            "bg-green-100/60 text-green-700",
  generative_card:  "bg-indigo-100/60 text-indigo-700",
  search_result:    "bg-teal-100/60 text-teal-700",
};

type AuthModalFeedback = {
  tone: "success" | "error";
  text: string;
};

type AuthApiResponse = Partial<Session> & {
  requires_2fa?: boolean;
  verification_required?: boolean;
  message?: string;
  email?: string;
};

function ThreadListFallback(props: { messages: AfpMessage[]; onOpen: (id: string) => void }) {
  const [filter, setFilter] = createSignal("");
  const [draggedThreadId, setDraggedThreadId] = createSignal<string | null>(null);
  const [focusedIdx, setFocusedIdx] = createSignal(-1);

  onMount(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey) return;
      if (e.key === "ArrowDown") { e.preventDefault(); setFocusedIdx((i) => Math.min(i + 1, visible().length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setFocusedIdx((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter" && focusedIdx() >= 0) { const t = visible()[focusedIdx()]; if (t) props.onOpen(t.id); }
    }
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  function threadHeat(threadId: string): number[] {
    const now = Date.now();
    const buckets = new Array(7).fill(0);
    for (const m of props.messages) {
      if (m.thread_id !== threadId || !m.timestamp) continue;
      const d = Math.floor((now - new Date(m.timestamp).getTime()) / 86_400_000);
      if (d < 7) buckets[6 - d]++;
    }
    return buckets;
  }

  const threads = createMemo(() => {
    const seen = new Set<string>();
    return props.messages
      .filter((m) => {
        if (seen.has(m.thread_id)) return false;
        seen.add(m.thread_id);
        return true;
      })
      .map((m) => {
        const c = m.content as Record<string, unknown>;
        const raw = String(c["title"] ?? c["summary"] ?? c["description"] ?? c["query"] ?? m.type);
        const preview = raw.length > 65 ? `${raw.slice(0, 65)}…` : raw;
        return { id: m.thread_id, preview, msgType: m.type };
      });
  });

  const visible = createMemo(() => {
    const q = filter().toLowerCase().trim();
    if (!q) return threads();
    return threads().filter(
      (t) => t.preview.toLowerCase().includes(q) || t.msgType.toLowerCase().includes(q)
    );
  });

  return (
    <GlassPanel class="p-6">
      <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-outline">Thread browser</p>
      <h2 class="mt-2 text-lg font-semibold text-on-surface">Your AFP threads</h2>
      <Show
        when={threads().length > 0}
        fallback={
          <p class="mt-4 text-sm text-on-surface-variant">
            No threads yet. Talk to your agent in the chat bar above.
          </p>
        }
      >
        <div class="mt-4">
          <input
            type="text"
            placeholder="Filter threads…"
            value={filter()}
            onInput={(e) => setFilter(e.currentTarget.value)}
            class="w-full rounded-xl border border-white/35 bg-white/30 px-4 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:border-primary/40 focus:bg-white/50 transition"
          />
        </div>
        <div class="mt-3 space-y-2">
          <Show
            when={visible().length > 0}
            fallback={
              <p class="text-sm text-on-surface-variant">No threads match "{filter()}".</p>
            }
          >
            <For each={visible()}>
              {(thread, idx) => {
                const badgeClass = () =>
                  MSG_TYPE_COLORS[thread.msgType] ?? "bg-white/40 text-on-surface-variant";
                const isDragTarget = () => draggedThreadId() !== null && draggedThreadId() !== thread.id;
                const isFocused = () => focusedIdx() === idx();
                const heat = () => threadHeat(thread.id);
                const heatMax = () => Math.max(...heat(), 1);
                return (
                  <button
                    type="button"
                    draggable={true}
                    onClick={() => { setFocusedIdx(idx()); props.onOpen(thread.id); }}
                    onDragStart={() => setDraggedThreadId(thread.id)}
                    onDragEnd={() => setDraggedThreadId(null)}
                    onDragOver={(e) => { if (isDragTarget()) e.preventDefault(); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const from = draggedThreadId();
                      setDraggedThreadId(null);
                      if (!from || from === thread.id) return;
                      void orchestrate(
                        `Create a knowledge backlink between AFP thread "${thread.id}" and thread "${from}". Emit a backlink_update message linking them.`,
                        { thread_id: thread.id }
                      );
                    }}
                    class={`flex w-full items-start justify-between gap-4 rounded-2xl border px-5 py-3.5 text-left transition ${
                      isDragTarget() ? "border-primary/40 bg-primary/8 ring-1 ring-primary/20" :
                      isFocused() ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30" :
                      "border-white/35 bg-white/25 hover:bg-white/45"
                    }`}
                  >
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class={`inline-block rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] ${badgeClass()}`}>
                          {thread.msgType}
                        </span>
                        {/* 7-day activity heat sparkline */}
                        <svg viewBox="0 14 56 16" class="h-3 w-14 flex-shrink-0">
                          <For each={heat()}>
                            {(n, i) => (
                              <rect
                                x={i() * 8} y={14 + 14 * (1 - n / heatMax())}
                                width={6} height={14 * (n / heatMax())}
                                rx={1}
                                fill={`rgba(49,86,142,${0.15 + 0.6 * (n / heatMax())})`}
                              />
                            )}
                          </For>
                        </svg>
                      </div>
                      <p class="mt-1 truncate text-sm font-medium text-on-surface">{thread.preview}</p>
                    </div>
                    <span class="flex-shrink-0 self-center text-sm text-primary">{isDragTarget() ? "↩ Link" : "Open →"}</span>
                  </button>
                );
              }}
            </For>
          </Show>
        </div>
      </Show>
    </GlassPanel>
  );
}

function AuthModal(props: {
  onClose: () => void;
  onLogin?: () => void;
  notice?: AuthModalFeedback | null;
  onClearNotice?: () => void;
}) {
  const [tab, setTab] = createSignal<"signin" | "signup">("signin");
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [displayName, setDisplayName] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  async function submit(e: Event) {
    e.preventDefault();
    setLoading(true);
    setError("");
    props.onClearNotice?.();
    try {
      const endpoint = tab() === "signin" ? "/auth/login" : "/auth/register";
      const body: Record<string, string> = { email: email().trim(), password: password() };
      if (tab() === "signup" && displayName().trim()) body.display_name = displayName().trim();
      const resp = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(text || resp.statusText);
      }
      const data = await resp.json() as AuthApiResponse;
      if (data.requires_2fa) {
        setError("Two-factor authentication required — not yet supported in the web UI. Please use the CLI or contact support.");
        return;
      }
      if (data.verification_required) {
        setTab("signin");
        setPassword("");
        setError(data.message || "Check your email to verify your account before signing in.");
        return;
      }
      if (typeof data.token !== "string" || !data.user) {
        throw new Error("Authentication response was incomplete.");
      }
      writeSession(data as Session);
      if (props.onLogin) {
        props.onLogin();
      } else {
        window.location.reload();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const isNetwork = !msg || msg.toLowerCase().includes("networkerror") || msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("load failed");
      setError(isNetwork
        ? "Cannot reach the homeserver. Make sure the OmnyID backend is running (run dev.ps1 or docker compose up)."
        : msg || "Authentication failed — check credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      class="fixed inset-0 z-[200] flex items-center justify-center bg-on-surface/30 backdrop-blur-sm animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div class="relative w-full max-w-sm rounded-3xl border border-white/45 bg-white/96 p-6 shadow-panel backdrop-blur-xl">
        <button
          type="button"
          onClick={props.onClose}
          class="absolute right-4 top-4 text-on-surface-variant/40 transition hover:text-on-surface"
          aria-label="Close"
        >×</button>
        <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-outline mb-4">OmnyID Account</p>
        <div class="mb-5 flex rounded-xl border border-white/40 bg-white/40 p-0.5">
          <button
            type="button"
            onClick={() => { setTab("signin"); setError(""); props.onClearNotice?.(); }}
            class={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${tab() === "signin" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
          >Sign in</button>
          <button
            type="button"
            onClick={() => { setTab("signup"); setError(""); props.onClearNotice?.(); }}
            class={`flex-1 rounded-lg py-1.5 text-sm font-medium transition ${tab() === "signup" ? "bg-white shadow-sm text-on-surface" : "text-on-surface-variant hover:text-on-surface"}`}
          >Create account</button>
        </div>
        <form onSubmit={submit} class="space-y-3">
          <Show when={props.notice}>
            {(notice) => (
              <p class={`rounded-lg px-3 py-2 text-xs ${
                notice().tone === "success"
                  ? "border border-emerald-200/70 bg-emerald-50/90 text-emerald-800"
                  : "border border-amber-200/70 bg-amber-50/90 text-amber-800"
              }`}>
                {notice().text}
              </p>
            )}
          </Show>
          <Show when={tab() === "signup"}>
            <input
              type="text"
              placeholder="Display name (optional)"
              value={displayName()}
              onInput={(e) => setDisplayName(e.currentTarget.value)}
              class="w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2.5 text-sm text-on-surface outline-none focus:border-primary/50 transition"
            />
          </Show>
          <input
            type="email"
            required
            autocomplete="email"
            placeholder="Email"
            value={email()}
            onInput={(e) => setEmail(e.currentTarget.value)}
            class="w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2.5 text-sm text-on-surface outline-none focus:border-primary/50 transition"
          />
          <input
            type="password"
            required
            autocomplete={tab() === "signin" ? "current-password" : "new-password"}
            placeholder="Password (8+ chars)"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            class="w-full rounded-xl border border-white/40 bg-white/60 px-4 py-2.5 text-sm text-on-surface outline-none focus:border-primary/50 transition"
          />
          <Show when={error()}>
            <p class="rounded-lg border border-red-200/60 bg-red-50/80 px-3 py-2 text-xs text-red-700">{error()}</p>
          </Show>
          <button
            type="submit"
            disabled={loading()}
            class="w-full rounded-full bg-primary py-2.5 text-sm font-semibold text-white transition hover:bg-primary/80 disabled:opacity-60"
          >
            {loading() ? "Please wait…" : tab() === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p class="mt-4 text-center text-[11px] text-on-surface-variant/50">
          Your data stays on your homeserver — privacy-first.
        </p>
      </div>
    </div>
  );
}

export default App;
