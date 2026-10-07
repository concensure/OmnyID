// @locs-version: 1.0
// @module-id: ui.agent-persona-fab
// @primary-capability: floating-agent-persona-switcher
// @stability: beta
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { EmptyState } from "@/components/EmptyState";
import { listPersonas, type AgentPersona } from "@/lib/api";
import {
  PERSONA_TEMPLATES,
  type PersonaTemplate,
} from "@/lib/personaTemplates";
import {
  buildPersonaSwitcherFailureReceipt,
  type PersonaSwitcherFailureReceipt,
} from "@/lib/personaSwitcherFailureState";
import {
  activatePersonaAndList,
  filterPersonas,
  filterPersonaTemplates,
  installedPersonaIdsByTemplate,
  installPersonaTemplateAndList,
  personaSwitcherPreferredTab,
  type PersonaSwitcherTab as SwitcherTab,
} from "@/lib/personaSwitcherState";
import { personaReloadBlocked, personaSwitcherBusy } from "@/lib/personaSwitcherViewState";

type AnimState = "idle" | "busy" | "error" | "success";
// Visual mood derived from queue pressure and LoRA genome state.
type AvatarMood = "overwhelmed" | "focused" | "sharp" | "learning" | "idle";

function extractEmoji(soul_md: string | undefined): string {
  if (!soul_md) return "🤖";
  const match = soul_md.match(/\p{Emoji_Presentation}/u);
  return match ? match[0] : "🤖";
}

function writingStyleLabel(style: string | undefined): string {
  switch (style) {
    case "balanced":   return "Balanced";
    case "concise":    return "Concise";
    case "warm":       return "Warm";
    case "formal":     return "Formal";
    case "creative":   return "Creative";
    case "analytical": return "Analytical";
    default:           return style ?? "Balanced";
  }
}

// LoRA genome capability badges unlocked at score milestones.
type GenomeBadge = { icon: string; label: string; key: string };

function computeGenomeBadges(score: number, active: boolean): GenomeBadge[] {
  const earned: GenomeBadge[] = [];
  if (score >= 0.3) earned.push({ icon: "✍️", label: "Style",    key: "style" });
  if (score >= 0.6) earned.push({ icon: "🔬", label: "Research", key: "research" });
  if (score >= 0.8) earned.push({ icon: "💰", label: "Finance",  key: "finance" });
  if (active)       earned.push({ icon: "⚡", label: "Auto",     key: "auto" });
  return earned;
}

export function AgentPersonaFAB(props: {
  signedIn?: boolean;
  activeCount: number;
  hasError?: boolean;
  justCompleted?: boolean;
  onOpenSettings: () => void;
  // State-driven avatar props
  loraScore?: number;
  loraActive?: boolean;
  urgentPending?: number;
}) {
  const [showSwitcher, setShowSwitcher] = createSignal(false);
  const [personas, setPersonas] = createSignal<AgentPersona[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [switchingId, setSwitchingId] = createSignal<string | null>(null);
  const [installingTemplateId, setInstallingTemplateId] = createSignal<string | null>(null);
  const [tab, setTab] = createSignal<SwitcherTab>("mine");
  const [search, setSearch] = createSignal("");
  const [loadError, setLoadError] = createSignal<PersonaSwitcherFailureReceipt | null>(null);
  const [actionError, setActionError] = createSignal<PersonaSwitcherFailureReceipt | null>(null);
  let longPressTimer: ReturnType<typeof setTimeout> | undefined;
  let didLongPress = false;
  const switcherBusy = createMemo(() => personaSwitcherBusy({
    loading: loading(),
    switchingId: switchingId(),
    installingTemplateId: installingTemplateId(),
  }));

  function currentAvatarAnimationState(): AnimState {
    if (props.hasError) return "error";
    if (props.justCompleted) return "success";
    if (props.activeCount > 0) return "busy";
    return "idle";
  }

  // ── Avatar mood ──────────────────────────────────────────────────────────────
  const avatarMood = createMemo<AvatarMood>(() => {
    const urgent = props.urgentPending ?? 0;
    const score  = props.loraScore ?? 0;
    if (urgent >= 10) return "overwhelmed";
    if (urgent >= 5 || props.activeCount > 3) return "focused";
    if (props.activeCount === 0 && urgent === 0 && score > 0.5) return "sharp";
    if (score < 0.3 && props.activeCount === 0) return "learning";
    return "idle";
  });

  const genomeBadges = createMemo(() =>
    computeGenomeBadges(props.loraScore ?? 0, props.loraActive ?? false)
  );

  const moodEmoji = (): string | null => {
    switch (avatarMood()) {
      case "overwhelmed": return "😰";
      case "focused":     return "🎯";
      case "sharp":       return "⚡";
      case "learning":    return "🌱";
      default:            return null;
    }
  };

  const moodLabel = (): string => {
    const urgent = props.urgentPending ?? 0;
    switch (avatarMood()) {
      case "overwhelmed": return `Overwhelmed — ${urgent} urgent items need attention`;
      case "focused":     return `${props.activeCount} tasks in progress`;
      case "sharp":       return "Sharp and ready — queue is clear";
      case "learning":    return "Learning your style…";
      default:            return "Ready";
    }
  };

  const fabTitle = (): string => {
    const urgent = props.urgentPending ?? 0;
    switch (avatarMood()) {
      case "overwhelmed": return `Overwhelmed — ${urgent} urgent decisions need attention`;
      case "focused":     return "Focused — active tasks in queue";
      case "sharp":       return "Sharp and ready — switch response persona";
      case "learning":    return "Learning your style — switch response persona";
      default:            return "Switch response persona";
    }
  };

  // Ring colour on the FAB button reflects queue pressure.
  const moodRingClass = (): string => {
    switch (avatarMood()) {
      case "overwhelmed": return "ring-2 ring-red-400/75";
      case "focused":     return "ring-2 ring-amber-400/60";
      case "sharp":       return "ring-2 ring-emerald-400/75";
      case "learning":    return "ring-2 ring-blue-400/55";
      default:            return "";
    }
  };

  // ── Existing persona management ───────────────────────────────────────────────
  const active = () => personas().find((p) => p.is_active) ?? null;
  const installedPersonaIdsByTemplateState = createMemo(() =>
    installedPersonaIdsByTemplate(PERSONA_TEMPLATES, personas()),
  );
  const filteredPersonas = createMemo(() => filterPersonas(personas(), search()));
  const filteredTemplates = createMemo(() => filterPersonaTemplates(PERSONA_TEMPLATES, search()));

  async function reloadPersonas() {
    if (personaReloadBlocked({ loading: loading(), signedIn: props.signedIn })) return;
    if (!props.signedIn) {
      setPersonas([]);
      setLoadError(null);
      setLoading(false);
      return;
    }
    setLoadError(null);
    try {
      const res = await listPersonas();
      setPersonas(res.personas);
      setTab((currentTab) =>
        currentTab === "templates" || res.personas.length === 0
          ? personaSwitcherPreferredTab(res.personas)
          : currentTab,
      );
    } catch (error: unknown) {
      setPersonas([]);
      setLoadError(
        buildPersonaSwitcherFailureReceipt(
          "Load personas",
          error instanceof Error ? error.message : "Could not load personas.",
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  onMount(reloadPersonas);

  onCleanup(() => {
    if (longPressTimer) clearTimeout(longPressTimer);
  });

  function openSwitcher(preferredTab?: SwitcherTab) {
    if (switchingId() || installingTemplateId()) return;
    if (preferredTab) setTab(preferredTab);
    else setTab(personaSwitcherPreferredTab(personas()));
    setShowSwitcher(true);
    if (!loading() && personas().length === 0) void reloadPersonas();
  }

  function closeSwitcher() {
    if (switchingId() || installingTemplateId()) return;
    setShowSwitcher(false);
    setSearch("");
  }

  function startLongPress() {
    didLongPress = false;
    longPressTimer = setTimeout(() => {
      didLongPress = true;
      openSwitcher("templates");
    }, 600);
  }

  function cancelLongPress() {
    if (longPressTimer) clearTimeout(longPressTimer);
  }

  function handleClick() {
    if (didLongPress) {
      didLongPress = false;
      return;
    }
    if (showSwitcher()) closeSwitcher();
    else openSwitcher();
  }

  async function switchPersona(persona: AgentPersona) {
    if (switcherBusy()) return;
    if (persona.is_active) {
      closeSwitcher();
      return;
    }
    setSwitchingId(persona.id);
    setActionError(null);
    try {
      const result = await activatePersonaAndList(persona.id);
      setPersonas(result.personas);
      closeSwitcher();
    } catch (error: unknown) {
      setActionError(
        buildPersonaSwitcherFailureReceipt(
          "Switch persona",
          error instanceof Error ? error.message : "Could not switch persona.",
        ),
      );
    } finally {
      setSwitchingId(null);
    }
  }

  async function installTemplate(template: PersonaTemplate) {
    if (switcherBusy()) return;
    setInstallingTemplateId(template.id);
    setActionError(null);
    try {
      const result = await installPersonaTemplateAndList(template);
      setPersonas(result.personas);
      closeSwitcher();
    } catch (error: unknown) {
      setActionError(
        buildPersonaSwitcherFailureReceipt(
          "Install template",
          error instanceof Error ? error.message : "Could not install persona template.",
        ),
      );
    } finally {
      setInstallingTemplateId(null);
    }
  }

  const dotColor = () => {
    switch (currentAvatarAnimationState()) {
      case "busy":    return "bg-blue-400 animate-pulse";
      case "error":   return "bg-red-400";
      case "success": return "bg-green-400";
      default:        return "bg-emerald-300";
    }
  };

  const fabAnim = () => {
    switch (currentAvatarAnimationState()) {
      case "busy":    return "animate-persona-busy";
      case "error":   return "animate-persona-error";
      case "success": return "animate-persona-success";
      default:        return "animate-persona-idle";
    }
  };

  const tabClass = (value: SwitcherTab) =>
    `rounded-xl px-2.5 py-1.5 text-[0.6875em] font-medium transition ${
      tab() === value
        ? "bg-primary/12 text-primary"
        : "text-on-surface-variant hover:bg-on-surface/6"
    }`;

  return (
    <>
      <Show when={showSwitcher()}>
        <div class="fixed inset-0 z-40" onClick={closeSwitcher} />
      </Show>

      <Show when={showSwitcher()}>
        {/* Panel: fluid width so it doesn't overflow on narrow screens */}
        <div class="fixed bottom-[4.75rem] right-6 z-50 max-h-[32rem] w-[min(25rem,_calc(100vw_-_1.5rem))] overflow-hidden rounded-3xl border border-white/45 bg-white/96 shadow-panel backdrop-blur-xl animate-fade-in">
          <div class="border-b border-outline/10 px-3.5 py-3">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-mono text-[0.5625em] uppercase tracking-[0.2em] text-outline">
                  Swap agent persona
                </p>
                <p class="mt-1 truncate text-sm font-medium text-on-surface">
                  {active()?.name ?? "No active persona"}
                </p>
              </div>
              <button
                type="button"
                disabled={switcherBusy()}
                onClick={() => {
                  closeSwitcher();
                  props.onOpenSettings();
                }}
                class="rounded-xl px-2 py-1 text-[0.6875em] text-on-surface-variant transition hover:bg-on-surface/6 hover:text-on-surface"
              >
                Settings
              </button>
              <button
                type="button"
                onClick={() => { closeSwitcher(); window.dispatchEvent(new CustomEvent("omnyid:open-view-customizer")); }}
                class="rounded-xl px-2 py-1 text-[0.6875em] text-on-surface-variant transition hover:bg-on-surface/6 hover:text-on-surface"
              >
                Customize view
              </button>
            </div>

            {/* ── Genome state strip ─────────────────────────────────────── */}
            {/* Shows avatar mood + earned LoRA capability badges. Clicking opens
                Agent Settings, where LoRA weights are trained and reviewed. */}
            <Show when={avatarMood() !== "idle" || genomeBadges().length > 0}>
              <button
                type="button"
                onClick={() => { closeSwitcher(); props.onOpenSettings(); }}
                title="Open Agent Settings to review LoRA training progress"
                class={`mt-2 flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition hover:brightness-95 ${
                  avatarMood() === "overwhelmed"
                    ? "bg-red-400/10"
                    : avatarMood() === "sharp"
                      ? "bg-emerald-400/10"
                      : "bg-on-surface/4"
                }`}
              >
                <Show when={moodEmoji()}>
                  <span class="text-sm leading-none" aria-hidden="true">{moodEmoji()}</span>
                </Show>
                <span class="flex-1 truncate text-[0.625em] text-on-surface-variant">
                  {moodLabel()}
                </span>
                <div class="flex items-center gap-1">
                  <For each={genomeBadges()}>
                    {(badge) => (
                      <span
                        title={`${badge.label} capability learned`}
                        class="rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.5625em] text-primary"
                      >
                        {badge.icon}
                      </span>
                    )}
                  </For>
                </div>
              </button>
            </Show>

            <input
              type="text"
              value={search()}
              disabled={switcherBusy()}
              onInput={(event) => setSearch(event.currentTarget.value)}
              placeholder="Search personas"
              class="mt-3 w-full rounded-2xl border border-outline/15 bg-white/75 px-3 py-2 text-xs text-on-surface outline-none transition focus:border-primary/35"
            />
            <div class="mt-3 flex gap-1">
              <button type="button" class={tabClass("mine")} disabled={switcherBusy()} onClick={() => setTab("mine")}>
                My personas
              </button>
              <button
                type="button"
                class={tabClass("templates")}
                disabled={switcherBusy()}
                onClick={() => setTab("templates")}
              >
                Templates
              </button>
            </div>
          </div>

          <div class="max-h-[19rem] overflow-auto px-2 py-2">
            <Show when={actionError()}>
              {(receipt) => (
                <div
                  class={`mb-2 rounded-2xl border px-3 py-2 text-[0.6875em] leading-5 ${
                    receipt().tone === "danger"
                      ? "border-red-200/50 bg-red-50/70 text-red-700"
                      : "border-amber-300/40 bg-amber-50/70 text-amber-800"
                  }`}
                >
                  <p class="font-semibold">{receipt().title}</p>
                  <p>{receipt().summary}</p>
                  <p class="opacity-80">Next step: {receipt().nextStep}</p>
                </div>
              )}
            </Show>
            <Show when={tab() === "mine"}>
              <Show when={loading()}>
                <p class="px-3 py-8 text-center text-xs text-on-surface-variant/60">
                  Loading personas…
                </p>
              </Show>
              <Show when={!loading() && loadError()}>
                {(receipt) => (
                  <div class="px-1 py-2">
                    <EmptyState
                      icon="AI"
                      title={receipt().title}
                      body={`${receipt().summary} Next step: ${receipt().nextStep}`}
                      action={
                        <button
                          type="button"
                          class="rounded-full border border-white/25 bg-white/70 px-3 py-1 text-[0.6875em] font-medium text-on-surface transition hover:bg-white"
                          disabled={loading()}
                          onClick={() => void reloadPersonas()}
                        >
                          Retry personas
                        </button>
                      }
                    />
                  </div>
                )}
              </Show>
              <Show when={!loading() && !loadError() && filteredPersonas().length === 0}>
                <div class="px-3 py-8 text-center">
                  <p class="text-xs text-on-surface-variant/60">
                    No saved personas yet.
                  </p>
                  <button
                    type="button"
                    disabled={switcherBusy()}
                    onClick={() => setTab("templates")}
                    class="mt-3 rounded-xl bg-primary/10 px-3 py-1.5 text-[0.6875em] font-medium text-primary transition hover:bg-primary/15"
                  >
                    Browse templates
                  </button>
                </div>
              </Show>
              <For each={filteredPersonas()}>
                {(persona) => (
                  <button
                    type="button"
                    onClick={() => switchPersona(persona)}
                    disabled={switcherBusy()}
                    class={`mb-1 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-on-surface/6 ${
                      persona.is_active ? "bg-primary/8 text-primary" : "text-on-surface"
                    }`}
                  >
                    <span class="text-lg leading-none">{extractEmoji(persona.soul_md)}</span>
                    <div class="min-w-0 flex-1">
                      <p class="text-sm font-medium leading-snug">{persona.name}</p>
                      <p class="mt-0.5 text-[0.625em] text-on-surface-variant/65">
                        {writingStyleLabel(persona.writing_style)}
                      </p>
                    </div>
                    <Show when={switchingId() === persona.id}>
                      <span class="text-[0.625em] text-primary/70">…</span>
                    </Show>
                    <Show when={persona.is_active && switchingId() !== persona.id}>
                      <span class="text-[0.625em] font-semibold text-primary">Active</span>
                    </Show>
                  </button>
                )}
              </For>
            </Show>

            <Show when={tab() === "templates"}>
              <Show when={filteredTemplates().length === 0}>
                <p class="px-3 py-8 text-center text-xs text-on-surface-variant/60">
                  No matching templates.
                </p>
              </Show>
              <For each={filteredTemplates()}>
                {(template) => {
                  const installedPersona = () => {
                    const personaId = installedPersonaIdsByTemplateState().get(template.id);
                    return personaId ? personas().find((persona) => persona.id === personaId) ?? null : null;
                  };
                  const installed = () => Boolean(installedPersona());
                  return (
                    <button
                      type="button"
                      onClick={() => {
                        if (installed()) return;
                        void installTemplate(template);
                      }}
                      disabled={installed() || switcherBusy()}
                      class="mb-1 flex w-full items-start gap-3 rounded-2xl px-3 py-2.5 text-left transition hover:bg-on-surface/6 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span class="pt-0.5 text-lg leading-none">
                        {extractEmoji(template.soul_md)}
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2">
                          <p class="truncate text-sm font-medium text-on-surface">
                            {template.name}
                          </p>
                          <span class="rounded-full bg-on-surface/6 px-1.5 py-0.5 text-[0.5625em] text-on-surface-variant/70">
                            {writingStyleLabel(template.writing_style)}
                          </span>
                        </div>
                        <p class="mt-0.5 line-clamp-2 text-[0.6875em] text-on-surface-variant/70">
                          {template.description}
                        </p>
                      </div>
                      <span class="pt-0.5 text-[0.625em] font-medium text-primary">
                        {installed()
                          ? installedPersona()?.is_active
                            ? "Active"
                            : "Installed"
                          : installingTemplateId() === template.id
                            ? "Installing…"
                            : "Install"}
                      </span>
                    </button>
                  );
                }}
              </For>
            </Show>
          </div>

          <div class="border-t border-outline/10 px-3.5 py-2.5 text-[0.625em] text-on-surface-variant/55">
            {props.activeCount > 0
              ? `${props.activeCount} agent${props.activeCount === 1 ? "" : "s"} running`
              : "All agents idle"}
          </div>
        </div>
      </Show>

      {/* ── FAB button ────────────────────────────────────────────────────────── */}
      {/* Avatar emoji + mood ring + capability count chip + status dot.          */}
      <button
        type="button"
        class={`fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-2xl border border-white/20 bg-white/85 text-on-surface/70 shadow-md outline-none transition-all backdrop-blur-2xl hover:bg-white/95 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-primary/50 ${fabAnim()} ${moodRingClass()}`}
        onPointerDown={startLongPress}
        onPointerUp={cancelLongPress}
        onPointerLeave={cancelLongPress}
        onClick={handleClick}
        title={fabTitle()}
        aria-label={fabTitle()}
      >
        {/* Persona or mood emoji — replaces the static SVG when state is meaningful */}
        <Show
          when={active() || avatarMood() !== "idle"}
          fallback={
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
              class="h-[1.125rem] w-[1.125rem]"
            >
              <circle cx="10" cy="7" r="3.5" />
              <path d="M3,18 Q3,13 10,13 Q17,13 17,18" />
            </svg>
          }
        >
          <span class="text-xl leading-none select-none" aria-hidden="true">
            {/* Prefer persona emoji; fall back to mood emoji */}
            {active() ? extractEmoji(active()!.soul_md) : moodEmoji() ?? "🤖"}
          </span>
        </Show>

        {/* Capability chip — shown in top-left when genome badges are earned */}
        <Show when={genomeBadges().length > 0}>
          <span
            class="absolute -top-1 -left-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full border border-white/60 bg-primary px-1 text-[0.5rem] font-bold leading-none text-white"
            title={`${genomeBadges().length} LoRA ${genomeBadges().length === 1 ? "capability" : "capabilities"} learned`}
            aria-label={`${genomeBadges().length} LoRA capabilities`}
          >
            {genomeBadges()[genomeBadges().length - 1]?.icon}
          </span>
        </Show>

        {/* Status dot — bottom-right, unchanged from original */}
        <span
          class={`absolute bottom-1.5 right-1.5 h-2 w-2 rounded-full border border-white/80 ${dotColor()}`}
        />
      </button>
    </>
  );
}
