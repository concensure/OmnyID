// @locs-version: 1.0
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type { WeddingBudgetAllocationCategoryAmount } from "@/lib/weddingBudgetAllocationState";
import type {
  WeddingBudgetLineItem,
  WeddingBudgetPaymentTaskCandidate,
} from "@/lib/weddingBudgetTrackingState";

export type WeddingBudgetQuoteNormalForm = {
  id: string;
  linkedArtifactId: string | null;
  vendorName: string;
  categoryLabel: string;
  basePriceLabel: string;
  includedLabel: string;
  hoursLabel: string;
  guestUnitLabel: string;
  addOnsLabel: string;
  taxLabel: string;
  serviceFeeLabel: string;
  travelFeeLabel: string;
  overtimeLabel: string;
  cancellationLabel: string;
  depositScheduleLabel: string;
  missingLabels: string[];
};

export type WeddingBudgetMonthlyCashNeed = {
  monthLabel: string;
  amount: number;
  currency: string;
  itemCount: number;
  amountToConfirmCount: number;
};

export type WeddingBudgetScenario = {
  id: "safe" | "balanced" | "stretch";
  label: string;
  targetAmount: number | null;
  remainingAmount: number | null;
  summaryLabel: string;
  meaningLabel: string;
  nextStepLabel: string;
};

export type WeddingBudgetContribution = {
  personLabel: string;
  amountLabel: string;
  conditionLabel: string;
};

export type WeddingBudgetInsightsState = {
  committedAmount: number;
  estimatedAmount: number;
  paidAmount: number;
  forecastAmount: number;
  uncertaintyAmount: number;
  forecastRangeLabel: string;
  remainingAmount: number | null;
  atRiskAmount: number;
  riskExplanationLabels: string[];
  feeCoverageLabels: string[];
  missingContextLabels: string[];
  quoteNormalForms: WeddingBudgetQuoteNormalForm[];
  monthlyCashNeeds: WeddingBudgetMonthlyCashNeed[];
  monthlyCashNeedsSummaryLabel: string;
  scenarios: WeddingBudgetScenario[];
  unaffordableWarningLabels: string[];
  contributionRows: WeddingBudgetContribution[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function moneyValue(text: string): number | null {
  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/(?:\$|aud|usd|gbp|eur)?\s*(\d{2,8})(?:\.\d+)?/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function moneyLabel(amount: number | null, currency = "AUD"): string {
  return amount === null
    ? "Ask vendor"
    : amount.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
}

function firstMatch(text: string, pattern: RegExp, fallback = "Ask vendor"): string {
  const match = text.match(pattern);
  return clean(match?.[1]) || fallback;
}

function labelForFee(text: string, words: RegExp, fallback = "Ask vendor"): string {
  const sentence = text.split(/[.;\n]/).find((part) => words.test(part));
  return clean(sentence) || fallback;
}

function quoteNormalForm(item: WeddingBudgetLineItem): WeddingBudgetQuoteNormalForm {
  const text = [item.vendorName, item.categoryLabel, ...item.rowCells].map(clean).join(" ");
  const baseAmount = item.amount ?? moneyValue(text);
  const form: WeddingBudgetQuoteNormalForm = {
    id: item.id,
    linkedArtifactId: item.linkedArtifactId,
    vendorName: item.vendorName,
    categoryLabel: item.categoryLabel,
    basePriceLabel: moneyLabel(baseAmount, item.currency),
    includedLabel: firstMatch(text, /\b(?:includes?|included|package includes?)[:\s-]+([^.;|]+)/i),
    hoursLabel: firstMatch(text, /\b(\d+(?:\.\d+)?\s*(?:hour|hr)s?)\b/i),
    guestUnitLabel: firstMatch(text, /\b(\d+\s*(?:guests?|people|pax)|per\s+(?:guest|person|head|unit)[^.;|]*)/i),
    addOnsLabel: labelForFee(text, /\b(add-?ons?|extras?|upgrade|optional)\b/i),
    taxLabel: labelForFee(text, /\b(tax|gst|vat)\b/i),
    serviceFeeLabel: labelForFee(text, /\b(service\s*(?:fee|charge)|surcharge)\b/i),
    travelFeeLabel: labelForFee(text, /\b(travel|parking|delivery|freight)\b/i),
    overtimeLabel: labelForFee(text, /\b(overtime|extra\s*hour)\b/i),
    cancellationLabel: labelForFee(text, /\b(cancel|refund|non-refundable|postpone)\b/i),
    depositScheduleLabel: labelForFee(text, /\b(deposit|instalment|installment|payment schedule|balance due)\b/i),
    missingLabels: [],
  };
  form.missingLabels = [
    form.includedLabel === "Ask vendor" ? "what is included" : null,
    form.hoursLabel === "Ask vendor" ? "hours" : null,
    form.taxLabel === "Ask vendor" ? "tax/GST" : null,
    form.serviceFeeLabel === "Ask vendor" ? "service fee" : null,
    form.travelFeeLabel === "Ask vendor" ? "travel or delivery fee" : null,
    form.overtimeLabel === "Ask vendor" ? "overtime" : null,
    form.cancellationLabel === "Ask vendor" ? "cancellation terms" : null,
    form.depositScheduleLabel === "Ask vendor" ? "deposit and payment schedule" : null,
  ].filter((label): label is string => Boolean(label));
  return form;
}

function rowText(artifact: WeddingArtifactInput): string {
  return [
    clean(artifact.title),
    clean(artifact.bodyText),
    ...(artifact.sourceLabels ?? []).map(clean),
  ].join("\n");
}

function paidAmountFromArtifacts(artifacts: readonly WeddingArtifactInput[]): number {
  return artifacts
    .filter((artifact) => artifact.kind === "budget_sheet")
    .flatMap((artifact) => rowText(artifact).split(/\r?\n/))
    .reduce((sum, line) => sum + paidAmountFromLine(line), 0);
}

function paidAmountFromLine(line: string): number {
  const text = clean(line);
  if (!/\bpaid\b/i.test(text)) return 0;
  if (/\b(not\s+paid|unpaid|no\b|pending|outstanding)\b/i.test(text)) return 0;
  const labelled = text.match(/\bpaid\b[^$€£\d]{0,24}((?:\$|aud|usd|gbp|eur)?\s*\d[\d,]*(?:\.\d+)?)/i);
  if (labelled) return moneyValue(labelled[1] ?? "") ?? 0;
  if (/\b(yes|settled|complete|completed)\b/i.test(text)) return moneyValue(text) ?? 0;
  return 0;
}

function monthLabelFromIso(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T09:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { month: "short", year: "numeric" });
}

function monthlyCashNeeds(candidates: readonly WeddingBudgetPaymentTaskCandidate[], currency: string): WeddingBudgetMonthlyCashNeed[] {
  const map = new Map<string, WeddingBudgetMonthlyCashNeed & { sortKey: string }>();
  for (const candidate of candidates) {
    const amount = moneyValue(candidate.dueAmountLabel ?? "");
    const monthLabel = monthLabelFromIso(candidate.dueAt) ?? "Date needed";
    const sortKey = candidate.dueAt ? candidate.dueAt.slice(0, 7) : "9999-99";
    if (!amount && !candidate.dueAt) continue;
    const current = map.get(monthLabel) ?? { monthLabel, amount: 0, currency, itemCount: 0, amountToConfirmCount: 0, sortKey };
    current.amount += amount ?? 0;
    current.itemCount += 1;
    if (!amount) current.amountToConfirmCount += 1;
    map.set(monthLabel, current);
  }
  return Array.from(map.values())
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map(({ sortKey: _sortKey, ...row }) => row);
}

function monthlyCashNeedsSummaryLabel(rows: readonly WeddingBudgetMonthlyCashNeed[], currency: string): string {
  if (rows.length === 0) return "No dated payment schedule is saved yet.";
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const toConfirm = rows.reduce((sum, row) => sum + row.amountToConfirmCount, 0);
  const paymentCount = rows.reduce((sum, row) => sum + row.itemCount, 0);
  const totalLabel = total.toLocaleString(undefined, { style: "currency", currency, maximumFractionDigits: 0 });
  return toConfirm > 0
    ? `${totalLabel} is dated across ${rows.length} month${rows.length === 1 ? "" : "s"}, with ${toConfirm} payment amount${toConfirm === 1 ? "" : "s"} still to confirm.`
    : `${totalLabel} is dated across ${rows.length} month${rows.length === 1 ? "" : "s"} from ${paymentCount} payment${paymentCount === 1 ? "" : "s"}.`;
}

function missingContextLabels(input: { artifacts: readonly WeddingArtifactInput[]; targetAmount: number | null }): string[] {
  const text = input.artifacts.map(rowText).join("\n").toLowerCase();
  return [
    input.targetAmount === null ? "total budget" : null,
    /\b(sydney|melbourne|brisbane|perth|adelaide|canberra|nsw|vic|qld|wa|sa|act|location|venue)\b/.test(text) ? null : "location",
    /\b(20\d{2}-\d{2}-\d{2}|wedding date|date|season)\b/.test(text) ? null : "wedding date",
    /\b(\d+\s*(?:guests?|people|pax)|guest count)\b/.test(text) ? null : "guest count",
    /\b(priority|priorities|must-have|non-negotiable|style|vibe)\b/.test(text) ? null : "priorities",
  ].filter((label): label is string => Boolean(label));
}

function scenarios(targetAmount: number | null, knownAmount: number, currency: string): WeddingBudgetScenario[] {
  const defs = [
    {
      id: "safe" as const,
      label: "Safe",
      ratio: 0.9,
      meaningLabel: "Keeps a buffer for fees, guest changes, and last-minute fixes.",
    },
    {
      id: "balanced" as const,
      label: "Balanced",
      ratio: 1,
      meaningLabel: "Uses the planned budget while leaving choices easy to compare.",
    },
    {
      id: "stretch" as const,
      label: "Stretch",
      ratio: 1.1,
      meaningLabel: "Allows upgrades, but only if later costs still stay affordable.",
    },
  ];
  return defs.map((def) => {
    const target = targetAmount === null ? null : Math.round(targetAmount * def.ratio);
    const remaining = target === null ? null : target - knownAmount;
    const nextStepLabel = target === null
      ? "Set your total budget first."
      : remaining !== null && remaining < 0
        ? "Trim choices or move money from another category before committing."
        : def.id === "stretch"
          ? "Only use this version after taxes, service fees, and payment dates are clear."
          : "";
    return {
      id: def.id,
      label: def.label,
      targetAmount: target,
      remainingAmount: remaining,
      meaningLabel: def.meaningLabel,
      nextStepLabel,
      summaryLabel: target === null
        ? "Set a total budget to compare."
        : remaining !== null && remaining < 0
          ? `${moneyLabel(Math.abs(remaining), currency)} over`
          : knownAmount === 0
            ? "No choices counted yet"
            : `${moneyLabel(remaining, currency)} left`,
    };
  });
}

function feeCoverageLabels(forms: readonly WeddingBudgetQuoteNormalForm[]): string[] {
  const checks = [
    ["Tax/GST", forms.some((form) => form.taxLabel !== "Ask vendor")],
    ["Service charges", forms.some((form) => form.serviceFeeLabel !== "Ask vendor")],
    ["Travel or delivery", forms.some((form) => form.travelFeeLabel !== "Ask vendor")],
    ["Overtime", forms.some((form) => form.overtimeLabel !== "Ask vendor")],
    ["Cancellation terms", forms.some((form) => form.cancellationLabel !== "Ask vendor")],
    ["Deposits and instalments", forms.some((form) => form.depositScheduleLabel !== "Ask vendor")],
  ] as const;
  return checks.map(([label, ready]) => `${label}: ${ready ? "found" : "ask vendor"}`);
}

function uncertaintyAmount(input: {
  forms: readonly WeddingBudgetQuoteNormalForm[];
  lineItems: readonly WeddingBudgetLineItem[];
  budgetTargetAmount: number | null;
  totalProjectedAmount: number;
}): number {
  const unknownCount = input.lineItems.filter((item) => item.amount === null).length;
  const projectedBuffer = input.totalProjectedAmount * 0.12;
  const unknownBuffer = unknownCount * Math.max(1000, Math.round((input.budgetTargetAmount ?? 30000) * 0.03));
  const feeGapBuffer = input.forms.reduce((sum, form) => {
    const base = moneyValue(form.basePriceLabel) ?? 0;
    const missingFeeCount = form.missingLabels.filter((label) =>
      /tax|service|travel|delivery|overtime|cancellation|payment/i.test(label),
    ).length;
    return sum + Math.min(base * 0.18, base * missingFeeCount * 0.025);
  }, 0);
  return Math.round(projectedBuffer + unknownBuffer + feeGapBuffer);
}

function forecastRangeLabel(knownAmount: number, uncertainty: number, currency: string): string {
  if (knownAmount <= 0 && uncertainty <= 0) return "Add quotes to estimate the final range.";
  const low = Math.max(0, knownAmount - Math.round(uncertainty * 0.35));
  const high = knownAmount + uncertainty;
  return `${moneyLabel(low, currency)} to ${moneyLabel(high, currency)}`;
}

function riskExplanationLabels(input: {
  projectedCount: number;
  unknownCount: number;
  uncertaintyAmount: number;
  forms: readonly WeddingBudgetQuoteNormalForm[];
  currency: string;
}): string[] {
  const missingFeeForms = input.forms.filter((form) => form.missingLabels.length > 0).length;
  return [
    input.projectedCount > 0 ? `${input.projectedCount} selected amount${input.projectedCount === 1 ? " is" : "s are"} still an estimate.` : null,
    input.unknownCount > 0 ? `${input.unknownCount} selected vendor${input.unknownCount === 1 ? "" : "s"} still need a usable amount.` : null,
    missingFeeForms > 0 ? `${missingFeeForms} quote${missingFeeForms === 1 ? "" : "s"} still need fee details such as GST, service charge, travel, overtime, or deposits.` : null,
    input.uncertaintyAmount > 0 ? `Keep about ${moneyLabel(input.uncertaintyAmount, input.currency)} flexible until quotes and fees are confirmed.` : null,
  ].filter((label): label is string => Boolean(label));
}

function contributionRows(artifacts: readonly WeddingArtifactInput[]): WeddingBudgetContribution[] {
  const lines = artifacts.flatMap((artifact) => rowText(artifact).split(/\r?\n/));
  return lines.flatMap((line): WeddingBudgetContribution[] => {
    if (!/\b(contribut\w*|paying|covering|gift from|family)\b/i.test(line)) return [];
    const amount = moneyValue(line);
    const person = clean(line.match(/\b(?:from|by|person|name)[:\s-]+([^:,$.;|]+)/i)?.[1]);
    // An unowned, amount-free phrase such as "contributor — ask vendor" is
    // planning noise, not a contribution the couple recorded.
    if (!person || amount === null || amount <= 0) return [];
    const condition = clean(line.match(/\b(?:condition|only if|for|toward|towards)[:\s-]+([^.;|]+)/i)?.[1]);
    return [{ personLabel: person, amountLabel: moneyLabel(amount), conditionLabel: condition }];
  }).slice(0, 8);
}

export function buildWeddingBudgetInsightsState(input: {
  lineItems: readonly WeddingBudgetLineItem[];
  paymentTaskCandidates: readonly WeddingBudgetPaymentTaskCandidate[];
  budgetAllocation: readonly WeddingBudgetAllocationCategoryAmount[];
  savedContributionRows?: readonly WeddingBudgetContribution[] | null;
  budgetTargetAmount: number | null;
  totalKnownAmount: number;
  totalProjectedAmount: number;
  totalQuotedAmount: number;
  remainingAmount: number | null;
  artifacts?: readonly WeddingArtifactInput[] | null;
}): WeddingBudgetInsightsState {
  const artifacts = input.artifacts ?? [];
  const currency = input.lineItems[0]?.currency ?? "AUD";
  const forms = input.lineItems.map(quoteNormalForm);
  const paidAmount = paidAmountFromArtifacts(artifacts);
  const savedContributionRows = input.savedContributionRows ?? [];
  const uncertainty = uncertaintyAmount({
    forms,
    lineItems: input.lineItems,
    budgetTargetAmount: input.budgetTargetAmount,
    totalProjectedAmount: input.totalProjectedAmount,
  });
  const atRiskAmount = input.lineItems
    .filter((item) => item.priceStatus !== "quoted" || item.warningLabels.length > 0)
    .reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const projectedCount = input.lineItems.filter((item) => item.priceStatus === "projected").length;
  const unknownCount = input.lineItems.filter((item) => item.amount === null).length;
  const cashNeeds = monthlyCashNeeds(input.paymentTaskCandidates, currency);
  const categoryTargetWarnings = input.budgetAllocation.flatMap((category) => {
    const spent = input.lineItems
      .filter((item) => item.categoryLabel.toLowerCase().includes(category.categoryLabel.split(" ")[0]!.toLowerCase()))
      .reduce((sum, item) => sum + (item.amount ?? 0), 0);
    return spent > category.amount && category.amount > 0
      ? [`${category.categoryLabel} is ${moneyLabel(spent - category.amount, currency)} over its category budget.`]
      : [];
  });
  return {
    committedAmount: input.totalQuotedAmount,
    estimatedAmount: input.totalProjectedAmount,
    paidAmount,
    forecastAmount: input.totalKnownAmount + uncertainty,
    uncertaintyAmount: uncertainty,
    forecastRangeLabel: forecastRangeLabel(input.totalKnownAmount, uncertainty, currency),
    remainingAmount: input.remainingAmount,
    atRiskAmount,
    riskExplanationLabels: riskExplanationLabels({
      projectedCount,
      unknownCount,
      uncertaintyAmount: uncertainty,
      forms,
      currency,
    }),
    feeCoverageLabels: feeCoverageLabels(forms),
    missingContextLabels: missingContextLabels({ artifacts, targetAmount: input.budgetTargetAmount }),
    quoteNormalForms: forms,
    monthlyCashNeeds: cashNeeds,
    monthlyCashNeedsSummaryLabel: monthlyCashNeedsSummaryLabel(cashNeeds, currency),
    scenarios: scenarios(input.budgetTargetAmount, input.totalKnownAmount, currency),
    unaffordableWarningLabels: [
      ...categoryTargetWarnings,
      input.remainingAmount !== null && input.remainingAmount < 0 ? `Current choices are ${moneyLabel(Math.abs(input.remainingAmount), currency)} over the total budget.` : null,
    ].filter((label): label is string => Boolean(label)),
    contributionRows: [...savedContributionRows, ...contributionRows(artifacts)],
  };
}
