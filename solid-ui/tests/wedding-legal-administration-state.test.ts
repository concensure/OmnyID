import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingLegalAdministrationState,
  buildWeddingLegalAdministrationTaskItems,
} from "../src/lib/weddingLegalAdministrationState.ts";

test("buildWeddingLegalAdministrationState creates DecisionOS alert options and document checklist", () => {
  const state = buildWeddingLegalAdministrationState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    planningContext: {
      dateOrSeason: "2027-07-01",
      location: "Sydney NSW",
      countryCode: "AU",
    },
  });

  assert.equal(state.deadlineLabel, "NOIM latest-date check: 2027-06-01");
  assert.ok(state.alertOptions.some((option) => /Draft NOIM prep/i.test(option)));
  assert.ok(state.alertOptions.some((option) => /3 verified options/i.test(option)));
  assert.ok(state.alertOptions.some((option) => /2027-04-01/i.test(option)));
  assert.equal(state.celebrantSearchReadiness, "ready_for_search");
  assert.equal(state.noimPrefillStatus, "ready_for_user_review");
  assert.ok(state.documentChecklist.some((task) => /birth/i.test(task.title)));
  assert.ok(state.documentChecklist.some((task) => /divorce decree/i.test(task.title)));
  assert.ok(state.documentChecklist.every((task) => (task.metadata as Record<string, unknown>).legal_administration_task === true));
  assert.match(state.artifact.markdown, /Legal and administrative wedding plan/i);
  assert.match(state.artifact.markdown, /Do not lodge or sign anything automatically/i);
  assert.ok(state.artifact.summary.sourceLinks.some((source) => /notice-intended-marriage/i.test(source.url)));
  assert.ok(state.artifact.summary.sourceLinks.some((source) => /marriage\.ag\.gov\.au/i.test(source.url)));
  assert.equal(state.scheduleItems[0]?.startAt, "2027-04-01T09:00:00.000Z");
});

test("buildWeddingLegalAdministrationState stays jurisdiction-aware outside Australia", () => {
  const state = buildWeddingLegalAdministrationState({
    planningContext: {
      dateOrSeason: "2027-07-01",
      location: "London",
      countryCode: "GB",
    },
  });

  assert.equal(state.celebrantSearchReadiness, "not_applicable");
  assert.equal(state.noimPrefillStatus, "not_applicable");
  assert.match(state.deadlineLabel, /jurisdiction-dependent/i);
  assert.match(state.artifact.markdown, /jurisdiction-dependent/i);
});

test("buildWeddingLegalAdministrationTaskItems recovers legal checklist tasks from saved artifacts", () => {
  const state = buildWeddingLegalAdministrationState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
    planningContext: {
      dateOrSeason: "2027-07-01",
      location: "Sydney NSW",
      countryCode: "AU",
    },
  });
  const tasks = buildWeddingLegalAdministrationTaskItems({
    artifacts: [state.artifact.input],
    metadata: state.artifact.input.metadata,
  });

  assert.ok(tasks.some((task) => /birth/i.test(task.title)));
  assert.ok(tasks.some((task) => /photo ID/i.test(task.title)));
  assert.ok(tasks.every((task) => task.linkedArtifactId === state.artifact.input.id));
  assert.ok(tasks.every((task) => (task.metadata as Record<string, unknown>).legal_administration_task === true));
});

test("buildWeddingLegalAdministrationTaskItems suppresses duplicate saved legal checklist tasks", () => {
  const state = buildWeddingLegalAdministrationState({
    metadata: {
      weddingPlanId: "wedding_plan:harbour",
      responseWorkspaceId: "response_workspace:harbour",
    },
  });
  const tasks = buildWeddingLegalAdministrationTaskItems({
    artifacts: [state.artifact.input],
    metadata: state.artifact.input.metadata,
    existingTaskItems: [{
      id: "saved:proof-of-birth",
      title: "Saved proof of birth check",
      kind: "document_checklist",
      metadata: {
        legal_administration_task: true,
        legal_document_checklist_item: "proof-of-birth",
      },
    }],
  });

  assert.equal(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).legal_document_checklist_item === "proof-of-birth"
  ), false);
  assert.ok(tasks.some((task) =>
    (task.metadata as Record<string, unknown>).legal_document_checklist_item === "photo-id"
  ));
});
