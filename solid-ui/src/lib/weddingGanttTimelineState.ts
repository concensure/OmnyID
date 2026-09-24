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
      label: "Vendor work starts before venue timing is visible; confirm date/location constraints before outreach.",
    });
  }
  if (firstBudget && firstVenue && firstBudget.getTime() < firstVenue.getTime()) {
    risks.push({
      id: "budget_before_venue",
      severity: "info",
      label: "Budget/payment work appears before venue selection; keep deposits uncommitted until venue terms are verified.",
    });
  }
  if (firstOutreach && daysUntil(firstOutreach, input.now) <= 14) {
    risks.push({
      id: "near_outreach_window",
      severity: "warning",
      label: "Outreach is scheduled within two weeks; confirm shortlist, contact consent, and no-spam follow-up limits.",
    });
  }
  if (firstGuest && firstRunSheet && firstGuest.getTime() > firstRunSheet.getTime()) {
    risks.push({
      id: "guest_after_run_sheet",
      severity: "blocked",
      label: "Guest/RSVP work is after run-sheet work; final count, meals, and accessibility should feed the run sheet first.",
    });
  }
  if (firstWeather && firstRunSheet && firstWeather.getTime() > firstRunSheet.getTime()) {
    risks.push({
      id: "weather_after_run_sheet",
      severity: "warning",
      label: "Weather backup is later than run-sheet work; backup location and rain plan should be settled before final timing.",
    });
  }
  if (finalLegal && daysUntil(finalLegal, input.now) <= 30) {
    risks.push({
      id: "legal_deadline_near",
      severity: "blocked",
      label: "A legal/NOIM deadline is within 30 days; surface it in DecisionOS before lower-risk planning tasks.",
    });
  }
  if (input.undatedItems.length > 0) {
    risks.push({
      id: "undated_items",
      severity: "info",
      label: `${input.undatedItems.length} anytime/no-date item${input.undatedItems.length === 1 ? "" : "s"} should stay at the top of task review until committed or dismissed.`,
    });
  }
  return risks;
}

export function buildWeddingGanttTimelineState(input: {
  items?: readonly WeddingGanttInputItem[] | null;
  categoryColors?: Record<string, string> | null;
  now?: Date | string | null;
} = {}): WeddingGanttTimelineState {
  const colors = { ...DEFAULT_COLORS, ...(input.categoryColors ?? {}) };
  const now = dateOnly(input.now) ?? new Date();
  const normalizedItems = input.items ?? [];
  const dated = normalizedItems.map((item) => {
    const start = dateOnly(item.startAt) ?? dateOnly(item.dueDate);
    const end = dateOnly(item.endAt) ?? dateOnly(item.dueDate) ?? start;
    return start && end ? { item, start, end } : null;
  }).filter((entry): entry is { item: WeddingGanttInputItem; start: Date; end: Date } => entry !== null);
  const undatedItems = normalizedItems
    .filter((item) => !dateOnly(item.startAt) && !dateOnly(item.dueDate))
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
  const minTime = Math.min(...dated.map((entry) => entry.start.getTime()));
  const maxTime = Math.max(...dated.map((entry) => entry.end.getTime()));
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
    categoryColors: colors,
    legend: usedCategories.map((category) => ({ category, label: labelFor(category), color: colors[category] ?? colors.general })),
    riskLabels,
    blockerLabels: rows.length > 0 ? [] : ["No dated wedding timeline items are available for the Gantt chart."],
  };
}
