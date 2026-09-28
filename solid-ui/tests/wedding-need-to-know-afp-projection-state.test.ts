import assert from "node:assert/strict";
import test from "node:test";

import {
  hasSentWeddingNeedToKnowAfpProjection,
  loadWeddingNeedToKnowAfpProjectionIds,
  markWeddingNeedToKnowAfpProjectionSent,
  weddingNeedToKnowContextToAfpMessage,
  weddingNeedToKnowContextToAfpSendInput,
} from "@/lib/weddingNeedToKnowAfpProjectionState";
import {
  hasSentWeddingIntakeProfileAfpProjection,
  loadWeddingIntakeProfileAfpProjectionIds,
  markWeddingIntakeProfileAfpProjectionSent,
  weddingIntakeProfileProjectionId,
  weddingIntakeProfileToAfpMessage,
  weddingIntakeProfileToAfpSendInput,
} from "@/lib/weddingIntakeProfileAfpProjectionState";
import { buildWeddingTemplateFollowUpState } from "@/lib/weddingTemplateFollowUpState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } as Storage;
}

function projectionContext() {
  return buildWeddingTemplateFollowUpState({
    weddingPlanId: "wedding_plan:harbour",
    responseWorkspaceId: "response_workspace:harbour",
    dateOrSeason: "2027-10-03",
    location: "Sydney NSW",
    guestCount: 80,
    budgetComfort: "Mid-range",
    familyOrStakeholderRoles: "Alex and Sam",
    topPriorities: ["food", "photos"],
    atmosphereDescription: "Relaxed garden dinner, candlelit, not too formal",
    inspirationImageUrls: ["https://example.com/wedding.jpg"],
    noimDownloaded: "no",
    celebrantPath: "need_options",
    vowPreference: "create",
    vowStyle: "warm_personal",
    projectionStorage: memoryStorage(),
  }).contextProjection;
}

test("weddingNeedToKnowContextToAfpMessage creates a searchable AFP context note", () => {
  const context = projectionContext();
  const message = weddingNeedToKnowContextToAfpMessage(context, "2026-09-12T00:00:00.000Z");

  assert.equal(message.type, "context");
  assert.equal(message.kind, "note");
  assert.equal(message.subtype, "wedding_need_to_know");
  assert.equal(message.thread_id, "wedding_context:response_workspace:harbour");
  assert.deepEqual(message.to, ["agent://wedding-planning", "agent://search", "agent://knowledge-graph"]);
  assert.ok(message.supertags.includes("wedding_need_to_know"));
  assert.ok(message.supertags.includes("location:sydney-nsw"));
  assert.equal(message.content.response_workspace_id, "response_workspace:harbour");
  assert.equal(message.content.semantic_object.kind, "wedding_active_loop");
  assert.equal(message.content.semantic_object.stateLabel, "Ready for first recommendations");
  assert.equal(message.content.semantic_object.actions[0].kind, "generate_wedding_recommendations");
  assert.equal(message.metadata?.semantic_kind, "wedding_active_loop");
  assert.ok((message.metadata?.semantic_tags as string[]).includes("wedding_recommendations_ready"));
  assert.equal(message.views[0]?.content.semantic_object.kind, "wedding_active_loop");
  assert.match(message.content.markdown as string, /Guest count: 80/i);
  assert.match(message.content.markdown as string, /Couple: Alex and Sam/i);
  assert.match(message.content.markdown as string, /Atmosphere: Relaxed garden dinner/i);
  assert.ok((message.metadata?.searchable_terms as string[]).includes("Sydney NSW"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("Alex and Sam"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("Relaxed garden dinner, candlelit, not too formal"));
  assert.ok(message.views.some((view) => view.format === "document"));
});

test("weddingNeedToKnowContextToAfpSendInput is relational and dispatch-ready", () => {
  const input = weddingNeedToKnowContextToAfpSendInput(projectionContext(), "2026-09-12T00:00:00.000Z");

  assert.equal(input.type, "context");
  assert.equal(input.kind, "note");
  assert.equal(input.subtype, "wedding_need_to_know");
  assert.equal(input.store_in_relational, true);
  assert.ok(input.supertags?.includes("wedding_need_to_know"));
  assert.ok(input.supertags?.includes("location:sydney-nsw"));
  assert.equal((input.content as Record<string, unknown>).kind, "wedding_need_to_know");
});

test("weddingIntakeProfileToAfpMessage creates queryable structured intake fields", () => {
  const context = projectionContext();
  const message = weddingIntakeProfileToAfpMessage(context, "2026-09-12T00:00:00.000Z");

  assert.equal(message.type, "context");
  assert.equal(message.kind, "note");
  assert.equal(message.subtype, "wedding_intake_profile");
  assert.equal(message.thread_id, "wedding_context:response_workspace:harbour");
  assert.equal(message.content.kind, "wedding_intake_profile");
  assert.equal(message.content.profile_id, weddingIntakeProfileProjectionId(context));
  assert.equal(message.content.guest_count, 80);
  assert.equal(message.content.budget_comfort, "Mid-range");
  assert.equal(message.content.noim_downloaded, "no");
  assert.equal(message.content.celebrant_path, "need_options");
  assert.equal(message.content.vow_preference, "create");
  assert.equal(message.content.vow_style, "warm_personal");
  assert.equal(message.content.atmosphere_description, "Relaxed garden dinner, candlelit, not too formal");
  assert.deepEqual(message.content.inspiration_image_urls, ["https://example.com/wedding.jpg"]);
  assert.deepEqual(message.content.top_priorities, ["food", "photos"]);
  assert.ok((message.metadata?.searchable_terms as string[]).includes("Relaxed garden dinner, candlelit, not too formal"));
  assert.ok(message.supertags.includes("wedding_intake_profile"));
  assert.ok(message.views.some((view) => view.format === "structured"));
});

test("weddingIntakeProfileToAfpSendInput is relational and dispatch-ready", () => {
  const input = weddingIntakeProfileToAfpSendInput(projectionContext(), "2026-09-12T00:00:00.000Z");

  assert.equal(input.type, "context");
  assert.equal(input.kind, "note");
  assert.equal(input.subtype, "wedding_intake_profile");
  assert.equal(input.store_in_relational, true);
  assert.ok(input.supertags?.includes("wedding_intake_profile"));
  assert.equal((input.content as Record<string, unknown>).kind, "wedding_intake_profile");
});

test("wedding Need-To-Know projection sent markers are isolated", () => {
  const storage = memoryStorage();

  markWeddingNeedToKnowAfpProjectionSent("response_workspace:harbour", storage);
  markWeddingNeedToKnowAfpProjectionSent("response_workspace:harbour", storage);
  markWeddingNeedToKnowAfpProjectionSent("response_workspace:garden", storage);

  assert.deepEqual(loadWeddingNeedToKnowAfpProjectionIds(storage), [
    "response_workspace:garden",
    "response_workspace:harbour",
  ]);
  assert.equal(hasSentWeddingNeedToKnowAfpProjection("response_workspace:harbour", storage), true);
  assert.equal(hasSentWeddingNeedToKnowAfpProjection("response_workspace:missing", storage), false);
});

test("wedding intake profile projection sent markers are isolated", () => {
  const storage = memoryStorage();

  markWeddingIntakeProfileAfpProjectionSent("wedding_intake_profile:response_workspace:harbour", storage);
  markWeddingIntakeProfileAfpProjectionSent("wedding_intake_profile:response_workspace:harbour", storage);
  markWeddingIntakeProfileAfpProjectionSent("wedding_intake_profile:response_workspace:garden", storage);

  assert.deepEqual(loadWeddingIntakeProfileAfpProjectionIds(storage), [
    "wedding_intake_profile:response_workspace:garden",
    "wedding_intake_profile:response_workspace:harbour",
  ]);
  assert.equal(hasSentWeddingIntakeProfileAfpProjection("wedding_intake_profile:response_workspace:harbour", storage), true);
  assert.equal(hasSentWeddingIntakeProfileAfpProjection("wedding_intake_profile:response_workspace:missing", storage), false);
});
