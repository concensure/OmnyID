import test from "node:test";
import assert from "node:assert/strict";

import type { AfpView } from "../src/lib/api.ts";
import { resolveMountedViewRoutingFromInputs, resolveViewRoutingFromInputs } from "../src/lib/viewRoutingState.ts";

function buildView(format: string, content: Record<string, unknown> = {}): AfpView {
  return { format, content, priority: 10 };
}

test("resolveViewRoutingFromInputs normalizes mounted explicit a2ui subviews", () => {
  const routing = resolveViewRoutingFromInputs({
    chosenView: buildView("a2ui_render", { view_id: "inbox_thread_dashboard" }),
    heuristicFormat: "email",
  });

  assert.equal(routing.effectiveFormat, "inbox_thread_dashboard");
  assert.equal(routing.heuristicFormat, "email");
  assert.equal(routing.agentDriven, true);
});

test("resolveViewRoutingFromInputs normalizes generic explicit a2ui views to a2ui.v1", () => {
  const routing = resolveViewRoutingFromInputs({
    chosenView: buildView("a2ui_render"),
    heuristicFormat: "email",
  });

  assert.equal(routing.effectiveFormat, "a2ui.v1");
  assert.equal(routing.agentDriven, true);
});

test("resolveViewRoutingFromInputs uses the normalized heuristic format when no explicit view is chosen", () => {
  const routing = resolveViewRoutingFromInputs({
    chosenView: null,
    heuristicFormat: "a2ui_render",
  });

  assert.equal(routing.effectiveFormat, "a2ui.v1");
  assert.equal(routing.heuristicFormat, "a2ui.v1");
  assert.equal(routing.agentDriven, false);
});

test("resolveMountedViewRoutingFromInputs falls back when the heuristic format is not mounted", () => {
  const routing = resolveMountedViewRoutingFromInputs({
    chosenView: null,
    heuristicFormat: "chart_view",
  });

  assert.equal(routing.heuristicFormat, "chart_view");
  assert.equal(routing.effectiveFormat, "email");
  assert.equal(routing.agentDriven, false);
});

test("resolveMountedViewRoutingFromInputs falls back to a mounted heuristic when an explicit view is unsupported", () => {
  const routing = resolveMountedViewRoutingFromInputs({
    chosenView: buildView("chart_view"),
    heuristicFormat: "shell_result",
  });

  assert.equal(routing.heuristicFormat, "shell_result");
  assert.equal(routing.effectiveFormat, "shell_result");
  assert.equal(routing.agentDriven, false);
});
