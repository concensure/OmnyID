import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTrustAwareActionDecision,
  buildTrustAwarePriorityDecision,
} from "../src/lib/decisionOsContinuityDecisionAssembly.ts";

test("trust-aware priority decisions keep calm review semantics for prepared decision support", () => {
  const decision = buildTrustAwarePriorityDecision({
    title: "Renewal review ready",
    description: "Prepared decision support is ready for review",
    panel_kind: "decision_queue",
    requires_approval: false,
    action_label: "Open decision queue",
    surface_hint: "decision_queue",
    confidence: "medium",
    prepared_draft_class: "decision_memo",
    selection_reason: "Prepared renewal comparison",
    source_refs: ["thread:renewal_1"],
    object_refs: ["renewal:aurora_fiber"],
    object_labels: ["Aurora Fiber renewal"],
    file_refs: [],
    file_labels: [],
  });

  assert.equal(decision.urgency, "medium");
  assert.equal(decision.effort, "5 min");
  assert.ok(
    decision.whyBullets?.some((bullet) => bullet.text === "Open decision queue"),
  );
  assert.ok(
    decision.whyBullets?.some((bullet) => bullet.text === "suggest with artifact: Prepared work is ready for review before any action is taken."),
  );
});

test("trust-aware priority decisions keep calm review semantics for prepared workspace work", () => {
  const decision = buildTrustAwarePriorityDecision({
    title: "Launch prep note ready",
    description: "Prepared work is ready for review",
    panel_kind: "home",
    requires_approval: false,
    action_label: "Open workspace",
    surface_hint: "home",
    confidence: "medium",
    prepared_draft_class: "project_prep_note",
    selection_reason: "Prepared workspace follow-up",
    source_refs: ["thread:launch_1"],
    object_refs: ["project:launch"],
    object_labels: ["Launch plan"],
    file_refs: [],
    file_labels: [],
  });

  assert.equal(decision.urgency, "medium");
  assert.equal(decision.effort, "5 min");
  assert.ok(
    decision.whyBullets?.some((bullet) => bullet.text === "Open workspace"),
  );
  assert.ok(
    decision.whyBullets?.some((bullet) => bullet.text === "suggest with artifact: Prepared work is ready for review before any action is taken."),
  );
});

test("trust-aware action decisions keep calm review semantics for prepared decision-support actions", () => {
  const decision = buildTrustAwareActionDecision({
    id: "act_1",
    title: "Review renewal memo",
    category: "prepared_work",
    urgency: "high",
    confidence: "medium",
    requires_approval: false,
    suggested_action: "Review prepared decision support",
    surface_hint: "decision_queue",
    source_refs: ["thread:renewal_2"],
  });

  assert.equal(decision.urgency, "medium");
  assert.equal(decision.effort, "5 min");
  assert.ok(
    decision.whyBullets?.some((bullet) => bullet.text === "suggest with artifact: Suggested next step stays reviewable before execution."),
  );
});

test("trust-aware priority decisions prefer explicit trust metadata over synthesized fallback copy", () => {
  const decision = buildTrustAwarePriorityDecision({
    title: "Approval review ready",
    description: "Server-authored approval review.",
    panel_kind: "approval_queue",
    requires_approval: true,
    action_label: "Open decision queue",
    surface_hint: "decision_queue",
    confidence: "medium",
    selection_reason: "Server priority selection",
    approval_or_reversibility_hint: "Remains approval-gated before any action runs.",
    provenance_cue: "Grounded in 2 source references.",
    autonomy_tier: "ask_always",
    source_refs: ["thread:renewal_1", "thread:renewal_2"],
    object_refs: [],
    object_labels: [],
    file_refs: [],
    file_labels: [],
  });

  assert.ok(
    decision.whyBullets?.some((bullet) => bullet.text === "Remains approval-gated before any action runs."),
  );
  assert.ok(
    decision.whyBullets?.some((bullet) => bullet.text === "Grounded in 2 source references."),
  );
  assert.ok(
    decision.whyBullets?.some((bullet) => bullet.text === "ask always: Server priority selection"),
  );
});

test("trust-aware action decisions prefer explicit trust metadata over synthesized fallback copy", () => {
  const decision = buildTrustAwareActionDecision({
    id: "act_2",
    title: "Review action",
    category: "approval",
    urgency: "high",
    confidence: "medium",
    requires_approval: false,
    suggested_action: "Open workspace",
    surface_hint: "home",
    source_refs: ["thread:launch_1"],
    approval_or_reversibility_hint: "Stays reviewable before execution.",
    provenance_cue: "Grounded in 1 source reference.",
    autonomy_tier: "notify_then_act",
  });

  assert.ok(
    decision.whyBullets?.some((bullet) => bullet.text === "Stays reviewable before execution."),
  );
  assert.ok(
    decision.whyBullets?.some((bullet) => bullet.text === "Grounded in 1 source reference."),
  );
  assert.ok(
    decision.whyBullets?.some((bullet) => bullet.text === "notify then act: Suggested next step stays reviewable before execution."),
  );
});
