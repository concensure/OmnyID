import assert from "node:assert/strict";
import test from "node:test";

import {
  commitOperatorActionRunState,
  commitOperatorActionSuccessState,
  commitRuntimeRemediationDraftState,
  commitRuntimeRemediationCompleteStartState,
  commitRuntimeRemediationCompleteSuccessState,
  commitRuntimeRemediationIssueStartState,
  commitRuntimeRemediationIssueSuccessState,
  commitUsageViewArchiveOnlyFailureState,
  commitUsageViewArchiveOnlyRequestStartState,
  commitUsageViewArchiveOnlySuccessState,
  commitUsageViewBillingActionFailureState,
  commitUsageViewBillingCopyUnavailableState,
  commitUsageViewBillingRequestStartState,
  commitUsageViewOperationalCommandCopyStartState,
} from "../src/lib/usageViewStateCommitters.ts";

test("usage view billing committers apply request and failure states in stable order", () => {
  const calls: string[] = [];
  commitUsageViewOperationalCommandCopyStartState({
    state: {
      requestId: 3,
      operationalCommandNotice: null,
      billingActionError: null,
    },
    setOperationalCommandNotice: (value) => calls.push(`operational-notice:${value}`),
    setBillingActionError: (value) => calls.push(`billing-error:${value}`),
  });
  commitUsageViewBillingRequestStartState({
    state: {
      requestId: 5,
      modeError: null,
      upgradeActionNotice: null,
      billingActionError: null,
      billingActionBusy: "copy",
    },
    setModeError: (value) => calls.push(`mode-error:${value}`),
    setUpgradeActionNotice: (value) => calls.push(`upgrade-notice:${value}`),
    setBillingActionError: (value) => calls.push(`billing-error:${value}`),
    setBillingActionBusy: (value) => calls.push(`billing-busy:${value}`),
  });
  commitUsageViewArchiveOnlyRequestStartState({
    state: {
      requestId: 8,
      upgradeActionNotice: null,
      billingActionError: null,
      modeSaving: true,
      modeError: null,
    },
    setUpgradeActionNotice: (value) => calls.push(`archive-upgrade-notice:${value}`),
    setBillingActionError: (value) => calls.push(`archive-billing-error:${value}`),
    setModeSaving: (value) => calls.push(`mode-saving:${value}`),
    setModeError: (value) => calls.push(`archive-mode-error:${value}`),
  });
  commitUsageViewBillingCopyUnavailableState({
    state: {
      billingActionError: {
        tone: "warning",
        title: "Copy failed",
        summary: "Clipboard unavailable",
        nextStep: "Retry later",
      },
      billingActionBusy: null,
    },
    setBillingActionError: (value) => calls.push(`copy-unavailable:${value?.title}`),
    setBillingActionBusy: (value) => calls.push(`copy-unavailable-busy:${value}`),
  });
  commitUsageViewBillingActionFailureState({
    state: {
      billingActionError: {
        tone: "warning",
        title: "Portal failed",
        summary: "Billing request failed",
        nextStep: "Retry later",
      },
      billingActionBusy: null,
    },
    setBillingActionError: (value) => calls.push(`billing-failure:${value?.title}`),
    setBillingActionBusy: (value) => calls.push(`billing-failure-busy:${value}`),
  });

  assert.deepEqual(calls, [
    "operational-notice:null",
    "billing-error:null",
    "mode-error:null",
    "upgrade-notice:null",
    "billing-error:null",
    "billing-busy:copy",
    "archive-upgrade-notice:null",
    "archive-billing-error:null",
    "mode-saving:true",
    "archive-mode-error:null",
    "copy-unavailable:Copy failed",
    "copy-unavailable-busy:null",
    "billing-failure:Portal failed",
    "billing-failure-busy:null",
  ]);
});

test("usage view success committers apply archive-only and operator success state in stable order", () => {
  const calls: string[] = [];
  commitUsageViewArchiveOnlyFailureState({
    state: {
      modeError: {
        tone: "warning",
        title: "Archive failed",
        summary: "Request failed",
        nextStep: "Retry later",
      },
      modeSaving: false,
    },
    setModeError: (value) => calls.push(`archive-failure:${value?.title}`),
    setModeSaving: (value) => calls.push(`archive-failure-saving:${value}`),
  });
  commitUsageViewArchiveOnlySuccessState({
    state: {
      billing: {
        plan: "free",
        status: "active",
        checkout_available: true,
        billing_portal_available: false,
        archive_only_enabled: true,
        storage_used_bytes: 1,
        storage_quota_bytes: 2,
        quota_state: "ok",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        current_period_end: null,
      },
      modeSaving: false,
    },
    setBilling: (value) => calls.push(`archive-success:${value.archive_only_enabled}`),
    setModeSaving: (value) => calls.push(`archive-success-saving:${value}`),
  });
  commitOperatorActionRunState({
    state: {
      busyUserId: "user-1",
      actionError: null,
      actionNotice: null,
    },
    setOperatorActionBusyUserId: (value) => calls.push(`operator-run-busy:${value}`),
    setOperatorActionError: (value) => calls.push(`operator-run-error:${value}`),
    setOperatorActionNotice: (value) => calls.push(`operator-run-notice:${value}`),
  });
  commitOperatorActionSuccessState({
    state: {
      actionNotice: "3 sessions revoked.",
      selectedUserId: "user-1",
    },
    setOperatorActionNotice: (value) => calls.push(`operator-success-notice:${value}`),
    setSelectedOperatorUserId: (value) => calls.push(`operator-success-user:${value}`),
    refreshOperatorPanel: () => calls.push("operator-refresh"),
    refetchOperatorUserDetail: () => calls.push("operator-refetch"),
  });

  assert.deepEqual(calls, [
    "archive-failure:Archive failed",
    "archive-failure-saving:false",
    "archive-success:true",
    "archive-success-saving:false",
    "operator-run-busy:user-1",
    "operator-run-error:null",
    "operator-run-notice:null",
    "operator-success-notice:3 sessions revoked.",
    "operator-success-user:user-1",
    "operator-refresh",
    "operator-refetch",
  ]);
});

test("runtime remediation committers apply start and success state in stable order", () => {
  const calls: string[] = [];
  commitRuntimeRemediationIssueStartState({
    state: {
      busy: true,
      actionError: null,
      actionNotice: null,
    },
    setRuntimeRemediationBusy: (value) => calls.push(`issue-busy:${value}`),
    setOperatorActionError: (value) => calls.push(`issue-error:${value}`),
    setOperatorActionNotice: (value) => calls.push(`issue-notice:${value}`),
  });
  commitRuntimeRemediationIssueSuccessState({
    state: {
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
      actionNotice: "Issued",
    },
    setRuntimeRemediationReceipt: (value) => calls.push(`issue-receipt:${value?.receipt_id}`),
    persistRuntimeRemediationFeaturedReceiptId: (value) => calls.push(`issue-featured:${value}`),
    persistRuntimeRemediationFilter: (value) => calls.push(`issue-filter:${value}`),
    refetchOperatorRuntimeRemediationHistory: () => calls.push("issue-refetch"),
    setOperatorActionNotice: (value) => calls.push(`issue-success-notice:${value}`),
  });
  commitRuntimeRemediationCompleteStartState({
    state: {
      busyReceiptId: "receipt-1",
      actionError: null,
      actionNotice: null,
    },
    setRuntimeRemediationCompleteBusyId: (value) => calls.push(`complete-busy:${value}`),
    setOperatorActionError: (value) => calls.push(`complete-error:${value}`),
    setOperatorActionNotice: (value) => calls.push(`complete-notice:${value}`),
  });
  commitRuntimeRemediationCompleteSuccessState({
    state: {
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
      featuredReceiptId: "receipt-1",
      actionNotice: "Completed",
      outcomeNotes: {},
      proofReferences: {},
      filter: "completed",
    },
    setRuntimeRemediationReceipt: (value) => calls.push(`complete-receipt:${value?.receipt_id}`),
    persistRuntimeRemediationFeaturedReceiptId: (value) => calls.push(`complete-featured:${value}`),
    persistRuntimeRemediationFilter: (value) => calls.push(`complete-filter:${value}`),
    persistRuntimeRemediationOutcomeNotes: (value) => calls.push(`complete-outcomes:${Object.keys(value).length}`),
    persistRuntimeRemediationProofReferences: (value) => calls.push(`complete-proofs:${Object.keys(value).length}`),
    refetchOperatorRuntimeRemediationHistory: () => calls.push("complete-refetch"),
    setOperatorActionNotice: (value) => calls.push(`complete-success-notice:${value}`),
  });

  assert.deepEqual(calls, [
    "issue-busy:true",
    "issue-error:null",
    "issue-notice:null",
    "issue-receipt:receipt-1",
    "issue-featured:receipt-1",
    "issue-filter:open",
    "issue-refetch",
    "issue-success-notice:Issued",
    "complete-busy:receipt-1",
    "complete-error:null",
    "complete-notice:null",
    "complete-receipt:receipt-1",
    "complete-featured:receipt-1",
    "complete-filter:completed",
    "complete-outcomes:0",
    "complete-proofs:0",
    "complete-refetch",
    "complete-success-notice:Completed",
  ]);
});

test("runtime remediation draft committer persists outcome, proof, and filter in stable order", () => {
  const calls: string[] = [];
  commitRuntimeRemediationDraftState({
    state: {
      outcomeNotes: { "receipt-1": "verified" },
      proofReferences: { "receipt-1": "artifact-1" },
      filter: "drafts",
    },
    persistRuntimeRemediationOutcomeNotes: (value) => calls.push(`draft-outcomes:${Object.keys(value).length}`),
    persistRuntimeRemediationProofReferences: (value) => calls.push(`draft-proofs:${Object.keys(value).length}`),
    persistRuntimeRemediationFilter: (value) => calls.push(`draft-filter:${value}`),
  });

  assert.deepEqual(calls, [
    "draft-outcomes:1",
    "draft-proofs:1",
    "draft-filter:drafts",
  ]);
});
