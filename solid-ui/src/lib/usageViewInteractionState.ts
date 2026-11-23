// @locs-version: 1.0
import {
  buildUsageViewFailureReceipt,
  type UsageViewFailureReceipt,
} from "@/lib/usageViewFailureState";

export type UsageViewBillingBusyAction = "checkout" | "portal" | "copy" | null;
export type UsageViewOperationalCommandLabel = "workspace" | "operator";

export type OperatorQueryShortcutAction =
  | {
    kind: "clear";
    shortcutId: "form_cancel";
  }
  | {
    kind: "submit";
    shortcutId: "form_submit";
    query: string;
  };

export function readOperatorQueryShortcutAction(args: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  loading: boolean;
  queryDraft: string;
}): OperatorQueryShortcutAction | null {
  if (args.key === "Escape" && !args.loading) {
    return {
      kind: "clear",
      shortcutId: "form_cancel",
    };
  }
  if ((args.ctrlKey || args.metaKey) && args.key === "Enter") {
    return {
      kind: "submit",
      shortcutId: "form_submit",
      query: args.queryDraft.trim(),
    };
  }
  return null;
}

export function shouldBlockBillingInteraction(args: {
  modeSaving: boolean;
  busyAction: UsageViewBillingBusyAction;
  requiresBilling?: boolean;
  hasBilling?: boolean;
}): boolean {
  if (args.modeSaving || args.busyAction !== null) return true;
  if (args.requiresBilling) return !args.hasBilling;
  return false;
}

export function readUsageViewClipboardUnavailableFailure(actionTitle: string): UsageViewFailureReceipt {
  return buildUsageViewFailureReceipt(
    actionTitle,
    "Clipboard writeText is not available in this browser.",
  );
}

export function readUsageViewAsyncFailureReceipt(
  actionTitle: string,
  fallbackSummary: string,
  error: unknown,
): UsageViewFailureReceipt {
  return buildUsageViewFailureReceipt(
    actionTitle,
    error instanceof Error ? error.message : fallbackSummary,
  );
}

export function readOperationalCommandCopiedNotice(label: UsageViewOperationalCommandLabel): string {
  return label === "operator"
    ? "Operator cleanup command copied."
    : "Cleanup command copied.";
}

export function readUpgradeRequestCopiedNotice(): string {
  return "Upgrade request details copied.";
}
