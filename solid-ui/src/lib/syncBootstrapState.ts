// @locs-version: 1.0
import type { ShapeDescriptor, SyncBootstrap } from "@/lib/sync";

const DEVICE_CLASSES = new Set(["desktop", "mobile", "watch"]);
const PROFILES = new Set(["full", "balanced", "lightweight"]);
const PROFILE_SOURCES = new Set(["explicit", "stored_policy", "device_default"]);

function isSyncDeviceClass(value: unknown): value is SyncBootstrap["device_class"] {
  return typeof value === "string" && DEVICE_CLASSES.has(value);
}

function isSyncProfile(value: unknown): value is SyncBootstrap["profile"] {
  return typeof value === "string" && PROFILES.has(value);
}

function isSyncProfileSource(value: unknown): value is SyncBootstrap["profile_source"] {
  return typeof value === "string" && PROFILE_SOURCES.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function parseShapeDescriptor(value: unknown): ShapeDescriptor | null {
  if (!isRecord(value)) return null;
  const table = nonEmptyString(value.table);
  const localTable = nonEmptyString(value.local_table);
  if (!table || !localTable) return null;
  return {
    schema: optionalString(value.schema),
    table,
    local_table: localTable,
    where_clause: optionalString(value.where_clause),
    requires_key_material: value.requires_key_material === true,
    conflict_mode: optionalString(value.conflict_mode) ?? undefined,
  };
}

export function parseSyncBootstrapResponse(payload: unknown): SyncBootstrap | null {
  if (!isRecord(payload)) return null;
  const syncEndpoint = nonEmptyString(payload.sync_endpoint);
  if (!syncEndpoint) return null;

  const shapes = Array.isArray(payload.shapes)
    ? payload.shapes.flatMap((shape): ShapeDescriptor[] => {
      const parsed = parseShapeDescriptor(shape);
      return parsed ? [parsed] : [];
    })
    : [];

  const bootstrap = isRecord(payload.bootstrap)
    ? {
      device_id: nonEmptyString(payload.bootstrap.device_id) ?? "",
      agent_id: nonEmptyString(payload.bootstrap.agent_id) ?? "",
      electric_project_url: nonEmptyString(payload.bootstrap.electric_project_url) ?? "",
      encrypted_seed_ref: nonEmptyString(payload.bootstrap.encrypted_seed_ref) ?? "",
      pglite_path: nonEmptyString(payload.bootstrap.pglite_path) ?? "",
    }
    : undefined;

  return {
    device_class: isSyncDeviceClass(payload.device_class) ? payload.device_class : undefined,
    profile: isSyncProfile(payload.profile) ? payload.profile : undefined,
    profile_source: isSyncProfileSource(payload.profile_source) ? payload.profile_source : undefined,
    bootstrap,
    shapes,
    sync_endpoint: syncEndpoint,
    electric_url: optionalString(payload.electric_url),
    requires_local_key_material: payload.requires_local_key_material === true,
  };
}
