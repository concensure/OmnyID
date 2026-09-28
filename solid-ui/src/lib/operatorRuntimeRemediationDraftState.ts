// @locs-version: 1.0
import type { OperatorRuntimeRemediationReceipt } from "@/lib/api";
import type { OperatorRuntimeRemediationFilter } from "@/lib/operatorRuntimeRemediationLocalState";
import {
  clearRuntimeRemediationDraftEntry,
  findRuntimeRemediationReceiptById,
  nextRuntimeRemediationFilterAfterCompletion,
  nextRuntimeRemediationFilterAfterDraftsChange,
  pruneRuntimeRemediationDraftMap,
} from "@/lib/operatorRuntimeRemediationViewState";

export type OperatorRuntimeRemediationDraftMaps = {
  outcomeNotes: Readonly<Record<string, string>>;
  proofReferences: Readonly<Record<string, string>>;
};

export function readPrunedRuntimeRemediationDraftState(args: {
  entries: readonly OperatorRuntimeRemediationReceipt[];
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  featuredReceiptId: string | null | undefined;
  activeReceipt: OperatorRuntimeRemediationReceipt | null | undefined;
}): {
  outcomeNotes: Record<string, string>;
  proofReferences: Record<string, string>;
  filter: OperatorRuntimeRemediationFilter;
  featuredReceiptId: string | null;
  syncedActiveReceipt: OperatorRuntimeRemediationReceipt | null;
} {
  const outcomeNotes = pruneRuntimeRemediationDraftMap(args.drafts.outcomeNotes, args.entries);
  const proofReferences = pruneRuntimeRemediationDraftMap(args.drafts.proofReferences, args.entries);
  return {
    outcomeNotes,
    proofReferences,
    filter: nextRuntimeRemediationFilterAfterDraftsChange(args.currentFilter, {
      outcomeNotes,
      proofReferences,
    }),
    featuredReceiptId: findRuntimeRemediationReceiptById(args.entries, args.featuredReceiptId)?.receipt_id ?? null,
    syncedActiveReceipt: findRuntimeRemediationReceiptById(args.entries, args.activeReceipt?.receipt_id),
  };
}

export function readRuntimeRemediationDraftUpdate(args: {
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  receiptId: string;
  value: string;
  field: "outcome" | "proof";
}): {
  outcomeNotes: Record<string, string>;
  proofReferences: Record<string, string>;
  filter: OperatorRuntimeRemediationFilter;
} {
  const normalizedReceiptId = args.receiptId.trim();
  const nextOutcomeNotes = args.field === "outcome"
    ? { ...args.drafts.outcomeNotes, [normalizedReceiptId]: args.value }
    : { ...args.drafts.outcomeNotes };
  const nextProofReferences = args.field === "proof"
    ? { ...args.drafts.proofReferences, [normalizedReceiptId]: args.value }
    : { ...args.drafts.proofReferences };
  return {
    outcomeNotes: nextOutcomeNotes,
    proofReferences: nextProofReferences,
    filter: nextRuntimeRemediationFilterAfterDraftsChange(args.currentFilter, {
      outcomeNotes: nextOutcomeNotes,
      proofReferences: nextProofReferences,
    }),
  };
}

export function readRuntimeRemediationDraftClearedState(args: {
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  receiptId: string;
}): {
  outcomeNotes: Record<string, string>;
  proofReferences: Record<string, string>;
  filter: OperatorRuntimeRemediationFilter;
} {
  const outcomeNotes = clearRuntimeRemediationDraftEntry(args.drafts.outcomeNotes, args.receiptId);
  const proofReferences = clearRuntimeRemediationDraftEntry(args.drafts.proofReferences, args.receiptId);
  return {
    outcomeNotes,
    proofReferences,
    filter: nextRuntimeRemediationFilterAfterDraftsChange(args.currentFilter, {
      outcomeNotes,
      proofReferences,
    }),
  };
}

export function readRuntimeRemediationAllDraftsClearedState(
  currentFilter: OperatorRuntimeRemediationFilter,
): {
  outcomeNotes: Record<string, string>;
  proofReferences: Record<string, string>;
  filter: OperatorRuntimeRemediationFilter;
} {
  return {
    outcomeNotes: {},
    proofReferences: {},
    filter: nextRuntimeRemediationFilterAfterDraftsChange(currentFilter, {
      outcomeNotes: {},
      proofReferences: {},
    }),
  };
}

export function readRuntimeRemediationPostCompletionState(args: {
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  entries: readonly OperatorRuntimeRemediationReceipt[];
  completedReceiptId: string;
}): {
  outcomeNotes: Record<string, string>;
  proofReferences: Record<string, string>;
  filter: OperatorRuntimeRemediationFilter;
} {
  const outcomeNotes = clearRuntimeRemediationDraftEntry(args.drafts.outcomeNotes, args.completedReceiptId);
  const proofReferences = clearRuntimeRemediationDraftEntry(args.drafts.proofReferences, args.completedReceiptId);
  const nextFilterAfterCompletion = nextRuntimeRemediationFilterAfterCompletion(
    args.currentFilter,
    args.entries,
    args.completedReceiptId,
  );
  return {
    outcomeNotes,
    proofReferences,
    filter: nextRuntimeRemediationFilterAfterDraftsChange(nextFilterAfterCompletion, {
      outcomeNotes,
      proofReferences,
    }),
  };
}
