import assert from "node:assert/strict";
import test from "node:test";

import { weddingQuoteScenarioChoiceToAfpSendInput } from "@/lib/weddingQuoteScenarioChoiceState";

test("quote scenario choices stay scoped to the current wedding and preserve source references", () => {
  const message = weddingQuoteScenarioChoiceToAfpSendInput({
    metadata: { weddingPlanId: "plan-couple-1", responseWorkspaceId: "workspace-couple-1" },
    choice: "prefer",
    preferredVendorName: "Venue A",
    quoteArtifactIds: ["quote-a", "quote-b"],
    eventDate: "2027-11-20",
    guestCount: 40,
    durationHours: 6,
    weddingBudget: 40_000,
    tradeoff: "Venue A is lower.",
    recommendation: "Prefer Venue A if staffing is confirmed.",
    missingFact: "Staffing fee",
    nowIso: "2026-11-20T00:00:00.000Z",
  });
  assert.equal(message.thread_id, "wedding_quote_scenario:wedding_plan:plan-couple-1");
  assert.equal(message.metadata?.wedding_plan_id, "wedding_plan:plan-couple-1");
  assert.equal(message.metadata?.response_workspace_id, "response_workspace:workspace-couple-1");
  assert.deepEqual((message.content as { quote_artifact_ids: string[] }).quote_artifact_ids, ["quote-a", "quote-b"]);
  assert.deepEqual(message.references, [
    { type: "wedding_quote_artifact", id: "quote-a" },
    { type: "wedding_quote_artifact", id: "quote-b" },
  ]);
});
