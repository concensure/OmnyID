import assert from "node:assert/strict";
import test from "node:test";

import {
  isWorkspaceModuleLoadFailure,
  workspaceFailureReference,
} from "@/lib/workspaceModuleRecoveryState";

test("recognises stale browser module failures that require a shell reload", () => {
  assert.equal(isWorkspaceModuleLoadFailure(new TypeError("Failed to fetch dynamically imported module: https://omnyid.com/workspace/assets/ResponseQueueView-old.js")), true);
  assert.equal(isWorkspaceModuleLoadFailure(new Error("Importing a module script failed.")), true);
  assert.equal(isWorkspaceModuleLoadFailure(new Error("ChunkLoadError: Loading chunk 92 failed")), true);
  assert.equal(isWorkspaceModuleLoadFailure(new Error("Cannot read properties of undefined")), false);
});

test("failure references are stable without exposing account data", () => {
  const first = workspaceFailureReference(new Error("Importing a module script failed."), "wedding-planner");
  const second = workspaceFailureReference(new Error("Importing a module script failed."), "wedding-planner");
  assert.equal(first, second);
  assert.match(first, /^WED-[0-9A-F]{8}$/);
});
