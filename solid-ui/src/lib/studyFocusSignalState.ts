// @locs-version: 1.0
import type { FileLibraryItem } from "@/lib/api";
import {
  fileLibraryAcademicSummary,
  fileLibraryStudyReadiness,
} from "@/lib/fileLibraryState";
import type { KnowledgeCard } from "@/lib/knowledgeGraphTypes";

export type StudyFocusSignal = {
  label: string;
  value: string;
  tone: "sky" | "amber" | "emerald";
};

export type StudyFocusSignals = {
  focus: StudyFocusSignal;
  weakSpot: StudyFocusSignal;
  nextStep: StudyFocusSignal;
};

type CandidateSentence = {
  text: string;
  score: number;
};

const FOCUS_HINTS = [
  "concept",
  "principle",
  "definition",
  "theme",
  "theory",
  "explains",
  "shows",
  "describes",
  "means",
  "because",
];

const RISK_HINTS = [
  "risk",
  "gap",
  "unclear",
  "confus",
  "weak",
  "missing",
  "contrast",
  "difference",
  "however",
  "but",
  "unless",
  "exam",
  "mistake",
  "challenge",
];

const ACTION_HINTS = [
  "review",
  "revise",
  "practice",
  "focus",
  "compare",
  "turn into",
  "quiz",
  "test",
  "summaris",
  "summariz",
  "link",
  "connect",
  "next",
  "write",
];

function normalizeSentence(value: string): string | null {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return cleaned.length > 180 ? `${cleaned.slice(0, 177).trimEnd()}...` : cleaned;
}

function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map(normalizeSentence)
    .filter((value): value is string => Boolean(value));
}

function scoreSentence(sentence: string, hints: readonly string[]): number {
  const lower = sentence.toLowerCase();
  let score = 0;
  for (const hint of hints) {
    if (lower.includes(hint)) score += 2;
  }
  if (sentence.length >= 35 && sentence.length <= 140) score += 1;
  return score;
}

function bestSentence(
  sentences: readonly string[],
  hints: readonly string[],
): CandidateSentence | null {
  const ranked = sentences
    .map((text) => ({ text, score: scoreSentence(text, hints) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.text.length - right.text.length);
  return ranked[0] ?? null;
}

function firstUsefulSentence(sentences: readonly string[]): string | null {
  return sentences.find((sentence) => sentence.length >= 20) ?? sentences[0] ?? null;
}

function preferredSupertags(tags: readonly string[]): string[] {
  return [...new Set(tags
    .filter((tag) => (
      tag.startsWith("topic:")
      || tag.startsWith("concept:")
      || tag.startsWith("course:")
      || tag.startsWith("week:")
      || tag.startsWith("lecture:")
      || tag.startsWith("resource:")
    ))
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0))];
}

function formatTag(tag: string): string {
  return tag.replace(/^[^:]+:/, "").replace(/[_-]+/g, " ").trim();
}

function fallbackFocusFromTags(tags: readonly string[]): string | null {
  const chosen = preferredSupertags(tags).slice(0, 3).map(formatTag).filter(Boolean);
  if (chosen.length === 0) return null;
  if (chosen.length === 1) return `Focus first on ${chosen[0]}.`;
  return `Focus first on ${chosen.slice(0, 2).join(" and ")} before widening the study pack.`;
}

function fallbackWeakSpot(kind: "file" | "graph", itemCount: number): string {
  if (kind === "graph") {
    return itemCount >= 2
      ? "Links are present, but the graph still needs stronger contradictions, examples, or cross-source evidence."
      : "One grounded card is not enough for reliable semantic retrieval yet.";
  }
  return itemCount >= 2
    ? "You have enough material to compare, but not every retained source is equally study-ready."
    : "A single retained source can anchor recall, but it will leave important gaps until a second source is linked.";
}

function fallbackNextStep(kind: "file" | "graph", readyCount: number, zettelkastenCount: number): string {
  if (zettelkastenCount > 0) {
    return "Turn the strongest point into a clearer permanent-note candidate, then link it to one supporting or conflicting source.";
  }
  if (kind === "graph") {
    return readyCount > 0
      ? "Open the strongest linked card first, then ask for overlap, differences, and likely exam traps."
      : "Add one more related lecture, reading, or note so the graph can move from isolated recall to grounded comparison.";
  }
  return readyCount > 0
    ? "Review the study-ready sources first, then ask for a comparison or revision guide from this pack."
    : "Add one related lecture, reading, or rough note so OmnyID can form stronger links instead of storing isolated material.";
}

function buildSignals(params: {
  kind: "file" | "graph";
  sentences: readonly string[];
  tags: readonly string[];
  itemCount: number;
  readyCount: number;
  zettelkastenCount: number;
}): StudyFocusSignals | null {
  const focusSentence = bestSentence(params.sentences, FOCUS_HINTS)?.text
    ?? firstUsefulSentence(params.sentences)
    ?? fallbackFocusFromTags(params.tags);
  if (!focusSentence) return null;

  const weakSpotSentence = bestSentence(params.sentences, RISK_HINTS)?.text
    ?? fallbackWeakSpot(params.kind, params.itemCount);
  const nextStepSentence = bestSentence(params.sentences, ACTION_HINTS)?.text
    ?? fallbackNextStep(params.kind, params.readyCount, params.zettelkastenCount);

  return {
    focus: {
      label: "Focus first",
      value: focusSentence,
      tone: "sky",
    },
    weakSpot: {
      label: "Watch out for",
      value: weakSpotSentence,
      tone: "amber",
    },
    nextStep: {
      label: "Do next",
      value: nextStepSentence,
      tone: "emerald",
    },
  };
}

export function buildFileStudyFocusSignals(items: readonly FileLibraryItem[]): StudyFocusSignals | null {
  if (items.length === 0) return null;
  const summaries = items.flatMap((item) => {
    const values = [
      item.source_summary,
      fileLibraryAcademicSummary(item),
    ];
    return values
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .flatMap(splitIntoSentences);
  });
  const tags = items.flatMap((item) => item.source_supertags);
  const readyCount = items.filter((item) => fileLibraryStudyReadiness(item) === "ready_now").length;
  const zettelkastenCount = items.filter((item) => item.source_metadata.knowledge_mode === "zettelkasten").length;
  return buildSignals({
    kind: "file",
    sentences: summaries,
    tags,
    itemCount: items.length,
    readyCount,
    zettelkastenCount,
  });
}

export function buildKnowledgeGraphStudyFocusSignals(cards: readonly KnowledgeCard[]): StudyFocusSignals | null {
  if (cards.length === 0) return null;
  const sentences = cards.flatMap((card) => {
    const values = [
      card.summary,
      card.academicSummary,
      ...(card.connectionReasons ?? []),
    ];
    return values
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .flatMap(splitIntoSentences);
  });
  const tags = cards.flatMap((card) => card.supertags);
  const readyCount = cards.filter((card) => card.connectionStrength === "high").length;
  const zettelkastenCount = cards.filter((card) => card.knowledgeMode === "zettelkasten").length;
  return buildSignals({
    kind: "graph",
    sentences,
    tags,
    itemCount: cards.length,
    readyCount,
    zettelkastenCount,
  });
}
