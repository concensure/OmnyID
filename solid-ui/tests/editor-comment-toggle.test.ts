import assert from "node:assert/strict";
import test from "node:test";

import { toggleSelectedHtmlComment } from "../src/lib/editorCommentToggle.ts";

test("toggleSelectedHtmlComment wraps plain selected text in an HTML comment", () => {
  assert.equal(
    toggleSelectedHtmlComment("ship the prototype today"),
    "<!-- ship the prototype today -->",
  );
});

test("toggleSelectedHtmlComment unwraps an existing HTML comment selection", () => {
  assert.equal(
    toggleSelectedHtmlComment("<!-- ship the prototype today -->"),
    "ship the prototype today",
  );
});

test("toggleSelectedHtmlComment preserves multiline comment bodies", () => {
  assert.equal(
    toggleSelectedHtmlComment("<!-- first line\nsecond line -->"),
    "first line\nsecond line",
  );
});
