import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingVendorOutreachBodyChanged,
  weddingVendorOutreachDraftFailed,
  weddingVendorOutreachDraftSucceeded,
  weddingVendorOutreachGroundedOnLabels,
  weddingVendorOutreachIdleFlow,
  weddingVendorOutreachNeedsGeneration,
  weddingVendorOutreachRecipient,
  weddingVendorOutreachSendFailed,
  weddingVendorOutreachSendGate,
  weddingVendorOutreachSendSucceeded,
  weddingVendorOutreachSentLabel,
  weddingVendorOutreachStartDrafting,
  weddingVendorOutreachStartSending,
} from "../src/lib/weddingVendorOutreachFlowState.ts";
import type { WeddingVendor } from "../src/lib/api.ts";

test("prepared AFP drafts are reused until the user explicitly regenerates", () => {
  const idle = weddingVendorOutreachIdleFlow({
    choiceId: "vendor-1",
    vendorName: "Garden House",
    recipientEmail: "hello@garden.example",
  });
  const prepared = weddingVendorOutreachDraftSucceeded(
    weddingVendorOutreachStartDrafting(idle),
    { subject: "Wedding enquiry", bodyMarkdown: "Hello", groundedOnLabels: [] },
  );

  assert.equal(weddingVendorOutreachNeedsGeneration(idle), true);
  assert.equal(weddingVendorOutreachNeedsGeneration(prepared), false);
  assert.equal(weddingVendorOutreachNeedsGeneration(prepared, true), true);
});

function gateFlow(overrides: Record<string, unknown> = {}) {
  return {
    vendorName: "Chloe's Florals",
    recipientEmail: "a@b.com",
    bodyMarkdown: "Hello",
    groundedOnFields: [],
    draftPermissionFingerprint: "date:yes|location:yes|guests:yes|style:yes|budget:no",
    permissions: {
      shareDateOrSeason: true,
      shareLocation: true,
      shareGuestCount: true,
      shareStylePriorities: true,
      shareApproximateBudget: false,
      allowPhoneContact: false,
      remindUnanswered: true,
      replyRoute: "connected_email" as const,
      previewApproved: true,
    },
    ...overrides,
  };
}

function vendor(overrides: Partial<WeddingVendor> = {}): WeddingVendor {
  return {
    vendorId: "v1",
    vendorSlug: "chloes-florals",
    vendorName: "Chloe's Florals",
    category: "florist",
    serviceArea: "Sydney",
    address: null,
    websiteUrl: "https://chloesflorals.example.com",
    contactPhone: null,
    contactEmail: "hello@chloesflorals.example.com",
    sourceUrl: null,
    sourceLabel: null,
    sourceCheckedAt: null,
    status: "active",
    notes: null,
    evidence: {},
    caveatLabels: [],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    photos: [],
    userContact: null,
    ...overrides,
  };
}

test("recipient resolves from the card's own email first", () => {
  const email = weddingVendorOutreachRecipient(
    { email: "direct@vendor.example.com", title: "Chloe's Florals", websiteUrl: null },
    [vendor()],
  );
  assert.equal(email, "direct@vendor.example.com");
});

test("recipient falls back to directory match by normalised name", () => {
  const email = weddingVendorOutreachRecipient(
    { email: null, title: "  Chloe's   Florals  ", websiteUrl: null },
    [vendor()],
  );
  assert.equal(email, "hello@chloesflorals.example.com");
});

test("recipient falls back to directory match by website hostname", () => {
  const email = weddingVendorOutreachRecipient(
    { email: null, title: "Totally Different Name", websiteUrl: "http://www.chloesflorals.example.com/contact" },
    [vendor()],
  );
  assert.equal(email, "hello@chloesflorals.example.com");
});

test("recipient is null when nothing matches", () => {
  const email = weddingVendorOutreachRecipient(
    { email: null, title: "Unknown Vendor", websiteUrl: null },
    [vendor()],
  );
  assert.equal(email, null);
});

test("send gate blocks with an actionable reason for each missing piece", () => {
  const noRecipient = weddingVendorOutreachSendGate(
    gateFlow({ recipientEmail: null }),
    { gmailConnected: true },
  );
  assert.equal(noRecipient.canSend, false);
  assert.match(noRecipient.reason ?? "", /No email address found for Chloe's Florals/);

  const noGmail = weddingVendorOutreachSendGate(
    gateFlow(),
    { gmailConnected: false },
  );
  assert.equal(noGmail.canSend, false);
  assert.match(noGmail.reason ?? "", /Connect Gmail/);

  const protectedPlatform = weddingVendorOutreachSendGate(
    gateFlow(),
    { gmailConnected: false, protectedRepliesAvailable: true },
  );
  assert.equal(protectedPlatform.canSend, true);

  const emptyBody = weddingVendorOutreachSendGate(
    gateFlow({ bodyMarkdown: "   " }),
    { gmailConnected: true },
  );
  assert.equal(emptyBody.canSend, false);
  assert.match(emptyBody.reason ?? "", /Add a message before sending/);

  const ready = weddingVendorOutreachSendGate(
    gateFlow(),
    { gmailConnected: true },
  );
  assert.equal(ready.canSend, true);
  assert.equal(ready.reason, null);
});

test("send gate fails closed for protected replies and an unreviewed or stale sharing preview", () => {
  const protectedRoute = weddingVendorOutreachSendGate(
    gateFlow({ permissions: { ...gateFlow().permissions, replyRoute: "omnyid_protected" } }),
    { gmailConnected: true, protectedRepliesAvailable: false },
  );
  assert.equal(protectedRoute.canSend, false);
  assert.match(protectedRoute.reason ?? "", /not enabled/);
  const unreviewed = weddingVendorOutreachSendGate(
    gateFlow({ permissions: { ...gateFlow().permissions, previewApproved: false } }),
    { gmailConnected: true },
  );
  assert.match(unreviewed.reason ?? "", /Review the recipient/);
  const staleBudget = weddingVendorOutreachSendGate(
    gateFlow({ permissions: { ...gateFlow().permissions, shareApproximateBudget: true } }),
    { gmailConnected: true },
  );
  assert.match(staleBudget.reason ?? "", /Update the draft/);
});

test("sent label reflects whether a sent date is known", () => {
  assert.equal(weddingVendorOutreachSentLabel({ sentAtIso: null }), "Enquiry sent");
  const labeled = weddingVendorOutreachSentLabel({ sentAtIso: "2026-03-05T00:00:00Z" });
  assert.match(labeled, /^Enquiry sent /);
});

test("full lifecycle transitions from idle through sent", () => {
  let flow = weddingVendorOutreachIdleFlow({
    choiceId: "choice-1",
    vendorName: "Chloe's Florals",
    recipientEmail: "hello@chloesflorals.example.com",
  });
  assert.equal(flow.stage, "idle");

  flow = weddingVendorOutreachStartDrafting(flow);
  assert.equal(flow.stage, "drafting");

  flow = weddingVendorOutreachDraftSucceeded(flow, {
    subject: "Enquiry",
    bodyMarkdown: "Hello there",
    groundedOnLabels: ["location"],
  });
  assert.equal(flow.stage, "draft_ready");
  assert.equal(flow.subject, "Enquiry");
  assert.deepEqual(flow.groundedOnLabels, ["location"]);

  flow = weddingVendorOutreachBodyChanged(flow, "Hello there, edited");
  assert.equal(flow.bodyMarkdown, "Hello there, edited");
  assert.equal(flow.stage, "draft_ready");

  flow = weddingVendorOutreachStartSending(flow);
  assert.equal(flow.stage, "sending");

  flow = weddingVendorOutreachSendSucceeded(flow, {
    sentAtIso: "2026-03-05T00:00:00Z",
    receiptRef: "msg-1",
    threadId: "thread-1",
  });
  assert.equal(flow.stage, "sent");
  assert.equal(flow.receiptRef, "msg-1");
});

test("drafting can fail and does not stop the flow from being retried", () => {
  let flow = weddingVendorOutreachIdleFlow({
    choiceId: "choice-2",
    vendorName: "Willow Weddings",
    recipientEmail: null,
  });
  flow = weddingVendorOutreachStartDrafting(flow);
  flow = weddingVendorOutreachDraftFailed(flow, "model unavailable");
  assert.equal(flow.stage, "draft_failed");
  assert.equal(flow.blockedReason, "model unavailable");

  flow = weddingVendorOutreachStartDrafting(flow);
  assert.equal(flow.stage, "drafting");
  assert.equal(flow.blockedReason, null);
});

test("grounded_on labels translate field names into plain language using real values", () => {
  const labels = weddingVendorOutreachGroundedOnLabels(
    ["top_priorities", "location", "unknown_field"],
    { top_priorities: ["flowers"], location: "Sydney" },
  );
  assert.deepEqual(labels, [
    "you mentioned flowers as a priority",
    "your wedding is in Sydney",
  ]);
});

test("grounded_on labels are empty when the couple data does not actually back them", () => {
  const labels = weddingVendorOutreachGroundedOnLabels(["top_priorities", "location"], {});
  assert.deepEqual(labels, []);
});

test("sending can fail and returns to a draft_ready-equivalent state for retry", () => {
  let flow = weddingVendorOutreachIdleFlow({
    choiceId: "choice-3",
    vendorName: "Willow Weddings",
    recipientEmail: "hi@willow.example.com",
  });
  flow = weddingVendorOutreachStartDrafting(flow);
  flow = weddingVendorOutreachDraftSucceeded(flow, {
    subject: "Enquiry",
    bodyMarkdown: "Hello",
    groundedOnLabels: ["location"],
  });
  flow = weddingVendorOutreachStartSending(flow);
  flow = weddingVendorOutreachSendFailed(flow, "gmail send failed");
  assert.equal(flow.stage, "send_failed");
  assert.equal(flow.blockedReason, "gmail send failed");
  assert.equal(flow.bodyMarkdown, "Hello");
});
