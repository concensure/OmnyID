// @locs-version: 1.0
import type { BillingStatus } from "@/lib/api";

export type ParaUploadPreflight =
  | { allowed: true }
  | { allowed: false; reason: string };

function hasMountedFiniteBytes(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasMountedQuotaState(value: BillingStatus["quota_state"] | null | undefined): value is "ok" | "exceeded" {
  return value === "ok" || value === "exceeded";
}

function hasMountedArchiveOnlyEnabled(value: boolean | null | undefined): value is boolean {
  return typeof value === "boolean";
}

export function hasMountedParaUploadPolicy(
  billing: BillingStatus | null | undefined,
): billing is BillingStatus & {
  archive_only_enabled: boolean;
  quota_state: "ok" | "exceeded";
  max_single_upload_bytes: number;
} {
  return (
    !!billing &&
    hasMountedArchiveOnlyEnabled(billing.archive_only_enabled) &&
    hasMountedQuotaState(billing.quota_state) &&
    hasMountedFiniteBytes(billing.max_single_upload_bytes)
  );
}

export function readMountedWarningText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function hasMountedParaStorageSummary(
  billing: BillingStatus | null | undefined,
): billing is BillingStatus & {
  storage_used_bytes: number;
  storage_remaining_bytes: number;
  max_single_upload_bytes: number;
} {
  return (
    !!billing &&
    hasMountedFiniteBytes(billing.storage_used_bytes) &&
    hasMountedFiniteBytes(billing.storage_remaining_bytes) &&
    hasMountedFiniteBytes(billing.max_single_upload_bytes)
  );
}

function byteCountLabel(bytes: number | null | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let current = value;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  return `${current >= 10 || unitIndex === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[unitIndex]}`;
}

export function paraUploadStorageSummary(billing: BillingStatus | null | undefined): string {
  if (!billing) return "";
  if (!hasMountedParaStorageSummary(billing)) {
    return "Uploads are still allowed under the confirmed storage policy, but storage usage data is incomplete. Use Retry storage policy for fully trusted storage usage data, remaining capacity, and max upload size.";
  }
  const used = byteCountLabel(billing.storage_used_bytes);
  const remaining = byteCountLabel(billing.storage_remaining_bytes);
  const maxUpload = byteCountLabel(billing.max_single_upload_bytes);
  return `${used} used | ${remaining} remaining | max single upload ${maxUpload}`;
}

export function evaluateParaUploadPreflight(
  billing: BillingStatus | null | undefined,
  files: ArrayLike<{ name: string; size: number }>,
): ParaUploadPreflight {
  if (!hasMountedParaUploadPolicy(billing)) {
    return {
      allowed: false,
      reason:
        "Use Retry storage policy before importing files so PARA upload eligibility and single-upload limits are trusted.",
    };
  }

  const archiveOnlyWarningText = readMountedWarningText(billing?.archive_only_warning);

  if (billing?.archive_only_enabled) {
    return {
      allowed: false,
      reason:
        archiveOnlyWarningText ||
        "Archive-only mode is active. Stored material remains accessible, but uploads stay blocked until archive-only mode is disabled or storage headroom is restored.",
    };
  }

  if (billing?.quota_state === "exceeded") {
    return {
      allowed: false,
      reason:
        archiveOnlyWarningText ||
        "Storage quota exceeded. Upgrade storage or switch to archive-only mode before uploading more files.",
    };
  }

  const maxUpload = billing.max_single_upload_bytes;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    if (file.size > maxUpload) {
      return {
        allowed: false,
        reason: `${file.name} exceeds the current single-upload limit of ${byteCountLabel(maxUpload)} for this account.`,
      };
    }
  }

  return { allowed: true };
}
