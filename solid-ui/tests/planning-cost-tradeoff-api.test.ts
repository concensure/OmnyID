import assert from "node:assert/strict";
import test from "node:test";

import { validateDecisionCard } from "../src/lib/decisionCardState.ts";
import {
  normalizePlanningCostTradeoffAdvice,
  planningCostTradeoffA2ui,
  planningCostTradeoffAcknowledgeRequest,
  planningCostTradeoffDecisionCard,
  planningCostTradeoffPrepareRequest,
  planningCostTradeoffUiEnabled,
  planningCostTradeoffUserMessage,
} from "../src/lib/planningCostTradeoffApi.ts";

const preparation = {
  threadId: "thread:one",
  planId: "plan:one",
  budgetRevisionRef: "budget:v3",
  comparisonId: "comparison:one",
  quotationVersionId: "quotation:photo:v2",
  candidateCategoryRef: "photo_video",
};

function payload() {
  return {
    tradeoff: {
      tradeoff_id: "cost_tradeoff:one",
      candidate_decision_ref: "comparison:one",
      incremental_cost: {
        state: "exact",
        amount: { amount_minor: 200_000, currency: "AUD" },
        evidence_ref: "comparison:revision:one",
      },
      forecast_before: {
        minimum_minor: 3_900_000,
        maximum_minor: 3_950_000,
        currency: "AUD",
        evidence_refs: ["budget:v3"],
      },
      forecast_after: {
        minimum_minor: 4_100_000,
        maximum_minor: 4_150_000,
        currency: "AUD",
        evidence_refs: ["budget:v3", "comparison:revision:one"],
      },
      offset_options: [{
        option_id: "cost_offset:flowers",
        category_ref: "flowers_decor",
        saving_range: {
          minimum_minor: 50_000,
          maximum_minor: 100_000,
          currency: "AUD",
          evidence_refs: ["budget:flowers:v2"],
        },
        evidence_refs: ["budget:flowers:v2"],
      }],
    },
    bindings: {
      candidate_revision_ref: "quotation:photo:v2",
      budget_revision_ref: "budget:v3",
      constraint_revision_refs: ["constraint:priority:v1"],
      source_revision_refs: ["budget:v3", "quotation:photo:v2"],
    },
    uncontracted_category_refs: ["transport"],
    unresolved_fee_driver_refs: ["fee:photo:quantity"],
    exceeds_budget: true,
    requires_acknowledgement: true,
  };
}

test("cost advice UI stays behind its independent default-off build flag", () => {
  assert.equal(planningCostTradeoffUiEnabled({}), false);
  assert.equal(planningCostTradeoffUiEnabled({ VITE_PLANNING_COST_TRADEOFFS_ENABLED: "true" }), true);
  assert.equal(planningCostTradeoffUiEnabled({ VITE_PLANNING_COST_TRADEOFFS_ENABLED: "off" }), false);
});

test("prepare and acknowledgement requests contain identifiers, not client cost amounts", () => {
  const prepare = planningCostTradeoffPrepareRequest(preparation);
  assert.equal(prepare.path, "/planning/cost-tradeoffs/prepare");
  assert.deepEqual(prepare.body, {
    thread_id: "thread:one",
    plan_id: "plan:one",
    budget_revision_ref: "budget:v3",
    comparison_id: "comparison:one",
    quotation_version_id: "quotation:photo:v2",
    candidate_category_ref: "photo_video",
  });
  assert.equal(JSON.stringify(prepare).includes("amount"), false);
  assert.deepEqual(planningCostTradeoffAcknowledgeRequest({
    preparation,
    idempotencyKey: "intent:one",
  }), {
    path: "/planning/cost-tradeoffs/acknowledge",
    body: { preparation: prepare.body, idempotency_key: "intent:one" },
  });
});

test("revision-bound advice maps to existing Decision Card and A2UI surfaces", () => {
  const advice = normalizePlanningCostTradeoffAdvice(payload());
  assert.ok(advice);
  const card = planningCostTradeoffDecisionCard(advice);
  assert.deepEqual(validateDecisionCard(card), []);
  assert.equal(card.pattern, "choose");
  assert.equal(card.pressure, "high");
  assert.equal(card.actions[0]?.id, "acknowledge_cost_impact");
  assert.match(card.recommendation?.summary ?? "", /Flowers and decor/);
  assert.match(card.unknowns.join(" "), /Transport is not contracted yet/);
  const visibleCopy = JSON.stringify({
    title: card.title,
    whyItMatters: card.whyItMatters,
    recommendation: card.recommendation,
    actions: card.actions.map(({ label, effect }) => ({ label, effect })),
    evidence: card.evidence.map(({ label }) => label),
    confidence: card.confidence,
    unknowns: card.unknowns,
    options: card.patternSlots.options?.map(({ name }) => name),
  });
  assert.doesNotMatch(visibleCopy, /fee:photo|budget:v3|postgres|payload/i);

  const a2ui = planningCostTradeoffA2ui(advice);
  assert.equal(a2ui.schema_version, "a2ui.v1");
  assert.deepEqual(a2ui.nodes.map((node) => node.type), [
    "callout", "insight_line", "bullet_list", "action_chips",
  ]);
});

test("unknown money stays unknown and invalid currency/ranges fail closed", () => {
  const unknown = payload();
  unknown.tradeoff.incremental_cost = { state: "unknown" } as typeof unknown.tradeoff.incremental_cost;
  unknown.tradeoff.forecast_after = null as unknown as typeof unknown.tradeoff.forecast_after;
  const normalized = normalizePlanningCostTradeoffAdvice(unknown);
  assert.ok(normalized);
  assert.equal(normalized.incrementalCostMinor, null);
  assert.equal(normalized.forecastAfter, null);

  const mixed = payload();
  mixed.tradeoff.forecast_after.currency = "USD";
  assert.equal(normalizePlanningCostTradeoffAdvice(mixed), null);
  const negative = payload();
  negative.tradeoff.forecast_before.minimum_minor = -1;
  assert.equal(normalizePlanningCostTradeoffAdvice(negative), null);
});

test("technical failures map to short user-safe guidance", () => {
  assert.equal(
    planningCostTradeoffUserMessage(new Error("HTTP 409 stale revision")),
    "Your budget or quote changed. Refresh before deciding.",
  );
  assert.equal(
    planningCostTradeoffUserMessage(new Error("postgres payload provider failure")),
    "We could not check this budget impact just now. Try again in a moment.",
  );
});
