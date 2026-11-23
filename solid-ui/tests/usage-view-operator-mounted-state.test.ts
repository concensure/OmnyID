import assert from "node:assert/strict";
import test from "node:test";

import {
  readOperatorDerivedState,
  readOperatorRuntimeRemediationDerivedState,
} from "../src/lib/operatorUsageSectionState.ts";
import { readUsageViewOperatorMountedSectionModel } from "../src/lib/usageViewOperatorMountedState.ts";

test("readUsageViewOperatorMountedSectionModel assembles the mounted operator section contract", () => {
  const operatorDerived = readOperatorDerivedState({
    hasSessionToken: true,
    usersLoading: false,
    profitLoading: false,
    remediationHistoryLoading: false,
    usersValue: {
      users: [{
        user_id: "usr_123",
        email: "ada@example.com",
        display_name: "Ada",
        email_verified: true,
        plan: "pro",
        billing_status: "active",
        account_status: "active",
        last_session_at: "2026-08-31T10:00:00Z",
        support_access_status: "enabled",
        support_access_expires_at: "2026-09-01T10:00:00Z",
      }],
      query: "ada",
    },
    profitValue: {
      users: [{
        user_id: "usr_123",
        plan: "pro",
        cost_usd: 12.5,
        revenue_usd: 40,
        margin_usd: 27.5,
      }],
      by_workflow: [{
        workflow_id: "wf_123",
        cost_usd: 12.5,
        events: 3,
      }],
      daily_cost: [],
      operational_guidance: null,
    },
    remediationHistoryValue: { entries: [] },
    usersError: null,
    profitError: null,
    remediationHistoryError: null,
    formatMoneyLabel: (amount) => `$${Number(amount ?? 0).toFixed(2)}`,
    formatArtifactSummary: ({ generatedAt, source }) => `${generatedAt} | ${source}`,
    runtimeRemediationBusy: false,
  });
  const remediationDerived = readOperatorRuntimeRemediationDerivedState({
    history: {
      entries: [{
        receipt_id: "receipt-open",
        action: "archive_backlog",
        lifecycle_status: "open",
        execution_mode: "manual",
        issued_at: "2026-08-31T10:00:00Z",
        completed_at: null,
        command: "./cleanup.ps1",
        source: "daemon_heartbeats",
        artifact_generated_at: "2026-08-31T10:00:00Z",
        pressure_total_rows: 1200,
        cleanup_mode: "archive_only",
        approval_status: "not_required",
      }],
      retention: {
        max_receipts_per_operator: 100,
        max_age_days: 30,
        rollover_behavior: "oldest_pruned_first",
      },
    },
    activeReceipt: null,
    pinnedReceiptId: null,
    currentFilter: "open",
    outcomeNotes: {},
    proofReferences: {},
    completionBusyReceiptId: null,
  });

  const model = readUsageViewOperatorMountedSectionModel({
    operatorDerivedState: operatorDerived,
    operatorRuntimeRemediationDerivedState: remediationDerived,
    operatorUserDetail: {
      user_id: "usr_123",
      email: "ada@example.com",
      display_name: "Ada",
      auth_provider: "google",
      created_at: "2026-08-01T00:00:00Z",
      account_status: "active",
      account_status_reason: null,
      email_verified: true,
      support_access: {
        status: "enabled",
        access_scope: "runtime_metadata_only",
        expires_at: null,
      },
      sessions: [],
      support_access_history: [],
    },
    operatorUsersQuery: "ada",
    operatorQueryDraft: "ada",
    operatorQueryApplied: "ada",
    operatorUsersLoading: false,
    operatorProfitLoading: false,
    selectedOperatorUserId: "usr_123",
    operatorActionBusyUserId: null,
    operatorActionError: null,
    operatorActionNotice: "Support access enabled.",
    runtimeRemediationReceipt: null,
    runtimeRemediationBusy: false,
    runtimeRemediationFilter: "open",
    runtimeRemediationFeaturedReceiptId: null,
    runtimeRemediationOutcomeNotes: {},
    runtimeRemediationProofReferences: {},
    runtimeRemediationCompleteBusyId: null,
    routeWeddingAiThroughAdmin: true,
    connectedAppIds: [],
    adminWeddingOpsOracleMetricsPayload: {
      disk_used_bytes: 1024 * 1024 * 1024 * 31,
      disk_total_bytes: 1024 * 1024 * 1024 * 100,
      ram_used_bytes: 1024 * 1024 * 1024 * 3.5,
      ram_total_bytes: 1024 * 1024 * 1024 * 8,
      hostname: "oracle-prod-1",
    },
    adminWeddingAiRoutingPolicyPayload: {
      backendPolicyEndpointMounted: true,
      auditReceiptProjectionReady: true,
      tenantBoundaryEnforced: true,
      budgetGuardrailsReady: true,
      weddingTemplateScopeOnly: true,
      masterAgentQueryExcluded: true,
      policySourceLabel: "admin-wedding-ai-routing-policy",
      lastVerifiedAt: "2026-09-14T09:00:00.000Z",
    },
    adminWeddingApiStackPayload: {
      providers: [],
      connectedAppIds: ["google-places-api", "google-maps-platform", "gcal", "weatherapi", "stripe"],
      guardrails: ["Provider keys stay server-side."],
    },
    formatDateTimeLabel: (value) => value,
    formatMoneyLabel: (amount) => `$${Number(amount ?? 0).toFixed(2)}`,
  });

  assert.equal(model.overviewSection.actionNotice, "Support access enabled.");
  assert.equal(model.userFilterForm.queryDraft, "ada");
  assert.equal(model.userSummaryPanel.rows.length, 1);
  assert.equal(model.userSummaryPanel.rows[0]?.userId, "usr_123");
  assert.equal(model.userDetailPanel.open, true);
  assert.equal(model.userDetailPanel.model.title, "ada@example.com");
  assert.equal(model.profitabilityPanel.rows[0]?.marginLabel, "$27.50");
  assert.equal(model.remediationFeed.rows[0]?.entry.receipt_id, "receipt-open");
  assert.match(model.remediationFeed.rows[0]?.pressureLine ?? "", /1,200|1200/);
  assert.equal(model.historyPanel.currentOpenCount, 1);
  assert.equal(model.adminWeddingOpsPanel.toggle.enabled, true);
  assert.equal(model.adminWeddingOpsPanel.toggle.statusLabel, "Backend-enforced wedding routing");
  assert.equal(model.adminWeddingOpsPanel.metrics.find((metric) => metric.title === "Signed-up users")?.value, "At least 1");
  assert.equal(model.adminWeddingOpsPanel.metrics.find((metric) => metric.title === "Oracle disk")?.value, "31 GB / 100 GB");
  assert.equal(model.adminWeddingOpsPanel.metrics.find((metric) => metric.title === "Oracle RAM")?.detail, "Reported by oracle-prod-1.");
  assert.equal(model.adminWeddingOpsPanel.metrics.find((metric) => metric.title === "Ops backend metrics")?.value, "Partial metrics");
  assert.equal(model.adminWeddingOpsPanel.metrics.find((metric) => metric.title === "Wedding AI routing policy")?.value, "Backend enforced");
  assert.equal(model.adminWeddingOpsPanel.metrics.find((metric) => metric.title === "Wedding API stack")?.value, "Required providers ready");
});
