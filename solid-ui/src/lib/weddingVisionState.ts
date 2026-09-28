// @locs-version: 1.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export type WeddingVisionAction = {
  label: string;
  detail: string;
  targetMenu: WeddingWorkspaceMenuId;
};

export type WeddingVisionState = {
  title: string;
  intro: string;
  feelTags: string[];
  priorityRows: Array<{ label: string; rating: number; reason: string }>;
  avoidLabels: string[];
  importantPeopleLabels: string[];
  decisionRules: string[];
  evidenceLabels: string[];
  confidenceLabel: string;
  sourceMixLabels: string[];
  learningLabels: string[];
  actionLabels: WeddingVisionAction[];
  correctionPrompt: string;
  a2ui: Record<string, unknown>;
};

function unique(values: readonly string[], limit: number): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, limit);
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function objectString(value: unknown, key: string): string | null {
  if (value === null || typeof value !== "object") return null;
  return optionalString((value as Record<string, unknown>)[key]);
}

function objectStringArray(value: unknown, key: string): string[] {
  if (value === null || typeof value !== "object") return [];
  const raw = (value as Record<string, unknown>)[key];
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function includesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function contextText(state: WeddingResponseWorkspaceViewState): string {
  return [
    ...state.contextCards.flatMap((card) => [...card.answeredLabels, ...card.metadataLabels, card.nextQuestionLabel]),
    ...state.inspiration.items.flatMap((item) => [
      item.title,
      item.note,
      ...objectStringArray(item, "supertags"),
      ...objectStringArray(item, "tags"),
      ...objectStringArray(item, "preferenceSignals"),
    ]),
  ].join(" \n ");
}

function buildFeelTags(text: string): string[] {
  const tags = [
    includesAny(text, [/warm/i, /candle/i, /intimate/i]) ? "Warm" : null,
    includesAny(text, [/relaxed/i, /informal/i, /casual/i]) ? "Relaxed" : null,
    includesAny(text, [/guest|people|family|friend|social/i]) ? "Social" : null,
    includesAny(text, [/personal|meaningful|story|vow/i]) ? "Personal" : null,
    includesAny(text, [/food|feast|generous|hospitality/i]) ? "Generous" : null,
  ].filter((value): value is string => Boolean(value));
  return unique(tags.length ? tags : ["Warm", "Relaxed", "Personal"], 5);
}

function priorityRows(state: WeddingResponseWorkspaceViewState, text: string): WeddingVisionState["priorityRows"] {
  const rows = [
    {
      label: "People",
      rating: state.guestTracking.guestRowCount > 0 || /guest|family|friend|people/i.test(text) ? 5 : 4,
      reason: state.guestTracking.guestRowCount > 0 ? `${state.guestTracking.guestRowCount} guests are already part of the plan.` : "Guest experience appears central to the planning brief.",
    },
    {
      label: "Food",
      rating: /food|cater|menu|drink|meal/i.test(text) ? 5 : 3,
      reason: /food|cater|menu|drink|meal/i.test(text) ? "Food or catering appears in the saved planning context." : "No strong food signal yet.",
    },
    {
      label: "Photography",
      rating: /photo|photographer|image|portrait/i.test(text) ? 4 : 3,
      reason: /photo|photographer|image|portrait/i.test(text) ? "Photos or photography show up in saved context or inspiration." : "Photography priority is not clear yet.",
    },
    {
      label: "Music",
      rating: /music|band|dj|dance/i.test(text) ? 4 : 2,
      reason: /music|band|dj|dance/i.test(text) ? "Music appears in saved context." : "Music priority is not clear yet.",
    },
    {
      label: "Decor",
      rating: /decor|flower|floral|styling|candle/i.test(text) ? 3 : 2,
      reason: /decor|flower|floral|styling|candle/i.test(text) ? "Decor or styling appears in inspiration/context." : "Decor looks secondary until more evidence is added.",
    },
  ];
  return rows.sort((left, right) => right.rating - left.rating);
}

function avoidLabels(text: string): string[] {
  const labels = [
    /formal|black.?tie/i.test(text) ? null : "Overly formal",
    /photo/i.test(text) ? "Long photo sessions" : null,
    /waiting|delay|timeline|run.?sheet/i.test(text) ? "Guests waiting around" : null,
    /budget|cost|floral|flower/i.test(text) ? "Large floral expenditure" : null,
  ].filter((value): value is string => Boolean(value));
  return unique(labels.length ? labels : ["Overly formal", "Guests waiting around", "Decisions that blow the budget"], 5);
}

function importantPeople(state: WeddingResponseWorkspaceViewState): string[] {
  const helpers = state.delegation.items
    .map((item) => item.personName ?? (item.relationship ? `${item.relationship} helper` : item.categoryLabel))
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  const guests = state.boundaryState.familyVisibleObjects
    .map((item) => item.title ?? objectString(item, "displayName") ?? objectString(item, "householdId"))
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return unique([...helpers, ...guests], 5);
}

function actionLabels(state: WeddingResponseWorkspaceViewState): WeddingVisionAction[] {
  const actions: WeddingVisionAction[] = [];
  if (state.inspiration.items.length === 0) {
    actions.push({
      label: "Add inspiration",
      detail: "Upload images, screenshots, notes, or links so OmnyID can learn the look and feeling.",
      targetMenu: "inspiration",
    });
  }
  if (state.guestTracking.guestRowCount === 0) {
    actions.push({
      label: "Add important people",
      detail: "Start the guest list and mark access needs, family rules, or sensitive relationships.",
      targetMenu: "people",
    });
  }
  if (state.budgetTracking.budgetTargetAmount === null) {
    actions.push({
      label: "Set budget",
      detail: "Give the planner a budget ceiling so recommendations can respect money tradeoffs.",
      targetMenu: "budget",
    });
  }
  if (actions.length === 0) {
    actions.push({
      label: "Review the plan",
      detail: "Check follow-ups, timing, and shared-plan settings that may change the wedding compass.",
      targetMenu: "plan",
    });
  }
  return actions.slice(0, 3);
}

function confidenceLabel(state: WeddingResponseWorkspaceViewState, evidenceCount: number): string {
  const hasInspiration = state.inspiration.items.length > 0;
  const hasPeople = state.guestTracking.guestRowCount > 0 || state.boundaryState.familyVisibleObjects.length > 0;
  const hasBudget = state.budgetTracking.budgetTargetAmount !== null;
  if (evidenceCount >= 4 && hasInspiration && hasPeople && hasBudget) return "Confidence: strong, based on several parts of the plan.";
  if (evidenceCount >= 2 && (hasInspiration || hasPeople || hasBudget)) return "Confidence: developing, good enough to guide early choices.";
  return "Confidence: early, still learning what matters most.";
}

function sourceMixLabels(state: WeddingResponseWorkspaceViewState): string[] {
  return unique([
    state.contextCards.length > 0 ? `${state.contextCards.length} planning answer set${state.contextCards.length === 1 ? "" : "s"}` : "",
    state.inspiration.items.length > 0 ? `${state.inspiration.items.length} inspiration item${state.inspiration.items.length === 1 ? "" : "s"}` : "",
    state.guestTracking.guestRowCount > 0 ? `${state.guestTracking.guestRowCount} guests or people constraints` : "",
    state.budgetTracking.budgetTargetAmount !== null ? "Budget ceiling" : "",
    state.boundaryState.familyVisibleObjects.length > 0 ? "Family or access notes" : "",
  ], 6);
}

function learningLabels(state: WeddingResponseWorkspaceViewState): string[] {
  const labels = [
    state.inspiration.items.length === 0 ? "Add inspiration images, screenshots, links, or notes to teach the look and feeling." : "",
    state.guestTracking.guestRowCount === 0 ? "Add guests or important people so access needs and family context can shape the plan." : "",
    state.budgetTracking.budgetTargetAmount === null ? "Set a budget ceiling so recommendations can respect money tradeoffs." : "",
    state.delegation.items.length === 0 ? "Add who is helping so responsibilities and decision ownership are clearer." : "",
  ];
  return unique(labels, 4);
}

export function buildWeddingVisionState(state: WeddingResponseWorkspaceViewState): WeddingVisionState {
  const text = contextText(state);
  const people = importantPeople(state);
  const evidenceLabels = unique([
    ...state.contextCards.flatMap((card) => card.answeredLabels),
    state.inspiration.items.length > 0 ? `${state.inspiration.items.length} inspiration item${state.inspiration.items.length === 1 ? "" : "s"}` : "",
    state.budgetTracking.budgetTargetAmount !== null ? "Budget target has been set." : "",
    state.guestTracking.guestRowCount > 0 ? `${state.guestTracking.guestRowCount} guests in the guest list.` : "",
  ], 8);
  const sourceMix = sourceMixLabels(state);
  const learning = learningLabels(state);
  const vision = {
    title: "Our Wedding Compass",
    intro: "A living summary of what OmnyID thinks matters for this wedding. Correct it whenever it feels off.",
    feelTags: buildFeelTags(text),
    priorityRows: priorityRows(state, text),
    avoidLabels: avoidLabels(text),
    importantPeopleLabels: people.length ? people : ["Add important people from Guests or Who helps."],
    decisionRules: [
      "Routine planning suggestions can be prepared by OmnyID.",
      "Guest list, budget, and family-sensitive decisions need couple review.",
      "Vendor messages and shared plan changes wait for approval.",
    ],
    evidenceLabels: evidenceLabels.length ? evidenceLabels : ["Add a date, budget, guests, inspiration, or planning note to teach OmnyID what matters."],
    confidenceLabel: confidenceLabel(state, evidenceLabels.length),
    sourceMixLabels: sourceMix.length ? sourceMix : ["No saved wedding evidence yet."],
    learningLabels: learning.length ? learning : ["Keep adding choices, uploads, and corrections. OmnyID will adjust this summary as the plan changes."],
    actionLabels: actionLabels(state),
    correctionPrompt: "Does this sound right?",
  };
  return {
    ...vision,
    a2ui: {
      schema_version: "a2ui.v1",
      kind: "wedding_vision",
      title: vision.title,
      description: vision.intro,
      sections: [
        { title: "How it should feel", items: vision.feelTags },
        { title: "What matters most", items: vision.priorityRows.map((row) => `${row.label}: ${row.rating}/5`) },
        { title: "What we do not want", items: vision.avoidLabels },
        { title: "Important people", items: vision.importantPeopleLabels },
        { title: "How we decide", items: vision.decisionRules },
        { title: "Why I think this", items: vision.evidenceLabels },
        { title: "Confidence", items: [vision.confidenceLabel] },
        { title: "Evidence used", items: vision.sourceMixLabels },
        { title: "Still learning", items: vision.learningLabels },
        { title: "Improve this summary", items: vision.actionLabels.map((action) => action.label) },
      ],
    },
  };
}
