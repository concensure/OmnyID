import test from "node:test";
import assert from "node:assert/strict";

import {
  customEventDetail,
  customEventRecordDetail,
  isRecord,
  optionalNullableStringProperty,
  optionalStringArrayProperty,
  optionalStringProperty,
} from "../src/lib/eventDetail.ts";

test("custom event detail helpers distinguish custom events and object records", () => {
  assert.equal(customEventDetail(new Event("x")), null);
  assert.equal(customEventDetail(new CustomEvent("x", { detail: null })), null);
  assert.equal(customEventDetail(new CustomEvent("x", { detail: "value" })), "value");

  assert.deepEqual(customEventRecordDetail(new CustomEvent("x", { detail: { id: "a" } })), { id: "a" });
  assert.equal(customEventRecordDetail(new CustomEvent("x", { detail: ["a"] })), null);
  assert.equal(customEventRecordDetail(new CustomEvent("x", { detail: "a" })), null);
  assert.equal(customEventRecordDetail(new Event("x")), null);
});

test("record and optional string helpers preserve exact runtime contracts", () => {
  assert.equal(isRecord({}), true);
  assert.equal(isRecord([]), false);
  assert.equal(isRecord(null), false);

  assert.equal(optionalStringProperty({ reason: "manual" }, "reason"), "manual");
  assert.equal(optionalStringProperty({}, "reason"), undefined);
  assert.equal(optionalStringProperty({ reason: null }, "reason"), null);
  assert.equal(optionalStringProperty({ reason: 7 }, "reason"), null);

  assert.equal(optionalNullableStringProperty({ id: "msg-1" }, "id"), "msg-1");
  assert.equal(optionalNullableStringProperty({ id: null }, "id"), null);
  assert.equal(optionalNullableStringProperty({}, "id"), undefined);
  assert.equal(optionalNullableStringProperty({ id: 7 }, "id"), false);

  assert.deepEqual(optionalStringArrayProperty({ days: ["Mon", "Wed"] }, "days"), ["Mon", "Wed"]);
  assert.equal(optionalStringArrayProperty({}, "days"), undefined);
  assert.equal(optionalStringArrayProperty({ days: ["Mon", 7] }, "days"), null);
  assert.equal(optionalStringArrayProperty({ days: "Mon" }, "days"), null);
});
