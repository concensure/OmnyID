// @locs-version: 1.0
import type { BillingStatus } from "@/lib/api";

export function archiveOnlyToggleLabel(
  billing: BillingStatus | null | undefined,
  saving: boolean,
): string {
  if (saving) return "Saving...";
  if (typeof billing?.archive_only_enabled !== "boolean") return "Archive-only mode unavailable";
  return billing?.archive_only_enabled
    ? "Disable archive-only mode"
    : "Enable archive-only mode";
}

export function archiveOnlyActiveLabel(
  billing: BillingStatus | null | undefined,
): string | null {
  return billing?.archive_only_enabled ? "Archive-only mode active" : null;
}

export function archiveOnlyWarningTitle(
  billing: BillingStatus | null | undefined,
): string {
  if (typeof billing?.archive_only_enabled !== "boolean") return "Archive-only policy unavailable";
  return billing?.archive_only_enabled
    ? "Archive-only mode active"
    : "Archive-only mode on quota overflow";
}
