import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWeddingArtifactSummary } from "@/lib/weddingArtifactState";
import { buildWeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import { buildWeddingDefaultApprovalExecutionHandlers } from "@/lib/weddingApprovalDefaultExecutorState";
import { runWeddingApprovalExecution } from "@/lib/weddingApprovalExecutionState";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

function registryArtifact() {
  const artifact = normalizeWeddingArtifactSummary({
    id: "artifact:registry",
    title: "Gift registry draft",
    kind: "registry",
    metadata,
  });
  assert.ok(artifact);
  return artifact;
}

test("runWeddingApprovalExecution does not call executors for blocked requests", async () => {
  let called = false;
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send venue email",
    metadata,
  });

  const result = await runWeddingApprovalExecution({
    request,
    nowIso: "2026-09-11T00:00:00.000Z",
    handlers: {
      send_email: () => {
        called = true;
        return { ok: true };
      },
    },
  });

  assert.equal(called, false);
  assert.equal(result.status, "blocked");
  assert.equal(result.receipt.status, "blocked");
  assert.match(result.message, /Explicit user approval/i);
});

test("runWeddingApprovalExecution blocks approved requests without connected executors", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "contact_vendor",
    title: "Contact venue",
    metadata,
    recipients: ["events@harbour.example"],
    userApproved: true,
  });
  const result = await runWeddingApprovalExecution({
    request,
    nowIso: "2026-09-11T00:00:00.000Z",
  });

  assert.equal(result.status, "missing_executor");
  assert.equal(result.canRetry, true);
  assert.equal(result.receipt.status, "blocked");
  assert.match(result.message, /No connected app is ready/i);
});

test("runWeddingApprovalExecution records successful executor results", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "create_external_calendar_event",
    title: "Create venue tour event",
    metadata,
    userApproved: true,
    externalProvider: "google_calendar",
    scheduleItems: [{
      id: "venue-tour",
      title: "Venue tour",
      kind: "venue_tour",
      startAt: "2027-02-06T10:00:00+11:00",
    }],
  });
  const result = await runWeddingApprovalExecution({
    request,
    nowIso: "2026-09-11T00:00:00.000Z",
    handlers: {
      create_external_calendar_event: () => ({
        ok: true,
        externalId: "gcal:event-1",
        message: "Calendar event created.",
      }),
    },
  });

  assert.equal(result.status, "executed");
  assert.equal(result.externalId, "gcal:event-1");
  assert.equal(result.receipt.status, "executed");
  assert.equal(result.receipt.metadata.external_id, "gcal:event-1");
});

test("runWeddingApprovalExecution replaces malformed receipt timestamps", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "create_external_calendar_event",
    title: "Create venue tour event",
    metadata,
    userApproved: true,
    externalProvider: "google_calendar",
    scheduleItems: [{
      id: "venue-tour",
      title: "Venue tour",
      kind: "venue_tour",
      startAt: "2027-02-06T10:00:00+11:00",
    }],
  });
  const result = await runWeddingApprovalExecution({
    request,
    nowIso: "not-a-date",
    handlers: {
      create_external_calendar_event: () => ({
        ok: true,
        externalId: "gcal:event-1",
      }),
    },
  });

  assert.equal(result.status, "executed");
  assert.notEqual(result.receipt.createdAt, "not-a-date");
  assert.equal(Number.isFinite(Date.parse(result.receipt.createdAt)), true);
});

test("runWeddingApprovalExecution fails closed when successful executors omit durable receipts", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send venue email",
    metadata,
    recipients: ["events@harbour.example"],
    userApproved: true,
  });
  const result = await runWeddingApprovalExecution({
    request,
    nowIso: "2026-09-11T00:00:00.000Z",
    handlers: {
      send_email: () => ({
        ok: true,
        message: "Email accepted.",
        metadata: { external_delivery_performed: true },
      }),
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.canRetry, true);
  assert.equal(result.externalId, null);
  assert.equal(result.receipt.status, "blocked");
  assert.equal(result.receipt.metadata.missing_durable_provider_receipt, true);
});

test("runWeddingApprovalExecution preserves safety metadata over unsafe executor failure metadata", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send venue email",
    metadata,
    recipients: ["events@harbour.example"],
    userApproved: true,
  });
  const failed = await runWeddingApprovalExecution({
    request,
    nowIso: "2026-09-11T00:00:00.000Z",
    handlers: {
      send_email: () => ({
        ok: false,
        message: "Gmail connection expired.",
        metadata: {
          blocked_reason: "safe to ignore",
        },
      }),
    },
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.receipt.metadata.blocked_reason, "Gmail connection expired.");

  const missingReceipt = await runWeddingApprovalExecution({
    request,
    nowIso: "2026-09-11T00:00:00.000Z",
    handlers: {
      send_email: () => ({
        ok: true,
        message: "Email accepted without receipt.",
        metadata: {
          blocked_reason: "sent anyway",
          missing_durable_provider_receipt: false,
        },
      }),
    },
  });
  assert.equal(missingReceipt.status, "failed");
  assert.equal(missingReceipt.receipt.metadata.blocked_reason, "Email accepted without receipt.");
  assert.equal(missingReceipt.receipt.metadata.missing_durable_provider_receipt, true);
});

test("runWeddingApprovalExecution accepts durable provider receipt metadata", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "publish_registry",
    title: "Publish gift registry",
    metadata,
    userApproved: true,
  });
  const result = await runWeddingApprovalExecution({
    request,
    nowIso: "2026-09-11T00:00:00.000Z",
    handlers: {
      publish_registry: () => ({
        ok: true,
        message: "Registry published.",
        metadata: {
          provider_receipt_id: "registry:receipt-1",
          external_delivery_performed: true,
        },
      }),
    },
  });

  assert.equal(result.status, "executed");
  assert.equal(result.externalId, "registry:receipt-1");
  assert.equal(result.receipt.metadata.external_id, "registry:receipt-1");
  assert.equal(result.receipt.metadata.provider_receipt_id, "registry:receipt-1");
});

test("runWeddingApprovalExecution records declined executor results", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send venue email",
    metadata,
    userApproved: true,
  });
  const result = await runWeddingApprovalExecution({
    request,
    handlers: {
      send_email: () => ({ ok: false, message: "Gmail connection expired." }),
    },
  });

  assert.equal(result.status, "failed");
  assert.equal(result.canRetry, true);
  assert.equal(result.receipt.status, "blocked");
  assert.match(String(result.receipt.metadata.blocked_reason), /Gmail connection expired/);
});

test("runWeddingApprovalExecution records thrown executor failures", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "contact_vendor",
    title: "Contact venue",
    metadata,
    userApproved: true,
  });
  const result = await runWeddingApprovalExecution({
    request,
    handlers: {
      contact_vendor: () => {
        throw new Error("Vendor API timeout");
      },
    },
  });

  assert.equal(result.status, "failed");
  assert.match(result.message, /Vendor API timeout/);
  assert.equal(result.receipt.status, "blocked");
});

test("default wedding approval handlers stage approved actions as internal OmnyID handoffs", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send venue email",
    metadata,
    recipients: ["events@harbour.example"],
    userApproved: true,
  });

  const result = await runWeddingApprovalExecution({
    request,
    nowIso: "2026-09-11T00:00:00.000Z",
    handlers: buildWeddingDefaultApprovalExecutionHandlers(),
  });

  assert.equal(result.status, "executed");
  assert.match(result.externalId ?? "", /^omnyid:wedding_action:/);
  assert.match(result.message, /staged inside OmnyID/i);
  assert.equal(result.receipt.metadata.execution_mode, "omnyid_internal_approval_handoff");
  assert.equal(result.receipt.metadata.provider_executor_connected, false);
  assert.equal(result.receipt.metadata.provider_capability, "email");
  assert.equal(result.receipt.metadata.provider_credential_status, "missing");
  assert.equal(result.receipt.metadata.provider_executor_status, "missing");
  assert.equal(result.receipt.metadata.external_provider_required, true);
  assert.equal(result.receipt.metadata.staged_recipient_count, 1);
});

test("default wedding approval handlers stage registry publishing as provider handoff", async () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "publish_registry",
    title: "Publish gift registry",
    metadata,
    artifacts: [registryArtifact()],
    userApproved: true,
  });

  const result = await runWeddingApprovalExecution({
    request,
    nowIso: "2026-09-11T00:00:00.000Z",
    handlers: buildWeddingDefaultApprovalExecutionHandlers(),
  });

  assert.equal(result.status, "executed");
  assert.match(result.message, /Registry publish approved and staged inside OmnyID/i);
  assert.equal(result.receipt.metadata.execution_mode, "omnyid_internal_approval_handoff");
  assert.equal(result.receipt.metadata.provider_capability, "registry");
  assert.equal(result.receipt.metadata.required_provider, "Registry provider");
  assert.equal(result.receipt.metadata.provider_executor_connected, false);
  assert.equal(result.receipt.metadata.external_provider_required, true);
  assert.equal(result.receipt.metadata.staged_artifact_count, 1);
});
