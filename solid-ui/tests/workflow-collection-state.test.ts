import test from "node:test";
import assert from "node:assert/strict";

import type { SavedWorkflow } from "../src/lib/api.ts";
import {
  patchWorkflowInCollection,
  prependUniqueWorkflow,
  prependWorkflow,
  replaceWorkflow,
  upsertWorkflow,
} from "../src/lib/workflowCollectionState.ts";

function workflow(id: string, title = id): SavedWorkflow {
  return {
    workflow_id: id,
    owner_user_id: "user-1",
    title,
    favorite: false,
    preset_kinds: [],
    graph: {},
    created_at: "2026-07-18T00:00:00.000Z",
    updated_at: "2026-07-18T00:00:00.000Z",
  };
}

test("workflow collection helpers prepend with and without uniqueness", () => {
  const first = workflow("wf-1", "Old");
  const updated = workflow("wf-1", "Updated");
  const second = workflow("wf-2");

  assert.deepEqual(prependWorkflow([first], updated).map((entry) => entry.title), ["Updated", "Old"]);
  assert.deepEqual(prependUniqueWorkflow([first, second], updated), [updated, second]);
  assert.deepEqual(prependUniqueWorkflow(null, updated), [updated]);
});

test("workflow collection helpers upsert and replace by workflow id", () => {
  const first = workflow("wf-1", "Old");
  const updated = workflow("wf-1", "Updated");
  const second = workflow("wf-2");

  assert.deepEqual(upsertWorkflow([first, second], updated), [updated, second]);
  assert.deepEqual(upsertWorkflow([second], updated), [updated, second]);
  assert.deepEqual(replaceWorkflow([first, second], updated), [updated, second]);
  assert.deepEqual(replaceWorkflow([second], updated), [second]);
});

test("workflow collection helper patches matching workflow records", () => {
  const first = workflow("wf-1", "Old");
  const second = workflow("wf-2");

  assert.deepEqual(
    patchWorkflowInCollection([first, second], "wf-1", {
      title: "Patched",
      favorite: true,
    }),
    [{ ...first, title: "Patched", favorite: true }, second],
  );
  assert.deepEqual(patchWorkflowInCollection(undefined, "wf-1", { title: "Patched" }), []);
});
