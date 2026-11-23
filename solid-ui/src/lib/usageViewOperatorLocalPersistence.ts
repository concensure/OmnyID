// @locs-version: 1.0
import {
  normalizeOperatorRuntimeRemediationReceiptId,
  type OperatorRuntimeRemediationFilter,
} from "@/lib/operatorRuntimeRemediationLocalState";

export function persistUsageViewRuntimeRemediationFilter(args: {
  value: OperatorRuntimeRemediationFilter;
  setRuntimeRemediationFilter: (value: OperatorRuntimeRemediationFilter) => void;
  saveRuntimeRemediationFilter: (value: OperatorRuntimeRemediationFilter) => void;
}): void {
  args.setRuntimeRemediationFilter(args.value);
  args.saveRuntimeRemediationFilter(args.value);
}

export function persistUsageViewRuntimeRemediationFeaturedReceiptId(args: {
  receiptId: string | null | undefined;
  setRuntimeRemediationFeaturedReceiptId: (value: string | null) => void;
  saveRuntimeRemediationFeaturedReceiptId: (value: string | null) => void;
}): void {
  const nextValue = normalizeOperatorRuntimeRemediationReceiptId(args.receiptId);
  args.setRuntimeRemediationFeaturedReceiptId(nextValue);
  args.saveRuntimeRemediationFeaturedReceiptId(nextValue);
}

export function persistUsageViewRuntimeRemediationOutcomeNotes(args: {
  value: Record<string, string>;
  setRuntimeRemediationOutcomeNotes: (value: Record<string, string>) => void;
  saveRuntimeRemediationOutcomeNotes: (value: Record<string, string>) => void;
}): void {
  args.setRuntimeRemediationOutcomeNotes(args.value);
  args.saveRuntimeRemediationOutcomeNotes(args.value);
}

export function persistUsageViewRuntimeRemediationProofReferences(args: {
  value: Record<string, string>;
  setRuntimeRemediationProofReferences: (value: Record<string, string>) => void;
  saveRuntimeRemediationProofReferences: (value: Record<string, string>) => void;
}): void {
  args.setRuntimeRemediationProofReferences(args.value);
  args.saveRuntimeRemediationProofReferences(args.value);
}
