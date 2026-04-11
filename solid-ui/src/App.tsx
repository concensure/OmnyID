import { createMemo, createSignal, For, onMount, Show } from "solid-js";
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
import { SearchBar } from "@/components/SearchBar";
import { ThreadView } from "@/components/ThreadView";
import { ViewDispatcher } from "@/components/ViewDispatcher";
import { WorkflowsView } from "@/components/WorkflowsView";
import { CofounderStudioView } from "@/components/CofounderStudioView";
import { KnowledgeGraphView } from "@/components/KnowledgeGraphView";
import {
  apiFetch,
  type AfpMessage,
  fetchEncKey,
  fetchLlmConfig,
  loadPrefs,
  readSession,
  savePrefs,
  type DashboardBootstrap,
  type LlmConfig,
  type RuntimeWorkspaceFileEntry,
  type RuntimeWorkspaceFileResponse,
  type UiCommandResponse
} from "@/lib/api";
import { checkBrowserAiAvailable, classifyWithBrowserAi, getBrowserAiLabel } from "@/lib/browserAi";

let decryptModulePromise: Promise<typeof import("@/lib/decrypt")> | null = null;

function loadDecryptModule() {
  if (!decryptModulePromise) {
    decryptModulePromise = import("@/lib/decrypt");
  }
  return decryptModulePromise;
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

  if (command.intent === "note" || (command.preferred_view ?? "") === "note_canvas") {
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
  const session = createMemo(() => readSession());

  const _prefs = loadPrefs();
  const [activeView, setActiveView] = createSignal<ViewName>(
    (_prefs.activeView as ViewName) ?? "search"
  );
  const [openThreadId, setOpenThreadId] = createSignal<string | null>(_prefs.openThreadId);

  const [rightOpen, setRightOpen] = createSignal(false);
  const [fleetOpen, setFleetOpen] = createSignal(false);

  const [loraScore, setLoraScore] = createSignal(0);
  const [loraActive, setLoraActive] = createSignal(false);
  const [fleetActiveCount, setFleetActiveCount] = createSignal(0);
  const [fleetIdleCount, setFleetIdleCount] = createSignal(0);

  // Browser AI
  const [browserAiLabel, setBrowserAiLabel] = createSignal<string | null>(null);

  // LLM config (for agent status line)
  const [llmConfig, setLlmConfig] = createSignal<LlmConfig | null>(null);

  // Agent settings focus: scroll to AI Model Config when opening from pill link
  const [agentSettingsFocusLlm, setAgentSettingsFocusLlm] = createSignal(false);

  // UI state
  const [advanced, setAdvanced] = createSignal(false);

  // Onboarding / tour state
  const [showTour, setShowTour] = createSignal(shouldShowTour());
  const [showOnboarding, setShowOnboarding] = createSignal(false);

  function persistPrefs(view: ViewName, threadId: string | null) {
    savePrefs({ activeView: view, openThreadId: threadId });
  }

  function selectView(view: ViewName) {
    setActiveView(view);
    persistPrefs(view, openThreadId());
  }

  function openThread(threadId: string) {
    setOpenThreadId(threadId);
    setActiveView("threads");
    persistPrefs("threads", threadId);
  }

  const [dashboard, setDashboard] = createSignal<DashboardBootstrap | null>(null);
  const [searchBusy, setSearchBusy] = createSignal(false);
  const [searchFeedback, setSearchFeedback] = createSignal("");
  const [commandResult, setCommandResult] = createSignal<UiCommandResponse | null>(null);
  const [lastQuery, setLastQuery] = createSignal("");
  const [runnerFiles, setRunnerFiles] = createSignal<RuntimeWorkspaceFileEntry[]>([]);
  const [activeFile, setActiveFile] = createSignal<RuntimeWorkspaceFileResponse | null>(null);
  const [editorValue, setEditorValue] = createSignal("");
  const [runnerFeedback, setRunnerFeedback] = createSignal(
    "Deploy a Python runner and load a file to edit code here."
  );
  const [runtimeLogs, setRuntimeLogs] = createSignal<string[]>([]);
  const [runtimeLogSource, setRuntimeLogSource] = createSignal("bootstrap");
  const [runtimeBusy, setRuntimeBusy] = createSignal(false);

  async function loadDashboard() {
    if (!session()?.token) { setDashboard(null); return; }
    try {
      const payload = await apiFetch<DashboardBootstrap>("/dashboard/bootstrap");
      // Decrypt AFP messages in-memory before rendering — plaintext never re-stored
      const { decryptMessages } = await loadDecryptModule();
      payload.messages = decryptMessages(payload.messages);
      setDashboard(payload);
      const monitor = payload.runtime_deployment?.runtime_monitor;
      if (monitor) {
        setRuntimeLogs(monitor.lines ?? []);
        setRuntimeLogSource(monitor.source || "bootstrap");
        setRunnerFeedback(
          `Runtime ${payload.runtime_deployment?.status ?? monitor.status} via ${monitor.source || "bootstrap"} at ${monitor.updated_at}.`
        );
      }
    } catch (error) {
      setSearchFeedback((error as Error).message);
    }
  }

  async function loadRunnerFiles() {
    if (!session()?.token) { setRunnerFiles([]); setActiveFile(null); setEditorValue(""); return; }
    try {
      const payload = await apiFetch<{
        framework: string;
        active_file_id?: string | null;
        files: RuntimeWorkspaceFileEntry[];
      }>("/runtime/workspace-files");
      setRunnerFiles(payload.files);
      const fileId = payload.active_file_id || payload.files[0]?.file_id;
      if (fileId) await selectFile(fileId);
    } catch (error) {
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
      await loadDashboard();
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
      await loadDashboard();
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
      await loadDashboard();
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
    } catch {
      setRuntimeLogs([]);
      setRuntimeLogSource("runtime/logs");
    }
  }

  async function loadLora() {
    try {
      const fleet = await apiFetch<{
        instance?: { lora_confidence_score?: number; lora_genome_active?: boolean };
        active_count?: number;
        idle_count?: number;
      }>("/agent/fleet");
      if (fleet.instance) {
        setLoraScore(fleet.instance.lora_confidence_score ?? 0);
        setLoraActive(fleet.instance.lora_genome_active ?? false);
      }
      setFleetActiveCount(fleet.active_count ?? 0);
      setFleetIdleCount(fleet.idle_count ?? 0);
    } catch { /* ignore */ }
  }

  async function handleSearch(query: string, engine: string, optimizationMode = "balanced") {
    setSearchBusy(true);
    setLastQuery(query);
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
      setSearchFeedback(payload.summary);
      // Reload dashboard to pick up any new AFP messages the agent created
      void loadDashboard();
      const suggested = payload.suggested_view as ViewName;
      if (suggested === "threads" || suggested === "email" || suggested === "runner"
          || suggested === "note" || suggested === "calendar" || suggested === "database") {
        selectView(suggested);
      } else {
        selectView("search");
      }
    } catch (error) {
      setSearchFeedback((error as Error).message);
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
    selectView("runner");
  }

  const runtimeDeployment = createMemo(() => dashboard()?.runtime_deployment ?? null);
  const commandPreviewMessage = createMemo(() => {
    const result = commandResult();
    if (!result) return null;
    if (result.preview_message) return result.preview_message;
    return commandResponseToPreviewMessage(result, lastQuery());
  });

  onMount(async () => {
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

    // Detect browser-native AI (Gemini Nano on Chrome, Phi on Edge)
    const label = getBrowserAiLabel();
    if (label) {
      checkBrowserAiAvailable().then((ok) => { if (ok) setBrowserAiLabel(label); });
    }

    void loadDashboard();
    void loadRunnerFiles();
    void loadRuntimeLogs();
    if (session()?.token) void loadLora();
    if (session()?.token) {
      void import("@/lib/sync").then(({ initSync }) =>
        initSync(
          import.meta.env.VITE_API_BASE ?? "https://api.omnyid.com",
          session()?.token ?? null
        )
      );
    }
  });


  return (
    <main class="min-h-screen p-4 md:p-6 text-on-surface">
      {/* Guided tour — first-time visitors */}
      <Show when={showTour()}>
        <GuidedTour onComplete={() => {
          setShowTour(false);
          // If authenticated and not onboarded, let onboarding wizard show next
        }} />
      </Show>

      {/* Onboarding wizard — authenticated users, after tour */}
      <Show when={!showTour() && showOnboarding() && Boolean(session()?.token)}>
        <OnboardingWizard onComplete={() => setShowOnboarding(false)} />
      </Show>

      {/* Guest mode banner */}
      <Show when={!session()?.token}>
        <div class="mx-auto mb-4 max-w-[1700px] flex items-center justify-between gap-4 rounded-2xl border border-amber-200/50 bg-amber-50/60 px-5 py-3 text-sm text-on-surface-variant backdrop-blur-sm animate-fade-in">
          <span>
            You're in <strong class="text-on-surface">guest mode</strong> — most actions require a signed-in account.
          </span>
          <a href="/?open_auth=1" class="glass-button rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 shadow-sm">
            Sign in →
          </a>
        </div>
      </Show>

      <GlassPanel class="mx-auto max-w-[1700px] p-5 lg:p-8">
        <NavBar
          activeView={activeView()}
          onSelect={selectView}
          signedIn={Boolean(session()?.token)}
          advanced={advanced()}
          onToggleAdvanced={() => setAdvanced((v) => !v)}
          activeCount={fleetActiveCount()}
          idleCount={fleetIdleCount()}
          onFleetClick={() => setFleetOpen((v) => !v)}
        />

        {/* Fleet pane — slides in below nav when user clicks active/idle badge */}
        <Show when={fleetOpen()}>
          <div class="mt-4 glass-surface animate-slide-down rounded-[20px] border border-white/50 p-5 shadow-panel overflow-auto max-h-[70vh]">
            <AgentFleetView />
          </div>
        </Show>

        {/* Chat bar — always visible */}
        <div class="mt-7">
          <SearchBar onSubmit={handleSearch} busy={searchBusy()} />
          <div class="mt-2.5 flex flex-wrap items-center justify-center gap-3">
            <Show when={searchFeedback()}>
              <p class="text-center text-sm leading-7 text-on-surface-variant">
                {searchFeedback()}
              </p>
            </Show>
            <AgentStatusPill
              llmConfig={llmConfig()}
              browserAiLabel={browserAiLabel()}
              onSettingsClick={() => { selectView("agent_settings"); setAgentSettingsFocusLlm(true); }}
            />
          </div>
        </div>

        {/* 2-column layout (left sidebar removed) */}
        <div class="mt-5 flex gap-4" style="min-height: 620px">

          {/* ── MAIN CONTENT ─────────────────────────────────────────── */}
          <div class="min-w-0 flex-1 overflow-hidden">

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
                {/* AI Co-Founder Launchpad card */}
                <div
                  class="card-hover cursor-pointer rounded-[22px] border border-indigo-200/60 bg-gradient-to-br from-indigo-50/80 via-violet-50/70 to-sky-50/80 p-5 shadow-card transition hover:border-indigo-300/70 backdrop-blur-sm"
                  onClick={() => selectView("cofounder_studio")}
                  role="button"
                  tabindex={0}
                  onKeyDown={(e) => e.key === "Enter" && selectView("cofounder_studio")}
                >
                  <div class="flex items-start gap-4">
                    <span class="text-3xl leading-none select-none">🚀</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-bold text-indigo-900">AI Co-Founder Launchpad</p>
                      <p class="mt-0.5 text-xs text-indigo-700/80">Turn your raw idea into a validated concept, full asset kit &amp; scheduled social content — all private, all E2EE.</p>
                      <div class="mt-2 flex flex-wrap gap-1.5">
                        {["Market research", "Dream Score", "Business plan", "Social content"].map(tag => (
                          <span class="rounded-full border border-indigo-200/60 bg-indigo-50/80 px-2 py-0.5 text-[10px] font-medium text-indigo-700">{tag}</span>
                        ))}
                      </div>
                    </div>
                    <span class="text-indigo-400 text-sm font-medium self-center">→</span>
                  </div>
                </div>

                <DashboardFeed
                  bootstrap={dashboard()}
                  commandSummary={commandResult() ? undefined : undefined}
                  advanced={advanced()}
                  onOpenThread={openThread}
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
                        threadIds={(dashboard()?.messages ?? []).map((m) => m.thread_id)}
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
                  <CofounderStudioView onNavigateBack={() => selectView("search")} />
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

            {/* Database view — AFP messages filtered by type containing "database" or "table" */}
            <Show when={activeView() === "database"}>
              <div class="view-enter">
                <DashboardFeed
                  bootstrap={(() => {
                    const d = dashboard();
                    if (!d) return null;
                    return { ...d, messages: d.messages.filter((m) => m.type.includes("database") || m.type.includes("table")) };
                  })()}
                  onOpenThread={openThread}
                />
              </div>
            </Show>

            {/* Runner view — advanced only */}
            <Show when={activeView() === "runner" && advanced()}>
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
            <Show when={activeView() === "runner" && !advanced()}>
              <div class="view-enter glass-surface rounded-3xl border border-white/50 p-10 text-center shadow-card">
                <p class="text-sm text-on-surface-variant">Enable <strong class="text-on-surface">Advanced ▾</strong> in the top nav to access the Python runner.</p>
              </div>
            </Show>

            {/* Agent Settings view */}
            <Show when={activeView() === "agent_settings"}>
              <div class="view-enter">
                <AgentSettingsView
                  browserAiLabel={browserAiLabel()}
                  focusLlm={agentSettingsFocusLlm()}
                  onFocusDone={() => setAgentSettingsFocusLlm(false)}
                  signedIn={Boolean(session()?.token)}
                  onLlmConfigSaved={(cfg) => setLlmConfig(cfg)}
                />
              </div>
            </Show>
          </div>

          {/* ── RIGHT SIDEBAR ────────────────────────────────────────── */}
          <aside
            class="flex-shrink-0 overflow-hidden rounded-3xl border border-white/35 bg-white/20 backdrop-blur"
            style={`width: ${rightOpen() ? "272px" : "44px"}; transition: width 0.22s cubic-bezier(0.22, 1, 0.36, 1)`}
          >
            <div class="flex h-full flex-col">
              <div class="flex flex-shrink-0 justify-end border-b border-white/20 px-2 py-2.5">
                <button
                  type="button"
                  title={rightOpen() ? "Collapse" : "Expand"}
                  class="flex h-7 w-7 items-center justify-center rounded-xl text-sm text-on-surface-variant transition hover:bg-white/40"
                  onClick={() => setRightOpen((v) => !v)}
                >
                  ≡
                </button>
              </div>

              <Show when={rightOpen()}>
                <div class="flex-1 overflow-auto p-4 space-y-5 animate-fade-in">
                  <div>
                    <p class="label-caps mb-2">Mask</p>
                    <MaskSwitcher />
                  </div>

                  <div class="rounded-2xl border border-white/30 bg-white/40 p-3.5">
                    <Show
                      when={session()?.token}
                      fallback={
                        <>
                          <p class="text-xs font-medium text-amber-600">Guest mode</p>
                          <a href="/" class="mt-1 block text-xs text-primary hover:underline">Sign in →</a>
                        </>
                      }
                    >
                      <p class="label-caps mb-1">Signed in as</p>
                      <p class="text-sm font-semibold text-on-surface">{(session() as any)?.user?.display_name ?? "User"}</p>
                    </Show>
                  </div>

                  <Show when={session()?.token}>
                    <LoraStatusWidget score={loraScore()} active={loraActive()} />
                  </Show>

                  {/* Plaza — Public Feed */}
                  <div>
                    <p class="label-caps mb-2.5">Plaza</p>
                    <PublicFeedView isAnon={!session()?.token} />
                  </div>
                </div>
              </Show>
            </div>
          </aside>

        </div>
      </GlassPanel>
    </main>
  );
}

function AgentStatusPill(props: {
  llmConfig: LlmConfig | null;
  browserAiLabel: string | null;
  onSettingsClick?: () => void;
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
        <button
          type="button"
          onClick={props.onSettingsClick}
          class="underline text-red-700 hover:text-red-900 transition font-bold"
        >
          set up in Agent Settings
        </button>
      </span>
    }>
      <span class="rounded-full border border-primary/25 bg-primary/10 px-3 py-0.5 font-mono text-[10px] text-primary">
        {label()}
      </span>
    </Show>
  );
}

function ThreadListFallback(props: { threadIds: string[]; onOpen: (id: string) => void }) {
  const unique = () => [...new Set(props.threadIds)];

  return (
    <GlassPanel class="p-6">
      <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-outline">Thread browser</p>
      <h2 class="mt-2 text-lg font-semibold text-on-surface">Your AFP threads</h2>
      <Show
        when={unique().length > 0}
        fallback={
          <p class="mt-4 text-sm text-on-surface-variant">
            No threads yet. Talk to your agent in the chat bar above.
          </p>
        }
      >
        <div class="mt-5 space-y-2">
          <For each={unique()}>
            {(tid) => (
              <button
                type="button"
                onClick={() => props.onOpen(tid)}
                class="flex w-full items-center justify-between rounded-2xl border border-white/35 bg-white/25 px-5 py-4 text-left transition hover:bg-white/45"
              >
                <span class="font-mono text-sm text-on-surface">{tid}</span>
                <span class="text-sm text-primary">Open →</span>
              </button>
            )}
          </For>
        </div>
      </Show>
    </GlassPanel>
  );
}

export default App;
