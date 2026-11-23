// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import { parseJsonValue } from "@/lib/jsonParseState";
import type { CapabilityDescriptor } from "@/lib/api";

export type CapabilityImportDescriptor = Omit<CapabilityDescriptor, "id" | "created_at">;

const APPROVAL_MODES = new Set<CapabilityDescriptor["approval_mode"]>([
  "autonomous",
  "suggest_only",
  "human_approval_required",
]);

function trimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(trimmedString).filter((entry): entry is string => Boolean(entry));
}

function approvalMode(value: unknown): CapabilityDescriptor["approval_mode"] {
  return typeof value === "string" && APPROVAL_MODES.has(value as CapabilityDescriptor["approval_mode"])
    ? value as CapabilityDescriptor["approval_mode"]
    : "suggest_only";
}

function parseCapabilityImportDescriptor(value: unknown): CapabilityImportDescriptor | null {
  if (!isRecord(value)) return null;

  const name = trimmedString(value.name);
  const description = trimmedString(value.description);
  if (!name || !description || !isRecord(value.input_schema)) return null;

  return {
    name,
    description,
    input_schema: value.input_schema,
    output_schema: isRecord(value.output_schema) ? value.output_schema : null,
    version: trimmedString(value.version) ?? "1.0.0",
    tags: stringArray(value.tags),
    approval_mode: approvalMode(value.approval_mode),
    enabled: typeof value.enabled === "boolean" ? value.enabled : undefined,
  };
}

export function parseCapabilityImportFile(text: string): CapabilityImportDescriptor[] {
  const parsed = parseJsonValue(text);
  if (!parsed.ok) {
    throw new Error("Expected valid JSON");
  }

  if (!Array.isArray(parsed.value)) throw new Error("Expected a JSON array");

  const normalized = parsed.value.map(parseCapabilityImportDescriptor);
  if (normalized.some((entry) => entry === null)) {
    throw new Error("Each capability must include a name, description, and input_schema object");
  }

  return normalized.filter((entry): entry is CapabilityImportDescriptor => entry !== null);
}
