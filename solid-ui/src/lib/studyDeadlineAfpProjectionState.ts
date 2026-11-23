// @locs-version: 1.0
import type { AfpMessage, CalendarEvent, SendAfpMessageInput } from "@/lib/api";
import type { StudyDeadline } from "@/lib/studyDeadlineLocalState";
import { buildStudyAcademicCalendarEventScope } from "@/lib/studyAcademicCalendarEventScopeState";

export const STUDY_DEADLINE_AFP_PROJECTIONS_KEY = "omnyid.study-deadline-afp-projections";

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function projectionId(deadline: StudyDeadline): string {
  return `afp-calendar-event:${deadline.id}`;
}

function threadId(deadline: StudyDeadline): string {
  return `calendar_event:${deadline.id}`;
}

function isImportedSource(deadline: StudyDeadline): boolean {
  return deadline.source === "calendar" || deadline.source === "lms";
}

function descriptionForDeadline(deadline: StudyDeadline): string {
  const scope = buildStudyAcademicCalendarEventScope({
    academicKind: deadline.kind,
    courseTag: deadline.courseTag,
    unitTag: deadline.unitTag,
    chapterTag: deadline.chapterTag,
    moduleLabel: deadline.moduleLabel,
    providerId: deadline.providerId,
    providerRecordId: deadline.providerRecordId,
    studyDeadlineId: deadline.id,
    dueLabel: deadline.dueLabel,
    source: deadline.source,
    reviewStatus: deadline.reviewStatus,
  });
  const parts = [
    `${deadline.kind} imported from ${deadline.source === "calendar" ? "calendar" : "LMS"}.`,
    `Due: ${deadline.dueLabel}.`,
    scope.scopeParts.length > 0 ? `Scope: ${scope.scopeParts.join(" / ")}.` : null,
    clean(deadline.providerId) ? `Provider: ${clean(deadline.providerId)}.` : null,
    clean(deadline.providerRecordId) ? `Provider record: ${clean(deadline.providerRecordId)}.` : null,
  ].filter((value): value is string => Boolean(value));
  return parts.join(" ");
}

export function shouldProjectStudyDeadlineToAfpCalendarEvent(deadline: StudyDeadline): boolean {
  return isImportedSource(deadline)
    && deadline.reviewStatus === "accepted"
    && Boolean(clean(deadline.dueAt));
}

export function studyDeadlineToAfpCalendarMessage(deadline: StudyDeadline, nowIso = new Date().toISOString()): AfpMessage | null {
  if (!shouldProjectStudyDeadlineToAfpCalendarEvent(deadline)) return null;
  const dueAt = clean(deadline.dueAt)!;
  const eventScope = buildStudyAcademicCalendarEventScope({
    academicKind: deadline.kind,
    courseTag: deadline.courseTag,
    unitTag: deadline.unitTag,
    chapterTag: deadline.chapterTag,
    moduleLabel: deadline.moduleLabel,
    providerId: deadline.providerId,
    providerRecordId: deadline.providerRecordId,
    studyDeadlineId: deadline.id,
    dueLabel: deadline.dueLabel,
    source: deadline.source,
    reviewStatus: deadline.reviewStatus,
  });
  const metadata = {
    origin: "study_lens",
    projection: "study_deadline_to_afp_calendar_event",
    ...eventScope.metadata,
  };

  return {
    id: projectionId(deadline),
    thread_id: threadId(deadline),
    from: "system://study-lens",
    to: ["agent://calendar", "agent://study"],
    timestamp: nowIso,
    type: "calendar_event",
    kind: "event",
    subtype: "academic_deadline",
    supertags: eventScope.supertags,
    content: {
      kind: "calendar_event",
      title: deadline.title,
      description: descriptionForDeadline(deadline),
      start_at: dueAt,
      end_at: null,
      all_day: false,
      status: "confirmed",
      source: deadline.source,
      study_deadline_id: deadline.id,
      provider_id: eventScope.metadata.provider_id,
      provider_record_id: eventScope.metadata.provider_record_id,
      academic_kind: eventScope.metadata.academic_kind,
      academic_course_tag: eventScope.metadata.academic_course_tag,
      academic_unit_tag: eventScope.metadata.academic_unit_tag,
      academic_chapter_tag: eventScope.metadata.academic_chapter_tag,
      academic_module_label: eventScope.metadata.academic_module_label,
    },
    metadata,
    views: [
      {
        format: "calendar",
        content: {
          event_id: projectionId(deadline),
          start_at: dueAt,
          title: deadline.title,
          source: deadline.source,
          academic_kind: deadline.kind,
          academic_scope: eventScope.scopeLabel,
          provider_id: eventScope.providerLabel,
        },
      },
    ],
    attachments: [],
    references: [
      {
        type: "study_deadline",
        target: deadline.id,
        label: deadline.title,
        metadata: {
          source: deadline.source,
          provider_id: clean(deadline.providerId),
          provider_record_id: clean(deadline.providerRecordId),
        },
      },
    ],
  };
}

export function studyDeadlineToCalendarEvent(deadline: StudyDeadline): CalendarEvent | null {
  const message = studyDeadlineToAfpCalendarMessage(deadline);
  if (!message) return null;
  return afpCalendarMessageToCalendarEvent(message);
}

export function studyDeadlinesToAfpCalendarMessages(deadlines: StudyDeadline[], nowIso?: string): AfpMessage[] {
  return deadlines.flatMap((deadline): AfpMessage[] => {
    const message = studyDeadlineToAfpCalendarMessage(deadline, nowIso);
    return message ? [message] : [];
  });
}

export function afpCalendarMessageToCalendarEvent(message: AfpMessage): CalendarEvent | null {
  const content = message.content;
  const kind = typeof content.kind === "string" ? content.kind : null;
  if (message.type !== "calendar_event" && kind !== "calendar_event") return null;
  const title = typeof content.title === "string" && content.title.trim() ? content.title.trim() : null;
  const startAt =
    typeof content.start_at === "string" && content.start_at.trim()
      ? content.start_at.trim()
      : typeof content.start === "string" && content.start.trim()
        ? content.start.trim()
        : null;
  if (!title || !startAt) return null;
  const status = content.status === "tentative" || content.status === "cancelled" ? content.status : "confirmed";
  const metadata = message.metadata ?? {};
  return {
    id: message.id,
    title,
    description: typeof content.description === "string" ? content.description : null,
    start_at: startAt,
    end_at: typeof content.end_at === "string" || content.end_at === null ? content.end_at : null,
    all_day: typeof content.all_day === "boolean" ? content.all_day : false,
    location: typeof content.location === "string" || content.location === null ? content.location : null,
    status,
    note_kind: message.subtype ?? null,
    prep_lead_minutes: null,
    profile: {
      ...metadata,
      afp_message_id: message.id,
      afp_thread_id: message.thread_id,
      supertags: message.supertags ?? [],
    },
  };
}

export function afpMessagesToCalendarEvents(messages: AfpMessage[]): CalendarEvent[] {
  return messages.flatMap((message): CalendarEvent[] => {
    const event = afpCalendarMessageToCalendarEvent(message);
    return event ? [event] : [];
  });
}

export function studyDeadlineToAfpSendInput(deadline: StudyDeadline, nowIso = new Date().toISOString()): SendAfpMessageInput | null {
  const message = studyDeadlineToAfpCalendarMessage(deadline, nowIso);
  if (!message) return null;
  return {
    thread_id: message.thread_id,
    from: message.from,
    to: message.to ?? ["agent://calendar", "agent://study"],
    timestamp: message.timestamp,
    type: message.type,
    kind: message.kind,
    subtype: message.subtype ?? undefined,
    content: message.content,
    views: message.views,
    attachments: message.attachments,
    references: message.references,
    metadata: message.metadata,
    store_in_relational: true,
  };
}

export function loadStudyDeadlineAfpProjectionIds(storage: Storage = localStorage): string[] {
  const raw = storage.getItem(STUDY_DEADLINE_AFP_PROJECTIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : [];
  } catch {
    storage.removeItem(STUDY_DEADLINE_AFP_PROJECTIONS_KEY);
    return [];
  }
}

export function hasSentStudyDeadlineAfpProjection(deadlineId: string, storage: Storage = localStorage): boolean {
  return loadStudyDeadlineAfpProjectionIds(storage).includes(deadlineId);
}

export function markStudyDeadlineAfpProjectionSent(deadlineId: string, storage: Storage = localStorage): void {
  const cleanId = deadlineId.trim();
  if (!cleanId) return;
  const next = [...new Set([cleanId, ...loadStudyDeadlineAfpProjectionIds(storage)])].slice(0, 200);
  storage.setItem(STUDY_DEADLINE_AFP_PROJECTIONS_KEY, JSON.stringify(next));
}

export function unmarkStudyDeadlineAfpProjectionSent(deadlineId: string, storage: Storage = localStorage): void {
  const cleanId = deadlineId.trim();
  if (!cleanId) return;
  const next = loadStudyDeadlineAfpProjectionIds(storage).filter((id) => id !== cleanId);
  if (next.length > 0) {
    storage.setItem(STUDY_DEADLINE_AFP_PROJECTIONS_KEY, JSON.stringify(next));
  } else {
    storage.removeItem(STUDY_DEADLINE_AFP_PROJECTIONS_KEY);
  }
}
