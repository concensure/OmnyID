// @locs-version: 1.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

type WeddingDateSource = Pick<WeddingResponseWorkspaceViewState, "ganttTimeline"> & Partial<Pick<WeddingResponseWorkspaceViewState, "contextCards">>;

function exactDateFromText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match?.[1] ?? null;
}

function dateOrSeasonFromText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/\b(?:date|season|wedding day|wedding date)\s*:\s*(.+)$/i);
  const label = (match?.[1] ?? "").trim();
  return label || null;
}

function cleanDateOrSeason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const label = value.trim();
  return label || null;
}

export function weddingTimelineWeddingDateLabel(state: WeddingDateSource): string | null {
  const row = state.ganttTimeline.rows.find((item) =>
    /\bwedding[\s_-]*(day|date)\b/i.test(`${item.id} ${item.title}`)
  );
  if (row?.endLabel) return row.endLabel;

  for (const card of state.contextCards ?? []) {
    const contextDate = cleanDateOrSeason(card.planningContext?.dateOrSeason);
    const exactContextDate = exactDateFromText(contextDate);
    if (exactContextDate) return exactContextDate;
    for (const label of card.answeredLabels ?? []) {
      if (!/\b(date|season|wedding day|wedding date)\b/i.test(label)) continue;
      const exact = exactDateFromText(label);
      if (exact) return exact;
    }
  }
  return null;
}

export function weddingTargetDateOrSeasonLabel(state: WeddingDateSource): string | null {
  const exact = weddingTimelineWeddingDateLabel(state);
  if (exact) return exact;
  for (const card of state.contextCards ?? []) {
    const contextTarget = cleanDateOrSeason(card.planningContext?.dateOrSeason);
    if (contextTarget) return contextTarget;
    for (const label of card.answeredLabels ?? []) {
      if (!/\b(date|season|wedding day|wedding date)\b/i.test(label)) continue;
      const target = dateOrSeasonFromText(label);
      if (target) return target;
    }
  }
  return null;
}
