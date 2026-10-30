import assert from "node:assert/strict";
import test from "node:test";

import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingGuestTrackingState } from "@/lib/weddingGuestTrackingState";
import {
  buildWeddingRsvpInvitationPreviews,
  buildWeddingRsvpSetupDraft,
  weddingRsvpSetupEventOptions,
  weddingRsvpSetupFromAfpMessages,
  weddingRsvpSetupToAfpSendInput,
} from "@/lib/weddingRsvpSetupState";

const metadata = {
  wedding_plan_id: "wedding_plan:rsvp-setup-test",
  response_workspace_id: "response_workspace:rsvp-setup-test",
};

function afpMessage(input: SendAfpMessageInput, timestamp: string): AfpMessage {
  return {
    id: input.id,
    thread_id: input.thread_id,
    from: input.from,
    to: input.to,
    timestamp,
    type: input.type,
    kind: input.kind,
    subtype: input.subtype,
    supertags: input.supertags,
    content: input.content,
    metadata: input.metadata,
    references: input.references,
    views: [],
    attachments: [],
  };
}

function guestTracking(): WeddingGuestTrackingState {
  return {
    guestRows: [{
      id: "person:alex",
      personId: "person:alex",
      displayName: "Alex Chen",
      householdLabel: "Chen household",
      rsvpStatus: "Pending",
      contactLabel: "alex@example.test",
      mealPreference: null,
      dietaryNote: "Private allergy detail",
      accessibilityNote: "Private access detail",
      mealRequired: true,
      sourceLabel: "Couple guest list",
      eventResponses: [{
        invitationId: "invitation:alex:wedding-day",
        eventId: "wedding_event:main_wedding",
        attendance: "Pending",
        responseSource: null,
        viewedAt: null,
        respondedAt: null,
        lockedAt: null,
        changed: false,
        revision: 0,
        plusOneAllowed: true,
        childrenInvited: false,
      }],
    }, {
      id: "person:sam",
      personId: "person:sam",
      displayName: "Sam Chen",
      householdLabel: "Chen household",
      rsvpStatus: "Attending",
      contactLabel: "sam@example.test",
      mealPreference: "Vegetarian",
      dietaryNote: null,
      accessibilityNote: null,
      mealRequired: true,
      sourceLabel: "Guest RSVP",
      eventResponses: [{
        invitationId: "invitation:sam:wedding-day",
        eventId: "wedding_event:main_wedding",
        attendance: "Attending",
        responseSource: "guest",
        viewedAt: "2027-01-02T00:00:00Z",
        respondedAt: "2027-01-02T00:05:00Z",
        lockedAt: null,
        changed: false,
        revision: 1,
        plusOneAllowed: false,
        childrenInvited: true,
      }],
    }],
  } as WeddingGuestTrackingState;
}

test("RSVP setup requires a future deadline and keeps attendance required", () => {
  const invalid = buildWeddingRsvpSetupDraft({
    eventId: "wedding_event:main_wedding",
    eventLabel: "Wedding day",
    responseDeadline: "2027-01-01",
    enabledQuestionIds: [],
    requiredQuestionIds: [],
  }, metadata, 0, "2027-02-01T00:00:00Z");
  assert.equal(invalid.setup, null);
  assert.ok(invalid.errorLabels.some((label) => /today or a future/i.test(label)));

  const valid = buildWeddingRsvpSetupDraft({
    eventId: "wedding_event:main_wedding",
    eventLabel: "Wedding day",
    responseDeadline: "2027-03-01",
    enabledQuestionIds: ["dietary_requirements"],
    requiredQuestionIds: ["dietary_requirements"],
  }, metadata, 2, "2027-02-01T00:00:00Z");
  assert.ok(valid.setup);
  assert.equal(valid.setup?.revision, 3);
  assert.deepEqual(
    valid.setup?.questions.filter((question) => question.enabled).map((question) => question.id),
    ["attendance", "dietary_requirements"],
  );
  assert.equal(valid.setup?.questions[0]?.required, true);
});

test("RSVP setup validates bounded meal choices and custom questions", () => {
  const meal = buildWeddingRsvpSetupDraft({
    eventId: "reception",
    eventLabel: "Reception",
    responseDeadline: "2027-04-01",
    enabledQuestionIds: ["meal_choice", "custom_text"],
    requiredQuestionIds: [],
    customPrompt: "",
    mealOptions: ["Vegetarian"],
  }, metadata, 0, "2027-02-01T00:00:00Z");
  assert.equal(meal.setup, null);
  assert.ok(meal.errorLabels.some((label) => /two meal choices/i.test(label)));
  assert.ok(meal.errorLabels.some((label) => /custom question/i.test(label)));
});

test("RSVP setup AFP object is draft-only and cannot send or create a capability", () => {
  const built = buildWeddingRsvpSetupDraft({
    eventId: "wedding_event:main_wedding",
    eventLabel: "Wedding day",
    responseDeadline: "2027-03-01",
    enabledQuestionIds: ["meal_choice", "dietary_requirements"],
    requiredQuestionIds: ["meal_choice"],
    mealOptions: ["Chicken", "Vegetarian"],
  }, metadata, 0, "2027-02-01T00:00:00Z");
  assert.ok(built.setup);
  const input = weddingRsvpSetupToAfpSendInput(built.setup!, metadata);
  assert.equal(input.kind, "wedding_rsvp_setup");
  assert.equal(input.metadata?.approval_status, "draft");
  assert.equal(input.metadata?.sends_invitation, false);
  assert.equal(input.metadata?.creates_capability, false);
  assert.equal(input.metadata?.model_calls, 0);
  assert.ok(input.supertags?.includes("privacy:couple_only"));
  assert.doesNotMatch(JSON.stringify(input), /alex@example|allergy detail|access detail/i);
});

test("latest scoped RSVP setup revision rehydrates from AFP", () => {
  const first = buildWeddingRsvpSetupDraft({
    eventId: "wedding_event:main_wedding",
    eventLabel: "Wedding day",
    responseDeadline: "2027-03-01",
    enabledQuestionIds: [],
    requiredQuestionIds: [],
  }, metadata, 0, "2027-02-01T00:00:00Z").setup!;
  const second = buildWeddingRsvpSetupDraft({
    eventId: "wedding_event:main_wedding",
    eventLabel: "Wedding celebration",
    responseDeadline: "2027-03-08",
    enabledQuestionIds: ["travel_plan"],
    requiredQuestionIds: [],
  }, metadata, 1, "2027-02-02T00:00:00Z").setup!;
  const foreignInput = weddingRsvpSetupToAfpSendInput(first, {
    wedding_plan_id: "wedding_plan:foreign",
    response_workspace_id: "response_workspace:foreign",
  });
  const restored = weddingRsvpSetupFromAfpMessages([
    afpMessage(weddingRsvpSetupToAfpSendInput(first, metadata), first.updatedAt),
    afpMessage(foreignInput, first.updatedAt),
    afpMessage(weddingRsvpSetupToAfpSendInput(second, metadata), second.updatedAt),
  ], metadata.response_workspace_id);
  assert.equal(restored?.revision, 2);
  assert.equal(restored?.eventLabel, "Wedding celebration");
  assert.ok(restored?.questions.some((question) => question.id === "travel_plan" && question.enabled));
});

test("invitation preview groups exact household recipients without leaking private answers", () => {
  const tracking = guestTracking();
  const setup = buildWeddingRsvpSetupDraft({
    eventId: "wedding_event:main_wedding",
    eventLabel: "Wedding day",
    responseDeadline: "2027-03-01",
    enabledQuestionIds: ["dietary_requirements", "accessibility_requirements"],
    requiredQuestionIds: [],
  }, metadata, 0, "2027-02-01T00:00:00Z").setup!;
  assert.deepEqual(weddingRsvpSetupEventOptions(tracking), [{
    id: "wedding_event:main_wedding",
    label: "Wedding day",
    invitationCount: 2,
  }]);
  const previews = buildWeddingRsvpInvitationPreviews(setup, tracking);
  assert.equal(previews.length, 1);
  assert.equal(previews[0]?.householdLabel, "Chen household");
  assert.deepEqual(previews[0]?.recipients.map((recipient) => recipient.displayName), ["Alex Chen", "Sam Chen"]);
  assert.equal(previews[0]?.recipients[0]?.plusOneAllowed, true);
  assert.equal(previews[0]?.recipients[1]?.childrenInvited, true);
  assert.doesNotMatch(JSON.stringify(previews), /example\.test|private allergy|private access|vegetarian/i);
});
