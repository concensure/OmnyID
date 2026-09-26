// @locs-version: 1.0
// Daily Intelligence Brief â€” full-width ambient morning panel for the home workspace.
// Distinct from Decision Queue (action-required) and Response Queue (reply-required).
// This is ambient, readable, and calming â€” one offer max, qualitative goal pulse only.
import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import {
  type BriefApiResponse,
  type BriefSection,
  type BriefSectionType,
  type GoalPulseItem,
  type Momentum,
} from "@/lib/intelligenceBriefState";
import {
  buildIntelligenceBriefFailureReceipt,
  type IntelligenceBriefFailureReceipt,
} from "@/lib/intelligenceBriefFailureState";
import type { ViewName } from "@/lib/viewNames";
import {
  loadBriefRead,
  loadBriefSettings,
  loadTileEnabled,
  saveBriefRead,
  saveBriefSettings,
  saveTileEnabled,
  type BriefSettings,
} from "@/lib/intelligenceBriefLocalState";
import {
  intelligenceBriefCollapsedGoalPulse,
  intelligenceBriefVisibleSections,
  loadIntelligenceBriefData,
  runIntelligenceBriefOfferAction,
} from "@/lib/intelligenceBriefViewState";
import type { GoalDomain } from "@/lib/profileLedger";

// â”€â”€â”€ Settings storage â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€â”€ Momentum labels for goal pulse (no scores/streaks) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const GOAL_DOMAIN_ICONS: Record<GoalDomain, string> = {
  career: "ðŸ’¼", finance: "ðŸ’°", health: "ðŸƒ", relationships: "â¤ï¸",
  personal_growth: "ðŸŒ±", creativity: "ðŸŽ¨", community: "ðŸ¤", lifestyle: "âœ¨", other: "â—†",
};

const MOMENTUM_LABELS: Record<Momentum, string> = {
  building: "building", steady: "steady", quiet: "quiet", paused: "paused", recent: "recent",
};

// â”€â”€â”€ Section icons â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SECTION_ICONS: Record<BriefSectionType, string> = {
  context:    "ðŸ“…",
  goal_pulse: "ðŸŽ¯",
  ambient:    "ðŸŒ",
  peripheral: "âœ¨",
  agent_offer:"ðŸ¤–",
};

// â”€â”€â”€ API types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// â”€â”€â”€ Settings dropdown â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function BriefSettingsMenu(props: {
  settings: BriefSettings;
  onChange: (s: BriefSettings) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div class="fixed inset-0 z-[80]" onClick={props.onClose} />
      <div class="absolute right-0 top-7 z-[90] min-w-[220px] animate-fade-in rounded-2xl border border-white/50 bg-white/96 p-3 shadow-panel backdrop-blur-xl">
        <p class="mb-2 font-mono text-[8px] uppercase tracking-widest text-outline/50">Brief Settings</p>
        {([
          ["enabled",         "Show daily brief"],
          ["show_goal_pulse", "Show goal pulse"],
          ["show_agent_offer","Show agent offers"],
          ["show_ambient",    "Show ambient news"],
        ] as [keyof BriefSettings, string][]).map(([key, label]) => (
          <label class="flex cursor-pointer items-center justify-between gap-3 rounded-xl px-2 py-2 transition hover:bg-on-surface/5">
            <span class="text-xs text-on-surface">{label}</span>
            <input
              type="checkbox"
              checked={props.settings[key] as boolean}
              onChange={(e) => {
                const next = { ...props.settings, [key]: e.currentTarget.checked };
                props.onChange(next);
              }}
              class="h-4 w-4 accent-primary rounded"
            />
          </label>
        ))}
      </div>
    </>
  );
}

// â”€â”€â”€ Goal pulse pills â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function GoalPulsePill(props: { item: GoalPulseItem }) {
  return (
    <div class="flex items-center gap-1.5 rounded-full border border-white/60 bg-white/70 px-3 py-1.5 text-xs shadow-sm">
      <span class="text-sm leading-none" aria-hidden>{GOAL_DOMAIN_ICONS[props.item.domain]}</span>
      <span class="font-medium text-on-surface capitalize">{props.item.domain.replace("_", " ")}</span>
      <span class="text-on-surface-variant/60">~</span>
      <span class="text-on-surface-variant/80 italic">{MOMENTUM_LABELS[props.item.momentum]}</span>
    </div>
  );
}

// â”€â”€â”€ Main component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function IntelligenceBrief(props: { onOpenView?: (view: ViewName) => void; signedIn?: boolean }) {
  const [settings, setSettings] = createSignal(loadBriefSettings());
  const [brief, setBrief] = createSignal<BriefApiResponse | null>(null);
  const [goalPulse, setGoalPulse] = createSignal<GoalPulseItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [briefLoadError, setBriefLoadError] = createSignal<IntelligenceBriefFailureReceipt | null>(null);
  const [goalPulseLoadError, setGoalPulseLoadError] = createSignal<IntelligenceBriefFailureReceipt | null>(null);
  const [collapsed, setCollapsed] = createSignal(false);
  const [showSettings, setShowSettings] = createSignal(false);
  const [expandedSections, setExpandedSections] = createSignal<Set<number>>(new Set());
  const [confirmOffer, setConfirmOffer] = createSignal<BriefSection | null>(null);
  const [offerSubmitting, setOfferSubmitting] = createSignal(false);
  const [offerActionError, setOfferActionError] = createSignal<IntelligenceBriefFailureReceipt | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  function updateSettings(s: BriefSettings) {
    setSettings(s);
    saveBriefSettings(s);
    setShowSettings(false);
  }

  async function loadBriefContent() {
    setLoading(true);
    setBriefLoadError(null);
    setGoalPulseLoadError(null);
    setCollapsed(loadBriefRead(today));
    const result = await loadIntelligenceBriefData({
      settingsEnabled: settings().enabled,
      signedIn: props.signedIn ?? false,
      goalLimit: 6,
    });
    setBrief(result.brief);
    setGoalPulse(result.goalPulse);
    if (result.briefErrorMessage) {
      setBriefLoadError(
        buildIntelligenceBriefFailureReceipt("Load brief", result.briefErrorMessage),
      );
    }
    if (result.goalPulseErrorMessage) {
      setGoalPulseLoadError(
        buildIntelligenceBriefFailureReceipt("Load goal pulse", result.goalPulseErrorMessage),
      );
    }
    setLoading(false);
  }

  onMount(async () => {
    await loadBriefContent();
  });

  function markRead() {
    saveBriefRead(today, true);
    setCollapsed(true);
  }

  function toggleSection(idx: number) {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function visibleSections(): BriefSection[] {
    return intelligenceBriefVisibleSections(brief(), settings());
  }

  async function acceptOffer(section: BriefSection) {
    if (!section.action) return;
    setOfferSubmitting(true);
    setOfferActionError(null);
    try {
      const result = await runIntelligenceBriefOfferAction(
        brief()?.brief_id,
        section.action.intent,
      );
      props.onOpenView?.(result.openView);
      setConfirmOffer(null);
    } catch (error) {
      setOfferActionError(
        buildIntelligenceBriefFailureReceipt(
          "Queue offer",
          error instanceof Error ? error.message : "Could not queue this agent task.",
        ),
      );
    }
    setOfferSubmitting(false);
  }

  return (
    <Show when={settings().enabled}>
    <div class="relative mb-2 w-full overflow-visible rounded-[22px] border border-amber-200/50 bg-gradient-to-br from-amber-50/70 via-orange-50/50 to-rose-50/30 shadow-card">

      {/* Confirm offer modal */}
      <Show when={confirmOffer()}>
        {(section) => (
          <>
            <div
              class="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm"
              onClick={() => {
                setOfferActionError(null);
                setConfirmOffer(null);
              }}
            />
            <div class="fixed left-1/2 top-1/2 z-[110] w-80 -translate-x-1/2 -translate-y-1/2 animate-fade-in rounded-2xl border border-white/50 bg-white/96 p-5 shadow-panel backdrop-blur-xl">
              <p class="text-sm font-semibold text-on-surface mb-2">Confirm agent task</p>
              <p class="text-xs text-on-surface-variant mb-4">
                I'll <span class="font-medium text-on-surface">{section().action?.label}</span>.
                This may take a few minutes and will run in your workflow queue.
              </p>
              <Show when={offerActionError()}>
                {(receipt) => (
                  <div
                    class={`mb-3 rounded-xl px-3 py-2 text-xs shadow-sm ${
                      receipt().tone === "danger"
                        ? "border border-[#e1b5a7] bg-[#fff1ec] text-[#8c4331]"
                        : "border border-amber-300/50 bg-amber-50/90 text-amber-900"
                    }`}
                  >
                    <div class="flex items-start justify-between gap-3">
                      <div class="space-y-1">
                        <p class="font-semibold">{receipt().title}</p>
                        <p>{receipt().summary}</p>
                        <p class="text-[11px] opacity-80">Next step: {receipt().nextStep}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOfferActionError(null)}
                        class="rounded px-1.5 py-0.5 font-medium transition hover:bg-white/70"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </Show>
              <div class="flex gap-2">
                <button
                  type="button"
                  disabled={offerSubmitting()}
                  onClick={() => void acceptOffer(section())}
                  class="flex-1 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
                >
                  {offerSubmitting() ? "Queueing..." : "Continue"}
                </button>
                <button
                  type="button"
                  disabled={offerSubmitting()}
                  onClick={() => {
                    setOfferActionError(null);
                    setConfirmOffer(null);
                  }}
                  class="flex-1 rounded-xl border border-outline/20 px-3 py-2 text-xs text-on-surface-variant transition hover:bg-on-surface/5 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
            </div>
          </>
        )}
      </Show>

      {/* Header row */}
      <div class="flex items-center gap-2 px-4 pt-3 pb-2 select-none">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          class="flex flex-1 items-center gap-2 min-w-0 text-left outline-none"
        >
          <span class="text-lg leading-none" aria-hidden>â˜€ï¸</span>
          <div class="min-w-0">
            <p class="text-xs font-semibold text-on-surface">
              {brief()?.greeting ?? `Good ${getTimeOfDay()}, here's your day`}
            </p>
            <p class="text-[10px] text-on-surface-variant/60">
              {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
        </button>

        <div class="flex items-center gap-1 flex-shrink-0">
          <Show when={!collapsed()}>
            <button
              type="button"
              onClick={markRead}
              class="rounded-full px-2 py-0.5 text-[10px] text-on-surface-variant/60 transition hover:bg-on-surface/8 hover:text-on-surface"
              title="Dismiss for today"
            >
              Done
            </button>
          </Show>
          {/* Settings gear */}
          <div class="relative">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              class="flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant/50 transition hover:bg-on-surface/8 hover:text-on-surface"
              title="Brief settings"
              aria-label="Brief settings"
            >
              âš™
            </button>
            <Show when={showSettings()}>
              <BriefSettingsMenu
                settings={settings()}
                onChange={updateSettings}
                onClose={() => setShowSettings(false)}
              />
            </Show>
          </div>
          {/* Collapse toggle */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            class="flex h-6 w-6 items-center justify-center rounded-full text-on-surface-variant/50 transition hover:bg-on-surface/8 hover:text-on-surface text-xs"
            title={collapsed() ? "Expand" : "Collapse"}
          >
            {collapsed() ? "â–¾" : "â–´"}
          </button>
        </div>
      </div>

      {/* Collapsed summary: goal pulse pills only */}
      <Show when={collapsed() && goalPulse().length > 0}>
        <div class="flex flex-wrap gap-1.5 px-4 pb-3">
          <For each={intelligenceBriefCollapsedGoalPulse(goalPulse())}>
            {(item) => <GoalPulsePill item={item} />}
          </For>
        </div>
      </Show>

      {/* Expanded content */}
      <Show when={!collapsed()}>
        <div class="px-4 pb-4">
          {/* Loading shimmer */}
          <Show when={loading()}>
            <div class="flex flex-col gap-2">
              {[80, 60, 100].map((w) => (
                <div class={`h-3 rounded-full bg-on-surface/8 animate-pulse`} style={{ width: `${w}%` }} />
              ))}
            </div>
          </Show>

          <Show when={!loading() && (briefLoadError() || goalPulseLoadError())}>
            <div class="mb-3 rounded-xl border border-amber-200/70 bg-amber-50/85 px-4 py-3 text-xs text-amber-900">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="space-y-1">
                  <Show when={briefLoadError()}>
                    <div class="space-y-0.5">
                      <p class="font-semibold">{briefLoadError()?.title}</p>
                      <p>{briefLoadError()?.summary}</p>
                      <p class="text-[11px] text-amber-900/80">Next step: {briefLoadError()?.nextStep}</p>
                    </div>
                  </Show>
                  <Show when={goalPulseLoadError()}>
                    <div class="space-y-0.5">
                      <p class="font-semibold">{goalPulseLoadError()?.title}</p>
                      <p>{goalPulseLoadError()?.summary}</p>
                      <p class="text-[11px] text-amber-900/80">Next step: {goalPulseLoadError()?.nextStep}</p>
                    </div>
                  </Show>
                </div>
                <button
                  type="button"
                  onClick={() => void loadBriefContent()}
                  class="rounded-full border border-amber-200/70 bg-white/80 px-3 py-1 text-[10px] font-medium text-amber-900 transition hover:bg-white"
                >
                  Retry brief
                </button>
              </div>
            </div>
          </Show>

          {/* Empty state */}
          <Show when={!loading() && !brief() && !briefLoadError()}>
            <div class="rounded-xl border border-white/40 bg-white/40 px-4 py-3 text-center">
              <p class="text-xs text-on-surface-variant">
                Your morning brief will be ready shortly.
              </p>
              <p class="mt-0.5 text-[10px] text-on-surface-variant/60">
                Generated nightly from your calendar, goals, and knowledge graph.
              </p>
            </div>
          </Show>

          {/* Goal pulse row */}
          <Show when={!loading() && goalPulse().length > 0 && settings().show_goal_pulse}>
            <div class="mb-3">
              <p class="mb-1.5 font-mono text-[8px] uppercase tracking-widest text-on-surface-variant/50">Goal pulse</p>
              <div class="flex flex-wrap gap-1.5">
                <For each={goalPulse()}>
                  {(item) => <GoalPulsePill item={item} />}
                </For>
                <Show when={goalPulse().length === 0}>
                  <button
                    type="button"
                    onClick={() => props.onOpenView?.("goals")}
                    class="rounded-full border border-dashed border-on-surface/20 px-3 py-1.5 text-xs text-on-surface-variant/60 transition hover:border-primary/40 hover:text-primary"
                  >
                    + Set a goal
                  </button>
                </Show>
              </div>
            </div>
          </Show>

          {/* Brief sections */}
          <Show when={!loading() && brief()}>
            <div class="flex flex-col gap-2">
              <For each={visibleSections()}>
                {(section, idx) => {
                  const isOffer = () => section.type === "agent_offer";
                  const isExpanded = () => expandedSections().has(idx());
                  return (
                    <div class={`rounded-xl border px-3 py-2.5 ${
                      isOffer()
                        ? "border-primary/30 bg-primary/8"
                        : "border-white/50 bg-white/50"
                    }`}>
                      <button
                        type="button"
                        onClick={() => !isOffer() && toggleSection(idx())}
                        class="flex w-full items-center gap-2 text-left outline-none"
                      >
                        <span class="text-sm leading-none flex-shrink-0" aria-hidden>
                          {SECTION_ICONS[section.type as BriefSectionType] ?? "â—"}
                        </span>
                        <div class="flex-1 min-w-0">
                          <p class={`text-xs font-semibold ${isOffer() ? "text-primary" : "text-on-surface"}`}>
                            {section.title}
                          </p>
                          <p class={`mt-0.5 text-[11px] leading-relaxed ${isExpanded() || section.body.length < 100 ? "" : "line-clamp-2"} ${isOffer() ? "text-primary/80" : "text-on-surface-variant"}`}>
                            {section.body}
                          </p>
                        </div>
                        <Show when={!isOffer() && section.body.length >= 100}>
                          <span class="text-[10px] text-on-surface-variant/50 flex-shrink-0">{isExpanded() ? "â–´" : "â–¾"}</span>
                        </Show>
                      </button>
                      <Show when={isOffer() && section.action}>
                        <button
                          type="button"
                          onClick={() => setConfirmOffer(section)}
                          class="mt-2 w-full rounded-xl bg-primary/15 px-3 py-2 text-xs font-semibold text-primary transition hover:bg-primary/25"
                        >
                          {section.action!.label}
                        </button>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
    </Show>
  );
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

// â”€â”€â”€ Tile settings menu (shared pattern for all home tiles) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Used by BentoGrid tiles to expose a gear icon with at least one setting.
export interface TileSettings {
  enabled: boolean;
  // Per-tile extensions: tiles add their own fields here via localStorage
}

interface TileSettingsMenuProps {
  tileId: string;
  children?: unknown; // additional menu items specific to this tile
  onClose: () => void;
}

export function getTileEnabled(tileId: string): boolean {
  return loadTileEnabled(tileId);
}

export function TileSettingsButton(props: {
  tileId: string;
  extraItems?: Array<{ label: string; checked: boolean; onChange: (v: boolean) => void }>;
  onEnabledChange?: (enabled: boolean) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [enabled, setEnabled] = createSignal(getTileEnabled(props.tileId));

  createEffect(() => {
    props.tileId;
    setEnabled(getTileEnabled(props.tileId));
  });

  function toggle(val: boolean) {
    setEnabled(val);
    saveTileEnabled(props.tileId, val);
    props.onEnabledChange?.(val);
    setOpen(false);
  }

  return (
    <div class="relative">
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        class="flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-outline/40 hover:bg-on-surface/8 hover:text-on-surface"
        aria-label="Tile settings"
        title="Settings"
      >
        âš™
      </button>
      <Show when={open()}>
        <>
          <div class="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
          <div class="absolute right-0 top-6 z-[70] min-w-[180px] animate-fade-in rounded-2xl border border-white/50 bg-white/96 p-2 shadow-panel backdrop-blur-xl">
            <p class="mb-1.5 px-2 font-mono text-[8px] uppercase tracking-widest text-outline/50">Tile Settings</p>
            <label class="flex cursor-pointer items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-on-surface/5">
              <span class="text-xs text-on-surface">Show tile</span>
              <input
                type="checkbox"
                checked={enabled()}
                onChange={(e) => toggle(e.currentTarget.checked)}
                class="h-3.5 w-3.5 accent-primary rounded"
              />
            </label>
            <For each={props.extraItems ?? []}>
              {(item) => (
                <label class="flex cursor-pointer items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-on-surface/5">
                  <span class="text-xs text-on-surface">{item.label}</span>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={(e) => item.onChange(e.currentTarget.checked)}
                    class="h-3.5 w-3.5 accent-primary rounded"
                  />
                </label>
              )}
            </For>
          </div>
        </>
      </Show>
    </div>
  );
}
