// @locs-version: 1.0
import type { OperatorRuntimeRemediationFilter } from "@/lib/operatorRuntimeRemediationLocalState";
import type { OperatorRuntimeRemediationReceipt } from "@/lib/api";
import type { OperatorQueryShortcutAction } from "@/lib/usageViewInteractionState";
import {
  readRuntimeRemediationAllDraftsClearedState,
  readRuntimeRemediationDraftClearedState,
  readRuntimeRemediationDraftUpdate,
  readRuntimeRemediationPostCompletionState,
  type OperatorRuntimeRemediationDraftMaps,
} from "@/lib/operatorRuntimeRemediationDraftState";

export function readOperatorQueryApplyState(queryDraft: string): {
  query: string;
} {
  return {
    query: queryDraft.trim(),
  };
}

export function readOperatorQueryClearState(): {
  queryDraft: string;
  query: string;
} {
  return {
    queryDraft: "",
    query: "",
  };
}

export function readOperatorQueryShortcutState(args: {
  shortcutAction: OperatorQueryShortcutAction;
}): {
  queryDraft: string | null;
  query: string;
  shouldClear: boolean;
} {
  if (args.shortcutAction.kind === "clear") {
    return {
      queryDraft: "",
      query: "",
      shouldClear: true,
    };
  }
  return {
    queryDraft: null,
    query: args.shortcutAction.query,
    shouldClear: false,
  };
}

export function readRuntimeRemediationDraftPersistenceState(args: {
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  receiptId: string;
  value: string;
  field: "outcome" | "proof";
}) {
  return readRuntimeRemediationDraftUpdate(args);
}

export function readRuntimeRemediationDraftClearPersistenceState(args: {
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  receiptId: string;
}) {
  return readRuntimeRemediationDraftClearedState(args);
}

export function readRuntimeRemediationAllDraftsClearPersistenceState(
  currentFilter: OperatorRuntimeRemediationFilter,
) {
  return readRuntimeRemediationAllDraftsClearedState(currentFilter);
}

export function readRuntimeRemediationCompletionPersistenceState(args: {
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  entries: readonly OperatorRuntimeRemediationReceipt[];
  completedReceiptId: string;
}) {
  return readRuntimeRemediationPostCompletionState(args);
}
