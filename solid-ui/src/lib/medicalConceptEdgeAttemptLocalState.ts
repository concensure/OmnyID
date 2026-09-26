// @locs-version: 1.0
import { parseJsonValue } from "@/lib/jsonParseState";

export const MEDICAL_CONCEPT_EDGE_ATTEMPTS_KEY = "omnyid.medical-concept-edge-attempts";
export const MEDICAL_CONCEPT_EDGE_ATTEMPT_SAVED_EVENT = "omnyid:medical-concept-edge-attempt-saved";
const MAX_MEDICAL_CONCEPT_EDGE_ATTEMPTS = 160;

export type MedicalConceptEdgeAttempt = {
  id: string;
  relationshipId: string;
  courseTag: string | null;
  totalItems: number;
  correctItems: number;
  source: "focused_screen" | "report_followup" | "manual";
  createdAt: number;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullable(value: unknown): string | null {
  const normalized = clean(value);
  return normalized ? normalized : null;
}

function normalizeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeSource(value: unknown): MedicalConceptEdgeAttempt["source"] {
  return value === "focused_screen" || value === "report_followup" ? value : "manual";
}

export function normalizeMedicalConceptEdgeAttempt(value: unknown): MedicalConceptEdgeAttempt | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const relationshipId = clean(record.relationshipId);
  const totalItems = normalizeCount(record.totalItems);
  const correctItems = Math.min(normalizeCount(record.correctItems), totalItems);
  const createdAt = typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
    ? record.createdAt
    : Date.now();
  if (!relationshipId || totalItems <= 0) return null;
  return {
    id: clean(record.id) || `medical-edge-attempt:${relationshipId}:${createdAt}`,
    relationshipId,
    courseTag: cleanNullable(record.courseTag),
    totalItems,
    correctItems,
    source: normalizeSource(record.source),
    createdAt,
  };
}

export function normalizeMedicalConceptEdgeAttempts(value: unknown): MedicalConceptEdgeAttempt[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const attempts: MedicalConceptEdgeAttempt[] = [];
  for (const entry of value) {
    const attempt = normalizeMedicalConceptEdgeAttempt(entry);
    if (!attempt || seen.has(attempt.id)) continue;
    seen.add(attempt.id);
    attempts.push(attempt);
  }
  return attempts
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_MEDICAL_CONCEPT_EDGE_ATTEMPTS);
}

export function loadMedicalConceptEdgeAttempts(storage: Storage = localStorage): MedicalConceptEdgeAttempt[] {
  const raw = storage.getItem(MEDICAL_CONCEPT_EDGE_ATTEMPTS_KEY);
  if (!raw) return [];
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    storage.removeItem(MEDICAL_CONCEPT_EDGE_ATTEMPTS_KEY);
    return [];
  }
  const attempts = normalizeMedicalConceptEdgeAttempts(parsed.value);
  if (attempts.length === 0) storage.removeItem(MEDICAL_CONCEPT_EDGE_ATTEMPTS_KEY);
  else storage.setItem(MEDICAL_CONCEPT_EDGE_ATTEMPTS_KEY, JSON.stringify(attempts));
  return attempts;
}

export function saveMedicalConceptEdgeAttempt(
  attempt: MedicalConceptEdgeAttempt,
  storage: Storage = localStorage,
): MedicalConceptEdgeAttempt {
  const normalized = normalizeMedicalConceptEdgeAttempt(attempt) ?? attempt;
  const existing = loadMedicalConceptEdgeAttempts(storage).filter((item) => item.id !== normalized.id);
  const next = normalizeMedicalConceptEdgeAttempts([normalized, ...existing]);
  storage.setItem(MEDICAL_CONCEPT_EDGE_ATTEMPTS_KEY, JSON.stringify(next));
  return next.find((item) => item.id === normalized.id) ?? normalized;
}

export function buildMedicalConceptEdgeAttempt(input: {
  relationshipId: string;
  totalItems: number;
  correctItems?: number | null;
  courseTag?: string | null;
  source?: MedicalConceptEdgeAttempt["source"] | null;
  now?: number;
}): MedicalConceptEdgeAttempt | null {
  return normalizeMedicalConceptEdgeAttempt({
    id: `medical-edge-attempt:${input.relationshipId}:${input.now ?? Date.now()}`,
    relationshipId: input.relationshipId,
    totalItems: input.totalItems,
    correctItems: input.correctItems ?? 0,
    courseTag: input.courseTag ?? null,
    source: input.source ?? "manual",
    createdAt: input.now ?? Date.now(),
  });
}

export function emitMedicalConceptEdgeAttemptSaved(attempt: MedicalConceptEdgeAttempt): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(MEDICAL_CONCEPT_EDGE_ATTEMPT_SAVED_EVENT, { detail: attempt }));
}
