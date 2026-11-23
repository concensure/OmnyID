// @locs-version: 1.0
import type {
  CapabilityDescriptor,
  DeviceSyncPoliciesResponse,
  DeviceSyncPolicyEntry,
  LlmConfig,
  RuntimeRecoveryPacketResponse,
} from "@/lib/api";
import type { TestHistoryEntry } from "@/lib/agentSettingsLocalState";

export type AgentIdentityCardExportState = {
  agentId: string;
  model: string;
  provider: string;
  loraScore: string;
  issuedAt: string;
  capabilities: CapabilityDescriptor[];
};

export type AgentSettingsTestHistoryRowState = {
  timeLabel: string;
  modelLabel: string;
  durationLabel: string;
  statusLabel: "OK" | "NO";
  statusClass: string;
};

export type AgentSettingsRuntimeRecoveryPacketExportState = {
  filename: string;
  payload: string;
};

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function agentSettingsIssuedAtLabel(now = new Date()): string {
  return now.toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function agentSettingsIdentityCardExportState(args: {
  now?: Date;
  llmConfig?: LlmConfig | null;
  llmModel: string;
  llmProvider: string;
  loraConfidenceScore?: number | null;
  capabilities?: CapabilityDescriptor[] | null;
}): AgentIdentityCardExportState {
  const now = args.now ?? new Date();
  return {
    agentId: `omnyid-${now.getTime().toString(36).toUpperCase()}`,
    model: args.llmConfig?.model ?? args.llmModel,
    provider: args.llmConfig?.provider ?? args.llmProvider,
    loraScore: args.loraConfidenceScore != null
      ? `${Math.round(args.loraConfidenceScore * 100)}%`
      : "-",
    issuedAt: agentSettingsIssuedAtLabel(now),
    capabilities: args.capabilities ?? [],
  };
}

export function agentSettingsDevicePolicyEntriesState(
  response: DeviceSyncPoliciesResponse | null | undefined,
): DeviceSyncPolicyEntry[] {
  return response?.entries ?? [];
}

export function agentSettingsTestHistoryTimeLabel(timestampMs: number): string {
  if (!isFiniteTimestamp(timestampMs)) return "-";
  const date = new Date(timestampMs);
  return Number.isNaN(date.getTime())
    ? "-"
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function agentSettingsTestHistoryRowState(
  entry: TestHistoryEntry,
): AgentSettingsTestHistoryRowState {
  return {
    timeLabel: agentSettingsTestHistoryTimeLabel(entry.ts),
    modelLabel: entry.model,
    durationLabel: entry.ms !== null ? `${entry.ms}ms` : "-",
    statusLabel: entry.ok ? "OK" : "NO",
    statusClass: entry.ok ? "text-green-600" : "text-red-400",
  };
}

export function agentSettingsHasSupportAccessHistory(
  cards: ReadonlyArray<unknown> | null | undefined,
): boolean {
  return (cards?.length ?? 0) > 0;
}

export function agentSettingsRuntimeRecoveryPacketExportState(
  packet: RuntimeRecoveryPacketResponse,
): AgentSettingsRuntimeRecoveryPacketExportState {
  return {
    filename: packet.packet_name || "omnyid-runtime-recovery-packet.json",
    payload: JSON.stringify(packet, null, 2),
  };
}
