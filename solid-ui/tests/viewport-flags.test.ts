import assert from "node:assert/strict";
import test from "node:test";

import {
  isMobileViewport,
  isNanoViewport,
  isWatchViewport,
} from "../src/lib/viewportFlags.ts";

test("viewport flags classify watch, nano, and mobile states consistently", () => {
  assert.equal(isWatchViewport("watch"), true);
  assert.equal(isWatchViewport("phone"), false);

  assert.equal(isNanoViewport("watch"), true);
  assert.equal(isNanoViewport("phone"), true);
  assert.equal(isNanoViewport("tablet"), false);

  assert.equal(isMobileViewport("watch"), true);
  assert.equal(isMobileViewport("phone"), true);
  assert.equal(isMobileViewport("tablet"), true);
  assert.equal(isMobileViewport("desktop"), false);
});
