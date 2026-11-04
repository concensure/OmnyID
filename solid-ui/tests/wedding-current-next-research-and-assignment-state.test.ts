import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { weddingDecisionResearchQueueWindow } from "@/lib/weddingDecisionResearchState";
import {
  consumeWeddingGuestRsvpQuickActionsIntent,
  requestWeddingGuestRsvpQuickActions,
} from "@/lib/weddingGuestQuickActionsIntentState";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("funded research follows a moving current-and-next window", () => {
  assert.deepEqual(weddingDecisionResearchQueueWindow(["current", "next", "later"]), [
    { item: "current", queueRank: 0 },
    { item: "next", queueRank: 1 },
  ]);
  assert.deepEqual(weddingDecisionResearchQueueWindow(["next", "later"]), [
    { item: "next", queueRank: 0 },
    { item: "later", queueRank: 1 },
  ]);
  const server = read("../src/server/wedding_decision_research_routes.rs");
  assert.match(server, /request\.queue_rank > 1/);
  assert.match(server, /Only the current and next decision can be researched/);
});

test("assignment delivery uses the server-side research and registered-agent path", () => {
  const owner = read("src/components/WeddingTaskOwnerControl.tsx");
  const execution = read("src/lib/weddingTaskAssignmentExecutionState.ts");
  const server = read("../src/server/wedding_task_assignment_routes.rs");
  assert.match(owner, /runWeddingTaskAssignment/);
  assert.match(execution, /deliverWeddingTaskAssignment/);
  assert.match(server, /wedding_decision_research_cache/);
  assert.match(server, /wedding-task-research\.md/);
  assert.match(server, /store_recipient_handoff/);
  assert.match(server, /source_workspace_access_granted/);
});

test("seating requests the existing RSVP quick-action destination", () => {
  assert.equal(consumeWeddingGuestRsvpQuickActionsIntent(), false);
  requestWeddingGuestRsvpQuickActions();
  assert.equal(consumeWeddingGuestRsvpQuickActionsIntent(), true);
  assert.equal(consumeWeddingGuestRsvpQuickActionsIntent(), false);
  const seating = read("src/components/WeddingSeatingPanel.tsx");
  const guests = read("src/components/WeddingGuestOperationsCard.tsx");
  assert.match(seating, /requestWeddingGuestRsvpQuickActions\(\)/);
  assert.match(seating, /onSelectMenu\?\.\("guests"\)/);
  assert.match(guests, /id="wedding-guest-rsvp-quick-actions"/);
});

test("journey selection and future stages have distinct progress treatment", () => {
  const journey = read("src/components/WeddingPlanningJourneyStepper.tsx");
  assert.match(journey, /selectedStage\(\).*bg-amber-500/);
  assert.match(journey, /stroke-dasharray="2 2"/);
  assert.match(journey, /stageIndex\(\) > firstOpenIndex\(\)/);
});
