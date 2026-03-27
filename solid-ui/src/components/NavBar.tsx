import { createSignal, onMount, Show } from "solid-js";

export type ViewName = "search" | "threads" | "workflows" | "email" | "note" | "calendar" | "database" | "runner" | "agent_settings";

// ── Live weather + date widget ────────────────────────────────────────────────
function emojiForCode(code: number): string {
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 55) return "🌦️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  if (code <= 86) return "🌨️";
  return "⛈️";
}

function WeatherDate() {
  const [weather, setWeather] = createSignal<{ code: number; temp: number } | null>(null);

  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const now = new Date();
  const dayLabel = DAYS[now.getDay()];
  const dateLabel = now.toLocaleDateString(undefined, { day: "numeric", month: "short" });

  onMount(() => {
    if (!("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const resp = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weathercode,temperature_2m&timezone=auto`
          );
          const data = await resp.json() as { current: { weathercode: number; temperature_2m: number } };
          setWeather({ code: data.current.weathercode, temp: Math.round(data.current.temperature_2m) });
        } catch { /* ignore */ }
      },
      () => { /* denied — show calendar icon only */ }
    );
  });

  return (
    <div class="flex items-center gap-2.5">
      <span class="text-3xl leading-none" aria-hidden>
        {weather() ? emojiForCode(weather()!.code) : "📅"}
      </span>
      <div>
        <p class="text-base font-semibold text-on-surface">{dayLabel}, {dateLabel}</p>
        <Show when={weather()}>
          <p class="text-[11px] text-on-surface-variant">{weather()!.temp}°C</p>
        </Show>
      </div>
    </div>
  );
}

// ── NavBar ────────────────────────────────────────────────────────────────────
export function NavBar(props: {
  activeView: ViewName;
  onSelect: (view: ViewName) => void;
  signedIn: boolean;
  advanced: boolean;
  onToggleAdvanced: () => void;
  activeCount: number;
  idleCount: number;
  onFleetClick: () => void;
}) {
  const coreItems: Array<{ id: ViewName; label: string }> = [
    { id: "search", label: "Chat" },
    { id: "threads", label: "Threads" },
    { id: "workflows", label: "Workflows" },
    { id: "email", label: "Email" },
    { id: "note", label: "Note" },
    { id: "calendar", label: "Calendar" },
    { id: "database", label: "Database" },
  ];

  return (
    <div class="flex flex-wrap items-center justify-between gap-4">
      {/* Weather + date (replaces static "Your private agent" text) */}
      <WeatherDate />

      {/* Main nav tabs */}
      <nav class="flex items-center gap-1 rounded-full border border-white/35 bg-white/35 px-2 py-2">
        {coreItems.map((item) => (
          <button
            type="button"
            class={`glass-button rounded-full px-4 py-2 text-sm font-medium transition ${
              props.activeView === item.id
                ? "bg-primary text-white"
                : "bg-transparent text-on-surface-variant hover:bg-white/50"
            }`}
            onClick={() => props.onSelect(item.id)}
          >
            {item.label}
          </button>
        ))}
        <Show when={props.advanced}>
          <button
            type="button"
            class={`glass-button rounded-full px-4 py-2 text-sm font-medium transition ${
              props.activeView === "runner"
                ? "bg-primary text-white"
                : "bg-transparent text-on-surface-variant hover:bg-white/50"
            }`}
            onClick={() => props.onSelect("runner")}
          >
            Runner
          </button>
          <button
            type="button"
            class={`glass-button rounded-full px-4 py-2 text-sm font-medium transition ${
              props.activeView === "agent_settings"
                ? "bg-primary text-white"
                : "bg-transparent text-on-surface-variant hover:bg-white/50"
            }`}
            onClick={() => props.onSelect("agent_settings")}
          >
            Agent Settings
          </button>
        </Show>
        <button
          type="button"
          title={props.advanced ? "Hide advanced tools" : "Show advanced tools"}
          class={`ml-1 rounded-full px-3 py-2 text-xs font-medium transition ${
            props.advanced
              ? "bg-white/40 text-on-surface"
              : "bg-transparent text-on-surface-variant hover:bg-white/30"
          }`}
          onClick={props.onToggleAdvanced}
        >
          {props.advanced ? "Advanced ✕" : "Advanced ▾"}
        </button>
      </nav>

      {/* Right cluster: fleet status + pulse + session badge */}
      <div class="flex items-center gap-3">
        {/* Fleet status — clickable to open fleet pane */}
        <button
          type="button"
          onClick={props.onFleetClick}
          class="flex items-center gap-2 rounded-full border border-white/35 bg-white/35 px-3 py-2 text-sm text-on-surface-variant transition hover:bg-white/50"
          title="View agent fleet"
        >
          <span class={`h-2 w-2 rounded-full flex-shrink-0 ${props.activeCount > 0 ? "animate-pulse bg-blue-500" : "bg-green-400"}`} />
          {props.activeCount} active / {props.idleCount} idle
        </button>
        <div class="rounded-full border border-white/35 bg-white/35 px-3 py-2 text-sm text-on-surface-variant">
          {props.signedIn ? "Signed in · OmnyID session active" : "Guest mode — sign in for full access"}
        </div>
      </div>
    </div>
  );
}
