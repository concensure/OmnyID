import test from "node:test";
import assert from "node:assert/strict";
import { isCurrentAsyncRequest, nextAsyncRequestId } from "../src/lib/asyncRequestState.ts";

test("nextAsyncRequestId increments monotonically", () => {
  assert.equal(nextAsyncRequestId(0), 1);
  assert.equal(nextAsyncRequestId(4), 5);
});

test("isCurrentAsyncRequest only accepts the newest request id", () => {
  assert.equal(isCurrentAsyncRequest(3, 3), true);
  assert.equal(isCurrentAsyncRequest(3, 2), false);
});
