// @locs-version: 1.0
export type PlanId = "free" | "paid";

export type StoragePlan = {
  id: PlanId;
  label: string;
  priceAud: number;
  billingCadence: "one_off";
  storageQuotaGb: number;
  maxUploadMb: number;
};

export const STORAGE_PLANS: Record<PlanId, StoragePlan> = {
  free: {
    id: "free",
    label: "Free",
    priceAud: 0,
    billingCadence: "one_off",
    storageQuotaGb: 0.05,
    maxUploadMb: 25,
  },
  paid: {
    id: "paid",
    label: "Paid",
    priceAud: 39,
    billingCadence: "one_off",
    storageQuotaGb: 0.1,
    maxUploadMb: 100,
  },
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

export function formatAudOneOff(priceAud: number): string {
  return `AUD ${priceAud.toFixed(0)} one-off`;
}

export function nextStorageUpgradeLabel(plan: string | null | undefined): string {
  const normalized = normalizePlanId(plan);
  if (normalized === "free") {
  return "OmnyID Wedding - 100 MB for AUD 39 once";
  }
  return "Your OmnyID Wedding upgrade is active (100 MB storage).";
}
