function safeRuntimeApiBase(): string {
  if (typeof window === "undefined") return "";
  const raw = (window as unknown as { __API_BASE__?: string }).__API_BASE__?.trim() ?? "";
  if (!raw) return "";
  try {
    const u = new URL(raw);
    // Only accept same origin or explicit localhost during development
    const allowed =
      u.origin === window.location.origin ||
      (window.location.hostname === "localhost" && (u.hostname === "localhost" || u.hostname === "127.0.0.1"));
    return allowed ? raw : "";
  } catch { return ""; }
}
const runtimeApiBase = safeRuntimeApiBase();
const envApiBase = typeof import.meta !== "undefined" ? import.meta.env.VITE_API_BASE?.trim?.() : "";

export const API_BASE =
  runtimeApiBase ||
  envApiBase ||
  window.location.origin;
export const SESSION_STORAGE_KEY = "omnyid.preview.session";
export const SESSION_CHANGED_EVENT = "omnyid:session-changed";

export type Session = {
  token: string;
  user: {
    id: string;
    email: string;
    display_name: string;
    auth_provider: string;
  };
};

// ── AFP core types ────────────────────────────────────────────────────────────

/** One view hint attached to an AFP message. `format` drives the renderer. */
export type AfpView = {
  format: "email" | "canvas" | "table" | "calendar" | "attachments" | "approvals" | string;
  content: Record<string, unknown>;
  priority?: number;
};

export type AfpAttachment = {
  id: string;
  name: string;
  mime_type: string;
  size_bytes: number;
  storage: Record<string, unknown>;
  encryption: Record<string, unknown>;
  sha256?: string;
};

export type AfpReference = {
  type: string;
  target: string;
  label?: string;
  metadata?: Record<string, unknown>;
};

/**
 * A full AFP message as returned by GET /thread/{id}.
 * The `views` array is the agent-native rendering contract:
 * agents set views[].format to tell the workspace how to render this message.
 * Keep `type` broad and stable. Use top-level `kind` for semantic typing,
 * and use `subtype`, payload-local fields such as `content.kind`, and
 * `metadata` for message-family-specific routing without exploding the taxonomy.
 */
export type AfpMessage = {
  id: string;
  thread_id: string;
  parent_id?: string | null;
  from: string;
  to?: string[];
  timestamp: string;
  type: string;
  kind?: string | null;
  subtype?: string | null;
  content: Record<string, unknown>;
  metadata?: Record<string, unknown> | null;
  views: AfpView[];
  attachments: AfpAttachment[];
  references?: AfpReference[];
  encryption?: Record<string, unknown> | null;
  signature?: string;
};

export type DashboardBootstrap = {
  user: Session["user"];
  agents: Array<{ agent_id: string; label?: string }>;
  messages: AfpMessage[];
  cost_snapshot?: {
    total_usd: number;
    total_tokens: number;
    event_count: number;
    run_count: number;
    monthly_budget_usd: number;
    soft_limit_ratio: number;
    recent_spend_usd_14d: number;
    cost_month_usd: number;
    estimated_monthly_margin_usd: number;
    deep_queries_today: number;
    daily_deep_query_limit: number;
    margin_guard_active: boolean;
    usage_guard_active: boolean;
  } | null;
  cost_status?: {
    level: string;
    title: string;
    detail: string;
    action_label: string;
  } | null;
  continuity_brief?: {
    source_type: string;
    title: string;
    decision_count: number;
    commitment_count: number;
    critical_change_count: number;
    suggested_actions: string[];
    staleness_at?: string | null;
  } | null;
  continuity_primary_mode?: "priority_card" | "briefing_bar" | "continuity_panel" | string;
  continuity_priority_card?: {
    title: string;
    description: string;
    panel_kind: string;
    requires_approval: boolean;
    action_label: string;
    surface_hint?: string | null;
    confidence?: string | null;
    source_refs?: string[];
  } | null;
  continuity_action_items?: Array<{
    id: string;
    title: string;
    category: string;
    urgency: string;
    confidence: string;
    requires_approval: boolean;
    suggested_action: string;
    source_refs: string[];
  }>;
  continuity_response_items?: Array<{
    id: string;
    title: string;
    channel: string;
    urgency: string;
    confidence: string;
    response_due_hint: string;
    suggested_action: string;
    source_refs: string[];
  }>;
  continuity_context_panel_items?: Array<{
    id: string;
    label: string;
    why_surfaced: string;
    confidence: string;
    relation_path: string[];
    source_refs: string[];
    decrypt_needed: boolean;
  }>;
  runtime_updates?: {
    current_version: string;
    latest_version: string;
    update_available: boolean;
    runtime_status: string;
    framework?: string | null;
    last_checked_at?: string | null;
    last_applied_at?: string | null;
    panel?: Record<string, unknown> | null;
  } | null;
  runtime_deployment?: {
    id: string;
    framework: string;
    status: string;
    workspace_path: string;
    gui?: string | null;
    runtime_monitor?: {
      status: string;
      source: string;
      lines: string[];
      updated_at: string;
    } | null;
    runtime_status_panel?: Record<string, unknown> | null;
    runtime_status_views?: AfpView[] | null;
  } | null;
};

export type RuntimeWorkspaceFileEntry = {
  file_id: string;
  label: string;
  relative_path: string;
  language: string;
  editable: boolean;
};

export type RuntimeWorkspaceFileResponse = RuntimeWorkspaceFileEntry & {
  content: string;
  updated_at: string;
};

export type UiCommandResponse = {
  intent: string;
  suggested_view: string;
  preferred_view?: string;
  summary: string;
  engine: string;
  links: Array<{ title: string; url: string; kind: string }>;
  bullets?: string[];
  card_id?: string | null;
  preview_message?: AfpMessage | null;
  runner_draft?: {
    target_file_id: string;
    title: string;
    content: string;
    requires_confirmation: boolean;
  } | null;
};

export type SavedWorkflow = {
  workflow_id: string;
  owner_user_id: string;
  title: string;
  description?: string | null;
  favorite: boolean;
  preset_kinds: string[];
  graph: Record<string, unknown>;
  latest_ir?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
};

export type WorkflowListResponse = {
  workflows: SavedWorkflow[];
};

export type WorkflowTemplateSuggestion = {
  title: string;
  score: number;
  template_id: string;
  workflow_family: string;
  implementation_status: string;
  reliability: string;
  already_aligned: boolean;
  rationale: string;
  advisory: string;
  semantic_roles: string[];
  matched_node_ids: string[];
};

export type WorkflowCompiledSummary = {
  manifest_count: number;
  runtime_kind_counts: Record<string, number>;
  afp_message_family_counts: Record<string, number>;
  approval_manifest_count: number;
  wait_resume_count: number;
};

export type WorkflowValidationResponse = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  summary?: {
    workflow_id?: string | null;
    node_count: number;
    edge_count: number;
    compiled?: WorkflowCompiledSummary;
  };
  template_suggestions?: WorkflowTemplateSuggestion[];
};

export type WorkflowIntentExpansion = {
  preset_kind: string;
  requires_approval: boolean;
  needs_branching: boolean;
  needs_research_support: boolean;
  public_output: boolean;
  optimization_mode: "balanced" | "speed" | "cost";
};

export type WorkflowDescribeResponse = {
  described: boolean;
  saved?: boolean;
  intent_expansion: WorkflowIntentExpansion;
  workflow: SavedWorkflow;
};

export type WorkflowCompileResponse = {
  compiled: boolean;
  workflow_id: string;
  ir: Record<string, unknown>;
};

export type WorkflowDeployment = {
  deployment_id: string;
  workflow_id: string;
  owner_user_id: string;
  environment: string;
  status: string;
  ir_snapshot: Record<string, unknown>;
  graph_snapshot: Record<string, unknown>;
  source_deployment_id?: string | null;
  deployed_at: string;
  created_at: string;
};

export type WorkflowDeploymentsResponse = {
  workflow_id: string;
  deployments: WorkflowDeployment[];
};

export type WorkflowRun = {
  run_id: string;
  workflow_id: string;
  deployment_id: string;
  owner_user_id: string;
  status: string;
  trigger_kind: string;
  replay_of_run_id?: string | null;
  timeline: Array<Record<string, unknown>>;
  result: Record<string, unknown>;
  started_at: string;
  completed_at?: string | null;
  created_at: string;
};

export type WorkflowRunsResponse = {
  workflow_id: string;
  runs: WorkflowRun[];
};

export type WorkflowRunStartResponse = {
  started: boolean;
  workflow_id: string;
  run: WorkflowRun;
};

export type WorkflowWaitResumeRecord = {
  wait_resume_id: string;
  workflow_id: string;
  deployment_id: string;
  run_id: string;
  owner_user_id: string;
  manifest_node_id: string;
  source_graph_node_id: string;
  status: string;
  resume_family: string;
  resume_kind: string;
  wait_reason?: string | null;
  scheduled_for?: string | null;
  descriptor: Record<string, unknown>;
  created_at: string;
  resumed_at?: string | null;
};

export type WorkflowWaitResumeListResponse = {
  workflow_id: string;
  run_id: string;
  wait_resume_records: WorkflowWaitResumeRecord[];
};

export type WorkflowWaitResumeDecisionResponse = {
  updated: boolean;
  workflow_id: string;
  run_id: string;
  wait_resume_id: string;
  decision: "approved" | "rejected";
  wait_resume_status: string;
  run: WorkflowRun;
  decision_dispatch: Record<string, unknown>;
};

export type WorkflowActionResponse = {
  updated: boolean;
  deployment_id?: string;
  workflow: SavedWorkflow;
};

export type WorkflowConnectorOverrideFields = {
  delivery_tier?: string;
  auth_mode?: string;
  side_effects?: string;
  provider_route?: string;
};

export type WorkflowConnectorOverrides = WorkflowConnectorOverrideFields & {
  family_overrides?: Record<string, WorkflowConnectorOverrideFields>;
  node_overrides?: Record<string, WorkflowConnectorOverrideFields>;
};

export type DaemonRecord = {
  daemon_id: string;
  daemon_kind: string;
  display_name: string;
  status: string;
  workflow_id?: string | null;
  delegated_key_id: string;
  last_heartbeat_at?: string | null;
  created_at: string;
  revoked_at?: string | null;
  policy_config?: Record<string, unknown> | null;
  stale_minutes?: number | null;
};

export type DaemonHeartbeatDetail = {
  heartbeat_id: string;
  daemon_id: string;
  user_id: string;
  metrics: Record<string, unknown>;
  created_at: string;
};

function isValidSession(v: unknown): v is Session {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (typeof o.token !== "string" || !o.token) return false;
  const u = o.user;
  if (!u || typeof u !== "object") return false;
  const usr = u as Record<string, unknown>;
  return (
    typeof usr.id === "string" &&
    typeof usr.email === "string" &&
    typeof usr.display_name === "string" &&
    typeof usr.auth_provider === "string"
  );
}

export function readSession(): Session | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeSession(session: Session | null): void {
  try {
    if (!session) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    } else {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    }
  } catch {
    // ignore persistence failures
  } finally {
    window.dispatchEvent(new CustomEvent(SESSION_CHANGED_EVENT, { detail: session }));
  }
}

export function clearSession(): void {
  writeSession(null);
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { bodyJson?: unknown }
): Promise<T> {
  const session = readSession();
  const headers = new Headers(options?.headers ?? {});
  if (options?.bodyJson !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: options?.bodyJson !== undefined ? JSON.stringify(options.bodyJson) : options?.body
  });

  if (!response.ok) {
    const text = await response.text();
    if (response.status === 401) {
      clearSession();
    }
    throw new Error(text || `Request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

/** Fetch all messages for a thread. Returns AFP messages sorted oldest-first. */
export async function fetchThread(threadId: string): Promise<AfpMessage[]> {
  return apiFetch<AfpMessage[]>(`/thread/${encodeURIComponent(threadId)}`);
}

export async function listDaemons(): Promise<DaemonRecord[]> {
  const body = await apiFetch<{ daemons: DaemonRecord[] }>("/daemons");
  return body.daemons ?? [];
}

export async function fetchDaemonHeartbeat(
  daemonId: string
): Promise<{ daemon: DaemonRecord; heartbeat: DaemonHeartbeatDetail | null }> {
  return apiFetch(`/daemons/${encodeURIComponent(daemonId)}/heartbeat`);
}

export async function revokeDaemon(daemonId: string): Promise<void> {
  await apiFetch(`/daemons/${encodeURIComponent(daemonId)}/revoke`, { method: "POST" });
}

// ── Note organisation messages ────────────────────────────────────────────────

export type FolderRulePayload = {
  folder_id: string;
  summary_style?: string;
  backlink_rules?: string;
  tag_suggestions?: string[];
};

export type AreaRulesPayload = {
  area: string;
  summary_style?: string;
  backlink_rules?: string;
  tag_suggestions?: string[];
};

export type TagUpdatePayload = {
  remove_tags?: string[];
  add_tags?: string[];
  remove_supertags?: string[];
  add_supertags?: string[];
};

type NoteMessageRequest =
  | { type: "folder_rule"; thread_id: string; content: FolderRulePayload }
  | { type: "area_rules"; thread_id: string; content: AreaRulesPayload }
  | {
      type: "tag_update";
      thread_id: string;
      content: TagUpdatePayload;
      /** IDs of the original note messages being updated. */
      references: Array<{ id: string }>;
    };

/**
 * Send a note organisation AFP message (folder_rule, area_rules, or tag_update).
 * Returns the server-assigned message_id.
 */
export async function sendNoteMessage(req: NoteMessageRequest): Promise<string> {
  const body = await apiFetch<{ success: boolean; message_id: string }>(
    "/notes/message",
    { method: "POST", bodyJson: req }
  );
  return body.message_id;
}

/**
 * Open a relay WebSocket subscription for a thread.
 * Calls `onMessage` when `thread_snapshot` or `message_stored` arrives for this thread.
 * Returns a cleanup function to close the socket.
 */
export function subscribeThread(
  threadId: string,
  onMessage: () => void
): () => void {
  const wsBase = API_BASE.startsWith("https://")
    ? API_BASE.replace("https://", "wss://")
    : API_BASE.replace("http://", "ws://");
  const socket = new WebSocket(`${wsBase}/relay/ws`);

  socket.addEventListener("open", () => {
    const token = readSession()?.token ?? null;
    socket.send(
      JSON.stringify({
        op: "subscribe_thread",
        thread_id: threadId,
        include_snapshot: false,
        ...(token ? { token } : {}),
      })
    );
  });

  socket.addEventListener("message", (ev) => {
    try {
      const event = JSON.parse(String(ev.data)) as { event?: string; thread_id?: string };
      if (
        (event.event === "thread_snapshot" || event.event === "message_stored") &&
        (!event.thread_id || event.thread_id === threadId)
      ) {
        onMessage();
      }
    } catch {
      // ignore unparseable frames
    }
  });

  return () => socket.close();
}

/**
 * Subscribe to fleet_update events via the relay WebSocket.
 * Calls `onUpdate` whenever any task changes status.
 * Returns a cleanup function to close the socket.
 */
export function subscribeFleet(onUpdate: () => void): () => void {
  const wsBase = API_BASE.startsWith("https://")
    ? API_BASE.replace("https://", "wss://")
    : API_BASE.replace("http://", "ws://");
  const socket = new WebSocket(`${wsBase}/relay/ws`);

  socket.addEventListener("open", () => {
    const token = readSession()?.token ?? null;
    socket.send(JSON.stringify({ op: "subscribe_fleet", ...(token ? { token } : {}) }));
  });

  socket.addEventListener("message", (ev) => {
    try {
      const event = JSON.parse(String(ev.data)) as { event?: string };
      if (event.event === "fleet_update") {
        onUpdate();
      }
    } catch {
      // ignore unparseable frames
    }
  });

  return () => socket.close();
}

export const cancelTask = (taskId: string) =>
  apiFetch(`/agent/tasks/${encodeURIComponent(taskId)}/cancel`, { method: "POST" });

// ── Workspace preference persistence ─────────────────────────────────────────

const PREF_KEY_BASE = "omnyid.workspace.prefs";

export type WorkspacePrefs = {
  activeView: string;
  openThreadId: string | null;
};

const DEFAULT_PREFS: WorkspacePrefs = { activeView: "search", openThreadId: null };

function prefKey(userId?: string): string {
  return userId ? `${PREF_KEY_BASE}.${userId}` : PREF_KEY_BASE;
}

export function loadPrefs(userId?: string): WorkspacePrefs {
  try {
    const raw = window.localStorage.getItem(prefKey(userId));
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ...DEFAULT_PREFS };
    const p = parsed as Record<string, unknown>;
    return {
      activeView: typeof p.activeView === "string" && p.activeView ? p.activeView : DEFAULT_PREFS.activeView,
      openThreadId: typeof p.openThreadId === "string" ? p.openThreadId : null,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(prefs: WorkspacePrefs, userId?: string): void {
  try {
    window.localStorage.setItem(prefKey(userId), JSON.stringify(prefs));
  } catch {
    // storage unavailable in guest/private mode — ignore
  }
}

/**
 * Pick the best view format from an AFP message's views array.
 * Returns the highest-priority view whose format is in the known set,
 * or null if no suitable view exists (caller renders a generic card).
 */
export function pickView(message: AfpMessage, known: string[]): AfpView | null {
  if (!message.views?.length) return null;
  const sorted = [...message.views].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return sorted.find((v) => known.includes(v.format)) ?? null;
}

export const KNOWN_VIEW_FORMATS = [
  "email",
  "rich_text",
  "canvas",
  "table",
  "calendar",
  "attachments",
  "approvals",
  "search_result",
  "task_card",
  "generative_card",
  "a2ui.v1",
  "ui_blueprint",
  "ui_presentation",
  "blueprint",
  // Single-node A2UI view formats emitted by backend agents (watcher, synthesizer, etc.)
  "insight_line",
  "action_chips",
  "stat_row",
] as const;

// ── Master agent / dashboard API ─────────────────────────────────────────────

export const getDashboardSession = () => apiFetch("/dashboard/session");
export const getFleet = () => apiFetch("/agent/fleet");
export const getPublicFeed = (limit = 20) => apiFetch(`/feed/public?limit=${limit}`);
export const createFocusItem = (data: { title: string; description?: string; priority?: string }) =>
  apiFetch("/agent/focus", { method: "POST", bodyJson: data });
export const updateFocusItem = (id: string, data: { status?: string; priority?: string }) =>
  apiFetch(`/agent/focus/${id}`, { method: "PATCH", bodyJson: data });
async function withRetry<T>(fn: () => Promise<T>, attempts = 2, baseDelayMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastError = e;
      if (i < attempts - 1) await new Promise<void>((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastError;
}

export const orchestrate = (objective: string, options?: { thread_id?: string }) =>
  withRetry(() => apiFetch("/agent/orchestrate", { method: "POST", bodyJson: { objective, ...options } }));
export const onboard = (answers: Record<string, string>) =>
  apiFetch("/agent/onboarding", { method: "POST", bodyJson: answers });
export const createDelegation = (scope: string, mask: string, expiresIn: number) =>
  apiFetch("/agent/delegate", { method: "POST", bodyJson: { scope, mask, expires_in: expiresIn } });
export const revokeDelegation = (id: string) =>
  apiFetch(`/agent/delegate/${id}`, { method: "DELETE" });
export const updateLoraConfidence = (score: number) =>
  apiFetch("/agent/lora-confidence", { method: "PATCH", bodyJson: { score } });

export const listWorkflows = (includeArchived = false, limit = 50) =>
  apiFetch<WorkflowListResponse>(
    `/workflows?include_archived=${includeArchived ? "true" : "false"}&limit=${limit}`,
  );

export const getWorkflow = (workflowId: string) =>
  apiFetch<SavedWorkflow>(`/workflows/${encodeURIComponent(workflowId)}`);

export const saveWorkflow = (body: {
  graph: Record<string, unknown>;
  latest_ir?: Record<string, unknown> | null;
  favorite?: boolean;
  archived?: boolean;
}) =>
  apiFetch<{ saved: boolean; workflow: SavedWorkflow }>("/workflows", {
    method: "POST",
    bodyJson: body,
  });

export const patchWorkflow = (
  workflowId: string,
  body:
    | {
        op: "workflow_meta_replace";
        title?: string;
        description?: string;
        environment?: string;
        optimization_mode?: string;
      }
    | {
        op: "node_meta_replace";
        node_id: string;
        label?: string;
        description?: string;
      }
    | { op: "node_move"; node_id: string; x: number; y: number }
    | { op: "root_toggle"; node_id: string; root_enabled: boolean }
    | { op: "edge_add"; source: string; target: string; condition_label?: string }
    | { op: "edge_meta_replace"; edge_id: string; condition_label?: string }
    | { op: "edge_remove"; edge_id: string }
    | { op: "node_delete"; node_id: string }
    | { op: "node_config_replace"; node_id: string; config: Record<string, unknown> }
    | { op: "node_policy_replace"; node_id: string; policy: Record<string, unknown> }
    | {
        op: "node_prompt_replace";
        node_id: string;
        prompt: {
          system_prompt?: string;
          instruction_prompt?: string;
          user_editable?: boolean;
        };
      },
) =>
  apiFetch<{ patched: boolean; ir_invalidated: boolean; workflow: SavedWorkflow }>(
    `/workflows/${encodeURIComponent(workflowId)}/patch`,
    {
      method: "POST",
      bodyJson: body,
    },
  );

export const validateWorkflow = (graph: Record<string, unknown>) =>
  apiFetch<WorkflowValidationResponse>("/workflows/validate", {
    method: "POST",
    bodyJson: { graph },
  });

export const describeWorkflow = (body: {
  intent: string;
  base_workflow?: SavedWorkflow | null;
  preset_override?: string;
  optimization_override?: "balanced" | "speed" | "cost";
  regeneration_mode?: "rebuild" | "preserve_manual";
  save_draft?: boolean;
  branch_from_workflow_id?: string;
  branch_from_event_id?: string;
}) =>
  apiFetch<WorkflowDescribeResponse>("/workflows/describe", {
    method: "POST",
    bodyJson: body,
  });

export const compileWorkflow = (workflowId: string) =>
  apiFetch<WorkflowCompileResponse>(`/workflows/${encodeURIComponent(workflowId)}/compile`, {
    method: "POST",
  });

export const listWorkflowDeployments = (workflowId: string) =>
  apiFetch<WorkflowDeploymentsResponse>(`/workflows/${encodeURIComponent(workflowId)}/deployments`);

export const listWorkflowRuns = (workflowId: string) =>
  apiFetch<WorkflowRunsResponse>(`/workflows/${encodeURIComponent(workflowId)}/runs`);

export const startWorkflowRun = (
  workflowId: string,
  body: { deployment_id?: string; replay_run_id?: string; trigger_kind?: string },
) =>
  apiFetch<WorkflowRunStartResponse>(`/workflows/${encodeURIComponent(workflowId)}/runs`, {
    method: "POST",
    bodyJson: body,
  });

export const listWorkflowWaitResumeRecords = (workflowId: string, runId: string) =>
  apiFetch<WorkflowWaitResumeListResponse>(
    `/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}/wait-resume`,
  );

export const decideWorkflowWaitResume = (
  workflowId: string,
  runId: string,
  waitResumeId: string,
  body: { decision: "approved" | "rejected"; option_id?: string; note?: string },
) =>
  apiFetch<WorkflowWaitResumeDecisionResponse>(
    `/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}/wait-resume/${encodeURIComponent(waitResumeId)}/decision`,
    {
      method: "POST",
      bodyJson: body,
    },
  );

export const runWorkflowAction = (
  workflowId: string,
  body: {
    action: "favorite" | "archive" | "deploy" | "rollback";
    favorite?: boolean;
    archived?: boolean;
    environment?: "dev" | "prod";
    deployment_id?: string;
    connector_overrides?: WorkflowConnectorOverrides;
  },
) =>
  apiFetch<WorkflowActionResponse>(`/workflows/${encodeURIComponent(workflowId)}/action`, {
    method: "POST",
    bodyJson: body,
  });

export const listWorkflowTriggerRegistrations = (workflowId: string, deploymentId?: string) => {
  const params = deploymentId ? `?deployment_id=${encodeURIComponent(deploymentId)}` : "";
  return apiFetch<{ registrations: Record<string, unknown>[] }>(
    `/workflows/${encodeURIComponent(workflowId)}/trigger-registrations${params}`,
  );
};

export const updateWorkflowTriggerRegistrationStatus = (
  workflowId: string,
  registrationId: string,
  status: "preview" | "registered" | "paused" | "unhealthy" | "retired",
) =>
  apiFetch<{ ok: boolean }>(
    `/workflows/${encodeURIComponent(workflowId)}/trigger-registrations/${encodeURIComponent(registrationId)}/status`,
    { method: "POST", bodyJson: { status } },
  );

export const listWorkflowTriggerObservations = (workflowId: string, registrationId?: string) => {
  const params = registrationId ? `?registration_id=${encodeURIComponent(registrationId)}` : "";
  return apiFetch<{ workflow_id: string; trigger_observations: Record<string, unknown>[] }>(
    `/workflows/${encodeURIComponent(workflowId)}/trigger-observations${params}`,
  );
};

export const getWorkflowConnectorAdapters = () =>
  apiFetch<{ adapters: Record<string, unknown> }>("/workflows/connector-adapters");

/** Fetch the user's AFP encryption key for client-side decryption. */
export const fetchEncKey = () =>
  apiFetch<{ enc_key_hex: string; algorithm: string }>("/agent/keys");

// ── LLM config ───────────────────────────────────────────────────────────────

export type LlmConfig = {
  id: string;
  backend: "hosted" | "byok" | "ollama" | "runpod";
  provider: string;
  model: string;
  ollama_url?: string | null;
  monthly_budget_cents: number;
  usage_cents_current_month: number;
};

export const fetchLlmConfig = () =>
  apiFetch<LlmConfig>("/user/llm-config");

export type CostSummary = {
  user_id: string;
  total_usd: number;
  total_tokens: number;
  event_count: number;
  run_count: number;
};

export type CostBudget = {
  user_id?: string;
  max_cost_usd: number;
  max_api_calls: number;
  max_llm_tokens: number;
  soft_limit_ratio: number;
  degradation_policy?: "downgrade" | "cache_only" | "halt" | string;
};

export type CostProfitSummary = {
  user_id: string;
  pricing_tier: string;
  tier_max_stage: number;
  daily_deep_query_limit: number;
  deep_queries_today: number;
  budget_max_cost_usd: number;
  cost_day_usd: number;
  cost_month_usd: number;
  estimated_monthly_revenue_usd: number;
  estimated_monthly_margin_usd: number;
  margin_guard_active: boolean;
  usage_guard_active: boolean;
};

export type SpendHistoryEntry = {
  day: string;
  cost_usd: number;
  api_calls: number;
  tokens: number;
};

export const fetchCostSummary = () =>
  apiFetch<CostSummary>("/api/cost/summary");

export const fetchCostProfitSummary = () =>
  apiFetch<CostProfitSummary>("/api/cost/profit/summary");

export const getCostBudget = () =>
  apiFetch<CostBudget>("/api/cost/budget");

export const upsertCostBudget = (body: Partial<CostBudget>) =>
  apiFetch<{ ok: boolean }>("/api/cost/budget", { method: "POST", bodyJson: body });

export const fetchSpendHistory = (days = 30) =>
  apiFetch<{ days: number; history: SpendHistoryEntry[] }>(
    `/agent/spend-history?days=${encodeURIComponent(String(days))}`,
  );

export const saveLlmConfig = (data: {
  backend: string;
  provider?: string;
  model?: string;
  api_key?: string;
  ollama_url?: string;
}) => apiFetch("/user/llm-config", { method: "POST", bodyJson: data });

export const pingLlmConfig = () =>
  apiFetch<{ ok: boolean; backend?: string; provider?: string; http_status?: number; reason?: string }>("/user/llm-config/ping", { method: "POST" });

export type BillingStatus = {
  plan: string;
  status: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_end?: string | null;
};

export const getBillingStatus = () =>
  apiFetch<BillingStatus>("/billing/status");

export const getAuthSession = () =>
  apiFetch<Session["user"]>("/auth/session");

// ── Capability registry ────────────────────────────────────────────────────

export type CapabilityDescriptor = {
  id: string;
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown> | null;
  version: string;
  tags: string[];
  approval_mode: "autonomous" | "suggest_only" | "human_approval_required";
  created_at: string;
  enabled?: boolean;
};

export const registerCapability = (d: Omit<CapabilityDescriptor, "id" | "created_at">) =>
  apiFetch<CapabilityDescriptor>("/agent/capability", { method: "POST", bodyJson: d });

export const listCapabilities = () =>
  apiFetch<CapabilityDescriptor[]>("/agent/capabilities");

export const deleteCapability = (id: string) =>
  apiFetch(`/agent/capability/${id}`, { method: "DELETE" });

export const patchCapability = (id: string, patch: Partial<Pick<CapabilityDescriptor, "approval_mode">>) =>
  apiFetch<CapabilityDescriptor>(`/agent/capability/${id}`, { method: "PATCH", bodyJson: patch });

// ── Agent personas ────────────────────────────────────────────────────────────

export type AgentPersona = {
  id: string;
  owner_user_id: string;
  name: string;
  soul_md: string;
  writing_style: string;
  skills_json: string[];
  lora_confidence_score: number;
  lora_genome_active: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export const listPersonas = () =>
  apiFetch<{ personas: AgentPersona[] }>("/agent/personas");

export const createPersona = (d: { name: string; soul_md?: string; writing_style?: string; skills?: string[] }) =>
  apiFetch<{ persona: AgentPersona }>("/agent/personas", { method: "POST", bodyJson: d });

export const updatePersona = (id: string, d: { name?: string; soul_md?: string; writing_style?: string; skills?: string[]; lora_confidence_score?: number }) =>
  apiFetch<{ persona: AgentPersona }>(`/agent/personas/${encodeURIComponent(id)}`, { method: "PUT", bodyJson: d });

export const activatePersona = (id: string) =>
  apiFetch<{ activated: string }>(`/agent/personas/${encodeURIComponent(id)}/activate`, { method: "POST" });

export const deletePersona = (id: string) =>
  apiFetch<{ deleted: string }>(`/agent/personas/${encodeURIComponent(id)}`, { method: "DELETE" });

// ── Note creation (used by drag-and-drop) ─────────────────────────────────────

function escapeMd(s: string): string {
  // Escape characters that have structural meaning in Markdown
  return s.replace(/[\\`*_{}[\]()#+\-.!|]/g, "\\$&").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function createNoteFromThread(opts: {
  threadId: string;
  title: string;
  summary: string;
  sourceMessageId?: string;
}): Promise<{ message_id: string }> {
  const noteThreadId = `note_from_email_${opts.threadId}_${Date.now()}`;
  const safeTitle = escapeMd(opts.title);
  const safeSummary = escapeMd(opts.summary);
  const content = {
    markdown: `# ${safeTitle}\n\n${safeSummary}\n\n---\n*Clipped from email thread*`,
    text: opts.summary,
  };
  const references = opts.sourceMessageId
    ? [{ id: opts.sourceMessageId, rel: "source_email" }]
    : [];
  return apiFetch<{ success: boolean; message_id: string }>("/send", {
    method: "POST",
    bodyJson: {
      thread_id: noteThreadId,
      parent_id: null,
      from: "agent:notes",
      to: [],
      timestamp: new Date().toISOString(),
      type: "note",
      subtype: "content",
      content,
      views: [{ format: "rich_text", content: { markdown: content.markdown }, priority: 1 }],
      attachments: [],
      references,
      metadata: { origin: "email_drag_drop", source_thread_id: opts.threadId },
      store_in_relational: true,
      signature: "",
    },
  });
}

// ── Feed follow / engage ──────────────────────────────────────────────────────

export type AgentSearchResult = {
  id: string;
  agent_id: string;
  name: string;
  status: string;
};

export const searchAgents = (q: string, limit = 20) =>
  apiFetch<{ agents: AgentSearchResult[] }>(`/feed/search?q=${encodeURIComponent(q)}&limit=${limit}`);

export const followAgent = (agentId: string) =>
  apiFetch(`/feed/follow/${encodeURIComponent(agentId)}`, { method: "POST" });

export const unfollowAgent = (agentId: string) =>
  apiFetch(`/feed/follow/${encodeURIComponent(agentId)}`, { method: "DELETE" });

export const listFollowing = () =>
  apiFetch<{ following: Array<{ followed_agent_id: string; created_at: string }> }>("/feed/following");

export const recordEngagement = (messageId: string, type: "view" | "share" | "reply") =>
  apiFetch("/feed/engage", { method: "POST", bodyJson: { message_id: messageId, type } });

// ── Calendar events ───────────────────────────────────────────────────────────

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at?: string | null;
  all_day: boolean;
  location?: string | null;
  status: "confirmed" | "tentative" | "cancelled";
};

export const listCalendarEvents = (month: string) =>
  apiFetch<{ events: CalendarEvent[] }>(`/calendar/events?month=${encodeURIComponent(month)}`);

export const createCalendarEvent = (data: {
  title: string;
  description?: string;
  start_at: string;
  end_at?: string;
  all_day?: boolean;
  location?: string;
}) => apiFetch<CalendarEvent>("/calendar/events", { method: "POST", bodyJson: data });

export const deleteCalendarEvent = (id: string) =>
  apiFetch<{ deleted: boolean }>(`/calendar/events/${encodeURIComponent(id)}`, { method: "DELETE" });

// ── Knowledge Curator — backlinks & graph ─────────────────────────────────────

export type BacklinkItem = {
  backlink_id: string;
  source_id: string;
  target_id: string;
  direction: "inbound" | "outbound";
  link_kind: string;
  similarity: number;
  entities: string[];
  created_at: string;
};

export type BacklinksResponse = {
  message_id: string;
  backlinks: BacklinkItem[];
  count: number;
};

export type BacklinksGraphResponse = {
  root: string;
  depth: number;
  nodes: string[];
  edges: Omit<BacklinkItem, "direction">[];
  node_count: number;
  edge_count: number;
};

export const fetchBacklinksForMessage = (messageId: string) =>
  apiFetch<BacklinksResponse>(`/notes/backlinks/${encodeURIComponent(messageId)}`);

export const fetchBacklinksGraph = (rootId: string, depth = 2) =>
  apiFetch<BacklinksGraphResponse>(
    `/backlinks/graph?root=${encodeURIComponent(rootId)}&depth=${depth}`,
  );

export const installDefaultSupertags = () =>
  apiFetch<{ installed: string[]; count: number }>("/notes/supertags/install-defaults", {
    method: "POST",
  });

// ── Agent Alias Registry ──────────────────────────────────────────────────────

export type AliasCheckResult = {
  available: boolean;
  valid: boolean;
  reason: string;
};

export type AliasRecord = {
  alias: string | null;
  agent_id?: string;
  display_address?: string;
  created_at?: string;
  last_changed_at?: string;
  next_change_at?: string;
};

export const checkAlias = (alias: string) =>
  apiFetch<AliasCheckResult>(`/api/alias/check?alias=${encodeURIComponent(alias)}`);

export const getMyAlias = () =>
  apiFetch<AliasRecord>("/api/alias/mine");

export const claimAlias = (alias: string, agent_id?: string) =>
  apiFetch<AliasRecord>("/api/alias/claim", { method: "POST", bodyJson: { alias, agent_id } });

export const changeAlias = (alias: string) =>
  apiFetch<AliasRecord>("/api/alias/change", { method: "POST", bodyJson: { alias } });

// ── Agent preferences ─────────────────────────────────────────────────────────

export type AgentPreferences = {
  optimization_mode: "speed" | "cost" | "balanced";
  auto_confirm_threshold_cents: number;
  show_cost_estimates: boolean;
  default_store_in_history: boolean;
  response_queue_policy?: {
    supplier_due_hours: number;
    friend_due_hours: number;
    general_due_hours: number;
    prioritize_with_local_llm: boolean;
    allow_remote_fallback: boolean;
  };
};

export const getAgentPreferences = () =>
  apiFetch<AgentPreferences>("/user/agent-preferences");

export const setAgentPreferences = (prefs: AgentPreferences) =>
  apiFetch<{ updated: boolean }>("/user/agent-preferences", { method: "POST", bodyJson: prefs });

export type McpToolConnection = {
  id: string;
  tool_slug: string;
  tool_name: string;
  mcp_server_url: string;
  connected_at: string;
};

export type SkillCapsuleCatalogEntry = {
  id: string;
  title: string;
  category: string;
  description: string;
  integration_mode: string;
  surfaces: string[];
  existing_runtime_fit: string;
  compose_scaffold?: string;
  compose_placeholder?: string;
  capsule_kind?: string;
  tags?: string[];
};

export const fetchToolConnections = () =>
  apiFetch<{ connections: McpToolConnection[] }>("/tools/connections");

export const connectTool = (body: Record<string, unknown>) =>
  apiFetch<{ ok: boolean }>("/tools/connections", { method: "POST", bodyJson: body });

export const disconnectTool = (slug: string) =>
  apiFetch<{ ok: boolean }>(`/tools/connections/${encodeURIComponent(slug)}`, {
    method: "DELETE",
  });

export const fetchSkillCapsuleCatalog = () =>
  apiFetch<{
    available: boolean;
    catalog: SkillCapsuleCatalogEntry[];
    warnings: string[];
    workspace: { selected_skill_ids: string[] };
  }>("/skill-capsule/catalog");

export const generateSkillCapsule = (description: string) =>
  apiFetch<{ entry: SkillCapsuleCatalogEntry }>("/skill-capsule/generate", {
    method: "POST",
    bodyJson: { description },
  });

export const saveWorkspaceSkillSelection = (selected_skill_ids: string[]) =>
  apiFetch<{
    selected_skill_ids: string[];
    reasoning_guidance?: string[];
    warnings?: string[];
  }>("/skill-capsule/workspace", {
    method: "POST",
    bodyJson: { selected_skill_ids },
  });

// ── Generative card decisions ─────────────────────────────────────────────────

export type UiDecisionRequest = {
  card_id: string;
  decision_point_id: string;
  selected_option_id: string;
  thread_id: string;
  agent_id?: string;
};

export const submitDecision = (req: UiDecisionRequest) =>
  apiFetch<{ success: boolean; message_id: string }>("/ui/decision", {
    method: "POST",
    bodyJson: req,
  });

/**
 * Sanitize a URL coming from agent/server data before placing it in an href.
 * Only http: and https: are permitted. Any other scheme (javascript:, data:, etc.)
 * returns "#" so the link is inert rather than executable.
 */
export function safeHref(url: unknown): string {
  if (typeof url !== "string" || !url.trim()) return "#";
  try {
    const u = new URL(url.trim());
    if (u.protocol === "https:" || u.protocol === "http:") return url.trim();
  } catch { /* relative URL — check it's not a protocol-less attack vector */ }
  // Accept relative paths only — block protocol-relative URLs (//host) (GAP-103).
  const trimmed = url.trim();
  if (/^\.\//.test(trimmed) || /^\/[^/]/.test(trimmed)) return trimmed;
  return "#";
}

export const updateAgentSettings = (settings: { auto_approve_workflows?: boolean }) =>
  apiFetch<{ ok: boolean }>("/agent/settings", { method: "PATCH", bodyJson: settings });

/** Opens a native EventSource for the run SSE stream. Caller is responsible for closing it. */
export function openRunStream(workflowId: string, runId: string): EventSource {
  return new EventSource(`${API_BASE}/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(runId)}/stream`);
}

// ── Token budget / LLM provider management ──────────────────────────────────

export type TokenBudgetStatus = {
  status: "ok" | "warning" | "exceeded";
  budget_cents: number;
  used_cents: number;
  remaining_cents: number;
  reset_at: string;
  daily_used_tokens: number;
  daily_limit_tokens: number;
  usage_pct: number;
  escalation_enabled: boolean;
};

export type UserLlmProvider = {
  id: string;
  name: string;
  provider: string;
  display_name: string;
  backend: string;
  model: string;
  model_id: string;
  is_default: boolean;
  priority: number;
  has_api_key: boolean;
  consent_given: boolean;
};

export type UpsertLlmProviderInput = {
  provider?: string;
  display_name?: string;
  model_id?: string;
  api_key?: string;
  base_url?: string;
  consent?: boolean;
  backend?: string;
  model?: string;
  is_default?: boolean;
};

export const getTokenBudget = () =>
  apiFetch<TokenBudgetStatus>("/api/cost/budget");

export const updateTokenBudget = (patch: { escalation_enabled?: boolean; budget_cents?: number }) =>
  apiFetch<{ ok: boolean }>("/api/cost/budget", { method: "POST", bodyJson: patch });

export const listLlmProviders = () =>
  apiFetch<{ providers: UserLlmProvider[] }>("/user/llm-providers");

export const upsertLlmProvider = (input: UpsertLlmProviderInput) =>
  apiFetch<UserLlmProvider>("/user/llm-providers", { method: "POST", bodyJson: input });

export const deleteLlmProvider = (id: string) =>
  apiFetch<{ ok: boolean }>(`/user/llm-providers/${encodeURIComponent(id)}`, { method: "DELETE" });

// ── Continuity / briefing / behavioural synthesis ────────────────────────────

export type ContinuityMessage = {
  id: string;
  type: string;
  content: Record<string, unknown>;
  timestamp: string;
};

export const getContinuitySummary = () =>
  apiFetch<{ messages: ContinuityMessage[] }>("/dashboard/continuity");

export const generateProjections = () =>
  apiFetch<{ ok: boolean }>("/dashboard/projections", { method: "POST" });

export const generateTemporalProjection = (opts: number | Record<string, unknown>) =>
  apiFetch<{ ok: boolean }>("/dashboard/temporal-projection", {
    method: "POST",
    bodyJson: typeof opts === "number" ? { days: opts } : opts,
  });

export const synthesizeBehaviorPatterns = () =>
  apiFetch<{ ok: boolean }>("/dashboard/behavior-patterns", { method: "POST" });

export const synthesizeState = () =>
  apiFetch<{ ok: boolean }>("/dashboard/state-synthesis", { method: "POST" });

// ── Agent memory ─────────────────────────────────────────────────────────────

export type AgentMemoryPointerBundle = {
  items: unknown[];
  token_estimate: number;
  pointers_text: string;
  harness?: string;
};

export type AgentMemoryItem = {
  id: string;
  content: string;
  created_at: string;
  updated_at?: string;
  tier?: string;
  type?: string;
  status?: string;
  confidence?: number;
  namespace?: string | null;
  role?: string | null;
  repo_state_hash?: string | null;
  citations?: string[];
};

export type AgentMemoryWarning = {
  code: string;
  message: string;
  memory_id?: string | null;
};

export type AgentMemoryResponse = {
  configured?: boolean;
  available?: boolean;
  source?: string;
  agent_id?: string;
  query?: Record<string, unknown>;
  memories?: AgentMemoryItem[];
  items?: AgentMemoryItem[];
  evidence?: unknown[];
  warnings?: AgentMemoryWarning[];
  pointer_bundle?: AgentMemoryPointerBundle | null;
  message?: string;
};

export const fetchAgentMemory = (agentId: string, opts?: Record<string, unknown>) =>
  apiFetch<AgentMemoryResponse>(`/agent/${encodeURIComponent(agentId)}/memory`, {
    method: "POST",
    bodyJson: opts ?? {},
  });

export const setCapabilityEnabled = (id: string, enabled: boolean) =>
  apiFetch<CapabilityDescriptor>(`/agent/capability/${encodeURIComponent(id)}/enabled`, {
    method: "PATCH",
    bodyJson: { enabled },
  });

export const extractDocument = (
  threadId: string,
  messageId: string,
  opts: { title?: string },
) =>
  apiFetch<{ row_count: number; column_count: number; quality_status: string }>(
    `/thread/${encodeURIComponent(threadId)}/message/${encodeURIComponent(messageId)}/extract-document`,
    { method: "POST", bodyJson: opts },
  );

// ── Planning ──────────────────────────────────────────────────────────────────

export type PlanAssumption = {
  key: string;
  value: string;
  label?: string;
  editable?: boolean;
};

export type PlanOption = {
  id?: string;
  title: string;
  description: string;
  rationale: string;
  metric_label?: string;
  metric_value?: string;
  confidence?: string;
  risk_flags: string[];
  follow_up_chips?: string[];
};

export type PlanningQueryResponse = {
  thread_id?: string;
  correlation_id?: string;
  goal?: string;
  summary?: string;
  options?: PlanOption[];
  assumptions: PlanAssumption[];
  unresolved?: string[];
  comparison_headers?: string[];
  comparison_rows?: Array<{ label: string; values: string[] }>;
};

export const submitPlanningQuery = (body: {
  query: string;
  session_state?: Record<string, unknown>;
  thread_id?: string;
  assumption_delta?: { key: string; value: string };
}) =>
  apiFetch<PlanningQueryResponse>("/ui/planning", { method: "POST", bodyJson: body });

// ── Claim neighborhood ────────────────────────────────────────────────────────

export type ClaimNeighborhoodResponse = {
  a2ui?: Record<string, unknown>;
  filters?: Record<string, unknown>;
  groups?: unknown[];
  message_id?: string;
};

export const fetchClaimNeighborhood = (
  messageId: string,
  opts: { stance?: string; depth?: number; limit_per_group?: number },
) =>
  apiFetch<ClaimNeighborhoodResponse>(
    `/knowledge/claim-neighborhood/${encodeURIComponent(messageId)}`,
    { method: "POST", bodyJson: opts },
  );
