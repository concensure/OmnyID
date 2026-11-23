import test from "node:test";
import assert from "node:assert/strict";

import { readComposeQueryFragmentEventDetail } from "../src/lib/composeQueryFragmentEvent.ts";

test("readComposeQueryFragmentEventDetail accepts only string query and boolean submit payloads", () => {
  assert.deepEqual(
    readComposeQueryFragmentEventDetail(new CustomEvent("x", {
      detail: { query: "find budget threads", submit: true },
    })),
    { query: "find budget threads", submit: true },
  );
  assert.equal(
    readComposeQueryFragmentEventDetail(new CustomEvent("x", {
      detail: { query: 7, submit: true },
    })),
    null,
  );
  assert.equal(
    readComposeQueryFragmentEventDetail(new CustomEvent("x", {
      detail: { query: "find budget threads", submit: "yes" },
    })),
    null,
  );
  assert.equal(
    readComposeQueryFragmentEventDetail(new CustomEvent("x", { detail: "invalid-detail" })),
    null,
  );
  assert.equal(
    readComposeQueryFragmentEventDetail(new Event("x")),
    null,
  );
});
