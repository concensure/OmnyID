// @locs-version: 1.0
import type { RuntimeBackupManifestResponse } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

export function runtimeManifestSummaryLines(manifest: RuntimeBackupManifestResponse | null): string[] {
  const payload = manifest?.manifest_json;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  return Object.entries(payload)
    .slice(0, 6)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.length} entries`;
      if (isRecord(value)) {
        return `${key}: ${Object.keys(value).length} fields`;
      }
      return `${key}: ${String(value)}`;
    });
}

export function runtimeStatusPanelLines(panel: Record<string, unknown> | null | undefined): string[] {
  if (!panel || typeof panel !== "object" || Array.isArray(panel)) return [];
  return Object.entries(panel)
    .slice(0, 6)
    .map(([key, value]) => {
      if (Array.isArray(value)) return `${key}: ${value.length} entries`;
      if (isRecord(value)) {
        return `${key}: ${Object.keys(value).length} fields`;
      }
      return `${key}: ${String(value)}`;
    });
}
