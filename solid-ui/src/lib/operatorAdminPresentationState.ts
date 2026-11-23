// @locs-version: 1.0
function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function readOperatorActionNotice(args: {
  action: string;
  email: string;
  sessionsRevoked: number;
  supportAccessRevoked: boolean;
}): string {
  if (args.action === "revoke_all_sessions") {
    return `${countLabel(args.sessionsRevoked, "session")} revoked for ${args.email}.`;
  }
  if (args.action === "suspend_account") {
    return `${args.email} was suspended and ${countLabel(args.sessionsRevoked, "session")} were revoked.`;
  }
  if (args.action === "reactivate_account") {
    return `${args.email} was reactivated.`;
  }
  return args.supportAccessRevoked
    ? `Support access revoked for ${args.email}.`
    : `No active support access grant was open for ${args.email}.`;
}

export function readSupportAccessHistoryHeading(args: {
  status: string | null | undefined;
  accessScope: string | null | undefined;
}): string {
  const status = normalizeOptionalText(args.status) ?? "unknown";
  const scope = normalizeOptionalText(args.accessScope) ?? "runtime_metadata_only";
  return `${status} | ${scope}`;
}

export function readTimestampSummaryLine(args: {
  prefix: string;
  mountedLabel: string | null | undefined;
  fallback: string | null | undefined;
}): string {
  return `${args.prefix} ${normalizeOptionalText(args.mountedLabel) ?? normalizeOptionalText(args.fallback) ?? "unknown"}`;
}

export function readOperatorSupportAccessSummary(args: {
  status: string | null | undefined;
  accessScope: string | null | undefined;
}): {
  statusLabel: string;
  scopeLabel: string;
} {
  return {
    statusLabel: normalizeOptionalText(args.status) ?? "disabled",
    scopeLabel: normalizeOptionalText(args.accessScope) ?? "runtime_metadata_only",
  };
}

export function readOperatorSessionCardModel(args: {
  tokenPreview: string | null | undefined;
  createdAtLabel: string | null | undefined;
  createdAtFallback: string | null | undefined;
  expiresAtLabel: string | null | undefined;
  expiresAtFallback: string | null | undefined;
}) {
  return {
    tokenPreview: normalizeOptionalText(args.tokenPreview) ?? "unknown",
    createdSummary: readTimestampSummaryLine({
      prefix: "Created",
      mountedLabel: args.createdAtLabel,
      fallback: args.createdAtFallback,
    }),
    expiresSummary: readTimestampSummaryLine({
      prefix: "Expires",
      mountedLabel: args.expiresAtLabel,
      fallback: args.expiresAtFallback,
    }),
  };
}

export function readOperatorTopWorkflowSummary(args: {
  workflowId: string | null | undefined;
  costLabel: string;
  eventCount: number | null | undefined;
}): {
  workflowLabel: string;
  detail: string;
} {
  const normalizedEventCount = typeof args.eventCount === "number" && Number.isFinite(args.eventCount)
    ? Math.max(0, Math.trunc(args.eventCount))
    : 0;
  if (!normalizeOptionalText(args.workflowId)) {
    return {
      workflowLabel: "No workflow cost rows",
      detail: "Profit admin data has not recorded workflow-level costs yet.",
    };
  }
  return {
    workflowLabel: args.workflowId!.trim(),
    detail: `${args.costLabel} across ${normalizedEventCount} event${normalizedEventCount === 1 ? "" : "s"}`,
  };
}

export function readOperatorUserIdentitySummary(args: {
  displayName: string | null | undefined;
  userId: string | null | undefined;
  emailVerified: boolean;
}): string {
  const identity = normalizeOptionalText(args.displayName) ?? normalizeOptionalText(args.userId) ?? "unknown";
  return `${identity} | ${args.emailVerified ? "verified" : "unverified"}`;
}

export function readOperatorUserSupportSummary(args: {
  status: string | null | undefined;
  expiresAtLabel: string | null | undefined;
}): {
  statusLabel: string;
  expiresSummary: string | null;
} {
  return {
    statusLabel: normalizeOptionalText(args.status) ?? "none",
    expiresSummary: normalizeOptionalText(args.expiresAtLabel)
      ? `until ${args.expiresAtLabel!.trim()}`
      : null,
  };
}

export function readOperatorUserSummaryQueryLabel(query: string | null | undefined): string {
  const normalized = normalizeOptionalText(query);
  return normalized ? `Filtered by "${normalized}"` : "Latest 25 rows";
}

export function readOperatorUserSummaryEmptyState(): string {
  return "No operator user rows matched the current filter.";
}

export function readOperatorDetailLoadingState(): string {
  return "Loading user detail...";
}

export function readOperatorSessionsEmptyState(): string {
  return "No active sessions remain for this user.";
}

export function readOperatorSupportAccessHistoryEmptyState(): string {
  return "No support access grants have been recorded for this user.";
}

export function readOperatorOverviewIntro(): string {
  return "Visible only to allowlisted operator emails. This narrows the missing admin-surface blocker with live user, billing, and profitability context.";
}

export function readOperatorRefreshLabel(isRefreshing: boolean): string {
  return isRefreshing ? "Refreshing..." : "Reload operator data";
}

export function readOperatorLoadFailureCard(error: unknown): {
  title: string;
  detail: string;
} {
  return {
    title: "Operator overview failed to load",
    detail: error instanceof Error
      ? error.message
      : "The operator endpoints did not return usable data.",
  };
}

export function readOperatorActionFailureCard(error: string | null | undefined): {
  title: string;
  detail: string;
} {
  return {
    title: "Operator action failed",
    detail: normalizeOptionalText(error) ?? "The operator action did not complete successfully.",
  };
}

export function readOperatorOperationalGuidanceCardModel(args: {
  title: string | null | undefined;
  detail: string | null | undefined;
  tone: "warning" | "neutral" | null | undefined;
  command: string | null | undefined;
  artifactSummary: string | null | undefined;
  issueReceiptBusy: boolean;
}): {
  title: string;
  detail: string;
  tone: "warning" | "neutral";
  artifactSummary: string | null;
  command: string | null;
  copyCommandLabel: string;
  issueReceiptLabel: string;
} {
  return {
    title: normalizeOptionalText(args.title) ?? "Operational guidance active",
    detail: normalizeOptionalText(args.detail) ?? "Operator guidance is available.",
    tone: args.tone === "warning" ? "warning" : "neutral",
    artifactSummary: normalizeOptionalText(args.artifactSummary),
    command: normalizeOptionalText(args.command),
    copyCommandLabel: "Copy cleanup command",
    issueReceiptLabel: args.issueReceiptBusy ? "Issuing receipt..." : "Issue cleanup receipt",
  };
}

export function readOperatorOverviewCardModels(args: {
  userRowCount: number;
  monthlyCostLabel: string;
  monthlyMarginLabel: string;
  monthlyRevenueLabel: string;
  latestDailyCostLabel: string;
  latestDailyCostDayLabel: string | null | undefined;
}): Array<{
  title: string;
  value: string;
  detail: string;
}> {
  return [
    {
      title: "User rows",
      value: String(args.userRowCount),
      detail: "Current bounded admin query result.",
    },
    {
      title: "Monthly cost",
      value: args.monthlyCostLabel,
      detail: "Summed from the top operator profitability slice.",
    },
    {
      title: "Monthly margin",
      value: args.monthlyMarginLabel,
      detail: `Revenue ${args.monthlyRevenueLabel} less recorded cost.`,
    },
    {
      title: "Latest daily cost",
      value: args.latestDailyCostLabel,
      detail: normalizeOptionalText(args.latestDailyCostDayLabel) ?? "No recent daily cost rows.",
    },
  ];
}

export function readOperatorProfitabilityEmptyState(): string {
  return "No profitability rows are available for the current month.";
}

export function readOperatorUserRowActions(args: {
  isSelected: boolean;
  isBusy: boolean;
  accountStatus: string | null | undefined;
}): {
  inspectLabel: string;
  accountAction: "reactivate_account" | "suspend_account";
  accountActionLabel: string;
  supportActionLabel: string;
  sessionsActionLabel: string;
} {
  const suspended = normalizeOptionalText(args.accountStatus)?.toLowerCase() === "suspended";
  const busyLabel = "Working...";
  return {
    inspectLabel: args.isSelected ? "Inspecting" : "Inspect",
    accountAction: suspended ? "reactivate_account" : "suspend_account",
    accountActionLabel: args.isBusy ? busyLabel : suspended ? "Reactivate" : "Suspend",
    supportActionLabel: args.isBusy ? busyLabel : "Revoke support",
    sessionsActionLabel: args.isBusy ? busyLabel : "Revoke sessions",
  };
}

export function readOperatorDetailHeader(args: {
  selectedEmail: string | null | undefined;
  detailEmail: string | null | undefined;
  selectedDisplayName: string | null | undefined;
  detailDisplayName: string | null | undefined;
  selectedUserId: string | null | undefined;
  fallbackUserId: string | null | undefined;
}): {
  title: string;
  subtitle: string;
} {
  return {
    title: normalizeOptionalText(args.selectedEmail) ?? normalizeOptionalText(args.detailEmail) ?? "Operator detail",
    subtitle:
      normalizeOptionalText(args.selectedDisplayName)
      ?? normalizeOptionalText(args.detailDisplayName)
      ?? normalizeOptionalText(args.selectedUserId)
      ?? normalizeOptionalText(args.fallbackUserId)
      ?? "unknown",
  };
}

export function readOperatorAuthSummary(args: {
  authProvider: string | null | undefined;
  joinedAtLabel: string | null | undefined;
}): {
  providerLabel: string;
  joinedSummary: string;
} {
  return {
    providerLabel: normalizeOptionalText(args.authProvider) ?? "unknown",
    joinedSummary: `Joined ${normalizeOptionalText(args.joinedAtLabel) ?? "unknown"}`,
  };
}

export function readOperatorAccountStatusSummary(args: {
  accountStatus: string | null | undefined;
  accountStatusReason: string | null | undefined;
}): {
  statusLabel: string;
  reasonLabel: string;
} {
  return {
    statusLabel: normalizeOptionalText(args.accountStatus) ?? "active",
    reasonLabel: normalizeOptionalText(args.accountStatusReason) ?? "No operator status note recorded.",
  };
}

export function readOperatorSupportAccessCardModel(args: {
  status: string | null | undefined;
  accessScope: string | null | undefined;
}) {
  const summary = readOperatorSupportAccessSummary(args);
  return {
    statusLabel: summary.statusLabel,
    scopeSummary: `Scope ${summary.scopeLabel}`,
  };
}

export function readOperatorUserRowModel(args: {
  email: string | null | undefined;
  displayName: string | null | undefined;
  userId: string | null | undefined;
  emailVerified: boolean;
  plan: string | null | undefined;
  billingStatus: string | null | undefined;
  accountStatus: string | null | undefined;
  lastSessionLabel: string | null | undefined;
  supportStatus: string | null | undefined;
  supportExpiresAtLabel: string | null | undefined;
  isSelected: boolean;
  isBusy: boolean;
}) {
  const supportSummary = readOperatorUserSupportSummary({
    status: args.supportStatus,
    expiresAtLabel: args.supportExpiresAtLabel,
  });
  return {
    emailLabel: normalizeOptionalText(args.email) ?? "unknown",
    identitySummary: readOperatorUserIdentitySummary({
      displayName: args.displayName,
      userId: args.userId,
      emailVerified: args.emailVerified,
    }),
    billingStatusLabel: normalizeOptionalText(args.billingStatus) ?? "unknown",
    accountStatusLabel: normalizeOptionalText(args.accountStatus) ?? "active",
    lastSessionLabel: normalizeOptionalText(args.lastSessionLabel) ?? "No recent session",
    supportSummary,
    actions: readOperatorUserRowActions({
      isSelected: args.isSelected,
      isBusy: args.isBusy,
      accountStatus: args.accountStatus,
    }),
  };
}

export function readOperatorUserSummaryTableRow(args: {
  userId: string;
  planLabel: string;
  accountStatusToneClass: string;
  rowModel: ReturnType<typeof readOperatorUserRowModel>;
}) {
  return {
    userId: args.userId,
    emailLabel: args.rowModel.emailLabel,
    identitySummary: args.rowModel.identitySummary,
    planLabel: args.planLabel,
    billingStatusLabel: args.rowModel.billingStatusLabel,
    accountStatusLabel: args.rowModel.accountStatusLabel,
    accountStatusToneClass: args.accountStatusToneClass,
    lastSessionLabel: args.rowModel.lastSessionLabel,
    supportStatusLabel: args.rowModel.supportSummary.statusLabel,
    supportExpiresSummary: args.rowModel.supportSummary.expiresSummary,
    inspectLabel: args.rowModel.actions.inspectLabel,
    accountAction: args.rowModel.actions.accountAction,
    accountActionLabel: args.rowModel.actions.accountActionLabel,
    supportActionLabel: args.rowModel.actions.supportActionLabel,
    sessionsActionLabel: args.rowModel.actions.sessionsActionLabel,
  };
}

export function readOperatorProfitabilityRow(args: {
  userId: string;
  planLabel: string;
  costLabel: string;
  revenueLabel: string;
  marginLabel: string;
}) {
  return {
    userId: args.userId,
    planLabel: args.planLabel,
    costLabel: args.costLabel,
    revenueLabel: args.revenueLabel,
    marginLabel: args.marginLabel,
  };
}

export function readOperatorUserDetailPanelModel(args: {
  title: string;
  subtitle: string;
  loadingLabel: string;
  authProviderLabel: string;
  authJoinedSummary: string;
  accountStatusLabel: string;
  accountStatusToneClass: string;
  accountReasonLabel: string;
  supportStatusLabel: string;
  supportScopeSummary: string;
  sessions: Array<{
    tokenPreview: string;
    createdSummary: string;
    expiresSummary: string;
  }>;
  sessionsEmptyState: string;
  supportHistory: Array<{
    heading: string;
    grantedSummary: string;
    expiresSummary: string;
    reason: string | null;
  }>;
  supportHistoryEmptyState: string;
}) {
  return {
    title: args.title,
    subtitle: args.subtitle,
    loadingLabel: args.loadingLabel,
    authProviderLabel: args.authProviderLabel,
    authJoinedSummary: args.authJoinedSummary,
    accountStatusLabel: args.accountStatusLabel,
    accountStatusToneClass: args.accountStatusToneClass,
    accountReasonLabel: args.accountReasonLabel,
    supportStatusLabel: args.supportStatusLabel,
    supportScopeSummary: args.supportScopeSummary,
    sessions: args.sessions,
    sessionsEmptyState: args.sessionsEmptyState,
    supportHistory: args.supportHistory,
    supportHistoryEmptyState: args.supportHistoryEmptyState,
  };
}
