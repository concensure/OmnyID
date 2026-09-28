import test from "node:test";
import assert from "node:assert/strict";

import { visibleErrorText } from "../src/lib/visibleErrorText.ts";

test("visibleErrorText turns HTML error pages into plain user-facing text", () => {
  assert.equal(
    visibleErrorText("<!doctype html><html><head><title>Unauthorized</title></head><body><h1>401</h1></body></html>"),
    "Unauthorized",
  );
});

test("visibleErrorText strips inline HTML from plain error payloads", () => {
  assert.equal(
    visibleErrorText("<p>Invalid email or password.</p>"),
    "Invalid email or password.",
  );
});

test("visibleErrorText falls back for empty values", () => {
  assert.equal(visibleErrorText("", "Authentication failed."), "Authentication failed.");
});
