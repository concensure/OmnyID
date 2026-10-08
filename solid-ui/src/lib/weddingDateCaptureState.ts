// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import {
  type WeddingPlanningScheduleItem,
  weddingScheduleItemToAfpSendInput,
} from "@/lib/weddingCalendarProjectionState";
import { weddingDecisionProjectionToAfpSendInput } from "@/lib/weddingDecisionAfpProjectionState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

const STORAGE_PREFIX = "omnyid:wedding_date:";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function storageKey(responseWorkspaceId: string): string {
  return `${STORAGE_PREFIX}${safeWeddingLabel(responseWorkspaceId)}`;
}

export function parseWeddingDateInput(value: string): string | null {
  const input = clean(value);
  const iso = input.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (iso) return validIsoDate(input) ? input : null;
  const au = input.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})$/);
  if (!au) return null;
  const day = au[1].padStart(2, "0");
  const month = au[2].padStart(2, "0");
  const date = `${au[3]}-${month}-${day}`;
  return validIsoDate(date) ? date : null;
}

export function validIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function weddingDatePlaceholder(locale?: string | null): string {
  const normalized = clean(locale).toLowerCase();
  if (!normalized || normalized === "au" || normalized.includes("australia") || normalized.includes("en-au")) {
    return "dd/MM/yyyy";
  }
  if (normalized.includes("us") || normalized.includes("united states") || normalized.includes("america")) {
    return "MM/dd/yyyy";
  }
  return "yyyy-MM-dd";
}

export function loadLocalWeddingDate(responseWorkspaceId: string, storage: Storage = localStorage): string | null {
  try {
    const value = storage.getItem(storageKey(responseWorkspaceId));
    return value && validIsoDate(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveLocalWeddingDate(responseWorkspaceId: string, date: string, storage: Storage = localStorage): void {
  if (!validIsoDate(date)) return;
  try {
    storage.setItem(storageKey(responseWorkspaceId), date);
  } catch {
    // Local date is a convenience mirror; AFP save remains the durable path.
  }
}

export function weddingDateToScheduleItem(input: {
  date: string;
  metadata?: unknown;
  planningStartedAt?: string | null;
}): WeddingPlanningScheduleItem {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const requestedStart = clean(input.planningStartedAt).slice(0, 10);
  const planningStartedAt = validIsoDate(requestedStart)
    ? requestedStart
    : new Date().toISOString().slice(0, 10);
  return {
    id: `wedding_date:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    title: "Wedding date",
    kind: "ceremony",
    dateLabel: input.date,
    startAt: `${input.date}T09:00:00.000Z`,
    endAt: `${input.date}T23:00:00.000Z`,
    allDay: true,
    source: "user",
    reviewStatus: "accepted",
    approvalState: "approved",
    metadata: {
      ...metadata,
      wedding_date: input.date,
      planning_started_at: planningStartedAt,
      wedding_workspace_menu: "timeline",
      preferred_action_label: "Review wedding date",
    },
    notes: "Wedding date set by the couple.",
  };
}

export function weddingDateToAfpSendInputs(input: {
  date: string;
  metadata?: unknown;
  planningStartedAt?: string | null;
}): SendAfpMessageInput[] {
  const metadata: WeddingPlanningMetadata = normalizeWeddingPlanningMetadata(input.metadata);
  const scheduleItem = weddingDateToScheduleItem({
    date: input.date,
    metadata,
    planningStartedAt: input.planningStartedAt,
  });
  const calendarInput = weddingScheduleItemToAfpSendInput(scheduleItem);
  const decisionInput = weddingDecisionProjectionToAfpSendInput({
    id: `wedding_date:${safeWeddingLabel(metadata.responseWorkspaceId)}:${input.date}`,
    metadata,
    artifactId: `wedding_date:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    artifactTitle: "Wedding date",
    artifactKind: "timeline",
    sourceLabels: ["Couple entered wedding date"],
    selectedOption: {
      id: `wedding-date-${input.date}`,
      rowIndex: 0,
      label: input.date,
      detail: "Wedding date set by the couple.",
      cells: [`Wedding date: ${input.date}`, "Use this date for countdown, legal deadlines, reminders, and follow-ups."],
      selected: true,
      preferenceFitLabels: ["Date confirmed by the couple"],
      missingPreferenceLabels: [],
      tradeoffLabels: [],
      preferenceSummaryLabel: "Use this as the current wedding date.",
    },
    source: "user",
  });
  return [calendarInput, decisionInput].filter((entry): entry is SendAfpMessageInput => entry !== null);
}
