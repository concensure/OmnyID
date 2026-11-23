import assert from "node:assert/strict";
import test from "node:test";

import { validateDecisionCard } from "@/lib/decisionCardState";
import {
  CLOSURE_STATUS_PRESENTATION,
  projectQuotationDecisionClosure,
  type QuotationClosureStatus,
  type QuotationDecisionClosureReplay,
  type VendorContextProjection,
} from "@/lib/quotationDecisionClosureState";
import {
  adaptQuotationDecisionClosureForTemplate,
  quotationDecisionClosureForWeddingWorkspace,
} from "@/lib/quotationWeddingDecisionClosureAdapter";

const source = {
  source_id: "source-contract-1",
  source_version_id: "source-contract-1-v1",
  media_type: "application/pdf",
};

function replay(status: QuotationClosureStatus = "contract_reviewed"): QuotationDecisionClosureReplay {
  return {
    active_version_by_quotation: { "quote-1": "quote-1-v2" },
    active_comparisons: {
      "comparison-1": {
        comparison_id: "comparison-1",
        candidates: [{ quotation_id: "quote-1", version_id: "quote-1-v2", vendor_id: "vendor-1", disposition: "eligible" }],
      },
    },
    comparison_message_ids: { "comparison-1": "comparison-message-v3" },
    active_selections: {
      "comparison-1": {
        selection_id: "selection-1",
        comparison_id: "comparison-1",
        comparison_revision: "comparison-message-v3",
        quotation_id: "quote-1",
        quotation_version_id: "quote-1-v2",
        vendor_id: "vendor-1",
        occurred_at: "2026-10-17T01:00:00Z",
      },
    },
    active_closures: {
      "quote-1": {
        quotation_id: "quote-1",
        quotation_version_id: "quote-1-v2",
        state: status,
        last_event_id: `closure-${status}`,
        updated_at: "2026-10-17T03:00:00Z",
        deadline_at: "2026-10-24T03:00:00Z",
        evidence_sources: [source],
      },
    },
    closure_transitions: {
      "closure-selected": {
        event_id: "closure-selected",
        quotation_id: "quote-1",
        quotation_version_id: "quote-1-v2",
        expected_state: null,
        target_state: "selected",
        occurred_at: "2026-10-17T01:00:00Z",
        evidence_sources: [source],
        contract_changes: [],
        contract_changes_reviewed: false,
      },
      [`closure-${status}`]: {
        event_id: `closure-${status}`,
        quotation_id: "quote-1",
        quotation_version_id: "quote-1-v2",
        expected_state: "contract_received",
        target_state: status,
        occurred_at: "2026-10-17T03:00:00Z",
        evidence_sources: [source],
        contract_changes: status === "contract_reviewed" ? [{
          kind: "commercial_term",
          path: "cancellation.non_refundable_after",
          before: "2026-11-01",
          after: "2026-10-25",
        }] : [],
        contract_changes_reviewed: status === "contract_reviewed",
      },
    },
  };
}

const vendorProjection: VendorContextProjection = {
  projection_version: "quotation.vendor_context.v1",
  projection_fingerprint: "fixture-fingerprint",
  grant_id: "grant-1",
  recipient_vendor_id: "vendor-1",
  quotation_id: "quote-1",
  purpose: "resolve_quote_gaps",
  fields: {
    budget: { amount_minor: 2_500_000, currency: "AUD" },
    guest_count: 80,
  },
  fact_ids: ["fact-budget", "fact-guest-count"],
  provenance_refs: ["budget:venue:v1", "requirement:guest-count:v2"],
};

function project(status: QuotationClosureStatus = "contract_reviewed") {
  return projectQuotationDecisionClosure({
    threadId: "thread-1",
    comparisonId: "comparison-1",
    decisionRevision: "decision-card-v5",
    replay: replay(status),
    grant: { revision: "grant-message-v2", expiresAt: "2026-10-24T00:00:00Z", projection: vendorProjection },
  });
}

test("projects one active closure action bound to every relevant revision", () => {
  const result = project();
  assert.equal(result.action?.targetState, "deposit_requested");
  assert.deepEqual(result.action?.binding, {
    decisionRevision: "decision-card-v5",
    quotationId: "quote-1",
    quotationVersionId: "quote-1-v2",
    comparisonId: "comparison-1",
    comparisonRevision: "comparison-message-v3",
    closureRevision: "closure-contract_reviewed",
    grantRevision: "grant-message-v2",
  });
  assert.equal(result.decisionCard.pattern, "record");
  assert.deepEqual(validateDecisionCard(result.decisionCard), []);
  assert.match(result.action?.effect ?? "", /will not make a payment/i);
});

test("A2UI projection uses existing primitives and carries one action", () => {
  const result = project();
  const a2ui = result.a2ui as { components: Array<{ type: string; props: Record<string, unknown> }> };
  assert.deepEqual(a2ui.components.map((component) => component.type), [
    "stat_row",
    "constraint_badges",
    "insight_line",
    "callout",
    "comparison_table",
    "action_chips",
  ]);
  const actions = a2ui.components.find((component) => component.type === "action_chips")?.props.actions as Record<string, unknown>;
  assert.equal(Object.keys(actions).length, 1);
  assert.equal(JSON.stringify(result.a2ui).includes("OmnyID will not make a payment"), true);
});

test("vendor preview exactly preserves the least-privilege server projection", () => {
  const result = project();
  assert.deepEqual(result.vendorPreview?.exactProjection, vendorProjection.fields);
  assert.deepEqual(result.vendorPreview?.fields.map((field) => field.key), ["budget", "guest_count"]);
  assert.equal(JSON.stringify(result.vendorPreview).includes("competitor"), false);
  assert.equal(JSON.stringify(result.vendorPreview).includes("private_note"), false);
});

test("material changes retain before, after, and source links", () => {
  const result = project();
  assert.deepEqual(result.materialChanges, [{
    kind: "commercial_term",
    path: "cancellation.non_refundable_after",
    before: "2026-11-01",
    after: "2026-10-25",
    evidence: [source],
  }]);
});

test("a quotation successor replaces mutation with a recoverable refresh action", () => {
  const current = replay();
  current.active_version_by_quotation["quote-1"] = "quote-1-v3";
  const result = projectQuotationDecisionClosure({
    threadId: "thread-1",
    comparisonId: "comparison-1",
    decisionRevision: "decision-card-v5",
    replay: current,
  });
  assert.equal(result.stale, true);
  assert.equal(result.action?.kind, "refresh");
  assert.equal(result.action?.targetState, undefined);
  assert.match(result.action?.effect ?? "", /no external action/i);
  assert.equal(result.decisionCard.actions.length, 1);
});

test("single-quotation closure never invents comparative winner language", () => {
  const result = project();
  assert.equal(result.decisionCard.recommendation, null);
  assert.doesNotMatch(JSON.stringify(result), /winner|best vendor|recommended vendor/i);
});

test("booking, cancellation, refund, and supersession have distinct labels and icons", () => {
  const statuses: QuotationClosureStatus[] = ["booking_confirmed", "cancelled", "refunded", "superseded"];
  const presentations = statuses.map((status) => CLOSURE_STATUS_PRESENTATION[status]);
  assert.equal(new Set(presentations.map((item) => item.label)).size, statuses.length);
  assert.equal(new Set(presentations.map((item) => item.icon)).size, statuses.length);
  assert.equal(project("booking_confirmed").action, null);
  assert.equal(project("cancelled").action?.targetState, "refunded");
});

test("wedding and future template adapters reuse the generic projection", () => {
  const generic = project();
  const wedding = quotationDecisionClosureForWeddingWorkspace(generic);
  assert.equal(wedding.contextNamespace, "wedding_planner");
  assert.equal(wedding.decisionCard.domain, "wedding");
  assert.equal(wedding.activeActionId, generic.action?.id);
  assert.equal(wedding.paymentExecution, false);
  assert.equal(generic.decisionCard.domain, "general");

  const future = adaptQuotationDecisionClosureForTemplate(generic, {
    contextNamespace: "event_planner",
    decisionDomain: "general",
  });
  assert.equal(future.contextNamespace, "event_planner");
  assert.equal(future.decisionCard.domain, "general");
  assert.equal((future.a2ui as Record<string, unknown>).context_namespace, "event_planner");
});
