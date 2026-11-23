import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import {
  buildWeddingMealChoiceReplacementImpact,
  buildWeddingMealChoiceState,
  weddingMealChoiceCatalogueToAfpSendInput,
} from "@/lib/weddingMealChoiceState";

const metadata = {
  wedding_plan_id: "wedding_plan:meal-test",
  response_workspace_id: "response_workspace:meal-test",
};

function message(input: Partial<AfpMessage> & Pick<AfpMessage, "id" | "kind" | "content">): AfpMessage {
  return {
    thread_id: "meal-test",
    from: "agent://test",
    to: ["user://test"],
    timestamp: "2026-10-31T08:00:00.000Z",
    type: "ledger",
    subtype: input.kind,
    supertags: [],
    metadata: { responseWorkspaceId: metadata.response_workspace_id },
    references: [],
    views: [],
    attachments: [],
    ...input,
  };
}

function savedMessage(input: SendAfpMessageInput): AfpMessage {
  return message({
    id: input.id,
    kind: input.kind,
    content: input.content,
    metadata: input.metadata,
    references: input.references,
    supertags: input.supertags,
  });
}

test("meal choices are suggested only from explicit structured wedding evidence", () => {
  const state = buildWeddingMealChoiceState([
    message({
      id: "quote-1",
      kind: "wedding_quote_normalisation",
      content: { response_workspace_id: metadata.response_workspace_id, inclusions: { meal_options: ["Beef", "Fish", "Vegetarian", "Fish"] } },
    }),
    message({
      id: "conversation-1",
      kind: "wedding_vendor_conversation",
      content: { response_workspace_id: metadata.response_workspace_id, body: "Maybe chicken or fish; this prose is not authoritative." },
    }),
  ], metadata.response_workspace_id);

  assert.equal(state.confirmed, null);
  assert.equal(state.suggestions.length, 1);
  assert.deepEqual(state.suggestions[0]?.options, ["Beef", "Fish", "Vegetarian"]);
  assert.equal(state.suggestions[0]?.source, "venue_package");
});

test("normalised quotation and run-sheet arrays map to reviewable choices without reading prose", () => {
  const state = buildWeddingMealChoiceState([
    message({
      id: "normalised-quote-1",
      kind: "normalised_quotation",
      content: { response_workspace_id: metadata.response_workspace_id, normalised: { menu_options: ["Lamb", "Snapper", "Plant-based"] }, summary: "A prose paragraph also mentions duck." },
    }),
    message({
      id: "run-sheet-1",
      kind: "wedding_run_sheet_projection",
      content: { response_workspace_id: metadata.response_workspace_id, day_details: { meal_choices: ["Lamb", "Snapper", "Plant-based"] } },
    }),
    message({
      id: "vendor-message-1",
      kind: "wedding_vendor_message",
      content: { response_workspace_id: metadata.response_workspace_id, body: "Choose chicken, beef or fish." },
    }),
  ], metadata.response_workspace_id);
  assert.equal(state.suggestions.length, 1, "identical structured arrays are deduplicated");
  assert.deepEqual(state.suggestions[0]?.options, ["Lamb", "Snapper", "Plant-based"]);
  assert.equal(state.suggestions[0]?.source, "venue_package");
  assert.doesNotMatch(state.suggestions[0]?.options.join(" "), /duck|chicken|beef/i);
});
test("a couple-confirmed catalogue is scoped, revisioned and source referenced", () => {
  const input = weddingMealChoiceCatalogueToAfpSendInput({
    options: ["Beef", "Fish", "Vegetarian"],
    source: "venue_package",
    sourceLabel: "Venue package or quote",
    sourceMessageId: "quote-1",
    currentRevision: 2,
    metadata,
    nowIso: "2026-10-31T08:30:00.000Z",
  });
  assert.ok(input);
  assert.equal(input?.content.revision, 3);
  assert.equal(input?.content.confirmed_by_couple, true);
  assert.equal(input?.metadata.model_calls, 0);

  const state = buildWeddingMealChoiceState([savedMessage(input!)], metadata.response_workspace_id);
  assert.deepEqual(state.confirmed?.options, ["Beef", "Fish", "Vegetarian"]);
  assert.equal(state.confirmed?.sourceMessageId, "quote-1");
  assert.equal(state.confirmed?.revision, 3);
});

test("meal catalogues do not cross workspace boundaries", () => {
  const input = weddingMealChoiceCatalogueToAfpSendInput({
    options: ["Beef", "Fish"],
    source: "manual",
    sourceLabel: "Entered by the couple",
    metadata,
  });
  assert.ok(input);
  assert.equal(buildWeddingMealChoiceState([savedMessage(input!)], "response_workspace:other").confirmed, null);
});

test("catalogue replacement identifies only attending responses whose selected choice is removed", () => {
  const current = buildWeddingMealChoiceState([savedMessage(weddingMealChoiceCatalogueToAfpSendInput({
    options: ["Beef", "Fish", "Vegetarian"],
    source: "venue_package",
    sourceLabel: "Venue package",
    metadata,
  })!)], metadata.response_workspace_id).confirmed;
  const impact = buildWeddingMealChoiceReplacementImpact({
    current,
    nextOptions: ["Chicken", "Fish", "Vegetarian"],
    guests: [
      { id: "person:one", displayName: "Alex", attendance: "Attending", mealPreference: "Beef" },
      { id: "person:two", displayName: "Sam", attendance: "Attending", mealPreference: "fish" },
      { id: "person:three", displayName: "Jo", attendance: "Not attending", mealPreference: "Beef" },
      { id: "person:four", displayName: "Rae", attendance: "Attending", mealPreference: null },
    ],
  });
  assert.equal(impact.changesCatalogue, true);
  assert.deepEqual(impact.addedOptions, ["Chicken"]);
  assert.deepEqual(impact.removedOptions, ["Beef"]);
  assert.deepEqual(impact.affectedResponses.map((item) => item.guestId), ["person:one"]);
  assert.equal(impact.requiresConfirmation, true);
});

test("replacement review is required and persists only bounded response references", () => {
  const impact = buildWeddingMealChoiceReplacementImpact({
    current: {
      id: "catalogue:one",
      options: ["Beef", "Fish"],
      source: "manual",
      sourceLabel: "Entered by the couple",
      sourceMessageId: "catalogue:one",
      confirmedByCouple: true,
      revision: 1,
    },
    nextOptions: ["Chicken", "Fish"],
    guests: [{ id: "person:one", displayName: "Alex", attendance: "Attending", mealPreference: "Beef" }],
  });
  const rejected = weddingMealChoiceCatalogueToAfpSendInput({
    options: ["Chicken", "Fish"], source: "manual", sourceLabel: "Entered by the couple", currentRevision: 1, replacementImpact: impact, metadata,
  });
  assert.equal(rejected, null);
  const accepted = weddingMealChoiceCatalogueToAfpSendInput({
    options: ["Chicken", "Fish"], source: "manual", sourceLabel: "Entered by the couple", currentRevision: 1, replacementImpact: impact, confirmedAffectedResponses: true, metadata,
  });
  assert.ok(accepted);
  assert.deepEqual(accepted?.content.replacement_review, {
    reviewed: true,
    affected_response_count: 1,
    affected_guest_refs: ["person:one"],
    removed_option_count: 1,
  });
  assert.doesNotMatch(JSON.stringify(accepted?.content.replacement_review), /Alex|Beef|dietary|allergy/i);
});
