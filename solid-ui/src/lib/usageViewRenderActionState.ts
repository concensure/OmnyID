// @locs-version: 1.0
import type { UsageFeaturedRuntimeRemediationCardProps } from "@/components/UsageFeaturedRuntimeRemediationCard";
import type { OperatorRuntimeRemediationShortcutAction } from "@/lib/operatorRuntimeRemediationShortcutState";

export function handleUsageFeaturedReceiptAction(args: {
  actionKind: Parameters<UsageFeaturedRuntimeRemediationCardProps["onAction"]>[0];
  featuredCommand: string | null | undefined;
  focusFeaturedQueue: () => void;
  copyOperatorCommand: (command: string | null | undefined) => void;
  clearFeaturedReceipt: () => void;
}): void {
  if (args.actionKind === "show_queue") {
    args.focusFeaturedQueue();
    return;
  }
  if (args.actionKind === "copy_command") {
    args.copyOperatorCommand(args.featuredCommand);
    return;
  }
  args.clearFeaturedReceipt();
}

export function handleUsageFeaturedDraftAction(args: {
  actionKind: Parameters<UsageFeaturedRuntimeRemediationCardProps["onDraftAction"]>[0];
  receiptId: string | null;
  completeReceipt: (receiptId: string) => void;
  showDrafts: () => void;
  clearDraft: (receiptId: string) => void;
}): void {
  if (args.actionKind === "complete_from_draft") {
    if (!args.receiptId) return;
    args.completeReceipt(args.receiptId);
    return;
  }
  if (args.actionKind === "show_drafts") {
    args.showDrafts();
    return;
  }
  if (!args.receiptId) return;
  args.clearDraft(args.receiptId);
}

export function handleUsageClearUserFilter(args: {
  recordClearShortcut: () => void;
  clearOperatorQuery: () => void;
}): void {
  args.recordClearShortcut();
  args.clearOperatorQuery();
}

export function handleUsageCloseUserDetail(args: {
  clearSelectedUser: () => void;
  clearOperatorActionError: () => void;
}): void {
  args.clearSelectedUser();
  args.clearOperatorActionError();
}

export function handleUsageOperatorRuntimeRemediationShortcutAction(args: {
  shortcutAction: OperatorRuntimeRemediationShortcutAction;
  issueReceipt: () => void;
  completeReceipt: (receiptId: string) => void;
  focusFeaturedQueue: () => void;
  copyOperationalCommand: (command: string, label: "operator") => void;
  setFilter: (filter: "open" | "completed" | "drafts" | "all") => void;
  clearFeaturedReceipt: () => void;
  clearAllDrafts: () => void;
}): void {
  switch (args.shortcutAction.kind) {
    case "issue_cleanup_receipt":
      args.issueReceipt();
      return;
    case "complete_receipt":
      args.completeReceipt(args.shortcutAction.receiptId);
      return;
    case "focus_featured_queue":
      args.focusFeaturedQueue();
      return;
    case "copy_featured_command":
      args.copyOperationalCommand(args.shortcutAction.command, "operator");
      return;
    case "set_filter":
      args.setFilter(args.shortcutAction.filter);
      return;
    case "clear_featured_receipt":
      args.clearFeaturedReceipt();
      return;
    case "clear_all_local_drafts":
      args.clearAllDrafts();
      return;
  }
}
