import assert from "node:assert/strict";
import test from "node:test";

import { parseWeddingFeelTagInput } from "@/lib/weddingVisionFeelTagState";

test("short coordinated feel descriptions become separate clean tags", () => {
  assert.deepEqual(parseWeddingFeelTagInput("vibrantl, lively and plentiful"), ["Vibrant", "Lively", "Plentiful"]);
});

test("planning instructions are not mistaken for feel tags", () => {
  assert.deepEqual(parseWeddingFeelTagInput("we want 25 cm centrepiece in wedding"), []);
});
