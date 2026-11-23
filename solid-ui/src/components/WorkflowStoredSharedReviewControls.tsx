// @locs-version: 1.0
import { For, Show, createMemo, type Accessor, type JSXElement } from "solid-js";

type ShareMode = "all" | "workspace" | "core";
type SortMode = "priority" | "recent";

type CompositionEntry = {
  active: boolean;
  key: string;
  label: string;
};

type ActiveFilterEntry = {
  key: string;
  label: string;
};

type ToneLegendEntry = {
  key: string;
  label: string;
  target?: string | null;
};

type SelectorEntry = {
  id: string;
  label: string;
  pinned?: boolean;
  share_mode?: string;
};

type PreviewContextEntry = {
  key: string;
  label: string;
};

type StoredReviewBadge = {
  label: string;
};

type GroupedSelectorEntries = {
  pinned: SelectorEntry[];
  recent: SelectorEntry[];
};

type SelectorChipItem = {
  active: boolean;
  ariaLabel: string;
  id: string;
  label: string;
  pinned: boolean;
  shareModeClass: string;
  shareModeLabel: string;
  title: string;
};

type ReviewChipItem = {
  className: string;
  key: string;
  label: string;
  title: string;
};

type ShareModeActionItem = {
  active: boolean;
  count: number;
  label: string;
  mode: ShareMode;
  title: string;
};

type SortModeActionItem = {
  active: boolean;
  label: string;
  mode: SortMode;
  title: string;
};

type ToneLegendItem = {
  className: string;
  key: string;
  label: string;
  target: string | null;
  title: string | null;
};

type WorkflowStoredSharedReviewControlsState = {
  activeFilterItems: ReviewChipItem[];
  collapsedSelectorItems: SelectorChipItem[];
  compositionItems: ReviewChipItem[];
  emptyStateActionItems: ReviewChipItem[];
  filteredSelectorCount: number;
  groupPinnedItems: SelectorChipItem[];
  groupRecentItems: SelectorChipItem[];
  hasMultipleActiveFilters: boolean;
  hasMultiplePreviewContextEntries: boolean;
  matchesCurrentView: boolean;
  moreSelectorCount: number;
  previewContextItems: ReviewChipItem[];
  recordCount: number;
  savedAtLabel: string | null;
  scopeMismatch: StoredReviewBadge | null;
  selectedEntryPinned: boolean;
  selectorEntryCount: number;
  shareModeActionItems: ShareModeActionItem[];
  showAll: boolean;
  showCollapsedSelectors: boolean;
  showEmptyState: boolean;
  showExpandedGroups: boolean;
  showFilterToolbar: boolean;
  showMetadata: boolean;
  showMultiRecordControls: boolean;
  showPreviewContext: boolean;
  showSummary: boolean;
  showToneLegend: boolean;
  sortModeActionItems: SortModeActionItem[];
  staleness: StoredReviewBadge | null;
  summaryItems: string[];
  title: string | null;
  toneLegendItems: ToneLegendItem[];
};

type WorkflowStoredSharedReviewControlsSectionId =
  | "resume"
  | "narrowing"
  | "metadata"
  | "actions";

export type WorkflowStoredSharedReviewControlsProps = {
  activeFilterActionLabel: (key: any) => string;
  activeFilterClass: (key: any) => string;
  activeFilters: Accessor<ActiveFilterEntry[]>;
  collapseActionLabel: () => string;
  compositionActionLabel: (key: any) => string;
  compositionChipClass: (key: any, active: boolean) => string;
  compositionSummary: Accessor<CompositionEntry[]>;
  emptyStateActions: Accessor<ActiveFilterEntry[]>;
  emptyStateLabel: () => string;
  expandActionLabel: (hiddenCount: number) => string;
  filterValue: Accessor<string>;
  filteredSelectorEntries: Accessor<SelectorEntry[]>;
  groupedSelectorEntries: Accessor<GroupedSelectorEntries>;
  hasMultipleActiveFilters: Accessor<boolean>;
  hasMultiplePreviewContextEntries: Accessor<boolean>;
  legendActionLabel: (target: any) => string | null;
  legendClass: (key: any) => string;
  matchesCurrentView: Accessor<boolean>;
  onApplyCompositionFocus: (key: any) => void;
  onClearActiveFilter: (key: any) => void;
  onClearPreviewContext: (key: any) => void;
  onForgetStoredReview: () => void;
  onRefreshStoredReview: () => void;
  onRenameStoredReview: () => void;
  onResetPreviewContext: () => void;
  onResetSelectorNarrowing: () => void;
  onResume: () => void;
  onSelectEntry: (id: string) => void;
  onSetFilter: (value: string) => void;
  onSetShareModeFilter: (value: ShareMode) => void;
  onSetShowAll: (value: boolean) => void;
  onSetSortMode: (mode: SortMode) => void;
  onTogglePinStoredReview: () => void;
  previewContextActionLabel: (key: any) => string;
  previewContextClass: (key: any) => string;
  previewContextSummary: Accessor<PreviewContextEntry[]>;
  recordCount: Accessor<number>;
  resumeLabel: string;
  savedAtLabel: Accessor<string | null>;
  scopeMismatch: Accessor<StoredReviewBadge | null>;
  selectedEntryId: Accessor<string | null>;
  selectedEntryPinned: Accessor<boolean>;
  selectorEntries: Accessor<SelectorEntry[]>;
  selectorEntryActionLabel: (entry: any, active: boolean) => string;
  shareModeActionLabel: (mode: ShareMode) => string;
  shareModeCounts: Accessor<{ all: number; core: number; workspace: number }>;
  shareModeFilter: Accessor<ShareMode>;
  showAll: Accessor<boolean>;
  sortActionLabel: (mode: SortMode) => string;
  sortMode: Accessor<SortMode>;
  staleness: Accessor<StoredReviewBadge | null>;
  summary: Accessor<string[]>;
  title: Accessor<string | null>;
  toneLegendEntries: Accessor<ToneLegendEntry[]>;
  visibleSelectorEntries: Accessor<SelectorEntry[]>;
};

const SHARED_REVIEW_SHELL_CLASS = "flex flex-wrap items-center gap-2";
const SHARED_REVIEW_RESUME_BUTTON_CLASS =
  "rounded-full border border-violet-200/70 bg-violet-50/80 px-3 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-100";
const SHARED_REVIEW_SMALL_OUTLINE_BUTTON_CLASS =
  "rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white";
const SHARED_REVIEW_RESET_BUTTON_CLASS =
  "rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white";
const SHARED_REVIEW_FILTER_INPUT_CLASS =
  "rounded-full border border-violet-200/70 bg-white/85 px-3 py-1 text-[11px] text-violet-800 outline-none transition focus:border-violet-300";
const SHARED_REVIEW_SECTION_STACK_CLASS = "space-y-2";
const SHARED_REVIEW_ROW_CLASS = "flex flex-wrap gap-1";
const SHARED_REVIEW_LEGEND_ROW_CLASS = "flex flex-wrap items-center gap-2 text-[10px] font-medium";
const SHARED_REVIEW_SUMMARY_STACK_CLASS = "space-y-1";
const SHARED_REVIEW_SUMMARY_LABEL_CLASS = "text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700/80";
const SHARED_REVIEW_CONTEXT_LABEL_CLASS = "text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600/80";
const SHARED_REVIEW_CONTEXT_HELP_CLASS = "text-[10px] text-slate-500/80";
const SHARED_REVIEW_META_BADGE_CLASS =
  "rounded-full border border-violet-200/70 bg-violet-100/80 px-2 py-1 text-[10px] font-medium text-violet-800";
const SHARED_REVIEW_SAVED_AT_CLASS = "text-[11px] text-violet-700/80";
const SHARED_REVIEW_SUMMARY_CHIP_CLASS =
  "rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700";
const SHARED_REVIEW_STALENESS_CLASS =
  "rounded-full border border-amber-200/70 bg-amber-50/85 px-2 py-1 text-[10px] font-medium text-amber-700";
const SHARED_REVIEW_SCOPE_MISMATCH_CLASS =
  "rounded-full border border-rose-200/70 bg-rose-50/85 px-2 py-1 text-[10px] font-medium text-rose-700";
const SHARED_REVIEW_REFRESH_FRESH_CLASS =
  "rounded-full border border-emerald-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-emerald-700 transition";
const SHARED_REVIEW_REFRESH_STALE_CLASS =
  "rounded-full border border-emerald-200/70 bg-emerald-50/85 px-2 py-1 text-[10px] font-medium text-emerald-700 transition hover:bg-emerald-100";
const SHARED_REVIEW_ACTION_BUTTON_CLASS =
  "rounded-full border border-violet-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white";
const SHARED_REVIEW_FORGET_BUTTON_CLASS =
  "rounded-full border border-white/50 bg-white/75 px-2 py-1 text-[10px] font-medium text-violet-700 transition hover:bg-white";

function shareModeBadgeClass(shareMode?: string): string {
  return shareMode === "workspace"
    ? "border-sky-200/70 bg-sky-50/85 text-sky-700"
    : "border-slate-200/70 bg-slate-100/85 text-slate-700";
}

function selectorChipClass(active: boolean): string {
  return active
    ? "rounded-full border border-violet-300 bg-violet-100 text-violet-800"
    : "rounded-full border border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white";
}

function filterModeButtonClass(active: boolean): string {
  return active
    ? "rounded-full border border-violet-300 bg-violet-100 text-violet-800"
    : "rounded-full border border-violet-200/70 bg-white/80 text-violet-700 hover:bg-white";
}

function toSelectorChipItem(
  entry: SelectorEntry,
  active: boolean,
  title: string,
): SelectorChipItem {
  return {
    active,
    ariaLabel: title,
    id: entry.id,
    label: entry.label,
    pinned: Boolean(entry.pinned),
    shareModeClass: shareModeBadgeClass(entry.share_mode),
    shareModeLabel: entry.share_mode ?? "all",
    title,
  };
}

function workflowStoredSharedReviewControlsState(
  props: WorkflowStoredSharedReviewControlsProps,
): WorkflowStoredSharedReviewControlsState {
  const selectedEntryId = props.selectedEntryId();
  const selectorEntries = props.selectorEntries();
  const showAll = props.showAll();
  const summaryItems = props.summary();
  const previewContextSummary = props.previewContextSummary();
  const activeFilters = props.activeFilters();
  const groupedSelectorEntries = props.groupedSelectorEntries();
  const shareModeCounts = props.shareModeCounts();
  const shareModeFilter = props.shareModeFilter();
  const sortMode = props.sortMode();

  return {
    activeFilterItems: activeFilters.map((entry) => ({
      className: `rounded-full border px-2 py-1 text-[10px] font-medium transition ${props.activeFilterClass(entry.key)}`,
      key: entry.key,
      label: `${entry.label} x`,
      title: props.activeFilterActionLabel(entry.key),
    })),
    collapsedSelectorItems: props.visibleSelectorEntries().map((entry) =>
      toSelectorChipItem(
        entry,
        selectedEntryId === entry.id,
        props.selectorEntryActionLabel(entry, selectedEntryId === entry.id),
      )),
    compositionItems: props.compositionSummary().map((entry) => ({
      className: `rounded-full border px-2 py-1 text-[10px] font-medium transition ${props.compositionChipClass(entry.key, entry.active)}`,
      key: entry.key,
      label: entry.label,
      title: props.compositionActionLabel(entry.key),
    })),
    emptyStateActionItems: props.emptyStateActions().map((entry) => ({
      className: `rounded-full border px-2 py-1 text-[10px] font-medium transition ${props.activeFilterClass(entry.key)}`,
      key: entry.key,
      label: entry.label,
      title: props.activeFilterActionLabel(entry.key),
    })),
    filteredSelectorCount: props.filteredSelectorEntries().length,
    groupPinnedItems: groupedSelectorEntries.pinned.map((entry) =>
      toSelectorChipItem(
        entry,
        selectedEntryId === entry.id,
        props.selectorEntryActionLabel(entry, selectedEntryId === entry.id),
      )),
    groupRecentItems: groupedSelectorEntries.recent.map((entry) =>
      toSelectorChipItem(
        entry,
        selectedEntryId === entry.id,
        props.selectorEntryActionLabel(entry, selectedEntryId === entry.id),
      )),
    hasMultipleActiveFilters: props.hasMultipleActiveFilters(),
    hasMultiplePreviewContextEntries: props.hasMultiplePreviewContextEntries(),
    matchesCurrentView: props.matchesCurrentView(),
    moreSelectorCount: Math.max(selectorEntries.length - 4, 0),
    previewContextItems: previewContextSummary.map((entry) => ({
      className: `rounded-full border px-2 py-1 text-[10px] font-medium transition ${props.previewContextClass(entry.key)}`,
      key: entry.key,
      label: `${entry.label} x`,
      title: props.previewContextActionLabel(entry.key),
    })),
    recordCount: props.recordCount(),
    savedAtLabel: props.savedAtLabel(),
    scopeMismatch: props.scopeMismatch(),
    selectedEntryPinned: props.selectedEntryPinned(),
    selectorEntryCount: selectorEntries.length,
    shareModeActionItems: [
      {
        active: shareModeFilter === "all",
        count: shareModeCounts.all,
        label: `All modes (${shareModeCounts.all})`,
        mode: "all",
        title: props.shareModeActionLabel("all"),
      },
      {
        active: shareModeFilter === "workspace",
        count: shareModeCounts.workspace,
        label: `Workspace (${shareModeCounts.workspace})`,
        mode: "workspace",
        title: props.shareModeActionLabel("workspace"),
      },
      {
        active: shareModeFilter === "core",
        count: shareModeCounts.core,
        label: `Core (${shareModeCounts.core})`,
        mode: "core",
        title: props.shareModeActionLabel("core"),
      },
    ],
    showAll,
    showCollapsedSelectors: !showAll,
    showEmptyState: showAll && props.filteredSelectorEntries().length === 0,
    showExpandedGroups: showAll,
    showFilterToolbar: showAll && selectorEntries.length > 4,
    showMetadata: Boolean(props.title() || props.savedAtLabel() || summaryItems.length > 0 || previewContextSummary.length > 0 || props.staleness() || props.scopeMismatch()),
    showMultiRecordControls: props.recordCount() > 1,
    showPreviewContext: previewContextSummary.length > 0,
    showSummary: summaryItems.length > 0,
    showToneLegend: showAll,
    sortModeActionItems: [
      {
        active: sortMode === "priority",
        label: "Priority",
        mode: "priority",
        title: props.sortActionLabel("priority"),
      },
      {
        active: sortMode === "recent",
        label: "Recent",
        mode: "recent",
        title: props.sortActionLabel("recent"),
      },
    ],
    staleness: props.staleness(),
    summaryItems,
    title: props.title(),
    toneLegendItems: props.toneLegendEntries().map((entry) => ({
      className: `rounded-full border px-2 py-1 transition ${props.legendClass(entry.key)}`,
      key: entry.key,
      label: entry.label,
      target: entry.target ?? null,
      title: entry.target ? props.legendActionLabel(entry.target) : null,
    })),
  };
}

type ResumeSectionProps = {
  onResume: () => void;
  resumeLabel: string;
};

function ResumeSection(props: ResumeSectionProps): JSXElement {
  return (
    <button
      type="button"
      class={SHARED_REVIEW_RESUME_BUTTON_CLASS}
      onClick={props.onResume}
    >
      {props.resumeLabel}
    </button>
  );
}

type NarrowingSectionProps = {
  props: WorkflowStoredSharedReviewControlsProps;
  state: WorkflowStoredSharedReviewControlsState;
};

function NarrowingSection(props: NarrowingSectionProps): JSXElement {
  const view = props.state;
  return (
    <div class={SHARED_REVIEW_SECTION_STACK_CLASS}>
      <div class={SHARED_REVIEW_ROW_CLASS}>
        <For each={view.compositionItems}>
          {(entry) => (
            <button
              type="button"
              class={entry.className}
              title={entry.title}
              aria-label={entry.title}
              onClick={() => props.props.onApplyCompositionFocus(entry.key)}
            >
              {entry.label}
            </button>
          )}
        </For>
      </div>

      <Show when={view.activeFilterItems.length > 0}>
        <div class={SHARED_REVIEW_ROW_CLASS}>
          <For each={view.activeFilterItems}>
            {(entry) => (
              <button
                type="button"
                class={entry.className}
                title={entry.title}
                aria-label={entry.title}
                onClick={() => props.props.onClearActiveFilter(entry.key)}
              >
                {entry.label}
              </button>
            )}
          </For>
          <Show when={view.hasMultipleActiveFilters}>
            <button
              type="button"
              class={SHARED_REVIEW_RESET_BUTTON_CLASS}
              title="Clear all saved-review narrowing"
              aria-label="Clear all saved-review narrowing"
              onClick={props.props.onResetSelectorNarrowing}
            >
              Reset all
            </button>
          </Show>
        </div>
      </Show>

      <Show when={view.showToneLegend}>
        <div class={SHARED_REVIEW_LEGEND_ROW_CLASS}>
          <span class="text-violet-700/80">Tone legend:</span>
          <For each={view.toneLegendItems}>
            {(entry) => (
              <Show
                when={entry.target}
                fallback={<span class={entry.className}>{entry.label}</span>}
              >
                {(target) => (
                  <button
                    type="button"
                    class={entry.className}
                    title={entry.title ?? undefined}
                    aria-label={entry.title ?? undefined}
                    onClick={() => {
                      const nextTarget = target();
                      if (nextTarget === "clear_search") props.props.onClearActiveFilter("search");
                      else props.props.onApplyCompositionFocus(nextTarget);
                    }}
                  >
                    {entry.label}
                  </button>
                )}
              </Show>
            )}
          </For>
        </div>
      </Show>

      <Show when={view.showFilterToolbar}>
        <div class="flex flex-wrap items-center gap-2">
          <input
            value={props.props.filterValue()}
            onInput={(event) => props.props.onSetFilter(event.currentTarget.value)}
            class={SHARED_REVIEW_FILTER_INPUT_CLASS}
            title="Filter saved reviews by label, environment, deployment, or drift context"
            aria-label="Filter saved reviews by label, environment, deployment, or drift context"
            placeholder="Filter labels, env, deployment"
          />
          <div class={SHARED_REVIEW_ROW_CLASS}>
            <For each={view.shareModeActionItems}>
              {(item) => (
                <button
                  type="button"
                  class={`px-2 py-1 text-[10px] font-medium transition ${filterModeButtonClass(item.active)}`}
                  title={item.title}
                  aria-label={item.title}
                  onClick={() => props.props.onSetShareModeFilter(item.mode)}
                >
                  {item.label}
                </button>
              )}
            </For>
          </div>
          <div class={SHARED_REVIEW_ROW_CLASS}>
            <For each={view.sortModeActionItems}>
              {(item) => (
                <button
                  type="button"
                  class={`px-2 py-1 text-[10px] font-medium transition ${filterModeButtonClass(item.active)}`}
                  title={item.title}
                  aria-label={item.title}
                  onClick={() => props.props.onSetSortMode(item.mode)}
                >
                  {item.label}
                </button>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show
        when={view.showExpandedGroups}
        fallback={
          <div class={SHARED_REVIEW_ROW_CLASS}>
            <For each={view.collapsedSelectorItems}>
              {(entry) => (
                <button
                  type="button"
                  class={`px-2 py-1 text-[10px] font-medium transition ${selectorChipClass(entry.active)}`}
                  title={entry.title}
                  aria-label={entry.ariaLabel}
                  onClick={() => props.props.onSelectEntry(entry.id)}
                >
                  <Show when={entry.pinned}>
                    <span class="mr-1">pin</span>
                  </Show>
                  {entry.label}
                  <span
                    class={`ml-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${entry.shareModeClass}`}
                  >
                    {entry.shareModeLabel}
                  </span>
                </button>
              )}
            </For>
            <Show when={view.moreSelectorCount > 0}>
              <button
                type="button"
                class={SHARED_REVIEW_SMALL_OUTLINE_BUTTON_CLASS}
                title={props.props.expandActionLabel(view.moreSelectorCount)}
                aria-label={props.props.expandActionLabel(view.moreSelectorCount)}
                onClick={() => props.props.onSetShowAll(true)}
              >
                {`+${view.moreSelectorCount} more`}
              </button>
            </Show>
          </div>
        }
      >
        <div class={SHARED_REVIEW_SECTION_STACK_CLASS}>
          <Show when={props.props.sortMode() === "priority" && view.groupPinnedItems.length > 0}>
            <div class="space-y-1">
              <p class={SHARED_REVIEW_SUMMARY_LABEL_CLASS}>Pinned</p>
              <div class={SHARED_REVIEW_ROW_CLASS}>
                <For each={view.groupPinnedItems}>
                  {(entry) => (
                    <button
                      type="button"
                      class={`px-2 py-1 text-[10px] font-medium transition ${selectorChipClass(entry.active)}`}
                      title={entry.title}
                      aria-label={entry.ariaLabel}
                      onClick={() => props.props.onSelectEntry(entry.id)}
                    >
                      <span class="mr-1">pin</span>
                      {entry.label}
                      <span
                        class={`ml-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${entry.shareModeClass}`}
                      >
                        {entry.shareModeLabel}
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <Show when={view.groupRecentItems.length > 0}>
            <div class="space-y-1">
              <p class={SHARED_REVIEW_SUMMARY_LABEL_CLASS}>Recent</p>
              <div class={SHARED_REVIEW_ROW_CLASS}>
                <For each={view.groupRecentItems}>
                  {(entry) => (
                    <button
                      type="button"
                      class={`px-2 py-1 text-[10px] font-medium transition ${selectorChipClass(entry.active)}`}
                      title={entry.title}
                      aria-label={entry.ariaLabel}
                      onClick={() => props.props.onSelectEntry(entry.id)}
                    >
                      {entry.label}
                      <span
                        class={`ml-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${entry.shareModeClass}`}
                      >
                        {entry.shareModeLabel}
                      </span>
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>
          <button
            type="button"
            class={SHARED_REVIEW_SMALL_OUTLINE_BUTTON_CLASS}
            title={props.props.collapseActionLabel()}
            aria-label={props.props.collapseActionLabel()}
            onClick={() => props.props.onSetShowAll(false)}
          >
            Less
          </button>
        </div>
      </Show>

      <Show when={view.showEmptyState}>
        <div class={SHARED_REVIEW_SECTION_STACK_CLASS}>
          <p class="text-[11px] text-violet-700/80">{props.props.emptyStateLabel()}</p>
          <Show when={view.emptyStateActionItems.length > 0}>
            <div class={SHARED_REVIEW_ROW_CLASS}>
              <For each={view.emptyStateActionItems}>
                {(entry) => (
                  <button
                    type="button"
                    class={entry.className}
                    title={entry.title}
                    aria-label={entry.title}
                    onClick={() => props.props.onClearActiveFilter(entry.key)}
                  >
                    {entry.label}
                  </button>
                )}
              </For>
              <Show when={view.hasMultipleActiveFilters}>
                <button
                  type="button"
                  class={SHARED_REVIEW_RESET_BUTTON_CLASS}
                  title="Clear all saved-review narrowing"
                  aria-label="Clear all saved-review narrowing"
                  onClick={props.props.onResetSelectorNarrowing}
                >
                  Reset all
                </button>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

type MetadataSectionProps = {
  props: WorkflowStoredSharedReviewControlsProps;
  state: WorkflowStoredSharedReviewControlsState;
};

function MetadataSection(props: MetadataSectionProps): JSXElement {
  const view = props.state;
  return (
    <>
      <Show when={view.title}>
        {(title) => <span class={SHARED_REVIEW_META_BADGE_CLASS}>{title()}</span>}
      </Show>
      <Show when={view.savedAtLabel}>
        {(label) => <span class={SHARED_REVIEW_SAVED_AT_CLASS}>{`saved ${label()}`}</span>}
      </Show>
      <Show when={view.showSummary}>
        <div class={SHARED_REVIEW_SUMMARY_STACK_CLASS}>
          <p class={SHARED_REVIEW_SUMMARY_LABEL_CLASS}>Selected review</p>
          <div class={SHARED_REVIEW_ROW_CLASS}>
            <For each={view.summaryItems.slice(0, 4)}>
              {(entry) => <span class={SHARED_REVIEW_SUMMARY_CHIP_CLASS}>{entry}</span>}
            </For>
          </div>
        </div>
      </Show>
      <Show when={view.showPreviewContext}>
        <div class={SHARED_REVIEW_SUMMARY_STACK_CLASS}>
          <div class="space-y-0.5">
            <p class={SHARED_REVIEW_CONTEXT_LABEL_CLASS}>Selector context</p>
            <p class={SHARED_REVIEW_CONTEXT_HELP_CLASS}>Click a chip to clear that selector state.</p>
          </div>
          <div class={SHARED_REVIEW_ROW_CLASS}>
            <For each={view.previewContextItems}>
              {(entry) => (
                <button
                  type="button"
                  class={entry.className}
                  title={entry.title}
                  aria-label={entry.title}
                  onClick={() => props.props.onClearPreviewContext(entry.key)}
                >
                  {entry.label}
                </button>
              )}
            </For>
            <Show when={view.hasMultiplePreviewContextEntries}>
              <button
                type="button"
                class="rounded-full border border-slate-200/70 bg-white/80 px-2 py-1 text-[10px] font-medium text-slate-700 transition hover:bg-white"
                title="Clear all selector context"
                aria-label="Clear all selector context"
                onClick={props.props.onResetPreviewContext}
              >
                Reset all
              </button>
            </Show>
          </div>
        </div>
      </Show>
      <Show when={view.staleness}>
        {(badge) => <span class={SHARED_REVIEW_STALENESS_CLASS}>{badge().label}</span>}
      </Show>
      <Show when={view.scopeMismatch}>
        {(badge) => <span class={SHARED_REVIEW_SCOPE_MISMATCH_CLASS}>{badge().label}</span>}
      </Show>
    </>
  );
}

type ActionsSectionProps = {
  props: WorkflowStoredSharedReviewControlsProps;
  state: WorkflowStoredSharedReviewControlsState;
};

function ActionsSection(props: ActionsSectionProps): JSXElement {
  return (
    <>
      <button
        type="button"
        class={props.state.matchesCurrentView ? SHARED_REVIEW_REFRESH_FRESH_CLASS : SHARED_REVIEW_REFRESH_STALE_CLASS}
        onClick={props.props.onRefreshStoredReview}
      >
        {props.state.matchesCurrentView ? "Saved review up to date" : "Refresh saved review"}
      </button>
      <button
        type="button"
        class={SHARED_REVIEW_ACTION_BUTTON_CLASS}
        onClick={props.props.onRenameStoredReview}
      >
        Rename
      </button>
      <button
        type="button"
        class={SHARED_REVIEW_ACTION_BUTTON_CLASS}
        onClick={props.props.onTogglePinStoredReview}
      >
        {props.state.selectedEntryPinned ? "Unpin" : "Pin"}
      </button>
      <button
        type="button"
        class={SHARED_REVIEW_FORGET_BUTTON_CLASS}
        onClick={props.props.onForgetStoredReview}
      >
        Forget saved review
      </button>
    </>
  );
}

export function WorkflowStoredSharedReviewControls(
  props: WorkflowStoredSharedReviewControlsProps,
) {
  const controlsState = createMemo(() => workflowStoredSharedReviewControlsState(props));

  const visibleSections = createMemo<WorkflowStoredSharedReviewControlsSectionId[]>(() => {
    const state = controlsState();
    const sections: WorkflowStoredSharedReviewControlsSectionId[] = ["resume", "actions"];
    if (state.showMultiRecordControls) {
      sections.splice(1, 0, "narrowing");
    }
    if (state.showMetadata) {
      sections.splice(sections.length - 1, 0, "metadata");
    }
    return sections;
  });

  return (
    <div class={SHARED_REVIEW_SHELL_CLASS}>
      <For each={visibleSections()}>
        {(sectionId) => {
          const state = controlsState();
          if (sectionId === "resume") {
            return <ResumeSection onResume={props.onResume} resumeLabel={props.resumeLabel} />;
          }
          if (sectionId === "narrowing") {
            return <NarrowingSection props={props} state={state} />;
          }
          if (sectionId === "metadata") {
            return <MetadataSection props={props} state={state} />;
          }
          return <ActionsSection props={props} state={state} />;
        }}
      </For>
    </div>
  );
}
