import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingVendorFollowUpOutreachCardData,
  weddingVendorFollowUpOutreachChoiceId,
  weddingVendorFollowUpPrimaryAction,
  weddingVendorRecordReplyAction,
} from "@/lib/weddingVendorFollowUpPanelActionState";
import type { WeddingVendorContactWorkspaceCard } from "@/lib/weddingResponseWorkspaceViewState";

const baseCard: WeddingVendorContactWorkspaceCard = {
  id: "vendor:venue",
  vendorId: "vendor:venue",
  vendorName: "Harbour View Venue",
  categoryLabel: "Venue",
  statusLabel: "Waiting for reply",
  stage: "waiting_for_reply",
  tone: "waiting",
  detailLabel: "You contacted this vendor recently. Wait before nudging.",
  nextActionLabel: "Wait for the vendor reply",
  primaryActionLabel: "Open follow-up task",
  actionMode: "waiting",
  lastContactLabel: "2026-09-20",
  followUpDueLabel: "2026-09-25",
  replyLabel: null,
  metadataLabels: ["Venue", "personal email"],
  contactChips: [
    { kind: "address", label: "Venue", value: "1 Harbour St, Sydney" },
    { kind: "email", label: "email", value: "hello@harbourview.test" },
    { kind: "phone", label: "phone", value: "+61 2 5555 0000" },
  ],
};

test("weddingVendorFollowUpPrimaryAction opens tasks for waiting vendors", () => {
  const action = weddingVendorFollowUpPrimaryAction(baseCard);
  const metadata = action.metadata?.wedding_vendor_follow_up_tasks as Record<string, unknown> | undefined;

  assert.equal(action.kind, "open_tasks");
  assert.equal(action.label, "Open follow-up task");
  assert.equal(metadata?.vendor_id, "vendor:venue");
  assert.equal(metadata?.waiting_for_reply, true);
  assert.equal(metadata?.next_step, "Wait for the vendor reply");
  assert.deepEqual(action.contextLabels, ["Harbour View Venue", "Venue", "Waiting for reply"]);
});

test("weddingVendorFollowUpPrimaryAction keeps follow-up sends approval gated", () => {
  const action = weddingVendorFollowUpPrimaryAction({
    ...baseCard,
    statusLabel: "Second attempt due",
    stage: "follow_up_due",
    tone: "due",
    nextActionLabel: "Send one follow-up",
    primaryActionLabel: "Review and approve follow-up",
    actionMode: "follow_up",
  });
  const metadata = action.metadata?.wedding_vendor_follow_up as Record<string, unknown> | undefined;

  assert.equal(action.kind, "approve_action");
  assert.equal(action.label, "Review and approve follow-up");
  assert.equal(metadata?.approval_required, true);
  assert.equal(metadata?.no_spam_policy, true);
  assert.equal((metadata?.draft_request as Record<string, unknown> | undefined)?.kind, "vendor_follow_up_email_draft");
  assert.equal((metadata?.draft_request as Record<string, unknown> | undefined)?.user_must_review_before_send, true);
  assert.equal((metadata?.draft_request as Record<string, unknown> | undefined)?.external_send_performed, false);
  assert.match(String((metadata?.draft_request as Record<string, unknown> | undefined)?.suggested_subject), /availability/i);
  assert.deepEqual((metadata?.draft_request as Record<string, unknown> | undefined)?.context, [
    "You contacted this vendor recently. Wait before nudging.",
    "Last contact: 2026-09-20",
    "Follow-up due: 2026-09-25",
  ]);
});

test("weddingVendorFollowUpPrimaryAction carries an initial outreach draft request", () => {
  const action = weddingVendorFollowUpPrimaryAction({
    ...baseCard,
    statusLabel: "Draft outreach",
    stage: "initial_outreach",
    tone: "neutral",
    nextActionLabel: "Send initial enquiry",
    primaryActionLabel: "Review and approve outreach",
    actionMode: "follow_up",
    lastContactLabel: null,
    followUpDueLabel: null,
  });
  const metadata = action.metadata?.wedding_vendor_follow_up as Record<string, unknown> | undefined;
  const draft = metadata?.draft_request as Record<string, unknown> | undefined;

  assert.equal(action.kind, "approve_action");
  assert.equal(draft?.kind, "vendor_initial_outreach_email_draft");
  assert.equal(draft?.channel, "email");
  assert.equal(draft?.user_must_review_before_send, true);
  assert.equal(draft?.external_send_performed, false);
  assert.match(String(draft?.suggested_subject), /wedding venue enquiry/i);
});

test("weddingVendorRecordReplyAction creates a no-send close-loop action", () => {
  const action = weddingVendorRecordReplyAction(baseCard);
  const metadata = action.metadata?.wedding_vendor_reply_record as Record<string, unknown> | undefined;

  assert.equal(action.kind, "approve_action");
  assert.equal(action.label, "Record reply");
  assert.equal(metadata?.vendor_name, "Harbour View Venue");
  assert.equal(metadata?.clears_follow_up, true);
  assert.equal(metadata?.external_send, false);
});

test("weddingVendorFollowUpOutreachChoiceId is stable per vendor", () => {
  assert.equal(weddingVendorFollowUpOutreachChoiceId(baseCard), "follow-up:vendor:venue");
  assert.equal(
    weddingVendorFollowUpOutreachChoiceId({ ...baseCard, vendorId: null, id: "fallback-id" }),
    "follow-up:fallback-id",
  );
});

test("weddingVendorFollowUpOutreachCardData carries the vendor's contact chips into the composer card", () => {
  const card = weddingVendorFollowUpOutreachCardData(baseCard);
  assert.equal(card.choiceId, "follow-up:vendor:venue");
  assert.equal(card.title, "Harbour View Venue");
  assert.equal(card.email, "hello@harbourview.test");
  assert.equal(card.phone, "+61 2 5555 0000");
  assert.equal(card.address, "1 Harbour St, Sydney");
});
