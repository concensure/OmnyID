import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingProviderHandoffTaskItems } from "@/lib/weddingProviderHandoffTaskState";
import type { WeddingPersistedApprovalReceipt } from "@/lib/weddingPersistedWorkspaceState";

const pendingReceipt: WeddingPersistedApprovalReceipt = {
  id: "receipt:venue-email",
  requestId: "request:venue-email",
  actionKind: "send_email",
  title: "Send venue email",
  status: "blocked",
  createdAt: "2026-09-15T00:00:00.000Z",
  disclosureLines: [],
  riskLabels: ["No executor is connected."],
  blockedReason: "No executor is connected for this wedding action.",
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
  artifactIds: ["artifact:venue-email"],
  scheduleItemIds: [],
  taskItemIds: [],
};

test("provider handoff tasks make pending external executor setup actionable", () => {
  const tasks = buildWeddingProviderHandoffTaskItems({
    approvalReceipts: [pendingReceipt],
    metadata: {
      wedding_plan_id: "wedding_plan:provider-handoff",
      response_workspace_id: "response_workspace:provider-handoff",
    },
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.id, "wedding_provider_handoff:receipt:venue-email");
  assert.equal(tasks[0]?.kind, "vendor_follow_up");
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).provider_handoff_task, true);
  assert.equal((tasks[0]?.metadata as Record<string, unknown>).provider_handoff_capability, "email");
  assert.match(tasks[0]?.notes ?? "", /Gmail or email provider/i);
});

test("provider handoff tasks dedupe saved receipt-specific setup tasks", () => {
  const tasks = buildWeddingProviderHandoffTaskItems({
    approvalReceipts: [pendingReceipt],
    existingTaskItems: [{
      id: "task:provider-setup",
      title: "Saved provider setup task",
      kind: "vendor_follow_up",
      metadata: { provider_handoff_receipt_id: "receipt:venue-email" },
    }],
  });

  assert.equal(tasks.length, 0);
});

test("provider handoff tasks ignore already connected executor receipts", () => {
  const tasks = buildWeddingProviderHandoffTaskItems({
    approvalReceipts: [{
      ...pendingReceipt,
      id: "receipt:calendar",
      status: "executed",
      providerCapability: "calendar",
      providerExecutorStatus: "available",
      providerExecutorConnected: true,
      externalId: "gcal:event-1",
      blockKind: null,
      blockedReason: null,
    }],
  });

  assert.equal(tasks.length, 0);
});
