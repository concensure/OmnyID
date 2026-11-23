import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingFollowUpAutomationReadinessState } from "@/lib/weddingFollowUpAutomationReadinessState";

test("buildWeddingFollowUpAutomationReadinessState passes complete follow-up proof", () => {
  const state = buildWeddingFollowUpAutomationReadinessState({
    escalationLadderReady: true,
    approvalGateReady: true,
    emailOrContactExecutorReady: true,
    oneFollowUpLimitReady: true,
    userEscalationReady: true,
    unresponsiveAlternativeReady: true,
    receiptPersistenceReady: true,
    manualCallMoveOnOptionsReady: true,
    testedFollowUpScenarioCount: 4,
    failedFollowUpScenarioCount: 0,
  });

  assert.equal(state.status, "verified");
  assert.equal(state.productionEvidenceReady, true);
  assert.deepEqual(state.blockerLabels, []);
  assert.ok(state.evidenceLabels.some((label) => /5\/7\/10 day escalation ladder/i.test(label)));
  assert.ok(state.evidenceLabels.some((label) => /4 follow-up automation scenarios tested/i.test(label)));
});

test("buildWeddingFollowUpAutomationReadinessState allows manual escalation handoff", () => {
  const state = buildWeddingFollowUpAutomationReadinessState({
    escalationLadderReady: true,
    approvalGateReady: true,
    oneFollowUpLimitReady: true,
    userEscalationReady: true,
    unresponsiveAlternativeReady: true,
    manualCallMoveOnOptionsReady: true,
    testedFollowUpScenarioCount: 3,
  });

  assert.equal(state.status, "handoff_only");
  assert.equal(state.productionEvidenceReady, false);
  assert.match(state.summary, /manual escalation handoff/i);
  assert.ok(state.blockerLabels.some((label) => /Email\/contact executor/i.test(label)));
});

test("buildWeddingFollowUpAutomationReadinessState blocks failed follow-up scenarios", () => {
  const state = buildWeddingFollowUpAutomationReadinessState({
    escalationLadderReady: true,
    approvalGateReady: true,
    emailOrContactExecutorReady: true,
    oneFollowUpLimitReady: true,
    userEscalationReady: true,
    unresponsiveAlternativeReady: true,
    receiptPersistenceReady: true,
    manualCallMoveOnOptionsReady: true,
    testedFollowUpScenarioCount: 4,
    failedFollowUpScenarioCount: 1,
  });

  assert.equal(state.status, "blocked");
  assert.equal(state.productionEvidenceReady, false);
  assert.ok(state.blockerLabels.some((label) => /1 follow-up automation scenario failed/i.test(label)));
});
