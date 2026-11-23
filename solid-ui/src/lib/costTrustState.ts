// @locs-version: 1.0
export type CostTrustGuidanceInput = {
  billingStatusAvailable?: boolean;
  hostedBudgetCents?: number | null;
  quotaState?: string | null;
};

export type CostTrustGuidance = {
  coverage: string[];
  caveats: string[];
};

export function buildCostTrustGuidance(input: CostTrustGuidanceInput): CostTrustGuidance {
  const billingStatusAvailable = input.billingStatusAvailable !== false;
  const hostedBudgetCents = Number(input.hostedBudgetCents ?? 0);
  const quotaState = String(input.quotaState ?? "").trim().toLowerCase();

  const coverage = [
    billingStatusAvailable
      ? "Storage quota, remaining capacity, and archive-only state come from the mounted billing status."
      : "Storage quota, remaining capacity, and archive-only state appear here once billing status is available.",
    hostedBudgetCents > 0
      ? "Hosted AI monthly budget and current-month hosted LLM usage are tracked here."
      : "Hosted AI budget tracking appears here once hosted AI is enabled with a monthly budget.",
    "Mounted document parsing and audio transcription costs feed into the cost view.",
  ];

  const caveats = [
    "Some background jobs or provider-specific execution paths may still land later or remain only partially metered.",
    "Treat this as an operational budget view, not a finalized invoice-grade ledger.",
  ];

  if (!billingStatusAvailable) {
    caveats.push("Billing-backed storage signals are temporarily unavailable, so storage policy and capacity guidance may be incomplete.");
  }

  if (quotaState === "exceeded") {
    caveats.push("Quota overflow can push the workspace into archive-only mode, which may degrade retrieval and live agent performance.");
  }

  return { coverage, caveats };
}
