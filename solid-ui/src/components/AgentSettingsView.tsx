import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { approvalModeLabel } from "afp-ts/continuity";
import { applyRuntimeUpdate, checkRuntimeUpdates, createRuntimeBackupSnapshot, createRuntimeRestoreDrill, deleteCapability, fetchLlmConfig, fetchRuntimeBackupManifest, fetchRuntimeRecoveryPacket, getFleetMasterInstance, listCapabilities, patchCapability, pingLlmConfig, readSession, registerCapability, saveLlmConfig, setRuntimeBackupRetention, setRuntimeUpdatePolicy, updateAgentSoulMd, updateDeviceSyncPolicyProfile, type CapabilityDescriptor, type DashboardBootstrap, type DeviceSyncPolicyEntry, type LlmConfig, type RuntimeBackupManifestResponse, type RuntimeBackupsResponse, type RuntimeRecoveryPacketResponse, type RuntimeRestoreDrillsResponse, type RuntimeUpdatesResponse } from "@/lib/api";
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
  latestTimestampValue,
  relativeTimeLabel,
} from "@/lib/agentSettingsRuntimeFormat";
import { exportAgentIdentityCard } from "@/lib/exportAgentIdentityCard";
import { exportSovereignDataBundle as exportSovereignDataBundleFile } from "@/lib/exportSovereignDataBundle";
import { dispatchDashboardRefreshEvent } from "@/lib/dashboardRefreshEvent";
import { buildBillingUpgradeMailtoHref } from "@/lib/billingUpgradeState";
import { supportAccessHistoryCards } from "@/lib/supportAccessHistoryFormat";
import {
  compactSummaryLines,
} from "@/lib/agentSettingsSummaryFormat";
import {
  runtimeBackupSummaryRows,
  runtimeRestoreDrillSummaryRows,
  supportAccessSummaryRows,
  type AgentSettingsSummaryRow,
} from "@/lib/agentSettingsSummaryRowsState";
import {
  deviceSyncPolicyCardStates,
  deviceSyncLocalKeysLabel,
  deviceSyncProvisionedLabel,
  deviceSyncRuntimeHasSummary,
  deviceSyncRuntimeSummaryCardState,
  deviceSyncUsedLabel,
} from "@/lib/deviceSyncRuntimeState";
import {
  runtimeOperationsOverviewRows,
  runtimeUpdateEventCards,
} from "@/lib/runtimeOperationsState";
import {
  runtimeBackupManifestReviewState as buildRuntimeBackupManifestReviewState,
} from "@/lib/runtimeBackupManifestState";
import {
  runtimeDeploymentHostedCard,
} from "@/lib/runtimeDeploymentState";
import {
  simulatorRuntimeHasSummary,
  simulatorRuntimeSummaryCardState,
} from "@/lib/simulatorRuntimeState";
import {
  runtimeBackupsEntries,
  runtimeBackupsHasEntries,
  runtimeBackupsLatestEntryId,
  runtimeBackupsPreviewCards,
  runtimeBackupsRetentionDays,
} from "@/lib/runtimeBackupsState";
import { runtimeRecoveryMetrics } from "@/lib/runtimeRecoveryMetricsState";
import {
  runtimeRestoreDrillHasEntries,
  runtimeRestoreDrillEntries as selectRuntimeRestoreDrillEntries,
  runtimeRestoreDrillPreviewCards,
} from "@/lib/runtimeRestoreDrillsState";
import {
  supportAccessReason,
  supportAccessBoundaryCardState,
} from "@/lib/supportAccessState";
import {
  runtimeUpdatesActionState,
  runtimeUpdatesEntries,
  runtimeUpdatesHasAvailableUpdate,
  runtimeUpdatesPolicy,
  runtimeUpdatesPolicyAutoApply,
  runtimeUpdatesPolicySupportPostureLabel,
  runtimeUpdatesPolicyUpdateChannel,
  runtimeUpdatesPolicyViewState,
} from "@/lib/runtimeUpdatesState";
import { type AgentSettingsRuntimeFailureReceipt } from "@/lib/agentSettingsRuntimeFailureState";
import {
  runtimeRecoveryPacketPreviewState as buildRuntimeRecoveryPacketPreviewState,
} from "@/lib/runtimeRecoveryPacketState";
import {
  capabilityUsageCardState,
  type CapabilityUsageCardState,
} from "@/lib/agentSettingsCapabilityUsageState";
import {
  clearLoraHistory as clearSavedLoraHistory,
  loadLastLlmPingAt,
  loadSoulSavedAt,
  loadCapabilityDowUsage,
  loadCapabilityLastUsed,
  loadCapabilityUsageCount,
  loadLatencyHistory,
  loadLoraHistory,
  loadTestHistory,
  saveCapabilityDowUsage,
  saveCapabilityLastUsed,
  saveCapabilityUsageCount,
  saveLoraHistory,
  type LatencySnapshot,
  type LoraSnapshot,
  type TestHistoryEntry,
} from "@/lib/agentSettingsLocalState";
import { type AgentSettingsCapabilityFailureReceipt } from "@/lib/agentSettingsCapabilityFailureState";
import { type AgentSettingsDevicePolicyFailureReceipt } from "@/lib/agentSettingsDevicePolicyFailureState";
import {
  buildAgentSettingsIdentityFailureReceipt,
  type AgentSettingsIdentityFailureReceipt,
} from "@/lib/agentSettingsIdentityFailureState";
import {
  type AgentSettingsIdentityUtilityFailureReceipt,
} from "@/lib/agentSettingsIdentityUtilityFailureState";
import {
  type AgentSettingsLlmFailureReceipt,
} from "@/lib/agentSettingsLlmFailureState";
import {
  type AgentSettingsSoulFailureReceipt,
} from "@/lib/agentSettingsSoulFailureState";
import {
  runtimeBackupControlsState,
  runtimeRecoveryPacketControlsState,
} from "@/lib/runtimeControlsState";
import { type AgentFleetInstance as AgentInstance } from "@/lib/agentFleetResponseState";
import {
  agentSettingsHasSupportAccessHistory,
  agentSettingsIdentityCardExportState,
  agentSettingsRuntimeRecoveryPacketExportState,
  agentSettingsTestHistoryRowState,
} from "@/lib/agentSettingsViewState";
import {
  addAgentSettingsCapabilityAndReload,
  applyAgentSettingsRuntimeUpdate,
  checkAgentSettingsRuntimeUpdates,
  copyAgentSettingsKeyPrefix,
  copyAgentSettingsSoulText,
  createAgentSettingsRuntimeRestoreDrill,
  createAgentSettingsRuntimeSnapshot,
  downloadAgentSettingsRuntimeRecoveryPacketState,
  cycleAgentSettingsCapabilityApprovalModeAndReload,
  deleteAgentSettingsCapabilityAndReload,
  exportAgentSettingsIdentityCardState,
  exportAgentSettingsSovereignDataBundleState,
  importAgentSettingsCapabilitiesAndReload,
  loadAgentSettingsBootstrapState,
  loadAgentSettingsCapabilitiesState,
  loadAgentSettingsIdentityState,
  loadAgentSettingsLlmState,
  loadAgentSettingsRuntimeBackupManifest,
  loadAgentSettingsRuntimeRecoveryPacket,
  preloadAgentSettingsRuntimeRecoveryPacket,
  saveAgentSettingsSoulStateAndReload,
  saveAgentSettingsLlmStateAndReload,
  testAgentSettingsLlmConnectionState,
  updateAgentSettingsDevicePolicyAndReload,
  updateAgentSettingsRuntimeBackupRetention,
  updateAgentSettingsRuntimeUpdatePolicy,
} from "@/lib/agentSettingsAsyncState";

type SummaryChipListProps = {
  items: string[];
  class?: string;
  itemClass?: string;
};

function SummaryRows(props: { items: AgentSettingsSummaryRow[]; class?: string }) {
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

const EMPTY_CAPABILITY_USAGE_CARD_STATE: CapabilityUsageCardState = {
  usageSummary: null,
  dowBars: [],
  staleSummary: null,
};

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
  simulatorRuntimeSummary?: DashboardBootstrap["simulator_runtime_summary"] | null;
  runtimeUpdates?: RuntimeUpdatesResponse | null;
  runtimeDeployment?: DashboardBootstrap["runtime_deployment"] | null;
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
  const sessionUserId = () => readSession()?.user?.id ?? null;
  let llmSectionRef: HTMLDivElement | undefined;

  const [instance, setInstance] = createSignal<AgentInstance | null>(null);
  const [instanceLoadError, setInstanceLoadError] = createSignal<AgentSettingsIdentityFailureReceipt | null>(null);
  const [showWizard, setShowWizard] = createSignal(false);
  const [wizardRefreshError, setWizardRefreshError] = createSignal<AgentSettingsIdentityFailureReceipt | null>(null);
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
    mistral:     ["mistral-small-latest", "mistral-large-latest", "open-mixtral-8x22b"],
    huggingface: ["meta-llama/Llama-3.1-8B-Instruct", "mistralai/Mistral-7B-Instruct-v0.3", "Qwen/Qwen2.5-7B-Instruct"],
  };

  const providerDefaults: Record<string, { model: string; keyPlaceholder: string; keyPrefix?: string }> = {
    anthropic:   { model: "claude-haiku-4-5-20251001", keyPlaceholder: "sk-ant-...", keyPrefix: "sk-ant-" },
    openai:      { model: "gpt-4o-mini",               keyPlaceholder: "sk-...", keyPrefix: "sk-" },
    openrouter:  { model: "openai/gpt-4o-mini",        keyPlaceholder: "sk-or-...", keyPrefix: "sk-or-" },
    cerebras:    { model: "llama3.1-70b",              keyPlaceholder: "csk-...", keyPrefix: "csk-" },
    together_ai: { model: "meta-llama/Llama-3-8b-hf",  keyPlaceholder: "Together AI API key" },
    mistral:     { model: "mistral-small-latest",      keyPlaceholder: "Mistral API key" },
    huggingface: { model: "meta-llama/Llama-3.1-8B-Instruct", keyPlaceholder: "hf_...", keyPrefix: "hf_" },
  };
  function llmProviderLabel(provider?: string | null, backend?: string | null): string {
    switch (provider) {
      case "anthropic": return "Anthropic";
      case "openai": return "OpenAI";
      case "openrouter": return "OpenRouter";
      case "cerebras": return "Cerebras";
      case "together_ai": return "Together AI";
      case "mistral": return "Mistral";
      case "huggingface": return "Hugging Face";
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
    return providerDefaults[llmProvider()]?.keyPrefix ?? "";
  };
  const keyFormatValid = () => {
    const key = llmApiKey();
    if (!key) return null;
    const prefix = keyPrefix();
    if (!prefix || prefix.includes(" ")) return null;
    return key.startsWith(prefix);
  };
  const [keyPrefixCopied, setKeyPrefixCopied] = createSignal(false);
  const [keyPrefixCopyError, setKeyPrefixCopyError] = createSignal<AgentSettingsIdentityUtilityFailureReceipt | null>(null);
  const [runtimeBackupsState, setRuntimeBackupsState] = createSignal<RuntimeBackupsResponse | null>(props.runtimeBackups ?? null);
  const [runtimeRestoreDrillsState, setRuntimeRestoreDrillsState] = createSignal<RuntimeRestoreDrillsResponse | null>(props.runtimeRestoreDrills ?? null);
  const [runtimeUpdatesState, setRuntimeUpdatesState] = createSignal<RuntimeUpdatesResponse | null>(props.runtimeUpdates ?? null);
  const [runtimeBackupBusy, setRuntimeBackupBusy] = createSignal<"snapshot" | "retention" | null>(null);
  const [runtimeBackupManifestBusyId, setRuntimeBackupManifestBusyId] = createSignal<string | null>(null);
  const [runtimeBackupManifest, setRuntimeBackupManifest] = createSignal<RuntimeBackupManifestResponse | null>(null);
  const [runtimeDrillBusyBackupId, setRuntimeDrillBusyBackupId] = createSignal<string | null>(null);
  const [runtimeUpdatesBusy, setRuntimeUpdatesBusy] = createSignal<"policy" | "check" | "apply" | null>(null);
  const [runtimeRecoveryBusy, setRuntimeRecoveryBusy] = createSignal(false);
  const [runtimeRecoveryPacket, setRuntimeRecoveryPacket] = createSignal<RuntimeRecoveryPacketResponse | null>(null);
  const [runtimeRecoveryPreviewOpen, setRuntimeRecoveryPreviewOpen] = createSignal(false);
  const [runtimeRecoveryPacketHydrated, setRuntimeRecoveryPacketHydrated] = createSignal(false);
  const [runtimeRecoveryPreviewOrigin, setRuntimeRecoveryPreviewOrigin] = createSignal<"preview" | "download" | null>(null);
  const [runtimeFeedback, setRuntimeFeedback] = createSignal<string>("");
  const [runtimeActionError, setRuntimeActionError] = createSignal<AgentSettingsRuntimeFailureReceipt | null>(null);
  let runtimeBackupManifestTriggerRef: HTMLButtonElement | undefined;
  let runtimeRecoveryPreviewTriggerRef: HTMLButtonElement | undefined;
  let runtimeRecoveryDownloadTriggerRef: HTMLButtonElement | undefined;
  const runtimeBackupEntries = createMemo(() => runtimeBackupsEntries(runtimeBackupsState()));
  const runtimeRestoreDrillEntries = createMemo(() => selectRuntimeRestoreDrillEntries(runtimeRestoreDrillsState()));
  const runtimeUpdateEntriesState = createMemo(() => runtimeUpdatesEntries(runtimeUpdatesState()));
  const runtimeUpdatePolicyState = createMemo(() => runtimeUpdatesPolicy(runtimeUpdatesState()));
  const runtimeDeploymentState = createMemo(() => props.runtimeDeployment ?? null);
  const runtimeDeploymentHostedCardState = createMemo(() => runtimeDeploymentHostedCard(runtimeDeploymentState()));
  const deviceSyncRuntimeSummaryCard = createMemo(() => deviceSyncRuntimeSummaryCardState(props.deviceSyncRuntimeSummary));
  const simulatorRuntimeSummaryCard = createMemo(() => simulatorRuntimeSummaryCardState(props.simulatorRuntimeSummary));
  const latestRuntimeBackupId = createMemo(() => runtimeBackupsLatestEntryId(runtimeBackupsState()));
  const hasRuntimeBackupEntries = createMemo(() => runtimeBackupsHasEntries(runtimeBackupsState()));
  const runtimeRecoveryMetricsState = createMemo(() =>
    runtimeRecoveryMetrics(runtimeBackupsState(), runtimeRestoreDrillsState())
  );
  const runtimeBackupPreviewCardList = createMemo(() =>
    runtimeBackupsPreviewCards(
      runtimeBackupsState(),
      runtimeRecoveryMetricsState().latestCompletedRestoreDrillByBackupId,
    )
  );
  const runtimeBackupManifestReviewCard = createMemo(() =>
    buildRuntimeBackupManifestReviewState(runtimeBackupManifest())
  );
  const hasRuntimeRestoreDrillEntries = createMemo(() => runtimeRestoreDrillHasEntries(runtimeRestoreDrillsState()));
  const runtimeRestoreDrillPreviewCardList = createMemo(() => runtimeRestoreDrillPreviewCards(runtimeRestoreDrillsState()));
  const runtimeRecoveryPacketState = createMemo(() => runtimeRecoveryPacket());
  const runtimeRecoveryPacketPreviewState = createMemo(() =>
    buildRuntimeRecoveryPacketPreviewState(runtimeRecoveryPacketState())
  );
  const devicePolicyCardStatesState = createMemo(() => deviceSyncPolicyCardStates(devicePolicies()));
  const supportAccessHistoryCardList = createMemo(() => supportAccessHistoryCards(props.supportAccessHistory));
  const supportAccessBoundaryCard = createMemo(() => supportAccessBoundaryCardState(props.supportAccess));
  const runtimeUpdatesPolicyView = createMemo(() => runtimeUpdatesPolicyViewState(runtimeUpdatesState()));
  const runtimeUpdatesActionView = createMemo(() => runtimeUpdatesActionState(runtimeUpdatesBusy(), runtimeUpdatesState()));
  const runtimeBackupControlsView = createMemo(() =>
    runtimeBackupControlsState({
      busy: runtimeBackupBusy(),
      manifestBusyId: runtimeBackupManifestBusyId(),
      latestBackupId: latestRuntimeBackupId(),
      hasBackupEntries: hasRuntimeBackupEntries(),
      drillBusyBackupId: runtimeDrillBusyBackupId(),
    })
  );
  const runtimeRecoveryPacketControlsView = createMemo(() =>
    runtimeRecoveryPacketControlsState(runtimeRecoveryBusy())
  );
  const runtimeBackupSummaryItems = createMemo(() =>
    runtimeBackupSummaryRows(runtimeBackupsState(), runtimeRestoreDrillsState())
  );
  const restoreDrillSummaryItems = createMemo(() =>
    runtimeRestoreDrillSummaryRows(runtimeBackupsState(), runtimeRestoreDrillsState())
  );
  const supportBoundarySummaryItems = createMemo(() =>
    supportAccessSummaryRows(props.supportAccess)
  );
  async function copyKeyPrefix() {
    const prefix = keyPrefix();
    if (!prefix) return;
    setKeyPrefixCopyError(null);
    const result = await copyAgentSettingsKeyPrefix(prefix, (text) => navigator.clipboard.writeText(text));
    if (result.error) {
      setKeyPrefixCopyError(result.error);
      return;
    }
    if (result.copied) {
      setKeyPrefixCopied(true);
      setTimeout(() => setKeyPrefixCopied(false), 1500);
    }
  }

  // Saved-to-server snapshots — used for per-field dirty highlighting
  const [savedLlmBackend, setSavedLlmBackend] = createSignal<string>("byok");
  const [savedLlmModel, setSavedLlmModel] = createSignal<string>("claude-haiku-4-5-20251001");
  const [savedOllamaUrl, setSavedOllamaUrl] = createSignal<string>("http://localhost:11434");

  const [llmSaving, setLlmSaving] = createSignal(false);
  const [llmSaved, setLlmSaved] = createSignal(false);
  const [llmError, setLlmError] = createSignal<AgentSettingsLlmFailureReceipt | null>(null);
  const [llmLoadError, setLlmLoadError] = createSignal<AgentSettingsLlmFailureReceipt | null>(null);
  const [llmDirty, setLlmDirty] = createSignal(false);
  const [llmPinging, setLlmPinging] = createSignal(false);
  const [llmPingResult, setLlmPingResult] = createSignal<{
    ok: boolean;
    receipt?: AgentSettingsLlmFailureReceipt;
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
  const [latencyHistory, setLatencyHistory] = createSignal<LatencySnapshot[]>(loadLatencyHistory(sessionUserId()));
  const [testHistory, setTestHistory] = createSignal<TestHistoryEntry[]>(loadTestHistory(sessionUserId()));
  const [lastPingAt, setLastPingAt] = createSignal<number | null>(loadLastLlmPingAt(sessionUserId()));

  // LoRA history sparkline
  const [loraHistory, setLoraHistory] = createSignal<LoraSnapshot[]>(loadLoraHistory(sessionUserId()));
  function clearLoraHistory() {
    clearSavedLoraHistory(sessionUserId());
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
  createEffect(() => {
    if (settingsTab() !== "runtime") return;
    if (runtimeRecoveryPacketHydrated() || runtimeRecoveryBusy()) return;
    setRuntimeRecoveryPacketHydrated(true);
    queueMicrotask(() => {
      void (async () => {
        setRuntimeRecoveryPacket(await preloadAgentSettingsRuntimeRecoveryPacket(fetchRuntimeRecoveryPacket));
      })();
    });
  });
  function signalDashboardRefresh() {
    dispatchDashboardRefreshEvent({ reason: "runtime-management-updated" });
  }
  async function handleRuntimeBackupRetentionChange(retentionDays: 7 | 14 | 30 | 90) {
    setRuntimeBackupBusy("retention");
    setRuntimeFeedback("");
    setRuntimeActionError(null);
    const result = await updateAgentSettingsRuntimeBackupRetention(retentionDays, setRuntimeBackupRetention);
    if (result.error) {
      setRuntimeActionError(result.error);
    } else if (result.backups) {
      setRuntimeBackupsState(result.backups);
      setRuntimeFeedback(result.feedback ?? "");
      signalDashboardRefresh();
    }
    setRuntimeBackupBusy(null);
  }
  async function handleCreateRuntimeSnapshot() {
    setRuntimeBackupBusy("snapshot");
    setRuntimeFeedback("");
    setRuntimeActionError(null);
    const result = await createAgentSettingsRuntimeSnapshot(createRuntimeBackupSnapshot);
    if (result.error) {
      setRuntimeActionError(result.error);
    } else if (result.backups) {
      setRuntimeBackupsState(result.backups);
      setRuntimeFeedback(result.feedback ?? "");
      setRuntimeBackupManifest(null);
      signalDashboardRefresh();
    }
    setRuntimeBackupBusy(null);
  }
  async function handleCreateRestoreDrill(backupId: string) {
    setRuntimeDrillBusyBackupId(backupId);
    setRuntimeFeedback("");
    setRuntimeActionError(null);
    const result = await createAgentSettingsRuntimeRestoreDrill(backupId, createRuntimeRestoreDrill);
    if (result.error) {
      setRuntimeActionError(result.error);
    } else if (result.drills) {
      setRuntimeRestoreDrillsState(result.drills);
      setRuntimeFeedback(result.feedback ?? "");
      signalDashboardRefresh();
    }
    setRuntimeDrillBusyBackupId(null);
  }
  async function handleReviewRuntimeBackupManifest(backupId: string) {
    setRuntimeBackupManifestBusyId(backupId);
    setRuntimeFeedback("");
    setRuntimeActionError(null);
    const result = await loadAgentSettingsRuntimeBackupManifest(backupId, fetchRuntimeBackupManifest);
    if (result.error) {
      setRuntimeActionError(result.error);
    } else if (result.manifest) {
      setRuntimeBackupManifest(result.manifest);
      setRuntimeFeedback(result.feedback ?? "");
    }
    setRuntimeBackupManifestBusyId(null);
  }

  function closeRuntimeBackupManifestReview(options?: { restoreFocus?: boolean }) {
    setRuntimeBackupManifest(null);
    if (options?.restoreFocus === false) return;
    queueMicrotask(() => runtimeBackupManifestTriggerRef?.focus());
  }

  function saveRuntimeRecoveryPacket(packet: RuntimeRecoveryPacketResponse) {
    const exportState = agentSettingsRuntimeRecoveryPacketExportState(packet);
    const blob = new Blob([exportState.payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = exportState.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function handleRuntimeUpdatePolicyChange(input: {
    update_channel: "stable" | "manual_only";
    auto_apply: "manual_only" | "scaffold_refresh_only";
  }) {
    setRuntimeUpdatesBusy("policy");
    setRuntimeFeedback("");
    setRuntimeActionError(null);
    const result = await updateAgentSettingsRuntimeUpdatePolicy(input, setRuntimeUpdatePolicy);
    if (result.error) {
      setRuntimeActionError(result.error);
    } else if (result.updates) {
      setRuntimeUpdatesState(result.updates);
      setRuntimeFeedback(result.feedback ?? "");
      signalDashboardRefresh();
    }
    setRuntimeUpdatesBusy(null);
  }
  async function handleCheckRuntimeUpdates() {
    setRuntimeUpdatesBusy("check");
    setRuntimeFeedback("");
    setRuntimeActionError(null);
    const result = await checkAgentSettingsRuntimeUpdates(checkRuntimeUpdates);
    if (result.error) {
      setRuntimeActionError(result.error);
    } else if (result.updates) {
      setRuntimeUpdatesState(result.updates);
      setRuntimeFeedback(result.feedback ?? "");
      signalDashboardRefresh();
    }
    setRuntimeUpdatesBusy(null);
  }
  async function handleApplyRuntimeUpdate() {
    setRuntimeUpdatesBusy("apply");
    setRuntimeFeedback("");
    setRuntimeActionError(null);
    const result = await applyAgentSettingsRuntimeUpdate(applyRuntimeUpdate);
    if (result.error) {
      setRuntimeActionError(result.error);
    } else if (result.updates) {
      setRuntimeUpdatesState(result.updates);
      setRuntimeFeedback(result.feedback ?? "");
      signalDashboardRefresh();
    }
    setRuntimeUpdatesBusy(null);
  }
  async function handleDownloadRecoveryPacket() {
    setRuntimeRecoveryBusy(true);
    setRuntimeFeedback("");
    setRuntimeActionError(null);
    setRuntimeRecoveryPreviewOrigin("download");
    setRuntimeRecoveryPreviewOpen(false);
    const result = await downloadAgentSettingsRuntimeRecoveryPacketState({
      loadPacket: fetchRuntimeRecoveryPacket,
      savePacket: saveRuntimeRecoveryPacket,
    });
    if (result.error) {
      setRuntimeActionError(result.error);
      setRuntimeRecoveryBusy(false);
      return;
    }
    if (result.packet) {
      setRuntimeRecoveryPacket(result.packet);
      setRuntimeRecoveryPacketHydrated(true);
      setRuntimeFeedback(result.feedback ?? "");
    }
    setRuntimeRecoveryBusy(false);
  }
  async function handlePreviewRecoveryPacket() {
    setRuntimeRecoveryBusy(true);
    setRuntimeFeedback("");
    setRuntimeActionError(null);
    setRuntimeRecoveryPreviewOrigin("preview");
    const result = await loadAgentSettingsRuntimeRecoveryPacket("preview", fetchRuntimeRecoveryPacket);
    if (result.error) {
      setRuntimeActionError(result.error);
    } else if (result.packet) {
      setRuntimeRecoveryPacket(result.packet);
      setRuntimeRecoveryPacketHydrated(true);
      setRuntimeRecoveryPreviewOpen(true);
      setRuntimeFeedback(result.feedback ?? "");
    }
    setRuntimeRecoveryBusy(false);
  }

  function closeRuntimeRecoveryPacketPreview(options?: { restoreFocus?: boolean }) {
    setRuntimeRecoveryPreviewOpen(false);
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
    const history = loadLoraHistory(sessionUserId());
    const existing = history.find((h) => h.date === today);
    if (!existing) {
      const next = [...history, { date: today, score }].slice(-7);
      saveLoraHistory(next, sessionUserId());
      setLoraHistory(next);
    } else if (existing.score !== score) {
      const next = history.map((h) => h.date === today ? { ...h, score } : h);
      saveLoraHistory(next, sessionUserId());
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
  const [devicePolicyActionError, setDevicePolicyActionError] = createSignal<AgentSettingsDevicePolicyFailureReceipt | null>(null);

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
    const result = await loadAgentSettingsIdentityState(
      target === "bootstrap" ? "Load agent identity" : "Refresh agent personality",
      getFleetMasterInstance,
    );
    if (result.error) {
      if (target === "bootstrap") setInstanceLoadError(result.error);
      else setWizardRefreshError(result.error);
      return false;
    }
    setInstance(result.instance);
    return true;
  }

  async function refreshInstanceAfterWizard() {
    const ok = await refreshInstance({ target: "wizard" });
    if (!ok && !wizardRefreshError()) {
      setWizardRefreshError(
        buildAgentSettingsIdentityFailureReceipt(
          "Refresh agent personality",
          "Could not refresh the updated agent personality.",
        ),
      );
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
    setDevicePolicyActionError(null);
    const result = await updateAgentSettingsDevicePolicyAndReload(
      { deviceId, profile },
      updateDeviceSyncPolicyProfile,
    );
    if (result.error) {
      setDevicePolicyActionError(result.error);
    } else {
      setDevicePolicies(result.entries);
      setDevicePolicyFeedback(result.feedback);
      dispatchDashboardRefreshEvent({ reason: "device-sync-policy-update" });
    }
    setDevicePolicyUpdatingId(null);
  }

  // Capability registry state
  const [capabilities, setCapabilities] = createSignal<CapabilityDescriptor[]>([]);
  const [showAddCapability, setShowAddCapability] = createSignal(false);
  const [capDeleting, setCapDeleting] = createSignal<string | null>(null);
  const [capAdding, setCapAdding] = createSignal<string | null>(null);
  const [capLoadError, setCapLoadError] = createSignal<AgentSettingsCapabilityFailureReceipt | null>(null);
  const [capActionError, setCapActionError] = createSignal<AgentSettingsCapabilityFailureReceipt | null>(null);
  let addCapabilityTriggerRef: HTMLButtonElement | undefined;
  const [newCapId, setNewCapId] = createSignal<string | null>(null);
  const [soulSavedAt, setSoulSavedAt] = createSignal<number | null>(loadSoulSavedAt(sessionUserId()));
  const [soulCopied, setSoulCopied] = createSignal(false);
  const [soulCopyError, setSoulCopyError] = createSignal<AgentSettingsSoulFailureReceipt | null>(null);
  const [identityCardExportError, setIdentityCardExportError] = createSignal<AgentSettingsIdentityUtilityFailureReceipt | null>(null);
  const [sovereignDataExportError, setSovereignDataExportError] = createSignal<AgentSettingsIdentityUtilityFailureReceipt | null>(null);
  const [showSoulEditor, setShowSoulEditor] = createSignal(false);
  const [soulEditText, setSoulEditText] = createSignal("");
  const [soulSaving, setSoulSaving] = createSignal(false);
  const [soulSaveError, setSoulSaveError] = createSignal<AgentSettingsSoulFailureReceipt | null>(null);
  let soulEditorTriggerRef: HTMLButtonElement | undefined;

  async function copySoulMd() {
    setSoulCopyError(null);
    const result = await copyAgentSettingsSoulText(
      instance()?.soul_md ?? "",
      (text) => navigator.clipboard.writeText(text),
    );
    if (result.error) {
      setSoulCopyError(result.error);
      return;
    }
    if (result.copied) {
      setSoulCopied(true);
      setTimeout(() => setSoulCopied(false), 1500);
    }
  }

  function openSoulEditor() {
    setSoulEditText(instance()?.soul_md ?? "");
    setSoulSaveError(null);
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
    setSoulSaveError(null);
    const result = await saveAgentSettingsSoulStateAndReload(soulEditText(), {
      saveSoul: updateAgentSoulMd,
      loadInstance: getFleetMasterInstance,
      userId: sessionUserId(),
    });
    if (result.error) {
      setSoulSaveError(result.error);
    } else {
      setInstance(result.instance);
      const savedNow = result.savedAt;
      setSoulSavedAt(savedNow);
      closeSoulEditor({ restoreFocus: true });
    }
    setSoulSaving(false);
  }

  const [capLastUsed, setCapLastUsed] = createSignal<Record<string, number>>(
    loadCapabilityLastUsed(sessionUserId())
  );
  const [capUsageCount, setCapUsageCount] = createSignal<Record<string, number>>(
    loadCapabilityUsageCount(sessionUserId())
  );
  const [capDowUsage, setCapDowUsage] = createSignal<Record<string, number[]>>(
    loadCapabilityDowUsage(sessionUserId())
  );
  const capabilityUsageViewById = createMemo<Record<string, CapabilityUsageCardState>>(() => {
    const usageCountById = capUsageCount();
    const lastUsedById = capLastUsed();
    const dowUsageById = capDowUsage();
    return Object.fromEntries(
      capabilities().map((cap) => [
        cap.id,
        capabilityUsageCardState({
          usageCount: usageCountById[cap.id],
          lastUsedAt: lastUsedById[cap.id],
          dowUsage: dowUsageById[cap.id],
        }),
      ]),
    );
  });
  function touchCapLastUsed(id: string) {
    const now = Date.now();
    setCapLastUsed((prev) => {
      const next = { ...prev, [id]: now };
      saveCapabilityLastUsed(next, sessionUserId());
      return next;
    });
    setCapUsageCount((prev) => {
      const next = { ...prev, [id]: (prev[id] ?? 0) + 1 };
      saveCapabilityUsageCount(next, sessionUserId());
      return next;
    });
    const dow = new Date().getDay();
    setCapDowUsage((prev) => {
      const existing = prev[id] ?? [0, 0, 0, 0, 0, 0, 0];
      const next = [...existing] as number[];
      next[dow] = (next[dow] ?? 0) + 1;
      const updated = { ...prev, [id]: next };
      saveCapabilityDowUsage(updated, sessionUserId());
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
    setCapModePatching(cap.id);
    setCapActionError(null);
    const result = await cycleAgentSettingsCapabilityApprovalModeAndReload(cap, {
      patchCapability,
      loadCapabilities: listCapabilities,
      approvalCycle: APPROVAL_CYCLE,
    });
    if (result.error) {
      setCapActionError(result.error);
    } else {
      setCapabilities(result.capabilities);
      touchCapLastUsed(cap.id);
      setCapModeSaved(cap.id);
      setTimeout(() => setCapModeSaved((prev) => (prev === cap.id ? null : prev)), 1500);
    }
    setCapModePatching(null);
  }

  const [capFilter, setCapFilter] = createSignal("");
  const [capImporting, setCapImporting] = createSignal(false);
  const [capImportSuccess, setCapImportSuccess] = createSignal<string | null>(null);
  const [capImportError, setCapImportError] = createSignal<AgentSettingsCapabilityFailureReceipt | null>(null);
  let capImportInputRef: HTMLInputElement | undefined;

  const hostedUpgradeHref = createMemo(() => buildBillingUpgradeMailtoHref(null, null));

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
    const result = exportAgentSettingsIdentityCardState(() =>
      exportAgentIdentityCard(agentSettingsIdentityCardExportState({
        llmConfig: cfg,
        llmModel: llmModel(),
        llmProvider: llmProvider(),
        loraConfidenceScore: inst?.lora_confidence_score ?? null,
        capabilities: caps,
      })),
    );
    setIdentityCardExportError(result.error);
  }

  function exportSovereignDataBundle() {
    setSovereignDataExportError(null);
    const result = exportAgentSettingsSovereignDataBundleState(exportSovereignDataBundleFile);
    setSovereignDataExportError(result.error);
  }

  async function handleImportFile(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    setCapImporting(true);
    setCapImportSuccess(null);
    setCapImportError(null);
    const text = await file.text();
    const result = await importAgentSettingsCapabilitiesAndReload(
      text,
      capabilities().map((capability) => capability.name),
      {
        registerCapability,
        loadCapabilities: listCapabilities,
      },
    );
    if (result.error) {
      setCapImportError(result.error);
      setTimeout(() => setCapImportError(null), 6000);
    } else {
      setCapabilities(result.capabilities);
      setCapImportSuccess(`Imported ${result.importedCount} capability${result.importedCount === 1 ? "" : "ies"}.`);
      setTimeout(() => setCapImportSuccess(null), 4000);
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
    const result = await addAgentSettingsCapabilityAndReload(
      {
        name: tpl.name,
        description: tpl.description,
        input_schema: tpl.input_schema,
        output_schema: null,
        version: "1.0.0",
        tags: tpl.tags,
        approval_mode: tpl.approval_mode,
      },
      {
        registerCapability,
        loadCapabilities: listCapabilities,
      },
    );
    if (result.error) {
      setCapActionError(result.error);
    } else {
      setCapabilities(result.capabilities);
      const added = result.capabilities.find((c) => c.name === tpl.name);
      if (added) {
        setNewCapId(added.id);
        setTimeout(() => setNewCapId((prev) => (prev === added.id ? null : prev)), 3000);
      }
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
    const result = await loadAgentSettingsCapabilitiesState(listCapabilities);
    setCapabilities(result.capabilities);
    setCapLoadError(result.error);
  }

  async function handleDeleteCapability(id: string) {
    setCapDeleting(id);
    setCapActionError(null);
    const result = await deleteAgentSettingsCapabilityAndReload(id, {
      deleteCapability,
      loadCapabilities: listCapabilities,
    });
    if (result.error) setCapActionError(result.error);
    else setCapabilities(result.capabilities);
    setCapDeleting(null);
  }

  onMount(async () => {
    // Scroll to LLM config section if opened via the pill link
    if (props.focusLlm && llmSectionRef) {
      setTimeout(() => llmSectionRef?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
    props.onFocusDone?.();

    const bootstrap = await loadAgentSettingsBootstrapState({
      loadInstance: getFleetMasterInstance,
      loadCapabilities: listCapabilities,
      loadConfig: fetchLlmConfig,
    });
    setInstanceLoadError(bootstrap.instanceError);
    setInstance(bootstrap.instance);
    setCapabilities(bootstrap.capabilities);
    setCapLoadError(bootstrap.capabilitiesError);
    setLlmLoadError(bootstrap.llmError);
    if (bootstrap.llmState) {
      setLlmConfig(bootstrap.llmState.config);
      setLlmBackend(bootstrap.llmState.backend);
      setSavedLlmBackend(bootstrap.llmState.backend);
      if (bootstrap.llmState.provider) setLlmProvider(bootstrap.llmState.provider);
      setLlmModel(bootstrap.llmState.model);
      setSavedLlmModel(bootstrap.llmState.model);
      setLlmOllamaUrl(bootstrap.llmState.ollamaUrl);
      setSavedOllamaUrl(bootstrap.llmState.ollamaUrl);
    }
    setLoading(false);
  });

  async function saveLlm() {
    setLlmSaving(true);
    setLlmError(null);
    setLlmLoadError(null);
    setLlmPingResult(null);
    const normalizedBackend = llmBackend();
    const normalizedProvider = llmProvider().trim();
    const normalizedModel = llmModel().trim();
    const normalizedApiKey = llmApiKey().trim();
    const normalizedOllamaUrl = llmOllamaUrl().trim();
    const result = await saveAgentSettingsLlmStateAndReload(
      {
        backend: normalizedBackend,
        provider: normalizedProvider,
        model: normalizedModel,
        apiKey: normalizedApiKey,
        ollamaUrl: normalizedOllamaUrl,
      },
      {
        saveConfig: saveLlmConfig,
        loadConfig: fetchLlmConfig,
      },
    );
    if (result.error) {
      setLlmError(result.error);
    } else if (result.state) {
      setLlmConfig(result.state.config);
      setLlmBackend(result.state.backend);
      setSavedLlmBackend(result.state.backend);
      setLlmProvider(result.state.provider || llmProvider());
      setLlmModel(result.state.model);
      setSavedLlmModel(result.state.model);
      setLlmOllamaUrl(result.state.ollamaUrl);
      setSavedOllamaUrl(result.state.ollamaUrl);
      setLlmApiKey(normalizedApiKey);
      setLlmSaved(true);
      setLlmDirty(false);
      setTimeout(() => setLlmSaved(false), 3000);
    }
    setLlmSaving(false);
  }

  async function testLlmConnection() {
    // Auto-save unsaved changes before pinging so the test reflects what the user typed.
    if (llmDirty() && !llmSaving()) {
      await saveLlm();
      if (llmDirty() || llmError()) return;
    }
    setLlmPinging(true);
    setLlmPingResult(null);
    const result = await testAgentSettingsLlmConnectionState(
      {
        backend: llmBackend(),
        provider: llmProvider(),
        model: llmModel(),
        userId: sessionUserId(),
      },
      {
        pingConfig: pingLlmConfig,
      },
    );
    setLlmPingResult(result.pingResult);
    setLatencyHistory(result.latencyHistory);
    setTestHistory(result.testHistory);
    setLastPingAt(result.lastPingAt);
    if (result.clearResultAfterMs) {
      setTimeout(() => setLlmPingResult(null), result.clearResultAfterMs);
    }
    setLlmPinging(false);
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
            {(receipt) => (
              <NoticeBox
                role="alert"
                ariaLive="assertive"
                ariaAtomic={true}
                class={`mt-4 border px-3 py-2 text-sm ${
                  receipt().tone === "danger"
                    ? "border-red-300/60 bg-red-50/70 text-red-900"
                    : "border-amber-300/60 bg-amber-50/70 text-amber-900"
                }`}
              >
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="font-semibold">{receipt().title}</p>
                    <p class="mt-1">{receipt().summary}</p>
                    <p class="mt-1">{receipt().nextStep}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshInstance({ target: "bootstrap" })}
                    class="font-medium underline underline-offset-2"
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
                {(receipt) => (
                  <div
                    class={`mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs shadow-sm ${
                      receipt().tone === "danger"
                        ? "border-red-300/60 bg-red-50/90 text-red-900"
                        : "border-amber-300/50 bg-amber-50/90 text-amber-900"
                    }`}
                  >
                    <div class="min-w-0">
                      <p class="font-semibold">{receipt().title}</p>
                      <p class="mt-1">{receipt().summary}</p>
                      <p class="mt-1">{receipt().nextStep}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void refreshInstanceAfterWizard()}
                      class="font-medium underline underline-offset-2"
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
                  {(receipt) => (
                    <NoticeBox
                      role="alert"
                      ariaLive="assertive"
                      ariaAtomic={true}
                      class={`mt-2 border px-3 py-2 text-xs ${
                        receipt().tone === "danger"
                          ? "border-red-300/60 bg-red-50/70 text-red-900"
                          : "border-amber-300/60 bg-amber-50/70 text-amber-900"
                      }`}
                    >
                      <div class="flex flex-wrap items-center justify-between gap-3">
                        <div class="min-w-0">
                          <p class="font-semibold">{receipt().title}</p>
                          <p class="mt-1">{receipt().summary}</p>
                          <p class="mt-1">{receipt().nextStep}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSoulCopyError(null)}
                          class="font-medium underline underline-offset-2"
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
              <div class="mt-3 rounded-lg border border-amber-300/40 bg-amber-50/60 px-3 py-3">
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="text-xs font-semibold uppercase tracking-[0.14em] text-amber-900">Hosted AI</p>
                    <p class="mt-1 text-sm font-medium text-amber-900">
                      Managed hosted AI requires a Pro workspace.
                    </p>
                    <p class="mt-1 text-xs leading-6 text-amber-800/90">
                      Free workspaces should use Bring Your Own Key, Local Ollama, or RunPod. Hosted AI is only enabled when the server accepts a Pro hosted configuration and assigns a positive monthly budget.
                    </p>
                    <Show when={llmConfig()?.backend === "hosted" && (llmConfig()?.monthly_budget_cents ?? 0) <= 0}>
                      <p class="mt-2 text-xs leading-6 text-amber-900">
                        This workspace is still on a hosted-zero-budget config, so the agent will not use hosted AI until you upgrade or switch backends here.
                      </p>
                    </Show>
                  </div>
                  <a
                    href={hostedUpgradeHref()}
                    class="shrink-0 rounded-lg border border-amber-400/50 bg-white/80 px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-white"
                  >
                    Request Pro hosted access
                  </a>
                </div>
              </div>

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
                      <option value="mistral">Mistral</option>
                      <option value="huggingface">Hugging Face</option>
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
                      {(receipt) => (
                        <NoticeBox
                          role="alert"
                          ariaLive="assertive"
                          ariaAtomic={true}
                          class={`mb-2 text-xs ${receipt().tone === "danger" ? "text-red-600" : "text-amber-700"}`}
                        >
                          <div class="flex flex-wrap items-center justify-between gap-3">
                            <div class="min-w-0">
                              <p class="font-semibold">{receipt().title}</p>
                              <p class="mt-1">{receipt().summary}</p>
                              <p class="mt-1 text-[11px] opacity-80">Next step: {receipt().nextStep}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setKeyPrefixCopyError(null)}
                              class={`font-medium underline underline-offset-2 ${
                                receipt().tone === "danger" ? "text-red-600" : "text-amber-700"
                              }`}
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
                                (() => {
                                  const row = agentSettingsTestHistoryRowState(entry);
                                  return (
                                    <tr class="border-t border-white/10">
                                      <td class="py-[2px] pr-1.5 text-on-surface-variant/35">
                                        {row.timeLabel}
                                      </td>
                                      <td class="max-w-[72px] truncate py-[2px] pr-1.5 text-on-surface-variant/50">
                                        {row.modelLabel}
                                      </td>
                                      <td class="py-[2px] pr-1.5 text-right text-on-surface-variant/50">
                                        {row.durationLabel}
                                      </td>
                                      <td class={`py-[2px] text-right font-semibold ${row.statusClass}`}>
                                        {row.statusLabel}
                                      </td>
                                    </tr>
                                  );
                                })()
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
                    {(receipt) => (
                      <NoticeBox
                        role="alert"
                        ariaLive="assertive"
                        ariaAtomic={true}
                        class={`border px-3 py-2 text-xs ${
                          receipt().tone === "danger"
                            ? "border-red-300/60 bg-red-50/70 text-red-900"
                            : "border-amber-300/60 bg-amber-50/70 text-amber-900"
                        }`}
                      >
                        <p class="font-semibold">{receipt().title}</p>
                        <p class="mt-1">{receipt().summary}</p>
                        <p class="mt-1">{receipt().nextStep}</p>
                      </NoticeBox>
                    )}
                  </Show>
                  <Show when={!llmError() && llmLoadError()}>
                    {(receipt) => (
                      <NoticeBox
                        role="alert"
                        ariaLive="assertive"
                        ariaAtomic={true}
                        class={`border px-3 py-2 text-xs ${
                          receipt().tone === "danger"
                            ? "border-red-300/60 bg-red-50/70 text-red-900"
                            : "border-amber-300/60 bg-amber-50/70 text-amber-900"
                        }`}
                      >
                        <p class="font-semibold">{receipt().title}</p>
                        <p class="mt-1">{receipt().summary}</p>
                        <p class="mt-1">{receipt().nextStep}</p>
                      </NoticeBox>
                    )}
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
                          class={`text-xs ${
                            result.ok
                              ? "text-green-600"
                              : result.receipt?.tone === "danger"
                                ? "text-red-600"
                                : "text-amber-700"
                          }`}
                        >
                          <span class="block font-medium">
                            {result.ok ? `Connected to ${targetLabel}` : result.receipt?.title ?? "Connection failed"}
                          </span>
                          <Show when={!result.ok && result.receipt}>
                            <div class="mt-1">
                              <p class="font-normal leading-5">{result.receipt!.summary}</p>
                              <p class="mt-1 text-[11px] opacity-80">{result.receipt!.nextStep}</p>
                            </div>
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
                {(receipt) => (
                  <NoticeBox
                    role="alert"
                    ariaLive="assertive"
                    ariaAtomic={true}
                    class={`mb-3 border px-3 py-2 text-xs ${
                      receipt().tone === "danger"
                        ? "border-red-300/60 bg-red-50/70 text-red-900"
                        : "border-amber-300/60 bg-amber-50/70 text-amber-900"
                    }`}
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="font-semibold">{receipt().title}</p>
                        <p class="mt-1">{receipt().summary}</p>
                        <p class="mt-1">{receipt().nextStep}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCapActionError(null)}
                        class="font-medium underline underline-offset-2"
                      >
                        Dismiss
                      </button>
                    </div>
                  </NoticeBox>
                )}
              </Show>
              <Show when={capLoadError()}>
                {(receipt) => (
                  <NoticeBox
                    role="alert"
                    ariaLive="assertive"
                    ariaAtomic={true}
                    class={`mb-3 border px-3 py-2 text-xs ${
                      receipt().tone === "danger"
                        ? "border-red-300/60 bg-red-50/70 text-red-900"
                        : "border-amber-300/60 bg-amber-50/70 text-amber-900"
                    }`}
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="font-semibold">{receipt().title}</p>
                        <p class="mt-1">{receipt().summary}</p>
                        <p class="mt-1">{receipt().nextStep}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void refreshCapabilities()}
                        class="font-medium underline underline-offset-2"
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

              <Show when={capImportError()}>
                {(receipt) => (
                  <NoticeBox
                    role="alert"
                    ariaLive="assertive"
                    ariaAtomic={true}
                    class={`mt-2 text-xs ${receipt().tone === "danger" ? "text-red-600" : "text-amber-700"}`}
                  >
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div class="min-w-0">
                        <p class="font-semibold">{receipt().title}</p>
                        <p class="mt-1">{receipt().summary}</p>
                        <p class="mt-1 text-[11px] opacity-80">Next step: {receipt().nextStep}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCapImportError(null)}
                        class={`font-medium underline underline-offset-2 ${
                          receipt().tone === "danger" ? "text-red-600" : "text-amber-700"
                        }`}
                      >
                        Dismiss
                      </button>
                    </div>
                  </NoticeBox>
                )}
              </Show>
              <Show when={capImportSuccess()}>
                {(message) => (
                  <NoticeBox role="status" ariaLive="polite" ariaAtomic={true} class="mt-2 text-xs font-medium text-green-600">
                    {message()}
                  </NoticeBox>
                )}
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
                    {(cap) => {
                      const usageState = () => capabilityUsageViewById()[cap.id] ?? EMPTY_CAPABILITY_USAGE_CARD_STATE;
                      return (
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
                          <Show when={usageState().usageSummary}>
                            <p class="mt-0.5 font-mono text-[0.55em] text-on-surface-variant/30">
                              {usageState().usageSummary}
                            </p>
                          </Show>
                          <Show when={usageState().dowBars.length > 0}>
                            <div class="mt-0.5 flex items-end gap-[2px]" title="Usage by day of week (Sun-Sat)">
                              <For each={usageState().dowBars}>
                                {(bar) => (
                                  <div class="flex flex-col items-center gap-[1px]">
                                    <div
                                      class="w-[5px] rounded-sm transition-all"
                                      style={`height: ${bar.height}px; background: ${bar.active ? "rgba(49,86,142,0.4)" : "rgba(0,0,0,0.06)"}`}
                                      title={`${bar.label}: ${bar.count}`}
                                    />
                                    <span class="font-mono text-[0.4em] text-on-surface-variant/20">{bar.label}</span>
                                  </div>
                                )}
                              </For>
                            </div>
                          </Show>
                          <Show when={usageState().staleSummary}>
                            {(summary) => (
                              <p class="mt-0.5 font-mono text-[0.52em] text-amber-500/50">
                                {summary()}
                              </p>
                            )}
                          </Show>
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
                    )}}
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
                    <Show when={runtimeRecoveryPacketPreviewState().operationalGuidanceCard}>
                      {(card) => (
                        <div class="mt-3 rounded-lg border border-amber-300/70 bg-amber-50/85 px-3 py-3">
                          <div class="flex items-center gap-2">
                            <EyebrowLabel class="text-amber-900/75">{card().title}</EyebrowLabel>
                            <InfoHint text="This operator gate comes from the latest production go/no-go artifact. It only appears here when operational-history cleanup is the active blocker." />
                          </div>
                          <TextLineList
                            lines={card().lines}
                            class="mt-2 space-y-1"
                            lineClass="text-[11px] text-amber-950/85"
                          />
                          <Show when={runtimeRecoveryPacketPreviewState().operationalGuidanceCommand}>
                            {(command) => (
                              <code class="mt-2 block whitespace-pre-wrap break-all rounded border border-amber-200/80 bg-white/70 px-2 py-2 text-[11px] text-amber-950">
                                {command()}
                              </code>
                            )}
                          </Show>
                        </div>
                      )}
                    </Show>
                    <SummaryRows
                      items={runtimeOperationsOverviewRows(
                        runtimeDeploymentState(),
                        runtimeUpdatesState(),
                        props.simulatorRuntimeSummary,
                      )}
                      class="mt-3 space-y-2 text-xs text-on-surface-variant"
                    />
                    <Show when={runtimeDeploymentHostedCardState().workspacePath}>
                      <p class="mt-3 break-all rounded-lg border border-violet-200/60 bg-white/60 px-3 py-2 font-mono text-[11px] text-on-surface-variant">
                        {runtimeDeploymentHostedCardState().workspacePath}
                      </p>
                    </Show>
                    <Show when={runtimeDeploymentHostedCardState().gui}>
                      <div class="mt-3 rounded-lg border border-violet-200/60 bg-white/60 px-3 py-2 text-[11px] text-on-surface-variant">
                        <span class="font-medium text-on-surface">GUI:</span> {runtimeDeploymentHostedCardState().gui}
                      </div>
                    </Show>
                    <Show when={runtimeDeploymentHostedCardState().monitorCard}>
                      {(monitorCard) => (
                      <div class="mt-3 rounded-lg border border-violet-200/60 bg-white/60 px-3 py-3">
                        <div class="flex items-center gap-2">
                          <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60">
                            Live runtime monitor
                          </p>
                          <InfoHint text="Recent heartbeat/status lines from the deployed runtime monitor. This is hosted runtime telemetry, not browser-side application logging." />
                        </div>
                        <p class="mt-2 text-[11px] font-semibold text-on-surface">
                          {monitorCard().statusLine}
                        </p>
                        <p class="mt-1 text-[11px] text-on-surface-variant">
                          {monitorCard().updatedLine}
                        </p>
                        <p class="mt-1 text-[11px] text-on-surface-variant">
                          {monitorCard().relativeLine}
                        </p>
                        <div class="mt-2 space-y-1">
                          <For each={monitorCard().lines}>
                            {(line) => (
                              <p class="rounded border border-white/30 bg-white/60 px-2 py-1 font-mono text-[10px] text-on-surface-variant">
                                {line}
                              </p>
                            )}
                          </For>
                        </div>
                      </div>
                      )}
                    </Show>
                    <Show when={runtimeDeploymentHostedCardState().statusPanelLines.length > 0}>
                      <div class="mt-3 rounded-lg border border-violet-200/60 bg-white/60 px-3 py-3">
                        <div class="flex items-center gap-2">
                          <EyebrowLabel>Runtime status panel</EyebrowLabel>
                          <InfoHint text="Structured runtime health fields exposed by the hosted runtime for quick inspection of readiness, drift, and deployment state." />
                        </div>
                        <TextLineList
                          class="mt-2 space-y-1"
                          lineClass="rounded border border-white/30 bg-white/60 px-2 py-1 font-mono text-[10px] text-on-surface-variant"
                          lines={runtimeDeploymentHostedCardState().statusPanelLines}
                        />
                      </div>
                    </Show>
                    <Show when={runtimeDeploymentHostedCardState().statusViewLabels.length > 0}>
                      <div class="mt-3 rounded-lg border border-violet-200/60 bg-white/60 px-3 py-3">
                        <div class="flex items-center gap-2">
                          <EyebrowLabel>Status view formats</EyebrowLabel>
                          <InfoHint text="The named runtime status views currently published by the deployment, such as dashboard, monitor, or compact ops summaries." />
                        </div>
                        <SummaryChipList
                          class="mt-2 flex flex-wrap gap-2"
                          items={runtimeDeploymentHostedCardState().statusViewLabels}
                        />
                      </div>
                    </Show>
                    <ActionRow class="mt-3 grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => void handleCheckRuntimeUpdates()}
                        disabled={!runtimeUpdatesActionView().canCheck}
                        aria-busy={runtimeUpdatesActionView().checkBusy}
                        aria-disabled={!runtimeUpdatesActionView().canCheck}
                        class="rounded-lg border border-violet-300/60 bg-white/70 px-3 py-2 text-xs font-medium text-on-surface transition hover:bg-white disabled:opacity-50"
                      >
                        {runtimeUpdatesActionView().checkLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleApplyRuntimeUpdate()}
                        disabled={!runtimeUpdatesActionView().canApply}
                        aria-busy={runtimeUpdatesActionView().applyBusy}
                        aria-disabled={!runtimeUpdatesActionView().canApply}
                        class="rounded-lg border border-violet-300/60 bg-violet-600 px-3 py-2 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
                      >
                        {runtimeUpdatesActionView().applyLabel}
                      </button>
                    </ActionRow>
                    <Show when={runtimeUpdateEntriesState().length > 0}>
                      <div class="mt-3">
                        <div class="flex items-center gap-2">
                          <EyebrowLabel>Recent update events</EyebrowLabel>
                          <InfoHint text="Recent check/apply events for the hosted runtime, including the version movement and any notes attached to the update attempt." />
                        </div>
                        <div class="mt-2 space-y-2">
                          <For each={runtimeUpdateEventCards(runtimeUpdatesState())}>
                            {(entry) => (
                              <div class="rounded-lg border border-violet-200/60 bg-white/60 px-3 py-2">
                                <p class="text-[11px] font-semibold text-on-surface">
                                  {entry.title}
                                </p>
                                <p class="mt-1 text-[11px] text-on-surface-variant">
                                  {entry.versionSummary}
                                </p>
                                <p class="mt-1 text-[11px] text-on-surface-variant">
                                  {entry.relativeCreatedAt}
                                </p>
                                <Show when={entry.noteChips.length > 0}>
                                  <SummaryChipList
                                    class="mt-2 flex flex-wrap gap-2"
                                    items={entry.noteChips}
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
                    <Show when={supportAccessBoundaryCard().reason}>
                      <NoticeBox class="mt-3 rounded-lg border border-rose-200/60 bg-white/60 px-3 py-2 text-[11px] leading-5 text-on-surface-variant">
                        {supportAccessBoundaryCard().reason}
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
                          value={String(runtimeBackupsRetentionDays(runtimeBackupsState(), 14))}
                          disabled={runtimeBackupControlsView().controlsDisabled}
                          aria-busy={runtimeBackupControlsView().retentionBusy}
                          aria-disabled={runtimeBackupControlsView().controlsDisabled}
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
                          disabled={runtimeBackupControlsView().controlsDisabled}
                          aria-busy={runtimeBackupControlsView().snapshotBusy}
                          aria-disabled={runtimeBackupControlsView().controlsDisabled}
                          class="rounded-lg border border-amber-300/60 bg-amber-500 px-3 py-2 text-xs font-medium text-white transition hover:bg-amber-600 disabled:opacity-50"
                        >
                          {runtimeBackupControlsView().snapshotLabel}
                        </button>
                      </div>
                    </div>
                    <Show when={hasRuntimeBackupEntries()}>
                      <div class="mt-3 space-y-2">
                        <For each={runtimeBackupPreviewCardList()}>
                          {(card) => (
                            <div class="rounded-lg border border-amber-200/60 bg-white/60 px-3 py-2">
                              <p id="runtime-backup-manifest-review-title" class="text-[11px] font-semibold text-on-surface">
                                {card.title}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {card.rehearsalLine}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {card.createdExpiresLine}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {card.relativeExpiryLine}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {card.fileCountLine}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {card.footprintLine}
                              </p>
                              <Show when={card.manifestChips.length > 0}>
                                <SummaryChipList
                                  class="mt-2 flex flex-wrap gap-2"
                                  items={card.manifestChips}
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
                          const latestBackupId = latestRuntimeBackupId();
                          if (!latestBackupId) return;
                          void handleReviewRuntimeBackupManifest(latestBackupId);
                        }}
                        disabled={runtimeBackupControlsView().manifestReviewDisabled}
                        aria-expanded={runtimeBackupManifest() !== null}
                        aria-controls="runtime-backup-manifest-review"
                        class="rounded-lg border border-amber-200/70 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-on-surface transition hover:bg-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                      >
                        {runtimeBackupControlsView().manifestReviewLabel}
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
                                {runtimeBackupManifestReviewCard().title}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {runtimeBackupManifestReviewCard().lifecycleLine}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {runtimeBackupManifestReviewCard().relativeLifecycleLine}
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
                            lines={runtimeBackupManifestReviewCard().manifestLines}
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
                    <Show when={hasRuntimeRestoreDrillEntries()}>
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
                            const latestBackupId = latestRuntimeBackupId();
                            if (!latestBackupId) return;
                            void handleCreateRestoreDrill(latestBackupId);
                          }}
                          disabled={runtimeBackupControlsView().drillDisabled}
                          aria-busy={runtimeBackupControlsView().drillBusy}
                          aria-disabled={runtimeBackupControlsView().drillDisabled}
                          class="rounded-lg border border-emerald-300/60 bg-white/70 px-3 py-2 text-xs font-medium text-on-surface transition hover:bg-white disabled:opacity-50"
                        >
                          {runtimeBackupControlsView().drillLabel}
                        </button>
                      </div>
                    </ActionRow>
                    <Show
                      when={hasRuntimeRestoreDrillEntries()}
                      fallback={
                        <NoticeBox class="mt-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2 text-xs text-on-surface-variant">
                          No restore drills have been recorded yet.
                        </NoticeBox>
                      }
                    >
                      <div class="mt-3 space-y-2">
                        <For each={runtimeRestoreDrillPreviewCardList()}>
                          {(card) => (
                            <div class="rounded-lg border border-emerald-200/60 bg-white/60 px-3 py-2">
                              <p class="text-[11px] font-semibold text-on-surface">
                                {card.statusLabel}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {card.timingLine}
                              </p>
                              <p class="mt-1 text-[11px] text-on-surface-variant">
                                {card.relativeTimingLine}
                              </p>
                              <Show when={card.noteChips.length > 0}>
                                <SummaryChipList
                                  class="mt-2 flex flex-wrap gap-1"
                                  itemClass="rounded-full border border-emerald-200/60 bg-emerald-100/70 px-2 py-0.5 font-mono text-[10px] text-emerald-900/80"
                                  items={card.noteChips}
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
                      value={deviceSyncProvisionedLabel(props.deviceSyncRuntimeSummary, devicePolicies())}
                    />
                    <MetricCard
                      label="Used"
                      value={deviceSyncUsedLabel(props.deviceSyncRuntimeSummary, devicePolicies())}
                    />
                    <MetricCard
                      label="Local keys"
                      value={deviceSyncLocalKeysLabel(props.deviceSyncRuntimeSummary, devicePolicies())}
                    />
                  </div>
                  <Show when={deviceSyncRuntimeHasSummary(props.deviceSyncRuntimeSummary)}>
                    <div class="mt-3 grid gap-2 lg:grid-cols-2">
                      <div class="rounded-lg border border-white/40 bg-white/50 px-3 py-2">
                        <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60">By device class</p>
                        <p class="mt-1 text-sm font-semibold text-on-surface">
                          {deviceSyncRuntimeSummaryCard().classBreakdownLabel}
                        </p>
                      </div>
                      <div class="rounded-lg border border-white/40 bg-white/50 px-3 py-2">
                        <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60">Latest policy activity</p>
                        <p class="mt-1 text-sm font-semibold text-on-surface">
                          {deviceSyncRuntimeSummaryCard().latestActivityLabel}
                        </p>
                        <p class="mt-1 text-[11px] text-on-surface-variant">
                          {deviceSyncRuntimeSummaryCard().latestDeviceLabel}
                        </p>
                        <p class="mt-1 text-[11px] text-on-surface-variant">
                          {deviceSyncRuntimeSummaryCard().latestLastUsedLine}
                        </p>
                        <p class="mt-1 text-[11px] text-on-surface-variant">
                          {deviceSyncRuntimeSummaryCard().latestLastUsedRelativeLine}
                        </p>
                      </div>
                    </div>
                  </Show>
                  <Show when={deviceSyncRuntimeSummaryCard().latestPolicyNote}>
                    <NoticeBox class="mt-3 rounded-lg border border-indigo-200/60 bg-white/60 px-3 py-2 text-[11px] leading-5 text-on-surface-variant">
                      {deviceSyncRuntimeSummaryCard().latestPolicyNote}
                    </NoticeBox>
                  </Show>
                  <Show when={runtimeUpdatePolicyState()}>
                    <div class="mt-3 grid gap-2 lg:grid-cols-2">
                      <label class="block text-[11px] font-medium text-on-surface-variant">
                        <span class="flex items-center gap-1.5">
                          Update channel
                          <InfoHint text="Controls whether this runtime follows the normal stable release track or waits for explicitly manual updates only." />
                        </span>
                        <select
                          value={runtimeUpdatesPolicyView().updateChannel}
                          disabled={runtimeUpdatesBusy() !== null}
                          aria-busy={runtimeUpdatesBusy() !== null}
                          aria-disabled={runtimeUpdatesBusy() !== null}
                          onChange={(event) =>
                            void handleRuntimeUpdatePolicyChange({
                              update_channel: event.currentTarget.value as "stable" | "manual_only",
                              auto_apply: runtimeUpdatesPolicyView().autoApply as "manual_only" | "scaffold_refresh_only",
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
                          value={runtimeUpdatesPolicyView().autoApply}
                          disabled={runtimeUpdatesBusy() !== null}
                          aria-busy={runtimeUpdatesBusy() !== null}
                          aria-disabled={runtimeUpdatesBusy() !== null}
                          onChange={(event) =>
                            void handleRuntimeUpdatePolicyChange({
                              update_channel: runtimeUpdatesPolicyView().updateChannel as "stable" | "manual_only",
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
                      {runtimeUpdatesPolicyView().supportPostureLine}
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
                      disabled={runtimeRecoveryPacketControlsView().disabled}
                      aria-busy={runtimeRecoveryPacketControlsView().busy}
                      aria-disabled={runtimeRecoveryPacketControlsView().disabled}
                      aria-expanded={runtimeRecoveryPreviewOpen()}
                      aria-controls="runtime-recovery-packet-preview"
                      class="rounded-lg border border-indigo-300/60 bg-white/70 px-3 py-2 text-xs font-medium text-on-surface transition hover:bg-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {runtimeRecoveryPacketControlsView().previewLabel}
                    </button>
                    <button
                      ref={runtimeRecoveryDownloadTriggerRef}
                      type="button"
                      onClick={() => void handleDownloadRecoveryPacket()}
                      disabled={runtimeRecoveryPacketControlsView().disabled}
                      aria-busy={runtimeRecoveryPacketControlsView().busy}
                      aria-disabled={runtimeRecoveryPacketControlsView().disabled}
                      class="rounded-lg border border-indigo-300/60 bg-white/70 px-3 py-2 text-xs font-medium text-on-surface transition hover:bg-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {runtimeRecoveryPacketControlsView().downloadLabel}
                    </button>
                  </ActionRow>
                  <Show when={runtimeRecoveryPreviewOpen() && runtimeRecoveryPacket()}>
                      <div
                        id="runtime-recovery-packet-preview"
                        role="region"
                        aria-labelledby="runtime-recovery-packet-preview-title"
                        class="mt-3 rounded-xl border border-indigo-200/60 bg-white/70 p-4"
                      >
                        <div class="flex items-start justify-between gap-3">
                          <div>
                            <p id="runtime-recovery-packet-preview-title" class="text-sm font-semibold text-on-surface">
                              {runtimeRecoveryPacketPreviewState().title}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              {runtimeRecoveryPacketPreviewState().subtitle}
                            </p>
                            <p class="mt-1 text-[11px] text-on-surface-variant">
                              {runtimeRecoveryPacketPreviewState().relativeGeneratedAt}
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
                            label={runtimeRecoveryPacketPreviewState().accountCard.label}
                            value={runtimeRecoveryPacketPreviewState().accountCard.value}
                            lines={runtimeRecoveryPacketPreviewState().accountCard.lines}
                          />
                          <For each={runtimeRecoveryPacketPreviewState().metricCards}>
                            {(card) => (
                              <MetricCard
                                class="rounded-lg border border-white/30 bg-white/60 px-3 py-2"
                                label={card.label}
                                value={card.value}
                                lines={card.lines}
                              />
                            )}
                          </For>
                        </div>
                        <Show when={runtimeRecoveryPacketPreviewState().deploymentCard}>
                          {(card) => (
                            <MetricCard
                              class="mt-3 rounded-lg border border-white/30 bg-white/60 px-3 py-2"
                              label={card().label}
                              value={card().value}
                              lines={card().lines}
                            />
                          )}
                        </Show>
                        <div class="mt-3 grid gap-2 md:grid-cols-2">
                          <For each={runtimeRecoveryPacketPreviewState().policyCards}>
                            {(card) => (
                              <DetailCard title={card.title}>
                                <TextLineList
                                  lines={card.lines}
                                  class="mt-2 space-y-1"
                                  lineClass="text-[11px] text-on-surface-variant"
                                />
                              </DetailCard>
                            )}
                          </For>
                        </div>
                        <Show when={runtimeRecoveryPacketPreviewState().operationalGuidanceCard}>
                          {(card) => (
                            <DetailCard class="mt-3" title={card().title}>
                              <TextLineList
                                lines={card().lines}
                                class="mt-2 space-y-1"
                                lineClass="text-[11px] text-on-surface-variant"
                              />
                            </DetailCard>
                          )}
                        </Show>
                        <Show when={runtimeRecoveryPacketPreviewState().operationalGuidanceCommand}>
                          {(command) => (
                            <div class="mt-3 rounded-lg border border-amber-200/70 bg-amber-50/80 px-3 py-3">
                              <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-900/80">
                                Recorded operator command
                              </p>
                              <code class="mt-2 block whitespace-pre-wrap break-all text-[11px] text-amber-950">
                                {command()}
                              </code>
                            </div>
                          )}
                        </Show>
                        <div class="mt-3 grid gap-4 lg:grid-cols-2">
                          <DetailCard title="Recovery checklist">
                            <TextLineList lines={runtimeRecoveryPacketPreviewState().recoveryChecklist} />
                          </DetailCard>
                          <DetailCard title="Privacy notes">
                            <TextLineList lines={runtimeRecoveryPacketPreviewState().privacyNotes} />
                          </DetailCard>
                        </div>
                      </div>
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
                      {(entry, index) => {
                        const card = () => devicePolicyCardStatesState()[index()]!;
                        const updating = () => devicePolicyUpdatingId() === entry.device_id;
                        return (
                          <div class="rounded-xl border border-white/20 bg-white/10 p-4">
                            <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                              <div class="min-w-0">
                                <p class="text-sm font-semibold text-on-surface">{card().deviceId}</p>
                                <p class="mt-1 text-xs text-on-surface-variant">
                                  {card().deviceClassLine}
                                </p>
                                <p class="mt-1 text-[11px] text-on-surface-variant">
                                  {card().lastUsedLine}
                                </p>
                                <p class="mt-1 text-[11px] text-on-surface-variant">
                                  {card().policyUpdatedLine}
                                </p>
                                <p class="mt-1 text-[11px] text-on-surface-variant">
                                  {card().bundledUpdatedLine}
                                </p>
                                <Show when={card().policyNote}>
                                  <NoticeBox class="mt-2 text-[11px] leading-5 text-on-surface-variant">{card().policyNote}</NoticeBox>
                                </Show>
                                <SummaryChipList
                                  class="mt-2 flex flex-wrap gap-2"
                                  itemClass="rounded-full border border-white/30 bg-white/50 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-on-surface-variant"
                                  items={card().profileChips}
                                />
                                <Show when={card().sourceChips.length > 0}>
                                  <SummaryChipList
                                    class="mt-2 flex flex-wrap gap-2"
                                    items={card().sourceChips}
                                  />
                                </Show>
                                <Show when={card().policyDetailChips.length > 0}>
                                  <div class="mt-2 space-y-1">
                                    <EyebrowLabel>Policy detail</EyebrowLabel>
                                    <SummaryChipList items={card().policyDetailChips} />
                                  </div>
                                </Show>
                                <Show when={card().syncScopeChips.length > 0}>
                                  <div class="mt-2 space-y-1">
                                    <EyebrowLabel>Sync scope</EyebrowLabel>
                                    <SummaryChipList items={card().syncScopeChips} />
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
                    <Show when={devicePolicyActionError()}>
                      {(receipt) => (
                        <NoticeBox
                          role="alert"
                          ariaLive="assertive"
                          ariaAtomic={true}
                          class={`rounded-lg border px-3 py-2 text-xs ${
                            receipt().tone === "danger"
                              ? "border-red-300/60 bg-red-50/70 text-red-900"
                              : "border-amber-300/60 bg-amber-50/70 text-amber-900"
                          }`}
                        >
                          <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                              <p class="font-semibold">{receipt().title}</p>
                              <p class="mt-1">{receipt().summary}</p>
                              <p class="mt-1">{receipt().nextStep}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setDevicePolicyActionError(null)}
                              class="font-medium underline underline-offset-2"
                            >
                              Dismiss
                            </button>
                          </div>
                        </NoticeBox>
                      )}
                    </Show>
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
                  class="rounded-xl border border-fuchsia-200/40 bg-fuchsia-50/40 p-4"
                  title="Simulator Rollout"
                  description="Inspect the bounded simulator rollout posture that shapes preparation and calibration before workflow, watcher, and synthesizer changes are promoted into broader runtime behavior."
                >
                  <div class="mt-3 flex items-center gap-2">
                    <EyebrowLabel class="text-[11px]">Bounded rollout state</EyebrowLabel>
                    <InfoHint text="These values summarize which internal surfaces currently run with simulator support, which ones are still sampled or review-gated, and how calibration is configured per surface." />
                  </div>
                  <div class="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                      label="Highest stage"
                      value={simulatorRuntimeSummaryCard().highestRolloutStageLabel}
                    />
                    <MetricCard
                      label="Enabled"
                      value={simulatorRuntimeSummaryCard().enabledSurfacesLabel}
                    />
                    <MetricCard
                      label="Promotion"
                      value={simulatorRuntimeSummaryCard().promotionSurfacesLabel}
                    />
                    <MetricCard
                      label="Review / sampled"
                      value={simulatorRuntimeSummaryCard().reviewSurfacesLabel}
                      lines={[simulatorRuntimeSummaryCard().sampledSurfacesLabel]}
                    />
                  </div>
                  <Show
                    when={simulatorRuntimeHasSummary(props.simulatorRuntimeSummary)}
                    fallback={
                      <NoticeBox class="mt-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2 text-xs text-on-surface-variant">
                        No simulator rollout summary is available in the current bootstrap payload.
                      </NoticeBox>
                    }
                  >
                    <div class="mt-3 grid gap-3 lg:grid-cols-2">
                      <div class="rounded-lg border border-white/40 bg-white/50 px-3 py-3">
                        <EyebrowLabel>Surface rollout stages</EyebrowLabel>
                        <Show
                          when={simulatorRuntimeSummaryCard().surfaceStageChips.length > 0}
                          fallback={
                            <p class="mt-2 text-[11px] text-on-surface-variant">
                              No rollout stages were reported for simulator-backed surfaces.
                            </p>
                          }
                        >
                          <SummaryChipList class="mt-2 flex flex-wrap gap-2" items={simulatorRuntimeSummaryCard().surfaceStageChips} />
                        </Show>
                      </div>
                      <div class="rounded-lg border border-white/40 bg-white/50 px-3 py-3">
                        <EyebrowLabel>Calibration modes</EyebrowLabel>
                        <Show
                          when={simulatorRuntimeSummaryCard().calibrationModeChips.length > 0}
                          fallback={
                            <p class="mt-2 text-[11px] text-on-surface-variant">
                              No calibration modes were reported for simulator-backed surfaces.
                            </p>
                          }
                        >
                          <SummaryChipList class="mt-2 flex flex-wrap gap-2" items={simulatorRuntimeSummaryCard().calibrationModeChips} />
                        </Show>
                      </div>
                    </div>
                    <Show when={simulatorRuntimeSummaryCard().rolloutTrustLines.length > 0}>
                      <div class="mt-3 rounded-lg border border-white/40 bg-white/50 px-3 py-3">
                        <EyebrowLabel>Rollout trust</EyebrowLabel>
                        <TextLineList
                          lines={simulatorRuntimeSummaryCard().rolloutTrustLines}
                          class="mt-2 space-y-1"
                          lineClass="rounded border border-white/30 bg-white/60 px-2 py-1 text-[11px] text-on-surface-variant break-words"
                        />
                      </div>
                    </Show>
                    <Show when={simulatorRuntimeSummaryCard().observedSummaryLines.length > 0}>
                      <div class="mt-3 rounded-lg border border-white/40 bg-white/50 px-3 py-3">
                        <EyebrowLabel>Latest observed simulation</EyebrowLabel>
                        <TextLineList
                          lines={simulatorRuntimeSummaryCard().observedSummaryLines}
                          class="mt-2 space-y-1"
                          lineClass="rounded border border-white/30 bg-white/60 px-2 py-1 text-[11px] text-on-surface-variant break-words"
                        />
                      </div>
                    </Show>
                    <Show when={simulatorRuntimeSummaryCard().policySummaryLines.length > 0}>
                      <div class="mt-3 rounded-lg border border-white/40 bg-white/50 px-3 py-3">
                        <EyebrowLabel>Policy posture</EyebrowLabel>
                        <TextLineList
                          lines={simulatorRuntimeSummaryCard().policySummaryLines}
                          class="mt-2 space-y-1"
                          lineClass="rounded border border-white/30 bg-white/60 px-2 py-1 text-[11px] text-on-surface-variant break-words"
                        />
                      </div>
                    </Show>
                    <Show when={simulatorRuntimeSummaryCard().calibrationNoteLines.length > 0}>
                      <div class="mt-3 rounded-lg border border-white/40 bg-white/50 px-3 py-3">
                        <EyebrowLabel>Calibration notes</EyebrowLabel>
                        <TextLineList
                          lines={simulatorRuntimeSummaryCard().calibrationNoteLines}
                          class="mt-2 space-y-1"
                          lineClass="rounded border border-white/30 bg-white/60 px-2 py-1 text-[11px] text-on-surface-variant break-words"
                        />
                      </div>
                    </Show>
                  </Show>
                </SectionCard>

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
                    when={agentSettingsHasSupportAccessHistory(supportAccessHistoryCardList())}
                    fallback={
                      <NoticeBox class="mt-3 rounded-lg border border-white/40 bg-white/50 px-3 py-2 text-xs text-on-surface-variant">
                        No support access history has been recorded yet.
                      </NoticeBox>
                    }
                  >
                    <div class="mt-3 space-y-2">
                      <For each={supportAccessHistoryCardList()}>
                        {(card) => (
                          <div class="rounded-lg border border-slate-200/60 bg-white/60 px-3 py-2">
                            <p class="text-[11px] font-semibold text-on-surface">
                              {card.title}
                            </p>
                            <TextLineList
                              lines={card.lines}
                              class="mt-1"
                              lineClass="text-[11px] text-on-surface-variant"
                            />
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </SectionCard>
                <Show when={runtimeActionError()}>
                  {(receipt) => (
                    <NoticeBox
                      role="alert"
                      ariaLive="assertive"
                      ariaAtomic={true}
                      class={`rounded-lg border px-3 py-2 text-xs ${
                        receipt().tone === "danger"
                          ? "border-red-300/60 bg-red-50/70 text-red-900"
                          : "border-amber-300/60 bg-amber-50/70 text-amber-900"
                      }`}
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                          <p class="font-semibold">{receipt().title}</p>
                          <p class="mt-1">{receipt().summary}</p>
                          <p class="mt-1">{receipt().nextStep}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRuntimeActionError(null)}
                          class="font-medium underline underline-offset-2"
                        >
                          Dismiss
                        </button>
                      </div>
                    </NoticeBox>
                  )}
                </Show>
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
              <Show when={sovereignDataExportError()}>
                {(receipt) => (
                  <NoticeBox
                    role="alert"
                    ariaLive="assertive"
                    ariaAtomic={true}
                    class={`mt-3 text-xs ${receipt().tone === "danger" ? "text-red-600" : "text-amber-700"}`}
                  >
                    <div class="flex flex-wrap items-center justify-between gap-3">
                      <div class="min-w-0">
                        <p class="font-semibold">{receipt().title}</p>
                        <p class="mt-1">{receipt().summary}</p>
                        <p class="mt-1 text-[11px] opacity-80">Next step: {receipt().nextStep}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSovereignDataExportError(null)}
                        class={`font-medium underline underline-offset-2 ${
                          receipt().tone === "danger" ? "text-red-600" : "text-amber-700"
                        }`}
                      >
                        Dismiss
                      </button>
                    </div>
                  </NoticeBox>
                )}
              </Show>
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
          {(receipt) => (
            <NoticeBox
              role="alert"
              ariaLive="assertive"
              ariaAtomic={true}
              class={`mb-3 text-xs ${receipt().tone === "danger" ? "text-red-600" : "text-amber-700"}`}
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="font-semibold">{receipt().title}</p>
                  <p class="mt-1">{receipt().summary}</p>
                  <p class="mt-1 text-[11px] opacity-80">Next step: {receipt().nextStep}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIdentityCardExportError(null)}
                  class={`font-medium underline underline-offset-2 ${
                    receipt().tone === "danger" ? "text-red-600" : "text-amber-700"
                  }`}
                >
                  Dismiss
                </button>
              </div>
            </NoticeBox>
          )}
        </Show>
        <button
          type="button"
          onClick={exportIdentityCard}
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
            setSoulSaveError(null);
          }
        }}
        onClose={() => requestCloseSoulEditor()}
        onSave={saveSoulMd}
      />
    </div>
  );
}
