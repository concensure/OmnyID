// @locs-version: 1.0
import { parseJsonValue } from "@/lib/jsonParseState";
import type { ReportKind } from "@/lib/reportGeneratorState";

export const STUDY_DEADLINES_KEY = "omnyid.study-deadlines";
export const STUDY_DEADLINE_SAVED_EVENT = "omnyid:study-deadline-saved";
const MAX_STUDY_DEADLINES = 30;

export type StudyDeadlineKind = "exam" | "assignment" | "quiz" | "class" | "other";
export type StudyDeadlineReviewStatus = "accepted" | "needs_review" | "ignored";

export type StudyDeadline = {
  id: string;
  title: string;
  kind: StudyDeadlineKind;
  courseTag: string | null;
  dueLabel: string;
  dueAt: string | null;
  source: "manual" | "inferred" | "lms" | "calendar";
  providerId?: string | null;
  providerRecordId?: string | null;
  unitTag?: string | null;
  chapterTag?: string | null;
  moduleLabel?: string | null;
  reviewStatus?: StudyDeadlineReviewStatus;
  createdAt: number;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullable(value: unknown): string | null {
  const normalized = clean(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizeKind(value: unknown): StudyDeadlineKind {
  if (value === "exam" || value === "assignment" || value === "quiz" || value === "class" || value === "other") {
    return value;
  }
  return "other";
}

function normalizeSource(value: unknown): StudyDeadline["source"] {
  if (value === "manual" || value === "inferred" || value === "lms" || value === "calendar") return value;
  return "manual";
}

function normalizeReviewStatus(value: unknown, source: StudyDeadline["source"]): StudyDeadlineReviewStatus {
  if (value === "accepted" || value === "needs_review" || value === "ignored") return value;
  return source === "manual" || source === "inferred" || source === "lms" ? "accepted" : "needs_review";
}

function stableIdPart(value: string | null): string {
  return (value ?? "all")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "all";
}

function deadlineKindForReportKind(kind: ReportKind): StudyDeadlineKind {
  switch (kind) {
    case "assignment_plan":
      return "assignment";
    case "quiz_generator":
    case "practice_questions":
      return "quiz";
    case "exam_preparation":
    case "guided_study_session":
      return "exam";
    default:
      return "other";
  }
}

export function normalizeStudyDeadline(value: unknown): StudyDeadline | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const title = clean(record.title);
  const dueLabel = clean(record.dueLabel);
  const createdAt = typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
    ? record.createdAt
    : Date.now();
  if (!title || !dueLabel) return null;
  const source = normalizeSource(record.source);
  return {
    id: clean(record.id) || `${title}:${dueLabel}:${createdAt}`,
    title,
    kind: normalizeKind(record.kind),
    courseTag: cleanNullable(record.courseTag),
    dueLabel,
    dueAt: cleanNullable(record.dueAt),
    source,
    providerId: cleanNullable(record.providerId),
    providerRecordId: cleanNullable(record.providerRecordId),
    unitTag: cleanNullable(record.unitTag),
    chapterTag: cleanNullable(record.chapterTag),
    moduleLabel: cleanNullable(record.moduleLabel),
    reviewStatus: normalizeReviewStatus(record.reviewStatus, source),
    createdAt,
  };
}

export function normalizeStudyDeadlines(value: unknown): StudyDeadline[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeStudyDeadline)
    .filter((deadline): deadline is StudyDeadline => Boolean(deadline))
    .sort((a, b) => {
      if (a.dueAt && b.dueAt && a.dueAt !== b.dueAt) return a.dueAt.localeCompare(b.dueAt);
      if (a.dueAt && !b.dueAt) return -1;
      if (!a.dueAt && b.dueAt) return 1;
      return b.createdAt - a.createdAt;
    })
    .slice(0, MAX_STUDY_DEADLINES);
}

export function loadStudyDeadlines(storage: Storage = localStorage): StudyDeadline[] {
  const raw = storage.getItem(STUDY_DEADLINES_KEY);
  if (!raw) return [];
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    storage.removeItem(STUDY_DEADLINES_KEY);
    return [];
  }
  const deadlines = normalizeStudyDeadlines(parsed.value);
  storage.setItem(STUDY_DEADLINES_KEY, JSON.stringify(deadlines));
  return deadlines;
}

export function saveStudyDeadline(deadline: StudyDeadline, storage: Storage = localStorage): StudyDeadline {
  const normalized = normalizeStudyDeadline(deadline) ?? deadline;
  const loaded = loadStudyDeadlines(storage);
  const existingMatch = loaded.find((item) => item.id === normalized.id);
  const shouldPreserveReviewDecision =
    existingMatch
    && existingMatch.reviewStatus !== "needs_review"
    && normalized.reviewStatus === "needs_review";
  const merged = shouldPreserveReviewDecision
    ? {
      ...normalized,
      reviewStatus: existingMatch.reviewStatus,
      kind: existingMatch.kind,
      courseTag: existingMatch.courseTag ?? normalized.courseTag,
      unitTag: existingMatch.unitTag ?? normalized.unitTag,
      chapterTag: existingMatch.chapterTag ?? normalized.chapterTag,
      moduleLabel: existingMatch.moduleLabel ?? normalized.moduleLabel,
      createdAt: Math.max(existingMatch.createdAt, normalized.createdAt),
    }
    : normalized;
  const existing = loaded.filter((item) => item.id !== normalized.id);
  const next = normalizeStudyDeadlines([merged, ...existing]);
  storage.setItem(STUDY_DEADLINES_KEY, JSON.stringify(next));
  return next.find((item) => item.id === normalized.id) ?? merged;
}

export function updateStudyDeadlineReviewStatus(
  deadlineId: string,
  reviewStatus: StudyDeadlineReviewStatus,
  storage: Storage = localStorage,
): StudyDeadline | null {
  const id = clean(deadlineId);
  if (!id) return null;
  const deadlines = loadStudyDeadlines(storage);
  const existing = deadlines.find((deadline) => deadline.id === id);
  if (!existing) return null;
  const updated = {
    ...existing,
    reviewStatus,
  };
  const next = normalizeStudyDeadlines([updated, ...deadlines.filter((deadline) => deadline.id !== id)]);
  storage.setItem(STUDY_DEADLINES_KEY, JSON.stringify(next));
  return next.find((deadline) => deadline.id === id) ?? updated;
}

export function acceptStudyDeadlineReview(deadlineId: string, storage: Storage = localStorage): StudyDeadline | null {
  return updateStudyDeadlineReviewStatus(deadlineId, "accepted", storage);
}

export function ignoreStudyDeadlineReview(deadlineId: string, storage: Storage = localStorage): StudyDeadline | null {
  return updateStudyDeadlineReviewStatus(deadlineId, "ignored", storage);
}

export function buildManualStudyDeadline(input: {
  title: string;
  dueLabel: string;
  kind?: StudyDeadlineKind | null;
  courseTag?: string | null;
  dueAt?: string | null;
  now?: number;
}): StudyDeadline | null {
  const title = clean(input.title);
  const dueLabel = clean(input.dueLabel);
  if (!title || !dueLabel) return null;
  const createdAt = input.now ?? Date.now();
  return {
    id: `${title}:${dueLabel}:${createdAt}`,
    title,
    kind: input.kind ?? "other",
    courseTag: cleanNullable(input.courseTag),
    dueLabel,
    dueAt: cleanNullable(input.dueAt),
    source: "manual",
    reviewStatus: "accepted",
    createdAt,
  };
}

export function buildImportedStudyDeadline(input: {
  providerId: string;
  externalId?: string | null;
  title: string;
  dueLabel: string;
  kind?: StudyDeadlineKind | null;
  courseTag?: string | null;
  unitTag?: string | null;
  chapterTag?: string | null;
  moduleLabel?: string | null;
  dueAt?: string | null;
  source: "lms" | "calendar";
  reviewStatus?: StudyDeadlineReviewStatus | null;
  now?: number;
}): StudyDeadline | null {
  const providerId = clean(input.providerId);
  const title = clean(input.title);
  const dueLabel = clean(input.dueLabel);
  if (!providerId || !title || !dueLabel) return null;
  const courseTag = cleanNullable(input.courseTag);
  const externalId = cleanNullable(input.externalId);
  const identity = externalId ?? `${courseTag ?? "all"}:${title}:${dueLabel}`;
  return {
    id: `${input.source}:${stableIdPart(providerId)}:${stableIdPart(identity)}`,
    title,
    kind: input.kind ?? "other",
    courseTag,
    dueLabel,
    dueAt: cleanNullable(input.dueAt),
    source: input.source,
    providerId,
    providerRecordId: externalId,
    unitTag: cleanNullable(input.unitTag),
    chapterTag: cleanNullable(input.chapterTag),
    moduleLabel: cleanNullable(input.moduleLabel),
    reviewStatus: normalizeReviewStatus(input.reviewStatus, input.source),
    createdAt: input.now ?? Date.now(),
  };
}

export function classifyAcademicCalendarDeadline(input: {
  providerId?: string | null;
  externalId?: string | null;
  title: string;
  description?: string | null;
  startLabel: string;
  startAt?: string | null;
  courseTag?: string | null;
  now?: number;
}): StudyDeadline | null {
  const title = clean(input.title);
  const startLabel = clean(input.startLabel);
  if (!title || !startLabel) return null;
  const text = `${title} ${clean(input.description)}`.toLowerCase();
  const kind: StudyDeadlineKind =
    /\b(final|midterm|exam|test)\b/.test(text)
      ? "exam"
      : /\b(assignment|assessment|essay|report|submission|due)\b/.test(text)
        ? "assignment"
        : /\b(quiz|practice test)\b/.test(text)
          ? "quiz"
          : /\b(class|lecture|tutorial|seminar|lab)\b/.test(text)
            ? "class"
            : "other";
  const needsReview = kind === "other" || /\b(maybe|tentative|tbc|hold|placeholder)\b/.test(text);
  return buildImportedStudyDeadline({
    providerId: input.providerId ?? "gcal",
    externalId: input.externalId,
    title,
    dueLabel: startLabel,
    dueAt: input.startAt,
    kind,
    courseTag: input.courseTag,
    source: "calendar",
    reviewStatus: needsReview ? "needs_review" : "accepted",
    now: input.now,
  });
}

export function buildStudyDeadlineFromReportInput(input: {
  deadlineText: string | null | undefined;
  reportKind: ReportKind;
  courseTag?: string | null;
  now?: number;
}): StudyDeadline | null {
  const dueLabel = clean(input.deadlineText);
  if (!dueLabel) return null;
  const kind = deadlineKindForReportKind(input.reportKind);
  const courseTag = cleanNullable(input.courseTag);
  const title =
    kind === "assignment"
      ? "Assignment deadline"
      : kind === "quiz"
        ? "Quiz or practice deadline"
        : kind === "exam"
          ? "Exam deadline"
          : "Study deadline";
  const createdAt = input.now ?? Date.now();
  return {
    id: `manual-report:${kind}:${stableIdPart(courseTag)}:${stableIdPart(dueLabel)}`,
    title,
    kind,
    courseTag,
    dueLabel,
    dueAt: null,
    source: "manual",
    reviewStatus: "accepted",
    createdAt,
  };
}

export function emitStudyDeadlineSaved(deadline: StudyDeadline): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STUDY_DEADLINE_SAVED_EVENT, { detail: deadline }));
}
