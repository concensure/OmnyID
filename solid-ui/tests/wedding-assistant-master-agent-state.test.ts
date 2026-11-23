import assert from "node:assert/strict";
import test from "node:test";

import { weddingAssistantToUiCommandResponse } from "@/lib/weddingAssistantMasterAgentState";

test("Wedding Master Agent exposes only bounded workspace and first-party guide links", () => {
  const result = weddingAssistantToUiCommandResponse({
    answer: "Open Budget and review the draft amount.",
    suggestedAction: { kind: "stage_update", target: "budget", label: "Open Budget", draftFields: { budgetTargetAud: 35_000 } },
    links: [{ title: "Budget guide", url: "/wedding/blog/budgeting-without-losing-the-joy.html" }],
    model: "test",
  });
  assert.equal(result.links[0]?.kind, "wedding_workspace");
  assert.match(result.links[0]?.url ?? "", /weddingMenu=budget/);
  assert.equal(result.links[1]?.url, "/wedding/blog/budgeting-without-losing-the-joy.html");
  assert.equal(result.boundary?.persisted, false);
});
