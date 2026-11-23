import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";
import {
  weddingArtifact as artifact,
  weddingResponseWorkspaceMetadata as metadata,
} from "./wedding-response-workspace-fixtures.ts";

test("wedding responsibility AFP projections update the canonical task owner and completion", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: [],
    taskItems: [{ id: "task:flowers", title: "Confirm flowers", kind: "vendor_coordination", assignee: "You" }],
    afpMessages: [{
      id: "responsibility:flowers",
      thread_id: "wedding_helper_responsibility:flowers",
      from: "system://wedding-planning",
      to: ["agent://tasks"],
      timestamp: "2026-10-25T10:00:00.000Z",
      type: "ledger",
      kind: "wedding_helper_responsibility",
      subtype: "wedding_helper_responsibility_update",
      supertags: ["wedding_helper_responsibility"],
      content: { task_id: "task:flowers", owner_label: "Daniel" },
      metadata: { wedding_task_id: "task:flowers", helper_owner_label: "Daniel" },
      views: [], attachments: [], references: [],
    }, {
      id: "completion:flowers",
      thread_id: "wedding_task_completion:flowers",
      from: "system://wedding-planning",
      to: ["agent://tasks"],
      timestamp: "2026-10-25T10:01:00.000Z",
      type: "task_status",
      kind: "task",
      subtype: "wedding_task_completion",
      supertags: ["wedding_task_completion", "wedding_task_status:done"],
      content: { task_id: "task:flowers", status: "done", completed: true },
      metadata: { wedding_task_id: "task:flowers" },
      views: [], attachments: [], references: [],
    }],
  });

  const task = state.planningTaskItems.find((item) => item.id === "task:flowers");
  assert.equal(task?.assignee, "Daniel");
  assert.ok(task?.semanticTags?.includes("wedding_task_status:done"));
  assert.equal(state.personalOsProjection.decisionLoadRelief.focusItems.some((item) => item.id === "task:task:flowers"), false);
  assert.ok(state.helperContactNames.includes("Daniel"));
});

test("vendor response work is not truncated to three active quote flows", () => {
  const state = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: Array.from({ length: 4 }, (_, index) => artifact({
      title: `Vendor ${index + 1} quote`,
      kind: "vendor_table",
      createdAt: index + 1,
      bodyText: [
        `# Vendor ${index + 1} quote`,
        "",
        `Vendor: Vendor ${index + 1}`,
        `Quote amount: AUD $${1000 + index * 100}`,
        "",
        "## Inclusions",
        "",
        "- Standard package",
      ].join("\n"),
    })),
  });

  assert.equal(state.vendorQuoteReplyFlows.length, 4);
  assert.equal(state.activeVendorQuoteReplyFlows.length, 4);
});
