// @locs-version: 1.0
import { buildCanonicalDatabaseSavedView, type DatabaseSavedViewContent } from "@/lib/databaseContract";
import type { WeddingRunSheetPresentedRow } from "@/lib/weddingRunSheetEditingState";

export type WeddingRunSheetSavedViewId = "master" | "vendor" | "photo_video" | "vip" | "guest" | "print";

export type WeddingRunSheetSavedViewPreset = {
  id: WeddingRunSheetSavedViewId;
  name: string;
  description: string;
  visibilityRole: string | null;
  columns: string[];
  fieldPolicy: DatabaseSavedViewContent["field_policy"];
};

export type WeddingRunSheetSavedViewRow = {
  sourceRecordId: string;
  values: Record<string, unknown>;
};

const PRIVATE_FIELDS = [
  "private_notes", "couple_phone", "couple_email", "personal_phone", "personal_email",
  "internal_notes", "source_refs", "source_fingerprint",
];

const scheduleColumns = ["start_at", "end_at", "title", "location", "owner_refs", "participant_refs", "status"];

function policy(columns: string[], resolveContactFields = false): DatabaseSavedViewContent["field_policy"] {
  return {
    include_fields: columns,
    exclude_fields: PRIVATE_FIELDS,
    resolve_contact_fields: resolveContactFields,
  };
}

export const weddingRunSheetSavedViewPresets: WeddingRunSheetSavedViewPreset[] = [
  {
    id: "master",
    name: "Master",
    description: "Your complete working schedule, including private planning fields.",
    visibilityRole: null,
    columns: [...scheduleColumns, "visibility", "dependency_refs", "buffer_before_minutes", "buffer_after_minutes", "notes", "private_notes"],
    fieldPolicy: { include_fields: [], exclude_fields: ["source_refs", "source_fingerprint"], resolve_contact_fields: true },
  },
  { id: "vendor", name: "Vendor", description: "Only vendor-visible timings and operational details.", visibilityRole: "vendor", columns: scheduleColumns, fieldPolicy: policy(scheduleColumns) },
  { id: "photo_video", name: "Photo/video", description: "Photo and video timings, people and locations.", visibilityRole: "photo-video", columns: scheduleColumns, fieldPolicy: policy(scheduleColumns) },
  { id: "vip", name: "VIP", description: "Getting-ready, transport and responsibility details shared with VIPs.", visibilityRole: "vip", columns: scheduleColumns, fieldPolicy: policy(scheduleColumns) },
  { id: "guest", name: "Guest", description: "Guest-facing times and places without private coordination notes.", visibilityRole: "guest", columns: ["start_at", "title", "location", "status"], fieldPolicy: policy(["start_at", "title", "location", "status"]) },
  { id: "print", name: "Print", description: "A concise master day-of copy with key operational fields.", visibilityRole: null, columns: scheduleColumns, fieldPolicy: policy(scheduleColumns) },
];

export function weddingRunSheetSavedViewPreset(id: string): WeddingRunSheetSavedViewPreset {
  return weddingRunSheetSavedViewPresets.find((preset) => preset.id === id) ?? weddingRunSheetSavedViewPresets[0]!;
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export function projectWeddingRunSheetSavedView(
  rows: WeddingRunSheetPresentedRow[],
  preset: WeddingRunSheetSavedViewPreset,
): WeddingRunSheetSavedViewRow[] {
  const excluded = new Set(preset.fieldPolicy.exclude_fields);
  const allowed = new Set(preset.columns.filter((field) => !excluded.has(field)));
  return rows
    .filter((row) => !preset.visibilityRole || strings(row.record.data.visibility).includes(preset.visibilityRole))
    .map((row) => ({
      sourceRecordId: row.record.id,
      values: Object.fromEntries(Array.from(allowed).map((field) => [field, row.record.data[field] ?? null])),
    }));
}

export function buildWeddingRunSheetSavedViewContent(input: {
  databaseId: string;
  preset: WeddingRunSheetSavedViewPreset;
  revision?: number;
}): DatabaseSavedViewContent {
  return buildCanonicalDatabaseSavedView({
    databaseId: input.databaseId,
    viewId: `wedding-runsheet-${input.preset.id}`,
    name: input.preset.name,
    revision: input.revision,
    profileRevision: 1,
    columns: input.preset.columns,
    sort: [{ field: "start_at", direction: "ascending" }],
    filters: input.preset.visibilityRole
      ? [{ field: "visibility", operator: "contains", value: input.preset.visibilityRole }]
      : [],
    fieldPolicy: input.preset.fieldPolicy,
  });
}

export function weddingRunSheetSavedViewValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return "Structured detail";
  return String(value);
}
