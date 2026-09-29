import test from "node:test";
import assert from "node:assert/strict";

import { apiUrlForPath, safeHref } from "../src/lib/api.ts";

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

test("apiUrlForPath resolves API asset paths against the configured API base", () => {
  assert.equal(
    apiUrlForPath("/wedding/vendor-photo/google?name=places%2Fabc%2Fphotos%2Fxyz", "https://api.omnyid.com/"),
    "https://api.omnyid.com/wedding/vendor-photo/google?name=places%2Fabc%2Fphotos%2Fxyz",
  );
  assert.equal(apiUrlForPath("/wedding/vendor-photo/google?name=x", ""), "/wedding/vendor-photo/google?name=x");
  assert.equal(apiUrlForPath("//evil.example/path", "https://api.omnyid.com"), "");
  assert.equal(apiUrlForPath("javascript:alert(1)", "https://api.omnyid.com"), "");
});
