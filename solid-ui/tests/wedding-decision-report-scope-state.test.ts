import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingDecisionReportScopeState } from "../src/lib/weddingDecisionReportScopeState.ts";
import type { WeddingDecisionSelectionOption } from "../src/lib/weddingDecisionSelectionState.ts";
import type { WeddingVendorFreshnessRow } from "../src/lib/weddingVendorFreshnessState.ts";

function option(input: Partial<WeddingDecisionSelectionOption> = {}): WeddingDecisionSelectionOption {
  return {
    id: "0:harbour-house",
    rowIndex: 0,
    label: "Harbour House",
    detail: "Sydney waterfront venue",
    cells: ["Harbour House", "Sydney", "waterfront venue"],
    selected: true,
    preferenceFitLabels: ["waterfront/harbour feel"],
    missingPreferenceLabels: [],
    tradeoffLabels: [],
    preferenceSummaryLabel: "1 preference fit signal",
    ...input,
  };
}

function freshness(input: Partial<WeddingVendorFreshnessRow> = {}): WeddingVendorFreshnessRow {
  return {
    vendorName: "Harbour House",
    category: "Venue",
    sourceUrl: "https://venue.example",
    sourceCheckedAt: "2026-09-14",
    sourceFreshness: "current",
    priceFreshness: "verified",
    availabilityFreshness: "verified",
    actionLabel: "Ready for shortlist review.",
    ...input,
  };
}

test("buildWeddingDecisionReportScopeState keeps reports comparative without a selection", () => {
  const state = buildWeddingDecisionReportScopeState();

  assert.equal(state.status, "no_selection");
  assert.equal(state.collapseAlternatives, false);
  assert.match(state.reportInstructionLabel, /compare the shortlist/i);
  assert.match(state.blockerLabels[0] ?? "", /Select an option/i);
});

test("buildWeddingDecisionReportScopeState narrows reports when selected vendor evidence is ready", () => {
  const state = buildWeddingDecisionReportScopeState({
    artifactTitle: "Venue shortlist",
    selectedOption: option(),
    freshnessRows: [freshness()],
  });

  assert.equal(state.status, "scoped_ready");
  assert.equal(state.collapseAlternatives, true);
  assert.equal(state.includeAlternativesAsAudit, true);
  assert.equal(state.blockerLabels.length, 0);
  assert.match(state.reportInstructionLabel, /Use Harbour House as the primary scope/i);
  assert.ok(state.auditContextLabels.some((label) => /price verified/i.test(label)));
});

test("buildWeddingDecisionReportScopeState blocks confident narrowing on stale vendor evidence", () => {
  const state = buildWeddingDecisionReportScopeState({
    artifactTitle: "Venue shortlist",
    selectedOption: option(),
    freshnessRows: [freshness({
      sourceFreshness: "stale",
      priceFreshness: "needs_recheck",
      availabilityFreshness: "missing",
    })],
  });

  assert.equal(state.status, "scoped_needs_recheck");
  assert.equal(state.collapseAlternatives, true);
  assert.ok(state.blockerLabels.some((label) => /source needs a live refresh/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /price\/package evidence needs recheck/i.test(label)));
  assert.ok(state.blockerLabels.some((label) => /availability needs recheck/i.test(label)));
  assert.match(state.nextActionLabels[0] ?? "", /Refresh source, price, and availability/i);
});

test("buildWeddingDecisionReportScopeState redacts imported artifact titles in report labels", () => {
  const state = buildWeddingDecisionReportScopeState({
    artifactTitle: "Imported XLSX: venues.xlsx",
    selectedOption: option(),
    freshnessRows: [freshness()],
  });
  const serialized = JSON.stringify(state);

  assert.equal(state.status, "scoped_ready");
  assert.match(state.reportInstructionLabel, /Imported private planning file/);
  assert.ok(state.auditContextLabels.includes("Source artifact: Imported private planning file"));
  assert.equal(serialized.includes("venues.xlsx"), false);
});

test("buildWeddingDecisionReportScopeState carries preference tradeoffs into report blockers", () => {
  const state = buildWeddingDecisionReportScopeState({
    artifactTitle: "Venue shortlist",
    selectedOption: option({
      tradeoffLabels: ["wet-weather backup"],
      missingPreferenceLabels: ["budget control"],
    }),
    freshnessRows: [freshness()],
  });

  assert.equal(state.status, "scoped_needs_recheck");
  assert.ok(state.blockerLabels.includes("Preference tradeoff: wet-weather backup"));
  assert.ok(state.blockerLabels.includes("Preference not evidenced: budget control"));
  assert.match(state.nextActionLabels.at(-1) ?? "", /preference tradeoffs/i);
});
