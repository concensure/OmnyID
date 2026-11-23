// @locs-version: 1.0
export type StudyAcademicScopeInput = {
  courseTag?: string | null;
  unitTag?: string | null;
  chapterTag?: string | null;
  moduleLabel?: string | null;
  dueLabel?: string | null;
  deadlineId?: string | null;
  providerId?: string | null;
  academicKind?: string | null;
  sessionId?: string | null;
  routeSource?: string | null;
};

export type StudyAcademicScopeLabelOptions = {
  includeDeadlineId?: boolean;
  includeProviderId?: boolean;
  includeAcademicKind?: boolean;
  includeSessionId?: boolean;
  includeRouteSource?: boolean;
  limit?: number;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly (string | null | undefined)[], limit = Number.POSITIVE_INFINITY): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

export function buildStudyAcademicScopeLabels(
  input: StudyAcademicScopeInput,
  options: StudyAcademicScopeLabelOptions = {},
): string[] {
  const limit = Number.isFinite(options.limit) ? Math.max(0, Math.floor(options.limit ?? 0)) : Number.POSITIVE_INFINITY;
  return uniqueStrings([
    input.courseTag,
    input.unitTag,
    input.chapterTag,
    input.moduleLabel,
    input.dueLabel,
    options.includeDeadlineId ? input.deadlineId : null,
    options.includeProviderId ? input.providerId : null,
    options.includeAcademicKind ? input.academicKind : null,
    options.includeSessionId ? input.sessionId : null,
    options.includeRouteSource ? input.routeSource : null,
  ], limit);
}

export function buildStudyAcademicScopeCsvTags(input: StudyAcademicScopeInput): string {
  return buildStudyAcademicScopeLabels(input, {
    includeDeadlineId: true,
    includeProviderId: true,
  }).join("; ");
}

export function buildStudyAcademicScopeSearchValues(input: StudyAcademicScopeInput): string[] {
  return buildStudyAcademicScopeLabels(input, {
    includeDeadlineId: true,
    includeProviderId: true,
    includeAcademicKind: true,
    includeSessionId: true,
    includeRouteSource: true,
  });
}

export function buildStudyAcademicScopeFocusBadges(input: StudyAcademicScopeInput): string[] {
  return uniqueStrings([
    input.courseTag ? `course_tag:${input.courseTag}` : null,
    input.chapterTag ? `chapter_tag:${input.chapterTag}` : null,
    input.unitTag ? `unit_tag:${input.unitTag}` : null,
    input.moduleLabel ? `module:${input.moduleLabel}` : null,
    input.dueLabel ? `due:${input.dueLabel}` : null,
    input.deadlineId ? `deadline:${input.deadlineId}` : null,
    input.providerId ? `provider:${input.providerId}` : null,
    input.academicKind ? `academic_kind:${input.academicKind}` : null,
    input.sessionId ? `session:${input.sessionId}` : null,
    input.routeSource ? `route_source:${input.routeSource}` : null,
  ]);
}

export function buildStudyAcademicScopeContinuationLines(input: StudyAcademicScopeInput): string[] {
  return uniqueStrings([
    input.courseTag ? `Keep the follow-up scoped to ${input.courseTag}.` : null,
    input.chapterTag ? `Keep the follow-up scoped to ${input.chapterTag}.` : null,
    input.unitTag ? `Keep the follow-up scoped to ${input.unitTag}.` : null,
    input.moduleLabel ? `Keep the follow-up scoped to module ${input.moduleLabel}.` : null,
    input.dueLabel ? `Keep the follow-up tied to due date ${input.dueLabel}.` : null,
    input.deadlineId ? `Reuse deadline context ${input.deadlineId}.` : null,
    input.providerId ? `Keep provider context ${input.providerId} visible for source/audit checks.` : null,
    input.sessionId ? `Treat this as continuation evidence from guided session ${input.sessionId}.` : null,
  ]);
}

export function buildStudyAcademicScopeCarryoverBadges(
  input: StudyAcademicScopeInput,
  options: { limit?: number } = {},
): string[] {
  const routeSource = clean(input.routeSource);
  const labels = [
    input.courseTag,
    input.unitTag,
    input.chapterTag,
    input.moduleLabel,
    input.dueLabel,
    input.providerId,
    input.sessionId ? `guided session ${input.sessionId}` : null,
    routeSource ? `from ${routeSource.replace(/_/g, " ")}` : null,
  ];
  const limit = Number.isFinite(options.limit) ? Math.max(0, Math.floor(options.limit ?? 0)) : Number.POSITIVE_INFINITY;
  return uniqueStrings(labels, limit);
}

export function buildStudyAcademicScopePromptValues(input: StudyAcademicScopeInput): string[] {
  return uniqueStrings([
    input.academicKind ? `academic_kind:${input.academicKind}` : null,
    input.courseTag,
    input.unitTag,
    input.chapterTag,
    input.moduleLabel ? `module:${input.moduleLabel}` : null,
    input.dueLabel ? `due:${input.dueLabel}` : null,
    input.deadlineId ? `deadline:${input.deadlineId}` : null,
    input.providerId ? `provider:${input.providerId}` : null,
    input.sessionId ? `session:${input.sessionId}` : null,
    input.routeSource ? `route_source:${input.routeSource}` : null,
  ]);
}
