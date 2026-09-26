// @locs-version: 1.0
export function isCustomEvent(event: Event): event is CustomEvent<unknown> {
  return event instanceof CustomEvent;
}

export function customEventDetail(event: Event): unknown | null {
  return isCustomEvent(event) ? event.detail : null;
}

export function customEventRecordDetail(event: Event): Record<string, unknown> | null {
  const detail = customEventDetail(event);
  return detail !== null
    && typeof detail === "object"
    && !Array.isArray(detail)
    ? detail as Record<string, unknown>
    : null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function optionalStringProperty(
  record: Record<string, unknown>,
  key: string,
): string | undefined | null {
  const value = record[key];
  return typeof value === "undefined" || typeof value === "string"
    ? value
    : null;
}

export function optionalNullableStringProperty(
  record: Record<string, unknown>,
  key: string,
): string | null | undefined | false {
  const value = record[key];
  return typeof value === "undefined" || value === null || typeof value === "string"
    ? value
    : false;
}

export function optionalStringArrayProperty(
  record: Record<string, unknown>,
  key: string,
): string[] | undefined | null {
  const value = record[key];
  return typeof value === "undefined"
    || (Array.isArray(value) && value.every((item) => typeof item === "string"))
    ? value
    : null;
}
