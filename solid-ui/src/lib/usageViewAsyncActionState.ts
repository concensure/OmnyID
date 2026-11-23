// @locs-version: 1.0
import type {
  BillingStatus,
  OperatorRuntimeRemediationReceipt,
  OperatorUserActionReceipt,
} from "@/lib/api";
import type { OperatorRuntimeRemediationDraftMaps } from "@/lib/operatorRuntimeRemediationDraftState";
import type { OperatorRuntimeRemediationFilter } from "@/lib/operatorRuntimeRemediationLocalState";
import type { UsageViewFailureReceipt } from "@/lib/usageViewFailureState";
import { nextAsyncRequestId } from "@/lib/asyncRequestState";
import { readRuntimeRemediationPostCompletionState } from "@/lib/operatorRuntimeRemediationDraftState";
import { readOperatorActionNotice } from "@/lib/operatorAdminPresentationState";
import {
  readUsageViewAsyncFailureReceipt,
  readUsageViewClipboardUnavailableFailure,
} from "@/lib/usageViewInteractionState";

export type UsageViewBillingBusyAction = "checkout" | "portal" | "copy" | null;
export type UsageViewBillingRequestStartState = {
  requestId: number;
  modeError: UsageViewFailureReceipt | null;
  upgradeActionNotice: string | null;
  billingActionError: UsageViewFailureReceipt | null;
  billingActionBusy: Exclude<UsageViewBillingBusyAction, null>;
};

export type UsageViewArchiveOnlyRequestStartState = {
  requestId: number;
  upgradeActionNotice: string | null;
  billingActionError: UsageViewFailureReceipt | null;
  modeSaving: boolean;
  modeError: UsageViewFailureReceipt | null;
};

export type OperatorActionRunState = {
  busyUserId: string;
  actionError: string | null;
  actionNotice: string | null;
};

export type OperatorActionSuccessState = {
  actionNotice: string;
  selectedUserId: string;
};

export type RuntimeRemediationIssueStartState = {
  busy: boolean;
  actionError: string | null;
  actionNotice: string | null;
};

export type RuntimeRemediationCompleteStartState = {
  busyReceiptId: string;
  actionError: string | null;
  actionNotice: string | null;
};

export type RuntimeRemediationCompletionInputState = {
  outcomeNote: string;
  proofReference: string;
  validationError: string | null;
};

export type RuntimeRemediationIssueSuccessState = {
  receipt: OperatorRuntimeRemediationReceipt;
  featuredReceiptId: string;
  filter: "open";
  actionNotice: string;
};

export type RuntimeRemediationCompleteSuccessState = {
  receipt: OperatorRuntimeRemediationReceipt;
  featuredReceiptId: string;
  actionNotice: string;
  outcomeNotes: Record<string, string>;
  proofReferences: Record<string, string>;
  filter: OperatorRuntimeRemediationFilter;
};

export type UsageViewOperationalCommandCopyStartState = {
  requestId: number;
  operationalCommandNotice: string | null;
  billingActionError: UsageViewFailureReceipt | null;
};

export type UsageViewBillingCopyUnavailableState = {
  billingActionError: UsageViewFailureReceipt;
  billingActionBusy: UsageViewBillingBusyAction;
};

export type UsageViewBillingActionFailureState = {
  billingActionError: UsageViewFailureReceipt;
  billingActionBusy: UsageViewBillingBusyAction;
};

export type UsageViewArchiveOnlyFailureState = {
  modeError: UsageViewFailureReceipt;
  modeSaving: boolean;
};

export type UsageViewArchiveOnlySuccessState = {
  billing: BillingStatus;
  modeSaving: boolean;
};

export function readUsageViewBillingRequestStartState(args: {
  currentRequestId: number;
  busyAction: Exclude<UsageViewBillingBusyAction, null>;
}): UsageViewBillingRequestStartState {
  return {
    requestId: nextAsyncRequestId(args.currentRequestId),
    modeError: null,
    upgradeActionNotice: null,
    billingActionError: null,
    billingActionBusy: args.busyAction,
  };
}

export function readUsageViewArchiveOnlyRequestStartState(currentRequestId: number): UsageViewArchiveOnlyRequestStartState {
  return {
    requestId: nextAsyncRequestId(currentRequestId),
    upgradeActionNotice: null,
    billingActionError: null,
    modeSaving: true,
    modeError: null,
  };
}

export function readUsageViewOperationalCommandCopyStartState(
  currentRequestId: number,
): UsageViewOperationalCommandCopyStartState {
  return {
    requestId: nextAsyncRequestId(currentRequestId),
    operationalCommandNotice: null,
    billingActionError: null,
  };
}

export function readUsageViewAsyncFailureState(args: {
  actionTitle: string;
  fallbackSummary: string;
  error: unknown;
}): UsageViewFailureReceipt {
  return readUsageViewAsyncFailureReceipt(args.actionTitle, args.fallbackSummary, args.error);
}

export function readOperatorActionRunState(userId: string): OperatorActionRunState {
  return {
    busyUserId: userId,
    actionError: null,
    actionNotice: null,
  };
}

export function readOperatorActionSuccessState(args: {
  userId: string;
  receipt: OperatorUserActionReceipt;
}): OperatorActionSuccessState {
  return {
    actionNotice: readOperatorActionNotice({
      action: args.receipt.action,
      email: args.receipt.email,
      sessionsRevoked: args.receipt.sessions_revoked,
      supportAccessRevoked: args.receipt.support_access_revoked,
    }),
    selectedUserId: args.userId,
  };
}

export function readOperatorActionFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Operator action failed.";
}

export function readUsageViewBillingCopyUnavailableState(actionTitle: string): UsageViewBillingCopyUnavailableState {
  return {
    billingActionError: readUsageViewClipboardUnavailableFailure(actionTitle),
    billingActionBusy: null,
  };
}

export function readUsageViewBillingActionFailureState(args: {
  actionTitle: string;
  fallbackSummary: string;
  error: unknown;
}): UsageViewBillingActionFailureState {
  return {
    billingActionError: readUsageViewAsyncFailureState(args),
    billingActionBusy: null,
  };
}

export function readUsageViewArchiveOnlyFailureState(error: unknown): UsageViewArchiveOnlyFailureState {
  return {
    modeError: readUsageViewAsyncFailureState({
      actionTitle: "Update archive-only mode",
      fallbackSummary: "Could not update archive-only mode.",
      error,
    }),
    modeSaving: false,
  };
}

export function readUsageViewArchiveOnlySuccessState(
  billing: BillingStatus,
): UsageViewArchiveOnlySuccessState {
  return {
    billing,
    modeSaving: false,
  };
}

export function readRuntimeRemediationIssueStartState(): RuntimeRemediationIssueStartState {
  return {
    busy: true,
    actionError: null,
    actionNotice: null,
  };
}

export function readRuntimeRemediationIssueFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not issue a runtime remediation receipt.";
}

export function readRuntimeRemediationIssueSuccessNotice(): string {
  return "Manual cleanup receipt issued for the current operational blocker.";
}

export function readRuntimeRemediationCompletionValidationMessage(outcomeNote: string): string | null {
  return outcomeNote.trim() ? null : "Outcome note is required before completing a cleanup receipt.";
}

export function readRuntimeRemediationCompletionInputState(args: {
  receiptId: string;
  drafts: OperatorRuntimeRemediationDraftMaps;
}): RuntimeRemediationCompletionInputState {
  const outcomeNote = args.drafts.outcomeNotes[args.receiptId]?.trim() ?? "";
  const proofReference = args.drafts.proofReferences[args.receiptId]?.trim() ?? "";
  return {
    outcomeNote,
    proofReference,
    validationError: readRuntimeRemediationCompletionValidationMessage(outcomeNote),
  };
}

export function readRuntimeRemediationCompleteStartState(receiptId: string): RuntimeRemediationCompleteStartState {
  return {
    busyReceiptId: receiptId,
    actionError: null,
    actionNotice: null,
  };
}

export function readRuntimeRemediationCompleteFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not complete the runtime remediation receipt.";
}

export function readRuntimeRemediationCompleteSuccessNotice(): string {
  return "Cleanup receipt marked completed with operator execution acknowledgement.";
}

export function readRuntimeRemediationIssueSuccessState(
  receipt: OperatorRuntimeRemediationReceipt,
): RuntimeRemediationIssueSuccessState {
  return {
    receipt,
    featuredReceiptId: receipt.receipt_id,
    filter: "open",
    actionNotice: readRuntimeRemediationIssueSuccessNotice(),
  };
}

export function readRuntimeRemediationCompleteSuccessState(args: {
  receipt: OperatorRuntimeRemediationReceipt;
  drafts: OperatorRuntimeRemediationDraftMaps;
  currentFilter: OperatorRuntimeRemediationFilter;
  entries: readonly OperatorRuntimeRemediationReceipt[];
  completedReceiptId: string;
}): RuntimeRemediationCompleteSuccessState {
  const nextDraftState = readRuntimeRemediationPostCompletionState({
    drafts: args.drafts,
    currentFilter: args.currentFilter,
    entries: args.entries,
    completedReceiptId: args.completedReceiptId,
  });
  return {
    receipt: args.receipt,
    featuredReceiptId: args.receipt.receipt_id,
    actionNotice: readRuntimeRemediationCompleteSuccessNotice(),
    outcomeNotes: nextDraftState.outcomeNotes,
    proofReferences: nextDraftState.proofReferences,
    filter: nextDraftState.filter,
  };
}
