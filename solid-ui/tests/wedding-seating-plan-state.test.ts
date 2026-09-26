import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingSeatingPlanState } from "@/lib/weddingSeatingPlanState";

test("buildWeddingSeatingPlanState summarizes assigned tables and constraints", () => {
  const state = buildWeddingSeatingPlanState({
    artifacts: [{
      title: "Guest list",
      kind: "guest_list",
      bodyText: [
        "| Name | RSVP | Table | Household | Role | Seating note | Accessibility |",
        "| --- | --- | --- | --- | --- | --- | --- |",
        "| Alex | Yes | Table 1 | Bride family | Parent | VIP table | Wheelchair access |",
        "| Blair | Attending | Table 1 | Bride family | Sibling | Keep near Alex |  |",
        "| Casey | Confirmed |  | Groom friends | VIP | Divorced - do not seat with Drew |  |",
        "| Drew | No |  | Groom friends | Guest |  |  |",
      ].join("\n"),
    }],
    seatsPerTable: 2,
  });

  assert.equal(state.guestRowsConsidered, 3);
  assert.equal(state.assignedSeatCount, 2);
  assert.equal(state.unassignedAttendingCount, 1);
  assert.equal(state.tableCount, 1);
  assert.equal(state.householdGroupCount, 2);
  assert.equal(state.vipOrWeddingPartyCount, 2);
  assert.equal(state.sensitiveConstraintCount, 1);
  assert.equal(state.accessibilityConstraintCount, 1);
  assert.equal(state.suggestedTableCount, 2);
  assert.equal(state.statusLabel, "Needs seating follow-up");
  assert.equal(state.tableBriefs.length, 1);
  assert.equal(state.tableBriefs[0]?.tableLabel, "Table 1");
  assert.equal(state.tableBriefs[0]?.guestCount, 2);
  assert.equal(state.tableBriefs[0]?.householdLabels.length, 1);
  assert.equal(state.tableBriefs[0]?.dietaryOrAccessibilityCount, 1);
  assert.ok(state.vendorBriefLines.some((line) => /attending guests considered/i.test(line)));
  assert.ok(state.vendorBriefLines.some((line) => /accessibility seating need/i.test(line)));
  assert.ok(state.vendorBriefLines.some((line) => /Sensitive relationship notes/i.test(line)));
  assert.ok(state.actionItems.some((item) => /Assign 1 attending guest/i.test(item.title)));
  assert.ok(state.actionItems.some((item) => /Confirm 1 sensitive seating constraint/i.test(item.title)));
  assert.ok(state.actionItems.some((item) => /Brief venue on 1 accessibility/i.test(item.title)));
  assert.equal(state.optimizationPreview?.assignments.length, 3);
  assert.ok(state.optimizationPreview?.hardViolations.length === 0);
  assert.equal(state.optimizationPeople.length, 3);
  assert.equal(state.optimizationTables.length, 2);
  assert.ok(state.warningLabels.some((label) => /not assigned/i.test(label)));
  assert.ok(state.warningLabels.some((label) => /sensitive seating/i.test(label)));
  assert.ok(state.warningLabels.some((label) => /accessibility/i.test(label)));
});

test("buildWeddingSeatingPlanState reports draft-ready when attending guests are assigned", () => {
  const state = buildWeddingSeatingPlanState({
    artifacts: [{
      title: "Guest list",
      kind: "guest_list",
      bodyText: [
        "| Name | RSVP | Table | Household | Role |",
        "| --- | --- | --- | --- | --- |",
        "| Alex | Yes | Table 1 | Bride family | Parent |",
        "| Blair | Yes | Table 2 | Friends | Guest |",
      ].join("\n"),
    }],
    seatsPerTable: 1,
  });

  assert.equal(state.statusLabel, "Draft seating-ready");
  assert.equal(state.warningLabels.length, 0);
  assert.deepEqual(state.tableLabels, ["Table 1", "Table 2"]);
  assert.equal(state.tableBriefs.length, 2);
  assert.equal(state.actionItems.length, 0);
  assert.equal(state.optimizationPreview?.assignments.length, 2);
  assert.ok(state.vendorBriefLines.some((line) => /2 named tables detected/i.test(line)));
});

test("buildWeddingSeatingPlanState feeds conflict notes into the optimizer preview", () => {
  const state = buildWeddingSeatingPlanState({
    artifacts: [{
      title: "Guest list",
      kind: "guest_list",
      bodyText: [
        "| Name | RSVP | Household | Seating note |",
        "| --- | --- | --- | --- |",
        "| Mum | Yes | Family |  |",
        "| Uncle David | Yes | Family | Do not seat with Mum |",
      ].join("\n"),
    }],
    seatsPerTable: 1,
  });
  const mum = state.optimizationPreview?.assignments.find((assignment) => assignment.personLabel === "Mum");
  const david = state.optimizationPreview?.assignments.find((assignment) => assignment.personLabel === "Uncle David");

  assert.ok(mum);
  assert.ok(david);
  assert.notEqual(mum.tableId, david.tableId);
});

test("buildWeddingSeatingPlanState asks for household grouping before optimization", () => {
  const state = buildWeddingSeatingPlanState({
    artifacts: [{
      title: "Guest list",
      kind: "guest_list",
      bodyText: [
        "| Name | RSVP | Table | Role |",
        "| --- | --- | --- | --- |",
        "| Alex | Yes | Table 1 | Guest |",
        "| Blair | Yes | Table 1 | Guest |",
      ].join("\n"),
    }],
  });

  assert.equal(state.householdGroupCount, 0);
  assert.ok(state.warningLabels.some((label) => /No household/i.test(label)));
  assert.ok(state.actionItems.some((item) => /Add household\/family grouping/i.test(item.title)));
});

test("buildWeddingSeatingPlanState normalizes dietary and accessibility vendor brief facts", () => {
  const state = buildWeddingSeatingPlanState({
    artifacts: [{
      title: "Guest list",
      kind: "guest_list",
      bodyText: [
        "| Name | RSVP | Table | Household | Meal | Dietary | Accessibility | Seating note |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
        "| Alex | Yes | Table 1 | Lee | Vegan | Severe nut allergy - carries EpiPen | Wheelchair access |  |",
        "| Blair | Yes | Table 1 | Lee | Vegetarian | Gluten-free coeliac | Step-free access |  |",
        "| Casey | Yes | Table 2 | Singh | Fish | Halal | Hearing support | Divorced - keep apart |",
      ].join("\n"),
    }],
  });

  assert.ok(state.dietaryAccessibilityBrief.dietarySummaryLabels.some((label) => /1 vegan/i.test(label)));
  assert.ok(state.dietaryAccessibilityBrief.dietarySummaryLabels.some((label) => /1 nut allergy/i.test(label)));
  assert.ok(state.dietaryAccessibilityBrief.dietarySummaryLabels.some((label) => /1 gluten-free\/coeliac/i.test(label)));
  assert.ok(state.dietaryAccessibilityBrief.accessibilitySummaryLabels.some((label) => /1 wheelchair access/i.test(label)));
  assert.ok(state.dietaryAccessibilityBrief.accessibilitySummaryLabels.some((label) => /1 mobility\/step-free access/i.test(label)));
  assert.equal(state.dietaryAccessibilityBrief.severeAllergyCount, 1);
  assert.ok(state.dietaryAccessibilityBrief.approvalRequiredLabels.some((label) => /Severe allergy details require explicit approval/i.test(label)));
  assert.ok(state.dietaryAccessibilityBrief.approvalRequiredLabels.some((label) => /Sensitive relationship notes should be redacted/i.test(label)));
  assert.ok(state.vendorBriefLines.some((line) => /severe allergy note/i.test(line)));
  assert.match(state.dietaryAccessibilityBrief.correctionLoopLabel, /record corrections back into the guest list/i);
});
