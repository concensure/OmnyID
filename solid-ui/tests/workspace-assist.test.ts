import test from "node:test";
import assert from "node:assert/strict";

import {
  WORKSPACE_ASSIST_NAVIGATION_VIEWS,
  isWorkspaceAssistNavigationView,
  workspaceAssistNavigationView,
} from "../src/lib/workspaceAssist.ts";

test("workspaceAssistNavigationView accepts only workspace-assist destinations", () => {
  assert.deepEqual(
    WORKSPACE_ASSIST_NAVIGATION_VIEWS,
    ["home", "search", "response_queue", "decision_queue", "files"],
  );
  assert.equal(workspaceAssistNavigationView(" home "), "home");
  assert.equal(workspaceAssistNavigationView("search"), "search");
  assert.equal(workspaceAssistNavigationView("response_queue"), "response_queue");
  assert.equal(workspaceAssistNavigationView("decision_queue"), "decision_queue");
  assert.equal(workspaceAssistNavigationView("files"), "files");
  assert.equal(workspaceAssistNavigationView("threads"), null);
  assert.equal(workspaceAssistNavigationView("agent_settings"), null);
  assert.equal(workspaceAssistNavigationView("HOME"), null);
  assert.equal(workspaceAssistNavigationView(""), null);
  assert.equal(workspaceAssistNavigationView(null), null);
});

test("isWorkspaceAssistNavigationView narrows exact workspace-assist destinations", () => {
  assert.equal(isWorkspaceAssistNavigationView("home"), true);
  assert.equal(isWorkspaceAssistNavigationView("search"), true);
  assert.equal(isWorkspaceAssistNavigationView("response_queue"), true);
  assert.equal(isWorkspaceAssistNavigationView("decision_queue"), true);
  assert.equal(isWorkspaceAssistNavigationView("files"), true);
  assert.equal(isWorkspaceAssistNavigationView(" home "), false);
  assert.equal(isWorkspaceAssistNavigationView("threads"), false);
  assert.equal(isWorkspaceAssistNavigationView(null), false);
});
