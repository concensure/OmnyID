import assert from "node:assert/strict";
import test from "node:test";

import {
  weddingVendorFollowUpAlertLabel,
  weddingVendorFollowUpCardHeadline,
  weddingVendorFollowUpCardRationale,
} from "../src/lib/weddingVendorFollowUpPanelPresentationState.ts";
import type { WeddingVendorContactWorkspaceCard } from "../src/lib/weddingResponseWorkspaceViewState.ts";

function baseCard(overrides: Partial<WeddingVendorContactWorkspaceCard> = {}): WeddingVendorContactWorkspaceCard {
  return {
    id: "vendor:harbour-hall",
    vendorId: "vendor:harbour-hall",
    vendorName: "Harbour Hall",
    categoryLabel: "Venue",
    statusLabel: "Waiting for reply",
    stage: "waiting_for_reply",
    tone: "waiting",
    detailLabel: "You contacted this vendor recently. Wait before nudging.",
    nextActionLabel: "Wait for the vendor reply",
    primaryActionLabel: "Open follow-up task",
    actionMode: "waiting",
    lastContactLabel: null,
    followUpDueLabel: null,
    replyLabel: null,
    metadataLabels: [],
    contactChips: [],
    ...overrides,
  };
}

test("weddingVendorFollowUpAlertLabel is suppressed when nothing is due", () => {
  assert.equal(weddingVendorFollowUpAlertLabel(0), null);
});

test("weddingVendorFollowUpAlertLabel uses singular phrasing for exactly one", () => {
  assert.equal(weddingVendorFollowUpAlertLabel(1), "1 thing to follow up");
});

test("weddingVendorFollowUpAlertLabel uses a count for more than one", () => {
  assert.equal(weddingVendorFollowUpAlertLabel(3), "3 things to follow up");
});

test("weddingVendorFollowUpCardHeadline names the vendor and the concrete status per stage", () => {
  assert.match(weddingVendorFollowUpCardHeadline(baseCard({ stage: "closed" })), /Harbour Hall replied/i);
  assert.match(weddingVendorFollowUpCardHeadline(baseCard({ stage: "waiting_for_reply" })), /Waiting on Harbour Hall/i);
  assert.match(weddingVendorFollowUpCardHeadline(baseCard({ stage: "follow_up_due" })), /due a follow-up/i);
  assert.match(weddingVendorFollowUpCardHeadline(baseCard({ stage: "escalate_to_user" })), /time to decide/i);
  assert.match(weddingVendorFollowUpCardHeadline(baseCard({ stage: "mark_unresponsive" })), /unresponsive/i);
  assert.match(weddingVendorFollowUpCardHeadline(baseCard({ stage: "initial_outreach" })), /Ready to reach out/i);
});

test("weddingVendorFollowUpCardRationale is null (an honest still-reviewing state) with no recorded facts", () => {
  assert.equal(weddingVendorFollowUpCardRationale(baseCard()), null);
});

test("weddingVendorFollowUpCardRationale is built only from facts actually recorded on the contact row", () => {
  const rationale = weddingVendorFollowUpCardRationale(
    baseCard({ lastContactLabel: "2026-09-20", followUpDueLabel: "2026-09-25" }),
  );
  assert.match(rationale ?? "", /Why we suggest this:/);
  assert.match(rationale ?? "", /contacted them on 2026-09-20/);
  assert.match(rationale ?? "", /follow-up was due 2026-09-25/);
});

test("weddingVendorFollowUpCardRationale drops the follow-up-due fact once the vendor has replied", () => {
  const rationale = weddingVendorFollowUpCardRationale(
    baseCard({ stage: "closed", followUpDueLabel: "2026-09-25", replyLabel: "2026-09-22" }),
  );
  assert.match(rationale ?? "", /replied on 2026-09-22/);
  assert.doesNotMatch(rationale ?? "", /follow-up was due/);
});
