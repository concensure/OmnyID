import assert from "node:assert/strict";
import test from "node:test";

import {
  WEDDING_CATALOGUE_STAGES,
  WEDDING_CATALOGUE_WORKSPACE_TASKS,
  WEDDING_COUNTDOWN_PUBLICATION_READY,
  WEDDING_TASK_CATALOGUE_VERSION,
} from "../src/lib/weddingTaskCatalogueState.ts";
import {
  WEDDING_JOURNEY_STAGES,
  addWeddingResearchTasks,
} from "../src/lib/weddingJourneyStageState.ts";

test("the workspace and future Countdown share one six-stage vocabulary", () => {
  assert.equal(WEDDING_TASK_CATALOGUE_VERSION, "wedding-catalogue.v1");
  assert.deepEqual(WEDDING_JOURNEY_STAGES, WEDDING_CATALOGUE_STAGES);
  assert.deepEqual(WEDDING_CATALOGUE_STAGES.map((stage) => stage.label), [
    "Plan & budget",
    "Venue & date",
    "Celebrant & suppliers",
    "Details & invites",
    "Final prep",
    "Wedding & after",
  ]);
});

test("the reconciled workspace slice is sourced, unique and remains unpublished", () => {
  const ids = WEDDING_CATALOGUE_WORKSPACE_TASKS.map((task) => task.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(WEDDING_CATALOGUE_WORKSPACE_TASKS.every((task) => task.sourceId.length > 0));
  assert.ok(WEDDING_CATALOGUE_WORKSPACE_TASKS.every((task) => task.whyItMatters.length > 20));
  assert.equal(WEDDING_COUNTDOWN_PUBLICATION_READY, false);
});

test("workspace tasks retain their dates while gaining catalogue provenance", () => {
  const tasks = addWeddingResearchTasks([], "2027-11-20");
  const invitations = tasks.find((task) => task.id === "wedding-research:invitations");
  const masterRunSheet = tasks.find((task) => task.id === "wedding-research:run-sheet-master-signoff");
  assert.equal(invitations?.dueLabel, "2027-07-23");
  assert.equal(invitations?.metadata?.wedding_catalogue_version, WEDDING_TASK_CATALOGUE_VERSION);
  assert.equal(masterRunSheet?.dueLabel, "2027-11-10");
  assert.equal(masterRunSheet?.metadata?.wedding_journey_stage, "final_prep");
});
