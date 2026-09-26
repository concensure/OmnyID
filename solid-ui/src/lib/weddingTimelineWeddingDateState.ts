// @locs-version: 1.0
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";

type WeddingDateSource = Pick<WeddingResponseWorkspaceViewState, "ganttTimeline"> & Partial<Pick<WeddingResponseWorkspaceViewState, "contextCards">>;

function exactDateFromText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  return match?.[1] ?? null;
}

export function weddingTimelineWeddingDateLabel(state: WeddingDateSource): string | null {
  const row = state.ganttTimeline.rows.find((item) =>
    /\bwedding[\s_-]*(day|date)\b/i.test(`${item.id} ${item.title}`)
  );
  if (row?.endLabel) return row.endLabel;

  for (const card of state.contextCards ?? []) {
    for (const label of card.answeredLabels ?? []) {
      if (!/\b(date|season|wedding day|wedding date)\b/i.test(label)) continue;
      const exact = exactDateFromText(label);
      if (exact) return exact;
    }
  }
  return null;
}
