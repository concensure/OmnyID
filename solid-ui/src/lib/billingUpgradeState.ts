// @locs-version: 1.0
type BillingStatusLike = {
  plan?: string | null;
  status?: string | null;
  storage_quota_bytes?: number;
  storage_used_bytes?: number;
  storage_remaining_bytes?: number;
  quota_state?: string | null;
};

function hasMountedFiniteBytes(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export const BILLING_UPGRADE_EMAIL = "hello@omnyid.com";

function hasRecognizedBillingStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "active" || normalized === "past_due";
}

function hasRecognizedQuotaState(quotaState: string | null | undefined): boolean {
  const normalized = String(quotaState ?? "").trim().toLowerCase();
  return normalized === "ok" || normalized === "exceeded";
}

function hasRecognizedPlanMetadata(plan: string | null | undefined): boolean {
  const normalized = String(plan ?? "").trim().toLowerCase();
  return normalized === "free" || normalized === "trial" || normalized === "starter_free" || normalized === "paid";
}

function normalizePlanId(plan: string | null | undefined): "free" | "paid" {
  const raw = String(plan ?? "").trim().toLowerCase();
  if (!raw || raw === "free" || raw === "trial" || raw === "starter_free") return "free";
  return "paid";
}

function nextStorageUpgradeLabel(plan: string | null | undefined): string {
  const normalized = normalizePlanId(plan);
  if (normalized === "free") {
    return "OmnyID Wedding - 100 MB for AUD 39 one-off";
  }
  return "Your OmnyID Wedding upgrade is active (100 MB storage).";
}

function byteCountLabel(bytes: number | null | undefined) {
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

function formatPlan(plan: string | null | undefined) {
  if (!hasRecognizedPlanMetadata(plan)) return "Plan metadata unavailable";
  const raw = String(plan || "free").trim();
  if (!raw) return "Free";
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatBillingStatus(status: string | null | undefined) {
  if (!hasRecognizedBillingStatus(status)) return "unavailable";
  return String(status).trim().toLowerCase();
}

function formatQuotaState(quotaState: string | null | undefined) {
  if (!hasRecognizedQuotaState(quotaState)) return "unavailable";
  return String(quotaState).trim().toLowerCase();
}

function formatSuggestedUpgrade(plan: string | null | undefined) {
  if (!hasRecognizedPlanMetadata(plan)) {
    return "Retry billing status to confirm a supported plan id before inferring the next storage upgrade path.";
  }
  return nextStorageUpgradeLabel(plan);
}

function resolveStorageSnapshot(billing: BillingStatusLike | null | undefined): {
  usedLabel: string;
  remainingLabel: string;
} {
  const hasRecognizedPlan = hasRecognizedPlanMetadata(billing?.plan);
  const hasQuotaBytes = hasMountedFiniteBytes(billing?.storage_quota_bytes);
  const hasRemainingBytes = hasMountedFiniteBytes(billing?.storage_remaining_bytes);
  const hasUsedBytes = hasMountedFiniteBytes(billing?.storage_used_bytes);

  if (!hasUsedBytes) {
    return {
      usedLabel: "unavailable",
      remainingLabel: "Retry billing status to confirm current storage usage, live storage quota, and remaining capacity.",
    };
  }

  if (!hasRecognizedPlan && (!hasQuotaBytes || !hasRemainingBytes)) {
    return {
      usedLabel: byteCountLabel(billing?.storage_used_bytes),
      remainingLabel: "Retry billing status to confirm live storage quota and remaining capacity.",
    };
  }

  if (!hasRemainingBytes) {
    return {
      usedLabel: byteCountLabel(billing?.storage_used_bytes),
      remainingLabel: "Retry billing status to confirm live remaining capacity.",
    };
  }

  if (!hasQuotaBytes) {
    return {
      usedLabel: byteCountLabel(billing?.storage_used_bytes),
      remainingLabel: "Retry billing status to confirm live storage quota.",
    };
  }

  const quotaBytes = billing?.storage_quota_bytes ?? 0;
  const usedBytes = billing?.storage_used_bytes ?? 0;
  const remainingBytes = billing?.storage_remaining_bytes ?? 0;

  return {
    usedLabel: byteCountLabel(usedBytes),
    remainingLabel: `${byteCountLabel(remainingBytes)} of ${byteCountLabel(quotaBytes)}`,
  };
}

export function buildBillingUpgradeRequestBody(
  billing: BillingStatusLike | null | undefined,
  userEmail: string | null | undefined,
): string {
  const storageSnapshot = resolveStorageSnapshot(billing);

  return [
    "Hello OmnyID team,",
    "",
    "I want to request a workspace plan upgrade.",
    "",
    `Account email: ${userEmail?.trim() || "unknown"}`,
    `Current plan: ${formatPlan(billing?.plan)}`,
    `Current billing status: ${formatBillingStatus(billing?.status)}`,
    `Suggested next upgrade: ${formatSuggestedUpgrade(billing?.plan)}`,
    `Storage used: ${storageSnapshot.usedLabel}`,
    `Storage remaining: ${storageSnapshot.remainingLabel}`,
    `Quota state: ${formatQuotaState(billing?.quota_state)}`,
    "",
    "Requested change:",
    "- Please contact me with the next available upgrade path for this workspace.",
  ].join("\n");
}

export function buildBillingUpgradeMailtoHref(
  billing: BillingStatusLike | null | undefined,
  userEmail: string | null | undefined,
): string {
  const subject = "OmnyID workspace upgrade request";
  const body = buildBillingUpgradeRequestBody(billing, userEmail);
  return `mailto:${BILLING_UPGRADE_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
