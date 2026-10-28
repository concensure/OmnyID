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
  return scopedSources(messages, weddingPlanId)
    .filter((source) => packetForSource(source) !== null)
    .map((source) => source.id);
}

function sourceText(source: Source): string {
  return [
    source.type, source.contentObject.kind, source.contentObject.title, source.contentObject.name,
    source.contentObject.label, source.contentObject.category, source.contentObject.stage,
    source.contentObject.milestone_kind, source.contentObject.wedding_task_kind,
    source.contentObject.vendor_category, source.contentObject.decision_type,
    source.metadataObject.wedding_task_kind, source.metadataObject.projection,
    source.metadataObject.category, source.metadataObject.stage,
  ]
    .map(clean).join(" ").toLocaleLowerCase();
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
  const value = clean(source.contentObject.status || source.contentObject.time_status || source.metadataObject.status).toLocaleLowerCase();
  if (/confirmed|booked|accepted|complete|done/.test(value)) return "confirmed";
  if (/proposed|draft|suggested|tentative/.test(value)) return "proposed";
  return "needs-confirmation";
}

function packetForSource(source: Source): RunSheetFactPacket | null {
  const category = sourceKind(source);
  if (!category) return null;
  const itemId = `runsheet:${category}:${safeId(sourceLogicalId(source))}`;
  const sourceRefs = [{ message_id: source.id, kind: clean(source.contentObject.kind) || source.type || "wedding_source" }];
  const factBasis = {
    itemId,
    title: sourceTitle(source, category),
    category,
    startAt: exactDateTime(source.contentObject.start_at ?? source.contentObject.starts_at ?? source.contentObject.event_at),
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
    time_status: packet.startAt ? "proposed" : "unknown",
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

function projectedRowByItemId(rows: DatabaseViewRecord[]): Map<string, DatabaseViewRecord> {
  return new Map(rows.flatMap((row) => {
    const itemId = clean(row.data.runsheet_item_id);
    const state = clean(row.data.projection_state);
    return itemId && state !== "detached" ? [[itemId, row] as const] : [];
  }));
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
  const resolvableSourceIds = new Set(sources.filter((source) => packetForSource(source) !== null).map((source) => source.id));
  const changed = new Set(input.changedMessageIds);
  const affectedPackets = sources.filter((source) => changed.has(source.id)).map(packetForSource).filter((packet): packet is RunSheetFactPacket => !!packet);
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
