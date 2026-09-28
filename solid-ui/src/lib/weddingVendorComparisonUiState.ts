// @locs-version: 1.0
import type {
  WeddingDecisionSelectionOption,
  WeddingDecisionSelectionState,
} from "@/lib/weddingDecisionSelectionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export type WeddingVendorComparisonRowActionState = {
  optionId: string;
  vendorLabel: string;
  selected: boolean;
  selectLabel: string;
  selectAriaLabel: string;
  sourceUrl: string | null;
  sourceLabel: string | null;
};

export type WeddingVendorComparisonFooterActionState = {
  selectedCount: number;
  unselectedCount: number;
  summaryLabel: string;
  consequenceLabel: string;
  actionLabel: string;
  enabled: boolean;
  targetMenu: WeddingWorkspaceMenuId;
  actionKind: "review_follow_up_queue";
};

export type WeddingVendorComparisonExpansionState = {
  defaultVisibleCount: number;
  totalCount: number;
  hiddenCount: number;
  canExpand: boolean;
  expanded: boolean;
  summaryLabel: string | null;
  actionLabel: string | null;
};

export type WeddingVendorComparisonUiState = {
  dynamic: boolean;
  rowActions: WeddingVendorComparisonRowActionState[];
  visibleOptions: WeddingDecisionSelectionOption[];
  expansion: WeddingVendorComparisonExpansionState;
  footer: WeddingVendorComparisonFooterActionState;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function weddingVendorComparisonSourceUrl(
  option: Pick<WeddingDecisionSelectionOption, "cells">,
  headers: readonly string[],
): string | null {
  const sourceIndex = headers.findIndex((header) => /\b(source|url|website|link)\b/i.test(header));
  const value = sourceIndex >= 0
    ? option.cells[sourceIndex]
    : option.cells.find((cell) => /^https?:\/\//i.test(clean(cell)));
  const url = clean(value);
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "::1") return null;
    return parsed.href;
  } catch {
    return null;
  }
}

export function buildWeddingVendorComparisonUiState(input: {
  decision: WeddingDecisionSelectionState;
  headers: readonly string[];
  comparisonHandoffAvailable?: boolean | null;
  expanded?: boolean | null;
  defaultVisibleCount?: number | null;
}): WeddingVendorComparisonUiState {
  const dynamic = input.decision.eligible && input.decision.options.length > 1;
  const defaultVisibleCount = Math.max(1, Math.min(5, input.defaultVisibleCount ?? 3));
  const expansionEligible = Boolean(input.comparisonHandoffAvailable)
    && input.decision.selectedOptions.length === 0
    && input.decision.visibleOptions.length > defaultVisibleCount;
  const expanded = input.expanded === true || !expansionEligible;
  const visibleOptions = expansionEligible && !expanded
    ? input.decision.visibleOptions.slice(0, defaultVisibleCount)
    : input.decision.visibleOptions;
  const hiddenCount = expansionEligible && !expanded
    ? Math.max(0, input.decision.visibleOptions.length - defaultVisibleCount)
    : 0;
  const rowActions = dynamic
    ? input.decision.options.map((option) => {
      const sourceUrl = weddingVendorComparisonSourceUrl(option, input.headers);
      return {
        optionId: option.id,
        vendorLabel: option.label,
        selected: option.selected,
        selectLabel: option.selected ? "Selected for follow-up" : "Select for follow-up",
        selectAriaLabel: `${option.selected ? "Remove" : "Select"} ${option.label} for approval-gated follow-up`,
        sourceUrl,
        sourceLabel: sourceUrl ? `Open ${option.label} source` : null,
      };
    })
    : [];
  const selectedCount = input.decision.selectedOptions.length;
  const unselectedCount = Math.max(0, input.decision.options.length - selectedCount);
  return {
    dynamic,
    rowActions,
    visibleOptions,
    expansion: {
      defaultVisibleCount,
      totalCount: input.decision.visibleOptions.length,
      hiddenCount,
      canExpand: expansionEligible,
      expanded,
      summaryLabel: hiddenCount > 0
        ? `Showing the top ${defaultVisibleCount} choices first. ${hiddenCount} more source-backed option${hiddenCount === 1 ? "" : "s"} available.`
        : null,
      actionLabel: hiddenCount > 0 ? `Show top ${input.decision.visibleOptions.length}` : null,
    },
    footer: {
      selectedCount,
      unselectedCount,
      summaryLabel: selectedCount > 0
        ? `${selectedCount} vendor${selectedCount === 1 ? "" : "s"} selected for approval-gated follow-up`
        : "Select one or more vendors to prepare follow-up",
      consequenceLabel: selectedCount > 0
        ? `${unselectedCount} unselected vendor${unselectedCount === 1 ? "" : "s"} will leave active queues; selected vendors continue to follow-up.`
        : "No vendor follow-up will be prepared until at least one row is selected.",
      actionLabel: selectedCount > 0 ? "Review follow-up in queue" : "Choose vendors first",
      enabled: selectedCount > 0,
      targetMenu: "response_queue",
      actionKind: "review_follow_up_queue",
    },
  };
}
