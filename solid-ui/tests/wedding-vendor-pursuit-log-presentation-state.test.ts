import assert from "node:assert/strict";
import test from "node:test";

import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import { buildWeddingVendorPursuitLogCards } from "@/lib/weddingVendorPursuitLogPresentationState";

function closedTask(input: {
  id?: string;
  vendor?: string;
  reason?: string;
  closedAt?: string;
  note?: string;
} = {}): WeddingPlanningTaskItem {
  const vendor = input.vendor ?? "Budget Lens";
  return {
    id: input.id ?? `wedding_vendor_outreach_task:${vendor.toLowerCase().replace(/\s+/g, "_")}`,
    title: `Stopped pursuing ${vendor}`,
    kind: "vendor_follow_up",
    dueLabel: "Closed",
    source: "user",
    reviewStatus: "ignored",
    approvalState: "archived",
    metadata: {
      vendor_outreach_pursuit_status: "not_pursuing",
      vendor_outreach_line_item_id: `decision:${vendor}`,
      vendor_outreach_vendor_label: vendor,
      vendor_outreach_category_label: "Photographer",
      vendor_outreach_source_label: "Top-three vendor comparison",
      vendor_outreach_closure_reason: input.reason ?? "not_suitable",
      vendor_outreach_closed_at: input.closedAt ?? "2026-09-28T00:00:00.000Z",
      outreach_escalation_stage: "closed",
    },
    notes: input.note ? `Reason: Not suitable. Note: ${input.note}.` : "Reason: Not suitable.",
  };
}

test("buildWeddingVendorPursuitLogCards presents closed vendor pursuits as history cards", () => {
  const cards = buildWeddingVendorPursuitLogCards([
    closedTask({ note: "The style is less aligned than Harbour Studio" }),
  ]);

  assert.equal(cards.length, 1);
  assert.equal(cards[0]?.vendorLabel, "Budget Lens");
  assert.equal(cards[0]?.title, "Stopped pursuing Budget Lens: Not suitable");
  assert.equal(cards[0]?.reasonLabel, "Not suitable");
  assert.equal(cards[0]?.closedAtLabel, "Closed 2026-09-28");
  assert.equal(cards[0]?.noteLabel, "The style is less aligned than Harbour Studio");
  assert.deepEqual(cards[0]?.metadataLabels, [
    "Photographer",
    "Top-three vendor comparison",
    "Closed 2026-09-28",
  ]);
});

test("buildWeddingVendorPursuitLogCards ignores active follow-ups and sorts latest closure first", () => {
  const active: WeddingPlanningTaskItem = {
    id: "wedding_vendor_outreach_task:active",
    title: "Prepare approval-gated vendor outreach and follow-up for Harbour Studio",
    kind: "vendor_follow_up",
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "draft",
    metadata: {
      vendor_outreach_line_item_id: "decision:active",
      vendor_outreach_vendor_label: "Harbour Studio",
    },
  };

  const cards = buildWeddingVendorPursuitLogCards([
    closedTask({ vendor: "Earlier Vendor", reason: "too_expensive", closedAt: "2026-09-20T00:00:00.000Z" }),
    active,
    closedTask({ vendor: "Later Vendor", reason: "chose_another_vendor", closedAt: "2026-09-29T00:00:00.000Z" }),
  ]);

  assert.deepEqual(cards.map((card) => card.vendorLabel), ["Later Vendor", "Earlier Vendor"]);
  assert.equal(cards[0]?.reasonLabel, "Chose another vendor");
  assert.equal(cards.some((card) => card.vendorLabel === "Harbour Studio"), false);
});
