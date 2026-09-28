// @locs-version: 1.0
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingRealityChangeSubtype =
  | "vendor_cancelled"
  | "vendor_unavailable"
  | "weather_risk"
  | "guest_count_changed"
  | "unknown";

export type WeddingReplacementCandidateInput = {
  id?: string | null;
  label: string;
  category?: string | null;
  availableOnDate?: boolean | null;
  priceEstimate?: number | null;
  fitLabels?: readonly string[] | null;
  sourceLabel?: string | null;
};

export type WeddingContractEntitlement = {
  refundLabel: string | null;
  depositAmount: number | null;
  cancellationTermsLabel: string | null;
  actionLabel: string;
  evidenceLabels: string[];
};

export type WeddingRecoveryStep = {
  id: string;
  label: string;
  status: "ready" | "blocked" | "needs_review";
  detail: string;
};

export type WeddingRecoveryShortlistItem = {
  id: string;
  label: string;
  sourceLabel: string | null;
  fitLabels: string[];
  priceEstimate: number | null;
  budgetLabel: string;
  availableOnDate: boolean;
};

export type WeddingDisruptionLedgerObject = {
  id: string;
  kind: "wedding_disruption_event";
  subtype: WeddingRealityChangeSubtype;
  title: string;
  severity: "info" | "warning" | "urgent";
  status: "open";
  metadata: Record<string, unknown>;
  references: Array<{ type: string; target: string }>;
  supertags: string[];
};

export type WeddingRecoveryPlanLedgerObject = {
  id: string;
  kind: "wedding_recovery_plan";
  title: string;
  disruptionId: string;
  stepIds: string[];
  decisionNeededLabel: string;
  metadata: Record<string, unknown>;
  references: Array<{ type: string; target: string }>;
  supertags: string[];
};

export type WeddingRealityChangeRecoveryState = {
  metadata: WeddingPlanningMetadata;
  subtype: WeddingRealityChangeSubtype;
  summaryLabel: string;
  disruptionObject: WeddingDisruptionLedgerObject;
  recoveryPlanObject: WeddingRecoveryPlanLedgerObject;
  contractEntitlement: WeddingContractEntitlement;
  recoverySteps: WeddingRecoveryStep[];
  shortlist: WeddingRecoveryShortlistItem[];
  decisionNeededLabel: string;
  approvalGateLabel: string;
  a2ui: Record<string, unknown>;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function moneyValue(text: string): number | null {
  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/(?:\$|aud|usd|gbp|eur)?\s*(\d{3,7})(?:\.\d+)?/i);
  if (!match?.[1]) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function inferSubtype(text: string): WeddingRealityChangeSubtype {
  if (/\b(cancelled|canceled|pulled out|no longer available|backed out)\b/i.test(text)) return "vendor_cancelled";
  if (/\bunavailable|booked out|not available\b/i.test(text)) return "vendor_unavailable";
  if (/\brain|storm|weather|heat|wind|outdoor\b/i.test(text)) return "weather_risk";
  if (/\bguest count|guests|rsvp\b/i.test(text) && /\bchanged|increase|decrease|dropped|added\b/i.test(text)) return "guest_count_changed";
  return "unknown";
}

function contractEntitlement(contractText: string): WeddingContractEntitlement {
  const text = clean(contractText);
  const depositAmount = /\bdeposit\b/i.test(text) ? moneyValue(text) : null;
  const nonRefundable = /\bnon[- ]?refundable|no refund|forfeit\b/i.test(text);
  const refund = /\brefund|return|refundable|reimburse\b/i.test(text);
  const cancellationTermsLabel = text
    ? text.split(/(?<=[.!?])\s+/).find((line) => /\bcancel|refund|deposit|non[- ]?refundable/i.test(line))?.slice(0, 220) ?? null
    : null;
  return {
    refundLabel: nonRefundable
      ? "Contract text mentions non-refundable terms; user should review before requesting money back."
      : refund || depositAmount
        ? "Contract text appears to support a refund/deposit review."
        : null,
    depositAmount,
    cancellationTermsLabel,
    actionLabel: text
      ? "Prepare a refund/contract review request for user approval."
      : "Ask the user to upload or paste the contract before making refund claims.",
    evidenceLabels: [
      cancellationTermsLabel,
      depositAmount ? `Deposit amount detected: $${depositAmount.toLocaleString()}` : null,
    ].filter((value): value is string => Boolean(value)),
  };
}

function shortlist(input: {
  candidates?: readonly WeddingReplacementCandidateInput[] | null;
  vendorCategory: string;
  budgetLimit: number | null;
}): WeddingRecoveryShortlistItem[] {
  return (input.candidates ?? [])
    .filter((candidate) => clean(candidate.label))
    .map((candidate, index): WeddingRecoveryShortlistItem => {
      const price = typeof candidate.priceEstimate === "number" && Number.isFinite(candidate.priceEstimate)
        ? Math.round(candidate.priceEstimate)
        : null;
      const inBudget = input.budgetLimit === null || price === null || price <= input.budgetLimit;
      return {
        id: clean(candidate.id) || `replacement:${safeWeddingLabel(input.vendorCategory)}:${index + 1}`,
        label: clean(candidate.label),
        sourceLabel: clean(candidate.sourceLabel) || null,
        fitLabels: (candidate.fitLabels ?? []).map(clean).filter(Boolean).slice(0, 6),
        priceEstimate: price,
        budgetLabel: price === null
          ? "Price needs confirmation"
          : inBudget
            ? "Within stated budget"
            : "Over stated budget",
        availableOnDate: candidate.availableOnDate === true,
      };
    })
    .filter((candidate) => candidate.availableOnDate)
    .sort((left, right) => {
      const leftBudget = left.budgetLabel === "Within stated budget" ? 0 : 1;
      const rightBudget = right.budgetLabel === "Within stated budget" ? 0 : 1;
      return leftBudget - rightBudget || right.fitLabels.length - left.fitLabels.length || left.label.localeCompare(right.label);
    })
    .slice(0, 4);
}

function recoverySteps(input: {
  subtype: WeddingRealityChangeSubtype;
  contract: WeddingContractEntitlement;
  shortlistCount: number;
  originalPreferenceText: string;
  weddingDate: string;
  location: string;
}): WeddingRecoveryStep[] {
  return [
    {
      id: "record-change",
      label: "Record what changed",
      status: input.subtype === "unknown" ? "needs_review" : "ready",
      detail: input.subtype === "vendor_cancelled"
        ? "Vendor cancellation has been identified as the recovery trigger."
        : "The change has been captured; classify it before taking external action.",
    },
    {
      id: "review-contract",
      label: "Review contract and refund position",
      status: input.contract.evidenceLabels.length ? "needs_review" : "blocked",
      detail: input.contract.actionLabel,
    },
    {
      id: "recover-original-requirements",
      label: "Recover original requirements",
      status: input.originalPreferenceText ? "ready" : "blocked",
      detail: input.originalPreferenceText
        ? "Original fit requirements are available for replacement search."
        : "Ask what mattered about the original vendor before recommending replacements.",
    },
    {
      id: "search-replacements",
      label: "Shortlist replacements",
      status: input.shortlistCount > 0 ? "ready" : "blocked",
      detail: input.shortlistCount > 0
        ? `${input.shortlistCount} available replacement option${input.shortlistCount === 1 ? "" : "s"} can be compared.`
        : "Search providers need date, location, category, and fit requirements.",
    },
    {
      id: "ask-one-decision",
      label: "Ask one decision",
      status: input.shortlistCount > 0 ? "ready" : "blocked",
      detail: input.shortlistCount > 0
        ? "Ask the couple to choose the replacement portfolio they prefer."
        : "Wait until replacement candidates exist before asking the couple to decide.",
    },
  ];
}

export function buildWeddingRealityChangeRecoveryState(input: {
  metadata?: unknown;
  disruptionText?: string | null;
  vendorName?: string | null;
  vendorCategory?: string | null;
  weddingDate?: string | null;
  location?: string | null;
  contractText?: string | null;
  originalPreferenceText?: string | null;
  budgetLimit?: number | null;
  replacementCandidates?: readonly WeddingReplacementCandidateInput[] | null;
}): WeddingRealityChangeRecoveryState {
  const metadata = normalizeWeddingPlanningMetadata({
    ...(input.metadata && typeof input.metadata === "object" ? input.metadata : {}),
    supertags: [
      ...normalizeWeddingPlanningMetadata(input.metadata).supertags,
      "wedding_recovery",
      "decisionos:wedding",
    ],
  });
  const vendor = clean(input.vendorName) || "Vendor";
  const category = clean(input.vendorCategory) || "vendor";
  const text = clean(input.disruptionText);
  const subtype = inferSubtype(`${text} ${vendor} ${category}`);
  const contract = contractEntitlement(clean(input.contractText));
  const replacements = shortlist({
    candidates: input.replacementCandidates,
    vendorCategory: category,
    budgetLimit: typeof input.budgetLimit === "number" && Number.isFinite(input.budgetLimit) ? Math.round(input.budgetLimit) : null,
  });
  const steps = recoverySteps({
    subtype,
    contract,
    shortlistCount: replacements.length,
    originalPreferenceText: clean(input.originalPreferenceText),
    weddingDate: clean(input.weddingDate),
    location: clean(input.location),
  });
  const disruptionId = `wedding_disruption:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(subtype)}:${safeWeddingLabel(vendor)}`;
  const disruptionObject: WeddingDisruptionLedgerObject = {
    id: disruptionId,
    kind: "wedding_disruption_event",
    subtype,
    title: subtype === "vendor_cancelled" ? `${vendor} cancelled` : `${vendor} change needs review`,
    severity: subtype === "vendor_cancelled" || subtype === "vendor_unavailable" ? "urgent" : "warning",
    status: "open",
    metadata: {
      ...metadata,
      vendor_name: vendor,
      vendor_category: category,
      wedding_date: clean(input.weddingDate) || null,
      location: clean(input.location) || null,
      afp_object_kind: "wedding_disruption_event",
    },
    references: [
      { type: "affects_vendor", target: `wedding_vendor:${safeWeddingLabel(vendor)}` },
      { type: "belongs_to_wedding_plan", target: metadata.weddingPlanId },
    ],
    supertags: ["wedding", "wedding_recovery", `disruption:${safeWeddingLabel(subtype)}`, "approval_required"],
  };
  const decisionNeededLabel = replacements.length
    ? `Choose one replacement ${category} to contact first.`
    : `Confirm the missing ${category} requirements before replacement search.`;
  const recoveryPlanObject: WeddingRecoveryPlanLedgerObject = {
    id: `wedding_recovery_plan:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(vendor)}`,
    kind: "wedding_recovery_plan",
    title: `Recovery plan for ${vendor}`,
    disruptionId,
    stepIds: steps.map((step) => step.id),
    decisionNeededLabel,
    metadata: {
      ...metadata,
      vendor_name: vendor,
      vendor_category: category,
      shortlisted_count: replacements.length,
      afp_object_kind: "wedding_recovery_plan",
    },
    references: [
      { type: "responds_to", target: disruptionId },
      ...replacements.map((item) => ({ type: "shortlists_replacement", target: item.id })),
    ],
    supertags: ["wedding", "wedding_recovery_plan", "decisionos:wedding", "couple_approval_required"],
  };
  return {
    metadata,
    subtype,
    summaryLabel: subtype === "vendor_cancelled"
      ? "A vendor cancellation should become a recovery plan, not just an alert."
      : "A wedding reality change has been captured for review.",
    disruptionObject,
    recoveryPlanObject,
    contractEntitlement: contract,
    recoverySteps: steps,
    shortlist: replacements,
    decisionNeededLabel,
    approvalGateLabel: "Do not send refund requests, vendor outreach, or replacement holds without explicit approval.",
    a2ui: {
      schema_version: "a2ui.v1",
      kind: "wedding_recovery_plan",
      title: recoveryPlanObject.title,
      sections: [
        { title: "What changed", items: [disruptionObject.title] },
        { title: "What OmnyID checked", items: steps.map((step) => `${step.label}: ${step.status}`) },
        { title: "Replacement options", items: replacements.map((item) => `${item.label}: ${item.budgetLabel}`) },
        { title: "One decision needed", items: [decisionNeededLabel] },
      ],
    },
  };
}
