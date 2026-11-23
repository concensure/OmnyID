// @locs-version: 1.0
import type { OperatorRuntimeRemediationReceipt } from "@/lib/api";
import type { OperatorRuntimeRemediationFilter } from "@/lib/operatorRuntimeRemediationLocalState";
import {
  readPrunedRuntimeRemediationDraftState,
  type OperatorRuntimeRemediationDraftMaps,
} from "@/lib/operatorRuntimeRemediationDraftState";

export function readUsageViewOperatorRemediationSyncState(args: {
  entries: readonly OperatorRuntimeRemediationReceipt[];
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  featuredReceiptId: string | null | undefined;
  activeReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
}) {
  const nextState = readPrunedRuntimeRemediationDraftState(args);
  const currentOutcomeNotes = JSON.stringify(args.drafts.outcomeNotes);
  const nextOutcomeNotes = JSON.stringify(nextState.outcomeNotes);
  const currentProofReferences = JSON.stringify(args.drafts.proofReferences);
  const nextProofReferences = JSON.stringify(nextState.proofReferences);

  return {
    outcomeNotes: nextState.outcomeNotes,
    proofReferences: nextState.proofReferences,
    filter: nextState.filter,
    featuredReceiptId: nextState.featuredReceiptId,
    syncedActiveReceipt: nextState.syncedActiveReceipt,
    shouldPersistOutcomeNotes: currentOutcomeNotes !== nextOutcomeNotes,
    shouldPersistProofReferences: currentProofReferences !== nextProofReferences,
    shouldPersistFilter: args.currentFilter !== nextState.filter,
    shouldPersistFeaturedReceiptId: args.featuredReceiptId !== nextState.featuredReceiptId,
  };
}
