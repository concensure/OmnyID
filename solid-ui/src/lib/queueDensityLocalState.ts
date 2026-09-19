// @locs-version: 1.0
// @module-id: queue-density-local-state
// @primary-capability: queue-density-preferences
// @stability: beta
export type QueueDensity = "comfortable" | "compact";

export const DECISION_QUEUE_DENSITY_KEY = "omnyid.decision-queue.density";
export const RESPONSE_QUEUE_DENSITY_KEY = "omnyid.response-queue.density";

function normalizeQueueDensity(value: unknown): QueueDensity {
  return value === "compact" ? "compact" : "comfortable";
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
    return "comfortable";
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
