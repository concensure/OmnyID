import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingTemplateDemoState,
  buildWeddingTemplateEntryState,
} from "../src/lib/weddingTemplateEntryState.ts";

test("buildWeddingTemplateEntryState creates a stable AFP-native template entry", () => {
  const state = buildWeddingTemplateEntryState({
    seed: "Harbour Wedding 2027",
    sourceResponseId: "afp:response-1",
  });

  assert.equal(state.templateId, "wedding_planning");
  assert.equal(state.label, "Wedding Planning");
  assert.equal(state.canStartUnder60Seconds, true);
  assert.equal(state.metadata.weddingPlanId, "wedding_plan:harbour-wedding-2027");
  assert.equal(state.metadata.responseWorkspaceId, "response_workspace:harbour-wedding-2027-first-response");
  assert.equal(state.metadata.sourceResponseId, "afp:response-1");
  assert.ok(state.metadata.supertags.includes("template:wedding_planning"));
  assert.match(state.firstResponseInstruction, /one simple question/i);
  assert.match(state.firstResponseInstruction, /approval-gated/i);
});

test("buildWeddingTemplateEntryState exposes starter prompts for the planned template surface", () => {
  const state = buildWeddingTemplateEntryState();
  const intents = state.starterPrompts.map((prompt) => prompt.intent);

  assert.deepEqual(intents, [
    "venue_search",
    "budget_plan",
    "guest_list",
    "vendor_emails",
    "run_sheet",
    "registry",
  ]);
  assert.equal(state.starterPrompts.filter((prompt) => prompt.recommended).length, 1);
  assert.match(state.starterPrompts[0]?.prompt ?? "", /date, guest count, budget comfort/i);
});

test("buildWeddingTemplateDemoState clearly marks synthetic data and avoids live claims", () => {
  const demo = buildWeddingTemplateDemoState();

  assert.ok(demo.demoLabels.includes("Sample data"));
  assert.ok(demo.demoLabels.includes("No live availability"));
  assert.ok(demo.entry.metadata.supertags.includes("demo:wedding_planning"));
  assert.ok(demo.artifactGeneration.caveatLabels.some((label) => /live verification/i.test(label)));
  assert.ok(demo.artifactGeneration.artifacts.some((artifact) => /Sample demo data/i.test(artifact.markdown)));
  assert.ok(demo.presentation.sections.some((section) => section.id === "recommendations"));
  assert.equal(demo.richResponse.renderer, "wedding_travel_style_response");
  assert.ok(demo.richResponse.sections.some((section) => section.id === "recommendations"));
  assert.equal(demo.workspaceView.headerTitle, "Wedding documents");
});

test("buildWeddingTemplateDemoState includes realistic artifacts, graph nodes, tasks, and schedule items", () => {
  const demo = buildWeddingTemplateDemoState();
  const kinds = new Set(demo.workspaceView.workspace.results.map((artifact) => artifact.kind));

  assert.ok(kinds.has("research"));
  assert.ok(kinds.has("vendor_table"));
  assert.ok(kinds.has("budget_sheet"));
  assert.ok(kinds.has("email_draft"));
  assert.ok(kinds.has("registry"));
  assert.ok(kinds.has("legal"));
  assert.equal(demo.scheduleItems.length, 2);
  assert.equal(demo.taskItems.length, 3);
  assert.ok(demo.knowledgeGraph.nodes.some((node) => node.kind === "vendor" && node.label === "Harbour House"));
  assert.ok(demo.knowledgeGraph.nodes.some((node) => node.kind === "artifact" && /Australian legal setup/i.test(node.label)));
  assert.ok(demo.knowledgeGraph.riskNodes.some((node) => /not verified/i.test(node.label)));
});

test("buildWeddingTemplateDemoState keeps sample email drafts approval gated", () => {
  const demo = buildWeddingTemplateDemoState();
  const emailPreview = demo.workspaceView.activePreview?.kind === "email_draft"
    ? demo.workspaceView.activePreview
    : demo.workspaceView.workspace.results.find((artifact) => artifact.kind === "email_draft");
  const emailArtifact = demo.workspaceView.workspace.results.find((artifact) => artifact.kind === "email_draft");

  assert.equal(emailArtifact?.approvalState, "pending_user_approval");
  assert.ok(demo.workspaceView.workspace.results.some((artifact) => artifact.kind === "email_draft"));
  assert.equal(typeof emailPreview, "object");
});

test("buildWeddingTemplateDemoState surfaces Australian legal setup in workspace and projection queue", () => {
  const demo = buildWeddingTemplateDemoState();
  const legal = demo.workspaceView.workspace.results.find((artifact) => artifact.kind === "legal");

  assert.ok(legal);
  assert.equal(demo.legalSetup.artifact.summary.id, legal.id);
  assert.match(demo.legalSetup.artifact.markdown, /NOIM form status/i);
  assert.ok(demo.presentation.sections.find((section) => section.id === "legal")?.cards.some((card) => /Australian legal setup/i.test(card.title)));
  assert.ok(demo.workspaceView.projectionQueue);
  assert.ok(demo.workspaceView.projectionQueue?.groups.some((group) => group.kind === "calendar_event" && group.items.some((item) => /NOIM/i.test(item.title))));
  assert.ok(demo.workspaceView.projectionQueue?.groups.some((group) => group.kind === "task" && group.items.some((item) => /Notice of Intended Marriage/i.test(item.title))));
});
