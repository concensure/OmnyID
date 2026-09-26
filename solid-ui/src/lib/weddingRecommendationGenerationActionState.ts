// @locs-version: 1.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";

export type WeddingRecommendationGenerationActionInput = {
  cardTitle: string;
  nextQuestionLabel?: string | null;
  state?: WeddingResponseWorkspaceViewState | null;
};

export type WeddingRecommendationDraftReadinessInput = {
  dateOrSeason?: string | null;
  location?: string | null;
  guestCount?: string | number | null;
  budgetComfort?: string | null;
  prioritiesCsv?: string | null;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function firstAnsweredLabel(state: WeddingResponseWorkspaceViewState | null | undefined): string | null {
  return state?.contextCards
    .flatMap((card) => card.answeredLabels)
    .map((label) => clean(label))
    .find((label): label is string => label !== null) ?? null;
}

function isRecommendationReady(label: unknown): boolean {
  const text = clean(label)?.toLowerCase() ?? "";
  return /ready|recommendation|recommendations|first recommendation/.test(text);
}

export function weddingImportantDetailsActionLabel(nextQuestionLabel: unknown): string {
  return isRecommendationReady(nextQuestionLabel) ? "Generate recommendations" : "Answer next detail";
}

export function weddingRecommendationRequestedOutput(action: WeddingWorkspaceSidebarAction): string | null {
  const packet = action.metadata?.wedding_recommendation_generation;
  if (!packet || typeof packet !== "object" || Array.isArray(packet)) return null;
  return clean((packet as Record<string, unknown>).requested_output);
}

export function weddingRecommendationDraftReady(input: WeddingRecommendationDraftReadinessInput): boolean {
  const hasBasics = Boolean(clean(input.dateOrSeason) && clean(input.location) && clean(input.budgetComfort));
  const hasScaleOrPriority = Boolean(
    (typeof input.guestCount === "number" && Number.isFinite(input.guestCount) && input.guestCount > 0)
      || clean(input.guestCount)
      || clean(input.prioritiesCsv),
  );
  return hasBasics && hasScaleOrPriority;
}

export function buildWeddingRecommendationGenerationAction(
  input: WeddingRecommendationGenerationActionInput,
): WeddingWorkspaceSidebarAction {
  const title = clean(input.cardTitle) ?? "Important details";
  const nextQuestion = clean(input.nextQuestionLabel);
  const readyForRecommendations = isRecommendationReady(nextQuestion);
  const label = weddingImportantDetailsActionLabel(nextQuestion);
  const evidenceLabel = firstAnsweredLabel(input.state);
  const budgetSet = typeof input.state?.budgetTracking.budgetTargetAmount === "number";
  const guestCount = input.state?.guestTracking.guestRowCount ?? 0;
  const inspirationCount = input.state?.inspiration.items.length ?? 0;
  return {
    kind: "continue_chat",
    label,
    enabled: true,
    reason: null,
    metadata: {
      wedding_recommendation_generation: {
        version: 1,
        source: "important_details",
        context_card_title: title,
        next_question_label: nextQuestion,
        requested_output: readyForRecommendations ? "first_recommendation_set" : "answer_next_detail",
        known_budget: budgetSet,
        guest_count: guestCount,
        inspiration_count: inspirationCount,
      },
    },
    contextLabels: [
      label,
      title,
      ...(nextQuestion ? [nextQuestion] : []),
      ...(evidenceLabel ? [evidenceLabel] : []),
    ],
  };
}
