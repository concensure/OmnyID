import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { approvalModeLabel } from "afp-ts/continuity";
import { apiFetch, applyRuntimeUpdate, checkRuntimeUpdates, createRuntimeBackupSnapshot, createRuntimeRestoreDrill, deleteCapability, fetchLlmConfig, fetchRuntimeBackupManifest, fetchRuntimeRecoveryPacket, listCapabilities, patchCapability, pingLlmConfig, registerCapability, saveLlmConfig, setRuntimeBackupRetention, setRuntimeUpdatePolicy, updateDeviceSyncPolicyProfile, type CapabilityDescriptor, type DeviceSyncPolicyEntry, type LlmConfig, type RuntimeBackupManifestResponse, type RuntimeBackupsResponse, type RuntimeRestoreDrillsResponse, type RuntimeUpdatesResponse } from "@/lib/api";
import { AddCapabilityModal } from "./AddCapabilityModal";
import { OnboardingWizard } from "./OnboardingWizard";
import { SoulEditorModal } from "./SoulEditorModal";
import { InfoHint } from "./InfoHint";
import { AliasSettings } from "./AliasSettings";
import { AgentPreferencesPanel } from "./AgentPreferencesPanel";
import { AgentPersonasPanel } from "./AgentPersonasPanel";
import { ProfileLedgerView } from "./ProfileLedgerView";
import { SkillsView } from "./SkillsView";
import {
  byteCountLabel,
  dateTimeLabel,
  durationLabel,
  earliestTimestampValue,
  expiredTimestampCount,
  futureTimestampCount,
  latestTimestampValue,
  nextFutureTimestampValue,
  relativeTimeLabel,
  totalNumber,
} from "@/lib/agentSettingsRuntimeFormat";
import { exportAgentIdentityCard } from "@/lib/exportAgentIdentityCard";
import { exportSovereignDataBundle as exportSovereignDataBundleFile } from "@/lib/exportSovereignDataBundle";
import { dispatchDashboardRefreshEvent } from "@/lib/dashboardRefreshEvent";
import { supportAccessHistoryLines as formatSupportAccessHistoryLines } from "@/lib/supportAccessHistoryFormat";
import {
  compactSummaryLines,
  compactSummaryLinesExcluding,
  deviceSyncSliceSummaryLines,
} from "@/lib/agentSettingsSummaryFormat";
import {
  runtimeManifestSummaryLines,
  runtimeStatusPanelLines,
} from "@/lib/agentSettingsRuntimeSummaryFormat";

type AgentInstance = {
  soul_md?: string;
  lora_confidence_score?: number;
  lora_genome_active?: boolean;
  is_master?: boolean;
};

type SummaryItem = {
  label: string;
  value: string | number;
};

type SummaryChipListProps = {
  items: string[];
  class?: string;
  itemClass?: string;
};

function SummaryRows(props: { items: SummaryItem[]; class?: string }) {
  return (
    <div role="list" class={props.class ?? "space-y-2 text-xs text-on-surface-variant"}>
      <For each={props.items}>
        {(item) => (
          <div role="listitem" class="flex flex-col items-start gap-1.5 rounded-lg border border-white/40 bg-white/50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <span class="min-w-0">{item.label}</span>
            <span class="w-full break-words text-left font-semibold text-on-surface sm:w-auto sm:text-right">{item.value}</span>
          </div>
        )}
      </For>
    </div>
  );
}

function SummaryChipList(props: SummaryChipListProps) {
  return (
    <div role="list" class={props.class ?? "flex flex-wrap gap-2"}>
      <For each={props.items}>
        {(item) => (
          <span
            role="listitem"
            class={
              props.itemClass ??
              "max-w-full break-words rounded-full border border-white/30 bg-white/60 px-2.5 py-1 text-[10px] text-on-surface-variant"
            }
          >
            {item}
          </span>
        )}
      </For>
    </div>
  );
}

function SectionCard(props: {
  title: string;
  description: string;
  class?: string;
  headerActions?: any;
  children: any;
}) {
  return (
    <section class={props.class ?? "rounded-xl border border-white/20 bg-white/10 p-4"}>
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <h3 class="text-sm font-semibold text-on-surface">{props.title}</h3>
          <p class="mt-1 text-xs leading-5 text-on-surface-variant">{props.description}</p>
        </div>
        <Show when={props.headerActions}>
          <div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:flex-shrink-0 sm:justify-end">{props.headerActions}</div>
        </Show>
      </div>
      {props.children}
    </section>
  );
}

function MetricCard(props: {
  label: string;
  value: string | number;
  lines?: string[];
  class?: string;
  valueClass?: string;
  labelClass?: string;
}) {
  return (
    <div class={props.class ?? "rounded-lg border border-white/40 bg-white/50 px-3 py-2"}>
      <p class={props.labelClass ?? "font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60"}>
        {props.label}
      </p>
      <p class={props.valueClass ?? "mt-1 break-words text-sm font-semibold text-on-surface"}>{props.value}</p>
      <Show when={(props.lines?.length ?? 0) > 0}>
        <For each={props.lines}>{(line) => <p class="mt-1 break-words text-[11px] text-on-surface-variant">{line}</p>}</For>
      </Show>
    </div>
  );
}

function TextLineList(props: { lines: string[]; class?: string; lineClass?: string }) {
  return (
    <div role="list" class={props.class ?? "mt-2 space-y-1"}>
      <For each={props.lines}>
        {(line) => (
          <p
            role="listitem"
            class={
              props.lineClass ??
              "rounded border border-white/30 bg-white/60 px-2 py-1 text-[11px] text-on-surface-variant break-words"
            }
          >
            {line}
          </p>
        )}
      </For>
    </div>
  );
}

function NoticeBox(props: {
  children: any;
  class?: string;
  role?: "note" | "status" | "alert";
  ariaLive?: "off" | "polite" | "assertive";
  ariaAtomic?: boolean;
}) {
  return (
    <p
      role={props.role ?? "note"}
      aria-live={props.ariaLive}
      aria-atomic={props.ariaAtomic}
      class={props.class ?? "rounded-lg border border-white/40 bg-white/50 px-3 py-2 text-xs text-on-surface-variant break-words"}
    >
      {props.children}
    </p>
  );
}

function ActionRow(props: { children: any; class?: string }) {
  return <div class={props.class ?? "mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap"}>{props.children}</div>;
}

function EyebrowLabel(props: { children: any; class?: string }) {
  return (
    <p class={props.class ?? "font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60"}>
      {props.children}
    </p>
  );
}

function DetailCard(props: { title: string; class?: string; children: any }) {
  return (
    <div class={props.class ?? "min-w-0 rounded-lg border border-white/30 bg-white/60 px-3 py-3"}>
      <EyebrowLabel>{props.title}</EyebrowLabel>
      {props.children}
    </div>
  );
}

export function AgentSettingsView(props: {
  browserAiLabel?: string | null;
  focusLlm?: boolean;
  onFocusDone?: () => void;
  onViewWorkflows?: () => void;
  focusSettingsTab?: "llm" | "mcp" | "skills" | "runtime";
  onSettingsTabFocusDone?: () => void;
  deviceSyncPolicies?: DeviceSyncPolicyEntry[];
  deviceSyncRuntimeSummary?: {
    device_policy_count: number;
    used_device_count: number;
    local_key_device_count: number;
    desktop_device_count: number;
    mobile_device_count: number;
    watch_device_count: number;
    latest_device_id?: string | null;
    latest_device_class?: string | null;
    latest_policy_profile?: string | null;
    latest_last_used_at?: string | null;
    latest_policy_note?: string | null;
  } | null;
  runtimeUpdates?: RuntimeUpdatesResponse | null;
  runtimeDeployment?: {
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
    runtime_status_views?: Array<{ id?: string; format?: string; title?: string | null }> | null;
  } | null;
  runtimeBackups?: RuntimeBackupsResponse | null;
  runtimeRestoreDrills?: RuntimeRestoreDrillsResponse | null;
  supportAccess?: {
    status: string;
    access_scope: string;
    reason?: string | null;
    support_disabled_by_default: boolean;
    granted_at?: string | null;
    expires_at?: string | null;
    revoked_at?: string | null;
  } | null;
  supportAccessHistory?: Array<{
    id: string;
    status: string;
    access_scope: string;
    reason?: string | null;
    granted_at: string;
    expires_at: string;
    revoked_at?: string | null;
  }>;
}) {
  let llmSectionRef: HTMLDivElement | undefined;

  const [instance, setInstance] = createSignal<AgentInstance | null>(null);
  const [instanceLoadError, setInstanceLoadError] = createSignal<string | null>(null);
  const [showWizard, setShowWizard] = createSignal(false);
  const [wizardRefreshError, setWizardRefreshError] = createSignal<string | null>(null);
  const [confirmReconfigure, setConfirmReconfigure] = createSignal(false);
  let onboardingWizardTriggerRef: HTMLButtonElement | undefined;
  const [loading, setLoading] = createSignal(true);

  // LLM config state
  const [llmConfig, setLlmConfig] = createSignal<LlmConfig | null>(null);
  const [llmBackend, setLlmBackend] = createSignal<"byok" | "ollama" | "runpod">("byok");
  const [llmProvider, setLlmProvider] = createSignal<string>("anthropic");
  const [llmModel, setLlmModel] = createSignal("claude-haiku-4-5-20251001");
  const [llmApiKey, setLlmApiKey] = createSignal("");
  const [llmOllamaUrl, setLlmOllamaUrl] = createSignal("http://localhost:11434");

  const MODEL_TIER: Record<string, string> = {
    "claude-haiku-4-5-20251001": "fast",
    "claude-sonnet-4-6": "balanced",
    "claude-opus-4-8": "deep",
    "gpt-4o-mini": "fast",
    "gpt-4o": "balanced",
    "gpt-4-turbo": "balanced",
    "gpt-3.5-turbo": "fast",
    "openai/gpt-4o-mini": "fast",
    "anthropic/claude-sonnet-4-6": "balanced",
    "meta-llama/llama-3.1-8b-instruct": "fast",
    "llama3.1-8b": "fast",
    "llama3.1-70b": "balanced",
    "llama3.2": "fast",
    "Qwen/Qwen3.5-35B-A3B": "balanced",
  };
  const modelTier = () => MODEL_TIER[llmModel()] ?? null;

  const PROVIDER_MODELS: Record<string, string[]> = {
    anthropic:   ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-8"],
    openai:      ["gpt-4o-mini", "gpt-4o", "gpt-4-turbo", "gpt-3.5-turbo"],
    openrouter:  ["openai/gpt-4o-mini", "anthropic/claude-sonnet-4-6", "meta-llama/llama-3.1-8b-instruct"],
    cerebras:    ["llama3.1-70b", "llama3.1-8b"],
    together_ai: ["meta-llama/Llama-3-8b-hf", "meta-llama/Llama-3-70b-hf"],
  };

  const providerDefaults: Record<string, { model: string; keyPlaceholder: string }> = {
    anthropic:   { model: "claude-haiku-4-5-20251001", keyPlaceholder: "sk-ant-..." },
    openai:      { model: "gpt-4o-mini",               keyPlaceholder: "sk-..." },
    openrouter:  { model: "openai/gpt-4o-mini",        keyPlaceholder: "sk-or-..." },
    cerebras:    { model: "llama3.1-70b",              keyPlaceholder: "csk-..." },
    together_ai: { model: "meta-llama/Llama-3-8b-hf",  keyPlaceholder: "...together key..." },
  };
  function llmProviderLabel(provider?: string | null, backend?: string | null): string {
    switch (provider) {
      case "anthropic": return "Anthropic";
      case "openai": return "OpenAI";
      case "openrouter": return "OpenRouter";
      case "cerebras": return "Cerebras";
      case "together_ai": return "Together AI";
      default:
        switch (backend) {
          case "ollama": return "Ollama";
          case "runpod": return "RunPod";
          case "byok": return "saved provider";
          default: return "provider";
        }
    }
  }
  const keyPrefix = () => {
    const placeholder = providerDefaults[llmProvider()]?.keyPlaceholder ?? "";
    return placeholder.split("…")[0];
  };
  const keyFormatValid = () => {
    const key = llmApiKey();
    if (!key) return null;
    const prefix = keyPrefix();
    if (!prefix || prefix.includes(" ")) return null;
    return key.startsWith(prefix);
  };
  const [keyPrefixCopied, setKeyPrefixCopied] = createSignal(false);
  const [keyPrefixCopyError, setKeyPrefixCopyError] = createSignal<string | null>(null);
  const [runtimeBackupsState, setRuntimeBackupsState] = createSignal<RuntimeBackupsResponse | null>(props.runtimeBackups ?? null);
  const [runtimeRestoreDrillsState, setRuntimeRestoreDrillsState] = createSignal<RuntimeRestoreDrillsResponse | null>(props.runtimeRestoreDrills ?? null);
  const [runtimeUpdatesState, setRuntimeUpdatesState] = createSignal<RuntimeUpdatesResponse | null>(props.runtimeUpdates ?? null);
  const [runtimeBackupBusy, setRuntimeBackupBusy] = createSignal<"snapshot" | "retention" | null>(null);
  const [runtimeBackupManifestBusyId, setRuntimeBackupManifestBusyId] = createSignal<string | null>(null);
  const [runtimeBackupManifest, setRuntimeBackupManifest] = createSignal<RuntimeBackupManifestResponse | null>(null);
  const [runtimeDrillBusyBackupId, setRuntimeDrillBusyBackupId] = createSignal<string | null>(null);
  const [runtimeUpdatesBusy, setRuntimeUpdatesBusy] = createSignal<"policy" | "check" | "apply" | null>(null);
  const [runtimeRecoveryBusy, setRuntimeRecoveryBusy] = createSignal(false);
  const [runtimeRecoveryPacket, setRuntimeRecoveryPacket] = createSignal<Awaited<ReturnType<typeof fetchRuntimeRecoveryPacket>> | null>(null);
  const [runtimeRecoveryPreviewOrigin, setRuntimeRecoveryPreviewOrigin] = createSignal<"preview" | "download" | null>(null);
  const [runtimeFeedback, setRuntimeFeedback] = createSignal<string>("");
  let runtimeBackupManifestTriggerRef: HTMLButtonElement | undefined;
  let runtimeRecoveryPreviewTriggerRef: HTMLButtonElement | undefined;
  let runtimeRecoveryDownloadTriggerRef: HTMLButtonElement | undefined;
  const runtimeBackupEntries = createMemo(() => runtimeBackupsState()?.entries ?? []);
  const runtimeRestoreDrillEntries = createMemo(() => runtimeRestoreDrillsState()?.entries ?? []);
  const retainedBackupIds = createMemo(() => new Set(runtimeBackupEntries().map((entry) => entry.id)));
  const activeRuntimeBackupEntries = createMemo(() =>
    runtimeBackupEntries().filter((entry) => {
      const expiresAt = Date.parse(entry.expires_at);
      return !Number.isNaN(expiresAt) && expiresAt >= Date.now();
    })
  );
  const latestRestoreDrill = createMemo(() => runtimeRestoreDrillEntries()[0] ?? null);
  const latestCompletedRestoreDrill = createMemo(() => {
    let latest: RuntimeRestoreDrillsResponse["entries"][number] | null = null;
    let latestMs = -Infinity;
    for (const entry of runtimeRestoreDrillEntries()) {
      if (!entry.completed_at) continue;
      const parsed = Date.parse(entry.completed_at);
      if (Number.isNaN(parsed) || parsed <= latestMs) continue;
      latestMs = parsed;
      latest = entry;
    }
    return latest;
  });
  const latestCompletedRestoreDrillByBackupId = createMemo(() => {
    const latestByBackupId = new Map<string, RuntimeRestoreDrillsResponse["entries"][number]>();
    for (const entry of runtimeRestoreDrillEntries()) {
      if (!entry.completed_at) continue;
      const parsed = Date.parse(entry.completed_at);
      if (Number.isNaN(parsed)) continue;
      const current = latestByBackupId.get(entry.backup_id);
      const currentParsed = current?.completed_at ? Date.parse(current.completed_at) : -Infinity;
      if (!current || Number.isNaN(currentParsed) || parsed > currentParsed) {
        latestByBackupId.set(entry.backup_id, entry);
      }
    }
    return latestByBackupId;
  });
  const latestRetainedCompletedRestoreDrill = createMemo(() => {
    let latest: RuntimeRestoreDrillsResponse["entries"][number] | null = null;
    let latestMs = -Infinity;
    for (const entry of runtimeRestoreDrillEntries()) {
      if (!entry.completed_at || !retainedBackupIds().has(entry.backup_id)) continue;
      const parsed = Date.parse(entry.completed_at);
      if (Number.isNaN(parsed) || parsed <= latestMs) continue;
      latestMs = parsed;
      latest = entry;
    }
    return latest;
  });
  const rehearsedRuntimeBackupCount = createMemo(
    () => runtimeBackupEntries().filter((entry) => latestCompletedRestoreDrillByBackupId().has(entry.id)).length
  );
  const unrehearsedRuntimeBackupCount = createMemo(
    () => runtimeBackupEntries().length - rehearsedRuntimeBackupCount()
  );
  const activeRehearsedRuntimeBackupCount = createMemo(
    () => activeRuntimeBackupEntries().filter((entry) => latestCompletedRestoreDrillByBackupId().has(entry.id)).length
  );
  const activeUnrehearsedRuntimeBackupCount = createMemo(
    () => activeRuntimeBackupEntries().length - activeRehearsedRuntimeBackupCount()
  );
  const retainedRehearsalCoverageLabel = createMemo(() => {
    if (runtimeBackupEntries().length === 0) return "no retained snapshots";
    return `${rehearsedRuntimeBackupCount()} / ${runtimeBackupEntries().length}`;
  });
  const activeRehearsalCoverageLabel = createMemo(() => {
    if (activeRuntimeBackupEntries().length === 0) return "no active snapshots";
    return `${activeRehearsedRuntimeBackupCount()} / ${activeRuntimeBackupEntries().length}`;
  });
  const nextRuntimeBackupExpiry = createMemo(() =>
    nextFutureTimestampValue(runtimeBackupEntries().map((entry) => entry.expires_at))
  );
  const expiredRuntimeBackupCount = createMemo(() =>
    expiredTimestampCount(runtimeBackupEntries().map((entry) => entry.expires_at))
  );
  const restoreDrillRecordedCount = createMemo(() => runtimeRestoreDrillEntries().length);
  const restoreDrillInProgressCount = createMemo(
    () => runtimeRestoreDrillEntries().filter((entry) => !entry.completed_at).length
  );
  const restoreDrillCompletedCount = createMemo(
    () => runtimeRestoreDrillEntries().filter((entry) => Boolean(entry.completed_at)).length
  );
  const restoreDrillRehearsedBackupCount = createMemo(
    () => new Set(runtimeRestoreDrillEntries().map((entry) => entry.backup_id)).size
  );
  const restoreDrillRetainedCoverageLabel = createMemo(() => {
    if (runtimeBackupEntries().length === 0) return "no retained backups";
    return `${restoreDrillRehearsedBackupCount()} / ${runtimeBackupEntries().length} retained backups`;
  });
  const runtimeBackupSummaryItems = createMemo<SummaryItem[]>(() => [
    { label: "Retention", value: `${runtimeBackupsState()?.policy.retention_days ?? 0} days` },
    { label: "Storage", value: runtimeBackupsState()?.policy.storage_mode ?? "unknown" },
    {
      label: "Last snapshot",
      value: `${dateTimeLabel(runtimeBackupsState()?.policy.last_snapshot_at)} | ${relativeTimeLabel(runtimeBackupsState()?.policy.last_snapshot_at)}`,
    },
    { label: "Recorded snapshots", value: runtimeBackupEntries().length },
    { label: "Rehearsed snapshots", value: rehearsedRuntimeBackupCount() },
    { label: "Retained rehearsal coverage", value: retainedRehearsalCoverageLabel() },
    {
      label: "Latest retained rehearsal",
      value: latestRetainedCompletedRestoreDrill()?.completed_at
        ? `${dateTimeLabel(latestRetainedCompletedRestoreDrill()?.completed_at)} | ${relativeTimeLabel(latestRetainedCompletedRestoreDrill()?.completed_at)}`
        : "none",
    },
    { label: "Unrehearsed snapshots", value: unrehearsedRuntimeBackupCount() },
    { label: "Active unrehearsed", value: activeUnrehearsedRuntimeBackupCount() },
    { label: "Active rehearsed", value: activeRehearsedRuntimeBackupCount() },
    { label: "Active rehearsal coverage", value: activeRehearsalCoverageLabel() },
    { label: "Active snapshots", value: activeRuntimeBackupEntries().length },
    {
      label: "Workspace footprint",
      value: byteCountLabel(totalNumber(runtimeBackupEntries().map((entry) => entry.total_workspace_bytes))),
    },
    {
      label: "Artifact footprint",
      value: byteCountLabel(totalNumber(runtimeBackupEntries().map((entry) => entry.artifact_size_bytes))),
    },
    {
      label: "Next expiry",
      value: nextRuntimeBackupExpiry()
        ? `${dateTimeLabel(nextRuntimeBackupExpiry())} | ${relativeTimeLabel(nextRuntimeBackupExpiry())}`
        : "no upcoming expiry",
    },
    { label: "Expired snapshots", value: expiredRuntimeBackupCount() },
    {
      label: "Support posture",
      value: runtimeBackupsState()?.policy.support_disabled_by_default === false ? "customized" : "disabled by default",
    },
  ]);
  const restoreDrillSummaryItems = createMemo<SummaryItem[]>(() => [
    { label: "Recorded drills", value: restoreDrillRecordedCount() },
    { label: "In progress", value: restoreDrillInProgressCount() },
    { label: "Completed drills", value: restoreDrillCompletedCount() },
    { label: "Rehearsed backups", value: restoreDrillRehearsedBackupCount() },
    { label: "Coverage", value: restoreDrillRetainedCoverageLabel() },
    {
      label: "Latest completed",
      value: latestCompletedRestoreDrill()?.completed_at
        ? `${dateTimeLabel(latestCompletedRestoreDrill()?.completed_at)} | ${relativeTimeLabel(latestCompletedRestoreDrill()?.completed_at)}`
        : "none",
    },
    {
      label: "Latest completed outcome",
      value: latestCompletedRestoreDrill()
        ? `${latestCompletedRestoreDrill()?.status ?? "unknown"} | backup ${latestCompletedRestoreDrill()?.backup_id ?? "unknown"}`
        : "none",
    },
    {
      label: "Latest completed duration",
      value: latestCompletedRestoreDrill()
        ? (durationLabel(latestCompletedRestoreDrill()?.started_at, latestCompletedRestoreDrill()?.completed_at) ?? "unknown")
        : "none",
    },
    {
      label: "Latest drill",
      value: `${latestRestoreDrill()?.status ?? "unknown"} | ${relativeTimeLabel(latestRestoreDrill()?.completed_at ?? latestRestoreDrill()?.started_at)}`,
    },
  ]);
  const supportBoundarySummaryItems = createMemo<SummaryItem[]>(() => [
    { label: "Access status", value: props.supportAccess?.status ?? "disabled" },
    { label: "Scope", value: props.supportAccess?.access_scope ?? "none" },
    {
      label: "Consent posture",
      value: props.supportAccess?.support_disabled_by_default === false ? "customized" : "disabled by default",
    },
    {
      label: "Granted at",
      value: `${dateTimeLabel(props.supportAccess?.granted_at)} | ${relativeTimeLabel(props.supportAccess?.granted_at)}`,
    },
    {
      label: "Expires at",
      value: `${dateTimeLabel(props.supportAccess?.expires_at)} | ${relativeTimeLabel(props.supportAccess?.expires_at)}`,
    },
    {
      label: "Consent window",
      value: durationLabel(
        props.supportAccess?.granted_at,
        props.supportAccess?.revoked_at ?? props.supportAccess?.expires_at
      ) ?? "unknown",
    },
    {
      label: "Boundary timing",
      value: props.supportAccess?.revoked_at
        ? `ended ${relativeTimeLabel(props.supportAccess?.revoked_at)}`
        : props.supportAccess?.expires_at
          ? `ends ${relativeTimeLabel(props.supportAccess?.expires_at)}`
          : "unknown",
    },
    ...(props.supportAccess?.revoked_at
      ? [
          {
            label: "Revoked at",
            value: `${dateTimeLabel(props.supportAccess?.revoked_at)} | ${relativeTimeLabel(props.supportAccess?.revoked_at)}`,
          },
        ]
      : []),
  ]);
  function copyKeyPrefix() {
    const prefix = keyPrefix();
    if (!prefix) return;
    setKeyPrefixCopyError(null);
    navigator.clipboard.writeText(prefix).then(() => {
      setKeyPrefixCopied(true);
      setTimeout(() => setKeyPrefixCopied(false), 1500);
    }).catch((error) => {
      setKeyPrefixCopyError(error instanceof Error ? error.message : "Could not copy the expected key prefix.");
    });
  }

  // Saved-to-server snapshots — used for per-field dirty highlighting
  const [savedLlmBackend, setSavedLlmBackend] = createSignal<string>("byok");
  const [savedLlmModel, setSavedLlmModel] = createSignal<string>("claude-haiku-4-5-20251001");
  const [savedOllamaUrl, setSavedOllamaUrl] = createSignal<string>("http://localhost:11434");

  const [llmSaving, setLlmSaving] = createSignal(false);
  const [llmSaved, setLlmSaved] = createSignal(false);
  const [llmError, setLlmError] = createSignal("");
  const [llmDirty, setLlmDirty] = createSignal(false);
  const [llmPinging, setLlmPinging] = createSignal(false);
  const [llmPingResult, setLlmPingResult] = createSignal<{
    ok: boolean;
    reason?: string;
    backend?: string;
    provider?: string;
    httpStatus?: number;
  } | null>(null);
  const [modelResetTo, setModelResetTo] = createSignal<string | null>(null);
  let modelResetTimer: ReturnType<typeof setTimeout> | undefined;
  function flashModelReset(model: string) {
    clearTimeout(modelResetTimer);
    setModelResetTo(model);
    modelResetTimer = setTimeout(() => setModelResetTo(null), 3000);
  }
  const LLM_PING_KEY = "omnyid.llm.last_ping";
  const LLM_PING_OK_KEY = "omnyid.llm.last_ping_ok";
  const LLM_LATENCY_KEY = "omnyid.llm.latency_history";
  const LLM_TEST_HISTORY_KEY = "omnyid.llm.test_history";
  type LatencySnapshot = { ts: number; ms: number };
  type TestHistoryEntry = { ts: number; model: string; ms: number | null; ok: boolean; reason?: string };
  function loadLatencyHistory(): LatencySnapshot[] {
    try { return JSON.parse(localStorage.getItem(LLM_LATENCY_KEY) ?? "[]"); } catch { return []; }
  }
  function loadTestHistory(): TestHistoryEntry[] {
    try { return JSON.parse(localStorage.getItem(LLM_TEST_HISTORY_KEY) ?? "[]"); } catch { return []; }
  }
  const [latencyHistory, setLatencyHistory] = createSignal<LatencySnapshot[]>(loadLatencyHistory());
  const [testHistory, setTestHistory] = createSignal<TestHistoryEntry[]>(loadTestHistory());
  const [lastPingAt, setLastPingAt] = createSignal<number | null>(
    (() => { const v = localStorage.getItem(LLM_PING_KEY); return v ? parseInt(v) : null; })()
  );

  // LoRA history sparkline
  const LORA_HISTORY_KEY = "omnyid.lora.history";
  type LoraSnapshot = { date: string; score: number };
  function loadLoraHistory(): LoraSnapshot[] {
    try { return JSON.parse(localStorage.getItem(LORA_HISTORY_KEY) ?? "[]"); } catch { return []; }
  }
  const [loraHistory, setLoraHistory] = createSignal<LoraSnapshot[]>(loadLoraHistory());
  function clearLoraHistory() {
    localStorage.removeItem(LORA_HISTORY_KEY);
    setLoraHistory([]);
  }
  createEffect(() => {
    setRuntimeBackupsState(props.runtimeBackups ?? null);
  });
  createEffect(() => {
    setRuntimeRestoreDrillsState(props.runtimeRestoreDrills ?? null);
  });
  createEffect(() => {
    setRuntimeUpdatesState(props.runtimeUpdates ?? null);
  });
  function signalDashboardRefresh() {
    dispatchDashboardRefreshEvent({ reason: "runtime-management-updated" });
  }
  async function handleRuntimeBackupRetentionChange(retentionDays: 7 | 14 | 30 | 90) {
    setRuntimeBackupBusy("retention");
    setRuntimeFeedback("");
    try {
      const response = await setRuntimeBackupRetention(retentionDays);
      setRuntimeBackupsState(response);
      setRuntimeFeedback(`Backup retention updated to ${response.policy.retention_days} days.`);
      signalDashboardRefresh();
    } catch (error) {
      setRuntimeFeedback(error instanceof Error ? error.message : "Failed to update backup retention.");
    } finally {
      setRuntimeBackupBusy(null);
    }
  }
  async function handleCreateRuntimeSnapshot() {
    setRuntimeBackupBusy("snapshot");
    setRuntimeFeedback("");
    try {
      const response = await createRuntimeBackupSnapshot();
      setRuntimeBackupsState(response);
      setRuntimeFeedback("Runtime snapshot created.");
      setRuntimeBackupManifest(null);
      signalDashboardRefresh();
    } catch (error) {
      setRuntimeFeedback(error instanceof Error ? error.message : "Failed to create runtime snapshot.");
    } finally {
      setRuntimeBackupBusy(null);
    }
  }
  async function handleCreateRestoreDrill(backupId: string) {
    setRuntimeDrillBusyBackupId(backupId);
    setRuntimeFeedback("");
    try {
      const response = await createRuntimeRestoreDrill(backupId);
      setRuntimeRestoreDrillsState(response);
      setRuntimeFeedback(`Restore drill recorded for backup ${backupId}.`);
      signalDashboardRefresh();
    } catch (error) {
      setRuntimeFeedback(error instanceof Error ? error.message : "Failed to create restore drill.");
    } finally {
      setRuntimeDrillBusyBackupId(null);
    }
  }
  async function handleReviewRuntimeBackupManifest(backupId: string) {
    setRuntimeBackupManifestBusyId(backupId);
    setRuntimeFeedback("");
    try {
      const response = await fetchRuntimeBackupManifest(backupId);
      setRuntimeBackupManifest(response);
      setRuntimeFeedback(`Loaded manifest for backup ${backupId}.`);
    } catch (error) {
      setRuntimeFeedback(error instanceof Error ? error.message : "Failed to load runtime backup manifest.");
    } finally {
      setRuntimeBackupManifestBusyId(null);
    }
  }

  function closeRuntimeBackupManifestReview(options?: { restoreFocus?: boolean }) {
    setRuntimeBackupManifest(null);
    if (options?.restoreFocus === false) return;
    queueMicrotask(() => runtimeBackupManifestTriggerRef?.focus());
  }
  async function handleRuntimeUpdatePolicyChange(input: {
    update_channel: "stable" | "manual_only";
    auto_apply: "manual_only" | "scaffold_refresh_only";
  }) {
    setRuntimeUpdatesBusy("policy");
    setRuntimeFeedback("");
    try {
      const response = await setRuntimeUpdatePolicy(input);
      setRuntimeUpdatesState(response);
      setRuntimeFeedback("Runtime update policy saved.");
      signalDashboardRefresh();
    } catch (error) {
      setRuntimeFeedback(error instanceof Error ? error.message : "Failed to save runtime update policy.");
    } finally {
      setRuntimeUpdatesBusy(null);
    }
  }
  async function handleCheckRuntimeUpdates() {
    setRuntimeUpdatesBusy("check");
    setRuntimeFeedback("");
    try {
      const response = await checkRuntimeUpdates();
      setRuntimeUpdatesState(response);
      setRuntimeFeedback(response.update_available ? "Runtime updates checked. Update available." : "Runtime updates checked. No update available.");
      signalDashboardRefresh();
    } catch (error) {
      setRuntimeFeedback(error instanceof Error ? error.message : "Failed to check runtime updates.");
    } finally {
      setRuntimeUpdatesBusy(null);
    }
  }
  async function handleApplyRuntimeUpdate() {
    setRuntimeUpdatesBusy("apply");
    setRuntimeFeedback("");
    try {
      const response = await applyRuntimeUpdate();
      setRuntimeUpdatesState(response);
      setRuntimeFeedback("Runtime update action recorded.");
      signalDashboardRefresh();
    } catch (error) {
      setRuntimeFeedback(error instanceof Error ? error.message : "Failed to apply runtime update.");
    } finally {
      setRuntimeUpdatesBusy(null);
    }
  }
  async function handleDownloadRecoveryPacket() {
    setRuntimeRecoveryBusy(true);
    setRuntimeFeedback("");
    setRuntimeRecoveryPreviewOrigin("download");
    try {
      const response = await fetchRuntimeRecoveryPacket();
      setRuntimeRecoveryPacket(response);
      const blob = new Blob([JSON.stringify(response, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = response.packet_name || "omnyid-runtime-recovery-packet.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setRuntimeFeedback("Runtime recovery packet downloaded.");
    } catch (error) {
      setRuntimeFeedback(error instanceof Error ? error.message : "Failed to download runtime recovery packet.");
    } finally {
      setRuntimeRecoveryBusy(false);
    }
  }
  async function handlePreviewRecoveryPacket() {
    setRuntimeRecoveryBusy(true);
    setRuntimeFeedback("");
    setRuntimeRecoveryPreviewOrigin("preview");
    try {
      const response = await fetchRuntimeRecoveryPacket();
      setRuntimeRecoveryPacket(response);
      setRuntimeFeedback("Runtime recovery packet loaded for review.");
    } catch (error) {
      setRuntimeFeedback(error instanceof Error ? error.message : "Failed to load runtime recovery packet.");
    } finally {
      setRuntimeRecoveryBusy(false);
    }
  }

  function closeRuntimeRecoveryPacketPreview(options?: { restoreFocus?: boolean }) {
    setRuntimeRecoveryPacket(null);
    if (options?.restoreFocus === false) return;
    queueMicrotask(() => {
      if (runtimeRecoveryPreviewOrigin() === "download") {
        runtimeRecoveryDownloadTriggerRef?.focus();
      } else {
        runtimeRecoveryPreviewTriggerRef?.focus();
      }
    });
  }
  createEffect(() => {
    const score = instance()?.lora_confidence_score;
    if (score == null) return;
    const today = new Date().toISOString().slice(0, 10);
    const history = loadLoraHistory();
    const existing = history.find((h) => h.date === today);
    if (!existing) {
      const next = [...history, { date: today, score }].slice(-7);
      localStorage.setItem(LORA_HISTORY_KEY, JSON.stringify(next));
      setLoraHistory(next);
    } else if (existing.score !== score) {
      const next = history.map((h) => h.date === today ? { ...h, score } : h);
      localStorage.setItem(LORA_HISTORY_KEY, JSON.stringify(next));
      setLoraHistory(next);
    }
  });

  // Active tab for the API management section
  const [settingsTab, setSettingsTab] = createSignal<"llm" | "mcp" | "skills" | "runtime">("llm");
  const SETTINGS_TABS = ["llm", "mcp", "skills", "runtime"] as const;
  const LLM_BACKEND_OPTIONS = ["byok", "ollama", "runpod"] as const;
  const [devicePolicies, setDevicePolicies] = createSignal<DeviceSyncPolicyEntry[]>(
    props.deviceSyncPolicies ?? [],
  );
  const [devicePolicyUpdatingId, setDevicePolicyUpdatingId] = createSignal<string | null>(null);
  const [devicePolicyFeedback, setDevicePolicyFeedback] = createSignal<string | null>(null);

  createEffect(() => {
    setDevicePolicies(props.deviceSyncPolicies ?? []);
  });

  createEffect(() => {
    const tab = props.focusSettingsTab;
    if (!tab) return;
    setSettingsTab(tab);
    props.onSettingsTabFocusDone?.();
  });

  function focusSettingsTab(tab: (typeof SETTINGS_TABS)[number]) {
    const element = document.getElementById(`agent-settings-tab-${tab}`);
    if (element instanceof HTMLButtonElement) {
      element.focus();
    }
  }

  function handleSettingsTabKeyDown(currentTab: (typeof SETTINGS_TABS)[number], event: KeyboardEvent) {
    const currentIndex = SETTINGS_TABS.indexOf(currentTab);
    if (currentIndex < 0) return;

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextIndex = (currentIndex + direction + SETTINGS_TABS.length) % SETTINGS_TABS.length;
      const nextTab = SETTINGS_TABS[nextIndex];
      setSettingsTab(nextTab);
      focusSettingsTab(nextTab);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      const nextTab = SETTINGS_TABS[0];
      setSettingsTab(nextTab);
      focusSettingsTab(nextTab);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const nextTab = SETTINGS_TABS[SETTINGS_TABS.length - 1];
      setSettingsTab(nextTab);
      focusSettingsTab(nextTab);
    }
  }

  function closeOnboardingWizard(options?: { restoreFocus?: boolean }) {
    setShowWizard(false);
    if (options?.restoreFocus === false) return;
    queueMicrotask(() => onboardingWizardTriggerRef?.focus());
  }

  async function refreshInstance(options?: { target?: "bootstrap" | "wizard" }) {
    const target = options?.target ?? "bootstrap";
    if (target === "bootstrap") setInstanceLoadError(null);
    if (target === "wizard") setWizardRefreshError(null);
    try {
      const fleet = await apiFetch<{ master_instance?: AgentInstance }>("/agent/fleet");
      setInstance(fleet.master_instance ?? null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load agent identity.";
      if (target === "bootstrap") {
        setInstanceLoadError(message);
      } else {
        setWizardRefreshError(message);
      }
      return false;
    }
  }

  async function refreshInstanceAfterWizard() {
    const ok = await refreshInstance({ target: "wizard" });
    if (!ok && !wizardRefreshError()) {
      setWizardRefreshError("Could not refresh the updated agent personality.");
    }
  }

  function selectLlmBackend(backend: (typeof LLM_BACKEND_OPTIONS)[number]) {
    setLlmBackend(backend);
    if (backend === "byok") {
      setLlmModel("claude-haiku-4-5-20251001");
    } else if (backend === "ollama") {
      setLlmModel("llama3.2");
      flashModelReset("llama3.2");
    } else {
      setLlmModel("Qwen/Qwen3.5-35B-A3B");
      flashModelReset("Qwen/Qwen3.5-35B-A3B");
    }
    setLlmDirty(true);
  }

  function focusLlmBackendOption(backend: (typeof LLM_BACKEND_OPTIONS)[number]) {
    const element = document.getElementById(`llm-backend-option-${backend}`);
    if (element instanceof HTMLButtonElement) {
      element.focus();
    }
  }

  function handleLlmBackendKeyDown(currentBackend: (typeof LLM_BACKEND_OPTIONS)[number], event: KeyboardEvent) {
    const currentIndex = LLM_BACKEND_OPTIONS.indexOf(currentBackend);
    if (currentIndex < 0) return;

    if (event.key === "ArrowRight" || event.key === "ArrowDown" || event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (currentIndex + direction + LLM_BACKEND_OPTIONS.length) % LLM_BACKEND_OPTIONS.length;
      const nextBackend = LLM_BACKEND_OPTIONS[nextIndex];
      selectLlmBackend(nextBackend);
      focusLlmBackendOption(nextBackend);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      const nextBackend = LLM_BACKEND_OPTIONS[0];
      selectLlmBackend(nextBackend);
      focusLlmBackendOption(nextBackend);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const nextBackend = LLM_BACKEND_OPTIONS[LLM_BACKEND_OPTIONS.length - 1];
      selectLlmBackend(nextBackend);
      focusLlmBackendOption(nextBackend);
    }
  }

  async function setDevicePolicyProfile(
    deviceId: string,
    profile: "full" | "balanced" | "lightweight",
  ) {
    setDevicePolicyUpdatingId(deviceId);
    setDevicePolicyFeedback(null);
    try {
      const response = await updateDeviceSyncPolicyProfile({
        device_id: deviceId,
        policy_profile: profile,
      });
      setDevicePolicies(response.entries ?? []);
      setDevicePolicyFeedback(`Updated ${deviceId} to ${profile}.`);
      dispatchDashboardRefreshEvent({ reason: "device-sync-policy-update" });
    } catch (error) {
      setDevicePolicyFeedback(
        error instanceof Error ? error.message : "Failed to update sync policy.",
      );
    } finally {
      setDevicePolicyUpdatingId(null);
    }
  }

  // Capability registry state
  const [capabilities, setCapabilities] = createSignal<CapabilityDescriptor[]>([]);
  const [showAddCapability, setShowAddCapability] = createSignal(false);
  const [capDeleting, setCapDeleting] = createSignal<string | null>(null);
  const [capAdding, setCapAdding] = createSignal<string | null>(null);
  const [capLoadError, setCapLoadError] = createSignal<string | null>(null);
  const [capActionError, setCapActionError] = createSignal<string | null>(null);
  let addCapabilityTriggerRef: HTMLButtonElement | undefined;
  const [newCapId, setNewCapId] = createSignal<string | null>(null);
  const SOUL_SAVED_KEY = "omnyid.soul.saved_at";
  const [soulSavedAt, setSoulSavedAt] = createSignal<number | null>(
    (() => { const v = localStorage.getItem("omnyid.soul.saved_at"); return v ? parseInt(v) : null; })()
  );
  const [soulCopied, setSoulCopied] = createSignal(false);
  const [soulCopyError, setSoulCopyError] = createSignal<string | null>(null);
  const [identityCardExportError, setIdentityCardExportError] = createSignal<string | null>(null);
  const [showSoulEditor, setShowSoulEditor] = createSignal(false);
  const [soulEditText, setSoulEditText] = createSignal("");
  const [soulSaving, setSoulSaving] = createSignal(false);
  const [soulSaveError, setSoulSaveError] = createSignal("");
  let soulEditorTriggerRef: HTMLButtonElement | undefined;

  function copySoulMd() {
    setSoulCopyError(null);
    navigator.clipboard.writeText(instance()?.soul_md ?? "").then(() => {
      setSoulCopied(true);
      setTimeout(() => setSoulCopied(false), 1500);
    }).catch((error) => {
      setSoulCopyError(error instanceof Error ? error.message : "Could not copy soul.md.");
    });
  }

  function openSoulEditor() {
    setSoulEditText(instance()?.soul_md ?? "");
    setSoulSaveError("");
    setShowSoulEditor(true);
  }

  function closeSoulEditor(options?: { restoreFocus?: boolean }) {
    setShowSoulEditor(false);
    if (options?.restoreFocus === false) return;
    queueMicrotask(() => soulEditorTriggerRef?.focus());
  }

  function requestCloseSoulEditor(options?: { restoreFocus?: boolean }) {
    if (soulSaving()) return;
    closeSoulEditor(options);
  }

  async function saveSoulMd() {
    if (soulSaving()) return;
    setSoulSaving(true);
    setSoulSaveError("");
    try {
      await apiFetch("/agent/soul_md", { method: "PUT", bodyJson: { soul_md: soulEditText() } });
      const fleet = await apiFetch<{ master_instance?: AgentInstance }>("/agent/fleet");
      setInstance(fleet.master_instance ?? null);
      const savedNow = Date.now();
      setSoulSavedAt(savedNow);
      localStorage.setItem(SOUL_SAVED_KEY, String(savedNow));
      closeSoulEditor({ restoreFocus: true });
    } catch (e: unknown) {
      setSoulSaveError(e instanceof Error ? e.message : "Save failed");
    }
    setSoulSaving(false);
  }

  const CAP_LAST_USED_KEY = "omnyid.cap.last_used";
  const [capLastUsed, setCapLastUsed] = createSignal<Record<string, number>>(
    (() => { try { const v = localStorage.getItem(CAP_LAST_USED_KEY); return v ? JSON.parse(v) as Record<string, number> : {}; } catch { return {}; } })()
  );
  const CAP_USAGE_COUNT_KEY = "omnyid.cap.usage_count";
  const [capUsageCount, setCapUsageCount] = createSignal<Record<string, number>>(
    (() => { try { const v = localStorage.getItem(CAP_USAGE_COUNT_KEY); return v ? JSON.parse(v) as Record<string, number> : {}; } catch { return {}; } })()
  );
  const CAP_DOW_KEY = "omnyid.cap.dow_usage";
  const [capDowUsage, setCapDowUsage] = createSignal<Record<string, number[]>>(
    (() => { try { const v = localStorage.getItem(CAP_DOW_KEY); return v ? JSON.parse(v) as Record<string, number[]> : {}; } catch { return {}; } })()
  );
  function touchCapLastUsed(id: string) {
    const now = Date.now();
    setCapLastUsed((prev) => {
      const next = { ...prev, [id]: now };
      localStorage.setItem(CAP_LAST_USED_KEY, JSON.stringify(next));
      return next;
    });
    setCapUsageCount((prev) => {
      const next = { ...prev, [id]: (prev[id] ?? 0) + 1 };
      localStorage.setItem(CAP_USAGE_COUNT_KEY, JSON.stringify(next));
      return next;
    });
    const dow = new Date().getDay();
    setCapDowUsage((prev) => {
      const existing = prev[id] ?? [0, 0, 0, 0, 0, 0, 0];
      const next = [...existing] as number[];
      next[dow] = (next[dow] ?? 0) + 1;
      const updated = { ...prev, [id]: next };
      localStorage.setItem(CAP_DOW_KEY, JSON.stringify(updated));
      return updated;
    });
  }

  const APPROVAL_CYCLE: CapabilityDescriptor["approval_mode"][] = [
    "suggest_only",
    "human_approval_required",
    "autonomous",
  ];
  const [capModePatching, setCapModePatching] = createSignal<string | null>(null);
  const [capModeSaved, setCapModeSaved] = createSignal<string | null>(null);
  async function cycleApprovalMode(cap: CapabilityDescriptor) {
    const next = APPROVAL_CYCLE[(APPROVAL_CYCLE.indexOf(cap.approval_mode) + 1) % APPROVAL_CYCLE.length];
    setCapModePatching(cap.id);
    setCapActionError(null);
    try {
      await patchCapability(cap.id, { approval_mode: next });
      await refreshCapabilities();
      touchCapLastUsed(cap.id);
      setCapModeSaved(cap.id);
      setTimeout(() => setCapModeSaved((prev) => (prev === cap.id ? null : prev)), 1500);
    } catch (error) {
      setCapActionError(error instanceof Error ? error.message : "Could not update capability approval mode.");
    }
    setCapModePatching(null);
  }

  const [capFilter, setCapFilter] = createSignal("");
  const [capImporting, setCapImporting] = createSignal(false);
  const [capImportResult, setCapImportResult] = createSignal<string | null>(null);
  let capImportInputRef: HTMLInputElement | undefined;

  function exportCapabilities() {
    const json = JSON.stringify(capabilities(), null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "omnyid-capabilities.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportIdentityCard() {
    setIdentityCardExportError(null);
    const inst = instance();
    const cfg = llmConfig();
    const caps = capabilities();
    const card = null as Window | null;

    {
      const agentId = `omnyid-${Date.now().toString(36).toUpperCase()}`;
      const model = cfg?.model ?? llmModel();
      const provider = cfg?.provider ?? llmProvider();
      const loraScore = inst?.lora_confidence_score != null
        ? `${Math.round(inst.lora_confidence_score * 100)}%`
        : "-";
      const issuedAt = new Date().toLocaleDateString("en-AU", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });

      const opened = exportAgentIdentityCard({
        agentId,
        model,
        provider,
        loraScore,
        issuedAt,
        capabilities: caps,
      });
      if (!opened) {
        setIdentityCardExportError("Could not open the print preview. Allow pop-ups for OmnyID and try again.");
      }
      return;
    }

    // Escape HTML entities before injecting server-derived values into document.write.
    const esc = (s: unknown) => String(s ?? "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const agentId = `omnyid-${Date.now().toString(36).toUpperCase()}`;
    const model = cfg?.model ?? llmModel();
    const provider = cfg?.provider ?? llmProvider();
    const loraScore = inst?.lora_confidence_score != null
      ? `${Math.round(inst!.lora_confidence_score! * 100)}%`
      : "-";
    const capList = caps.length > 0
      ? caps.map((c) => `<li>${esc(c.id)}: ${esc(c.description)}</li>`).join("")
      : "<li style='color:#888'>No capabilities registered</li>";

    card!.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>OmnyID Agent Identity Card</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,system-ui,sans-serif;background:#f0f3f9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem}
  .card{width:680px;min-height:360px;background:linear-gradient(135deg,#fff 60%,#e8eef8);border-radius:20px;box-shadow:0 20px 60px rgba(49,86,142,0.18);overflow:hidden;position:relative;display:flex;flex-direction:column}
  .header{background:linear-gradient(135deg,#31568e,#3d6aaa);color:#fff;padding:28px 32px 24px;display:flex;align-items:center;gap:24px}
  .avatar{width:72px;height:72px;border-radius:16px;background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.35);display:flex;align-items:center;justify-content:center;font-size:2em;flex-shrink:0}
  .header-text h1{font-size:22px;font-weight:700;letter-spacing:-0.02em}
  .header-text p{font-size:11px;opacity:0.7;margin-top:2px;font-family:monospace}
  .badge{display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:999px;padding:3px 10px;font-size:10px;margin-top:8px;font-family:monospace;letter-spacing:0.05em}
  .body{display:grid;grid-template-columns:1fr 1fr;gap:0;flex:1}
  .col{padding:24px 28px;border-right:1px solid rgba(49,86,142,0.08)}
  .col:last-child{border-right:none}
  .section-label{font-size:9px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#737781;margin-bottom:10px}
  .field{margin-bottom:14px}
  .field-name{font-size:10px;color:#737781;margin-bottom:2px}
  .field-val{font-size:13px;font-weight:600;color:#1a1c1b}
  .field-val.mono{font-family:monospace;font-size:11px;font-weight:400;color:#31568e;word-break:break-all}
  .cap-list{list-style:none;display:flex;flex-direction:column;gap:4px}
  .cap-list li{font-size:11px;color:#434750;padding:4px 8px;background:rgba(49,86,142,0.05);border-radius:6px}
  .footer{background:#f8f9fc;border-top:1px solid rgba(49,86,142,0.08);padding:12px 28px;display:flex;align-items:center;justify-content:space-between}
  .footer p{font-size:9px;color:#737781;font-family:monospace}
  .qr-stub{width:48px;height:48px;background:#31568e;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:8px;font-family:monospace;text-align:center;line-height:1.3}
  @media print{body{background:#fff;padding:0}@page{margin:0;size:A5 landscape}}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="avatar">AI</div>
    <div class="header-text">
      <h1>OmnyID Master Agent</h1>
      <p>Agent Identity Card | v1 | AFP-compliant</p>
      <span class="badge">E2EE-Verified | Local-First | Agent-First</span>
    </div>
  </div>
  <div class="body">
    <div class="col">
      <p class="section-label">Identity</p>
      <div class="field"><div class="field-name">Agent ID</div><div class="field-val mono">${esc(agentId)}</div></div>
      <div class="field"><div class="field-name">LLM Model</div><div class="field-val">${esc(model)}</div></div>
      <div class="field"><div class="field-name">Provider</div><div class="field-val">${esc(provider)}</div></div>
      <div class="field"><div class="field-name">LoRA Confidence</div><div class="field-val">${esc(loraScore)}</div></div>
      <div class="field"><div class="field-name">Issued</div><div class="field-val">${new Date().toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" })}</div></div>
    </div>
    <div class="col">
      <p class="section-label">Capabilities (${caps.length})</p>
      <ul class="cap-list">${capList}</ul>
    </div>
  </div>
  <div class="footer">
    <div>
      <p>OmnyID | omnyid.com | AFP v1</p>
      <p>This card is a non-binding identity record for the registered agent instance.</p>
    </div>
    <div class="qr-stub">ID<br/>${esc(agentId.slice(-6))}</div>
  </div>
</div>
<script>window.onload=()=>window.print();<\/script>
</body>
</html>`);
    card!.document.close();
  }

  function exportSovereignDataBundle() {
    exportSovereignDataBundleFile();
  }

  async function handleImportFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    setCapImporting(true);
    setCapImportResult(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as CapabilityDescriptor[];
      if (!Array.isArray(parsed)) throw new Error("Expected a JSON array");
      const existing = new Set(capabilities().map((c) => c.name));
      const toAdd = parsed.filter((c) => !existing.has(c.name));
      for (const cap of toAdd) {
        await registerCapability({
          name: cap.name,
          description: cap.description,
          input_schema: cap.input_schema,
          output_schema: cap.output_schema ?? null,
          version: cap.version ?? "1.0.0",
          tags: cap.tags ?? [],
          approval_mode: cap.approval_mode ?? "suggest_only",
        });
      }
      await refreshCapabilities();
      setCapImportResult(`Imported ${toAdd.length} capability${toAdd.length === 1 ? "" : "ies"}`);
      setTimeout(() => setCapImportResult(null), 4000);
    } catch (err) {
      setCapImportResult(`Import failed: ${err instanceof Error ? err.message : "unknown error"}`);
      setTimeout(() => setCapImportResult(null), 6000);
    }
    setCapImporting(false);
    (e.currentTarget as HTMLInputElement).value = "";
  }
  const filteredCapabilities = createMemo(() => {
    const q = capFilter().toLowerCase().trim();
    if (!q) return capabilities();
    return capabilities().filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description ?? "").toLowerCase().includes(q)
    );
  });

  const CAPABILITY_TEMPLATES: Array<{
    id: string;
    icon: string;
    name: string;
    description: string;
    tags: string[];
    approval_mode: CapabilityDescriptor["approval_mode"];
    input_schema: Record<string, unknown>;
  }> = [
    {
      id: "email_guardian",
      icon: "🛡",
      name: "email_guardian",
      description: "Monitor inbox for phishing, suspicious senders, and unwanted bulk mail. Flag or quarantine on detection, requiring your approval before any action.",
      tags: ["email", "security", "monitor"],
      approval_mode: "human_approval_required",
      input_schema: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "The email message ID to inspect" },
          sender: { type: "string", description: "Sender address" },
          subject: { type: "string", description: "Email subject line" },
        },
        required: ["email_id", "sender"],
      },
    },
    {
      id: "email_auto_label",
      icon: "🏷",
      name: "email_auto_label",
      description: "Automatically label incoming emails using existing Gmail labels. Proposes new labels for approval before creating them.",
      tags: ["email", "organisation"],
      approval_mode: "suggest_only",
      input_schema: {
        type: "object",
        properties: {
          email_id: { type: "string" },
          subject: { type: "string" },
          snippet: { type: "string" },
        },
        required: ["email_id"],
      },
    },
    {
      id: "email_draft_reply",
      icon: "✍️",
      name: "email_draft_reply",
      description: "Draft replies to emails requiring a response. Always presents the draft for manual review before sending.",
      tags: ["email", "compose"],
      approval_mode: "human_approval_required",
      input_schema: {
        type: "object",
        properties: {
          email_id: { type: "string" },
          thread_id: { type: "string" },
          context: { type: "string", description: "Summary of the email thread" },
        },
        required: ["email_id"],
      },
    },
  ];

  async function addFromTemplate(tpl: (typeof CAPABILITY_TEMPLATES)[number]) {
    if (capAdding()) return;
    setCapAdding(tpl.id);
    setCapActionError(null);
    try {
      await registerCapability({
        name: tpl.name,
        description: tpl.description,
        input_schema: tpl.input_schema,
        output_schema: null,
        version: "1.0.0",
        tags: tpl.tags,
        approval_mode: tpl.approval_mode,
      });
      await refreshCapabilities();
      const added = capabilities().find((c) => c.name === tpl.name);
      if (added) {
        setNewCapId(added.id);
        setTimeout(() => setNewCapId((prev) => (prev === added.id ? null : prev)), 3000);
      }
    } catch (error) {
      setCapActionError(error instanceof Error ? error.message : `Could not add ${tpl.name}.`);
    }
    setCapAdding(null);
  }

  function closeAddCapabilityModal(options?: { restoreFocus?: boolean }) {
    setShowAddCapability(false);
    if (options?.restoreFocus === false) return;
    queueMicrotask(() => addCapabilityTriggerRef?.focus());
  }

  async function refreshCapabilities() {
    setCapLoadError(null);
    try {
      const caps = await listCapabilities();
      setCapabilities(caps);
    } catch (error) {
      setCapLoadError(error instanceof Error ? error.message : "Could not load capabilities.");
    }
  }

  async function handleDeleteCapability(id: string) {
    setCapDeleting(id);
    setCapActionError(null);
    try {
      await deleteCapability(id);
      await refreshCapabilities();
    } catch (error) {
      setCapActionError(error instanceof Error ? error.message : "Could not remove this capability.");
    }
    setCapDeleting(null);
  }

  onMount(async () => {
    // Scroll to LLM config section if opened via the pill link
    if (props.focusLlm && llmSectionRef) {
      setTimeout(() => llmSectionRef?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
    props.onFocusDone?.();

    await refreshInstance({ target: "bootstrap" });
    await refreshCapabilities();
    try {
      const cfg = await fetchLlmConfig();
      setLlmConfig(cfg);
      if (cfg.backend === "ollama" || cfg.backend === "byok" || cfg.backend === "runpod") {
        setLlmBackend(cfg.backend as "byok" | "ollama" | "runpod");
        setSavedLlmBackend(cfg.backend);
      }
      if (cfg.provider) {
        setLlmProvider(cfg.provider);
      }
      setLlmModel(cfg.model);
      setSavedLlmModel(cfg.model);
      if (cfg.ollama_url) { setLlmOllamaUrl(cfg.ollama_url); setSavedOllamaUrl(cfg.ollama_url); }
    } catch { /* not configured yet */ }
    setLoading(false);
  });

  async function saveLlm() {
    setLlmSaving(true);
    setLlmError("");
    setLlmPingResult(null);
    try {
      const normalizedBackend = llmBackend();
      const normalizedProvider = llmProvider().trim();
      const normalizedModel = llmModel().trim();
      const normalizedApiKey = llmApiKey().trim();
      const normalizedOllamaUrl = llmOllamaUrl().trim();
      await saveLlmConfig({
        backend: normalizedBackend,
        provider: normalizedBackend === "byok" ? normalizedProvider || undefined : undefined,
        model: normalizedModel || undefined,
        api_key: normalizedBackend === "byok" ? normalizedApiKey || undefined : undefined,
        ollama_url: normalizedBackend === "ollama" ? normalizedOllamaUrl || undefined : undefined,
      });
      setLlmProvider(normalizedProvider || llmProvider());
      setLlmModel(normalizedModel);
      setLlmApiKey(normalizedApiKey);
      setLlmOllamaUrl(normalizedOllamaUrl);
      setLlmSaved(true);
      setLlmDirty(false);
      setSavedLlmBackend(normalizedBackend);
      setSavedLlmModel(normalizedModel);
      setSavedOllamaUrl(normalizedOllamaUrl);
      setTimeout(() => setLlmSaved(false), 3000);
      const cfg = await fetchLlmConfig();
      setLlmConfig(cfg);
    } catch (e: unknown) {
      setLlmError(e instanceof Error ? e.message : "Save failed");
    }
    setLlmSaving(false);
  }

  function pushTestHistory(entry: TestHistoryEntry) {
    const next = [entry, ...loadTestHistory()].slice(0, 10);
    localStorage.setItem(LLM_TEST_HISTORY_KEY, JSON.stringify(next));
    setTestHistory(next);
  }

  async function testLlmConnection() {
    // Auto-save unsaved changes before pinging so the test reflects what the user typed.
    if (llmDirty() && !llmSaving()) await saveLlm();
    setLlmPinging(true);
    setLlmPingResult(null);
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setLlmPingResult({ ok: false, reason: "Request timed out after 10s", backend: llmBackend(), provider: llmProvider() });
      localStorage.setItem(LLM_PING_OK_KEY, "0");
      pushTestHistory({ ts: Date.now(), model: llmModel(), ms: null, ok: false, reason: "timeout" });
      setLlmPinging(false);
    }, 10_000);
    try {
      const t0 = performance.now();
      const result = await pingLlmConfig();
      const latencyMs = Math.round(performance.now() - t0);
      clearTimeout(timeoutId);
      if (!timedOut) {
        setLlmPingResult({
          ok: result.ok,
          reason: result.reason,
          backend: result.backend,
          provider: result.provider,
          httpStatus: result.http_status,
        });
        localStorage.setItem(LLM_PING_OK_KEY, result.ok ? "1" : "0");
        if (result.ok) {
          const now = Date.now();
          localStorage.setItem(LLM_PING_KEY, String(now));
          setLastPingAt(now);
          const next = [...loadLatencyHistory(), { ts: now, ms: latencyMs }].slice(-7);
          localStorage.setItem(LLM_LATENCY_KEY, JSON.stringify(next));
          setLatencyHistory(next);
          setTimeout(() => setLlmPingResult(null), 8000);
        }
        pushTestHistory({ ts: Date.now(), model: llmModel(), ms: result.ok ? latencyMs : null, ok: result.ok, reason: result.reason });
      }
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      if (!timedOut) {
        const reason = e instanceof Error ? e.message : "Connection failed";
        setLlmPingResult({ ok: false, reason, backend: llmBackend(), provider: llmProvider() });
        pushTestHistory({ ts: Date.now(), model: llmModel(), ms: null, ok: false, reason });
      }
    }
    if (!timedOut) setLlmPinging(false);
  }

  return (
    <div class="space-y-5">
      <div class="glass-surface rounded-xl border border-white/40 p-6 shadow-panel">
        <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Agent Settings</p>
        <h3 class="mt-2 text-lg font-semibold text-on-surface">Your Master Agent</h3>
        <p class="mt-1 text-sm leading-6 text-on-surface-variant">
          Configure your agent's personality, tone, goals, and operating rules.
          These shape how your agent speaks and what it prioritises.
        </p>

        <Show
          when={!loading()}
          fallback={
            <NoticeBox
              role="status"
              ariaLive="polite"
              ariaAtomic={true}
              class="mt-4 border-0 bg-transparent px-0 py-0 text-sm text-on-surface-variant"
            >
              Loading…
            </NoticeBox>
          }
        >
          <Show when={instanceLoadError()}>
            {(message) => (
              <NoticeBox role="alert" ariaLive="assertive" ariaAtomic={true} class="mt-4 text-sm text-red-500">
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <span>Could not load master agent identity: {message()}</span>
                  <button
                    type="button"
                    onClick={() => void refreshInstance({ target: "bootstrap" })}
                    class="font-medium text-red-500 underline underline-offset-2"
                  >
                    Retry identity
                  </button>
                </div>
              </NoticeBox>
            )}
          </Show>
          {/* Soul / personality section */}
          <div class="mt-5 space-y-3">
            <SectionCard
              title="Personality &amp; Rules"
              description="Your agent's soul — how it communicates and what it avoids."
              headerActions={
                <Show
                  when={confirmReconfigure()}
                  fallback={
                    <button
                      type="button"
                      onClick={() => setConfirmReconfigure(true)}
                      class="flex-shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition hover:bg-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Reconfigure
                    </button>
                  }
                >
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-on-surface-variant">Overwrite current personality?</span>
                    <button
                      ref={onboardingWizardTriggerRef}
                      type="button"
                      onClick={() => {
                        setWizardRefreshError(null);
                        setConfirmReconfigure(false);
                        setShowWizard(true);
                      }}
                      aria-haspopup="dialog"
                      aria-expanded={showWizard()}
                      aria-controls="onboarding-wizard-dialog"
                      class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Yes, continue
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReconfigure(false)}
                      class="rounded-lg border border-white/40 bg-white/30 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Cancel
                    </button>
                  </div>
                </Show>
              }
            >
              <Show when={wizardRefreshError()}>
                {(message) => (
                  <div class="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300/50 bg-amber-50/90 px-3 py-2 text-xs text-amber-900 shadow-sm">
                    <span>Personality refresh failed: {message()}</span>
                    <button
                      type="button"
                      onClick={() => void refreshInstanceAfterWizard()}
                      class="font-medium text-amber-900 underline underline-offset-2"
                    >
                      Retry refresh
                    </button>
                  </div>
                )}
              </Show>

              <Show when={instance()?.soul_md}>
                <div class="group relative mt-3">
                  <pre class="max-h-48 overflow-auto rounded-lg bg-black/10 p-3 font-mono text-[11px] leading-5 text-on-surface-variant whitespace-pre-wrap">
                    {instance()!.soul_md}
                  </pre>
                  <div class="absolute right-2 top-2 flex items-center gap-[0.5em] opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={copySoulMd}
                      title="Copy soul.md to clipboard"
                      aria-label={soulCopied() ? "soul.md copied to clipboard" : "Copy soul.md to clipboard"}
                      class="rounded bg-white/70 px-[0.5em] py-[0.2em] font-mono text-[0.65em] text-on-surface-variant backdrop-blur-sm transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {soulCopied() ? "copied" : "copy"}
                    </button>
                    <button
                      ref={soulEditorTriggerRef}
                      type="button"
                      onClick={openSoulEditor}
                      title="Edit soul.md"
                      aria-label="Edit soul.md"
                      aria-haspopup="dialog"
                      aria-expanded={showSoulEditor()}
                      aria-controls="soul-editor-dialog"
                      class="rounded bg-primary/10 px-[0.5em] py-[0.2em] font-mono text-[0.65em] text-primary backdrop-blur-sm transition hover:bg-primary/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Edit
                    </button>
                  </div>
                </div>
                <Show when={soulCopyError()}>
                  {(message) => (
                    <NoticeBox role="alert" ariaLive="assertive" ariaAtomic={true} class="mt-2 text-xs text-red-500">
                      <div class="flex flex-wrap items-center justify-between gap-3">
                        <span>Could not copy soul.md: {message()}</span>
                        <button
                          type="button"
                          onClick={() => setSoulCopyError(null)}
                          class="font-medium text-red-500 underline underline-offset-2"
                        >
                          Dismiss
                        </button>
                      </div>
                    </NoticeBox>
                  )}
                </Show>
                <Show when={soulSavedAt() !== null}>
                  <p class="mt-1 font-mono text-[10px] text-on-surface-variant/40">
                    {(() => {
                      const secs = Math.floor((Date.now() - soulSavedAt()!) / 1000);
                      if (secs < 60) return "last saved just now";
                      if (secs < 3600) return `last saved ${Math.floor(secs / 60)}m ago`;
                      if (secs < 86400) return `last saved ${Math.floor(secs / 3600)}h ago`;
                      return `last saved ${Math.floor(secs / 86400)}d ago`;
                    })()}
                  </p>
                </Show>
              </Show>
            </SectionCard>

            {/* LoRA status */}
            <SectionCard
              title="LoRA Genome"
              description="As your agent learns your style, it progressively internalises your soul.md. At 85% confidence the genome takes over and soul.md becomes an archived reference."
            >
              <div class="mt-3">
                <div class="flex items-center justify-between text-xs text-on-surface-variant">
                  <span>Confidence</span>
                  <span>{((instance()?.lora_confidence_score ?? 0) * 100).toFixed(0)}%</span>
                </div>
                <div class="mt-1.5 h-1.5 rounded-full bg-white/15">
                  <div
                    class="h-full rounded-full bg-primary transition-all"
                    style={`width: ${Math.min(100, (instance()?.lora_confidence_score ?? 0) * 100)}%`}
                  />
                </div>
                <Show when={instance()?.lora_genome_active}>
                  <p class="mt-2 text-xs font-medium text-green-600">LoRA genome active | soul.md is now archived</p>
                </Show>
                <Show when={loraHistory().length > 1}>
                  <div class="mt-3 flex items-stretch gap-1.5">
                    <div class="flex flex-col justify-between py-[3px]">
                      <span class="font-mono text-[8px] leading-none text-on-surface-variant/30">100%</span>
                      <span class="font-mono text-[8px] leading-none text-on-surface-variant/30">0%</span>
                    </div>
                    <div class="flex flex-1 items-end gap-[3px]" title="7-day LoRA confidence history">
                      <For each={loraHistory()}>
                        {(snap) => (
                          <div
                            class="flex-1 rounded-sm bg-primary/50 transition-all"
                            style={`height: ${Math.max(3, Math.round(snap.score * 24))}px`}
                            title={`${snap.date}: ${(snap.score * 100).toFixed(0)}%`}
                          />
                        )}
                      </For>
                    </div>
                  </div>
                  <div class="mt-0.5 flex items-center justify-between">
                    <p class="font-mono text-[9px] text-on-surface-variant/40">7-day trend</p>
                    <button
                      type="button"
                      onClick={clearLoraHistory}
                      class="font-mono text-[9px] text-on-surface-variant/30 transition hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      clear history
                    </button>
                  </div>
                  {(() => {
                    const hist = loraHistory();
                    if (hist.length < 2) return null;
                    const last = hist[hist.length - 1].score;
                    let stableDays = 1;
                    for (let i = hist.length - 2; i >= 0; i--) {
                      if (Math.abs(hist[i].score - last) < 0.01) stableDays++;
                      else break;
                    }
                    if (stableDays < 2) return null;
                    return (
                      <p class="mt-0.5 font-mono text-[9px] text-on-surface-variant/50">
                        Stable for {stableDays} day{stableDays === 1 ? "" : "s"} | training may have plateaued
                      </p>
                    );
                  })()}
                </Show>
              </div>
            </SectionCard>

            {/* API management tab bar */}
            <div role="tablist" aria-label="Agent settings sections" class="flex gap-0 border-b border-white/10">
              {SETTINGS_TABS.map((tab) => {
                const LABELS: Record<string, string> = {
                  llm: "LLM & APIs",
                  mcp: "MCP Tools",
                  skills: "Skills",
                  runtime: "Runtime & Devices",
                };
                return (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={settingsTab() === tab}
                    aria-controls={`agent-settings-panel-${tab}`}
                    id={`agent-settings-tab-${tab}`}
                    tabIndex={settingsTab() === tab ? 0 : -1}
                    class={`-mb-px border-b-2 px-4 py-2.5 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                      settingsTab() === tab
                        ? "border-primary text-primary"
                        : "border-transparent text-on-surface-variant hover:text-on-surface"
                    }`}
                    onClick={() => setSettingsTab(tab)}
                    onKeyDown={(event) => handleSettingsTabKeyDown(tab, event)}
                  >
                    {LABELS[tab]}
                  </button>
                );
              })}
            </div>

            {/* LLM Configuration */}
            <Show when={settingsTab() === "llm"}>
            <div
              id="agent-settings-panel-llm"
              role="tabpanel"
              aria-labelledby="agent-settings-tab-llm"
              class="pt-4"
            >
            <SectionCard
              class="rounded-xl border border-white/20 bg-white/10 p-4"
              title="AI Model Configuration"
              description="Choose how your agent calls the AI. Use your own API key (Anthropic/OpenAI compatible) or point to a local Ollama instance for full privacy."
            >

              <Show when={llmConfig()}>
                <p class="mt-2 text-xs text-on-surface-variant">
                  Current: <span class="font-medium text-on-surface">{llmConfig()!.backend}</span>
                  {" | "}<span class="font-mono">{llmConfig()!.model}</span>
                </p>
              </Show>

              {/* Browser AI status — shown when browser supports it */}
              <Show when={props.browserAiLabel}>
                <div class={`mt-3 rounded-lg border px-3 py-2 flex items-start gap-2 ${llmConfig() ? "border-white/15 bg-white/5" : "border-primary/30 bg-primary/10"}`}>
                  <span class="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-primary/80">AI</span>
                  <div>
                    <p class="text-xs font-medium text-on-surface">
                      {props.browserAiLabel} detected
                      {!llmConfig() && <span class="ml-1.5 text-primary font-semibold">| Active</span>}
                    </p>
                    <p class="mt-0.5 text-[10px] text-on-surface-variant">
                      {llmConfig()
                        ? "Your server API key takes priority. Browser AI is used as fallback only."
                        : "Being used for intent classification. Add an API key below to switch to a more capable cloud model."}
                    </p>
                  </div>
                </div>
              </Show>

              <div class="mt-4 space-y-3">
                {/* Backend selector */}
                <fieldset role="radiogroup">
                  <legend class="mb-1 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                    Backend
                    <InfoHint text="Choose whether your agent uses your own cloud API key, a local Ollama server, or a server-managed RunPod deployment." />
                  </legend>
                  <div class="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      role="radio"
                      id="llm-backend-option-byok"
                      aria-checked={llmBackend() === "byok"}
                      tabIndex={llmBackend() === "byok" ? 0 : -1}
                      onClick={() => selectLlmBackend("byok")}
                      onKeyDown={(event) => handleLlmBackendKeyDown("byok", event)}
                      class={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        llmBackend() === "byok"
                          ? "border-primary bg-primary/10 text-on-surface"
                          : "border-white/15 bg-white/5 text-on-surface-variant hover:bg-white/10"
                      }`}
                    >
                      Bring Your Own Key
                      <span class="block text-[10px] font-normal opacity-70">Anthropic / OpenAI compatible</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      id="llm-backend-option-ollama"
                      aria-checked={llmBackend() === "ollama"}
                      tabIndex={llmBackend() === "ollama" ? 0 : -1}
                      onClick={() => selectLlmBackend("ollama")}
                      onKeyDown={(event) => handleLlmBackendKeyDown("ollama", event)}
                      class={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        llmBackend() === "ollama"
                          ? "border-primary bg-primary/10 text-on-surface"
                          : "border-white/15 bg-white/5 text-on-surface-variant hover:bg-white/10"
                      }`}
                    >
                      Local Ollama
                      <span class="block text-[10px] font-normal opacity-70">Fully private, no key needed</span>
                    </button>
                    <button
                      type="button"
                      role="radio"
                      id="llm-backend-option-runpod"
                      aria-checked={llmBackend() === "runpod"}
                      tabIndex={llmBackend() === "runpod" ? 0 : -1}
                      onClick={() => selectLlmBackend("runpod")}
                      onKeyDown={(event) => handleLlmBackendKeyDown("runpod", event)}
                      class={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                        llmBackend() === "runpod"
                          ? "border-primary bg-primary/10 text-on-surface"
                          : "border-white/15 bg-white/5 text-on-surface-variant hover:bg-white/10"
                      }`}
                    >
                      RunPod vLLM
                      <span class="block text-[10px] font-normal opacity-70">Server-hosted QWEN via RunPod</span>
                    </button>
                  </div>
                </fieldset>
                <Show when={modelResetTo() !== null}>
                  <NoticeBox role="status" ariaLive="polite" ariaAtomic={true} class="animate-fade-in font-mono text-[10px] text-on-surface-variant/60">
                    model reset to <span class="text-on-surface-variant/80">{modelResetTo()}</span>
                  </NoticeBox>
                </Show>

                {/* RunPod: info note */}
                <Show when={llmBackend() === "runpod"}>
                  <div class="rounded-lg border border-blue-500/20 bg-blue-500/10 px-3 py-2">
                    <p class="text-[10px] text-on-surface-variant">
                      Uses the <span class="font-medium text-on-surface">OMNYID_RUNPOD_API_KEY</span> and{" "}
                      <span class="font-medium text-on-surface">OMNYID_RUNPOD_ENDPOINT_ID</span> env vars
                      configured on the homeserver. No API key is stored per-user.
                    </p>
                  </div>
                </Show>

                {/* BYOK: Provider selector */}
                <Show when={llmBackend() === "byok"}>
                  <div>
                    <label class="mb-1 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                      Provider
                      <InfoHint text="This determines which API endpoint the homeserver uses when it saves and tests your BYOK configuration." />
                    </label>
                    <select
                      value={llmProvider()}
                      onChange={(e) => {
                        const p = e.currentTarget.value;
                        setLlmProvider(p);
                        setLlmModel(providerDefaults[p]?.model ?? "");
                        setLlmDirty(true);
                      }}
                      class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-on-surface outline-none focus:border-primary"
                    >
                      <option value="anthropic">Anthropic</option>
                      <option value="openai">OpenAI</option>
                      <option value="openrouter">Open Router</option>
                      <option value="cerebras">Cerebras</option>
                      <option value="together_ai">Together AI</option>
                    </select>
                    <p class="mt-0.5 text-[10px] text-on-surface-variant">
                      Your key must match the selected provider. Changing provider updates the default model.
                    </p>
                  </div>
                </Show>

                {/* Model name */}
                <div>
                  <label class="mb-1 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                    Model
                    <InfoHint text="Enter the exact model identifier your selected backend expects. Saving trims pasted whitespace automatically." />
                  </label>
                  <datalist id="llm-model-list">
                    <For each={PROVIDER_MODELS[llmProvider()] ?? []}>
                      {(m) => <option value={m} />}
                    </For>
                  </datalist>
                  <input
                    type="text"
                    list="llm-model-list"
                    value={llmModel()}
                    onInput={(e) => { setLlmModel(e.currentTarget.value); setLlmDirty(true); }}
                    spellcheck={false}
                    autocapitalize="off"
                    autocorrect="off"
                    placeholder={llmBackend() === "byok" ? providerDefaults[llmProvider()]?.model ?? "" : "llama3.2"}
                    class={`w-full rounded-lg border bg-white/10 px-3 py-2 font-mono text-xs text-on-surface placeholder-on-surface-variant outline-none focus:border-primary transition-colors ${
                      llmModel() !== savedLlmModel() ? "border-amber-400/60" : "border-white/20"
                    }`}
                  />
                  <div class="flex items-center gap-2">
                    <Show when={modelTier()}>
                      <span class="font-mono text-[10px] text-on-surface-variant/70">{modelTier()}</span>
                    </Show>
                    <p class="text-[10px] text-on-surface-variant">
                      {llmBackend() === "byok"
                        ? "Examples: claude-haiku-4-5-20251001, claude-sonnet-4-6, gpt-4o-mini"
                        : "Must match a model pulled in your Ollama instance (ollama pull llama3.2)"}
                    </p>
                  </div>
                </div>

                {/* BYOK: API key — not shown for RunPod */}
                <Show when={llmBackend() === "byok"}>
                  <div>
                    <label class="flex items-center gap-1.5 text-xs font-medium text-on-surface-variant mb-1">
                      API Key
                      <InfoHint text="Only paste a fresh provider key here if you want to replace the encrypted key already stored on your homeserver." />
                      <Show when={keyFormatValid() === true}>
                        <span class="text-[0.75em] font-semibold text-green-600">format ok</span>
                      </Show>
                      <Show when={keyFormatValid() === false}>
                        <button
                          type="button"
                          onClick={copyKeyPrefix}
                          title="Click to copy expected key prefix"
                          class="text-[0.75em] font-semibold text-amber-600 transition hover:text-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          {keyPrefixCopied() ? "copied" : `expected ${keyPrefix()}... (click to copy)`}
                        </button>
                      </Show>
                    </label>
                    <Show when={keyPrefixCopyError()}>
                      {(message) => (
                        <NoticeBox role="alert" ariaLive="assertive" ariaAtomic={true} class="mb-2 text-xs text-red-500">
                          <div class="flex flex-wrap items-center justify-between gap-3">
                            <span>Could not copy expected key prefix: {message()}</span>
                            <button
                              type="button"
                              onClick={() => setKeyPrefixCopyError(null)}
                              class="font-medium text-red-500 underline underline-offset-2"
                            >
                              Dismiss
                            </button>
                          </div>
                        </NoticeBox>
                      )}
                    </Show>
                    <input
                      type="password"
                      value={llmApiKey()}
                      onInput={(e) => { setLlmApiKey(e.currentTarget.value); setLlmDirty(true); }}
                      spellcheck={false}
                      autocapitalize="off"
                      autocorrect="off"
                      placeholder={providerDefaults[llmProvider()]?.keyPlaceholder ?? "API key..."}
                      class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 font-mono text-xs text-on-surface placeholder-on-surface-variant outline-none focus:border-primary"
                    />
                    <p class="mt-0.5 text-[10px] text-on-surface-variant">
                      Stored encrypted on your homeserver. Never transmitted in plaintext.
                      Leave blank to keep the existing key.
                    </p>
                  </div>
                </Show>

                {/* Ollama: URL */}
                <Show when={llmBackend() === "ollama"}>
                  <div>
                    <label class="mb-1 flex items-center gap-1.5 text-xs font-medium text-on-surface-variant">
                      Ollama URL
                      <InfoHint text="This is the base URL your homeserver uses to reach Ollama. It must be reachable from the server process, not just from your browser." />
                    </label>
                    <input
                      type="text"
                      value={llmOllamaUrl()}
                      onInput={(e) => { setLlmOllamaUrl(e.currentTarget.value); setLlmDirty(true); }}
                      spellcheck={false}
                      autocapitalize="off"
                      autocorrect="off"
                      placeholder="http://localhost:11434"
                      class={`w-full rounded-lg border bg-white/10 px-3 py-2 font-mono text-xs text-on-surface placeholder-on-surface-variant outline-none focus:border-primary transition-colors ${
                        llmOllamaUrl() !== savedOllamaUrl() ? "border-amber-400/60" : "border-white/20"
                      }`}
                    />
                    <p class="mt-0.5 text-[10px] text-on-surface-variant">
                      Your homeserver must be able to reach this address.
                      For Docker: use host.docker.internal instead of localhost.
                    </p>
                  </div>
                </Show>

                {/* Save + Test buttons */}
                <div class="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={saveLlm}
                    disabled={llmSaving()}
                    aria-busy={llmSaving()}
                    aria-disabled={llmSaving()}
                    class="rounded-lg bg-primary px-5 py-2 text-xs font-medium text-white disabled:opacity-40 transition hover:bg-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {llmSaving() ? "Saving..." : "Save Model Settings"}
                  </button>
                  <Show when={llmDirty() && !llmSaving()}>
                    <NoticeBox class="border-0 bg-transparent px-0 py-0 text-xs text-amber-600">
                      <span class="flex items-center gap-1.5">
                        <span class="h-2 w-2 flex-shrink-0 rounded-full bg-amber-500" />
                        Unsaved changes
                      </span>
                    </NoticeBox>
                  </Show>
                  <div class="flex flex-col items-start gap-0.5">
                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={testLlmConnection}
                        disabled={llmPinging() || llmSaving()}
                        aria-busy={llmPinging() || llmSaving()}
                        aria-disabled={llmPinging() || llmSaving()}
                        title={llmDirty() ? "Will save current values then test connection" : "Ping the saved LLM config"}
                        class="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-xs font-medium text-on-surface-variant disabled:opacity-40 transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {llmPinging() ? "Testing..." : llmDirty() ? "Save & Test" : "Test connection"}
                      </button>
                      <InfoHint text="Runs a provider-specific reachability check using the saved model settings. If you have unsaved edits, the app saves them first, then tests the active provider, model, and key path." />
                    </div>
                    <Show when={lastPingAt() !== null && !llmPinging()}>
                      <span class="font-mono text-[10px] text-on-surface-variant/40">
                        {(() => {
                          const secs = Math.floor((Date.now() - lastPingAt()!) / 1000);
                          if (secs < 60) return "last tested just now";
                          if (secs < 3600) return `last tested ${Math.floor(secs / 60)}m ago`;
                          if (secs < 86400) return `last tested ${Math.floor(secs / 3600)}h ago`;
                          return `last tested ${Math.floor(secs / 86400)}d ago`;
                        })()}
                      </span>
                    </Show>
                    <Show when={latencyHistory().length >= 2}>
                      {(() => {
                        const hist = latencyHistory();
                        const max = Math.max(1, ...hist.map((s) => s.ms));
                        return (
                          <div class="flex items-end gap-[2px]" title="LLM ping latency history (ms)">
                            <For each={hist}>
                              {(snap) => (
                                <div
                                  class="w-[5px] rounded-sm bg-primary/50 transition-all"
                                  style={`height: ${Math.max(3, Math.round((snap.ms / max) * 18))}px`}
                                  title={`${snap.ms}ms`}
                                />
                              )}
                            </For>
                            <span class="ml-1 font-mono text-[9px] text-on-surface-variant/35">
                              {hist[hist.length - 1].ms}ms
                            </span>
                          </div>
                        );
                      })()}
                    </Show>
                    <Show when={testHistory().length > 0}>
                      <div class="mt-2 w-full">
                        <p class="mb-0.5 font-mono text-[8px] uppercase tracking-[0.15em] text-on-surface-variant/30">
                          Test history
                        </p>
                        <table class="w-full font-mono tabular-nums" style="font-size:8.5px">
                          <tbody>
                            <For each={testHistory()}>
                              {(entry) => (
                                <tr class="border-t border-white/10">
                                  <td class="py-[2px] pr-1.5 text-on-surface-variant/35">
                                    {new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </td>
                                  <td class="max-w-[72px] truncate py-[2px] pr-1.5 text-on-surface-variant/50">
                                    {entry.model}
                                  </td>
                                  <td class="py-[2px] pr-1.5 text-right text-on-surface-variant/50">
                                    {entry.ms !== null ? `${entry.ms}ms` : "-"}
                                  </td>
                                  <td class={`py-[2px] text-right font-semibold ${entry.ok ? "text-green-600" : "text-red-400"}`}>
                                    {entry.ok ? "OK" : "NO"}
                                  </td>
                                </tr>
                              )}
                            </For>
                          </tbody>
                        </table>
                      </div>
                    </Show>
                  </div>
                  <Show when={llmSaved()}>
                    <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                      <NoticeBox
                        role="status"
                        ariaLive="polite"
                        ariaAtomic={true}
                        class="text-xs font-medium text-green-600"
                      >
                        Saved
                      </NoticeBox>
                      <Show when={props.onViewWorkflows}>
                        <button
                          type="button"
                          onClick={props.onViewWorkflows}
                          class="text-xs text-primary underline underline-offset-2 transition hover:text-primary/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          {"View active runs ->"}
                        </button>
                      </Show>
                    </div>
                  </Show>
                  <Show when={llmError()}>
                    <NoticeBox
                      role="alert"
                      ariaLive="assertive"
                      ariaAtomic={true}
                      class="text-xs text-red-500"
                    >
                      {llmError()}
                    </NoticeBox>
                  </Show>
                  <Show when={llmPingResult()}>
                    {(() => {
                      const result = llmPingResult()!;
                      const targetLabel = llmProviderLabel(result.provider, result.backend);
                      return (
                        <NoticeBox
                          role={result.ok ? "status" : "alert"}
                          ariaLive={result.ok ? "polite" : "assertive"}
                          ariaAtomic={true}
                          class={`text-xs ${result.ok ? "text-green-600" : "text-red-500"}`}
                        >
                          <span class="block font-medium">
                            {result.ok ? `Connected to ${targetLabel}` : "Connection failed"}
                          </span>
                          <Show when={!result.ok && result.reason}>
                            <span class="mt-1 block font-normal leading-5">
                              {result.reason}
                            </span>
                          </Show>
                          <Show when={!result.ok && result.httpStatus !== undefined}>
                            <span class="mt-1 block font-mono text-[10px] opacity-70">
                              HTTP {result.httpStatus}
                            </span>
                          </Show>
                        </NoticeBox>
                      );
                    })()}
                  </Show>
                </div>
              </div>
            </SectionCard>
            </div>
            </Show>{/* end LLM tab */}

            {/* MCP Tools tab */}
            <Show when={settingsTab() === "mcp"}>
            <div
              id="agent-settings-panel-mcp"
              role="tabpanel"
              aria-labelledby="agent-settings-tab-mcp"
              class="pt-4"
            >
            {/* Capabilities */}
            <SectionCard
              title="Capabilities"
              description="Structured actions your agent can perform. New capabilities default to suggest-only until you promote them."
              headerActions={
                <>
                  <input
                    ref={capImportInputRef}
                    type="file"
                    accept=".json"
                    class="hidden"
                    onChange={handleImportFile}
                  />
                  <button
                    type="button"
                    onClick={() => capImportInputRef?.click()}
                    disabled={capImporting()}
                    title="Import capabilities from a JSON file"
                    class="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/20 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {capImporting() ? "..." : "Import"}
                  </button>
                  <Show when={capabilities().length > 0}>
                    <button
                      type="button"
                      onClick={exportCapabilities}
                      title="Export capabilities as JSON"
                      class="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      Export
                    </button>
                  </Show>
                  <button
                    ref={addCapabilityTriggerRef}
                    type="button"
                    onClick={() => setShowAddCapability(true)}
                    aria-haspopup="dialog"
                    aria-expanded={showAddCapability()}
                    aria-controls="add-capability-dialog"
                    class="rounded-lg bg-primary px-4 py-2 text-xs font-medium text-white transition hover:bg-primary/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    + Add
                  </button>
                </>
              }
            >
              <Show when={capActionError()}>
                {(message) => (
                  <NoticeBox role="alert" ariaLive="assertive" ariaAtomic={true} class="mb-3 text-xs text-red-500">
                    <div class="flex items-start justify-between gap-3">
                      <span>{message()}</span>
                      <button
                        type="button"
                        onClick={() => setCapActionError(null)}
                        class="font-medium text-red-500 underline underline-offset-2"
                      >
                        Dismiss
                      </button>
                    </div>
                  </NoticeBox>
                )}
              </Show>
              <Show when={capLoadError()}>
                {(message) => (
                  <NoticeBox role="alert" ariaLive="assertive" ariaAtomic={true} class="mb-3 text-xs text-red-500">
                    <div class="flex items-start justify-between gap-3">
                      <span>Could not load capabilities: {message()}</span>
                      <button
                        type="button"
                        onClick={() => void refreshCapabilities()}
                        class="font-medium text-red-500 underline underline-offset-2"
                      >
                        Retry capabilities
                      </button>
                    </div>
                  </NoticeBox>
                )}
              </Show>
              {/* Capability templates */}
              <div class="mt-4">
                <p class="mb-2 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.18em] text-outline">
                  Templates
                  <InfoHint text="Starter capability definitions for common tools. Adding one creates a suggest-only draft you can review and promote later." />
                </p>
                <div class="space-y-1.5">
                  <For each={CAPABILITY_TEMPLATES}>
                    {(tpl) => {
                      const alreadyAdded = () => capabilities().some((c) => c.name === tpl.name);
                      return (
                        <div class="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                          <span class="text-base leading-none mt-0.5 flex-shrink-0">{tpl.icon}</span>
                          <div class="flex-1 min-w-0">
                            <p class="font-mono text-xs font-semibold text-on-surface">{tpl.name}</p>
                            <p class="mt-0.5 text-[11px] text-on-surface-variant">{tpl.description}</p>
                            <p class="mt-0.5 text-[10px] text-on-surface-variant opacity-60">{approvalModeLabel(tpl.approval_mode)}</p>
                          </div>
                          <button
                            type="button"
                            disabled={alreadyAdded() || capAdding() === tpl.id}
                            onClick={() => addFromTemplate(tpl)}
                            class="flex-shrink-0 rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary
                              border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                          >
                            {alreadyAdded() ? "Added" : capAdding() === tpl.id ? "..." : "Add"}
                          </button>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </div>

              <Show when={capImportResult()}>
                <NoticeBox
                  role={capImportResult()?.startsWith("Import failed") ? "alert" : "status"}
                  ariaLive={capImportResult()?.startsWith("Import failed") ? "assertive" : "polite"}
                  ariaAtomic={true}
                  class={`mt-2 text-xs ${capImportResult()?.startsWith("Import failed") ? "text-red-500" : "text-green-600 font-medium"}`}
                >
                  {capImportResult()}
                </NoticeBox>
              </Show>
              <p class="mt-4 text-[10px] font-mono uppercase tracking-[0.18em] text-outline mb-2">Registered</p>
              <Show when={capabilities().length > 3}>
                <div class="mb-2 space-y-1">
                  <label class="flex items-center gap-1.5 text-[11px] font-medium text-on-surface-variant">
                    Capability filter
                    <InfoHint text="Filter the registered capability list by name or metadata when the tool catalog gets longer." />
                  </label>
                  <input
                    type="text"
                    value={capFilter()}
                    onInput={(e) => setCapFilter(e.currentTarget.value)}
                    spellcheck={false}
                    autocapitalize="off"
                    autocorrect="off"
                    placeholder="filter capabilities..."
                    class="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-on-surface placeholder-on-surface-variant/40 outline-none focus:border-primary/40"
                  />
                </div>
              </Show>
              <Show
                when={capabilities().length > 0}
                fallback={
                  <p class="text-xs text-on-surface-variant">
                    {capLoadError()
                      ? "Capabilities are unavailable until the list loads again."
                      : "No capabilities registered yet - add one from the templates above."}
                  </p>
                }
              >
                <Show when={capabilities().every((c) => c.approval_mode === "suggest_only")}>
                  <p class="mb-2 rounded-lg border border-sky-200/40 bg-sky-50/50 px-3 py-2 text-[11px] text-sky-900/70">
                    All capabilities are in suggest-only mode - the agent will propose actions but never act
                    autonomously. Click a mode badge to promote a capability.
                  </p>
                </Show>
                <Show
                  when={filteredCapabilities().length > 0}
                  fallback={
                    <div class="rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-3 py-3 text-xs text-on-surface-variant">
                      No capabilities match this filter. Try a broader term or clear the filter.
                    </div>
                  }
                >
                <div class="space-y-2">
                  <For each={filteredCapabilities()}>
                    {(cap) => (
                      <div class={`flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 transition-all ${newCapId() === cap.id ? "ring-2 ring-green-400/50 animate-fade-in" : ""}`}>
                        <div class="min-w-0">
                          <p class="font-mono text-xs font-semibold text-on-surface truncate">{cap.name}</p>
                          <p class="mt-0.5 text-[11px] text-on-surface-variant truncate">{cap.description || "No description"}</p>
                          <div class="mt-0.5 flex items-center gap-[0.5em]">
                            <span class="text-[10px] text-on-surface-variant opacity-60">v{cap.version}</span>
                            <button
                              type="button"
                              title="Click to cycle approval mode"
                              disabled={capModePatching() === cap.id}
                              onClick={() => void cycleApprovalMode(cap)}
                              class={`rounded-full border px-[0.5em] py-[0.1em] font-mono text-[0.6em] transition hover:opacity-90 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                                cap.approval_mode === "autonomous"
                                  ? "border-green-500/30 bg-green-500/10 text-green-700"
                                  : cap.approval_mode === "human_approval_required"
                                    ? "border-amber-500/30 bg-amber-500/10 text-amber-700"
                                    : "border-sky-500/30 bg-sky-500/10 text-sky-700"
                              }`}
                            >
                              {capModePatching() === cap.id ? "..." : approvalModeLabel(cap.approval_mode)}
                            </button>
                            <Show when={capModeSaved() === cap.id}>
                              <NoticeBox
                                role="status"
                                ariaLive="polite"
                                ariaAtomic={true}
                                class="animate-fade-in border-0 bg-transparent px-0 py-0 font-mono text-[0.6em] text-green-600"
                              >
                                saved
                              </NoticeBox>
                            </Show>
                          </div>
                          <Show when={cap.tags && cap.tags.length > 0}>
                            <div class="mt-0.5 flex flex-wrap gap-[0.25em]">
                              <For each={cap.tags}>
                                {(tag) => (
                                  <span class="rounded-full border border-white/15 bg-white/10 px-[0.5em] py-[0.1em] font-mono text-[0.55em] text-on-surface-variant/50">
                                    {tag}
                                  </span>
                                )}
                              </For>
                            </div>
                          </Show>
                          <Show when={capLastUsed()[cap.id] || capUsageCount()[cap.id]}>
                            <p class="mt-0.5 font-mono text-[0.55em] text-on-surface-variant/30">
                              {(() => {
                                const count = capUsageCount()[cap.id] ?? 0;
                                const lastTs = capLastUsed()[cap.id];
                                const countLabel = count > 0 ? `used ${count}x` : null;
                                const lastLabel = (() => {
                                  if (!lastTs) return null;
                                  const secs = Math.floor((Date.now() - lastTs) / 1000);
                                  if (secs < 60) return "just now";
                                  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
                                  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
                                  return `${Math.floor(secs / 86400)}d ago`;
                                })();
                                return [countLabel, lastLabel ? `last ${lastLabel}` : null].filter(Boolean).join(" | ");
                              })()}
                            </p>
                          </Show>
                          {(() => {
                            const dow = capDowUsage()[cap.id];
                            if (!dow || dow.every((n) => n === 0)) return null;
                            const maxCount = Math.max(1, ...dow);
                            const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"];
                            return (
                              <div class="mt-0.5 flex items-end gap-[2px]" title="Usage by day of week (Sun-Sat)">
                                <For each={dow}>
                                  {(count, i) => (
                                    <div class="flex flex-col items-center gap-[1px]">
                                      <div
                                        class="w-[5px] rounded-sm transition-all"
                                        style={`height: ${count > 0 ? Math.max(3, Math.round((count / maxCount) * 12)) : 2}px; background: ${count > 0 ? "rgba(49,86,142,0.4)" : "rgba(0,0,0,0.06)"}`}
                                        title={`${DOW_LABELS[i()]}: ${count}`}
                                      />
                                      <span class="font-mono text-[0.4em] text-on-surface-variant/20">{DOW_LABELS[i()]}</span>
                                    </div>
                                  )}
                                </For>
                              </div>
                            );
                          })()}
                          {(() => {
                            const lastTs = capLastUsed()[cap.id];
                            if (!lastTs) return null;
                            const staleDays = Math.floor((Date.now() - lastTs) / 86400000);
                            if (staleDays < 14) return null;
                            return (
                              <p class="mt-0.5 font-mono text-[0.52em] text-amber-500/50">
                                not used in {staleDays}d - may be redundant
                              </p>
                            );
                          })()}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCapability(cap.id)}
                          disabled={capDeleting() === cap.id}
                          class="flex-shrink-0 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-400 transition hover:bg-red-500/20 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          {capDeleting() === cap.id ? "..." : "Remove"}
                        </button>
                      </div>
                    )}
                  </For>
                </div>
                </Show>
              </Show>
            </SectionCard>
            </div>
            </Show>{/* end MCP tab */}

            {/* Skills tab */}
            <Show when={settingsTab() === "skills"}>
              <div
                id="agent-settings-panel-skills"
                role="tabpanel"
                aria-labelledby="agent-settings-tab-skills"
                class="pt-4"
              >
                <SkillsView signedIn={true} />
              </div>
            </Show>

            {/* Runtime & device sync tab */}
            <Show when={settingsTab() === "runtime"}>
              <div
                id="agent-settings-panel-runtime"
                role="tabpanel"
                aria-labelledby="agent-settings-tab-runtime"
                class="space-y-4 pt-4"
              >
                <div class="grid gap-4 lg:grid-cols-2">
                  <div class="rounded-xl border border-violet-200/40 bg-violet-50/40 p-4">
                    <div class="flex items-center gap-2">
                      <p class="text-sm font-semibold text-on-surface">Hosted Runtime</p>
                      <InfoHint text="Summarizes the deployed homeserver runtime that performs updates, backups, restore drills, and device bootstrap orchestration outside this browser session." />
                    </div>
                    <p class="mt-1 text-xs leading-5 text-on-surface-variant">
                      Keep the runtime scaffold, deployment state, and update pressure visible in the same place as device bootstrap policy.
                    </p>
                    <div class="mt-3 space-y-2 text-xs text-on-surface-variant">
                      <div class="flex items-center justify-between gap-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2">
                        <span>Status</span>
                        <span class="font-semibold text-on-surface">
                          {props.runtimeDeployment?.status ?? runtimeUpdatesState()?.runtime_status ?? "unknown"}
                        </span>
                      </div>
                      <div class="flex items-center justify-between gap-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2">
                        <span>Framework</span>
                        <span class="font-semibold text-on-surface">
                          {props.runtimeDeployment?.framework ?? runtimeUpdatesState()?.framework ?? "none"}
                        </span>
                      </div>
                      <div class="flex items-center justify-between gap-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2">
                        <span>Latest version</span>
                        <span class="font-semibold text-on-surface">
                          {runtimeUpdatesState()?.latest_version ?? "unknown"}
                        </span>
                      </div>
                      <div class="flex items-center justify-between gap-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2">
                        <span>Current version</span>
                        <span class="font-semibold text-on-surface">
                          {runtimeUpdatesState()?.current_version ?? "unknown"}
                        </span>
                      </div>
                      <div class="flex items-center justify-between gap-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2">
                        <span>Update pressure</span>
                        <span class="font-semibold text-on-surface">
                          {runtimeUpdatesState()?.update_available
                            ? `${runtimeUpdatesState()?.current_version ?? "current"} -> ${runtimeUpdatesState()?.latest_version ?? "latest"}`
                            : "up to date"}
                        </span>
                      </div>
                      <div class="flex items-center justify-between gap-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2">
                        <span>Last checked</span>
                        <span class="font-semibold text-on-surface">
                          {dateTimeLabel(runtimeUpdatesState()?.last_checked_at)} | {relativeTimeLabel(runtimeUpdatesState()?.last_checked_at)}
                        </span>
                      </div>
                      <div class="flex items-center justify-between gap-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2">
                        <span>Last applied</span>
                        <span class="font-semibold text-on-surface">
                          {dateTimeLabel(runtimeUpdatesState()?.last_applied_at)} | {relativeTimeLabel(runtimeUpdatesState()?.last_applied_at)}
                        </span>
                      </div>
                      <div class="flex items-center justify-between gap-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2">
                        <span>Last update event</span>
                        <span class="font-semibold text-on-surface">
                          {dateTimeLabel(latestTimestampValue((runtimeUpdatesState()?.entries ?? []).map((entry) => entry.created_at)))} | {relativeTimeLabel(latestTimestampValue((runtimeUpdatesState()?.entries ?? []).map((entry) => entry.created_at)))}
                        </span>
                      </div>
                    </div>
                    <Show when={props.runtimeDeployment?.workspace_path}>
                      <p class="mt-3 break-all rounded-lg border border-violet-200/60 bg-white/60 px-3 py-2 font-mono text-[11px] text-on-surface-variant">
                        {props.runtimeDeployment?.workspace_path}
                      </p>
                    </Show>
                    <Show when={props.runtimeDeployment?.gui}>
                      <div class="mt-3 rounded-lg border border-violet-200/60 bg-white/60 px-3 py-2 text-[11px] text-on-surface-variant">
                        <span class="font-medium text-on-surface">GUI:</span> {props.runtimeDeployment?.gui}
                      </div>
                    </Show>
                    <Show when={props.runtimeDeployment?.runtime_monitor}>
                      <div class="mt-3 rounded-lg border border-violet-200/60 bg-white/60 px-3 py-3">
                        <div class="flex items-center gap-2">
                          <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60">
                            Live runtime monitor
                          </p>
                          <InfoHint text="Recent heartbeat/status lines from the deployed runtime monitor. This is hosted runtime telemetry, not browser-side application logging." />
                        </div>
                        <p class="mt-2 text-[11px] font-semibold text-on-surface">
                          {props.runtimeDeployment?.runtime_monitor?.status} | {props.runtimeDeployment?.runtime_monitor?.source}
                        </p>
                        <p class="mt-1 text-[11px] text-on-surface-variant">
                          updated {dateTimeLabel(props.runtimeDeployment?.runtime_monitor?.updated_at)}
                        </p>
                        <p class="mt-1 text-[11px] text-on-surface-variant">
                          {relativeTimeLabel(props.runtimeDeployment?.runtime_monitor?.updated_at)} | {(props.runtimeDeployment?.runtime_monitor?.lines ?? []).length} monitor line{((props.runtimeDeployment?.runtime_monitor?.lines ?? []).length === 1) ? "" : "s"}
                        </p>
                        <div class="mt-2 space-y-1">
                          <For each={(props.runtimeDeployment?.runtime_monitor?.lines ?? []).slice(0, 4)}>
                            {(line) => (
                              <p class="rounded border border-white/30 bg-white/60 px-2 py-1 font-mono text-[10px] text-on-surface-variant">
                                {line}
                              </p>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                    <Show when={runtimeStatusPanelLines(props.runtimeDeployment?.runtime_status_panel).length > 0}>
                      <div class="mt-3 rounded-lg border border-violet-200/60 bg-white/60 px-3 py-3">
                        <div class="flex items-center gap-2">
                          <EyebrowLabel>Runtime status panel</EyebrowLabel>
                          <InfoHint text="Structured runtime health fields exposed by the hosted runtime for quick inspection of readiness, drift, and deployment state." />
                        </div>
                        <TextLineList
                          class="mt-2 space-y-1"
                          lineClass="rounded border border-white/30 bg-white/60 px-2 py-1 font-mono text-[10px] text-on-surface-variant"
                          lines={runtimeStatusPanelLines(props.runtimeDeployment?.runtime_status_panel)}
                        />
                      </div>
                    </Show>
                    <Show when={(props.runtimeDeployment?.runtime_status_views?.length ?? 0) > 0}>
                      <div class="mt-3 rounded-lg border border-violet-200/60 bg-white/60 px-3 py-3">
                        <div class="flex items-center gap-2">
                          <EyebrowLabel>Status view formats</EyebrowLabel>
                          <InfoHint text="The named runtime status views currently published by the deployment, such as dashboard, monitor, or compact ops summaries." />
                        </div>
                        <SummaryChipList
                          class="mt-2 flex flex-wrap gap-2"
                          items={(props.runtimeDeployment?.runtime_status_views ?? [])
                            .slice(0, 4)
                            .map((view) => view.title ?? view.format ?? view.id ?? "runtime-view")}
                        />
                      </div>
                    </Show>
                    <ActionRow class="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => void handleCheckRuntimeUpdates()}
                        disabled={runtimeUpdatesBusy() !== null}
                        aria-busy={runtimeUpdatesBusy() === "check"}
                        aria-disabled={runtimeUpdatesBusy() !== null}
                        class="rounded-lg border border-violet-300/60 bg-white/70 px-3 py-2 text-xs font-medium text-on-surface transition hover:bg-white disabled:opacity-50"
                      >
                        {runtimeUpdatesBusy() === "check" ? "Checking updates..." : "Check updates"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleApplyRuntimeUpdate()}
                        disabled={runtimeUpdatesBusy() !== null || !runtimeUpdatesState()?.update_available}
                        aria-busy={runtimeUpdatesBusy() === "apply"}
                        aria-disabled={runtimeUpdatesBusy() !== null || !runtimeUpdatesState()?.update_available}
                        class="rounded-lg border border-violet-300/60 bg-violet-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
                      >
                        {runtimeUpdatesBusy() === "apply" ? "Applying..." : "Apply update"}
                      </button>
                    </ActionRow>
                    <Show when={(runtimeUpdatesState()?.entries?.length ?? 0) > 0}>
                      <div class="mt-3">
                        <div class="flex items-center gap-2">
                          <EyebrowLabel>Recent update events</EyebrowLabel>
                          <InfoHint text="Recent check/apply events for the hosted runtime, including the version movement and any notes attached to the update attempt." />
                        </div>
                        <div class="mt-2 space-y-2">
                          <For each={(runtimeUpdatesState()?.entries ?? []).slice(0, 3)}>
                            {(entry) => (
                              <div class="rounded-lg border border-violet-200/60 bg-white/60 px-3 py-2">
                                <p class="text-[11px] font-semibold text-on-surface">
                                  {entry.action} | {entry.status}
                                </p>
                                <p class="mt-1 text-[11px] text-on-surface-variant">
                                  {entry.from_version ?? "unknown"}{" -> "}{entry.to_version ?? "pending"}{" | "}{dateTimeLabel(entry.created_at)}
                                </p>
                                <p class="mt-1 text-[11px] text-on-surface-variant">
                                  {relativeTimeLabel(entry.created_at)}
                                </p>
                                <Show when={compactSummaryLines(entry.notes_summary).length > 0}>
                                  <SummaryChipList
                                    class="mt-2 flex flex-wrap gap-2"
                                    items={compactSummaryLines(entry.notes_summary)}
                                  />
                                </Show>
                              </div>
                            )}
                          </For>
                        </div>
                      </div>
                    </Show>
                  </div>

                  <SectionCard
                    class="rounded-xl border border-rose-200/40 bg-rose-50/40 p-4"
                    title="Support Boundary"
                    description="Support access stays opt-in and bounded. This panel shows whether that boundary is still closed before any operator interaction."
                  >
                    <SummaryRows
                      items={supportBoundarySummaryItems()}
                      class="mt-3 space-y-2 text-xs text-on-surface-variant"
                    />
                    <Show when={props.supportAccess?.reason}>
                      <NoticeBox class="mt-3 rounded-lg border border-rose-200/60 bg-white/60 px-3 py-2 text-[11px] leading-5 text-on-surface-variant">
                        {props.supportAccess?.reason}
                      </NoticeBox>
                    </Show>
                  </SectionCard>
                </div>

                <div class="grid gap-4 lg:grid-cols-2">
                  <SectionCard
                    class="rounded-xl border border-amber-200/40 bg-amber-50/40 p-4"
                    title="Runtime Backups"
                    description="Snapshot retention and the latest backup records stay visible here so runtime recovery posture is reviewable without leaving the settings surface."
                  >
                    <SummaryRows items={runtimeBackupSummaryItems()} class="mt-3 space-y-2 text-xs text-on-surface-variant" />
                    <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <label class="block text-[11px] font-medium text-on-surface-variant">
                        <span class="flex items-center gap-1.5">
                          Retention policy
                          <InfoHint text="How long runtime backup snapshots remain eligible for recovery and restore-drill review before they expire." />
                        </span>
                        <select
                          value={String(runtimeBackupsState()?.policy.retention_days ?? 14)}
                          disabled={runtimeBackupBusy() !== null}
                          aria-busy={runtimeBackupBusy() !== null}
                          aria-disabled={runtimeBackupBusy() !== null}
                          onChange={(event) =>
                            void handleRuntimeBackupRetentionChange(
                              Number(event.currentTarget.value) as 7 | 14 | 30 | 90
                            )
                          }
                          class="mt-1 w-full rounded-lg border border-white/20 bg-white/50 px-3 py-2 text-xs text-on-surface outline-none transition focus:border-primary disabled:opacity-50"
                        >
                          <option value="7">7 days</option>
                          <option value="14">14 days</option>
                          <option value="30">30 days</option>
                          <option value="90">90 days</option>
                        </select>
                      </label>
                      <div class="space-y-1">
                        <div class="flex items-center gap-1.5 text-[11px] font-medium text-on-surface-variant">
                          Snapshot action
                          <InfoHint text="Create a fresh runtime recovery point immediately, without waiting for the next scheduled snapshot window." />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleCreateRuntimeSnapshot()}
                          disabled={runtimeBackupBusy() !== null}
                          aria-busy={runtimeBackupBusy() === "snapshot"}
                          aria-disabled={runtimeBackupBusy() !== null}
                          class="rounded-lg border border-amber-300/60 bg-amber-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-amber-600 disabled:opacity-50"
                        >
                          {runtimeBackupBusy() === "snapshot" ? "Creating snapshot..." : "Create snapshot"}
                        </button>
                      </div>
                    </div>
                    <Show when={(runtimeBackupsState()?.entries?.length ?? 0) > 0}>
                      <div class="mt-3 space-y-2">
                        <For each={(runtimeBackupsState()?.entries ?? []).slice(0, 2)}>
                          {(entry) => (
                            <div class="rounded-lg border border-amber-200/60 bg-white/60 px-3 py-2">
                              <p id="runtime-backup-manifest-review-title" class="text-[11px] font-semibold text-on-surface">
                                {entry.snapshot_type} | {entry.status}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {(() => {
                                  const latestDrill = latestCompletedRestoreDrillByBackupId().get(entry.id);
                                  return latestDrill?.completed_at
                                    ? `rehearsed ${relativeTimeLabel(latestDrill.completed_at)} | ${latestDrill.status}`
                                    : "not yet rehearsed";
                                })()}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                created {dateTimeLabel(entry.created_at)} | expires {dateTimeLabel(entry.expires_at)}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {relativeTimeLabel(entry.created_at)} | expires {relativeTimeLabel(entry.expires_at)}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {entry.file_count} files
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                workspace {byteCountLabel(entry.total_workspace_bytes)} | artifact {byteCountLabel(entry.artifact_size_bytes)}
                              </p>
                              <Show when={compactSummaryLines(entry.manifest_summary).length > 0}>
                                <SummaryChipList
                                  class="mt-2 flex flex-wrap gap-2"
                                  items={compactSummaryLines(entry.manifest_summary)}
                                />
                              </Show>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                    <ActionRow>
                      <button
                        ref={runtimeBackupManifestTriggerRef}
                        type="button"
                        onClick={() => {
                          const latestBackupId = runtimeBackupsState()?.entries?.[0]?.id;
                          if (!latestBackupId) return;
                          void handleReviewRuntimeBackupManifest(latestBackupId);
                        }}
                        disabled={runtimeBackupManifestBusyId() !== null || !(runtimeBackupsState()?.entries?.length)}
                        aria-expanded={runtimeBackupManifest() !== null}
                        aria-controls="runtime-backup-manifest-review"
                        class="rounded-lg border border-amber-200/70 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-on-surface transition hover:bg-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {runtimeBackupManifestBusyId() ? "Loading manifest..." : "Review latest manifest"}
                      </button>
                    </ActionRow>
                    <Show when={runtimeBackupManifest()}>
                      {(manifest) => (
                        <div
                          id="runtime-backup-manifest-review"
                          role="region"
                          aria-labelledby="runtime-backup-manifest-review-title"
                          class="mt-3 rounded-lg border border-amber-200/60 bg-white/70 px-3 py-3"
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div>
                              <p class="text-[11px] font-semibold text-on-surface">
                                Manifest review | {manifest().id}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {manifest().storage_mode} | created {dateTimeLabel(manifest().created_at)} | expires {dateTimeLabel(manifest().expires_at)}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {relativeTimeLabel(manifest().created_at)} | expires {relativeTimeLabel(manifest().expires_at)}
                              </p>
                            </div>
                              <button
                                type="button"
                                aria-label="Close backup manifest review"
                                onClick={() => closeRuntimeBackupManifestReview()}
                                class="rounded-lg border border-white/30 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-on-surface transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                              >
                              Close
                            </button>
                          </div>
                          <TextLineList
                            class="mt-3 space-y-1"
                            lineClass="rounded border border-white/30 bg-white/60 px-2 py-1 font-mono text-[10px] text-on-surface-variant"
                            lines={runtimeManifestSummaryLines(manifest())}
                          />
                        </div>
                      )}
                    </Show>
                  </SectionCard>

                  <SectionCard
                    class="rounded-xl border border-emerald-200/40 bg-emerald-50/40 p-4"
                    title="Restore Drills"
                    description="Recovery rehearsal should be visible next to backup posture, not buried in a separate operator-only flow."
                  >
                    <Show when={(runtimeRestoreDrillsState()?.entries?.length ?? 0) > 0}>
                      <SummaryRows items={restoreDrillSummaryItems()} class="mt-3 space-y-2 text-xs text-on-surface-variant" />
                    </Show>
                    <ActionRow class="mt-3">
                      <div class="space-y-1">
                        <div class="flex items-center gap-1.5 text-[11px] font-medium text-on-surface-variant">
                          Drill action
                          <InfoHint text="Record a rehearsal against the latest snapshot so recovery readiness is documented, not assumed." />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const latestBackupId = runtimeBackupsState()?.entries?.[0]?.id;
                            if (!latestBackupId) return;
                            void handleCreateRestoreDrill(latestBackupId);
                          }}
                          disabled={runtimeDrillBusyBackupId() !== null || !(runtimeBackupsState()?.entries?.length)}
                          aria-busy={runtimeDrillBusyBackupId() !== null}
                          aria-disabled={runtimeDrillBusyBackupId() !== null || !(runtimeBackupsState()?.entries?.length)}
                          class="rounded-lg border border-emerald-300/60 bg-white/70 px-3 py-2 text-xs font-medium text-on-surface transition hover:bg-white disabled:opacity-50"
                        >
                          {runtimeDrillBusyBackupId() ? "Running drill..." : "Run drill from latest snapshot"}
                        </button>
                      </div>
                    </ActionRow>
                    <Show
                      when={(runtimeRestoreDrillsState()?.entries?.length ?? 0) > 0}
                      fallback={
                        <NoticeBox class="mt-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2 text-xs text-on-surface-variant">
                          No restore drills have been recorded yet.
                        </NoticeBox>
                      }
                    >
                      <div class="mt-3 space-y-2">
                        <For each={(runtimeRestoreDrillsState()?.entries ?? []).slice(0, 2)}>
                          {(entry) => (
                            <div class="rounded-lg border border-emerald-200/60 bg-white/60 px-3 py-2">
                              <p class="text-[11px] font-semibold text-on-surface">
                                {entry.status} | backup {entry.backup_id}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                started {dateTimeLabel(entry.started_at)}
                                {entry.completed_at ? ` | completed ${dateTimeLabel(entry.completed_at)}` : ""}
                                {durationLabel(entry.started_at, entry.completed_at)
                                  ? ` | ${entry.completed_at ? "duration" : "running"} ${durationLabel(entry.started_at, entry.completed_at)}`
                                  : ""}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {relativeTimeLabel(entry.started_at)}
                                {entry.completed_at ? ` | completed ${relativeTimeLabel(entry.completed_at)}` : ""}
                              </p>
                              <Show when={compactSummaryLines(entry.notes_summary).length > 0}>
                                <SummaryChipList
                                  class="mt-2 flex flex-wrap gap-1"
                                  itemClass="rounded-full border border-emerald-200/60 bg-emerald-100/70 px-2 py-0.5 font-mono text-[10px] text-emerald-900/80"
                                  items={compactSummaryLines(entry.notes_summary)}
                                />
                              </Show>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </SectionCard>
                </div>

                <SectionCard
                  class="rounded-xl border border-indigo-200/40 bg-indigo-50/40 p-4"
                  title="Device Sync Policies"
                  description="Review the local-first sync profiles currently provisioned for your devices and adjust how much state each device should carry before the next bootstrap."
                >
                  <div class="mt-3 flex items-center gap-2">
                    <EyebrowLabel class="text-[11px]">Bootstrap policy</EyebrowLabel>
                    <InfoHint text="These profiles define how much encrypted state each device receives during authenticated bootstrap and whether local key material must remain on-device." />
                  </div>
                  <div class="mt-3 grid gap-2 md:grid-cols-3">
                    <MetricCard
                      label="Provisioned"
                      value={`${props.deviceSyncRuntimeSummary?.device_policy_count ?? devicePolicies().length} device policies`}
                    />
                    <MetricCard
                      label="Used"
                      value={`${props.deviceSyncRuntimeSummary?.used_device_count ?? devicePolicies().filter((entry) => Boolean(entry.last_used_at)).length} active bootstrap records`}
                    />
                    <MetricCard
                      label="Local keys"
                      value={`${props.deviceSyncRuntimeSummary?.local_key_device_count ?? devicePolicies().filter((entry) => entry.requires_local_key_material).length} device${(props.deviceSyncRuntimeSummary?.local_key_device_count ?? devicePolicies().filter((entry) => entry.requires_local_key_material).length) === 1 ? "" : "s"} need local key material`}
                    />
                  </div>
                  <Show when={props.deviceSyncRuntimeSummary}>
                    <div class="mt-3 grid gap-2 lg:grid-cols-2">
                      <div class="rounded-lg border border-white/40 bg-white/50 px-3 py-2">
                        <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60">By device class</p>
                        <p class="mt-1 text-sm font-semibold text-on-surface">
                          {props.deviceSyncRuntimeSummary?.desktop_device_count ?? 0} desktop | {props.deviceSyncRuntimeSummary?.mobile_device_count ?? 0} mobile | {props.deviceSyncRuntimeSummary?.watch_device_count ?? 0} watch
                        </p>
                      </div>
                      <div class="rounded-lg border border-white/40 bg-white/50 px-3 py-2">
                        <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60">Latest policy activity</p>
                        <p class="mt-1 text-sm font-semibold text-on-surface">
                          {props.deviceSyncRuntimeSummary?.latest_device_class ?? "unknown"} | {props.deviceSyncRuntimeSummary?.latest_policy_profile ?? "unknown"}
                        </p>
                        <p class="mt-1 text-[11px] text-on-surface-variant">
                          device {props.deviceSyncRuntimeSummary?.latest_device_id ?? "unknown"}
                        </p>
                        <p class="mt-1 text-[11px] text-on-surface-variant">
                          last used {dateTimeLabel(props.deviceSyncRuntimeSummary?.latest_last_used_at)}
                        </p>
                        <p class="mt-1 text-[11px] text-on-surface-variant">
                          {relativeTimeLabel(props.deviceSyncRuntimeSummary?.latest_last_used_at)}
                        </p>
                      </div>
                    </div>
                  </Show>
                  <Show when={props.deviceSyncRuntimeSummary?.latest_policy_note}>
                    <NoticeBox class="mt-3 rounded-lg border border-indigo-200/60 bg-white/60 px-3 py-2 text-[11px] leading-5 text-on-surface-variant">
                      {props.deviceSyncRuntimeSummary?.latest_policy_note}
                    </NoticeBox>
                  </Show>
                  <Show when={runtimeUpdatesState()?.policy}>
                    <div class="mt-3 grid gap-2 lg:grid-cols-2">
                      <label class="block text-[11px] font-medium text-on-surface-variant">
                        <span class="flex items-center gap-1.5">
                          Update channel
                          <InfoHint text="Controls whether this runtime follows the normal stable release track or waits for explicitly manual updates only." />
                        </span>
                        <select
                          value={runtimeUpdatesState()?.policy.update_channel ?? "stable"}
                          disabled={runtimeUpdatesBusy() !== null}
                          aria-busy={runtimeUpdatesBusy() !== null}
                          aria-disabled={runtimeUpdatesBusy() !== null}
                          onChange={(event) =>
                            void handleRuntimeUpdatePolicyChange({
                              update_channel: event.currentTarget.value as "stable" | "manual_only",
                              auto_apply: (runtimeUpdatesState()?.policy.auto_apply ?? "manual_only") as "manual_only" | "scaffold_refresh_only",
                            })
                          }
                          class="mt-1 w-full rounded-lg border border-white/20 bg-white/50 px-3 py-2 text-xs text-on-surface outline-none transition focus:border-primary disabled:opacity-50"
                        >
                          <option value="stable">Stable</option>
                          <option value="manual_only">Manual only</option>
                        </select>
                      </label>
                      <label class="block text-[11px] font-medium text-on-surface-variant">
                        <span class="flex items-center gap-1.5">
                          Auto-apply policy
                          <InfoHint text="Defines whether the runtime can self-apply low-risk scaffold refreshes or whether every update must stay manual." />
                        </span>
                        <select
                          value={runtimeUpdatesState()?.policy.auto_apply ?? "manual_only"}
                          disabled={runtimeUpdatesBusy() !== null}
                          aria-busy={runtimeUpdatesBusy() !== null}
                          aria-disabled={runtimeUpdatesBusy() !== null}
                          onChange={(event) =>
                            void handleRuntimeUpdatePolicyChange({
                              update_channel: (runtimeUpdatesState()?.policy.update_channel ?? "stable") as "stable" | "manual_only",
                              auto_apply: event.currentTarget.value as "manual_only" | "scaffold_refresh_only",
                            })
                          }
                          class="mt-1 w-full rounded-lg border border-white/20 bg-white/50 px-3 py-2 text-xs text-on-surface outline-none transition focus:border-primary disabled:opacity-50"
                        >
                          <option value="manual_only">Manual only</option>
                          <option value="scaffold_refresh_only">Scaffold refresh only</option>
                        </select>
                      </label>
                    </div>
                    <NoticeBox class="mt-2 rounded-lg border border-white/40 bg-white/50 px-3 py-2 text-[11px] text-on-surface-variant">
                      Support posture: {runtimeUpdatesState()?.policy.support_disabled_by_default === false ? "customized" : "disabled by default"}
                    </NoticeBox>
                  </Show>
                  <div class="mt-3 flex items-center gap-2">
                    <EyebrowLabel class="text-[11px]">Recovery packet actions</EyebrowLabel>
                    <InfoHint text="Preview loads the packet into this settings surface for inspection. Download saves the same recovery packet to disk for archival or operator-assisted recovery." />
                  </div>
                  <ActionRow>
                    <button
                      ref={runtimeRecoveryPreviewTriggerRef}
                      type="button"
                      onClick={() => void handlePreviewRecoveryPacket()}
                      disabled={runtimeRecoveryBusy()}
                      aria-busy={runtimeRecoveryBusy()}
                      aria-disabled={runtimeRecoveryBusy()}
                      aria-expanded={runtimeRecoveryPacket() !== null}
                      aria-controls="runtime-recovery-packet-preview"
                      class="rounded-lg border border-indigo-300/60 bg-white/70 px-3 py-2 text-xs font-medium text-on-surface transition hover:bg-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {runtimeRecoveryBusy() ? "Preparing packet..." : "Preview recovery packet"}
                    </button>
                    <button
                      ref={runtimeRecoveryDownloadTriggerRef}
                      type="button"
                      onClick={() => void handleDownloadRecoveryPacket()}
                      disabled={runtimeRecoveryBusy()}
                      aria-busy={runtimeRecoveryBusy()}
                      aria-disabled={runtimeRecoveryBusy()}
                      class="rounded-lg border border-indigo-300/60 bg-white/70 px-3 py-2 text-xs font-medium text-on-surface transition hover:bg-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {runtimeRecoveryBusy() ? "Preparing packet..." : "Download recovery packet"}
                    </button>
                  </ActionRow>
                  <Show when={runtimeRecoveryPacket()}>
                    {(packet) => (
                      <div
                        id="runtime-recovery-packet-preview"
                        role="region"
                        aria-labelledby="runtime-recovery-packet-preview-title"
                        class="mt-3 rounded-xl border border-indigo-200/60 bg-white/70 p-4"
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div>
                            <p id="runtime-recovery-packet-preview-title" class="text-sm font-semibold text-on-surface">Recovery Packet Preview</p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              {packet().packet_name}{" | "}generated {dateTimeLabel(packet().generated_at)}{" | "}version {packet().packet_version}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              {relativeTimeLabel(packet().generated_at)}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label="Close recovery packet preview"
                            onClick={() => closeRuntimeRecoveryPacketPreview()}
                            class="rounded-lg border border-white/30 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-on-surface transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          >
                            Close
                          </button>
                        </div>
                        <div class="mt-3 grid gap-2 md:grid-cols-3">
                          <MetricCard
                            class="rounded-lg border border-white/30 bg-white/60 px-3 py-2"
                            label="Account"
                            value={packet().user.display_name}
                            lines={[packet().user.email]}
                          />
                          <div class="rounded-lg border border-white/30 bg-white/60 px-3 py-2">
                            <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60">Backups</p>
                            <p class="mt-1 text-sm font-semibold text-on-surface">
                              {packet().runtime_backups.entries.length} snapshots
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              latest {dateTimeLabel(latestTimestampValue(packet().runtime_backups.entries.map((entry) => entry.created_at)))}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              {relativeTimeLabel(latestTimestampValue(packet().runtime_backups.entries.map((entry) => entry.created_at)))}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              workspace {byteCountLabel(totalNumber(packet().runtime_backups.entries.map((entry) => entry.total_workspace_bytes)))}{" | "}artifact {byteCountLabel(totalNumber(packet().runtime_backups.entries.map((entry) => entry.artifact_size_bytes)))}
                            </p>
                          </div>
                          <div class="rounded-lg border border-white/30 bg-white/60 px-3 py-2">
                            <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60">Restore drills</p>
                            <p class="mt-1 text-sm font-semibold text-on-surface">
                              {packet().runtime_restore_drills.entries.length} drills
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              latest {dateTimeLabel(latestTimestampValue(packet().runtime_restore_drills.entries.map((entry) => entry.completed_at ?? entry.started_at)))}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              {relativeTimeLabel(latestTimestampValue(packet().runtime_restore_drills.entries.map((entry) => entry.completed_at ?? entry.started_at)))}
                            </p>
                          </div>
                          <div class="rounded-lg border border-white/30 bg-white/60 px-3 py-2">
                            <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60">Update events</p>
                            <p class="mt-1 text-sm font-semibold text-on-surface">
                              {packet().runtime_updates.entries.length} events
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              latest {dateTimeLabel(latestTimestampValue(packet().runtime_updates.entries.map((entry) => entry.created_at)))}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              {relativeTimeLabel(latestTimestampValue(packet().runtime_updates.entries.map((entry) => entry.created_at)))}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              current {packet().runtime_updates.current_version}{" | "}latest {packet().runtime_updates.latest_version}
                            </p>
                          </div>
                        </div>
                        <Show when={packet().runtime_deployment}>
                          <DetailCard class="mt-3" title="Runtime deployment context">
                            <div class="mt-2 grid gap-2 md:grid-cols-2">
                              <div class="rounded-lg border border-white/30 bg-white/60 px-3 py-2">
                                <p class="text-[11px] font-semibold text-on-surface">
                                  {packet().runtime_deployment?.framework ?? "unknown"}{" | "}{packet().runtime_deployment?.status ?? "unknown"}
                                </p>
                                <p class="mt-1 text-[11px] text-on-surface-variant">
                                  deployment {packet().runtime_deployment?.id ?? "unknown"}
                                </p>
                              </div>
                              <NoticeBox class="rounded-lg border border-white/30 bg-white/60 px-3 py-2 font-mono break-all text-[10px] text-on-surface-variant">
                                {packet().runtime_deployment?.workspace_path ?? "unknown"}
                              </NoticeBox>
                            </div>
                          </DetailCard>
                        </Show>
                        <div class="mt-3 grid gap-2 md:grid-cols-2">
                          <DetailCard title="Backup policy snapshot">
                            <p class="mt-2 text-[11px] font-semibold text-on-surface">
                              {packet().runtime_backups.policy.retention_days} day retention{" | "}{packet().runtime_backups.policy.storage_mode}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              support posture {packet().runtime_backups.policy.support_disabled_by_default === false ? "customized" : "disabled by default"}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              last snapshot {relativeTimeLabel(packet().runtime_backups.policy.last_snapshot_at)}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              snapshot at {dateTimeLabel(packet().runtime_backups.policy.last_snapshot_at)}
                            </p>
                          </DetailCard>
                          <DetailCard title="Update policy snapshot">
                            <p class="mt-2 text-[11px] font-semibold text-on-surface">
                              {packet().runtime_updates.policy.update_channel}{" | "}{packet().runtime_updates.policy.auto_apply}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              support posture {packet().runtime_updates.policy.support_disabled_by_default === false ? "customized" : "disabled by default"}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              last checked {relativeTimeLabel(packet().runtime_updates.last_checked_at)}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              checked at {dateTimeLabel(packet().runtime_updates.last_checked_at)}
                            </p>
                          </DetailCard>
                        </div>
                        <div class="mt-3 grid gap-4 lg:grid-cols-2">
                          <DetailCard title="Recovery checklist">
                            <TextLineList lines={packet().recovery_checklist} />
                          </DetailCard>
                          <DetailCard title="Privacy notes">
                            <TextLineList lines={packet().privacy_notes} />
                          </DetailCard>
                        </div>
                      </div>
                    )}
                  </Show>
                </SectionCard>

                <Show
                  when={devicePolicies().length > 0}
                  fallback={
                    <SectionCard
                      title="No Device Sync Policies"
                      description="Generate a device bootstrap bundle first, then review device sync profiles here."
                    >
                      <NoticeBox class="mt-3 text-xs text-on-surface-variant">
                        No device sync policies have been provisioned yet. Generate a device bootstrap bundle first, then review profiles here.
                      </NoticeBox>
                    </SectionCard>
                  }
                >
                  <div class="space-y-3">
                    <For each={devicePolicies()}>
                      {(entry) => {
                        const updating = () => devicePolicyUpdatingId() === entry.device_id;
                        const notes = entry.notes_summary ?? {};
                        const policyNote = typeof notes.policy_note === "string" ? notes.policy_note : null;
                        const policySource = typeof notes.source === "string" ? notes.source : null;
                        const defaultProfile = typeof notes.default_profile === "string" ? notes.default_profile : null;
                        const extraPolicyDetail = compactSummaryLinesExcluding(entry.notes_summary, [
                          "policy_note",
                          "source",
                          "default_profile",
                        ]);
                        return (
                          <div class="rounded-xl border border-white/20 bg-white/10 p-4">
                            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div class="min-w-0">
                                <p class="text-sm font-semibold text-on-surface">{entry.device_id}</p>
                                <p class="mt-1 text-xs text-on-surface-variant">
                                  {entry.device_class} device
                                  {" | "}
                                  {relativeTimeLabel(entry.last_used_at)}
                                  {" | "}
                                  bundled {dateTimeLabel(entry.last_bundle_at)}
                                </p>
                                <p class="mt-1 text-[11px] text-on-surface-variant">
                                  last used {dateTimeLabel(entry.last_used_at)}
                                </p>
                                <p class="mt-1 text-[11px] text-on-surface-variant">
                                  policy updated {dateTimeLabel(entry.updated_at)}
                                </p>
                                <p class="mt-1 text-[11px] text-on-surface-variant">
                                  bundled {relativeTimeLabel(entry.last_bundle_at)}{" | "}updated {relativeTimeLabel(entry.updated_at)}
                                </p>
                                <Show when={policyNote}>
                                  <NoticeBox class="mt-2 text-[11px] leading-5 text-on-surface-variant">{policyNote}</NoticeBox>
                                </Show>
                                <SummaryChipList
                                  class="mt-2 flex flex-wrap gap-2"
                                  itemClass="rounded-full border border-white/30 bg-white/50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant"
                                  items={[
                                    entry.policy_profile,
                                    entry.requires_local_key_material ? "local-key" : "metadata-only",
                                  ]}
                                />
                                <Show when={policySource || defaultProfile}>
                                  <SummaryChipList
                                    class="mt-2 flex flex-wrap gap-2"
                                    items={[
                                      ...(policySource ? [`source: ${policySource}`] : []),
                                      ...(defaultProfile ? [`default: ${defaultProfile}`] : []),
                                    ]}
                                  />
                                </Show>
                                <Show when={extraPolicyDetail.length > 0}>
                                  <div class="mt-2 space-y-1">
                                    <EyebrowLabel>Policy detail</EyebrowLabel>
                                    <SummaryChipList items={extraPolicyDetail} />
                                  </div>
                                </Show>
                                <Show when={deviceSyncSliceSummaryLines(entry.sync_slices).length > 0}>
                                  <div class="mt-2 space-y-1">
                                    <EyebrowLabel>Sync scope</EyebrowLabel>
                                    <SummaryChipList items={deviceSyncSliceSummaryLines(entry.sync_slices)} />
                                  </div>
                                </Show>
                              </div>
                              <div class="w-full md:w-52">
                                <label class="block text-[11px] font-medium text-on-surface-variant">
                                  <span class="flex items-center gap-1.5">
                                    Policy profile
                                    <InfoHint text="Controls how much encrypted state this device receives during authenticated bootstrap: full, balanced, or lightweight." />
                                  </span>
                                </label>
                                <select
                                  value={entry.policy_profile}
                                  disabled={updating()}
                                  onChange={(event) => {
                                    const next = event.currentTarget.value as "full" | "balanced" | "lightweight";
                                    if (next === entry.policy_profile) return;
                                    void setDevicePolicyProfile(entry.device_id, next);
                                  }}
                                  class="mt-1 w-full rounded-lg border border-white/20 bg-white/50 px-3 py-2 text-xs text-on-surface outline-none transition focus:border-primary disabled:opacity-50"
                                >
                                  <option value="full">Full</option>
                                  <option value="balanced">Balanced</option>
                                  <option value="lightweight">Lightweight</option>
                                </select>
                                <p class="mt-1 text-[10px] text-on-surface-variant">
                                  {updating() ? "Updating profile..." : "Used on the next authenticated bootstrap for this device."}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    </For>
                    <Show when={devicePolicyFeedback()}>
                      {(message) => (
                        <NoticeBox
                          role="status"
                          ariaLive="polite"
                          ariaAtomic={true}
                          class="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-on-surface-variant"
                        >
                          {message()}
                        </NoticeBox>
                      )}
                    </Show>
                  </div>
                </Show>

                <SectionCard
                  class="rounded-xl border border-slate-200/40 bg-slate-50/40 p-4"
                  title="Support Access History"
                  description="Recent support consent windows remain visible here so the support boundary is inspectable as time-bounded lineage, not just a current flag."
                >
                  <div class="mt-3 flex items-center gap-2">
                    <EyebrowLabel class="text-[11px]">Consent history</EyebrowLabel>
                    <InfoHint text="Each entry records when support access was granted, scoped, and later expired or revoked so the support boundary remains auditable over time." />
                  </div>
                  <Show
                    when={(props.supportAccessHistory?.length ?? 0) > 0}
                    fallback={
                      <NoticeBox class="mt-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2 text-xs text-on-surface-variant">
                        No support access history has been recorded yet.
                      </NoticeBox>
                    }
                  >
                    <div class="mt-3 space-y-2">
                      <For each={(props.supportAccessHistory ?? []).slice(0, 3)}>
                        {(entry) => (
                          <div class="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-2">
                            <p class="text-[11px] font-semibold text-on-surface">
                              {entry.status} | {entry.access_scope}
                            </p>
                            <TextLineList
                              lines={formatSupportAccessHistoryLines(entry)}
                              class="mt-1"
                              lineClass="text-[11px] text-on-surface-variant"
                            />
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </SectionCard>
                <Show when={runtimeFeedback()}>
                  {(message) => (
                    <NoticeBox
                      role="status"
                      ariaLive="polite"
                      ariaAtomic={true}
                      class="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs text-on-surface-variant"
                    >
                      {message()}
                    </NoticeBox>
                  )}
                </Show>
              </div>
            </Show>

            {/* Agent Alias */}
            <AliasSettings />

            {/* Agent Execution Preferences */}
            <AgentPreferencesPanel />

            {/* Agent Personas */}
            <div class="glass-surface rounded-xl border border-white/40 p-6 shadow-panel">
              <AgentPersonasPanel />
            </div>

            {/* Profile Ledger */}
            <ProfileLedgerView />

            {/* Encryption */}
            <div class="rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <div class="flex items-center gap-2">
              <p class="text-sm font-semibold text-on-surface">End-to-End Encryption</p>
              <InfoHint text="Explains the default message-protection boundary for AFP content stored or viewed through this workspace." />
            </div>
              <p class="mt-1 text-xs leading-5 text-on-surface-variant">
                All AFP messages are encrypted using XChaCha20-Poly1305 before storage.
                Decryption happens only in this browser - plaintext is never re-stored or transmitted.
                Closing this tab discards all decrypted content from memory.
              </p>
            </div>

            {/* Sovereign Data Bundle */}
            <div class="rounded-xl border border-outline/20 bg-outline/5 p-4">
              <div class="flex items-center gap-2">
              <p class="text-sm font-semibold text-on-surface">Sovereign Data Bundle</p>
              <InfoHint text="Exports your locally held agent state into a portable bundle so you can archive or migrate it outside this browser profile." />
            </div>
              <p class="mt-1 text-xs leading-5 text-on-surface-variant">
                Export all local AFP state (preferences, reactions, bookmarks, LLM config, LoRA history) as a
                portable JSON bundle. Nothing is held back - you own your data completely.
              </p>
              <button
                type="button"
                onClick={exportSovereignDataBundle}
                class="mt-3 rounded-lg border border-outline/20 bg-white/20 px-4 py-2 text-xs font-medium text-on-surface-variant transition hover:bg-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Export Bundle
              </button>
            </div>
          </div>
        </Show>
      </div>

      {/* Identity Card Export */}
      <div class="glass-card mt-4 rounded-2xl border border-white/45 p-5">
        <div class="mb-3 flex items-center gap-2">
          <p class="text-sm font-semibold text-on-surface">Identity Card Export</p>
          <InfoHint text="Generates a printable identity card summarizing the current agent persona, capabilities, and branding for offline or badge-style use." />
        </div>
        <p class="mb-3 text-[11px] leading-5 text-on-surface-variant">
          Export your agent's identity and capabilities as a high-DPI printable card - suitable for physical archives or enterprise ID badges.
        </p>
        <Show when={identityCardExportError()}>
          {(message) => (
            <NoticeBox role="alert" ariaLive="assertive" ariaAtomic={true} class="mb-3 text-xs text-red-500">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <span>{message()}</span>
                <button
                  type="button"
                  onClick={() => setIdentityCardExportError(null)}
                  class="font-medium text-red-500 underline underline-offset-2"
                >
                  Dismiss
                </button>
              </div>
            </NoticeBox>
          )}
        </Show>
        <button
          type="button"
          onClick={() => {
            exportIdentityCard();
            return;
            const inst = instance();
            const cfg = llmConfig();
            const caps = capabilities();
            const card = window.open("", "_blank", "width=900,height=640,noopener,noreferrer");
            if (!card) return;
            const popup = card!;
            try {
              popup.opener = null;
            } catch {
              // Ignore browsers that expose opener as read-only for noopener windows.
            }
            // Escape HTML entities before injecting server-derived values into document.write.
            const esc = (s: unknown) => String(s ?? "")
              .replace(/&/g, "&amp;").replace(/</g, "&lt;")
              .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
            const agentId = `omnyid-${Date.now().toString(36).toUpperCase()}`;
            const model = cfg?.model ?? llmModel();
            const provider = cfg?.provider ?? llmProvider();
            const loraScore = inst?.lora_confidence_score != null
              ? `${Math.round(inst!.lora_confidence_score! * 100)}%`
              : "-";
            const capList = caps.length > 0
              ? caps.map((c) => `<li>${esc(c.id)}: ${esc(c.description)}</li>`).join("")
              : "<li style='color:#888'>No capabilities registered</li>";
            popup.document.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>OmnyID Agent Identity Card</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,system-ui,sans-serif;background:#f0f3f9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem}
  .card{width:680px;min-height:360px;background:linear-gradient(135deg,#fff 60%,#e8eef8);border-radius:20px;box-shadow:0 20px 60px rgba(49,86,142,0.18);overflow:hidden;position:relative;display:flex;flex-direction:column}
  .header{background:linear-gradient(135deg,#31568e,#3d6aaa);color:#fff;padding:28px 32px 24px;display:flex;align-items:center;gap:24px}
  .avatar{width:72px;height:72px;border-radius:16px;background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.35);display:flex;align-items:center;justify-content:center;font-size:2em;flex-shrink:0}
  .header-text h1{font-size:22px;font-weight:700;letter-spacing:-0.02em}
  .header-text p{font-size:11px;opacity:0.7;margin-top:2px;font-family:monospace}
  .badge{display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:999px;padding:3px 10px;font-size:10px;margin-top:8px;font-family:monospace;letter-spacing:0.05em}
  .body{display:grid;grid-template-columns:1fr 1fr;gap:0;flex:1}
  .col{padding:24px 28px;border-right:1px solid rgba(49,86,142,0.08)}
  .col:last-child{border-right:none}
  .section-label{font-size:9px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#737781;margin-bottom:10px}
  .field{margin-bottom:14px}
  .field-name{font-size:10px;color:#737781;margin-bottom:2px}
  .field-val{font-size:13px;font-weight:600;color:#1a1c1b}
  .field-val.mono{font-family:monospace;font-size:11px;font-weight:400;color:#31568e;word-break:break-all}
  .cap-list{list-style:none;display:flex;flex-direction:column;gap:4px}
  .cap-list li{font-size:11px;color:#434750;padding:4px 8px;background:rgba(49,86,142,0.05);border-radius:6px}
  .footer{background:#f8f9fc;border-top:1px solid rgba(49,86,142,0.08);padding:12px 28px;display:flex;align-items:center;justify-content:space-between}
  .footer p{font-size:9px;color:#737781;font-family:monospace}
  .qr-stub{width:48px;height:48px;background:#31568e;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:8px;font-family:monospace;text-align:center;line-height:1.3}
  @media print{body{background:#fff;padding:0}@page{margin:0;size:A5 landscape}}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="avatar">AI</div>
    <div class="header-text">
      <h1>OmnyID Master Agent</h1>
      <p>Agent Identity Card | v1 | AFP-compliant</p>
      <span class="badge">E2EE-Verified | Local-First | Agent-First</span>
    </div>
  </div>
  <div class="body">
    <div class="col">
      <p class="section-label">Identity</p>
      <div class="field"><div class="field-name">Agent ID</div><div class="field-val mono">${esc(agentId)}</div></div>
      <div class="field"><div class="field-name">LLM Model</div><div class="field-val">${esc(model)}</div></div>
      <div class="field"><div class="field-name">Provider</div><div class="field-val">${esc(provider)}</div></div>
      <div class="field"><div class="field-name">LoRA Confidence</div><div class="field-val">${esc(loraScore)}</div></div>
      <div class="field"><div class="field-name">Issued</div><div class="field-val">${new Date().toLocaleDateString("en-AU", { year: "numeric", month: "long", day: "numeric" })}</div></div>
    </div>
    <div class="col">
      <p class="section-label">Capabilities (${caps.length})</p>
      <ul class="cap-list">${capList}</ul>
    </div>
  </div>
  <div class="footer">
    <div>
      <p>OmnyID | omnyid.com | AFP v1</p>
      <p>This card is a non-binding identity record for the registered agent instance.</p>
    </div>
    <div class="qr-stub">ID<br/>${esc(agentId.slice(-6))}</div>
  </div>
</div>
<script>window.onload=()=>window.print();<\/script>
</body>
</html>`);
            popup.document.close();
          }}
          class="rounded-lg border border-primary/20 bg-primary/8 px-4 py-2 text-xs font-medium text-primary transition hover:bg-primary/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Export Identity Card (Print / PDF)
        </button>
      </div>

      {/* Re-run onboarding wizard */}
      <Show when={showWizard()}>
        <div id="onboarding-wizard-dialog">
          <OnboardingWizard onComplete={() => {
            closeOnboardingWizard();
            void refreshInstanceAfterWizard();
          }} />
        </div>
      </Show>

      {/* Add capability modal */}
      <Show when={showAddCapability()}>
        <div id="add-capability-dialog">
          <AddCapabilityModal
            onClose={() => closeAddCapabilityModal()}
            onCreated={refreshCapabilities}
          />
        </div>
      </Show>

      <SoulEditorModal
        open={showSoulEditor()}
        value={soulEditText()}
        error={soulSaveError()}
        saving={soulSaving()}
        onChange={(value) => {
          setSoulEditText(value);
          if (soulSaveError() && !soulSaving()) {
            setSoulSaveError("");
          }
        }}
        onClose={() => requestCloseSoulEditor()}
        onSave={saveSoulMd}
      />
    </div>
  );
}
