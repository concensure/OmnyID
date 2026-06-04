import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { useViewport } from "@/context/ViewportContext";
import { apiFetch, readSession } from "@/lib/api";
import { RailIcon } from "@/components/RailIcons";

export type ViewName = "search" | "threads" | "workflows" | "email" | "note" | "calendar" | "database" | "runner" | "agent_settings" | "diary" | "discover";

const CORE_ITEMS: Array<{ id: ViewName; label: string; icon: string; shortcut: string }> = [
  { id: "search",    label: "Chat",      icon: "💬", shortcut: "Ctrl+1" },
  { id: "threads",   label: "Threads",   icon: "🗂", shortcut: "Ctrl+2" },
  { id: "workflows", label: "Workflows", icon: "⚡", shortcut: "Ctrl+3" },
  { id: "email",     label: "Email",     icon: "✉", shortcut: "Ctrl+4" },
  { id: "note",      label: "Notes",     icon: "📝", shortcut: "Ctrl+5" },
  { id: "calendar",  label: "Calendar",  icon: "📅", shortcut: "Ctrl+6" },
  { id: "database",  label: "Database",  icon: "🗄", shortcut: "Ctrl+7" },
];

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
      const resp = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=weathercode,temperature_2m,relativehumidity_2m,windspeed_10m&timezone=auto`
      );
      const data = await resp.json() as { current: { weathercode: number; temperature_2m: number; relativehumidity_2m?: number; windspeed_10m?: number } };
      setWeather({
        code: data.current.weathercode,
        temp: Math.round(data.current.temperature_2m),
        humidity: data.current.relativehumidity_2m,
        windspeed: data.current.windspeed_10m != null ? Math.round(data.current.windspeed_10m) : undefined,
      });
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
}) {
  const [open, setOpen] = createSignal(false);
  const [firstRun, setFirstRun] = createSignal(
    !localStorage.getItem("omnyid.gesture_nav.seen")
  );

  let longPressTimer: ReturnType<typeof setTimeout>;

  function startLongPress() {
    longPressTimer = setTimeout(() => {
      setOpen(true);
      setFirstRun(false);
      localStorage.setItem("omnyid.gesture_nav.seen", "1");
    }, 600);
  }

  function cancelLongPress() {
    clearTimeout(longPressTimer);
  }

  onCleanup(() => clearTimeout(longPressTimer));

  const currentLabel = () =>
    CORE_ITEMS.find((i) => i.id === props.activeView)?.label ?? "Chat";

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
                  onClick={() => { props.onSelect(item.id); setOpen(false); }}
                >
                  <span class="text-lg leading-none" aria-hidden>{item.icon}</span>
                  {item.label}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>
    </>
  );
}

const SHORTCUTS_SEEN_KEY = "omnyid.nav.shortcuts_seen";
const LAST_VISIT_KEY = "omnyid.nav.lastvisit";
const WORKFLOW_RESULT_KEY = "omnyid.nav.workflow_new_result";

// ── NavBar ────────────────────────────────────────────────────────────────────
export function NavBar(props: {
  activeView: ViewName;
  onSelect: (view: ViewName) => void;
  signedIn: boolean;
  advanced: boolean;
  onToggleAdvanced: () => void;
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
}) {
  const _vp = useViewport();
  const isWatch = () => _vp?.isWatch?.() ?? false;
  const [viewHistory, setViewHistory] = createSignal<ViewName[]>([]);
  const [viewFuture, setViewFuture] = createSignal<ViewName[]>([]);
  const [showShortcutHint, setShowShortcutHint] = createSignal(!localStorage.getItem(SHORTCUTS_SEEN_KEY));
  const [chatPulsing, setChatPulsing] = createSignal(false);
  const [showCheatSheet, setShowCheatSheet] = createSignal(false);
  const [showMoreMenu, setShowMoreMenu] = createSignal(false);
  let moreMenuRef: HTMLDivElement | undefined;
  const [lastVisited, setLastVisited] = createSignal<Record<string, number>>(
    (() => { try { return JSON.parse(localStorage.getItem(LAST_VISIT_KEY) ?? "{}") as Record<string, number>; } catch { return {}; } })()
  );
  const [persistedNewResult, setPersistedNewResult] = createSignal(
    localStorage.getItem(WORKFLOW_RESULT_KEY) === "1"
  );
  const [llmConfigured, setLlmConfigured] = createSignal<boolean | null>(null);
  const llmLastPingFailed = localStorage.getItem("omnyid.llm.last_ping_ok") === "0";
  const SESSION_RUNS_KEY = "omnyid.session.runs_started";
  const [sessionRunsStarted, setSessionRunsStarted] = createSignal(
    parseInt(sessionStorage.getItem(SESSION_RUNS_KEY) ?? "0")
  );
  const [sessionTick, setSessionTick] = createSignal(0);
  const [showSessionMenu, setShowSessionMenu] = createSignal(false);
  const [connStatus, setConnStatus] = createSignal<"fast" | "connected" | "slow" | "offline">(navigator.onLine ? "connected" : "offline");
  const CONN_COLORS = { fast: "bg-green-400", connected: "bg-blue-400", slow: "bg-amber-400", offline: "bg-gray-400" } as const;
  const CONN_LABELS = { fast: "Transport: fast (<300ms)", connected: "Transport: connected", slow: "Transport: high latency", offline: "Transport: offline" } as const;
  let sessionChipRef: HTMLDivElement | undefined;
  const LAST_RUN_KEY = "omnyid.fleet.lastrun";
  const AGENT_ACTIVE_SINCE_KEY = "omnyid.fleet.active_since";
  const [lastRun, setLastRun] = createSignal<{ name: string; finishedAt: number } | null>(
    (() => { try { const v = localStorage.getItem(LAST_RUN_KEY); return v ? JSON.parse(v) as { name: string; finishedAt: number } : null; } catch { return null; } })()
  );
  const [agentActiveSince, setAgentActiveSince] = createSignal<Record<string, number>>(
    (() => { try { const v = localStorage.getItem(AGENT_ACTIVE_SINCE_KEY); return v ? JSON.parse(v) as Record<string, number> : {}; } catch { return {}; } })()
  );
  let prevAgentNames: string[] = [];
  createEffect(() => {
    const currNames = props.activeAgentNames ?? [];
    const prev = prevAgentNames;
    if (prev.length > currNames.length) {
      const gone = prev.find((n) => !currNames.includes(n));
      if (gone) {
        const entry = { name: gone, finishedAt: Date.now() };
        localStorage.setItem(LAST_RUN_KEY, JSON.stringify(entry));
        setLastRun(entry);
      }
    }
    const now = Date.now();
    setAgentActiveSince((prev) => {
      const next: Record<string, number> = {};
      for (const name of currNames) next[name] = prev[name] ?? now;
      localStorage.setItem(AGENT_ACTIVE_SINCE_KEY, JSON.stringify(next));
      return next;
    });
    const newNames = currNames.filter((n) => !prev.includes(n));
    if (newNames.length > 0) {
      setSessionRunsStarted((n) => {
        const next = n + newNames.length;
        sessionStorage.setItem(SESSION_RUNS_KEY, String(next));
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
  const sessionStarted = (() => {
    const key = "omnyid.session.started";
    const v = sessionStorage.getItem(key);
    if (v) return parseInt(v);
    const now = Date.now();
    sessionStorage.setItem(key, String(now));
    return now;
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

  createEffect(() => {
    if (props.workflowNewResult) {
      localStorage.setItem(WORKFLOW_RESULT_KEY, "1");
      setPersistedNewResult(true);
    }
  });

  function goBack() {
    const h = viewHistory();
    if (h.length === 0) return;
    const prev = h[h.length - 1];
    setViewFuture((f) => [props.activeView, ...f.slice(0, 19)]);
    setViewHistory((h) => h.slice(0, -1));
    props.onSelect(prev);
  }

  function goForward() {
    const f = viewFuture();
    if (f.length === 0) return;
    const next = f[0];
    setViewHistory((h) => [...h.slice(-19), props.activeView]);
    setViewFuture((f) => f.slice(1));
    props.onSelect(next);
  }

  function selectAndPersist(view: ViewName) {
    if (props.activeView !== view) {
      setViewHistory((h) => [...h.slice(-19), props.activeView]);
      setViewFuture([]);
    }
    const now = Date.now();
    const next = { ...lastVisited(), [view]: now };
    setLastVisited(next);
    localStorage.setItem(LAST_VISIT_KEY, JSON.stringify(next));
    if (view === "workflows") {
      setPersistedNewResult(false);
      localStorage.removeItem(WORKFLOW_RESULT_KEY);
    }
    props.onSelect(view);
  }

  function lastVisitSuffix(viewId: string): string {
    const ts = lastVisited()[viewId];
    if (!ts) return "";
    const secs = Math.floor((Date.now() - ts) / 1000);
    if (secs < 120) return "";
    if (secs < 3600) return ` · last seen ${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return ` · last seen ${Math.floor(secs / 3600)}h ago`;
    return ` · last seen ${Math.floor(secs / 86400)}d ago`;
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
      localStorage.setItem(SHORTCUTS_SEEN_KEY, "1");
    }, 6000);
    onCleanup(() => clearTimeout(id));
  });

  onMount(() => {
    function onDocClickSession(e: MouseEvent) {
      if (sessionChipRef && !sessionChipRef.contains(e.target as Node)) setShowSessionMenu(false);
      if (moreMenuRef && !moreMenuRef.contains(e.target as Node)) setShowMoreMenu(false);
    }
    document.addEventListener("mousedown", onDocClickSession);
    onCleanup(() => document.removeEventListener("mousedown", onDocClickSession));

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { setShowCheatSheet(false); setShowSessionMenu(false); setShowMoreMenu(false); return; }
      if (e.ctrlKey && e.shiftKey && e.key === "F") { e.preventDefault(); props.onFleetClick(); return; }
      if (e.altKey && e.key === "m") { e.preventDefault(); setShowMoreMenu((v) => !v); return; }
      if (e.altKey && e.key === "ArrowLeft")  { e.preventDefault(); goBack();    return; }
      if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); goForward(); return; }
      if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      setShowCheatSheet((v) => !v);
    }
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });

  onMount(() => {
    apiFetch<{ backend?: string }>("/llm/config")
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
      const t0 = Date.now();
      try {
        await fetch("/", { method: "HEAD" });
        const ms = Date.now() - t0;
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
      {/* Keyboard shortcut first-run hint */}
      <Show when={showShortcutHint() && !isWatch()}>
        <div class="fixed bottom-4 right-4 z-50 animate-fade-in">
          <div class="flex items-center gap-3 rounded-2xl border border-primary/20 bg-white/90 px-4 py-3 shadow-panel backdrop-blur-xl">
            <span class="text-sm text-on-surface">
              Tip: <kbd class="rounded bg-on-surface/8 px-1.5 py-0.5 font-mono text-xs">Ctrl+1–7</kbd> to switch views,{" "}
              <kbd class="rounded bg-on-surface/8 px-1.5 py-0.5 font-mono text-xs">Ctrl+K</kbd> to search
            </span>
            <button
              type="button"
              onClick={() => { setShowShortcutHint(false); localStorage.setItem(SHORTCUTS_SEEN_KEY, "1"); }}
              class="text-on-surface-variant/50 transition hover:text-on-surface"
              aria-label="Dismiss"
            >×</button>
          </div>
        </div>
      </Show>

      {/* Watch mode: chrome-less gesture nav */}
      <Show when={isWatch()}>
        <GestureNav activeView={props.activeView} onSelect={props.onSelect} />
      </Show>

      {/* ── Left navigation rail ─────────────────────────────────────── */}
      <Show when={!isWatch()}>
        <aside class="fixed left-0 top-0 bottom-0 z-40 flex w-16 flex-col items-center border-r border-white/20 bg-white/75 py-3 backdrop-blur-2xl">

          {/* Logo mark — asymmetric bento, acts as "home dashboard" button */}
          <div class="group relative mb-2 flex w-full justify-center">
            <button
              type="button"
              title="OmnyID workspace"
              class="rail-icon-btn flex h-11 w-11 items-center justify-center rounded-2xl text-primary outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
            >
              <RailIcon id="home" />
            </button>
          </div>

          <div class="mx-3 mb-2 h-px w-10 bg-outline/10" />

          {/* Core nav items */}
          <nav class="flex flex-1 flex-col items-center gap-0.5 overflow-y-auto py-1 w-full">
            <For each={CORE_ITEMS}>
              {(item) => {
                const active = () => props.activeView === item.id;
                const badge = () => {
                  if (item.id === "workflows" && ((props.workflowBadge ?? 0) > 0 || persistedNewResult()))
                    return String((props.workflowBadge ?? 0) > 0 ? props.workflowBadge : "!");
                  if (item.id === "threads" && (props.threadBadge ?? 0) > 0)
                    return String(props.threadBadge);
                  return null;
                };
                return (
                  <div class="group relative flex w-full justify-center">
                    <button
                      type="button"
                      onClick={() => selectAndPersist(item.id)}
                      class={`rail-icon-btn relative flex h-11 w-11 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50
                        ${active()
                          ? "bg-on-surface text-white"
                          : "text-outline/70 hover:bg-white/60 hover:text-on-surface"
                        }
                        ${item.id === "search" && chatPulsing() ? "ring-2 ring-primary/50" : ""}`}
                    >
                      <RailIcon id={item.id} />
                      <Show when={badge()}>
                        <span class="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 font-mono text-[8px] font-bold text-white">
                          {badge()}
                        </span>
                      </Show>
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
          </nav>

          <div class="mx-3 my-2 h-px w-10 bg-outline/10" />

          {/* Bottom controls */}
          <div class="flex flex-col items-center gap-0.5 pb-1 w-full">

            {/* Fleet status indicator */}
            <div class="group relative flex w-full justify-center">
              <button
                type="button"
                onClick={props.onFleetClick}
                class={`rail-icon-btn relative flex h-11 w-11 items-center justify-center rounded-2xl text-outline/70 outline-none hover:bg-white/60 hover:text-on-surface focus-visible:ring-2 focus-visible:ring-primary/50`}
                title="Agent fleet"
              >
                <RailIcon id="fleet" />
                {/* Live pulse dot */}
                <span class={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${props.activeCount > 0 ? "animate-pulse bg-blue-500" : "bg-emerald-400"}`} />
                <Show when={llmConfigured() === false}>
                  <span class="absolute left-1.5 top-1.5 h-2 w-2 rounded-full bg-amber-400" title="LLM not configured" />
                </Show>
              </button>
              <div class="rail-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                {props.activeCount > 0
                  ? `${props.activeCount} active · ${props.idleCount} idle`
                  : `${props.idleCount} agents ready`}
                <Show when={lastRunLabel()}>
                  <span class="ml-1.5 text-outline/50">{lastRunLabel()}</span>
                </Show>
              </div>
            </div>

            {/* Connectivity dot */}
            <div class="group relative flex w-full justify-center">
              <div class="flex h-7 w-11 items-center justify-center">
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
                onClick={() => setShowCheatSheet((v) => !v)}
                class={`rail-icon-btn flex h-11 w-11 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${showCheatSheet() ? "bg-primary/12 text-primary" : "text-outline/70 hover:bg-white/60 hover:text-on-surface"}`}
                title="Keyboard shortcuts (?)"
              >
                <RailIcon id="help" />
              </button>
              <div class="rail-tooltip pointer-events-none absolute left-full top-1/2 z-50 ml-2.5 -translate-y-1/2 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                Shortcuts <span class="ml-1.5 font-mono text-[9px] text-outline/50">?</span>
              </div>
            </div>

            {/* More views */}
            <div ref={moreMenuRef} class="group relative flex w-full justify-center">
              <button
                type="button"
                onClick={() => setShowMoreMenu((v) => !v)}
                aria-expanded={showMoreMenu()}
                class={`rail-icon-btn flex h-11 w-11 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  showMoreMenu() || ["diary","discover","runner","agent_settings"].includes(props.activeView)
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
                  setShowSessionMenu((v) => !v);
                }}
                class={`rail-icon-btn flex h-11 w-11 items-center justify-center rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${showSessionMenu() ? "bg-on-surface/8 text-on-surface" : "text-outline/70 hover:bg-white/60 hover:text-on-surface"}`}
              >
                <RailIcon id="user" />
              </button>
              <div class="rail-tooltip pointer-events-none absolute left-full bottom-0 z-50 ml-2.5 translate-x-[-4px] whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-3 py-1.5 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl group-hover:translate-x-0 group-hover:opacity-100">
                {props.signedIn
                  ? `${sessionUserName ?? "Signed in"}${sessionDurationLabel() ? " · " + sessionDurationLabel() : ""}`
                  : "Guest — sign in"}
              </div>
              <Show when={showSessionMenu()}>
                <div class="absolute left-full bottom-0 z-50 ml-2 min-w-[180px] animate-fade-in rounded-2xl border border-white/45 bg-white/95 p-3 shadow-panel backdrop-blur-xl">
                  <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline mb-2">Session</p>
                  <Show when={sessionDurationLabel()}>
                    <p class="mb-2 text-xs text-on-surface-variant">
                      Started {new Date(sessionStarted).toLocaleTimeString()} · {sessionDurationLabel()}
                    </p>
                  </Show>
                  <Show when={sessionRunsStarted() > 0}>
                    <p class="mb-2 text-xs text-on-surface-variant">
                      {sessionRunsStarted()} agent run{sessionRunsStarted() === 1 ? "" : "s"} this session
                    </p>
                  </Show>
                  <Show when={llmLastPingFailed}>
                    <p class="mb-2 flex items-center gap-1 rounded-lg border border-amber-200/60 bg-amber-50/80 px-2 py-1 text-[10px] text-amber-700">
                      <span>⚠</span> Last LLM test failed
                    </p>
                  </Show>
                  <Show when={props.signedIn}>
                    <button
                      type="button"
                      onClick={async () => {
                        try { await apiFetch("/auth/signout", { method: "POST" }); } catch { /* ignore */ }
                        window.location.reload();
                      }}
                      class="w-full rounded-lg border border-red-200/60 bg-red-50/80 px-3 py-1.5 text-left text-xs font-medium text-red-600 transition hover:bg-red-100/80"
                    >Sign out</button>
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
            {([
              { id: "diary"         as ViewName, label: "Diary",         icon: "diary"          as const },
              { id: "discover"      as ViewName, label: "Discover",      icon: "discover"       as const },
            ]).map((item) => (
              <button
                type="button"
                onClick={() => { selectAndPersist(item.id); setShowMoreMenu(false); }}
                class={`flex w-full items-center gap-3 px-5 py-2.5 text-sm font-medium transition ${
                  props.activeView === item.id ? "bg-primary/10 text-primary" : "text-on-surface hover:bg-on-surface/5"
                }`}
              >
                <span class={props.activeView === item.id ? "text-primary" : "text-outline/70"}><RailIcon id={item.icon} /></span>
                {item.label}
              </button>
            ))}
            <div class="mx-5 my-2 h-px bg-outline/10" />
            {([
              { id: "runner"        as ViewName, label: "Runner",         icon: "runner"         as const },
              { id: "agent_settings"as ViewName, label: "Agent Settings", icon: "agent_settings" as const },
            ]).map((item) => (
              <button
                type="button"
                onClick={() => { selectAndPersist(item.id); setShowMoreMenu(false); }}
                class={`flex w-full items-center gap-3 px-5 py-2.5 text-sm font-medium transition ${
                  props.activeView === item.id ? "bg-primary/10 text-primary" : "text-on-surface hover:bg-on-surface/5"
                }`}
              >
                <span class={props.activeView === item.id ? "text-primary" : "text-outline/70"}><RailIcon id={item.icon} /></span>
                {item.label}
                <Show when={!props.advanced}>
                  <span class="ml-auto rounded-full border border-outline/20 bg-outline/8 px-1.5 py-0.5 font-mono text-[8px] text-outline/50">adv</span>
                </Show>
              </button>
            ))}
            <div class="mx-5 my-2 h-px bg-outline/10" />
            <button
              type="button"
              onClick={() => props.onToggleAdvanced()}
              class="flex w-full items-center gap-3 px-5 py-2 text-xs text-outline/60 transition hover:text-on-surface-variant"
            >
              <span class="font-mono text-[10px]">{props.advanced ? "−" : "+"}</span>
              {props.advanced ? "Hide advanced" : "Enable advanced mode"}
            </button>
            {/* History nav at drawer footer */}
            <div class="mt-auto border-t border-outline/10 px-5 pt-3">
              <p class="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-outline/50">Navigate</p>
              <div class="flex gap-2">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={viewHistory().length === 0}
                  title="Back (Alt+←)"
                  class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-outline/15 text-xs text-outline/60 transition hover:bg-on-surface/5 hover:text-on-surface disabled:opacity-30"
                >
                  <RailIcon id="back" />Back
                </button>
                <button
                  type="button"
                  onClick={goForward}
                  disabled={viewFuture().length === 0}
                  title="Forward (Alt+→)"
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
        <div class="fixed bottom-4 right-4 z-50 animate-fade-in">
          <div class="rounded-2xl border border-white/45 bg-white/95 p-4 shadow-panel backdrop-blur-xl min-w-[13em]">
            <div class="mb-2 flex items-center justify-between">
              <p class="font-mono text-[0.6em] uppercase tracking-[0.2em] text-outline">Keyboard shortcuts</p>
              <button
                type="button"
                onClick={() => setShowCheatSheet(false)}
                class="text-on-surface-variant/50 transition hover:text-on-surface"
                aria-label="Close"
              >×</button>
            </div>
            <div class="space-y-1.5">
              <For each={CORE_ITEMS}>
                {(item) => (
                  <div class="flex items-center justify-between gap-[1.5em] text-xs">
                    <span class="text-on-surface-variant">{item.label}</span>
                    <kbd class="rounded bg-on-surface/8 px-[0.5em] py-[0.15em] font-mono text-[0.85em] text-on-surface">{item.shortcut}</kbd>
                  </div>
                )}
              </For>
              <div class="flex items-center justify-between gap-[1.5em] text-xs">
                <span class="text-on-surface-variant">Chat / Focus</span>
                <kbd class="rounded bg-on-surface/8 px-[0.5em] py-[0.15em] font-mono text-[0.85em] text-on-surface">Ctrl+K</kbd>
              </div>
              <div class="flex items-center justify-between gap-[1.5em] text-xs">
                <span class="text-on-surface-variant">Fleet Panel</span>
                <kbd class="rounded bg-on-surface/8 px-[0.5em] py-[0.15em] font-mono text-[0.85em] text-on-surface">Ctrl+⇧+F</kbd>
              </div>
              <div class="flex items-center justify-between gap-[1.5em] text-xs">
                <span class="text-on-surface-variant">More views</span>
                <kbd class="rounded bg-on-surface/8 px-[0.5em] py-[0.15em] font-mono text-[0.85em] text-on-surface">Alt+M</kbd>
              </div>
              <div class="flex items-center justify-between gap-[1.5em] text-xs">
                <span class="text-on-surface-variant">Back / Forward</span>
                <kbd class="rounded bg-on-surface/8 px-[0.5em] py-[0.15em] font-mono text-[0.85em] text-on-surface">Alt+←/→</kbd>
              </div>
              <div class="flex items-center justify-between gap-[1.5em] text-xs">
                <span class="text-on-surface-variant">Filter feed</span>
                <kbd class="rounded bg-on-surface/8 px-[0.5em] py-[0.15em] font-mono text-[0.85em] text-on-surface">f</kbd>
              </div>
              <div class="flex items-center justify-between gap-[1.5em] text-xs">
                <span class="text-on-surface-variant">Shortcuts</span>
                <kbd class="rounded bg-on-surface/8 px-[0.5em] py-[0.15em] font-mono text-[0.85em] text-on-surface">?</kbd>
              </div>
            </div>
          </div>
        </div>
      </Show>
    </>
  );
}
