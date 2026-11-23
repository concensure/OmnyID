// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import {
  buildWeddingPreferenceConflictState,
  type WeddingPreferenceConflictState,
  type WeddingPreferenceInput,
} from "@/lib/weddingPreferenceConflictState";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

type ConstraintStatus = "confirmed" | "removed" | "superseded";

type ClosedPreference = {
  constraintId: string;
  subjectId: string;
  decisionArea: string;
  preferenceLabel: string;
  underlyingValue: string;
  status: ConstraintStatus;
  supersedes: string | null;
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, limit = 180): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, limit) : "";
}

function closedIdentifier(value: unknown): string {
  const candidate = text(value, 120).toLowerCase();
  return /^[a-z][a-z0-9_.:-]{0,119}$/.test(candidate) ? candidate : "";
}

function displayIdentifier(value: string): string {
  return value
    .replace(/^wedding[_.:-]/, "")
    .replace(/[_.:-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .slice(0, 80);
}

function opaquePersonId(value: unknown): string {
  const candidate = text(value, 180);
  const suffix = candidate.startsWith("person:") ? candidate.slice(7) : "";
  return suffix.length >= 8 && /^[a-z0-9_.:-]+$/.test(suffix) && /[0-9_-]/.test(suffix)
    ? candidate
    : "";
}

function closedValue(
  kind: string,
  value: Record<string, unknown>,
): { decisionArea: string; preferenceLabel: string; underlyingValue: string } | null {
  const valueType = text(value.type, 40);
  if (kind === "attendance_requirement" && valueType === "integer") {
    const count = value.value;
    if (!Number.isSafeInteger(count) || (count as number) < 1 || (count as number) > 5_000) return null;
    return {
      decisionArea: "guest count",
      preferenceLabel: `${count} guests`,
      underlyingValue: `${count} guests`,
    };
  }
  if (!["aesthetic_preference", "category_priority"].includes(kind) || valueType !== "enum") return null;
  const choice = closedIdentifier(value.value);
  const vocabulary = closedIdentifier(value.vocabulary);
  if (!choice || !vocabulary) return null;
  const area = kind === "aesthetic_preference"
    ? `wedding ${displayIdentifier(vocabulary) || "style"}`
    : `${displayIdentifier(vocabulary) || "category"} priority`;
  return {
    decisionArea: area,
    preferenceLabel: displayIdentifier(choice),
    underlyingValue: displayIdentifier(choice).toLowerCase(),
  };
}

function constraintFromMessage(message: AfpMessage, planId: string): ClosedPreference | null {
  if (message.kind !== "planning_constraint" || message.subtype !== "planning_constraint" || message.type !== "ledger") return null;
  const envelope = record(message.content);
  const constraint = record(envelope?.constraint);
  const subject = record(constraint?.subject_ref);
  const sourceAnchor = record(constraint?.source_anchor);
  const value = record(constraint?.value);
  const metadata = record(message.metadata);
  const constraintId = text(constraint?.constraint_id);
  const subjectId = subject?.kind === "person" ? opaquePersonId(subject.id) : "";
  const kind = text(constraint?.kind, 60);
  const operator = text(constraint?.operator, 40);
  const status = text(constraint?.status, 30) as ConstraintStatus;
  const observedAt = text(constraint?.observed_at, 64);
  const messageAt = Date.parse(message.timestamp);
  if (envelope?.schema_version !== "planning.constraint_ledger_message.v1"
    || constraint?.schema_version !== "planning.constraint.v1"
    || text(constraint?.plan_id) !== planId
    || text(metadata?.plan_id) !== planId
    || metadata?.privacy_scope !== "tenant_private"
    || metadata?.e2ee_required !== true
    || !/^[a-f0-9]{64}$/i.test(text(metadata?.payload_fingerprint, 64))
    || !message.from.startsWith("user://")
    || metadata?.store !== true
    || constraint?.privacy !== "couple_private"
    || constraint?.authority !== "user"
    || text(constraint?.template_id) !== "wedding_planner"
    || ((kind === "attendance_requirement" && !["prefers", "limits"].includes(operator))
      || (["aesthetic_preference", "category_priority"].includes(kind) && operator !== "prefers"))
    || !["confirmed", "removed", "superseded"].includes(status)
    || !constraintId
    || !subjectId
    || !value
    || !sourceAnchor
    || !text(sourceAnchor.message_id)
    || text(constraint?.source_ref) !== text(sourceAnchor.message_id)
    || !text(sourceAnchor.locator, 500)
    || !text(sourceAnchor.exact_excerpt, 2_000)
    || !observedAt
    || !Number.isFinite(Date.parse(observedAt))
    || !Number.isFinite(messageAt)
    || Math.abs(Date.parse(observedAt) - messageAt) > 1) return null;
  const preference = closedValue(kind, value);
  if (!preference) return null;
  return {
    constraintId,
    subjectId,
    ...preference,
    status,
    supersedes: text(constraint?.supersedes) || null,
  };
}

function currentPreferences(messages: readonly AfpMessage[], planId: string): ClosedPreference[] {
  const byId = new Map<string, ClosedPreference>();
  const invalidIds = new Set<string>();
  for (const message of messages) {
    const preference = constraintFromMessage(message, planId);
    if (!preference) continue;
    const previous = byId.get(preference.constraintId);
    if (previous && JSON.stringify(previous) !== JSON.stringify(preference)) invalidIds.add(preference.constraintId);
    else byId.set(preference.constraintId, preference);
  }
  const superseded = new Set(
    [...byId.values()].flatMap((preference) => preference.supersedes ? [preference.supersedes] : []),
  );
  return [...byId.values()].filter((preference) =>
    !invalidIds.has(preference.constraintId)
    && preference.status === "confirmed"
    && !superseded.has(preference.constraintId)
  );
}

export function buildWeddingPreferenceConflictsFromConstraintMessages(input: {
  messages?: readonly AfpMessage[] | null;
  metadata?: unknown;
}): WeddingPreferenceConflictState[] {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const preferences = currentPreferences(input.messages ?? [], metadata.weddingPlanId);
  const byArea = new Map<string, ClosedPreference[]>();
  for (const preference of preferences) {
    const area = byArea.get(preference.decisionArea) ?? [];
    area.push(preference);
    byArea.set(preference.decisionArea, area);
  }
  const states: WeddingPreferenceConflictState[] = [];
  for (const [decisionArea, values] of [...byArea.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const byPerson = new Map<string, ClosedPreference[]>();
    for (const value of values) byPerson.set(value.subjectId, [...(byPerson.get(value.subjectId) ?? []), value]);
    if (byPerson.size < 2 || [...byPerson.values()].some((items) => items.length !== 1)) continue;
    const inputs: WeddingPreferenceInput[] = [...byPerson.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([subjectId, [value]], index) => ({
        sourceRef: value!.constraintId,
        personId: subjectId,
        personLabel: `Partner ${index + 1}`,
        decisionArea,
        preferenceLabel: value!.preferenceLabel,
        underlyingValue: value!.underlyingValue,
        privateRationaleCiphertext: null,
      }));
    const state = buildWeddingPreferenceConflictState({ metadata, decisionArea, preferences: inputs });
    if (state.status === "conflict" && state.conflictObject) states.push(state);
  }
  return states;
}
