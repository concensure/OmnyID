import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

const PLACEHOLDERS = [
  "Hi! I'm your master agent. What would you like me to do today?",
  "Try: 'Summarise my emails from today'",
  "Try: 'What did I learn this week?'",
  "Try: 'Remind me to follow up with Alex tomorrow'",
  "Try: 'Find everything I saved about machine learning'",
];

const RECENT_KEY = "omnyid.search.recent";
const MAX_RECENT = 8;
const SELECT_HINT_KEY = "omnyid.search.select_hint_seen";
const OPT_MODE_KEY = "omnyid.search.optmode";
const ENGINE_KEY = "omnyid.search.engine";
const SESSION_HIST_KEY = "omnyid.search.session_hist";

const SMART_TEMPLATES: Array<(q: string) => string> = [
  (q) => `Summarise ${q}`,
  (q) => `Find everything I know about ${q}`,
  (q) => `Research and report on ${q}`,
  (q) => `Write a note about ${q}`,
  (q) => `Remind me about ${q}`,
];

function loadRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}

function saveRecent(q: string) {
  const list = [q, ...loadRecent().filter((r) => r !== q)].slice(0, MAX_RECENT);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

export function SearchBar(props: {
  busy?: boolean;
  focusTrigger?: number;
  onSubmit: (query: string, engine: string, optimizationMode: string) => void | Promise<void>;
}) {
  const [query, setQuery] = createSignal("");
  const [engine, setEngine] = createSignal(localStorage.getItem(ENGINE_KEY) ?? "duckduckgo");
  const [optMode, setOptMode] = createSignal(localStorage.getItem(OPT_MODE_KEY) ?? "balanced");
  const [placeholderIdx, setPlaceholderIdx] = createSignal(0);
  const [focused, setFocused] = createSignal(false);
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [recentQueries, setRecentQueries] = createSignal<string[]>(loadRecent());
  const [submitted, setSubmitted] = createSignal(false);
  const [submitFailed, setSubmitFailed] = createSignal(false);
  const [submitErrorMsg, setSubmitErrorMsg] = createSignal("");
  const [sessionHistory, setSessionHistory] = createSignal<string[]>(
    (() => { try { return JSON.parse(sessionStorage.getItem(SESSION_HIST_KEY) ?? "[]"); } catch { return []; } })()
  );
  const [showSelectHint, setShowSelectHint] = createSignal(false);
  const [recentClearPending, setRecentClearPending] = createSignal(false);
  const [selectFocused, setSelectFocused] = createSignal(false);
  const [arrowNavIdx, setArrowNavIdx] = createSignal(-1);
  const [rerunMode, setRerunMode] = createSignal<string>(localStorage.getItem(OPT_MODE_KEY) ?? "balanced");
  const MODES = ["balanced", "speed", "cost"] as const;
  const MODE_LABELS: Record<string, string> = { balanced: "B", speed: "P", cost: "C" };
  const MODE_TITLES: Record<string, string> = { balanced: "Balanced", speed: "Power", cost: "Cheap" };
  function cycleRerunMode() { setRerunMode((m) => MODES[(MODES.indexOf(m as typeof MODES[number]) + 1) % MODES.length]); }
  let recentClearTimer: ReturnType<typeof setTimeout> | undefined;
  let textareaRef: HTMLTextAreaElement | undefined;
  let formRef: HTMLFormElement | undefined;

  function armClear() { setRecentClearPending(true); recentClearTimer = setTimeout(() => setRecentClearPending(false), 3000); }
  function confirmClear() {
    clearTimeout(recentClearTimer);
    setRecentClearPending(false);
    localStorage.removeItem(RECENT_KEY);
    setRecentQueries([]);
  }

  createEffect(() => {
    const t = props.focusTrigger;
    if (t && t > 0) textareaRef?.focus();
  });

  // Debounce query so suggestions don't recompute on every single keystroke.
  const [debouncedQuery, setDebouncedQuery] = createSignal("");
  createEffect(() => {
    const q = query();
    const id = setTimeout(() => setDebouncedQuery(q), 300);
    onCleanup(() => clearTimeout(id));
  });

  const smartSuggestions = createMemo(() => {
    const q = debouncedQuery().trim();
    if (q.length < 2) return [];
    const contextual: string[] = [];
    const nounMatch = q.match(/(?:^|\s)([A-Z][a-z]{2,})/);
    if (nounMatch) contextual.push(`What do I know about ${nounMatch[1]}?`);
    if (/\b(today|yesterday|last\s+week|this\s+(?:week|month)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(q)) {
      contextual.push(`Summarise ${q} from my notes and emails`);
    }
    return [...contextual, ...SMART_TEMPLATES.map((fn) => fn(q))].slice(0, 5);
  });

  const timeOfDaySuggestions = createMemo(() => {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return ["Summarise my overnight emails", "What's on my schedule today?", "What did I save yesterday?"];
    if (h >= 12 && h < 17) return ["What's on my calendar this afternoon?", "Any important emails since this morning?", "What am I working on today?"];
    return ["What did I accomplish today?", "Summarise today's activity", "Anything I should follow up on tomorrow?"];
  });

  function autoResize() {
    if (!textareaRef) return;
    textareaRef.style.height = "auto";
    textareaRef.style.height = `${textareaRef.scrollHeight}px`;
  }

  onMount(() => {
    const id = setInterval(() => {
      if (!focused() && !query()) setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length);
    }, 4000);

    function onDocClick(e: MouseEvent) {
      if (formRef && !formRef.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", onDocClick);

    onCleanup(() => {
      clearInterval(id);
      document.removeEventListener("mousedown", onDocClick);
      clearTimeout(recentClearTimer);
    });
  });

  function pickSuggestion(text: string) {
    setQuery(text);
    setShowDropdown(false);
    requestAnimationFrame(() => autoResize());
  }

  async function submitQuery(q: string, modeOverride?: string) {
    saveRecent(q);
    setRecentQueries(loadRecent());
    setSessionHistory((prev) => {
      const next = [q, ...prev.filter((r) => r !== q)].slice(0, 20);
      sessionStorage.setItem(SESSION_HIST_KEY, JSON.stringify(next));
      return next;
    });
    setShowDropdown(false);
    try {
      await props.onSubmit(q, engine(), modeOverride ?? optMode());
      setQuery("");
      if (textareaRef) textareaRef.style.height = "auto";
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 1500);
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : "";
      const targeted = msg.includes("rate_limit") || msg.includes("rate limit")
        ? "Rate limited — retry in a moment"
        : msg.includes("context_length") || msg.includes("too long") || msg.includes("max_tokens")
          ? "Query too long — try a shorter version"
          : "";
      setSubmitErrorMsg(targeted);
      setSubmitFailed(true);
      setTimeout(() => { setSubmitFailed(false); setSubmitErrorMsg(""); }, 2000);
    }
  }

  async function handleSubmit() {
    const q = query().trim();
    if (!q) return;
    await submitQuery(q);
  }

  const dropdownVisible = () =>
    showDropdown() && (
      smartSuggestions().length > 0 ||
      recentQueries().length > 0 ||
      (!query() && timeOfDaySuggestions().length > 0) ||
      (!query() && sessionHistory().length > 0)
    );

  return (
    <form
      ref={formRef}
      class="relative mx-auto w-full max-w-4xl"
      onSubmit={(event) => {
        event.preventDefault();
        void handleSubmit();
      }}
    >
      <div class={`glass-surface flex items-start gap-4 rounded-[28px] border px-6 py-5 shadow-panel relative overflow-hidden transition-colors duration-500 ${submitFailed() ? "border-red-400/60 bg-red-500/5" : submitted() ? "border-green-400/60 bg-green-500/5" : "border-white/45"}`}>
        <Show when={props.busy}>
          <div class="absolute bottom-0 left-0 h-[2px] w-full animate-pulse bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
        </Show>
        <Show when={!props.busy && query().length > 0}>
          <div
            class={`absolute bottom-0 left-0 h-[2px] transition-all duration-500 ${
              query().length >= 16384 ? "bg-red-400/70" : query().length >= 13107 ? "bg-amber-400/70" : "bg-emerald-400/50"
            }`}
            style={`width: ${Math.min(100, (query().length / 16384) * 100)}%`}
          />
        </Show>
        <div class="flex flex-1 items-start gap-3 pt-0.5">
          <span class="mt-1.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-primary shadow-[0_0_18px_rgba(49,86,142,0.4)]" />
          <textarea
            ref={textareaRef}
            rows={1}
            value={query()}
            onInput={(event) => {
              setQuery(event.currentTarget.value);
              setArrowNavIdx(-1);
              autoResize();
              setShowDropdown(true);
            }}
            onFocus={() => { setFocused(true); setShowDropdown(true); }}
            onBlur={() => setFocused(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSubmit();
              }
              if (event.key === "Escape") setShowDropdown(false);
              if ((event.key === "ArrowDown" || event.key === "ArrowUp") && dropdownVisible() && recentQueries().length > 0) {
                event.preventDefault();
                const len = recentQueries().length;
                const next = event.key === "ArrowDown"
                  ? (arrowNavIdx() + 1) % len
                  : ((arrowNavIdx() - 1) + len) % len;
                setArrowNavIdx(next);
                setQuery(recentQueries()[next]);
                requestAnimationFrame(() => autoResize());
              }
            }}
            class="w-full resize-none overflow-hidden bg-transparent text-lg leading-7 text-on-surface outline-none placeholder:text-on-surface-variant/35 placeholder:font-light placeholder:transition-opacity"
            style="min-height: 28px"
            placeholder={PLACEHOLDERS[placeholderIdx()]}
          />
          <Show when={query().length > 0}>
            <button
              type="button"
              aria-label="Clear input"
              onClick={() => { setQuery(""); if (textareaRef) { textareaRef.style.height = "auto"; } setShowDropdown(false); }}
              class="mt-1 flex-shrink-0 rounded-full p-0.5 text-on-surface-variant/40 transition hover:text-on-surface-variant"
            >
              ×
            </button>
          </Show>
          <Show when={!focused() && !query()}>
            <kbd class="mt-1 flex-shrink-0 self-start rounded border border-white/40 bg-white/40 px-1.5 py-0.5 font-mono text-[10px] text-on-surface-variant/50 select-none">
              Ctrl+K
            </kbd>
          </Show>
          <Show when={!focused() && !query() && recentQueries().length > 0}>
            <button
              type="button"
              title={`${recentQueries().length} recent queries — click to repeat last`}
              onMouseDown={(e) => {
                e.preventDefault();
                setQuery(recentQueries()[0]);
                requestAnimationFrame(() => autoResize());
                textareaRef?.focus();
              }}
              class="mt-1 flex-shrink-0 self-start rounded-full border border-white/40 bg-white/30 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant/50 transition hover:bg-white/50 hover:text-on-surface-variant"
            >
              ↺ {recentQueries().length}
            </button>
          </Show>
        </div>
        {/* Word count — shows faintly when query is long enough to risk context limits */}
        <Show when={query().length > 200}>
          <span class="self-end pb-1 font-mono text-[9px] text-on-surface-variant/30 flex-shrink-0">
            ~{query().trim().split(/\s+/).filter(Boolean).length}w
          </span>
        </Show>
        {/* Optimization mode */}
        <div class="relative">
          <select
            value={optMode()}
            onChange={(event) => {
              const v = event.currentTarget.value;
              setOptMode(v);
              localStorage.setItem(OPT_MODE_KEY, v);
            }}
            onFocus={() => {
              setSelectFocused(true);
              if (!localStorage.getItem(SELECT_HINT_KEY)) {
                setShowSelectHint(true);
                setTimeout(() => {
                  setShowSelectHint(false);
                  localStorage.setItem(SELECT_HINT_KEY, "1");
                }, 5000);
              }
            }}
            onBlur={() => setSelectFocused(false)}
            class="rounded-full border border-white/45 bg-white/60 px-3 py-2 text-xs text-on-surface outline-none"
            title="Optimization mode: Balanced = cost vs speed tradeoff · Power = maximum compute, best quality · Cheap = lowest token cost"
          >
            <option value="balanced">Balanced</option>
            <option value="speed">Power</option>
            <option value="cost">Cheap</option>
          </select>
          <Show when={showSelectHint()}>
            <div class="absolute right-0 top-full z-50 mt-2 min-w-[220px] animate-fade-in rounded-2xl border border-white/45 bg-white/95 p-3 shadow-panel backdrop-blur-xl">
              <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline mb-1.5">Routing mode</p>
              <p class="text-xs text-on-surface-variant leading-5">
                <span class="font-medium text-on-surface">Balanced</span> — weighs cost &amp; speed.<br/>
                <span class="font-medium text-on-surface">Power</span> — maximum compute, best quality.<br/>
                <span class="font-medium text-on-surface">Cheap</span> — minimise token spend.<br/>
                Engine selects the web search provider.
              </p>
            </div>
          </Show>
          <Show when={selectFocused() && !showSelectHint()}>
            <div class="absolute right-0 top-full z-40 mt-1 animate-fade-in rounded-xl border border-white/40 bg-white/90 px-3 py-2 shadow-panel backdrop-blur-xl min-w-[14em]">
              <p class="font-mono text-[9px] text-on-surface-variant leading-4">
                <Show when={optMode() === "balanced"}>Balanced · weighs cost &amp; speed</Show>
                <Show when={optMode() === "speed"}>Power · maximum compute, best quality</Show>
                <Show when={optMode() === "cost"}>Cheap · minimise token spend</Show>
              </p>
            </div>
          </Show>
        </div>
        {/* Search engine */}
        <select
          value={engine()}
          onChange={(event) => {
            const v = event.currentTarget.value;
            setEngine(v);
            localStorage.setItem(ENGINE_KEY, v);
          }}
          class="rounded-full border border-white/45 bg-white/60 px-4 py-2 text-sm text-on-surface outline-none"
          title="Web search provider used when the agent needs external information"
        >
          <option value="duckduckgo">DuckDuckGo</option>
          <option value="google">Google</option>
        </select>
        <div class="flex flex-col items-end gap-0.5">
          <button
            type="submit"
            disabled={props.busy}
            class={`glass-button rounded-full px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 transition-colors ${
              query().length >= 16384 ? "animate-pulse bg-red-500" :
              query().length >= 15360 ? "animate-pulse bg-amber-500" :
              submitFailed() ? "bg-red-500" : "bg-primary"
            }`}
          >
            {submitFailed() ? "✗ Failed" : submitted() ? "✓ Sent" : props.busy ? "Routing..." : "Run"}
          </button>
          <Show when={props.busy}>
            <span class="font-mono text-[9px] text-on-surface-variant/40 animate-fade-in pr-1">
              {optMode() === "speed" ? "power" : optMode() === "cost" ? "cheap" : "balanced"}
            </span>
          </Show>
        </div>
      </div>

      <Show when={query().length > 50}>
        <p class="mt-1 px-6 font-mono text-[0.65em] tabular-nums text-on-surface-variant/40">
          {query().length} chars · ~{Math.round(query().length / 4)} tokens
        </p>
      </Show>
      <Show when={submitErrorMsg()}>
        <p class="mt-1 px-6 font-mono text-[0.65em] text-red-500/80 animate-fade-in">
          {submitErrorMsg()}
        </p>
      </Show>

      {/* Quick-access chips: last 3 queries, always visible when search is empty */}
      <Show when={!query() && recentQueries().length > 0 && !submitted()}>
        <div class="mt-2 flex flex-wrap items-center gap-1.5 px-2 animate-fade-in">
          <span class="font-mono text-[9px] text-on-surface-variant/35 select-none">recent</span>
          <For each={recentQueries().slice(0, 3)}>
            {(recent) => (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setQuery(recent); requestAnimationFrame(() => { autoResize(); textareaRef?.focus(); }); }}
                class="max-w-[22ch] truncate rounded-full border border-white/30 bg-white/20 px-3 py-0.5 font-mono text-[10px] text-on-surface-variant/60 transition hover:bg-white/40 hover:text-on-surface-variant"
                title={recent}
              >
                {recent}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* Suggestions dropdown */}
      <Show when={dropdownVisible()}>
        <div class="absolute left-0 right-0 top-full z-50 mt-2 animate-fade-in rounded-[20px] border border-white/45 bg-white/95 shadow-panel backdrop-blur-xl">
          <Show when={!debouncedQuery().trim() && timeOfDaySuggestions().length > 0}>
            <div class="px-4 pt-3 pb-2">
              <p class="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Suggested</p>
              <For each={timeOfDaySuggestions()}>
                {(suggestion) => (
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(suggestion); }}
                    class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-primary/8"
                  >
                    <span class="text-on-surface-variant/30">✦</span>
                    {suggestion}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={smartSuggestions().length > 0}>
            <div class="px-4 pt-3 pb-2">
              <p class="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Suggestions</p>
              <For each={smartSuggestions()}>
                {(suggestion) => (
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(suggestion); }}
                    class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-primary/8"
                  >
                    <span class="text-primary opacity-60">→</span>
                    {suggestion}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={!debouncedQuery().trim() && sessionHistory().length > 0}>
            <div class={`px-4 pb-2 ${smartSuggestions().length > 0 || recentQueries().length > 0 ? "border-t border-white/40 pt-2" : "pt-3"}`}>
              <p class="mb-1.5 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">This session</p>
              <For each={sessionHistory().slice(0, 5)}>
                {(item) => (
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(item); }}
                    class="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-on-surface-variant transition hover:bg-on-surface/5"
                  >
                    <span class="opacity-30 text-[0.8em]">↑</span>
                    {item}
                  </button>
                )}
              </For>
            </div>
          </Show>
          <Show when={recentQueries().length > 0}>
            <div class={`px-4 pb-3 ${smartSuggestions().length > 0 ? "border-t border-white/40 pt-2" : "pt-3"}`}>
              <div class="mb-1.5 flex items-center justify-between">
                <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Recent</p>
                <Show when={recentClearPending()} fallback={
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); armClear(); }}
                    class="text-[10px] text-on-surface-variant/40 transition hover:text-on-surface-variant"
                  >
                    Clear
                  </button>
                }>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); confirmClear(); }}
                    class="animate-fade-in text-[10px] font-medium text-red-500 transition hover:text-red-700"
                  >
                    Clear all?
                  </button>
                </Show>
              </div>
              <For each={recentQueries()}>
                {(recent, index) => (
                  <div class="flex items-center gap-1">
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); pickSuggestion(recent); }}
                      class={`flex flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-on-surface-variant transition ${arrowNavIdx() === index() ? "bg-primary/8" : "hover:bg-on-surface/5"}`}
                    >
                      <span class="opacity-40">↺</span>
                      {recent}
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); cycleRerunMode(); }}
                      title={`Re-run mode: ${MODE_TITLES[rerunMode()]} — click to cycle`}
                      class="flex-shrink-0 rounded-md border border-white/30 bg-white/20 px-[0.45em] py-[0.2em] font-mono text-[0.65em] text-on-surface-variant/40 transition hover:bg-white/35 hover:text-on-surface-variant"
                    >
                      {MODE_LABELS[rerunMode()]}
                    </button>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); void submitQuery(recent, rerunMode()); }}
                      title={`Run with ${MODE_TITLES[rerunMode()]} mode`}
                      class="flex-shrink-0 rounded-lg px-[0.5em] py-[0.3em] font-mono text-[0.7em] text-primary/50 transition hover:bg-primary/8 hover:text-primary"
                    >
                      → run
                    </button>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </form>
  );
}
