import test from "node:test";
import assert from "node:assert/strict";

import { workflowNodeDataSelector } from "../src/lib/workflowDomState.ts";

test("workflowNodeDataSelector uses CSS.escape when available", () => {
  const previousCss = globalThis.CSS;
  Object.assign(globalThis, {
    CSS: { escape: (value: string) => `escaped-${value}` },
  });
  try {
    assert.equal(workflowNodeDataSelector("node 1"), '[data-magic-id="escaped-node 1"]');
  } finally {
    Object.assign(globalThis, { CSS: previousCss });
  }
});

test("workflowNodeDataSelector escapes quoted attribute fallback safely", () => {
  const previousCss = globalThis.CSS;
  Object.assign(globalThis, { CSS: undefined });
  try {
    assert.equal(
      workflowNodeDataSelector("node\"\\\n"),
      '[data-magic-id="node\\"\\\\\\a "]',
    );
  } finally {
    Object.assign(globalThis, { CSS: previousCss });
  }
});
