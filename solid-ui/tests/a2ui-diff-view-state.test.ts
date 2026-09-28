import test from "node:test";
import assert from "node:assert/strict";

import { resolveA2UIDiffViewState } from "../src/lib/a2uiDiffViewState.ts";

test("resolveA2UIDiffViewState reads canonical before and after props", () => {
  const state = resolveA2UIDiffViewState({
    title: "Policy change",
    before_label: "Previous",
    after_label: "Proposed",
    before: "old text",
    after: "new text",
  });

  assert.equal(state.title, "Policy change");
  assert.equal(state.beforeLabel, "Previous");
  assert.equal(state.afterLabel, "Proposed");
  assert.equal(state.beforeBody, "old text");
  assert.equal(state.afterBody, "new text");
  assert.equal(state.patch, "");
});

test("resolveA2UIDiffViewState falls back across alternate diff keys", () => {
  const state = resolveA2UIDiffViewState({
    heading: "Patch review",
    old_value: "before block",
    new_value: "after block",
    diff: "@@ -1 +1 @@",
  });

  assert.equal(state.title, "Patch review");
  assert.equal(state.beforeBody, "before block");
  assert.equal(state.afterBody, "after block");
  assert.equal(state.patch, "@@ -1 +1 @@");
});

test("resolveA2UIDiffViewState uses defaults when labels are absent", () => {
  const state = resolveA2UIDiffViewState({
    lhs: "left side",
    rhs: "right side",
  });

  assert.equal(state.title, "Change preview");
  assert.equal(state.beforeLabel, "Before");
  assert.equal(state.afterLabel, "After");
  assert.equal(state.beforeBody, "left side");
  assert.equal(state.afterBody, "right side");
});
