// @locs-version: 1.0
export const RESPONSE_QUEUE_SOUND_KEY = "omnyid.rq.sound";

export function loadResponseQueueSoundEnabled(): boolean {
  try {
    const stored = localStorage.getItem(RESPONSE_QUEUE_SOUND_KEY);
    if (stored === "1") return true;
    if (stored !== null && stored !== "0") localStorage.setItem(RESPONSE_QUEUE_SOUND_KEY, "0");
    return false;
  } catch {
    return false;
  }
}

export function saveResponseQueueSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(RESPONSE_QUEUE_SOUND_KEY, enabled ? "1" : "0");
  } catch {
    // ignore storage failures
  }
}
