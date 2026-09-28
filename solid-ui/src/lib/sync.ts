/**
 * sync.ts — ElectricSQL / PGLite local-first sync initialization.
 *
 * On browsers that support OPFS (Chrome 102+, Safari 16.4+, Firefox 111+),
 * PGLite persists data in-browser. On older browsers it falls back to
 * in-memory mode. The Electric sync shapes come from GET /sync/bootstrap.
 */

import { readSession } from "@/lib/api";
import type { Extension } from "@electric-sql/pglite";
import localRouterSchemaSql from "@/lib/local-router-schema.sql?raw";
import {
  refreshLocalRouterDerivedStateIfStale,
  splitSqlStatements,
  type QueryableDb,
} from "@/lib/localRouterProjector";
import { parseSyncBootstrapResponse } from "@/lib/syncBootstrapState";

export interface ShapeDescriptor {
  schema?: string | null;
  table: string;
  local_table: string;
  where_clause: string | null;
  requires_key_material: boolean;
  conflict_mode?: string;
}

export interface SyncBootstrap {
  device_class?: "desktop" | "mobile" | "watch";
  profile?: "full" | "balanced" | "lightweight";
  profile_source?: "explicit" | "stored_policy" | "device_default";
  bootstrap?: {
    device_id: string;
    agent_id: string;
    electric_project_url: string;
    encrypted_seed_ref: string;
    pglite_path: string;
  };
  shapes: ShapeDescriptor[];
  sync_endpoint: string;
  electric_url?: string | null;
  requires_local_key_material?: boolean;
}

let _initialized = false;
let _initializedToken: string | null = null;
let _initializingToken: string | null = null;
let _initializingDeviceClass: "desktop" | "mobile" | "watch" | null = null;
let _initPromise: Promise<void> | null = null;
let _activePgliteLocation: string | null = null;
let _activeDeviceClass: "desktop" | "mobile" | "watch" | null = null;
let _activeDb: { close?: () => Promise<void> } | null = null;
let _initGeneration = 0;
const SYNC_DEVICE_STORAGE_PREFIX = "omnyid.sync.device";

type LocalReplicaSchemaDb = Pick<QueryableDb, "exec">;
type PgliteExtension = Extension;
type ElectricPgliteDb = QueryableDb & {
  close(): Promise<void>;
  electric: {
    syncShapeToTable(args: {
      shape: { url: string; params: Record<string, string> };
      table: string;
      primaryKey: string[];
    }): Promise<void>;
  };
};

function localReplicaDb(value: QueryableDb): LocalReplicaSchemaDb {
  return value;
}

function electricPgliteDb(value: QueryableDb & { close(): Promise<void> }): ElectricPgliteDb {
  return value as ElectricPgliteDb;
}

function pgliteExtension(value: unknown): PgliteExtension {
  return value as PgliteExtension;
}

async function ensureLocalRouterSchema(db: LocalReplicaSchemaDb): Promise<void> {
  for (const statement of splitSqlStatements(localRouterSchemaSql)) {
    await db.exec(statement);
  }
}

function detectSyncDeviceClass(): "desktop" | "mobile" | "watch" {
  if (typeof window === "undefined") return "desktop";
  const ua = window.navigator.userAgent.toLowerCase();
  if (ua.includes("watch")) return "watch";
  if (window.matchMedia?.("(max-width: 640px)").matches || ua.includes("mobile")) {
    return "mobile";
  }
  return "desktop";
}

function syncDeviceStorageKey(deviceClass: string): string {
  const userId = readSession()?.user?.id?.trim();
  return `${SYNC_DEVICE_STORAGE_PREFIX}.${userId && userId.length > 0 ? userId : "default"}.${deviceClass}`;
}

function readStoredSyncDeviceId(deviceClass: string): string | null {
  try {
    const key = syncDeviceStorageKey(deviceClass);
    const stored = window.localStorage.getItem(key);
    if (stored === null) return null;
    const value = stored.trim();
    if (!value) {
      window.localStorage.removeItem(key);
      return null;
    }
    if (value !== stored) window.localStorage.setItem(key, value);
    return value;
  } catch {
    return null;
  }
}

function writeStoredSyncDeviceId(deviceClass: string, deviceId: string | null | undefined): void {
  const normalized = deviceId?.trim();
  if (!normalized) return;
  try {
    window.localStorage.setItem(syncDeviceStorageKey(deviceClass), normalized);
  } catch {
    // ignore persistence failures
  }
}

function resolvePgliteLocation(boot: SyncBootstrap): string {
  const rawPath = boot.bootstrap?.pglite_path?.trim();
  if (!rawPath) return "idb://omnyid-local";
  if (rawPath.includes("://")) return rawPath;
  return `idb://${rawPath.replace(/^\/+/, "")}`;
}

async function disposeActiveSyncDb(): Promise<void> {
  const db = _activeDb;
  _activeDb = null;
  _activePgliteLocation = null;
  _activeDeviceClass = null;
  if (!db?.close) return;
  try {
    await db.close();
  } catch (err) {
    console.warn("[omnyid-sync] failed to close previous PGLite instance (non-fatal):", err);
  }
}

export function getActiveSyncDb(): unknown | null {
  return _activeDb;
}

export async function resetSyncInitState(): Promise<void> {
  _initGeneration += 1;
  _initialized = false;
  _initializedToken = null;
  _initializingToken = null;
  _initializingDeviceClass = null;
  _initPromise = null;
  await disposeActiveSyncDb();
}

export async function ensureSyncReady(apiBase: string): Promise<void> {
  const token = readSession()?.token ?? null;
  await initSync(apiBase, token);
}

export async function initSync(apiBase: string, token: string | null): Promise<void> {
  const deviceClass = detectSyncDeviceClass();
  if (!token) {
    await resetSyncInitState();
    return;
  }
  if (
    _activeDb &&
    ((_initializedToken && _initializedToken !== token) || (_activeDeviceClass && _activeDeviceClass !== deviceClass))
  ) {
    await disposeActiveSyncDb();
    _initialized = false;
    _initializedToken = null;
  }
  if (_initialized && _initializedToken === token && _activeDeviceClass === deviceClass) return;
  if (_initPromise && _initializingToken === token && _initializingDeviceClass === deviceClass) {
    await _initPromise;
    return;
  }

  const generation = ++_initGeneration;
  _initializingToken = token;
  _initializingDeviceClass = deviceClass;
  _initPromise = (async () => {
    const params = new URLSearchParams({ device_class: deviceClass });
    const storedDeviceId = readStoredSyncDeviceId(deviceClass);
    if (storedDeviceId) params.set("device_id", storedDeviceId);
    const resp = await fetch(`${apiBase}/sync/bootstrap?${params.toString()}`, {
      credentials: "include",
    });
    if (!resp.ok) return;
    const boot = parseSyncBootstrapResponse(await resp.json());
    if (!boot) return;
    writeStoredSyncDeviceId(deviceClass, boot.bootstrap?.device_id);
    if (!boot.sync_endpoint) {
      console.debug("[omnyid-sync] no sync endpoint in bootstrap, skipping PGLite init");
      return;
    }
    const nextPgliteLocation = resolvePgliteLocation(boot);
    if (
      _activeDb &&
      (_initializedToken !== token || _activePgliteLocation !== nextPgliteLocation)
    ) {
      await disposeActiveSyncDb();
      _initialized = false;
    }
    // Dynamically import PGLite only when Electric is available to avoid
    // adding the ~2 MB bundle to the initial load for users without sync.
    const { PGlite } = await import(/* @vite-ignore */ "@electric-sql/pglite");
    const { electricSync } = await import(/* @vite-ignore */ "@electric-sql/pglite/electric");
    const db = await PGlite.create(nextPgliteLocation, {
      extensions: { electric: pgliteExtension(electricSync()) },
    });
    if (generation !== _initGeneration) {
      await db.close();
      return;
    }
    _activeDb = db as { close?: () => Promise<void> };
    _activePgliteLocation = nextPgliteLocation;
    _activeDeviceClass = deviceClass;
    await ensureLocalRouterSchema(localReplicaDb(db));
    const electricDb = electricPgliteDb(db);
    // Subscribe to each server-provided shape
    for (const shape of boot.shapes) {
      const url = `${boot.sync_endpoint}/${shape.table}`;
      const params: Record<string, string> = {};
      if (shape.schema) params.schema = shape.schema;
      if (shape.where_clause) params.where = shape.where_clause;
      await electricDb.electric.syncShapeToTable({
        shape: { url, params },
        table: shape.local_table,
        primaryKey: ["id"],
      });
    }
    await refreshLocalRouterDerivedStateIfStale(db);
    if (generation !== _initGeneration) {
      await disposeActiveSyncDb();
      return;
    }
    _initialized = true;
    _initializedToken = token;
    console.info("[omnyid-sync] PGLite sync initialized with", boot.shapes.length, "shapes");
  })().catch((err) => {
    // Sync is opportunistic — never block the UI
    console.warn("[omnyid-sync] sync init failed (non-fatal):", err);
  }).finally(() => {
    if (generation === _initGeneration) {
      _initializingToken = null;
      _initializingDeviceClass = null;
      _initPromise = null;
    }
  });

  await _initPromise;
}
