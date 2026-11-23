import { createMemo, createSignal } from "solid-js";
import { render } from "solid-js/web";

import QuotationClosureTimeline from "../../src/components/QuotationClosureTimeline";
import "../../src/index.css";
import {
  projectQuotationDecisionClosure,
  type QuotationDecisionClosureReplay,
  type VendorContextProjection,
} from "../../src/lib/quotationDecisionClosureState";

function fixtureReplay(): QuotationDecisionClosureReplay {
  const source = {
    source_id: "contract-source-1",
    source_version_id: "contract-source-1-v1",
    media_type: "application/pdf",
  };
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
        state: "contract_reviewed",
        last_event_id: "closure-contract-reviewed",
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
      "closure-contract-reviewed": {
        event_id: "closure-contract-reviewed",
        quotation_id: "quote-1",
        quotation_version_id: "quote-1-v2",
        expected_state: "contract_received",
        target_state: "contract_reviewed",
        occurred_at: "2026-10-17T03:00:00Z",
        evidence_sources: [source],
        contract_changes: [{
          kind: "commercial_term",
          path: "cancellation.non_refundable_after",
          before: "2026-11-01",
          after: "2026-10-25",
        }],
        contract_changes_reviewed: true,
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
  fields: { budget: { amount_minor: 2_500_000, currency: "AUD" }, guest_count: 80 },
  fact_ids: ["fact-budget", "fact-guest-count"],
  provenance_refs: ["budget:venue:v1", "requirement:guest-count:v2"],
};

function Fixture() {
  const [replay, setReplay] = createSignal(fixtureReplay());
  const [lastAction, setLastAction] = createSignal("none");
  const [lastSource, setLastSource] = createSignal("none");
  const projection = createMemo(() => projectQuotationDecisionClosure({
    threadId: "thread-1",
    comparisonId: "comparison-1",
    decisionRevision: "decision-card-v5",
    replay: replay(),
    grant: { revision: "grant-message-v2", expiresAt: "2026-10-24T00:00:00Z", projection: vendorProjection },
  }));

  const handleAction = (action: ReturnType<typeof projection>["action"]) => {
    if (!action) return;
    setLastAction(action.id);
    if (action.kind === "refresh") setReplay(fixtureReplay());
  };

  return (
    <div class="mx-auto min-h-screen max-w-5xl space-y-5 bg-slate-50 p-4 text-slate-950">
      <header>
        <h1 class="text-2xl font-bold">Quotation decision and closure</h1>
        <p class="text-sm text-slate-700">Synthetic evidence for mobile and desktop interaction checks.</p>
      </header>
      <button
        type="button"
        class="min-h-11 rounded-lg border bg-white px-3"
        onClick={() => setReplay((current) => ({
          ...current,
          active_version_by_quotation: { ...current.active_version_by_quotation, "quote-1": "quote-1-v3" },
        }))}
      >
        Simulate newer quotation
      </button>
      <QuotationClosureTimeline
        projection={projection()}
        onAction={handleAction}
        onOpenSource={(source) => setLastSource(source.source_version_id)}
      />
      <p data-testid="closure-action" aria-live="polite">Action: {lastAction()}</p>
      <p data-testid="closure-source" aria-live="polite">Source: {lastSource()}</p>
    </div>
  );
}

render(() => <Fixture />, document.getElementById("root")!);
