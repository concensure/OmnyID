import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingResearchPromptAction,
  buildWeddingRecommendationGenerationAction,
  weddingRecommendationDraftReady,
  weddingRecommendationRequestedOutput,
  weddingImportantDetailsActionLabel,
} from "../src/lib/weddingRecommendationGenerationActionState.ts";
import type { WeddingResponseWorkspaceViewState } from "../src/lib/weddingResponseWorkspaceViewState.ts";

function state(overrides: Partial<WeddingResponseWorkspaceViewState> = {}): WeddingResponseWorkspaceViewState {
  return {
    contextCards: [{
      title: "Wedding basics",
      answeredLabels: ["Location: Sydney NSW", "Priorities: food and photos"],
    }],
    budgetTracking: {
      budgetTargetAmount: 60_000,
    },
    guestTracking: {
      guestRowCount: 82,
    },
    inspiration: {
      items: [{ id: "img-1" }, { id: "img-2" }],
    },
    workspace: {
      artifacts: [{
        locationLabels: ["Sydney NSW"],
      }],
    },
    ...overrides,
  } as unknown as WeddingResponseWorkspaceViewState;
}

test("recommendation generation action carries typed first-set metadata", () => {
  const action = buildWeddingRecommendationGenerationAction({
    cardTitle: "Important details",
    nextQuestionLabel: "Ready to generate the first recommendation set.",
    state: state(),
  });

  assert.equal(action.kind, "continue_chat");
  assert.equal(action.label, "Generate recommendations");
  assert.equal(action.enabled, true);
  const metadata = action.metadata?.wedding_recommendation_generation as Record<string, unknown>;
  assert.equal(metadata.version, 1);
  assert.equal(metadata.source, "important_details");
  assert.equal(metadata.context_card_title, "Important details");
  assert.equal(metadata.next_question_label, "Ready to generate the first recommendation set.");
  assert.equal(metadata.requested_output, "first_recommendation_set");
  assert.equal(metadata.known_budget, true);
  assert.equal(metadata.guest_count, 82);
  assert.equal(metadata.inspiration_count, 2);
  assert.deepEqual(action.contextLabels?.slice(0, 3), [
    "Generate recommendations",
    "Important details",
    "Ready to generate the first recommendation set.",
  ]);
  assert.equal(action.contextLabels?.[3], "Location: Sydney NSW");
});

test("important details action asks for the next missing detail when recommendations are not ready", () => {
  const action = buildWeddingRecommendationGenerationAction({
    cardTitle: "Wedding basics",
    nextQuestionLabel: "Have you settled on a date or season?",
    state: state(),
  });

  assert.equal(action.label, "Answer next detail");
  const metadata = action.metadata?.wedding_recommendation_generation as Record<string, unknown>;
  assert.equal(metadata.requested_output, "answer_next_detail");
  assert.equal(metadata.next_question_label, "Have you settled on a date or season?");
  assert.deepEqual(action.contextLabels?.slice(0, 3), [
    "Answer next detail",
    "Wedding basics",
    "Have you settled on a date or season?",
  ]);
});

test("important details action label mirrors next prompt readiness", () => {
  assert.equal(weddingImportantDetailsActionLabel("Ready to generate the first recommendation set."), "Generate recommendations");
  assert.equal(weddingImportantDetailsActionLabel("Have you settled on a date or season?"), "Answer next detail");
});

test("recommendation requested output is readable by the workspace action handler", () => {
  const action = buildWeddingRecommendationGenerationAction({
    cardTitle: "Important details",
    nextQuestionLabel: "Ready to generate the first recommendation set.",
    state: state(),
  });

  assert.equal(weddingRecommendationRequestedOutput(action), "first_recommendation_set");
});

test("recommendation draft readiness requires enough basics for in-workspace generation", () => {
  assert.equal(weddingRecommendationDraftReady({
    dateOrSeason: "18 September 2027",
    location: "Sydney",
    budgetComfort: "$45,000",
    guestCount: "80",
  }), true);
  assert.equal(weddingRecommendationDraftReady({
    dateOrSeason: "18 September 2027",
    location: "Sydney",
    budgetComfort: "$45,000",
    prioritiesCsv: "Food, relaxed timing",
  }), true);
  assert.equal(weddingRecommendationDraftReady({
    dateOrSeason: "18 September 2027",
    location: "Sydney",
    guestCount: "80",
  }), false);
  assert.equal(weddingRecommendationDraftReady({
    location: "Sydney",
    budgetComfort: "$45,000",
    guestCount: "80",
  }), false);
});

test("recommendation generation action stays useful with sparse context", () => {
  const action = buildWeddingRecommendationGenerationAction({
    cardTitle: "",
    nextQuestionLabel: "",
    state: state({
      contextCards: [],
      budgetTracking: { budgetTargetAmount: null } as WeddingResponseWorkspaceViewState["budgetTracking"],
      guestTracking: { guestRowCount: 0 } as WeddingResponseWorkspaceViewState["guestTracking"],
      inspiration: { items: [] } as WeddingResponseWorkspaceViewState["inspiration"],
    }),
  });

  const metadata = action.metadata?.wedding_recommendation_generation as Record<string, unknown>;
  assert.equal(metadata.context_card_title, "Important details");
  assert.equal(metadata.next_question_label, null);
  assert.equal(metadata.requested_output, "answer_next_detail");
  assert.equal(metadata.known_budget, false);
  assert.equal(metadata.guest_count, 0);
  assert.equal(metadata.inspiration_count, 0);
  assert.deepEqual(action.contextLabels, ["Answer next detail", "Important details"]);
});

test("research prompt action carries document-level context through continue chat", () => {
  const action = buildWeddingResearchPromptAction({
    source: "artifact_detail",
    title: "Harbour venue research",
    artifactId: "artifact-research-1",
    artifactKind: "research",
    query: "wet weather venue options",
    state: state(),
  });

  assert.equal(action.kind, "continue_chat");
  assert.equal(action.label, "Research this further");
  const metadata = action.metadata?.wedding_research_prompt as Record<string, unknown>;
  assert.equal(metadata.version, 1);
  assert.equal(metadata.source, "artifact_detail");
  assert.equal(metadata.title, "Harbour venue research");
  assert.equal(metadata.artifact_id, "artifact-research-1");
  assert.equal(metadata.artifact_kind, "research");
  assert.equal(metadata.requested_output, "research_brief");
  assert.equal(metadata.query, "wet weather venue options");
  assert.equal(metadata.location, "Sydney NSW");
  assert.deepEqual(action.contextLabels, [
    "Research this further",
    "Harbour venue research",
    "wet weather venue options",
    "research",
    "Sydney NSW",
  ]);
});

test("research prompt action remains useful from the documents surface", () => {
  const action = buildWeddingResearchPromptAction({
    source: "documents",
    title: "",
    query: "",
    state: state({ workspace: { artifacts: [] } } as unknown as Partial<WeddingResponseWorkspaceViewState>),
  });

  assert.equal(action.label, "Ask for research");
  const metadata = action.metadata?.wedding_research_prompt as Record<string, unknown>;
  assert.equal(metadata.title, "Wedding research");
  assert.equal(metadata.artifact_id, null);
  assert.equal(metadata.artifact_kind, null);
  assert.equal(metadata.query, null);
  assert.equal(metadata.location, null);
  assert.deepEqual(action.contextLabels, ["Ask for research", "Wedding research"]);
});
