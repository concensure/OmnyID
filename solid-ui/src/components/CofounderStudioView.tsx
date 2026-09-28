import { createSignal, For, Show, onCleanup } from "solid-js";
import {
  approvalOptionActionTitle,
  approvalOptionLabel,
  approvalPendingStatusLabel,
} from "afp-ts/continuity";
import { workflowApprovalGateCountSummary } from "@/lib/workflowGraphCopy";
import {
  saveWorkflow,
  startWorkflowRun,
  openRunStream,
  listWorkflowWaitResumeRecords,
  decideWorkflowWaitResume,
} from "@/lib/api";
import {
  buildCofounderStudioFailureReceipt,
  type CofounderStudioFailureReceipt,
} from "@/lib/cofounderStudioFailureState";
import { isRecord } from "@/lib/eventDetail";
import { parseCofounderStudioStreamEvent } from "@/lib/cofounderStudioStreamState";
import { ApprovalDecisionButtons } from "@/components/ApprovalDecisionButtons";
import { ProcessingGlyph } from "@/components/ProcessingGlyph";
import { TiptapEditor } from "@/components/editor/TiptapEditor";

// ── Stage definitions ─────────────────────────────────────────────────────────

type StageId =
  | "idea_refiner"
  | "market_research"
  | "founder_fit"
  | "valuation"
  | "valuation_gate"
  | "asset_generator"
  | "content_scheduler"
  | "review_hub";

type StageStatus = "pending" | "running" | "awaiting_approval" | "complete" | "failed";

type StageOutput = { text?: string; sections?: Array<{ label: string; value: string }> };

type Stage = {
  id: StageId;
  label: string;
  icon: string;
  description: string;
  slotName: string;
  status: StageStatus;
  requiresApproval: boolean;
  output?: StageOutput;
};

const INITIAL_STAGES: Stage[] = [
  { id: "idea_refiner",      label: "Idea Intake & Refinement",    icon: "💡", description: "Clarifies your idea and generates 3–5 refined variants",             slotName: "intake_slot",   status: "pending", requiresApproval: false },
  { id: "market_research",   label: "Market Research & Validation", icon: "🔍", description: "Competition, TAM, trends, and market opportunity analysis",          slotName: "gather_slot",   status: "pending", requiresApproval: false },
  { id: "founder_fit",       label: "Founder-Market Fit",           icon: "🎯", description: "Your background vs. the idea — fit score and risk gaps",             slotName: "context_slot",  status: "pending", requiresApproval: false },
  { id: "valuation",         label: "Dream Score & Valuation",      icon: "💎", description: "Revenue potential, risk level, and Dream Score (0–100)",             slotName: "check_slot",    status: "pending", requiresApproval: true  },
  { id: "valuation_gate",    label: "Valuation Review Gate",        icon: "✋", description: "Human approval required before generating expensive assets",         slotName: "approval_slot", status: "pending", requiresApproval: true  },
  { id: "asset_generator",   label: "Business Plan & Asset Kit",    icon: "📋", description: "Business plan, pitch deck outline, GTM strategy, and branding kit", slotName: "planner_slot",  status: "pending", requiresApproval: false },
  { id: "content_scheduler", label: "Promo Content & Scheduler",    icon: "📣", description: "LinkedIn/X threads, video script, and social schedule",             slotName: "merge_slot",    status: "pending", requiresApproval: false },
  { id: "review_hub",        label: "Final Review & Go/No-Go",      icon: "✅", description: "Full asset kit preview — approve to schedule social posts",         slotName: "finalize_slot", status: "pending", requiresApproval: true  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildLaunchpadGraph(idea: string, ownerUserId: string): Record<string, unknown> {
  const nodeIds = INITIAL_STAGES.map((_, i) => `node-launchpad-${i}`);
  const nodes = INITIAL_STAGES.map((stage, i) => ({
    id: nodeIds[i],
    kind: stage.requiresApproval && stage.id !== "valuation" ? "approval" : (stage.id === "market_research" ? "tool" : "agent"),
    label: stage.label,
    description: stage.description,
    position: { x: 120, y: 120 + i * 160 },
    config: {
      preset_kind: "ai_cofounder_launchpad",
      idea_context: idea,
      template_slot: stage.slotName,
    },
    policy: {
      mask: "private",
      approval_mode: stage.requiresApproval ? "human_approval_required" : "none",
      max_steps: stage.id === "asset_generator" ? 5 : 3,
      max_cost_cents: stage.id === "asset_generator" ? 50 : (stage.id === "valuation" ? 10 : 0),
    },
    prompt: {},
    hidden_runtime_nodes: [],
    metadata: {
      template_id: "launchpad_chain",
      template_slot: stage.slotName,
    },
  }));

  const edges = nodeIds.slice(0, -1).map((src, i) => ({
    id: `edge-launchpad-${i}`,
    source: src,
    target: nodeIds[i + 1],
    metadata: {},
  }));

  return {
    version: "omnyid-workflow.v1",
    workflow_id: "",
    title: `AI Co-Founder Launchpad — ${idea.slice(0, 60)}${idea.length > 60 ? "…" : ""}`,
    description: "End-to-end startup validation + asset generation + social content scheduling",
    status: "draft",
    environment: "dev",
    owner_user_id: ownerUserId,
    root_node_ids: [nodeIds[0]],
    nodes,
    edges,
    presets: [{ preset_kind: "ai_cofounder_launchpad" }],
    template_id: "launchpad_chain",
    template_version: "omnyid-subagent-template.v1",
    template_bindings: INITIAL_STAGES.map((stage, i) => ({
      template_id: "launchpad_chain",
      slot_name: stage.slotName,
      node_ids: [nodeIds[i]],
      metadata: {},
    })),
    optimization_mode: "balanced",
    metadata: { origin: "cofounder_studio", idea },
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CofounderStudioView(props: { onNavigateBack?: () => void }) {
  const [ideaInput, setIdeaInput] = createSignal("");
  const [phase, setPhase] = createSignal<"intake" | "running" | "complete">("intake");
  const [stages, setStages] = createSignal<Stage[]>(INITIAL_STAGES.map(s => ({ ...s })));
  const [workflowId, setWorkflowId] = createSignal<string | null>(null);
  const [runId, setRunId] = createSignal<string | null>(null);
  const [launchError, setLaunchError] = createSignal<CofounderStudioFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<CofounderStudioFailureReceipt | null>(null);
  const [streamError, setStreamError] = createSignal<CofounderStudioFailureReceipt | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [economyMode, setEconomyMode] = createSignal(true);
  const [activeApprovalWaitId, setActiveApprovalWaitId] = createSignal<string | null>(null);
  const [activeApprovalOptions, setActiveApprovalOptions] = createSignal<string[]>([]);
  const [approvalNote, setApprovalNote] = createSignal("");

  let eventSource: EventSource | null = null;

  function updateStage(id: StageId, patch: Partial<Stage>) {
    setStages(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  }

  function currentRunningStageIndex(): number {
    return stages().findIndex(s => s.status === "running" || s.status === "awaiting_approval");
  }

  // ── Run stream ────────────────────────────────────────────────────────────

  function subscribeToRun(wfId: string, rId: string) {
    if (eventSource) { eventSource.close(); eventSource = null; }
    setStreamError(null);
    eventSource = openRunStream(wfId, rId);

    eventSource.addEventListener("node_started", (ev: MessageEvent<string>) => {
      setStreamError(null);
      const data = parseCofounderStudioStreamEvent(ev.data);
      const stage = INITIAL_STAGES.find(s => s.slotName === data?.slotName);
      if (stage) updateStage(stage.id, { status: "running" });
    });

    eventSource.addEventListener("node_completed", (ev: MessageEvent<string>) => {
      setStreamError(null);
      const data = parseCofounderStudioStreamEvent(ev.data);
      const stage = INITIAL_STAGES.find(s => s.slotName === data?.slotName);
      if (stage) {
        const output: StageOutput = {};
        if (typeof data?.output?.summary === "string") output.text = data.output.summary;
        updateStage(stage.id, { status: stage.requiresApproval ? "awaiting_approval" : "complete", output });
        if (stage.requiresApproval) void pollApprovals(wfId, rId);
      }
    });

    eventSource.addEventListener("node_failed", (ev: MessageEvent<string>) => {
      setStreamError(null);
      const data = parseCofounderStudioStreamEvent(ev.data);
      const stage = INITIAL_STAGES.find(s => s.slotName === data?.slotName);
      if (stage) updateStage(stage.id, { status: "failed", output: { text: data?.error ?? "Stage failed" } });
    });

    eventSource.addEventListener("run_completed", () => {
      setStreamError(null);
      setPhase("complete");
      setStages(prev => prev.map(s => s.status !== "failed" ? { ...s, status: "complete" } : s));
      eventSource?.close();
    });

    eventSource.onerror = () => {
      setStreamError(
        buildCofounderStudioFailureReceipt(
          "Run stream",
          "Lost connection to run stream. Retry the stream or check the Automations tab for status.",
        ),
      );
      eventSource?.close();
      eventSource = null;
    };
  }

  onCleanup(() => { eventSource?.close(); });

  function retryRunStream() {
    const wfId = workflowId();
    const rId = runId();
    if (!wfId || !rId) return;
    subscribeToRun(wfId, rId);
  }

  // ── Approval polling ──────────────────────────────────────────────────────

  async function pollApprovals(wfId: string, rId: string) {
    try {
      const res = await listWorkflowWaitResumeRecords(wfId, rId);
      const pending = res.wait_resume_records?.find(r => r.status === "pending");
      if (pending) {
        setActiveApprovalWaitId(pending.wait_resume_id);
        // Extract options from the descriptor if present
        const opts = pending.descriptor?.options as Array<{ id: string }> | undefined;
        setActiveApprovalOptions(opts?.map(o => o.id) ?? ["approved", "rejected"]);
      }
    } catch { /* ignore poll errors */ }
  }

  async function submitApproval(decision: "approved" | "rejected", optionId?: string) {
    const wfId = workflowId();
    const rId = runId();
    const waitId = activeApprovalWaitId();
    if (!wfId || !rId || !waitId) return;

    try {
      setActionError(null);
      await decideWorkflowWaitResume(wfId, rId, waitId, {
        decision,
        option_id: optionId,
        note: approvalNote() || undefined,
      });
      setActiveApprovalWaitId(null);
      setActiveApprovalOptions([]);
      setApprovalNote("");
      setStages(prev => prev.map(s => s.status === "awaiting_approval" ? { ...s, status: "complete" } : s));
    } catch (e) {
      setActionError(
        buildCofounderStudioFailureReceipt(
          decision === "approved" ? "Approve stage" : "Reject stage",
          e instanceof Error ? e.message : "Approval decision failed.",
        ),
      );
    }
  }

  // ── Launch ────────────────────────────────────────────────────────────────

  async function launchWorkflow() {
    const idea = ideaInput().trim();
    if (!idea) return;
    setBusy(true);
    setLaunchError(null);
    setActionError(null);
    setStreamError(null);

    try {
      // 1. Save the workflow
      const graph = buildLaunchpadGraph(idea, "");
      if (economyMode()) {
        // In economy mode cap max_cost_cents at half the normal values
        const nodes = Array.isArray(graph.nodes)
          ? graph.nodes.filter((node): node is Record<string, unknown> => isRecord(node))
          : [];
        nodes.forEach(n => {
          const policy = isRecord(n.policy) ? n.policy : null;
          if (!policy) return;
          if (typeof policy.max_cost_cents === "number" && policy.max_cost_cents > 0) {
            policy.max_cost_cents = Math.ceil(policy.max_cost_cents as number / 2);
          }
        });
      }

      const saved = await saveWorkflow({ graph });
      const wfId = saved.workflow.workflow_id;
      setWorkflowId(wfId);

      // 2. Start a run
      const run = await startWorkflowRun(wfId, { trigger_kind: "manual" });
      const rId = run.run.run_id;
      setRunId(rId);

      // 3. Switch to running view and mark first stage
      setPhase("running");
      updateStage("idea_refiner", { status: "running" });

      // 4. Subscribe to SSE stream
      subscribeToRun(wfId, rId);
    } catch (e) {
      setLaunchError(
        buildCofounderStudioFailureReceipt(
          "Launch startup workflow",
          e instanceof Error ? e.message : "Launch failed.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  // ── Status helpers ────────────────────────────────────────────────────────

  const progressPercent = () => {
    const completed = stages().filter(s => s.status === "complete").length;
    return Math.round((completed / stages().length) * 100);
  };

  const hasAnyOutput = () => stages().some(s => s.output?.text);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div class="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div class="flex items-center justify-between border-b border-white/20 bg-white/10 px-6 py-4 backdrop-blur-sm">
        <div class="flex items-center gap-3">
          <Show when={props.onNavigateBack}>
            <button type="button" onClick={props.onNavigateBack} class="rounded-full border border-white/30 bg-white/20 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/40">← Back</button>
          </Show>
          <div>
            <h1 class="text-lg font-bold text-on-surface">AI Co-Founder Launchpad</h1>
            <p class="text-xs text-on-surface-variant">Private · E2EE · All data stays in your workspace</p>
          </div>
        </div>
        <Show when={phase() === "running"}>
          <div class="flex items-center gap-3">
            <div class="h-2 w-48 overflow-hidden rounded-full bg-white/20">
              <div class="h-full rounded-full bg-primary transition-all duration-700" style={`width: ${progressPercent()}%`} />
            </div>
            <span class="text-xs font-medium text-on-surface-variant">{progressPercent()}%</span>
          </div>
        </Show>
      </div>

      <div class="flex-1 overflow-y-auto">

        {/* ── Intake phase ─────────────────────────────────────────────────── */}
        <Show when={phase() === "intake"}>
          <div class="mx-auto max-w-2xl px-6 py-10">
            {/* Hero */}
            <div class="mb-8 text-center">
              <div class="mb-4 text-5xl">🚀</div>
              <h2 class="mb-2 text-2xl font-bold text-on-surface">Launch Your Startup Idea</h2>
              <p class="text-sm text-on-surface-variant">Tell me your idea. I'll validate it, score it, build the full asset kit, and schedule your launch content — privately, inside your workspace.</p>
            </div>

            {/* Idea input */}
            <div class="mb-6 rounded-[22px] border border-white/40 bg-white/70 p-5 shadow-panel backdrop-blur-md">
              <label class="mb-2 block text-sm font-semibold text-on-surface">Your idea</label>
              <TiptapEditor
                mode="compact"
                initialContent={ideaInput()}
                disabled={busy()}
                placeholder="e.g. A SaaS tool that helps solo founders track their MRR, churn, and growth metrics in one place - no code required..."
                submitLabel={busy() ? "Launching..." : "Launch startup idea"}
                clearOnSend={false}
                onChange={(_text, markdown) => setIdeaInput(markdown)}
                onSend={async (payload) => {
                  setIdeaInput(payload.markdown || payload.text);
                  await launchWorkflow();
                }}
              />
              <p class="mt-2 text-[11px] text-on-surface-variant">Be as brief or detailed as you like. The AI will ask clarifying questions in the first stage.</p>
            </div>

            {/* Economy mode toggle */}
            <div class="mb-6 flex items-center gap-3 rounded-2xl border border-amber-200/50 bg-amber-50/60 px-4 py-3">
              <button
                type="button"
                role="switch"
                aria-checked={economyMode()}
                onClick={() => setEconomyMode(v => !v)}
                class={`relative h-5 w-9 rounded-full border transition ${economyMode() ? "border-amber-500 bg-amber-400" : "border-white/50 bg-white/50"}`}
              >
                <span class={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${economyMode() ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
              <div>
                <p class="text-xs font-semibold text-amber-800">Economy Mode {economyMode() ? "ON" : "OFF"}</p>
                <p class="text-[10px] text-amber-700">Uses lighter models for early stages. Saves ~50% on token costs. Recommended for exploration.</p>
              </div>
            </div>

            {/* 7-stage preview */}
            <div class="mb-6 rounded-[22px] border border-white/30 bg-white/40 p-4">
              <p class="mb-3 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">What happens when you launch</p>
              <div class="space-y-2">
                <For each={INITIAL_STAGES}>{(stage) => (
                  <div class="flex items-center gap-3">
                    <span class="text-lg">{stage.icon}</span>
                    <div>
                      <p class="text-xs font-medium text-on-surface">{stage.label}</p>
                      <p class="text-[10px] text-on-surface-variant">{stage.description}</p>
                    </div>
                    <Show when={stage.requiresApproval}>
                      <span class="ml-auto rounded-full border border-amber-200/70 bg-amber-50/80 px-2 py-0.5 text-[9px] font-medium text-amber-700">Approval gate</span>
                    </Show>
                  </div>
                )}</For>
              </div>
            </div>

            {/* Error */}
            <Show when={launchError()}>
              {(receipt) => (
                <div
                  class={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                    receipt().tone === "danger"
                      ? "border-rose-200/70 bg-rose-50/80 text-rose-700"
                      : "border-amber-200/70 bg-amber-50/80 text-amber-800"
                  }`}
                >
                  <p class="font-semibold">{receipt().title}</p>
                  <p class="mt-1">{receipt().summary}</p>
                  <p class="mt-1 text-xs opacity-80">{receipt().nextStep}</p>
                </div>
              )}
            </Show>

            <p class="mt-3 text-center text-[10px] text-on-surface-variant">
              {workflowApprovalGateCountSummary(3)} • All data stays private and E2EE
            </p>
          </div>
        </Show>

        {/* ── Running phase ─────────────────────────────────────────────────── */}
        <Show when={phase() === "running" || phase() === "complete"}>
          <div class="px-6 py-6">

            {/* Idea header */}
            <div class="mb-6 rounded-[22px] border border-white/40 bg-white/60 px-5 py-4 backdrop-blur-sm">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">Your idea</p>
              <p class="mt-1 text-sm font-medium text-on-surface">{ideaInput()}</p>
            </div>

            {/* Stage cards */}
            <div class="space-y-3">
              <For each={stages()}>{(stage) => (
                <StageCard
                  stage={stage}
                  isActiveApproval={stage.status === "awaiting_approval" && activeApprovalWaitId() !== null}
                  approvalOptions={activeApprovalOptions()}
                  approvalNote={approvalNote()}
                  onApprovalNoteChange={setApprovalNote}
                  onApprove={(optionId) => void submitApproval("approved", optionId)}
                  onReject={() => void submitApproval("rejected")}
                />
              )}</For>
            </div>

            {/* Error */}
            <Show when={streamError()}>
              {(receipt) => (
                <div
                  class={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                    receipt().tone === "danger"
                      ? "border-rose-200/70 bg-rose-50/80 text-rose-700"
                      : "border-amber-200/70 bg-amber-50/80 text-amber-800"
                  }`}
                >
                  <div class="min-w-0">
                    <p class="font-semibold">{receipt().title}</p>
                    <p class="mt-1">{receipt().summary}</p>
                    <p class="mt-1 text-xs opacity-80">{receipt().nextStep}</p>
                  </div>
                  <button
                    type="button"
                    onClick={retryRunStream}
                    class={`rounded-full border bg-white/80 px-3 py-1.5 text-xs font-medium transition hover:bg-white ${
                      receipt().tone === "danger"
                        ? "border-rose-200/70 text-rose-700"
                        : "border-amber-200/70 text-amber-800"
                    }`}
                  >
                    Retry stream
                  </button>
                </div>
              )}
            </Show>

            <Show when={actionError()}>
              {(receipt) => (
                <div
                  class={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                    receipt().tone === "danger"
                      ? "border-rose-200/70 bg-rose-50/80 text-rose-700"
                      : "border-amber-200/70 bg-amber-50/80 text-amber-800"
                  }`}
                >
                  <p class="font-semibold">{receipt().title}</p>
                  <p class="mt-1">{receipt().summary}</p>
                  <p class="mt-1 text-xs opacity-80">{receipt().nextStep}</p>
                </div>
              )}
            </Show>

            {/* Complete CTA */}
            <Show when={phase() === "complete"}>
              <div class="mt-6 rounded-[22px] border border-emerald-200/70 bg-emerald-50/80 p-5 text-center">
                <p class="text-xl">🎉</p>
                <p class="mt-2 text-sm font-bold text-emerald-800">Your startup kit is ready!</p>
                <p class="mt-1 text-xs text-emerald-700">All assets are saved as AFP messages in your workspace. Open the Threads view to review and export them.</p>
                <button
                  type="button"
                  onClick={props.onNavigateBack}
                  class="mt-4 rounded-full border border-emerald-300/70 bg-emerald-100/80 px-5 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-200"
                >
                  View in Threads →
                </button>
              </div>
            </Show>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ── StageCard sub-component ───────────────────────────────────────────────────

function StageCard(props: {
  stage: Stage;
  isActiveApproval: boolean;
  approvalOptions: string[];
  approvalNote: string;
  onApprovalNoteChange: (v: string) => void;
  onApprove: (optionId?: string) => void;
  onReject: () => void;
}) {
  const { stage } = props;

  const borderClass = () => {
    switch (stage.status) {
      case "running":           return "border-primary/50 bg-white/80";
      case "awaiting_approval": return "border-amber-400/70 bg-amber-50/80";
      case "complete":          return "border-emerald-300/70 bg-emerald-50/60";
      case "failed":            return "border-rose-300/70 bg-rose-50/60";
      default:                  return "border-white/30 bg-white/40";
    }
  };

  const statusPill = () => {
    switch (stage.status) {
      case "running":           return { text: "Running…", cls: "bg-primary/20 text-primary animate-pulse" };
      case "awaiting_approval": return { text: approvalPendingStatusLabel(), cls: "bg-amber-100/80 text-amber-800" };
      case "complete":          return { text: "Complete", cls: "bg-emerald-100/80 text-emerald-800" };
      case "failed":            return { text: "Failed", cls: "bg-rose-100/80 text-rose-800" };
      default:                  return { text: "Pending", cls: "bg-white/50 text-on-surface-variant" };
    }
  };

  return (
    <div class={`rounded-[18px] border px-5 py-4 transition-all duration-300 ${borderClass()}`}>
      <div class="flex items-start gap-3">
        <span class="text-2xl leading-none">{stage.icon}</span>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <p class="text-sm font-semibold text-on-surface">{stage.label}</p>
            <span class={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusPill().cls}`}>
              <Show when={stage.status === "running"}>
                <ProcessingGlyph class="text-current opacity-80" size={12} strokeWidth={1.55} />
              </Show>
              {statusPill().text}
            </span>
          </div>
          <p class="mt-0.5 text-[11px] text-on-surface-variant">{stage.description}</p>

          {/* Stage output */}
          <Show when={stage.output?.text}>
            <div class="mt-3 rounded-xl border border-white/50 bg-white/60 px-3 py-2">
              <p class="text-xs text-on-surface">{stage.output!.text}</p>
            </div>
          </Show>

          {/* Approval gate UI */}
          <Show when={stage.status === "awaiting_approval" && props.isActiveApproval}>
            <div class="mt-4 rounded-xl border border-amber-200/70 bg-amber-50/60 p-3">
              <p class="mb-2 text-xs font-semibold text-amber-800">Review this stage before proceeding</p>
              <input
                type="text"
                placeholder="Optional note for the agent…"
                value={props.approvalNote}
                onInput={(e) => props.onApprovalNoteChange(e.currentTarget.value)}
                class="mb-3 w-full rounded-lg border border-amber-200/50 bg-white/70 px-3 py-2 text-xs text-on-surface outline-none focus:border-amber-400/60"
              />
              <div class="flex gap-2 flex-wrap">
                <Show when={props.approvalOptions.length > 0} fallback={
                  <>
                    <ApprovalDecisionButtons
                      class="flex gap-2"
                      onApprove={() => props.onApprove()}
                      onReject={props.onReject}
                      approveClass="rounded-full border border-emerald-300/70 bg-emerald-100/80 px-4 py-2 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-200 disabled:opacity-50"
                      rejectClass="rounded-full border border-rose-200/70 bg-rose-50/80 px-4 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                    />
                  </>
                }>
                  <For each={props.approvalOptions}>{(opt) => (
                    <button
                      type="button"
                      title={approvalOptionActionTitle(opt)}
                      onClick={() => props.onApprove(opt)}
                      class="rounded-full border border-sky-200/70 bg-sky-50/80 px-4 py-2 text-xs font-medium text-sky-700 transition hover:bg-sky-100"
                    >
                      {approvalOptionLabel(opt)}
                    </button>
                  )}</For>
                  <button
                    type="button"
                    title={approvalOptionActionTitle("rejected")}
                    onClick={props.onReject}
                    class="rounded-full border border-rose-200/70 bg-rose-50/80 px-4 py-2 text-xs font-medium text-rose-700 transition hover:bg-rose-100"
                  >
                    {approvalOptionLabel("rejected")}
                  </button>
                </Show>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}
