import assert from "node:assert/strict";
import test from "node:test";

import { weddingWorkspaceMenuItemsForEmail } from "@/lib/weddingWorkspaceDesktopMenuState";

test("setup checks are hidden from couple accounts", () => {
  assert.equal(weddingWorkspaceMenuItemsForEmail("couple@example.test").some((item) => item.id === "advanced"), false);
  assert.equal(weddingWorkspaceMenuItemsForEmail(null).some((item) => item.id === "advanced"), false);
});

test("setup checks remain available to the allowlisted operator", () => {
  assert.equal(weddingWorkspaceMenuItemsForEmail(" CONCENSURE@GMAIL.COM ").some((item) => item.id === "advanced"), true);
});
