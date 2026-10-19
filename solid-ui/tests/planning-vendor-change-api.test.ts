import assert from "node:assert/strict";
import test from "node:test";

import { validateDecisionCard } from "../src/lib/decisionCardState.ts";
import { containsTechnicalWeddingUiCopy } from "../src/lib/weddingHomeUiCopyState.ts";
import {
  normalizePlanningVendorChangeReview,
  planningVendorChangeA2ui,
  planningVendorChangeDecisionCard,
  planningVendorChangePrepareRequest,
  planningVendorChangeUiEnabled,
  planningVendorChangeUserMessage,
} from "../src/lib/planningVendorChangeApi.ts";

function payload() {
  return {
    review_id: "vendor_change_review:one",
    interpretation_ref: "vendor_change_interpretation:one",
    bindings: {
      response_ref: "response:one",
      response_fingerprint: "a".repeat(64),
      quotation_version_ref: "quotation:v1",
      constraint_revision_refs: ["constraint:style:v1"],
      budget_revision_ref: "budget:v1",
      event_date_revision_ref: "event-date:v1",
    },
    options: [{
      option_ref: "vendor_change_option:one",
      change_ref: "vendor_change:one",
      replacement: {
        value: "AUD:425000",
        source_anchor: {
          message_id: "response:one",
          source_version_id: "response-source:v1",
          locator: "section=pricing",
          exact_excerpt: "postgres payload should remain private",
        },
      },
      constraint_fit: "unknown",
      aesthetic_fit: "unknown",
      budget_fit: "uncertain",
      hard_conflict: false,
      evaluation_refs: [],
      unknown_constraint_refs: ["constraint:style:v1"],
    }],
    timing: [{
      change_ref: "vendor_change:one",
      as_of: "2026-10-18T01:04:00Z",
      days_to_event: 44,
      event_date_evidence_ref: "event-date:v1",
      explicit_deadline: "2026-11-15T00:00:00Z",
      days_to_deadline: 28,
    }],
    blockers: [],
    requires_user_review: true,
    quotation_mutated: false,
  };
}

test("vendor-change review stays behind its independent UI flag", () => {
  assert.equal(planningVendorChangeUiEnabled({}), false);
  assert.equal(planningVendorChangeUiEnabled({ VITE_PLANNING_VENDOR_CHANGES_ENABLED: "true" }), true);
  assert.equal(planningVendorChangeUiEnabled({ VITE_PLANNING_VENDOR_CHANGES_ENABLED: "off" }), false);
});

test("prepare request contains only owned lookup references", () => {
  assert.deepEqual(planningVendorChangePrepareRequest({
    threadId: "thread:one",
    planId: "plan:one",
    responseId: "response:one",
  }), {
    path: "/planning/vendor-changes/prepare",
    body: { thread_id: "thread:one", plan_id: "plan:one", response_id: "response:one" },
  });
});

test("review projects into existing Decision Card and A2UI without accepting the quote", () => {
  const review = normalizePlanningVendorChangeReview(payload());
  assert.ok(review);
  assert.match(review.options[0]?.label ?? "", /4,250/);
  const card = planningVendorChangeDecisionCard(review);
  assert.deepEqual(validateDecisionCard(card), []);
  assert.equal(card.pattern, "review");
  assert.equal(card.recommendation, null);
  assert.deepEqual(card.actions.map((action) => action.intent), ["open_vendor_change_review"]);
  assert.match(card.actions[0]?.effect ?? "", /nothing is accepted, sent, booked or paid/i);
  assert.match(card.whyItMatters, /28 days/);
  assert.match(card.unknowns.join(" "), /requirements still need checking/i);
  const visibleCopy = JSON.stringify({
    title: card.title,
    why: card.whyItMatters,
    options: card.patternSlots.options?.map(({ name, summary }) => ({ name, summary })),
    evidence: card.evidence.map(({ label }) => label),
    unknowns: card.unknowns,
  });
  assert.doesNotMatch(visibleCopy, /postgres|payload|response-source|constraint:|vendor_change/i);
  assert.equal(containsTechnicalWeddingUiCopy(visibleCopy), false);

  const a2ui = planningVendorChangeA2ui(review);
  assert.deepEqual(a2ui.nodes.map((node) => node.type), [
    "callout", "stat_row", "comparison_table", "constraint_badges", "bullet_list", "action_chips",
  ]);
  assert.equal(
    (a2ui.nodes.at(-1)?.props.actions as Record<string, { prepared_only: boolean }>)
      .open_vendor_change_review?.prepared_only,
    true,
  );
});

test("normalizer fails closed on mutation claims, open enums and malformed timing", () => {
  const mutated = payload();
  mutated.quotation_mutated = true;
  assert.equal(normalizePlanningVendorChangeReview(mutated), null);

  const openFit = payload();
  openFit.options[0]!.constraint_fit = "probably";
  assert.equal(normalizePlanningVendorChangeReview(openFit), null);

  const badTiming = payload();
  badTiming.timing[0]!.explicit_deadline = "soon";
  assert.equal(normalizePlanningVendorChangeReview(badTiming), null);

  const unknownBlocker = payload();
  unknownBlocker.blockers = [{ kind: "internal_stack_failure" }];
  assert.equal(normalizePlanningVendorChangeReview(unknownBlocker), null);
});

test("technical failures become plain user-facing copy", () => {
  assert.match(planningVendorChangeUserMessage(new Error("401 API token")), /Sign in again/);
  assert.match(planningVendorChangeUserMessage(new Error("409 stale revision")), /changed/);
  assert.match(planningVendorChangeUserMessage(new Error("postgres exception")), /could not check/);
  assert.equal(containsTechnicalWeddingUiCopy(
    planningVendorChangeUserMessage(new Error("postgres exception")),
  ), false);
});
