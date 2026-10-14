// @locs-version: 1.0
import type { WeddingInspirationItem, WeddingInspirationState } from "@/lib/weddingInspirationState";

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
  signals: RegExp[];
};

const TRAIT_RULES: TraitRule[] = [
  {
    id: "warm_intimate",
    kind: "atmosphere",
    label: "Warm and intimate",
    plainMeaning: "Prioritise lighting, closeness, and a room that feels easy to settle into.",
    tags: ["warm lighting", "candles", "long table"],
    signals: [/warm/i, /candle/i, /intimate/i, /communal/i],
  },
  {
    id: "relaxed_low_formality",
    kind: "friction",
    label: "Relaxed, low-formality",
    plainMeaning: "Avoid choices that make the day feel over-produced or stiff.",
    tags: ["informal"],
    signals: [/relaxed/i, /informal/i, /casual/i],
  },
  {
    id: "guest_conversation",
    kind: "social",
    label: "Guest conversation matters",
    plainMeaning: "Prefer layouts, flowers, music, and timelines that make it easy for guests to talk.",
    tags: ["long table", "low florals", "reception"],
    signals: [/communal/i, /conversation/i, /reception mood/i],
  },
  {
    id: "restrained_visuals",
    kind: "sensory",
    label: "Restrained styling",
    plainMeaning: "Keep visual styling calm and intentional instead of competing for attention.",
    tags: ["low florals"],
    signals: [/restrained/i, /minimal/i],
  },
  {
    id: "place_led",
    kind: "value",
    label: "Place-led feeling",
    plainMeaning: "The venue and setting should carry more of the mood than heavy decoration.",
    tags: ["venue"],
    signals: [/venue look/i, /garden/i, /setting/i],
  },
  {
    id: "personal_style",
    kind: "value",
    label: "Personal over generic",
    plainMeaning: "Shortlist options that feel specific to you, not only conventionally wedding-like.",
    tags: ["dress", "vendor portfolio", "pinterest"],
    signals: [/attire preference/i, /vendor style/i, /saved inspiration/i],
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
    const signalMatches = item.preferenceSignals.filter((signal) => rule.signals.some((pattern) => pattern.test(signal)));
    const note = item.note ?? "";
    const noteMatch = note && rule.signals.some((pattern) => pattern.test(note)) ? ["note"] : [];
    const matches = uniqueStrings([...tagMatches, ...signalMatches, ...noteMatch], 4);
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
  fit: RegExp;
  tradeoff: RegExp;
}> = [
  {
    traitIdSuffix: "warm_intimate",
    fitLabel: "supports warm, intimate atmosphere",
    tradeoffLabel: "may feel too cold or large-scale for the warm, intimate direction",
    fit: /\b(warm|candle|ambient|intimate|cosy|cozy|low lighting|soft lighting)\b/i,
    tradeoff: /\b(cold|bright white|fluorescent|industrial|large ballroom|warehouse|stark)\b/i,
  },
  {
    traitIdSuffix: "guest_conversation",
    fitLabel: "supports easy guest conversation",
    tradeoffLabel: "may make guest conversation harder",
    fit: /\b(low floral|long table|communal|acoustic|conversation|quiet|lounge)\b/i,
    tradeoff: /\b(tall centerpiece|tall floral|high floral|loud|club volume|speaker near|blocked sightline)\b/i,
  },
  {
    traitIdSuffix: "relaxed_low_formality",
    fitLabel: "keeps the day relaxed",
    tradeoffLabel: "may add more formality than the couple seems to want",
    fit: /\b(relaxed|informal|casual|simple|low pressure|easy)\b/i,
    tradeoff: /\b(black tie|formal|choreographed|strict run sheet|grand entrance|multiple speeches)\b/i,
  },
  {
    traitIdSuffix: "restrained_visuals",
    fitLabel: "matches restrained styling",
    tradeoffLabel: "may compete with the restrained visual direction",
    fit: /\b(restrained|minimal|simple|clean|low floral|understated)\b/i,
    tradeoff: /\b(maximal|dramatic|oversized|lush|heavy decor|statement installation)\b/i,
  },
  {
    traitIdSuffix: "place_led",
    fitLabel: "lets the setting carry the feeling",
    tradeoffLabel: "may rely on decoration instead of the setting",
    fit: /\b(garden|view|heritage|waterfront|venue character|setting)\b/i,
    tradeoff: /\b(blank canvas|heavy styling|cover the room|transform the space)\b/i,
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
  for (const trait of model.traits) {
    const rule = EXPERIENCE_DECISION_FIT_RULES.find((candidate) => trait.id.endsWith(candidate.traitIdSuffix));
    if (!rule) continue;
    if (rule.tradeoff.test(text)) {
      tradeoffLabels.push(rule.tradeoffLabel);
      evidenceLabels.push(...trait.evidenceLabels.slice(0, 2));
    } else if (rule.fit.test(text)) {
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
): WeddingExperienceModelState {
  const items = inspiration?.items ?? [];
  const traits = [
    ...TRAIT_RULES
    .map((rule) => traitFromRule(rule, items))
    .filter((trait): trait is WeddingExperienceTrait => trait !== null),
    visualDirectionTrait(items),
    latestNoteTrait(items),
  ]
    .filter((trait): trait is WeddingExperienceTrait => trait !== null)
    .sort((left, right) => right.score - left.score || left.label.localeCompare(right.label))
    .slice(0, 6);
  const topLabels = traits.slice(0, 4).map((trait) => trait.label.toLowerCase());
  return {
    title: "What your wedding is starting to feel like",
    summaryLabel: topLabels.length > 0
      ? `OmnyID is seeing ${topLabels.join(", ")}. Treat this as a working guess until you confirm it.`
      : "Add a few examples and OmnyID will start turning them into a simple wedding style model.",
    confidenceLabel: traits.some((trait) => trait.confidence === "strong")
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
