// @locs-version: 2.0
import {
  buildWeddingArtifactGenerationState,
  type WeddingArtifactGenerationState,
} from "@/lib/weddingArtifactGenerationState";
import {
  buildWeddingPresentationState,
  type WeddingPresentationState,
} from "@/lib/weddingPresentationState";
import {
  buildWeddingResponseWorkspaceViewState,
  type WeddingResponseWorkspaceViewState,
} from "@/lib/weddingResponseWorkspaceViewState";
import {
  buildWeddingRichResponseRendererState,
  type WeddingRichResponseRendererState,
} from "@/lib/weddingRichResponseRendererState";
import {
  buildWeddingTemplateEntryState,
  type WeddingTemplateEntryState,
  type WeddingTemplateStarterPrompt,
} from "@/lib/weddingTemplateEntryState";
import { normalizeWeddingPlanningMetadata, type WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

export type WeddingTemplateLaunchStarterCard = {
  id: string;
  intent: WeddingTemplateStarterPrompt["intent"];
  label: string;
  prompt: string;
  recommended: boolean;
};

export type WeddingTemplateLaunchState = {
  entry: WeddingTemplateEntryState;
  metadata: WeddingPlanningMetadata;
  artifactGeneration: WeddingArtifactGenerationState;
  presentation: WeddingPresentationState;
  richResponse: WeddingRichResponseRendererState;
  workspaceView: WeddingResponseWorkspaceViewState;
  starterCards: WeddingTemplateLaunchStarterCard[];
  nextQuestionLabel: string;
  firstResponsePrompt: string;
  launchLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function starterCard(prompt: WeddingTemplateStarterPrompt): WeddingTemplateLaunchStarterCard {
  return {
    id: `wedding_starter:${prompt.intent}`,
    intent: prompt.intent,
    label: prompt.label,
    prompt: prompt.prompt,
    recommended: prompt.recommended,
  };
}

export function buildWeddingTemplateLaunchState(input: {
  weddingPlanId?: string | null;
  responseWorkspaceId?: string | null;
  sourceResponseId?: string | null;
  projectionStorage?: Storage | null;
} = {}): WeddingTemplateLaunchState {
  const entry = buildWeddingTemplateEntryState({
    seed: clean(input.weddingPlanId).replace(/^wedding_plan:/, "") || "wedding planning",
    sourceResponseId: clean(input.sourceResponseId) || null,
  });
  const metadata = normalizeWeddingPlanningMetadata({
    ...entry.metadata,
    weddingPlanId: clean(input.weddingPlanId) || entry.metadata.weddingPlanId,
    responseWorkspaceId: clean(input.responseWorkspaceId) || entry.metadata.responseWorkspaceId,
    sourceResponseId: clean(input.sourceResponseId) || entry.metadata.sourceResponseId,
    supertags: [...entry.metadata.supertags, "template_launch:wedding_planning"],
  });
  const starterCards = entry.starterPrompts.map(starterCard);
  const artifactGeneration = buildWeddingArtifactGenerationState({
    metadata,
    title: "Wedding planning starter brief",
    researchNotes: [
      "This workspace was created from the Wedding Planning template.",
      "Start with the first Need-To-Know question before producing venue, vendor, legal, calendar, or budget recommendations.",
      ...starterCards.map((card) => `${card.label}: ${card.prompt}`),
    ],
    assumptions: [
      "No live vendor availability, pricing, registry publishing, external calendar sync, or legal lodgement has been performed.",
      "Generated files should remain private until the user explicitly approves sharing or sending.",
    ],
    verificationActions: [
      "Ask for wedding date or target season.",
      "Ask for location or preferred region.",
      "Ask for rough guest count before venue or budget ranking.",
    ],
    sourceLabels: ["Wedding Planning template launch"],
  });
  const presentation = buildWeddingPresentationState({
    title: "Wedding planning starter",
    metadata,
    planningContext: { decisionContext: "first_plan" },
    artifacts: artifactGeneration.artifactInputs,
  });
  const workspaceView = buildWeddingResponseWorkspaceViewState({
    metadata,
    artifacts: artifactGeneration.artifactInputs,
    generatedArtifacts: artifactGeneration.artifacts,
    projectionStorage: input.projectionStorage ?? null,
  });
  const richResponse = buildWeddingRichResponseRendererState(presentation);
  const nextQuestion = presentation.probing.nextQuestion;

  return {
    entry: { ...entry, metadata },
    metadata,
    artifactGeneration,
    presentation,
    richResponse,
    workspaceView,
    starterCards,
    nextQuestionLabel: nextQuestion?.question ?? "Tell OmnyID what you want to plan first.",
    firstResponsePrompt: [
      entry.firstResponseInstruction,
      nextQuestion ? `Ask first: ${nextQuestion.question}` : "Proceed with the selected starter prompt.",
      "Keep the response tied to this wedding plan and selected documents.",
    ].join(" "),
    launchLabels: [],
  };
}
