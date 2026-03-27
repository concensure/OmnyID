import { createSignal } from "solid-js";

export function SearchBar(props: {
  busy?: boolean;
  onSubmit: (query: string, engine: string, optimizationMode: string) => void;
}) {
  const [query, setQuery] = createSignal("");
  const [engine, setEngine] = createSignal("duckduckgo");
  const [optMode, setOptMode] = createSignal("balanced");

  return (
    <form
      class="relative mx-auto w-full max-w-4xl"
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit(query(), engine(), optMode());
      }}
    >
      <div class="glass-surface flex items-center gap-4 rounded-[28px] border border-white/45 px-6 py-5 shadow-panel">
        <div class="flex flex-1 items-center gap-3">
          <span class="h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_18px_rgba(49,86,142,0.4)]" />
          <input
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            class="w-full bg-transparent text-lg text-on-surface outline-none placeholder:text-on-surface-variant/35 placeholder:font-light"
            placeholder="Hi! I'm your master agent. What would you like me to do today?"
          />
        </div>
        {/* Optimization mode */}
        <select
          value={optMode()}
          onChange={(event) => setOptMode(event.currentTarget.value)}
          class="rounded-full border border-white/45 bg-white/60 px-3 py-2 text-xs text-on-surface outline-none"
          title="Optimization mode for this task"
        >
          <option value="balanced">Balanced</option>
          <option value="speed">Fast</option>
          <option value="cost">Cheap</option>
        </select>
        {/* Search engine */}
        <select
          value={engine()}
          onChange={(event) => setEngine(event.currentTarget.value)}
          class="rounded-full border border-white/45 bg-white/60 px-4 py-2 text-sm text-on-surface outline-none"
        >
          <option value="duckduckgo">DuckDuckGo</option>
          <option value="google">Google</option>
        </select>
        <button
          type="submit"
          disabled={props.busy}
          class="glass-button rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {props.busy ? "Routing..." : "Run"}
        </button>
      </div>
    </form>
  );
}
