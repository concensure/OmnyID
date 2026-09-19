import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceState } from "../src/lib/weddingResponseWorkspaceState.ts";
import {
  buildWeddingPostWeddingWrapUpState,
  buildWeddingPostWeddingWrapUpTaskItems,
} from "../src/lib/weddingPostWeddingWrapUpState.ts";

const metadata = {
  wedding_plan_id: "wedding_plan:harbour",
  response_workspace_id: "response_workspace:wrap-up",
  source_response_id: "afp:response-post-wedding",
};

test("buildWeddingPostWeddingWrapUpState creates approval-gated thank-you DecisionOS work", () => {
  const state = buildWeddingPostWeddingWrapUpState({
    metadata,
    coupleLabel: "Maya and Ozan",
    weddingDateLabel: "2027-03-14",
    guestNames: ["Aylin", "Ben"],
    vendorNames: ["Harbour Studio"],
    familyNames: ["Mum"],
    knownMemoryLabels: ["Aylin helped with the ceremony flowers"],
    createdAt: 1,
  });

  assert.equal(state.status, "ready");
  assert.match(state.decisionPrompt, /draft thank-you notes/i);
  assert.equal(state.thankYouDrafts.length, 3);
  assert.ok(state.thankYouDrafts.every((draft) => draft.approvalRequired));
  assert.ok(state.thankYouDrafts.some((draft) => draft.audience === "guests" && draft.recipientCount === 2));
  assert.match(state.thankYouDrafts[0]?.sampleLine ?? "", /Aylin helped/i);
  assert.ok(state.taskItems.some((task) => task.kind === "email_draft" && task.priority === "high"));
  assert.ok(state.taskItems.every((task) =>
    (task.metadata as Record<string, unknown>).no_external_send_without_approval === true
  ));
});

test("buildWeddingPostWeddingWrapUpState captures private feedback and keepsake export options", () => {
  const state = buildWeddingPostWeddingWrapUpState({
    metadata,
    vendorNames: ["Caterer Co", "Photo Team"],
    createdAt: 1,
  });

  assert.equal(state.feedbackPrompts.length, 2);
  assert.match(state.feedbackPrompts[0]?.ratingPrompt ?? "", /Rate Caterer Co/i);
  assert.match(state.feedbackPrompts[0]?.notePrompt ?? "", /public review/i);
  assert.deepEqual(
    state.keepsakeExportOptions.map((option) => option.id),
    ["secure_pdf", "digital_scrapbook"],
  );
  assert.ok(state.artifactInput.exportTargets?.includes("browser_pdf"));
  assert.ok(state.artifactInput.exportTargets?.includes("word_doc"));
  assert.ok(state.artifactInput.exportTargets?.includes("bundle_planned"));
  assert.match(state.markdown, /Digital scrapbook/i);
});

test("post-wedding wrap-up artifact is searchable in the existing response workspace", () => {
  const wrapUp = buildWeddingPostWeddingWrapUpState({
    metadata,
    coupleLabel: "Maya and Ozan",
    vendorNames: ["Photo Team"],
    knownMemoryLabels: ["first dance under fairy lights"],
    createdAt: 1,
  });
  const workspace = buildWeddingResponseWorkspaceState({
    metadata,
    artifacts: [wrapUp.artifactInput],
    query: "scrapbook fairy",
  });

  assert.equal(workspace.resultCount, 1);
  assert.equal(workspace.results[0]?.title, "Post-wedding wrap-up log");
  assert.deepEqual(workspace.categories.map((category) => category.label), ["Decisions"]);
  assert.equal(workspace.results[0]?.approvalState, "draft");
  assert.ok(workspace.results[0]?.linkedTaskIds.includes(wrapUp.taskItems[0]?.id ?? ""));
});

test("post-wedding wrap-up does not invent memories when context is missing", () => {
  const state = buildWeddingPostWeddingWrapUpState({
    metadata,
    createdAt: 1,
  });

  assert.equal(state.status, "needs_context");
  assert.match(state.markdown, /No confirmed memories available/i);
  assert.match(state.markdown, /Ask the user before inventing/i);
  assert.ok(state.artifactInput.sourceLabels?.includes("Secure PDF export"));
  assert.ok(state.artifactInput.sourceLabels?.includes("Digital scrapbook export"));
  assert.ok(!state.artifactInput.sourceLabels?.some((label) => /first dance|speech|flowers/i.test(label)));
});

test("buildWeddingPostWeddingWrapUpTaskItems recovers projection tasks from saved wrap-up artifacts", () => {
  const wrapUp = buildWeddingPostWeddingWrapUpState({
    metadata,
    coupleLabel: "Maya and Ozan",
    vendorNames: ["Photo Team"],
    knownMemoryLabels: ["first dance under fairy lights"],
    createdAt: 1,
  });
  const tasks = buildWeddingPostWeddingWrapUpTaskItems({
    artifacts: [wrapUp.artifactInput],
    metadata,
  });

  assert.equal(tasks.length, 3);
  assert.ok(tasks.some((task) => /thank-you/i.test(task.title)));
  assert.ok(tasks.every((task) => task.linkedArtifactId === wrapUp.artifactInput.id));
  assert.ok(tasks.every((task) =>
    (task.metadata as Record<string, unknown>).post_wedding_wrap_up === true
    && (task.metadata as Record<string, unknown>).no_external_send_without_approval === true
  ));
});

test("buildWeddingPostWeddingWrapUpTaskItems suppresses saved post-wedding actions", () => {
  const wrapUp = buildWeddingPostWeddingWrapUpState({ metadata, createdAt: 1 });
  const tasks = buildWeddingPostWeddingWrapUpTaskItems({
    artifacts: [wrapUp.artifactInput],
    existingTaskItems: [{
      id: "task:thanks",
      title: "Draft thanks",
      kind: "email_draft",
      metadata: { post_wedding_action_id: "draft-thank-you-notes" },
    }],
  });

  assert.equal(tasks.some((task) => /thank-you/i.test(task.title)), false);
  assert.equal(tasks.length, 2);
});
