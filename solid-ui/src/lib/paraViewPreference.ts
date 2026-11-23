// @locs-version: 1.0
import { customEventRecordDetail } from "@/lib/eventDetail";
import type { ViewName } from "@/lib/viewNames";

export const PARA_VIEW_PREFERENCE_KEY = "omnyid.para.enabled";

export const PARA_VIEW_PREFERENCE_CHANGED_EVENT = "omnyid:para-view-preference-changed";
export type ParaViewPreferenceChangedEventDetail = { enabled: boolean };

export function loadParaViewPreference(): boolean {
  try {
    const stored = localStorage.getItem(PARA_VIEW_PREFERENCE_KEY);
    if (stored === "0") return false;
    if (stored === "1") return true;
    if (stored !== null) localStorage.setItem(PARA_VIEW_PREFERENCE_KEY, "1");
  } catch {
    // Ignore storage read failures and keep the default enabled state.
  }
  return true;
}

export function saveParaViewPreference(enabled: boolean): void {
  try {
    localStorage.setItem(PARA_VIEW_PREFERENCE_KEY, enabled ? "1" : "0");
  } catch {
    // Ignore storage write failures so the UI can still react locally.
  }
  window.dispatchEvent(
    new CustomEvent(PARA_VIEW_PREFERENCE_CHANGED_EVENT, {
      detail: { enabled } satisfies ParaViewPreferenceChangedEventDetail,
    }),
  );
}

export function readParaViewPreferenceEventDetail(event: Event): boolean | null {
  const detail = customEventRecordDetail(event);
  const enabled = detail?.enabled;
  return typeof enabled === "boolean" ? enabled : null;
}

export function subscribeParaViewPreference(
  callback: (enabled: boolean) => void,
  target: Window = window,
): () => void {
  const syncFromStorage = () => callback(loadParaViewPreference());
  const handlePreferenceChange = (event: Event) => {
    const enabled = readParaViewPreferenceEventDetail(event);
    if (enabled === null) {
      syncFromStorage();
      return;
    }
    callback(enabled);
  };
  const handleStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== PARA_VIEW_PREFERENCE_KEY) return;
    syncFromStorage();
  };
  target.addEventListener(PARA_VIEW_PREFERENCE_CHANGED_EVENT, handlePreferenceChange);
  target.addEventListener("storage", handleStorage);
  return () => {
    target.removeEventListener(PARA_VIEW_PREFERENCE_CHANGED_EVENT, handlePreferenceChange);
    target.removeEventListener("storage", handleStorage);
  };
}

export function normalizeParaViewSelection(view: ViewName, paraViewEnabled: boolean): ViewName {
  return !paraViewEnabled && view === "para" ? "home" : view;
}
