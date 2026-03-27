/**
 * sync.ts — ElectricSQL / PGLite local-first sync initialization.
 *
 * On browsers that support OPFS (Chrome 102+, Safari 16.4+, Firefox 111+),
 * PGLite persists data in-browser. On older browsers it falls back to
 * in-memory mode. The Electric sync shapes come from GET /sync/bootstrap.
 */

export interface ShapeDescriptor {
  slice: string;
  table: string;
  where_clause: string | null;
  requires_key_material: boolean;
}

export interface SyncBootstrap {
  device: { device_id: string; device_class: string };
  shapes: ShapeDescriptor[];
  sync_endpoint: string;
  electric_url?: string;
}

let _initialized = false;

export async function initSync(apiBase: string, token: string | null): Promise<void> {
  if (_initialized || !token) return;

  try {
    const resp = await fetch(`${apiBase}/sync/bootstrap?device_class=desktop`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) return;
    const boot: SyncBootstrap = await resp.json();
    if (!boot.electric_url) {
      console.debug("[omnyid-sync] no electric_url in bootstrap, skipping PGLite init");
      return;
    }
    // Dynamically import PGLite only when Electric is available to avoid
    // adding the ~2 MB bundle to the initial load for users without sync.
    const { PGlite } = await import(/* @vite-ignore */ "@electric-sql/pglite");
    const { electricSync } = await import(/* @vite-ignore */ "@electric-sql/pglite/electric");
    const db = await PGlite.create("idb://omnyid-local", {
      extensions: { electric: electricSync() as any },
    });
    const electricDb = db as typeof db & {
      electric: {
        syncShapeToTable(args: {
          shape: { url: string; params: Record<string, string> };
          table: string;
          primaryKey: string[];
        }): Promise<void>;
      };
    };
    // Subscribe to each server-provided shape
    for (const shape of boot.shapes) {
      const url = `${boot.electric_url}/v1/shape/${shape.table}`;
      const params: Record<string, string> = {};
      if (shape.where_clause) params.where = shape.where_clause;
      await electricDb.electric.syncShapeToTable({
        shape: { url, params },
        table: shape.table,
        primaryKey: ["id"],
      });
    }
    _initialized = true;
    console.info("[omnyid-sync] PGLite sync initialized with", boot.shapes.length, "shapes");
  } catch (err) {
    // Sync is opportunistic — never block the UI
    console.warn("[omnyid-sync] sync init failed (non-fatal):", err);
  }
}
