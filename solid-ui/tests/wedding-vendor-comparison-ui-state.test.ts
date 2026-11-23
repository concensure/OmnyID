import assert from "node:assert/strict";
import test from "node:test";

import { buildWeddingDecisionSelectionState } from "../src/lib/weddingDecisionSelectionState.ts";
import {
  buildWeddingVendorComparisonUiState,
  weddingVendorComparisonSourceUrl,
} from "../src/lib/weddingVendorComparisonUiState.ts";

const table = {
  kind: "table" as const,
  headers: ["Vendor", "Fit", "Source"],
  rows: [
    ["Harbour Studio", "Documentary style and transparent pricing", "https://harbour-studio.example/path"],
    ["Budget Lens", "Simple packages", "https://budget-lens.example"],
    ["Local Test", "Should not expose local source", "http://localhost:8787/vendor"],
  ],
  rowCountLabel: "3 rows",
};

const topFiveTable = {
  ...table,
  rows: [
    ["Harbour Studio", "Documentary style and transparent pricing", "https://harbour-studio.example/path"],
    ["Budget Lens", "Simple packages", "https://budget-lens.example"],
    ["Portrait Hall", "Reviews and portraits", "https://portrait-hall.example"],
    ["Generic Events", "General event services", "https://generic-events.example"],
    ["Garden Frames", "Outdoor gallery", "https://garden-frames.example"],
  ],
  rowCountLabel: "5 rows",
};

test("buildWeddingVendorComparisonUiState exposes row actions and enabled follow-up CTA", () => {
  const decision = buildWeddingDecisionSelectionState({
    artifactId: "artifact:top-vendors",
    artifactKind: "vendor_table",
    table,
    selectedOptionIds: ["vendor_choice:harbour_studio:1", "1:budget-lens"],
  });
  const state = buildWeddingVendorComparisonUiState({
    decision,
    headers: table.headers,
  });

  assert.equal(state.dynamic, true);
  assert.equal(state.footer.enabled, true);
  assert.equal(state.footer.actionLabel, "Confirm choices and review follow-up");
  assert.equal(state.footer.summaryLabel, "2 vendors selected for approval-gated follow-up");
  assert.equal(state.footer.consequenceLabel, "1 unselected vendor will leave active queues; selected vendors continue to follow-up.");
  assert.equal(state.footer.confirmationLabel, "Your selected vendors become the active follow-up set after this decision is projected; unselected vendors remain in the log only.");
  assert.equal(state.footer.unselectedCount, 1);
  assert.equal(state.resolution.resolved, true);
  assert.equal(state.resolution.statusLabel, "Resolved comparison");
  assert.deepEqual(state.resolution.selectedVendorLabels, ["Harbour Studio", "Budget Lens"]);
  assert.match(state.resolution.detailLabel, /decision log/i);
  assert.equal(state.footer.targetMenu, "response_queue");
  assert.deepEqual(state.rowActions.map((action) => action.selectLabel), [
    "Selected for follow-up",
    "Selected for follow-up",
    "Select for follow-up",
  ]);
  assert.equal(state.rowActions[0]?.sourceUrl, "https://harbour-studio.example/path");
  assert.equal(state.rowActions[0]?.sourceLabel, "Open Harbour Studio source");
});

test("buildWeddingVendorComparisonUiState keeps footer disabled before selection", () => {
  const decision = buildWeddingDecisionSelectionState({
    artifactId: "artifact:top-vendors",
    artifactKind: "vendor_table",
    table,
  });
  const state = buildWeddingVendorComparisonUiState({
    decision,
    headers: table.headers,
  });

  assert.equal(state.dynamic, true);
  assert.equal(state.footer.enabled, false);
  assert.equal(state.footer.actionLabel, "Choose vendors first");
  assert.equal(state.footer.summaryLabel, "Select one or more vendors to prepare follow-up");
  assert.equal(state.footer.consequenceLabel, "No vendor follow-up will be prepared until at least one row is selected.");
  assert.equal(state.footer.confirmationLabel, "Choose at least one vendor before OmnyID prepares outreach or follow-up work.");
  assert.equal(state.footer.unselectedCount, 3);
  assert.equal(state.resolution.resolved, false);
  assert.equal(state.resolution.statusLabel, "Needs vendor choice");
  assert.match(state.resolution.detailLabel, /active decision queue/i);
});

test("weddingVendorComparisonSourceUrl rejects malformed and local source URLs", () => {
  assert.equal(weddingVendorComparisonSourceUrl({ cells: ["Vendor", "Fit", "https://vendor.example"] }, table.headers), "https://vendor.example/");
  assert.equal(weddingVendorComparisonSourceUrl({ cells: ["Vendor", "Fit", "javascript:alert(1)"] }, table.headers), null);
  assert.equal(weddingVendorComparisonSourceUrl({ cells: ["Vendor", "Fit", "http://localhost:3000"] }, table.headers), null);
  assert.equal(weddingVendorComparisonSourceUrl({ cells: ["Vendor", "Fit", "https://127.0.0.1/profile"] }, table.headers), null);
});

test("buildWeddingVendorComparisonUiState defaults comparison to top three and expands to five", () => {
  const decision = buildWeddingDecisionSelectionState({
    artifactId: "artifact:top-vendors",
    artifactKind: "vendor_table",
    table: topFiveTable,
  });
  const collapsed = buildWeddingVendorComparisonUiState({
    decision,
    headers: topFiveTable.headers,
    comparisonHandoffAvailable: true,
    expanded: false,
  });
  const expanded = buildWeddingVendorComparisonUiState({
    decision,
    headers: topFiveTable.headers,
    comparisonHandoffAvailable: true,
    expanded: true,
  });

  assert.equal(collapsed.visibleOptions.length, 3);
  assert.deepEqual(collapsed.visibleOptions.map((option) => option.label), ["Harbour Studio", "Budget Lens", "Portrait Hall"]);
  assert.equal(collapsed.expansion.canExpand, true);
  assert.equal(collapsed.expansion.hiddenCount, 2);
  assert.equal(collapsed.expansion.summaryLabel, "Showing the top 3 choices first. 2 more source-backed options available.");
  assert.equal(collapsed.expansion.actionLabel, "Show top 5");
  assert.equal(expanded.visibleOptions.length, 5);
  assert.equal(expanded.expansion.hiddenCount, 0);
});

test("buildWeddingVendorComparisonUiState keeps selected vendors visible instead of collapsed", () => {
  const decision = buildWeddingDecisionSelectionState({
    artifactId: "artifact:top-vendors",
    artifactKind: "vendor_table",
    table: topFiveTable,
    selectedOptionIds: ["4:garden-frames"],
  });
  const state = buildWeddingVendorComparisonUiState({
    decision,
    headers: topFiveTable.headers,
    comparisonHandoffAvailable: true,
    expanded: false,
  });

  assert.deepEqual(state.visibleOptions.map((option) => option.label), ["Garden Frames"]);
  assert.equal(state.expansion.canExpand, false);
  assert.equal(state.expansion.hiddenCount, 0);
  assert.equal(state.footer.unselectedCount, 4);
});
