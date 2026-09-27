// @locs-version: 2.0
import {
  cleanWeddingProductionLabel,
  cleanWeddingProductionLabels,
  durableWeddingProductionProofLabels,
} from "@/lib/weddingProductionLabelState";

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
  proofReferenceLabels?: readonly string[] | null;
  errorCount?: number | null;
};

export type WeddingNeedToKnowLlmReadinessState = {
  status: "ready" | "deterministic_only" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  evidenceLabels: string[];
  proofReferenceLabels: string[];
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
  return new Set(cleanWeddingProductionLabels(values ?? []));
}

export function buildWeddingNeedToKnowLlmReadinessState(
  input: WeddingNeedToKnowLlmReadinessInput = {},
): WeddingNeedToKnowLlmReadinessState {
  const transcriptInputsTested = count(input.transcriptInputsTested);
  const chatInputsTested = count(input.chatInputsTested);
  const requiredSlots = input.requiredSlots?.length
    ? cleanWeddingProductionLabels(input.requiredSlots)
    : DEFAULT_REQUIRED_SLOTS;
  const extractedSlots = cleanSet(input.extractedSlots);
  const missingSlots = requiredSlots.filter((slot) => !extractedSlots.has(slot));
  const reviewLabels = cleanWeddingProductionLabels(input.reviewLabelsProduced ?? []);
  const proofReferenceLabels = durableWeddingProductionProofLabels(input.proofReferenceLabels);
  const errorCount = count(input.errorCount);
  const evidenceLabels = cleanWeddingProductionLabels([
    input.llmExtractorConnected ? "LLM extractor connected" : null,
    `${transcriptInputsTested} transcript input${transcriptInputsTested === 1 ? "" : "s"} tested`,
    `${chatInputsTested} chat input${chatInputsTested === 1 ? "" : "s"} tested`,
    `${extractedSlots.size}/${requiredSlots.length} required slots covered`,
    input.deterministicFallbackAvailable ? "deterministic fallback available" : null,
    input.afpProjectionReady ? "AFP Need-To-Know projection ready" : null,
    input.preventsOverwriteWithoutReview ? "existing answers protected until reviewed" : null,
    reviewLabels.length > 0 ? `${reviewLabels.length} conservative review label${reviewLabels.length === 1 ? "" : "s"} produced` : null,
    proofReferenceLabels.length > 0 ? `${proofReferenceLabels.length} durable extraction proof reference${proofReferenceLabels.length === 1 ? "" : "s"}` : null,
  ]);
  const blockerLabels: string[] = [];

  if (!input.llmExtractorConnected) blockerLabels.push("LLM extractor is not connected.");
  if (transcriptInputsTested < 2) blockerLabels.push("Need-To-Know LLM extraction needs at least two transcript-style test inputs.");
  if (chatInputsTested < 2) blockerLabels.push("Need-To-Know LLM extraction needs at least two chat-style test inputs.");
  if (missingSlots.length > 0) {
    blockerLabels.push(cleanWeddingProductionLabel(`Required slots not proven: ${missingSlots.join(", ")}.`) ?? "Required slots are not proven.");
  }
  if (reviewLabels.length === 0) blockerLabels.push("Conservative user-review labels are not produced.");
  if (!input.deterministicFallbackAvailable) blockerLabels.push("Deterministic fallback extractor is not available.");
  if (!input.afpProjectionReady) blockerLabels.push("Extracted answers are not proven to project into AFP Need-To-Know context.");
  if (!input.preventsOverwriteWithoutReview) blockerLabels.push("Existing user answers can be overwritten without explicit review.");
  if (proofReferenceLabels.length === 0) blockerLabels.push("Durable Need-To-Know extraction proof reference is not mounted.");
  if (errorCount > 0) blockerLabels.push(`${errorCount} extraction error${errorCount === 1 ? "" : "s"} occurred.`);

  if (blockerLabels.length === 0) {
    return {
      status: "ready",
      productionEvidenceReady: true,
      summary: "LLM-backed Need-To-Know extraction is ready with transcript/chat proof, conservative review, fallback, and AFP projection.",
      evidenceLabels,
      proofReferenceLabels,
      blockerLabels: cleanWeddingProductionLabels(blockerLabels),
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
    proofReferenceLabels,
    blockerLabels: cleanWeddingProductionLabels(blockerLabels),
  };
}
