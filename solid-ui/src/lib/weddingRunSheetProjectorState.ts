// @locs-version: 1.0
import {
  buildCanonicalDatabaseProjectionReceipt,
  buildCanonicalDatabaseRecord,
  buildCanonicalDatabaseRevision,
  type CanonicalDatabaseRecordContent,
  type CanonicalDatabaseRevisionContent,
  type DatabaseProjectionReceiptContent,
  type DatabaseSourceReference,
} from "@/lib/databaseContract";
import type { CompatibleDatabaseMessage } from "@/lib/databaseMessageCompatibility";
import type { DatabaseViewRecord } from "@/lib/databaseViewState";

export const WEDDING_RUN_SHEET_PROJECTOR_ID = "wedding-runsheet";
export const WEDDING_RUN_SHEET_PROJECTOR_VERSION = 1;

export type WeddingRunSheetProjectionCheckpoint = {
  sourceCursor: string;
  projectorVersion: number;
  sourceFingerprint: string;
};

export type WeddingRunSheetProjectionPlan = {
  records: CanonicalDatabaseRecordContent[];
  revisions: CanonicalDatabaseRevisionContent[];
  receipt: DatabaseProjectionReceiptContent | null;
  nextCheckpoint: WeddingRunSheetProjectionCheckpoint | null;
  affectedItemIds: string[];
  skippedUnchanged: number;
  modelCalls: 0;
  explanation: string;
};

export type WeddingRunSheetProjectionBatch = {
  expectedCheckpoint: WeddingRunSheetProjectionCheckpoint | null;
  plan: WeddingRunSheetProjectionPlan;
};

export type WeddingRunSheetProjectionBatchSeries = {
  batches: WeddingRunSheetProjectionBatch[];
  writeCount: number;
  sourceCount: number;
  modelCalls: 0;
};

type Source = CompatibleDatabaseMessage & {
  contentObject: Record<string, unknown>;
  metadataObject: Record<string, unknown>;
};

type RunSheetFactPacket = {
  itemId: string;
  title: string;
  category: string;
  startAt: string | null;
  endAt: string | null;
  dueAt: string | null;
  durationMinutes: number | null;
  location: string | null;
  timeZone: string;
  ownerRefs: string[];
  participantRefs: string[];
  status: "confirmed" | "proposed" | "needs-confirmation";
  visibility: string[];
  updatedAt: string;
  sourceRefs: DatabaseSourceReference[];
  sourceFingerprint: string;
};

function objectValue(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function clean(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}

function strings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).slice(0, 24);
  const single = clean(value);
  return single ? [single] : [];
}

function safeId(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "item";
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  const object = objectValue(value);
  if (Object.keys(object).length === 0) return value;
  return Object.fromEntries(Object.keys(object).sort().map((key) => [key, stableValue(object[key])]));
}

export function weddingRunSheetFingerprint(value: unknown): string {
  const text = JSON.stringify(stableValue(value));
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function sourcePlanId(source: Source): string {
  const scope = objectValue(source.contentObject.scope);
  return clean(source.contentObject.wedding_plan_id)
    || clean(source.contentObject.weddingPlanId)
    || clean(scope.wedding_plan_id)
    || clean(source.metadataObject.wedding_plan_id)
    || clean(source.metadataObject.weddingPlanId);
}

function scopedSources(messages: CompatibleDatabaseMessage[], weddingPlanId: string): Source[] {
  return messages.flatMap((message) => {
    const source = { ...message, contentObject: objectValue(message.content), metadataObject: objectValue(message.metadata) };
    return sourcePlanId(source) === weddingPlanId ? [source] : [];
  });
}

export function weddingRunSheetSourceMessageIds(
  messages: CompatibleDatabaseMessage[],
  weddingPlanId: string,
): string[] {
  const sources = scopedSources(messages, weddingPlanId);
  const weddingDay = weddingDayForSources(sources);
  return sources
    .filter((source) => packetForSource(source, weddingDay) !== null)
    .map((source) => source.id);
}

function sourceText(source: Source): string {
  return [
    source.type, source.contentObject.kind, source.contentObject.title, source.contentObject.name,
    source.contentObject.label, source.contentObject.category, source.contentObject.stage,
    source.contentObject.subject, source.contentObject.summary, source.contentObject.body,
    source.contentObject.text, source.contentObject.message,
    source.contentObject.milestone_kind, source.contentObject.wedding_task_kind,
    source.contentObject.vendor_category, source.contentObject.decision_type,
    source.metadataObject.wedding_task_kind, source.metadataObject.projection,
    source.metadataObject.category, source.metadataObject.stage,
  ]
    .map(clean).join(" ").toLocaleLowerCase();
}

function sourceNarrative(source: Source): string {
  return [
    source.contentObject.subject,
    source.contentObject.summary,
    source.contentObject.body,
    source.contentObject.text,
    source.contentObject.message,
  ].map(clean).filter(Boolean).join("\n").slice(0, 20_000);
}

function sourceKind(source: Source): string {
  const text = sourceText(source);
  if (/run.?sheet|master schedule|vendor distribution/.test(text)) return "run_sheet";
  if (/ceremony|celebrant/.test(text)) return "ceremony";
  if (/reception|speech|first dance|cake|cocktail|meal|cater/.test(text)) return "reception";
  if (/photo|video|portrait/.test(text)) return "photos";
  if (/transport|pickup|arrival|departure|bus/.test(text)) return "transport";
  if (/setup|access|teardown|load.?out|venue/.test(text)) return "setup";
  if (/hair|makeup|getting ready|hmua/.test(text)) return "getting_ready";
  if (/vendor|supplier|quote|booking|enquiry/.test(text)) return "supplier";
  if (/task|todo|deadline/.test(text)) return "task";
  if (/wedding.?date|wedding_plan/.test(text) || clean(source.contentObject.wedding_date)) return "wedding_date";
  return "";
}

function sourceLogicalId(source: Source): string {
  return clean(source.contentObject.task_id)
    || clean(source.contentObject.vendor_id)
    || clean(source.contentObject.decision_id)
    || clean(source.contentObject.event_id)
    || source.id;
}

function sourceTitle(source: Source, category: string): string {
  return clean(source.contentObject.title)
    || clean(source.contentObject.name)
    || clean(source.contentObject.label)
    || ({ ceremony: "Confirm ceremony timing", reception: "Confirm reception timing", photos: "Confirm photo timing", transport: "Confirm transport timing", setup: "Confirm venue access and setup", getting_ready: "Confirm getting-ready timing", supplier: "Confirm supplier commitment", run_sheet: "Prepare and distribute the final run sheet", task: "Wedding planning task", wedding_date: "Confirm wedding-day milestones" } as Record<string, string>)[category]
    || "Confirm run-sheet item";
}

function exactDateTime(value: unknown): string | null {
  const raw = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/.test(raw)) return null;
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function weddingDayForSources(sources: Source[]): string | null {
  for (const source of sources.slice().sort((left, right) => (right.timestamp ?? "").localeCompare(left.timestamp ?? ""))) {
    const candidates = [
      source.contentObject.wedding_date,
      source.contentObject.event_date,
      objectValue(source.contentObject.couple).wedding_date,
      objectValue(source.contentObject.scope).wedding_date,
    ];
    for (const candidate of candidates) {
      const value = clean(candidate);
      if (/^20\d{2}-\d{2}-\d{2}$/.test(value)) return value;
    }
  }
  return null;
}

function sydneyLocalDateTime(day: string, hour: number, minute: number): string | null {
  const expected = `${day}-${String(hour).padStart(2, "0")}-${String(minute).padStart(2, "0")}`;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  for (const offset of [11, 10]) {
    const candidate = new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+${offset}:00`);
    if (Number.isNaN(candidate.getTime())) continue;
    const values = Object.fromEntries(
      formatter.formatToParts(candidate).map((part) => [part.type, part.value]),
    );
    if (`${values.year}-${values.month}-${values.day}-${values.hour}-${values.minute}` === expected) {
      return candidate.toISOString();
    }
  }
  return null;
}

function confirmedNarrativeStartAt(source: Source, weddingDay: string | null): string | null {
  const narrative = sourceNarrative(source);
  if (!narrative || !/\b(confirm(?:ed|ing)?|will arrive|arrival(?: time)?|on[ -]?site|attendance time|scheduled)\b/i.test(narrative)) return null;
  const explicit = narrative.match(/\b(20\d{2}-\d{2}-\d{2})[ T](\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  const time = explicit ?? narrative.match(/\b(?:arriv(?:e|es|al)|on[ -]?site|start(?:s|ing)?|setup(?: begins| starts)?|attendance time|scheduled)\s*(?:at|from|is|for|:)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (!time) return null;
  const day = explicit?.[1] ?? weddingDay;
  if (!day) return null;
  const hourIndex = explicit ? 2 : 1;
  const minuteIndex = explicit ? 3 : 2;
  const meridiemIndex = explicit ? 4 : 3;
  let hour = Number(time[hourIndex]);
  const minute = Number(time[minuteIndex] ?? "0");
  const meridiem = (time[meridiemIndex] ?? "").toLocaleLowerCase();
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  }
  return sydneyLocalDateTime(day, hour, minute);
}

function boundedMinutes(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(clean(value));
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 24 * 60 ? Math.round(parsed) : null;
}

function sourceLocation(source: Source): string | null {
  const venue = objectValue(source.contentObject.venue);
  return clean(source.contentObject.location)
    || clean(source.contentObject.location_name)
    || clean(source.contentObject.venue_name)
    || clean(source.contentObject.address)
    || clean(venue.name)
    || clean(venue.address)
    || null;
}

function sourceStatus(source: Source): RunSheetFactPacket["status"] {
  const value = `${clean(source.contentObject.status || source.contentObject.time_status || source.metadataObject.status)} ${sourceNarrative(source)}`.toLocaleLowerCase();
  if (/confirmed|booked|accepted|complete|done/.test(value)) return "confirmed";
  if (/proposed|draft|suggested|tentative/.test(value)) return "proposed";
  return "needs-confirmation";
}

function packetForSource(source: Source, weddingDay: string | null = null): RunSheetFactPacket | null {
  const category = sourceKind(source);
  if (!category) return null;
  const itemId = `runsheet:${category}:${safeId(sourceLogicalId(source))}`;
  const sourceRefs = [{ message_id: source.id, kind: clean(source.contentObject.kind) || source.type || "wedding_source" }];
  const factBasis = {
    itemId,
    title: sourceTitle(source, category),
    category,
    startAt: exactDateTime(source.contentObject.start_at ?? source.contentObject.starts_at ?? source.contentObject.event_at)
      ?? confirmedNarrativeStartAt(source, weddingDay),
    endAt: exactDateTime(source.contentObject.end_at ?? source.contentObject.ends_at),
    dueAt: exactDateTime(source.contentObject.due_at ?? source.contentObject.due_date),
    durationMinutes: boundedMinutes(source.contentObject.duration_minutes ?? source.contentObject.duration),
    location: sourceLocation(source),
    timeZone: clean(source.contentObject.time_zone ?? source.contentObject.timezone ?? source.metadataObject.time_zone) || "Australia/Sydney",
    ownerRefs: strings(source.contentObject.owner_refs ?? source.contentObject.owner ?? source.metadataObject.owner_refs),
    participantRefs: strings(source.contentObject.participant_refs ?? source.contentObject.participants),
    status: sourceStatus(source),
    visibility: strings(source.contentObject.visibility).length ? strings(source.contentObject.visibility) : ["master"],
    updatedAt: source.timestamp ?? new Date(0).toISOString(),
    sourceRefs,
  };
  return { ...factBasis, sourceFingerprint: weddingRunSheetFingerprint(factBasis) };
}

function rowData(packet: RunSheetFactPacket): Record<string, unknown> {
  return {
    runsheet_item_id: packet.itemId,
    title: packet.title,
    start_at: packet.startAt,
    end_at: packet.endAt,
    duration_minutes: packet.durationMinutes,
    time_status: packet.startAt ? (packet.status === "confirmed" ? "confirmed" : "proposed") : "unknown",
    location: packet.location,
    time_zone: packet.timeZone,
    owner_refs: packet.ownerRefs,
    participant_refs: packet.participantRefs,
    category: packet.category,
    status: packet.status,
    visibility: packet.visibility,
    source_refs: packet.sourceRefs,
    source_fingerprint: packet.sourceFingerprint,
    projection_state: "projected",
    due_at: packet.dueAt,
    updated_at: packet.updatedAt,
  };
}

/**
 * Read-only projection used by the synthetic Wedding plan database. It uses
 * the same deterministic fact packets as the editable run-sheet profile, so
 * Database never creates a second schedule or asks the couple to reconcile it.
 */
export function projectWeddingRunSheetPreviewRecords(input: {
  messages: CompatibleDatabaseMessage[];
  weddingPlanId: string;
  databaseId: string;
}): DatabaseViewRecord[] {
  const sources = scopedSources(input.messages, input.weddingPlanId);
  const weddingDay = weddingDayForSources(sources);
  const latestByItem = new Map<string, RunSheetFactPacket>();
  for (const source of sources) {
    const packet = packetForSource(source, weddingDay);
    if (!packet) continue;
    const current = latestByItem.get(packet.itemId);
    if (!current || packet.updatedAt.localeCompare(current.updatedAt) >= 0) latestByItem.set(packet.itemId, packet);
  }
  return Array.from(latestByItem.values())
    .sort((left, right) => (left.startAt ?? "9999").localeCompare(right.startAt ?? "9999") || left.title.localeCompare(right.title))
    .map((packet) => ({
      id: `${input.databaseId}:${packet.itemId}`,
      databaseId: input.databaseId,
      table: "run_sheet",
      data: rowData(packet),
      revision: 1,
      timestamp: packet.updatedAt,
    }));
}

function isProjectorOwnedRow(row: DatabaseViewRecord): boolean {
  const state = clean(row.data.projection_state);
  const sourceRefs = Array.isArray(row.data.source_refs) ? row.data.source_refs : [];
  return state !== "detached" && (
    state === "projected"
    || state === "stale"
    || clean(row.data.source_fingerprint).length > 0
    || sourceRefs.length > 0
  );
}

function newerRow(left: DatabaseViewRecord, right: DatabaseViewRecord): DatabaseViewRecord {
  if (left.revision !== right.revision) return left.revision > right.revision ? left : right;
  const timestampOrder = left.timestamp.localeCompare(right.timestamp);
  if (timestampOrder !== 0) return timestampOrder > 0 ? left : right;
  return left.id.localeCompare(right.id) >= 0 ? left : right;
}

function projectedRowByItemId(rows: DatabaseViewRecord[]): Map<string, DatabaseViewRecord> {
  const effective = new Map<string, DatabaseViewRecord>();
  for (const row of rows) {
    const itemId = clean(row.data.runsheet_item_id);
    if (!itemId || !isProjectorOwnedRow(row)) continue;
    const current = effective.get(itemId);
    effective.set(itemId, current ? newerRow(current, row) : row);
  }
  return effective;
}

export function weddingRunSheetEffectiveRows(rows: DatabaseViewRecord[]): DatabaseViewRecord[] {
  const effectiveProjected = projectedRowByItemId(rows);
  return rows.filter((row) => {
    const itemId = clean(row.data.runsheet_item_id);
    return !itemId || !isProjectorOwnedRow(row) || effectiveProjected.get(itemId)?.id === row.id;
  });
}

function cursorForSources(sources: Source[]): string {
  const latest = sources.slice().sort((left, right) => (left.timestamp ?? "").localeCompare(right.timestamp ?? "") || left.id.localeCompare(right.id)).at(-1);
  return safeId(`${latest?.timestamp ?? "none"}-${latest?.id ?? "none"}`);
}

export function buildWeddingRunSheetProjectionPlan(input: {
  databaseId: string;
  weddingPlanId: string;
  messages: CompatibleDatabaseMessage[];
  changedMessageIds: string[];
  currentRows: DatabaseViewRecord[];
  checkpoint?: WeddingRunSheetProjectionCheckpoint | null;
}): WeddingRunSheetProjectionPlan {
  const sources = scopedSources(input.messages, input.weddingPlanId);
  const weddingDay = weddingDayForSources(sources);
  const resolvableSourceIds = new Set(sources.filter((source) => packetForSource(source, weddingDay) !== null).map((source) => source.id));
  const changed = new Set(input.changedMessageIds);
  const affectedPacketMap = new Map<string, RunSheetFactPacket>();
  for (const packet of sources.filter((source) => changed.has(source.id)).map((source) => packetForSource(source, weddingDay)).filter((value): value is RunSheetFactPacket => !!value)) {
    const current = affectedPacketMap.get(packet.itemId);
    if (!current || packet.updatedAt.localeCompare(current.updatedAt) >= 0) affectedPacketMap.set(packet.itemId, packet);
  }
  const affectedPackets = Array.from(affectedPacketMap.values()).sort((left, right) => left.itemId.localeCompare(right.itemId));
  const existingByItem = projectedRowByItemId(input.currentRows.filter((row) => row.databaseId === input.databaseId));
  const records: CanonicalDatabaseRecordContent[] = [];
  const revisions: CanonicalDatabaseRevisionContent[] = [];
  let skippedUnchanged = 0;
  for (const packet of affectedPackets) {
    const existing = existingByItem.get(packet.itemId);
    if (clean(existing?.data.source_fingerprint) === packet.sourceFingerprint) { skippedUnchanged += 1; continue; }
    const data = rowData(packet);
    if (!existing) {
      records.push(buildCanonicalDatabaseRecord({ databaseId: input.databaseId, recordId: packet.itemId, table: "run_sheet", data, sourceRefs: packet.sourceRefs, idempotencyKey: `runsheet-create:${safeId(packet.itemId)}:${packet.sourceFingerprint}` }));
    } else {
      revisions.push(buildCanonicalDatabaseRevision({ databaseId: input.databaseId, targetRecordId: existing.id, baseRevision: existing.revision, table: existing.table, patch: data, sourceRefs: packet.sourceRefs, idempotencyKey: `runsheet-revision:${safeId(packet.itemId)}:${packet.sourceFingerprint}` }));
    }
  }
  for (const row of existingByItem.values()) {
    const refs = Array.isArray(row.data.source_refs) ? row.data.source_refs.map(objectValue).map((ref) => clean(ref.message_id)).filter(Boolean) : [];
    if (refs.length === 0 || refs.some((id) => !changed.has(id)) || refs.some((id) => resolvableSourceIds.has(id))) continue;
    if (clean(row.data.projection_state) === "stale") continue;
    revisions.push(buildCanonicalDatabaseRevision({ databaseId: input.databaseId, targetRecordId: row.id, baseRevision: row.revision, table: row.table, patch: { projection_state: "stale", status: "needs-confirmation" }, idempotencyKey: `runsheet-stale:${safeId(row.id)}:${row.revision + 1}` }));
  }
  const affectedRecordIds = [...records.map((record) => record.record_id), ...revisions.map((revision) => revision.target_record_id)];
  if (affectedRecordIds.length === 0) {
    return { records, revisions, receipt: null, nextCheckpoint: input.checkpoint ?? null, affectedItemIds: [], skippedUnchanged, modelCalls: 0, explanation: skippedUnchanged ? "The changed wedding facts already match the run sheet, so no rows changed." : "No run-sheet rows were affected by these wedding updates." };
  }
  const sourceCursor = cursorForSources(sources.filter((source) => changed.has(source.id)));
  const sourceFingerprint = weddingRunSheetFingerprint(affectedPackets.map((packet) => packet.sourceFingerprint));
  const receipt = buildCanonicalDatabaseProjectionReceipt({ databaseId: input.databaseId, projectorId: WEDDING_RUN_SHEET_PROJECTOR_ID, projectorVersion: WEDDING_RUN_SHEET_PROJECTOR_VERSION, sourceCursor, sourceFingerprint, affectedRecordIds });
  return {
    records,
    revisions,
    receipt,
    nextCheckpoint: { sourceCursor, projectorVersion: WEDDING_RUN_SHEET_PROJECTOR_VERSION, sourceFingerprint },
    affectedItemIds: affectedPackets.map((packet) => packet.itemId),
    skippedUnchanged,
    modelCalls: 0,
    explanation: `${records.length} run-sheet item${records.length === 1 ? " was" : "s were"} added and ${revisions.length} updated from changed wedding facts. Review any proposed or missing times before sharing.`,
  };
}

function rowsAfterPlan(rows: DatabaseViewRecord[], plan: WeddingRunSheetProjectionPlan): DatabaseViewRecord[] {
  const next = new Map(rows.map((row) => [row.id, row]));
  for (const record of plan.records) {
    next.set(record.record_id, {
      id: record.record_id,
      databaseId: record.database_id,
      table: record.table,
      data: record.data,
      revision: record.revision,
      timestamp: plan.nextCheckpoint?.sourceCursor ?? "",
    });
  }
  for (const revision of plan.revisions) {
    const current = next.get(revision.target_record_id);
    if (!current) continue;
    next.set(current.id, {
      ...current,
      data: revision.operation === "tombstone" ? current.data : { ...current.data, ...revision.patch },
      revision: revision.revision,
      timestamp: plan.nextCheckpoint?.sourceCursor ?? current.timestamp,
    });
  }
  return Array.from(next.values());
}

export function buildWeddingRunSheetProjectionBatchSeries(input: {
  databaseId: string;
  weddingPlanId: string;
  messages: CompatibleDatabaseMessage[];
  changedMessageIds: string[];
  currentRows: DatabaseViewRecord[];
  checkpoint?: WeddingRunSheetProjectionCheckpoint | null;
  maxWritesPerBatch?: number;
}): WeddingRunSheetProjectionBatchSeries {
  const maxWrites = Math.max(1, Math.min(100, Math.floor(input.maxWritesPerBatch ?? 80)));
  const sourceIds = Array.from(new Set(input.changedMessageIds)).sort();
  let rows = weddingRunSheetEffectiveRows(input.currentRows);
  let checkpoint = input.checkpoint ?? null;
  const batches: WeddingRunSheetProjectionBatch[] = [];
  for (let offset = 0; offset < sourceIds.length; offset += maxWrites) {
    const plan = buildWeddingRunSheetProjectionPlan({
      ...input,
      changedMessageIds: sourceIds.slice(offset, offset + maxWrites),
      currentRows: rows,
      checkpoint,
    });
    const writes = plan.records.length + plan.revisions.length;
    if (!plan.receipt || !plan.nextCheckpoint || writes === 0) continue;
    if (writes > maxWrites) throw new Error("The run-sheet rebuild exceeded its bounded batch size.");
    batches.push({ expectedCheckpoint: checkpoint, plan });
    rows = rowsAfterPlan(rows, plan);
    checkpoint = plan.nextCheckpoint;
  }
  return {
    batches,
    writeCount: batches.reduce((total, batch) => total + batch.plan.records.length + batch.plan.revisions.length, 0),
    sourceCount: sourceIds.length,
    modelCalls: 0,
  };
}
