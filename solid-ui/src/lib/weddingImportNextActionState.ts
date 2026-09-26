// @locs-version: 1.0
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export type WeddingImportNextActionTarget = {
  label: string;
  menuId: WeddingWorkspaceMenuId;
  actionLabel: string;
};

export function weddingImportNextActionTarget(label: string): WeddingImportNextActionTarget {
  const normalized = label.toLowerCase();
  if (/\b(budget|payment|deposit|contract|vendor commitment|totals?)\b/.test(normalized)) {
    return { label, menuId: "budget", actionLabel: "Open budget" };
  }
  if (/\b(excel|workbook|spreadsheet|parser|reprocess|original upload|original wedding imports|files|source evidence|reparse)\b/.test(normalized)) {
    return { label, menuId: "advanced", actionLabel: "Review import setup" };
  }
  if (/\b(clear rows?|review)\b/.test(normalized)) {
    return { label, menuId: "home", actionLabel: "Open wedding documents" };
  }
  return { label, menuId: "home", actionLabel: "Open wedding documents" };
}
