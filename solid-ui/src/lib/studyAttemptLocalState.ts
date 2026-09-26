// @locs-version: 1.0
import { parseJsonValue } from "@/lib/jsonParseState";

export const STUDY_ATTEMPTS_KEY = "omnyid.study-attempts";
export const STUDY_ATTEMPT_SAVED_EVENT = "omnyid:study-attempt-saved";
const MAX_STUDY_ATTEMPTS = 80;

export type StudyAttemptMode = "flashcards" | "quiz" | "exam";

export type StudyAttempt = {
  id: string;
  mode: StudyAttemptMode;
  title: string;
  artifactId: string | null;
  courseTag: string | null;
  totalItems: number;
  correctItems: number;
  durationSeconds: number | null;
  source: "manual" | "focused_screen";
  createdAt: number;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullable(value: unknown): string | null {
  const normalized = clean(value);
  return normalized ? normalized : null;
}

function normalizeMode(value: unknown): StudyAttemptMode | null {
  if (value === "flashcards" || value === "quiz" || value === "exam") return value;
  return null;
}

function normalizeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeDuration(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function normalizeSource(value: unknown): StudyAttempt["source"] {
  return value === "focused_screen" ? "focused_screen" : "manual";
}

export function normalizeStudyAttempt(value: unknown): StudyAttempt | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const mode = normalizeMode(record.mode);
  const title = clean(record.title);
  const totalItems = normalizeCount(record.totalItems);
  const correctItems = Math.min(normalizeCount(record.correctItems), totalItems);
  const createdAt = typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
    ? record.createdAt
    : Date.now();

  if (!mode || !title || totalItems <= 0) return null;

  return {
    id: clean(record.id) || `${mode}:${title}:${createdAt}`,
    mode,
    title,
    artifactId: cleanNullable(record.artifactId),
    courseTag: cleanNullable(record.courseTag),
    totalItems,
    correctItems,
    durationSeconds: normalizeDuration(record.durationSeconds),
    source: normalizeSource(record.source),
    createdAt,
  };
}

export function normalizeStudyAttempts(value: unknown): StudyAttempt[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const attempts: StudyAttempt[] = [];
  for (const entry of value) {
    const attempt = normalizeStudyAttempt(entry);
    if (!attempt || seen.has(attempt.id)) continue;
    seen.add(attempt.id);
    attempts.push(attempt);
  }
  return attempts
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_STUDY_ATTEMPTS);
}

export function loadStudyAttempts(storage: Storage = localStorage): StudyAttempt[] {
  const raw = storage.getItem(STUDY_ATTEMPTS_KEY);
  if (!raw) return [];
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    storage.removeItem(STUDY_ATTEMPTS_KEY);
    return [];
  }
  const attempts = normalizeStudyAttempts(parsed.value);
  if (attempts.length === 0) storage.removeItem(STUDY_ATTEMPTS_KEY);
  else storage.setItem(STUDY_ATTEMPTS_KEY, JSON.stringify(attempts));
  return attempts;
}

export function saveStudyAttempt(attempt: StudyAttempt, storage: Storage = localStorage): StudyAttempt {
  const normalized = normalizeStudyAttempt(attempt) ?? attempt;
  const existing = loadStudyAttempts(storage).filter((item) => item.id !== normalized.id);
  const next = normalizeStudyAttempts([normalized, ...existing]);
  storage.setItem(STUDY_ATTEMPTS_KEY, JSON.stringify(next));
  return next.find((item) => item.id === normalized.id) ?? normalized;
}

export function buildManualStudyAttempt(input: {
  mode: StudyAttemptMode;
  title?: string | null;
  totalItems: number;
  correctItems?: number | null;
  durationSeconds?: number | null;
  artifactId?: string | null;
  courseTag?: string | null;
  now?: number;
}): StudyAttempt | null {
  const mode = normalizeMode(input.mode);
  const totalItems = normalizeCount(input.totalItems);
  if (!mode || totalItems <= 0) return null;
  const correctItems = Math.min(normalizeCount(input.correctItems ?? 0), totalItems);
  const createdAt = input.now ?? Date.now();
  const title = clean(input.title) || (
    mode === "flashcards" ? "Flashcard review"
      : mode === "quiz" ? "Quiz attempt"
        : "Exam attempt"
  );
  return {
    id: `manual:${mode}:${createdAt}`,
    mode,
    title,
    artifactId: cleanNullable(input.artifactId),
    courseTag: cleanNullable(input.courseTag),
    totalItems,
    correctItems,
    durationSeconds: normalizeDuration(input.durationSeconds),
    source: "manual",
    createdAt,
  };
}

export function emitStudyAttemptSaved(attempt: StudyAttempt): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STUDY_ATTEMPT_SAVED_EVENT, { detail: attempt }));
}
