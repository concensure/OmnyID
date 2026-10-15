// @locs-version: 1.0
import type { WeddingInspirationItem, WeddingInspirationState } from "@/lib/weddingInspirationState";
import { weddingFacetsForPhrase } from "@/lib/weddingFacetVocabularyState";

export type WeddingExperienceTraitKind =
  | "atmosphere"
  | "social"
  | "sensory"
  | "value"
  | "friction";

export type WeddingExperienceTrait = {
  id: string;
  kind: WeddingExperienceTraitKind;
  label: string;
  plainMeaning: string;
  confidence: "early" | "emerging" | "strong";
  score: number;
  evidenceLabels: string[];
  sourceItemIds: string[];
};

export type WeddingExperienceModelState = {
  title: string;
  summaryLabel: string;
  confidenceLabel: string;
  traits: WeddingExperienceTrait[];
  recommendationConstraints: Array<{
    id: string;
    label: string;
    reason: string;
    evidenceLabels: string[];
  }>;
  validationPrompt: {
    question: string;
    options: string[];
  } | null;
  emptyLabel: string;
};

export type WeddingExperienceDecisionFitState = {
  fitLabels: string[];
  tradeoffLabels: string[];
  evidenceLabels: string[];
  summaryLabel: string;
};

type TraitRule = {
  id: string;
  kind: WeddingExperienceTraitKind;
  label: string;
  plainMeaning: string;
  tags: string[];
  facetIds: string[];
};

const TRAIT_RULES: TraitRule[] = [
  {
    id: "warm_intimate",
    kind: "atmosphere",
    label: "Warm and intimate",
    plainMeaning: "Prioritise lighting, closeness, and a room that feels easy to settle into.",
    tags: ["warm lighting", "candles", "long table"],
    facetIds: ["atmosphere.warm", "scale.intimate"],
  },
  {
    id: "relaxed_low_formality",
    kind: "friction",
    label: "Relaxed, low-formality",
    plainMeaning: "Avoid choices that make the day feel over-produced or stiff.",
    tags: ["informal"],
    facetIds: ["atmosphere.relaxed"],
  },
  {
    id: "guest_conversation",
    kind: "social",
    label: "Guest conversation matters",
    plainMeaning: "Prefer layouts, flowers, music, and timelines that make it easy for guests to talk.",
    tags: ["long table", "low florals", "reception"],
    facetIds: ["atmosphere.warm"],
  },
  {
    id: "restrained_visuals",
    kind: "sensory",
    label: "Restrained styling",
    plainMeaning: "Keep visual styling calm and intentional instead of competing for attention.",
    tags: ["low florals"],
    facetIds: ["atmosphere.calm", "aesthetic.modern_minimal"],
  },
  {
    id: "place_led",
    kind: "value",
    label: "Place-led feeling",
    plainMeaning: "The venue and setting should carry more of the mood than heavy decoration.",
    tags: ["venue"],
    facetIds: ["setting.garden", "setting.waterfront", "setting.heritage_estate", "experience.views_led"],
  },
  {
    id: "personal_style",
    kind: "value",
    label: "Personal over generic",
    plainMeaning: "Shortlist options that feel specific to you, not only conventionally wedding-like.",
    tags: ["dress", "vendor portfolio", "pinterest"],
    facetIds: ["aesthetic.blank_canvas", "aesthetic.classic", "aesthetic.bohemian"],
  },
];

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function confidence(score: number, sourceCount: number): WeddingExperienceTrait["confidence"] {
  if (score >= 5 || sourceCount >= 4) return "strong";
  if (score >= 3 || sourceCount >= 2) return "emerging";
  return "early";
}

function evidenceLabel(item: WeddingInspirationItem, matchedLabels: readonly string[]): string {
  const clue = matchedLabels[0] ? `: ${matchedLabels[0]}` : "";
  return `${item.title}${clue}`;
}

function traitFromRule(rule: TraitRule, items: readonly WeddingInspirationItem[]): WeddingExperienceTrait | null {
  const evidence: string[] = [];
  const sourceIds: string[] = [];
  let score = 0;
  for (const item of items) {
    const tagMatches = item.tags.filter((tag) => rule.tags.includes(tag));
    const text = [...item.preferenceSignals, item.note ?? ""].join(" ");
    const facetMatches = weddingFacetsForPhrase(text).filter((facet) => rule.facetIds.includes(facet.id));
    const matches = uniqueStrings([...tagMatches, ...facetMatches.map((facet) => facet.label)], 4);
    if (matches.length === 0) continue;
    score += matches.length + 1;
    sourceIds.push(item.id);
    evidence.push(evidenceLabel(item, matches));
  }
  if (score === 0) return null;
  return {
    id: `wedding_experience:${rule.id}`,
    kind: rule.kind,
    label: rule.label,
    plainMeaning: rule.plainMeaning,
    confidence: confidence(score, sourceIds.length),
    score,
    evidenceLabels: uniqueStrings(evidence, 6),
    sourceItemIds: uniqueStrings(sourceIds, 12),
  };
}

function visualDirectionTrait(items: readonly WeddingInspirationItem[]): WeddingExperienceTrait | null {
  const visualItems = items.filter((item) => item.kind === "image" || item.kind === "screenshot");
  if (visualItems.length < 2) return null;
  return {
    id: "wedding_experience:visual_direction",
    kind: "atmosphere",
    label: "A visual direction is emerging",
    plainMeaning: "There are enough images here to compare what keeps recurring. Add a note about what you want to keep or avoid, and OmnyID will turn that into sharper recommendations.",
    confidence: confidence(visualItems.length, visualItems.length),
    score: visualItems.length,
    evidenceLabels: visualItems.slice(0, 6).map((item) => item.title),
    sourceItemIds: visualItems.slice(0, 12).map((item) => item.id),
  };
}

function latestNoteTrait(items: readonly WeddingInspirationItem[]): WeddingExperienceTrait | null {
  const notes = items
    .filter((item) => item.kind === "thought" || Boolean(clean(item.note)))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
  const latest = notes[0];
  if (!latest) return null;
  const note = clean(latest.note);
  const clue = note.length > 120 ? `${note.slice(0, 117).trimEnd()}...` : note;
  return {
    id: "wedding_experience:latest_couple_note",
    kind: "value",
    label: "Your latest note is guiding the plan",
    plainMeaning: clue
      ? `OmnyID is treating this as a direct planning instruction: “${clue}”`
      : "OmnyID is treating your latest note as a direct planning instruction.",
    confidence: "early",
    score: 1,
    evidenceLabels: [latest.title],
    sourceItemIds: [latest.id],
  };
}

function constraintForTrait(trait: WeddingExperienceTrait): WeddingExperienceModelState["recommendationConstraints"][number] {
  if (trait.id.endsWith("guest_conversation")) {
    return {
      id: "protect_guest_conversation",
      label: "Protect easy conversation",
      reason: "When comparing tables, flowers, music, or run sheets, avoid choices that block people from talking comfortably.",
      evidenceLabels: trait.evidenceLabels.slice(0, 3),
    };
  }
  if (trait.id.endsWith("relaxed_low_formality")) {
    return {
      id: "avoid_over_formal_choices",
      label: "Keep the day relaxed",
      reason: "Prefer options with fewer formal moments, fewer handoffs, and less performance pressure.",
      evidenceLabels: trait.evidenceLabels.slice(0, 3),
    };
  }
  if (trait.id.endsWith("warm_intimate")) {
    return {
      id: "prioritise_lighting_and_closeness",
      label: "Prioritise warmth and closeness",
      reason: "Use lighting, table layout, and room scale as decision criteria, not only colours or decor style.",
      evidenceLabels: trait.evidenceLabels.slice(0, 3),
    };
  }
  return {
    id: `use_${trait.id.replace(/^wedding_experience:/, "")}`,
    label: `Use ${trait.label.toLowerCase()} as a filter`,
    reason: trait.plainMeaning,
    evidenceLabels: trait.evidenceLabels.slice(0, 3),
  };
}

const EXPERIENCE_DECISION_FIT_RULES: Array<{
  traitIdSuffix: string;
  fitLabel: string;
  tradeoffLabel: string;
  fitFacetIds: string[];
  tradeoffFacetIds: string[];
}> = [
  {
    traitIdSuffix: "warm_intimate",
    fitLabel: "supports warm, intimate atmosphere",
    tradeoffLabel: "may feel too cold or large-scale for the warm, intimate direction",
    fitFacetIds: ["atmosphere.warm", "scale.intimate"],
    tradeoffFacetIds: ["scale.large"],
  },
  {
    traitIdSuffix: "guest_conversation",
    fitLabel: "supports easy guest conversation",
    tradeoffLabel: "may make guest conversation harder",
    fitFacetIds: ["atmosphere.warm"],
    tradeoffFacetIds: ["atmosphere.lively"],
  },
  {
    traitIdSuffix: "relaxed_low_formality",
    fitLabel: "keeps the day relaxed",
    tradeoffLabel: "may add more formality than the couple seems to want",
    fitFacetIds: ["atmosphere.relaxed"],
    tradeoffFacetIds: ["atmosphere.elegant", "atmosphere.grand"],
  },
  {
    traitIdSuffix: "restrained_visuals",
    fitLabel: "matches restrained styling",
    tradeoffLabel: "may compete with the restrained visual direction",
    fitFacetIds: ["atmosphere.calm", "aesthetic.modern_minimal"],
    tradeoffFacetIds: ["aesthetic.ornate_glam"],
  },
  {
    traitIdSuffix: "place_led",
    fitLabel: "lets the setting carry the feeling",
    tradeoffLabel: "may rely on decoration instead of the setting",
    fitFacetIds: ["setting.garden", "setting.waterfront", "setting.heritage_estate", "experience.views_led"],
    tradeoffFacetIds: ["aesthetic.blank_canvas", "aesthetic.ornate_glam"],
  },
];

export function evaluateWeddingExperienceDecisionFit(
  model: Pick<WeddingExperienceModelState, "traits"> | null | undefined,
  decisionText: string,
): WeddingExperienceDecisionFitState {
  const text = clean(decisionText);
  if (!text || !model?.traits.length) {
    return {
      fitLabels: [],
      tradeoffLabels: [],
      evidenceLabels: [],
      summaryLabel: "Wedding style fit not measured yet.",
    };
  }
  const fitLabels: string[] = [];
  const tradeoffLabels: string[] = [];
  const evidenceLabels: string[] = [];
  const matchedFacets = new Set(weddingFacetsForPhrase(text).map((facet) => facet.id));
  for (const trait of model.traits) {
    const rule = EXPERIENCE_DECISION_FIT_RULES.find((candidate) => trait.id.endsWith(candidate.traitIdSuffix));
    if (!rule) continue;
    if (rule.tradeoffFacetIds.some((id) => matchedFacets.has(id))) {
      tradeoffLabels.push(rule.tradeoffLabel);
      evidenceLabels.push(...trait.evidenceLabels.slice(0, 2));
    } else if (rule.fitFacetIds.some((id) => matchedFacets.has(id))) {
      fitLabels.push(rule.fitLabel);
      evidenceLabels.push(...trait.evidenceLabels.slice(0, 2));
    }
  }
  const fit = uniqueStrings(fitLabels, 4);
  const tradeoffs = uniqueStrings(tradeoffLabels, 4);
  return {
    fitLabels: fit,
    tradeoffLabels: tradeoffs,
    evidenceLabels: uniqueStrings(evidenceLabels, 6),
    summaryLabel: tradeoffs.length > 0
      ? `${tradeoffs.length} possible style tradeoff${tradeoffs.length === 1 ? "" : "s"}`
      : fit.length > 0
        ? `${fit.length} wedding style fit signal${fit.length === 1 ? "" : "s"}`
        : "No clear wedding style fit signal in this option.",
  };
}

export function buildWeddingExperienceModelState(
  inspiration: Pick<WeddingInspirationState, "items"> | null | undefined,
  options?: { evidenceWeight?: number },
): WeddingExperienceModelState {
  const items = inspiration?.items ?? [];
  const evidenceWeight = Math.min(1, Math.max(0, options?.evidenceWeight ?? 1));
  const traits = [
    ...TRAIT_RULES
    .map((rule) => traitFromRule(rule, items))
    .filter((trait): trait is WeddingExperienceTrait => trait !== null),
    visualDirectionTrait(items),
    latestNoteTrait(items),
  ]
    .filter((trait): trait is WeddingExperienceTrait => trait !== null)
    .map((trait) => evidenceWeight === 1 ? trait : { ...trait, score: trait.score * evidenceWeight })
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, 6);
  const topLabels = traits.slice(0, 4).map((trait) => trait.label.toLowerCase());
  return {
    title: "What your wedding is starting to feel like",
    summaryLabel: topLabels.length > 0
      ? `OmnyID is seeing ${topLabels.join(", ")}. Treat this as a working guess until you confirm it.`
      : "Add a few examples and OmnyID will start turning them into a simple wedding style model.",
    confidenceLabel: evidenceWeight === 0.8
      ? "Working at 80% confidence"
      : traits.some((trait) => trait.confidence === "strong")
      ? "Strong pattern"
      : traits.some((trait) => trait.confidence === "emerging")
        ? "Pattern emerging"
        : traits.length > 0
          ? "Early clues"
          : "No pattern yet",
    traits,
    recommendationConstraints: traits.slice(0, 4).map(constraintForTrait),
    validationPrompt: traits.length > 0 ? {
      question: "Does this sound like the wedding you are trying to create?",
      options: ["Yes", "Mostly", "Not really"],
    } : null,
    emptyLabel: "Add inspiration first. Photos, links, notes, and screenshots can all become planning clues.",
  };
}
