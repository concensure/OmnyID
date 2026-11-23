// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";

export function afpRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function afpOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

export function afpStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
