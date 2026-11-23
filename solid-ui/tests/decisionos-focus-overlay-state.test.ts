import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsFocusOverlayAiSuggestedLabel,
  decisionOsFocusOverlayCloseAriaLabel,
  decisionOsFocusOverlayConfidenceText,
  decisionOsFocusOverlayHasSourceRefs,
  decisionOsFocusOverlaySectionTitle,
  decisionOsFocusOverlaySourceRefs,
  decisionOsFocusOverlaySummaryChips,
  decisionOsFocusOverlayTitle,
} from "../src/lib/decisionOsFocusOverlayState.ts";

test("focus overlay state dedupes source refs across context items", () => {
  assert.deepEqual(
    decisionOsFocusOverlaySourceRefs([
      { sourceRefs: ["thread:alpha", "thread:beta"] },
      { sourceRefs: ["thread:beta", "thread:gamma"] },
      { sourceRefs: null },
    ]),
    ["thread:alpha", "thread:beta", "thread:gamma"],
  );
});

test("focus overlay state builds compact summary chips", () => {
  assert.deepEqual(
    decisionOsFocusOverlaySummaryChips({
      impactLabel: "!! high",
      confidenceLabel: "82% confidence",
      durationScope: "week",
    }),
    [
      { label: "!! high", tone: "default" },
      { label: "82% confidence", tone: "default" },
      { label: "week", tone: "default" },
    ],
  );
});

test("focus overlay state detects whether source refs are present", () => {
  assert.equal(decisionOsFocusOverlayHasSourceRefs(["thread:alpha"]), true);
  assert.equal(decisionOsFocusOverlayHasSourceRefs([]), false);
});

test("focus overlay state falls back when confidence rationale is missing", () => {
  assert.equal(
    decisionOsFocusOverlayConfidenceText("   "),
    "No detailed confidence rationale was attached to this decision.",
  );
});

test("focus overlay state exposes ai suggested badge label", () => {
  assert.equal(decisionOsFocusOverlayAiSuggestedLabel(), "AI suggested");
});

test("focus overlay state exposes header copy", () => {
  assert.equal(decisionOsFocusOverlayTitle(), "Decision Focus");
  assert.equal(decisionOsFocusOverlayCloseAriaLabel(), "Close focus mode");
});

test("focus overlay state exposes stable section titles", () => {
  assert.equal(decisionOsFocusOverlaySectionTitle("why"), "Why this matters");
  assert.equal(decisionOsFocusOverlaySectionTitle("options"), "Options");
  assert.equal(decisionOsFocusOverlaySectionTitle("confidence"), "Confidence rationale");
  assert.equal(decisionOsFocusOverlaySectionTitle("context"), "Context items");
  assert.equal(decisionOsFocusOverlaySectionTitle("sources"), "Source refs");
});
