import assert from "node:assert/strict";
import test from "node:test";

import { dateTimeLabel, relativeTimeLabel } from "../src/lib/agentSettingsRuntimeFormat.ts";
import {
  runtimeDeploymentFramework,
  runtimeDeploymentGui,
  runtimeDeploymentHostedCard,
  runtimeDeploymentMonitor,
  runtimeDeploymentMonitorCard,
  runtimeDeploymentMonitorFeedback,
  runtimeDeploymentMonitorLines,
  runtimeDeploymentMonitorSource,
  runtimeDeploymentMonitorUpdatedAt,
  runtimeDeploymentStatus,
  runtimeDeploymentStatusPanel,
  runtimeDeploymentStatusViewLabels,
  runtimeDeploymentStatusViews,
  runtimeDeploymentWorkspacePath,
} from "../src/lib/runtimeDeploymentState.ts";

test("runtime deployment selectors provide stable empty fallbacks", () => {
  assert.equal(runtimeDeploymentStatus(null), "unknown");
  assert.equal(runtimeDeploymentFramework(null), null);
  assert.equal(runtimeDeploymentWorkspacePath(null), null);
  assert.equal(runtimeDeploymentGui(null), null);
  assert.equal(runtimeDeploymentMonitor(null), null);
  assert.deepEqual(runtimeDeploymentMonitorLines(null), []);
  assert.equal(runtimeDeploymentMonitorSource(null), "bootstrap");
  assert.equal(runtimeDeploymentMonitorUpdatedAt(null), null);
  assert.equal(runtimeDeploymentMonitorFeedback(null), null);
  assert.equal(runtimeDeploymentStatusPanel(null), null);
  assert.equal(runtimeDeploymentStatusViews(null), null);
  assert.deepEqual(runtimeDeploymentStatusViewLabels(null), []);
  assert.equal(runtimeDeploymentMonitorCard(null), null);
  assert.deepEqual(runtimeDeploymentHostedCard(null), {
    workspacePath: null,
    gui: null,
    monitorCard: null,
    statusPanelLines: [],
    statusViewLabels: [],
  });
});

test("runtime deployment selectors expose dashboard deployment fields consistently", () => {
  const deployment = {
    id: "runtime-1",
    framework: "fastapi",
    status: "healthy",
    workspace_path: "/srv/omnyid",
    gui: "terminal",
    runtime_monitor: {
      status: "green",
      source: "heartbeat",
      lines: ["line-1", "line-2"],
      updated_at: "2026-08-14T09:00:00Z",
    },
    runtime_status_panel: {
      summary: "healthy",
    },
    runtime_status_views: [
      {
        id: "ops",
        format: "rich_text",
        title: "Ops dashboard",
      },
    ],
  };

  assert.equal(runtimeDeploymentStatus(deployment), "healthy");
  assert.equal(runtimeDeploymentFramework(deployment), "fastapi");
  assert.equal(runtimeDeploymentWorkspacePath(deployment), "/srv/omnyid");
  assert.equal(runtimeDeploymentGui(deployment), "terminal");
  assert.equal(runtimeDeploymentMonitor(deployment)?.source, "heartbeat");
  assert.deepEqual(runtimeDeploymentMonitorLines(deployment), ["line-1", "line-2"]);
  assert.equal(runtimeDeploymentMonitorSource(deployment), "heartbeat");
  assert.equal(runtimeDeploymentMonitorUpdatedAt(deployment), "2026-08-14T09:00:00Z");
  assert.equal(
    runtimeDeploymentMonitorFeedback(deployment),
    "Runtime healthy via heartbeat at 2026-08-14T09:00:00Z.",
  );
  assert.deepEqual(runtimeDeploymentMonitorCard(deployment), {
    statusLine: "green | heartbeat",
    updatedLine: `updated ${dateTimeLabel("2026-08-14T09:00:00Z")}`,
    relativeLine: `${relativeTimeLabel("2026-08-14T09:00:00Z")} | 2 monitor lines`,
    lines: ["line-1", "line-2"],
  });
  assert.deepEqual(runtimeDeploymentStatusPanel(deployment), { summary: "healthy" });
  assert.equal(runtimeDeploymentStatusViews(deployment)?.length, 1);
  assert.deepEqual(runtimeDeploymentStatusViewLabels(deployment), ["Ops dashboard"]);
  assert.deepEqual(runtimeDeploymentHostedCard(deployment), {
    workspacePath: "/srv/omnyid",
    gui: "terminal",
    monitorCard: {
      statusLine: "green | heartbeat",
      updatedLine: `updated ${dateTimeLabel("2026-08-14T09:00:00Z")}`,
      relativeLine: `${relativeTimeLabel("2026-08-14T09:00:00Z")} | 2 monitor lines`,
      lines: ["line-1", "line-2"],
    },
    statusPanelLines: ["summary: healthy"],
    statusViewLabels: ["Ops dashboard"],
  });
});

test("runtime deployment selectors fall back to update metadata when deployment is absent", () => {
  const runtimeUpdates = {
    current_version: "1.0.0",
    latest_version: "1.1.0",
    update_available: true,
    runtime_status: "updating",
    framework: "docker",
    entries: [],
  };

  assert.equal(runtimeDeploymentStatus(null, runtimeUpdates), "updating");
  assert.equal(runtimeDeploymentFramework(null, runtimeUpdates), "docker");
});
