// @locs-version: 1.0
import type { DatabaseViewRecord } from "@/lib/databaseViewState";

export type WeddingRunSheetStatusFilter = "all" | "confirmed" | "proposed" | "needs-confirmation";

export type WeddingRunSheetFilters = {
  day: string;
  status: WeddingRunSheetStatusFilter;
  conflictsOnly: boolean;
};

export type WeddingRunSheetPresentedRow = {
  record: DatabaseViewRecord;
  effectiveStartAt: string | null;
  effectiveEndAt: string | null;
  day: string;
  status: string;
  conflictCodes: string[];
  anchorAdjusted: boolean;
  sourceLinked: boolean;
  overrideState: string | null;
};

export type WeddingRunSheetTimeChangeReview = {
  recordId: string;
  field: "start_at" | "end_at" | "due_at";
  previousValue: string | null;
  nextValue: string;
  requiresConfirmation: boolean;
  sourceLinked: boolean;
  authoritativeUpdateAvailable: boolean;
  sourceMessageId: string | null;
  summary: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : text(value) ? [text(value)] : [];
}

function iso(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function shiftedIso(value: string, minutes: number): string | null {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || !Number.isFinite(minutes)) return null;
  parsed.setTime(parsed.getTime() + Math.round(minutes) * 60_000);
  return parsed.toISOString();
}

function sourceReferences(record: DatabaseViewRecord): Array<{ messageId: string; kind: string }> {
  const sourceRefs = Array.isArray(record.data.source_refs) ? record.data.source_refs : [];
  return sourceRefs.flatMap((value) => {
    const source = objectValue(value);
    const messageId = text(source.message_id);
    const kind = text(source.kind);
    return messageId ? [{ messageId, kind }] : [];
  });
}

function anchorOffset(record: DatabaseViewRecord): number | null {
  const raw = record.data.anchor_offset_minutes ?? record.data.offset_minutes;
  const value = typeof raw === "number" ? raw : Number(text(raw));
  return Number.isFinite(value) && Math.abs(value) <= 7 * 24 * 60 ? Math.round(value) : null;
}

export function weddingRunSheetDefaultFilters(): WeddingRunSheetFilters {
  return { day: "all", status: "all", conflictsOnly: false };
}

export function projectWeddingRunSheetRows(
  records: DatabaseViewRecord[],
): WeddingRunSheetPresentedRow[] {
  const runSheetRows = records.filter((record) => record.table === "run_sheet");
  const byId = new Map(runSheetRows.map((record) => [record.id, record]));
  const projected = runSheetRows.map((record) => {
    const status = text(record.data.status) || "needs-confirmation";
    const storedStart = iso(record.data.start_at);
    const storedEnd = iso(record.data.end_at);
    const anchorId = text(record.data.anchor_record_id);
    const anchor = byId.get(anchorId);
    const offset = anchorOffset(record);
    const anchorStart = anchor ? iso(anchor.data.start_at) : null;
    const computedStart = anchorStart && offset !== null ? shiftedIso(anchorStart, offset) : null;
    const duration = Number(record.data.duration_minutes);
    const computedEnd = computedStart && Number.isFinite(duration) && duration > 0
      ? shiftedIso(computedStart, duration)
      : storedEnd;
    const confirmed = status === "confirmed";
    const anchorDrift = !!computedStart && !!storedStart && computedStart !== storedStart;
    const effectiveStartAt = computedStart && !confirmed ? computedStart : storedStart ?? computedStart;
    const effectiveEndAt = computedStart && !confirmed ? computedEnd : storedEnd;
    const conflicts = new Set(strings(record.data.conflict_codes));
    if (confirmed && anchorDrift) conflicts.add("confirmed_anchor_drift");
    if (text(record.data.projection_state) === "stale") conflicts.add("stale_source");
    if (!effectiveStartAt) conflicts.add("missing_time");
    if (!text(record.data.owner_refs) && strings(record.data.owner_refs).length === 0) conflicts.add("missing_owner");
    const day = effectiveStartAt?.slice(0, 10) ?? iso(record.data.due_at)?.slice(0, 10) ?? "unscheduled";
    return {
      record,
      effectiveStartAt,
      effectiveEndAt,
      day,
      status,
      conflictCodes: Array.from(conflicts),
      anchorAdjusted: !!computedStart && computedStart !== storedStart,
      sourceLinked: sourceReferences(record).length > 0,
      overrideState: text(record.data.override_state) || null,
    };
  });
  return projected.sort((left, right) => (
    (left.effectiveStartAt ?? "9999").localeCompare(right.effectiveStartAt ?? "9999")
    || text(left.record.data.title).localeCompare(text(right.record.data.title))
    || left.record.id.localeCompare(right.record.id)
  ));
}

export function weddingRunSheetDays(rows: WeddingRunSheetPresentedRow[]): string[] {
  return Array.from(new Set(rows.map((row) => row.day))).sort((left, right) => {
    if (left === "unscheduled") return 1;
    if (right === "unscheduled") return -1;
    return left.localeCompare(right);
  });
}

export function filterWeddingRunSheetRows(
  rows: WeddingRunSheetPresentedRow[],
  filters: WeddingRunSheetFilters,
): WeddingRunSheetPresentedRow[] {
  return rows.filter((row) => (
    (filters.day === "all" || row.day === filters.day)
    && (filters.status === "all" || row.status === filters.status)
    && (!filters.conflictsOnly || row.conflictCodes.length > 0)
  ));
}

export function weddingRunSheetTimeLabel(value: string | null, timeZone = "Australia/Sydney"): string {
  if (!value) return "Time needed";
  try {
    return new Intl.DateTimeFormat("en-AU", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function buildWeddingRunSheetTimeChangeReview(input: {
  record: DatabaseViewRecord;
  field: "start_at" | "end_at" | "due_at";
  nextValue: string;
}): WeddingRunSheetTimeChangeReview | null {
  const nextValue = iso(input.nextValue);
  if (!nextValue) return null;
  const sources = sourceReferences(input.record);
  const confirmed = text(input.record.data.status) === "confirmed";
  const source = sources[0] ?? null;
  const authoritativeUpdateAvailable = input.field === "due_at"
    && !!source
    && /wedding_task|task/i.test(source.kind);
  const requiresConfirmation = confirmed && sources.length > 0;
  return {
    recordId: input.record.id,
    field: input.field,
    previousValue: iso(input.record.data[input.field]),
    nextValue,
    requiresConfirmation,
    sourceLinked: sources.length > 0,
    authoritativeUpdateAvailable,
    sourceMessageId: source?.messageId ?? null,
    summary: requiresConfirmation
      ? "This is a confirmed time linked to the wedding plan. Choose where the change should apply."
      : sources.length > 0
        ? "This change updates the run sheet while preserving its source link."
        : "This change applies only to this run-sheet row.",
  };
}

export function weddingRunSheetOverridePatch(review: WeddingRunSheetTimeChangeReview): Record<string, unknown> {
  return {
    [review.field]: review.nextValue,
    override_state: "runsheet_only",
    authoritative_source_unchanged: review.sourceLinked,
    override_recorded_at: new Date().toISOString(),
  };
}

export function weddingRunSheetShiftReview(
  record: DatabaseViewRecord,
  minutes: number,
): WeddingRunSheetTimeChangeReview | null {
  const current = iso(record.data.start_at);
  const nextValue = current ? shiftedIso(current, minutes) : null;
  return nextValue ? buildWeddingRunSheetTimeChangeReview({ record, field: "start_at", nextValue }) : null;
}

export function weddingRunSheetManualRecord(input: {
  title: string;
  startAt?: string | null;
  location?: string | null;
  ownerRef?: string | null;
  visibility?: string[];
}): Record<string, unknown> {
  const title = input.title.trim();
  if (!title) throw new Error("Name the run-sheet item.");
  const startAt = input.startAt ? iso(input.startAt) : null;
  if (input.startAt && !startAt) throw new Error("Enter a valid date and time.");
  return {
    title,
    start_at: startAt,
    end_at: null,
    duration_minutes: null,
    time_status: startAt ? "proposed" : "unknown",
    location: input.location?.trim() || null,
    owner_refs: input.ownerRef?.trim() ? [input.ownerRef.trim()] : [],
    participant_refs: [],
    category: "custom",
    status: "proposed",
    visibility: input.visibility?.length ? Array.from(new Set(input.visibility)) : ["master"],
    source_refs: [],
    projection_state: "detached",
    override_state: "user_created",
  };
}
