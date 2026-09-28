import test from "node:test";
import assert from "node:assert/strict";

import { anchoredPopoverPosition } from "../src/lib/popoverPosition.ts";

test("anchoredPopoverPosition prefers the trigger's right side when space allows", () => {
  const position = anchoredPopoverPosition({
    anchor: { top: 220, left: 32, right: 76, height: 44 },
    panel: { width: 248, height: 280 },
    viewport: { width: 1440, height: 900 },
  });

  assert.equal(position.side, "right");
  assert.equal(position.left, 88);
  assert.equal(position.top, 102);
});

test("anchoredPopoverPosition flips to the left side when the right edge would overflow", () => {
  const position = anchoredPopoverPosition({
    anchor: { top: 220, left: 1180, right: 1224, height: 44 },
    panel: { width: 248, height: 280 },
    viewport: { width: 1280, height: 900 },
  });

  assert.equal(position.side, "left");
  assert.equal(position.left, 920);
  assert.equal(position.top, 102);
});

test("anchoredPopoverPosition clamps within viewport margins", () => {
  const position = anchoredPopoverPosition({
    anchor: { top: 8, left: 8, right: 52, height: 44 },
    panel: { width: 248, height: 520 },
    viewport: { width: 300, height: 540 },
  });

  assert.equal(position.left, 16);
  assert.equal(position.top, 16);
});
