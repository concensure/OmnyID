import test from "node:test";
import assert from "node:assert/strict";

import type { OperatorUserActionReceipt } from "../src/lib/api.ts";
import {
  readOperatorActionFailureMessage,
  readOperatorActionRunState,
  readOperatorActionSuccessState,
  readUsageViewArchiveOnlyFailureState,
  readRuntimeRemediationCompletionInputState,
  readRuntimeRemediationCompletionValidationMessage,
  readRuntimeRemediationCompleteFailureMessage,
  readRuntimeRemediationCompleteStartState,
  readRuntimeRemediationCompleteSuccessState,
  readRuntimeRemediationCompleteSuccessNotice,
  readRuntimeRemediationIssueFailureMessage,
  readRuntimeRemediationIssueStartState,
  readRuntimeRemediationIssueSuccessState,
  readRuntimeRemediationIssueSuccessNotice,
  readUsageViewArchiveOnlySuccessState,
  readUsageViewBillingActionFailureState,
  readUsageViewBillingCopyUnavailableState,
  readUsageViewArchiveOnlyRequestStartState,
  readUsageViewAsyncFailureState,
  readUsageViewBillingRequestStartState,
  readUsageViewOperationalCommandCopyStartState,
} from "../src/lib/usageViewAsyncActionState.ts";

function receipt(overrides: Partial<OperatorUserActionReceipt> = {}): OperatorUserActionReceipt {
  return {
    ok: true,
    action: "revoke_all_sessions",
    user_id: "user-1",
    email: "user@example.com",
    sessions_revoked: 3,
    support_access_revoked: false,
    account_status: "active",
    ...overrides,
  };
}

test("usage view billing request start builders centralize async reset state", () => {
  assert.deepEqual(
    readUsageViewBillingRequestStartState({
      currentRequestId: 4,
      busyAction: "copy",
    }),
    {
      requestId: 5,
      modeError: null,
      upgradeActionNotice: null,
      billingActionError: null,
      billingActionBusy: "copy",
    },
  );

  assert.deepEqual(
    readUsageViewArchiveOnlyRequestStartState(7),
    {
      requestId: 8,
      upgradeActionNotice: null,
      billingActionError: null,
      modeSaving: true,
      modeError: null,
    },
  );

  assert.deepEqual(
    readUsageViewOperationalCommandCopyStartState(2),
    {
      requestId: 3,
      operationalCommandNotice: null,
      billingActionError: null,
    },
  );
});

test("usage view async failure state reuses the normalized failure contract", () => {
  assert.deepEqual(
    readUsageViewAsyncFailureState({
      actionTitle: "Start Stripe checkout",
      fallbackSummary: "Could not start Stripe checkout.",
      error: new Error("network error"),
    }),
    {
      tone: "warning",
      title: "Start Stripe checkout could not finish right now",
      summary: "The billing request hit a temporary connectivity or service failure before it could complete.",
      nextStep: "Retry from the same usage view. If it keeps failing, check workspace connectivity and billing service status.",
    },
  );

  assert.deepEqual(
    readUsageViewBillingCopyUnavailableState("Copy upgrade request"),
    {
      billingActionError: {
        tone: "warning",
        title: "Copy upgrade request needs browser clipboard access",
        summary: "The browser blocked this billing helper action before it could place the request details on the clipboard.",
        nextStep: "Retry from the same usage view after granting clipboard access or using a browser context that allows copy actions.",
      },
      billingActionBusy: null,
    },
  );

  assert.deepEqual(
    readUsageViewBillingActionFailureState({
      actionTitle: "Open billing portal",
      fallbackSummary: "Could not open the Stripe billing portal.",
      error: new Error("portal down"),
    }),
    {
      billingActionError: {
        tone: "warning",
        title: "Open billing portal failed",
        summary: "The billing request did not complete successfully.",
        nextStep: "Retry from the same usage view. If it keeps failing, check session health and workspace status.",
      },
      billingActionBusy: null,
    },
  );

  assert.deepEqual(
    readUsageViewArchiveOnlyFailureState(new Error("archive down")),
    {
      modeError: {
        tone: "warning",
        title: "Update archive-only mode failed",
        summary: "The billing request did not complete successfully.",
        nextStep: "Retry from the same usage view. If it keeps failing, check session health and workspace status.",
      },
      modeSaving: false,
    },
  );

  assert.deepEqual(
    readUsageViewArchiveOnlySuccessState({
      plan: "free",
      status: "active",
      checkout_available: true,
      billing_portal_available: false,
      archive_only_enabled: true,
      storage_used_bytes: 100,
      storage_quota_bytes: 200,
      quota_state: "ok",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      current_period_end: null,
    }),
    {
      billing: {
        plan: "free",
        status: "active",
        checkout_available: true,
        billing_portal_available: false,
        archive_only_enabled: true,
        storage_used_bytes: 100,
        storage_quota_bytes: 200,
        quota_state: "ok",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        current_period_end: null,
      },
      modeSaving: false,
    },
  );
});

test("operator action helpers centralize busy, success, and failure messaging", () => {
  assert.deepEqual(
    readOperatorActionRunState("user-1"),
    {
      busyUserId: "user-1",
      actionError: null,
      actionNotice: null,
    },
  );

  assert.deepEqual(
    readOperatorActionSuccessState({
      userId: "user-1",
      receipt: receipt(),
    }),
    {
      actionNotice: "3 sessions revoked for user@example.com.",
      selectedUserId: "user-1",
    },
  );

  assert.equal(readOperatorActionFailureMessage(new Error("denied")), "denied");
  assert.equal(readOperatorActionFailureMessage(null), "Operator action failed.");
});

test("runtime remediation async helpers centralize validation, busy state, notices, and failures", () => {
  assert.deepEqual(
    readRuntimeRemediationIssueStartState(),
    {
      busy: true,
      actionError: null,
      actionNotice: null,
    },
  );
  assert.equal(
    readRuntimeRemediationIssueSuccessNotice(),
    "Manual cleanup receipt issued for the current operational blocker.",
  );
  assert.equal(
    readRuntimeRemediationIssueFailureMessage(new Error("blocked")),
    "blocked",
  );

  assert.equal(
    readRuntimeRemediationCompletionValidationMessage("   "),
    "Outcome note is required before completing a cleanup receipt.",
  );
  assert.equal(
    readRuntimeRemediationCompletionValidationMessage("verified"),
    null,
  );
  assert.deepEqual(
    readRuntimeRemediationCompletionInputState({
      receiptId: "receipt-1",
      drafts: {
        outcomeNotes: { "receipt-1": " verified " },
        proofReferences: { "receipt-1": " artifact-1 " },
      },
    }),
    {
      outcomeNote: "verified",
      proofReference: "artifact-1",
      validationError: null,
    },
  );
  assert.deepEqual(
    readRuntimeRemediationCompleteStartState("receipt-1"),
    {
      busyReceiptId: "receipt-1",
      actionError: null,
      actionNotice: null,
    },
  );
  assert.equal(readRuntimeRemediationCompleteFailureMessage(new Error("timeout")), "timeout");
  assert.equal(
    readRuntimeRemediationCompleteSuccessNotice(),
    "Cleanup receipt marked completed with operator execution acknowledgement.",
  );
  assert.deepEqual(
    readRuntimeRemediationIssueSuccessState({
      receipt_id: "receipt-1",
      action: "archive_backlog",
      lifecycle_status: "open",
      execution_mode: "manual",
      issued_at: "2026-08-31T10:00:00Z",
      completed_at: null,
      command: "./cleanup.ps1",
      source: "daemon_heartbeats",
      artifact_generated_at: null,
      pressure_total_rows: null,
      cleanup_mode: null,
      approval_status: "not_required",
    }),
    {
      receipt: {
        receipt_id: "receipt-1",
        action: "archive_backlog",
        lifecycle_status: "open",
        execution_mode: "manual",
        issued_at: "2026-08-31T10:00:00Z",
        completed_at: null,
        command: "./cleanup.ps1",
        source: "daemon_heartbeats",
        artifact_generated_at: null,
        pressure_total_rows: null,
        cleanup_mode: null,
        approval_status: "not_required",
      },
      featuredReceiptId: "receipt-1",
      filter: "open",
      actionNotice: "Manual cleanup receipt issued for the current operational blocker.",
    },
  );
  const completeSuccess = readRuntimeRemediationCompleteSuccessState({
    receipt: {
      receipt_id: "receipt-1",
      action: "archive_backlog",
      lifecycle_status: "completed",
      execution_mode: "manual",
      issued_at: "2026-08-31T10:00:00Z",
      completed_at: "2026-08-31T10:05:00Z",
      command: "./cleanup.ps1",
      source: "daemon_heartbeats",
      artifact_generated_at: null,
      pressure_total_rows: null,
      cleanup_mode: null,
      approval_status: "not_required",
    },
    drafts: {
      outcomeNotes: { "receipt-1": "verified" },
      proofReferences: { "receipt-1": "artifact-1" },
    },
    currentFilter: "open",
    entries: [{
      receipt_id: "receipt-1",
      action: "archive_backlog",
      lifecycle_status: "open",
      execution_mode: "manual",
      issued_at: "2026-08-31T10:00:00Z",
      completed_at: null,
      command: "./cleanup.ps1",
      source: "daemon_heartbeats",
      artifact_generated_at: null,
      pressure_total_rows: null,
      cleanup_mode: null,
      approval_status: "not_required",
    }],
    completedReceiptId: "receipt-1",
  });
  assert.equal(completeSuccess.featuredReceiptId, "receipt-1");
  assert.equal(completeSuccess.actionNotice, "Cleanup receipt marked completed with operator execution acknowledgement.");
  assert.deepEqual(completeSuccess.outcomeNotes, {});
  assert.deepEqual(completeSuccess.proofReferences, {});
  assert.equal(completeSuccess.filter, "completed");
});
