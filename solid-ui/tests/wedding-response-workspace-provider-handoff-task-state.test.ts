import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

import { weddingResponseWorkspaceMetadata } from "./wedding-response-workspace-fixtures.ts";

test("response workspace projects pending provider handoffs into Tasks without user-facing PersonalOS pressure", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata: weddingResponseWorkspaceMetadata,
    approvalReceipts: [{
      id: "receipt:venue-email",
      requestId: "request:venue-email",
      actionKind: "send_email",
      title: "Send venue email",
      status: "blocked",
      createdAt: "2026-09-15T00:00:00.000Z",
      disclosureLines: ["Recipient: venue@example.com"],
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
    }],
  });

  assert.equal(state.providerHandoffAuditCard?.statusLabel, "Setup needed");
  assert.ok(state.projectionQueue?.queue.items.some((item) =>
    item.id === "task:wedding_provider_handoff:receipt:venue-email"
  ));
  assert.ok(!state.personalOsProjection.rankedItems.some((item) =>
    /Connect external provider for: Send venue email/i.test(item.title)
    || item.evidenceLabels.includes("provider handoff gap")
  ));
});
