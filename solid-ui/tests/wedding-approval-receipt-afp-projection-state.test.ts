import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingApprovalRequestState, buildWeddingApprovalReceiptState } from "@/lib/weddingApprovalState";
import {
  weddingApprovalReceiptDeliveryThreadId,
  weddingApprovalReceiptToAfpMessage,
  weddingApprovalReceiptToAfpSendInput,
  weddingApprovalReceiptToVendorThreadAfpSendInput,
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
  assert.equal(message.content.semantic_kind, "wedding_active_loop");
  assert.equal(message.content.semantic_object.stateLabel, "Approved");
  assert.ok(message.content.semantic_tags.includes("wedding_approval_receipt"));
  assert.ok(message.metadata.searchable_terms.includes("Contact venue"));
  assert.equal(message.metadata.semantic_kind, "wedding_active_loop");
  assert.ok(message.references.some((reference) => reference.type === "wedding_response" && reference.target === "afp:response-1"));
  assert.equal(message.views[0]?.content.semantic_object.kind, "wedding_active_loop");
});

test("weddingApprovalReceiptToAfpMessage preserves provider metadata with user-facing connected-app copy", () => {
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
  assert.equal(message.content.semantic_kind, "wedding_approval_required");
  assert.equal(message.content.semantic_object.stateLabel, "Needs connected app");
  assert.ok(message.content.semantic_tags.includes("wedding_provider_setup_needed"));
  assert.equal(message.metadata.provider_executor_connected, false);
  assert.equal(message.metadata.semantic_kind, "wedding_approval_required");
  assert.ok(message.metadata.searchable_terms.includes("Registry provider"));
  assert.ok(message.metadata.searchable_terms.includes("external provider required"));
  assert.match(String(message.content.markdown), /## Connected app status/);
  assert.match(String(message.content.markdown), /App type: registry/);
  assert.match(String(message.content.markdown), /Needed app: Registry provider/);
  assert.match(String(message.content.markdown), /Setup page: connected apps/);
  assert.match(String(message.views[0]?.content.markdown), /Connected app active: no/);
});

test("weddingApprovalReceiptToAfpMessage preserves email delivery context for proof recovery", () => {
  const vendorThreadId = "wedding_vendor_quote:workspace-1:chloes-florals";
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata,
    recipients: ["hello@chloes.example"],
    delivery: {
      channel: "email",
      to: ["hello@chloes.example"],
      subject: "Floral quote approval",
      text: "Thanks, we approve the floral quote.",
      threadId: vendorThreadId,
      inReplyTo: "<quote-message@example.com>",
      references: ["<quote-message@example.com>", "afp-quote-message-1"],
    },
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-12T00:00:00.000Z");
  const message = weddingApprovalReceiptToAfpMessage({
    ...receipt,
    metadata: {
      ...receipt.metadata,
      provider: "gmail",
      provider_message_id: "gmail-message-123",
      client_message_id: "local-outbound-123",
      provider_result_ok: true,
      external_delivery_performed: true,
      missing_durable_provider_receipt: false,
    },
  });

  assert.equal(weddingApprovalReceiptDeliveryThreadId(receipt), vendorThreadId);
  assert.equal(message.content.provider_message_id, "gmail-message-123");
  assert.equal(message.content.client_message_id, "local-outbound-123");
  assert.equal(message.content.provider_result_ok, true);
  assert.equal(message.content.external_delivery_performed, true);
  assert.equal(message.content.missing_durable_provider_receipt, false);
  assert.equal(message.content.delivery_channel, "email");
  assert.equal(message.content.delivery_subject, "Floral quote approval");
  assert.equal(message.content.delivery_thread_id, vendorThreadId);
  assert.equal(message.content.delivery_in_reply_to, "<quote-message@example.com>");
  assert.deepEqual(message.content.delivery_references, ["<quote-message@example.com>", "afp-quote-message-1"]);
  assert.deepEqual(message.content.delivery_recipients, ["hello@chloes.example"]);
  assert.equal(message.metadata.delivery_channel, "email");
  assert.equal(message.metadata.delivery_subject, "Floral quote approval");
  assert.equal(message.metadata.client_message_id, "local-outbound-123");
  assert.equal(message.metadata.provider_result_ok, true);
  assert.equal(message.metadata.external_delivery_performed, true);
  assert.equal(message.metadata.missing_durable_provider_receipt, false);
  assert.equal(message.metadata.delivery_thread_id, vendorThreadId);
  assert.equal(message.metadata.delivery_in_reply_to, "<quote-message@example.com>");
  assert.deepEqual(message.metadata.delivery_references, ["<quote-message@example.com>", "afp-quote-message-1"]);
  assert.deepEqual(message.metadata.delivery_recipients, ["hello@chloes.example"]);
  assert.ok(message.metadata.searchable_terms.includes(vendorThreadId));
  assert.ok(message.metadata.searchable_terms.includes("<quote-message@example.com>"));
  assert.ok(message.metadata.searchable_terms.includes("afp-quote-message-1"));
  assert.ok(message.metadata.searchable_terms.includes("local-outbound-123"));
  assert.ok(message.metadata.searchable_terms.includes("Floral quote approval"));
  assert.ok(message.metadata.searchable_terms.includes("hello@chloes.example"));
  assert.match(String(message.content.markdown), /## Connected app status/);
  assert.match(String(message.content.markdown), /Provider: gmail/);
  assert.match(String(message.content.markdown), /Provider message ID: gmail-message-123/);
  assert.match(String(message.content.markdown), /Local send ID: local-outbound-123/);
  assert.match(String(message.content.markdown), /## Delivery context/);
  assert.match(String(message.content.markdown), /Vendor thread: wedding_vendor_quote:workspace-1:chloes-florals/);
  assert.match(String(message.content.markdown), /In reply to: <quote-message@example.com>/);
  assert.match(String(message.content.markdown), /Delivery references: <quote-message@example.com>, afp-quote-message-1/);
  assert.match(String(message.content.markdown), /Recipients: hello@chloes.example/);
});

test("weddingApprovalReceiptToAfpMessage preserves alternate durable provider receipt ids", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata,
    recipients: ["hello@chloes.example"],
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-12T00:00:00.000Z");
  const message = weddingApprovalReceiptToAfpMessage({
    ...receipt,
    metadata: {
      ...receipt.metadata,
      provider: "gmail",
      provider_receipt_id: "gmail-receipt-789",
      message_id: "rfc822-message-789",
    },
  });

  assert.equal(message.content.provider_receipt_id, "gmail-receipt-789");
  assert.equal(message.content.message_id, "rfc822-message-789");
  assert.equal(message.metadata.provider_receipt_id, "gmail-receipt-789");
  assert.equal(message.metadata.message_id, "rfc822-message-789");
  assert.ok(message.metadata.searchable_terms.includes("gmail-receipt-789"));
  assert.ok(message.metadata.searchable_terms.includes("rfc822-message-789"));
  assert.match(String(message.content.markdown), /Provider receipt ID: gmail-receipt-789/);
  assert.match(String(message.content.markdown), /Message ID: rfc822-message-789/);
});

test("weddingApprovalReceiptDeliveryThreadId falls back to nested delivery payloads", () => {
  assert.equal(weddingApprovalReceiptDeliveryThreadId({
    metadata: {
      delivery: {
        threadId: "wedding_vendor_quote:workspace-1:nested-thread",
      },
    },
  }), "wedding_vendor_quote:workspace-1:nested-thread");
  assert.equal(weddingApprovalReceiptDeliveryThreadId({
    metadata: {
      delivery_thread_id: "wedding_vendor_quote:workspace-1:top-level-thread",
      delivery: {
        threadId: "wedding_vendor_quote:workspace-1:nested-thread",
      },
    },
  }), "wedding_vendor_quote:workspace-1:top-level-thread");
});

test("weddingApprovalReceiptToAfpMessage trims delivery recipient and reference arrays", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata,
    recipients: [" hello@chloes.example "],
    delivery: {
      channel: "email",
      to: [" hello@chloes.example ", "  "],
      subject: "Floral quote approval",
      text: "Thanks, we approve the floral quote.",
      threadId: "wedding_vendor_quote:workspace-1:chloes-florals",
      references: [" afp-quote-message-1 ", ""],
    },
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-12T00:00:00.000Z");
  const message = weddingApprovalReceiptToAfpMessage(receipt);

  assert.deepEqual(message.content.delivery_recipients, ["hello@chloes.example"]);
  assert.deepEqual(message.content.delivery_references, ["afp-quote-message-1"]);
  assert.deepEqual(message.metadata.delivery_recipients, ["hello@chloes.example"]);
  assert.deepEqual(message.metadata.delivery_references, ["afp-quote-message-1"]);
  assert.match(String(message.content.markdown), /Recipients: hello@chloes\.example/);
  assert.match(String(message.content.markdown), /Delivery references: afp-quote-message-1/);
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
  assert.equal(input.content.semantic_kind, "wedding_approval_required");
  assert.equal(input.content.semantic_object.stateLabel, "Blocked");
  assert.equal(input.metadata.approval_status, "blocked");
  assert.equal(input.metadata.block_kind, "needs_user_approval");
  assert.equal(input.metadata.semantic_kind, "wedding_approval_required");
  assert.ok(input.metadata.searchable_terms.includes("needs_user_approval"));
});

test("weddingApprovalReceiptToAfpSendInput preserves provider delivery proof flags", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata,
    recipients: ["hello@chloes.example"],
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-12T00:00:00.000Z");
  const input = weddingApprovalReceiptToAfpSendInput({
    ...receipt,
    metadata: {
      ...receipt.metadata,
      provider_message_id: "gmail-message-123",
      provider_result_ok: true,
      external_delivery_performed: false,
      missing_durable_provider_receipt: true,
    },
  });

  assert.equal(input.content.provider_message_id, "gmail-message-123");
  assert.equal(input.content.provider_result_ok, true);
  assert.equal(input.content.external_delivery_performed, false);
  assert.equal(input.content.missing_durable_provider_receipt, true);
  assert.equal(input.metadata.provider_result_ok, true);
  assert.equal(input.metadata.external_delivery_performed, false);
  assert.equal(input.metadata.missing_durable_provider_receipt, true);
});

test("weddingApprovalReceiptToVendorThreadAfpSendInput attaches executed proof to vendor thread", () => {
  const request = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata,
    recipients: ["hello@chloes.example"],
    userApproved: true,
  });
  const receipt = buildWeddingApprovalReceiptState(request, "2026-09-12T00:00:00.000Z");
  const input = weddingApprovalReceiptToVendorThreadAfpSendInput(
    {
      ...receipt,
      metadata: {
        ...receipt.metadata,
        external_id: "gmail-message-123",
        client_message_id: "local-outbound-123",
        provider_result_ok: true,
        external_delivery_performed: true,
        missing_durable_provider_receipt: false,
      },
    },
    {
      threadId: "wedding_vendor_quote:workspace-1:chloes-florals",
      parentId: "draft-message-1",
    },
  );

  assert.ok(input);
  assert.equal(input.thread_id, "wedding_vendor_quote:workspace-1:chloes-florals");
  assert.equal(input.parent_id, "draft-message-1");
  assert.equal(input.type, "approval_receipt");
  assert.equal(input.store_in_relational, true);
  assert.equal(input.content.vendor_thread_id, "wedding_vendor_quote:workspace-1:chloes-florals");
  assert.equal(input.content.client_message_id, "local-outbound-123");
  assert.equal(input.content.provider_result_ok, true);
  assert.equal(input.content.external_delivery_performed, true);
  assert.equal(input.content.missing_durable_provider_receipt, false);
  assert.equal(input.metadata.vendor_thread_id, "wedding_vendor_quote:workspace-1:chloes-florals");
  assert.equal(input.metadata.client_message_id, "local-outbound-123");
  assert.equal(input.metadata.provider_result_ok, true);
  assert.equal(input.metadata.external_delivery_performed, true);
  assert.equal(input.metadata.missing_durable_provider_receipt, false);
  assert.equal(input.metadata.projection, "wedding_approval_receipt_to_vendor_thread_afp");
  assert.ok(input.supertags?.includes("wedding_vendor_thread_receipt"));
  assert.ok(input.references?.some((reference) =>
    reference.type === "wedding_vendor_thread"
    && reference.target === "wedding_vendor_quote:workspace-1:chloes-florals",
  ));
});

test("weddingApprovalReceiptToVendorThreadAfpSendInput only projects durable executed email proof", () => {
  const emailRequest = buildWeddingApprovalRequestState({
    actionKind: "send_email",
    title: "Send florist reply",
    metadata,
    recipients: ["hello@chloes.example"],
    userApproved: true,
  });
  const executedEmailReceipt = buildWeddingApprovalReceiptState(emailRequest, "2026-09-12T00:00:00.000Z");
  assert.equal(weddingApprovalReceiptToVendorThreadAfpSendInput(
    executedEmailReceipt,
    { threadId: "wedding_vendor_quote:workspace-1:chloes-florals" },
  ), null);
  assert.equal(weddingApprovalReceiptToVendorThreadAfpSendInput(
    {
      ...executedEmailReceipt,
      metadata: {
        ...executedEmailReceipt.metadata,
        provider_message_id: "gmail-message-123",
        missing_durable_provider_receipt: false,
      },
    },
    { threadId: "wedding_vendor_quote:workspace-1:chloes-florals" },
  ), null);
  assert.equal(weddingApprovalReceiptToVendorThreadAfpSendInput(
    {
      ...executedEmailReceipt,
      metadata: {
        ...executedEmailReceipt.metadata,
        provider_message_id: "gmail-message-123",
        external_delivery_performed: false,
        missing_durable_provider_receipt: false,
      },
    },
    { threadId: "wedding_vendor_quote:workspace-1:chloes-florals" },
  ), null);
  assert.equal(weddingApprovalReceiptToVendorThreadAfpSendInput(
    {
      ...executedEmailReceipt,
      metadata: {
        ...executedEmailReceipt.metadata,
        provider_message_id: "gmail-message-123",
        provider_result_ok: false,
        external_delivery_performed: true,
        missing_durable_provider_receipt: false,
      },
    },
    { threadId: "wedding_vendor_quote:workspace-1:chloes-florals" },
  ), null);
  assert.equal(weddingApprovalReceiptToVendorThreadAfpSendInput(
    {
      ...executedEmailReceipt,
      metadata: {
        ...executedEmailReceipt.metadata,
        provider_message_id: "gmail-message-123",
        external_delivery_performed: true,
        missing_durable_provider_receipt: true,
      },
    },
    { threadId: "wedding_vendor_quote:workspace-1:chloes-florals" },
  ), null);
  assert.equal(weddingApprovalReceiptToVendorThreadAfpSendInput(
    { ...executedEmailReceipt, status: "blocked" },
    { threadId: "wedding_vendor_quote:workspace-1:chloes-florals" },
  ), null);

  const registryRequest = buildWeddingApprovalRequestState({
    actionKind: "publish_registry",
    title: "Publish registry",
    metadata,
    userApproved: true,
  });
  const registryReceipt = buildWeddingApprovalReceiptState(registryRequest, "2026-09-12T00:00:00.000Z");
  assert.equal(weddingApprovalReceiptToVendorThreadAfpSendInput(
    {
      ...registryReceipt,
      metadata: {
        ...registryReceipt.metadata,
        external_id: "registry-proof-1",
      },
    },
    { threadId: "wedding_vendor_quote:workspace-1:chloes-florals" },
  ), null);

  assert.ok(weddingApprovalReceiptToVendorThreadAfpSendInput(
    {
      ...executedEmailReceipt,
      metadata: {
        ...executedEmailReceipt.metadata,
        provider_message_id: "gmail-message-123",
        provider_result_ok: true,
        external_delivery_performed: true,
        missing_durable_provider_receipt: false,
      },
    },
    { threadId: "wedding_vendor_quote:workspace-1:chloes-florals" },
  ));
});
