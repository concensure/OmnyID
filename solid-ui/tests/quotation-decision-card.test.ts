import assert from "node:assert/strict";
import test from "node:test";

import {
  a2uiForQuotationComparison,
  decisionCardFromQuotationComparison,
  type QuotationComparisonView,
} from "@/lib/quotationDecisionCardState";
import { validateDecisionCard } from "@/lib/decisionCardState";

function comparison(count = 2): QuotationComparisonView {
  return {
    comparison_id: "comparison-1",
    scenario_id: "scenario-80-guests",
    revision: "rev-3",
    context_namespace: "wedding_planner",
    candidates: [
      {
        quotation_id: "quote-a",
        version_id: "quote-a-v2",
        vendor_id: "vendor-a",
        vendor_label: "Venue A",
        disposition: "eligible",
        total: {
          currency: "AUD",
          status: "complete",
          total_minor: 2_120_000,
          evidence_coverage_bps: 10_000,
          gaps: [],
        },
        requirement_coverage_bps: 10_000,
        evidence_strength_bps: 10_000,
        hard_conflict_ids: [],
        unknown_hard_requirement_ids: [],
      },
      {
        quotation_id: "quote-b",
        version_id: "quote-b-v1",
        vendor_id: "vendor-b",
        vendor_label: "Venue B",
        disposition: "conditional",
        total: {
          currency: "AUD",
          status: "incomplete",
          total_minor: null,
          evidence_coverage_bps: 6_000,
          gaps: [{ code: "price_missing", line_id: "beverages", message: "Beverage price is not stated." }],
        },
        requirement_coverage_bps: 7_500,
        evidence_strength_bps: 7_000,
        hard_conflict_ids: [],
        unknown_hard_requirement_ids: ["availability"],
      },
    ].slice(0, count),
    recommended_quotation_id: "quote-a",
    recommendation_reason: "Lowest complete comparable total among eligible quotations.",
    sources: [
      { version_id: "quote-a-v2", label: "Venue A revision 2", ref: "afp://quote-a-v2", source_kind: "quotation" },
      { version_id: "quote-b-v1", label: "Venue B quote", ref: "afp://quote-b-v1", source_kind: "quotation" },
    ],
  };
}

test("single quotation uses review rather than comparative recommendation", () => {
  const card = decisionCardFromQuotationComparison(comparison(1));
  assert.equal(card.pattern, "review");
  assert.equal(card.recommendation, null);
  assert.equal(card.patternSlots.options?.[0]?.recommended, false);
  assert.deepEqual(validateDecisionCard(card), []);
});

test("comparison recommendation requires eligible policy result and active source", () => {
  const card = decisionCardFromQuotationComparison(comparison());
  assert.equal(card.pattern, "compare");
  assert.equal(card.recommendation?.summary, "Venue A");
  assert.equal(card.patternSlots.options?.[0]?.recommended, true);
  assert.equal(card.actions.filter((action) => action.role === "primary").length, 1);
  assert.ok(card.actions.every((action) => action.id.endsWith(":rev-3")));
  assert.deepEqual(validateDecisionCard(card), []);

  const noEvidence = comparison();
  noEvidence.sources = noEvidence.sources.filter((source) => source.version_id !== "quote-a-v2");
  assert.equal(decisionCardFromQuotationComparison(noEvidence).recommendation, null);
});

test("unknown requirements expose clarify action without sending", () => {
  const card = decisionCardFromQuotationComparison(comparison());
  const clarify = card.actions.find((action) => action.intent === "quotation.clarification.prepare");
  assert.ok(clarify);
  assert.match(clarify.effect, /editable draft/);
  assert.match(clarify.effect, /sending still requires approval/);
  assert.ok(card.unknowns.some((unknown) => unknown.includes("availability")));
});

test("A2UI reuses existing primitives and binds every action to revision", () => {
  const a2ui = a2uiForQuotationComparison(comparison()) as {
    state_id: string;
    components: Array<{ type: string; props: Record<string, any> }>;
  };
  assert.equal(a2ui.state_id, "quotation:comparison-1:rev-3");
  assert.deepEqual(
    a2ui.components.map((component) => component.type),
    ["stat_row", "comparison_table", "constraint_badges", "insight_line", "callout", "action_chips"],
  );
  const actions = a2ui.components.find((component) => component.type === "action_chips")?.props.actions;
  assert.equal(actions.review.revision, "rev-3");
  assert.equal(actions.clarify.revision, "rev-3");
  assert.equal(actions.clarify.external_send, false);
  assert.equal(actions.select.requires_user_confirmation, true);
});
