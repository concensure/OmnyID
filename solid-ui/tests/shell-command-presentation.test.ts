import test from "node:test";
import assert from "node:assert/strict";

import {
  shellExitCodeNote,
  shellRequestReason,
} from "../src/lib/shellCommandPresentation.ts";

test("shell request reason falls back when reason text is absent", () => {
  assert.equal(shellRequestReason(undefined), "No reason provided.");
  assert.equal(shellRequestReason(""), "No reason provided.");
  assert.equal(shellRequestReason("   "), "No reason provided.");
  assert.equal(shellRequestReason("Needs review first"), "Needs review first");
});

test("shell exit code note stays bounded to known shell outcomes", () => {
  assert.equal(shellExitCodeNote(127), "command not found");
  assert.equal(shellExitCodeNote(130), "interrupted");
  assert.equal(shellExitCodeNote(0), null);
  assert.equal(shellExitCodeNote(999), null);
});
