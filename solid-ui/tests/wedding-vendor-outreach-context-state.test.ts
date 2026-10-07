import assert from "node:assert/strict";
import test from "node:test";

import { weddingVendorOutreachCoupleFromWorkspace } from "@/lib/useWeddingVendorOutreachOwner";

test("outreach drafts use date and budget already persisted in the wedding workspace", () => {
  const couple = weddingVendorOutreachCoupleFromWorkspace({
    contextCards: [{
      planningContext: {
        dateOrSeason: "12 October 2027",
        budgetComfort: "$35,000 to $45,000",
        location: "Sydney",
      },
    }],
  });

  assert.equal(couple.date_or_season, "12 October 2027");
  assert.equal(couple.budget_comfort, "$35,000 to $45,000");
  assert.equal(couple.location, "Sydney");
});

test("a durable intake profile supplements workspace context without erasing it", () => {
  const couple = weddingVendorOutreachCoupleFromWorkspace({
    contextCards: [{ planningContext: { dateOrSeason: "12 October 2027" } }],
    persistedIntake: { budget_comfort: "$35,000", top_priorities: ["garden ceremony"] },
  });

  assert.equal(couple.date_or_season, "12 October 2027");
  assert.equal(couple.budget_comfort, "$35,000");
  assert.deepEqual(couple.top_priorities, ["garden ceremony"]);
});

test("outreach falls back to the wedding date and budget tracker when intake messages are absent", () => {
  const couple = weddingVendorOutreachCoupleFromWorkspace({
    contextCards: [],
    weddingDateOrSeason: "12 October 2027",
    budgetTargetAmount: 45000,
  });

  assert.equal(couple.date_or_season, "12 October 2027");
  assert.equal(couple.budget_comfort, "AUD 45,000 total budget");
});
