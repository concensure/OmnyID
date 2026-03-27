import { createSignal, For, Show, onMount, createMemo } from "solid-js";
import { apiFetch, createCalendarEvent, deleteCalendarEvent, listCalendarEvents, type CalendarEvent } from "@/lib/api";

// ── helpers ───────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay(); // 0 = Sun
}

function toIso(year: number, month: number, day: number, time = "00:00"): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}T${time}:00`;
}

function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Add Event Modal ───────────────────────────────────────────────────────────

function AddEventModal(props: {
  date: { year: number; month: number; day: number };
  onClose: () => void;
  onCreated: (event: CalendarEvent) => void;
}) {
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [time, setTime] = createSignal("09:00");
  const [endTime, setEndTime] = createSignal("10:00");
  const [allDay, setAllDay] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const [conflictSuggestion, setConflictSuggestion] = createSignal<string | null>(null);
  const [conflictChecking, setConflictChecking] = createSignal(false);

  const dateLabel = () =>
    new Date(props.date.year, props.date.month, props.date.day).toLocaleDateString(undefined, {
      weekday: "long", day: "numeric", month: "long",
    });

  async function save() {
    if (!title().trim()) { setError("Title is required."); return; }
    setSaving(true);
    setError("");
    try {
      const start = toIso(props.date.year, props.date.month, props.date.day, allDay() ? "00:00" : time());
      const end = allDay() ? undefined : toIso(props.date.year, props.date.month, props.date.day, endTime());
      const event = await createCalendarEvent({
        title: title().trim(),
        description: description().trim() || undefined,
        start_at: start,
        end_at: end,
        all_day: allDay(),
      });
      props.onCreated(event);

      // Ask agent to check for conflicts
      setConflictChecking(true);
      try {
        const resp = await apiFetch<{ summary: string }>("/ui/command", {
          method: "POST",
          bodyJson: {
            query: `Check if the newly added calendar event "${title()}" on ${dateLabel()}${allDay() ? "" : ` at ${time()}`} conflicts with any existing events. If there is a conflict, suggest the nearest conflict-free alternative time and present it as a one-line suggestion.`,
            engine: "agent",
          },
        });
        if (resp.summary && !resp.summary.toLowerCase().includes("no conflict")) {
          setConflictSuggestion(resp.summary);
        } else {
          props.onClose();
        }
      } catch {
        props.onClose();
      } finally {
        setConflictChecking(false);
      }
    } catch (e) {
      setError((e as Error).message || "Failed to save event.");
    }
    setSaving(false);
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div class="w-full max-w-md rounded-2xl border border-white/20 bg-surface p-6 shadow-2xl">
        <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Add Event</p>
        <h3 class="mt-1 text-base font-semibold text-on-surface">{dateLabel()}</h3>

        <Show when={conflictSuggestion()}>
          <div class="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <p class="text-xs font-semibold text-amber-700">⚠ Schedule Conflict Detected</p>
            <p class="mt-1 text-xs text-on-surface-variant">{conflictSuggestion()}</p>
            <div class="mt-2 flex gap-2">
              <button
                type="button"
                onClick={props.onClose}
                class="rounded-lg bg-primary px-4 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80"
              >
                Keep this time ✓
              </button>
              <button
                type="button"
                onClick={props.onClose}
                class="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs text-on-surface-variant transition hover:bg-white/20"
              >
                Dismiss
              </button>
            </div>
          </div>
        </Show>

        <Show when={!conflictSuggestion()}>
          <div class="mt-4 space-y-3">
            <div>
              <label class="block text-xs font-medium text-on-surface-variant mb-1">Title</label>
              <input
                type="text"
                value={title()}
                onInput={(e) => setTitle(e.currentTarget.value)}
                placeholder="Meeting, reminder, task…"
                class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant outline-none focus:border-primary"
                autofocus
              />
            </div>

            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="all-day"
                checked={allDay()}
                onChange={(e) => setAllDay(e.currentTarget.checked)}
                class="h-4 w-4 rounded border border-white/30 accent-primary"
              />
              <label for="all-day" class="text-xs text-on-surface-variant select-none">All day</label>
            </div>

            <Show when={!allDay()}>
              <div class="flex gap-3">
                <div class="flex-1">
                  <label class="block text-xs font-medium text-on-surface-variant mb-1">Start</label>
                  <input
                    type="time"
                    value={time()}
                    onInput={(e) => setTime(e.currentTarget.value)}
                    class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
                  />
                </div>
                <div class="flex-1">
                  <label class="block text-xs font-medium text-on-surface-variant mb-1">End</label>
                  <input
                    type="time"
                    value={endTime()}
                    onInput={(e) => setEndTime(e.currentTarget.value)}
                    class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-on-surface outline-none focus:border-primary"
                  />
                </div>
              </div>
            </Show>

            <div>
              <label class="block text-xs font-medium text-on-surface-variant mb-1">Note (optional)</label>
              <textarea
                value={description()}
                onInput={(e) => setDescription(e.currentTarget.value)}
                rows="2"
                placeholder="Details, agenda, link…"
                class="w-full rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm text-on-surface placeholder-on-surface-variant outline-none focus:border-primary resize-none"
              />
            </div>

            <Show when={error()}>
              <p class="text-xs text-red-500">{error()}</p>
            </Show>

            <div class="flex gap-2 pt-1">
              <button
                type="button"
                onClick={save}
                disabled={saving() || conflictChecking()}
                class="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-white disabled:opacity-40 transition hover:bg-primary/80"
              >
                {saving() ? "Saving…" : conflictChecking() ? "Checking conflicts…" : "Add Event"}
              </button>
              <button
                type="button"
                onClick={props.onClose}
                class="rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-sm text-on-surface-variant transition hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}

// ── Monthly Calendar View ─────────────────────────────────────────────────────

export function MonthlyCalendarView() {
  const today = new Date();
  const [year, setYear] = createSignal(today.getFullYear());
  const [month, setMonth] = createSignal(today.getMonth()); // 0-based
  const [events, setEvents] = createSignal<CalendarEvent[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [addingDate, setAddingDate] = createSignal<{ year: number; month: number; day: number } | null>(null);

  function monthKey() {
    return `${year()}-${String(month() + 1).padStart(2, "0")}-01`;
  }

  async function loadEvents() {
    setLoading(true);
    try {
      const res = await listCalendarEvents(monthKey());
      setEvents(res.events);
    } catch { /* user might not be signed in */ }
    setLoading(false);
  }

  onMount(() => { void loadEvents(); });

  function prevMonth() {
    if (month() === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
    void loadEvents();
  }

  function nextMonth() {
    if (month() === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
    void loadEvents();
  }

  // Build calendar grid: array of 42 cells (6 rows × 7 cols)
  const cells = createMemo(() => {
    const first = firstWeekday(year(), month());
    const days = daysInMonth(year(), month());
    const result: Array<number | null> = [];
    for (let i = 0; i < first; i++) result.push(null);
    for (let d = 1; d <= days; d++) result.push(d);
    while (result.length % 7 !== 0) result.push(null);
    return result;
  });

  // Map from day → events that start on that day
  const eventsByDay = createMemo(() => {
    const map = new Map<number, CalendarEvent[]>();
    for (const ev of events()) {
      const d = new Date(ev.start_at);
      if (d.getFullYear() === year() && d.getMonth() === month()) {
        const day = d.getDate();
        if (!map.has(day)) map.set(day, []);
        map.get(day)!.push(ev);
      }
    }
    return map;
  });

  const isToday = (day: number) =>
    day === today.getDate() && month() === today.getMonth() && year() === today.getFullYear();

  async function handleDelete(id: string) {
    try {
      await deleteCalendarEvent(id);
      setEvents((ev) => ev.filter((e) => e.id !== id));
    } catch { /* ignore */ }
  }

  return (
    <div class="space-y-4">
      {/* Header */}
      <div class="glass-surface rounded-xl border border-white/40 p-4 shadow-panel">
        <div class="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Calendar</p>
            <div class="mt-1 flex items-center gap-2">
              <select
                value={month()}
                onChange={(e) => { setMonth(parseInt(e.currentTarget.value)); void loadEvents(); }}
                class="rounded-lg border border-white/20 bg-surface/80 px-2 py-1 text-sm font-semibold text-on-surface"
              >
                {["January","February","March","April","May","June","July","August","September","October","November","December"].map((m, i) => (
                  <option value={i}>{m}</option>
                ))}
              </select>
              <select
                value={year()}
                onChange={(e) => { setYear(parseInt(e.currentTarget.value)); void loadEvents(); }}
                class="rounded-lg border border-white/20 bg-surface/80 px-2 py-1 text-sm font-semibold text-on-surface"
              >
                {Array.from({ length: 16 }, (_, i) => 2020 + i).map((y) => (
                  <option value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>
          <div class="flex items-center gap-1">
            <button
              type="button"
              onClick={prevMonth}
              class="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-on-surface-variant transition hover:bg-white/20"
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); void loadEvents(); }}
              class="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/20"
            >
              Today
            </button>
            <button
              type="button"
              onClick={nextMonth}
              class="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-on-surface-variant transition hover:bg-white/20"
            >
              →
            </button>
          </div>
        </div>

        {/* Weekday headers */}
        <div class="mt-4 grid grid-cols-7 gap-px">
          <For each={WEEKDAYS}>
            {(day) => (
              <div class="py-1 text-center font-mono text-[9px] uppercase tracking-wider text-outline">
                {day}
              </div>
            )}
          </For>
        </div>

        {/* Calendar grid */}
        <Show when={!loading()} fallback={
          <div class="mt-2 py-8 text-center text-xs text-on-surface-variant animate-pulse">Loading…</div>
        }>
          <div class="mt-1 grid grid-cols-7 gap-px rounded-lg overflow-hidden border border-white/10 bg-white/5">
            <For each={cells()}>
              {(day) => {
                if (day === null) {
                  return <div class="min-h-[72px] bg-white/5 p-1 opacity-30" />;
                }
                const dayEvents = () => eventsByDay().get(day) ?? [];
                return (
                  <div
                    onDblClick={() => setAddingDate({ year: year(), month: month(), day })}
                    class={`group min-h-[72px] bg-white/10 hover:bg-white/20 p-1.5 text-left transition relative cursor-default select-none ${
                      isToday(day) ? "ring-1 ring-inset ring-primary/60" : ""
                    }`}
                  >
                    <span class={`text-xs font-medium leading-none ${
                      isToday(day)
                        ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white"
                        : "text-on-surface"
                    }`}>
                      {day}
                    </span>
                    {/* Event chips */}
                    <div class="mt-1 space-y-0.5">
                      <For each={dayEvents().slice(0, 3)}>
                        {(ev) => (
                          <div class="flex items-center gap-1 overflow-hidden rounded bg-primary/20 px-1 py-0.5">
                            <span class="h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
                            <span class="truncate font-mono text-[9px] text-primary leading-tight">
                              {ev.all_day ? ev.title : `${formatTime(ev.start_at)} ${ev.title}`}
                            </span>
                          </div>
                        )}
                      </For>
                      <Show when={dayEvents().length > 3}>
                        <span class="font-mono text-[9px] text-on-surface-variant pl-1">
                          +{dayEvents().length - 3} more
                        </span>
                      </Show>
                    </div>
                    {/* + button: single click opens add-event modal */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setAddingDate({ year: year(), month: month(), day }); }}
                      class="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded bg-primary/20 text-[11px] text-primary opacity-0 transition hover:bg-primary/40 group-hover:opacity-100"
                      title="Add event"
                    >
                      +
                    </button>
                  </div>
                );
              }}
            </For>
          </div>
        </Show>
      </div>

      {/* Event list for current month */}
      <Show when={events().length > 0}>
        <div class="glass-surface rounded-xl border border-white/40 p-4 shadow-panel">
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline mb-3">
            Events this month
          </p>
          <div class="space-y-2">
            <For each={[...events()].sort((a, b) => a.start_at.localeCompare(b.start_at))}>
              {(ev) => (
                <div class="flex items-start gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div class="mt-0.5 h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-on-surface truncate">{ev.title}</p>
                    <p class="text-xs text-on-surface-variant">
                      {ev.all_day
                        ? new Date(ev.start_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : new Date(ev.start_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                      }
                      {ev.end_at && !ev.all_day && ` → ${formatTime(ev.end_at)}`}
                    </p>
                    <Show when={ev.description}>
                      <p class="mt-0.5 text-xs text-on-surface-variant opacity-70 truncate">{ev.description}</p>
                    </Show>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDelete(ev.id)}
                    class="flex-shrink-0 rounded px-2 py-0.5 text-[11px] text-on-surface-variant opacity-40 hover:opacity-100 hover:text-red-400 transition"
                    title="Remove event"
                  >
                    ×
                  </button>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Add event modal */}
      <Show when={addingDate()}>
        <AddEventModal
          date={addingDate()!}
          onClose={() => setAddingDate(null)}
          onCreated={(ev) => {
            setEvents((prev) => [...prev, ev]);
            setAddingDate(null);
          }}
        />
      </Show>
    </div>
  );
}
