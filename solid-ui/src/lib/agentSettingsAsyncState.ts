// @locs-version: 1.0
import type {
  CapabilityDescriptor,
  DeviceSyncPoliciesResponse,
  DeviceSyncPolicyEntry,
  LlmConfig,
  RuntimeBackupManifestResponse,
  RuntimeBackupsResponse,
  RuntimeRecoveryPacketResponse,
  RuntimeRestoreDrillsResponse,
  RuntimeUpdatesResponse,
} from "@/lib/api";
import type { LatencySnapshot, TestHistoryEntry } from "@/lib/agentSettingsLocalState";
import {
  appendLatencyHistoryEntry,
  loadLatencyHistory,
  loadLastLlmPingAt,
  pushTestHistoryEntry,
  saveLastLlmPingAt,
  saveLastLlmPingOk,
  saveSoulSavedAt,
} from "@/lib/agentSettingsLocalState";
import type { CapabilityImportDescriptor } from "@/lib/agentSettingsCapabilityImportState";
import { parseCapabilityImportFile } from "@/lib/agentSettingsCapabilityImportState";
import {
  buildAgentSettingsCapabilityFailureReceipt,
  type AgentSettingsCapabilityFailureReceipt,
} from "@/lib/agentSettingsCapabilityFailureState";
import {
  buildAgentSettingsDevicePolicyFailureReceipt,
  type AgentSettingsDevicePolicyFailureReceipt,
} from "@/lib/agentSettingsDevicePolicyFailureState";
import {
  buildAgentSettingsIdentityFailureReceipt,
  type AgentSettingsIdentityFailureReceipt,
} from "@/lib/agentSettingsIdentityFailureState";
import {
  buildAgentSettingsIdentityUtilityFailureReceipt,
  type AgentSettingsIdentityUtilityFailureReceipt,
} from "@/lib/agentSettingsIdentityUtilityFailureState";
import {
  buildAgentSettingsLlmFailureReceipt,
  type AgentSettingsLlmFailureReceipt,
} from "@/lib/agentSettingsLlmFailureState";
import {
  buildAgentSettingsRuntimeFailureReceipt,
  type AgentSettingsRuntimeFailureReceipt,
} from "@/lib/agentSettingsRuntimeFailureState";
import {
  buildAgentSettingsSoulFailureReceipt,
  type AgentSettingsSoulFailureReceipt,
} from "@/lib/agentSettingsSoulFailureState";
import type { AgentFleetInstance } from "@/lib/agentFleetResponseState";

export type AgentSettingsEditableLlmBackend = "byok" | "ollama" | "runpod";

export type AgentSettingsLlmHydratedState = {
  config: LlmConfig;
  backend: AgentSettingsEditableLlmBackend;
  provider: string;
  model: string;
  ollamaUrl: string;
};

export type AgentSettingsIdentityLoadResult = {
  instance: AgentFleetInstance | null;
  error: AgentSettingsIdentityFailureReceipt | null;
};

export type AgentSettingsCapabilitiesLoadResult = {
  capabilities: CapabilityDescriptor[];
  error: AgentSettingsCapabilityFailureReceipt | null;
};

export type AgentSettingsCapabilityMutationResult = {
  capabilities: CapabilityDescriptor[];
  error: AgentSettingsCapabilityFailureReceipt | null;
};

export type AgentSettingsCapabilityImportResult = AgentSettingsCapabilityMutationResult & {
  importedCount: number;
};

export type AgentSettingsLlmLoadResult = {
  state: AgentSettingsLlmHydratedState | null;
  error: AgentSettingsLlmFailureReceipt | null;
};

export type AgentSettingsBootstrapLoadResult = {
  instance: AgentFleetInstance | null;
  instanceError: AgentSettingsIdentityFailureReceipt | null;
  capabilities: CapabilityDescriptor[];
  capabilitiesError: AgentSettingsCapabilityFailureReceipt | null;
  llmState: AgentSettingsLlmHydratedState | null;
  llmError: AgentSettingsLlmFailureReceipt | null;
};

export type AgentSettingsLlmPingViewResult = {
  ok: boolean;
  receipt?: AgentSettingsLlmFailureReceipt;
  backend?: string;
  provider?: string;
  httpStatus?: number;
};

export type AgentSettingsLlmPingResult = {
  pingResult: AgentSettingsLlmPingViewResult;
  latencyHistory: LatencySnapshot[];
  testHistory: TestHistoryEntry[];
  lastPingAt: number | null;
  clearResultAfterMs: number | null;
};

export type AgentSettingsClipboardCopyResult<TReceipt> = {
  copied: boolean;
  error: TReceipt | null;
};

export type AgentSettingsSoulSaveResult = {
  instance: AgentFleetInstance | null;
  savedAt: number | null;
  error: AgentSettingsSoulFailureReceipt | null;
};

export type AgentSettingsIdentityUtilityActionResult = {
  error: AgentSettingsIdentityUtilityFailureReceipt | null;
};

export type AgentSettingsDevicePolicyMutationResult = {
  entries: DeviceSyncPolicyEntry[];
  feedback: string | null;
  error: AgentSettingsDevicePolicyFailureReceipt | null;
};

export type AgentSettingsLlmSaveInput = {
  backend: AgentSettingsEditableLlmBackend;
  provider: string;
  model: string;
  apiKey: string;
  ollamaUrl: string;
};

export type AgentSettingsLlmPingApiResponse = {
  ok: boolean;
  backend?: string;
  provider?: string;
  http_status?: number;
  reason?: string;
};

export type AgentSettingsRuntimeBackupsMutationResult = {
  backups: RuntimeBackupsResponse | null;
  feedback: string | null;
  error: AgentSettingsRuntimeFailureReceipt | null;
};

export type AgentSettingsRuntimeRestoreDrillsMutationResult = {
  drills: RuntimeRestoreDrillsResponse | null;
  feedback: string | null;
  error: AgentSettingsRuntimeFailureReceipt | null;
};

export type AgentSettingsRuntimeUpdatesMutationResult = {
  updates: RuntimeUpdatesResponse | null;
  feedback: string | null;
  error: AgentSettingsRuntimeFailureReceipt | null;
};

export type AgentSettingsRuntimeManifestLoadResult = {
  manifest: RuntimeBackupManifestResponse | null;
  feedback: string | null;
  error: AgentSettingsRuntimeFailureReceipt | null;
};

export type AgentSettingsRuntimeRecoveryPacketLoadResult = {
  packet: RuntimeRecoveryPacketResponse | null;
  feedback: string | null;
  error: AgentSettingsRuntimeFailureReceipt | null;
};

function editableLlmBackend(backend: LlmConfig["backend"]): AgentSettingsEditableLlmBackend {
  return backend === "ollama" || backend === "runpod" ? backend : "byok";
}

export function hydrateAgentSettingsLlmState(config: LlmConfig): AgentSettingsLlmHydratedState {
  return {
    config,
    backend: editableLlmBackend(config.backend),
    provider: config.provider,
    model: config.model,
    ollamaUrl: config.ollama_url ?? "http://localhost:11434",
  };
}

export async function loadAgentSettingsIdentityState(
  actionLabel: string,
  loadInstance: () => Promise<AgentFleetInstance | null>,
): Promise<AgentSettingsIdentityLoadResult> {
  try {
    return {
      instance: await loadInstance(),
      error: null,
    };
  } catch (error) {
    return {
      instance: null,
      error: buildAgentSettingsIdentityFailureReceipt(
        actionLabel,
        error instanceof Error ? error.message : "Could not load agent identity.",
      ),
    };
  }
}

export async function loadAgentSettingsCapabilitiesState(
  loadCapabilities: () => Promise<CapabilityDescriptor[]>,
): Promise<AgentSettingsCapabilitiesLoadResult> {
  try {
    return {
      capabilities: await loadCapabilities(),
      error: null,
    };
  } catch (error) {
    return {
      capabilities: [],
      error: buildAgentSettingsCapabilityFailureReceipt(
        "Load capabilities",
        error instanceof Error ? error.message : "Could not load capabilities.",
      ),
    };
  }
}

export async function deleteAgentSettingsCapabilityAndReload(
  capabilityId: string,
  deps: {
    deleteCapability: (id: string) => Promise<unknown>;
    loadCapabilities: () => Promise<CapabilityDescriptor[]>;
  },
): Promise<AgentSettingsCapabilitiesLoadResult> {
  try {
    await deps.deleteCapability(capabilityId);
    return {
      capabilities: await deps.loadCapabilities(),
      error: null,
    };
  } catch (error) {
    return {
      capabilities: [],
      error: buildAgentSettingsCapabilityFailureReceipt(
        "Remove capability",
        error instanceof Error ? error.message : "Could not remove this capability.",
      ),
    };
  }
}

export async function loadAgentSettingsLlmState(
  loadConfig: () => Promise<LlmConfig>,
): Promise<AgentSettingsLlmLoadResult> {
  try {
    return {
      state: hydrateAgentSettingsLlmState(await loadConfig()),
      error: null,
    };
  } catch (error) {
    return {
      state: null,
      error: buildAgentSettingsLlmFailureReceipt(
        "Load model settings",
        error instanceof Error ? error.message : "Could not load model settings.",
      ),
    };
  }
}

export async function loadAgentSettingsBootstrapState(
  deps: {
    loadInstance: () => Promise<AgentFleetInstance | null>;
    loadCapabilities: () => Promise<CapabilityDescriptor[]>;
    loadConfig: () => Promise<LlmConfig>;
  },
): Promise<AgentSettingsBootstrapLoadResult> {
  const [identity, capabilities, llm] = await Promise.all([
    loadAgentSettingsIdentityState("Load agent identity", deps.loadInstance),
    loadAgentSettingsCapabilitiesState(deps.loadCapabilities),
    loadAgentSettingsLlmState(deps.loadConfig),
  ]);

  return {
    instance: identity.instance,
    instanceError: identity.error,
    capabilities: capabilities.capabilities,
    capabilitiesError: capabilities.error,
    llmState: llm.state,
    llmError: llm.error,
  };
}

export async function saveAgentSettingsLlmStateAndReload(
  input: AgentSettingsLlmSaveInput,
  deps: {
    saveConfig: (data: {
      backend: AgentSettingsEditableLlmBackend;
      provider?: string;
      model?: string;
      api_key?: string;
      ollama_url?: string;
    }) => Promise<unknown>;
    loadConfig: () => Promise<LlmConfig>;
  },
): Promise<AgentSettingsLlmLoadResult> {
  try {
    await deps.saveConfig({
      backend: input.backend,
      provider: input.backend === "byok" ? input.provider || undefined : undefined,
      model: input.model || undefined,
      api_key: input.backend === "byok" ? input.apiKey || undefined : undefined,
      ollama_url: input.backend === "ollama" ? input.ollamaUrl || undefined : undefined,
    });
  } catch (error) {
    return {
      state: null,
      error: buildAgentSettingsLlmFailureReceipt(
        "Save model settings",
        error instanceof Error ? error.message : "Save failed",
      ),
    };
  }

  return loadAgentSettingsLlmState(deps.loadConfig);
}

export async function testAgentSettingsLlmConnectionState(
  input: {
    backend: string;
    provider: string;
    model: string;
    userId?: string | null;
    timeoutMs?: number;
  },
  deps: {
    pingConfig: () => Promise<AgentSettingsLlmPingApiResponse>;
    now?: () => number;
    monotonicNow?: () => number;
  },
): Promise<AgentSettingsLlmPingResult> {
  const now = deps.now ?? Date.now;
  const monotonicNow = deps.monotonicNow ?? (() => performance.now());
  const timeoutMs = input.timeoutMs ?? 10_000;
  const startedAt = monotonicNow();
  const pingPromise = deps.pingConfig();

  const outcome = await new Promise<
    | { kind: "success"; value: AgentSettingsLlmPingApiResponse }
    | { kind: "error"; error: unknown }
    | { kind: "timeout" }
  >((resolve) => {
    const timeoutId = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
    void pingPromise.then(
      (value) => {
        clearTimeout(timeoutId);
        resolve({ kind: "success", value });
      },
      (error) => {
        clearTimeout(timeoutId);
        resolve({ kind: "error", error });
      },
    );
  });

  if (outcome.kind === "timeout") {
    saveLastLlmPingOk(false, input.userId);
    const testHistory = pushTestHistoryEntry(
      { ts: now(), model: input.model, ms: null, ok: false, reason: "timeout" },
      input.userId,
    );
    return {
      pingResult: {
        ok: false,
        receipt: buildAgentSettingsLlmFailureReceipt("Test model connection", "Request timed out after 10s"),
        backend: input.backend,
        provider: input.provider,
      },
      latencyHistory: loadLatencyHistory(input.userId),
      testHistory,
      lastPingAt: loadLastLlmPingAt(input.userId),
      clearResultAfterMs: null,
    };
  }

  if (outcome.kind === "error") {
    const reason = outcome.error instanceof Error ? outcome.error.message : "Connection failed";
    saveLastLlmPingOk(false, input.userId);
    const testHistory = pushTestHistoryEntry(
      { ts: now(), model: input.model, ms: null, ok: false, reason },
      input.userId,
    );
    return {
      pingResult: {
        ok: false,
        receipt: buildAgentSettingsLlmFailureReceipt("Test model connection", reason),
        backend: input.backend,
        provider: input.provider,
      },
      latencyHistory: loadLatencyHistory(input.userId),
      testHistory,
      lastPingAt: loadLastLlmPingAt(input.userId),
      clearResultAfterMs: null,
    };
  }

  const latencyMs = Math.round(monotonicNow() - startedAt);
  saveLastLlmPingOk(outcome.value.ok, input.userId);
  const timestamp = now();
  const testHistory = pushTestHistoryEntry(
    {
      ts: timestamp,
      model: input.model,
      ms: outcome.value.ok ? latencyMs : null,
      ok: outcome.value.ok,
      reason: outcome.value.reason,
    },
    input.userId,
  );

  if (!outcome.value.ok) {
    return {
      pingResult: {
        ok: false,
        receipt: outcome.value.reason
          ? buildAgentSettingsLlmFailureReceipt("Test model connection", outcome.value.reason)
          : undefined,
        backend: outcome.value.backend,
        provider: outcome.value.provider,
        httpStatus: outcome.value.http_status,
      },
      latencyHistory: loadLatencyHistory(input.userId),
      testHistory,
      lastPingAt: loadLastLlmPingAt(input.userId),
      clearResultAfterMs: null,
    };
  }

  const lastPingAt = saveLastLlmPingAt(timestamp, input.userId) ?? timestamp;
  const latencyHistory = appendLatencyHistoryEntry({ ts: lastPingAt, ms: latencyMs }, input.userId);
  return {
    pingResult: {
      ok: true,
      backend: outcome.value.backend,
      provider: outcome.value.provider,
      httpStatus: outcome.value.http_status,
    },
    latencyHistory,
    testHistory,
    lastPingAt,
    clearResultAfterMs: 8_000,
  };
}

export async function copyAgentSettingsKeyPrefix(
  prefix: string,
  writeText: (text: string) => Promise<void>,
): Promise<AgentSettingsClipboardCopyResult<AgentSettingsIdentityUtilityFailureReceipt>> {
  if (!prefix.trim()) {
    return { copied: false, error: null };
  }
  try {
    await writeText(prefix);
    return { copied: true, error: null };
  } catch (error) {
    return {
      copied: false,
      error: buildAgentSettingsIdentityUtilityFailureReceipt(
        "Copy expected key prefix",
        error instanceof Error ? error.message : "Could not copy the expected key prefix.",
      ),
    };
  }
}

export async function copyAgentSettingsSoulText(
  soulText: string,
  writeText: (text: string) => Promise<void>,
): Promise<AgentSettingsClipboardCopyResult<AgentSettingsSoulFailureReceipt>> {
  try {
    await writeText(soulText);
    return { copied: true, error: null };
  } catch (error) {
    return {
      copied: false,
      error: buildAgentSettingsSoulFailureReceipt(
        "Copy soul.md",
        error instanceof Error ? error.message : "Could not copy soul.md.",
      ),
    };
  }
}

export async function saveAgentSettingsSoulStateAndReload(
  soulText: string,
  deps: {
    saveSoul: (soulText: string) => Promise<unknown>;
    loadInstance: () => Promise<AgentFleetInstance | null>;
    now?: () => number;
    userId?: string | null;
  },
): Promise<AgentSettingsSoulSaveResult> {
  try {
    await deps.saveSoul(soulText);
    const identity = await loadAgentSettingsIdentityState("Refresh agent personality", deps.loadInstance);
    if (identity.error) {
      if (identity.error.title.includes("fresh sign-in")) {
        return {
          instance: null,
          savedAt: null,
          error: buildAgentSettingsSoulFailureReceipt("Save personality", "401 unauthorized"),
        };
      }
      if (identity.error.title.includes("could not finish right now")) {
        return {
          instance: null,
          savedAt: null,
          error: buildAgentSettingsSoulFailureReceipt("Save personality", "network timeout"),
        };
      }
      throw new Error(identity.error.summary);
    }
    const savedAt = saveSoulSavedAt((deps.now ?? Date.now)(), deps.userId);
    return {
      instance: identity.instance,
      savedAt,
      error: null,
    };
  } catch (error) {
    return {
      instance: null,
      savedAt: null,
      error: buildAgentSettingsSoulFailureReceipt(
        "Save personality",
        error instanceof Error ? error.message : "Save failed",
      ),
    };
  }
}

export function exportAgentSettingsIdentityCardState(
  openIdentityCard: () => boolean,
): AgentSettingsIdentityUtilityActionResult {
  try {
    const opened = openIdentityCard();
    return opened
      ? { error: null }
      : {
          error: buildAgentSettingsIdentityUtilityFailureReceipt(
            "Export identity card",
            "Could not open the print preview. Allow pop-ups for OmnyID and try again.",
          ),
        };
  } catch (error) {
    return {
      error: buildAgentSettingsIdentityUtilityFailureReceipt(
        "Export identity card",
        error instanceof Error ? error.message : "Could not export the identity card.",
      ),
    };
  }
}

export function exportAgentSettingsSovereignDataBundleState(
  exportBundle: () => void,
): AgentSettingsIdentityUtilityActionResult {
  try {
    exportBundle();
    return { error: null };
  } catch (error) {
    return {
      error: buildAgentSettingsIdentityUtilityFailureReceipt(
        "Export sovereign data bundle",
        error instanceof Error ? error.message : "Could not export the sovereign data bundle.",
      ),
    };
  }
}

export async function cycleAgentSettingsCapabilityApprovalModeAndReload(
  capability: CapabilityDescriptor,
  deps: {
    patchCapability: (
      id: string,
      patch: { approval_mode: CapabilityDescriptor["approval_mode"] },
    ) => Promise<unknown>;
    loadCapabilities: () => Promise<CapabilityDescriptor[]>;
    approvalCycle?: CapabilityDescriptor["approval_mode"][];
  },
): Promise<AgentSettingsCapabilityMutationResult> {
  const approvalCycle = deps.approvalCycle ?? [
    "suggest_only",
    "human_approval_required",
    "autonomous",
  ];
  const currentIndex = approvalCycle.indexOf(capability.approval_mode);
  const nextApprovalMode = approvalCycle[
    currentIndex >= 0 ? (currentIndex + 1) % approvalCycle.length : 0
  ];
  try {
    await deps.patchCapability(capability.id, { approval_mode: nextApprovalMode });
    return {
      capabilities: await deps.loadCapabilities(),
      error: null,
    };
  } catch (error) {
    return {
      capabilities: [],
      error: buildAgentSettingsCapabilityFailureReceipt(
        "Update capability approval mode",
        error instanceof Error ? error.message : "Could not update capability approval mode.",
      ),
    };
  }
}

function capabilityMutationPayload(input: CapabilityImportDescriptor) {
  return {
    name: input.name,
    description: input.description,
    input_schema: input.input_schema,
    output_schema: input.output_schema ?? null,
    version: input.version ?? "1.0.0",
    tags: input.tags ?? [],
    approval_mode: input.approval_mode ?? "suggest_only",
    enabled: input.enabled,
  };
}

export async function addAgentSettingsCapabilityAndReload(
  capability: CapabilityImportDescriptor,
  deps: {
    registerCapability: (input: CapabilityImportDescriptor) => Promise<unknown>;
    loadCapabilities: () => Promise<CapabilityDescriptor[]>;
  },
): Promise<AgentSettingsCapabilityMutationResult> {
  try {
    await deps.registerCapability(capabilityMutationPayload(capability));
    return {
      capabilities: await deps.loadCapabilities(),
      error: null,
    };
  } catch (error) {
    return {
      capabilities: [],
      error: buildAgentSettingsCapabilityFailureReceipt(
        `Add ${capability.name}`,
        error instanceof Error ? error.message : `Could not add ${capability.name}.`,
      ),
    };
  }
}

export async function importAgentSettingsCapabilitiesAndReload(
  text: string,
  existingNames: Iterable<string>,
  deps: {
    registerCapability: (input: CapabilityImportDescriptor) => Promise<unknown>;
    loadCapabilities: () => Promise<CapabilityDescriptor[]>;
  },
): Promise<AgentSettingsCapabilityImportResult> {
  let parsed: CapabilityImportDescriptor[];
  try {
    parsed = parseCapabilityImportFile(text);
  } catch (error) {
    return {
      importedCount: 0,
      capabilities: [],
      error: buildAgentSettingsCapabilityFailureReceipt(
        "Import capabilities",
        error instanceof Error ? error.message : "Unknown import failure.",
      ),
    };
  }

  const seen = new Set(Array.from(existingNames, (name) => name.trim()));
  const toAdd = parsed.filter((capability) => {
    if (seen.has(capability.name)) return false;
    seen.add(capability.name);
    return true;
  });

  try {
    for (const capability of toAdd) {
      await deps.registerCapability(capabilityMutationPayload(capability));
    }
    return {
      importedCount: toAdd.length,
      capabilities: await deps.loadCapabilities(),
      error: null,
    };
  } catch (error) {
    return {
      importedCount: 0,
      capabilities: [],
      error: buildAgentSettingsCapabilityFailureReceipt(
        "Import capabilities",
        error instanceof Error ? error.message : "Unknown import failure.",
      ),
    };
  }
}

export async function updateAgentSettingsDevicePolicyAndReload(
  input: {
    deviceId: string;
    profile: "full" | "balanced" | "lightweight";
  },
  updatePolicy: (input: {
    device_id: string;
    policy_profile: "full" | "balanced" | "lightweight";
  }) => Promise<DeviceSyncPoliciesResponse>,
): Promise<AgentSettingsDevicePolicyMutationResult> {
  try {
    const response = await updatePolicy({
      device_id: input.deviceId,
      policy_profile: input.profile,
    });
    return {
      entries: response.entries ?? [],
      feedback: `Updated ${input.deviceId} to ${input.profile}.`,
      error: null,
    };
  } catch (error) {
    return {
      entries: [],
      feedback: null,
      error: buildAgentSettingsDevicePolicyFailureReceipt(
        "Update sync policy",
        error instanceof Error ? error.message : "Failed to update sync policy.",
      ),
    };
  }
}

export async function updateAgentSettingsRuntimeBackupRetention(
  retentionDays: 7 | 14 | 30 | 90,
  updateRetention: (retentionDays: 7 | 14 | 30 | 90) => Promise<RuntimeBackupsResponse>,
): Promise<AgentSettingsRuntimeBackupsMutationResult> {
  try {
    const backups = await updateRetention(retentionDays);
    return {
      backups,
      feedback: `Backup retention updated to ${backups.policy.retention_days} days.`,
      error: null,
    };
  } catch (error) {
    return {
      backups: null,
      feedback: null,
      error: buildAgentSettingsRuntimeFailureReceipt(
        "Update backup retention",
        error instanceof Error ? error.message : "Failed to update backup retention.",
      ),
    };
  }
}

export async function createAgentSettingsRuntimeSnapshot(
  createSnapshot: () => Promise<RuntimeBackupsResponse>,
): Promise<AgentSettingsRuntimeBackupsMutationResult> {
  try {
    return {
      backups: await createSnapshot(),
      feedback: "Runtime snapshot created.",
      error: null,
    };
  } catch (error) {
    return {
      backups: null,
      feedback: null,
      error: buildAgentSettingsRuntimeFailureReceipt(
        "Create runtime snapshot",
        error instanceof Error ? error.message : "Failed to create runtime snapshot.",
      ),
    };
  }
}

export async function createAgentSettingsRuntimeRestoreDrill(
  backupId: string,
  createRestoreDrill: (backupId: string) => Promise<RuntimeRestoreDrillsResponse>,
): Promise<AgentSettingsRuntimeRestoreDrillsMutationResult> {
  try {
    return {
      drills: await createRestoreDrill(backupId),
      feedback: `Restore drill recorded for backup ${backupId}.`,
      error: null,
    };
  } catch (error) {
    return {
      drills: null,
      feedback: null,
      error: buildAgentSettingsRuntimeFailureReceipt(
        "Create restore drill",
        error instanceof Error ? error.message : "Failed to create restore drill.",
      ),
    };
  }
}

export async function loadAgentSettingsRuntimeBackupManifest(
  backupId: string,
  loadManifest: (backupId: string) => Promise<RuntimeBackupManifestResponse>,
): Promise<AgentSettingsRuntimeManifestLoadResult> {
  try {
    return {
      manifest: await loadManifest(backupId),
      feedback: `Loaded manifest for backup ${backupId}.`,
      error: null,
    };
  } catch (error) {
    return {
      manifest: null,
      feedback: null,
      error: buildAgentSettingsRuntimeFailureReceipt(
        "Load runtime backup manifest",
        error instanceof Error ? error.message : "Failed to load runtime backup manifest.",
      ),
    };
  }
}

export async function updateAgentSettingsRuntimeUpdatePolicy(
  input: {
    update_channel: "stable" | "manual_only";
    auto_apply: "manual_only" | "scaffold_refresh_only";
  },
  updatePolicy: (input: {
    update_channel: "stable" | "manual_only";
    auto_apply: "manual_only" | "scaffold_refresh_only";
  }) => Promise<RuntimeUpdatesResponse>,
): Promise<AgentSettingsRuntimeUpdatesMutationResult> {
  try {
    return {
      updates: await updatePolicy(input),
      feedback: "Runtime update policy saved.",
      error: null,
    };
  } catch (error) {
    return {
      updates: null,
      feedback: null,
      error: buildAgentSettingsRuntimeFailureReceipt(
        "Save runtime update policy",
        error instanceof Error ? error.message : "Failed to save runtime update policy.",
      ),
    };
  }
}

export async function checkAgentSettingsRuntimeUpdates(
  checkUpdates: () => Promise<RuntimeUpdatesResponse>,
): Promise<AgentSettingsRuntimeUpdatesMutationResult> {
  try {
    const updates = await checkUpdates();
    return {
      updates,
      feedback: updates.update_available
        ? "Runtime updates checked. Update available."
        : "Runtime updates checked. No update available.",
      error: null,
    };
  } catch (error) {
    return {
      updates: null,
      feedback: null,
      error: buildAgentSettingsRuntimeFailureReceipt(
        "Check runtime updates",
        error instanceof Error ? error.message : "Failed to check runtime updates.",
      ),
    };
  }
}

export async function applyAgentSettingsRuntimeUpdate(
  applyUpdate: () => Promise<RuntimeUpdatesResponse>,
): Promise<AgentSettingsRuntimeUpdatesMutationResult> {
  try {
    return {
      updates: await applyUpdate(),
      feedback: "Runtime update action recorded.",
      error: null,
    };
  } catch (error) {
    return {
      updates: null,
      feedback: null,
      error: buildAgentSettingsRuntimeFailureReceipt(
        "Apply runtime update",
        error instanceof Error ? error.message : "Failed to apply runtime update.",
      ),
    };
  }
}

export async function preloadAgentSettingsRuntimeRecoveryPacket(
  loadPacket: () => Promise<RuntimeRecoveryPacketResponse>,
): Promise<RuntimeRecoveryPacketResponse | null> {
  try {
    return await loadPacket();
  } catch {
    return null;
  }
}

export async function loadAgentSettingsRuntimeRecoveryPacket(
  action: "preview" | "download",
  loadPacket: () => Promise<RuntimeRecoveryPacketResponse>,
): Promise<AgentSettingsRuntimeRecoveryPacketLoadResult> {
  const actionLabel = action === "download"
    ? "Download runtime recovery packet"
    : "Load runtime recovery packet";
  const feedback = action === "download"
    ? "Runtime recovery packet downloaded."
    : "Runtime recovery packet loaded for review.";
  try {
    return {
      packet: await loadPacket(),
      feedback,
      error: null,
    };
  } catch (error) {
    return {
      packet: null,
      feedback: null,
      error: buildAgentSettingsRuntimeFailureReceipt(
        actionLabel,
        error instanceof Error
          ? error.message
          : action === "download"
            ? "Failed to download runtime recovery packet."
            : "Failed to load runtime recovery packet.",
      ),
    };
  }
}

export async function downloadAgentSettingsRuntimeRecoveryPacketState(
  deps: {
    loadPacket: () => Promise<RuntimeRecoveryPacketResponse>;
    savePacket: (packet: RuntimeRecoveryPacketResponse) => void;
  },
): Promise<AgentSettingsRuntimeRecoveryPacketLoadResult> {
  const result = await loadAgentSettingsRuntimeRecoveryPacket("download", deps.loadPacket);
  if (result.error || !result.packet) {
    return result;
  }

  try {
    deps.savePacket(result.packet);
    return result;
  } catch (error) {
    return {
      packet: null,
      feedback: null,
      error: buildAgentSettingsRuntimeFailureReceipt(
        "Download runtime recovery packet",
        error instanceof Error ? error.message : "Failed to download runtime recovery packet.",
      ),
    };
  }
}
