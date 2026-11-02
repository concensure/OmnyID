// @locs-version: 1.0
// @module-id: queue-density-local-state
// @primary-capability: queue-density-preferences
// @stability: beta
export type QueueDensity = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";

export const DECISION_QUEUE_DENSITY_KEY = "omnyid.decision-queue.density";
export const RESPONSE_QUEUE_DENSITY_KEY = "omnyid.response-queue.density";
export const DEFAULT_QUEUE_DENSITY: QueueDensity = "7";

function normalizeQueueDensity(value: unknown): QueueDensity {
  if (value === "compact") return "3";
  if (value === "comfortable") return DEFAULT_QUEUE_DENSITY;
  const normalized = typeof value === "number" ? String(Math.round(value)) : String(value ?? "").trim();
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"].includes(normalized)
    ? normalized as QueueDensity
    : DEFAULT_QUEUE_DENSITY;
}

function loadQueueDensity(key: string): QueueDensity {
  try {
    const raw = localStorage.getItem(key);
    const normalized = normalizeQueueDensity(raw);
    if (raw !== null && raw !== normalized) {
      localStorage.setItem(key, normalized);
    }
    return normalized;
  } catch {
    return DEFAULT_QUEUE_DENSITY;
  }
}

function saveQueueDensity(key: string, density: QueueDensity): void {
  try {
    localStorage.setItem(key, normalizeQueueDensity(density));
  } catch {
    // ignore storage failures
  }
}

export function loadDecisionQueueDensity(): QueueDensity {
  return loadQueueDensity(DECISION_QUEUE_DENSITY_KEY);
}

export function saveDecisionQueueDensity(density: QueueDensity): void {
  saveQueueDensity(DECISION_QUEUE_DENSITY_KEY, density);
}

export function loadResponseQueueDensity(): QueueDensity {
  return loadQueueDensity(RESPONSE_QUEUE_DENSITY_KEY);
}

export function saveResponseQueueDensity(density: QueueDensity): void {
  saveQueueDensity(RESPONSE_QUEUE_DENSITY_KEY, density);
}

export function queueDensityLevel(density: QueueDensity): number {
  return Number(normalizeQueueDensity(density));
}

export function queueFontSizeRootPx(density: QueueDensity): number {
  const level = queueDensityLevel(density);
  return 14 + ((level - 1) * 5) / 9;
}

export function applyQueueFontSize(density: QueueDensity): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--base-font-size", `${queueFontSizeRootPx(density).toFixed(2)}px`);
}

export function queueDensityIsCompact(density: QueueDensity): boolean {
  return queueDensityLevel(density) <= 4;
}
