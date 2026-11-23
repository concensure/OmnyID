// @locs-version: 1.0
export type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false };

export function parseJsonValue(raw: string): JsonParseResult {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch {
    return { ok: false };
  }
}

export function parseJsonValueOr(raw: string | null | undefined, fallback: unknown): unknown {
  if (raw === null || typeof raw === "undefined") return fallback;
  const parsed = parseJsonValue(raw);
  return parsed.ok ? parsed.value : fallback;
}
