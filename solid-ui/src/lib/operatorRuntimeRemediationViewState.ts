// @locs-version: 1.0
import type {
  OperatorRuntimeRemediationHistoryResponse,
  OperatorRuntimeRemediationReceipt,
} from "@/lib/api";
import type { OperatorRuntimeRemediationFilter } from "@/lib/operatorRuntimeRemediationLocalState";

function issuedTimestamp(entry: OperatorRuntimeRemediationReceipt): number {
  const timestamp = Date.parse(entry.issued_at);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function completedTimestamp(entry: OperatorRuntimeRemediationReceipt): number {
  const timestamp = Date.parse(entry.completed_at ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function sortOperatorRuntimeRemediationEntries(
  entries: readonly OperatorRuntimeRemediationReceipt[],
): OperatorRuntimeRemediationReceipt[] {
  return [...entries].sort((left, right) => {
    const leftCompleted = left.lifecycle_status === "completed";
    const rightCompleted = right.lifecycle_status === "completed";
    if (leftCompleted !== rightCompleted) return leftCompleted ? 1 : -1;
    const completedDelta = completedTimestamp(right) - completedTimestamp(left);
    if (completedDelta !== 0) return completedDelta;
    const issuedDelta = issuedTimestamp(right) - issuedTimestamp(left);
    if (issuedDelta !== 0) return issuedDelta;
    return right.receipt_id.localeCompare(left.receipt_id);
  });
}

export function filterOperatorRuntimeRemediationEntries(
  entries: readonly OperatorRuntimeRemediationReceipt[],
  filter: OperatorRuntimeRemediationFilter,
  draftState?: {
    outcomeNotes: Readonly<Record<string, string>>;
    proofReferences: Readonly<Record<string, string>>;
  },
): OperatorRuntimeRemediationReceipt[] {
  const sorted = sortOperatorRuntimeRemediationEntries(entries);
  if (filter === "all") return sorted;
  if (filter === "drafts") {
    return sorted.filter((entry) =>
      hasRuntimeRemediationCompletionDraft({
        receiptId: entry.receipt_id,
        outcomeNotes: draftState?.outcomeNotes ?? {},
        proofReferences: draftState?.proofReferences ?? {},
      }));
  }
  if (filter === "completed") return sorted.filter((entry) => entry.lifecycle_status === "completed");
  return sorted.filter((entry) => entry.lifecycle_status !== "completed");
}

export function pruneRuntimeRemediationDraftMap(
  drafts: Readonly<Record<string, string>>,
  entries: readonly OperatorRuntimeRemediationReceipt[],
): Record<string, string> {
  const allowed = new Set(
    entries.filter((entry) => entry.lifecycle_status !== "completed").map((entry) => entry.receipt_id),
  );
  return Object.fromEntries(
    Object.entries(drafts).filter(([receiptId, value]) => allowed.has(receiptId) && value.trim().length > 0),
  );
}

export function nextRuntimeRemediationFilterAfterCompletion(
  currentFilter: OperatorRuntimeRemediationFilter,
  entries: readonly OperatorRuntimeRemediationReceipt[],
  completedReceiptId: string,
): OperatorRuntimeRemediationFilter {
  if (currentFilter !== "open") return currentFilter;
  const remainingOpenCount = entries.filter(
    (entry) => entry.receipt_id !== completedReceiptId && entry.lifecycle_status !== "completed",
  ).length;
  return remainingOpenCount > 0 ? "open" : "completed";
}

export function nextRuntimeRemediationFilterAfterDraftsChange(
  currentFilter: OperatorRuntimeRemediationFilter,
  drafts: {
    outcomeNotes: Readonly<Record<string, string>>;
    proofReferences: Readonly<Record<string, string>>;
  },
): OperatorRuntimeRemediationFilter {
  if (currentFilter !== "drafts") return currentFilter;
  return countRuntimeRemediationDraftReceipts(drafts) > 0 ? "drafts" : "open";
}

export function findRuntimeRemediationReceiptById(
  entries: readonly OperatorRuntimeRemediationReceipt[],
  receiptId: string | null | undefined,
): OperatorRuntimeRemediationReceipt | null {
  const normalized = String(receiptId ?? "").trim();
  if (!normalized) return null;
  return entries.find((entry) => entry.receipt_id === normalized) ?? null;
}

export function hasRuntimeRemediationCompletionDraft(args: {
  receiptId: string;
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
}): boolean {
  const normalizedReceiptId = args.receiptId.trim();
  if (!normalizedReceiptId) return false;
  return Boolean(
    args.outcomeNotes[normalizedReceiptId]?.trim()
    || args.proofReferences[normalizedReceiptId]?.trim(),
  );
}

export function clearRuntimeRemediationDraftEntry(
  drafts: Readonly<Record<string, string>>,
  receiptId: string,
): Record<string, string> {
  const normalizedReceiptId = receiptId.trim();
  if (!normalizedReceiptId || !(normalizedReceiptId in drafts)) return { ...drafts };
  const next = { ...drafts };
  delete next[normalizedReceiptId];
  return next;
}

export function countRuntimeRemediationDraftReceipts(args: {
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
}): number {
  const receiptIds = new Set<string>();
  for (const [receiptId, value] of Object.entries(args.outcomeNotes)) {
    if (receiptId.trim() && value.trim()) receiptIds.add(receiptId.trim());
  }
  for (const [receiptId, value] of Object.entries(args.proofReferences)) {
    if (receiptId.trim() && value.trim()) receiptIds.add(receiptId.trim());
  }
  return receiptIds.size;
}

export function readRuntimeRemediationFilterForReceipt(args: {
  receipt: OperatorRuntimeRemediationReceipt | null | undefined;
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
}): OperatorRuntimeRemediationFilter {
  if (!args.receipt) return "open";
  if (hasRuntimeRemediationCompletionDraft({
    receiptId: args.receipt.receipt_id,
    outcomeNotes: args.outcomeNotes,
    proofReferences: args.proofReferences,
  })) {
    return "drafts";
  }
  return args.receipt.lifecycle_status === "completed" ? "completed" : "open";
}

export function readRuntimeRemediationQueueLabelForReceipt(args: {
  receipt: OperatorRuntimeRemediationReceipt | null | undefined;
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
}): string {
  if (!args.receipt) return "Show relevant queue";
  const filter = readRuntimeRemediationFilterForReceipt(args);
  if (filter === "drafts") return "Show in drafts";
  return filter === "completed" ? "Show in completed" : "Show in open queue";
}

export function runtimeRemediationReceiptsShareId(
  left: OperatorRuntimeRemediationReceipt | null | undefined,
  right: OperatorRuntimeRemediationReceipt | null | undefined,
): boolean {
  const leftId = left?.receipt_id?.trim() ?? "";
  const rightId = right?.receipt_id?.trim() ?? "";
  return leftId.length > 0 && leftId === rightId;
}

export function readRuntimeRemediationHistorySummary(args: {
  openCount: number;
  completedCount: number;
  draftCount: number;
  totalCount: number;
}): string {
  return `${args.openCount} open | ${args.completedCount} completed | ${args.draftCount} with drafts | ${args.totalCount} total`;
}

export function readRuntimeRemediationEmptyStateMessage(args: {
  totalCount: number;
  filter: OperatorRuntimeRemediationFilter;
}): string {
  if (args.totalCount === 0) {
    return "No remediation receipts have been issued by this operator yet.";
  }
  if (args.filter === "drafts") {
    return "No remediation receipts currently have saved local completion drafts.";
  }
  return `No ${args.filter} remediation receipts match the current filter.`;
}

export function readRuntimeRemediationRetentionSummary(
  retention: OperatorRuntimeRemediationHistoryResponse["retention"] | null | undefined,
): {
  windowLabel: string;
  rowCapLabel: string;
  rolloverLabel: string | null;
} | null {
  if (!retention) return null;
  const maxAgeDays = Number.isFinite(retention.max_event_age_days) ? retention.max_event_age_days : 0;
  const maxRows = Number.isFinite(retention.max_event_rows_per_user) ? retention.max_event_rows_per_user : 0;
  const rolloverBehavior = retention.rollover_behavior.trim();
  return {
    windowLabel: `${maxAgeDays} day window`,
    rowCapLabel: `Up to ${maxRows.toLocaleString()} receipts per operator`,
    rolloverLabel: rolloverBehavior ? rolloverBehavior.replaceAll("_", " ") : null,
  };
}

export function readRuntimeRemediationFilterOptions(args: {
  openCount: number;
  completedCount: number;
  draftCount: number;
  totalCount: number;
}): Array<{
  filter: OperatorRuntimeRemediationFilter;
  label: string;
  count: number;
}> {
  return [
    { filter: "open", label: "Open", count: args.openCount },
    { filter: "completed", label: "Completed", count: args.completedCount },
    { filter: "all", label: "All", count: args.totalCount },
    { filter: "drafts", label: "Drafts", count: args.draftCount },
  ];
}

export function readRuntimeRemediationRecoveryFilterActions(args: {
  totalCount: number;
  draftCount: number;
  currentFilter: OperatorRuntimeRemediationFilter;
}): Array<{
  filter: Extract<OperatorRuntimeRemediationFilter, "open" | "all" | "drafts">;
  label: string;
}> {
  const actions: Array<{
    filter: Extract<OperatorRuntimeRemediationFilter, "open" | "all" | "drafts">;
    label: string;
  }> = [];
  if (args.totalCount > 0 && args.currentFilter !== "open") {
    actions.push({ filter: "open", label: "Show open receipts" });
  }
  if (args.totalCount > 0 && args.currentFilter !== "all") {
    actions.push({ filter: "all", label: "Show all receipts" });
  }
  if (args.currentFilter !== "drafts" && args.draftCount > 0) {
    actions.push({ filter: "drafts", label: "Show drafted receipts" });
  }
  return actions;
}

export function readRuntimeRemediationSummaryPinLabel(isPinned: boolean): string {
  return isPinned ? "Pinned in summary" : "Show in summary";
}

export function readRuntimeRemediationLifecycleLabel(
  lifecycleStatus: string | null | undefined,
): string {
  const normalized = String(lifecycleStatus ?? "").trim();
  if (!normalized) return "unknown";
  return normalized.replaceAll("_", " ");
}

export function readRuntimeRemediationExecutionModeLabel(
  executionMode: string | null | undefined,
): string {
  const normalized = String(executionMode ?? "").trim();
  if (!normalized) return "unknown";
  return normalized.replaceAll("_", " ");
}

export function readRuntimeRemediationEntryBadges(args: {
  isPinned: boolean;
  isLatest: boolean;
  hasDraft: boolean;
}): Array<{
  tone: "featured" | "latest" | "draft";
  label: string;
}> {
  const badges: Array<{
    tone: "featured" | "latest" | "draft";
    label: string;
  }> = [];
  if (args.isPinned) {
    badges.push({ tone: "featured", label: "Featured in summary" });
  } else if (args.isLatest) {
    badges.push({ tone: "latest", label: "Latest operator action" });
  }
  if (args.hasDraft) {
    badges.push({ tone: "draft", label: "Local draft saved" });
  }
  return badges;
}

export function readFeaturedRuntimeRemediationDraftActions(args: {
  hasLocalDraft: boolean;
  canCompleteFromDraft: boolean;
  completionBusy: boolean;
}): Array<{
  kind: "complete_from_draft" | "show_drafts" | "clear_local_draft";
  label: string;
  tone: "success" | "info" | "neutral";
  disabled: boolean;
}> {
  if (!args.hasLocalDraft) return [];
  const actions: Array<{
    kind: "complete_from_draft" | "show_drafts" | "clear_local_draft";
    label: string;
    tone: "success" | "info" | "neutral";
    disabled: boolean;
  }> = [];
  if (args.canCompleteFromDraft) {
    actions.push({
      kind: "complete_from_draft",
      label: args.completionBusy ? "Completing..." : "Mark completed from draft",
      tone: "success",
      disabled: args.completionBusy,
    });
  }
  actions.push({
    kind: "show_drafts",
    label: "Show drafted receipts",
    tone: "info",
    disabled: false,
  });
  actions.push({
    kind: "clear_local_draft",
    label: "Clear local draft",
    tone: "neutral",
    disabled: false,
  });
  return actions;
}

export function readFeaturedRuntimeRemediationHeading(args: {
  featuredReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  latestReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
}): string {
  if (args.featuredReceipt?.lifecycle_status === "completed") {
    return "Featured completed remediation receipt";
  }
  if (runtimeRemediationReceiptsShareId(args.featuredReceipt, args.latestReceipt)) {
    return "Active remediation receipt";
  }
  return "Featured remediation receipt";
}

export function readFeaturedRuntimeRemediationSourceLabel(args: {
  pinnedReceiptId: string | null | undefined;
  featuredReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  latestReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
}): string {
  const featuredReceiptId = args.featuredReceipt?.receipt_id?.trim() ?? "";
  if (featuredReceiptId && featuredReceiptId === String(args.pinnedReceiptId ?? "").trim()) {
    return "Pinned from remediation history.";
  }
  if (runtimeRemediationReceiptsShareId(args.featuredReceipt, args.latestReceipt)) {
    return "Pinned from the latest operator action.";
  }
  return "Recovered from recent remediation history for continuity.";
}

export function readRuntimeRemediationApprovalLabel(
  receipt: OperatorRuntimeRemediationReceipt | null | undefined,
): string {
  return receipt?.approval_required
    ? "Explicit operator approval recorded before manual execution."
    : "Approval requirement unavailable.";
}

export function readRuntimeRemediationHiddenNotice(args: {
  kind: "latest" | "featured";
  currentFilter: OperatorRuntimeRemediationFilter;
  receipt: OperatorRuntimeRemediationReceipt | null | undefined;
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
}): {
  title: string;
  body: string;
  receiptLabel: string;
  actionLabel: string;
  tone: "amber" | "indigo";
} {
  return {
    title: args.kind === "latest" ? "Latest action hidden" : "Featured receipt hidden",
    body: args.kind === "latest"
      ? `The most recent operator receipt is outside the current \`${args.currentFilter}\` view.`
      : `The summary card points to a receipt outside the current \`${args.currentFilter}\` view.`,
    receiptLabel: args.receipt?.receipt_id ?? "Receipt unavailable",
    actionLabel: readRuntimeRemediationQueueLabelForReceipt({
      receipt: args.receipt,
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
    }),
    tone: args.kind === "latest" ? "amber" : "indigo",
  };
}

export function readRuntimeRemediationNoticeStripModel(args: {
  currentFilter: OperatorRuntimeRemediationFilter;
  latestReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  featuredReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  latestReceiptVisible: boolean;
  featuredReceiptVisible: boolean;
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
}): {
  latestNotice: ReturnType<typeof readRuntimeRemediationHiddenNotice> | null;
  featuredNotice: ReturnType<typeof readRuntimeRemediationHiddenNotice> | null;
} {
  const receiptsShareId = runtimeRemediationReceiptsShareId(args.latestReceipt, args.featuredReceipt);
  const latestHidden = !!args.latestReceipt?.receipt_id && !args.latestReceiptVisible;
  const featuredHidden = !!args.featuredReceipt?.receipt_id && !receiptsShareId && !args.featuredReceiptVisible;

  return {
    latestNotice: latestHidden
      ? readRuntimeRemediationHiddenNotice({
        kind: "latest",
        currentFilter: args.currentFilter,
        receipt: args.latestReceipt,
        outcomeNotes: args.outcomeNotes,
        proofReferences: args.proofReferences,
      })
      : null,
    featuredNotice: featuredHidden
      ? readRuntimeRemediationHiddenNotice({
        kind: "featured",
        currentFilter: args.currentFilter,
        receipt: args.featuredReceipt,
        outcomeNotes: args.outcomeNotes,
        proofReferences: args.proofReferences,
      })
      : null,
  };
}

export function readFeaturedRuntimeRemediationActions(args: {
  featuredReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  pinnedReceiptId: string | null | undefined;
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
}): Array<{
  kind: "show_queue" | "copy_command" | "clear_summary_pin";
  label: string;
}> {
  const actions: Array<{
    kind: "show_queue" | "copy_command" | "clear_summary_pin";
    label: string;
  }> = [
    {
      kind: "show_queue",
      label: readRuntimeRemediationQueueLabelForReceipt({
        receipt: args.featuredReceipt,
        outcomeNotes: args.outcomeNotes,
        proofReferences: args.proofReferences,
      }),
    },
    {
      kind: "copy_command",
      label: "Copy command",
    },
  ];
  const featuredReceiptId = args.featuredReceipt?.receipt_id?.trim() ?? "";
  if (featuredReceiptId && featuredReceiptId === String(args.pinnedReceiptId ?? "").trim()) {
    actions.push({
      kind: "clear_summary_pin",
      label: "Clear summary pin",
    });
  }
  return actions;
}

export function readFeaturedRuntimeRemediationCardModel(args: {
  featuredReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  latestReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  pinnedReceiptId: string | null | undefined;
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
  completionBusyReceiptId: string | null | undefined;
}): {
  receiptId: string | null;
  outcomeDraft: string;
  proofDraft: string;
  hasLocalDraft: boolean;
  canCompleteFromDraft: boolean;
  heading: string;
  sourceLabel: string;
  approvalLabel: string;
  localDraftBadgeLabel: string;
  receiptSectionTitle: string;
  lifecycleSectionTitle: string;
  completionSectionTitle: string;
  localDraftSectionTitle: string;
  proofLabelPrefix: string;
  draftActions: ReturnType<typeof readFeaturedRuntimeRemediationDraftActions>;
  actions: ReturnType<typeof readFeaturedRuntimeRemediationActions>;
} {
  const receiptId = args.featuredReceipt?.receipt_id?.trim() || null;
  const outcomeDraft = receiptId ? args.outcomeNotes[receiptId]?.trim() ?? "" : "";
  const proofDraft = receiptId ? args.proofReferences[receiptId]?.trim() ?? "" : "";
  const hasLocalDraft = receiptId
    ? hasRuntimeRemediationCompletionDraft({
      receiptId,
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
    })
    : false;
  const canCompleteFromDraft = !!receiptId
    && args.featuredReceipt?.lifecycle_status !== "completed"
    && outcomeDraft.length > 0;

  return {
    receiptId,
    outcomeDraft,
    proofDraft,
    hasLocalDraft,
    canCompleteFromDraft,
    heading: readFeaturedRuntimeRemediationHeading({
      featuredReceipt: args.featuredReceipt,
      latestReceipt: args.latestReceipt,
    }),
    sourceLabel: readFeaturedRuntimeRemediationSourceLabel({
      pinnedReceiptId: args.pinnedReceiptId,
      featuredReceipt: args.featuredReceipt,
      latestReceipt: args.latestReceipt,
    }),
    approvalLabel: readRuntimeRemediationApprovalLabel(args.featuredReceipt),
    localDraftBadgeLabel: "Local completion draft saved",
    receiptSectionTitle: "Receipt",
    lifecycleSectionTitle: "Lifecycle",
    completionSectionTitle: "Completion",
    localDraftSectionTitle: "Local completion draft",
    proofLabelPrefix: "Proof:",
    draftActions: readFeaturedRuntimeRemediationDraftActions({
      hasLocalDraft,
      canCompleteFromDraft,
      completionBusy: receiptId === String(args.completionBusyReceiptId ?? "").trim(),
    }),
    actions: readFeaturedRuntimeRemediationActions({
      featuredReceipt: args.featuredReceipt,
      pinnedReceiptId: args.pinnedReceiptId,
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
    }),
  };
}

export function readRuntimeRemediationCompletionForm(args: {
  receiptId: string;
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
  completionBusyReceiptId: string | null | undefined;
}): {
  title: string;
  outcomePlaceholder: string;
  proofPlaceholder: string;
  submitLabel: string;
  submitDisabled: boolean;
  showClearDraft: boolean;
  clearDraftLabel: string;
} {
  const completionBusy = String(args.completionBusyReceiptId ?? "").trim() === args.receiptId.trim();
  return {
    title: "Completion proof",
    outcomePlaceholder: "What was done, what changed, and what was verified?",
    proofPlaceholder: "Proof reference: ticket, artifact path, report link, or notes id",
    submitLabel: completionBusy ? "Completing..." : "Mark completed",
    submitDisabled: completionBusy,
    showClearDraft: hasRuntimeRemediationCompletionDraft({
      receiptId: args.receiptId,
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
    }),
    clearDraftLabel: "Clear local draft",
  };
}

export function readRuntimeRemediationRowActions(args: {
  receiptId: string;
  pinnedReceiptId: string | null | undefined;
}): Array<{
  kind: "pin_summary" | "copy_command";
  label: string;
  tone: "featured" | "neutral";
}> {
  const isPinned = args.receiptId.trim().length > 0
    && args.receiptId.trim() === String(args.pinnedReceiptId ?? "").trim();
  return [
    {
      kind: "pin_summary",
      label: readRuntimeRemediationSummaryPinLabel(isPinned),
      tone: isPinned ? "featured" : "neutral",
    },
    {
      kind: "copy_command",
      label: "Copy command",
      tone: "neutral",
    },
  ];
}

export function readRuntimeRemediationRowModel(args: {
  receipt: OperatorRuntimeRemediationReceipt;
  pinnedReceiptId: string | null | undefined;
  latestReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
  completionBusyReceiptId: string | null | undefined;
}): {
  badges: ReturnType<typeof readRuntimeRemediationEntryBadges>;
  actions: ReturnType<typeof readRuntimeRemediationRowActions>;
  completionForm: ReturnType<typeof readRuntimeRemediationCompletionForm>;
} {
  const receiptId = args.receipt.receipt_id;
  return {
    badges: readRuntimeRemediationEntryBadges({
      isPinned: receiptId.trim() === String(args.pinnedReceiptId ?? "").trim(),
      isLatest: receiptId.trim() === (args.latestReceipt?.receipt_id?.trim() ?? ""),
      hasDraft: hasRuntimeRemediationCompletionDraft({
        receiptId,
        outcomeNotes: args.outcomeNotes,
        proofReferences: args.proofReferences,
      }),
    }),
    actions: readRuntimeRemediationRowActions({
      receiptId,
      pinnedReceiptId: args.pinnedReceiptId,
    }),
    completionForm: readRuntimeRemediationCompletionForm({
      receiptId,
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
      completionBusyReceiptId: args.completionBusyReceiptId,
    }),
  };
}

export function readRuntimeRemediationFeedRow(args: {
  entry: OperatorRuntimeRemediationReceipt;
  rowModel: ReturnType<typeof readRuntimeRemediationRowModel>;
  receiptMetaLine: string;
  executionModeLabel: string;
  artifactSummaryLine: string | null;
  pressureLine: string | null;
  completedAtLabel: string | null;
  outcomeNoteDraft: string;
  proofReferenceDraft: string;
}) {
  return {
    entry: args.entry,
    rowModel: args.rowModel,
    receiptMetaLine: args.receiptMetaLine,
    executionModeLabel: args.executionModeLabel,
    artifactSummaryLine: args.artifactSummaryLine,
    pressureLine: args.pressureLine,
    completedAtLabel: args.completedAtLabel,
    outcomeNoteDraft: args.outcomeNoteDraft,
    proofReferenceDraft: args.proofReferenceDraft,
  };
}

export function readFeaturedRuntimeRemediationSectionModel(args: {
  featuredReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  cardModel: ReturnType<typeof readFeaturedRuntimeRemediationCardModel>;
  issuedAtLabel: string | null | undefined;
  lifecycleLabel: string;
  completedAtLabel: string | null | undefined;
}) {
  if (!args.featuredReceipt) return null;
  return {
    receipt: args.featuredReceipt,
    cardModel: args.cardModel,
    issuedAtLabel: args.issuedAtLabel ?? args.featuredReceipt.issued_at,
    lifecycleLabel: args.lifecycleLabel,
    completedAtLabel: args.completedAtLabel ?? null,
  };
}

export function readRuntimeRemediationHistoryPanelModel(args: {
  openCount: number;
  completedCount: number;
  draftCount: number;
  totalCount: number;
  currentFilter: OperatorRuntimeRemediationFilter;
  retention: OperatorRuntimeRemediationHistoryResponse["retention"] | null | undefined;
  latestReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  featuredReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  latestReceiptVisible: boolean;
  featuredReceiptVisible: boolean;
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
}): {
  historySummary: string;
  filterOptions: ReturnType<typeof readRuntimeRemediationFilterOptions>;
  recoveryActions: ReturnType<typeof readRuntimeRemediationRecoveryFilterActions>;
  retentionSummary: ReturnType<typeof readRuntimeRemediationRetentionSummary>;
  noticeStrip: ReturnType<typeof readRuntimeRemediationNoticeStripModel>;
} {
  return {
    historySummary: readRuntimeRemediationHistorySummary({
      openCount: args.openCount,
      completedCount: args.completedCount,
      draftCount: args.draftCount,
      totalCount: args.totalCount,
    }),
    filterOptions: readRuntimeRemediationFilterOptions({
      openCount: args.openCount,
      completedCount: args.completedCount,
      draftCount: args.draftCount,
      totalCount: args.totalCount,
    }),
    recoveryActions: readRuntimeRemediationRecoveryFilterActions({
      totalCount: args.totalCount,
      draftCount: args.draftCount,
      currentFilter: args.currentFilter,
    }),
    retentionSummary: readRuntimeRemediationRetentionSummary(args.retention),
    noticeStrip: readRuntimeRemediationNoticeStripModel({
      currentFilter: args.currentFilter,
      latestReceipt: args.latestReceipt,
      featuredReceipt: args.featuredReceipt,
      latestReceiptVisible: args.latestReceiptVisible,
      featuredReceiptVisible: args.featuredReceiptVisible,
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
    }),
  };
}

export function prioritizeRuntimeRemediationEntriesWithDrafts(args: {
  entries: readonly OperatorRuntimeRemediationReceipt[];
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
}): OperatorRuntimeRemediationReceipt[] {
  return [...args.entries].sort((left, right) => {
    const leftHasDraft = hasRuntimeRemediationCompletionDraft({
      receiptId: left.receipt_id,
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
    });
    const rightHasDraft = hasRuntimeRemediationCompletionDraft({
      receiptId: right.receipt_id,
      outcomeNotes: args.outcomeNotes,
      proofReferences: args.proofReferences,
    });
    if (leftHasDraft !== rightHasDraft) return leftHasDraft ? -1 : 1;
    return 0;
  });
}

export function selectFeaturedRuntimeRemediationReceipt(args: {
  activeReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  pinnedReceiptId?: string | null | undefined;
  entries: readonly OperatorRuntimeRemediationReceipt[];
  filter: OperatorRuntimeRemediationFilter;
  outcomeNotes?: Readonly<Record<string, string>>;
  proofReferences?: Readonly<Record<string, string>>;
}): OperatorRuntimeRemediationReceipt | null {
  const pinnedReceipt = findRuntimeRemediationReceiptById(args.entries, args.pinnedReceiptId);
  if (pinnedReceipt) return pinnedReceipt;
  const syncedActiveReceipt = findRuntimeRemediationReceiptById(args.entries, args.activeReceipt?.receipt_id);
  if (syncedActiveReceipt) return syncedActiveReceipt;
  const filtered = filterOperatorRuntimeRemediationEntries(args.entries, args.filter, {
    outcomeNotes: args.outcomeNotes ?? {},
    proofReferences: args.proofReferences ?? {},
  });
  const prioritizedFiltered = prioritizeRuntimeRemediationEntriesWithDrafts({
    entries: filtered,
    outcomeNotes: args.outcomeNotes ?? {},
    proofReferences: args.proofReferences ?? {},
  });
  if (prioritizedFiltered.length > 0) return prioritizedFiltered[0] ?? null;
  return args.entries[0] ?? null;
}
