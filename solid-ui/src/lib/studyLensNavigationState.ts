// @locs-version: 1.0
import {
  buildFileLibraryIntentFromKnowledgeGraphFocus,
  type FileLibraryNavigationIntent,
} from "@/lib/fileLibraryNavigationState";
import {
  buildKnowledgeGraphIntentFromFileLibraryFocus,
  type KnowledgeGraphNavigationIntent,
} from "@/lib/knowledgeGraphNavigationState";
import { buildReportIntentFromFocus, type ReportNavigationIntent } from "@/lib/reportNavigationState";
import type { ReportKind } from "@/lib/reportGeneratorState";
import { reportLabelForKind } from "@/lib/reportSeedMetadata";
import type { StudyAttempt } from "@/lib/studyAttemptLocalState";
import type { StudyCourse } from "@/lib/studyCourseLocalState";
import {
  studyAttemptDurationLabel,
  studyAttemptModeLabel,
  studyAttemptReportKind,
  studyAttemptScoreLabel,
} from "@/lib/studyLensLabelState";

function courseActiveTag(course: StudyCourse): string {
  return course.courseTag ?? `course:${course.name}`;
}

export function buildStudyLensFileLibraryIntent(course: StudyCourse): FileLibraryNavigationIntent {
  const term = course.termLabel ? ` ${course.termLabel}` : "";
  const activeTag = courseActiveTag(course);
  return {
    ...buildFileLibraryIntentFromKnowledgeGraphFocus({
      searchQuery: `${course.name}${term}`,
      activeTag,
      activeLens: "study_materials",
      academicKind: "study_course",
      courseTag: course.courseTag,
      knowledgeGraphLinkTags: [
        activeTag,
        `course_source:${course.source}`,
        ...(course.termLabel ? [`term:${course.termLabel}`] : []),
      ],
      zettelkastenNextAction: `Show retained sources, extracted notes, and source gaps for the active Study Lens course "${course.name}".`,
    }),
    notice: `Showing retained Files context for Study Lens course "${course.name}".`,
  };
}

export function buildStudyLensKnowledgeGraphIntent(course: StudyCourse): KnowledgeGraphNavigationIntent {
  const activeTag = courseActiveTag(course);
  const intent = buildKnowledgeGraphIntentFromFileLibraryFocus({
    searchQuery: course.name,
    activeTag,
    knowledgeMode: "connected_notes",
    academicKind: "study_course",
    courseTag: course.courseTag,
  });
  return {
    ...(intent ?? {
      activeLens: "study_materials",
      preferredConnectionStrength: null,
      activeTag,
      searchQuery: course.name,
      academicKind: "study_course",
      courseTag: course.courseTag ?? null,
      weekTag: null,
      lectureTag: null,
      zettelkastenStage: null,
      highlightCardId: null,
      highlightSourceMessageId: null,
      fileName: null,
      notice: null,
      origin: "files",
      createdAt: Date.now(),
    }),
    activeLens: "study_materials",
    preferredConnectionStrength: "high",
    knowledgeGraphLinkTags: [
      activeTag,
      `course_source:${course.source}`,
      ...(course.termLabel ? [`term:${course.termLabel}`] : []),
    ],
    zettelkastenNextAction: `Show graph clusters, weak links, and cross-source overlaps for the active Study Lens course "${course.name}".`,
    notice: `Showing Knowledge Graph context for Study Lens course "${course.name}".`,
  };
}

export function buildStudyLensReportIntent(reportKind: ReportKind, course?: StudyCourse | null): ReportNavigationIntent {
  const term = course?.termLabel ? ` for ${course.termLabel}` : "";
  const institution = course?.institutionLabel ? ` at ${course.institutionLabel}` : "";
  return buildReportIntentFromFocus({
    source: "study_lens",
    preferredKind: reportKind,
    searchQuery: course ? `${course.name} ${reportKind}${term}` : reportKind,
    courseTag: course?.courseTag,
    activeTag: course?.courseTag ?? null,
    academicKind: course ? "study_course" : null,
    knowledgeGraphLinkTags: course
      ? [
        `course_source:${course.source}`,
        ...(course.termLabel ? [`term:${course.termLabel}`] : []),
      ]
      : null,
    zettelkastenNextAction: course
      ? `Use "${course.name}"${term}${institution} as the active Study Lens course context for this ${reportLabelForKind(reportKind).toLowerCase()}.`
      : null,
  });
}

export function buildStudyLensAttemptReportIntent(attempt: StudyAttempt): ReportNavigationIntent {
  const score = studyAttemptScoreLabel(attempt);
  const duration = studyAttemptDurationLabel(attempt);
  const timing = duration ? ` completed in ${duration}` : "";
  return buildReportIntentFromFocus({
    source: "study_lens",
    preferredKind: studyAttemptReportKind(attempt.mode),
    searchQuery: `${attempt.mode} attempt ${score}`,
    courseTag: attempt.courseTag,
    activeTag: `study_attempt:${attempt.mode}`,
    academicKind: "study_attempt",
    knowledgeGraphLinkTags: [
      `attempt:${attempt.mode}`,
      `score:${attempt.correctItems}/${attempt.totalItems}`,
    ],
    zettelkastenNextAction: `Use the recorded ${studyAttemptModeLabel(attempt.mode).toLowerCase()} attempt "${attempt.title}" (${score}${timing}) to generate targeted follow-up study material.`,
  });
}

export function buildStudyLensCourseReportIntent(course: StudyCourse): ReportNavigationIntent {
  const intent = buildStudyLensReportIntent("course_builder", course);
  const term = course.termLabel ? ` for ${course.termLabel}` : "";
  const institution = course.institutionLabel ? ` at ${course.institutionLabel}` : "";
  return {
    ...intent,
    searchQuery: `${course.name} course plan${term}`,
    activeTag: course.courseTag ?? `course:${course.name}`,
    zettelkastenNextAction: `Build a course plan for "${course.name}"${term}${institution} using retained sources, deadlines, study attempts, and explicit source gaps.`,
  };
}
