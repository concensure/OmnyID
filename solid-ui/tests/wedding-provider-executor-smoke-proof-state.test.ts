import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingApprovalReceiptState } from "@/lib/weddingApprovalState";
import { buildWeddingProviderExecutorSmokeProofState } from "@/lib/weddingProviderExecutorSmokeProofState";
import { buildWeddingProviderExecutorSuiteReadinessState } from "@/lib/weddingProviderExecutorSuiteReadinessState";

function receipt(input: Partial<WeddingApprovalReceiptState> & {
  actionKind: WeddingApprovalReceiptState["actionKind"];
  metadata?: Record<string, unknown>;
}): WeddingApprovalReceiptState {
  return {
    id: input.id ?? `receipt:${input.actionKind}`,
    requestId: input.requestId ?? `request:${input.actionKind}`,
    actionKind: input.actionKind,
    title: input.title ?? input.actionKind,
    status: input.status ?? "executed",
    createdAt: input.createdAt ?? "2026-09-15T00:00:00.000Z",
    disclosureLines: input.disclosureLines ?? [],
    riskLabels: input.riskLabels ?? [],
    metadata: input.metadata ?? {},
  };
}

test("provider executor smoke proof treats dry-run receipts as diagnostic but not production-ready", () => {
  const state = buildWeddingProviderExecutorSmokeProofState({
    requiredCapabilities: ["email"],
    approvalReceipts: [
      receipt({
        actionKind: "send_email",
        metadata: {
          provider_executor_mode: "dry_run",
          provider_smoke_test_only: true,
          external_delivery_performed: false,
          external_id: "omnyid:wedding_provider_dry_run:email",
        },
      }),
    ],
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.equal(state.capabilityProofs[0]?.status, "dry_run_only");
  assert.ok(state.blockerLabels.some((label) => /live approved executor receipt/i.test(label)));
  assert.equal(state.providers[0]?.productionReady, false);
});

test("provider executor smoke proof accepts live approval receipts with external proof ids", () => {
  const state = buildWeddingProviderExecutorSmokeProofState({
    requiredCapabilities: ["email", "calendar", "registry"],
    approvalReceipts: [
      receipt({
        actionKind: "contact_vendor",
        metadata: {
          provider_executor_mode: "live",
          external_delivery_performed: true,
          external_id: "gmail:message-1",
        },
      }),
      receipt({
        actionKind: "create_external_calendar_event",
        metadata: {
          provider_executor_mode: "live",
          external_delivery_performed: true,
          provider_event_id: "gcal:event-1",
          provider_event_link: "https://calendar.example/event-1",
        },
      }),
      receipt({
        actionKind: "publish_registry",
        metadata: {
          provider_executor_mode: "live",
          external_delivery_performed: true,
          provider_receipt_id: "registry:publish-1",
        },
      }),
    ],
  });

  assert.equal(state.status, "ready");
  assert.equal(state.productionEvidenceReady, true);
  assert.equal(state.executorProofRefs.email, "gmail:message-1");
  assert.equal(state.executorProofRefs.calendar, "gcal:event-1");
  assert.equal(state.executorProofRefs.registry, "registry:publish-1");
  assert.ok(state.providers.every((provider) => provider.productionReady));
});

test("provider executor smoke proof blocks live approval receipts with only local receipt ids or links", () => {
  const state = buildWeddingProviderExecutorSmokeProofState({
    requiredCapabilities: ["email", "calendar"],
    approvalReceipts: [
      receipt({
        id: "receipt:local-email-1",
        actionKind: "send_email",
        metadata: {
          provider_executor_mode: "live",
          external_delivery_performed: true,
        },
      }),
      receipt({
        actionKind: "create_external_calendar_event",
        metadata: {
          provider_executor_mode: "live",
          external_delivery_performed: true,
          provider_event_link: "https://calendar.example/event-1",
        },
      }),
    ],
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.equal(state.executorProofRefs.email, undefined);
  assert.equal(state.executorProofRefs.calendar, undefined);
  assert.ok(state.blockerLabels.some((label) => /email provider smoke proof is missing/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /calendar provider smoke proof is missing/i.test(label)));
});

test("provider executor smoke proof rejects local metadata proof ids", () => {
  const state = buildWeddingProviderExecutorSmokeProofState({
    requiredCapabilities: ["email", "calendar", "registry"],
    approvalReceipts: [
      receipt({
        actionKind: "send_email",
        metadata: {
          provider_executor_mode: "live",
          external_delivery_performed: true,
          external_id: "receipt:local-email-1",
        },
      }),
      receipt({
        actionKind: "create_external_calendar_event",
        metadata: {
          provider_executor_mode: "live",
          external_delivery_performed: true,
          provider_event_id: "http://localhost:8787/event-1",
        },
      }),
      receipt({
        actionKind: "publish_registry",
        metadata: {
          provider_executor_mode: "live",
          external_delivery_performed: true,
          provider_publish_id: "file:///tmp/registry-proof.txt",
        },
      }),
    ],
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.deepEqual(state.executorProofRefs, {});
  assert.ok(state.blockerLabels.some((label) => /email provider smoke proof is missing/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /calendar provider smoke proof is missing/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /registry provider smoke proof is missing/i.test(label)));
});

test("provider executor smoke proof converts source-backed vendor search receipt into suite readiness", () => {
  const smoke = buildWeddingProviderExecutorSmokeProofState({
    requiredCapabilities: ["vendor_search"],
    vendorSearchReceipts: [{
      proofRef: "vendor-search:smoke:oracle-prod-1",
      providerLabels: ["Brave Search", "Google Places"],
      sourceUrls: ["https://venue.example/source-1", "https://places.example/source-2"],
      sourceUrlCount: 8,
      queryContextLabel: "Sydney photographer with documentary style",
    }],
  });
  const suite = buildWeddingProviderExecutorSuiteReadinessState({
    requiredCapabilities: ["vendor_search"],
    providers: smoke.providers,
    executorProofRefs: smoke.executorProofRefs,
    proofReferencePolicy: "required",
  });

  assert.equal(smoke.status, "ready");
  assert.equal(smoke.executorProofRefs.vendor_search, "vendor-search:smoke:oracle-prod-1");
  assert.equal(suite.productionEvidenceReady, true);
  assert.equal(suite.checks[0]?.proofRef, "vendor-search:smoke:oracle-prod-1");
});

test("provider executor smoke proof blocks vendor search without source URLs", () => {
  const state = buildWeddingProviderExecutorSmokeProofState({
    requiredCapabilities: ["vendor_search"],
    vendorSearchReceipts: [{
      proofRef: "vendor-search:empty",
      providerLabels: ["Brave Search"],
      sourceUrlCount: 0,
    }],
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.capabilityProofs[0]?.status, "blocked");
  assert.ok(state.blockerLabels.some((label) => /source URLs/i.test(label)));
});

test("provider executor smoke proof rejects local vendor-search proof refs", () => {
  const state = buildWeddingProviderExecutorSmokeProofState({
    requiredCapabilities: ["vendor_search"],
    vendorSearchReceipts: [{
      proofRef: "receipt:local-vendor-search",
      providerLabels: ["Brave Search"],
      sourceUrls: ["https://venue.example/source-1"],
      sourceUrlCount: 1,
      queryContextLabel: "Sydney venues",
    }],
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.capabilityProofs[0]?.status, "blocked");
  assert.equal(state.executorProofRefs.vendor_search, undefined);
  assert.ok(state.blockerLabels.some((label) => /provider receipt/i.test(label)));
});

test("provider executor smoke proof blocks vendor search with only malformed source URLs", () => {
  const state = buildWeddingProviderExecutorSmokeProofState({
    requiredCapabilities: ["vendor_search"],
    vendorSearchReceipts: [{
      proofRef: "vendor-search:malformed",
      providerLabels: ["Brave Search"],
      sourceUrls: ["javascript:alert(1)", "not-a-url"],
      sourceUrlCount: 2,
      queryContextLabel: "Sydney venues",
    }],
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.capabilityProofs[0]?.status, "blocked");
  assert.equal(state.executorProofRefs.vendor_search, undefined);
});
