// @locs-version: 1.0
import {
  setArchiveOnlyMode,
  type BillingStatus,
} from "@/lib/api";
import { isCurrentAsyncRequest } from "@/lib/asyncRequestState";
import { buildBillingUpgradeRequestBody } from "@/lib/billingUpgradeState";
import {
  readOperationalCommandCopiedNotice,
  readUpgradeRequestCopiedNotice,
  readUsageViewAsyncFailureReceipt,
  shouldBlockBillingInteraction,
} from "@/lib/usageViewInteractionState";
import {
  readUsageViewArchiveOnlyFailureState,
  readUsageViewArchiveOnlyRequestStartState,
  readUsageViewArchiveOnlySuccessState,
  readUsageViewBillingActionFailureState,
  readUsageViewBillingCopyUnavailableState,
  readUsageViewBillingRequestStartState,
  readUsageViewOperationalCommandCopyStartState,
  type UsageViewBillingBusyAction,
} from "@/lib/usageViewAsyncActionState";
import {
  commitUsageViewArchiveOnlyFailureState,
  commitUsageViewArchiveOnlyRequestStartState,
  commitUsageViewArchiveOnlySuccessState,
  commitUsageViewBillingActionFailureState,
  commitUsageViewBillingCopyUnavailableState,
  commitUsageViewBillingRequestStartState,
  commitUsageViewOperationalCommandCopyStartState,
} from "@/lib/usageViewStateCommitters";
import type { UsageViewFailureReceipt } from "@/lib/usageViewFailureState";

export type UsageViewRequestCounter = {
  current: number;
};

type BillingActionGuardState = {
  modeSaving: boolean;
  billingActionBusy: UsageViewBillingBusyAction;
};

type BillingActionSetters = {
  setModeError: (value: UsageViewFailureReceipt | null) => void;
  setUpgradeActionNotice: (value: string | null) => void;
  setBillingActionError: (value: UsageViewFailureReceipt | null) => void;
  setBillingActionBusy: (value: UsageViewBillingBusyAction) => void;
};

function shouldBlockBillingAction(args: BillingActionGuardState & {
  requiresBilling?: boolean;
  hasBilling?: boolean;
}) {
  return shouldBlockBillingInteraction({
    modeSaving: args.modeSaving,
    busyAction: args.billingActionBusy,
    requiresBilling: args.requiresBilling,
    hasBilling: args.hasBilling,
  });
}

function beginBillingAction(args: {
  requestCounter: UsageViewRequestCounter;
  busyAction: Exclude<UsageViewBillingBusyAction, null>;
} & BillingActionSetters): number {
  const startState = readUsageViewBillingRequestStartState({
    currentRequestId: args.requestCounter.current,
    busyAction: args.busyAction,
  });
  args.requestCounter.current = startState.requestId;
  commitUsageViewBillingRequestStartState({
    state: startState,
    setModeError: args.setModeError,
    setUpgradeActionNotice: args.setUpgradeActionNotice,
    setBillingActionError: args.setBillingActionError,
    setBillingActionBusy: args.setBillingActionBusy,
  });
  return startState.requestId;
}

async function runBillingRedirectAction(args: {
  guardState: BillingActionGuardState;
  requestCounter: UsageViewRequestCounter;
  busyAction: Exclude<UsageViewBillingBusyAction, null>;
  createSession: () => Promise<{ url: string }>;
  actionTitle: string;
  fallbackSummary: string;
  redirectTo: (url: string) => void;
} & BillingActionSetters): Promise<void> {
  if (shouldBlockBillingAction(args.guardState)) return;
  const requestId = beginBillingAction(args);
  try {
    const result = await args.createSession();
    if (!isCurrentAsyncRequest(args.requestCounter.current, requestId)) return;
    args.redirectTo(result.url);
  } catch (error: unknown) {
    if (!isCurrentAsyncRequest(args.requestCounter.current, requestId)) return;
    commitUsageViewBillingActionFailureState({
      state: readUsageViewBillingActionFailureState({
        actionTitle: args.actionTitle,
        fallbackSummary: args.fallbackSummary,
        error,
      }),
      setBillingActionError: args.setBillingActionError,
      setBillingActionBusy: args.setBillingActionBusy,
    });
  } finally {
    if (isCurrentAsyncRequest(args.requestCounter.current, requestId)) {
      args.setBillingActionBusy(null);
    }
  }
}

export async function copyUsageViewOperationalCommand(args: {
  command: string | null | undefined;
  label: "workspace" | "operator";
  guardState: BillingActionGuardState;
  requestCounter: UsageViewRequestCounter;
  writeText: ((value: string) => Promise<void>) | null | undefined;
  setOperationalCommandNotice: (value: string | null) => void;
  setBillingActionError: (value: UsageViewFailureReceipt | null) => void;
}): Promise<void> {
  if (shouldBlockBillingAction(args.guardState)) return;
  const normalized = String(args.command ?? "").trim();
  if (!normalized) return;
  const startState = readUsageViewOperationalCommandCopyStartState(args.requestCounter.current);
  const requestId = startState.requestId;
  args.requestCounter.current = requestId;
  commitUsageViewOperationalCommandCopyStartState({
    state: startState,
    setOperationalCommandNotice: args.setOperationalCommandNotice,
    setBillingActionError: args.setBillingActionError,
  });
  if (!args.writeText) {
    if (isCurrentAsyncRequest(args.requestCounter.current, requestId)) {
      args.setBillingActionError(readUsageViewBillingCopyUnavailableState("Copy cleanup command").billingActionError);
    }
    return;
  }
  try {
    await args.writeText(normalized);
    if (!isCurrentAsyncRequest(args.requestCounter.current, requestId)) return;
    args.setOperationalCommandNotice(readOperationalCommandCopiedNotice(args.label));
  } catch (error: unknown) {
    if (!isCurrentAsyncRequest(args.requestCounter.current, requestId)) return;
    args.setBillingActionError(readUsageViewAsyncFailureReceipt(
      "Copy cleanup command",
      "Could not copy the cleanup command.",
      error,
    ));
  }
}

export async function copyUsageViewUpgradeRequest(args: {
  billing: BillingStatus | null | undefined;
  sessionEmail: string | null | undefined;
  guardState: BillingActionGuardState;
  requestCounter: UsageViewRequestCounter;
  writeText: ((value: string) => Promise<void>) | null | undefined;
} & BillingActionSetters): Promise<void> {
  if (shouldBlockBillingAction(args.guardState)) return;
  const requestId = beginBillingAction({
    ...args,
    busyAction: "copy",
  });
  if (!args.writeText) {
    if (isCurrentAsyncRequest(args.requestCounter.current, requestId)) {
      commitUsageViewBillingCopyUnavailableState({
        state: readUsageViewBillingCopyUnavailableState("Copy upgrade request"),
        setBillingActionError: args.setBillingActionError,
        setBillingActionBusy: args.setBillingActionBusy,
      });
    }
    return;
  }
  try {
    await args.writeText(buildBillingUpgradeRequestBody(args.billing ?? null, args.sessionEmail ?? null));
    if (!isCurrentAsyncRequest(args.requestCounter.current, requestId)) return;
    args.setUpgradeActionNotice(readUpgradeRequestCopiedNotice());
  } catch (error: unknown) {
    if (!isCurrentAsyncRequest(args.requestCounter.current, requestId)) return;
    commitUsageViewBillingActionFailureState({
      state: readUsageViewBillingActionFailureState({
        actionTitle: "Copy upgrade request",
        fallbackSummary: "Could not copy upgrade request details.",
        error,
      }),
      setBillingActionError: args.setBillingActionError,
      setBillingActionBusy: args.setBillingActionBusy,
    });
  } finally {
    if (isCurrentAsyncRequest(args.requestCounter.current, requestId)) {
      args.setBillingActionBusy(null);
    }
  }
}

export async function toggleUsageViewArchiveOnlyMode(args: {
  enabled: boolean;
  guardState: BillingActionGuardState & {
    hasBilling: boolean;
  };
  requestCounter: UsageViewRequestCounter;
  setBilling: (value: BillingStatus) => void;
  setModeSaving: (value: boolean) => void;
  setModeError: (value: UsageViewFailureReceipt | null) => void;
  setUpgradeActionNotice: (value: string | null) => void;
  setBillingActionError: (value: UsageViewFailureReceipt | null) => void;
}): Promise<void> {
  if (shouldBlockBillingAction({
    ...args.guardState,
    requiresBilling: true,
  })) return;
  const startState = readUsageViewArchiveOnlyRequestStartState(args.requestCounter.current);
  const requestId = startState.requestId;
  args.requestCounter.current = requestId;
  commitUsageViewArchiveOnlyRequestStartState({
    state: startState,
    setUpgradeActionNotice: args.setUpgradeActionNotice,
    setBillingActionError: args.setBillingActionError,
    setModeSaving: args.setModeSaving,
    setModeError: args.setModeError,
  });
  try {
    const nextBilling = await setArchiveOnlyMode(args.enabled);
    if (!isCurrentAsyncRequest(args.requestCounter.current, requestId)) return;
    commitUsageViewArchiveOnlySuccessState({
      state: readUsageViewArchiveOnlySuccessState(nextBilling),
      setBilling: args.setBilling,
      setModeSaving: args.setModeSaving,
    });
  } catch (error: unknown) {
    if (!isCurrentAsyncRequest(args.requestCounter.current, requestId)) return;
    commitUsageViewArchiveOnlyFailureState({
      state: readUsageViewArchiveOnlyFailureState(error),
      setModeError: args.setModeError,
      setModeSaving: args.setModeSaving,
    });
  } finally {
    if (isCurrentAsyncRequest(args.requestCounter.current, requestId)) {
      args.setModeSaving(false);
    }
  }
}

export async function startUsageViewCheckout(args: {
  guardState: BillingActionGuardState;
  requestCounter: UsageViewRequestCounter;
  createSession: () => Promise<{ url: string }>;
  redirectTo: (url: string) => void;
} & BillingActionSetters): Promise<void> {
  return runBillingRedirectAction({
    ...args,
    busyAction: "checkout",
    actionTitle: "Start Stripe checkout",
    fallbackSummary: "Could not start Stripe checkout.",
  });
}

export async function openUsageViewBillingPortal(args: {
  guardState: BillingActionGuardState;
  requestCounter: UsageViewRequestCounter;
  createSession: () => Promise<{ url: string }>;
  redirectTo: (url: string) => void;
} & BillingActionSetters): Promise<void> {
  return runBillingRedirectAction({
    ...args,
    busyAction: "portal",
    actionTitle: "Open billing portal",
    fallbackSummary: "Could not open the Stripe billing portal.",
  });
}
