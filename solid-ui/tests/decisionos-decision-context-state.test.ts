import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionWhyNow,
  primarySourceProvenance,
  relativeShortDuration,
} from "../src/lib/decisionOsDecisionContextState.ts";

test("decision context state prefers deadline for why-now summary", () => {
  const state = decisionWhyNow({
    deadline: "Friday EOD",
    durationScope: "day",
    urgency: "urgent",
  });

  assert.deepEqual(state, {
    badge: "Due Friday EOD",
    detail: "This decision is surfacing because the current deadline is Friday EOD.",
  });
});

test("decision context state falls back through recent context, day scope, and urgent state", () => {
  assert.equal(
    decisionWhyNow({
      contextItems: [{ time: "2h ago" }],
      durationScope: "day",
      urgency: "urgent",
    })?.badge,
    "2h ago",
  );
  assert.equal(decisionWhyNow({ durationScope: "day" })?.badge, "Due today");
  assert.equal(decisionWhyNow({ urgency: "urgent" })?.badge, "Needs review now");
});

test("decision context state resolves primary source provenance from the first source ref", () => {
  const provenance = primarySourceProvenance(
    {
      contextItems: [
        { sourceRefs: ["thread:q3-budget"] },
        { sourceRefs: ["thread:other"] },
      ],
    },
    () => "Thread: Q3 Budget",
  );

  assert.equal(provenance, "Thread: Q3 Budget");
});

test("decision context state formats relative durations compactly", () => {
  assert.equal(relativeShortDuration("2026-06-30T00:00:00.000Z", Date.parse("2026-06-27T00:00:00.000Z")), "3d");
  assert.equal(relativeShortDuration("2026-06-27T04:00:00.000Z", Date.parse("2026-06-27T00:00:00.000Z")), "4h");
  assert.equal(relativeShortDuration("not-a-date"), null);
});
