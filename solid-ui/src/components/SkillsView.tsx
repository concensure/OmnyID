// @locs-version: 1.0
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
} from "solid-js";
import {
  fetchSkillCapsuleCatalog,
  generateSkillCapsule,
  readSession,
  saveWorkspaceSkillSelection,
  type SkillCapsuleCatalogEntry,
  type WorkspaceSkillSummary,
} from "@/lib/api";
import {
  subscribeSkillDeactivationEvent,
} from "@/lib/skillDeactivationEvent";
import {
  buildSkillsFailureReceipt,
  type SkillsFailureReceipt,
} from "@/lib/skillsFailureState";
import {
  loadActivationHistory,
  loadActivationTimes,
  loadProfiles,
  saveActivationHistory,
  saveActivationTimes,
  saveProfiles,
  type ActivationRecord,
  type SkillProfile,
} from "@/lib/skillsLocalState";
import {
  categoryColour,
  contextOverheadPct,
  formatCountdown,
  skillActivationHistoryTimestampLabel,
  skillProfileSavedDateLabel,
  totalOverheadPct,
} from "@/lib/skillsPresentation";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { recordShortcutUse } from "@/lib/shortcutRecency";

// â”€â”€ localStorage keys â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type GeneratedSkill = SkillCapsuleCatalogEntry & { generated: true };

// â”€â”€ localStorage helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ Context overhead heuristic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€ TTL countdown helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€ Category pill colours â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€ ContextBudgetBar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ContextBudgetBar(props: { pct: number }) {
  const colour = () =>
    props.pct >= 50 ? "bg-rose-400" : props.pct >= 30 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div class="flex items-center gap-2">
      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-white/30">
        <div
          class={`h-full rounded-full transition-all duration-300 ${colour()}`}
          style={{ width: `${props.pct}%` }}
        />
      </div>
      <span class="w-8 text-right font-mono text-[10px] text-on-surface-variant/60">
        {props.pct}%
      </span>
    </div>
  );
}

// â”€â”€ DeactivateModal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function DeactivateModal(props: {
  skill: SkillCapsuleCatalogEntry;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div class="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        class="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={props.onCancel}
        role="button"
        tabindex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            recordShortcutUse("form_cancel");
            props.onCancel();
          }
        }}
      />
      <div class="relative z-10 w-full max-w-sm animate-fade-in rounded-3xl border border-white/50 bg-white/95 p-6 shadow-xl backdrop-blur-md">
        <h2 class="mb-2 text-base font-semibold text-on-surface">Deactivate skill?</h2>
        <p class="mb-1 text-sm font-medium text-on-surface">{props.skill.title}</p>
        <p class="mb-4 text-xs text-on-surface-variant">
          In-flight tasks will complete under current rules. This capsule's workspace guidance
          will no longer influence new requests after this session.
        </p>
        <div class="rounded-xl border border-amber-200/60 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-800 mb-4">
          <strong>Scope cleanup:</strong> session and thread-bound guidance context will be cleared automatically.
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-xl border border-white/40 bg-white/40 px-4 py-2 text-sm text-on-surface-variant transition hover:bg-white/60"
            onClick={props.onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            class="rounded-xl border border-red-300/50 bg-red-50/80 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
            onClick={props.onConfirm}
          >
            Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€ SkillCard (Active tab) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ActiveSkillCard(props: {
  entry: SkillCapsuleCatalogEntry;
  activatedAt: number | undefined;
  history: ActivationRecord[];
  onDeactivate: () => void;
  expanded: boolean;
  onToggleHistory: () => void;
}) {
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), 30_000);
  onCleanup(() => clearInterval(timer));

  const countdown = createMemo(() =>
    props.activatedAt ? formatCountdown(props.activatedAt, now()) : null,
  );
  const overhead = createMemo(() => contextOverheadPct(props.entry));

  return (
    <div class="rounded-2xl border border-white/40 bg-white/30 p-4 shadow-card backdrop-blur-sm transition hover:bg-white/40">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <div class="mb-1 flex flex-wrap items-center gap-1.5">
            <span
              class={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${categoryColour(props.entry.category)}`}
            >
              {props.entry.category}
            </span>
            {/* Scope badge */}
            <span class="rounded-full border border-emerald-200/60 bg-emerald-50/60 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
              active
            </span>
            {/* TTL countdown â€” only shown when < 20 min remaining */}
            <Show when={countdown()}>
              <span class="rounded-full border border-amber-200/60 bg-amber-50/70 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                â± {countdown()}
              </span>
            </Show>
          </div>
          <p class="text-sm font-semibold text-on-surface">{props.entry.title}</p>
          <p class="mt-0.5 text-xs text-on-surface-variant line-clamp-2">{props.entry.description}</p>
        </div>

        {/* Deactivate button */}
        <button
          type="button"
          onClick={props.onDeactivate}
          class="flex-shrink-0 rounded-xl border border-red-200/50 bg-red-50/60 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100/70"
        >
          Deactivate
        </button>
      </div>

      {/* Context overhead bar */}
      <div class="mt-3">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-[10px] font-medium text-on-surface-variant/70">Context overhead</span>
        </div>
        <ContextBudgetBar pct={overhead()} />
      </div>

      {/* Activation history toggle */}
      <button
        type="button"
        class="mt-2.5 flex items-center gap-1 text-[11px] text-on-surface-variant/60 transition hover:text-on-surface-variant"
        onClick={props.onToggleHistory}
      >
        <span>{props.expanded ? "â–²" : "â–¼"}</span>
        <span>Activation history ({props.history.length})</span>
      </button>
      <Show when={props.expanded && props.history.length > 0}>
        <div class="mt-2 space-y-1 rounded-xl border border-white/30 bg-white/20 p-3">
          <For each={props.history.slice(-5).reverse()}>
            {(record) => (
              <div class="flex items-center justify-between text-[11px]">
                <span class="text-on-surface-variant">
                  {skillActivationHistoryTimestampLabel(record.activated_at)}
                </span>
                <span
                  class={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    record.deactivated_at
                      ? "text-on-surface-variant/50"
                      : "font-medium text-emerald-600"
                  }`}
                >
                  {record.deactivated_at ? "ended" : "active"}
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.expanded && props.history.length === 0}>
        <p class="mt-2 text-[11px] text-on-surface-variant/50">No history yet.</p>
      </Show>
    </div>
  );
}

// â”€â”€ CatalogSkillCard â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function CatalogSkillCard(props: {
  entry: SkillCapsuleCatalogEntry;
  active: boolean;
  generated?: boolean;
  onActivate: () => void;
}) {
  return (
    <div
      class={`rounded-2xl border p-4 transition ${
        props.active
          ? "border-primary/30 bg-primary/5"
          : props.generated
            ? "border-fuchsia-200/60 bg-fuchsia-50/40"
            : "border-white/40 bg-white/25 hover:bg-white/40"
      }`}
    >
      <div class="mb-2 flex flex-wrap items-center gap-1.5">
        <span
          class={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${categoryColour(props.entry.category)}`}
        >
          {props.entry.category}
        </span>
        <Show when={props.generated}>
          <span class="rounded-full border border-fuchsia-200/60 bg-fuchsia-50/80 px-2 py-0.5 text-[10px] font-medium text-fuchsia-700">
            âœ¨ Generated
          </span>
        </Show>
        <For each={(props.entry.tags ?? []).slice(0, 2)}>
          {(tag) => (
            <span class="rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[10px] text-on-surface-variant/60">
              {tag}
            </span>
          )}
        </For>
      </div>

      <p class="text-sm font-semibold text-on-surface">{props.entry.title}</p>
      <p class="mt-0.5 text-xs text-on-surface-variant line-clamp-2">{props.entry.description}</p>

      {/* Context overhead */}
      <div class="mt-2.5">
        <ContextBudgetBar pct={contextOverheadPct(props.entry)} />
      </div>

      <div class="mt-3 flex items-center justify-between">
        <span class="text-[10px] text-on-surface-variant/50">
          {props.entry.integration_mode?.replace(/_/g, " ") ?? ""}
        </span>
        <button
          type="button"
          disabled={props.active}
          onClick={props.onActivate}
          class={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
            props.active
              ? "cursor-default border-primary/20 bg-primary/10 text-primary"
              : "border-primary/30 bg-primary/5 text-primary hover:bg-primary/15"
          }`}
        >
          {props.active ? "Active" : "Activate"}
        </button>
      </div>
    </div>
  );
}

// â”€â”€ AI Chat Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AIChatBar(props: {
  onGenerate: (description: string) => Promise<void>;
  busy: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const [input, setInput] = createSignal("");

  return (
    <div class="rounded-2xl border border-dashed border-primary/30 bg-primary/5 p-4 transition">
      <button
        type="button"
        class="flex w-full items-center gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-lg">
          âœ¨
        </span>
        <div>
          <p class="text-sm font-semibold text-primary">Create a custom skill capsule</p>
          <p class="text-xs text-on-surface-variant">
            Describe what you want your agent to do â€” it will generate a skill for you.
          </p>
        </div>
        <span class="ml-auto text-sm text-primary/60">{open() ? "â–²" : "â–¼"}</span>
      </button>

      <Show when={open()}>
        <div class="mt-4 space-y-2">
          <TiptapEditor
            mode="compact"
            initialContent={input()}
            disabled={props.busy}
            placeholder="e.g. Help me write clear technical documentation with consistent formatting and terminology..."
            submitLabel={props.busy ? "Generating..." : "Generate skill"}
            clearOnSend={false}
            onChange={(text) => setInput(text)}
            onSend={async (payload) => {
              const description = payload.text.trim();
              if (!description) return;
              setInput("");
              await props.onGenerate(description);
            }}
          />
          <div class="mt-2 flex items-center justify-between">
            <p class="text-[11px] text-on-surface-variant/50">
              The agent will create a skill capsule from your description using the built-in template.
            </p>
            <p class="ml-3 hidden text-[11px] text-on-surface-variant/50 sm:block">
              Draft only. Workspace guidance becomes active after you enable it below.
            </p>
          </div>
        </div>
      </Show>
    </div>
  );
}

// â”€â”€ SkillsView â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function SkillsView(props: { signedIn: boolean }) {
  const sessionUserId = readSession()?.user?.id ?? null;
  const [catalog, setCatalog] = createSignal<SkillCapsuleCatalogEntry[]>([]);
  const [activeIds, setActiveIds] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<SkillsFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<SkillsFailureReceipt | null>(null);
  const [activeTab, setActiveTab] = createSignal<"active" | "catalog" | "profiles">("active");
  const [searchQuery, setSearchQuery] = createSignal("");
  const [categoryFilter, setCategoryFilter] = createSignal("");
  const [confirmDeactivate, setConfirmDeactivate] = createSignal<string | null>(null);
  const [expandedHistory, setExpandedHistory] = createSignal<Set<string>>(new Set());
  const [activationTimes, setActivationTimes] = createSignal<Record<string, number>>(loadActivationTimes(sessionUserId));
  const [activationHistory, setActivationHistory] = createSignal<Record<string, ActivationRecord[]>>(loadActivationHistory(sessionUserId));
  const [profiles, setProfiles] = createSignal<SkillProfile[]>(loadProfiles(sessionUserId));
  const [profileNameInput, setProfileNameInput] = createSignal("");
  const [saving, setSaving] = createSignal(false);
  const [generateBusy, setGenerateBusy] = createSignal(false);
  const [generatedSkills, setGeneratedSkills] = createSignal<GeneratedSkill[]>([]);
  const [reasoningGuidance, setReasoningGuidance] = createSignal<string[]>([]);
  const [workspaceSkillSummaries, setWorkspaceSkillSummaries] = createSignal<WorkspaceSkillSummary[]>([]);
  const [runtimeAvailable, setRuntimeAvailable] = createSignal(false);
  const [runtimeConfigured, setRuntimeConfigured] = createSignal(false);
  const [runtimeWarnings, setRuntimeWarnings] = createSignal<string[]>([]);
  const [saveMsg, setSaveMsg] = createSignal<string | null>(null);

  // â”€â”€ Load catalog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function loadCatalog() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSkillCapsuleCatalog();
      setCatalog(data.catalog);
      setActiveIds(data.workspace.selected_skill_ids);
      setReasoningGuidance(data.workspace.reasoning_guidance ?? []);
      setWorkspaceSkillSummaries(data.workspace.selected_skill_summaries ?? []);
      setRuntimeAvailable(Boolean(data.available));
      setRuntimeConfigured(Boolean(data.configured));
      setRuntimeWarnings(data.warnings ?? []);
    } catch (err) {
      setRuntimeAvailable(false);
      setRuntimeConfigured(false);
      setRuntimeWarnings([]);
      setError(
        buildSkillsFailureReceipt(
          "Load catalog",
          err instanceof Error ? err.message : "Could not load skill catalog.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  onMount(async () => {
    await loadCatalog();
  });

  // â”€â”€ Listen for external deactivation events (from thread cards, etc.) â”€â”€â”€â”€â”€â”€
  onMount(() => {
    const unsubscribeSkillDeactivation = subscribeSkillDeactivationEvent((detail) => {
      void doDeactivate(detail.skillId);
    });
    onCleanup(() => unsubscribeSkillDeactivation());
  });

  // â”€â”€ Persist state helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function recordActivation(skillId: string) {
    const times = { ...activationTimes(), [skillId]: Date.now() };
    setActivationTimes(times);
    saveActivationTimes(times, sessionUserId);

    const hist = { ...activationHistory() };
    if (!hist[skillId]) hist[skillId] = [];
    hist[skillId] = [...hist[skillId], {
      activated_at: new Date().toISOString(),
      scope: "--session",
    }];
    setActivationHistory(hist);
    saveActivationHistory(hist, sessionUserId);
  }

  function recordDeactivation(skillId: string) {
    const hist = { ...activationHistory() };
    if (hist[skillId]?.length) {
      const records = [...hist[skillId]];
      const last = records[records.length - 1];
      if (!last.deactivated_at) {
        records[records.length - 1] = { ...last, deactivated_at: new Date().toISOString() };
        hist[skillId] = records;
        setActivationHistory(hist);
        saveActivationHistory(hist, sessionUserId);
      }
    }
  }

  // â”€â”€ Activate / deactivate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function doActivate(skillId: string) {
    const next = [...activeIds(), skillId];
    setSaving(true);
    setActionError(null);
    try {
      const saved = await saveWorkspaceSkillSelection(next);
      setActiveIds(next);
      setReasoningGuidance(saved.reasoning_guidance ?? []);
      setWorkspaceSkillSummaries(saved.selected_skill_summaries ?? []);
      recordActivation(skillId);
      showSaveMsg("Skill activated");
    } catch (err) {
      setActionError(
        buildSkillsFailureReceipt(
          "Activate skill",
          err instanceof Error ? err.message : "Failed to activate skill.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  async function doDeactivate(skillId: string) {
    setConfirmDeactivate(null);
    const next = activeIds().filter((id) => id !== skillId);
    setSaving(true);
    setActionError(null);
    try {
      const saved = await saveWorkspaceSkillSelection(next);
      setActiveIds(next);
      setReasoningGuidance(saved.reasoning_guidance ?? []);
      setWorkspaceSkillSummaries(saved.selected_skill_summaries ?? []);
      recordDeactivation(skillId);
      showSaveMsg("Skill deactivated");
    } catch (err) {
      setActionError(
        buildSkillsFailureReceipt(
          "Deactivate skill",
          err instanceof Error ? err.message : "Failed to deactivate skill.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function showSaveMsg(msg: string) {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(null), 2500);
  }

  // â”€â”€ Toggle history panel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function toggleHistory(skillId: string) {
    setExpandedHistory((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  }

  // â”€â”€ Profiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function saveProfile() {
    const name = profileNameInput().trim();
    if (!name) return;
    const profile: SkillProfile = {
      id: `profile_${Date.now()}`,
      name,
      skill_ids: activeIds(),
      created_at: new Date().toISOString(),
    };
    const updated = [...profiles(), profile];
    setProfiles(updated);
    saveProfiles(updated, sessionUserId);
    setProfileNameInput("");
    showSaveMsg(`Profile "${name}" saved`);
  }

  async function applyProfile(profile: SkillProfile) {
    setSaving(true);
    setActionError(null);
    try {
      const saved = await saveWorkspaceSkillSelection(profile.skill_ids);
      setActiveIds(profile.skill_ids);
      setReasoningGuidance(saved.reasoning_guidance ?? []);
      setWorkspaceSkillSummaries(saved.selected_skill_summaries ?? []);
      profile.skill_ids.forEach((id) => {
        if (!activeIds().includes(id)) recordActivation(id);
      });
      showSaveMsg(`Profile "${profile.name}" applied`);
    } catch (err) {
      setActionError(
        buildSkillsFailureReceipt(
          "Apply profile",
          err instanceof Error ? err.message : "Failed to apply profile.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  function clearProfileDraft() {
    setProfileNameInput("");
    setActionError(null);
  }

  function handleProfileDraftShortcut(event: KeyboardEvent) {
    if (event.key === "Escape" && !saving()) {
      event.preventDefault();
      recordShortcutUse("form_cancel");
      clearProfileDraft();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      recordShortcutUse("form_submit");
      void saveProfile();
    }
  }

  function deleteProfile(profileId: string) {
    const updated = profiles().filter((p) => p.id !== profileId);
    setProfiles(updated);
    saveProfiles(updated, sessionUserId);
  }

  // â”€â”€ AI skill generation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function handleGenerate(description: string) {
    setGenerateBusy(true);
    setActionError(null);
    try {
      const result = await generateSkillCapsule(description);
      if (result?.entry) {
        setGeneratedSkills((prev) => [...prev, { ...result.entry, generated: true }]);
        setActiveTab("catalog");
        showSaveMsg("Skill capsule generated â€” review and activate below");
      }
    } catch (err) {
      setActionError(
        buildSkillsFailureReceipt(
          "Generate skill capsule",
          err instanceof Error ? err.message : "Failed to generate skill capsule.",
        ),
      );
      return;
      showSaveMsg("Skill capsule created â€” review and activate below");
    } finally {
      setGenerateBusy(false);
    }
  }

  // â”€â”€ Derived state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const allCatalogEntries = createMemo(() => [
    ...new Map(
      [...generatedSkills(), ...catalog()].map((entry) => [entry.id, entry]),
    ).values(),
  ]);

  const activeEntries = createMemo(() =>
    allCatalogEntries().filter((e) => activeIds().includes(e.id)),
  );

  const categories = createMemo(() => {
    const cats = new Set(allCatalogEntries().map((e) => e.category));
    return Array.from(cats).sort();
  });

  const filteredCatalog = createMemo(() => {
    const q = searchQuery().toLowerCase().trim();
    const cat = categoryFilter();
    return allCatalogEntries().filter((e) => {
      const matchesCat = !cat || e.category === cat;
      const matchesSearch =
        !q ||
        e.title.toLowerCase().includes(q) ||
        e.description.toLowerCase().includes(q) ||
        (e.tags ?? []).some((t) => t.toLowerCase().includes(q));
      return matchesCat && matchesSearch;
    });
  });

  const totalOverhead = createMemo(() => totalOverheadPct(activeEntries()));

  const confirmEntry = createMemo(() =>
    catalog().find((e) => e.id === confirmDeactivate()) ??
    generatedSkills().find((e) => e.id === confirmDeactivate()) ?? null,
  );

  return (
    <div class="space-y-5">
      {/* â”€â”€ Header â”€â”€ */}
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-on-surface">Skill Capsules</h1>
          <p class="text-sm text-on-surface-variant">
            Manage, activate, and create your agent's skills.
          </p>
        </div>
        <Show when={saveMsg()}>
          <div class="animate-fade-in rounded-full border border-emerald-200/60 bg-emerald-50/90 px-4 py-1.5 text-sm font-medium text-emerald-800 shadow-sm">
            {saveMsg()}
          </div>
        </Show>
      </div>

      {/* â”€â”€ Stats row â”€â”€ */}
      <Show when={!loading() && !error()}>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Active skills", value: activeIds().length, accent: "text-primary" },
            { label: "Catalog total", value: allCatalogEntries().length, accent: "text-on-surface" },
            {
              label: "Total overhead",
              value: `${totalOverhead()}%`,
              accent: totalOverhead() > 50 ? "text-rose-600" : totalOverhead() > 30 ? "text-amber-600" : "text-emerald-600",
            },
            { label: "Saved profiles", value: profiles().length, accent: "text-on-surface" },
          ].map((stat) => (
            <div class="rounded-2xl border border-white/40 bg-white/30 px-4 py-3 shadow-card backdrop-blur-sm">
              <p class={`text-2xl font-bold ${stat.accent}`}>{stat.value}</p>
              <p class="mt-0.5 text-xs text-on-surface-variant">{stat.label}</p>
            </div>
          ))}
        </div>
      </Show>

      {/* â”€â”€ Loading / error â”€â”€ */}
      <Show when={loading()}>
        <div class="rounded-2xl border border-white/40 bg-white/25 p-8 text-center text-sm text-on-surface-variant">
          Loading skill catalogâ€¦
        </div>
      </Show>
      <Show when={error()}>
        <div
          class={`rounded-2xl border p-5 text-sm ${
            error()?.tone === "danger"
              ? "border-red-200/50 bg-red-50/60 text-red-700"
              : "border-amber-200/60 bg-amber-50/70 text-amber-900"
          }`}
        >
          <div class="flex items-start justify-between gap-3">
            <div class="space-y-1">
              <p class="font-semibold">{error()?.title}</p>
              <p>{error()?.summary}</p>
              <p class="text-xs opacity-80">Next step: {error()?.nextStep}</p>
            </div>
            <button
              type="button"
              class="rounded-full border border-current/20 bg-white/90 px-3 py-1.5 text-xs font-medium transition hover:bg-white"
              onClick={() => void loadCatalog()}
            >
              Retry load
            </button>
          </div>
        </div>
      </Show>

      {/* â”€â”€ Tabs â”€â”€ */}
      <Show when={!loading() && !error()}>
        <Show when={actionError()}>
          <div
            class={`rounded-2xl border px-5 py-4 text-sm ${
              actionError()?.tone === "danger"
                ? "border-red-200/50 bg-red-50/60 text-red-700"
                : "border-amber-200/60 bg-amber-50/70 text-amber-900"
            }`}
          >
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <p class="font-semibold">{actionError()?.title}</p>
                <p>{actionError()?.summary}</p>
                <p class="text-xs opacity-80">Next step: {actionError()?.nextStep}</p>
              </div>
              <button
                type="button"
                class="rounded-full border border-current/20 bg-white/90 px-2.5 py-1 text-[11px] font-medium transition hover:bg-white"
                onClick={() => setActionError(null)}
              >
                Dismiss
              </button>
            </div>
          </div>
        </Show>

        <Show when={!runtimeAvailable() || runtimeWarnings().length > 0}>
          <div class="rounded-2xl border border-amber-200/60 bg-amber-50/70 px-5 py-4 text-sm text-amber-900">
            <div class="space-y-2">
              <p class="font-semibold">
                {runtimeAvailable()
                  ? "Skill capsule runtime needs attention"
                  : runtimeConfigured()
                    ? "Skill capsule runtime is unavailable"
                    : "Skill capsule runtime is not configured"}
              </p>
              <p class="text-xs leading-5 text-amber-900/80">
                Workspace selection and reasoning guidance still work, but direct capsule runtime operations are not currently available in this session.
              </p>
              <Show when={runtimeWarnings().length > 0}>
                <div class="space-y-1">
                  <For each={runtimeWarnings()}>
                    {(warning) => (
                      <p class="text-xs leading-5 text-amber-900/75">{warning}</p>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        </Show>

        <div class="flex gap-1 rounded-2xl border border-white/40 bg-white/25 p-1">
          {(["active", "catalog", "profiles"] as const).map((tab) => (
            <button
              type="button"
              class={`flex-1 rounded-xl px-4 py-2 text-sm font-medium transition ${
                activeTab() === tab
                  ? "bg-primary text-white shadow-sm"
                  : "text-on-surface-variant hover:bg-white/50"
              }`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "active" ? `Active (${activeIds().length})` : tab === "catalog" ? "Catalog" : "Profiles"}
            </button>
          ))}
        </div>

        {/* â”€â”€ Active tab â”€â”€ */}
        <Show when={activeTab() === "active"}>
        <Show when={activeEntries().length === 0}>
          <div class="rounded-2xl border border-white/40 bg-white/25 p-8 text-center">
            <p class="text-sm font-medium text-on-surface">No skill capsules enabled</p>
              <p class="mt-1 text-xs text-on-surface-variant">
                Go to the Catalog tab to enable workspace guidance for your agent.
              </p>
            </div>
        </Show>

          <Show when={reasoningGuidance().length > 0}>
            <div class="rounded-2xl border border-sky-200/60 bg-sky-50/70 p-4">
              <p class="text-xs font-semibold uppercase tracking-wider text-sky-900/80">
                Active reasoning guidance
              </p>
              <p class="mt-1 text-[11px] text-sky-900/70">
                Enabled reasoning capsules currently contribute guidance text for this workspace. They do not yet execute as an independent runtime path.
              </p>
              <div class="mt-2 space-y-2">
                <For each={reasoningGuidance()}>
                  {(entry) => (
                    <p class="text-xs leading-5 text-sky-900/90">
                      {entry}
                    </p>
                  )}
                </For>
              </div>
            </div>
          </Show>

          <Show when={workspaceSkillSummaries().length > 0}>
            <div class="rounded-2xl border border-white/40 bg-white/25 p-4">
              <p class="text-xs font-semibold uppercase tracking-wider text-on-surface-variant/70">
                Enabled capsule summary
              </p>
              <div class="mt-3 space-y-3">
                <For each={workspaceSkillSummaries()}>
                  {(summary) => (
                    <div class="rounded-xl border border-white/30 bg-white/30 px-3 py-2">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="text-sm font-medium text-on-surface">{summary.title}</p>
                        <span
                          class={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${categoryColour(summary.category)}`}
                        >
                          {summary.category}
                        </span>
                        <span class="rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[10px] text-on-surface-variant/70">
                          {summary.integration_mode.replace(/_/g, " ")}
                        </span>
                      </div>
                      <p class="mt-1 text-[11px] text-on-surface-variant/70">
                        Surfaces: {summary.surfaces.join(", ")}
                      </p>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Overall overhead warning */}
          <Show when={totalOverhead() > 50}>
            <div class="rounded-xl border border-amber-200/60 bg-amber-50/70 px-4 py-2.5 text-xs text-amber-800">
              <strong>High context overhead ({totalOverhead()}%)</strong> â€” consider deactivating unused skills
              to keep the agent's context window efficient.
            </div>
          </Show>

          <div class="space-y-3">
            <For each={activeEntries()}>
              {(entry) => (
                <ActiveSkillCard
                  entry={entry}
                  activatedAt={activationTimes()[entry.id]}
                  history={activationHistory()[entry.id] ?? []}
                  onDeactivate={() => setConfirmDeactivate(entry.id)}
                  expanded={expandedHistory().has(entry.id)}
                  onToggleHistory={() => toggleHistory(entry.id)}
                />
              )}
            </For>
          </div>
        </Show>

        {/* â”€â”€ Catalog tab â”€â”€ */}
        <Show when={activeTab() === "catalog"}>
          {/* Search + filter bar */}
          <div class="flex flex-wrap items-center gap-2">
            <input
              type="search"
              placeholder="Search skills by name, description or tagâ€¦"
              class="flex-1 min-w-[200px] rounded-xl border border-white/50 bg-white/40 px-4 py-2 text-sm text-on-surface placeholder-on-surface-variant/40 outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
              value={searchQuery()}
              onInput={(e) => setSearchQuery(e.currentTarget.value)}
            />
            <select
              class="rounded-xl border border-white/50 bg-white/40 px-3 py-2 text-sm text-on-surface outline-none focus:border-primary/50"
              value={categoryFilter()}
              onChange={(e) => setCategoryFilter(e.currentTarget.value)}
            >
              <option value="">All categories</option>
              <For each={categories()}>
                {(cat) => <option value={cat}>{cat}</option>}
              </For>
            </select>
          </div>

          {/* Generated skills section */}
          <Show when={generatedSkills().length > 0}>
            <div>
              <p class="mb-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant/60">
                Generated skills
              </p>
              <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <For each={generatedSkills()}>
                  {(entry) => (
                    <CatalogSkillCard
                      entry={entry}
                      active={activeIds().includes(entry.id)}
                      generated
                      onActivate={() => doActivate(entry.id)}
                    />
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Catalog grid */}
          <Show when={filteredCatalog().length > 0}>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <For each={filteredCatalog().filter((e) => !(e as GeneratedSkill).generated)}>
                {(entry) => (
                  <CatalogSkillCard
                    entry={entry}
                    active={activeIds().includes(entry.id)}
                    onActivate={() => doActivate(entry.id)}
                  />
                )}
              </For>
            </div>
          </Show>
          <Show when={filteredCatalog().filter((e) => !(e as GeneratedSkill).generated).length === 0 && searchQuery()}>
            <div class="rounded-2xl border border-white/40 bg-white/25 p-6 text-center text-sm text-on-surface-variant">
              No skills match "{searchQuery()}"
            </div>
          </Show>

          {/* AI chat bar */}
          <div class="mt-2">
            <AIChatBar onGenerate={handleGenerate} busy={generateBusy()} />
          </div>
        </Show>

        {/* â”€â”€ Profiles tab â”€â”€ */}
        <Show when={activeTab() === "profiles"}>
          {/* Save current as profile */}
          <div class="rounded-2xl border border-white/40 bg-white/30 p-4">
            <p class="mb-3 text-sm font-semibold text-on-surface">Save current skill set as a profile</p>
            <p class="mb-3 text-xs text-on-surface-variant">
              Currently active: {activeIds().length} skill{activeIds().length !== 1 ? "s" : ""}
              {activeIds().length > 0 ? ` (${activeEntries().map(e => e.title).join(", ")})` : ""}
            </p>
            <div class="flex gap-2">
              <input
                type="text"
                placeholder="Profile name (e.g. Deep Work Mode)"
                class="flex-1 rounded-xl border border-white/50 bg-white/40 px-4 py-2 text-sm outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                value={profileNameInput()}
                onInput={(e) => {
                  setProfileNameInput(e.currentTarget.value);
                  if (actionError()) setActionError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                    recordShortcutUse("form_submit");
                    void saveProfile();
                    return;
                  }
                  handleProfileDraftShortcut(e);
                }}
              />
              <button
                type="button"
                disabled={!profileNameInput().trim() || activeIds().length === 0}
                onClick={saveProfile}
                class="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/20 disabled:opacity-40"
              >
                Save
              </button>
            </div>
          </div>

          {/* Saved profiles list */}
          <Show when={profiles().length === 0}>
            <div class="rounded-2xl border border-white/40 bg-white/25 p-6 text-center text-sm text-on-surface-variant">
              No profiles saved yet. Activate some skills and save them as a profile above.
            </div>
          </Show>
          <div class="space-y-3">
            <For each={profiles()}>
              {(profile) => (
                <div class="rounded-2xl border border-white/40 bg-white/30 p-4">
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-semibold text-on-surface">{profile.name}</p>
                      <p class="mt-0.5 text-xs text-on-surface-variant">
                        {profile.skill_ids.length} skill{profile.skill_ids.length !== 1 ? "s" : ""}
                        {" Â· "}
                        Saved {skillProfileSavedDateLabel(profile.created_at)}
                      </p>
                      <div class="mt-2 flex flex-wrap gap-1">
                        <For each={profile.skill_ids.slice(0, 4)}>
                          {(id) => {
                            const entry = allCatalogEntries().find((e) => e.id === id);
                            return (
                              <span class="rounded-full border border-white/30 bg-white/30 px-2 py-0.5 text-[10px] text-on-surface-variant">
                                {entry?.title ?? id}
                              </span>
                            );
                          }}
                        </For>
                        <Show when={profile.skill_ids.length > 4}>
                          <span class="rounded-full border border-white/30 bg-white/20 px-2 py-0.5 text-[10px] text-on-surface-variant/50">
                            +{profile.skill_ids.length - 4} more
                          </span>
                        </Show>
                      </div>
                    </div>
                    <div class="flex flex-shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={saving()}
                        onClick={() => applyProfile(profile)}
                        class="rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/20 disabled:opacity-50"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteProfile(profile.id)}
                        class="rounded-xl border border-red-200/40 bg-red-50/40 px-3 py-1.5 text-xs text-red-600 transition hover:bg-red-100/60"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </For>
          </div>
        </Show>
      </Show>

      {/* â”€â”€ Deactivate confirmation modal â”€â”€ */}
      <Show when={confirmDeactivate() && confirmEntry()}>
        <DeactivateModal
          skill={confirmEntry()!}
          onConfirm={() => doDeactivate(confirmDeactivate()!)}
          onCancel={() => setConfirmDeactivate(null)}
        />
      </Show>
    </div>
  );
}
