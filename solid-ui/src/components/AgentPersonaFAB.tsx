// @locs-version: 1.0
// @module-id: ui.agent-persona-fab
// @primary-capability: floating-agent-persona-switcher
// @stability: beta
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { activatePersona, listPersonas, type AgentPersona } from "@/lib/api";

type AnimState = "idle" | "busy" | "error" | "success";

function extractEmoji(soul_md: string | undefined): string {
  if (!soul_md) return "🤖";
  const match = soul_md.match(/\p{Emoji_Presentation}/u);
  return match ? match[0] : "🤖";
}

export function AgentPersonaFAB(props: {
  activeCount: number;
  hasError?: boolean;
  justCompleted?: boolean;
  onOpenSettings: () => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [showSwitcher, setShowSwitcher] = createSignal(false);
  const [personas, setPersonas] = createSignal<AgentPersona[]>([]);
  let longPressTimer: ReturnType<typeof setTimeout>;
  let didLongPress = false;

  const animState = createMemo<AnimState>(() => {
    if (props.hasError) return "error";
    if (props.justCompleted) return "success";
    if (props.activeCount > 0) return "busy";
    return "idle";
  });

  const active = () => personas().find((p) => p.is_active) ?? null;
  const personaEmoji = () => extractEmoji(active()?.soul_md);

  onMount(async () => {
    try {
      const res = await listPersonas();
      setPersonas(res.personas);
    } catch { /* unauthenticated — ignore */ }
  });

  onCleanup(() => clearTimeout(longPressTimer));

  function startLongPress() {
    didLongPress = false;
    longPressTimer = setTimeout(() => {
      didLongPress = true;
      setOpen(false);
      setShowSwitcher(true);
    }, 600);
  }

  function cancelLongPress() {
    clearTimeout(longPressTimer);
  }

  function handleClick() {
    if (didLongPress) { didLongPress = false; return; }
    setOpen((v) => !v);
    setShowSwitcher(false);
  }

  async function switchPersona(persona: AgentPersona) {
    try {
      await activatePersona(persona.id);
      setPersonas((prev) => prev.map((p) => (p.id === persona.id ? { ...p, is_active: true } : { ...p, is_active: false })));
    } catch { /* ignore */ }
    setShowSwitcher(false);
  }

  const dotColor = () => {
    switch (animState()) {
      case "busy":    return "bg-blue-400 animate-pulse";
      case "error":   return "bg-red-400";
      case "success": return "bg-green-400";
      default:        return "bg-emerald-300";
    }
  };

  const fabAnim = () => {
    switch (animState()) {
      case "busy":    return "animate-persona-busy";
      case "error":   return "animate-persona-error";
      case "success": return "animate-persona-success";
      default:        return "animate-persona-idle";
    }
  };

  return (
    <>
      {/* Backdrop */}
      <Show when={open() || showSwitcher()}>
        <div
          class="fixed inset-0 z-40"
          onClick={() => { setOpen(false); setShowSwitcher(false); }}
        />
      </Show>

      {/* Options panel */}
      <Show when={open()}>
        <div class="fixed bottom-[90px] right-6 z-50 min-w-[200px] animate-fade-in rounded-2xl border border-white/45 bg-white/96 p-3 shadow-panel backdrop-blur-xl">
          <p class="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">
            {active()?.name ?? "Agent"}
          </p>
          <button
            type="button"
            onClick={() => { setOpen(false); setShowSwitcher(true); }}
            class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-xs transition hover:bg-on-surface/6 text-on-surface"
          >
            <span class="text-outline/70">👥</span> Switch persona
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); props.onOpenSettings(); }}
            class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-xs transition hover:bg-on-surface/6 text-on-surface"
          >
            <span class="text-outline/70">⚙</span> Agent settings
          </button>
          <div class="mx-2 my-1 h-px bg-outline/10" />
          <p class="px-2 py-1 text-[10px] text-on-surface-variant/50">
            {props.activeCount > 0
              ? `${props.activeCount} agent${props.activeCount === 1 ? "" : "s"} running`
              : "All agents idle"}
          </p>
        </div>
      </Show>

      {/* Persona switcher */}
      <Show when={showSwitcher()}>
        <div class="fixed bottom-[90px] right-6 z-50 min-w-[220px] max-h-72 overflow-auto animate-fade-in rounded-2xl border border-white/45 bg-white/96 p-3 shadow-panel backdrop-blur-xl">
          <p class="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Switch persona</p>
          <For each={personas()}>
            {(persona) => (
              <button
                type="button"
                onClick={() => switchPersona(persona)}
                class={`flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-xs transition hover:bg-on-surface/6 ${
                  persona.is_active ? "text-primary font-medium" : "text-on-surface"
                }`}
              >
                <span class="text-base leading-none">{extractEmoji(persona.soul_md)}</span>
                <div class="flex-1 min-w-0">
                  <p class="font-medium truncate">{persona.name}</p>
                  <p class="text-[9px] text-on-surface-variant/60 capitalize">{persona.writing_style ?? "balanced"}</p>
                </div>
                <Show when={persona.is_active}>
                  <span class="text-primary text-[10px]">✓</span>
                </Show>
              </button>
            )}
          </For>
          <Show when={personas().length === 0}>
            <p class="px-2 py-1 text-xs text-on-surface-variant/50">
              No personas yet — create one in Agent Settings
            </p>
          </Show>
        </div>
      </Show>

      {/* FAB button */}
      <button
        type="button"
        class={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full border border-white/50 bg-white/90 shadow-lg backdrop-blur-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/50 transition ${fabAnim()}`}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onClick={handleClick}
        title="Agent persona (hold to switch)"
      >
        <span class="text-2xl leading-none select-none">{personaEmoji()}</span>
        <span class={`absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-white ${dotColor()}`} />
      </button>
    </>
  );
}
