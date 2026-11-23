import assert from "node:assert/strict";
import test from "node:test";

import {
  isPrivateRunnerInstanceBoundary,
  PRIVATE_RUNNER_INSTANCE_BOUNDARY,
  readBoundary,
  readMessageBoundary,
} from "../src/lib/commandBoundaries.ts";

test("readBoundary trims string boundaries and object boundary fields", () => {
  assert.equal(readBoundary(" private_runner_instance_only "), PRIVATE_RUNNER_INSTANCE_BOUNDARY);
  assert.equal(readBoundary({ boundary: " custom_boundary " }), "custom_boundary");
});

test("readBoundary ignores malformed boundary payloads", () => {
  assert.equal(readBoundary({ boundary: "" }), null);
  assert.equal(readBoundary(["private_runner_instance_only"]), null);
  assert.equal(readBoundary({ boundary: 7 }), null);
});

test("readMessageBoundary prefers metadata boundaries over content boundaries", () => {
  assert.equal(
    readMessageBoundary(
      { boundary: "metadata_boundary" },
      { boundary: "content_boundary" },
    ),
    "metadata_boundary",
  );
});

test("isPrivateRunnerInstanceBoundary checks normalized boundary values", () => {
  assert.equal(isPrivateRunnerInstanceBoundary({ boundary: ` ${PRIVATE_RUNNER_INSTANCE_BOUNDARY} ` }), true);
  assert.equal(isPrivateRunnerInstanceBoundary({ boundary: "other" }), false);
});
