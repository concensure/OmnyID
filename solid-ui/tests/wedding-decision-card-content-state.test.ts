import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingDecisionCardContent, formatWeddingDecisionDate } from "../src/lib/weddingDecisionCardContentState.ts";
import type { FocusDeckItem } from "../src/lib/mobileFocusHomeState.ts";

const transport: FocusDeckItem = {
  id: "task:transport",
  kind: "decision",
  sourceSurface: "tasks",
  title: "Book limousine or wedding transport and pickup schedule",
  recommendedActionLabel: "The saved evidence identifies ranked by hard constraints first, then fit",
  whyNowLabel: "This planning check is backed by the wedding plan and ready to review.",
  dueAt: "2028-09-18T00:00:00Z",
  evidenceLabels: ["Transport budget A$2,000", "Prepared wedding research brief"],
  deferCount: 0,
  returnedFromLater: false,
  external: false,
};

test("transport card asks for the requirement before suggesting a booking", () => {
  const content = buildWeddingDecisionCardContent(transport);
  assert.equal(content.title, "How should your wedding party travel?");
  assert.equal(content.primaryActionLabel, "Confirm who needs transport");
  assert.match(content.support.oneThingToConfirm ?? "", /Who needs a lift/);
  assert.doesNotMatch(JSON.stringify(content), /saved evidence|hard constraints|ready to review/i);
  assert.equal(content.timeSensitivity?.label, "Task due 18 September 2028");
});

test("decision dates are presented for people rather than as raw ISO values", () => {
  assert.equal(formatWeddingDecisionDate("2028-09-18"), "18 September 2028");
  assert.equal(formatWeddingDecisionDate("not-a-date"), null);
});
