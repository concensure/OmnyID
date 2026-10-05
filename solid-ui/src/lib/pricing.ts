// @locs-version: 1.0
export type PlanId = "free" | "paid";

export type StoragePlan = {
  id: PlanId;
  label: string;
  monthlyPriceUsd: number;
  storageQuotaGb: number;
  maxUploadMb: number;
};

export const STORAGE_PLANS: Record<PlanId, StoragePlan> = {
  free: {
    id: "free",
    label: "Free",
    monthlyPriceUsd: 0,
    storageQuotaGb: 1,
    maxUploadMb: 25,
  },
  paid: {
    id: "paid",
    label: "Paid",
    monthlyPriceUsd: 20,
    storageQuotaGb: 2,
    maxUploadMb: 100,
  },
};

export const STORAGE_ADDON = {
  label: "Additional storage",
  monthlyPriceUsd: 10,
  storageQuotaGb: 10,
};

export function hasRecognizedPlanMetadata(plan: string | null | undefined): boolean {
  const raw = String(plan ?? "").trim().toLowerCase();
  return raw === "free" || raw === "trial" || raw === "starter_free" || raw === "paid";
}

export function normalizePlanId(plan: string | null | undefined): PlanId {
  const raw = String(plan ?? "").trim().toLowerCase();
  if (!raw || raw === "free" || raw === "trial" || raw === "starter_free") return "free";
  return "paid";
}

export function formatUsdPerMonth(priceUsd: number): string {
  return `$${priceUsd.toFixed(0)}/mo`;
}

export function nextStorageUpgradeLabel(plan: string | null | undefined): string {
  const normalized = normalizePlanId(plan);
  if (normalized === "free") {
    return `${STORAGE_PLANS.paid.label} - ${STORAGE_PLANS.paid.storageQuotaGb} GB for ${formatUsdPerMonth(STORAGE_PLANS.paid.monthlyPriceUsd)}`;
  }
  return `${STORAGE_ADDON.label} - +${STORAGE_ADDON.storageQuotaGb} GB for ${formatUsdPerMonth(STORAGE_ADDON.monthlyPriceUsd)}`;
}
