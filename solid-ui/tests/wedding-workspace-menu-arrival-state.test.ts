import assert from "node:assert/strict";
import test from "node:test";

import { weddingWorkspaceMenuForArrival } from "../src/lib/weddingWorkspaceMenuArrivalState.ts";
import type { WeddingNavigationIntent } from "../src/lib/weddingNavigationState.ts";

function intent(overrides: Partial<WeddingNavigationIntent> = {}): WeddingNavigationIntent {
  return {
    view: "response_queue",
    surface: "planning_files",
    weddingPlanId: "wedding_plan:arrival",
    responseWorkspaceId: "response_workspace:arrival",
    sourceResponseId: "response:arrival",
    artifactId: null,
    sectionId: null,
    notice: "Opening wedding documents.",
    metadata: {
      template: "wedding_planning",
      wedding_plan_id: "wedding_plan:arrival",
      response_workspace_id: "response_workspace:arrival",
      surface: "planning_files",
    },
    ...overrides,
  };
}

test("weddingWorkspaceMenuForArrival opens Documents for document arrivals", () => {
  assert.equal(weddingWorkspaceMenuForArrival(intent()), "documents");
});

test("weddingWorkspaceMenuForArrival keeps intake launches on the current home flow", () => {
  assert.equal(weddingWorkspaceMenuForArrival(intent({ sourceResponseId: null })), null);
});

test("weddingWorkspaceMenuForArrival opens Budget for budget arrivals", () => {
  assert.equal(weddingWorkspaceMenuForArrival(intent({ surface: "budget" })), "budget");
});

test("weddingWorkspaceMenuForArrival validates workspace menu metadata", () => {
  assert.equal(weddingWorkspaceMenuForArrival(intent({
    surface: "workspace_menu",
    metadata: { wedding_workspace_menu: "helpers" },
  })), "helpers");
  assert.equal(weddingWorkspaceMenuForArrival(intent({
    surface: "workspace_menu",
    metadata: { wedding_workspace_menu: "not-real" },
  })), null);
});
