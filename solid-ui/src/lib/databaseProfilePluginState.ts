// @locs-version: 1.0
import type { DatabaseViewColumnDef } from "@/lib/databaseViewState";

export type DatabaseProfilePlugin = {
  profileId: string;
  profileVersion: number;
  toolbarKind: "wedding_run_sheet";
  primaryTable: string;
  preferredColumns: DatabaseViewColumnDef[];
  mobileCardFields: string[];
};

const weddingRunSheetPlugin: DatabaseProfilePlugin = {
  profileId: "wedding_runsheet.v1",
  profileVersion: 1,
  toolbarKind: "wedding_run_sheet",
  primaryTable: "run_sheet",
  preferredColumns: [
    { key: "title", label: "Item" },
    { key: "start_at", label: "Start" },
    { key: "end_at", label: "End" },
    { key: "status", label: "Status" },
    { key: "location", label: "Place" },
    { key: "owner_refs", label: "Owner" },
    { key: "visibility", label: "Shared with" },
  ],
  mobileCardFields: ["title", "start_at", "status", "location", "owner_refs", "visibility"],
};

const plugins = new Map([[weddingRunSheetPlugin.profileId, weddingRunSheetPlugin]]);

export function databaseProfilePlugin(profileId: string | null | undefined): DatabaseProfilePlugin | null {
  return profileId ? plugins.get(profileId) ?? null : null;
}

export function databaseProfileColumns(input: {
  profileId?: string | null;
  discovered: DatabaseViewColumnDef[];
}): DatabaseViewColumnDef[] {
  const plugin = databaseProfilePlugin(input.profileId);
  if (!plugin) return input.discovered;
  const discovered = new Map(input.discovered.map((column) => [column.key, column]));
  const ordered = plugin.preferredColumns.map((column) => discovered.get(column.key) ?? column);
  const preferredKeys = new Set(plugin.preferredColumns.map((column) => column.key));
  return [...ordered, ...input.discovered.filter((column) => !preferredKeys.has(column.key))];
}
