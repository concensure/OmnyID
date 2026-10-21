import test from "node:test";
import assert from "node:assert/strict";

import { friendlyErrorText, visibleErrorText } from "../src/lib/visibleErrorText.ts";

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

test("friendlyErrorText hides protocol wording from users", () => {
  const afp = friendlyErrorText(new Error("Invalid AFP message"));
  assert.doesNotMatch(afp, /afp/i);
  assert.match(afp, /haven't been saved/i);
});

test("friendlyErrorText explains lost connections and keeps readable messages", () => {
  assert.match(friendlyErrorText(new TypeError("Failed to fetch")), /^Connection lost\./);
  assert.equal(friendlyErrorText("too many requests, please try again shortly"), "That was a little too quick. Wait a moment, then try again.");
  assert.equal(friendlyErrorText("Add a vendor category first."), "Add a vendor category first.");
  assert.equal(friendlyErrorText("", "Try again."), "Try again.");
});
