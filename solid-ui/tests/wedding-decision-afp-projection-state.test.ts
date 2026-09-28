import assert from "node:assert/strict";
import test from "node:test";

import {
  markWeddingDecisionAfpProjectionSent,
  weddingDecisionProjectionToAfpMessage,
  weddingDecisionProjectionToAfpSendInput,
} from "../src/lib/weddingDecisionAfpProjectionState.ts";
import { buildWeddingProjectionQueueState } from "../src/lib/weddingProjectionQueueState.ts";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  } as Storage;
}

const decision = {
  id: "wedding_decision:workspace:venue:harbour-house",
  metadata: {
    wedding_plan_id: "wedding_plan:harbour",
    response_workspace_id: "response_workspace:planning-pass",
    source_response_id: "afp:response-1",
  },
  artifactId: "artifact:venue-shortlist",
  artifactTitle: "Venue shortlist",
  artifactKind: "vendor_table",
  sourceLabels: ["Google Places API", "source_linked"],
  sourceUrls: ["https://example.com/harbour-house"],
  sourceProviderLabels: ["google_places"],
  sourceCountsByProvider: { google_places: 1 },
  selectedOption: {
    id: "0:harbour-house",
    rowIndex: 0,
    label: "Harbour House",
    detail: "Sydney - water view and indoor backup",
    cells: ["Harbour House", "Sydney", "water view and indoor backup"],
    selected: true,
    preferenceFitLabels: ["wet-weather backup", "waterfront/harbour feel"],
    missingPreferenceLabels: ["budget control"],
    tradeoffLabels: [],
    preferenceSummaryLabel: "2 preference fit signals",
  },
  reportScope: {
    status: "scoped_ready" as const,
    selectedOptionId: "0:harbour-house",
    selectedOptionLabel: "Harbour House",
    collapseAlternatives: true,
    includeAlternativesAsAudit: true,
    reportInstructionLabel: "Use Harbour House as the primary scope for follow-up reports; keep unticked options only as audit context.",
    blockerLabels: [],
    auditContextLabels: ["Freshness: source current, price verified, availability verified"],
    nextActionLabels: ["Generate follow-up reports from the selected option first."],
  },
  source: "local_selection" as const,
};

test("weddingDecisionProjectionToAfpMessage creates a searchable decision AFP message", () => {
  const message = weddingDecisionProjectionToAfpMessage(decision, "2026-09-12T00:00:00.000Z");

  assert.equal(message.type, "decision");
  assert.equal(message.subtype, "wedding_decision_selection");
  assert.ok(message.to?.includes("agent://decision-queue"));
  assert.equal(message.content.selected_option.label, "Harbour House");
  assert.deepEqual(message.content.selected_option.preference_fit_labels, ["wet-weather backup", "waterfront/harbour feel"]);
  assert.equal(message.metadata?.selected_option_preference_summary, "2 preference fit signals");
  assert.equal(message.content.artifact_id, "artifact:venue-shortlist");
  assert.deepEqual(message.content.source_provider_labels, ["google_places"]);
  assert.deepEqual(message.metadata?.source_provider_labels, ["google_places"]);
  assert.deepEqual(message.content.source_counts_by_provider, { google_places: 1 });
  assert.match(String(message.content.markdown), /## Preference fit/);
  assert.match(String(message.content.markdown), /## Report scope/);
  assert.match(String(message.content.markdown), /Cell 1: Harbour House/);
  assert.match(String(message.content.markdown), /Use Harbour House as the primary scope/);
  assert.equal(message.content.report_scope.status, "scoped_ready");
  assert.equal(message.content.report_scope.collapse_alternatives, true);
  assert.match(String(message.content.markdown), /Source providers: google_places/);
  assert.match(String(message.content.markdown), /https:\/\/example\.com\/harbour-house/);
  assert.match(String(message.content.markdown), /Treat this selected option as the active decision scope/);
  assert.ok(message.supertags?.includes("wedding_decision"));
  assert.equal(message.content.semantic_object.kind, "wedding_decision");
  assert.equal(message.metadata?.semantic_kind, "wedding_decision");
  assert.ok((message.metadata?.semantic_tags as string[]).includes("wedding_approval_required"));
  assert.equal(message.views[0]?.content.semantic_object.kind, "wedding_decision");
  assert.ok(String(message.metadata?.searchable_terms).includes("Harbour House"));
  assert.ok(String(message.metadata?.searchable_terms).includes("google_places"));
  assert.ok(String(message.metadata?.searchable_terms).includes("wet-weather backup"));
  assert.equal(message.metadata?.decision_report_scope_status, "scoped_ready");
  assert.match(String(message.metadata?.decision_report_scope_instruction), /primary scope/);
});

test("weddingDecisionProjectionToAfpMessage preserves typed comparison cells", () => {
  const message = weddingDecisionProjectionToAfpMessage({
    ...decision,
    artifactId: "artifact:photography-shortlist",
    artifactTitle: "Photography shortlist",
    selectedOption: {
      ...decision.selectedOption,
      id: "0:aurora-weddings",
      label: "Aurora Weddings",
      detail: "Photography - $4,800 - Available",
      cells: ["Photography", "Aurora Weddings", "$4,800", "Available"],
      columnCells: [
        { header: "Category", label: "Detail", kind: "text", value: "Photography" },
        { header: "Supplier", label: "Option", kind: "option", value: "Aurora Weddings" },
        { header: "Quoted total", label: "Price", kind: "price", value: "$4,800" },
        { header: "Availability", label: "Availability", kind: "availability", value: "Available" },
      ],
    },
  }, "2026-09-12T00:00:00.000Z");
  const selected = message.content.selected_option as Record<string, unknown>;
  const columnCells = selected.column_cells as Array<Record<string, unknown>>;

  assert.deepEqual(columnCells.map((cell) => cell.label), ["Detail", "Option", "Price", "Availability"]);
  assert.deepEqual(columnCells.map((cell) => cell.kind), ["text", "option", "price", "availability"]);
  assert.deepEqual(
    (message.content.semantic_object.comparison.columns as Array<Record<string, unknown>>).map((column) => column.kind),
    ["text", "option", "price", "availability"],
  );
  assert.deepEqual(message.content.semantic_object.comparison.rows[0].cells, [
    "Photography",
    "Aurora Weddings",
    "$4,800",
    "Available",
  ]);
  assert.match(String(message.content.markdown), /Price: \$4,800/);
  assert.match(String(message.content.markdown), /Availability: Available/);
  assert.ok((message.metadata?.searchable_terms as string[]).includes("Price"));
  assert.deepEqual(
    (message.metadata?.selected_option_column_cells as Array<Record<string, unknown>>).map((cell) => cell.value),
    ["Photography", "Aurora Weddings", "$4,800", "Available"],
  );
});

test("weddingDecisionProjectionToAfpMessage marks unselected comparison vendors audit-only", () => {
  const message = weddingDecisionProjectionToAfpMessage({
    ...decision,
    id: "wedding_decision:workspace:vendor-comparison:harbour-studio",
    artifactId: "artifact:top-vendor-comparison",
    artifactTitle: "Top vendor comparison",
    metadata: {
      ...decision.metadata,
      source: "vendor_search_comparison",
      vendorComparisonSelection: {
        selectedVendorsContinueToFollowUp: true,
        unselectedVendorsLeaveActiveQueues: true,
        approvalRequiredBeforeOutreach: true,
        noExternalSendWithoutApproval: true,
      },
    },
    selectedOption: {
      ...decision.selectedOption,
      id: "vendor_choice:harbour_studio:1",
      label: "Harbour Studio",
      detail: "Sydney documentary wedding photographer with transparent packages.",
      cells: ["#1 Harbour Studio", "Transparent packages", "https://harbour-studio.example"],
    },
  }, "2026-09-12T00:00:00.000Z");

  assert.equal(message.content.vendor_comparison_queue_policy.unselected_vendors_audit_only, true);
  assert.equal(message.content.vendor_comparison_queue_policy.no_queue_rehydration_for_unselected, true);
  assert.equal(message.metadata?.vendor_comparison_selected_vendors_active, true);
  assert.equal(message.metadata?.vendor_comparison_unselected_vendors_audit_only, true);
  assert.equal(message.metadata?.vendor_comparison_no_queue_rehydration_for_unselected, true);
  assert.match(String(message.content.markdown), /Keep only selected vendors in active follow-up queues/i);
  assert.match(String(message.content.markdown), /Do not regenerate decision queue or response queue work for unselected vendors/i);
  assert.ok((message.metadata?.searchable_terms as string[]).includes("unselected vendors audit only"));
});

test("weddingDecisionProjectionToAfpMessage drops malformed source URLs", () => {
  const message = weddingDecisionProjectionToAfpMessage({
    ...decision,
    sourceUrls: [
      "javascript:alert(1)",
      "not-a-url",
      "http://localhost:8787/harbour-house",
      "https://127.0.0.1/harbour-house",
      "https://example.com/harbour-house",
    ],
  }, "2026-09-12T00:00:00.000Z");

  assert.deepEqual(message.content.source_urls, ["https://example.com/harbour-house"]);
  assert.deepEqual(message.metadata?.source_urls, ["https://example.com/harbour-house"]);
  assert.match(String(message.content.markdown), /https:\/\/example\.com\/harbour-house/);
  assert.doesNotMatch(String(message.content.markdown), /javascript:alert/);
  assert.doesNotMatch(String(message.content.markdown), /localhost/);
  assert.doesNotMatch(String(message.content.markdown), /127\.0\.0\.1/);
  assert.doesNotMatch(String(message.metadata?.searchable_terms), /not-a-url/);
});

test("weddingDecisionProjectionToAfpMessage supertags budget decisions for graph synthesis", () => {
  const message = weddingDecisionProjectionToAfpMessage({
    ...decision,
    artifactId: "wedding-budget-allocation",
    artifactTitle: "Wedding Budget",
    artifactKind: "budget_sheet",
    selectedOption: {
      ...decision.selectedOption,
      id: "total-budget",
      label: "$30,000 total",
      detail: "Allocated across categories.",
      cells: ["Venue & Ceremony: $10,000", "Catering & Drinks: $8,000"],
      preferenceSummaryLabel: "Overall budget and category allocation set by the couple.",
    },
  }, "2026-09-12T00:00:00.000Z");

  assert.equal(message.content.budget_decision, true);
  assert.equal(message.metadata?.budget_decision, true);
  assert.ok(message.supertags?.includes("wedding_budget"));
  assert.ok(message.supertags?.includes("topology:wedding_budget"));
  assert.ok(message.supertags?.includes("decisionos"));
  assert.ok((message.metadata?.searchable_terms as string[]).includes("wedding budget decision"));
  assert.equal(message.content.semantic_object.kind, "wedding_budget_impact");
  assert.equal(message.metadata?.semantic_kind, "wedding_budget_impact");
});

test("weddingDecisionProjectionToAfpMessage redacts imported source labels", () => {
  const message = weddingDecisionProjectionToAfpMessage({
    ...decision,
    metadata: {
      ...decision.metadata,
      supertags: ["wedding_import", "wedding_import:spreadsheet", "wedding_import_status:synthesized"],
    },
    artifactId: "artifact:imported-budget",
    artifactTitle: "Imported XLSX: private-family-budget.xlsx",
    artifactKind: "research",
    sourceLabels: ["original upload saved", "source: private-family-budget.xlsx"],
    sourceUrls: [
      "https://storage.example.test/uploads/private-family-budget.xlsx?token=private",
      "https://example.com/vendor-quote",
    ],
    sourceProviderLabels: [],
    sourceCountsByProvider: null,
  }, "2026-09-12T00:00:00.000Z");
  const serialized = JSON.stringify(message);

  assert.deepEqual(message.content.source_labels, ["Imported private planning file"]);
  assert.equal(message.content.source_label_count, 2);
  assert.equal(message.content.imported_private_evidence, true);
  assert.equal(message.content.artifact_title, "Imported private planning file");
  assert.deepEqual(message.content.source_urls, ["https://example.com/vendor-quote"]);
  assert.deepEqual(message.metadata?.source_labels, ["Imported private planning file"]);
  assert.equal(message.metadata?.source_label_count, 2);
  assert.equal(message.metadata?.imported_private_evidence, true);
  assert.equal(message.metadata?.artifact_title, "Imported private planning file");
  assert.deepEqual(message.metadata?.source_urls, ["https://example.com/vendor-quote"]);
  assert.match(String(message.content.markdown), /Private import source labels redacted: 2/);
  assert.match(String(message.content.markdown), /Source artifact: Imported private planning file/);
  assert.match(String(message.content.markdown), /https:\/\/example\.com\/vendor-quote/);
  assert.equal(serialized.includes("private-family-budget.xlsx"), false);
  assert.equal(serialized.includes("Imported XLSX"), false);
  assert.equal(serialized.includes("storage.example.test"), false);
  assert.equal(serialized.includes("token=private"), false);
  assert.equal(serialized.includes("original upload saved"), false);
});

test("weddingDecisionProjectionToAfpSendInput is dispatch-ready", () => {
  const sendInput = weddingDecisionProjectionToAfpSendInput(decision, "2026-09-12T00:00:00.000Z");

  assert.equal(sendInput.type, "decision");
  assert.equal(sendInput.subtype, "wedding_decision_selection");
  assert.equal(sendInput.store_in_relational, true);
  assert.ok(sendInput.supertags?.includes("wedding_decision"));
  assert.ok(sendInput.references?.some((reference) => reference.target === "artifact:venue-shortlist"));
});

test("buildWeddingProjectionQueueState includes decision outputs and sent markers", () => {
  const storage = memoryStorage();
  const pending = buildWeddingProjectionQueueState({
    decisionItems: [decision],
    nowIso: "2026-09-12T00:00:00.000Z",
    storage,
  });

  assert.equal(pending.pendingItems.length, 1);
  assert.equal(pending.pendingItems[0]?.kind, "decision");
  assert.equal(pending.pendingItems[0]?.title, "Decision: Harbour House");
  assert.equal(pending.pendingSendInputs[0]?.type, "decision");

  markWeddingDecisionAfpProjectionSent(decision.id, storage);
  const sent = buildWeddingProjectionQueueState({
    decisionItems: [decision],
    nowIso: "2026-09-12T00:00:00.000Z",
    storage,
  });

  assert.equal(sent.pendingItems.length, 0);
  assert.equal(sent.sentItems[0]?.kind, "decision");
  assert.equal(sent.sentItems[0]?.statusLabel, "Already saved to Decisions");
});
