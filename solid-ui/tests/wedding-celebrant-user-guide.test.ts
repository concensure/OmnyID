import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("public guide explains the pending-approval consultation journey and separates both calendars", () => {
  const guide = read("../../wedding/user-guide.html");
  const css = read("../../wedding/assets/css/style.css");
  assert.match(guide, /id="celebrant-consultation"/);
  assert.match(guide, /Choose and confirm a time/);
  assert.match(guide, /pending approval/);
  assert.match(guide, /checks automatically/);
  assert.match(guide, /phone slot never proves wedding-date availability/);
  assert.match(css, /\.consultation-flow/);
});
