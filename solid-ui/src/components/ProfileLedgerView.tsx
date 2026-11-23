// @locs-version: 1.0
import { createSignal, For, onMount, Show } from "solid-js";
import { readSession } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { InfoHint } from "@/components/InfoHint";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import {
  buildProfileLedgerFailureReceipt,
  type ProfileLedgerFailureReceipt,
} from "@/lib/profileLedgerFailureState";
import {
  loadProfileLedgerValueOverride,
  loadProfileLedgerValueWeights,
  saveProfileLedgerValueOverride,
  saveProfileLedgerValueWeights,
} from "@/lib/profileLedgerLocalState";
import {
  DEFAULT_VALUE_WEIGHTS,
  type CoreValueKey,
  deleteLedgerEntry,
  exportLedger,
  loadLedger,
  resetLedger,
  setProfilingEnabled,
  updateSelfProfile,
  updateLoraGenome,
  type LedgerEntry,
  type LoraWeightSet,
  type PendingHypothesis,
  type ProfileLedger,
  type StorageStatus,
  VALUE_WEIGHT_LABELS,
  WEIGHT_LABELS,
  type PrimaryUseCaseKind,
} from "@/lib/profileLedger";
import {
  completeCurrentPrimaryUseCase,
  PRIMARY_USE_CASE_OPTIONS,
  primaryUseCaseLabel,
  savePrimaryUseCase,
} from "@/lib/primaryUseCaseProfileState";

function WeightSlider(props: {
  weightKey: keyof LoraWeightSet;
  value: number;
  onChange: (key: keyof LoraWeightSet, v: number) => void;
}) {
  const meta = WEIGHT_LABELS[props.weightKey];
  const pct = () => Math.round(props.value * 100);

  return (
    <div class="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.06))] px-3 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] space-y-1.5">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-on-surface">{meta.label}</span>
        <span class="font-mono text-[10px] text-on-surface-variant">{pct()}%</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[10px] text-on-surface-variant w-16 text-right shrink-0">{meta.low}</span>
        <div class="flex-1 rounded-full border border-white/35 bg-white/45 px-2 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={pct()}
            onInput={(e) => props.onChange(props.weightKey, Number((e.target as HTMLInputElement).value) / 100)}
            class="w-full h-2 rounded-full appearance-none cursor-pointer accent-primary"
            style={{
              background: `linear-gradient(90deg, rgba(61,106,170,0.9) 0%, rgba(61,106,170,0.9) ${pct()}%, rgba(148,163,184,0.28) ${pct()}%, rgba(148,163,184,0.28) 100%)`,
            }}
          />
        </div>
        <span class="text-[10px] text-on-surface-variant w-16 shrink-0">{meta.high}</span>
      </div>
    </div>
  );
}

function ValuePrioritySlider(props: {
  valueKey: CoreValueKey;
  value: number;
  onChange: (key: CoreValueKey, v: number) => void;
}) {
  const meta = VALUE_WEIGHT_LABELS[props.valueKey];
  const pct = () => Math.round(props.value * 100);

  return (
    <div class="rounded-2xl border border-white/30 bg-[linear-gradient(135deg,rgba(255,255,255,0.16),rgba(255,255,255,0.06))] px-3 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] space-y-1.5">
      <div class="flex items-center justify-between">
        <span class="text-xs font-medium text-on-surface">{meta.label}</span>
        <span class="font-mono text-[10px] text-on-surface-variant">{pct()}%</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-[10px] text-on-surface-variant w-16 text-right shrink-0">{meta.low}</span>
        <div class="flex-1 rounded-full border border-white/35 bg-white/45 px-2 py-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={pct()}
            onInput={(e) => props.onChange(props.valueKey, Number((e.target as HTMLInputElement).value) / 100)}
            class="w-full h-2 rounded-full appearance-none cursor-pointer accent-emerald-500"
            style={{
              background: `linear-gradient(90deg, rgba(16,185,129,0.9) 0%, rgba(16,185,129,0.9) ${pct()}%, rgba(148,163,184,0.28) ${pct()}%, rgba(148,163,184,0.28) 100%)`,
            }}
          />
        </div>
        <span class="text-[10px] text-on-surface-variant w-16 shrink-0">{meta.high}</span>
      </div>
    </div>
  );
}

function LedgerEntryCard(props: { entry: LedgerEntry; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = createSignal(false);
  const date = () =>
    new Date(props.entry.timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  const confPct = () => Math.round(props.entry.confidence_score * 100);
  const confColor = () =>
    props.entry.confidence_score >= 0.8
      ? "text-green-600 border-green-400/40 bg-green-50/60"
      : props.entry.confidence_score >= 0.5
        ? "text-amber-600 border-amber-400/40 bg-amber-50/60"
        : "text-slate-500 border-slate-300/40 bg-slate-50/60";

  return (
    <div class="rounded-2xl border border-white/40 bg-white/30 p-4 space-y-2">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class={`rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider ${confColor()}`}>
              {confPct()}% confidence
            </span>
            <span class="rounded-full border border-indigo-300/40 bg-indigo-50/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-indigo-600">
              {props.entry.trait_category.replace(/_/g, " ")}
            </span>
            <span class="text-[10px] text-on-surface-variant">{date()}</span>
          </div>
          <p class="mt-1.5 text-sm text-on-surface leading-5">{props.entry.synthesis}</p>
        </div>
        <div class="flex gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            class="rounded-lg border border-white/40 bg-white/30 px-2 py-1 text-[10px] text-on-surface-variant hover:bg-white/60 transition"
          >
            {expanded() ? "Less" : "More"}
          </button>
          <button
            type="button"
            onClick={() => props.onDelete(props.entry.id)}
            class="rounded-lg border border-red-300/40 bg-red-50/60 px-2 py-1 text-[10px] text-red-600 hover:bg-red-100/80 transition"
          >
            Delete
          </button>
        </div>
      </div>

      <Show when={expanded()}>
        <div class="animate-fade-in space-y-2 rounded-xl border border-white/30 bg-white/40 p-3 text-xs leading-5 text-on-surface-variant">
          <p><strong class="text-on-surface">Observed:</strong> {props.entry.observed_behavior}</p>
          <p><strong class="text-on-surface">Corroborations:</strong> {props.entry.corroboration_count}</p>
          {Object.keys(props.entry.lora_shifts).length > 0 && (
            <div>
              <strong class="text-on-surface">LoRA shifts applied:</strong>
              <ul class="mt-1 space-y-0.5">
                <For each={Object.entries(props.entry.lora_shifts) as [keyof LoraWeightSet, number][]}>
                  {([key, delta]) => (
                    <li class="font-mono">
                      {WEIGHT_LABELS[key]?.label ?? key}: {delta > 0 ? "+" : ""}{(delta * 100).toFixed(0)}%
                    </li>
                  )}
                </For>
              </ul>
            </div>
          )}
        </div>
      </Show>
    </div>
  );
}

function PendingHypothesisCard(props: { hyp: PendingHypothesis }) {
  const needed = () => Math.max(0, 3 - props.hyp.observations.length);
  const oldestTs = () => props.hyp.observations.length > 0
    ? new Date(props.hyp.observations[0].timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "-";

  return (
    <div class="rounded-2xl border border-dashed border-indigo-300/40 bg-indigo-50/30 p-4 space-y-1.5">
      <div class="flex items-center gap-2 flex-wrap">
        <span class="rounded-full border border-indigo-300/40 bg-indigo-50/70 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-indigo-600">
          pending | {props.hyp.observations.length}/3
        </span>
        <span class="rounded-full border border-slate-300/40 bg-slate-50/60 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-slate-500">
          {props.hyp.trait_category.replace(/_/g, " ")}
        </span>
        <span class="text-[10px] text-on-surface-variant">first seen {oldestTs()}</span>
      </div>
      <p class="text-sm text-on-surface leading-5">{props.hyp.synthesis}</p>
      <p class="text-[10px] text-on-surface-variant">
        {needed() > 0
          ? `${needed()} more corroboration${needed() > 1 ? "s" : ""} needed | observations must span >=72 h`
          : "Awaiting 72-hour temporal spread before promoting"}
      </p>
    </div>
  );
}

export function ProfileLedgerView() {
  const sessionUserId = readSession()?.user?.id ?? null;
  const [ledger, setLedger] = createSignal<ProfileLedger>({
    profiling_enabled: false,
    consent_given_at: null,
    lora_genome: {
      directness_weight: 0.5,
      diplomacy_weight: 0.5,
      brevity_weight: 0.5,
      formality_weight: 0.5,
      technical_depth_weight: 0.5,
      abstraction_level: 0.5,
      optimism_bias: 0.5,
      risk_tolerance: 0.5,
      proactivity_preference: 0.5,
    },
    entries: [],
    hypotheses: [],
    pending_hypotheses: [],
    self_profile: {
      interests: [],
      goals_domains: [],
      value_weights: { ...DEFAULT_VALUE_WEIGHTS },
      active_value_override: null,
      vetos: [],
    },
    persona_genomes: [],
  });
  const [confirmReset, setConfirmReset] = createSignal(false);
  const [storageStatus, setStorageStatus] = createSignal<StorageStatus>("ok");
  const [loadError, setLoadError] = createSignal<ProfileLedgerFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<ProfileLedgerFailureReceipt | null>(null);
  const [valueOverrideSaving, setValueOverrideSaving] = createSignal(false);
  const [valueWeights, setValueWeights] = createSignal(loadProfileLedgerValueWeights(sessionUserId));
  const [valueOverrideDraft, setValueOverrideDraft] = createSignal(loadProfileLedgerValueOverride(sessionUserId));

  async function reload() {
    setLoadError(null);
    try {
      const nextLedger = await loadLedger();
      setLedger(nextLedger);
      setValueWeights(nextLedger.self_profile.value_weights ?? { ...DEFAULT_VALUE_WEIGHTS });
      setValueOverrideDraft(nextLedger.self_profile.active_value_override?.summary ?? "");
    } catch (error: unknown) {
      setLoadError(
        buildProfileLedgerFailureReceipt(
          "Load ledger",
          error instanceof Error ? error.message : "Could not load profile ledger.",
        ),
      );
    }
  }

  async function toggleProfiling() {
    const enabled = !ledger().profiling_enabled;
    setActionError(null);
    try {
      const status = await setProfilingEnabled(enabled);
      setStorageStatus(status);
      if (status !== "ok") {
        setActionError(buildProfileLedgerFailureReceipt("Update profiling", "quota exceeded while saving profile"));
        return;
      }
      await reload();
    } catch (error: unknown) {
      setActionError(
        buildProfileLedgerFailureReceipt(
          "Update profiling",
          error instanceof Error ? error.message : "Could not update profiling setting.",
        ),
      );
    }
  }

  async function handleSliderChange(key: keyof LoraWeightSet, value: number) {
    const updated = { ...ledger().lora_genome, [key]: value };
    setActionError(null);
    try {
      const status = await updateLoraGenome(updated);
      setStorageStatus(status);
      if (status !== "ok") {
        setActionError(buildProfileLedgerFailureReceipt("Save writing style", "quota exceeded while saving profile"));
        return;
      }
      await reload();
    } catch (error: unknown) {
      setActionError(
        buildProfileLedgerFailureReceipt(
          "Save writing style",
          error instanceof Error ? error.message : "Could not save writing style weights.",
        ),
      );
    }
  }

  async function handleDelete(id: string) {
    setActionError(null);
    try {
      const status = await deleteLedgerEntry(id);
      setStorageStatus(status);
      if (status !== "ok") {
        setActionError(buildProfileLedgerFailureReceipt("Delete entry", "quota exceeded while saving profile"));
        return;
      }
      await reload();
    } catch (error: unknown) {
      setActionError(
        buildProfileLedgerFailureReceipt(
          "Delete entry",
          error instanceof Error ? error.message : "Could not delete ledger entry.",
        ),
      );
    }
  }

  async function handleReset() {
    setActionError(null);
    try {
      const status = await resetLedger();
      setStorageStatus(status);
      if (status !== "ok") {
        setActionError(buildProfileLedgerFailureReceipt("Reset ledger", "quota exceeded while saving profile"));
        return;
      }
      setConfirmReset(false);
      await reload();
    } catch (error: unknown) {
      setActionError(
        buildProfileLedgerFailureReceipt(
          "Reset ledger",
          error instanceof Error ? error.message : "Could not reset profile ledger.",
        ),
      );
    }
  }

  async function handleExport() {
    setActionError(null);
    try {
      const json = await exportLedger();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "omnyid-profile-ledger.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error: unknown) {
      setActionError(
        buildProfileLedgerFailureReceipt(
          "Export ledger",
          error instanceof Error ? error.message : "Could not export profile ledger.",
        ),
      );
    }
  }

  async function handleValueWeightChange(key: CoreValueKey, value: number) {
    setActionError(null);
    const next = { ...valueWeights(), [key]: value };
    try {
      const status = await updateSelfProfile({ value_weights: next });
      setStorageStatus(status);
      if (status !== "ok") {
        setActionError(buildProfileLedgerFailureReceipt("Save value weights", "quota exceeded while saving profile"));
        return;
      }
      setValueWeights(next);
      await reload();
    } catch (error: unknown) {
      setActionError(
        buildProfileLedgerFailureReceipt(
          "Save value weights",
          error instanceof Error ? error.message : "Could not save user value weights.",
        ),
      );
    }
  }

  async function handleValueOverrideSave() {
    if (valueOverrideSaving()) return;
    setActionError(null);
    setValueOverrideSaving(true);
    try {
      const summary = valueOverrideDraft().trim();
      const status = await updateSelfProfile({
        active_value_override: summary
          ? {
              summary,
              updated_at: new Date().toISOString(),
            }
          : null,
      });
      setStorageStatus(status);
      if (status !== "ok") {
        setActionError(buildProfileLedgerFailureReceipt("Save temporary override", "quota exceeded while saving profile"));
        return;
      }
      await reload();
    } catch (error: unknown) {
      setActionError(
        buildProfileLedgerFailureReceipt(
          "Save temporary override",
          error instanceof Error ? error.message : "Could not save the temporary value override.",
        ),
      );
    } finally {
      setValueOverrideSaving(false);
    }
  }

  async function clearValueOverride() {
    if (valueOverrideSaving()) return;
    setActionError(null);
    setValueOverrideDraft("");
    setValueOverrideSaving(true);
    try {
      const status = await updateSelfProfile({ active_value_override: null });
      setStorageStatus(status);
      if (status !== "ok") {
        setActionError(buildProfileLedgerFailureReceipt("Clear temporary override", "quota exceeded while saving profile"));
        return;
      }
      await reload();
    } catch (error: unknown) {
      setActionError(
        buildProfileLedgerFailureReceipt(
          "Clear temporary override",
          error instanceof Error ? error.message : "Could not clear the temporary value override.",
        ),
      );
    } finally {
      setValueOverrideSaving(false);
    }
  }

  async function handlePrimaryUseCaseChange(kind: PrimaryUseCaseKind) {
    setActionError(null);
    try {
      const status = await savePrimaryUseCase(kind, "profile");
      setStorageStatus(status);
      if (status !== "ok") {
        setActionError(buildProfileLedgerFailureReceipt("Save primary use case", "quota exceeded while saving profile"));
        return;
      }
      await reload();
    } catch (error: unknown) {
      setActionError(
        buildProfileLedgerFailureReceipt(
          "Save primary use case",
          error instanceof Error ? error.message : "Could not save the primary use case.",
        ),
      );
    }
  }

  async function handlePrimaryUseCaseComplete() {
    setActionError(null);
    try {
      const status = await completeCurrentPrimaryUseCase();
      setStorageStatus(status);
      if (status !== "ok") {
        setActionError(buildProfileLedgerFailureReceipt("Complete primary use case", "quota exceeded while saving profile"));
        return;
      }
      await reload();
    } catch (error: unknown) {
      setActionError(
        buildProfileLedgerFailureReceipt(
          "Complete primary use case",
          error instanceof Error ? error.message : "Could not complete the primary use case.",
        ),
      );
    }
  }

  onMount(async () => {
    const legacyWeights = loadProfileLedgerValueWeights(sessionUserId);
    const legacyOverride = loadProfileLedgerValueOverride(sessionUserId).trim();
    if (
      JSON.stringify(legacyWeights) !== JSON.stringify(DEFAULT_VALUE_WEIGHTS) ||
      legacyOverride
    ) {
      try {
        await updateSelfProfile({
          value_weights: legacyWeights,
          active_value_override: legacyOverride
            ? { summary: legacyOverride, updated_at: new Date().toISOString() }
            : null,
        });
        saveProfileLedgerValueWeights({ ...DEFAULT_VALUE_WEIGHTS }, sessionUserId);
        saveProfileLedgerValueOverride("", sessionUserId);
      } catch {
        // Keep the legacy keys in place if migration fails.
      }
    }
    await reload();
  });

  const genome = () => ledger().lora_genome;
  const entries = () => ledger().entries;
  const pending = () => ledger().pending_hypotheses;
  const enabled = () => ledger().profiling_enabled;

  return (
    <div class="space-y-6">
      <Show when={loadError()}>
        {(receipt) => (
          <EmptyState
            icon="PL"
            title={receipt().title}
            body={`${receipt().summary} Next step: ${receipt().nextStep}`}
            action={
              <button
                type="button"
                class="rounded-full border border-white/25 bg-white/70 px-3 py-1 text-xs font-medium text-on-surface transition hover:bg-white"
                onClick={() => void reload()}
              >
                Retry ledger
              </button>
            }
          />
        )}
      </Show>

      <Show when={!loadError() && actionError()}>
        {(receipt) => (
          <div
            class={`animate-fade-in rounded-xl border px-4 py-3 text-xs leading-5 ${
              receipt().tone === "danger"
                ? "border-red-200/50 bg-red-50/60 text-red-700"
                : "border-amber-300/40 bg-amber-50/60 text-amber-700"
            }`}
          >
            <p class="font-semibold">{receipt().title}</p>
            <p>{receipt().summary}</p>
            <p class="opacity-80">Next step: {receipt().nextStep}</p>
          </div>
        )}
      </Show>

      {/* Storage quota warning - SEC-05 */}
      <Show when={!loadError() && storageStatus() === "quota_exceeded"}>
        <div class="rounded-xl border border-red-400/40 bg-red-50/70 px-4 py-3 text-xs leading-5 text-red-700 animate-fade-in">
          <strong>Storage full.</strong> Your browser's local storage is at capacity. Oldest ledger
          entries have been evicted to make room. Consider exporting and resetting the ledger to free space.
        </div>
      </Show>

      {/* Header */}
      <Show when={!loadError()}>
        <div class="glass-surface rounded-2xl border border-white/40 p-5 shadow-panel">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Settings</p>
            <h3 class="mt-1.5 flex items-center gap-1.5 text-lg font-semibold text-on-surface">
              Profile Ledger
              <InfoHint text="This is your local preference-memory layer. It stores behavioral observations and manual style adjustments in this browser so the agent can personalize drafts and suggestions." />
            </h3>
            <p class="mt-1.5 text-sm leading-6 text-on-surface-variant max-w-prose">
              Your AI learns your preferences by observing how you interact - edits you make to drafts, tone choices,
              and usage patterns. All data is local to this browser. You can inspect, adjust, or delete any entry.
            </p>
          </div>

          {/* Profiling toggle */}
          <button
            type="button"
            onClick={toggleProfiling}
            class={`mt-1 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition shrink-0
              ${enabled()
                ? "border-green-400/40 bg-green-50/70 text-green-700 hover:bg-green-100/80"
                : "border-outline-variant/40 bg-white/40 text-on-surface-variant hover:bg-white/70"
              }`}
          >
            <span class={`h-2 w-2 rounded-full ${enabled() ? "bg-green-500" : "bg-slate-300"}`} />
            {enabled() ? "Profiling on" : "Profiling off"}
          </button>
          <InfoHint text="When profiling is on, OmnyID records local behavioral signals from this browser so it can gradually adapt drafts and suggestions. Turning it off freezes the learned profile and leaves only your manual slider values." />
        </div>

        <Show when={!enabled()}>
          <div class="mt-3 rounded-xl border border-amber-300/40 bg-amber-50/60 px-4 py-3 text-xs leading-5 text-amber-700">
            Profiling is off. The AI will not adapt to your style over time, and the "Write like me" toggle in email will use the manual weights below.
          </div>
      </Show>
        </div>

        <div class="glass-surface rounded-2xl border border-white/40 p-5 shadow-panel space-y-4">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Workspace purpose</p>
            <h4 class="mt-1 text-sm font-semibold text-on-surface">Primary use case</h4>
            <p class="mt-1 text-xs leading-5 text-on-surface-variant">
              This profile setting tells OmnyID what to optimize for right now. Active use cases may lightly tune theme, shortcuts, surfaces, and template suggestions. Completing the use case returns the app to the general theme.
            </p>
          </div>
          <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <For each={PRIMARY_USE_CASE_OPTIONS}>
              {(option) => {
                const selected = () => ledger().self_profile.primary_use_case?.kind === option.kind
                  && ledger().self_profile.primary_use_case?.status === "active";
                return (
                  <button
                    type="button"
                    onClick={() => void handlePrimaryUseCaseChange(option.kind)}
                    class={`rounded-2xl border px-4 py-3 text-left transition ${
                      selected()
                        ? "border-primary/35 bg-primary/10 text-on-surface shadow-[0_10px_28px_rgba(49,86,142,0.12)]"
                        : "border-white/35 bg-white/45 text-on-surface hover:bg-white/70"
                    }`}
                  >
                    <span class="block text-sm font-semibold">{option.label}</span>
                    <span class="mt-1 block text-xs leading-5 text-on-surface-variant">{option.description}</span>
                  </button>
                );
              }}
            </For>
          </div>
          <div class="flex flex-wrap items-center gap-2 rounded-2xl border border-white/35 bg-white/45 px-4 py-3 text-xs text-on-surface-variant">
            <span>
              Current: <strong class="text-on-surface">{primaryUseCaseLabel(ledger().self_profile.primary_use_case?.kind)}</strong>
              <Show when={ledger().self_profile.primary_use_case?.status === "completed"}> <span>(completed)</span></Show>
            </span>
            <Show when={ledger().self_profile.primary_use_case?.status === "active" && ledger().self_profile.primary_use_case?.kind !== "general"}>
              <button
                type="button"
                onClick={() => void handlePrimaryUseCaseComplete()}
                class="rounded-full bg-on-surface px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-on-surface/85"
              >
                Mark complete and revert theme
              </button>
            </Show>
          </div>
        </div>

      {/* Style genome sliders */}
        <div class="glass-surface rounded-2xl border border-white/40 p-5 shadow-panel space-y-5">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Voice profile</p>
          <h4 class="mt-1 flex items-center gap-1.5 text-sm font-semibold text-on-surface">
            Writing style weights
            <InfoHint text="These sliders shape the default voice your agent uses when it writes in your name. Automatic profiling nudges them over time unless you override them here." />
          </h4>
          <p class="mt-1 text-xs leading-5 text-on-surface-variant">
            These weights shape how "Write like me" sounds. They're updated automatically when profiling is on,
            or you can set them manually here - manual overrides are treated as high-confidence signals.
          </p>
        </div>

        <div class="space-y-4">
          <For each={Object.keys(WEIGHT_LABELS) as (keyof LoraWeightSet)[]}>
            {(key) => (
              <WeightSlider
                weightKey={key}
                value={genome()[key]}
                onChange={handleSliderChange}
              />
            )}
          </For>
        </div>
        </div>

        <div class="glass-surface rounded-2xl border border-white/40 p-5 shadow-panel space-y-5">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Decision values</p>
            <h4 class="mt-1 flex items-center gap-1.5 text-sm font-semibold text-on-surface">
              Explicit value weights
              <InfoHint text="Use these sliders instead of hidden value math. They tell OmnyID which life domains should carry more weight when it ranks suggestions, drafts, and follow-up work." />
            </h4>
            <p class="mt-1 text-xs leading-5 text-on-surface-variant">
              This is the practical alternative to quaternion-style state storage. Keep the long-term weights simple and visible, then use a temporary override when your current week or situation needs a different emphasis.
            </p>
          </div>

          <div class="space-y-4">
            <For each={Object.keys(VALUE_WEIGHT_LABELS) as CoreValueKey[]}>
              {(key) => (
                <ValuePrioritySlider
                  valueKey={key}
                  value={valueWeights()[key]}
                  onChange={handleValueWeightChange}
                />
              )}
            </For>
          </div>

          <div class="rounded-2xl border border-white/35 bg-white/45 p-4 space-y-3">
            <div>
              <p class="text-xs font-semibold text-on-surface">Visible temporary override</p>
              <p class="mt-1 text-xs leading-5 text-on-surface-variant">
                Example: "For the next 2 weeks, prioritize health and family over wealth growth because of recovery and travel." This override should be shown to the user and easy to clear.
              </p>
            </div>
            <TiptapEditor
              mode="compact"
              initialContent={valueOverrideDraft()}
              disabled={valueOverrideSaving()}
              placeholder="Current temporary override..."
              submitLabel={valueOverrideSaving() ? "Saving..." : "Save override"}
              clearOnSend={false}
              onChange={(_text, markdown) => setValueOverrideDraft(markdown)}
              onSend={async (payload) => {
                setValueOverrideDraft(payload.markdown || payload.text);
                await handleValueOverrideSave();
              }}
            />
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={clearValueOverride}
                disabled={valueOverrideSaving()}
                class="rounded-xl border border-white/40 bg-white/60 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white"
              >
                Clear override
              </button>
            </div>
          </div>
        </div>

      {/* Pending hypotheses */}
        <Show when={pending().length > 0}>
          <div class="glass-surface rounded-2xl border border-white/40 p-5 shadow-panel space-y-4">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Accumulating</p>
            <h4 class="mt-1 text-sm font-semibold text-on-surface">
              <span class="inline-flex items-center gap-1.5">
                Pending observations
                <InfoHint text="These are not committed style facts yet. They need repeated corroboration over time before they can affect your voice profile automatically." />
              </span>
              <span class="ml-2 rounded-full border border-outline-variant/30 bg-white/40 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant">
                {pending().length}
              </span>
            </h4>
            <p class="mt-1 text-xs leading-5 text-on-surface-variant">
              These signals need &gt;=3 corroborations across at least 72 hours before they affect your style genome.
            </p>
          </div>
          <div class="space-y-3">
            <For each={pending()}>
              {(hyp) => <PendingHypothesisCard hyp={hyp} />}
            </For>
          </div>
          </div>
        </Show>

      {/* Committed ledger entries */}
        <div class="glass-surface rounded-2xl border border-white/40 p-5 shadow-panel space-y-4">
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Observations</p>
            <h4 class="mt-1 text-sm font-semibold text-on-surface">
              <span class="inline-flex items-center gap-1.5">
                Ledger entries
                <InfoHint text="Committed entries are the durable observations that have already influenced the profile. You can inspect, export, or delete them individually." />
              </span>
              <Show when={entries().length > 0}>
                <span class="ml-2 rounded-full border border-outline-variant/30 bg-white/40 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant">
                  {entries().length}
                </span>
              </Show>
            </h4>
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => void handleExport()}
              class="rounded-xl border border-outline-variant/40 bg-white/40 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/70"
            >
              Export JSON
            </button>
            <Show when={!confirmReset()}>
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                class="rounded-xl border border-red-300/40 bg-red-50/60 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100/80"
                disabled={entries().length === 0}
              >
                Reset ledger
              </button>
            </Show>
            <Show when={confirmReset()}>
              <div class="flex gap-1.5 animate-fade-in">
                <button
                  type="button"
                  onClick={() => void handleReset()}
                  class="rounded-xl bg-red-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-600"
                >
                  Confirm reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  class="rounded-xl border border-outline-variant/40 bg-white/40 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/70"
                >
                  Cancel
                </button>
              </div>
            </Show>
          </div>
        </div>

        <Show
          when={entries().length > 0}
          fallback={
            <div class="rounded-2xl border border-dashed border-white/35 p-6 text-center text-sm text-on-surface-variant">
              No committed entries yet.
              <Show when={enabled()}>
                <span class="block mt-1 text-xs">
                  Entries are recorded after &gt;=3 consistent, temporally dispersed signals are observed.
                </span>
              </Show>
              <Show when={!enabled()}>
                <span class="block mt-1 text-xs">Enable profiling above to start building your style profile.</span>
              </Show>
            </div>
          }
        >
          <div class="space-y-3">
            <For each={[...entries()].reverse()}>
              {(entry) => (
                <LedgerEntryCard entry={entry} onDelete={handleDelete} />
              )}
            </For>
          </div>
        </Show>
        </div>
      </Show>
    </div>
  );
}
