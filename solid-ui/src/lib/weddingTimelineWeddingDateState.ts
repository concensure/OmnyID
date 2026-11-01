// @locs-version: 1.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

type WeddingDateSource = Pick<WeddingResponseWorkspaceViewState, "ganttTimeline"> & Partial<Pick<WeddingResponseWorkspaceViewState, "contextCards">>;

function exactDateFromText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const validIso = (year: number, month: number, day: number): string | null => {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  };
  const iso = value.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const australian = value.match(/\b(\d{1,2})[\/-](\d{1,2})[\/-](20\d{2})\b/);
  if (australian) return validIso(Number(australian[3]), Number(australian[2]), Number(australian[1]));
  const named = value.match(/\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i);
  if (!named) return null;
  const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  return validIso(Number(named[3]), monthNames.indexOf(named[2]!.slice(0, 3).toLowerCase()) + 1, Number(named[1]));
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
  const timelineDate = exactDateFromText(row?.endLabel);
  if (timelineDate) return timelineDate;

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
