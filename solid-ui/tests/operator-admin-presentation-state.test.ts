import assert from "node:assert/strict";
import test from "node:test";

import {
  readOperatorActionNotice,
  readOperatorActionFailureCard,
  readOperatorAccountStatusSummary,
  readOperatorAuthSummary,
  readOperatorDetailHeader,
  readOperatorDetailLoadingState,
  readOperatorLoadFailureCard,
  readOperatorOperationalGuidanceCardModel,
  readOperatorOverviewCardModels,
  readOperatorOverviewIntro,
  readOperatorProfitabilityEmptyState,
  readOperatorProfitabilityRow,
  readOperatorRefreshLabel,
  readOperatorSessionCardModel,
  readOperatorSessionsEmptyState,
  readOperatorSupportAccessCardModel,
  readOperatorSupportAccessHistoryEmptyState,
  readSupportAccessHistoryHeading,
  readOperatorSupportAccessSummary,
  readOperatorTopWorkflowSummary,
  readOperatorUserRowModel,
  readOperatorUserSummaryTableRow,
  readOperatorUserIdentitySummary,
  readOperatorUserRowActions,
  readOperatorUserDetailPanelModel,
  readOperatorUserSummaryEmptyState,
  readOperatorUserSummaryQueryLabel,
  readOperatorUserSupportSummary,
  readTimestampSummaryLine,
} from "../src/lib/operatorAdminPresentationState.ts";

test("readOperatorActionNotice formats each admin action outcome", () => {
  assert.equal(
    readOperatorActionNotice({
      action: "revoke_all_sessions",
      email: "user@example.com",
      sessionsRevoked: 2,
      supportAccessRevoked: false,
    }),
    "2 sessions revoked for user@example.com.",
  );
  assert.equal(
    readOperatorActionNotice({
      action: "suspend_account",
      email: "user@example.com",
      sessionsRevoked: 1,
      supportAccessRevoked: false,
    }),
    "user@example.com was suspended and 1 session were revoked.",
  );
  assert.equal(
    readOperatorActionNotice({
      action: "reactivate_account",
      email: "user@example.com",
      sessionsRevoked: 0,
      supportAccessRevoked: false,
    }),
    "user@example.com was reactivated.",
  );
  assert.equal(
    readOperatorActionNotice({
      action: "revoke_support_access",
      email: "user@example.com",
      sessionsRevoked: 0,
      supportAccessRevoked: false,
    }),
    "No active support access grant was open for user@example.com.",
  );
});

test("readSupportAccessHistoryHeading uses safe defaults and stable separators", () => {
  assert.equal(
    readSupportAccessHistoryHeading({
      status: "active",
      accessScope: "full_access",
    }),
    "active | full_access",
  );
  assert.equal(
    readSupportAccessHistoryHeading({
      status: "",
      accessScope: null,
    }),
    "unknown | runtime_metadata_only",
  );
});

test("readTimestampSummaryLine prefers mounted labels and falls back safely", () => {
  assert.equal(
    readTimestampSummaryLine({
      prefix: "Granted",
      mountedLabel: "8/30/2026, 8:00:00 PM",
      fallback: "2026-08-30T10:00:00Z",
    }),
    "Granted 8/30/2026, 8:00:00 PM",
  );
  assert.equal(
    readTimestampSummaryLine({
      prefix: "Expires",
      mountedLabel: "",
      fallback: "2026-08-30T12:00:00Z",
    }),
    "Expires 2026-08-30T12:00:00Z",
  );
});

test("readOperatorSupportAccessSummary applies safe defaults", () => {
  assert.deepEqual(
    readOperatorSupportAccessSummary({
      status: "active",
      accessScope: "full_access",
    }),
    {
      statusLabel: "active",
      scopeLabel: "full_access",
    },
  );
  assert.deepEqual(
    readOperatorSupportAccessSummary({
      status: "",
      accessScope: null,
    }),
    {
      statusLabel: "disabled",
      scopeLabel: "runtime_metadata_only",
    },
  );
});

test("readOperatorSessionCardModel formats session timestamps through the shared timestamp helper", () => {
  assert.deepEqual(
    readOperatorSessionCardModel({
      tokenPreview: "tok_preview",
      createdAtLabel: "8/30/2026, 8:00:00 PM",
      createdAtFallback: "2026-08-30T10:00:00Z",
      expiresAtLabel: null,
      expiresAtFallback: "2026-08-31T10:00:00Z",
    }),
    {
      tokenPreview: "tok_preview",
      createdSummary: "Created 8/30/2026, 8:00:00 PM",
      expiresSummary: "Expires 2026-08-31T10:00:00Z",
    },
  );
});

test("readOperatorTopWorkflowSummary formats mounted workflow metrics and empty fallback", () => {
  assert.deepEqual(
    readOperatorTopWorkflowSummary({
      workflowId: "wf_123",
      costLabel: "$12.50",
      eventCount: 3,
    }),
    {
      workflowLabel: "wf_123",
      detail: "$12.50 across 3 events",
    },
  );
  assert.deepEqual(
    readOperatorTopWorkflowSummary({
      workflowId: null,
      costLabel: "$0.00",
      eventCount: 0,
    }),
    {
      workflowLabel: "No workflow cost rows",
      detail: "Profit admin data has not recorded workflow-level costs yet.",
    },
  );
});

test("readOperatorUserIdentitySummary renders identity and verification state", () => {
  assert.equal(
    readOperatorUserIdentitySummary({
      displayName: "Ada Lovelace",
      userId: "usr_123",
      emailVerified: true,
    }),
    "Ada Lovelace | verified",
  );
  assert.equal(
    readOperatorUserIdentitySummary({
      displayName: "",
      userId: "usr_123",
      emailVerified: false,
    }),
    "usr_123 | unverified",
  );
});

test("readOperatorUserSupportSummary formats status and optional expiry", () => {
  assert.deepEqual(
    readOperatorUserSupportSummary({
      status: "active",
      expiresAtLabel: "8/30/2026, 8:00:00 PM",
    }),
    {
      statusLabel: "active",
      expiresSummary: "until 8/30/2026, 8:00:00 PM",
    },
  );
  assert.deepEqual(
    readOperatorUserSupportSummary({
      status: "",
      expiresAtLabel: null,
    }),
    {
      statusLabel: "none",
      expiresSummary: null,
    },
  );
});

test("operator admin empty and loading copy stays centralized", () => {
  assert.equal(readOperatorUserSummaryQueryLabel("paid"), 'Filtered by "paid"');
  assert.equal(readOperatorUserSummaryQueryLabel(""), "Latest 25 rows");
  assert.equal(readOperatorUserSummaryEmptyState(), "No operator user rows matched the current filter.");
  assert.equal(readOperatorDetailLoadingState(), "Loading user detail...");
  assert.equal(readOperatorSessionsEmptyState(), "No active sessions remain for this user.");
  assert.equal(
    readOperatorSupportAccessHistoryEmptyState(),
    "No support access grants have been recorded for this user.",
  );
});

test("operator overview intro and refresh label stay centralized", () => {
  assert.equal(
    readOperatorOverviewIntro(),
    "Visible only to allowlisted operator emails. This narrows the missing admin-surface blocker with live user, billing, and profitability context.",
  );
  assert.equal(readOperatorRefreshLabel(true), "Refreshing...");
  assert.equal(readOperatorRefreshLabel(false), "Reload operator data");
});

test("operator overview failure cards normalize fallback detail safely", () => {
  assert.deepEqual(
    readOperatorLoadFailureCard(new Error("Timed out")),
    {
      title: "Operator overview failed to load",
      detail: "Timed out",
    },
  );
  assert.deepEqual(
    readOperatorLoadFailureCard(null),
    {
      title: "Operator overview failed to load",
      detail: "The operator endpoints did not return usable data.",
    },
  );
  assert.deepEqual(
    readOperatorActionFailureCard("  Access denied  "),
    {
      title: "Operator action failed",
      detail: "Access denied",
    },
  );
  assert.deepEqual(
    readOperatorActionFailureCard(" "),
    {
      title: "Operator action failed",
      detail: "The operator action did not complete successfully.",
    },
  );
});

test("operator operational guidance card model centralizes button labels and fallback copy", () => {
  assert.deepEqual(
    readOperatorOperationalGuidanceCardModel({
      title: "Operational cleanup required",
      detail: "Archive backlog exceeded threshold.",
      tone: "warning",
      command: "./cleanup.ps1",
      artifactSummary: "Updated 8/30/2026 | daemon_heartbeats",
      issueReceiptBusy: true,
    }),
    {
      title: "Operational cleanup required",
      detail: "Archive backlog exceeded threshold.",
      tone: "warning",
      artifactSummary: "Updated 8/30/2026 | daemon_heartbeats",
      command: "./cleanup.ps1",
      copyCommandLabel: "Copy cleanup command",
      issueReceiptLabel: "Issuing receipt...",
    },
  );
});

test("readOperatorOverviewCardModels centralizes operator summary tile copy and fallbacks", () => {
  assert.deepEqual(
    readOperatorOverviewCardModels({
      userRowCount: 25,
      monthlyCostLabel: "$12.50",
      monthlyMarginLabel: "$87.50",
      monthlyRevenueLabel: "$100.00",
      latestDailyCostLabel: "$1.25",
      latestDailyCostDayLabel: "2026-08-30",
    }),
    [
      {
        title: "User rows",
        value: "25",
        detail: "Current bounded admin query result.",
      },
      {
        title: "Monthly cost",
        value: "$12.50",
        detail: "Summed from the top operator profitability slice.",
      },
      {
        title: "Monthly margin",
        value: "$87.50",
        detail: "Revenue $100.00 less recorded cost.",
      },
      {
        title: "Latest daily cost",
        value: "$1.25",
        detail: "2026-08-30",
      },
    ],
  );
  assert.equal(
    readOperatorOverviewCardModels({
      userRowCount: 0,
      monthlyCostLabel: "$0.00",
      monthlyMarginLabel: "$0.00",
      monthlyRevenueLabel: "$0.00",
      latestDailyCostLabel: "$0.00",
      latestDailyCostDayLabel: "",
    })[3]?.detail,
    "No recent daily cost rows.",
  );
});

test("readOperatorProfitabilityEmptyState stays centralized", () => {
  assert.equal(
    readOperatorProfitabilityEmptyState(),
    "No profitability rows are available for the current month.",
  );
});

test("readOperatorUserRowActions derives inspect and account action labels from row state", () => {
  assert.deepEqual(
    readOperatorUserRowActions({
      isSelected: true,
      isBusy: false,
      accountStatus: "active",
    }),
    {
      inspectLabel: "Inspecting",
      accountAction: "suspend_account",
      accountActionLabel: "Suspend",
      supportActionLabel: "Revoke support",
      sessionsActionLabel: "Revoke sessions",
    },
  );
  assert.deepEqual(
    readOperatorUserRowActions({
      isSelected: false,
      isBusy: true,
      accountStatus: "suspended",
    }),
    {
      inspectLabel: "Inspect",
      accountAction: "reactivate_account",
      accountActionLabel: "Working...",
      supportActionLabel: "Working...",
      sessionsActionLabel: "Working...",
    },
  );
});

test("readOperatorDetailHeader resolves title and subtitle from selected and fetched user state", () => {
  assert.deepEqual(
    readOperatorDetailHeader({
      selectedEmail: "user@example.com",
      detailEmail: null,
      selectedDisplayName: "",
      detailDisplayName: "Ada Lovelace",
      selectedUserId: "usr_123",
      fallbackUserId: "usr_fallback",
    }),
    {
      title: "user@example.com",
      subtitle: "Ada Lovelace",
    },
  );
  assert.deepEqual(
    readOperatorDetailHeader({
      selectedEmail: null,
      detailEmail: null,
      selectedDisplayName: null,
      detailDisplayName: null,
      selectedUserId: null,
      fallbackUserId: null,
    }),
    {
      title: "Operator detail",
      subtitle: "unknown",
    },
  );
});

test("readOperatorAuthSummary formats auth provider and joined copy with fallbacks", () => {
  assert.deepEqual(
    readOperatorAuthSummary({
      authProvider: "google",
      joinedAtLabel: "8/30/2026, 8:00:00 PM",
    }),
    {
      providerLabel: "google",
      joinedSummary: "Joined 8/30/2026, 8:00:00 PM",
    },
  );
  assert.deepEqual(
    readOperatorAuthSummary({
      authProvider: "",
      joinedAtLabel: null,
    }),
    {
      providerLabel: "unknown",
      joinedSummary: "Joined unknown",
    },
  );
});

test("readOperatorAccountStatusSummary formats status and reason fallback", () => {
  assert.deepEqual(
    readOperatorAccountStatusSummary({
      accountStatus: "suspended",
      accountStatusReason: "Chargeback review",
    }),
    {
      statusLabel: "suspended",
      reasonLabel: "Chargeback review",
    },
  );
  assert.deepEqual(
    readOperatorAccountStatusSummary({
      accountStatus: "",
      accountStatusReason: null,
    }),
    {
      statusLabel: "active",
      reasonLabel: "No operator status note recorded.",
    },
  );
});

test("readOperatorSupportAccessCardModel reuses support-access summary with card copy", () => {
  assert.deepEqual(
    readOperatorSupportAccessCardModel({
      status: "active",
      accessScope: "full_access",
    }),
    {
      statusLabel: "active",
      scopeSummary: "Scope full_access",
    },
  );
});

test("readOperatorUserRowModel centralizes row fallback and action state", () => {
  assert.deepEqual(
    readOperatorUserRowModel({
      email: "user@example.com",
      displayName: "",
      userId: "usr_123",
      emailVerified: false,
      plan: "paid",
      billingStatus: "",
      accountStatus: null,
      lastSessionLabel: null,
      supportStatus: "active",
      supportExpiresAtLabel: "8/30/2026, 8:00:00 PM",
      isSelected: true,
      isBusy: false,
    }),
    {
      emailLabel: "user@example.com",
      identitySummary: "usr_123 | unverified",
      billingStatusLabel: "unknown",
      accountStatusLabel: "active",
      lastSessionLabel: "No recent session",
      supportSummary: {
        statusLabel: "active",
        expiresSummary: "until 8/30/2026, 8:00:00 PM",
      },
      actions: {
        inspectLabel: "Inspecting",
        accountAction: "suspend_account",
        accountActionLabel: "Suspend",
        supportActionLabel: "Revoke support",
        sessionsActionLabel: "Revoke sessions",
      },
    },
  );
});

test("operator derived row and detail builders preserve mounted section contracts", () => {
  const rowModel = readOperatorUserRowModel({
    email: "ada@example.com",
    displayName: "Ada Lovelace",
    userId: "usr_123",
    emailVerified: true,
    plan: "pro",
    billingStatus: "active",
    accountStatus: "suspended",
    lastSessionLabel: "8/30/2026, 8:00:00 PM",
    supportStatus: "active",
    supportExpiresAtLabel: "8/31/2026, 8:00:00 PM",
    isSelected: false,
    isBusy: false,
  });
  assert.deepEqual(
    readOperatorUserSummaryTableRow({
      userId: "usr_123",
      planLabel: "Pro",
      accountStatusToneClass: "text-red-700",
      rowModel,
    }),
    {
      userId: "usr_123",
      emailLabel: "ada@example.com",
      identitySummary: "Ada Lovelace | verified",
      planLabel: "Pro",
      billingStatusLabel: "active",
      accountStatusLabel: "suspended",
      accountStatusToneClass: "text-red-700",
      lastSessionLabel: "8/30/2026, 8:00:00 PM",
      supportStatusLabel: "active",
      supportExpiresSummary: "until 8/31/2026, 8:00:00 PM",
      inspectLabel: "Inspect",
      accountAction: "reactivate_account",
      accountActionLabel: "Reactivate",
      supportActionLabel: "Revoke support",
      sessionsActionLabel: "Revoke sessions",
    },
  );

  assert.deepEqual(
    readOperatorProfitabilityRow({
      userId: "usr_123",
      planLabel: "Pro",
      costLabel: "$15.00",
      revenueLabel: "$99.00",
      marginLabel: "$84.00",
    }),
    {
      userId: "usr_123",
      planLabel: "Pro",
      costLabel: "$15.00",
      revenueLabel: "$99.00",
      marginLabel: "$84.00",
    },
  );

  assert.deepEqual(
    readOperatorUserDetailPanelModel({
      title: "ada@example.com",
      subtitle: "Ada Lovelace",
      loadingLabel: "Loading user detail...",
      authProviderLabel: "google",
      authJoinedSummary: "Joined 8/30/2026, 8:00:00 PM",
      accountStatusLabel: "suspended",
      accountStatusToneClass: "text-red-700",
      accountReasonLabel: "Manual review",
      supportStatusLabel: "active",
      supportScopeSummary: "Scope full_access",
      sessions: [{
        tokenPreview: "tok_preview",
        createdSummary: "Created 8/30/2026, 8:00:00 PM",
        expiresSummary: "Expires 8/31/2026, 8:00:00 PM",
      }],
      sessionsEmptyState: "No active sessions remain for this user.",
      supportHistory: [{
        heading: "active | full_access",
        grantedSummary: "Granted 8/30/2026, 8:00:00 PM",
        expiresSummary: "Expires 8/31/2026, 8:00:00 PM",
        reason: "Manual review",
      }],
      supportHistoryEmptyState: "No support access grants have been recorded for this user.",
    }),
    {
      title: "ada@example.com",
      subtitle: "Ada Lovelace",
      loadingLabel: "Loading user detail...",
      authProviderLabel: "google",
      authJoinedSummary: "Joined 8/30/2026, 8:00:00 PM",
      accountStatusLabel: "suspended",
      accountStatusToneClass: "text-red-700",
      accountReasonLabel: "Manual review",
      supportStatusLabel: "active",
      supportScopeSummary: "Scope full_access",
      sessions: [{
        tokenPreview: "tok_preview",
        createdSummary: "Created 8/30/2026, 8:00:00 PM",
        expiresSummary: "Expires 8/31/2026, 8:00:00 PM",
      }],
      sessionsEmptyState: "No active sessions remain for this user.",
      supportHistory: [{
        heading: "active | full_access",
        grantedSummary: "Granted 8/30/2026, 8:00:00 PM",
        expiresSummary: "Expires 8/31/2026, 8:00:00 PM",
        reason: "Manual review",
      }],
      supportHistoryEmptyState: "No support access grants have been recorded for this user.",
    },
  );
});
