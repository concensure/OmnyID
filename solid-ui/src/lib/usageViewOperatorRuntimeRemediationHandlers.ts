// @locs-version: 1.0
import { readOperatorRuntimeRemediationShortcutIntent } from "@/lib/operatorRuntimeRemediationKeyboard";
import { readOperatorRuntimeRemediationShortcutAction } from "@/lib/operatorRuntimeRemediationShortcutState";
import { handleUsageOperatorRuntimeRemediationShortcutAction } from "@/lib/usageViewRenderActionState";
import type { OperatorRuntimeRemediationReceipt } from "@/lib/api";
import type { OperatorRuntimeRemediationFilter } from "@/lib/operatorRuntimeRemediationLocalState";

export function focusUsageViewRuntimeRemediationQueueForReceipt(args: {
  receipt: OperatorRuntimeRemediationReceipt | null | undefined;
  nextFilterForReceipt: (receipt: OperatorRuntimeRemediationReceipt | null | undefined) => OperatorRuntimeRemediationFilter;
  persistRuntimeRemediationFilter: (value: OperatorRuntimeRemediationFilter) => void;
}): void {
  args.persistRuntimeRemediationFilter(args.nextFilterForReceipt(args.receipt));
}

export function handleUsageViewOperatorRuntimeRemediationKeyDown(args: {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
  target: EventTarget | null;
  preventDefault: () => void;
  featuredReceiptId: string | null;
  featuredCommand: string | null | undefined;
  featuredDraftReceiptId: string | null;
  canCompleteFeaturedDraft: boolean;
  recordShortcutUse: (shortcutId: string) => void;
  issueReceipt: () => void;
  completeReceipt: (receiptId: string) => void;
  focusFeaturedQueue: () => void;
  copyOperationalCommand: (command: string, label: "operator") => void;
  setFilter: (filter: OperatorRuntimeRemediationFilter) => void;
  clearFeaturedReceipt: () => void;
  clearAllDrafts: () => void;
}): boolean {
  const intent = readOperatorRuntimeRemediationShortcutIntent({
    altKey: args.altKey,
    ctrlKey: args.ctrlKey,
    metaKey: args.metaKey,
    shiftKey: args.shiftKey,
    key: args.key,
    target: args.target,
  });
  if (!intent) return false;
  const shortcutAction = readOperatorRuntimeRemediationShortcutAction({
    intent,
    featuredReceiptId: args.featuredReceiptId,
    featuredCommand: args.featuredCommand,
    featuredDraftReceiptId: args.featuredDraftReceiptId,
    canCompleteFeaturedDraft: args.canCompleteFeaturedDraft,
  });
  if (!shortcutAction) return false;
  args.preventDefault();
  args.recordShortcutUse(shortcutAction.shortcutId);
  handleUsageOperatorRuntimeRemediationShortcutAction({
    shortcutAction,
    issueReceipt: args.issueReceipt,
    completeReceipt: args.completeReceipt,
    focusFeaturedQueue: args.focusFeaturedQueue,
    copyOperationalCommand: args.copyOperationalCommand,
    setFilter: args.setFilter,
    clearFeaturedReceipt: args.clearFeaturedReceipt,
    clearAllDrafts: args.clearAllDrafts,
  });
  return true;
}
