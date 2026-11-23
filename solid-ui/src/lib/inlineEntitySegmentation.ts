// @locs-version: 1.0
import type { InlineEntityKind } from "@/lib/inlineEntityKinds";

export type InlineEntityDescriptor = {
  kind: InlineEntityKind;
  text?: string;
  value?: string;
  start?: number;
  end?: number;
  metadata?: Record<string, unknown>;
};

export type InlineEntityMatch = {
  start: number;
  end: number;
  kind: InlineEntityKind;
  text: string;
  value: string;
  metadata?: Record<string, unknown>;
};

export type InlineEntitySegment =
  | { type: "text"; value: string }
  | { type: "entity"; match: InlineEntityMatch };

type CandidateMatch = InlineEntityMatch & {
  priority: 1 | 2;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function addRegexMatches(text: string, regex: RegExp, kind: InlineEntityKind, matches: CandidateMatch[]) {
  for (const result of text.matchAll(regex)) {
    const matchText = result[0];
    const start = result.index ?? -1;
    if (start < 0 || !matchText) continue;
    matches.push({
      start,
      end: start + matchText.length,
      kind,
      text: matchText,
      value: matchText,
      priority: 1,
    });
  }
}

function resolveExplicitMatches(text: string, entities: InlineEntityDescriptor[]): CandidateMatch[] {
  const matches: CandidateMatch[] = [];
  let searchCursor = 0;
  for (const entity of entities) {
    const rawText = entity.text?.trim() || entity.value?.trim();
    if (!rawText) continue;
    if (
      typeof entity.start === "number"
      && typeof entity.end === "number"
      && entity.end > entity.start
    ) {
      matches.push({
        start: entity.start,
        end: entity.end,
        kind: entity.kind,
        text: text.slice(entity.start, entity.end) || rawText,
        value: entity.value?.trim() || rawText,
        metadata: entity.metadata,
        priority: 2,
      });
      continue;
    }
    const regex = new RegExp(escapeRegExp(rawText), "i");
    const slice = text.slice(searchCursor);
    const found = slice.search(regex);
    if (found < 0) continue;
    const start = searchCursor + found;
    const end = start + rawText.length;
    matches.push({
      start,
      end,
      kind: entity.kind,
      text: text.slice(start, end),
      value: entity.value?.trim() || rawText,
      metadata: entity.metadata,
      priority: 2,
    });
    searchCursor = end;
  }
  return matches;
}

function resolveHeuristicMatches(text: string): CandidateMatch[] {
  const matches: CandidateMatch[] = [];
  addRegexMatches(text, /#[\w-]+/g, "hashtag", matches);
  addRegexMatches(text, /\b(?:USD|AUD|EUR|GBP|JPY|CAD|NZD|SGD|CHF)\s?\d+(?:[.,]\d{1,2})?\b/g, "currency", matches);
  addRegexMatches(text, /[$€£¥]\s?\d+(?:[.,]\d{1,2})?/g, "currency", matches);
  addRegexMatches(
    text,
    /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,\s*\d{4})?\b/gi,
    "date",
    matches,
  );
  addRegexMatches(text, /\+?\d[\d\s().-]{7,}\d/g, "phone", matches);
  addRegexMatches(text, /\b(?:invoice|inv)\s*#?:?\s*[A-Z0-9-]{3,}\b/gi, "invoice", matches);
  addRegexMatches(text, /\b(?:ticket|pnr|booking)\s*#?:?\s*[A-Z0-9-]{3,}\b/gi, "ticket", matches);
  addRegexMatches(text, /\b[\w.-]+\.(?:pdf|docx?|xlsx?|csv|pptx?|txt|md|png|jpe?g|gif)\b/gi, "file", matches);
  return matches;
}

function dedupeAndSortMatches(matches: CandidateMatch[]): InlineEntityMatch[] {
  const sorted = [...matches].sort((a, b) => a.start - b.start || b.priority - a.priority || b.end - a.end);
  const accepted: CandidateMatch[] = [];
  for (const match of sorted) {
    const previous = accepted.at(-1);
    if (!previous || match.start >= previous.end) {
      accepted.push(match);
      continue;
    }
    if (match.priority > previous.priority) {
      accepted[accepted.length - 1] = match;
    }
  }
  return accepted.map(({ priority: _priority, ...match }) => match);
}

export function splitTextIntoInlineEntitySegments(
  text: string,
  entities?: InlineEntityDescriptor[],
): InlineEntitySegment[] {
  const matches = dedupeAndSortMatches([
    ...(entities ? resolveExplicitMatches(text, entities) : []),
    ...resolveHeuristicMatches(text),
  ]);
  if (matches.length === 0) return [{ type: "text", value: text }];

  const segments: InlineEntitySegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({ type: "text", value: text.slice(cursor, match.start) });
    }
    segments.push({ type: "entity", match });
    cursor = match.end;
  }
  if (cursor < text.length) {
    segments.push({ type: "text", value: text.slice(cursor) });
  }
  return segments;
}
