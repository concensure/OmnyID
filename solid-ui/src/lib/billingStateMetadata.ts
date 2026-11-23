// @locs-version: 1.0
const RECOGNIZED_BILLING_STATUSES = new Set(["active", "past_due"]);
const RECOGNIZED_QUOTA_STATES = new Set(["ok", "exceeded"]);

export function hasRecognizedBillingStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return RECOGNIZED_BILLING_STATUSES.has(normalized);
}

export function hasRecognizedQuotaState(state: string | null | undefined): boolean {
  const normalized = String(state ?? "").trim().toLowerCase();
  return RECOGNIZED_QUOTA_STATES.has(normalized);
}
