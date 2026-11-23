import assert from "node:assert/strict";
import test from "node:test";

import { validateDecisionCard } from "../src/lib/decisionCardState.ts";
import {
  buildPlanningUnifiedInterventionState,
  normalizePlanningDecisionIntervention,
  planningUnifiedInterventionUiEnabled,
} from "../src/lib/planningUnifiedInterventionState.ts";

function payload() {
  return {
    schema_version: "decision.intervention.v1",
    intervention_id: "intervention:budget-one",
    decision_ref: "tradeoff:one",
    options: [
      { option_id: "keep_scope", label: "Keep the current scope", consequence_codes: ["budget_forecast_increases"], evidence_refs: ["quote:one"] },
      { option_id: "reduce_florals", label: "Simplify the floral scope", consequence_codes: ["forecast_rebalanced"], evidence_refs: ["quote:one", "budget:one"] },
      { option_id: "move_budget", label: "Move budget from another category", consequence_codes: ["offset_required"], evidence_refs: ["budget:one"] },
      { option_id: "pause", label: "Pause while one cost is confirmed", consequence_codes: ["decision_deferred"], evidence_refs: ["quote:one"] },
      { option_id: "review_more", label: "Review another option", consequence_codes: ["research_prepared"], evidence_refs: ["quote:one"] },
    ],
    recommended_option_id: "reduce_florals",
    reason_codes: ["budget_tradeoff"],
    unknown_codes: ["delivery_fee_pending"],
    consequence_summary_codes: ["decision_appends_without_mutating_history"],
    prepared_next_action: { kind: "compare", target_ref: "comparison:one" },
  };
}

test("unified intervention presentation stays off unless explicitly enabled", () => {
  assert.equal(planningUnifiedInterventionUiEnabled({}), false);
  assert.equal(planningUnifiedInterventionUiEnabled({ VITE_PLANNING_UNIFIED_INTERVENTIONS_ENABLED: "true" }), true);
  assert.equal(planningUnifiedInterventionUiEnabled({ VITE_PLANNING_UNIFIED_INTERVENTIONS_ENABLED: "off" }), false);
});

test("frozen intervention schema fails closed on unknown or unsupported data", () => {
  assert.ok(normalizePlanningDecisionIntervention(payload()));
  assert.equal(normalizePlanningDecisionIntervention({ ...payload(), extra: true }), null);
  assert.equal(normalizePlanningDecisionIntervention({ ...payload(), reason_codes: ["invented_reason"] }), null);
  assert.equal(normalizePlanningDecisionIntervention({ ...payload(), recommended_option_id: "missing" }), null);

  const duplicate = payload();
  duplicate.options[1]!.option_id = duplicate.options[0]!.option_id;
  assert.equal(normalizePlanningDecisionIntervention(duplicate), null);

  const unknownOptionField = payload();
  Object.assign(unknownOptionField.options[0]!, { internal_score: 99 });
  assert.equal(normalizePlanningDecisionIntervention(unknownOptionField), null);
});

test("shared Decision Card keeps alternatives while bounding executable actions", () => {
  const intervention = normalizePlanningDecisionIntervention(payload());
  assert.ok(intervention);
  const state = buildPlanningUnifiedInterventionState({
    intervention,
    presentation: {
      title: "Choose how to handle this budget change",
      summary: "The updated quote changes your current forecast.",
      reasonLabels: ["This keeps the total closer to your saved range."],
      costRangeLabel: "About $1.2k–$1.5k above the current forecast",
      timingLabel: "Review before the quote expires",
      unknownLabels: ["Delivery is still to be confirmed"],
      evidence: [{
        label: "Current florist quote",
        ref: "quote:one",
        sourceKind: "quotation",
        freshness: "current",
      }],
      verificationLabel: "Current quote and budget checked",
    },
  });

  assert.deepEqual(validateDecisionCard(state.card), []);
  assert.equal(state.card.actions.length, 4);
  assert.equal(state.card.actions.filter((action) => action.role === "primary").length, 1);
  assert.equal(state.card.actions[0]!.id, "reduce_florals");
  assert.equal(state.card.patternSlots.options?.length, 5);
  assert.deepEqual(state.card.patternSlots.reviewItems, ["Cost: About $1.2k–$1.5k above the current forecast"]);
  assert.equal(state.card.timeSensitivity?.label, "Review before the quote expires");
  assert.deepEqual(state.card.unknowns, ["Delivery is still to be confirmed"]);
  assert.match(state.card.actions[0]!.effect, /Nothing is sent, booked or paid automatically/);

  const comparison = state.a2ui.nodes.find((node) => node.type === "comparison_table");
  assert.equal((comparison?.props.rows as unknown[]).length, 5);
  assert.deepEqual(state.a2ui.nodes.map((node) => node.type), [
    "callout", "comparison_table", "stat_row", "insight_line",
    "bullet_list", "bullet_list", "action_chips",
  ]);
  assert.equal((state.a2ui.nodes.at(-1)!.props.actions as unknown[]).length, 4);
});

test("presentation sanitizes technical copy before it reaches wedding UI", () => {
  const intervention = normalizePlanningDecisionIntervention(payload());
  assert.ok(intervention);
  const state = buildPlanningUnifiedInterventionState({
    intervention,
    presentation: {
      title: "postgres status 500",
      summary: "provider token payload failed",
      reasonLabels: ["database exception"],
      evidence: [{
        label: "http provider payload",
        ref: "quote:one",
        sourceKind: "quotation",
        freshness: "current",
      }],
    },
  });
  assert.equal(state.card.title, "Review this planning decision");
  assert.equal(state.card.whyItMatters, "Review the current evidence and choose the next step that fits your plan.");
  assert.equal(state.card.evidence[0]!.label, "Current evidence checked");
  assert.doesNotMatch(JSON.stringify(state.a2ui), /postgres|provider token|payload failed|database exception/i);
});

test("currency amounts are preserved without weakening technical-copy suppression", () => {
  const intervention = normalizePlanningDecisionIntervention(payload());
  assert.ok(intervention);
  const state = buildPlanningUnifiedInterventionState({
    intervention,
    presentation: {
      costRangeLabel: "$4,500 to AUD 5,200",
      evidence: [{
        label: "Checked quote: $4,500",
        ref: "quote:one",
        sourceKind: "quotation",
        freshness: "current",
      }],
    },
  });
  assert.deepEqual(state.card.patternSlots.reviewItems, ["Cost: $4,500 to AUD 5,200"]);
  assert.match(JSON.stringify(state.a2ui), /\$4,500 to AUD 5,200/);
});
