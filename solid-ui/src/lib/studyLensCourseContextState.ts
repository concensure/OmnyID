// @locs-version: 1.0
import type { StudyAttempt } from "@/lib/studyAttemptLocalState";
import type { StudyCourse } from "@/lib/studyCourseLocalState";
import type { StudyDeadline } from "@/lib/studyDeadlineLocalState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";

export type StudyLensCourseOption = {
  label: string;
  value: string;
  source: StudyCourse["source"] | "inferred_from_activity";
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function courseLabel(course: StudyCourse): string {
  const tag = course.courseTag ? ` (${course.courseTag})` : "";
  const term = course.termLabel ? ` - ${course.termLabel}` : "";
  return `${course.name}${tag}${term}`;
}

function latestCourse(courses: readonly StudyCourse[]): StudyCourse | null {
  return courses[0] ?? null;
}

function courseNameFromTag(tag: string): string {
  return tag
    .replace(/^course:/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function courseTagsFromActivity(input: {
  deadlines?: readonly StudyDeadline[] | null;
  attempts?: readonly StudyAttempt[] | null;
  artifacts?: readonly StudyReportArtifact[] | null;
}): string[] {
  return [
    ...(input.deadlines ?? []).map((deadline) => deadline.courseTag),
    ...(input.attempts ?? []).map((attempt) => attempt.courseTag),
    ...(input.artifacts ?? []).map((artifact) => artifact.courseTag),
  ].flatMap((tag): string[] => {
    const value = clean(tag);
    return value ? [value] : [];
  });
}

export function inferredStudyCourseFromActivity(input: {
  deadlines?: readonly StudyDeadline[] | null;
  attempts?: readonly StudyAttempt[] | null;
  artifacts?: readonly StudyReportArtifact[] | null;
}): StudyCourse | null {
  const courseTag = courseTagsFromActivity(input)[0] ?? null;
  if (!courseTag) return null;
  return {
    id: `inferred:${courseTag}`,
    name: courseNameFromTag(courseTag) || courseTag,
    courseTag,
    termLabel: null,
    institutionLabel: null,
    source: "inferred",
    createdAt: 0,
  };
}

export function activeStudyCourse(input: {
  courses?: readonly StudyCourse[] | null;
  deadlines?: readonly StudyDeadline[] | null;
  attempts?: readonly StudyAttempt[] | null;
  artifacts?: readonly StudyReportArtifact[] | null;
}): StudyCourse | null {
  return latestCourse(input.courses ?? []) ?? inferredStudyCourseFromActivity(input);
}

function inferredCourseLabels(input: {
  deadlines?: readonly StudyDeadline[] | null;
  attempts?: readonly StudyAttempt[] | null;
  artifacts?: readonly StudyReportArtifact[] | null;
}): string[] {
  return [...new Set(courseTagsFromActivity(input).map((tag) => `Inferred ${tag}`))].slice(0, 5);
}

export function studyLensCourseLabels(input: {
  courses?: readonly StudyCourse[] | null;
  deadlines?: readonly StudyDeadline[] | null;
  attempts?: readonly StudyAttempt[] | null;
  artifacts?: readonly StudyReportArtifact[] | null;
}): string[] {
  const courses = input.courses ?? [];
  const explicit = courses.map(courseLabel);
  const explicitTags = new Set(courses.map((course) => course.courseTag).filter((tag): tag is string => Boolean(tag)));
  const inferred = inferredCourseLabels(input).filter((label) =>
    !explicitTags.has(label.replace(/^Inferred\s+/, "")),
  );
  return [...explicit, ...inferred].slice(0, 6);
}

export function studyLensCourseOptions(input: {
  courses?: readonly StudyCourse[] | null;
  deadlines?: readonly StudyDeadline[] | null;
  attempts?: readonly StudyAttempt[] | null;
  artifacts?: readonly StudyReportArtifact[] | null;
}): StudyLensCourseOption[] {
  const options: StudyLensCourseOption[] = [];
  const seen = new Set<string>();
  for (const course of input.courses ?? []) {
    const value = course.courseTag ?? course.name;
    if (!value || seen.has(value)) continue;
    seen.add(value);
    options.push({
      label: courseLabel(course),
      value,
      source: course.source,
    });
  }
  for (const tag of courseTagsFromActivity(input)) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    options.push({
      label: `Inferred ${tag}`,
      value: tag,
      source: "inferred_from_activity",
    });
  }
  return options.slice(0, 8);
}

export function artifactsForStudyLensCoursePreference(
  artifacts: readonly StudyReportArtifact[],
  course: StudyCourse | null,
): StudyReportArtifact[] {
  const tag = course?.courseTag?.trim();
  if (!tag) return [...artifacts];
  const scoped = artifacts.filter((artifact) => artifact.courseTag === tag);
  return scoped.length > 0 ? scoped : [...artifacts];
}
