import test from "node:test";
import assert from "node:assert/strict";

import { readActionChipEventDetail } from "../src/lib/actionChipEvent.ts";

test("readActionChipEventDetail accepts only string id and label payloads", () => {
  assert.deepEqual(
    readActionChipEventDetail(new CustomEvent("x", { detail: { id: "delegate", label: "Delegate" } })),
    { id: "delegate", label: "Delegate" },
  );
  assert.equal(
    readActionChipEventDetail(new CustomEvent("x", { detail: { id: 7, label: "Delegate" } })),
    null,
  );
  assert.equal(
    readActionChipEventDetail(new CustomEvent("x", { detail: { id: "delegate", label: 7 } })),
    null,
  );
  assert.equal(
    readActionChipEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readActionChipEventDetail(new Event("x")),
    null,
  );
});
