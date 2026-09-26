// @locs-version: 1.0
import {
  customEventDetail,
  customEventRecordDetail,
  isCustomEvent,
  optionalStringProperty,
} from "@/lib/eventDetail";

export const DASHBOARD_REFRESH_EVENT = "omnyid:dashboard-refresh";

export type DashboardRefreshEventDetail = {
  reason?: string;
};

export function dispatchDashboardRefreshEvent(
  detail?: DashboardRefreshEventDetail,
  target: Window = window,
): void {
  target.dispatchEvent(
    new CustomEvent(DASHBOARD_REFRESH_EVENT, {
      detail: detail ?? {},
    }),
  );
}

export function readDashboardRefreshEventDetail(
  event: Event,
): DashboardRefreshEventDetail | null {
  if (!isCustomEvent(event)) return null;
  const detail = customEventDetail(event);
  if (detail == null) return {};
  const record = customEventRecordDetail(event);
  if (!record) return null;
  const reason = optionalStringProperty(record, "reason");
  return reason !== null
    ? { ...(typeof reason === "string" ? { reason } : {}) }
    : null;
}

export function subscribeDashboardRefreshEvent(
  callback: (detail: DashboardRefreshEventDetail) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const detail = readDashboardRefreshEventDetail(event);
    if (!detail) return;
    callback(detail);
  };
  target.addEventListener(DASHBOARD_REFRESH_EVENT, handler);
  return () => target.removeEventListener(DASHBOARD_REFRESH_EVENT, handler);
}
