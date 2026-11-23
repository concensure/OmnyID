// @locs-version: 1.0
import { parseJsonValue } from "@/lib/jsonParseState";

export const STUDY_COURSES_KEY = "omnyid.study-courses";
export const STUDY_COURSE_SAVED_EVENT = "omnyid:study-course-saved";
const MAX_STUDY_COURSES = 30;

export type StudyCourseSource = "manual" | "inferred" | "lms" | "calendar";

export type StudyCourse = {
  id: string;
  name: string;
  courseTag: string | null;
  termLabel: string | null;
  institutionLabel: string | null;
  source: StudyCourseSource;
  providerId?: string | null;
  providerRecordId?: string | null;
  unitTags?: string[];
  chapterTags?: string[];
  createdAt: number;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullable(value: unknown): string | null {
  const normalized = clean(value);
  return normalized.length > 0 ? normalized : null;
}

function cleanStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map(clean)
      .filter((entry) => entry.length > 0),
  )].slice(0, 40);
}

function normalizeSource(value: unknown): StudyCourseSource {
  if (value === "manual" || value === "inferred" || value === "lms" || value === "calendar") return value;
  return "manual";
}

function stableIdPart(value: string | null): string {
  return (value ?? "all")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "all";
}

function courseIdentityId(courseTag: string | null, name: string): string {
  return `manual:${stableIdPart(courseTag ?? name)}`;
}

function nameFromCourseTag(courseTag: string): string {
  return courseTag
    .replace(/^course:/i, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .toUpperCase() || courseTag;
}

export function normalizeStudyCourse(value: unknown): StudyCourse | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const name = clean(record.name);
  const courseTag = cleanNullable(record.courseTag);
  const createdAt = typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
    ? record.createdAt
    : Date.now();

  if (!name) return null;

  return {
    id: clean(record.id) || courseIdentityId(courseTag, name),
    name,
    courseTag,
    termLabel: cleanNullable(record.termLabel),
    institutionLabel: cleanNullable(record.institutionLabel),
    source: normalizeSource(record.source),
    providerId: cleanNullable(record.providerId),
    providerRecordId: cleanNullable(record.providerRecordId),
    unitTags: cleanStringList(record.unitTags),
    chapterTags: cleanStringList(record.chapterTags),
    createdAt,
  };
}

export function normalizeStudyCourses(value: unknown): StudyCourse[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const courses: StudyCourse[] = [];
  for (const entry of value) {
    const course = normalizeStudyCourse(entry);
    if (!course || seen.has(course.id)) continue;
    seen.add(course.id);
    courses.push(course);
  }
  return courses
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_STUDY_COURSES);
}

export function loadStudyCourses(storage: Storage = localStorage): StudyCourse[] {
  const raw = storage.getItem(STUDY_COURSES_KEY);
  if (!raw) return [];
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    storage.removeItem(STUDY_COURSES_KEY);
    return [];
  }
  const courses = normalizeStudyCourses(parsed.value);
  if (courses.length === 0) storage.removeItem(STUDY_COURSES_KEY);
  else storage.setItem(STUDY_COURSES_KEY, JSON.stringify(courses));
  return courses;
}

export function saveStudyCourse(course: StudyCourse, storage: Storage = localStorage): StudyCourse {
  const normalized = normalizeStudyCourse(course) ?? course;
  const loaded = loadStudyCourses(storage);
  const existingMatch = loaded.find((item) => item.id === normalized.id);
  const shouldKeepExistingExplicit = existingMatch && existingMatch.source !== "inferred" && normalized.source === "inferred";
  const merged = shouldKeepExistingExplicit
    ? {
      ...normalized,
      name: existingMatch.name,
      termLabel: existingMatch.termLabel ?? normalized.termLabel,
      institutionLabel: existingMatch.institutionLabel ?? normalized.institutionLabel,
      source: existingMatch.source,
      createdAt: Math.max(existingMatch.createdAt, normalized.createdAt),
    }
    : normalized;
  const existing = loaded.filter((item) => item.id !== normalized.id);
  const next = normalizeStudyCourses([merged, ...existing]);
  storage.setItem(STUDY_COURSES_KEY, JSON.stringify(next));
  return next.find((item) => item.id === normalized.id) ?? normalized;
}

export function buildManualStudyCourse(input: {
  name: string;
  courseTag?: string | null;
  termLabel?: string | null;
  institutionLabel?: string | null;
  now?: number;
}): StudyCourse | null {
  const name = clean(input.name);
  if (!name) return null;
  const courseTag = cleanNullable(input.courseTag);
  const createdAt = input.now ?? Date.now();
  return {
    id: courseIdentityId(courseTag, name),
    name,
    courseTag,
    termLabel: cleanNullable(input.termLabel),
    institutionLabel: cleanNullable(input.institutionLabel),
    source: "manual",
    createdAt,
  };
}

export function buildImportedStudyCourse(input: {
  providerId: string;
  externalId?: string | null;
  name: string;
  courseTag?: string | null;
  termLabel?: string | null;
  institutionLabel?: string | null;
  unitTags?: readonly string[] | null;
  chapterTags?: readonly string[] | null;
  source: "lms" | "calendar";
  now?: number;
}): StudyCourse | null {
  const providerId = clean(input.providerId);
  const name = clean(input.name);
  if (!providerId || !name) return null;
  const courseTag = cleanNullable(input.courseTag);
  const externalId = cleanNullable(input.externalId);
  const identity = externalId ?? courseTag ?? name;
  return {
    id: `${input.source}:${stableIdPart(providerId)}:${stableIdPart(identity)}`,
    name,
    courseTag,
    termLabel: cleanNullable(input.termLabel),
    institutionLabel: cleanNullable(input.institutionLabel),
    source: input.source,
    providerId,
    providerRecordId: externalId,
    unitTags: cleanStringList(input.unitTags),
    chapterTags: cleanStringList(input.chapterTags),
    createdAt: input.now ?? Date.now(),
  };
}

export function buildInferredStudyCourseFromTag(input: {
  courseTag?: string | null;
  now?: number;
}): StudyCourse | null {
  const courseTag = cleanNullable(input.courseTag);
  if (!courseTag) return null;
  const name = nameFromCourseTag(courseTag);
  return {
    id: courseIdentityId(courseTag, name),
    name,
    courseTag,
    termLabel: null,
    institutionLabel: null,
    source: "inferred",
    createdAt: input.now ?? Date.now(),
  };
}

export function emitStudyCourseSaved(course: StudyCourse): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STUDY_COURSE_SAVED_EVENT, { detail: course }));
}
