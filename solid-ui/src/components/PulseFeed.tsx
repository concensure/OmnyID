// @locs-version: 1.0
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import {
  createPulseChannel,
  deletePulseChannel,
  dismissPulseItem,
  listPulseChannels,
  listPulseGoals,
  listPulseItems,
  savePulseItem,
  updatePulseChannel,
} from "@/lib/api";
import { EmptyState } from "@/components/EmptyState";
import {
  buildPulseFeedFailureReceipt,
  type PulseFeedFailureReceipt,
} from "@/lib/pulseFeedFailureState";
import {
  pulseFeedDeleteChannelState,
  pulseFeedDismissedItems,
  pulseFeedSavedItems,
  pulseFeedSelectActiveChannelId,
  pulseFeedShouldLoadChannelItems,
  pulseFeedUpsertChannel,
  pulseFeedVisibleItems,
} from "@/lib/pulseFeedViewState";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { summarizeLineEntries } from "@/lib/structuredTextInputState";
import {
  type PulseGoalOption,
  type PulseNewsCategory,
  type PulseNewsChannel,
  type PulseNewsFrequency,
  type PulseNewsGranularity,
  type PulseNewsItem,
} from "@/lib/pulseFeedResponseState";

type NewsCategory = PulseNewsCategory;
type NewsGranularity = PulseNewsGranularity;
type NewsFrequency = PulseNewsFrequency;
type NewsChannel = PulseNewsChannel;
type NewsItem = PulseNewsItem;
type GoalOption = PulseGoalOption;

const ALL_CATEGORIES: NewsCategory[] = [
  "technology",
  "finance",
  "health",
  "science",
  "politics",
  "culture",
  "sports",
  "local",
  "environment",
  "business",
  "entertainment",
  "education",
  "travel",
  "food",
];

const CATEGORY_ICONS: Record<NewsCategory, string> = {
  technology: "TE",
  finance: "FI",
  health: "HE",
  science: "SC",
  politics: "PO",
  culture: "CU",
  sports: "SP",
  local: "LO",
  environment: "EN",
  business: "BU",
  entertainment: "ET",
  education: "ED",
  travel: "TR",
  food: "FO",
};

function SubscriptionModal(props: {
  initial?: Partial<NewsChannel>;
  availableGoals: GoalOption[];
  saving?: boolean;
  onSave: (data: Omit<NewsChannel, "channel_id" | "created_at">) => Promise<void> | void;
  onClose: () => void;
}) {
  const [label, setLabel] = createSignal(props.initial?.label ?? "");
  const [categories, setCategories] = createSignal<NewsCategory[]>(props.initial?.categories ?? []);
  const [locality, setLocality] = createSignal(props.initial?.locality ?? "");
  const [granularity, setGranularity] = createSignal<NewsGranularity>(props.initial?.granularity ?? "summaries");
  const [frequency, setFrequency] = createSignal<NewsFrequency>(props.initial?.frequency ?? "daily");
  const [goalId, setGoalId] = createSignal(props.initial?.goal_id ?? "");
  const [sources, setSources] = createSignal(props.initial?.sources?.join("\n") ?? "");
  const sourceSummary = createMemo(() => summarizeLineEntries(sources()));

  function toggleCategory(cat: NewsCategory) {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  }

  async function handleSave() {
    if (props.saving) return;
    if (!label().trim()) return;
    await props.onSave({
      label: label().trim(),
      categories: categories(),
      locality: locality().trim() || undefined,
      granularity: granularity(),
      frequency: frequency(),
      sources: sourceSummary().normalized,
      goal_id: goalId() || undefined,
      enabled: true,
    });
  }

  return (
    <>
      <div class="fixed inset-0 z-[80] bg-black/20 backdrop-blur-sm" onClick={() => !props.saving && props.onClose()} />
      <div
        class="fixed left-1/2 top-1/2 z-[90] max-h-[85vh] w-[480px] max-w-[95vw] -translate-x-1/2 -translate-y-1/2 animate-fade-in overflow-y-auto rounded-2xl border border-white/50 bg-white/96 p-5 shadow-panel backdrop-blur-xl"
        onKeyDown={(e) => {
          if (e.key === "Escape" && !props.saving) {
            e.preventDefault();
            recordShortcutUse("form_cancel");
            props.onClose();
          } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && label().trim() && !props.saving) {
            e.preventDefault();
            recordShortcutUse("form_submit");
            void handleSave();
          }
        }}
      >
        <div class="mb-4 flex items-center justify-between">
          <p class="text-sm font-semibold text-on-surface">{props.initial ? "Edit channel" : "Add news channel"}</p>
          <button type="button" disabled={props.saving} onClick={props.onClose} class="text-on-surface-variant/50 hover:text-on-surface disabled:opacity-40">
            x
          </button>
        </div>

        <div class="space-y-4">
          <div>
            <label class="mb-1 block text-xs font-medium text-on-surface-variant">Channel name</label>
            <input
              type="text"
              value={label()}
              onInput={(e) => setLabel(e.currentTarget.value)}
              disabled={props.saving}
              placeholder="e.g. Tech and AI News"
              class="w-full rounded-xl border border-outline/20 bg-white/60 px-3 py-2 text-sm text-on-surface outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
            />
          </div>

          <div>
            <label class="mb-1.5 block text-xs font-medium text-on-surface-variant">Categories</label>
            <div class="flex flex-wrap gap-1.5">
              <For each={ALL_CATEGORIES}>
                {(cat) => (
                  <button
                    type="button"
                    onClick={() => toggleCategory(cat)}
                    disabled={props.saving}
                    class={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition ${
                      categories().includes(cat)
                        ? "border-primary/40 bg-primary/15 font-medium text-primary"
                        : "border-outline/20 bg-white/50 text-on-surface-variant hover:border-primary/30"
                    }`}
                  >
                    <span class="leading-none">{CATEGORY_ICONS[cat]}</span>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </button>
                )}
              </For>
            </div>
          </div>

          <div>
            <label class="mb-1 block text-xs font-medium text-on-surface-variant">Locality (optional)</label>
            <input
              type="text"
              value={locality()}
              onInput={(e) => setLocality(e.currentTarget.value)}
              disabled={props.saving}
              placeholder="e.g. Sydney, Australia"
              class="w-full rounded-xl border border-outline/20 bg-white/60 px-3 py-2 text-sm text-on-surface outline-none focus:border-primary/40"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-xs font-medium text-on-surface-variant">Granularity</label>
              <div class="flex gap-1">
                <For each={["headlines", "summaries", "deep"] as NewsGranularity[]}>
                  {(granularityOption) => (
                    <button
                      type="button"
                      onClick={() => setGranularity(granularityOption)}
                      disabled={props.saving}
                      class={`flex-1 rounded-lg border px-1.5 py-1.5 text-[10px] transition ${
                        granularity() === granularityOption
                          ? "border-primary/40 bg-primary/15 font-medium text-primary"
                          : "border-outline/20 bg-white/50 text-on-surface-variant hover:border-primary/30"
                      }`}
                    >
                      {granularityOption.charAt(0).toUpperCase() + granularityOption.slice(1)}
                    </button>
                  )}
                </For>
              </div>
            </div>
            <div>
              <label class="mb-1 block text-xs font-medium text-on-surface-variant">Frequency</label>
              <div class="flex gap-1">
                <For each={["realtime", "daily", "weekly"] as NewsFrequency[]}>
                  {(frequencyOption) => (
                    <button
                      type="button"
                      onClick={() => setFrequency(frequencyOption)}
                      disabled={props.saving}
                      class={`flex-1 rounded-lg border px-1 py-1.5 text-[10px] transition ${
                        frequency() === frequencyOption
                          ? "border-primary/40 bg-primary/15 font-medium text-primary"
                          : "border-outline/20 bg-white/50 text-on-surface-variant hover:border-primary/30"
                      }`}
                    >
                      {frequencyOption === "realtime" ? "Live" : frequencyOption.charAt(0).toUpperCase() + frequencyOption.slice(1)}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </div>

          <Show when={props.availableGoals.length > 0}>
            <div>
              <label class="mb-1 block text-xs font-medium text-on-surface-variant">Link to goal (optional)</label>
              <select
                value={goalId()}
                onChange={(e) => setGoalId(e.currentTarget.value)}
                disabled={props.saving}
                class="w-full rounded-xl border border-outline/20 bg-white/60 px-3 py-2 text-sm text-on-surface outline-none focus:border-primary/40"
              >
                <option value="">None</option>
                <For each={props.availableGoals}>{(goal) => <option value={goal.goal_id}>{goal.title}</option>}</For>
              </select>
            </div>
          </Show>

          <div>
            <label class="mb-1 block text-xs font-medium text-on-surface-variant">
              Custom RSS/Atom sources (optional, one per line)
            </label>
            <textarea
              value={sources()}
              onInput={(e) => setSources(e.currentTarget.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && label().trim() && !props.saving) {
                  e.preventDefault();
                  recordShortcutUse("form_submit");
                  void handleSave();
                } else if (e.key === "Escape" && !props.saving) {
                  e.preventDefault();
                  recordShortcutUse("form_cancel");
                  props.onClose();
                }
              }}
              disabled={props.saving}
              placeholder={"https://feeds.arstechnica.com/arstechnica/index\nhttps://example.com/feed.xml"}
              rows={3}
              class="w-full resize-none rounded-xl border border-outline/20 bg-white/60 px-3 py-2 font-mono text-xs text-on-surface outline-none focus:border-primary/40"
            />
            <p class="mt-1 text-[10px] text-on-surface-variant/60">
              Tier 1 free sources. Curated feeds are used as fallback when no custom sources are set.
              {sourceSummary().total > 0
                ? ` ${sourceSummary().unique} source${sourceSummary().unique === 1 ? "" : "s"} will be saved`
                : ""}
              {sourceSummary().duplicateCount > 0
                ? ` - ${sourceSummary().duplicateCount} duplicate entr${sourceSummary().duplicateCount === 1 ? "y" : "ies"} will collapse on save`
                : ""}
            </p>
          </div>
        </div>

        <div class="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!label().trim() || props.saving}
            class="flex-1 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary/90 disabled:opacity-40"
          >
            {props.saving ? "Saving..." : "Save channel"}
          </button>
          <button
            type="button"
            onClick={props.onClose}
            disabled={props.saving}
            class="rounded-xl border border-outline/20 px-4 py-2 text-sm text-on-surface-variant transition hover:bg-on-surface/5 disabled:opacity-40"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}

function NewsItemCard(props: {
  item: NewsItem;
  granularity: NewsGranularity;
  onDismiss: (id: string) => Promise<void> | void;
  onSaveToKnowledge: (id: string) => void;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [saved, setSaved] = createSignal(props.item.saved_to_knowledge);
  const [itemError, setItemError] = createSignal<PulseFeedFailureReceipt | null>(null);

  const timeAgo = (iso?: string): string => {
    if (!iso) return "";
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  async function handleSaveToKnowledge() {
    setSaving(true);
    setItemError(null);
    try {
      await savePulseItem(props.item.id);
      setSaved(true);
      props.onSaveToKnowledge(props.item.id);
    } catch (error: unknown) {
      setItemError(
        buildPulseFeedFailureReceipt(
          "Save item to knowledge",
          error instanceof Error ? error.message : "Failed to save item to knowledge.",
        ),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class={`rounded-xl border bg-white/60 px-3 py-2.5 transition ${props.item.goal_relevance ? "border-primary/25 bg-primary/5" : "border-white/50"}`}>
      <div class="mb-1 flex items-center gap-1.5 text-[10px] text-on-surface-variant/60">
        <Show when={props.item.source_name}>
          <span class="font-medium">{props.item.source_name}</span>
          <span>|</span>
        </Show>
        <span>{timeAgo(props.item.published_at)}</span>
        <Show when={props.item.reading_time_min}>
          <span>| {props.item.reading_time_min} min read</span>
        </Show>
        <Show when={props.item.goal_relevance}>
          <span class="ml-auto rounded-full border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-medium text-primary">
            goal relevant
          </span>
        </Show>
      </div>

      <Show when={props.item.headline}>
        <p class="text-sm font-semibold leading-snug text-on-surface">
          {props.item.url ? (
            <a href={props.item.url} target="_blank" rel="noopener noreferrer" class="hover:text-primary hover:underline">
              {props.item.headline}
            </a>
          ) : (
            props.item.headline
          )}
        </p>
      </Show>

      <Show when={props.granularity !== "headlines" && props.item.summary}>
        <p class="mt-1 line-clamp-2 text-xs leading-relaxed text-on-surface-variant">{props.item.summary}</p>
      </Show>

      <Show when={props.granularity === "deep" && props.item.deep_content}>
        <div class="mt-1">
          <Show when={!expanded()}>
            <button type="button" onClick={() => setExpanded(true)} class="text-[10px] text-primary hover:underline">
              Read full summary
            </button>
          </Show>
          <Show when={expanded()}>
            <p class="mt-1 whitespace-pre-line text-xs leading-relaxed text-on-surface-variant">{props.item.deep_content}</p>
          </Show>
        </div>
      </Show>

      <Show when={itemError()}>
        <div class="mt-2 rounded-lg border border-amber-200/70 bg-amber-50/80 px-2.5 py-2 text-[10px] text-amber-900">
          <p class="font-medium">{itemError()?.title}</p>
          <p class="mt-0.5">{itemError()?.summary}</p>
          <p class="mt-0.5 opacity-80">{itemError()?.nextStep}</p>
        </div>
      </Show>

      <div class="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={saved() || saving()}
          onClick={() => void handleSaveToKnowledge()}
          title={saved() ? "Saved to knowledge graph" : "Save to knowledge graph"}
          class={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-medium transition ${
            saved()
              ? "border-emerald-200/60 bg-emerald-50/80 text-emerald-700"
              : "border-outline/20 bg-white/50 text-on-surface-variant hover:border-primary/30 hover:text-primary"
          }`}
        >
          {saving() ? "Saving..." : saved() ? "In knowledge" : "Save to knowledge"}
        </button>

        <button
          type="button"
          onClick={() => void props.onDismiss(props.item.id)}
          class="ml-auto rounded-lg px-2 py-1 text-[10px] text-on-surface-variant/50 transition hover:bg-red-50 hover:text-red-400"
          title="Dismiss"
        >
          x
        </button>
      </div>
    </div>
  );
}

export function PulseFeed() {
  const [channels, setChannels] = createSignal<NewsChannel[]>([]);
  const [activeChannel, setActiveChannel] = createSignal<string | null>(null);
  const [items, setItems] = createSignal<NewsItem[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [loadingItems, setLoadingItems] = createSignal(false);
  const [showModal, setShowModal] = createSignal(false);
  const [editingChannel, setEditingChannel] = createSignal<NewsChannel | null>(null);
  const [availableGoals, setAvailableGoals] = createSignal<GoalOption[]>([]);
  const [channelError, setChannelError] = createSignal<PulseFeedFailureReceipt | null>(null);
  const [feedError, setFeedError] = createSignal<PulseFeedFailureReceipt | null>(null);
  const [goalError, setGoalError] = createSignal<PulseFeedFailureReceipt | null>(null);
  const [channelSaving, setChannelSaving] = createSignal(false);

  const activeChannelData = createMemo(() => channels().find((channel) => channel.channel_id === activeChannel()) ?? null);
  const activeChannelUsesCuratedFallback = createMemo(() => (activeChannelData()?.sources?.length ?? 0) === 0);

  async function loadChannels() {
    setLoading(true);
    setChannelError(null);
    try {
      const loadedChannels = await listPulseChannels();
      const previousActiveChannelId = activeChannel();
      const nextActiveChannelId = pulseFeedSelectActiveChannelId(loadedChannels, previousActiveChannelId);
      setChannels(loadedChannels);
      setActiveChannel(nextActiveChannelId);
      if (pulseFeedShouldLoadChannelItems(previousActiveChannelId, nextActiveChannelId) && nextActiveChannelId) {
        void loadItems(nextActiveChannelId);
      } else if (!nextActiveChannelId) {
        setActiveChannel(null);
        setItems([]);
      }
    } catch (error: unknown) {
      setChannels([]);
      setActiveChannel(null);
      setItems([]);
      setChannelError(
        buildPulseFeedFailureReceipt(
          "Load channels",
          error instanceof Error ? error.message : "Failed to load channels.",
        ),
      );
    }
    setLoading(false);
  }

  async function loadGoals() {
    setGoalError(null);
    try {
      const goals = await listPulseGoals();
      setAvailableGoals(goals);
    } catch (error: unknown) {
      setAvailableGoals([]);
      setGoalError(
        buildPulseFeedFailureReceipt(
          "Load goals",
          error instanceof Error ? error.message : "Failed to load goals.",
        ),
      );
    }
  }

  onMount(async () => {
    await Promise.all([loadChannels(), loadGoals()]);
  });

  async function loadItems(channelId: string) {
    setLoadingItems(true);
    setFeedError(null);
    try {
      const loadedItems = await listPulseItems(channelId);
      setItems(pulseFeedVisibleItems(loadedItems));
    } catch (error: unknown) {
      setItems([]);
      setFeedError(
        buildPulseFeedFailureReceipt(
          "Load feed",
          error instanceof Error ? error.message : "Failed to load feed items.",
        ),
      );
    } finally {
      setLoadingItems(false);
    }
  }

  function selectChannel(id: string) {
    setActiveChannel(id);
    void loadItems(id);
  }

  async function saveChannel(data: Omit<NewsChannel, "channel_id" | "created_at">) {
    if (channelSaving()) return;
    setChannelError(null);
    setChannelSaving(true);
    try {
      if (editingChannel()) {
        const current = editingChannel()!;
        const updated = await updatePulseChannel(current.channel_id, data);
        setChannels((prev) => pulseFeedUpsertChannel(prev, updated));
      } else {
        const created = await createPulseChannel(data);
        setChannels((prev) => pulseFeedUpsertChannel(prev, created));
        setActiveChannel(created.channel_id);
        void loadItems(created.channel_id);
      }
      setShowModal(false);
      setEditingChannel(null);
    } catch (error: unknown) {
      setChannelError(
        buildPulseFeedFailureReceipt(
          "Save channel",
          error instanceof Error ? error.message : "Failed to save channel.",
        ),
      );
    } finally {
      setChannelSaving(false);
    }
  }

  async function deleteChannel(id: string) {
    setChannelError(null);
    try {
      await deletePulseChannel(id);
      const previousActiveChannelId = activeChannel();
      const nextState = pulseFeedDeleteChannelState(channels(), previousActiveChannelId, id);
      setChannels(nextState.channels);
      setActiveChannel(nextState.activeChannelId);
      if (pulseFeedShouldLoadChannelItems(previousActiveChannelId, nextState.activeChannelId) && nextState.activeChannelId) {
        void loadItems(nextState.activeChannelId);
      } else if (!nextState.activeChannelId) {
        setItems([]);
        setFeedError(null);
      }
    } catch (error: unknown) {
      setChannelError(
        buildPulseFeedFailureReceipt(
          "Delete channel",
          error instanceof Error ? error.message : "Failed to delete channel.",
        ),
      );
    }
  }

  async function dismissItem(itemId: string) {
    const previous = items();
    setFeedError(null);
    setItems((prev) => pulseFeedDismissedItems(prev, itemId));
    try {
      await dismissPulseItem(itemId);
    } catch (error: unknown) {
      setItems(previous);
      setFeedError(
        buildPulseFeedFailureReceipt(
          "Dismiss item",
          error instanceof Error ? error.message : "Failed to dismiss item.",
        ),
      );
    }
  }

  function markSaved(itemId: string) {
    setItems((prev) => pulseFeedSavedItems(prev, itemId));
  }

  return (
    <div class="flex h-full flex-col">
      <div class="flex items-center justify-between border-b border-outline/10 px-6 py-4">
        <div>
          <h1 class="text-xl font-bold text-on-surface">Pulse Feed</h1>
          <p class="mt-0.5 text-xs text-on-surface-variant/60">Subscribable news channels | save items to your knowledge graph</p>
          <p class="mt-1 max-w-2xl text-[11px] leading-relaxed text-on-surface-variant/65">
            Channels are personal to this workspace. If you do not add custom RSS or Atom sources, OmnyID uses built-in curated feeds as a fallback instead of a fully bespoke source set.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingChannel(null);
            setShowModal(true);
          }}
          class="flex items-center gap-1.5 rounded-2xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/20"
        >
          + Add channel
        </button>
      </div>

      <Show when={channelError()}>
        <div
          class={`mx-6 mt-2 rounded-xl px-4 py-2 text-xs ${
            channelError()?.tone === "danger"
              ? "border border-red-200/60 bg-red-50/80 text-red-700"
              : "border border-amber-200/60 bg-amber-50/80 text-amber-900"
          }`}
        >
          <p class="font-medium">{channelError()?.title}</p>
          <p class="mt-0.5">{channelError()?.summary}</p>
          <p class="mt-0.5 opacity-80">{channelError()?.nextStep}</p>
        </div>
      </Show>

      <Show when={goalError()}>
        <div
          class={`mx-6 mt-2 rounded-xl px-4 py-2 text-xs ${
            goalError()?.tone === "danger"
              ? "border border-red-200/60 bg-red-50/80 text-red-700"
              : "border border-amber-200/60 bg-amber-50/80 text-amber-900"
          }`}
        >
          <p class="font-medium">{goalError()?.title}</p>
          <p class="mt-0.5">{goalError()?.summary}</p>
          <p class="mt-0.5 opacity-80">{goalError()?.nextStep}</p>
        </div>
      </Show>

      <Show when={showModal()}>
        <SubscriptionModal
          initial={editingChannel() ?? undefined}
          availableGoals={availableGoals()}
          saving={channelSaving()}
          onSave={saveChannel}
          onClose={() => {
            if (channelSaving()) return;
            setShowModal(false);
            setEditingChannel(null);
          }}
        />
      </Show>

      <div class="flex min-h-0 flex-1">
        <aside class="w-52 flex-shrink-0 overflow-y-auto border-r border-outline/10 py-3">
          <Show when={loading()}>
            <div class="space-y-2 px-4">
              {[1, 2, 3].map(() => (
                <div class="h-8 animate-pulse rounded-xl bg-on-surface/6" />
              ))}
            </div>
          </Show>

          <Show when={!loading() && channels().length === 0}>
            <div class="px-4 py-6 text-center">
              <Show
                when={!channelError()}
                fallback={
                  <EmptyState
                    icon="PF"
                    title={channelError()?.title ?? "Could not load channels"}
                    body={
                      channelError()
                        ? `${channelError()!.summary} ${channelError()!.nextStep}`
                        : ""
                    }
                    action={
                      <button
                        type="button"
                        onClick={() => void loadChannels()}
                        class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80"
                      >
                        Retry channels
                      </button>
                    }
                  />
                }
              >
                <p class="text-xs text-on-surface-variant/60">No channels yet</p>
                <button type="button" onClick={() => setShowModal(true)} class="mt-2 text-xs text-primary hover:underline">
                  Add your first
                </button>
              </Show>
            </div>
          </Show>

          <For each={channels()}>
            {(channel) => (
              <div
                class={`group flex cursor-pointer items-center gap-2 px-3 py-2 transition ${
                  activeChannel() === channel.channel_id ? "bg-primary/10 text-primary" : "text-on-surface hover:bg-on-surface/5"
                }`}
                onClick={() => selectChannel(channel.channel_id)}
              >
                <div class="min-w-0 flex-1">
                  <p class="truncate text-xs font-medium">{channel.label}</p>
                  <p class="text-[9px] capitalize text-on-surface-variant/60">{channel.frequency}</p>
                </div>
                <div class="flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingChannel(channel);
                      setShowModal(true);
                    }}
                    class="rounded p-0.5 text-[10px] text-outline/60 hover:text-on-surface"
                    title="Edit"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteChannel(channel.channel_id);
                    }}
                    class="rounded p-0.5 text-[10px] text-red-400/60 hover:text-red-500"
                    title="Delete"
                  >
                    x
                  </button>
                </div>
              </div>
            )}
          </For>
        </aside>

        <main class="flex-1 overflow-y-auto px-6 py-4">
          <Show when={!activeChannel() && !loading()}>
            <div class="flex h-full items-center justify-center">
              <div class="text-center">
                <p class="mb-3 text-4xl">PF</p>
                <p class="text-sm font-semibold text-on-surface">No channel selected</p>
                <p class="mt-1 text-xs text-on-surface-variant/60">Add a channel to start receiving news</p>
              </div>
            </div>
          </Show>

          <Show when={activeChannel() && loadingItems()}>
            <div class="flex flex-col gap-2">
              {[1, 2, 3, 4].map(() => (
                <div class="h-20 animate-pulse rounded-xl border border-white/50 bg-white/50" />
              ))}
            </div>
          </Show>

          <Show when={activeChannel() && !loadingItems()}>
            <Show when={feedError()}>
              <EmptyState
                icon="PF"
                title={feedError()?.title ?? "Could not load feed"}
                body={
                  feedError()
                    ? `${feedError()!.summary} ${feedError()!.nextStep}`
                    : ""
                }
                action={
                  <button
                    type="button"
                    onClick={() => activeChannel() && void loadItems(activeChannel()!)}
                    class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80"
                  >
                    Retry feed
                  </button>
                }
              />
            </Show>

            <Show when={!feedError() && items().length === 0}>
              <div class="flex h-48 items-center justify-center">
                <div class="text-center">
                  <p class="mb-2 text-2xl">PF</p>
                  <p class="text-sm text-on-surface-variant">No items yet</p>
                  <p class="mt-1 text-xs text-on-surface-variant/60">
                    {activeChannelData()?.frequency === "realtime" ? "Items will arrive shortly" : "Items will be fetched on the next scheduled run"}
                  </p>
                </div>
              </div>
            </Show>

            <Show when={!feedError() && items().length > 0}>
              <div class="flex flex-col gap-2">
                <Show when={activeChannelData()}>
                  {(channel) => (
                    <>
                      <div class="mb-2 flex items-center gap-2">
                        <p class="text-xs font-medium text-on-surface">{channel().label}</p>
                        <span class="text-[9px] capitalize text-on-surface-variant/60">| {channel().granularity} | {channel().frequency}</span>
                        <span class="ml-auto text-[9px] text-on-surface-variant/50">{items().length} items</span>
                      </div>
                      <Show when={activeChannelUsesCuratedFallback()}>
                        <div class="mb-2 rounded-xl border border-amber-200/70 bg-amber-50/80 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                          This channel is currently using <span class="font-semibold">OmnyID curated fallback feeds</span> because no custom sources are configured yet.
                        </div>
                      </Show>
                    </>
                  )}
                </Show>
                <For each={items()}>
                  {(item) => (
                    <NewsItemCard
                      item={item}
                      granularity={activeChannelData()?.granularity ?? "summaries"}
                      onDismiss={dismissItem}
                      onSaveToKnowledge={markSaved}
                    />
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </main>
      </div>
    </div>
  );
}
