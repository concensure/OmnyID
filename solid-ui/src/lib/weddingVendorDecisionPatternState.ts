// @locs-version: 1.0
// Pure client mirror of the server-owned wedding Decision Pattern contract.

export const WEDDING_VENDOR_SELECTION_PATTERN_ID = "wedding.vendor_selection" as const;
export const WEDDING_VENDOR_QUOTE_RESPONSE_PATTERN_ID = "wedding.vendor_quote_response" as const;
export const WEDDING_VENDOR_PATTERN_VERSION = 1 as const;

export type WeddingDecisionPatternVerificationOutcome =
  | "VALID"
  | "VALID_WITH_OPTIONAL_GAPS"
  | "BLOCKED_MISSING_DATA"
  | "BLOCKED_STALE_DATA"
  | "BLOCKED_CONFLICT"
  | "PATTERN_GAP";

export type WeddingDecisionPattern = {
  id: typeof WEDDING_VENDOR_SELECTION_PATTERN_ID | typeof WEDDING_VENDOR_QUOTE_RESPONSE_PATTERN_ID;
  version: typeof WEDDING_VENDOR_PATTERN_VERSION;
  supportedSituationTypes: readonly string[];
  requiredInputs: readonly string[];
  optionalInputs: readonly string[];
  requiredEvidence: readonly string[];
  semanticSlots: readonly string[];
  allowedActions: readonly string[];
  executionContracts: readonly string[];
  postponementPolicy: string;
  completionConditions: readonly string[];
  projectionRecipe: string;
};

export const WEDDING_VENDOR_SELECTION_ACTIONS = [
  "CHECK_AVAILABILITY_AND_REQUEST_QUOTE",
  "REQUEST_QUOTE",
  "REVIEW_QUOTE",
  "START_PURCHASE_OR_BOOKING",
  "VIEW_EVIDENCE",
] as const;

export const WEDDING_VENDOR_QUOTE_ACTIONS = [
  "ACCEPT_VENDOR",
  "NEGOTIATE_QUOTE",
  "EXPLORE_ALTERNATIVE",
  "DEFER_DECISION",
] as const;

const PATTERNS: readonly WeddingDecisionPattern[] = [
  {
    id: WEDDING_VENDOR_SELECTION_PATTERN_ID,
    version: WEDDING_VENDOR_PATTERN_VERSION,
    supportedSituationTypes: ["vendor_shortlist_ready", "vendor_comparison_revised"],
    requiredInputs: ["wedding_plan_id", "category", "candidate_count"],
    optionalInputs: ["budget_context", "guest_count", "date_or_season", "preferences"],
    requiredEvidence: ["candidate_identities", "candidate_sources", "request_routes"],
    semanticSlots: ["recommendation", "evidence", "unknowns", "request_action"],
    allowedActions: WEDDING_VENDOR_SELECTION_ACTIONS,
    executionContracts: ["wedding.vendor_outreach@1"],
    postponementPolicy: "Create a successor comparison on material intake or evidence change.",
    completionConditions: ["vendor_selected", "comparison_superseded", "category_booked"],
    projectionRecipe: "wedding.vendor_selection.card@1",
  },
  {
    id: WEDDING_VENDOR_QUOTE_RESPONSE_PATTERN_ID,
    version: WEDDING_VENDOR_PATTERN_VERSION,
    supportedSituationTypes: ["vendor_quote_received", "vendor_quote_materially_changed"],
    requiredInputs: ["decision_id", "quote_message_id", "quote_thread_id", "vendor_identity"],
    optionalInputs: ["amount", "currency", "scope", "valid_until", "budget_context", "preference_refs"],
    requiredEvidence: ["source_quote", "vendor_thread"],
    semanticSlots: ["decision", "evidence", "unknowns", "safety_envelope", "execution_preview"],
    allowedActions: WEDDING_VENDOR_QUOTE_ACTIONS,
    executionContracts: ["wedding.vendor_quote_reply@1"],
    postponementPolicy: "Resurface on date, material change, risk threshold, or user request.",
    completionConditions: ["vendor_accepted", "negotiation_sent", "alternative_selected", "quote_superseded", "quote_expired"],
    projectionRecipe: "wedding.vendor_quote_response.card@1",
  },
];

export function weddingDecisionPattern(
  id: string,
  version: number,
): WeddingDecisionPattern | null {
  return PATTERNS.find((pattern) => pattern.id === id && pattern.version === version) ?? null;
}

export type WeddingDecisionPatternVerification = {
  outcome: WeddingDecisionPatternVerificationOutcome;
  patternId: string;
  patternVersion: number;
  missingInputs: string[];
  missingEvidence: string[];
  missingActions: string[];
  missingExecutionContracts: string[];
  staleEvidence: string[];
  conflictingEvidence: string[];
  optionalGaps: string[];
};

function cleanValues(values: readonly (string | null | undefined)[] | null | undefined): string[] {
  return Array.from(new Set((values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function missing(required: readonly string[], present: ReadonlySet<string>): string[] {
  return required.filter((value) => !present.has(value));
}

export function verifyWeddingDecisionPattern(input: {
  patternId: string;
  patternVersion: number;
  situationType: string;
  presentInputs: readonly string[];
  presentEvidence: readonly string[];
  allowedActions: readonly string[];
  executionContracts: readonly string[];
  staleEvidence?: readonly string[] | null;
  conflictingEvidence?: readonly string[] | null;
  optionalGaps?: readonly string[] | null;
}): WeddingDecisionPatternVerification {
  const pattern = weddingDecisionPattern(input.patternId, input.patternVersion);
  const base = {
    patternId: input.patternId,
    patternVersion: input.patternVersion,
    missingInputs: [] as string[],
    missingEvidence: [] as string[],
    missingActions: [] as string[],
    missingExecutionContracts: [] as string[],
    staleEvidence: cleanValues(input.staleEvidence),
    conflictingEvidence: cleanValues(input.conflictingEvidence),
    optionalGaps: cleanValues(input.optionalGaps),
  };
  if (!pattern || !pattern.supportedSituationTypes.includes(input.situationType)) {
    return { ...base, outcome: "PATTERN_GAP" };
  }
  const result = {
    ...base,
    missingInputs: missing(pattern.requiredInputs, new Set(cleanValues(input.presentInputs))),
    missingEvidence: missing(pattern.requiredEvidence, new Set(cleanValues(input.presentEvidence))),
    missingActions: missing(pattern.allowedActions, new Set(cleanValues(input.allowedActions))),
    missingExecutionContracts: missing(pattern.executionContracts, new Set(cleanValues(input.executionContracts))),
  };
  const missingRequired = result.missingInputs.length > 0
    || result.missingEvidence.length > 0
    || result.missingActions.length > 0
    || result.missingExecutionContracts.length > 0;
  const outcome: WeddingDecisionPatternVerificationOutcome = result.conflictingEvidence.length
    ? "BLOCKED_CONFLICT"
    : result.staleEvidence.length
      ? "BLOCKED_STALE_DATA"
      : missingRequired
        ? "BLOCKED_MISSING_DATA"
        : result.optionalGaps.length
          ? "VALID_WITH_OPTIONAL_GAPS"
          : "VALID";
  return { ...result, outcome };
}

export function weddingDecisionPatternAllowsProjection(
  verification: WeddingDecisionPatternVerification,
): boolean {
  return verification.outcome === "VALID" || verification.outcome === "VALID_WITH_OPTIONAL_GAPS";
}

export type WeddingQuoteSafetyEnvelope = {
  comfortableResurfaceAt: string;
  latestSafeDecisionAt: string;
  criticalAt: string;
  externalDeadline: string;
  deadlineSource: "vendor_quote" | "conservative_review_window";
};

function validDate(value: string | null | undefined): Date | null {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed) : null;
}

export function weddingQuoteSafetyEnvelope(input: {
  validUntil?: string | null;
  now?: Date;
}): WeddingQuoteSafetyEnvelope {
  const now = input.now ?? new Date();
  const explicit = validDate(input.validUntil);
  const externalDeadline = explicit ?? new Date(now.getTime() + 14 * 86_400_000);
  const before = (days: number) => new Date(externalDeadline.getTime() - days * 86_400_000).toISOString();
  return {
    comfortableResurfaceAt: before(7),
    latestSafeDecisionAt: before(3),
    criticalAt: new Date(externalDeadline.getTime() - 86_400_000).toISOString(),
    externalDeadline: externalDeadline.toISOString(),
    deadlineSource: explicit ? "vendor_quote" : "conservative_review_window",
  };
}
