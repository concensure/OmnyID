import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingInspirationItem,
  buildWeddingInspirationState,
  buildWeddingInspirationTaskItems,
  weddingInspirationItemsFromAfpMessage,
  weddingInspirationItemsToAfpMessage,
  weddingInspirationItemsToAfpSendInput,
} from "@/lib/weddingInspirationState";
import {
  buildWeddingExperienceModelState,
  evaluateWeddingExperienceDecisionFit,
} from "@/lib/weddingExperienceModelState";

const metadata = {
  weddingPlanId: "wedding_plan:inspiration",
  responseWorkspaceId: "response_workspace:inspiration",
  sourceResponseId: "response:inspiration",
  supertags: ["template:wedding_planning", "event:wedding"],
};

test("buildWeddingInspirationItem turns image filenames and notes into preference signals", () => {
  const item = buildWeddingInspirationItem({
    title: "Reception inspiration",
    fileName: "warm-long-table-candles.png",
    mimeType: "image/png",
    note: "What I like is the warm lighting, not the flowers.",
    uploadedBy: "Sarah",
    createdAt: "2026-09-26T00:00:00.000Z",
  });

  assert.equal(item.kind, "image");
  assert.ok(item.tags.includes("long table"));
  assert.ok(item.tags.includes("warm lighting"));
  assert.ok(item.preferenceSignals.includes("warm intimate lighting"));
  assert.ok(item.ontologyLinks.some((link) => link.type === "inspires" && link.target === "Reception"));
});

test("buildWeddingInspirationState summarizes repeated visual patterns", () => {
  const state = buildWeddingInspirationState([
    buildWeddingInspirationItem({ title: "Reception 1", note: "warm lighting and long table", createdAt: "2026-09-26T00:00:00.000Z" }),
    buildWeddingInspirationItem({ title: "Reception 2", note: "warm candles", createdAt: "2026-09-26T00:01:00.000Z" }),
    buildWeddingInspirationItem({ title: "Reception 3", note: "long-table reception", createdAt: "2026-09-26T00:02:00.000Z" }),
  ]);

  assert.equal(state.items.length, 3);
  assert.ok(state.tagCounts.some((entry) => entry.tag === "warm lighting" && entry.count >= 2));
  assert.match(state.insight?.detail ?? "", /warm lighting/i);
});

test("buildWeddingExperienceModelState turns inspiration into explainable planning traits", () => {
  const state = buildWeddingInspirationState([
    buildWeddingInspirationItem({ title: "Reception 1", note: "warm lighting and long table", createdAt: "2026-09-26T00:00:00.000Z" }),
    buildWeddingInspirationItem({ title: "Reception 2", note: "warm candles and relaxed dinner", createdAt: "2026-09-26T00:01:00.000Z" }),
    buildWeddingInspirationItem({ title: "Flowers", note: "low floral arrangements for conversation", createdAt: "2026-09-26T00:02:00.000Z" }),
  ]);
  const model = buildWeddingExperienceModelState(state);

  assert.ok(model.traits.some((trait) => trait.label === "Warm and intimate"));
  assert.ok(model.traits.some((trait) => trait.label === "Guest conversation matters"));
  assert.ok(model.recommendationConstraints.some((constraint) => /conversation/i.test(constraint.label)));
  assert.match(model.validationPrompt?.question ?? "", /sound like/i);
});

test("evaluateWeddingExperienceDecisionFit flags clear style tradeoffs without inventing meaning", () => {
  const state = buildWeddingInspirationState([
    buildWeddingInspirationItem({ title: "Reception 1", note: "warm lighting and long table", createdAt: "2026-09-26T00:00:00.000Z" }),
    buildWeddingInspirationItem({ title: "Reception 2", note: "warm candles and relaxed dinner", createdAt: "2026-09-26T00:01:00.000Z" }),
    buildWeddingInspirationItem({ title: "Flowers", note: "low floral arrangements for conversation", createdAt: "2026-09-26T00:02:00.000Z" }),
  ]);
  const model = buildWeddingExperienceModelState(state);

  const fit = evaluateWeddingExperienceDecisionFit(model, "Long table dinner with warm candle lighting and low florals.");
  const tradeoff = evaluateWeddingExperienceDecisionFit(model, "Large bright white ballroom with tall florals and loud club-volume music.");
  const empty = evaluateWeddingExperienceDecisionFit(model, "Standard package.");

  assert.ok(fit.fitLabels.some((label) => /warm/i.test(label)));
  assert.ok(fit.fitLabels.some((label) => /conversation/i.test(label)));
  assert.ok(tradeoff.tradeoffLabels.some((label) => /conversation/i.test(label)));
  assert.ok(tradeoff.evidenceLabels.length > 0);
  assert.match(empty.summaryLabel, /No clear/i);
});

test("wedding inspiration AFP message round-trips as private knowledge", () => {
  const item = buildWeddingInspirationItem({
    title: "Venue photograph",
    note: "garden venue with warm lighting",
    createdAt: "2026-09-26T00:00:00.000Z",
  });
  const message = weddingInspirationItemsToAfpMessage({
    items: [item],
    metadata,
    createdAt: "2026-09-26T00:10:00.000Z",
  });
  const parsed = weddingInspirationItemsFromAfpMessage(message);

  assert.equal(message.type, "ledger");
  assert.equal(message.kind, "wedding_inspiration");
  assert.ok(message.supertags?.includes("wedding_inspiration:preference_model"));
  assert.equal(message.metadata?.e2ee_required, true);
  assert.equal(message.metadata?.wedding_experience_model, true);
  assert.ok((message.content.experience_model as Record<string, unknown> | undefined)?.traits);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.title, "Venue photograph");
});

test("wedding inspiration AFP message does not store local data-url previews", () => {
  const item = buildWeddingInspirationItem({
    title: "Reception screenshot",
    mimeType: "image/png",
    previewUrl: "data:image/png;base64,very-large-browser-preview",
    note: "warm lighting and candles",
    createdAt: "2026-09-26T00:00:00.000Z",
  });
  assert.match(item.previewUrl ?? "", /^data:image/);

  const message = weddingInspirationItemsToAfpMessage({
    items: [item],
    metadata,
    createdAt: "2026-09-26T00:10:00.000Z",
  });
  const contentItems = Array.isArray(message.content.items) ? message.content.items : [];
  const stored = contentItems[0] as Record<string, unknown> | undefined;

  assert.equal(stored?.preview_url, null);
  assert.equal((message.content.original_file_status as Record<string, unknown> | undefined)?.unsaved_original_file_count, 1);
  assert.equal(message.metadata?.inspiration_unsaved_original_file_count, 1);
  assert.equal(message.metadata?.inspiration_original_storage_ready, false);
  assert.ok(message.content.markdown);
  assert.equal(JSON.stringify(message.content).includes("very-large-browser-preview"), false);
});

test("buildWeddingInspirationState distinguishes saved knowledge from reopenable originals", () => {
  const unsavedImage = buildWeddingInspirationItem({
    title: "Reception photo",
    mimeType: "image/png",
    previewUrl: "data:image/png;base64,local-preview",
    createdAt: "2026-09-26T00:00:00.000Z",
  });
  const savedPdf = buildWeddingInspirationItem({
    title: "Vendor portfolio",
    kind: "pdf",
    storageRef: "seaweed://wedding/inspiration/vendor-portfolio.pdf",
    createdAt: "2026-09-26T00:01:00.000Z",
  });
  const state = buildWeddingInspirationState([unsavedImage, savedPdf]);

  assert.equal(state.originalFileCount, 2);
  assert.equal(state.savedOriginalFileCount, 1);
  assert.equal(state.unsavedOriginalFileCount, 1);
  assert.match(state.originalFileStatusLabel, /reopen them later/i);
});

test("buildWeddingInspirationItem accepts only durable web source links", () => {
  const dataSource = buildWeddingInspirationItem({
    title: "Browser-only source",
    kind: "url",
    sourceUrl: "data:text/plain;base64,not-a-real-source",
    createdAt: "2026-09-26T00:00:00.000Z",
  });
  const webSource = buildWeddingInspirationItem({
    title: "Venue portfolio",
    kind: "url",
    sourceUrl: "https://example.com/venue-portfolio",
    createdAt: "2026-09-26T00:01:00.000Z",
  });

  assert.equal(dataSource.sourceUrl, null);
  assert.equal(webSource.sourceUrl, "https://example.com/venue-portfolio");
});

test("weddingInspirationItemsToAfpSendInput is ready for projection saving", () => {
  const input = weddingInspirationItemsToAfpSendInput({
    items: [buildWeddingInspirationItem({ title: "Dress inspiration", note: "simple dress", createdAt: "2026-09-26T00:00:00.000Z" })],
    metadata,
  });

  assert.equal(input.store_in_relational, true);
  assert.equal(input.kind, "wedding_inspiration");
});

test("buildWeddingInspirationTaskItems turns repeated inspiration into an actionable decision task", () => {
  const inspiration = buildWeddingInspirationState([
    buildWeddingInspirationItem({ title: "Reception 1", note: "warm lighting and long table", createdAt: "2026-09-26T00:00:00.000Z" }),
    buildWeddingInspirationItem({ title: "Reception 2", note: "warm candles", createdAt: "2026-09-26T00:01:00.000Z" }),
  ]);
  const tasks = buildWeddingInspirationTaskItems({ inspiration, metadata });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.kind, "decision");
  assert.match(tasks[0]?.title ?? "", /inspiration/i);
  assert.equal((tasks[0]?.metadata as Record<string, unknown> | undefined)?.wedding_inspiration_task, true);
  assert.equal((tasks[0]?.metadata as Record<string, unknown> | undefined)?.preferred_action_label, "Open Inspiration");
  assert.equal((tasks[0]?.metadata as Record<string, unknown> | undefined)?.wedding_workspace_menu, "inspiration");
  assert.equal((tasks[0]?.metadata as Record<string, unknown> | undefined)?.a2ui_primary_action, "open_wedding_inspiration");
  assert.ok(((tasks[0]?.metadata as Record<string, unknown> | undefined)?.inspiration_tags as string[] | undefined)?.includes("warm lighting"));
});

test("buildWeddingInspirationTaskItems asks to save original files before vendor use", () => {
  const inspiration = buildWeddingInspirationState([
    buildWeddingInspirationItem({
      title: "Reception screenshot",
      mimeType: "image/png",
      previewUrl: "data:image/png;base64,local-preview",
      createdAt: "2026-09-26T00:00:00.000Z",
    }),
  ]);
  const tasks = buildWeddingInspirationTaskItems({ inspiration, metadata });

  assert.equal(tasks.length, 1);
  assert.equal(tasks[0]?.kind, "document_checklist");
  assert.match(tasks[0]?.title ?? "", /original/i);
  assert.equal((tasks[0]?.metadata as Record<string, unknown> | undefined)?.inspiration_original_file_task, true);
  assert.equal((tasks[0]?.metadata as Record<string, unknown> | undefined)?.unsaved_original_file_count, 1);
  assert.equal((tasks[0]?.metadata as Record<string, unknown> | undefined)?.wedding_workspace_menu, "inspiration");
});

test("buildWeddingInspirationTaskItems does not ask for original storage when storage refs exist", () => {
  const inspiration = buildWeddingInspirationState([
    buildWeddingInspirationItem({
      title: "Saved reception photo",
      kind: "image",
      storageRef: "seaweed://wedding/inspiration/reception.png",
      createdAt: "2026-09-26T00:00:00.000Z",
    }),
  ]);
  const tasks = buildWeddingInspirationTaskItems({ inspiration, metadata });

  assert.equal(tasks.length, 0);
});

test("buildWeddingInspirationTaskItems suppresses duplicate inspiration review tasks", () => {
  const inspiration = buildWeddingInspirationState([
    buildWeddingInspirationItem({ title: "Reception 1", note: "warm lighting and long table", createdAt: "2026-09-26T00:00:00.000Z" }),
    buildWeddingInspirationItem({ title: "Reception 2", note: "warm candles", createdAt: "2026-09-26T00:01:00.000Z" }),
  ]);
  const existing = buildWeddingInspirationTaskItems({ inspiration, metadata });
  const tasks = buildWeddingInspirationTaskItems({
    inspiration,
    metadata,
    existingTaskItems: existing,
  });

  assert.equal(tasks.length, 0);
});
