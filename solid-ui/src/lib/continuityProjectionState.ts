// @locs-version: 2.0
import type { SendAfpMessageInput } from "@/lib/api";

export type ContinuityProjectionQueueItemStatus = "pending" | "sent" | "blocked";

export type ContinuityProjectionQueueItem<TKind extends string = string> = {
  id: string;
  sourceId: string;
  kind: TKind;
  title: string;
  status: ContinuityProjectionQueueItemStatus;
  statusLabel: string;
  blockedReason: string | null;
  sendInput: SendAfpMessageInput | null;
};

export type ContinuityProjectionQueueState<TKind extends string = string> = {
  items: ContinuityProjectionQueueItem<TKind>[];
  pendingItems: ContinuityProjectionQueueItem<TKind>[];
  sentItems: ContinuityProjectionQueueItem<TKind>[];
  blockedItems: ContinuityProjectionQueueItem<TKind>[];
  pendingSendInputs: SendAfpMessageInput[];
  summaryLabel: string;
  nextActionLabel: string;
  canDispatch: boolean;
};

export type ContinuityProjectionQueueSelectionState<TKind extends string = string> = {
  queue: ContinuityProjectionQueueState<TKind>;
  selectedPendingItems: ContinuityProjectionQueueItem<TKind>[];
  selectedPendingCount: number;
  totalPendingCount: number;
  selectionSummaryLabel: string | null;
};

export type ContinuityProjectionSummaryCopy = {
  emptyLabel: string;
  itemNoun: string;
  readyNoun: string;
  savedNoun: string;
  reviewNoun: string;
  nextActionReadyVerb: string;
  nextActionReviewLabel: string;
  nextActionSavedLabel: string;
  nextActionEmptyLabel: string;
};

export const DEFAULT_CONTINUITY_PROJECTION_SUMMARY_COPY: ContinuityProjectionSummaryCopy = {
  emptyLabel: "No continuity items to save",
  itemNoun: "continuity item",
  readyNoun: "ready",
  savedNoun: "already saved",
  reviewNoun: "need review",
  nextActionReadyVerb: "Save",
  nextActionReviewLabel: "Review items that need attention",
  nextActionSavedLabel: "Continuity items saved",
  nextActionEmptyLabel: "Create continuity items",
};

function summaryLabel(
  pendingCount: number,
  sentCount: number,
  blockedCount: number,
  copy: ContinuityProjectionSummaryCopy,
): string {
  if (pendingCount === 0 && sentCount === 0 && blockedCount === 0) return copy.emptyLabel;
  return [
    pendingCount > 0 ? `${pendingCount} ${copy.readyNoun}` : null,
    sentCount > 0 ? `${sentCount} ${copy.savedNoun}` : null,
    blockedCount > 0 ? `${blockedCount} ${copy.reviewNoun}` : null,
  ].filter(Boolean).join(", ");
}

function queueItemPrecedence(item: ContinuityProjectionQueueItem): number {
  if (item.status === "sent") return 3;
  if (item.status === "pending" && item.sendInput) return 2;
  if (item.status === "pending") return 1;
  return 0;
}

function dedupeQueueItems<TKind extends string>(
  items: readonly ContinuityProjectionQueueItem<TKind>[],
): ContinuityProjectionQueueItem<TKind>[] {
  const byId = new Map<string, ContinuityProjectionQueueItem<TKind>>();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing || queueItemPrecedence(item) > queueItemPrecedence(existing)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

export function buildContinuityProjectionQueueState<TKind extends string>(input: {
  items: readonly ContinuityProjectionQueueItem<TKind>[];
  copy?: Partial<ContinuityProjectionSummaryCopy> | null;
}): ContinuityProjectionQueueState<TKind> {
  const copy = { ...DEFAULT_CONTINUITY_PROJECTION_SUMMARY_COPY, ...(input.copy ?? {}) };
  const items = dedupeQueueItems(input.items);
  const pendingItems = items.filter((item) => item.status === "pending");
  const sentItems = items.filter((item) => item.status === "sent");
  const blockedItems = items.filter((item) => item.status === "blocked");
  const pendingSendInputs = pendingItems.flatMap((item) => item.sendInput ? [item.sendInput] : []);

  return {
    items,
    pendingItems,
    sentItems,
    blockedItems,
    pendingSendInputs,
    summaryLabel: summaryLabel(pendingItems.length, sentItems.length, blockedItems.length, copy),
    nextActionLabel: pendingItems.length > 0
      ? `${copy.nextActionReadyVerb} ${pendingItems.length} ${copy.itemNoun}${pendingItems.length === 1 ? "" : "s"}`
      : blockedItems.length > 0
        ? copy.nextActionReviewLabel
        : sentItems.length > 0 ? copy.nextActionSavedLabel : copy.nextActionEmptyLabel,
    canDispatch: pendingSendInputs.length > 0,
  };
}

export function buildContinuityProjectionQueueSelectionState<TKind extends string>(input: {
  queue: ContinuityProjectionQueueState<TKind>;
  deselectedItemIds?: Readonly<Record<string, boolean>> | null;
  selectedSummaryNoun?: string | null;
}): ContinuityProjectionQueueSelectionState<TKind> {
  const selectedSummaryNoun = input.selectedSummaryNoun?.trim() || "item";
  const deselectedItemIds = input.deselectedItemIds ?? {};
  const selectedPendingItems = input.queue.pendingItems.filter((item) => !deselectedItemIds[item.id]);
  const selectedIds = new Set(selectedPendingItems.map((item) => item.id));
  const items = input.queue.items.filter((item) => item.status !== "pending" || selectedIds.has(item.id));
  const pendingItems = items.filter((item) => item.status === "pending");
  const sentItems = items.filter((item) => item.status === "sent");
  const blockedItems = items.filter((item) => item.status === "blocked");
  const pendingSendInputs = pendingItems.flatMap((item) => item.sendInput ? [item.sendInput] : []);

  return {
    queue: {
      ...input.queue,
      items,
      pendingItems,
      sentItems,
      blockedItems,
      pendingSendInputs,
      canDispatch: pendingSendInputs.length > 0,
      summaryLabel: pendingItems.length > 0
        ? `${pendingItems.length} selected ${selectedSummaryNoun}${pendingItems.length === 1 ? "" : "s"} ready`
        : `No selected ${selectedSummaryNoun}s to save`,
      nextActionLabel: pendingItems.length > 0
        ? `Save ${pendingItems.length} selected ${selectedSummaryNoun}${pendingItems.length === 1 ? "" : "s"}`
        : `Select ${selectedSummaryNoun}s to save`,
    },
    selectedPendingItems,
    selectedPendingCount: selectedPendingItems.length,
    totalPendingCount: input.queue.pendingItems.length,
    selectionSummaryLabel: input.queue.pendingItems.length > 0
      ? `${selectedPendingItems.length}/${input.queue.pendingItems.length} ready items selected`
      : null,
  };
}

export type ContinuityPressureFamily = "obligation" | "attention" | "knowledge" | "opportunity";
export type ContinuityRankedItemKind = "task" | "calendar_event" | "decision" | "approval" | "context";

export type ContinuityRankedItem<TKind extends string = ContinuityRankedItemKind> = {
  id: string;
  kind: TKind;
  title: string;
  pressureFamily: ContinuityPressureFamily;
  rankWeight: number;
  dueLabel: string | null;
  dueAt: string | null;
  explanation: string;
  evidenceLabels: string[];
  sourceSurface: string;
  simulatorSeedKind: "commitment" | "response" | "decision" | "context";
};

export type ContinuityDecisionLoadReliefState<TItem extends ContinuityRankedItem = ContinuityRankedItem> = {
  summaryLabel: string;
  focusLimit: number;
  focusItems: TItem[];
  backlogCount: number;
  reliefLabels: string[];
};

export type ContinuityPersonalOsProjectionState<TItem extends ContinuityRankedItem = ContinuityRankedItem> = {
  hasSignal: boolean;
  summaryLabel: string;
  fieldEnginePrimaryType: ContinuityPressureFamily | null;
  fieldEngineSummary: string | null;
  simulatorSeedSummary: string | null;
  decisionLoadRelief: ContinuityDecisionLoadReliefState<TItem>;
  rankedItems: TItem[];
  guardrailLabels: string[];
};

function primaryFamily(items: readonly ContinuityRankedItem[]): ContinuityPressureFamily | null {
  const totals = new Map<ContinuityPressureFamily, number>();
  for (const item of items) totals.set(item.pressureFamily, (totals.get(item.pressureFamily) ?? 0) + item.rankWeight);
  return Array.from(totals.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function defaultFamilySummary(family: ContinuityPressureFamily | null, top: ContinuityRankedItem | null): string | null {
  if (!family || !top) return null;
  if (family === "obligation") return `Obligation pressure: ${top.title}`;
  if (family === "attention") return `Attention pressure: ${top.title}`;
  if (family === "knowledge") return `Evidence pressure: ${top.title}`;
  return `Opportunity pressure: ${top.title}`;
}

function defaultDecisionLoadCandidate(item: ContinuityRankedItem): boolean {
  if (item.kind === "decision" || item.pressureFamily === "knowledge" || item.pressureFamily === "opportunity") return true;
  if (/^(Confirm|Decide|Choose|Verify|Review)\b/i.test(item.title)) return true;
  return item.evidenceLabels.some((label) => /decision|shortlist|quote|payment|review|verification/i.test(label));
}

function dedupeRankedItems<TItem extends ContinuityRankedItem>(
  items: readonly TItem[],
): TItem[] {
  const byId = new Map<string, TItem>();
  for (const item of items) {
    const existing = byId.get(item.id);
    if (!existing || item.rankWeight > existing.rankWeight) byId.set(item.id, item);
  }
  return [...byId.values()];
}

export function buildContinuityPersonalOsProjectionState<TItem extends ContinuityRankedItem>(input: {
  items: readonly TItem[];
  limit?: number | null;
  decisionFocusLimit?: number | null;
  summarySubject?: string | null;
  guardrailLabels?: readonly string[] | null;
  decisionLoadCandidate?: ((item: TItem) => boolean) | null;
  familySummary?: ((family: ContinuityPressureFamily | null, top: TItem | null) => string | null) | null;
  decisionLoadReliefLabels?: ((focusItems: readonly TItem[], backlogCount: number) => readonly string[]) | null;
}): ContinuityPersonalOsProjectionState<TItem> {
  const limit = input.limit ?? 12;
  const subject = input.summarySubject?.trim() || "continuity";
  const decisionFocusLimit = Math.max(1, Math.min(5, Math.trunc(input.decisionFocusLimit ?? 3)));
  const rankedItems = dedupeRankedItems(input.items.filter((item) => item.rankWeight > 0))
    .sort((left, right) => right.rankWeight - left.rankWeight || left.title.localeCompare(right.title))
    .slice(0, limit);
  const top = rankedItems[0] ?? null;
  const fieldEnginePrimaryType = primaryFamily(rankedItems);
  const candidate = input.decisionLoadCandidate ?? defaultDecisionLoadCandidate;
  const focusCandidates = rankedItems.filter(candidate);
  const focusItems = focusCandidates.slice(0, decisionFocusLimit);
  const backlogCount = Math.max(0, focusCandidates.length - focusItems.length);

  return {
    hasSignal: rankedItems.length > 0,
    summaryLabel: rankedItems.length > 0
      ? `${rankedItems.length} ${subject} item${rankedItems.length === 1 ? "" : "s"} ready for PersonalOS ranking`
      : `No ${subject} items ready for PersonalOS ranking`,
    fieldEnginePrimaryType,
    fieldEngineSummary: (input.familySummary ?? defaultFamilySummary)(fieldEnginePrimaryType, top),
    simulatorSeedSummary: top
      ? `Use existing simulator as a bounded ${top.simulatorSeedKind} preview seed for ${top.title}.`
      : null,
    decisionLoadRelief: {
      summaryLabel: focusItems.length > 0
        ? `${focusItems.length} thing${focusItems.length === 1 ? "" : "s"} need your attention; ${backlogCount} can wait.`
        : `No decision-heavy ${subject} items need focus right now.`,
      focusLimit: decisionFocusLimit,
      focusItems,
      backlogCount,
      reliefLabels: input.decisionLoadReliefLabels
        ? [...input.decisionLoadReliefLabels(focusItems, backlogCount)]
        : [
          focusItems.length > 0 ? `Limits active ${subject} choices to the top ${focusItems.length}.` : "No immediate decision pile-up.",
          backlogCount > 0 ? `${backlogCount} lower-priority decision${backlogCount === 1 ? "" : "s"} stay in the backlog.` : null,
        ].filter((label): label is string => Boolean(label)),
    },
    rankedItems,
    guardrailLabels: [...(input.guardrailLabels ?? [])],
  };
}
