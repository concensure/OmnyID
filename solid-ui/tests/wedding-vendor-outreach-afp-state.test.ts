import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWeddingPlanningMetadata } from "../src/lib/weddingPlanningTemplateState.ts";
import { weddingVendorOutreachIdleFlow, weddingVendorOutreachDraftSucceeded } from "../src/lib/weddingVendorOutreachFlowState.ts";
import {
  weddingVendorOutreachDraftAfpSendInput,
  weddingVendorOutreachSentAfpSendInput,
} from "../src/lib/weddingVendorOutreachAfpState.ts";

function sampleMetadata() {
  return normalizeWeddingPlanningMetadata({
    weddingPlanId: "wedding_plan:sample",
    responseWorkspaceId: "response_workspace:sample",
  });
}

function sampleFlow() {
  let flow = weddingVendorOutreachIdleFlow({
    choiceId: "choice-1",
    vendorName: "Chloe's Florals",
    recipientEmail: "hello@chloesflorals.example.com",
  });
  flow = weddingVendorOutreachDraftSucceeded(flow, {
    subject: "Enquiry about your florals",
    bodyMarkdown: "Hello, we would love to hear about your availability.",
    groundedOnLabels: ["you mentioned Sydney as your location"],
  });
  return flow;
}

test("draft message carries both wedding supertags required for reload", () => {
  const input = weddingVendorOutreachDraftAfpSendInput({
    flow: sampleFlow(),
    metadata: sampleMetadata(),
    sourceArtifactId: "artifact-1",
  });
  assert.ok(input.supertags?.includes("template:wedding_planning"));
  assert.ok(input.supertags?.includes("event:wedding"));
  assert.ok(input.supertags?.includes("wedding_vendor_outreach"));
  assert.ok(input.supertags?.includes("wedding_email_draft"));
});

test("sent message carries both wedding supertags and a parent_id pointing at the draft", () => {
  const input = weddingVendorOutreachSentAfpSendInput({
    flow: sampleFlow(),
    metadata: sampleMetadata(),
    draftMessageId: "draft-message-1",
    providerReceipt: { providerMessageId: "gmail-msg-1", clientMessageId: "client-msg-1" },
  });
  assert.ok(input.supertags?.includes("template:wedding_planning"));
  assert.ok(input.supertags?.includes("event:wedding"));
  assert.ok(input.supertags?.includes("wedding_vendor_outreach"));
  assert.ok(input.supertags?.includes("delivery_confirmed"));
  assert.equal(input.parent_id, "draft-message-1");
});

test("sent message metadata carries the thread and receipt matcher fields", () => {
  const input = weddingVendorOutreachSentAfpSendInput({
    flow: sampleFlow(),
    metadata: sampleMetadata(),
    draftMessageId: "draft-message-1",
    providerReceipt: { providerMessageId: "gmail-msg-1", clientMessageId: "client-msg-1" },
  });
  const metadata = input.metadata as Record<string, unknown>;
  assert.equal(metadata.vendor_contact_receipt_ref, "client-msg-1");
  assert.equal(typeof metadata.vendor_contact_thread_id, "string");
  assert.equal(metadata.approval_mode, "explicit_user_send");
});

test("draft message never mutates — parent_id is absent and a new call is not equal by reference", () => {
  const flow = sampleFlow();
  const metadata = sampleMetadata();
  const first = weddingVendorOutreachDraftAfpSendInput({ flow, metadata });
  const second = weddingVendorOutreachDraftAfpSendInput({ flow, metadata });
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
  assert.equal(first.parent_id, undefined);
});

test("builders are pure functions of their inputs", () => {
  const flow = sampleFlow();
  const metadata = sampleMetadata();
  const draftBefore = JSON.stringify(flow);
  weddingVendorOutreachDraftAfpSendInput({ flow, metadata, sourceArtifactId: "artifact-1" });
  weddingVendorOutreachSentAfpSendInput({
    flow,
    metadata,
    draftMessageId: "draft-message-1",
    providerReceipt: { providerMessageId: null, clientMessageId: null },
  });
  assert.equal(JSON.stringify(flow), draftBefore);
});
