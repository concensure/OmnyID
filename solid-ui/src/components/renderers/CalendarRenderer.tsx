import { For, Show, createMemo } from "solid-js";
import type { AfpMessage, AfpView, CalendarEvent as ApiCalendarEvent } from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { surfaceNoteHeaderTimestamp } from "@/lib/surfaceTimestampPresentation";

type CalendarViewEvent = Partial<ApiCalendarEvent> & {
  start?: string;
  end?: string;
};

type CalendarEventCardState = {
  title: string;
  scheduleText: string | null;
  locationText: string | null;
  semanticDetailText: string | null;
  descriptionText: string | null;
  statusText: string | null;
  statusToneClass: string;
};

const CALENDAR_TITLE_SEPARATOR = " · ";
const CALENDAR_RANGE_SEPARATOR = " -> ";
const CALENDAR_HEADER_ICON = "Calendar";
const CALENDAR_EMPTY_ICON = "📅";
const CALENDAR_EMPTY_TITLE = "No calendar events yet";
const CALENDAR_EMPTY_BODY =
  "This calendar card does not include any event times or scheduling details yet.";
const CALENDAR_LOCATION_PREFIX = "Location: ";

const CALENDAR_EVENT_CARD_CLASS =
  "flex min-w-0 flex-col gap-3 rounded-2xl border border-white/30 bg-white/25 px-4 py-3 sm:flex-row sm:gap-4";
const CALENDAR_STATUS_BADGE_CLASS =
  "max-w-full break-words self-start rounded-full bg-white/55 px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-on-surface-variant";
const CALENDAR_SEMANTIC_DETAIL_CLASS =
  "mt-2 text-xs font-medium uppercase tracking-[0.16em] text-on-surface-variant/70";
const CALENDAR_DESCRIPTION_CLASS = "mt-2 text-sm leading-6 text-on-surface-variant";

function calendarStatus(value: unknown): ApiCalendarEvent["status"] | undefined {
  if (value === "confirmed" || value === "tentative" || value === "cancelled") {
    return value;
  }
  return undefined;
}

function calendarString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function formatDateTime(iso: string): string {
  return surfaceNoteHeaderTimestamp(iso) || iso;
}

function semanticLabel(event: CalendarViewEvent): string | null {
  const anchorType =
    typeof event.profile?.schedule_anchor_type === "string"
      ? event.profile.schedule_anchor_type.replaceAll("_", " ")
      : null;
  const noteKind =
    (
      event.note_kind ??
      (typeof event.profile?.schedule_note_kind === "string"
        ? event.profile.schedule_note_kind
        : null)
    )?.replaceAll("_", " ") ?? null;
  if (anchorType && noteKind) return `${anchorType}${CALENDAR_TITLE_SEPARATOR}${noteKind}`;
  if (anchorType) return anchorType;
  if (noteKind) return noteKind;
  return null;
}

function semanticDetail(event: CalendarViewEvent): string | null {
  const prepLeadMinutes =
    typeof event.prep_lead_minutes === "number"
      ? event.prep_lead_minutes
      : typeof event.profile?.prep_lead_minutes === "number"
        ? event.profile.prep_lead_minutes
        : null;
  const prepLead = typeof prepLeadMinutes === "number" ? `${prepLeadMinutes} min prep window` : null;
  return [semanticLabel(event), prepLead].filter((value): value is string => Boolean(value)).join(
    CALENDAR_TITLE_SEPARATOR,
  ) || null;
}

function statusToneClass(event: CalendarViewEvent) {
  if (event.status === "cancelled") return "bg-error";
  if (event.status === "tentative") {
    const noteKind =
      (
        event.note_kind ??
        (typeof event.profile?.schedule_note_kind === "string"
          ? event.profile.schedule_note_kind
          : null)
      )
        ?.trim()
        .toLowerCase() ?? null;
    const anchorType =
      typeof event.profile?.schedule_anchor_type === "string"
        ? event.profile.schedule_anchor_type.trim().toLowerCase()
        : null;
    if (noteKind === "high_stakes_prep") return "bg-orange-500";
    if (anchorType === "interview") return "bg-fuchsia-500";
    if (anchorType === "medical") return "bg-cyan-500";
    if (anchorType === "logistics") return "bg-lime-500";
    if (anchorType === "meeting") return "bg-amber-500";
    return "bg-amber-400";
  }
  if (!event.status) return "bg-primary";
  return "bg-green-500";
}

function normalizeEvents(message: AfpMessage, view?: AfpView): CalendarViewEvent[] {
  const content = afpRecord(message.encryption ? decryptedDisplayContent(message) : view?.content ?? decryptedDisplayContent(message));
  const rawEvents = content.events;

  if (Array.isArray(rawEvents)) {
    return rawEvents as CalendarViewEvent[];
  }

  const explicitStart = calendarString(content.start);
  const explicitEnd = calendarString(content.end);
  const explicitTitle = calendarString(content.title) ?? calendarString(content.subject);
  const explicitDescription = calendarString(content.description) ?? calendarString(content.body);
  const explicitLocation = calendarString(content.location);
  const explicitStatus = calendarStatus(content.status);

  if (
    !explicitStart &&
    !explicitEnd &&
    !explicitTitle &&
    !explicitDescription &&
    !explicitLocation &&
    !explicitStatus
  ) {
    return [];
  }

  return [
    {
      title: explicitTitle ?? message.type,
      start: explicitStart ?? message.timestamp,
      end: explicitEnd,
      description: explicitDescription,
      location: explicitLocation,
      status: explicitStatus,
    },
  ];
}

function eventCardState(event: CalendarViewEvent): CalendarEventCardState {
  const primaryStart = event.start ?? event.start_at;
  const primaryEnd = event.end ?? event.end_at;
  const scheduleText = primaryStart
    ? `${formatDateTime(primaryStart)}${primaryEnd ? `${CALENDAR_RANGE_SEPARATOR}${formatDateTime(primaryEnd)}` : ""}`
    : null;

  return {
    title: event.title ?? "Untitled event",
    scheduleText,
    locationText: event.location ? `${CALENDAR_LOCATION_PREFIX}${event.location}` : null,
    semanticDetailText: semanticDetail(event),
    descriptionText: event.description ?? null,
    statusText: event.status ?? null,
    statusToneClass: statusToneClass(event),
  };
}

export function CalendarRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const rendererState = createMemo(() => {
    const items = normalizeEvents(props.message, props.view).map((event) => ({
      event,
      cardState: eventCardState(event),
    }));

    return {
      headerText: `${CALENDAR_HEADER_ICON}${CALENDAR_TITLE_SEPARATOR}${props.message.from}`,
      items,
      showEvents: items.length > 0,
    };
  });

  return (
    <div class="space-y-2">
      <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">
        {rendererState().headerText}
      </p>
      <Show
        when={rendererState().showEvents}
        fallback={
          <EmptyState
            icon={CALENDAR_EMPTY_ICON}
            title={CALENDAR_EMPTY_TITLE}
            body={CALENDAR_EMPTY_BODY}
          />
        }
      >
        <div class="space-y-2">
          <For each={rendererState().items}>
            {({ cardState }) => (
              <div class={CALENDAR_EVENT_CARD_CLASS}>
                <div class={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${cardState.statusToneClass}`} />
                <div class="min-w-0 flex-1">
                  <p class="break-words font-medium text-on-surface">{cardState.title}</p>
                  <div class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-on-surface-variant">
                    <Show when={cardState.scheduleText}>
                      <span>{cardState.scheduleText}</span>
                    </Show>
                    <Show when={cardState.locationText}>
                      <span class="break-words">{cardState.locationText}</span>
                    </Show>
                  </div>
                  <Show when={cardState.semanticDetailText}>
                    <p class={CALENDAR_SEMANTIC_DETAIL_CLASS}>{cardState.semanticDetailText}</p>
                  </Show>
                  <Show when={cardState.descriptionText}>
                    <p class={CALENDAR_DESCRIPTION_CLASS}>{cardState.descriptionText}</p>
                  </Show>
                </div>
                <Show when={cardState.statusText}>
                  <span class={CALENDAR_STATUS_BADGE_CLASS}>{cardState.statusText}</span>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
