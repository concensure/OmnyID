import { For } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";

type CalendarEvent = {
  id?: string;
  title?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
  status?: string;
};

/**
 * Renders AFP messages as a timeline / calendar event surface.
 * Agents write `views: [{format:"calendar", content:{events:[...]}}]`.
 */
export function CalendarRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const calContent = () => props.view?.content ?? props.message.content;

  const events = (): CalendarEvent[] => {
    const raw = calContent().events;
    if (Array.isArray(raw)) return raw as CalendarEvent[];
    // Single-event fallback from content fields
    return [
      {
        title:
          (calContent().title as string | undefined) ??
          (calContent().subject as string | undefined) ??
          props.message.type,
        start: (calContent().start as string | undefined) ?? props.message.timestamp,
        end: calContent().end as string | undefined,
        description: (calContent().description as string | undefined) ?? (calContent().body as string | undefined),
        location: calContent().location as string | undefined,
        status: calContent().status as string | undefined
      }
    ];
  };

  const statusColor = (status?: string) => {
    if (!status) return "bg-primary";
    if (status === "cancelled") return "bg-error";
    if (status === "tentative") return "bg-amber-400";
    return "bg-green-500";
  };

  return (
    <div class="space-y-2">
      <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">
        Calendar · {props.message.from}
      </p>
      <div class="space-y-2">
        <For each={events()}>
          {(event) => (
            <div class="flex gap-4 rounded-2xl border border-white/30 bg-white/25 px-4 py-3">
              <div class={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${statusColor(event.status)}`} />
              <div class="min-w-0 flex-1">
                <p class="truncate font-medium text-on-surface">{event.title ?? "Untitled event"}</p>
                <div class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-on-surface-variant">
                  {event.start && (
                    <span>
                      {formatDateTime(event.start)}
                      {event.end ? ` → ${formatDateTime(event.end)}` : ""}
                    </span>
                  )}
                  {event.location && <span>📍 {event.location}</span>}
                </div>
                {event.description && (
                  <p class="mt-2 text-sm leading-6 text-on-surface-variant">{event.description}</p>
                )}
              </div>
              {event.status && (
                <span class="shrink-0 self-start rounded-full bg-white/55 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-on-surface-variant">
                  {event.status}
                </span>
              )}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return iso;
  }
}
