import test from "node:test";
import assert from "node:assert/strict";

import { retrievalBadgeTone } from "../src/lib/retrievalTone.ts";

test("retrieval badge tone treats object support cues consistently", () => {
  assert.equal(retrievalBadgeTone("fresh object support"), "info");
  assert.equal(retrievalBadgeTone("older object support"), "warning");
  assert.equal(retrievalBadgeTone("fresh thread support"), "info");
  assert.equal(retrievalBadgeTone("older thread support"), "warning");
  assert.equal(retrievalBadgeTone("kind concentrated"), "success");
  assert.equal(retrievalBadgeTone("mixed results"), "warning");
});
