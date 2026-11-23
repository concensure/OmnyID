// @locs-version: 1.0
import type {
  OperatorActionRunState,
  OperatorActionSuccessState,
  RuntimeRemediationCompleteStartState,
  RuntimeRemediationCompleteSuccessState,
  RuntimeRemediationIssueStartState,
  RuntimeRemediationIssueSuccessState,
  UsageViewArchiveOnlyFailureState,
  UsageViewArchiveOnlyRequestStartState,
  UsageViewArchiveOnlySuccessState,
  UsageViewBillingActionFailureState,
  UsageViewBillingCopyUnavailableState,
  UsageViewBillingRequestStartState,
  UsageViewOperationalCommandCopyStartState,
} from "@/lib/usageViewAsyncActionState";

export function commitUsageViewOperationalCommandCopyStartState(args: {
  state: UsageViewOperationalCommandCopyStartState;
  setOperationalCommandNotice: (value: string | null) => void;
  setBillingActionError: (value: typeof args.state.billingActionError) => void;
}): void {
  args.setOperationalCommandNotice(args.state.operationalCommandNotice);
  args.setBillingActionError(args.state.billingActionError);
}

export function commitUsageViewBillingRequestStartState(args: {
  state: UsageViewBillingRequestStartState;
  setModeError: (value: typeof args.state.modeError) => void;
  setUpgradeActionNotice: (value: string | null) => void;
  setBillingActionError: (value: typeof args.state.billingActionError) => void;
  setBillingActionBusy: (value: typeof args.state.billingActionBusy) => void;
}): void {
  args.setModeError(args.state.modeError);
  args.setUpgradeActionNotice(args.state.upgradeActionNotice);
  args.setBillingActionError(args.state.billingActionError);
  args.setBillingActionBusy(args.state.billingActionBusy);
}

export function commitUsageViewArchiveOnlyRequestStartState(args: {
  state: UsageViewArchiveOnlyRequestStartState;
  setUpgradeActionNotice: (value: string | null) => void;
  setBillingActionError: (value: typeof args.state.billingActionError) => void;
  setModeSaving: (value: boolean) => void;
  setModeError: (value: typeof args.state.modeError) => void;
}): void {
  args.setUpgradeActionNotice(args.state.upgradeActionNotice);
  args.setBillingActionError(args.state.billingActionError);
  args.setModeSaving(args.state.modeSaving);
  args.setModeError(args.state.modeError);
}

export function commitUsageViewBillingCopyUnavailableState(args: {
  state: UsageViewBillingCopyUnavailableState;
  setBillingActionError: (value: typeof args.state.billingActionError) => void;
  setBillingActionBusy: (value: typeof args.state.billingActionBusy) => void;
}): void {
  args.setBillingActionError(args.state.billingActionError);
  args.setBillingActionBusy(args.state.billingActionBusy);
}

export function commitUsageViewBillingActionFailureState(args: {
  state: UsageViewBillingActionFailureState;
  setBillingActionError: (value: typeof args.state.billingActionError) => void;
  setBillingActionBusy: (value: typeof args.state.billingActionBusy) => void;
}): void {
  args.setBillingActionError(args.state.billingActionError);
  args.setBillingActionBusy(args.state.billingActionBusy);
}

export function commitUsageViewArchiveOnlyFailureState(args: {
  state: UsageViewArchiveOnlyFailureState;
  setModeError: (value: typeof args.state.modeError) => void;
  setModeSaving: (value: boolean) => void;
}): void {
  args.setModeError(args.state.modeError);
  args.setModeSaving(args.state.modeSaving);
}

export function commitUsageViewArchiveOnlySuccessState(args: {
  state: UsageViewArchiveOnlySuccessState;
  setBilling: (value: typeof args.state.billing) => void;
  setModeSaving: (value: boolean) => void;
}): void {
  args.setBilling(args.state.billing);
  args.setModeSaving(args.state.modeSaving);
}

export function commitOperatorActionRunState(args: {
  state: OperatorActionRunState;
  setOperatorActionBusyUserId: (value: string | null) => void;
  setOperatorActionError: (value: string | null) => void;
  setOperatorActionNotice: (value: string | null) => void;
}): void {
  args.setOperatorActionBusyUserId(args.state.busyUserId);
  args.setOperatorActionError(args.state.actionError);
  args.setOperatorActionNotice(args.state.actionNotice);
}

export function commitOperatorActionSuccessState(args: {
  state: OperatorActionSuccessState;
  setOperatorActionNotice: (value: string | null) => void;
  setSelectedOperatorUserId: (value: string | null) => void;
  refreshOperatorPanel: () => void;
  refetchOperatorUserDetail: () => void;
}): void {
  args.setOperatorActionNotice(args.state.actionNotice);
  args.setSelectedOperatorUserId(args.state.selectedUserId);
  args.refreshOperatorPanel();
  args.refetchOperatorUserDetail();
}

export function commitRuntimeRemediationIssueStartState(args: {
  state: RuntimeRemediationIssueStartState;
  setRuntimeRemediationBusy: (value: boolean) => void;
  setOperatorActionError: (value: string | null) => void;
  setOperatorActionNotice: (value: string | null) => void;
}): void {
  args.setRuntimeRemediationBusy(args.state.busy);
  args.setOperatorActionError(args.state.actionError);
  args.setOperatorActionNotice(args.state.actionNotice);
}

export function commitRuntimeRemediationIssueSuccessState(args: {
  state: RuntimeRemediationIssueSuccessState;
  setRuntimeRemediationReceipt: (value: typeof args.state.receipt | null) => void;
  persistRuntimeRemediationFeaturedReceiptId: (value: string | null | undefined) => void;
  persistRuntimeRemediationFilter: (value: typeof args.state.filter) => void;
  refetchOperatorRuntimeRemediationHistory: () => void;
  setOperatorActionNotice: (value: string | null) => void;
}): void {
  args.setRuntimeRemediationReceipt(args.state.receipt);
  args.persistRuntimeRemediationFeaturedReceiptId(args.state.featuredReceiptId);
  args.persistRuntimeRemediationFilter(args.state.filter);
  args.refetchOperatorRuntimeRemediationHistory();
  args.setOperatorActionNotice(args.state.actionNotice);
}

export function commitRuntimeRemediationCompleteStartState(args: {
  state: RuntimeRemediationCompleteStartState;
  setRuntimeRemediationCompleteBusyId: (value: string | null) => void;
  setOperatorActionError: (value: string | null) => void;
  setOperatorActionNotice: (value: string | null) => void;
}): void {
  args.setRuntimeRemediationCompleteBusyId(args.state.busyReceiptId);
  args.setOperatorActionError(args.state.actionError);
  args.setOperatorActionNotice(args.state.actionNotice);
}

export function commitRuntimeRemediationCompleteSuccessState(args: {
  state: RuntimeRemediationCompleteSuccessState;
  setRuntimeRemediationReceipt: (value: typeof args.state.receipt | null) => void;
  persistRuntimeRemediationFeaturedReceiptId: (value: string | null | undefined) => void;
  persistRuntimeRemediationFilter: (value: typeof args.state.filter) => void;
  persistRuntimeRemediationOutcomeNotes: (value: Record<string, string>) => void;
  persistRuntimeRemediationProofReferences: (value: Record<string, string>) => void;
  refetchOperatorRuntimeRemediationHistory: () => void;
  setOperatorActionNotice: (value: string | null) => void;
}): void {
  args.setRuntimeRemediationReceipt(args.state.receipt);
  args.persistRuntimeRemediationFeaturedReceiptId(args.state.featuredReceiptId);
  args.persistRuntimeRemediationFilter(args.state.filter);
  args.persistRuntimeRemediationOutcomeNotes(args.state.outcomeNotes);
  args.persistRuntimeRemediationProofReferences(args.state.proofReferences);
  args.refetchOperatorRuntimeRemediationHistory();
  args.setOperatorActionNotice(args.state.actionNotice);
}

export function commitRuntimeRemediationDraftState(args: {
  state: {
    outcomeNotes: Record<string, string>;
    proofReferences: Record<string, string>;
    filter: "open" | "completed" | "drafts" | "all";
  };
  persistRuntimeRemediationOutcomeNotes: (value: Record<string, string>) => void;
  persistRuntimeRemediationProofReferences: (value: Record<string, string>) => void;
  persistRuntimeRemediationFilter: (value: "open" | "completed" | "drafts" | "all") => void;
}): void {
  args.persistRuntimeRemediationOutcomeNotes(args.state.outcomeNotes);
  args.persistRuntimeRemediationProofReferences(args.state.proofReferences);
  args.persistRuntimeRemediationFilter(args.state.filter);
}
