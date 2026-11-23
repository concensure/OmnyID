// @locs-version: 1.0
import type { OperatorRuntimeRemediationReceipt } from "@/lib/api";
import {
  type OperatorRuntimeRemediationFilter,
  saveOperatorRuntimeRemediationFeaturedReceiptId,
  saveOperatorRuntimeRemediationFilter,
  saveOperatorRuntimeRemediationOutcomeNotes,
  saveOperatorRuntimeRemediationProofReferences,
} from "@/lib/operatorRuntimeRemediationLocalState";
import {
  persistUsageViewRuntimeRemediationFeaturedReceiptId,
  persistUsageViewRuntimeRemediationFilter,
  persistUsageViewRuntimeRemediationOutcomeNotes,
  persistUsageViewRuntimeRemediationProofReferences,
} from "@/lib/usageViewOperatorLocalPersistence";
import { readUsageViewOperatorRemediationSyncState } from "@/lib/usageViewOperatorRemediationSyncState";
import type { OperatorRuntimeRemediationDraftMaps } from "@/lib/operatorRuntimeRemediationDraftState";

export function readUsageViewOperatorRemediationPersistenceAdapters(args: {
  operatorRuntimeRemediationUserId: () => string | null;
  setRuntimeRemediationFilter: (value: OperatorRuntimeRemediationFilter) => void;
  setRuntimeRemediationFeaturedReceiptId: (value: string | null) => void;
  setRuntimeRemediationOutcomeNotes: (value: Record<string, string>) => void;
  setRuntimeRemediationProofReferences: (value: Record<string, string>) => void;
}) {
  return {
    persistRuntimeRemediationFilter: (value: OperatorRuntimeRemediationFilter) => {
      persistUsageViewRuntimeRemediationFilter({
        value,
        setRuntimeRemediationFilter: args.setRuntimeRemediationFilter,
        saveRuntimeRemediationFilter: (nextValue) =>
          saveOperatorRuntimeRemediationFilter(args.operatorRuntimeRemediationUserId(), nextValue),
      });
    },
    persistRuntimeRemediationFeaturedReceiptId: (receiptId: string | null | undefined) => {
      persistUsageViewRuntimeRemediationFeaturedReceiptId({
        receiptId,
        setRuntimeRemediationFeaturedReceiptId: args.setRuntimeRemediationFeaturedReceiptId,
        saveRuntimeRemediationFeaturedReceiptId: (nextValue) =>
          saveOperatorRuntimeRemediationFeaturedReceiptId(args.operatorRuntimeRemediationUserId(), nextValue),
      });
    },
    persistRuntimeRemediationOutcomeNotes: (value: Record<string, string>) => {
      persistUsageViewRuntimeRemediationOutcomeNotes({
        value,
        setRuntimeRemediationOutcomeNotes: args.setRuntimeRemediationOutcomeNotes,
        saveRuntimeRemediationOutcomeNotes: (nextValue) =>
          saveOperatorRuntimeRemediationOutcomeNotes(args.operatorRuntimeRemediationUserId(), nextValue),
      });
    },
    persistRuntimeRemediationProofReferences: (value: Record<string, string>) => {
      persistUsageViewRuntimeRemediationProofReferences({
        value,
        setRuntimeRemediationProofReferences: args.setRuntimeRemediationProofReferences,
        saveRuntimeRemediationProofReferences: (nextValue) =>
          saveOperatorRuntimeRemediationProofReferences(args.operatorRuntimeRemediationUserId(), nextValue),
      });
    },
  };
}

export function syncUsageViewOperatorRemediationPersistence(args: {
  entries: readonly OperatorRuntimeRemediationReceipt[];
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  featuredReceiptId: string | null | undefined;
  activeReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
  persistRuntimeRemediationOutcomeNotes: (value: Record<string, string>) => void;
  persistRuntimeRemediationProofReferences: (value: Record<string, string>) => void;
  persistRuntimeRemediationFilter: (value: OperatorRuntimeRemediationFilter) => void;
  persistRuntimeRemediationFeaturedReceiptId: (value: string | null | undefined) => void;
  setRuntimeRemediationReceipt: (
    updater: (
      current: OperatorRuntimeRemediationReceipt | null,
    ) => OperatorRuntimeRemediationReceipt | null,
  ) => void;
}): void {
  const syncState = readUsageViewOperatorRemediationSyncState({
    entries: args.entries,
    drafts: args.drafts,
    currentFilter: args.currentFilter,
    featuredReceiptId: args.featuredReceiptId,
    activeReceipt: args.activeReceipt,
  });
  if (syncState.shouldPersistOutcomeNotes) {
    args.persistRuntimeRemediationOutcomeNotes(syncState.outcomeNotes);
  }
  if (syncState.shouldPersistProofReferences) {
    args.persistRuntimeRemediationProofReferences(syncState.proofReferences);
  }
  if (syncState.shouldPersistFilter) {
    args.persistRuntimeRemediationFilter(syncState.filter);
  }
  if (syncState.shouldPersistFeaturedReceiptId) {
    args.persistRuntimeRemediationFeaturedReceiptId(syncState.featuredReceiptId);
  }
  if (syncState.syncedActiveReceipt) {
    args.setRuntimeRemediationReceipt((current) => {
      if (!current || current.receipt_id !== syncState.syncedActiveReceipt?.receipt_id) return current;
      return syncState.syncedActiveReceipt;
    });
  }
}
