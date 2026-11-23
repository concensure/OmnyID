// @locs-version: 1.0
import type { OperatorRuntimeRemediationFilter } from "@/lib/operatorRuntimeRemediationLocalState";
import type { OperatorRuntimeRemediationShortcutIntent } from "@/lib/operatorRuntimeRemediationKeyboard";
import { readOperatorRuntimeRemediationShortcutCatalogEntry } from "@/lib/operatorRuntimeRemediationKeyboard";

export type OperatorRuntimeRemediationShortcutAction =
  | {
    shortcutId: string;
    kind: "issue_cleanup_receipt";
  }
  | {
    shortcutId: string;
    kind: "complete_receipt";
    receiptId: string;
  }
  | {
    shortcutId: string;
    kind: "focus_featured_queue";
  }
  | {
    shortcutId: string;
    kind: "copy_featured_command";
    command: string;
  }
  | {
    shortcutId: string;
    kind: "set_filter";
    filter: OperatorRuntimeRemediationFilter;
  }
  | {
    shortcutId: string;
    kind: "clear_featured_receipt";
  }
  | {
    shortcutId: string;
    kind: "clear_all_local_drafts";
  };

export function readOperatorRuntimeRemediationShortcutAction(args: {
  intent: OperatorRuntimeRemediationShortcutIntent;
  featuredReceiptId: string | null | undefined;
  featuredCommand: string | null | undefined;
  featuredDraftReceiptId: string | null | undefined;
  canCompleteFeaturedDraft: boolean;
}): OperatorRuntimeRemediationShortcutAction | null {
  const shortcutId = readOperatorRuntimeRemediationShortcutCatalogEntry(args.intent).id;
  switch (args.intent) {
    case "issue_cleanup_receipt":
      return { shortcutId, kind: "issue_cleanup_receipt" };
    case "complete_featured_receipt_from_draft": {
      const receiptId = String(args.featuredDraftReceiptId ?? "").trim();
      if (!receiptId || !args.canCompleteFeaturedDraft) return null;
      return {
        shortcutId,
        kind: "complete_receipt",
        receiptId,
      };
    }
    case "focus_featured_receipt_queue":
      return String(args.featuredReceiptId ?? "").trim()
        ? { shortcutId, kind: "focus_featured_queue" }
        : null;
    case "copy_featured_receipt_command": {
      const command = String(args.featuredCommand ?? "").trim();
      return command
        ? { shortcutId, kind: "copy_featured_command", command }
        : null;
    }
    case "filter_open":
      return { shortcutId, kind: "set_filter", filter: "open" };
    case "filter_completed":
      return { shortcutId, kind: "set_filter", filter: "completed" };
    case "filter_all":
      return { shortcutId, kind: "set_filter", filter: "all" };
    case "filter_drafts":
      return { shortcutId, kind: "set_filter", filter: "drafts" };
    case "clear_featured_receipt":
      return { shortcutId, kind: "clear_featured_receipt" };
    case "clear_all_local_drafts":
      return { shortcutId, kind: "clear_all_local_drafts" };
  }
}
