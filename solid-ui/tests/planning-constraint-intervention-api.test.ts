import assert from "node:assert/strict";
import test from "node:test";

import { validateDecisionCard } from "../src/lib/decisionCardState.ts";
import {
  normalizePlanningConstraintIntervention,
  planningConstraintInterventionA2ui,
  planningConstraintInterventionDecisionCard,
  planningConstraintInterventionPrepareRequest,
  planningConstraintInterventionSelectRequest,
  planningConstraintInterventionUiEnabled,
  planningConstraintInterventionUserMessage,
} from "../src/lib/planningConstraintInterventionApi.ts";

const preparation = {
  threadId: "thread:one",
  planId: "plan:one",
  constraintId: "constraint:one",
  comparisonId: "comparison:one",
  quotationVersionId: "quotation:one:v2",
  recipient: "venue@example.test",
};

function payload() {
  return {
    intervention: {
      schema_version: "decision.intervention.v1",
      intervention_id: "intervention:one",
      decision_ref: "evaluation:one",
      recommended_option_id: "reject_candidate",
      options: [
        { option_id: "reject_candidate", label: "Remove this option from consideration", consequence_codes: ["candidate_rejected"], evidence_refs: ["source:one"] },
        { option_id: "ask_vendor", label: "Ask the vendor to clarify", consequence_codes: ["approval_required_before_send"], evidence_refs: ["source:one"] },
        { option_id: "amend_constraint", label: "Review the remembered requirement", consequence_codes: ["constraint_review_required"], evidence_refs: ["source:one"] },
        { option_id: "accept_conflict", label: "Keep this option and accept the conflict", consequence_codes: ["conflict_explicitly_accepted"], evidence_refs: ["source:one"] },
      ],
      reason_codes: ["constraint_conflict"],
      unknown_codes: ["vendor_confirmation_pending"],
      consequence_summary_codes: [
        "decision_appends_without_mutating_history",
        "vendor_message_requires_separate_approval",
      ],
      prepared_next_action: { kind: "draft", target_ref: "qclarify_abc" },
    },
    remembered_statement: "My aunt needs step-free access",
    conflict_evidence_label: "Current comparison evidence: hard requirement conflict.",
    unknown_labels: ["The vendor has not confirmed this requirement yet"],
    bindings: {
      constraint_ref: "constraint:one",
      evaluation_ref: "evaluation:one",
      quotation_version_id: "quotation:one:v2",
      comparison_id: "comparison:one",
      comparison_revision: "01KREVISION00000000000000",
      grant_revision: null,
      clarification_draft_hash: "sha256:abc",
    },
    clarification_draft: {
      draft_id: "qclarify_abc",
      recipient: "venue@example.test",
      questions: [{ question: "Can you confirm whether this option can meet the required accessibility feature?" }],
    },
  };
}

test("intervention UI stays off until its independent flag is explicit", () => {
  assert.equal(planningConstraintInterventionUiEnabled({}), false);
  assert.equal(planningConstraintInterventionUiEnabled({ VITE_PLANNING_CONSTRAINT_INTERVENTION_ENABLED: "true" }), true);
  assert.equal(planningConstraintInterventionUiEnabled({ VITE_PLANNING_CONSTRAINT_INTERVENTION_ENABLED: "off" }), false);
});

test("prepare and select requests stay within the bounded planning routes", () => {
  assert.deepEqual(planningConstraintInterventionPrepareRequest(preparation), {
    path: "/planning/constraint-interventions/prepare",
    body: {
      thread_id: "thread:one",
      plan_id: "plan:one",
      constraint_id: "constraint:one",
      comparison_id: "comparison:one",
      quotation_version_id: "quotation:one:v2",
      recipient: "venue@example.test",
    },
  });
  assert.deepEqual(planningConstraintInterventionSelectRequest({
    preparation,
    selectedOptionId: "ask_vendor",
    idempotencyKey: "intent:one",
  }), {
    path: "/planning/constraint-interventions/select",
    body: {
      preparation: planningConstraintInterventionPrepareRequest(preparation).body,
      selected_option_id: "ask_vendor",
      idempotency_key: "intent:one",
    },
  });
});

test("closed intervention payload maps to the existing Decision Card", () => {
  const intervention = normalizePlanningConstraintIntervention(payload());
  assert.ok(intervention);
  const card = planningConstraintInterventionDecisionCard(intervention);

  assert.deepEqual(validateDecisionCard(card), []);
  assert.equal(card.pattern, "choose");
  assert.equal(card.actions.length, 4);
  assert.equal(card.actions.filter((action) => action.role === "primary").length, 1);
  assert.equal(card.patternSlots.options?.length, 4);
  assert.match(card.evidence[0]?.label ?? "", /My aunt needs step-free access/);
  assert.match(card.whyItMatters, /quote and comparison will stay visible/);
  const a2ui = planningConstraintInterventionA2ui(intervention);
  assert.equal(a2ui.schema_version, "a2ui.v1");
  assert.equal(a2ui.kind, "planning_unified_intervention");
  assert.deepEqual(a2ui.nodes.map((node) => node.type), [
    "callout", "comparison_table", "constraint_badges", "insight_line",
    "bullet_list", "bullet_list", "action_chips",
  ]);
  assert.equal((a2ui.nodes.at(-1)!.props.actions as unknown[]).length, 4);
});

test("unknown options, stale shape and technical copy fail closed or become safe text", () => {
  const forged = payload();
  forged.intervention.options[0]!.option_id = "send_now";
  assert.equal(normalizePlanningConstraintIntervention(forged), null);

  const technical = payload();
  technical.remembered_statement = "postgres payload status 500";
  technical.conflict_evidence_label = "provider token error";
  const normalized = normalizePlanningConstraintIntervention(technical);
  assert.ok(normalized);
  assert.equal(normalized.rememberedStatement, "A confirmed planning requirement");
  assert.equal(
    normalized.conflictEvidenceLabel,
    "Current checked evidence conflicts with this requirement.",
  );
  assert.equal(
    planningConstraintInterventionUserMessage(new Error("HTTP 409 stale revision")),
    "This option changed. Refresh the comparison before deciding.",
  );
  assert.equal(
    planningConstraintInterventionUserMessage(new Error("postgres provider failed")),
    "We could not save this decision just now. Try again in a moment.",
  );
});
