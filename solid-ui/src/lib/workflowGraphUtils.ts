// @locs-version: 1.0
import { parseJsonValue } from "@/lib/jsonParseState";

export function cloneJson<T>(value: T): T {
  const parsed = parseJsonValue(JSON.stringify(value));
  if (!parsed.ok) {
    throw new TypeError("Unable to clone JSON value");
  }
  return parsed.value as T;
}

export function makeId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
