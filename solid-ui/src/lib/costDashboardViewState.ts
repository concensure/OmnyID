// @locs-version: 1.0
const COST_DASHBOARD_TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function costDashboardMountedDateTimeLabel(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) return null;
  return COST_DASHBOARD_TIMESTAMP_FORMATTER.format(new Date(timestamp));
}

export function costDashboardPlanLabel(plan: string | null | undefined): string {
  const raw = String(plan || "free").trim();
  if (!raw) return "Free";
  return raw.split(/[_\s-]+/).filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function costDashboardWarningText(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function costDashboardHasFiniteBytes(value: number | null | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
