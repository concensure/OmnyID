// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import {
  buildReportIntentFromFocus,
  type ReportNavigationIntent,
} from "@/lib/reportNavigationState";
import type { ReportKind } from "@/lib/reportGeneratorState";
import { buildStudyAcademicCalendarEventScope } from "@/lib/studyAcademicCalendarEventScopeState";

export type StudyAcademicCalendarSearchCard = {
  id: string;
  title: string;
  dueLabel: string;
  eventId: string;
  eventDate: string | null;
  scopeLabel: string;
  providerLabel: string;
  chips: string[];
  reportIntent: ReportNavigationIntent;
};

export type StudyAcademicCalendarSearchState = {
  count: number;
  headline: string;
  detail: string;
  cards: StudyAcademicCalendarSearchCard[];
  facetQueries: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function academicMetadata(message: AfpMessage): Record<string, unknown> {
  const content = decryptedDisplayContent(message);
  return {
    ...record(message.metadata),
    ...record(record(content).metadata),
  };
}

function isAcademicCalendarEvent(message: AfpMessage): boolean {
  const metadata = academicMetadata(message);
  return (
    message.type === "calendar_event"
    && (
      message.subtype === "academic_deadline"
      || clean(metadata.projection) === "study_deadline_to_afp_calendar_event"
      || clean(metadata.academic_course_tag).length > 0
    )
  );
}

function contentString(message: AfpMessage, key: string): string {
  return clean(decryptedDisplayContent(message)[key]);
}

function eventDateFromIso(value: string): string | null {
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function reportKindForAcademicEvent(title: string, academicKind: string): ReportKind {
  const text = `${title} ${academicKind}`.toLowerCase();
  if (/\bstudy block|study session|revision session\b/.test(text)) return "guided_study_session";
  if (/\bexam|final|midterm\b/.test(text)) return "exam_preparation";
  if (/\bassignment|assessment|brief|rubric|essay|report\b/.test(text)) return "assignment_plan";
  if (/\bquiz|test\b/.test(text)) return "quiz_generator";
  return "day_schedule";
}

function unique(values: readonly (string | null | undefined)[], limit = 8): string[] {
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

function cardForAcademicEvent(message: AfpMessage): StudyAcademicCalendarSearchCard {
  const metadata = academicMetadata(message);
  const title = contentString(message, "title") || (message.encryption ? "Academic deadline" : message.id);
  const dueLabel =
    contentString(message, "start_at")
    || clean(metadata.due_label)
    || clean(metadata.due_at)
    || (message.encryption ? "Date pending" : "Date retained in AFP metadata");
  const course = clean(metadata.academic_course_tag);
  const unit = clean(metadata.academic_unit_tag);
  const chapter = clean(metadata.academic_chapter_tag);
  const module = clean(metadata.academic_module_label);
  const provider = clean(metadata.provider_id) || clean(metadata.provider) || "academic import";
  const academicKind = clean(metadata.academic_kind);
  const sourceDeadlineId = clean(metadata.study_deadline_id) || clean(metadata.source_deadline_id);
  const eventScope = buildStudyAcademicCalendarEventScope({
    academicKind,
    courseTag: course,
    unitTag: unit,
    chapterTag: chapter,
    moduleLabel: module,
    providerId: provider,
    providerRecordId: clean(metadata.provider_record_id),
    studyDeadlineId: sourceDeadlineId,
    dueLabel,
    source: clean(metadata.source),
    reviewStatus: clean(metadata.review_status),
  });
  const reportKind = reportKindForAcademicEvent(title, academicKind);

  return {
    id: message.id,
    title,
    dueLabel,
    eventId: message.id,
    eventDate: eventDateFromIso(dueLabel),
    scopeLabel: eventScope.scopeLabel,
    providerLabel: eventScope.providerLabel,
    chips: eventScope.chips,
    reportIntent: buildReportIntentFromFocus({
      source: "object_search",
      preferredKind: reportKind,
      searchQuery: title,
      activeTag: course || chapter || unit || null,
      academicKind: academicKind || "academic_deadline",
      courseTag: course || null,
      chapterTag: chapter || null,
      unitTag: unit || null,
      moduleLabel: module || null,
      dueLabel,
      deadlineId: sourceDeadlineId || null,
      providerId: eventScope.providerLabel || null,
      knowledgeGraphLinkTags: eventScope.knowledgeGraphLinkTags,
    }),
  };
}

export function buildStudyAcademicCalendarSearchState(input: {
  messages: readonly AfpMessage[];
  limit?: number | null;
}): StudyAcademicCalendarSearchState | null {
  const limit = typeof input.limit === "number" && Number.isFinite(input.limit)
    ? Math.max(1, Math.floor(input.limit))
    : 4;
  const cards = input.messages
    .filter(isAcademicCalendarEvent)
    .map(cardForAcademicEvent);
  if (cards.length === 0) return null;
  const visible = cards.slice(0, limit);
  const facetQueries = unique(
    cards.flatMap((card) => card.chips.filter((chip) =>
      chip.includes(":") || chip === "academic_deadline" || chip === "calendar_event"
    )),
    10,
  );

  return {
    count: cards.length,
    headline: cards.length === 1
      ? "1 academic calendar event matched"
      : `${cards.length} academic calendar events matched`,
    detail:
      "These are first-class AFP calendar_event messages, so they can be opened in Calendar and searched by course, unit, chapter, provider, or deadline text.",
    cards: visible,
    facetQueries,
  };
}
