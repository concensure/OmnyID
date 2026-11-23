import test from "node:test";
import assert from "node:assert/strict";

import { missingReasonFallbackText } from "../src/lib/reasonFallbackText.ts";

test("missing reason fallback text stays stable across trust surfaces", () => {
  assert.equal(missingReasonFallbackText(), "No reason provided.");
});
