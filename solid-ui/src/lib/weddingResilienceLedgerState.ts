// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import {
  buildWeddingComparisonColumns,
  type WeddingComparisonColumnState,
} from "@/lib/weddingComparisonColumnState";
import {
  weddingPreferenceConflictFromAfpMessage,
} from "@/lib/weddingPreferenceConflictAfpProjectionState";
import type { WeddingPreferenceConflictState } from "@/lib/weddingPreferenceConflictState";
import {
  weddingRealityChangeRecoveryFromAfpMessage,
} from "@/lib/weddingRealityChangeRecoveryAfpProjectionState";
import type { WeddingRealityChangeRecoveryState } from "@/lib/weddingRealityChangeRecoveryState";

export type WeddingResilienceAttentionItemKind = "preference_conflict" | "recovery_plan";
export type WeddingResilienceAttentionPriority = "urgent" | "high" | "normal";

export type WeddingResilienceComparisonPreview = {
  title: string;
  columns: WeddingComparisonColumnState[];
  rows: Array<{
    id: string;
    cells: string[];
  }>;
};

export type WeddingResilienceAttentionItem = {
  id: string;
  kind: WeddingResilienceAttentionItemKind;
  title: string;
  priority: WeddingResilienceAttentionPriority;
  detail: string;
  actionLabel: string;
  sourceMessageId: string;
  metadataLabels: string[];
  comparisonPreview: WeddingResilienceComparisonPreview | null;
  a2ui: Record<string, unknown>;
};

export type WeddingResilienceLedgerState = {
  preferenceConflicts: WeddingPreferenceConflictState[];
  recoveryPlans: WeddingRealityChangeRecoveryState[];
  attentionItems: WeddingResilienceAttentionItem[];
  unresolvedCount: number;
  urgentCount: number;
  summaryLabel: string;
};

export type BuildWeddingResilienceLedgerInput = {
  messages?: readonly AfpMessage[] | null;
  responseWorkspaceId?: string | null;
  decisionDeferrals?: readonly {
    focusItemId: string;
    deferredUntilAt?: string | null;
    staleAfterAt?: string | null;
    dependencyFingerprint?: string | null;
    createdAt?: string | null;
  }[] | null;
  nowIso?: string | null;
};

type ParsedPreferenceConflict = {
  state: WeddingPreferenceConflictState;
  message: AfpMessage;
};

type ParsedRecoveryPlan = {
  state: WeddingRealityChangeRecoveryState;
  message: AfpMessage;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function timeValue(message: AfpMessage): number {
  const value = Date.parse(message.timestamp);
  return Number.isFinite(value) ? value : 0;
}

function newerMessage(a: AfpMessage, b: AfpMessage): AfpMessage {
  if (timeValue(a) !== timeValue(b)) return timeValue(a) > timeValue(b) ? a : b;
  return a.id >= b.id ? a : b;
}

function sameWorkspace(workspaceId: string | null, stateWorkspaceId: string | null | undefined): boolean {
  return !workspaceId || clean(stateWorkspaceId) === workspaceId;
}

function preferenceKey(state: WeddingPreferenceConflictState): string {
  return state.conflictObject?.id
    ?? `preference:${state.decisionArea}:${state.conflictAxis ?? "unknown"}`.toLowerCase();
}

function recoveryKey(state: WeddingRealityChangeRecoveryState): string {
  return state.recoveryPlanObject.id;
}

function dedupePreferenceConflicts(items: readonly ParsedPreferenceConflict[]): ParsedPreferenceConflict[] {
  const byKey = new Map<string, ParsedPreferenceConflict>();
  for (const item of items) {
    const key = preferenceKey(item.state);
    const existing = byKey.get(key);
    if (!existing || newerMessage(item.message, existing.message) === item.message) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => timeValue(b.message) - timeValue(a.message));
}

function dedupeRecoveryPlans(items: readonly ParsedRecoveryPlan[]): ParsedRecoveryPlan[] {
  const byKey = new Map<string, ParsedRecoveryPlan>();
  for (const item of items) {
    const key = recoveryKey(item.state);
    const existing = byKey.get(key);
    if (!existing || newerMessage(item.message, existing.message) === item.message) {
      byKey.set(key, item);
    }
  }
  return [...byKey.values()].sort((a, b) => timeValue(b.message) - timeValue(a.message));
}

function conflictPriority(state: WeddingPreferenceConflictState): WeddingResilienceAttentionPriority {
  return state.conflictObject?.status === "ready_for_review" ? "high" : "normal";
}

function recoveryPriority(state: WeddingRealityChangeRecoveryState): WeddingResilienceAttentionPriority {
  if (state.disruptionObject.severity === "urgent") return "urgent";
  if (state.disruptionObject.severity === "warning") return "high";
  return "normal";
}

function moneyLabel(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "Confirm";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function preferenceComparisonPreview(state: WeddingPreferenceConflictState): WeddingResilienceComparisonPreview | null {
  if (state.compromiseOptions.length === 0) return null;
  const headers = ["Option", "Protects", "Trade-off", "Next step"];
  return {
    title: "Ways through",
    columns: buildWeddingComparisonColumns(headers),
    rows: state.compromiseOptions.slice(0, 3).map((option) => ({
      id: option.id,
      cells: [
        option.title,
        option.satisfiesValues.join(", ") || "Both reasons",
        option.tradeoffLabels[0] ?? "Needs couple review",
        "Review together",
      ],
    })),
  };
}

function recoveryComparisonPreview(state: WeddingRealityChangeRecoveryState): WeddingResilienceComparisonPreview | null {
  if (state.shortlist.length === 0) return null;
  const headers = ["Option", "Cost", "Fit", "Date", "Next step"];
  return {
    title: "Replacement shortlist",
    columns: buildWeddingComparisonColumns(headers),
    rows: state.shortlist.slice(0, 3).map((item) => ({
      id: item.id,
      cells: [
        item.label,
        moneyLabel(item.priceEstimate),
        item.fitLabels.slice(0, 2).join(", ") || "Check style",
        item.availableOnDate ? "Available" : "Check",
        "Compare portfolio",
      ],
    })),
  };
}

function attentionFromPreferenceConflict(item: ParsedPreferenceConflict): WeddingResilienceAttentionItem | null {
  const { state, message } = item;
  if (state.status !== "conflict") return null;
  const title = state.conflictObject?.title || `${state.decisionArea}: values to balance`;
  return {
    id: `wedding_resilience:${preferenceKey(state)}`,
    kind: "preference_conflict",
    title,
    priority: conflictPriority(state),
    detail: state.summaryLabel || "Two preferences need a shared decision.",
    actionLabel: "Review values",
    sourceMessageId: message.id,
    metadataLabels: uniqueStrings([
      state.decisionArea,
      state.conflictAxis?.replace(/_/g, " "),
      ...(state.conflictObject?.underlyingValueLabels ?? []),
      ...state.preferenceSignals.map((signal) => signal.personLabel),
    ]),
    comparisonPreview: preferenceComparisonPreview(state),
    a2ui: state.a2ui,
  };
}

function attentionFromRecoveryPlan(item: ParsedRecoveryPlan): WeddingResilienceAttentionItem {
  const { state, message } = item;
  const vendorName = clean(state.recoveryPlanObject.metadata.vendor_name);
  const vendorCategory = clean(state.recoveryPlanObject.metadata.vendor_category);
  return {
    id: `wedding_resilience:${recoveryKey(state)}`,
    kind: "recovery_plan",
    title: state.disruptionObject.title || state.recoveryPlanObject.title,
    priority: recoveryPriority(state),
    detail: state.decisionNeededLabel || "One recovery decision needs review.",
    actionLabel: state.shortlist.length > 0 ? "Compare replacements" : "Complete recovery details",
    sourceMessageId: message.id,
    metadataLabels: uniqueStrings([
      state.subtype.replace(/_/g, " "),
      vendorName,
      vendorCategory,
      state.shortlist.length > 0 ? `${state.shortlist.length} replacement option${state.shortlist.length === 1 ? "" : "s"}` : null,
      state.contractEntitlement.refundLabel,
    ]),
    comparisonPreview: recoveryComparisonPreview(state),
    a2ui: state.a2ui,
  };
}

function summaryFor(items: readonly WeddingResilienceAttentionItem[]): string {
  if (items.length === 0) return "No partner conflicts or recovery plans need attention.";
  const urgentCount = items.filter((item) => item.priority === "urgent").length;
  if (urgentCount > 0) return `${urgentCount} urgent, ${items.length} total wedding resilience item${items.length === 1 ? "" : "s"}.`;
  return `${items.length} wedding resilience item${items.length === 1 ? "" : "s"} need attention.`;
}

function dependencyFingerprint(item: WeddingResilienceAttentionItem): string {
  return uniqueStrings([
    item.id,
    item.kind,
    "attention",
    item.kind === "recovery_plan" ? "response_queue" : "home",
    ...item.metadataLabels,
  ], 24).join("|").toLowerCase();
}

function activelyDeferred(
  item: WeddingResilienceAttentionItem,
  deferrals: BuildWeddingResilienceLedgerInput["decisionDeferrals"],
  nowIso: string | null | undefined,
): boolean {
  const now = Date.parse(clean(nowIso) || new Date().toISOString());
  const candidates = (deferrals ?? []).filter((deferral) => clean(deferral.focusItemId) === item.id);
  const latest = candidates.sort((left, right) => Date.parse(clean(left.createdAt)) - Date.parse(clean(right.createdAt))).at(-1);
  if (!latest || (clean(latest.dependencyFingerprint) && clean(latest.dependencyFingerprint) !== dependencyFingerprint(item))) return false;
  const until = Date.parse(clean(latest.deferredUntilAt) || clean(latest.staleAfterAt));
  return Number.isFinite(until) && now < until;
}

export function buildWeddingResilienceLedgerState(
  input: BuildWeddingResilienceLedgerInput = {},
): WeddingResilienceLedgerState {
  const workspaceId = clean(input.responseWorkspaceId) || null;
  const messages = input.messages ?? [];
  const preferenceItems: ParsedPreferenceConflict[] = [];
  const recoveryItems: ParsedRecoveryPlan[] = [];

  for (const message of messages) {
    const preferenceState = weddingPreferenceConflictFromAfpMessage(message);
    if (preferenceState && sameWorkspace(workspaceId, preferenceState.metadata.responseWorkspaceId)) {
      preferenceItems.push({ state: preferenceState, message });
      continue;
    }
    const recoveryState = weddingRealityChangeRecoveryFromAfpMessage(message);
    if (recoveryState && sameWorkspace(workspaceId, recoveryState.metadata.responseWorkspaceId)) {
      recoveryItems.push({ state: recoveryState, message });
    }
  }

  const dedupedPreferences = dedupePreferenceConflicts(preferenceItems);
  const dedupedRecoveries = dedupeRecoveryPlans(recoveryItems);
  const attentionItems = [
    ...dedupedPreferences.flatMap((item) => {
      const attention = attentionFromPreferenceConflict(item);
      return attention ? [attention] : [];
    }),
    ...dedupedRecoveries.map(attentionFromRecoveryPlan),
  ].filter((item) => !activelyDeferred(item, input.decisionDeferrals, input.nowIso)).sort((a, b) => {
    const priorityRank: Record<WeddingResilienceAttentionPriority, number> = { urgent: 0, high: 1, normal: 2 };
    return priorityRank[a.priority] - priorityRank[b.priority] || a.title.localeCompare(b.title);
  });

  return {
    preferenceConflicts: dedupedPreferences.map((item) => item.state),
    recoveryPlans: dedupedRecoveries.map((item) => item.state),
    attentionItems,
    unresolvedCount: attentionItems.length,
    urgentCount: attentionItems.filter((item) => item.priority === "urgent").length,
    summaryLabel: summaryFor(attentionItems),
  };
}
