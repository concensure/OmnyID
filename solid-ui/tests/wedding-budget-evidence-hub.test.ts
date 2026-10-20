import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { buildWeddingBudgetEvidenceHubState } from "@/lib/weddingBudgetEvidenceHubState";

function fixture(): WeddingResponseWorkspaceViewState {
  return {
    artifactPreviews: [
      {
        artifactId: "artifact:quote",
        title: "Harbour Photos quotation",
        kind: "vendor_table",
        category: "Vendors",
        createdAt: 1,
        approvalState: "approved",
        metadataLabels: ["quote"],
        sourceLabels: ["Harbour Photos"],
        evidenceSummary: { statusLabel: "Linked", sourceCountLabel: "1 source", warningLabel: null, labels: [] },
      },
      {
        artifactId: "artifact:contract",
        title: "Garden Hall booking contract",
        kind: "legal",
        category: "Legal",
        createdAt: 2,
        approvalState: "pending_user_approval",
        metadataLabels: [],
        sourceLabels: ["Uploaded contract"],
        evidenceSummary: { statusLabel: "Linked", sourceCountLabel: "1 source", warningLabel: null, labels: [] },
      },
    ],
    budgetTracking: {
      lineItems: [{
        id: "photos",
        linkedArtifactId: "artifact:quote",
        vendorName: "Harbour Photos",
        categoryLabel: "Photography",
        amount: 4500,
        currency: "AUD",
        priceStatus: "quoted",
        sourceLabel: "Harbour Photos quotation",
        confidenceLabel: "Quoted",
        warningLabels: [],
        rowCells: [],
      }],
      categoryRollups: [{ categoryLabel: "Photography", amount: 4500, itemCount: 1, projectedCount: 0, quotedCount: 1, unknownCount: 0, currency: "AUD" }],
      paymentTaskCandidates: [
        { id: "deposit", title: "Pay venue deposit", categoryLabel: "Venue", vendorName: "Garden Hall", dueAmountLabel: "$2,000", dueDateLabel: "12 Nov", dueAt: "2026-11-12", priorityLabel: "High", reasonLabel: "Deposit due", sourceLabel: "Contract", linkedArtifactId: "artifact:contract" },
        { id: "balance", title: "Pay photography balance", categoryLabel: "Photography", vendorName: "Harbour Photos", dueAmountLabel: "$4,500", dueDateLabel: "1 Sep", dueAt: "2027-09-01", priorityLabel: "Normal", reasonLabel: "Final payment", sourceLabel: "Quote", linkedArtifactId: "artifact:quote" },
      ],
      budgetAllocation: [{ categoryId: "venue", categoryLabel: "Venue", amount: 12000 }],
      budgetTargetAmount: 30000,
      remainingAmount: 25500,
      overBudgetAmount: 0,
      budgetUtilizationPercent: 15,
      budgetStatusLabel: "On track",
      totalProjectedAmount: 0,
      totalQuotedAmount: 4500,
      totalKnownAmount: 4500,
      unknownCount: 0,
      projectedCount: 0,
      quotedCount: 1,
      summaryLabel: "One quote",
      warningLabels: [],
    },
  } as WeddingResponseWorkspaceViewState;
}

test("budget hub separates quotes, contracts, deposits, payments and forecast", () => {
  const state = buildWeddingBudgetEvidenceHubState(fixture());
  assert.equal(state.quotes.length, 1);
  assert.equal(state.quotes[0]?.artifactId, "artifact:quote");
  assert.equal(state.contracts.length, 1);
  assert.equal(state.contracts[0]?.artifactId, "artifact:contract");
  assert.equal(state.contracts[0]?.statusLabel, "Needs review");
  assert.equal(state.deposits.length, 1);
  assert.equal(state.payments.length, 1);
  assert.equal(state.forecast.length, 2);
  assert.deepEqual(state.tabs.map((tab) => tab.label), ["Overview", "Quotes", "Contracts", "Deposits", "Payments", "Forecast"]);
});

test("budget hub keeps Documents canonical and uses mobile-contained tabs", () => {
  const hub = readFileSync(resolve(process.cwd(), "src/components/WeddingBudgetEvidenceHub.tsx"), "utf8");
  const workspace = readFileSync(resolve(process.cwd(), "src/components/WeddingResponseWorkspaceView.tsx"), "utf8");
  assert.match(hub, /Stored in Documents|source files in Documents/);
  assert.match(hub, /Open in Documents/);
  assert.match(hub, /overflow-x-auto/);
  assert.match(hub, /role="tablist"/);
  assert.match(workspace, /props\.onSelectMenu\?\.\("documents"\)/);
});
