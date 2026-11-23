// @locs-version: 1.0
import { AVAILABLE_CONNECTED_APPS, STUDY_INTEGRATION_APP_IDS, type StudyIntegrationAppId } from "@/lib/connectedAppsCatalog";
import type { McpToolConnection } from "@/lib/api";
import {
  buildImportedStudyCourse,
  type StudyCourse,
} from "@/lib/studyCourseLocalState";
import {
  buildImportedStudyDeadline,
  classifyAcademicCalendarDeadline,
  type StudyDeadline,
  type StudyDeadlineKind,
  type StudyDeadlineReviewStatus,
} from "@/lib/studyDeadlineLocalState";

export type StudyAcademicIntegrationKind = "lms" | "calendar";
export type StudyAcademicIntegrationStatus = "connected" | "available" | "needs_connection";

export type StudyAcademicIntegrationProvider = {
  id: StudyIntegrationAppId;
  name: string;
  kind: StudyAcademicIntegrationKind;
  status: StudyAcademicIntegrationStatus;
  importTargets: string[];
  evidenceLabel: string;
  actionLabel: string;
};

export type StudyAcademicIntegrationState = {
  providers: StudyAcademicIntegrationProvider[];
  connectedProviderNames: string[];
  readyProviderNames: string[];
  missingProviderNames: string[];
  importedCourseCount: number;
  importedDeadlineCount: number;
  acceptedImportedDeadlineCount: number;
  reviewNeededDeadlineCount: number;
  hasConnectedAcademicSource: boolean;
  hasImportedAcademicEvidence: boolean;
  summaryLabel: string;
  detail: string;
  nextActionLabel: string;
};

export type StudyAcademicImportedCourseInput = {
  providerId: StudyIntegrationAppId | string;
  externalId?: string | null;
  name: string;
  courseTag?: string | null;
  termLabel?: string | null;
  institutionLabel?: string | null;
  unitTags?: readonly string[] | null;
  chapterTags?: readonly string[] | null;
  source?: "lms" | "calendar" | null;
};

export type StudyAcademicImportedDeadlineInput = {
  providerId: StudyIntegrationAppId | string;
  externalId?: string | null;
  title: string;
  description?: string | null;
  dueLabel: string;
  dueAt?: string | null;
  kind?: StudyDeadlineKind | null;
  courseTag?: string | null;
  unitTag?: string | null;
  chapterTag?: string | null;
  moduleLabel?: string | null;
  source?: "lms" | "calendar" | null;
  reviewStatus?: StudyDeadlineReviewStatus | null;
};

export type StudyAcademicImportBatchInput = {
  providerId: StudyIntegrationAppId | string;
  courses?: readonly StudyAcademicImportedCourseInput[] | null;
  deadlines?: readonly StudyAcademicImportedDeadlineInput[] | null;
  now?: number;
};

export type StudyAcademicImportBatchResult = {
  providerId: string;
  courses: StudyCourse[];
  deadlines: StudyDeadline[];
  savedCourseCount: number;
  savedDeadlineCount: number;
  acceptedDeadlineCount: number;
  reviewNeededDeadlineCount: number;
  skippedCourseCount: number;
  skippedDeadlineCount: number;
};

export type StudyAcademicImportApplyResult = StudyAcademicImportBatchResult & {
  savedCourses: StudyCourse[];
  savedDeadlines: StudyDeadline[];
};

export type StudyAcademicDeadlineReviewAction = "accept" | "ignore" | "restore";

export type StudyAcademicDeadlineReviewItem = {
  id: string;
  title: string;
  kindLabel: string;
  courseLabel: string;
  scopeLabel: string;
  dueLabel: string;
  providerLabel: string;
  statusLabel: string;
  status: StudyDeadlineReviewStatus;
  canDrivePlanning: boolean;
  primaryAction: StudyAcademicDeadlineReviewAction;
  secondaryAction: StudyAcademicDeadlineReviewAction | null;
};

export type StudyAcademicDeadlineReviewQueueState = {
  totalCount: number;
  acceptedCount: number;
  reviewCount: number;
  ignoredCount: number;
  items: StudyAcademicDeadlineReviewItem[];
  acceptedItems: StudyAcademicDeadlineReviewItem[];
  reviewItems: StudyAcademicDeadlineReviewItem[];
  ignoredItems: StudyAcademicDeadlineReviewItem[];
  summaryLabel: string;
  nextActionLabel: string;
  emptyLabel: string;
};

const PROVIDER_KIND: Record<StudyIntegrationAppId, StudyAcademicIntegrationKind> = {
  "canvas-lms": "lms",
  "blackboard-lms": "lms",
  "google-classroom": "lms",
  gcal: "calendar",
};

const IMPORT_TARGETS: Record<StudyIntegrationAppId, string[]> = {
  "canvas-lms": ["courses", "modules", "assignments", "quizzes", "files", "due dates"],
  "blackboard-lms": ["courses", "content areas", "assessments", "tests", "calendar dates"],
  "google-classroom": ["courses", "coursework", "materials", "submissions", "due dates"],
  gcal: ["exam events", "assignment events", "study blocks", "availability"],
};

const PROVIDER_ID_ALIASES: Record<string, StudyIntegrationAppId> = {
  "google-calendar": "gcal",
  googlecalendar: "gcal",
  "google_calendar": "gcal",
  calendar: "gcal",
  canvas: "canvas-lms",
  canvas_lms: "canvas-lms",
  blackboard: "blackboard-lms",
  blackboard_lms: "blackboard-lms",
  classroom: "google-classroom",
  googleclassroom: "google-classroom",
  google_classroom: "google-classroom",
};

export function normalizeStudyIntegrationProviderId(providerId: string | null | undefined): string {
  const normalized = providerId?.trim().toLowerCase() ?? "";
  if (!normalized) return "";
  return PROVIDER_ID_ALIASES[normalized] ?? normalized;
}

function normalizeConnectedProviderIds(ids: readonly string[] | null | undefined): string[] {
  return (ids ?? [])
    .map(normalizeStudyIntegrationProviderId)
    .filter((value): value is string => Boolean(value));
}

function connectedIdsFromConnections(connections: readonly McpToolConnection[] | null | undefined): string[] {
  return (connections ?? [])
    .map((connection) => normalizeStudyIntegrationProviderId(connection.tool_slug))
    .filter((value): value is string => Boolean(value));
}

function providerName(id: StudyIntegrationAppId): string {
  return AVAILABLE_CONNECTED_APPS.find((app) => app.id === id)?.name ?? id;
}

function isCalendarProvider(providerId: string, source?: "lms" | "calendar" | null): boolean {
  return source === "calendar" || normalizeStudyIntegrationProviderId(providerId) === "gcal";
}

function defaultSourceForProvider(providerId: string): "lms" | "calendar" {
  return isCalendarProvider(providerId) ? "calendar" : "lms";
}

function importedSourceCount<T extends { source: string }>(items: readonly T[], source: "lms" | "calendar"): number {
  return items.filter((item) => item.source === source).length;
}

function kindLabel(kind: StudyDeadlineKind): string {
  return kind.replace(/_/g, " ");
}

function providerLabelForDeadline(deadline: StudyDeadline): string {
  if (deadline.providerId) return providerName(normalizeStudyIntegrationProviderId(deadline.providerId) as StudyIntegrationAppId);
  return deadline.source === "lms" ? "LMS import" : deadline.source === "calendar" ? "Calendar import" : deadline.source;
}

function scopeLabelForDeadline(deadline: StudyDeadline): string {
  const scope = [deadline.courseTag, deadline.unitTag, deadline.chapterTag, deadline.moduleLabel]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  return scope.length > 0 ? scope.join(" / ") : "No course scope";
}

function reviewStatusLabel(status: StudyDeadlineReviewStatus): string {
  if (status === "accepted") return "Accepted for planning";
  if (status === "ignored") return "Ignored";
  return "Needs review";
}

function reviewPrimaryAction(status: StudyDeadlineReviewStatus): StudyAcademicDeadlineReviewAction {
  if (status === "ignored") return "restore";
  if (status === "accepted") return "ignore";
  return "accept";
}

function reviewSecondaryAction(status: StudyDeadlineReviewStatus): StudyAcademicDeadlineReviewAction | null {
  if (status === "needs_review") return "ignore";
  if (status === "ignored") return "accept";
  return null;
}

export function buildStudyAcademicDeadlineReviewQueueState(input: {
  deadlines?: readonly StudyDeadline[] | null;
}): StudyAcademicDeadlineReviewQueueState {
  const importedDeadlines = [...(input.deadlines ?? [])]
    .filter((deadline) => deadline.source === "lms" || deadline.source === "calendar")
    .sort((left, right) => {
      if (left.reviewStatus === "needs_review" && right.reviewStatus !== "needs_review") return -1;
      if (left.reviewStatus !== "needs_review" && right.reviewStatus === "needs_review") return 1;
      if (left.reviewStatus === "accepted" && right.reviewStatus === "ignored") return -1;
      if (left.reviewStatus === "ignored" && right.reviewStatus === "accepted") return 1;
      if (left.dueAt && right.dueAt && left.dueAt !== right.dueAt) return left.dueAt.localeCompare(right.dueAt);
      if (left.dueAt && !right.dueAt) return -1;
      if (!left.dueAt && right.dueAt) return 1;
      return right.createdAt - left.createdAt;
    });
  const items = importedDeadlines.map((deadline): StudyAcademicDeadlineReviewItem => {
    const status = deadline.reviewStatus ?? (deadline.source === "lms" ? "accepted" : "needs_review");
    return {
      id: deadline.id,
      title: deadline.title,
      kindLabel: kindLabel(deadline.kind),
      courseLabel: deadline.courseTag ?? "No course tag",
      scopeLabel: scopeLabelForDeadline(deadline),
      dueLabel: deadline.dueLabel,
      providerLabel: providerLabelForDeadline(deadline),
      statusLabel: reviewStatusLabel(status),
      status,
      canDrivePlanning: status === "accepted",
      primaryAction: reviewPrimaryAction(status),
      secondaryAction: reviewSecondaryAction(status),
    };
  });
  const acceptedItems = items.filter((item) => item.status === "accepted");
  const reviewItems = items.filter((item) => item.status === "needs_review");
  const ignoredItems = items.filter((item) => item.status === "ignored");
  return {
    totalCount: items.length,
    acceptedCount: acceptedItems.length,
    reviewCount: reviewItems.length,
    ignoredCount: ignoredItems.length,
    items,
    acceptedItems,
    reviewItems,
    ignoredItems,
    summaryLabel: items.length === 0
      ? "No imported academic dates"
      : `${acceptedItems.length} accepted / ${reviewItems.length} to review / ${ignoredItems.length} ignored`,
    nextActionLabel: reviewItems.length > 0
      ? "Review imported dates"
      : items.length > 0 ? "Import or capture more dates" : "Connect LMS/calendar",
    emptyLabel: "No LMS or calendar dates imported yet",
  };
}

export function buildStudyAcademicIntegrationState(input: {
  connectedAppIds?: readonly string[] | null;
  connections?: readonly McpToolConnection[] | null;
  courses?: readonly StudyCourse[] | null;
  deadlines?: readonly StudyDeadline[] | null;
  localOnlyMode?: boolean;
}): StudyAcademicIntegrationState {
  const connectedIds = new Set([
    ...normalizeConnectedProviderIds(input.connectedAppIds),
    ...connectedIdsFromConnections(input.connections),
  ]);
  const localOnlyMode = Boolean(input.localOnlyMode);
  const importedLmsCourseCount = importedSourceCount(input.courses ?? [], "lms");
  const importedCalendarCourseCount = importedSourceCount(input.courses ?? [], "calendar");
  const importedLmsDeadlineCount = importedSourceCount(input.deadlines ?? [], "lms");
  const importedCalendarDeadlineCount = importedSourceCount(input.deadlines ?? [], "calendar");
  const importedCourseCount = importedLmsCourseCount + importedCalendarCourseCount;
  const importedDeadlineCount = importedLmsDeadlineCount + importedCalendarDeadlineCount;
  const importedDeadlines = (input.deadlines ?? []).filter((deadline) => deadline.source === "lms" || deadline.source === "calendar");
  const acceptedImportedDeadlineCount = importedDeadlines.filter((deadline) => deadline.reviewStatus !== "needs_review" && deadline.reviewStatus !== "ignored").length;
  const reviewNeededDeadlineCount = importedDeadlines.filter((deadline) => deadline.reviewStatus === "needs_review").length;

  const providers = STUDY_INTEGRATION_APP_IDS.map((id): StudyAcademicIntegrationProvider => {
    const connected = connectedIds.has(id);
    const kind = PROVIDER_KIND[id];
    const evidenceCount = kind === "lms"
      ? importedLmsCourseCount + importedLmsDeadlineCount
      : importedCalendarCourseCount + importedCalendarDeadlineCount;
    return {
      id,
      name: providerName(id),
      kind,
      status: connected ? "connected" : localOnlyMode ? "available" : "needs_connection",
      importTargets: IMPORT_TARGETS[id],
      evidenceLabel: evidenceCount > 0
        ? `${evidenceCount} imported ${kind === "lms" ? "LMS" : "calendar"} item${evidenceCount === 1 ? "" : "s"}`
        : connected
          ? `Connected; import ${IMPORT_TARGETS[id].slice(0, 3).join(", ")}`
          : `Can import ${IMPORT_TARGETS[id].slice(0, 3).join(", ")}`,
      actionLabel: connected ? "Import now" : "Connect",
    };
  });
  const connectedProviderNames = providers.filter((provider) => provider.status === "connected").map((provider) => provider.name);
  const missingProviderNames = providers.filter((provider) => provider.status !== "connected").map((provider) => provider.name);
  const hasConnectedAcademicSource = connectedProviderNames.length > 0;
  const hasImportedAcademicEvidence = importedCourseCount + importedDeadlineCount > 0;

  return {
    providers,
    connectedProviderNames,
    readyProviderNames: connectedProviderNames,
    missingProviderNames,
    importedCourseCount,
    importedDeadlineCount,
    acceptedImportedDeadlineCount,
    reviewNeededDeadlineCount,
    hasConnectedAcademicSource,
    hasImportedAcademicEvidence,
    summaryLabel: hasImportedAcademicEvidence
      ? `${importedCourseCount} imported course${importedCourseCount === 1 ? "" : "s"} / ${acceptedImportedDeadlineCount} reviewed deadline${acceptedImportedDeadlineCount === 1 ? "" : "s"}${reviewNeededDeadlineCount > 0 ? ` / ${reviewNeededDeadlineCount} to review` : ""}`
      : hasConnectedAcademicSource
        ? `${connectedProviderNames.length} connected academic source${connectedProviderNames.length === 1 ? "" : "s"}`
        : "No LMS or Google Calendar connected",
    detail: hasImportedAcademicEvidence
      ? reviewNeededDeadlineCount > 0
        ? "Imported courses and reviewed deadlines can drive Study Lens. Ambiguous calendar events stay in review before entering plans."
        : "Imported courses and deadlines can drive Study Lens, Reports, Files, and Knowledge Graph without creating a separate course workspace."
      : hasConnectedAcademicSource
        ? "Run an import to write normalized course and deadline records before treating connector data as study evidence."
        : "Connect Canvas, Blackboard, Google Classroom, or Google Calendar to import courses, coursework, due dates, and study blocks.",
    nextActionLabel: reviewNeededDeadlineCount > 0
      ? "Review dates"
      : hasConnectedAcademicSource ? "Import academic dates" : "Connect LMS/calendar",
  };
}

export function buildStudyAcademicImportBatch(input: StudyAcademicImportBatchInput): StudyAcademicImportBatchResult {
  const providerId = normalizeStudyIntegrationProviderId(input.providerId);
  const now = input.now ?? Date.now();
  const courses: StudyCourse[] = [];
  const deadlines: StudyDeadline[] = [];
  let skippedCourseCount = 0;
  let skippedDeadlineCount = 0;

  for (const course of input.courses ?? []) {
    const courseProviderId = normalizeStudyIntegrationProviderId(course.providerId || providerId);
    const source = course.source ?? defaultSourceForProvider(courseProviderId);
    const normalized = buildImportedStudyCourse({
      providerId: courseProviderId,
      externalId: course.externalId,
      name: course.name,
      courseTag: course.courseTag,
      termLabel: course.termLabel,
      institutionLabel: course.institutionLabel,
      unitTags: course.unitTags,
      chapterTags: course.chapterTags,
      source,
      now,
    });
    if (normalized) courses.push(normalized);
    else skippedCourseCount += 1;
  }

  for (const deadline of input.deadlines ?? []) {
    const deadlineProviderId = normalizeStudyIntegrationProviderId(deadline.providerId || providerId);
    const source = deadline.source ?? defaultSourceForProvider(deadlineProviderId);
    const normalized = source === "calendar" && !deadline.kind
      ? classifyAcademicCalendarDeadline({
        providerId: deadlineProviderId,
        externalId: deadline.externalId,
        title: deadline.title,
        description: deadline.description,
        startLabel: deadline.dueLabel,
        startAt: deadline.dueAt,
        courseTag: deadline.courseTag,
        now,
      })
      : buildImportedStudyDeadline({
        providerId: deadlineProviderId,
        externalId: deadline.externalId,
        title: deadline.title,
        dueLabel: deadline.dueLabel,
        dueAt: deadline.dueAt,
        kind: deadline.kind,
        courseTag: deadline.courseTag,
        unitTag: deadline.unitTag,
        chapterTag: deadline.chapterTag,
        moduleLabel: deadline.moduleLabel,
        source,
        reviewStatus: deadline.reviewStatus,
        now,
      });
    if (normalized) deadlines.push(normalized);
    else skippedDeadlineCount += 1;
  }

  const acceptedDeadlineCount = deadlines.filter((deadline) => deadline.reviewStatus !== "needs_review" && deadline.reviewStatus !== "ignored").length;
  const reviewNeededDeadlineCount = deadlines.filter((deadline) => deadline.reviewStatus === "needs_review").length;
  return {
    providerId,
    courses,
    deadlines,
    savedCourseCount: courses.length,
    savedDeadlineCount: deadlines.length,
    acceptedDeadlineCount,
    reviewNeededDeadlineCount,
    skippedCourseCount,
    skippedDeadlineCount,
  };
}

export function applyStudyAcademicImportBatch(
  input: StudyAcademicImportBatchInput,
  persistence: {
    saveCourse: (course: StudyCourse) => StudyCourse;
    saveDeadline: (deadline: StudyDeadline) => StudyDeadline;
  },
): StudyAcademicImportApplyResult {
  const batch = buildStudyAcademicImportBatch(input);
  const savedCourses = batch.courses.map((course) => persistence.saveCourse(course));
  const savedDeadlines = batch.deadlines.map((deadline) => persistence.saveDeadline(deadline));
  return {
    ...batch,
    savedCourses,
    savedDeadlines,
    savedCourseCount: savedCourses.length,
    savedDeadlineCount: savedDeadlines.length,
  };
}
