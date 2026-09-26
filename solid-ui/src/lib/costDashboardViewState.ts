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
