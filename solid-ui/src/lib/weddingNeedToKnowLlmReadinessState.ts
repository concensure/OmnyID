// @locs-version: 2.0
export type WeddingNeedToKnowLlmReadinessInput = {
  llmExtractorConnected?: boolean | null;
  transcriptInputsTested?: number | null;
  chatInputsTested?: number | null;
  requiredSlots?: readonly string[] | null;
  extractedSlots?: readonly string[] | null;
  reviewLabelsProduced?: readonly string[] | null;
  deterministicFallbackAvailable?: boolean | null;
  afpProjectionReady?: boolean | null;
  preventsOverwriteWithoutReview?: boolean | null;
  errorCount?: number | null;
};

export type WeddingNeedToKnowLlmReadinessState = {
  status: "ready" | "deterministic_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  blockerLabels: string[];
};

const DEFAULT_REQUIRED_SLOTS = [
  "date_or_season",
  "location",
  "guest_count",
  "budget_comfort",
  "priorities",
  "noim_status",
  "celebrant_path",
];

function count(value: number | null | undefined): number {
  return Math.max(0, Math.trunc(value ?? 0));
}

function cleanSet(values: readonly string[] | null | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim()).filter(Boolean));
}

export function buildWeddingNeedToKnowLlmReadinessState(
  input: WeddingNeedToKnowLlmReadinessInput = {},
): WeddingNeedToKnowLlmReadinessState {
  const transcriptInputsTested = count(input.transcriptInputsTested);
  const chatInputsTested = count(input.chatInputsTested);
  const requiredSlots = input.requiredSlots?.length ? [...input.requiredSlots] : DEFAULT_REQUIRED_SLOTS;
  const extractedSlots = cleanSet(input.extractedSlots);
  const missingSlots = requiredSlots.filter((slot) => !extractedSlots.has(slot));
  const reviewLabels = (input.reviewLabelsProduced ?? []).map((label) => label.trim()).filter(Boolean);
  const errorCount = count(input.errorCount);
  const evidenceLabels = [
    input.llmExtractorConnected ? "LLM extractor connected" : null,
    `${transcriptInputsTested} transcript input${transcriptInputsTested === 1 ? "" : "s"} tested`,
    `${chatInputsTested} chat input${chatInputsTested === 1 ? "" : "s"} tested`,
    `${extractedSlots.size}/${requiredSlots.length} required slots covered`,
    input.deterministicFallbackAvailable ? "deterministic fallback available" : null,
    input.afpProjectionReady ? "AFP Need-To-Know projection ready" : null,
    input.preventsOverwriteWithoutReview ? "existing answers protected until reviewed" : null,
    reviewLabels.length > 0 ? `${reviewLabels.length} conservative review label${reviewLabels.length === 1 ? "" : "s"} produced` : null,
  ].filter((value): value is string => Boolean(value));
  const blockerLabels: string[] = [];

  if (!input.llmExtractorConnected) blockerLabels.push("LLM extractor is not connected.");
  if (transcriptInputsTested < 2) blockerLabels.push("Need-To-Know LLM extraction needs at least two transcript-style test inputs.");
  if (chatInputsTested < 2) blockerLabels.push("Need-To-Know LLM extraction needs at least two chat-style test inputs.");
  if (missingSlots.length > 0) blockerLabels.push(`Required slots not proven: ${missingSlots.join(", ")}.`);
  if (reviewLabels.length === 0) blockerLabels.push("Conservative user-review labels are not produced.");
  if (!input.deterministicFallbackAvailable) blockerLabels.push("Deterministic fallback extractor is not available.");
  if (!input.afpProjectionReady) blockerLabels.push("Extracted answers are not proven to project into AFP Need-To-Know context.");
  if (!input.preventsOverwriteWithoutReview) blockerLabels.push("Existing user answers can be overwritten without explicit review.");
  if (errorCount > 0) blockerLabels.push(`${errorCount} extraction error${errorCount === 1 ? "" : "s"} occurred.`);

  if (blockerLabels.length === 0) {
    return {
      status: "ready",
      productionEvidenceReady: true,
      summary: "LLM-backed Need-To-Know extraction is ready with transcript/chat proof, conservative review, fallback, and AFP projection.",
      evidenceLabels,
      blockerLabels,
    };
  }

  const deterministicOnly = Boolean(input.deterministicFallbackAvailable) && !input.llmExtractorConnected;
  return {
    status: deterministicOnly ? "deterministic_only" : "blocked",
    productionEvidenceReady: false,
    summary: deterministicOnly
      ? "Need-To-Know capture remains safe through deterministic extraction, but LLM transcript/chat extraction is not production-ready."
      : "LLM-backed Need-To-Know extraction is not production-ready yet.",
    evidenceLabels,
    blockerLabels,
  };
}
