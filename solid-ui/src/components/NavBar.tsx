import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { useViewport } from "@/context/ViewportContext";
import { clearSession, fetchLlmConfig, fetchNavBarWeather, probeApiReachability, readSession, signOut } from "@/lib/api";
import { OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS } from "@/lib/operatorRuntimeRemediationKeyboard";
import { normalizeParaViewSelection } from "@/lib/paraViewPreference";
import { QUICK_CONTROL_ACTIONS, quickControlLaunchNotice, type QuickControlActionId } from "@/lib/quickControlShortcutState";
import { recordShortcutUse, sortShortcutsByRecent, type ShortcutRecencyEntry } from "@/lib/shortcutRecency";
import {
  loadSessionViewTrail,
  recordSessionViewVisit,
  saveSessionViewTrail,
  SESSION_VIEW_TRAIL_KEY,
  type SessionViewTrailEntry,
} from "@/lib/sessionViewTrail";
import {
  clearNavBarWorkflowFlag,
  loadNavBarAgentActiveSince,
  loadNavBarLastRun,
  loadNavBarLastVisited,
  loadNavBarLlmLastPingFailed,
  loadNavBarSeenFlag,
  loadNavBarSessionStarted,
  loadNavBarSessionRunsStarted,
  loadNavBarWorkflowFlag,
  saveNavBarAgentActiveSince,
  saveNavBarLastRun,
  saveNavBarLastVisited,
  saveNavBarSeenFlag,
  saveNavBarSessionStarted,
  saveNavBarSessionRunsStarted,
  saveNavBarWorkflowFlag,
} from "@/lib/navBarLocalState";
import type { ViewName } from "@/lib/viewNames";
import { RailIcon, type IconId } from "@/components/RailIcons";

export type { ViewName } from "@/lib/viewNames";

export const CORE_ITEMS: Array<{ id: ViewName; label: string; icon: string; shortcut: string }> = [
  { id: "search",    label: "Chat",      icon: "💬", shortcut: "Ctrl+1" },
  { id: "threads",   label: "Threads",   icon: "🗂", shortcut: "Ctrl+2" },
  { id: "workflows", label: "Workflows", icon: "⚡", shortcut: "Ctrl+3" },
  { id: "email",     label: "Email",     icon: "✉", shortcut: "Ctrl+4" },
  { id: "note",      label: "Notes",     icon: "📝", shortcut: "Ctrl+5" },
  { id: "calendar",  label: "Calendar",  icon: "📅", shortcut: "Ctrl+6" },
  { id: "database",  label: "Database",  icon: "🗄", shortcut: "Ctrl+7" },
  { id: "templates", label: "Templates", icon: "📋", shortcut: "Ctrl+8" },
  { id: "reports",   label: "Study Reports", icon: "📊", shortcut: "Reports" },
];

const STUDY_VIEW_ITEM: { id: ViewName; label: string; icon: IconId } = {
  id: "study",
  label: "Study",
  icon: "study",
};

const CHEATSHEET_ITEMS: ShortcutRecencyEntry[] = [
  ...CORE_ITEMS.map((item) => ({
    id: `view:${item.id}`,
    label: item.label,
    shortcut: item.shortcut,
  })),
  { id: "search_focus", label: "Chat / Focus", shortcut: "Ctrl+K" },
  { id: "compose_launcher", label: "Compose", shortcut: "Ctrl+N" },
  { id: "fleet_panel", label: "Fleet Panel", shortcut: "Ctrl+Shift+F" },
  { id: "filter_reset", label: "Clear filters", shortcut: "Ctrl+Shift+L" },
  { id: "more_views", label: "More views", shortcut: "Alt+M" },
  { id: "history_nav", label: "Back / Forward", shortcut: "Alt+Left/Right" },
  { id: "thread_history_nav", label: "Thread history", shortcut: "[ / ]" },
  ...QUICK_CONTROL_ACTIONS.map((action) => ({
    id: action.id,
    label: action.label,
    shortcut: action.shortcut,
  })),
  { id: "agent_undo", label: "Undo agent action", shortcut: "Ctrl+Z" },
  { id: "form_submit", label: "Save / send draft", shortcut: "Ctrl+Enter / Cmd+Enter" },
  { id: "form_cancel", label: "Cancel / close draft", shortcut: "Esc" },
  ...OPERATOR_RUNTIME_REMEDIATION_SHORTCUTS.map((entry) => ({
    id: entry.id,
    label: entry.label,
    shortcut: entry.shortcut,
  })),
  { id: "tile_duplicate", label: "Duplicate tile", shortcut: "Ctrl+D" },
  { id: "tile_maximize", label: "Maximize tile", shortcut: "Ctrl+Shift+1-8 / Esc" },
  { id: "feed_filter", label: "Filter feed", shortcut: "f" },
  { id: "shortcuts_help", label: "Shortcuts", shortcut: "?" },
];

const MORE_VIEW_ITEMS: Array<{ id: ViewName; label: string; icon: IconId }> = [
  { id: "diary", label: "Diary", icon: "diary" },
  { id: "discover", label: "Discover", icon: "discover" },
  { id: "contacts", label: "Contacts", icon: "contacts" },
];

const EXPANDED_VIEW_ITEMS: Array<{ id: ViewName; label: string; icon: IconId }> = [
  { id: "space_feed", label: "Spaces", icon: "space_feed" },
  { id: "public_feed", label: "Public Feed", icon: "public_feed" },
  { id: "knowledge_graph", label: "Knowledge Graph", icon: "knowledge_graph" },
  { id: "sovereignty_audit", label: "Sovereignty", icon: "sovereignty_audit" },
  { id: "para", label: "PARA Navigator", icon: "para" },
  { id: "files", label: "Files", icon: "files" },
  { id: "decision_queue", label: "Decision Queue", icon: "decision_queue" },
  { id: "cost_dashboard", label: "Cost Dashboard", icon: "cost_dashboard" },
  { id: "cofounder_studio", label: "Co-Founder", icon: "cofounder_studio" },
  { id: "connected_apps", label: "Connected Apps", icon: "connected_apps" },
  { id: "pulse", label: "Pulse Feed", icon: "pulse" },
  { id: "goals", label: "Goals", icon: "goals" },
];

const ADVANCED_VIEW_ITEMS: Array<{ id: ViewName; label: string; icon: IconId }> = [
  { id: "runner", label: "Runner", icon: "runner" },
  { id: "agent_settings", label: "Agent Settings", icon: "agent_settings" },
];

const VIEW_LABELS = new Map<ViewName, string>([
  ...CORE_ITEMS.map((item) => [item.id, item.label] as const),
  [STUDY_VIEW_ITEM.id, STUDY_VIEW_ITEM.label],
  ...MORE_VIEW_ITEMS.map((item) => [item.id, item.label] as const),
  ...EXPANDED_VIEW_ITEMS.map((item) => [item.id, item.label] as const),
  ...ADVANCED_VIEW_ITEMS.map((item) => [item.id, item.label] as const),
]);

const AUTH_REQUIRED_VIEWS = new Set<ViewName>([
  "workflows",
  "study",
  "note",
  "database",
  "diary",
  "space_feed",
  "decision_queue",
  "response_queue",
  "contacts",
  "connected_apps",
  "cofounder_studio",
  "cost_dashboard",
  "agent_settings",
  "runner",
  "pulse",
  "goals",
  "sovereignty_audit",
  "reports",
]);

function viewLabel(view: ViewName): string {
  return VIEW_LABELS.get(view) ?? view.replace(/_/g, " ");
}

// ── Live weather + date widget ────────────────────────────────────────────────
function emojiForCode(code: number): string {
  if (code === 0)  return "☀️";
  if (code === 1)  return "🌤️";
  if (code === 2)  return "⛅";
  if (code === 3)  return "☁️";
  if (code <= 48)  return "🌫️";
  if (code <= 55)  return "🌦️";
  if (code <= 67)  return "🌧️";
  if (code <= 77)  return "❄️";
  if (code <= 82)  return "🌦️";
  if (code <= 86)  return "🌨️";
  return "⛈️";
}

function WeatherDate() {
  const [weather, setWeather] = createSignal<{ code: number; temp: number; humidity?: number; windspeed?: number } | null>(null);
  const [geoBlocked, setGeoBlocked] = createSignal(false);
  const [showDetail, setShowDetail] = createSignal(false);
  const [weatherFetchedAt, setWeatherFetchedAt] = createSignal<number | null>(null);
  const [coords, setCoords] = createSignal<{ lat: number; lon: number } | null>(null);
  let widgetRef: HTMLDivElement | undefined;

  async function fetchWeather(lat: number, lon: number) {
    try {
      const data = await fetchNavBarWeather(lat, lon);
      if (!data) return;
      setWeather(data);
      setWeatherFetchedAt(Date.now());
    } catch { /* ignore */ }
  }

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  function makeLabels() {
    const d = new Date();
    return {
      dayLabel:  DAYS[d.getDay()],
      dateLabel: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
    };
  }
  const [labels, setLabels] = createSignal(makeLabels());

  onMount(() => {
    // Refresh date at midnight so a long-lived session shows the correct day.
    function scheduleRefresh() {
      const now = new Date();
      const msUntilMidnight =
        new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime();
      const t = setTimeout(() => {
        setLabels(makeLabels());
        scheduleRefresh();
      }, msUntilMidnight);
      onCleanup(() => clearTimeout(t));
    }
    scheduleRefresh();

    function onDocClick(e: MouseEvent) {
      if (widgetRef && !widgetRef.contains(e.target as Node)) setShowDetail(false);
    }
    document.addEventListener("mousedown", onDocClick);
    onCleanup(() => document.removeEventListener("mousedown", onDocClick));

    if (!("geolocation" in navigator)) { setGeoBlocked(true); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setCoords({ lat: latitude, lon: longitude });
        await fetchWeather(latitude, longitude);
      },
      () => { setGeoBlocked(true); }
    );
    const weatherInterval = setInterval(() => {
      const c = coords();
      if (c) void fetchWeather(c.lat, c.lon);
    }, 20 * 60 * 1000);
    onCleanup(() => clearInterval(weatherInterval));
  });

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div ref={widgetRef} class="relative">
      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        title={geoBlocked() && !weather() ? "Enable location to see local weather" : "Click for details"}
        aria-label={geoBlocked() && !weather() ? "Date and weather. Enable location to see local weather details" : "Date and weather details"}
        class="flex items-center gap-2.5 rounded-2xl px-2 py-1 transition hover:bg-white/30 outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <span class="text-3xl leading-none" aria-hidden>
          {weather() ? emojiForCode(weather()!.code) : "📅"}
        </span>
        <div class="text-left">
          <p class="text-base font-semibold text-on-surface">{labels().dayLabel}, {labels().dateLabel}</p>
          <Show when={weather()}>
            <p class="text-[11px] text-on-surface-variant">{weather()!.temp}°C</p>
          </Show>
        </div>
      </button>

      <Show when={showDetail()}>
        <div class="absolute left-0 top-full z-50 mt-2 min-w-[200px] animate-fade-in rounded-2xl border border-white/45 bg-white/95 p-4 shadow-panel backdrop-blur-xl">
          <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline mb-2">Date &amp; Weather</p>
          <p class="text-sm font-semibold text-on-surface">
            {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
          <p class="mt-0.5 text-xs text-on-surface-variant">{timezone}</p>
          <Show when={weather()}>
            <div class="mt-3 space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-on-surface-variant">Temperature</span>
                <span class="font-medium text-on-surface">{weather()!.temp}°C</span>
              </div>
              <Show when={weather()!.humidity != null}>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-on-surface-variant">Humidity</span>
                  <span class="font-medium text-on-surface">{weather()!.humidity}%</span>
                </div>
              </Show>
              <Show when={weather()!.windspeed != null}>
                <div class="flex items-center justify-between text-xs">
                  <span class="text-on-surface-variant">Wind</span>
                  <span class="font-medium text-on-surface">{weather()!.windspeed} km/h</span>
                </div>
              </Show>
            </div>
          </Show>
          <Show when={geoBlocked() && !weather()}>
            <p class="mt-2 text-[11px] text-on-surface-variant">Enable location access to see local weather.</p>
          </Show>
          <Show when={weatherFetchedAt() !== null}>
            <p class="mt-2 text-[10px] text-on-surface-variant/50">
              {(() => {
                const secs = Math.floor((Date.now() - weatherFetchedAt()!) / 1000);
                if (secs < 60) return "updated just now";
                if (secs < 3600) return `updated ${Math.floor(secs / 60)}m ago`;
                return `updated ${Math.floor(secs / 3600)}h ago`;
              })()}
            </p>
          </Show>
        </div>
      </Show>
    </div>
  );
}

// ── GestureNav — chrome-less navigation for watch (≤280px) ───────────────────
function GestureNav(props: {
  activeView: ViewName;
  onSelect: (view: ViewName) => void;
  onViewIntent?: (view: ViewName) => void;
  studyLensEnabled?: boolean;
}) {
  const [open, setOpen] = createSignal(false);
  const [firstRun, setFirstRun] = createSignal(
    !loadNavBarSeenFlag("omnyid.gesture_nav.seen")
  );

  let longPressTimer: ReturnType<typeof setTimeout>;

  function startLongPress() {
    longPressTimer = setTimeout(() => {
      setOpen(true);
      setFirstRun(false);
      saveNavBarSeenFlag("omnyid.gesture_nav.seen", true);
    }, 600);
  }

  function cancelLongPress() {
    clearTimeout(longPressTimer);
  }

  onCleanup(() => clearTimeout(longPressTimer));

  const currentLabel = () =>
    props.activeView === STUDY_VIEW_ITEM.id
      ? STUDY_VIEW_ITEM.label
      : CORE_ITEMS.find((i) => i.id === props.activeView)?.label ?? "Chat";

  return (
    <>
      {/* Status chip at top — shows current section + hint */}
      <div
        class="flex items-center justify-between w-full px-3 py-2 rounded-2xl border border-white/35 bg-white/35"
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onMouseDown={startLongPress}
        onMouseUp={cancelLongPress}
        onMouseLeave={cancelLongPress}
      >
        <span class="text-sm font-semibold text-on-surface">{currentLabel()}</span>
        <span class="text-xs text-on-surface-variant/70">hold ≡</span>
      </div>

      {/* First-run tooltip */}
      <Show when={firstRun()}>
        <div class="fixed top-14 left-0 right-0 z-50 mx-3 animate-fade-in">
          <div class="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2 text-xs text-primary text-center">
            Hold anywhere to open navigation
          </div>
        </div>
      </Show>

      {/* Invisible long-press capture overlay (below drawer) */}
      <Show when={!open()}>
        <div
          class="fixed inset-0 z-30"
          onTouchStart={startLongPress}
          onTouchEnd={cancelLongPress}
        />
      </Show>

      {/* Bottom-sheet nav drawer */}
      <Show when={open()}>
        {/* Scrim */}
        <div
          class="fixed inset-0 z-40 bg-on-surface/20"
          onClick={() => setOpen(false)}
        />
        {/* Sheet */}
        <div
          class="fixed bottom-0 left-0 right-0 z-50 animate-slide-up rounded-t-3xl border-t border-white/50 bg-white/96 backdrop-blur-xl shadow-panel"
          style="height: 42%"
        >
          <div class="flex h-full flex-col p-4 overflow-auto">
            <div class="mx-auto mb-3 h-1 w-12 rounded-full bg-on-surface-variant/20 flex-shrink-0" />
            <For each={CORE_ITEMS}>
              {(item) => (
                <button
                  type="button"
                  class={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    props.activeView === item.id
                      ? "bg-primary text-white"
                      : "text-on-surface hover:bg-on-surface/8"
                  }`}
                  onPointerEnter={() => props.onViewIntent?.(item.id)}
                  onFocus={() => props.onViewIntent?.(item.id)}
                  onPointerDown={() => props.onViewIntent?.(item.id)}
                  onClick={() => { props.onSelect(item.id); setOpen(false); }}
                >
                  <span class="text-lg leading-none" aria-hidden>{item.icon}</span>
                  {item.label}
                </button>
              )}
            </For>
            <Show when={props.studyLensEnabled}>
              <button
                type="button"
                class={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                  props.activeView === STUDY_VIEW_ITEM.id
                    ? "bg-primary text-white"
                    : "text-on-surface hover:bg-on-surface/8"
                }`}
                onPointerEnter={() => props.onViewIntent?.(STUDY_VIEW_ITEM.id)}
                onFocus={() => props.onViewIntent?.(STUDY_VIEW_ITEM.id)}
                onPointerDown={() => props.onViewIntent?.(STUDY_VIEW_ITEM.id)}
                onClick={() => { props.onSelect(STUDY_VIEW_ITEM.id); setOpen(false); }}
              >
                <span class="text-lg leading-none" aria-hidden><RailIcon id={STUDY_VIEW_ITEM.icon} /></span>
                {STUDY_VIEW_ITEM.label}
              </button>
            </Show>
          </div>
        </div>
      </Show>
    </>
  );
}

const SHORTCUTS_SEEN_KEY = "omnyid.nav.shortcuts_seen";

// ── NavBar ────────────────────────────────────────────────────────────────────
export function NavBar(props: {
  activeView: ViewName;
  onSelect: (view: ViewName) => void;
  onViewIntent?: (view: ViewName) => void;
  paraViewEnabled: boolean;
  signedIn: boolean;
  advanced: boolean;
  onToggleAdvanced: () => void;
  studyLensEnabled?: boolean;
  onToggleStudyLens?: () => void;
  activeCount: number;
  idleCount: number;
  activeAgentNames?: string[];
  onFleetClick: () => void;
  workflowBadge?: number;
  workflowNewResult?: boolean;
  fleetLoaded?: boolean;
  threadBadge?: number;
  ctrlKPulse?: number;
  onSignIn?: () => void;
  onEditProfile?: () => void;
  onQuickControl?: (action: QuickControlActionId) => void;
  userId?: string;
}) {
  const _vp = useViewport();
  const isWatch = () => _vp?.isWatch?.() ?? false;
  const [viewStripe, setViewStripe] = createSignal(false);
  let viewStripeTimer: ReturnType<typeof setTimeout> | undefined;
  const [viewHistory, setViewHistory] = createSignal<ViewName[]>([]);
  const [viewFuture, setViewFuture] = createSignal<ViewName[]>([]);
  const [showShortcutHint, setShowShortcutHint] = createSignal(!loadNavBarSeenFlag(SHORTCUTS_SEEN_KEY));
  const [chatPulsing, setChatPulsing] = createSignal(false);
  const [showCheatSheet, setShowCheatSheet] = createSignal(false);
  const sortedCheatSheetItems = createMemo(() =>
    showCheatSheet() ? sortShortcutsByRecent(CHEATSHEET_ITEMS) : CHEATSHEET_ITEMS,
  );
  const [cheatSheetPos, setCheatSheetPos] = createSignal<{ top: number; left: number } | null>(null);
  const [showMoreMenu, setShowMoreMenu] = createSignal(false);
  const expandedViewItems = createMemo(() =>
    props.paraViewEnabled
      ? EXPANDED_VIEW_ITEMS
      : EXPANDED_VIEW_ITEMS.filter((item) => item.id !== "para"),
  );
  function normalizedSessionTrailEntries(entries: readonly SessionViewTrailEntry[]): SessionViewTrailEntry[] {
    return props.paraViewEnabled
      ? [...entries]
      : entries.filter((entry) => entry.view !== "para");
  }

  function normalizedViewStack(entries: readonly ViewName[]): ViewName[] {
    return props.paraViewEnabled
      ? [...entries]
      : entries.filter((entry) => entry !== "para");
  }

  function normalizedLastVisitedEntries(entries: Record<string, number>): Record<string, number> {
    if (props.paraViewEnabled || !("para" in entries)) return { ...entries };
    const { para: _disabledParaView, ...next } = entries;
    return next;
  }

  const [sessionViewTrail, setSessionViewTrail] = createSignal<SessionViewTrailEntry[]>(
    normalizedSessionTrailEntries(loadSessionViewTrail()),
  );
  let lastRecordedSessionView: ViewName | null = null;
  let moreMenuRef: HTMLDivElement | undefined;
  let moreMenuPanelRef: HTMLDivElement | undefined;
  let shortcutButtonRef: HTMLButtonElement | undefined;
  let cheatSheetPanelRef: HTMLDivElement | undefined;
  function normalizedSelectableView(view: ViewName): ViewName {
    return normalizeParaViewSelection(view, props.paraViewEnabled);
  }

  const wfKey = () => props.userId ? `omnyid.nav.workflow_new_result.${props.userId}` : "omnyid.nav.workflow_new_result";
  const lvKey = () => props.userId ? `omnyid.nav.lastvisit.${props.userId}` : "omnyid.nav.lastvisit";
  const [lastVisited, setLastVisited] = createSignal<Record<string, number>>(
    normalizedLastVisitedEntries(loadNavBarLastVisited(lvKey())),
  );
  const [persistedNewResult, setPersistedNewResult] = createSignal(
    loadNavBarWorkflowFlag(wfKey())
  );
  const [llmConfigured, setLlmConfigured] = createSignal<boolean | null>(null);
  const [llmLastPingFailed, setLlmLastPingFailed] = createSignal(
    loadNavBarLlmLastPingFailed()
  );
  const [sessionRunsStarted, setSessionRunsStarted] = createSignal(
    loadNavBarSessionRunsStarted()
  );
  const [sessionTick, setSessionTick] = createSignal(0);
  const [showSessionMenu, setShowSessionMenu] = createSignal(false);
  const [userIdCopyAcknowledged, setUserIdCopyAcknowledged] = createSignal(false);
  const [sessionActionError, setSessionActionError] = createSignal<string | null>(null);
  const [signingOut, setSigningOut] = createSignal(false);
  const [connStatus, setConnStatus] = createSignal<"fast" | "connected" | "slow" | "offline">(navigator.onLine ? "connected" : "offline");
  const CONN_COLORS = { fast: "bg-green-400", connected: "bg-blue-400", slow: "bg-amber-400", offline: "bg-gray-400" } as const;
  const CONN_LABELS = { fast: "Transport: fast (<300ms)", connected: "Transport: connected", slow: "Transport: high latency", offline: "Transport: offline" } as const;
  let sessionChipRef: HTMLDivElement | undefined;
  const [lastRun, setLastRun] = createSignal<{ name: string; finishedAt: number } | null>(
    loadNavBarLastRun()
  );
  const [agentActiveSince, setAgentActiveSince] = createSignal<Record<string, number>>(
    loadNavBarAgentActiveSince()
  );
  let prevAgentNames: string[] = [];
  createEffect(() => {
    const currNames = props.activeAgentNames ?? [];
    const prev = prevAgentNames;
    if (prev.length > currNames.length) {
      const gone = prev.find((n) => !currNames.includes(n));
      if (gone) {
        const entry = { name: gone, finishedAt: Date.now() };
        saveNavBarLastRun(entry);
        setLastRun(entry);
      }
    }
    const now = Date.now();
    setAgentActiveSince((prev) => {
      const next: Record<string, number> = {};
      for (const name of currNames) next[name] = prev[name] ?? now;
      saveNavBarAgentActiveSince(next);
      return next;
    });
    const newNames = currNames.filter((n) => !prev.includes(n));
    if (newNames.length > 0) {
      setSessionRunsStarted((n) => {
        const next = n + newNames.length;
        saveNavBarSessionRunsStarted(next);
        return next;
      });
    }
    prevAgentNames = currNames;
  });
  const lastRunLabel = () => {
    const lr = lastRun();
    if (!lr) return null;
    sessionTick();
    const secs = Math.floor((Date.now() - lr.finishedAt) / 1000);
    const ago = secs < 60 ? "just now" : secs < 3600 ? `${Math.floor(secs / 60)}m ago` : `${Math.floor(secs / 3600)}h ago`;
    return `last: ${lr.name.replace(/_/g, " ")} ${ago}`;
  };

  function userIdCopyLabel(): string {
    if (!props.userId) return "";
    return userIdCopyAcknowledged() ? "Copied!" : `${props.userId.slice(0, 8)}...`;
  }

  function copyUserIdToClipboard() {
    const id = props.userId;
    if (!id) return;
    setSessionActionError(null);
    navigator.clipboard.writeText(id).then(() => {
      setUserIdCopyAcknowledged(true);
      setTimeout(() => setUserIdCopyAcknowledged(false), 1500);
    }).catch((error) => {
      setSessionActionError(error instanceof Error ? error.message : "Could not copy the user ID.");
    });
  }

  const sessionStarted = (() => {
    return loadNavBarSessionStarted() ?? saveNavBarSessionStarted(Date.now());
  })();
  const sessionDurationLabel = () => {
    sessionTick();
    const secs = Math.floor((Date.now() - sessionStarted) / 1000);
    if (secs < 300) return null;
    if (secs < 3600) return `active for ${Math.floor(secs / 60)}m`;
    return `active for ${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
  };
  const sessionUserName = (() => {
    const s = readSession();
    if (!s) return null;
    const display = s.user?.display_name?.trim();
    if (display) return display.split(" ")[0];
    const email = s.user?.email;
    return email ? email.split("@")[0] : null;
  })();
  const pendingSections = () => {
    if (!props.signedIn) return [];
    const items: Array<{ label: string; value: string }> = [];
    const workflowCount = props.workflowBadge ?? 0;
    if (workflowCount > 0) items.push({ label: "Workflows", value: String(workflowCount) });
    else if (persistedNewResult()) items.push({ label: "Workflows", value: "!" });
    if ((props.threadBadge ?? 0) > 0) items.push({ label: "Threads", value: String(props.threadBadge) });
    if (props.activeCount > 0) items.push({ label: "Fleet", value: String(props.activeCount) });
    return items;
  };
  const pendingAggregateLabel = () => {
    const items = pendingSections();
    if (items.length === 0) return null;
    const numericTotal = items.reduce((sum, item) => sum + (/^\d+$/.test(item.value) ? Number(item.value) : 0), 0);
    if (numericTotal > 0) return numericTotal > 99 ? "99+" : String(numericTotal);
    return "!";
  };
  const pendingBreakdownAriaLabel = () => {
    const items = pendingSections();
    if (items.length === 0) return "No pending activity";
    return `Pending activity: ${items.map((item) => `${item.label} ${item.value}`).join(", ")}`;
  };

  const recentSessionTrail = createMemo(() =>
    sessionViewTrail().slice(0, 8),
  );
  const availableViewHistory = createMemo(() => normalizedViewStack(viewHistory()));
  const availableViewFuture = createMemo(() => normalizedViewStack(viewFuture()));
  const paraToggleActiveView = createMemo(() => normalizedSelectableView(props.activeView));
  const paraToggleTargetView = createMemo<ViewName>(() =>
    paraToggleActiveView() === "para" ? "home" : "para",
  );

  function persistSessionViewTrail(entries: SessionViewTrailEntry[]) {
    const next = saveSessionViewTrail(normalizedSessionTrailEntries(entries));
    setSessionViewTrail(next);
  }

  function sessionTrailAgeLabel(viewedAt: number): string {
    const secs = Math.floor((Date.now() - viewedAt) / 1000);
    if (secs < 45) return "just now";
    if (secs < 3600) return `${Math.max(1, Math.floor(secs / 60))}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    return `${Math.floor(secs / 86400)}d ago`;
  }

  createEffect(() => {
    if (props.workflowNewResult) {
      saveNavBarWorkflowFlag(wfKey(), true);
      setPersistedNewResult(true);
    }
  });

  createEffect(() => {
    const activeView = normalizedSelectableView(props.activeView);
    if (activeView === lastRecordedSessionView) return;
    lastRecordedSessionView = activeView;
    const next = recordSessionViewVisit(sessionViewTrail(), activeView, Date.now());
    persistSessionViewTrail(next);
  });

  createEffect(() => {
    if (props.paraViewEnabled) return;
    const next = normalizedSessionTrailEntries(sessionViewTrail());
    if (next.length !== sessionViewTrail().length) {
      persistSessionViewTrail(next);
    }
  });

  createEffect(() => {
    if (props.paraViewEnabled) return;
    const next = normalizedLastVisitedEntries(lastVisited());
    if (Object.keys(next).length !== Object.keys(lastVisited()).length) {
      setLastVisited(next);
      saveNavBarLastVisited(lvKey(), next);
    }
  });

  createEffect(() => {
    if (props.paraViewEnabled) return;
    const next = normalizedViewStack(viewHistory());
    if (next.length !== viewHistory().length) {
      setViewHistory(next);
    }
  });

  createEffect(() => {
    if (props.paraViewEnabled) return;
    const next = normalizedViewStack(viewFuture());
    if (next.length !== viewFuture().length) {
      setViewFuture(next);
    }
  });

  function goBack() {
    const h = availableViewHistory();
    if (h.length === 0) return;
    const prev = h[h.length - 1];
    const currentView = normalizedSelectableView(props.activeView);
    setViewFuture((f) => normalizedViewStack([currentView, ...f.slice(0, 19)]));
    setViewHistory(h.slice(0, -1));
    props.onSelect(normalizedSelectableView(prev));
  }

  function goForward() {
    const f = availableViewFuture();
    if (f.length === 0) return;
    const next = f[0];
    const currentView = normalizedSelectableView(props.activeView);
    setViewHistory((h) => normalizedViewStack([...h.slice(-19), currentView]));
    setViewFuture(f.slice(1));
    props.onSelect(normalizedSelectableView(next));
  }

  function selectAndPersist(view: ViewName) {
    const nextView = normalizedSelectableView(view);
    if (props.activeView !== nextView) {
      const currentView = normalizedSelectableView(props.activeView);
      setViewHistory((h) => normalizedViewStack([...h.slice(-19), currentView]));
      setViewFuture([]);
      // Tactile view-switch flash — 100ms fade in, 200ms fade out via CSS transition
      clearTimeout(viewStripeTimer);
      setViewStripe(true);
      viewStripeTimer = setTimeout(() => setViewStripe(false), 300);
    }
    const now = Date.now();
    const next = normalizedLastVisitedEntries({ ...lastVisited(), [nextView]: now });
    setLastVisited(next);
    saveNavBarLastVisited(lvKey(), next);
    if (nextView === "workflows") {
      setPersistedNewResult(false);
      clearNavBarWorkflowFlag(wfKey());
    }
    props.onSelect(nextView);
  }

  function signalViewIntent(view: ViewName) {
    props.onViewIntent?.(view);
  }

  function viewRequiresSignIn(view: ViewName): boolean {
    return AUTH_REQUIRED_VIEWS.has(view);
  }

  function activateView(view: ViewName) {
    selectAndPersist(view);
  }

  function positionCheatSheet() {
    if (!shortcutButtonRef) return;
    const rect = shortcutButtonRef.getBoundingClientRect();
    const panelWidth = cheatSheetPanelRef?.offsetWidth ?? 248;
    const panelHeight = cheatSheetPanelRef?.offsetHeight ?? 280;
    const margin = 16;
    const gap = 12;
    const left = Math.min(
      rect.right + gap,
      Math.max(margin, window.innerWidth - panelWidth - margin),
    );
    const top = Math.min(
      Math.max(margin, rect.top + rect.height / 2 - panelHeight / 2),
      Math.max(margin, window.innerHeight - panelHeight - margin),
    );

    setCheatSheetPos({
      top: Math.round(top),
      left: Math.round(left),
    });
  }

  function lastVisitSuffix(viewId: string): string {
    const ts = lastVisited()[viewId];
    if (!ts) return "";
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 120) return "";
    if (secs < 3600) return ` | last seen ${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return ` | last seen ${Math.floor(secs / 3600)}h ago`;
    return ` | last seen ${Math.floor(secs / 86400)}d ago`;
  }

  createEffect(() => {
    const tick = props.ctrlKPulse;
    if (!tick) return;
    setChatPulsing(true);
    const id = setTimeout(() => setChatPulsing(false), 350);
    onCleanup(() => clearTimeout(id));
  });

  onMount(() => {
    if (!showShortcutHint()) return;
    const id = setTimeout(() => {
      setShowShortcutHint(false);
      saveNavBarSeenFlag(SHORTCUTS_SEEN_KEY, true);
    }, 6000);
    onCleanup(() => clearTimeout(id));
  });

  onMount(() => {
    onCleanup(() => clearTimeout(viewStripeTimer));

    function onDocClickSession(e: MouseEvent) {
      if (sessionChipRef && !sessionChipRef.contains(e.target as Node)) setShowSessionMenu(false);
      if (
        moreMenuRef &&
        !moreMenuRef.contains(e.target as Node) &&
        moreMenuPanelRef &&
        !moreMenuPanelRef.contains(e.target as Node)
      ) setShowMoreMenu(false);
      if (
        shortcutButtonRef &&
        !shortcutButtonRef.contains(e.target as Node) &&
        cheatSheetPanelRef &&
        !cheatSheetPanelRef.contains(e.target as Node)
      ) {
        setShowCheatSheet(false);
      }
    }
    document.addEventListener("mousedown", onDocClickSession);
    onCleanup(() => document.removeEventListener("mousedown", onDocClickSession));

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { setShowCheatSheet(false); setShowSessionMenu(false); setShowMoreMenu(false); return; }
      if (e.ctrlKey && e.shiftKey && e.key === "F") {
        e.preventDefault();
        recordShortcutUse("fleet_panel");
        if (!props.signedIn && props.onSignIn) {
          props.onSignIn();
          return;
        }
        props.onFleetClick();
        return;
      }
      if (e.altKey && e.key === "m") { e.preventDefault(); recordShortcutUse("more_views"); setShowMoreMenu((v) => !v); return; }
      if (e.altKey && e.key === "ArrowLeft")  { e.preventDefault(); recordShortcutUse("history_nav"); goBack();    return; }
      if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); recordShortcutUse("history_nav"); goForward(); return; }
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      recordShortcutUse("shortcuts_help");
      setShowCheatSheet((v) => !v);
    }
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });

  createEffect(() => {
    if (!showCheatSheet()) return;
    positionCheatSheet();
    const raf = requestAnimationFrame(() => positionCheatSheet());
    const reposition = () => positionCheatSheet();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    onCleanup(() => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    });
  });

  onMount(() => {
    if (!props.signedIn) {
      setLlmConfigured(false);
      return;
    }
    setLlmLastPingFailed(loadNavBarLlmLastPingFailed());
    fetchLlmConfig()
      .then((cfg) => setLlmConfigured(!!cfg.backend))
      .catch(() => setLlmConfigured(false));
  });

  onMount(() => {
    const id = setInterval(() => setSessionTick((n) => n + 1), 60_000);
    onCleanup(() => clearInterval(id));
  });

  onMount(() => {
    async function pingConn() {
      if (!navigator.onLine) { setConnStatus("offline"); return; }
      if (!props.signedIn) {
        setConnStatus("connected");
        return;
      }
      try {
        const { latency_ms: ms } = await probeApiReachability();
        setConnStatus(ms < 300 ? "fast" : ms < 1200 ? "connected" : "slow");
      } catch { setConnStatus("slow"); }
    }
    void pingConn();
    const id = setInterval(() => void pingConn(), 30_000);
    const goOnline = () => void pingConn();
    const goOffline = () => setConnStatus("offline");
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    onCleanup(() => {
      clearInterval(id);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    });
  });

  return (
    <>
      {/* View-switch tactile stripe — translucent primary bar, fades in 100ms / out 200ms */}
      <Portal>
        <div
          aria-hidden="true"
          class="pointer-events-none fixed inset-x-0 top-0 z-[250] h-[3px] bg-primary/35 transition-opacity"
          style={{ opacity: viewStripe() ? "1" : "0", "transition-duration": viewStripe() ? "100ms" : "200ms" }}
        />
      </Portal>

      {/* Keyboard shortcut first-run hint */}
      <Show when={showShortcutHint() && !isWatch()}>
        <div class="fixed bottom-4 right-4 z-50 animate-fade-in">
          <div class="flex items-center gap-3 rounded-2xl border border-primary/20 bg-white/90 px-4 py-3 shadow-panel backdrop-blur-xl">
            <span class="text-sm text-on-surface">
              Tip: use the left rail to switch views,{" "}
              <kbd class="rounded bg-on-surface/8 px-1.5 py-0.5 font-mono text-xs">Ctrl+K</kbd> to search
            </span>
            <button
              type="button"
              onClick={() => { setShowShortcutHint(false); saveNavBarSeenFlag(SHORTCUTS_SEEN_KEY, true); }}
              class="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-on-surface-variant/50 transition hover:bg-white/60 hover:text-on-surface"
              aria-label="Dismiss keyboard shortcut hint"
            >x</button>
          </div>
        </div>
      </Show>

      {/* Watch mode: chrome-less gesture nav */}
      <Show when={isWatch()}>
      <GestureNav
        activeView={props.activeView}
        onSelect={props.onSelect}
        onViewIntent={props.onViewIntent}
        studyLensEnabled={props.studyLensEnabled}
      />
      </Show>

      {/* ── Left navigation rail ─────────────────────────────────────── */}
      <Show when={!isWatch()}>
        <aside class="fixed left-0 top-0 bottom-0 z-40 flex w-16 flex-col items-center border-r border-white/20 bg-white/75 py-3 backdrop-blur-2xl phone:hidden">

          {/* OmnyID logo — navigates to home workspace grid */}
          <div class="group relative mb-2 flex w-full justify-center">
            <button
              type="button"
              onPointerEnter={() => signalViewIntent("home")}
              onFocus={() => signalViewIntent("home")}
              onPointerDown={() => signalViewIntent("home")}
              onClick={() => selectAndPersist("home")}
              aria-label="Go to workspace home"
              class={`rail-icon-btn flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                props.activeView === "home" ? "bg-on-surface/8 ring-2 ring-primary/30" : "hover:bg-white/60"
              }`}
            >
              <img
                src={`${import.meta.env.BASE_URL}omnyid-logo.jpg`}
                alt="OmnyID"
                class="w-10 h-auto object-contain"
                style={props.activeView === "home" ? "filter: drop-shadow(0 0 6px rgba(49,86,142,0.5))" : ""}
              />
            </button>
            <div class="rail-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
              Workspace home
            </div>
          </div>

          <div class="mx-3 mb-2 h-px w-10 bg-outline/10" />

          <Show when={pendingAggregateLabel()}>
            {(pendingLabel) => (
              <div class="group relative mb-2 flex w-full justify-center">
                <div
                  role="status"
                  aria-label={pendingBreakdownAriaLabel()}
                  class="inline-flex min-h-6 items-center justify-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary shadow-sm"
                >
                  {pendingLabel()}
                </div>
                <div class="rail-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-2 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100 group-focus-within:translate-x-0 group-focus-within:opacity-100">
                  <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline/60">Pending</p>
                  <div class="mt-1.5 space-y-1">
                    <For each={pendingSections()}>
                      {(item) => (
                        <div class="flex items-center justify-between gap-3">
                          <span>{item.label}</span>
                          <span class="font-mono text-[10px] text-outline/70">{item.value}</span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </div>
            )}
          </Show>

          {/* Core nav items */}
          <nav class="flex flex-1 flex-col items-center gap-0.5 py-1 w-full">
            <For each={CORE_ITEMS}>
              {(item) => {
                const active = () => props.activeView === item.id;
                return (
                  <div class="group relative flex w-full justify-center">
                    <button
                      type="button"
                      onPointerEnter={() => signalViewIntent(item.id)}
                      onFocus={() => signalViewIntent(item.id)}
                      onPointerDown={() => signalViewIntent(item.id)}
                      onClick={() => activateView(item.id)}
                      aria-label={`${item.label}${active() ? ", current view" : ""}`}
                      aria-current={active() ? "page" : undefined}
                      class={`rail-icon-btn relative flex h-11 w-11 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                        ${active()
                          ? "bg-on-surface text-white"
                          : "text-outline/70 hover:bg-white/60 hover:text-on-surface"
                        }
                        ${item.id === "search" && chatPulsing() ? "ring-2 ring-primary/50" : ""}`}
                    >
                      <RailIcon id={item.id} />
                    </button>
                    {/* Hover tooltip — slides in from the left */}
                    <div class="rail-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                      {item.label}
                      <span class="ml-2 font-mono text-[9px] text-outline/50">{item.shortcut}</span>
                    </div>
                  </div>
                );
              }}
            </For>
            <Show when={props.studyLensEnabled}>
              <div class="group relative flex w-full justify-center">
                <button
                  type="button"
                  onPointerEnter={() => signalViewIntent(STUDY_VIEW_ITEM.id)}
                  onFocus={() => signalViewIntent(STUDY_VIEW_ITEM.id)}
                  onPointerDown={() => signalViewIntent(STUDY_VIEW_ITEM.id)}
                  onClick={() => activateView(STUDY_VIEW_ITEM.id)}
                  aria-label={`${STUDY_VIEW_ITEM.label}${props.activeView === STUDY_VIEW_ITEM.id ? ", current view" : ""}`}
                  aria-current={props.activeView === STUDY_VIEW_ITEM.id ? "page" : undefined}
                  class={`rail-icon-btn relative flex h-11 w-11 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    props.activeView === STUDY_VIEW_ITEM.id
                      ? "bg-on-surface text-white"
                      : "text-outline/70 hover:bg-white/60 hover:text-on-surface"
                  }`}
                >
                  <RailIcon id={STUDY_VIEW_ITEM.icon} />
                </button>
                <div class="rail-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                  {STUDY_VIEW_ITEM.label}
                </div>
              </div>
            </Show>
          </nav>

          {/* PARA Navigator toggle — visible on home or para view */}
          <Show when={props.paraViewEnabled && (paraToggleActiveView() === "home" || paraToggleActiveView() === "para")}>
            <div class="group relative flex w-full justify-center mb-0.5">
              <button
                type="button"
                onPointerEnter={() => signalViewIntent(paraToggleTargetView())}
                onFocus={() => signalViewIntent(paraToggleTargetView())}
                onPointerDown={() => signalViewIntent(paraToggleTargetView())}
                onClick={() => selectAndPersist(paraToggleTargetView())}
                aria-label={paraToggleActiveView() === "para" ? "Return to home from PARA Navigator" : "Open PARA Navigator"}
                class={`rail-icon-btn relative flex h-11 w-11 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                  ${paraToggleActiveView() === "para"
                    ? "bg-primary/15 text-primary"
                    : "text-outline/70 hover:bg-white/60 hover:text-on-surface"
                  }`}
              >
                <RailIcon id="para" />
              </button>
              <div class="rail-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                {paraToggleActiveView() === "para" ? "Back Home" : "PARA Navigator"}
              </div>
            </div>
          </Show>

          <div class="mx-3 my-2 h-px w-10 bg-outline/10 flex-shrink-0" />

          {/* Bottom controls — flex-shrink-0 so they are always visible at the bottom of the rail */}
          <div class="flex flex-col items-center gap-0.5 pb-1 w-full flex-shrink-0">
            <Show when={props.onToggleStudyLens}>
              <div class="group relative flex w-full justify-center">
                <button
                  type="button"
                  onClick={() => props.onToggleStudyLens?.()}
                  aria-pressed={props.studyLensEnabled ? "true" : "false"}
                  aria-label={props.studyLensEnabled ? "Turn Study Lens off" : "Turn Study Lens on"}
                  class={`rail-icon-btn relative flex h-11 w-11 items-center justify-center rounded-2xl text-[11px] font-black tracking-tight outline-none transition focus-visible:ring-2 focus-visible:ring-primary/50 ${
                    props.studyLensEnabled
                      ? "bg-sky-600 text-white shadow-sm hover:bg-sky-700"
                      : "text-outline/70 hover:bg-white/60 hover:text-on-surface"
                  }`}
                >
                  SL
                  <span
                    class={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${
                      props.studyLensEnabled ? "bg-emerald-300" : "bg-outline/25"
                    }`}
                  />
                </button>
                <div class="rail-tooltip pointer-events-none absolute left-full bottom-0 z-50 ml-2.5 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                  {props.studyLensEnabled ? "Study Lens on" : "Study Lens off"}
                </div>
              </div>
            </Show>

            {/* Fleet status indicator */}
            <div class="group relative flex w-full justify-center">
              <button
                type="button"
                onClick={() => {
                  if (!props.signedIn && props.onSignIn) {
                    props.onSignIn();
                    return;
                  }
                  props.onFleetClick();
                }}
                aria-label={
                  props.signedIn
                    ? `Agent fleet status. ${props.activeCount > 0 ? `${props.activeCount} active and ${props.idleCount} idle` : `${props.idleCount} ready`}`
                    : "Open sign in for agent fleet"
                }
                class={`rail-icon-btn relative flex h-11 w-11 items-center justify-center rounded-2xl text-outline/70 outline-none hover:bg-white/60 hover:text-on-surface focus-visible:ring-2 focus-visible:ring-primary/50`}
              >
                <RailIcon id="fleet" />
                {/* Live pulse dot */}
                <span
                  class={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${
                    !props.signedIn
                      ? "bg-outline/35"
                      : props.activeCount > 0
                        ? "animate-pulse bg-blue-500"
                        : "bg-emerald-400"
                  }`}
                />
                <Show when={props.signedIn && llmConfigured() === false}>
                  <span class="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400" title="LLM not configured" />
                </Show>
              </button>
              <div class="rail-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                {props.signedIn
                  ? props.activeCount > 0
                    ? `${props.activeCount} active | ${props.idleCount} idle`
                    : `${props.idleCount} agents ready`
                  : "Sign in to view your agent fleet"}
                <Show when={props.signedIn && lastRunLabel()}>
                  <span class="ml-1.5 text-outline/50">{lastRunLabel()}</span>
                </Show>
              </div>
            </div>

            {/* Connectivity dot */}
            <div class="group relative flex w-full justify-center">
              <div class="flex h-7 w-11 items-center justify-center" role="img" aria-label={CONN_LABELS[connStatus()]}>
                <div title={CONN_LABELS[connStatus()]} class={`h-2 w-2 rounded-full ${CONN_COLORS[connStatus()]}`} />
              </div>
              <div class="rail-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                {CONN_LABELS[connStatus()]}
              </div>
            </div>

            {/* Help / shortcuts */}
            <div class="group relative flex w-full justify-center">
              <button
                type="button"
                ref={shortcutButtonRef}
                aria-label={`${showCheatSheet() ? "Hide" : "Show"} keyboard shortcuts`}
                aria-haspopup="dialog"
                aria-expanded={showCheatSheet()}
                onClick={() => {
                  if (showCheatSheet()) {
                    setShowCheatSheet(false);
                    return;
                  }
                  setShowCheatSheet(true);
                }}
                class={`rail-icon-btn flex h-11 w-11 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${showCheatSheet() ? "bg-primary/12 text-primary" : "text-outline/70 hover:bg-white/60 hover:text-on-surface"}`}
              >
                <RailIcon id="help" />
              </button>
              <div class="rail-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                Shortcuts <span class="ml-1.5 font-mono text-[9px] text-outline/50">?</span>
              </div>
            </div>

            {/* Tool connections */}
            <div class="group relative flex w-full justify-center">
              <button
                type="button"
                onPointerEnter={() => signalViewIntent("tools")}
                onFocus={() => signalViewIntent("tools")}
                onPointerDown={() => signalViewIntent("tools")}
                onClick={() => selectAndPersist("tools")}
                aria-label="Open tools and integrations"
                class={`rail-icon-btn flex h-11 w-11 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${props.activeView === "tools" ? "bg-on-surface/8 text-on-surface" : "text-outline/70 hover:bg-white/60 hover:text-on-surface"}`}
              >
                <RailIcon id="tools" />
              </button>
              <div class="rail-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                Tools &amp; Integrations
              </div>
            </div>

            {/* More views */}
            <div ref={moreMenuRef} class="group relative flex w-full justify-center">
              <button
                type="button"
                onClick={() => setShowMoreMenu((v) => !v)}
                aria-label={`${showMoreMenu() ? "Hide" : "Show"} more views`}
                aria-expanded={showMoreMenu()}
                aria-haspopup="menu"
                class={`rail-icon-btn flex h-11 w-11 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  showMoreMenu() || ["diary","discover","runner","agent_settings","space_feed","public_feed","knowledge_graph","sovereignty_audit","cofounder_studio","contacts","connected_apps","decision_queue","cost_dashboard","pulse","goals"].includes(props.activeView)
                    ? "bg-on-surface/8 text-on-surface"
                    : "text-outline/70 hover:bg-white/60 hover:text-on-surface"
                }`}
              >
                <RailIcon id="more" />
              </button>
              <div class="rail-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                More <span class="ml-1.5 font-mono text-[9px] text-outline/50">Alt+M</span>
              </div>
            </div>

            {/* Session / user */}
            <div ref={sessionChipRef} class="group relative flex w-full justify-center">
              <button
                type="button"
                onClick={() => {
                  if (!props.signedIn && props.onSignIn) { props.onSignIn(); return; }
                  setSessionActionError(null);
                  setShowSessionMenu((v) => !v);
                }}
                aria-label={props.signedIn ? `${showSessionMenu() ? "Hide" : "Show"} account session menu` : "Open sign in"}
                aria-haspopup={props.signedIn ? "menu" : undefined}
                aria-expanded={props.signedIn ? showSessionMenu() : undefined}
                class={`rail-icon-btn flex h-11 w-11 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${showSessionMenu() ? "bg-on-surface/8 text-on-surface" : "text-outline/70 hover:bg-white/60 hover:text-on-surface"}`}
              >
                <RailIcon id="user" />
              </button>
              <div class="rail-tooltip pointer-events-none absolute left-full bottom-0 z-50 ml-2.5 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                {props.signedIn
                  ? `${sessionUserName ?? "Signed in"}${sessionDurationLabel() ? " | " + sessionDurationLabel() : ""}`
                  : "Guest - sign in"}
              </div>
              <Show when={showSessionMenu()}>
                <div class="absolute left-full bottom-0 z-50 ml-2 min-w-[180px] animate-fade-in rounded-2xl border border-white/45 bg-white/95 p-3 shadow-panel backdrop-blur-xl">
                  <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline mb-2">Session</p>
                  <Show when={sessionActionError()}>
                    {(message) => (
                      <div class="mb-2 rounded-lg border border-amber-300/50 bg-amber-50/90 px-2 py-1.5 text-[10px] text-amber-900 shadow-sm">
                        <div class="flex items-start justify-between gap-2">
                          <span>{message()}</span>
                          <button
                            type="button"
                            onClick={() => setSessionActionError(null)}
                            class="rounded px-1 py-0.5 font-medium text-amber-900/80 transition hover:bg-white/70"
                          >
                            x
                          </button>
                        </div>
                      </div>
                    )}
                  </Show>
                  <Show when={props.userId}>
                    <button
                      type="button"
                      title={`User ID: ${props.userId} - click to copy`}
                      aria-label="Copy user ID"
                      onClick={copyUserIdToClipboard}
                      class="mb-2 flex w-full items-center gap-1.5 rounded-lg bg-on-surface/4 px-2 py-1 text-left transition hover:bg-on-surface/8"
                    >
                      <span class="font-mono text-[9px] text-outline select-none flex-shrink-0">ID</span>
                      <span class="font-mono text-[10px] text-on-surface-variant truncate">
                        {userIdCopyLabel()}
                      </span>
                    </button>
                  </Show>
                  <Show when={sessionDurationLabel()}>
                    <p class="mb-2 text-xs text-on-surface-variant">
                      Started {new Date(sessionStarted).toLocaleTimeString()} | {sessionDurationLabel()}
                    </p>
                  </Show>
                  <Show when={sessionRunsStarted() > 0}>
                    <p class="mb-2 text-xs text-on-surface-variant">
                      {sessionRunsStarted()} agent run{sessionRunsStarted() === 1 ? "" : "s"} this session
                    </p>
                  </Show>
                  <Show when={llmLastPingFailed()}>
                    <p class="mb-2 flex items-center gap-1 rounded-lg border border-amber-200/60 bg-amber-50/80 px-2 py-1 text-[10px] text-amber-700">
                      <span>⚠</span> Last LLM test failed
                    </p>
                  </Show>
                  <Show when={props.signedIn}>
                    <button
                      type="button"
                      onClick={() => { setShowSessionMenu(false); props.onEditProfile?.(); }}
                      class="w-full rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5 text-left text-xs font-medium text-primary transition hover:bg-primary/10 mb-1.5"
                    >Edit Profile</button>
                    <button
                      type="button"
                      onClick={async () => {
                        setSigningOut(true);
                        setSessionActionError(null);
                        try {
                          await signOut();
                          setShowSessionMenu(false);
                          clearSession("manual_sign_out");
                        } catch (error) {
                          setSessionActionError(error instanceof Error ? error.message : "Could not sign out.");
                        }
                        setSigningOut(false);
                      }}
                      disabled={signingOut()}
                      class="w-full rounded-lg border border-red-200/60 bg-red-50/80 px-3 py-1.5 text-left text-xs font-medium text-red-600 transition hover:bg-red-100/80 disabled:cursor-wait disabled:opacity-60"
                    >{signingOut() ? "Signing out..." : "Sign out"}</button>
                  </Show>
                </div>
              </Show>
            </div>
          </div>
        </aside>
      </Show>

      {/* More views drawer — slides in from left rail */}
      <Show when={showMoreMenu() && !isWatch()}>
        <div class="fixed inset-0 z-30" onClick={() => setShowMoreMenu(false)} />
        <div class="fixed bottom-0 left-16 top-0 z-40 w-56 animate-fade-in border-r border-white/20 bg-white/92 shadow-panel backdrop-blur-2xl">
          <div class="flex h-full flex-col py-5">
            <p class="mb-3 px-5 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">More views</p>
            {MORE_VIEW_ITEMS.map((item) => (
                <button
                  type="button"
                  onPointerEnter={() => signalViewIntent(item.id)}
                  onFocus={() => signalViewIntent(item.id)}
                  onPointerDown={() => signalViewIntent(item.id)}
                  onClick={() => { activateView(item.id); setShowMoreMenu(false); }}
                class={`flex w-full items-center gap-3 px-5 py-2.5 text-sm font-medium transition ${
                  props.activeView === item.id ? "bg-primary/10 text-primary" : "text-on-surface hover:bg-on-surface/5"
                }`}
              >
                <span class={props.activeView === item.id ? "text-primary" : "text-outline/70"}><RailIcon id={item.icon} /></span>
                {item.label}
                <Show when={!props.signedIn && viewRequiresSignIn(item.id)}>
                  <span class="ml-auto rounded-full border border-amber-200/70 bg-amber-50 px-1.5 py-0.5 font-mono text-[8px] text-amber-700">sign in</span>
                </Show>
              </button>
            ))}
            <div class="mx-5 my-2 h-px bg-outline/10" />
            {expandedViewItems().map((item) => (
                <button
                  type="button"
                  onPointerEnter={() => signalViewIntent(item.id)}
                  onFocus={() => signalViewIntent(item.id)}
                  onPointerDown={() => signalViewIntent(item.id)}
                  onClick={() => { activateView(item.id); setShowMoreMenu(false); }}
                class={`flex w-full items-center gap-3 px-5 py-2.5 text-sm font-medium transition ${
                  props.activeView === item.id ? "bg-primary/10 text-primary" : "text-on-surface hover:bg-on-surface/5"
                }`}
              >
                <span class={props.activeView === item.id ? "text-primary" : "text-outline/70"}><RailIcon id={item.icon} /></span>
                {item.label}
                <Show when={!props.signedIn && viewRequiresSignIn(item.id)}>
                  <span class="ml-auto rounded-full border border-amber-200/70 bg-amber-50 px-1.5 py-0.5 font-mono text-[8px] text-amber-700">sign in</span>
                </Show>
              </button>
            ))}
            <div class="mx-5 my-2 h-px bg-outline/10" />
            {ADVANCED_VIEW_ITEMS.map((item) => (
                <button
                  type="button"
                  onPointerEnter={() => signalViewIntent(item.id)}
                  onFocus={() => signalViewIntent(item.id)}
                  onPointerDown={() => signalViewIntent(item.id)}
                  onClick={() => { activateView(item.id); setShowMoreMenu(false); }}
                class={`flex w-full items-center gap-3 px-5 py-2.5 text-sm font-medium transition ${
                  props.activeView === item.id ? "bg-primary/10 text-primary" : "text-on-surface hover:bg-on-surface/5"
                }`}
              >
                <span class={props.activeView === item.id ? "text-primary" : "text-outline/70"}><RailIcon id={item.icon} /></span>
                {item.label}
                <Show when={!props.advanced}>
                  <span class="ml-auto rounded-full border border-outline/20 bg-outline/8 px-1.5 py-0.5 font-mono text-[8px] text-outline/50">adv</span>
                </Show>
                <Show when={!props.signedIn && viewRequiresSignIn(item.id)}>
                  <span class="rounded-full border border-amber-200/70 bg-amber-50 px-1.5 py-0.5 font-mono text-[8px] text-amber-700">sign in</span>
                </Show>
              </button>
            ))}
            <div class="mx-5 my-2 h-px bg-outline/10" />
            <div class="px-5 py-1">
              <p class="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-outline/50">Quick controls</p>
              <div class="space-y-1.5">
                <For each={QUICK_CONTROL_ACTIONS}>
                  {(action) => (
                    <button
                      type="button"
                      onClick={() => {
                        props.onQuickControl?.(action.id);
                        setShowMoreMenu(false);
                      }}
                      title={quickControlLaunchNotice(action)}
                      class="flex w-full items-start justify-between gap-3 rounded-xl border border-outline/10 bg-white/55 px-2.5 py-2 text-left text-xs transition hover:border-primary/20 hover:bg-primary/5"
                    >
                      <span class="min-w-0">
                        <span class="block font-semibold text-on-surface">{action.menuLabel}</span>
                        <span class="mt-0.5 block text-[10px] leading-4 text-on-surface-variant/70">{action.requiresConfirmation ? "opens confirmation surface" : "opens model settings"}</span>
                      </span>
                      <kbd class="shrink-0 rounded bg-on-surface/8 px-1.5 py-0.5 font-mono text-[9px] text-outline/70">{action.shortcut.replace("Ctrl+", "^")}</kbd>
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div class="mx-5 my-2 h-px bg-outline/10" />
            <button
              type="button"
              onClick={() => props.onToggleAdvanced()}
              class="flex w-full items-center gap-3 px-5 py-2 text-xs text-outline/60 transition hover:text-on-surface-variant"
            >
              <span class="font-mono text-[10px]">{props.advanced ? "-" : "+"}</span>
              {props.advanced ? "Hide advanced" : "Enable advanced mode"}
            </button>
            <Show when={recentSessionTrail().length > 0}>
              <div class="mx-5 my-3 h-px bg-outline/10" />
              <div class="px-5">
                <div class="mb-2 flex items-center justify-between gap-2">
                  <p class="font-mono text-[9px] uppercase tracking-[0.15em] text-outline/50">Session trail</p>
                  <span class="text-[10px] text-outline/40">recent views</span>
                </div>
                <div class="space-y-1.5">
                  <For each={recentSessionTrail()}>
                    {(entry) => (
                      <button
                        type="button"
                        onClick={() => {
                          selectAndPersist(entry.view);
                          setShowMoreMenu(false);
                        }}
                        class={`flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left text-xs transition ${
                          props.activeView === entry.view
                            ? "bg-primary/10 text-primary"
                            : "text-on-surface hover:bg-on-surface/5"
                        }`}
                        title={`${viewLabel(entry.view)} | ${sessionTrailAgeLabel(entry.viewedAt)}`}
                      >
                        <span class="min-w-0 truncate">
                          {viewLabel(entry.view)}
                          <Show when={props.activeView === entry.view}>
                            <span class="ml-1.5 rounded-full border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.12em] text-primary">
                              current
                            </span>
                          </Show>
                        </span>
                        <span class="shrink-0 font-mono text-[10px] text-outline/45">
                          {sessionTrailAgeLabel(entry.viewedAt)}
                        </span>
                      </button>
                    )}
                  </For>
                </div>
              </div>
            </Show>
            {/* History nav at drawer footer */}
            <div class="mt-auto border-t border-outline/10 px-5 pt-3">
              <p class="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-outline/50">Navigate</p>
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={availableViewHistory().length === 0}
                  title="Back (Alt+Left)"
                  class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-outline/15 text-xs text-outline/60 transition hover:bg-on-surface/5 hover:text-on-surface disabled:opacity-30"
                >
                  <RailIcon id="back" />Back
                </button>
                <button
                  type="button"
                  onClick={goForward}
                  disabled={availableViewFuture().length === 0}
                  title="Forward (Alt+Right)"
                  class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-outline/15 text-xs text-outline/60 transition hover:bg-on-surface/5 hover:text-on-surface disabled:opacity-30"
                >
                  Fwd<RailIcon id="forward" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* ? shortcut cheat sheet */}
      <Show when={showCheatSheet()}>
        <Portal>
          <div
            ref={cheatSheetPanelRef}
            class="fixed z-50 animate-fade-in"
            role="dialog"
            aria-modal="false"
            aria-label="Keyboard shortcuts"
            style={{
              top: `${cheatSheetPos()?.top ?? 16}px`,
              left: `${cheatSheetPos()?.left ?? 16}px`,
            }}
          >
            <div class="rounded-2xl border border-white/45 bg-white/95 p-4 shadow-panel backdrop-blur-xl min-w-[13em]">
            <div class="mb-2 flex items-center justify-between">
              <p class="font-mono text-[0.6em] uppercase tracking-[0.2em] text-outline">Keyboard shortcuts</p>
              <button
                type="button"
                onClick={() => setShowCheatSheet(false)}
                class="-mr-2 -mt-2 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-on-surface-variant/50 transition hover:bg-white/60 hover:text-on-surface"
                aria-label="Close keyboard shortcuts panel"
              >x</button>
            </div>
            <div class="space-y-1.5">
              <For each={sortedCheatSheetItems()}>
                {(item) => (
                  <div class="flex items-center justify-between gap-[1.5em] text-xs">
                    <span class="text-on-surface-variant">{item.label}</span>
                    <kbd class="rounded bg-on-surface/8 px-[0.5em] py-[0.15em] font-mono text-[0.85em] text-on-surface">{item.shortcut}</kbd>
                  </div>
                )}
              </For>
            </div>
          </div>
        </div>
        </Portal>
      </Show>
    </>
  );
}
