import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingApprovalRequestState, buildWeddingApprovalReceiptState } from "@/lib/weddingApprovalState";
import {
  weddingApprovalReceiptToAfpMessage,
  weddingApprovalReceiptToAfpSendInput,
} from "@/lib/weddingApprovalReceiptAfpProjectionState";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:planning-pass",
  source_response_id: "afp:response-1",
};

test("weddingApprovalReceiptToAfpMessage projects executed approval receipts as searchable AFP messages", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "contact_vendor",
    title: "Contact venue",
    metadata,
    recipients: ["events@harbour.example"],
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-12T00:00:00.000Z");
  const message = weddingApprovalReceiptToAfpMessage({
    ...receipt,
    metadata: { ...receipt.metadata, external_id: "vendor:message-1" },
  });

  assert.equal(message.type, "approval_receipt");
  assert.equal(message.kind, "receipt");
  assert.equal(message.subtype, "wedding_approval_receipt");
  assert.ok(message.supertags.includes("wedding_approval_receipt"));
  assert.ok(message.supertags.includes("approval_status:executed"));
  assert.equal(message.content.kind, "wedding_approval_receipt");
  assert.equal(message.content.external_id, "vendor:message-1");
  assert.ok(message.metadata.searchable_terms.includes("Contact venue"));
  assert.ok(message.references.some((reference) => reference.type === "wedding_response" && reference.target === "afp:response-1"));
});

test("weddingApprovalReceiptToAfpMessage preserves provider handoff metadata", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "publish_registry",
    title: "Publish registry",
    metadata,
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-12T00:00:00.000Z");
  const message = weddingApprovalReceiptToAfpMessage({
    ...receipt,
    metadata: {
      ...receipt.metadata,
      execution_mode: "omnyid_internal_approval_handoff",
      provider_capability: "registry",
      required_provider: "Registry provider",
      provider_credential_status: "missing",
      provider_executor_status: "missing",
      provider_executor_connected: false,
      provider_setup_view: "connected_apps",
      external_provider_required: true,
    },
  });

  assert.ok(message.supertags.includes("provider_capability:registry"));
  assert.ok(message.supertags.includes("provider_executor:missing"));
  assert.equal(message.content.provider_capability, "registry");
  assert.equal(message.content.required_provider, "Registry provider");
  assert.equal(message.content.provider_setup_view, "connected_apps");
  assert.equal(message.content.external_provider_required, true);
  assert.equal(message.metadata.provider_executor_connected, false);
  assert.ok(message.metadata.searchable_terms.includes("Registry provider"));
  assert.ok(message.metadata.searchable_terms.includes("external provider required"));
  assert.match(String(message.content.markdown), /## Provider handoff/);
  assert.match(String(message.content.markdown), /Capability: registry/);
  assert.match(String(message.content.markdown), /Required provider: Registry provider/);
  assert.match(String(message.content.markdown), /Setup destination: connected apps/);
  assert.match(String(message.views[0]?.content.markdown), /Provider executor connected: no/);
});

test("weddingApprovalReceiptToAfpSendInput preserves blocked receipt context", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send draft",
    metadata,
    userApproved: false,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-12T00:00:00.000Z");
  const input = weddingApprovalReceiptToAfpSendInput(receipt);

  assert.equal(input.type, "approval_receipt");
  assert.equal(input.store_in_relational, true);
  assert.ok(input.supertags?.includes("wedding_approval_receipt"));
  assert.ok(input.supertags?.includes("approval_status:blocked"));
  assert.equal(input.content.status, "blocked");
  assert.match(String(input.content.blocked_reason), /Explicit user approval/i);
  assert.equal(input.content.block_kind, "needs_user_approval");
  assert.equal(input.metadata.approval_status, "blocked");
  assert.equal(input.metadata.block_kind, "needs_user_approval");
  assert.ok(input.metadata.searchable_terms.includes("needs_user_approval"));
});
