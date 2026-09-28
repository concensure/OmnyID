import test from "node:test";
import assert from "node:assert/strict";

import {
  agentApprovalExplainer,
  agentApprovalKeyboardHint,
  agentApprovalKeyboardTitle,
} from "../src/lib/agentApprovalCopy.ts";

test("agentApprovalExplainer describes outbound send approvals", () => {
  assert.equal(
    agentApprovalExplainer({ intent: "Send launch update email to the board" }),
    "The agent will send a message on your behalf. No edits are possible after approval.",
  );
});

test("agentApprovalExplainer describes read-only approvals", () => {
  assert.equal(
    agentApprovalExplainer({ intent: "Research competitor pricing" }),
    "The agent will read external data. No data will be written or sent.",
  );
});

test("agentApprovalExplainer falls back to generic approval guidance", () => {
  assert.equal(
    agentApprovalExplainer({ intent: "Handle the next workflow step" }),
    "The agent is requesting permission to act. Review the task description before approving.",
  );
});

test("agent approval keyboard copy stays shared", () => {
  assert.equal(agentApprovalKeyboardHint(), "Enter approve / Del reject");
  assert.equal(
    agentApprovalKeyboardTitle(),
    "Focus here: Enter to approve, Delete/Backspace to reject",
  );
});
