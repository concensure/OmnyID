// @locs-version: 1.0
import {
  fetchAdminUserDetail,
  fetchAdminThirdPartyToolPolicy,
  fetchAdminWeddingApiStack,
  fetchAdminUsers,
  fetchAdminWeddingAiRoutingPolicy,
  fetchAdminWeddingOpsMetrics,
  fetchOperatorRuntimeRemediationHistory,
  fetchProfitAdminSummary,
  type AdminWeddingAiRoutingPolicyPayload,
  type AdminWeddingApiStackPayload,
  type AdminWeddingOpsMetricsPayload,
  type AdminThirdPartyToolPolicyPayload,
  getBillingStatus,
  type BillingStatus,
  type OperatorRuntimeRemediationHistoryResponse,
  type OperatorUserDetail,
  type OperatorProfitAdminSummary,
  type OperatorUsersResponse,
} from "@/lib/api";

export type UsageViewOperatorResourceBundle = {
  users: OperatorUsersResponse | null;
  profit: OperatorProfitAdminSummary | null;
  remediationHistory: OperatorRuntimeRemediationHistoryResponse | null;
  adminWeddingOpsMetrics: AdminWeddingOpsMetricsPayload | null;
  adminWeddingAiRoutingPolicy: AdminWeddingAiRoutingPolicyPayload | null;
  adminWeddingApiStack: AdminWeddingApiStackPayload | null;
  adminThirdPartyToolPolicy: AdminThirdPartyToolPolicyPayload | null;
  usersError: unknown;
  profitError: unknown;
  remediationHistoryError: unknown;
  adminWeddingOpsMetricsError: unknown;
  adminWeddingAiRoutingPolicyError: unknown;
  adminWeddingApiStackError: unknown;
  adminThirdPartyToolPolicyError: unknown;
};

export function isUsageViewOperatorAccessDenied(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("operator access required") || message.includes("forbidden") || message.includes("403");
}

export async function loadUsageViewBillingState(hasSessionToken: boolean): Promise<BillingStatus | null> {
  if (!hasSessionToken) return null;
  return getBillingStatus();
}

export async function loadUsageViewOperatorUsers(args: {
  nonce: number | null;
  query: string;
}): Promise<OperatorUsersResponse | null> {
  if (args.nonce === null) return null;
  try {
    return await fetchAdminUsers({ limit: 25, query: args.query.trim() || undefined });
  } catch (error: unknown) {
    if (isUsageViewOperatorAccessDenied(error)) return null;
    throw error;
  }
}

export async function loadUsageViewOperatorProfitState(
  nonce: number | null,
): Promise<OperatorProfitAdminSummary | null> {
  if (nonce === null) return null;
  try {
    return await fetchProfitAdminSummary();
  } catch (error: unknown) {
    if (isUsageViewOperatorAccessDenied(error)) return null;
    throw error;
  }
}

export async function loadUsageViewOperatorRuntimeRemediationHistoryState(
  nonce: number | null,
): Promise<OperatorRuntimeRemediationHistoryResponse | null> {
  if (nonce === null) return null;
  try {
    return await fetchOperatorRuntimeRemediationHistory();
  } catch (error: unknown) {
    if (isUsageViewOperatorAccessDenied(error)) return null;
    throw error;
  }
}

export async function loadUsageViewAdminWeddingOpsMetricsState(
  nonce: number | null,
): Promise<AdminWeddingOpsMetricsPayload | null> {
  if (nonce === null) return null;
  try {
    return await fetchAdminWeddingOpsMetrics();
  } catch (error: unknown) {
    if (isUsageViewOperatorAccessDenied(error)) return null;
    throw error;
  }
}

export async function loadUsageViewAdminWeddingAiRoutingPolicyState(
  nonce: number | null,
): Promise<AdminWeddingAiRoutingPolicyPayload | null> {
  if (nonce === null) return null;
  try {
    return await fetchAdminWeddingAiRoutingPolicy();
  } catch (error: unknown) {
    if (isUsageViewOperatorAccessDenied(error)) return null;
    throw error;
  }
}

export async function loadUsageViewAdminWeddingApiStackState(
  nonce: number | null,
): Promise<AdminWeddingApiStackPayload | null> {
  if (nonce === null) return null;
  try {
    return await fetchAdminWeddingApiStack();
  } catch (error: unknown) {
    if (isUsageViewOperatorAccessDenied(error)) return null;
    throw error;
  }
}

export async function loadUsageViewAdminThirdPartyToolPolicyState(
  nonce: number | null,
): Promise<AdminThirdPartyToolPolicyPayload | null> {
  if (nonce === null) return null;
  try {
    return await fetchAdminThirdPartyToolPolicy();
  } catch (error: unknown) {
    if (isUsageViewOperatorAccessDenied(error)) return null;
    throw error;
  }
}

export async function loadUsageViewOperatorUserDetailState(
  userId: string | null,
): Promise<OperatorUserDetail | null> {
  if (!userId) return null;
  return fetchAdminUserDetail(userId);
}

export async function loadUsageViewOperatorResourceBundleState(args: {
  nonce: number | null;
  query: string;
  loadUsers?: (args: { nonce: number | null; query: string }) => Promise<OperatorUsersResponse | null>;
  loadProfit?: (nonce: number | null) => Promise<OperatorProfitAdminSummary | null>;
  loadRemediationHistory?: (nonce: number | null) => Promise<OperatorRuntimeRemediationHistoryResponse | null>;
  loadAdminWeddingOpsMetrics?: (nonce: number | null) => Promise<AdminWeddingOpsMetricsPayload | null>;
  loadAdminWeddingAiRoutingPolicy?: (nonce: number | null) => Promise<AdminWeddingAiRoutingPolicyPayload | null>;
  loadAdminWeddingApiStack?: (nonce: number | null) => Promise<AdminWeddingApiStackPayload | null>;
  loadAdminThirdPartyToolPolicy?: (nonce: number | null) => Promise<AdminThirdPartyToolPolicyPayload | null>;
}): Promise<UsageViewOperatorResourceBundle | null> {
  if (args.nonce === null) return null;

  const loadUsers = args.loadUsers ?? loadUsageViewOperatorUsers;
  const loadProfit = args.loadProfit ?? loadUsageViewOperatorProfitState;
  const loadRemediationHistory = args.loadRemediationHistory ?? loadUsageViewOperatorRuntimeRemediationHistoryState;
  const loadAdminWeddingOpsMetrics = args.loadAdminWeddingOpsMetrics ?? loadUsageViewAdminWeddingOpsMetricsState;
  const loadAdminWeddingAiRoutingPolicy = args.loadAdminWeddingAiRoutingPolicy
    ?? loadUsageViewAdminWeddingAiRoutingPolicyState;
  const loadAdminWeddingApiStack = args.loadAdminWeddingApiStack
    ?? loadUsageViewAdminWeddingApiStackState;
  const loadAdminThirdPartyToolPolicy = args.loadAdminThirdPartyToolPolicy
    ?? loadUsageViewAdminThirdPartyToolPolicyState;
  const [
    usersResult,
    profitResult,
    remediationHistoryResult,
    adminWeddingOpsMetricsResult,
    adminWeddingAiRoutingPolicyResult,
    adminWeddingApiStackResult,
    adminThirdPartyToolPolicyResult,
  ] = await Promise.allSettled([
    loadUsers({ nonce: args.nonce, query: args.query }),
    loadProfit(args.nonce),
    loadRemediationHistory(args.nonce),
    loadAdminWeddingOpsMetrics(args.nonce),
    loadAdminWeddingAiRoutingPolicy(args.nonce),
    loadAdminWeddingApiStack(args.nonce),
    loadAdminThirdPartyToolPolicy(args.nonce),
  ]);

  return {
    users: usersResult.status === "fulfilled" ? usersResult.value : null,
    profit: profitResult.status === "fulfilled" ? profitResult.value : null,
    remediationHistory: remediationHistoryResult.status === "fulfilled" ? remediationHistoryResult.value : null,
    adminWeddingOpsMetrics: adminWeddingOpsMetricsResult.status === "fulfilled" ? adminWeddingOpsMetricsResult.value : null,
    adminWeddingAiRoutingPolicy: adminWeddingAiRoutingPolicyResult.status === "fulfilled"
      ? adminWeddingAiRoutingPolicyResult.value
      : null,
    adminWeddingApiStack: adminWeddingApiStackResult.status === "fulfilled"
      ? adminWeddingApiStackResult.value
      : null,
    adminThirdPartyToolPolicy: adminThirdPartyToolPolicyResult.status === "fulfilled"
      ? adminThirdPartyToolPolicyResult.value
      : null,
    usersError: usersResult.status === "rejected" ? usersResult.reason : null,
    profitError: profitResult.status === "rejected" ? profitResult.reason : null,
    remediationHistoryError: remediationHistoryResult.status === "rejected" ? remediationHistoryResult.reason : null,
    adminWeddingOpsMetricsError: adminWeddingOpsMetricsResult.status === "rejected"
      ? adminWeddingOpsMetricsResult.reason
      : null,
    adminWeddingAiRoutingPolicyError: adminWeddingAiRoutingPolicyResult.status === "rejected"
      ? adminWeddingAiRoutingPolicyResult.reason
      : null,
    adminWeddingApiStackError: adminWeddingApiStackResult.status === "rejected"
      ? adminWeddingApiStackResult.reason
      : null,
    adminThirdPartyToolPolicyError: adminThirdPartyToolPolicyResult.status === "rejected"
      ? adminThirdPartyToolPolicyResult.reason
      : null,
  };
}
