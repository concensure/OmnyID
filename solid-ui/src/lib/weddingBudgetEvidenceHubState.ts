// @locs-version: 1.0
import type { WeddingResponseWorkspaceViewState, WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";

export type WeddingBudgetEvidenceTabId = "overview" | "quotes" | "contracts" | "deposits" | "payments" | "forecast";

export type WeddingBudgetEvidenceDocument = {
  id: string;
  artifactId: string;
  title: string;
  kindLabel: string;
  statusLabel: string;
  detailLabel: string;
};

export type WeddingBudgetEvidenceMoneyRow = {
  id: string;
  title: string;
  amountLabel: string;
  statusLabel: string;
  detailLabel: string;
  artifactId: string | null;
};

export type WeddingBudgetEvidenceHubState = {
  tabs: Array<{ id: WeddingBudgetEvidenceTabId; label: string; count: number }>;
  overview: Array<{ id: string; label: string; value: string; detail: string }>;
  quotes: WeddingBudgetEvidenceMoneyRow[];
  contracts: WeddingBudgetEvidenceDocument[];
  deposits: WeddingBudgetEvidenceMoneyRow[];
  payments: WeddingBudgetEvidenceMoneyRow[];
  forecast: WeddingBudgetEvidenceMoneyRow[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function money(amount: number | null, currency = "AUD"): string {
  if (amount === null || !Number.isFinite(amount)) return "Amount needed";
  return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

function artifactSearchText(artifact: WeddingWorkspaceArtifactPreview): string {
  return [artifact.title, artifact.category, ...artifact.metadataLabels, ...artifact.sourceLabels].map(clean).join(" ").toLowerCase();
}

function approvalLabel(value: WeddingWorkspaceArtifactPreview["approvalState"]): string {
  if (value === "pending_user_approval") return "Needs review";
  if (value === "approved") return "Approved";
  if (value === "sent") return "Shared";
  if (value === "archived") return "Archived";
  return "Draft";
}

function documentRow(artifact: WeddingWorkspaceArtifactPreview): WeddingBudgetEvidenceDocument {
  return {
    id: `document:${artifact.artifactId}`,
    artifactId: artifact.artifactId,
    title: clean(artifact.title) || "Wedding document",
    kindLabel: artifact.kind === "legal" ? "Contract document" : artifact.category,
    statusLabel: approvalLabel(artifact.approvalState),
    detailLabel: `${artifact.evidenceSummary.sourceCountLabel}. Stored in Documents.`,
  };
}

function linkedArtifacts(state: WeddingResponseWorkspaceViewState, ids: Set<string>): WeddingWorkspaceArtifactPreview[] {
  return state.artifactPreviews.filter((artifact) => ids.has(artifact.artifactId));
}

export function buildWeddingBudgetEvidenceHubState(state: WeddingResponseWorkspaceViewState): WeddingBudgetEvidenceHubState {
  const tracking = state.budgetTracking;
  const quoteArtifactIds = new Set(tracking.lineItems.flatMap((item) => item.linkedArtifactId ?? []));
  const quoteKeywordArtifacts = state.artifactPreviews.filter((artifact) => /\b(?:quote|quotation|proposal|estimate|pricing)\b/.test(artifactSearchText(artifact)));
  const quoteDocuments = [...new Map([...linkedArtifacts(state, quoteArtifactIds), ...quoteKeywordArtifacts].map((artifact) => [artifact.artifactId, artifact])).values()];
  const contracts = state.artifactPreviews
    .filter((artifact) => artifact.kind === "legal" || /\b(?:contract|agreement|terms|booking form)\b/.test(artifactSearchText(artifact)))
    .map(documentRow);

  const quotes: WeddingBudgetEvidenceMoneyRow[] = tracking.lineItems.map((item) => ({
    id: `quote:${item.id}`,
    title: item.vendorName,
    amountLabel: money(item.amount, item.currency),
    statusLabel: item.priceStatus === "quoted" ? "Quoted" : item.priceStatus === "projected" ? "Projected" : "Needs amount",
    detailLabel: `${item.categoryLabel} · ${item.sourceLabel}`,
    artifactId: item.linkedArtifactId,
  }));
  for (const artifact of quoteDocuments) {
    if (quotes.some((row) => row.artifactId === artifact.artifactId)) continue;
    quotes.push({
      id: `quote-document:${artifact.artifactId}`,
      title: artifact.title,
      amountLabel: "Open quote",
      statusLabel: approvalLabel(artifact.approvalState),
      detailLabel: "Quote file in Documents",
      artifactId: artifact.artifactId,
    });
  }

  const paymentRows: WeddingBudgetEvidenceMoneyRow[] = tracking.paymentTaskCandidates.map((item) => ({
    id: `payment:${item.id}`,
    title: item.title || item.vendorName,
    amountLabel: item.dueAmountLabel ?? "Amount needed",
    statusLabel: item.dueDateLabel ? "Upcoming" : "Date needed",
    detailLabel: [item.vendorName, item.dueDateLabel, item.reasonLabel].filter(Boolean).join(" · "),
    artifactId: item.linkedArtifactId,
  }));
  const deposits = paymentRows.filter((row) => /\bdeposit\b/i.test(`${row.title} ${row.detailLabel}`));
  const payments = paymentRows.filter((row) => !/\bdeposit\b/i.test(`${row.title} ${row.detailLabel}`));

  const forecast: WeddingBudgetEvidenceMoneyRow[] = tracking.categoryRollups.map((item) => ({
    id: `forecast:${item.categoryLabel}`,
    title: item.categoryLabel,
    amountLabel: money(item.amount, item.currency),
    statusLabel: item.unknownCount > 0 ? `${item.unknownCount} amount${item.unknownCount === 1 ? "" : "s"} needed` : item.projectedCount > 0 ? "Includes projections" : "Quoted",
    detailLabel: `${item.itemCount} item${item.itemCount === 1 ? "" : "s"} · ${item.quotedCount} quoted · ${item.projectedCount} projected`,
    artifactId: null,
  }));
  for (const allocation of tracking.budgetAllocation) {
    if (forecast.some((row) => row.title.toLowerCase() === allocation.categoryLabel.toLowerCase())) continue;
    forecast.push({
      id: `allocation:${allocation.categoryLabel}`,
      title: allocation.categoryLabel,
      amountLabel: money(allocation.amount),
      statusLabel: "Allocated",
      detailLabel: "Couple-set category budget",
      artifactId: null,
    });
  }

  const target = tracking.budgetTargetAmount;
  const remaining = tracking.remainingAmount;
  const overview = [
    { id: "target", label: "Budget target", value: money(target), detail: target === null ? "Add a target to start forecasting" : "Couple-set planning limit" },
    { id: "known", label: "Known spend", value: money(tracking.totalKnownAmount), detail: `${tracking.quotedCount} quoted · ${tracking.projectedCount} projected` },
    { id: "remaining", label: "Remaining", value: money(remaining), detail: remaining === null ? "Available after a target is set" : remaining < 0 ? `${money(tracking.overBudgetAmount)} over target` : "Before unknown amounts" },
    { id: "unknown", label: "Needs an amount", value: String(tracking.unknownCount), detail: "Items excluded from totals until confirmed" },
  ];

  return {
    tabs: [
      { id: "overview", label: "Overview", count: overview.length },
      { id: "quotes", label: "Quotes", count: quotes.length },
      { id: "contracts", label: "Contracts", count: contracts.length },
      { id: "deposits", label: "Deposits", count: deposits.length },
      { id: "payments", label: "Payments", count: payments.length },
      { id: "forecast", label: "Forecast", count: forecast.length },
    ],
    overview,
    quotes,
    contracts,
    deposits,
    payments,
    forecast,
  };
}
