import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingSubtasks, weddingSubtaskCreateInput, weddingSubtaskRemoveInput } from "@/lib/weddingSubtaskState";

const parent = { id: "task:venue", title: "Research a venue", kind: "research" as const, priority: "high" as const };

test("venue tasks expose relevant non-automatic suggested subtasks", () => {
  const items = buildWeddingSubtasks(parent, []);
  assert.match(items[0]?.title ?? "", /tablecloths and décor/i);
  assert.equal(items.every((item) => item.autoResearchEligible === false), true);
});

test("Wedding subtask records are parent-linked and removable", () => {
  const create = weddingSubtaskCreateInput({ id: "subtask:one", parent, title: "Check loading access" });
  assert.equal(create?.content.parent_task_id, parent.id);
  assert.equal(create?.content.auto_research_eligible, false);
  const projected = buildWeddingSubtasks(parent, [{
    id: "message:one", type: "task", subtype: "wedding_subtask", content: create!.content,
  } as never]);
  const added = projected.find((item) => item.id === "subtask:one")!;
  const remove = weddingSubtaskRemoveInput(added);
  const after = buildWeddingSubtasks(parent, [
    { id: "message:one", type: "task", subtype: "wedding_subtask", content: create!.content } as never,
    { id: "message:two", type: "task", subtype: "wedding_subtask_removed", content: remove.content } as never,
  ]);
  assert.equal(after.some((item) => item.id === "subtask:one"), false);
});
