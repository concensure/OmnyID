import assert from "node:assert/strict";
import test from "node:test";

import { classifyViewportWidth } from "../src/lib/viewportClass.ts";

test("classifyViewportWidth uses the expected viewport breakpoints", () => {
  assert.equal(classifyViewportWidth(280), "watch");
  assert.equal(classifyViewportWidth(281), "phone");
  assert.equal(classifyViewportWidth(639), "phone");
  assert.equal(classifyViewportWidth(640), "tablet");
  assert.equal(classifyViewportWidth(1023), "tablet");
  assert.equal(classifyViewportWidth(1024), "desktop");
});
