import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingGuestFinalCountDecisionTaskItems,
  buildWeddingGuestTrackingState,
} from "@/lib/weddingGuestTrackingState";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

test("buildWeddingGuestTrackingState counts RSVP dietary accessibility and follow-up gaps", () => {
  const state = buildWeddingGuestTrackingState({
    artifacts: [{
      title: "Guest list",
      kind: "guest_list",
      bodyText: [
        "| Name | RSVP | Email | Meal | Dietary | Accessibility |",
        "| --- | --- | --- | --- | --- | --- |",
        "| Alex | Yes | alex@example.test | Fish | Nut allergy | Wheelchair access |",
        "| Blair | Pending |  |  | Vegan |  |",
        "| Casey | No | casey@example.test | N/A | None | None |",
        "| Drew | Attending | drew@example.test |  |  |  |",
      ].join("\n"),
    }],
  });

  assert.equal(state.guestFileCount, 1);
  assert.equal(state.guestRowCount, 4);
  assert.equal(state.attendingCount, 2);
  assert.equal(state.declinedCount, 1);
  assert.equal(state.pendingCount, 1);
  assert.equal(state.householdCount, 4);
  assert.equal(state.dietaryCount, 2);
  assert.equal(state.accessibilityCount, 1);
  assert.equal(state.missingContactCount, 1);
  assert.equal(state.missingMealCount, 1);
  assert.deepEqual(state.guestRows?.slice(0, 2).map((row) => ({
    name: row.displayName,
    household: row.householdLabel,
    rsvp: row.rsvpStatus,
    meal: row.mealPreference,
    dietary: row.dietaryNote,
    access: row.accessibilityNote,
    source: row.sourceLabel,
  })), [{
    name: "Alex",
    household: "Ungrouped",
    rsvp: "Attending",
    meal: "Fish",
    dietary: "Nut allergy",
    access: "Wheelchair access",
    source: "Guest list",
  }, {
    name: "Blair",
    household: "Ungrouped",
    rsvp: "Pending",
    meal: null,
    dietary: "Vegan",
    access: null,
    source: "Guest list",
  }]);
  assert.ok(state.warningLabels.some((label) => /RSVPs? still pending/i.test(label)));
  assert.ok(state.warningLabels.some((label) => /contact/i.test(label)));
  assert.ok(state.warningLabels.some((label) => /meal/i.test(label)));
  assert.equal(state.finalCountOptions.length, 3);
  assert.equal(state.finalCountOptions[0]?.id, "submit_current_count");
  assert.equal(state.finalCountOptions[0]?.headcount, 2);
  assert.ok(state.followUpTaskCandidates.some((task) => /pending RSVP/i.test(task.title)));
  assert.ok(state.followUpTaskCandidates.some((task) => /meal choices/i.test(task.title)));
});

test("buildWeddingGuestTrackingState ignores non guest-list artifacts", () => {
  const state = buildWeddingGuestTrackingState({
    artifacts: [{
      title: "Venue table",
      kind: "vendor_table",
      bodyText: "| Vendor | Price |\n| --- | --- |\n| Venue A | $10000 |",
    }],
  });

  assert.equal(state.guestFileCount, 0);
  assert.equal(state.guestRowCount, 0);
  assert.equal(state.finalCountOptions.length, 0);
  assert.match(state.summaryLabel, /No structured guest-list rows/i);
});

test("buildWeddingGuestTrackingState redacts imported guest-list source filenames", () => {
  const state = buildWeddingGuestTrackingState({
    artifacts: [{
      id: "wedding_import:guest_list:workspace:rsvp-csv",
      title: "Imported CSV: rsvp.csv",
      kind: "guest_list",
      metadata: {
        supertags: ["wedding_import", "wedding_import:csv"],
      },
      sourceLabels: ["CSV import: rsvp.csv"],
      bodyText: [
        "| Name | RSVP |",
        "| --- | --- |",
        "| Alex | Confirmed |",
      ].join("\n"),
    }],
  });

  assert.equal(state.guestRowCount, 1);
  assert.deepEqual(state.sourceLabels, ["Imported private planning file"]);
  assert.equal(state.sourceLabels.some((label) => /rsvp\.csv/i.test(label)), false);
});

test("buildWeddingGuestTrackingState groups households and estimates final-count budget impact", () => {
  const state = buildWeddingGuestTrackingState({
    estimatedCostPerGuest: 180,
    artifacts: [{
      title: "Guest list",
      kind: "guest_list",
      bodyText: [
        "| Name | Household | RSVP | Email | Meal |",
        "| --- | --- | --- | --- | --- |",
        "| Alex Lee | Lee | Confirmed | alex@example.test | Beef |",
        "| Sam Lee | Lee | Confirmed | sam@example.test | Fish |",
        "| Priya Singh | Singh | Pending | priya@example.test |  |",
      ].join("\n"),
    }],
  });

  assert.equal(state.householdCount, 2);
  assert.match(state.summaryLabel, /2 households/i);
  assert.equal(state.finalCountOptions[0]?.headcount, 2);
  assert.equal(state.finalCountOptions[0]?.budgetImpactAmount, 360);
  assert.equal(state.finalCountOptions[1]?.headcount, 3);
  assert.equal(state.finalCountOptions[1]?.budgetImpactAmount, 540);
  assert.ok(state.finalCountOptions[1]?.riskLabel.includes("late-count fees"));
});

test("buildWeddingGuestTrackingState summarizes active boundary rules and invitation scope", () => {
  const state = buildWeddingGuestTrackingState({
    boundaryObjects: [{
      id: "policy:no-extra-plus-ones",
      kind: "wedding_boundary_policy",
      title: "No extra plus-ones",
      ruleType: "plus_one",
      enforcement: "require_approval",
      plainLanguage: "No extra plus-ones unless both of us approve.",
      status: "active",
    }, {
      id: "policy:children",
      kind: "wedding_boundary_policy",
      title: "Children rule",
      ruleType: "children",
      enforcement: "require_approval",
      plainLanguage: "Children are only included when named on the invite.",
      status: "active",
    }, {
      id: "invite:alex",
      kind: "wedding_boundary_event_invitation",
      title: "Alex ceremony invitation",
      invitationId: "invite:alex",
      eventId: "ceremony",
      personId: "person:alex",
      invitationStatus: "rsvp_yes",
      plusOneAllowed: true,
      childrenInvited: false,
    }, {
      id: "invite:blair",
      kind: "wedding_boundary_event_invitation",
      title: "Blair ceremony invitation",
      invitationId: "invite:blair",
      eventId: "ceremony",
      personId: "person:blair",
      invitationStatus: "invited",
      plusOneAllowed: false,
      childrenInvited: false,
    }],
  });

  assert.deepEqual(state.boundaryRuleLabels, [
    "No extra plus-ones unless both of us approve.",
    "Children are only included when named on the invite.",
  ]);
  assert.deepEqual(state.invitationScopeLabels, [
    "Plus-ones: 1 included, 1 not included",
    "Children: 0 included, 2 not included",
  ]);
});

test("buildWeddingGuestTrackingState ignores inactive boundary rules and not-invited scope", () => {
  const state = buildWeddingGuestTrackingState({
    boundaryObjects: [{
      id: "policy:old-plus-one",
      kind: "wedding_boundary_policy",
      title: "Old plus-one rule",
      ruleType: "plus_one",
      enforcement: "warn",
      plainLanguage: "Old rule",
      status: "archived",
    }, {
      id: "invite:not-invited",
      kind: "wedding_boundary_event_invitation",
      title: "Not invited",
      invitationId: "invite:not-invited",
      eventId: "ceremony",
      personId: "person:not-invited",
      invitationStatus: "not_invited",
      plusOneAllowed: false,
      childrenInvited: false,
    }],
  });

  assert.deepEqual(state.boundaryRuleLabels, []);
  assert.deepEqual(state.invitationScopeLabels, []);
});

test("buildWeddingGuestTrackingState preserves multiple event responses for one guest", () => {
  const state = buildWeddingGuestTrackingState({
    boundaryObjects: [{
      id: "person:alex",
      kind: "wedding_boundary_guest_profile",
      title: "Alex",
      personId: "person:alex",
      displayName: "Alex",
      householdId: "household:chen",
      mealPreference: "Vegetarian",
    }, {
      id: "household:chen",
      kind: "wedding_boundary_household",
      title: "Chen household",
      householdId: "household:chen",
      displayName: "Chen household",
    }, {
      id: "invite:alex:ceremony",
      kind: "wedding_boundary_event_invitation",
      title: "Alex ceremony invitation",
      invitationId: "invite:alex:ceremony",
      eventId: "ceremony",
      personId: "person:alex",
      invitationStatus: "rsvp_yes",
      responseSource: "guest",
      respondedAt: "2027-01-01T00:00:00Z",
    }, {
      id: "invite:alex:reception",
      kind: "wedding_boundary_event_invitation",
      title: "Alex reception invitation",
      invitationId: "invite:alex:reception",
      eventId: "reception",
      personId: "person:alex",
      invitationStatus: "rsvp_no",
      responseSource: "guest",
      respondedAt: "2027-01-01T00:00:00Z",
    }],
  });

  assert.equal(state.guestRowCount, 1);
  assert.equal(state.attendingCount, 1);
  assert.equal(state.declinedCount, 0);
  assert.equal(state.pendingCount, 0);
  assert.equal(state.guestRows?.[0]?.eventResponses.length, 2);
  assert.deepEqual(state.guestRows?.[0]?.eventResponses.map((event) => [event.eventId, event.attendance]), [
    ["ceremony", "Attending"],
    ["reception", "Not attending"],
  ]);
  assert.equal(state.rsvpResponseSummary.repliedCount, 1);
  assert.equal(state.rsvpResponseSummary.awaitingCount, 0);
});

test("buildWeddingGuestFinalCountDecisionTaskItems creates a searchable DecisionOS task", () => {
  const guestTracking = buildWeddingGuestTrackingState({
    estimatedCostPerGuest: 200,
    artifacts: [{
      title: "Guest list",
      kind: "guest_list",
      bodyText: [
        "| Name | RSVP | Email | Meal |",
        "| --- | --- | --- | --- |",
        "| Alex | Confirmed | alex@example.test | Beef |",
        "| Blair | Pending | blair@example.test |  |",
      ].join("\n"),
    }],
  });
  const tasks = buildWeddingGuestFinalCountDecisionTaskItems({
    guestTracking,
    metadata: {
      wedding_plan_id: "wedding_plan:test",
      response_workspace_id: "response_workspace:test",
    },
  });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.kind, "decision");
  const taskMetadata = record(tasks[0]?.metadata);
  assert.equal(taskMetadata.guest_final_count_decision, true);
  assert.deepEqual(taskMetadata.guest_final_count_headcounts, [1, 2, 0]);
  assert.ok((taskMetadata.searchable_terms as string[]).some((term) => /final guest count/i.test(term)));
});

test("buildWeddingGuestFinalCountDecisionTaskItems suppresses committed duplicate decisions", () => {
  const guestTracking = buildWeddingGuestTrackingState({
    artifacts: [{
      title: "Guest list",
      kind: "guest_list",
      bodyText: "| Name | RSVP |\n| --- | --- |\n| Alex | Confirmed |",
    }],
  });
  const tasks = buildWeddingGuestFinalCountDecisionTaskItems({
    guestTracking,
    existingTaskItems: [{
      id: "task:final-count",
      title: "Choose final count",
      kind: "decision",
      metadata: { guest_final_count_decision: true },
    }],
  });

  assert.equal(tasks.length, 0);
});
