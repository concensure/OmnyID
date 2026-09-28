// @locs-version: 1.0
import {
  completeOperatorRuntimeRemediationReceipt,
  issueOperatorRuntimeRemediationReceipt,
  runAdminUserAction,
  type OperatorRuntimeRemediationReceipt,
} from "@/lib/api";
import {
  readOperatorActionFailureMessage,
  readOperatorActionRunState,
  readOperatorActionSuccessState,
  readRuntimeRemediationCompletionInputState,
  readRuntimeRemediationCompleteFailureMessage,
  readRuntimeRemediationCompleteStartState,
  readRuntimeRemediationCompleteSuccessState,
  readRuntimeRemediationIssueFailureMessage,
  readRuntimeRemediationIssueStartState,
  readRuntimeRemediationIssueSuccessState,
} from "@/lib/usageViewAsyncActionState";
import {
  commitOperatorActionRunState,
  commitOperatorActionSuccessState,
  commitRuntimeRemediationCompleteStartState,
  commitRuntimeRemediationCompleteSuccessState,
  commitRuntimeRemediationIssueStartState,
  commitRuntimeRemediationIssueSuccessState,
} from "@/lib/usageViewStateCommitters";
import type { OperatorRuntimeRemediationDraftMaps } from "@/lib/operatorRuntimeRemediationDraftState";
import type { OperatorRuntimeRemediationFilter } from "@/lib/operatorRuntimeRemediationLocalState";

export type UsageViewOperatorAction =
  | "revoke_all_sessions"
  | "revoke_support_access"
  | "suspend_account"
  | "reactivate_account";

export async function triggerUsageViewOperatorAction(args: {
  userId: string;
  action: UsageViewOperatorAction;
  busyUserId: string | null;
  setOperatorActionBusyUserId: (value: string | null) => void;
  setOperatorActionError: (value: string | null) => void;
  setOperatorActionNotice: (value: string | null) => void;
  setSelectedOperatorUserId: (value: string | null) => void;
  refreshOperatorPanel: () => void;
  refetchOperatorUserDetail: () => void;
}): Promise<void> {
  if (args.busyUserId) return;
  const runState = readOperatorActionRunState(args.userId);
  commitOperatorActionRunState({
    state: runState,
    setOperatorActionBusyUserId: args.setOperatorActionBusyUserId,
    setOperatorActionError: args.setOperatorActionError,
    setOperatorActionNotice: args.setOperatorActionNotice,
  });
  try {
    const receipt = await runAdminUserAction(args.userId, { action: args.action });
    commitOperatorActionSuccessState({
      state: readOperatorActionSuccessState({ userId: args.userId, receipt }),
      setOperatorActionNotice: args.setOperatorActionNotice,
      setSelectedOperatorUserId: args.setSelectedOperatorUserId,
      refreshOperatorPanel: args.refreshOperatorPanel,
      refetchOperatorUserDetail: args.refetchOperatorUserDetail,
    });
  } catch (error: unknown) {
    args.setOperatorActionError(readOperatorActionFailureMessage(error));
  } finally {
    args.setOperatorActionBusyUserId(null);
  }
}

export async function issueUsageViewRuntimeRemediationReceipt(args: {
  busy: boolean;
  setRuntimeRemediationBusy: (value: boolean) => void;
  setOperatorActionError: (value: string | null) => void;
  setOperatorActionNotice: (value: string | null) => void;
  setRuntimeRemediationReceipt: (value: OperatorRuntimeRemediationReceipt | null) => void;
  persistRuntimeRemediationFeaturedReceiptId: (value: string | null | undefined) => void;
  persistRuntimeRemediationFilter: (value: "open" | "completed" | "drafts" | "all") => void;
  refetchOperatorRuntimeRemediationHistory: () => void;
}): Promise<void> {
  if (args.busy) return;
  const startState = readRuntimeRemediationIssueStartState();
  commitRuntimeRemediationIssueStartState({
    state: startState,
    setRuntimeRemediationBusy: args.setRuntimeRemediationBusy,
    setOperatorActionError: args.setOperatorActionError,
    setOperatorActionNotice: args.setOperatorActionNotice,
  });
  try {
    const receipt = await issueOperatorRuntimeRemediationReceipt({
      note: "Issued from operator usage view.",
    });
    commitRuntimeRemediationIssueSuccessState({
      state: readRuntimeRemediationIssueSuccessState(receipt),
      setRuntimeRemediationReceipt: args.setRuntimeRemediationReceipt,
      persistRuntimeRemediationFeaturedReceiptId: args.persistRuntimeRemediationFeaturedReceiptId,
      persistRuntimeRemediationFilter: args.persistRuntimeRemediationFilter,
      refetchOperatorRuntimeRemediationHistory: args.refetchOperatorRuntimeRemediationHistory,
      setOperatorActionNotice: args.setOperatorActionNotice,
    });
  } catch (error: unknown) {
    args.setOperatorActionError(readRuntimeRemediationIssueFailureMessage(error));
  } finally {
    args.setRuntimeRemediationBusy(false);
  }
}

export async function completeUsageViewRuntimeRemediationReceipt(args: {
  receiptId: string;
  busyReceiptId: string | null;
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  entries: readonly OperatorRuntimeRemediationReceipt[];
  setRuntimeRemediationCompleteBusyId: (value: string | null) => void;
  setOperatorActionError: (value: string | null) => void;
  setOperatorActionNotice: (value: string | null) => void;
  setRuntimeRemediationReceipt: (value: OperatorRuntimeRemediationReceipt | null) => void;
  persistRuntimeRemediationFeaturedReceiptId: (value: string | null | undefined) => void;
  persistRuntimeRemediationFilter: (value: OperatorRuntimeRemediationFilter) => void;
  persistRuntimeRemediationOutcomeNotes: (value: Record<string, string>) => void;
  persistRuntimeRemediationProofReferences: (value: Record<string, string>) => void;
  refetchOperatorRuntimeRemediationHistory: () => void;
}): Promise<void> {
  if (args.busyReceiptId) return;
  const completionInputState = readRuntimeRemediationCompletionInputState({
    receiptId: args.receiptId,
    drafts: args.drafts,
  });
  if (completionInputState.validationError) {
    args.setOperatorActionError(completionInputState.validationError);
    return;
  }
  const startState = readRuntimeRemediationCompleteStartState(args.receiptId);
  commitRuntimeRemediationCompleteStartState({
    state: startState,
    setRuntimeRemediationCompleteBusyId: args.setRuntimeRemediationCompleteBusyId,
    setOperatorActionError: args.setOperatorActionError,
    setOperatorActionNotice: args.setOperatorActionNotice,
  });
  try {
    const receipt = await completeOperatorRuntimeRemediationReceipt({
      receipt_id: args.receiptId,
      outcome_note: completionInputState.outcomeNote,
      proof_reference: completionInputState.proofReference || undefined,
    });
    const successState = readRuntimeRemediationCompleteSuccessState({
      receipt,
      drafts: args.drafts,
      currentFilter: args.currentFilter,
      entries: args.entries,
      completedReceiptId: args.receiptId,
    });
    commitRuntimeRemediationCompleteSuccessState({
      state: successState,
      setRuntimeRemediationReceipt: args.setRuntimeRemediationReceipt,
      persistRuntimeRemediationFeaturedReceiptId: args.persistRuntimeRemediationFeaturedReceiptId,
      persistRuntimeRemediationFilter: args.persistRuntimeRemediationFilter,
      persistRuntimeRemediationOutcomeNotes: args.persistRuntimeRemediationOutcomeNotes,
      persistRuntimeRemediationProofReferences: args.persistRuntimeRemediationProofReferences,
      refetchOperatorRuntimeRemediationHistory: args.refetchOperatorRuntimeRemediationHistory,
      setOperatorActionNotice: args.setOperatorActionNotice,
    });
  } catch (error: unknown) {
    args.setOperatorActionError(readRuntimeRemediationCompleteFailureMessage(error));
  } finally {
    args.setRuntimeRemediationCompleteBusyId(null);
  }
}
