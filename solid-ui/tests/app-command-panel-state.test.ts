import test from "node:test";
import assert from "node:assert/strict";

import {
  buildDashboardFocusPanelState,
  buildGenericCommandPanelState,
  buildRunnerEditPanelState,
} from "../src/lib/appCommandPanelState.js";

test("generic command panel state includes summary, checklist, runner draft, and sources", () => {
  const panel = buildGenericCommandPanelState({
    intent: "runner_edit",
    query: "fix runner",
    summary: "Prepared a runner edit draft.",
    bullets: ["Review the patch", "Run a dry-run"],
    runnerDraft: {
      target_file_id: "runner_chat_py",
      requires_confirmation: true,
      content: "print('hello')",
    },
    sourceItems: [
      { title: "Spec", url: "https://example.com/spec", subtitle: "reference" },
    ],
  });

  assert.equal(panel.title, 'Command result for "fix runner"');
  assert.equal(panel.description, "The agent prepared a safe, review-first runner draft.");
  assert.deepEqual(
    panel.nodes.map((node) => node.id),
    ["command-summary", "command-next-steps", "runner-draft-stats", "runner-draft-code", "command-sources"],
  );
});

test("generic command panel state omits optional sections for simple commands", () => {
  const panel = buildGenericCommandPanelState({
    intent: "navigate",
    query: "",
    summary: "Routed into the workspace.",
    bullets: [],
    runnerDraft: null,
    sourceItems: [],
  });

  assert.equal(panel.title, "Command result");
  assert.equal(panel.description, "The agent routed your request into the workspace.");
  assert.deepEqual(
    panel.nodes.map((node) => node.id),
    ["command-summary"],
  );
});

test("runner edit panel state includes workflow guidance and code block", () => {
  const panel = buildRunnerEditPanelState({
    query: "patch runner",
    summary: "Prepared a runner patch.",
    bullets: ["Review the patch"],
    runnerDraft: {
      target_file_id: "runner_chat_py",
      requires_confirmation: true,
      content: "print('hello')",
    },
  });

  assert.equal(panel.title, 'Runner draft for "patch runner"');
  assert.deepEqual(
    panel.nodes.map((node) => node.id),
    ["runner-edit-summary", "runner-edit-stats", "runner-edit-workflow", "runner-edit-code"],
  );
});

test("dashboard focus panel state includes default guidance rows", () => {
  const panel = buildDashboardFocusPanelState({
    query: "",
    summary: "Shifted focus to the dashboard.",
    bullets: [],
  });

  assert.equal(panel.title, "Workspace focus");
  assert.deepEqual(
    panel.nodes.map((node) => node.id),
    ["dashboard-focus-summary", "dashboard-focus-stats", "dashboard-focus-guidance"],
  );
  assert.deepEqual(panel.nodes[2].children[0].props.rows, [
    ["Recent messages", "See the latest agent output and thread activity."],
    ["Agent status", "Check running, idle, and blocked agents at a glance."],
    ["Runtime health", "Inspect runner state, logs, and recent changes."],
  ]);
});
