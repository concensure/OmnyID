import test from "node:test";
import assert from "node:assert/strict";

import {
  decisionOsConfidenceCloseLabel,
  decisionOsConfidenceExplanationAriaLabel,
  decisionOsConfidenceExplanationTitle,
  decisionOsConfidenceFlagReasoningLabel,
  shouldCloseDecisionOsConfidencePopoverForKey,
  shouldKeepDecisionOsConfidencePopoverOpen,
} from "../src/lib/decisionOsConfidencePopoverState.ts";

test("decisionos confidence popover state keeps the popover open for in-container targets", () => {
  const container = {
    contains(target: Node) {
      return target === inside;
    },
  } as Node;
  const inside = {} as Node;
  const outside = {} as Node;

  assert.equal(
    shouldKeepDecisionOsConfidencePopoverOpen({
      target: inside,
      container,
    }),
    true,
  );

  assert.equal(
    shouldKeepDecisionOsConfidencePopoverOpen({
      target: outside,
      container,
    }),
    false,
  );
});

test("decisionos confidence popover state closes only on escape", () => {
  assert.equal(shouldCloseDecisionOsConfidencePopoverForKey("Escape"), true);
  assert.equal(shouldCloseDecisionOsConfidencePopoverForKey("Enter"), false);
});

test("decisionos confidence popover state exposes shared copy", () => {
  assert.equal(decisionOsConfidenceExplanationAriaLabel(), "Confidence explanation");
  assert.equal(decisionOsConfidenceExplanationTitle(), "Why this confidence score");
  assert.equal(decisionOsConfidenceFlagReasoningLabel(), "Flag this reasoning");
  assert.equal(decisionOsConfidenceCloseLabel(), "Close");
});
