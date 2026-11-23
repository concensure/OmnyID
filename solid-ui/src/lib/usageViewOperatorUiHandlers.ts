// @locs-version: 1.0
import {
  readOperatorQueryApplyState,
  readOperatorQueryClearState,
  readOperatorQueryShortcutState,
  readRuntimeRemediationAllDraftsClearPersistenceState,
  readRuntimeRemediationDraftClearPersistenceState,
  readRuntimeRemediationDraftPersistenceState,
} from "@/lib/usageViewOperatorInteractionState";
import { readOperatorQueryShortcutAction } from "@/lib/usageViewInteractionState";
import { commitRuntimeRemediationDraftState } from "@/lib/usageViewStateCommitters";
import type { OperatorQueryShortcutAction } from "@/lib/usageViewInteractionState";
import type { OperatorRuntimeRemediationDraftMaps } from "@/lib/operatorRuntimeRemediationDraftState";
import type { OperatorRuntimeRemediationFilter } from "@/lib/operatorRuntimeRemediationLocalState";

export function applyUsageViewOperatorQuery(args: {
  queryDraft: string;
  setOperatorQuery: (value: string) => void;
  refreshOperatorPanel: () => void;
}): void {
  args.setOperatorQuery(readOperatorQueryApplyState(args.queryDraft).query);
  args.refreshOperatorPanel();
}

export function clearUsageViewOperatorQuery(args: {
  setOperatorQueryDraft: (value: string) => void;
  setOperatorQuery: (value: string) => void;
  refreshOperatorPanel: () => void;
}): void {
  const nextState = readOperatorQueryClearState();
  args.setOperatorQueryDraft(nextState.queryDraft);
  args.setOperatorQuery(nextState.query);
  args.refreshOperatorPanel();
}

export function handleUsageViewOperatorQueryShortcut(args: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  loading: boolean;
  queryDraft: string;
  preventDefault: () => void;
  recordShortcutUse: (shortcutId: OperatorQueryShortcutAction["shortcutId"]) => void;
  clearOperatorQuery: () => void;
  setOperatorQuery: (value: string) => void;
  refreshOperatorPanel: () => void;
}): boolean {
  const shortcutAction = readOperatorQueryShortcutAction({
    key: args.key,
    ctrlKey: args.ctrlKey,
    metaKey: args.metaKey,
    loading: args.loading,
    queryDraft: args.queryDraft,
  });
  if (!shortcutAction) return false;
  args.preventDefault();
  args.recordShortcutUse(shortcutAction.shortcutId);
  const nextState = readOperatorQueryShortcutState({ shortcutAction });
  if (nextState.shouldClear) {
    args.clearOperatorQuery();
    return true;
  }
  args.setOperatorQuery(nextState.query);
  args.refreshOperatorPanel();
  return true;
}

export function updateUsageViewRuntimeRemediationDraft(args: {
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  receiptId: string;
  value: string;
  field: "outcome" | "proof";
  persistRuntimeRemediationOutcomeNotes: (value: Record<string, string>) => void;
  persistRuntimeRemediationProofReferences: (value: Record<string, string>) => void;
  persistRuntimeRemediationFilter: (value: OperatorRuntimeRemediationFilter) => void;
}): void {
  commitRuntimeRemediationDraftState({
    state: readRuntimeRemediationDraftPersistenceState({
      drafts: args.drafts,
      currentFilter: args.currentFilter,
      receiptId: args.receiptId,
      value: args.value,
      field: args.field,
    }),
    persistRuntimeRemediationOutcomeNotes: args.persistRuntimeRemediationOutcomeNotes,
    persistRuntimeRemediationProofReferences: args.persistRuntimeRemediationProofReferences,
    persistRuntimeRemediationFilter: args.persistRuntimeRemediationFilter,
  });
}

export function clearUsageViewRuntimeRemediationDraft(args: {
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  receiptId: string;
  persistRuntimeRemediationOutcomeNotes: (value: Record<string, string>) => void;
  persistRuntimeRemediationProofReferences: (value: Record<string, string>) => void;
  persistRuntimeRemediationFilter: (value: OperatorRuntimeRemediationFilter) => void;
}): void {
  commitRuntimeRemediationDraftState({
    state: readRuntimeRemediationDraftClearPersistenceState({
      drafts: args.drafts,
      currentFilter: args.currentFilter,
      receiptId: args.receiptId,
    }),
    persistRuntimeRemediationOutcomeNotes: args.persistRuntimeRemediationOutcomeNotes,
    persistRuntimeRemediationProofReferences: args.persistRuntimeRemediationProofReferences,
    persistRuntimeRemediationFilter: args.persistRuntimeRemediationFilter,
  });
}

export function clearAllUsageViewRuntimeRemediationDrafts(args: {
  currentFilter: OperatorRuntimeRemediationFilter;
  persistRuntimeRemediationOutcomeNotes: (value: Record<string, string>) => void;
  persistRuntimeRemediationProofReferences: (value: Record<string, string>) => void;
  persistRuntimeRemediationFilter: (value: OperatorRuntimeRemediationFilter) => void;
}): void {
  commitRuntimeRemediationDraftState({
    state: readRuntimeRemediationAllDraftsClearPersistenceState(args.currentFilter),
    persistRuntimeRemediationOutcomeNotes: args.persistRuntimeRemediationOutcomeNotes,
    persistRuntimeRemediationProofReferences: args.persistRuntimeRemediationProofReferences,
    persistRuntimeRemediationFilter: args.persistRuntimeRemediationFilter,
  });
}
