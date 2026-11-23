// @locs-version: 1.0
type UsageStorageBillingLike = {
  plan?: string | null;
  storage_used_bytes?: number;
  storage_remaining_bytes?: number;
  storage_quota_bytes?: number;
  max_single_upload_bytes?: number;
};

function hasMountedFiniteBytes(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function hasRecognizedPlanMetadata(plan: string | null | undefined): boolean {
  const normalized = String(plan ?? "").trim().toLowerCase();
  return normalized === "free" || normalized === "trial" || normalized === "starter_free" || normalized === "paid";
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

function gigabytePlanLabel(bytes: number) {
  const gigabytes = bytes / (1024 * 1024 * 1024);
  if (!Number.isFinite(gigabytes) || gigabytes <= 0) return "0 GB plan";
  return `${Number.isInteger(gigabytes) ? gigabytes.toFixed(0) : gigabytes.toFixed(1)} GB plan`;
}

function formatPlan(plan: string | null | undefined) {
  const raw = String(plan ?? "").trim();
  if (!raw) return "Plan metadata unavailable";
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function readUsageStorageTierLabel(billing: UsageStorageBillingLike | null | undefined): string {
  if (!billing) {
    return "Billing status unavailable";
  }

  if (!String(billing.plan ?? "").trim()) {
    return "Plan metadata unavailable";
  }

  const hasRecognizedPlan = hasRecognizedPlanMetadata(billing.plan);
  const hasQuotaBytes = hasMountedFiniteBytes(billing.storage_quota_bytes);

  if (!hasRecognizedPlan && !hasQuotaBytes) {
    return "Storage tier unavailable";
  }

  if (!hasQuotaBytes) {
    return "Retry billing status to confirm live storage quota before trusting this tier summary.";
  }

  const quotaBytes = billing.storage_quota_bytes!;
  const quotaLabel = gigabytePlanLabel(quotaBytes);
  if (!hasRecognizedPlan) {
    return `Plan metadata unavailable | ${quotaLabel}`;
  }

  return `${formatPlan(billing.plan)} | ${quotaLabel}`;
}

export function readUsageStorageDetail(billing: UsageStorageBillingLike | null | undefined): string {
  if (!billing) {
    return "Retry billing status to confirm storage quota, remaining capacity, and upload limits.";
  }

  if (!String(billing.plan ?? "").trim()) {
    return "Retry billing status to confirm storage quota, remaining capacity, and upload limits.";
  }

  const hasRecognizedPlan = hasRecognizedPlanMetadata(billing.plan);
  const hasQuotaBytes = hasMountedFiniteBytes(billing.storage_quota_bytes);
  const hasRemainingBytes = hasMountedFiniteBytes(billing.storage_remaining_bytes);
  const hasUsedBytes = hasMountedFiniteBytes(billing.storage_used_bytes);
  const hasUploadBytes = hasMountedFiniteBytes(billing.max_single_upload_bytes);

  if (!hasRecognizedPlan && (!hasQuotaBytes || !hasUploadBytes)) {
    return "Retry billing status to confirm live storage quota, remaining capacity, and upload limits before trusting this storage summary.";
  }

  if (!hasQuotaBytes || !hasUploadBytes) {
    return "Retry billing status to confirm storage quota, remaining capacity, and upload limits.";
  }

  if (!hasUsedBytes || !hasRemainingBytes) {
    return "Retry billing status to confirm current storage usage, remaining capacity, and upload limits.";
  }

  return `${byteCountLabel(billing.storage_remaining_bytes)} remaining of ${byteCountLabel(billing.storage_quota_bytes)}. Max single upload ${byteCountLabel(billing.max_single_upload_bytes)}.`;
}
