import test from "node:test";
import assert from "node:assert/strict";

import {
  orchestrationGateState,
  buildOrchestrationCompanionPanelState,
} from "../src/lib/orchestrationPanelState.js";

test("orchestration gate state distinguishes approval, clarification, and immediate execution", () => {
  assert.deepEqual(orchestrationGateState("send this update"), {
    gate: "Approval",
    gateExplainer: "The orchestrator detected a higher-risk action boundary and will wait for approval.",
    tone: "warning",
    nextSteps: [
      ["Wait for approval", "Do not cross the action boundary prematurely."],
      ["Resume only if approved", "Continue in the same card after confirmation."],
    ],
  });

  assert.deepEqual(orchestrationGateState("organize this"), {
    gate: "Clarification",
    gateExplainer: "The orchestrator needs one planning preference before it commits to the next path.",
    tone: "strategy",
    nextSteps: [
      ["Ask for a preference", "Resolve ambiguity before execution starts."],
      ["Lock the strategy", "Resume with the selected planning mode."],
    ],
  });

  assert.deepEqual(orchestrationGateState("prepare weekly summary document"), {
    gate: "None",
    gateExplainer: "The orchestrator can begin immediately with the current objective.",
    tone: "info",
    nextSteps: [
      ["Plan the run", "Break the objective into structured tasks."],
      ["Start execution", "Begin the first safe step immediately."],
    ],
  });
});

test("orchestration companion panel state renders gate-driven sections", () => {
  const panel = buildOrchestrationCompanionPanelState({
    query: "send this update",
    summary: "Prepared the orchestration card.",
    cardId: "card.demo",
  });

  assert.equal(panel.title, 'Orchestration preview for "send this update"');
  assert.deepEqual(
    panel.nodes.map((node) => node.id),
    ["orchestrate-summary", "orchestrate-stats", "orchestrate-guidance"],
  );
  assert.deepEqual(panel.nodes[1].props.items, [
    { label: "Card", value: "card.demo" },
    { label: "Gate", value: "Approval" },
    { label: "Status", value: "streaming" },
  ]);
});
