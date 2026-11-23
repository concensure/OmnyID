import test from "node:test";
import assert from "node:assert/strict";

import type { AfpView } from "../src/lib/api.ts";
import { resolveViewDispatcherRoutingFromInputs } from "../src/lib/viewDispatcherRoutingState.ts";

function buildView(format: string): AfpView {
  return { format, content: {}, priority: 10 };
}

test("resolveViewDispatcherRoutingFromInputs preserves supported explicit formats", () => {
  const routing = resolveViewDispatcherRoutingFromInputs({
    chosenView: buildView("parsed_document"),
    effectiveFormat: "parsed_document",
    heuristicFormat: "email",
    agentDriven: true,
  });

  assert.equal(routing.effectiveFormat, "parsed_document");
  assert.equal(routing.agentDriven, true);
  assert.equal(routing.chosenView?.format, "parsed_document");
});

test("resolveViewDispatcherRoutingFromInputs routes encrypted messages to a placeholder", () => {
  const routing = resolveViewDispatcherRoutingFromInputs({
    chosenView: buildView("table"),
    effectiveFormat: "table",
    heuristicFormat: "email",
    agentDriven: true,
    encrypted: true,
  });

  assert.equal(routing.effectiveFormat, "encrypted_placeholder");
  assert.equal(routing.agentDriven, false);
  assert.equal(routing.chosenView, null);
});

test("resolveViewDispatcherRoutingFromInputs normalizes explicit a2ui aliases onto a2ui.v1", () => {
  const routing = resolveViewDispatcherRoutingFromInputs({
    chosenView: buildView("a2ui_render"),
    effectiveFormat: "a2ui_render",
    heuristicFormat: "email",
    agentDriven: true,
  });

  assert.equal(routing.effectiveFormat, "a2ui.v1");
  assert.equal(routing.agentDriven, true);
  assert.equal(routing.chosenView?.format, "a2ui_render");
});

test("resolveViewDispatcherRoutingFromInputs preserves mounted explicit a2ui subviews", () => {
  const routing = resolveViewDispatcherRoutingFromInputs({
    chosenView: { ...buildView("a2ui_render"), content: { view_id: "inbox_canvas" } },
    effectiveFormat: "a2ui_render",
    heuristicFormat: "email",
    agentDriven: true,
  });

  assert.equal(routing.effectiveFormat, "inbox_canvas");
  assert.equal(routing.agentDriven, true);
  assert.equal(routing.chosenView?.format, "a2ui_render");
});

test("resolveViewDispatcherRoutingFromInputs falls back to the supported heuristic format for unsupported explicit views", () => {
  const routing = resolveViewDispatcherRoutingFromInputs({
    chosenView: buildView("chart_view"),
    effectiveFormat: "chart_view",
    heuristicFormat: "shell_result",
    agentDriven: true,
  });

  assert.equal(routing.effectiveFormat, "shell_result");
  assert.equal(routing.agentDriven, false);
  assert.equal(routing.chosenView?.format, "chart_view");
});

test("resolveViewDispatcherRoutingFromInputs falls back to email when neither explicit nor heuristic formats are mounted", () => {
  const routing = resolveViewDispatcherRoutingFromInputs({
    chosenView: buildView("chart_view"),
    effectiveFormat: "chart_view",
    heuristicFormat: "unknown",
    agentDriven: true,
  });

  assert.equal(routing.effectiveFormat, "email");
  assert.equal(routing.agentDriven, false);
  assert.equal(routing.chosenView?.format, "chart_view");
});
