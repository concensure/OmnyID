// @locs-version: 1.0
import type { AfpMessage, CalendarEvent, DashboardBootstrap } from "@/lib/api";
import { afpOptionalRecord } from "@/lib/afpMessageRecord";
import { isRecord } from "@/lib/eventDetail";
import { afpMessagesToCalendarEvents } from "@/lib/studyDeadlineAfpProjectionState";

export type ViewMode = "month" | "week" | "day";
export type CategoryKey =
  | "all"
  | "notes"
  | "emails"
  | "chat"
  | "locations"
  | "people"
  | "weather"
  | "knowledge"
  | "academic";
export type QuickFilter = "today" | "upcoming" | "past" | "conflicts";
export type DerivedCategory = Exclude<CategoryKey, "all">;

export type CalendarItem = CalendarEvent & {
  derivedCategory: DerivedCategory;
  markerColor: string;
  relatedPeople: string[];
  relatedLocation: string | null;
  weatherTag: string | null;
  sourceLabel: string;
  summary: string;
  semanticTag: string | null;
};

export const CALENDAR_CATEGORY_META: Record<DerivedCategory, { label: string; color: string }> = {
  notes: { label: "Notes", color: "#2E8B57" },
  emails: { label: "Emails", color: "#5B7CFA" },
  chat: { label: "Chat", color: "#8D6CCF" },
  locations: { label: "Locations", color: "#688B45" },
  people: { label: "People", color: "#A77B52" },
  weather: { label: "Weather", color: "#3BA7C6" },
  knowledge: { label: "Knowledge Keywords", color: "#8B8175" },
  academic: { label: "Academic", color: "#0F766E" },
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAY_NAMES_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function calendarValidDate(value: Date): Date | null {
  return Number.isNaN(value.getTime()) ? null : value;
}

function calendarMinuteLabel(minutes: number): string {
  return `${String(minutes).padStart(2, "0")}`;
}

function calendarHourLabel(hours: number): string {
  if (hours === 0) return "12";
  if (hours > 12) return `${hours - 12}`;
  return `${hours}`;
}

function calendarMeridiem(hours: number): "AM" | "PM" {
  return hours >= 12 ? "PM" : "AM";
}

export function calendarProfileString(profile: Record<string, unknown> | null | undefined, key: string): string | null {
  const raw = profile?.[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function calendarAnchorLabel(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().replaceAll("_", " ") : null;
}

export function calendarSemanticTag(event: CalendarEvent): string | null {
  const anchorType = calendarAnchorLabel(calendarProfileString(event.profile ?? null, "schedule_anchor_type"));
  const noteKind = calendarAnchorLabel(event.note_kind ?? calendarProfileString(event.profile ?? null, "schedule_note_kind"));
  if (anchorType && noteKind) return `${anchorType} Â· ${noteKind}`;
  if (anchorType) return anchorType;
  if (noteKind) return noteKind;
  return null;
}

export function calendarMarkerColor(event: CalendarEvent, fallback: string): string {
  if (event.status !== "tentative") return fallback;
  const noteKind = (event.note_kind ?? calendarProfileString(event.profile ?? null, "schedule_note_kind"))?.toLowerCase();
  const anchorType = calendarProfileString(event.profile ?? null, "schedule_anchor_type")?.toLowerCase();
  if (noteKind === "high_stakes_prep") return "#F97316";
  if (anchorType === "interview") return "#C026D3";
  if (anchorType === "medical") return "#0891B2";
  if (anchorType === "logistics") return "#65A30D";
  if (anchorType === "meeting") return "#D97706";
  return "#F59E0B";
}

export function calendarDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

export function calendarFirstWeekday(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export function calendarMonthStartIso(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

export function calendarDateTimeIso(year: number, month: number, day: number, time = "00:00") {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${time}:00`;
}

export function calendarStartOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function calendarIsSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function calendarMonthLabel(year: number, month: number) {
  return `${MONTH_NAMES[month]} ${year}`;
}

export function calendarMonthShortLabel(value: Date) {
  const date = calendarValidDate(value);
  if (!date) return "";
  return `${MONTH_NAMES_SHORT[date.getMonth()]} ${date.getDate()}`;
}

export function calendarLongDateLabel(value: Date, options: { includeYear?: boolean } = {}) {
  const date = calendarValidDate(value);
  if (!date) return "";
  const label = `${WEEKDAY_NAMES_LONG[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
  return options.includeYear === false ? label : `${label}, ${date.getFullYear()}`;
}

export function calendarAbsoluteDateLabel(iso: string) {
  const date = calendarValidDate(new Date(iso));
  if (!date) return "";
  return `${MONTH_NAMES_SHORT[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ${calendarHourLabel(date.getHours())}:${calendarMinuteLabel(date.getMinutes())} ${calendarMeridiem(date.getHours())}`;
}

export function calendarTimeLabel(iso: string) {
  const date = calendarValidDate(new Date(iso));
  if (!date) return "";
  return `${calendarHourLabel(date.getHours())}:${calendarMinuteLabel(date.getMinutes())} ${calendarMeridiem(date.getHours())}`;
}

export function calendarCommandSummary(payload: unknown): string | null {
  return isRecord(payload) && typeof payload.summary === "string" ? payload.summary : null;
}

export function calendarReviewActionLabel(summary: DashboardBootstrap["calendar_runtime_summary"] | undefined | null): string {
  const noteKind = calendarAnchorLabel(summary?.latest_tentative_note_kind);
  const profile = afpOptionalRecord(summary?.latest_tentative_profile);
  const anchorType = calendarAnchorLabel(profile?.schedule_anchor_type);
  if (anchorType && noteKind) return `Review ${anchorType} prep`;
  if (anchorType) return `Review ${anchorType} hold`;
  if (noteKind) return `Review ${noteKind}`;
  return "Review source";
}

export function calendarReviewSummaryText(summary: DashboardBootstrap["calendar_runtime_summary"] | undefined | null): string | null {
  const noteKind = calendarAnchorLabel(summary?.latest_tentative_note_kind);
  const prepLead = summary?.latest_tentative_prep_lead_minutes;
  const location = summary?.latest_tentative_location?.trim();
  const profile = afpOptionalRecord(summary?.latest_tentative_profile);
  const anchorType = calendarAnchorLabel(profile?.schedule_anchor_type);
  const parts = [
    anchorType ? `Current reversible hold is classified as ${anchorType}.` : null,
    noteKind ? `Prep mode: ${noteKind}.` : null,
    typeof prepLead === "number" ? `Protected lead time: ${prepLead} minutes.` : null,
    location ? `Location: ${location}.` : null,
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" ") : null;
}

export function calendarNormalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function calendarRelatedPeople(text: string) {
  const blockedTokens = new Set(["bondi", "sydney", "melbourne", "office", "zoom", "home", "airport"]);
  const matches = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) ?? [];
  return [...new Set(matches.filter((item) => item.length > 2 && !blockedTokens.has(item.toLowerCase())))]
    .slice(0, 3);
}

export function calendarRelatedLocation(text: string) {
  const match = text.match(/\(([^)]+)\)/);
  if (match?.[1]) return match[1];
  const lower = text.toLowerCase();
  const locations = ["Bondi", "Sydney", "Melbourne", "Office", "Zoom", "Home", "Airport"];
  return locations.find((item) => lower.includes(item.toLowerCase())) ?? null;
}

export function calendarWeatherTag(text: string) {
  const lower = text.toLowerCase();
  const tags = ["sunny", "cloudy", "rainy", "storm", "windy"];
  return tags.find((item) => lower.includes(item)) ?? null;
}

export function calendarDerivedCategory(event: CalendarEvent): DerivedCategory {
  const combined = `${event.title} ${event.description ?? ""}`.toLowerCase();
  const profile = event.profile ?? {};
  if (
    calendarProfileString(profile, "origin") === "study_lens"
    || calendarProfileString(profile, "projection") === "study_deadline_to_afp_calendar_event"
    || calendarProfileString(profile, "academic_course_tag")
    || calendarProfileString(profile, "academic_chapter_tag")
    || calendarProfileString(profile, "academic_unit_tag")
    || combined.includes("exam")
    || combined.includes("assignment")
    || combined.includes("quiz")
  ) {
    return "academic";
  }
  if (combined.includes("weather") || combined.includes("sunny") || combined.includes("rain")) return "weather";
  if (combined.includes("chat") || combined.includes("call") || combined.includes("slack")) return "chat";
  if (combined.includes("note") || combined.includes("memo") || combined.includes("voice")) return "notes";
  if (combined.includes("email") || combined.includes("inbox") || combined.includes("reply")) return "emails";
  if (combined.includes("flight") || combined.includes("hotel") || combined.includes("bondi") || combined.includes("zoom") || combined.includes("office")) return "locations";
  if (combined.includes("sarah") || combined.includes("alex") || combined.includes("sam") || combined.includes("with ")) return "people";
  return "knowledge";
}

export function calendarItemFromEvent(event: CalendarEvent): CalendarItem {
  const derivedCategory = calendarDerivedCategory(event);
  const text = `${event.title}. ${event.description ?? ""}`;
  const relatedPeople = calendarRelatedPeople(text);
  const relatedLocation = calendarRelatedLocation(text);
  const weatherTag = calendarWeatherTag(text);
  const semanticTag = calendarSemanticTag(event);
  return {
    ...event,
    derivedCategory,
    markerColor: calendarMarkerColor(event, CALENDAR_CATEGORY_META[derivedCategory].color),
    relatedPeople,
    relatedLocation,
    weatherTag,
    sourceLabel: CALENDAR_CATEGORY_META[derivedCategory].label,
    summary: event.description?.trim() || "Derived calendar event curated by the Knowledge Curator.",
    semanticTag,
  };
}

export function calendarMatchesSearch(item: CalendarItem, query: string) {
  if (!query) return true;
  const profile = item.profile ?? {};
  const haystack = [
    item.title,
    item.description ?? "",
    item.relatedPeople.join(" "),
    item.relatedLocation ?? "",
    item.weatherTag ?? "",
    item.sourceLabel,
    item.semanticTag ?? "",
    calendarProfileString(profile, "academic_course_tag") ?? "",
    calendarProfileString(profile, "academic_unit_tag") ?? "",
    calendarProfileString(profile, "academic_chapter_tag") ?? "",
    calendarProfileString(profile, "academic_module_label") ?? "",
    calendarProfileString(profile, "provider_id") ?? "",
    Array.isArray(profile.supertags) ? profile.supertags.join(" ") : "",
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

export function calendarEventsFromAfpMessages(messages: AfpMessage[]): CalendarEvent[] {
  return afpMessagesToCalendarEvents(messages);
}

export function mergeCalendarEvents(primary: CalendarEvent[], projected: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  return [...projected, ...primary].filter((event) => {
    if (seen.has(event.id)) return false;
    seen.add(event.id);
    return true;
  });
}

export function calendarEventOverlaps(target: CalendarItem, all: CalendarItem[]) {
  if (target.all_day) return false;
  const start = new Date(target.start_at).getTime();
  const end = target.end_at ? new Date(target.end_at).getTime() : start + 30 * 60 * 1000;
  return all.some((item) => {
    if (item.id === target.id || item.all_day) return false;
    const itemStart = new Date(item.start_at).getTime();
    const itemEnd = item.end_at ? new Date(item.end_at).getTime() : itemStart + 30 * 60 * 1000;
    return itemStart < end && start < itemEnd;
  });
}

export function calendarBuildMiniCalendar(year: number, month: number) {
  const first = calendarFirstWeekday(year, month);
  const totalDays = calendarDaysInMonth(year, month);
  const cells: Array<number | null> = [];
  for (let index = 0; index < first; index += 1) cells.push(null);
  for (let day = 1; day <= totalDays; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
