import assert from "node:assert/strict";
import test from "node:test";

import {
  isUsageViewOperatorAccessDenied,
  loadUsageViewOperatorResourceBundleState,
  loadUsageViewOperatorUserDetailState,
} from "../src/lib/usageViewResourceState.ts";

test("isUsageViewOperatorAccessDenied matches the mounted operator access failure contract", () => {
  assert.equal(isUsageViewOperatorAccessDenied(new Error("Operator access required")), true);
  assert.equal(isUsageViewOperatorAccessDenied(new Error("403 forbidden")), true);
  assert.equal(isUsageViewOperatorAccessDenied(new Error("timeout")), false);
  assert.equal(isUsageViewOperatorAccessDenied(null), false);
});

test("loadUsageViewOperatorUserDetailState returns null without a selected user id", async () => {
  assert.equal(await loadUsageViewOperatorUserDetailState(null), null);
});

test("loadUsageViewOperatorResourceBundleState returns null without an operator reload key", async () => {
  assert.equal(
    await loadUsageViewOperatorResourceBundleState({ nonce: null, query: "" }),
    null,
  );
});

test("loadUsageViewOperatorResourceBundleState preserves partial failures across operator resources", async () => {
  const state = await loadUsageViewOperatorResourceBundleState({
    nonce: 1,
    query: "alpha",
    async loadUsers() {
      return {
        query: "alpha",
        users: [{
          user_id: "user-1",
          email: "alpha@example.com",
          display_name: "Alpha",
          plan: "pro",
          billing_status: "active",
          account_status: "active",
          email_verified: true,
          support_access_status: "inactive",
          support_access_expires_at: null,
          last_session_at: "2026-08-31T00:00:00Z",
        }],
      };
    },
    async loadProfit() {
      throw new Error("profit timeout");
    },
    async loadRemediationHistory() {
      return {
        entries: [],
        retention: {
          total_rows: 0,
          oldest_created_at: null,
          latest_created_at: null,
        },
      };
    },
    async loadAdminWeddingOpsMetrics() {
      throw new Error("metrics endpoint missing");
    },
    async loadAdminWeddingAiRoutingPolicy() {
      throw new Error("policy endpoint missing");
    },
    async loadAdminWeddingApiStack() {
      throw new Error("api stack endpoint missing");
    },
    async loadAdminThirdPartyToolPolicy() {
      throw new Error("tool policy endpoint missing");
    },
  });

  assert.equal(state?.users?.users[0]?.user_id, "user-1");
  assert.equal(state?.profit, null);
  assert.deepEqual(state?.remediationHistory?.entries, []);
  assert.equal(state?.adminWeddingOpsMetrics, null);
  assert.equal(state?.adminWeddingAiRoutingPolicy, null);
  assert.equal(state?.adminWeddingApiStack, null);
  assert.equal(state?.adminThirdPartyToolPolicy, null);
  assert.equal(state?.usersError, null);
  assert.match(String(state?.profitError), /profit timeout/);
  assert.equal(state?.remediationHistoryError, null);
  assert.match(String(state?.adminWeddingOpsMetricsError), /metrics endpoint missing/);
  assert.match(String(state?.adminWeddingAiRoutingPolicyError), /policy endpoint missing/);
  assert.match(String(state?.adminWeddingApiStackError), /api stack endpoint missing/);
  assert.match(String(state?.adminThirdPartyToolPolicyError), /tool policy endpoint missing/);
});

test("loadUsageViewOperatorResourceBundleState carries admin wedding ops metrics and policy when mounted", async () => {
  const state = await loadUsageViewOperatorResourceBundleState({
    nonce: 2,
    query: "",
    async loadUsers() {
      return { users: [], limit: 25, total_users: 12 };
    },
    async loadProfit() {
      return { users: [], by_workflow: [], daily_cost: [] };
    },
    async loadRemediationHistory() {
      return { entries: [] };
    },
    async loadAdminWeddingOpsMetrics() {
      return {
        disk_used_bytes: 1024,
        disk_total_bytes: 2048,
        source_label: "oracle-prod-1",
      };
    },
    async loadAdminWeddingAiRoutingPolicy() {
      return {
        backendPolicyEndpointMounted: true,
        auditReceiptProjectionReady: true,
        tenantBoundaryEnforced: true,
        budgetGuardrailsReady: true,
        weddingTemplateScopeOnly: true,
        masterAgentQueryExcluded: true,
        policySourceLabel: "admin-wedding-ai-routing-policy",
      };
    },
    async loadAdminWeddingApiStack() {
      return {
        providers: [{
          providerId: "google_places",
          connectedAppId: "google-places-api",
          label: "Google Places API",
          credentialRequired: true,
          configured: true,
          sourceLabel: "env:OMNYID_ADMIN_GOOGLE_PLACES_API_KEY",
          requiredForStack: true,
        }],
        connectedAppIds: ["google-places-api"],
        guardrails: ["Provider keys stay server-side."],
      };
    },
    async loadAdminThirdPartyToolPolicy() {
      return {
        policies: [{
          toolId: "stripe",
          enabledForAllUsers: true,
          enabledForWeddingTemplate: false,
        }],
        sourceLabel: "admin-third-party-tool-policy",
      };
    },
  });

  assert.equal(state?.users?.total_users, 12);
  assert.equal(state?.adminWeddingOpsMetrics?.disk_used_bytes, 1024);
  assert.equal(state?.adminWeddingOpsMetrics?.source_label, "oracle-prod-1");
  assert.equal(state?.adminWeddingAiRoutingPolicy?.backendPolicyEndpointMounted, true);
  assert.equal(state?.adminWeddingAiRoutingPolicy?.masterAgentQueryExcluded, true);
  assert.deepEqual(state?.adminWeddingApiStack?.connectedAppIds, ["google-places-api"]);
  assert.doesNotMatch(JSON.stringify(state?.adminWeddingApiStack), /secret-google-key/i);
  assert.equal(state?.adminThirdPartyToolPolicy?.policies[0]?.toolId, "stripe");
  assert.equal(state?.adminThirdPartyToolPolicy?.policies[0]?.enabledForAllUsers, true);
  assert.equal(state?.adminWeddingOpsMetricsError, null);
  assert.equal(state?.adminWeddingAiRoutingPolicyError, null);
  assert.equal(state?.adminWeddingApiStackError, null);
  assert.equal(state?.adminThirdPartyToolPolicyError, null);
});
