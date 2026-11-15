import assert from "node:assert/strict";
import test from "node:test";

import { shouldApplyInitialWeddingPresentation } from "../src/lib/weddingInitialPresentationState.ts";

test("Wedding deep links and saved Wedding lens receive the larger typography before render", () => {
  assert.equal(shouldApplyInitialWeddingPresentation({ operator: false, authSource: "wedding" }), true);
  assert.equal(shouldApplyInitialWeddingPresentation({ operator: false, workspaceLens: "wedding" }), true);
  assert.equal(shouldApplyInitialWeddingPresentation({ operator: false, weddingEntrySource: "wedding_site" }), true);
});

test("operator and general workspaces do not inherit a stale Wedding presentation", () => {
  assert.equal(shouldApplyInitialWeddingPresentation({ operator: true, workspaceLens: "wedding" }), false);
  assert.equal(shouldApplyInitialWeddingPresentation({ operator: false, workspaceLens: "general" }), false);
});
