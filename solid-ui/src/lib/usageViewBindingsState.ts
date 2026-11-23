// @locs-version: 1.0
import { readBillingOperationalGuidanceCard } from "@/lib/billingOperationalGuidanceState";
import {
  handleUsageClearUserFilter,
  handleUsageCloseUserDetail,
  handleUsageFeaturedDraftAction,
  handleUsageFeaturedReceiptAction,
} from "@/lib/usageViewRenderActionState";
import type { BillingStatus, OperatorRuntimeRemediationReceipt } from "@/lib/api";

export function readUsageViewCopyWorkspaceOperationalCommand(args: {
  billing: BillingStatus | null | undefined;
  copyOperationalCommand: (command: string | null | undefined, label: "workspace") => Promise<void>;
}): () => void {
  return () => void args.copyOperationalCommand(
    readBillingOperationalGuidanceCard(args.billing)?.command,
    "workspace",
  );
}

export function readUsageViewCopyOperatorCommand(args: {
  copyOperationalCommand: (command: string | null | undefined, label: "operator") => Promise<void>;
}): (command: string | null | undefined) => void {
  return (command) => void args.copyOperationalCommand(command, "operator");
}

export function readUsageViewFeaturedReceiptActionHandler(args: {
  featuredCommand: () => string | null | undefined;
  focusFeaturedQueue: () => void;
  copyOperatorCommand: (command: string | null | undefined) => void;
  clearFeaturedReceipt: () => void;
}): (actionKind: "show_queue" | "copy_command" | "clear_summary_pin") => void {
  return (actionKind) => {
    handleUsageFeaturedReceiptAction({
      actionKind,
      featuredCommand: args.featuredCommand(),
      focusFeaturedQueue: args.focusFeaturedQueue,
      copyOperatorCommand: args.copyOperatorCommand,
      clearFeaturedReceipt: args.clearFeaturedReceipt,
    });
  };
}

export function readUsageViewFeaturedDraftActionHandler(args: {
  completeReceipt: (receiptId: string) => void;
  showDrafts: () => void;
  clearDraft: (receiptId: string) => void;
}): (actionKind: "complete_from_draft" | "show_drafts" | "clear_local_draft", receiptId: string | null) => void {
  return (actionKind, receiptId) => {
    handleUsageFeaturedDraftAction({
      actionKind,
      receiptId,
      completeReceipt: args.completeReceipt,
      showDrafts: args.showDrafts,
      clearDraft: args.clearDraft,
    });
  };
}

export function readUsageViewClearUserFilterHandler(args: {
  recordClearShortcut: () => void;
  clearOperatorQuery: () => void;
}): () => void {
  return () => {
    handleUsageClearUserFilter({
      recordClearShortcut: args.recordClearShortcut,
      clearOperatorQuery: args.clearOperatorQuery,
    });
  };
}

export function readUsageViewCloseUserDetailHandler(args: {
  clearSelectedUser: () => void;
  clearOperatorActionError: () => void;
}): () => void {
  return () => {
    handleUsageCloseUserDetail({
      clearSelectedUser: args.clearSelectedUser,
      clearOperatorActionError: args.clearOperatorActionError,
    });
  };
}

export function readUsageViewFocusFeaturedQueueHandler(args: {
  focusQueueForReceipt: (receipt: OperatorRuntimeRemediationReceipt | null | undefined) => void;
  featuredReceipt: () => OperatorRuntimeRemediationReceipt | null | undefined;
}): () => void {
  return () => {
    args.focusQueueForReceipt(args.featuredReceipt());
  };
}

export function readUsageViewFocusLatestQueueHandler(args: {
  focusQueueForReceipt: (receipt: OperatorRuntimeRemediationReceipt | null | undefined) => void;
  latestReceipt: () => OperatorRuntimeRemediationReceipt | null | undefined;
}): () => void {
  return () => {
    args.focusQueueForReceipt(args.latestReceipt());
  };
}
