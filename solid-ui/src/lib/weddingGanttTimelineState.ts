// @locs-version: 2.0
export type WeddingGanttInputItem = {
  id: string;
  title: string;
  category?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  dueDate?: string | null;
  dueLabel?: string | null;
  status?: string | null;
  linkedArtifactId?: string | null;
};

export type WeddingGanttTimelineRow = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  color: string;
  startLabel: string;
  endLabel: string;
  durationDays: number;
  offsetPercent: number;
  widthPercent: number;
  statusLabel: string;
  linkedArtifactId: string | null;
};

export type WeddingGanttUndatedItem = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  statusLabel: string;
  linkedArtifactId: string | null;
};

export type WeddingGanttRiskLabel = {
  id: string;
  label: string;
  severity: "info" | "warning" | "blocked";
};

export type WeddingGanttTimelineState = {
  rows: WeddingGanttTimelineRow[];
  undatedItems: WeddingGanttUndatedItem[];
  rangeStartLabel: string | null;
  rangeEndLabel: string | null;
  categoryColors: Record<string, string>;
  legend: { category: string; label: string; color: string }[];
  riskLabels: WeddingGanttRiskLabel[];
  blockerLabels: string[];
};

const DEFAULT_COLORS: Record<string, string> = {
  legal: "#2563eb",
  venue: "#b45309",
  vendor: "#0f766e",
  outreach: "#7c3aed",
  budget: "#dc2626",
  guest: "#16a34a",
  run_sheet: "#ea580c",
  weather: "#0284c7",
  ceremony: "#be123c",
  travel: "#4f46e5",
  reminder: "#db2777",
  general: "#64748b",
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function dateOnly(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  const label = clean(value);
  if (!label) return null;
  const date = new Date(label.length === 10 ? `${label}T09:00:00.000Z` : label);
  return Number.isNaN(date.getTime()) ? null : date;
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function daysBetween(start: Date, end: Date): number {
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
}

function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / 86_400_000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

function daysBeforeWedding(item: WeddingGanttInputItem, category: string): number | null {
  const label = clean(item.dueLabel)?.toLowerCase() ?? "";
  const months = label.match(/(\d+)(?:\s*[-–]\s*(\d+))?\s*months?\s+out/);
  if (months) return Math.round(((Number(months[1]) + Number(months[2] ?? months[1])) / 2) * 30.4);
  const weeks = label.match(/(\d+)(?:\s*[-–]\s*(\d+))?\s*weeks?\s+out/);
  if (weeks) return Math.round(((Number(weeks[1]) + Number(weeks[2] ?? weeks[1])) / 2) * 7);
  if (/post[-\s]?wedding/.test(label)) return -1;
  if (/wedding day|day[-\s]?of/.test(label)) return 0;
  return ({ legal: 300, venue: 330, vendor: 240, outreach: 220, budget: 210, guest: 90, run_sheet: 21, weather: 30, ceremony: 60, travel: 120 } as Record<string, number>)[category] ?? null;
}

function defaultDurationDays(category: string): number {
  return ({ legal: 14, venue: 21, vendor: 14, outreach: 7, budget: 7, guest: 14, run_sheet: 14, weather: 7, ceremony: 7, travel: 14 } as Record<string, number>)[category] ?? 7;
}

function plannedDates(item: WeddingGanttInputItem, planningStart: Date | null, weddingDate: Date | null): { start: Date; end: Date } | null {
  const explicitStart = dateOnly(item.startAt);
  const explicitEnd = dateOnly(item.endAt) ?? dateOnly(item.dueDate);
  if (explicitStart || explicitEnd) {
    const start = explicitStart ?? explicitEnd;
    return start ? { start, end: explicitEnd ?? start } : null;
  }
  if (!weddingDate) return null;
  const category = categoryFor(item);
  const leadDays = daysBeforeWedding(item, category);
  if (leadDays === null) return null;
  const due = addDays(weddingDate, -leadDays);
  const durationDays = defaultDurationDays(category);
  const start = new Date(Math.max(addDays(due, -(durationDays - 1)).getTime(), planningStart?.getTime() ?? Number.NEGATIVE_INFINITY));
  return { start, end: due };
}

function categoryFor(item: WeddingGanttInputItem): string {
  const raw = clean(item.category)?.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const text = `${item.title} ${item.dueLabel ?? ""}`.toLowerCase();
  if (raw && /noim|legal|celebrant|document_checklist/.test(raw)) return "legal";
  if (raw && /venue|ceremony_location/.test(raw)) return "venue";
  if (raw && /vendor|photographer|florist|caterer|band|dj|makeup|hair/.test(raw)) return "vendor";
  if (raw && /email|follow_up|outreach|quote/.test(raw)) return "outreach";
  if (raw && /budget|payment|deposit|contract/.test(raw)) return "budget";
  if (raw && /guest|rsvp|seating|dietary|accessibility/.test(raw)) return "guest";
  if (raw && /run_sheet|timeline|day_of/.test(raw)) return "run_sheet";
  if (raw && /weather|backup|rain|marquee/.test(raw)) return "weather";
  if (raw && /vow|ceremony|reading/.test(raw)) return "ceremony";
  if (raw && /travel|transport|accommodation|hotel|honeymoon/.test(raw)) return "travel";
  if (raw && /reminder|alert/.test(raw)) return "reminder";
  if (raw && DEFAULT_COLORS[raw]) return raw;
  if (/noim|legal|celebrant/.test(text)) return "legal";
  if (/venue|site|ceremony location/.test(text)) return "venue";
  if (/vendor|photographer|florist|caterer|band|dj|makeup|hair/.test(text)) return "vendor";
  if (/email|follow.?up|contact|outreach|quote/.test(text)) return "outreach";
  if (/budget|price|pricing|payment|deposit|contract/.test(text)) return "budget";
  if (/guest|rsvp|seating|dietary|accessibility/.test(text)) return "guest";
  if (/run.?sheet|timeline|day.?of/.test(text)) return "run_sheet";
  if (/weather|backup|rain|marquee/.test(text)) return "weather";
  if (/vow|ceremony|reading/.test(text)) return "ceremony";
  if (/travel|transport|accommodation|hotel|honeymoon/.test(text)) return "travel";
  if (/reminder|alert/.test(text)) return "reminder";
  return "general";
}

function labelFor(category: string): string {
  return category.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function categoryDate(rows: readonly WeddingGanttTimelineRow[], category: string, mode: "first" | "last"): Date | null {
  const matching = rows
    .filter((row) => row.category === category)
    .map((row) => dateOnly(mode === "first" ? row.startLabel : row.endLabel))
    .filter((date): date is Date => date !== null)
    .sort((left, right) => left.getTime() - right.getTime());
  if (matching.length === 0) return null;
  return mode === "first" ? matching[0] ?? null : matching[matching.length - 1] ?? null;
}

function riskLabelsFor(input: {
  rows: readonly WeddingGanttTimelineRow[];
  undatedItems: readonly WeddingGanttUndatedItem[];
  now: Date;
}): WeddingGanttRiskLabel[] {
  const risks: WeddingGanttRiskLabel[] = [];
  const firstVenue = categoryDate(input.rows, "venue", "first");
  const firstVendor = categoryDate(input.rows, "vendor", "first");
  const firstOutreach = categoryDate(input.rows, "outreach", "first");
  const firstBudget = categoryDate(input.rows, "budget", "first");
  const firstGuest = categoryDate(input.rows, "guest", "first");
  const firstRunSheet = categoryDate(input.rows, "run_sheet", "first");
  const firstWeather = categoryDate(input.rows, "weather", "first");
  const finalLegal = categoryDate(input.rows, "legal", "last");

  if (firstVendor && firstVenue && firstVendor.getTime() < firstVenue.getTime()) {
    risks.push({
      id: "vendor_before_venue",
      severity: "warning",
      label: "Confirm the wedding date and venue details before contacting vendors.",
    });
  }
  if (firstBudget && firstVenue && firstBudget.getTime() < firstVenue.getTime()) {
    risks.push({
      id: "budget_before_venue",
      severity: "info",
      label: "Wait to pay deposits until the venue terms are clear.",
    });
  }
  if (firstOutreach && daysUntil(firstOutreach, input.now) <= 14) {
    risks.push({
      id: "near_outreach_window",
      severity: "warning",
      label: "Vendor outreach is coming up soon. Check the shortlist and follow-up plan first.",
    });
  }
  if (firstGuest && firstRunSheet && firstGuest.getTime() > firstRunSheet.getTime()) {
    risks.push({
      id: "guest_after_run_sheet",
      severity: "blocked",
      label: "Finish guest counts, meals, and accessibility notes before finalizing the run sheet.",
    });
  }
  if (firstWeather && firstRunSheet && firstWeather.getTime() > firstRunSheet.getTime()) {
    risks.push({
      id: "weather_after_run_sheet",
      severity: "warning",
      label: "Set the rain backup before finalizing the day-of timing.",
    });
  }
  if (finalLegal && daysUntil(finalLegal, input.now) <= 30) {
    risks.push({
      id: "legal_deadline_near",
      severity: "blocked",
      label: "A legal deadline is within 30 days. Handle it before lower-risk planning tasks.",
    });
  }
  return risks;
}

export function buildWeddingGanttTimelineState(input: {
  items?: readonly WeddingGanttInputItem[] | null;
  categoryColors?: Record<string, string> | null;
  now?: Date | string | null;
  planningStartAt?: string | Date | null;
  weddingDate?: string | Date | null;
} = {}): WeddingGanttTimelineState {
  const colors = { ...DEFAULT_COLORS, ...(input.categoryColors ?? {}) };
  const now = dateOnly(input.now) ?? new Date();
  const planningStart = dateOnly(input.planningStartAt) ?? null;
  const weddingDate = dateOnly(input.weddingDate) ?? null;
  const planningEnd = weddingDate ? addDays(weddingDate, 1) : null;
  const normalizedItems = input.items ?? [];
  const dated = normalizedItems.map((item) => {
    const planned = plannedDates(item, planningStart, weddingDate);
    return planned ? { item, ...planned } : null;
  }).filter((entry): entry is { item: WeddingGanttInputItem; start: Date; end: Date } => entry !== null);
  const undatedItems = normalizedItems
    .filter((item) => plannedDates(item, planningStart, weddingDate) === null)
    .map((item): WeddingGanttUndatedItem => {
      const category = categoryFor(item);
      return {
        id: item.id,
        title: item.title,
        category,
        categoryLabel: labelFor(category),
        statusLabel: clean(item.status) ?? "anytime",
        linkedArtifactId: clean(item.linkedArtifactId),
      };
    });
  const firstDatedTime = Math.min(...dated.map((entry) => entry.start.getTime()));
  const lastDatedTime = Math.max(...dated.map((entry) => entry.end.getTime()));
  const minTime = planningStart?.getTime() ?? firstDatedTime;
  const maxTime = planningEnd?.getTime() ?? lastDatedTime;
  const totalDays = Number.isFinite(minTime) && Number.isFinite(maxTime)
    ? Math.max(1, Math.round((maxTime - minTime) / 86_400_000) + 1)
    : 1;
  const rows = dated
    .sort((left, right) => left.start.getTime() - right.start.getTime() || left.item.title.localeCompare(right.item.title))
    .map(({ item, start, end }): WeddingGanttTimelineRow => {
      const category = categoryFor(item);
      const offsetDays = Math.max(0, Math.round((start.getTime() - minTime) / 86_400_000));
      const durationDays = daysBetween(start, end);
      return {
        id: item.id,
        title: item.title,
        category,
        categoryLabel: labelFor(category),
        color: colors[category] ?? colors.general,
        startLabel: iso(start),
        endLabel: iso(end),
        durationDays,
        offsetPercent: Math.round((offsetDays / totalDays) * 1000) / 10,
        widthPercent: Math.max(4, Math.round((durationDays / totalDays) * 1000) / 10),
        statusLabel: clean(item.status) ?? "planned",
        linkedArtifactId: clean(item.linkedArtifactId),
      };
    });
  const usedCategories = Array.from(new Set(rows.map((row) => row.category)));
  const riskLabels = riskLabelsFor({ rows, undatedItems, now });
  return {
    rows,
    undatedItems,
    rangeStartLabel: Number.isFinite(minTime) ? iso(new Date(minTime)) : null,
    rangeEndLabel: Number.isFinite(maxTime) ? iso(new Date(maxTime)) : null,
    categoryColors: colors,
    legend: usedCategories.map((category) => ({ category, label: labelFor(category), color: colors[category] ?? colors.general })),
    riskLabels,
    blockerLabels: rows.length > 0 ? [] : ["No dated wedding tasks yet. Add a date to a task to show it on the timeline."],
  };
}
