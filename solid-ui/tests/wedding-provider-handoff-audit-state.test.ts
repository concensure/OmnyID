import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingProviderHandoffAuditCard } from "@/lib/weddingProviderHandoffAuditState";
import type { WeddingPersistedApprovalReceipt } from "@/lib/weddingPersistedWorkspaceState";

const pendingReceipt: WeddingPersistedApprovalReceipt = {
  id: "receipt:venue-email",
  requestId: "request:venue-email",
  actionKind: "send_email",
  title: "Send venue email",
  status: "blocked",
  createdAt: "2026-09-15T00:00:00.000Z",
  disclosureLines: [],
  riskLabels: [],
  blockedReason: "No executor is connected.",
  blockKind: "provider_missing",
  externalId: null,
  executionMode: "omnyid_internal_approval_handoff",
  providerCapability: "email",
  requiredProvider: "Gmail or email provider",
  providerCredentialStatus: "missing",
  providerExecutorStatus: "missing",
  providerExecutorConnected: false,
  providerSetupView: "email",
  externalProviderRequired: true,
  artifactIds: [],
  scheduleItemIds: [],
  taskItemIds: [],
};

test("provider handoff audit card summarizes pending external executors", () => {
  const card = buildWeddingProviderHandoffAuditCard([pendingReceipt]);

  assert.equal(card?.statusLabel, "Setup needed");
  assert.match(card?.detailLabel ?? "", /1 approved wedding action/i);
  assert.deepEqual(card?.pendingReceiptTitles, ["Send venue email"]);
  assert.ok(card?.metadataLabels.includes("email"));
  assert.ok(card?.metadataLabels.includes("setup: email"));
  assert.equal(card?.action.kind, "open_connected_apps");
  assert.equal(card?.action.enabled, true);
});

test("provider handoff audit card disables setup action when executors are connected", () => {
  const card = buildWeddingProviderHandoffAuditCard([{
    ...pendingReceipt,
    id: "receipt:calendar",
    status: "executed",
    providerCapability: "calendar",
    providerExecutorStatus: "available",
    providerExecutorConnected: true,
    providerSetupView: "calendar",
    externalId: "gcal:event-1",
    blockKind: null,
    blockedReason: null,
  }]);

  assert.equal(card?.statusLabel, "Connected");
  assert.ok(card?.metadataLabels.includes("0 need setup"));
  assert.deepEqual(card?.pendingReceiptTitles, []);
  assert.equal(card?.action.enabled, false);
});
