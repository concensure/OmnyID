// @locs-version: 1.0
export type StudyAcademicCalendarEventScopeInput = {
  academicKind?: string | null;
  courseTag?: string | null;
  unitTag?: string | null;
  chapterTag?: string | null;
  moduleLabel?: string | null;
  providerId?: string | null;
  providerRecordId?: string | null;
  studyDeadlineId?: string | null;
  dueLabel?: string | null;
  source?: string | null;
  reviewStatus?: string | null;
};

export type StudyAcademicCalendarEventScopeState = {
  scopeParts: string[];
  scopeLabel: string;
  providerLabel: string;
  metadata: Record<string, string | string[] | null>;
  supertags: string[];
  chips: string[];
  knowledgeGraphLinkTags: string[];
  searchableTerms: string[];
};

function clean(value: unknown): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
}

function unique(values: readonly (string | null | undefined)[], limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item?.toLowerCase();
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

export function buildStudyAcademicCalendarEventScope(
  input: StudyAcademicCalendarEventScopeInput,
): StudyAcademicCalendarEventScopeState {
  const academicKind = clean(input.academicKind);
  const courseTag = clean(input.courseTag);
  const unitTag = clean(input.unitTag);
  const chapterTag = clean(input.chapterTag);
  const moduleLabel = clean(input.moduleLabel);
  const providerId = clean(input.providerId);
  const providerRecordId = clean(input.providerRecordId);
  const studyDeadlineId = clean(input.studyDeadlineId);
  const dueLabel = clean(input.dueLabel);
  const source = clean(input.source);
  const reviewStatus = clean(input.reviewStatus);
  const scopeParts = unique([courseTag, unitTag, chapterTag, moduleLabel], 4);
  const providerLabel = providerId ?? source ?? "academic import";
  const supertags = unique([
    "calendar",
    "calendar_event",
    "academic",
    "study_deadline",
    academicKind ? `deadline:${academicKind}` : null,
    courseTag,
    unitTag,
    chapterTag,
    moduleLabel ? `module:${moduleLabel}` : null,
    providerId ? `provider:${providerId}` : null,
  ]);
  const chips = unique([
    "calendar_event",
    "academic_deadline",
    courseTag,
    unitTag,
    chapterTag,
    moduleLabel,
    providerLabel,
    studyDeadlineId ? `deadline:${studyDeadlineId}` : null,
  ], 8);
  const knowledgeGraphLinkTags = unique([
    courseTag,
    unitTag,
    chapterTag,
    moduleLabel ? `module:${moduleLabel}` : null,
    providerId ? `provider:${providerId}` : null,
  ], 6);
  const metadata = {
    source,
    provider_id: providerId,
    provider_record_id: providerRecordId,
    study_deadline_id: studyDeadlineId,
    academic_kind: academicKind,
    academic_course_tag: courseTag,
    academic_unit_tag: unitTag,
    academic_chapter_tag: chapterTag,
    academic_module_label: moduleLabel,
    review_status: reviewStatus,
    due_label: dueLabel,
    searchable_terms: supertags,
  };

  return {
    scopeParts,
    scopeLabel: scopeParts.length > 0 ? scopeParts.join(" - ") : "No course scope saved",
    providerLabel,
    metadata,
    supertags,
    chips,
    knowledgeGraphLinkTags,
    searchableTerms: unique([
      academicKind,
      courseTag,
      unitTag,
      chapterTag,
      moduleLabel,
      providerId,
      providerRecordId,
      studyDeadlineId,
      dueLabel,
      source,
      reviewStatus,
      ...supertags,
    ], 20),
  };
}
