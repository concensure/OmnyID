import assert from "node:assert/strict";
import test from "node:test";

import { weddingWorkspaceMenuItemsForEmail, weddingWorkspaceMoreItemsForEmail } from "@/lib/weddingWorkspaceDesktopMenuState";

test("setup checks are hidden from couple accounts", () => {
  assert.equal(weddingWorkspaceMoreItemsForEmail("couple@example.test").some((item) => item.id === "advanced"), false);
  assert.equal(weddingWorkspaceMoreItemsForEmail(null).some((item) => item.id === "advanced"), false);
});

test("setup checks remain available to the allowlisted operator", () => {
  assert.equal(weddingWorkspaceMoreItemsForEmail(" CONCENSURE@GMAIL.COM ").some((item) => item.id === "advanced"), true);
});

test("primary navigation exposes the vendor finder while documents stay under More", () => {
  assert.deepEqual(weddingWorkspaceMenuItemsForEmail("couple@example.test").map((item) => item.id), ["home", "people", "plan", "budget", "response_queue"]);
  assert.deepEqual(weddingWorkspaceMoreItemsForEmail("couple@example.test").map((item) => item.id), ["documents"]);
});
