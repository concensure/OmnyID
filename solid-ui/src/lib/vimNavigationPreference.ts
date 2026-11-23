// @locs-version: 1.0
import { customEventRecordDetail } from "@/lib/eventDetail";

export const VIM_NAVIGATION_PREFERENCE_KEY = "omnyid.keyboard.vim_navigation";
export const VIM_NAVIGATION_PREFERENCE_EVENT = "omnyid:keyboard-vim-navigation";
export type VimNavigationPreferenceEventDetail = { enabled: boolean };

export function loadVimNavigationEnabled(): boolean {
  try {
    const stored = localStorage.getItem(VIM_NAVIGATION_PREFERENCE_KEY);
    if (stored === "1") return true;
    if (stored !== null && stored !== "0") localStorage.setItem(VIM_NAVIGATION_PREFERENCE_KEY, "0");
    return false;
  } catch {
    return false;
  }
}

export function saveVimNavigationEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(VIM_NAVIGATION_PREFERENCE_KEY, enabled ? "1" : "0");
  } catch {
    // ignore local storage write failures
  }
  window.dispatchEvent(
    new CustomEvent(VIM_NAVIGATION_PREFERENCE_EVENT, {
      detail: { enabled } satisfies VimNavigationPreferenceEventDetail,
    }),
  );
}

export function readVimNavigationPreferenceEventDetail(event: Event): boolean | null {
  const detail = customEventRecordDetail(event);
  return typeof detail?.enabled === "boolean" ? detail.enabled : null;
}

export function subscribeVimNavigationPreference(
  callback: (enabled: boolean) => void,
  target: Window = window,
): () => void {
  const handler = (event: Event) => {
    const enabled = readVimNavigationPreferenceEventDetail(event);
    if (enabled === null) return;
    callback(enabled);
  };
  target.addEventListener(VIM_NAVIGATION_PREFERENCE_EVENT, handler);
  return () => target.removeEventListener(VIM_NAVIGATION_PREFERENCE_EVENT, handler);
}
