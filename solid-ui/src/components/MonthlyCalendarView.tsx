import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import {
  createCalendarEvent,
  executeUiCommand,
  deleteCalendarEvent,
  disconnectGoogleCalendar,
  fetchBacklinksForMessage,
  fetchGoogleCalendarOAuthConfig,
  fetchGoogleCalendarOAuthUrl,
  fetchGoogleCalendarStatus,
  installDefaultSupertags,
  listCalendarEvents,
  sendAfpMessage,
  syncGoogleCalendar,
  type BacklinkItem,
  type CalendarEvent,
  type DashboardBootstrap,
  type GoogleCalendarOAuthConfig,
} from "@/lib/api";
import { type GoogleCalendarConnectionStatus } from "@/lib/googleCalendarConnectionState";
import { WeddingNavigationArrivalBanner } from "@/components/WeddingNavigationArrivalBanner";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { navigateToView } from "@/lib/decisionosNavigation";
import {
  CALENDAR_CATEGORY_META,
  calendarAbsoluteDateLabel,
  calendarBuildMiniCalendar,
  calendarCommandSummary,
  calendarDateTimeIso,
  calendarDaysInMonth,
  calendarEventOverlaps,
  calendarEventsFromAfpMessages,
  calendarFirstWeekday,
  calendarIsSameDay,
  calendarItemFromEvent,
  calendarLongDateLabel,
  calendarMatchesSearch,
  mergeCalendarEvents,
  calendarMonthLabel,
  calendarMonthShortLabel,
  calendarMonthStartIso,
  calendarNormalizeText,
  calendarReviewActionLabel,
  calendarReviewSummaryText,
  calendarStartOfDay,
  calendarTimeLabel,
  type CalendarItem,
  type CategoryKey,
  type DerivedCategory,
  type QuickFilter,
  type ViewMode,
} from "@/lib/monthlyCalendarViewState";
import { consumeWeddingNavigationIntent } from "@/lib/weddingNavigationLocalState";
import {
  buildWeddingNavigationArrivalBannerState,
  weddingArrivalActionDestinationView,
  type WeddingArrivalAction,
} from "@/lib/weddingNavigationArrivalViewState";

const TOKEN = {
  accent: "#FF6B35",
  bg: "#F8F5F0",
  surface: "#FFFFFF",
  text: "#1C1C1C",
  textSecondary: "#666666",
  border: "#E5E0D8",
  success: "#2E8B57",
  error: "#E63939",
  topBarH: "3.5em",
  sidebarW: "15em",
  sidebarCollapsed: "4em",
  rightPanelW: "20em",
  searchMaxW: "30em",
  searchH: "2.5em",
  mainPadding: "2em",
  sidebarPadding: "1.5em",
  gap: "0.75em",
  sectionGap: "1.5em",
  touchTarget: "2.75em",
  transition: "120ms cubic-bezier(0.4, 0, 0.2, 1)",
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type CalendarSpeechRecognition = SpeechRecognition & {
  maxAlternatives: number;
};

type CalendarSpeechRecognitionCtor = new () => CalendarSpeechRecognition;
type CalendarSpeechWindow = Window & {
  SpeechRecognition?: unknown;
  webkitSpeechRecognition?: unknown;
};

function speechRecognitionCtor(): CalendarSpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const browserWindow: CalendarSpeechWindow = window;
  const ctor = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
  return typeof ctor === "function" ? ctor as CalendarSpeechRecognitionCtor : null;
}

function AddEventModal(props: {
  date: Date;
  onClose: () => void;
  onCreated: (event: CalendarEvent) => void;
}) {
  const [itemType, setItemType] = createSignal<"event" | "task">("event");
  const [title, setTitle] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [location, setLocation] = createSignal("");
  const [time, setTime] = createSignal("09:00");
  const [endTime, setEndTime] = createSignal("10:00");
  const [allDay, setAllDay] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");
  const [conflictSuggestion, setConflictSuggestion] = createSignal<string | null>(null);

  // ── Voice note capture (Web Speech API — live transcription) ────────────
  const [voiceRecording, setVoiceRecording] = createSignal(false);
  const [voiceLiveText, setVoiceLiveText] = createSignal("");
  let recognitionRef: CalendarSpeechRecognition | null = null;

  const speechApiAvailable = () => speechRecognitionCtor() !== null;

  function startVoiceCapture() {
    setError("");
    const SpeechRecognitionCtor = speechRecognitionCtor();
    if (!SpeechRecognitionCtor) {
      setError("Voice capture is not supported in this browser. Try Chrome or Edge.");
      return;
    }
    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + " ";
        } else {
          interim = result[0].transcript;
        }
      }
      setVoiceLiveText((finalTranscript + interim).trim());
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "aborted") setError(`Voice error: ${event.error}`);
      setVoiceRecording(false);
    };
    recognition.onend = () => {
      setVoiceRecording(false);
      const transcript = finalTranscript.trim();
      if (transcript) {
        setTitle((prev) => prev || transcript.split(/[.!?]/)[0].trim().slice(0, 80));
        setDescription(transcript);
      }
      setVoiceLiveText("");
    };

    recognitionRef = recognition;
    recognition.start();
    setVoiceRecording(true);
  }

  function stopVoiceCapture() {
    recognitionRef?.stop();
    setVoiceRecording(false);
  }

  const dateLabel = () => calendarLongDateLabel(props.date);

  async function save() {
    if (!title().trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (itemType() === "task") {
        const dueIso = calendarDateTimeIso(props.date.getFullYear(), props.date.getMonth(), props.date.getDate(), time());
        await sendAfpMessage({
          thread_id: `task_${Date.now()}`,
          from: "user@omnyid.local",
          to: ["agent://calendar"],
          type: "task",
          content: {
            kind: "task",
            title: title().trim(),
            due_date: dueIso,
            description: description().trim() || undefined,
            status: "pending",
          },
          metadata: {
            origin: "calendar_view",
            item_kind: "task",
          },
          memory_scope: {
            memory_space: "personal",
            author_mask: "private",
            author_type: "human",
            human_only: true,
          },
        });
        props.onClose();
        return;
      }
      const start = calendarDateTimeIso(props.date.getFullYear(), props.date.getMonth(), props.date.getDate(), allDay() ? "00:00" : time());
      const end = allDay() ? undefined : calendarDateTimeIso(props.date.getFullYear(), props.date.getMonth(), props.date.getDate(), endTime());
      const event = await createCalendarEvent({
        title: title().trim(),
        description: description().trim() || undefined,
        location: location().trim() || undefined,
        start_at: start,
        end_at: end,
        all_day: allDay(),
      });
      props.onCreated(event);
      try {
        const response = await executeUiCommand({
          query: `Check whether calendar event "${title().trim()}" on ${dateLabel()}${allDay() ? "" : ` at ${time()}`} conflicts with existing events. If it conflicts, return one brief alternative suggestion.`,
          engine: "agent",
        });
        const summary = calendarCommandSummary(response);
        if (summary && !summary.toLowerCase().includes("no conflict")) {
          setConflictSuggestion(summary);
        } else {
          props.onClose();
        }
      } catch {
        props.onClose();
      }
    } catch (err) {
      setError((err as Error).message || "Failed to create event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: "0",
        "z-index": "70",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        background: "rgba(17, 17, 17, 0.35)",
        "backdrop-filter": "blur(8px)",
        padding: "1.5em",
      }}
    >
      <div
        style={{
          width: "100%",
          "max-width": "30em",
          background: TOKEN.surface,
          border: `1px solid ${TOKEN.border}`,
          "border-radius": "1em",
          padding: "1.5em",
          "box-shadow": "0 24px 60px rgba(28, 28, 28, 0.12)",
        }}
      >
        <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "0.75em" }}>
          <div>
            <p style={{ margin: 0, "font-size": "0.75em", "letter-spacing": "0.18em", "text-transform": "uppercase", color: TOKEN.textSecondary }}>
              {itemType() === "task" ? "Add Task" : "Add Event"}
            </p>
            <h3 style={{ margin: "0.35em 0 0", "font-size": "1.125em", color: TOKEN.text }}>{dateLabel()}</h3>
          </div>
          <Show when={speechApiAvailable()}>
            <button
              type="button"
              title={voiceRecording() ? "Stop recording" : "Record voice note"}
              onClick={() => (voiceRecording() ? stopVoiceCapture() : startVoiceCapture())}
              style={{
                border: `1px solid ${voiceRecording() ? TOKEN.accent : TOKEN.border}`,
                background: voiceRecording() ? "#fff2eb" : TOKEN.bg,
                color: voiceRecording() ? TOKEN.accent : TOKEN.textSecondary,
                "border-radius": "0.75em",
                padding: "0.55em 0.8em",
                cursor: "pointer",
                "font-size": "0.8em",
                display: "flex",
                "align-items": "center",
                gap: "0.4em",
                "flex-shrink": 0,
                transition: TOKEN.transition,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="4.5" y="1" width="5" height="8" rx="2.5" fill={voiceRecording() ? TOKEN.accent : "currentColor"} />
                <path d="M2 7.5a5 5 0 0 0 10 0M7 12.5v1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" />
              </svg>
              {voiceRecording() ? "Stop" : "Voice"}
            </button>
          </Show>
        </div>

        {/* Event / Task tab switcher */}
        <div style={{ display: "flex", background: TOKEN.bg, border: `1px solid ${TOKEN.border}`, "border-radius": "0.75em", padding: "0.22em", "margin-top": "1em" }}>
          <button
            type="button"
            disabled={saving()}
            onClick={() => { setItemType("event"); setError(""); }}
            style={{ flex: 1, border: "none", background: itemType() === "event" ? TOKEN.surface : "transparent",
              color: itemType() === "event" ? TOKEN.text : TOKEN.textSecondary, "border-radius": "0.55em",
              padding: "0.55em", cursor: "pointer", "font-size": "0.84em", "font-weight": itemType() === "event" ? 600 : 400,
              "box-shadow": itemType() === "event" ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: TOKEN.transition }}
          >Event</button>
          <button
            type="button"
            disabled={saving()}
            onClick={() => { setItemType("task"); setError(""); }}
            style={{ flex: 1, border: "none", background: itemType() === "task" ? TOKEN.surface : "transparent",
              color: itemType() === "task" ? TOKEN.text : TOKEN.textSecondary, "border-radius": "0.55em",
              padding: "0.55em", cursor: "pointer", "font-size": "0.84em", "font-weight": itemType() === "task" ? 600 : 400,
              "box-shadow": itemType() === "task" ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: TOKEN.transition }}
          >Task</button>
        </div>

        <Show when={voiceRecording() || voiceLiveText()}>
          <div
            style={{
              margin: "1em 0 0",
              background: voiceRecording() ? "#fff8f5" : TOKEN.bg,
              border: `1px solid ${voiceRecording() ? TOKEN.accent : TOKEN.border}`,
              "border-radius": "0.9em",
              padding: "0.85em",
              transition: TOKEN.transition,
            }}
          >
            <p style={{ margin: 0, "font-size": "0.76em", "font-weight": 600, color: TOKEN.accent }}>
              {voiceRecording() ? "Recording… speak your event" : "Transcription complete"}
            </p>
            <Show when={voiceLiveText()}>
              <p style={{ margin: "0.4em 0 0", "font-size": "0.84em", color: TOKEN.text, "line-height": 1.6 }}>
                {voiceLiveText()}
              </p>
            </Show>
          </div>
        </Show>

        <Show when={conflictSuggestion()}>
          <div
            style={{
              margin: "1.25em 0 0",
              background: "#fff5ef",
              border: `1px solid rgba(255, 107, 53, 0.22)`,
              "border-radius": "0.9em",
              padding: "0.95em",
            }}
          >
            <p style={{ margin: 0, "font-size": "0.78em", "font-weight": 700, color: TOKEN.accent }}>Schedule conflict detected</p>
            <p style={{ margin: "0.5em 0 0", "font-size": "0.84em", color: TOKEN.text, "line-height": 1.6 }}>{conflictSuggestion()}</p>
            <div style={{ display: "flex", gap: "0.6em", "margin-top": "0.9em", "flex-wrap": "wrap" }}>
              <button type="button" onClick={props.onClose} style={primaryButtonStyle()}>
                Keep event
              </button>
              <button type="button" onClick={props.onClose} style={secondaryButtonStyle()}>
                Dismiss
              </button>
            </div>
          </div>
        </Show>

        <Show when={!conflictSuggestion()}>
          <div style={{ display: "flex", "flex-direction": "column", gap: "0.95em", "margin-top": "1.25em" }}>
            <Field label="Title">
              <input
                type="text"
                value={title()}
                disabled={saving()}
                onInput={(event) => setTitle(event.currentTarget.value)}
                placeholder={itemType() === "task" ? "Task name" : "Meeting, reminder…"}
                style={fieldStyle()}
                autofocus
              />
            </Field>

            <Show when={itemType() === "event"}>
              <Field label="Location">
                <input
                  type="text"
                  value={location()}
                  disabled={saving()}
                  onInput={(event) => setLocation(event.currentTarget.value)}
                  placeholder="Bondi, Zoom, Office"
                  style={fieldStyle()}
                />
              </Field>

              <label style={{ display: "flex", "align-items": "center", gap: "0.6em", color: TOKEN.textSecondary, "font-size": "0.875em" }}>
                <input type="checkbox" checked={allDay()} disabled={saving()} onChange={(event) => setAllDay(event.currentTarget.checked)} />
                All day
              </label>

              <Show when={!allDay()}>
                <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "0.75em" }}>
                  <Field label="Start">
                    <input type="time" value={time()} disabled={saving()} onInput={(event) => setTime(event.currentTarget.value)} style={fieldStyle()} />
                  </Field>
                  <Field label="End">
                    <input type="time" value={endTime()} disabled={saving()} onInput={(event) => setEndTime(event.currentTarget.value)} style={fieldStyle()} />
                  </Field>
                </div>
              </Show>
            </Show>

            <Show when={itemType() === "task"}>
              <Field label="Due time">
                <input type="time" value={time()} disabled={saving()} onInput={(event) => setTime(event.currentTarget.value)} style={fieldStyle()} />
              </Field>
            </Show>

            <Field label={itemType() === "task" ? "Notes" : "Note"}>
              <TiptapEditor
                mode="compact"
                initialContent={description()}
                disabled={saving()}
                placeholder={itemType() === "task" ? "Details, links…" : "Details, agenda, link"}
                submitLabel={saving() ? "Saving..." : itemType() === "task" ? "Add task" : "Add event"}
                clearOnSend={false}
                onChange={(_, markdown) => setDescription(markdown)}
                onSend={async () => {
                  await save();
                }}
              />
            </Field>

            <Show when={error()}>
              <p style={{ margin: 0, "font-size": "0.82em", color: TOKEN.error }}>{error()}</p>
            </Show>

            <div style={{ display: "flex", gap: "0.6em", "flex-wrap": "wrap" }}>
              <button type="button" onClick={save} disabled={saving()} style={primaryButtonStyle(saving())}>
                {saving() ? "Saving..." : itemType() === "task" ? "Add task" : "Add event"}
              </button>
              <button type="button" onClick={props.onClose} disabled={saving()} style={secondaryButtonStyle()}>
                Cancel
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}

function Field(props: { label: string; children: any }) {
  return (
    <label style={{ display: "flex", "flex-direction": "column", gap: "0.45em" }}>
      <span style={{ "font-size": "0.76em", "letter-spacing": "0.14em", "text-transform": "uppercase", color: TOKEN.textSecondary }}>
        {props.label}
      </span>
      {props.children}
    </label>
  );
}

export function MonthlyCalendarView(props: {
  initialDate?: string | null;
  initialEventId?: string | null;
  afpMessages?: DashboardBootstrap["messages"];
  reversibleSummary?: DashboardBootstrap["calendar_runtime_summary"];
  onOpenThread?: (threadId: string, messageId?: string | null) => void;
}) {
  const today = new Date();
  const [year, setYear] = createSignal(today.getFullYear());
  const [month, setMonth] = createSignal(today.getMonth());
  const [events, setEvents] = createSignal<CalendarItem[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [sidebarOpen, setSidebarOpen] = createSignal(true);
  const [viewMode, setViewMode] = createSignal<ViewMode>("month");
  const [search, setSearch] = createSignal("");
  const [selectedCategories, setSelectedCategories] = createSignal<CategoryKey[]>([]);
  const [quickFilter, setQuickFilter] = createSignal<QuickFilter | null>(null);
  const [selectedDate, setSelectedDate] = createSignal<Date>(calendarStartOfDay(today));
  const [selectedEventId, setSelectedEventId] = createSignal<string | null>(null);
  const [addingDate, setAddingDate] = createSignal<Date | null>(null);
  const [weddingNavigationIntent, setWeddingNavigationIntent] = createSignal<ReturnType<typeof consumeWeddingNavigationIntent>>(null);
  const [googleCalendarStatus, setGoogleCalendarStatus] = createSignal<GoogleCalendarConnectionStatus | null>(null);
  const [googleCalendarOAuthConfig, setGoogleCalendarOAuthConfig] = createSignal<GoogleCalendarOAuthConfig | null>(null);
  const [googleCalendarBusy, setGoogleCalendarBusy] = createSignal(false);
  const [googleCalendarNotice, setGoogleCalendarNotice] = createSignal<string | null>(null);

  const monthKey = createMemo(() => calendarMonthStartIso(year(), month()));
  const weddingArrivalBanner = createMemo(() =>
    buildWeddingNavigationArrivalBannerState(weddingNavigationIntent()),
  );

  async function loadEvents() {
    setLoading(true);
    try {
      const response = await listCalendarEvents(monthKey());
      const projectedEvents = calendarEventsFromAfpMessages(props.afpMessages ?? []);
      setEvents(mergeCalendarEvents(response.events, projectedEvents).map(calendarItemFromEvent));
    } catch {
      setEvents(calendarEventsFromAfpMessages(props.afpMessages ?? []).map(calendarItemFromEvent));
    } finally {
      setLoading(false);
    }
  }

  async function loadGoogleCalendarStatus() {
    try {
      setGoogleCalendarStatus(await fetchGoogleCalendarStatus());
    } catch {
      setGoogleCalendarStatus(null);
    }
  }

  async function loadGoogleCalendarOAuthConfig() {
    try {
      setGoogleCalendarOAuthConfig(await fetchGoogleCalendarOAuthConfig());
    } catch {
      setGoogleCalendarOAuthConfig(null);
    }
  }

  async function connectGoogleCalendar() {
    if (googleCalendarBusy()) return;
    setGoogleCalendarBusy(true);
    setGoogleCalendarNotice(null);
    try {
      const url = await fetchGoogleCalendarOAuthUrl();
      window.location.assign(url);
    } catch (err) {
      try {
        const config = await fetchGoogleCalendarOAuthConfig();
        setGoogleCalendarOAuthConfig(config);
        const redirect = config.requiredAuthorizedRedirectUri ?? config.redirectUri;
        const setupHint = redirect
          ? ` Google Cloud must authorize this redirect URI: ${redirect}.`
          : "";
        setGoogleCalendarNotice(`${err instanceof Error ? err.message : "Could not start Google Calendar connection."}${setupHint}`);
      } catch {
        setGoogleCalendarNotice(err instanceof Error ? err.message : "Could not start Google Calendar connection.");
      }
      setGoogleCalendarBusy(false);
    }
  }

  async function syncGoogleCalendarNow() {
    if (googleCalendarBusy()) return;
    setGoogleCalendarBusy(true);
    setGoogleCalendarNotice(null);
    try {
      const result = await syncGoogleCalendar();
      setGoogleCalendarNotice(`Synced ${result.synced_count} event${result.synced_count === 1 ? "" : "s"} from Google Calendar.`);
      await loadEvents();
    } catch (err) {
      setGoogleCalendarNotice(err instanceof Error ? err.message : "Google Calendar sync failed.");
    } finally {
      setGoogleCalendarBusy(false);
    }
  }

  async function disconnectGoogleCalendarNow() {
    if (googleCalendarBusy()) return;
    setGoogleCalendarBusy(true);
    setGoogleCalendarNotice(null);
    try {
      await disconnectGoogleCalendar();
      await loadGoogleCalendarStatus();
    } catch (err) {
      setGoogleCalendarNotice(err instanceof Error ? err.message : "Could not disconnect Google Calendar.");
    } finally {
      setGoogleCalendarBusy(false);
    }
  }

  onMount(() => {
    const weddingIntent = consumeWeddingNavigationIntent();
    if (weddingIntent?.view === "calendar") setWeddingNavigationIntent(weddingIntent);
    void loadEvents();
    void loadGoogleCalendarStatus();
    void loadGoogleCalendarOAuthConfig();
    const calendarRedirectStatus = new URLSearchParams(window.location.search).get("calendar");
    if (calendarRedirectStatus) {
      setGoogleCalendarNotice(
        calendarRedirectStatus === "connected"
          ? "Google Calendar connected."
          : calendarRedirectStatus === "not_configured"
            ? "Google Calendar isn't configured on this server yet."
            : "Could not connect Google Calendar. Please try again.",
      );
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("calendar");
      window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search);
    }
    const tabletMq = window.matchMedia("(max-width: 64em)");
    if (tabletMq.matches) setSidebarOpen(false);
    const handler = (event: MediaQueryListEvent) => setSidebarOpen(!event.matches);
    tabletMq.addEventListener("change", handler);
    onCleanup(() => tabletMq.removeEventListener("change", handler));
  });

  createEffect(() => {
    const projectedEvents = calendarEventsFromAfpMessages(props.afpMessages ?? []);
    if (projectedEvents.length === 0) return;
    setEvents((current) => mergeCalendarEvents(current, projectedEvents).map(calendarItemFromEvent));
  });

  createEffect(() => {
    const rawDate = props.initialDate?.trim();
    if (!rawDate) return;
    const date = new Date(rawDate);
    if (Number.isNaN(date.getTime())) return;
    setYear(date.getFullYear());
    setMonth(date.getMonth());
    setSelectedDate(calendarStartOfDay(date));
    if (props.initialEventId) {
      setSelectedEventId(props.initialEventId);
    }
  });

  createEffect(() => {
    const eventId = props.initialEventId?.trim();
    if (!eventId) return;
    const matched = events().find((event) => event.id === eventId);
    if (!matched) return;
    const eventDate = new Date(matched.start_at);
    setYear(eventDate.getFullYear());
    setMonth(eventDate.getMonth());
    setSelectedDate(calendarStartOfDay(eventDate));
    setSelectedEventId(matched.id);
  });

  const selectedDateKey = createMemo(() => calendarStartOfDay(selectedDate()).toDateString());
  const normalizedSearch = createMemo(() => calendarNormalizeText(search()));

  const visibleEvents = createMemo(() => {
    const selected = selectedCategories();
    return events().filter((event) => {
      const eventDate = new Date(event.start_at);
      const eventDay = calendarStartOfDay(eventDate);
      if (!calendarMatchesSearch(event, normalizedSearch())) return false;
      if (selected.length > 0 && !selected.includes(event.derivedCategory)) return false;
      if (quickFilter() === "today" && !calendarIsSameDay(eventDay, today)) return false;
      if (quickFilter() === "upcoming" && eventDay < calendarStartOfDay(today)) return false;
      if (quickFilter() === "past" && eventDay > calendarStartOfDay(today)) return false;
      if (quickFilter() === "conflicts" && !calendarEventOverlaps(event, events())) return false;
      return true;
    });
  });

  const eventsByDay = createMemo(() => {
    const map = new Map<number, CalendarItem[]>();
    for (const event of visibleEvents()) {
      const date = new Date(event.start_at);
      if (date.getFullYear() !== year() || date.getMonth() !== month()) continue;
      const day = date.getDate();
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(event);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
    }
    return map;
  });

  const gridCells = createMemo(() => {
    const first = calendarFirstWeekday(year(), month());
    const totalDays = calendarDaysInMonth(year(), month());
    const cells: Array<number | null> = [];
    for (let i = 0; i < first; i += 1) cells.push(null);
    for (let day = 1; day <= totalDays; day += 1) cells.push(day);
    while (cells.length < 42) cells.push(null);
    return cells;
  });

  const miniCalendar = createMemo(() => calendarBuildMiniCalendar(year(), month()));
  const categoryEntries = createMemo(() => Object.entries(CALENDAR_CATEGORY_META) as Array<[DerivedCategory, { label: string; color: string }]>);

  const selectedDayEvents = createMemo(() => {
    return visibleEvents()
      .filter((event) => calendarIsSameDay(new Date(event.start_at), selectedDate()))
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  });

  const selectedEvent = createMemo(() => {
    return visibleEvents().find((event) => event.id === selectedEventId()) ?? selectedDayEvents()[0] ?? null;
  });
  const selectedReversibleReviewTarget = createMemo(() => {
    const summary = props.reversibleSummary;
    const event = selectedEvent();
    if (
      !event
      || event.id !== summary?.latest_tentative_event_id
      || !summary?.latest_tentative_thread_id
      || !summary?.latest_tentative_action_message_id
    ) {
      return null;
    }
    return {
      threadId: summary.latest_tentative_thread_id,
      messageId: summary.latest_tentative_action_message_id,
      label: calendarReviewActionLabel(summary),
      summary: calendarReviewSummaryText(summary),
    };
  });

  // ── Real backlinks for the selected event ─────────────────────────────────
  const [backlinks, setBacklinks] = createSignal<BacklinkItem[]>([]);
  const [backlinksLoading, setBacklinksLoading] = createSignal(false);
  const [taxonomyInstalling, setTaxonomyInstalling] = createSignal(false);
  const [taxonomyDone, setTaxonomyDone] = createSignal<string[] | null>(null);

  createEffect(() => {
    const ev = selectedEvent();
    if (!ev) {
      setBacklinks([]);
      return;
    }
    setBacklinksLoading(true);
    fetchBacklinksForMessage(ev.id)
      .then((res) => setBacklinks(res.backlinks))
      .catch(() => setBacklinks([]))
      .finally(() => setBacklinksLoading(false));
  });

  async function doInstallTaxonomy() {
    setTaxonomyInstalling(true);
    try {
      const res = await installDefaultSupertags();
      setTaxonomyDone(res.installed);
    } catch {
      setTaxonomyDone([]);
    } finally {
      setTaxonomyInstalling(false);
    }
  }

  const searchPeopleMatches = createMemo(() => {
    const query = normalizedSearch();
    if (!query) return [];
    const people = visibleEvents().flatMap((event) => event.relatedPeople);
    return [...new Set(people.filter((person) => person.toLowerCase().includes(query)))].slice(0, 3);
  });

  function toggleCategory(category: CategoryKey) {
    if (category === "all") {
      setSelectedCategories([]);
      return;
    }
    setSelectedCategories((prev) =>
      prev.includes(category) ? prev.filter((item) => item !== category) : [...prev, category]
    );
  }

  function changeQuickFilter(filter: QuickFilter) {
    setQuickFilter((current) => (current === filter ? null : filter));
  }

  function goToToday() {
    setYear(today.getFullYear());
    setMonth(today.getMonth());
    const nextDate = calendarStartOfDay(today);
    setSelectedDate(nextDate);
    void loadEvents();
  }

  function prevMonth() {
    if (month() === 0) {
      setYear((value) => value - 1);
      setMonth(11);
    } else {
      setMonth((value) => value - 1);
    }
    queueMicrotask(() => void loadEvents());
  }

  function nextMonth() {
    if (month() === 11) {
      setYear((value) => value + 1);
      setMonth(0);
    } else {
      setMonth((value) => value + 1);
    }
    queueMicrotask(() => void loadEvents());
  }

  async function removeEvent(id: string) {
    try {
      await deleteCalendarEvent(id);
      setEvents((prev) => prev.filter((event) => event.id !== id));
      if (selectedEventId() === id) setSelectedEventId(null);
    } catch {
      // Ignore delete failures; the list will refresh on next load.
    }
  }

  function runWeddingArrivalAction(action: WeddingArrivalAction) {
    const destination = weddingArrivalActionDestinationView(action);
    if (destination) navigateToView(destination);
  }

  return (
    <div
      aria-label="Calendar"
      style={{
        display: "flex",
        "flex-direction": "column",
        height: "100%",
        "min-height": "0",
        background: TOKEN.bg,
        "font-family": "Inter, system-ui, sans-serif",
        "font-feature-settings": '"ss01"',
        border: `1px solid ${TOKEN.border}`,
        "border-radius": "1em",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          "min-height": TOKEN.topBarH,
          background: TOKEN.surface,
          "border-bottom": `1px solid ${TOKEN.border}`,
          display: "flex",
          "align-items": "center",
          gap: "1em",
          padding: `0.75em ${TOKEN.mainPadding}`,
          "flex-shrink": "0",
          "justify-content": "space-between",
          "flex-wrap": "wrap",
        }}
      >
        <div style={{ display: "flex", "align-items": "center", gap: "0.6em", "flex-wrap": "wrap" }}>
          <button type="button" aria-label="Toggle filters" onClick={() => setSidebarOpen((value) => !value)} style={iconButtonStyle()}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
          </button>
          <div style={{ display: "flex", "align-items": "center", gap: "0.45em" }}>
            <button type="button" onClick={prevMonth} style={iconButtonStyle()}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M9.5 3.5 5 8l4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
            <button type="button" onClick={goToToday} style={secondaryButtonStyle()}>
              Today
            </button>
            <button type="button" onClick={nextMonth} style={iconButtonStyle()}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6.5 3.5 11 8l-4.5 4.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </button>
          </div>
        </div>

        <div style={{ display: "flex", "align-items": "center", gap: "1em", flex: 1, "justify-content": "center", "min-width": "min(100%, 18em)", "flex-wrap": "wrap" }}>
          <div style={{ "text-align": "center", "min-width": 0 }}>
            <h2 style={{ margin: 0, "font-size": "clamp(1.1em, 4vw, 1.5em)", "line-height": 1.2, color: TOKEN.text }}>{calendarMonthLabel(year(), month())}</h2>
          </div>
          <label
            style={{
              display: "flex",
              "align-items": "center",
              gap: "0.55em",
              width: "100%",
              "max-width": TOKEN.searchMaxW,
              height: TOKEN.searchH,
              background: TOKEN.surface,
              border: `1px solid ${TOKEN.border}`,
              "border-radius": "9999px",
              padding: "0 1em",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="4.5" stroke={TOKEN.textSecondary} stroke-width="1.5" />
              <path d="m10.5 10.5 3 3" stroke={TOKEN.textSecondary} stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <input
              type="search"
              aria-label="Search calendar"
              value={search()}
              onInput={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search events, people, locations"
              style={{
                border: "none",
                background: "transparent",
                outline: "none",
                width: "100%",
                "font-size": "0.92em",
                color: TOKEN.text,
              }}
            />
          </label>
        </div>

        <div style={{ display: "flex", "align-items": "center", gap: "0.6em", "flex-wrap": "wrap" }}>
          <div style={{ display: "flex", background: TOKEN.bg, border: `1px solid ${TOKEN.border}`, "border-radius": "0.7em", padding: "0.22em" }}>
            <For each={(["month", "week", "day"] as ViewMode[])}>
              {(mode) => (
                <button
                  type="button"
                  onClick={() => setViewMode(mode)}
                  style={{
                    border: "none",
                    background: viewMode() === mode ? TOKEN.accent : "transparent",
                    color: viewMode() === mode ? "#FFFFFF" : TOKEN.textSecondary,
                    padding: "0.55em 0.9em",
                    "border-radius": "0.55em",
                    cursor: "pointer",
                    "font-size": "0.82em",
                    "text-transform": "capitalize",
                    transition: TOKEN.transition,
                  }}
                >
                  {mode}
                </button>
              )}
            </For>
          </div>
          <button type="button" onClick={() => setAddingDate(selectedDate())} style={primaryButtonStyle()}>
            New Event
          </button>
        </div>
      </header>

      <div style={{ padding: "1em 1em 0", "flex-shrink": 0 }}>
        <WeddingNavigationArrivalBanner
          state={weddingArrivalBanner()}
          onAction={runWeddingArrivalAction}
          onDismiss={() => setWeddingNavigationIntent(null)}
        />
        <Show when={googleCalendarStatus()?.configured && !googleCalendarStatus()?.connected}>
          <div
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              gap: "0.75em",
              padding: "0.75em 1em",
              "margin-bottom": "1em",
              background: TOKEN.surface,
              border: `1px solid ${TOKEN.border}`,
              "border-radius": "0.75em",
            }}
          >
            <div style={{ display: "grid", gap: "0.2em", "min-width": 0 }}>
              <p style={{ margin: 0, "font-size": "0.85em", color: TOKEN.textSecondary }}>
                Connect Google Calendar to see your Google events here.
              </p>
              <Show when={googleCalendarOAuthConfig()?.requiredAuthorizedRedirectUri}>
                {(redirectUri) => (
                  <p style={{ margin: 0, "font-size": "0.72em", color: TOKEN.textSecondary, "word-break": "break-word" }}>
                    Authorized redirect URI: {redirectUri()}
                    <Show when={googleCalendarOAuthConfig()?.oauthClientSource}>
                      {(source) => <> | OAuth client: {source().replace(/_/g, " ")}</>}
                    </Show>
                  </p>
                )}
              </Show>
            </div>
            <button
              type="button"
              disabled={googleCalendarBusy()}
              onClick={() => void connectGoogleCalendar()}
              style={{
                border: "none",
                background: TOKEN.accent,
                color: "#FFFFFF",
                "border-radius": "0.6em",
                padding: "0.5em 0.9em",
                cursor: googleCalendarBusy() ? "not-allowed" : "pointer",
                "font-size": "0.8em",
                "font-weight": 600,
                opacity: googleCalendarBusy() ? 0.6 : 1,
                "white-space": "nowrap",
              }}
            >
              {googleCalendarBusy() ? "Connecting…" : "Connect Google Calendar"}
            </button>
          </div>
        </Show>
        <Show when={googleCalendarStatus()?.connected}>
          <div
            style={{
              display: "flex",
              "align-items": "center",
              "justify-content": "space-between",
              gap: "0.75em",
              "flex-wrap": "wrap",
              padding: "0.6em 1em",
              "margin-bottom": "1em",
              background: TOKEN.surface,
              border: `1px solid ${TOKEN.border}`,
              "border-radius": "0.75em",
            }}
          >
            <p style={{ margin: 0, "font-size": "0.8em", color: TOKEN.textSecondary }}>
              {googleCalendarStatus()?.token_expired
                ? "Google Calendar connection expired — reconnect to keep syncing."
                : `Synced with Google Calendar${googleCalendarStatus()?.google_email ? ` (${googleCalendarStatus()?.google_email})` : ""}.`}
            </p>
            <div style={{ display: "flex", gap: "0.5em" }}>
              <button
                type="button"
                disabled={googleCalendarBusy()}
                onClick={() => (googleCalendarStatus()?.token_expired ? void connectGoogleCalendar() : void syncGoogleCalendarNow())}
                style={secondaryButtonStyle()}
              >
                {googleCalendarStatus()?.token_expired ? "Reconnect" : googleCalendarBusy() ? "Syncing…" : "Sync now"}
              </button>
              <button
                type="button"
                disabled={googleCalendarBusy()}
                onClick={() => void disconnectGoogleCalendarNow()}
                style={{ ...secondaryButtonStyle(), color: TOKEN.textSecondary }}
              >
                Disconnect
              </button>
            </div>
          </div>
        </Show>
        <Show when={googleCalendarNotice()}>
          <p style={{ margin: "0 0 1em", "font-size": "0.78em", color: TOKEN.textSecondary }}>{googleCalendarNotice()}</p>
        </Show>
      </div>

      <div style={{ display: "flex", flex: 1, "min-height": 0, overflow: "hidden" }}>
        <aside
          style={{
            width: sidebarOpen() ? TOKEN.sidebarW : TOKEN.sidebarCollapsed,
            background: TOKEN.surface,
            "border-right": `1px solid ${TOKEN.border}`,
            padding: sidebarOpen() ? TOKEN.sidebarPadding : "1em 0.65em",
            display: "flex",
            "flex-direction": "column",
            gap: TOKEN.sectionGap,
            overflow: "hidden auto",
            transition: `width ${TOKEN.transition}, padding ${TOKEN.transition}`,
            "flex-shrink": 0,
          }}
        >
          <Show when={sidebarOpen()} fallback={
            <div style={{ display: "flex", "flex-direction": "column", gap: "0.75em", "align-items": "center" }}>
              <MiniRailButton label="T" title="Today" onClick={goToToday} />
              <MiniRailButton label="F" title="Filters" onClick={() => setSidebarOpen(true)} />
            </div>
          }>
            <section>
              <p style={capsLabelStyle()}>Navigator</p>
              <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", "margin-bottom": "0.8em" }}>
                <p style={{ margin: 0, "font-size": "0.95em", "font-weight": 600, color: TOKEN.text }}>{calendarMonthShortLabel(new Date(year(), month(), 1)).split(" ")[0]} {year()}</p>
                <div style={{ display: "flex", gap: "0.35em" }}>
                  <button type="button" onClick={prevMonth} style={miniIconButtonStyle()}>
                    <span aria-hidden="true">‹</span>
                  </button>
                  <button type="button" onClick={nextMonth} style={miniIconButtonStyle()}>
                    <span aria-hidden="true">›</span>
                  </button>
                </div>
              </div>
              <div style={{ display: "grid", "grid-template-columns": "repeat(7, 1fr)", gap: "0.25em" }}>
                <For each={WEEKDAYS}>
                  {(day) => <span style={{ "font-size": "0.64em", color: TOKEN.textSecondary, "text-align": "center", "text-transform": "uppercase" }}>{day[0]}</span>}
                </For>
                <For each={miniCalendar()}>
                  {(day) => (
                    <button
                      type="button"
                      disabled={day === null}
                      onClick={() => {
                        if (day === null) return;
                        setSelectedDate(new Date(year(), month(), day));
                      }}
                      style={{
                        border: "none",
                        background: day !== null && calendarIsSameDay(new Date(year(), month(), day), selectedDate()) ? "#fff2eb" : "transparent",
                        color: day === null ? TOKEN.border : TOKEN.text,
                        "border-radius": "0.6em",
                        height: "2.1em",
                        cursor: day === null ? "default" : "pointer",
                        "font-size": "0.78em",
                      }}
                    >
                      {day ?? ""}
                    </button>
                  )}
                </For>
              </div>
            </section>

            <section>
              <p style={capsLabelStyle()}>Filters</p>
              <div style={{ display: "flex", gap: "0.45em", "flex-wrap": "wrap" }}>
                <FilterPill label="All" active={selectedCategories().length === 0} onClick={() => toggleCategory("all")} />
                <For each={categoryEntries()}>
                  {([key, meta]) => (
                    <FilterPill
                      label={meta.label}
                      active={selectedCategories().includes(key)}
                      color={meta.color}
                      onClick={() => toggleCategory(key)}
                    />
                  )}
                </For>
              </div>
              <Show when={searchPeopleMatches().length > 0}>
                <div style={{ "margin-top": "0.8em" }}>
                  <p style={{ ...capsLabelStyle(), margin: "0 0 0.45em" }}>People Match</p>
                  <div style={{ display: "flex", gap: "0.4em", "flex-wrap": "wrap" }}>
                    <For each={searchPeopleMatches()}>
                      {(person) => (
                        <span style={{ ...softTagStyle(), background: "#fff2eb", color: TOKEN.text }}>{person}</span>
                      )}
                    </For>
                  </div>
                </div>
              </Show>
            </section>

            <section>
              <p style={capsLabelStyle()}>Quick Links</p>
              <div style={{ display: "flex", "flex-direction": "column", gap: "0.45em" }}>
                <SidebarAction label="Today" active={quickFilter() === "today"} onClick={() => changeQuickFilter("today")} />
                <SidebarAction label="Upcoming" active={quickFilter() === "upcoming"} onClick={() => changeQuickFilter("upcoming")} />
                <SidebarAction label="Past" active={quickFilter() === "past"} onClick={() => changeQuickFilter("past")} />
                <SidebarAction label="Conflicts" active={quickFilter() === "conflicts"} onClick={() => changeQuickFilter("conflicts")} />
              </div>
            </section>
          </Show>
        </aside>

        <main
          style={{
            flex: 1,
            display: "flex",
            "flex-direction": "column",
            overflow: "hidden",
            padding: TOKEN.mainPadding,
            gap: TOKEN.sectionGap,
            "min-width": 0,
          }}
        >
          <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "1em", "flex-wrap": "wrap" }}>
            <div>
              <p style={{ margin: 0, "font-size": "0.76em", "letter-spacing": "0.16em", "text-transform": "uppercase", color: TOKEN.textSecondary }}>
                {viewMode() === "month" ? "Month grid" : `${viewMode()} preview`}
              </p>
              <p style={{ margin: "0.35em 0 0", "font-size": "0.92em", color: TOKEN.textSecondary }}>
                Clean line items only. The Knowledge Curator keeps raw AFP threads in the context panel.
              </p>
            </div>
            <div style={{ display: "flex", gap: "0.5em", "flex-wrap": "wrap" }}>
              <span style={softTagStyle()}>{visibleEvents().length} visible event{visibleEvents().length === 1 ? "" : "s"}</span>
              <Show when={quickFilter()}>
                <span style={{ ...softTagStyle(), background: "#fff2eb", color: TOKEN.text }}>{quickFilter()}</span>
              </Show>
            </div>
          </div>

          {/* ── Month view ─────────────────────────────────────────────────── */}
          <Show when={viewMode() === "month"}>
            <section
              style={{
                background: TOKEN.surface,
                border: `1px solid ${TOKEN.border}`,
                "border-radius": "1em",
                display: "flex",
                "flex-direction": "column",
                overflow: "hidden",
                "min-height": 0,
                flex: 1,
              }}
            >
              <div style={{ display: "grid", "grid-template-columns": "repeat(7, minmax(0, 1fr))", "border-bottom": `1px solid ${TOKEN.border}` }}>
                <For each={WEEKDAYS}>
                  {(day) => (
                    <div style={{ padding: "0.85em 0.6em", "text-align": "center", "font-size": "0.72em", "letter-spacing": "0.14em", "text-transform": "uppercase", color: TOKEN.textSecondary }}>
                      {day}
                    </div>
                  )}
                </For>
              </div>

              <Show when={!loading()} fallback={
                <div style={{ flex: 1, display: "flex", "align-items": "center", "justify-content": "center", color: TOKEN.textSecondary }}>
                  Loading calendar...
                </div>
              }>
                <div style={{ display: "grid", "grid-template-columns": "repeat(7, minmax(0, 1fr))", flex: 1 }}>
                  <For each={gridCells()}>
                    {(day) => {
                      if (day === null) {
                        return <div style={{ background: "#fbf9f4", "border-right": `1px solid ${TOKEN.border}`, "border-bottom": `1px solid ${TOKEN.border}` }} />;
                      }
                      const date = new Date(year(), month(), day);
                      const dayEvents = () => eventsByDay().get(day) ?? [];
                      const selected = () => selectedDateKey() === date.toDateString();
                      const isCurrentDay = () => calendarIsSameDay(date, today);
                      return (
                        <div
                          role="button"
                          tabindex={0}
                          onClick={() => {
                            setSelectedDate(date);
                            setSelectedEventId(dayEvents()[0]?.id ?? null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedDate(date);
                              setSelectedEventId(dayEvents()[0]?.id ?? null);
                            }
                          }}
                          onDblClick={() => setAddingDate(date)}
                          style={{
                            border: "none",
                            background: selected() ? "#fcf8f3" : TOKEN.surface,
                            "border-right": `1px solid ${TOKEN.border}`,
                            "border-bottom": `1px solid ${TOKEN.border}`,
                            padding: "0.75em",
                            display: "flex",
                            "flex-direction": "column",
                            "align-items": "stretch",
                            gap: "0.55em",
                            "text-align": "left",
                            cursor: "pointer",
                            "min-height": "8.5em",
                            position: "relative",
                            transition: TOKEN.transition,
                          }}
                        >
                          <div style={{ display: "flex", "justify-content": "space-between", "align-items": "center" }}>
                            <span
                              style={{
                                display: "inline-flex",
                                "align-items": "center",
                                "justify-content": "center",
                                width: isCurrentDay() ? "1.8em" : "auto",
                                height: isCurrentDay() ? "1.8em" : "auto",
                                "border-radius": "9999px",
                                background: isCurrentDay() ? "#fff2eb" : "transparent",
                                color: isCurrentDay() ? TOKEN.accent : TOKEN.text,
                                "font-size": "0.82em",
                                "font-weight": 600,
                              }}
                            >
                              {day}
                            </span>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setAddingDate(date);
                              }}
                              title="Add event"
                              style={{
                                border: "none",
                                background: "#fff2eb",
                                color: TOKEN.accent,
                                width: "1.8em",
                                height: "1.8em",
                                "border-radius": "0.5em",
                                cursor: "pointer",
                                opacity: selected() || isCurrentDay() ? "1" : "0.72",
                              }}
                            >
                              +
                            </button>
                          </div>

                          <div style={{ display: "flex", "flex-direction": "column", gap: "0.35em", "min-width": 0 }}>
                            <For each={dayEvents().slice(0, 5)}>
                              {(event) => (
                                <button
                                  type="button"
                                  onClick={(clickEvent) => {
                                    clickEvent.stopPropagation();
                                    setSelectedDate(date);
                                    setSelectedEventId(event.id);
                                  }}
                                  style={{
                                    border: selectedEventId() === event.id ? `1px solid ${TOKEN.accent}` : "1px solid transparent",
                                    background: selectedEventId() === event.id ? "#fff2eb" : "#faf7f1",
                                    "border-radius": "0.7em",
                                    padding: "0.38em 0.5em",
                                    display: "flex",
                                    gap: "0.45em",
                                    "align-items": "flex-start",
                                    cursor: "pointer",
                                    "min-width": 0,
                                  }}
                                >
                                  <span style={{ width: "0.45em", height: "0.45em", "border-radius": "9999px", background: event.markerColor, "margin-top": "0.42em", "flex-shrink": 0 }} />
                                  <span
                                    style={{
                                      "font-size": "0.74em",
                                      color: TOKEN.text,
                                      overflow: "hidden",
                                      "text-overflow": "ellipsis",
                                      "white-space": "nowrap",
                                    }}
                                  >
                                    {event.all_day ? event.title : `${calendarTimeLabel(event.start_at)} ${event.title}`}
                                  </span>
                                </button>
                              )}
                            </For>
                            <Show when={dayEvents().length > 5}>
                              <span style={{ "font-size": "0.74em", color: TOKEN.textSecondary, padding: "0 0.15em" }}>
                                +{dayEvents().length - 5} more
                              </span>
                            </Show>
                          </div>
                        </div>
                      );
                    }}
                  </For>
                </div>
              </Show>
            </section>
          </Show>

          {/* ── Week view ──────────────────────────────────────────────────── */}
          <Show when={viewMode() === "week"}>
            <WeekView
              selectedDate={selectedDate()}
              events={visibleEvents()}
              selectedEventId={selectedEventId()}
              onSelectEvent={(id, date) => { setSelectedDate(date); setSelectedEventId(id); }}
              onAddDate={(date) => setAddingDate(date)}
            />
          </Show>

          {/* ── Day view ───────────────────────────────────────────────────── */}
          <Show when={viewMode() === "day"}>
            <DayView
              date={selectedDate()}
              events={visibleEvents()}
              selectedEventId={selectedEventId()}
              onSelectEvent={(id) => setSelectedEventId(id)}
              onAddDate={(date) => setAddingDate(date)}
            />
          </Show>
        </main>

        <aside
          style={{
            width: TOKEN.rightPanelW,
            background: TOKEN.surface,
            "border-left": `1px solid ${TOKEN.border}`,
            padding: TOKEN.sidebarPadding,
            display: "flex",
            "flex-direction": "column",
            gap: TOKEN.sectionGap,
            overflow: "hidden auto",
            "flex-shrink": 0,
          }}
        >
          <section>
            <p style={capsLabelStyle()}>Selected Day</p>
            <h3 style={{ margin: "0.35em 0 0", "font-size": "1.125em", color: TOKEN.text }}>
              {calendarLongDateLabel(selectedDate(), { includeYear: false })}
            </h3>
            <p style={{ margin: "0.45em 0 0", "font-size": "0.875em", color: TOKEN.textSecondary, "line-height": 1.6 }}>
              {selectedDayEvents().length > 0
                ? `${selectedDayEvents().length} curated event${selectedDayEvents().length === 1 ? "" : "s"} on this day.`
                : "No curated events on this day yet."}
            </p>
          </section>

          <section>
            <p style={capsLabelStyle()}>Day Agenda</p>
            <Show
              when={selectedDayEvents().length > 0}
              fallback={
                <div style={emptyPanelStyle()}>
                  <p style={{ margin: 0 }}>No events are scheduled for this day yet.</p>
                  <div style={{ display: "flex", gap: "0.65em", "flex-wrap": "wrap", "margin-top": "0.9em" }}>
                    <button type="button" onClick={() => setAddingDate(selectedDate())} style={primaryButtonStyle()}>
                      New Event
                    </button>
                  </div>
                </div>
              }
            >
              <div style={{ display: "flex", "flex-direction": "column", gap: "0.65em" }}>
                <For each={selectedDayEvents()}>
                  {(event) => (
                    <button
                      type="button"
                      onClick={() => setSelectedEventId(event.id)}
                      style={{
                        border: `1px solid ${selectedEventId() === event.id ? TOKEN.accent : TOKEN.border}`,
                        background: selectedEventId() === event.id ? "#fff5ef" : TOKEN.bg,
                        "border-radius": "0.9em",
                        padding: "0.9em",
                        "text-align": "left",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ display: "flex", gap: "0.55em", "align-items": "center" }}>
                        <span style={{ width: "0.55em", height: "0.55em", "border-radius": "9999px", background: event.markerColor }} />
                        <span style={{ "font-size": "0.84em", color: TOKEN.textSecondary }}>
                          {event.all_day ? "All day" : calendarTimeLabel(event.start_at)}
                        </span>
                      </div>
                      <p style={{ margin: "0.45em 0 0", "font-size": "0.92em", "font-weight": 600, color: TOKEN.text }}>{event.title}</p>
                      <p style={{ margin: "0.3em 0 0", "font-size": "0.82em", color: TOKEN.textSecondary, "line-height": 1.55 }}>
                        {event.relatedLocation ? `${event.relatedLocation} - ` : ""}{event.sourceLabel}
                      </p>
                      <Show when={event.semanticTag}>
                        {(tag) => (
                          <p style={{ margin: "0.3em 0 0", "font-size": "0.72em", color: TOKEN.accent, "line-height": 1.5, "text-transform": "uppercase", "letter-spacing": "0.12em" }}>
                            {tag()}
                          </p>
                        )}
                      </Show>
                    </button>
                  )}
                </For>
              </div>
            </Show>
          </section>

          <section>
            <p style={capsLabelStyle()}>Thread Context</p>
            <Show
              when={selectedEvent()}
              fallback={
                <div style={emptyPanelStyle()}>
                  <p style={{ margin: 0 }}>Choose an event to open the readable source thread.</p>
                  <div style={{ display: "flex", gap: "0.65em", "flex-wrap": "wrap", "margin-top": "0.9em" }}>
                    <button type="button" onClick={() => setAddingDate(selectedDate())} style={secondaryButtonStyle()}>
                      Add event first
                    </button>
                  </div>
                </div>
              }
            >
              <div style={{ display: "flex", "flex-direction": "column", gap: "0.9em" }}>
                <div style={detailCardStyle()}>
                  <div style={{ display: "flex", "align-items": "center", "justify-content": "space-between", gap: "0.75em" }}>
                    <div style={{ display: "flex", gap: "0.55em", "align-items": "center" }}>
                      <span style={{ width: "0.65em", height: "0.65em", "border-radius": "9999px", background: selectedEvent()!.markerColor }} />
                      <span style={{ ...softTagStyle(), padding: "0.2em 0.55em" }}>{selectedEvent()!.sourceLabel}</span>
                    </div>
                    <div style={{ display: "flex", gap: "0.5em", "align-items": "center", "flex-wrap": "wrap", "justify-content": "flex-end" }}>
                      <Show when={selectedReversibleReviewTarget()}>
                        {(target) => (
                          <button
                            type="button"
                            onClick={() => props.onOpenThread?.(target().threadId, target().messageId)}
                            style={secondaryButtonStyle()}
                          >
                            {target().label}
                          </button>
                        )}
                      </Show>
                      <button type="button" onClick={() => void removeEvent(selectedEvent()!.id)} style={dangerButtonStyle()}>
                        Remove
                      </button>
                    </div>
                  </div>
                  <h4 style={{ margin: "0.7em 0 0", "font-size": "1em", color: TOKEN.text }}>{selectedEvent()!.title}</h4>
                  <p style={{ margin: "0.4em 0 0", "font-size": "0.84em", color: TOKEN.textSecondary }}>
                    {selectedEvent()!.all_day ? calendarMonthShortLabel(new Date(selectedEvent()!.start_at)) : calendarAbsoluteDateLabel(selectedEvent()!.start_at)}
                  </p>
                  <Show when={selectedReversibleReviewTarget()?.summary}>
                    {(summary) => (
                      <p style={{ margin: "0.6em 0 0", "font-size": "0.8em", color: TOKEN.accent, "line-height": 1.6 }}>
                        {summary()}
                      </p>
                    )}
                  </Show>
                  <p style={{ margin: "0.8em 0 0", "font-size": "0.88em", color: TOKEN.text, "line-height": 1.65 }}>
                    {selectedEvent()!.summary}
                  </p>
                </div>

                {/* ── Real backlinks from the Knowledge Curator ── */}
                <div style={detailCardStyle()}>
                  <p style={capsLabelStyle()}>Backlinks</p>
                  <Show when={backlinksLoading()}>
                    <p style={{ margin: "0.6em 0 0", "font-size": "0.82em", color: TOKEN.textSecondary }}>Loading backlinks…</p>
                  </Show>
                  <Show when={!backlinksLoading() && backlinks().length === 0}>
                    <div style={{ ...emptyPanelStyle(), "margin-top": "0.7em" }}>
                      No backlinks indexed yet. The Knowledge Curator will link related messages on the next processing pass.
                    </div>
                  </Show>
                  <Show when={!backlinksLoading() && backlinks().length > 0}>
                    <div style={{ display: "flex", "flex-direction": "column", gap: "0.55em", "margin-top": "0.7em" }}>
                      <For each={backlinks().slice(0, 6)}>
                        {(bl) => (
                          <BacklinkCard
                            title={bl.direction === "inbound" ? `← ${bl.source_id.slice(0, 12)}…` : `→ ${bl.target_id.slice(0, 12)}…`}
                            subtitle={`${bl.link_kind} · sim ${(bl.similarity * 100).toFixed(0)}%${bl.entities?.length ? ` · ${bl.entities.slice(0, 2).join(", ")}` : ""}`}
                          />
                        )}
                      </For>
                      <Show when={backlinks().length > 6}>
                        <span style={{ "font-size": "0.76em", color: TOKEN.textSecondary }}>
                          +{backlinks().length - 6} more backlinks
                        </span>
                      </Show>
                    </div>
                  </Show>
                </div>

                <div style={detailCardStyle()}>
                  <p style={capsLabelStyle()}>AI Summary</p>
                  <p style={{ margin: "0.6em 0 0", "font-size": "0.88em", color: TOKEN.text, "line-height": 1.65 }}>
                    {selectedEvent()!.summary}
                  </p>
                  <div style={{ display: "flex", gap: "0.45em", "flex-wrap": "wrap", "margin-top": "0.8em" }}>
                    <Show when={selectedEvent()!.semanticTag}>
                      <span style={softTagStyle()}>{selectedEvent()!.semanticTag}</span>
                    </Show>
                    <Show when={selectedEvent()!.relatedPeople.length > 0}>
                      <For each={selectedEvent()!.relatedPeople}>
                        {(person) => <span style={softTagStyle()}>{person}</span>}
                      </For>
                    </Show>
                    <Show when={selectedEvent()!.relatedLocation}>
                      <span style={softTagStyle()}>{selectedEvent()!.relatedLocation}</span>
                    </Show>
                    <Show when={selectedEvent()!.weatherTag}>
                      <span style={softTagStyle()}>{selectedEvent()!.weatherTag}</span>
                    </Show>
                  </div>
                </div>
              </div>
            </Show>
          </section>

          {/* ── Default supertag taxonomy onboarding ── */}
          <section>
            <p style={capsLabelStyle()}>Knowledge Setup</p>
            <div style={detailCardStyle()}>
              <p style={{ margin: "0 0 0.6em", "font-size": "0.82em", color: TOKEN.text, "line-height": 1.6 }}>
                Install the default supertag taxonomy to let the Knowledge Curator auto-tag your messages with{" "}
                <strong>#Work</strong>, <strong>#Personal</strong>, <strong>#Health</strong>, and more.
              </p>
              <Show when={taxonomyDone() !== null}>
                <p style={{ margin: "0 0 0.6em", "font-size": "0.8em", color: TOKEN.success }}>
                  {taxonomyDone()!.length > 0
                    ? `Installed: ${taxonomyDone()!.join(", ")}`
                    : "Already installed or no tags written."}
                </p>
              </Show>
              <button
                type="button"
                onClick={() => void doInstallTaxonomy()}
                disabled={taxonomyInstalling() || taxonomyDone() !== null}
                style={primaryButtonStyle(taxonomyInstalling() || taxonomyDone() !== null)}
              >
                {taxonomyInstalling() ? "Installing…" : taxonomyDone() !== null ? "Installed" : "Install defaults"}
              </button>
            </div>
          </section>
        </aside>
      </div>

      <Show when={addingDate()}>
        <AddEventModal
          date={addingDate()!}
          onClose={() => setAddingDate(null)}
          onCreated={(event) => {
            const next = calendarItemFromEvent(event);
            setEvents((prev) => [...prev, next]);
            setSelectedDate(calendarStartOfDay(new Date(event.start_at)));
            setSelectedEventId(event.id);
            setAddingDate(null);
          }}
        />
      </Show>
    </div>
  );
}

// ── WeekView ──────────────────────────────────────────────────────────────────

function WeekView(props: {
  selectedDate: Date;
  events: CalendarItem[];
  selectedEventId: string | null;
  onSelectEvent: (id: string, date: Date) => void;
  onAddDate: (date: Date) => void;
}) {
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const weekStart = createMemo(() => {
    const d = calendarStartOfDay(props.selectedDate);
    const dow = d.getDay();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
  });
  const weekDays = createMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart());
      d.setDate(d.getDate() + i);
      return d;
    }),
  );

  const eventsByWeekDay = createMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const ev of props.events) {
      const evDay = calendarStartOfDay(new Date(ev.start_at));
      const key = evDay.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  });

  return (
    <section
      style={{
        background: TOKEN.surface,
        border: `1px solid ${TOKEN.border}`,
        "border-radius": "1em",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden",
        "min-height": 0,
        flex: 1,
      }}
    >
      {/* Header row: weekday labels */}
      <div
        style={{
          display: "grid",
          "grid-template-columns": "4em repeat(7, minmax(0, 1fr))",
          "border-bottom": `1px solid ${TOKEN.border}`,
        }}
      >
        <div />
        <For each={weekDays()}>
          {(day) => {
            const isToday = calendarIsSameDay(day, new Date());
            return (
              <div
                style={{
                  padding: "0.85em 0.5em",
                  "text-align": "center",
                  "font-size": "0.78em",
                  color: isToday ? TOKEN.accent : TOKEN.textSecondary,
                  "font-weight": isToday ? 600 : 400,
                }}
              >
                {WEEKDAYS[day.getDay()]} {day.getDate()}
              </div>
            );
          }}
        </For>
      </div>

      {/* Scrollable time grid */}
      <div style={{ "overflow-y": "auto", flex: 1 }}>
        <For each={HOURS}>
          {(hour) => (
            <div
              style={{
                display: "grid",
                "grid-template-columns": "4em repeat(7, minmax(0, 1fr))",
                "border-bottom": `1px solid ${TOKEN.border}`,
                "min-height": "3.5em",
              }}
            >
              {/* Hour label */}
              <div
                style={{
                  "border-right": `1px solid ${TOKEN.border}`,
                  padding: "0.4em 0.55em 0",
                  "font-size": "0.7em",
                  color: TOKEN.textSecondary,
                  "text-align": "right",
                }}
              >
                {hour === 0 ? "" : `${hour % 12 || 12} ${hour < 12 ? "am" : "pm"}`}
              </div>

              {/* Day columns */}
              <For each={weekDays()}>
                {(day) => {
                  const dayEventsInHour = () =>
                    (eventsByWeekDay().get(day.toDateString()) ?? []).filter((ev) => {
                      if (ev.all_day) return hour === 0;
                      return new Date(ev.start_at).getHours() === hour;
                    });
                  return (
                    <div
                      style={{
                        "border-right": `1px solid ${TOKEN.border}`,
                        padding: "0.25em",
                        display: "flex",
                        "flex-direction": "column",
                        gap: "0.2em",
                        cursor: "pointer",
                        "min-height": "3.5em",
                      }}
                      onClick={() => {
                        const target = new Date(day);
                        target.setHours(hour);
                        props.onAddDate(target);
                      }}
                    >
                      <For each={dayEventsInHour()}>
                        {(ev) => (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              props.onSelectEvent(ev.id, day);
                            }}
                            style={{
                              border: props.selectedEventId === ev.id ? `1px solid ${TOKEN.accent}` : "1px solid transparent",
                              background: props.selectedEventId === ev.id ? "#fff2eb" : ev.markerColor + "22",
                              "border-radius": "0.5em",
                              padding: "0.22em 0.45em",
                              "font-size": "0.7em",
                              color: TOKEN.text,
                              "text-align": "left",
                              cursor: "pointer",
                              overflow: "hidden",
                              "text-overflow": "ellipsis",
                              "white-space": "nowrap",
                              "border-left": `3px solid ${ev.markerColor}`,
                            }}
                          >
                            {ev.title}
                          </button>
                        )}
                      </For>
                    </div>
                  );
                }}
              </For>
            </div>
          )}
        </For>
      </div>
    </section>
  );
}

// ── DayView ───────────────────────────────────────────────────────────────────

function DayView(props: {
  date: Date;
  events: CalendarItem[];
  selectedEventId: string | null;
  onSelectEvent: (id: string) => void;
  onAddDate: (date: Date) => void;
}) {
  const HOURS = Array.from({ length: 24 }, (_, i) => i);

  const dayEvents = createMemo(() =>
    props.events.filter((ev) => calendarIsSameDay(new Date(ev.start_at), props.date)),
  );

  const eventsInHour = (hour: number) =>
    dayEvents().filter((ev) => {
      if (ev.all_day) return hour === 0;
      return new Date(ev.start_at).getHours() === hour;
    });

  const dateLabel = () => calendarLongDateLabel(props.date);

  return (
    <section
      style={{
        background: TOKEN.surface,
        border: `1px solid ${TOKEN.border}`,
        "border-radius": "1em",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden",
        "min-height": 0,
        flex: 1,
      }}
    >
      {/* Header */}
      <div style={{ padding: "1em 1.5em", "border-bottom": `1px solid ${TOKEN.border}` }}>
        <h3 style={{ margin: 0, "font-size": "1.125em", color: TOKEN.text }}>{dateLabel()}</h3>
        <p style={{ margin: "0.35em 0 0", "font-size": "0.84em", color: TOKEN.textSecondary }}>
          {dayEvents().length} event{dayEvents().length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Scrollable time list */}
      <div style={{ "overflow-y": "auto", flex: 1 }}>
        <For each={HOURS}>
          {(hour) => {
            const items = () => eventsInHour(hour);
            return (
              <div
                style={{
                  display: "grid",
                  "grid-template-columns": "5em 1fr",
                  "border-bottom": `1px solid ${TOKEN.border}`,
                  "min-height": items().length ? "auto" : "3.2em",
                  cursor: "pointer",
                }}
                onClick={() => {
                  const target = new Date(props.date);
                  target.setHours(hour);
                  props.onAddDate(target);
                }}
              >
                {/* Hour label */}
                <div
                  style={{
                    "border-right": `1px solid ${TOKEN.border}`,
                    padding: "0.6em 0.75em 0",
                    "font-size": "0.72em",
                    color: TOKEN.textSecondary,
                    "text-align": "right",
                  }}
                >
                  {hour === 0 ? "" : `${hour % 12 || 12}:00 ${hour < 12 ? "am" : "pm"}`}
                </div>

                {/* Events */}
                <div style={{ padding: "0.3em 0.75em", display: "flex", "flex-direction": "column", gap: "0.3em" }}>
                  <For each={items()}>
                    {(ev) => (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          props.onSelectEvent(ev.id);
                        }}
                        style={{
                          border: `1px solid ${props.selectedEventId === ev.id ? TOKEN.accent : TOKEN.border}`,
                          background: props.selectedEventId === ev.id ? "#fff5ef" : TOKEN.bg,
                          "border-radius": "0.75em",
                          padding: "0.55em 0.85em",
                          display: "flex",
                          gap: "0.6em",
                          "align-items": "center",
                          cursor: "pointer",
                          "text-align": "left",
                          "border-left": `4px solid ${ev.markerColor}`,
                        }}
                      >
                        <div>
                          <p style={{ margin: 0, "font-size": "0.88em", "font-weight": 600, color: TOKEN.text }}>{ev.title}</p>
                          <p style={{ margin: "0.2em 0 0", "font-size": "0.76em", color: TOKEN.textSecondary }}>
                            {ev.all_day ? "All day" : calendarTimeLabel(ev.start_at)}
                            {ev.relatedLocation ? ` · ${ev.relatedLocation}` : ""}
                          </p>
                          <Show when={ev.semanticTag}>
                            {(tag) => (
                              <p style={{ margin: "0.22em 0 0", "font-size": "0.68em", color: TOKEN.accent, "line-height": 1.5, "text-transform": "uppercase", "letter-spacing": "0.12em" }}>
                                {tag()}
                              </p>
                            )}
                          </Show>
                        </div>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            );
          }}
        </For>
      </div>
    </section>
  );
}

function FilterPill(props: { label: string; active: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        border: `1px solid ${props.active ? TOKEN.accent : TOKEN.border}`,
        background: props.active ? "#fff2eb" : TOKEN.bg,
        color: props.active ? TOKEN.text : TOKEN.textSecondary,
        "border-radius": "9999px",
        padding: "0.45em 0.8em",
        "font-size": "0.76em",
        cursor: "pointer",
        display: "inline-flex",
        "align-items": "center",
        gap: "0.45em",
      }}
    >
      <Show when={props.color}>
        <span style={{ width: "0.5em", height: "0.5em", "border-radius": "9999px", background: props.color }} />
      </Show>
      {props.label}
    </button>
  );
}

function SidebarAction(props: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      style={{
        border: "none",
        background: props.active ? "#fff2eb" : "transparent",
        color: props.active ? TOKEN.text : TOKEN.textSecondary,
        padding: "0.7em 0.85em",
        "border-radius": "0.75em",
        cursor: "pointer",
        "text-align": "left",
        "font-size": "0.84em",
      }}
    >
      {props.label}
    </button>
  );
}

function BacklinkCard(props: { title: string; subtitle: string }) {
  return (
    <div
      style={{
        background: TOKEN.bg,
        border: `1px solid ${TOKEN.border}`,
        "border-radius": "0.85em",
        padding: "0.8em 0.9em",
      }}
    >
      <p style={{ margin: 0, "font-size": "0.82em", "font-weight": 600, color: TOKEN.text }}>{props.title}</p>
      <p style={{ margin: "0.35em 0 0", "font-size": "0.78em", color: TOKEN.textSecondary, "line-height": 1.55 }}>{props.subtitle}</p>
    </div>
  );
}

function MiniRailButton(props: { label: string; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={props.title}
      onClick={props.onClick}
      style={{
        width: "2.6em",
        height: "2.6em",
        border: `1px solid ${TOKEN.border}`,
        background: TOKEN.bg,
        color: TOKEN.textSecondary,
        "border-radius": "0.8em",
        cursor: "pointer",
      }}
    >
      {props.label}
    </button>
  );
}

function capsLabelStyle() {
  return {
    margin: 0,
    "font-size": "0.72em",
    "letter-spacing": "0.16em",
    "text-transform": "uppercase",
    color: TOKEN.textSecondary,
  } as const;
}

function softTagStyle() {
  return {
    display: "inline-flex",
    "align-items": "center",
    padding: "0.26em 0.6em",
    background: TOKEN.bg,
    color: TOKEN.textSecondary,
    border: `1px solid ${TOKEN.border}`,
    "border-radius": "9999px",
    "font-size": "0.74em",
  } as const;
}

function detailCardStyle() {
  return {
    background: TOKEN.surface,
    border: `1px solid ${TOKEN.border}`,
    "border-radius": "0.95em",
    padding: "1em",
  } as const;
}

function emptyPanelStyle() {
  return {
    background: TOKEN.bg,
    border: `1px dashed ${TOKEN.border}`,
    "border-radius": "0.95em",
    padding: "1.1em",
    color: TOKEN.textSecondary,
    "font-size": "0.86em",
    "line-height": 1.65,
  } as const;
}

function fieldStyle() {
  return {
    width: "100%",
    border: `1px solid ${TOKEN.border}`,
    background: TOKEN.bg,
    color: TOKEN.text,
    "border-radius": "0.9em",
    padding: "0.8em 0.9em",
    outline: "none",
    "font-size": "0.9em",
    "font-family": "Inter, system-ui, sans-serif",
    "box-sizing": "border-box",
  } as const;
}

function iconButtonStyle() {
  return {
    border: `1px solid ${TOKEN.border}`,
    background: TOKEN.bg,
    color: TOKEN.textSecondary,
    width: TOKEN.touchTarget,
    height: TOKEN.touchTarget,
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    cursor: "pointer",
    "border-radius": "0.7em",
  } as const;
}

function miniIconButtonStyle() {
  return {
    border: `1px solid ${TOKEN.border}`,
    background: TOKEN.bg,
    color: TOKEN.textSecondary,
    width: "2em",
    height: "2em",
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    cursor: "pointer",
    "border-radius": "0.6em",
  } as const;
}

function primaryButtonStyle(disabled = false) {
  return {
    border: "none",
    background: TOKEN.accent,
    color: "#FFFFFF",
    "border-radius": "0.75em",
    padding: "0.8em 1em",
    cursor: disabled ? "not-allowed" : "pointer",
    "font-size": "0.875em",
    "font-weight": 600,
    opacity: disabled ? 0.55 : 1,
    "min-height": TOKEN.touchTarget,
  } as const;
}

function secondaryButtonStyle() {
  return {
    border: `1px solid ${TOKEN.border}`,
    background: TOKEN.bg,
    color: TOKEN.text,
    "border-radius": "0.75em",
    padding: "0.8em 1em",
    cursor: "pointer",
    "font-size": "0.875em",
    "font-weight": 500,
    "min-height": TOKEN.touchTarget,
  } as const;
}

function dangerButtonStyle() {
  return {
    border: "none",
    background: "rgba(230, 57, 57, 0.12)",
    color: TOKEN.error,
    "border-radius": "0.65em",
    padding: "0.45em 0.7em",
    cursor: "pointer",
    "font-size": "0.76em",
    "font-weight": 600,
  } as const;
}
