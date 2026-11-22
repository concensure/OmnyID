import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingTemplateLaunchState } from "@/lib/weddingTemplateLaunchState";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("buildWeddingTemplateLaunchState creates a real starter workspace for template launch", () => {
  const state = buildWeddingTemplateLaunchState({
    weddingPlanId: "wedding_plan:harbour",
    responseWorkspaceId: "response_workspace:harbour-first-response",
    projectionStorage: memoryStorage(),
  });

  assert.equal(state.metadata.weddingPlanId, "wedding_plan:harbour");
  assert.equal(state.metadata.responseWorkspaceId, "response_workspace:harbour-first-response");
  assert.ok(state.metadata.supertags.includes("template_launch:wedding_planning"));
  assert.equal(state.workspaceView.workspace.totalArtifacts, 1);
  assert.equal(state.workspaceView.workspace.results[0]?.title, "Wedding planning starter brief");
  assert.equal(state.workspaceView.workspace.emptyTitle, null);
  assert.equal(state.workspaceView.projectionQueue?.primaryAction.kind, "save_pending_outputs");
  assert.equal(state.presentation.heroLabel, "Private wedding operations room");
  assert.equal(state.richResponse.renderer, "wedding_travel_style_response");
  assert.equal(state.richResponse.workspaceId, "response_workspace:harbour-first-response");
  assert.equal(state.richResponse.primaryAction.kind, "open_planning_files");
  assert.equal(state.presentation.probing.nextQuestion?.slot, "wedding_format");
  assert.match(state.nextQuestionLabel, /kind of wedding/i);
});

test("buildWeddingTemplateLaunchState carries starter prompts without demo claims", () => {
  const state = buildWeddingTemplateLaunchState({ projectionStorage: memoryStorage() });

  assert.ok(state.starterCards.some((card) => card.id === "wedding_starter:venue_search" && card.recommended));
  assert.ok(state.starterCards.some((card) => card.intent === "venue_search"));
  assert.ok(state.starterCards.some((card) => /run sheet/i.test(card.label)));
  assert.equal(state.artifactGeneration.artifacts.length, 1);
  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /No live vendor availability/i);
  assert.match(state.artifactGeneration.artifacts[0]?.markdown ?? "", /Ask for wedding date/i);
  assert.deepEqual(state.launchLabels, []);
  assert.doesNotMatch(state.firstResponsePrompt, /sample vendor availability/i);
  assert.match(state.firstResponsePrompt, /one simple question/i);
});
