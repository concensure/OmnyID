import test from "node:test";
import assert from "node:assert/strict";

import { safeHref } from "../src/lib/api.ts";

test("safeHref allows https urls and relative paths", () => {
  assert.equal(safeHref("https://example.com/path"), "https://example.com/path");
  assert.equal(safeHref("/workspace/messages"), "/workspace/messages");
  assert.equal(safeHref("./notes/today"), "./notes/today");
});

test("safeHref blocks protocol-relative and unsafe urls", () => {
  assert.equal(safeHref("//malicious.example"), "#");
  assert.equal(safeHref("javascript:alert(1)"), "#");
  assert.equal(safeHref("data:text/html,boom"), "#");
});
