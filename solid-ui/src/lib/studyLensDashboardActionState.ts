// @locs-version: 1.0
import type { FileLibraryNavigationIntent } from "@/lib/fileLibraryNavigationState";
import type { KnowledgeGraphNavigationIntent } from "@/lib/knowledgeGraphNavigationState";
import type { ReportKind } from "@/lib/reportGeneratorState";
import {
  MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND,
  type MedicalTopologyActionFocus,
} from "@/lib/medicalAnkiStudyState";
import { buildReportIntentFromFocus } from "@/lib/reportNavigationState";
import type { ReportNavigationIntent } from "@/lib/reportNavigationState";
import type { StudyCourse } from "@/lib/studyCourseLocalState";
import {
  buildStudyLensCourseReportIntent,
  buildStudyLensFileLibraryIntent,
  buildStudyLensKnowledgeGraphIntent,
  buildStudyLensReportIntent,
} from "@/lib/studyLensNavigationState";

export type StudyLensDashboardAction = {
  label: string;
  fileLibraryIntent?: FileLibraryNavigationIntent;
  knowledgeGraphIntent?: KnowledgeGraphNavigationIntent;
  reportIntent?: ReportNavigationIntent;
  reportKind?: ReportKind;
  view?: "reports" | "files" | "knowledge_graph" | "connected_apps";
};

export function buildStudyLensReportAction(
  label: string,
  reportKind: ReportKind,
  course: StudyCourse | null,
): StudyLensDashboardAction {
  return course
    ? {
      label,
      reportIntent: reportKind === "course_builder"
        ? buildStudyLensCourseReportIntent(course)
        : buildStudyLensReportIntent(reportKind, course),
      view: "reports",
    }
    : { label, reportKind, view: "reports" };
}

function topologyFocusRoutingTags(topologyFocus?: MedicalTopologyActionFocus | null): string[] {
  if (!topologyFocus) return [];
  const base = ["medical_topology_coverage", `readiness:${topologyFocus.readinessLabel}`];
  if (topologyFocus.readinessLabel === "Source only") {
    return [...base, "topology_gap:source_only"];
  }
  if (topologyFocus.readinessLabel === "Deck generated") {
    return [...base, "topology_gap:needs_attempt"];
  }
  if (topologyFocus.readinessLabel === "Attempt evidence") {
    return [...base, "topology_practice_ready"];
  }
  if (topologyFocus.readinessLabel === "Review overload") {
    return [...base, "topology_gap:overload", "quality_action:reduce_review_load"];
  }
  if (topologyFocus.readinessLabel === "Ready for timed block") {
    return [...base, "topology_timed_block", "medical_vignette_block"];
  }
  return base;
}

function medicalTrustedGroundingRoutingTags(): string[] {
  return [
    "medical_trusted_grounding",
    "trusted_reference:student_source_primary",
    "detail_zoom:course_level",
  ];
}

function medicalTrustedGroundingInstruction(): string {
  return "Preserve medical trusted-grounding: use retained student uploads and source locators first, keep the default detail zoom at course level unless the student asks to zoom in or out, and do not invent external citations or treat LLM internal knowledge as source evidence.";
}

export function buildStudyLensMedicalClozeAction(
  label: string,
  course: StudyCourse | null,
  topologyFocus?: MedicalTopologyActionFocus | null,
): StudyLensDashboardAction {
  const shallowUpgrade = /\bupgrade shallow cards\b/i.test(label);
  const practiceAction = shallowUpgrade
    || /\b(record|timed|weak-edge|variation|reduce|overload)\b/i.test(label)
    || topologyFocus?.readinessLabel === "Deck generated"
    || topologyFocus?.readinessLabel === "Attempt evidence"
    || topologyFocus?.readinessLabel === "Review overload"
    || topologyFocus?.readinessLabel === "Ready for timed block";
  const focusTags = [
    topologyFocus?.systemTag,
    topologyFocus?.unitTag,
    topologyFocus?.chapterTag,
    ...(topologyFocus?.conceptTags.slice(0, 6) ?? []),
  ].filter((value): value is string => Boolean(value));
  const scopeQuery = topologyFocus
    ? `${topologyFocus.scopeLabel} ${topologyFocus.readinessLabel} ${topologyFocus.nextAction} ${focusTags.join(" ")}`.trim()
    : "";
  const topologyRoutingTags = topologyFocusRoutingTags(topologyFocus);
  const reportIntent = buildReportIntentFromFocus({
    source: "study_lens",
    preferredKind: practiceAction ? "practice_questions" : "flashcard_deck",
    searchQuery: shallowUpgrade
      ? course
        ? `${course.name} medical shallow first-order card upgrade`
        : "medical shallow first-order card upgrade"
      : topologyFocus
        ? `medical topology coverage ${scopeQuery}`
      : course
        ? `${course.name} medical cloze vignette deck`
        : "medical cloze vignette deck",
    activeTag: course?.courseTag ?? null,
    courseTag: topologyFocus?.courseTag ?? course?.courseTag ?? null,
    unitTag: topologyFocus?.unitTag ?? null,
    chapterTag: topologyFocus?.chapterTag ?? null,
    academicKind: MEDICAL_CLOZE_VIGNETTE_ACADEMIC_KIND,
    knowledgeGraphLinkTags: course
      ? [
        "medical_cloze_vignette",
        ...medicalTrustedGroundingRoutingTags(),
        ...topologyRoutingTags,
        ...focusTags,
        ...(shallowUpgrade ? ["quality_action:upgrade_first_order"] : []),
        `course_source:${course.source}`,
        ...(course.termLabel ? [`term:${course.termLabel}`] : []),
      ]
      : [
        "medical_cloze_vignette",
        ...medicalTrustedGroundingRoutingTags(),
        ...topologyRoutingTags,
        ...focusTags,
        ...(shallowUpgrade ? ["quality_action:upgrade_first_order"] : []),
      ],
    zettelkastenNextAction: shallowUpgrade
      ? course
        ? `Upgrade shallow first-order medical cards for "${course.name}" into source-grounded application prompts and short vignettes without copying proprietary QBank text.`
        : "Upgrade shallow first-order medical cards into source-grounded application prompts and short vignettes without copying proprietary QBank text."
      : topologyFocus
        ? `Use medical topology coverage for ${topologyFocus.scopeLabel}: ${topologyFocus.readinessLabel}. Next action: ${topologyFocus.nextAction}. Preserve source locators, chapter/unit tags, concept supertags, and do not copy proprietary QBank text. ${medicalTrustedGroundingInstruction()}`
      : course
        ? `Generate source-grounded cloze and clinical-vignette recall items for "${course.name}" without copying proprietary QBank text. ${medicalTrustedGroundingInstruction()}`
        : `Generate source-grounded cloze and clinical-vignette recall items without copying proprietary QBank text. ${medicalTrustedGroundingInstruction()}`,
  });
  return { label, reportIntent, view: "reports" };
}

export function buildStudyLensFileAction(
  label: string,
  course: StudyCourse | null,
): StudyLensDashboardAction {
  return course
    ? { label, fileLibraryIntent: buildStudyLensFileLibraryIntent(course), view: "files" }
    : { label, view: "files" };
}

export function buildStudyLensGraphAction(
  label: string,
  course: StudyCourse | null,
): StudyLensDashboardAction {
  return course
    ? { label, knowledgeGraphIntent: buildStudyLensKnowledgeGraphIntent(course), view: "knowledge_graph" }
    : { label, view: "knowledge_graph" };
}

export function buildStudyLensConnectedAppsAction(label: string): StudyLensDashboardAction {
  return { label, view: "connected_apps" };
}
