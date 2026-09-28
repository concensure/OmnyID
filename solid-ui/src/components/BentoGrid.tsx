// @locs-version: 2.2
// @module-id: ui.bento-grid
// @primary-capability: home-workspace-bento-layout
// @stability: beta
import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, Switch, Match } from "solid-js";
import { Portal } from "solid-js/web";
import {
  artifactSummaryDisplayedLines,
  boundedReasonSummary,
  fieldEngineFamilyLabel,
  latestFieldEnginePrimaryTypeFromMessages,
  latestFieldEngineSummaryFromMessages,
  outcomeFeedbackLabel,
  outcomeFeedbackTone,
  preparedDraftClassLabel,
  preparedDraftDestinationForItem,
  preparedDraftOutcomeFeedbackForItem,
  priorityRationaleSummary,
  responseItemPreparedDraftAnchorSummary,
  responseItemPreparedDraftDisplayedSummaryLines,
  responseItemPreparedDraftLeadSummary,
  responseItemOutcomeFeedbackForItem,
  summarizeReferenceLabels,
  sourceCountSummary,
} from "afp-ts/continuity";
import { fetchWorkspaceBundleSignature, type AfpMessage, type DashboardBootstrap } from "@/lib/api";
import {
  buildQueueEntries,
  decisionQueueUrgencyStyle,
} from "@/lib/decisionQueueModel";
import { decisionQueueEntryDestinationLabel } from "@/lib/decisionQueueNavigation";
import {
  queueEntryConfidenceLabel,
  queueEntryTrustState,
} from "@/lib/decisionQueuePresentationState";
import { normalizeViewName, type ViewName } from "@/lib/viewNames";
import { RailIcon } from "@/components/RailIcons";
import { Tip } from "@/components/Tip";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import {
  CalendarQuickAdd, ChatQuickAdd, EmailQuickAdd, DataQuickAdd, TaskQuickAdd, QuickAddPanel,
} from "@/components/BentoQuickAdd";
import type {
  WorkspaceAssistDraftRefreshInput,
  WorkspaceAssistRefreshOrigin,
} from "@/lib/workspaceAssist";
import { IntelligenceBrief, TileSettingsButton } from "@/components/IntelligenceBrief";
import { ProactiveSuggestionStrip } from "@/components/ProactiveSuggestionStrip";
import { A2UICard } from "@/components/A2UICard";
import { TrustSummaryBlocks } from "@/components/renderers/TrustSummaryBlocks";
import { tileThumbnailUrl } from "@/lib/tileImageUrl";
import { afpRecord } from "@/lib/afpMessageRecord";
import {
  dashboardBootstrapCostSnapshot,
  dashboardBootstrapMessages,
  dashboardBootstrapThreadSummaries,
} from "@/lib/dashboardBootstrapState";
import {
  decisionOsQueueCompanionState,
  decisionOsQueueBootstrapState,
  decisionOsQueueHasVisibleWork,
  type DecisionOsQueueBootstrapState,
  type DecisionOsQueueCompanionState,
} from "@/lib/decisionOsQueueBootstrapState";
import {
  decisionOsPreparedWorkSimulatorLaneState,
  decisionOsPreparedDraftPresentationState,
  decisionOsPreparedWorkSimulatorTileState,
  decisionOsResponsePreparedDraftPresentationState,
} from "@/lib/decisionosPreparedWorkState";
import { responseQueueTrustBlockState } from "@/lib/responseQueueTrustBlockState";
import {
  simulatorPreviewBadgeLabel,
  simulatorPreviewSummary,
} from "@/lib/simulatorPreviewCopy";
import {
  clearBentoGridLayout,
  clearBentoTileEnabled,
  loadHiddenBentoTileIds,
  loadBentoGridLayoutState,
  saveBentoTileEnabled,
  saveBentoGridLayout,
  type BentoTileConfig as TileConfig,
} from "@/lib/bentoGridLocalState";
import { taskMessagePresentation } from "@/lib/taskPresentationState";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GridSpec {
  columns: number;
  rowHeightPx: number;
  gapPx: number;
}
interface TileLayoutPolicy {
  tier: 1 | 2 | 3 | 4;
  minColSpan: number;
  maxColSpan: number;
  minRowSpan: number;
  maxRowSpan: number;
  defaultColSpan: number;
  defaultRowSpan: number;
}
interface PackedTile {
  tile: TileConfig;
  policy: TileLayoutPolicy;
  maxColSpan: number;
  maxRowSpan: number;
  resolvedColSpan: number;
  resolvedRowSpan: number;
  resolvedDisplayMode: "default" | "compact" | "graph";
  sourceIndex: number;
  priority: number;
}

const TILE_VIEW_IDS = [
  "search",
  "email",
  "decision_queue",
  "response_queue",
  "cost_dashboard",
  "workflows",
  "calendar",
  "note",
  "threads",
  "database",
  "diary",
  "discover",
  "contacts",
  "tasks",
  "space_feed",
  "public_feed",
  "cofounder_studio",
  "knowledge_graph",
  "reports",
  "sovereignty_audit",
  "a2ui_card",
] as const satisfies readonly ViewName[];

type TileViewId = (typeof TILE_VIEW_IDS)[number];

const TILE_META: Partial<Record<ViewName, { label: string; desc: string }>> = {
  search:           { label: "Chat",           desc: "AI assistant and command interface" },
  email:            { label: "Email",          desc: "Inbox and threaded conversations" },
  decision_queue:   { label: "Decision Queue", desc: "Approvals and synthesized actions requiring judgment" },
  response_queue:   { label: "Response Queue", desc: "Replies and conversations awaiting attention" },
  cost_dashboard:   { label: "Cost Dashboard", desc: "Budget ceilings, spend tracking, and cost analysis" },
  workflows:        { label: "Workflows",      desc: "Agent blueprints and run history" },
  calendar:         { label: "Calendar",       desc: "Events and scheduled reminders" },
  note:             { label: "Notes",          desc: "Knowledge base and saved ideas" },
  threads:          { label: "Threads",        desc: "Conversation threads" },
  database:         { label: "Data",           desc: "Structured data and tables" },
  diary:            { label: "Diary",          desc: "Daily reflections and journal" },
  discover:         { label: "Discover",       desc: "Knowledge graph and connections" },
  contacts:         { label: "Contacts",       desc: "People and agents in your network" },
  tasks:            { label: "Tasks",          desc: "Active to-dos not yet due" },
  space_feed:       { label: "Spaces",         desc: "AFP spaces and channels" },
  public_feed:      { label: "Public Feed",    desc: "Agent-published articles" },
  cofounder_studio: { label: "Co-Founder",     desc: "AI startup studio and launchpad" },
  knowledge_graph:  { label: "Knowledge Graph", desc: "Nodes, links, and backlinks" },
  reports:          { label: "Reports",        desc: "Study reports from linked knowledge" },
  sovereignty_audit:{ label: "Sovereignty",    desc: "Data ownership and E2EE metrics" },
  a2ui_card:        { label: "Custom Card",    desc: "Agent-generated card - ask or attach" },
};

const ACCENT: Record<string, string> = {
  search:           "from-blue-50/80 via-indigo-50/50 to-blue-50/30 border-blue-200/40",
  email:            "from-violet-50/80 via-purple-50/50 to-violet-50/30 border-violet-200/40",
  decision_queue:   "from-indigo-50/80 via-violet-50/50 to-indigo-50/30 border-indigo-200/40",
  response_queue:   "from-sky-50/80 via-cyan-50/50 to-sky-50/30 border-sky-200/40",
  cost_dashboard:   "from-emerald-50/80 via-lime-50/50 to-white/30 border-emerald-200/40",
  workflows:        "from-emerald-50/80 via-teal-50/50 to-emerald-50/30 border-emerald-200/40",
  calendar:         "from-atelier-lime/30 via-atelier-lime/10 to-white/30 border-atelier-lime/50",
  note:             "from-atelier-mint/40 via-atelier-mint/15 to-white/30 border-atelier-mint/50",
  threads:          "from-amber-50/80 via-yellow-50/50 to-amber-50/30 border-amber-200/40",
  database:         "from-slate-50/80 via-gray-50/50 to-slate-50/30 border-slate-200/40",
  diary:            "from-rose-50/80 via-pink-50/50 to-rose-50/30 border-rose-200/40",
  discover:         "from-sky-50/80 via-cyan-50/50 to-sky-50/30 border-sky-200/40",
  contacts:         "from-green-50/80 via-emerald-50/50 to-green-50/30 border-green-200/40",
  tasks:            "from-amber-50/80 via-yellow-50/50 to-amber-50/30 border-amber-200/40",
  space_feed:       "from-cyan-50/80 via-sky-50/50 to-cyan-50/30 border-cyan-200/40",
  public_feed:      "from-orange-50/80 via-amber-50/50 to-orange-50/30 border-orange-200/40",
  cofounder_studio: "from-indigo-50/80 via-violet-50/50 to-indigo-50/30 border-indigo-200/40",
  knowledge_graph:  "from-teal-50/80 via-emerald-50/50 to-teal-50/30 border-teal-200/40",
  reports:          "from-emerald-50/80 via-cyan-50/50 to-white/30 border-emerald-200/40",
  sovereignty_audit:"from-purple-50/80 via-fuchsia-50/50 to-purple-50/30 border-purple-200/40",
};

const TILE_BG: Record<string, string> = {
  blue:    "from-blue-100/80 via-blue-50/50 to-white/30 border-blue-300/50",
  violet:  "from-violet-100/80 via-violet-50/50 to-white/30 border-violet-300/50",
  emerald: "from-emerald-100/80 via-emerald-50/50 to-white/30 border-emerald-300/50",
  amber:   "from-amber-100/80 via-amber-50/50 to-white/30 border-amber-300/50",
  rose:    "from-rose-100/80 via-rose-50/50 to-white/30 border-rose-300/50",
  slate:   "from-slate-100/80 via-slate-50/50 to-white/30 border-slate-300/50",
};

const TILE_BG_DOT: Record<string, string> = { blue: "bg-blue-400", violet: "bg-violet-400", emerald: "bg-emerald-400", amber: "bg-amber-400", rose: "bg-rose-400", slate: "bg-slate-400" };

const TILE_LAYOUT_POLICIES: Partial<Record<ViewName, TileLayoutPolicy>> = {
  search: { tier: 1, minColSpan: 1, maxColSpan: 6, minRowSpan: 1, maxRowSpan: 5, defaultColSpan: 3, defaultRowSpan: 2 },
  decision_queue: { tier: 1, minColSpan: 1, maxColSpan: 4, minRowSpan: 1, maxRowSpan: 4, defaultColSpan: 2, defaultRowSpan: 2 },
  response_queue: { tier: 1, minColSpan: 1, maxColSpan: 4, minRowSpan: 1, maxRowSpan: 4, defaultColSpan: 2, defaultRowSpan: 2 },
  email: { tier: 2, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 2, defaultRowSpan: 1 },
  workflows: { tier: 2, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 2, defaultRowSpan: 1 },
  calendar: { tier: 2, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 2, defaultRowSpan: 1 },
  tasks: { tier: 2, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 2, defaultRowSpan: 1 },
  cost_dashboard: { tier: 3, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 2, defaultRowSpan: 1 },
  note: { tier: 3, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 1, defaultRowSpan: 1 },
  threads: { tier: 3, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 1, defaultRowSpan: 1 },
  database: { tier: 3, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 1, defaultRowSpan: 1 },
  diary: { tier: 4, minColSpan: 1, maxColSpan: 2, minRowSpan: 1, maxRowSpan: 2, defaultColSpan: 1, defaultRowSpan: 1 },
  discover: { tier: 3, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 1, defaultRowSpan: 1 },
  contacts: { tier: 3, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 1, defaultRowSpan: 1 },
  space_feed: { tier: 3, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 1, defaultRowSpan: 1 },
  public_feed: { tier: 3, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 1, defaultRowSpan: 1 },
  cofounder_studio: { tier: 3, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 1, defaultRowSpan: 1 },
  knowledge_graph: { tier: 3, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 1, defaultRowSpan: 1 },
  reports: { tier: 2, minColSpan: 1, maxColSpan: 4, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 2, defaultRowSpan: 1 },
  sovereignty_audit: { tier: 3, minColSpan: 1, maxColSpan: 3, minRowSpan: 1, maxRowSpan: 3, defaultColSpan: 1, defaultRowSpan: 1 },
  a2ui_card: { tier: 4, minColSpan: 1, maxColSpan: 4, minRowSpan: 1, maxRowSpan: 4, defaultColSpan: 2, defaultRowSpan: 1 },
};

const DEFAULT_TILE_LAYOUT_POLICY: TileLayoutPolicy = {
  tier: 3,
  minColSpan: 1,
  maxColSpan: 3,
  minRowSpan: 1,
  maxRowSpan: 3,
  defaultColSpan: 1,
  defaultRowSpan: 1,
};

function tileLayoutPolicy(viewId: ViewName): TileLayoutPolicy {
  return TILE_LAYOUT_POLICIES[viewId] ?? DEFAULT_TILE_LAYOUT_POLICY;
}

function resolveGridSpec(containerWidth: number): GridSpec {
  const gapPx = 18;
  if (containerWidth < 520) return { columns: 1, rowHeightPx: 112, gapPx };
  if (containerWidth < 820) return { columns: 2, rowHeightPx: 124, gapPx };
  if (containerWidth < 1180) return { columns: 4, rowHeightPx: 132, gapPx };
  if (containerWidth < 1480) return { columns: 6, rowHeightPx: 140, gapPx };
  return { columns: 8, rowHeightPx: 148, gapPx };
}

function gridColumnStepPx(containerWidth: number, spec: GridSpec): number {
  const safeColumns = Math.max(1, spec.columns);
  const totalGap = spec.gapPx * Math.max(0, safeColumns - 1);
  const columnWidth = Math.max(96, (containerWidth - totalGap) / safeColumns);
  return columnWidth + spec.gapPx;
}

function gridRowStepPx(spec: GridSpec): number {
  return spec.rowHeightPx + spec.gapPx;
}

function clampSpan(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function defaultTileConfig(viewId: ViewName): Pick<TileConfig, "colSpan" | "rowSpan"> {
  const policy = tileLayoutPolicy(viewId);
  return {
    colSpan: policy.defaultColSpan,
    rowSpan: policy.defaultRowSpan,
  };
}

function maxRenderableColSpan(policy: TileLayoutPolicy, spec: GridSpec): number {
  return Math.min(policy.maxColSpan, spec.columns);
}

function maxVisibleTilesForSpec(spec: GridSpec): number {
  if (spec.columns <= 1) return 6;
  if (spec.columns <= 2) return 10;
  return Number.POSITIVE_INFINITY;
}

function maxVisibleTileCellsForSpec(spec: GridSpec): number {
  if (spec.columns <= 1) return 8;
  if (spec.columns <= 2) return 14;
  return Number.POSITIVE_INFINITY;
}

function trimPackedTilesToBudget(tiles: PackedTile[], spec: GridSpec): PackedTile[] {
  const maxTiles = maxVisibleTilesForSpec(spec);
  const maxCells = maxVisibleTileCellsForSpec(spec);
  if (!Number.isFinite(maxTiles) && !Number.isFinite(maxCells)) return tiles;

  const trimmed: PackedTile[] = [];
  let usedCells = 0;
  for (const tile of tiles) {
    if (trimmed.length >= maxTiles) break;
    const tileCells = tile.resolvedColSpan * tile.resolvedRowSpan;
    if (trimmed.length > 0 && usedCells + tileCells > maxCells) continue;
    trimmed.push(tile);
    usedCells += tileCells;
  }
  return trimmed;
}

function resolveTileMinHeight(config: TileConfig, spec: GridSpec): string {
  const rowSpan = Math.max(1, config.rowSpan);
  const compactPadding = spec.columns <= 2 || config.displayMode === "compact" ? 20 : 32;
  const occupiedGapPx = spec.gapPx * Math.max(0, rowSpan - 1);
  return `${spec.rowHeightPx * rowSpan + occupiedGapPx + compactPadding}px`;
}

function ghostTileMinHeight(spec: GridSpec): string {
  return resolveTileMinHeight({ id: "ghost", viewId: "note", colSpan: 1, rowSpan: 1 }, spec);
}

function resolvePackedDisplayMode(tile: TileConfig, policy: TileLayoutPolicy, spec: GridSpec): TileConfig["displayMode"] {
  const preferredMode = tile.displayMode ?? "default";
  if (preferredMode === "graph") return "graph";
  if (spec.columns <= 1) return policy.tier === 1 ? preferredMode : "compact";
  if (spec.columns <= 2) return policy.tier <= 2 ? preferredMode : "compact";
  if (spec.columns <= 4) return policy.tier >= 4 ? "compact" : preferredMode;
  return preferredMode;
}

function resolvePackedColSpan(
  tile: TileConfig,
  policy: TileLayoutPolicy,
  spec: GridSpec,
  displayMode: NonNullable<TileConfig["displayMode"]>,
): number {
  const preferredColSpan = clampSpan(tile.colSpan, policy.minColSpan, Math.min(policy.maxColSpan, spec.columns));
  if (spec.columns <= 1) return 1;
  if (spec.columns <= 2) {
    if (displayMode === "compact" || policy.tier >= 3) return 1;
    return Math.min(preferredColSpan, 2);
  }
  if (spec.columns <= 4 && displayMode === "compact") {
    return Math.min(preferredColSpan, 2);
  }
  return preferredColSpan;
}

function resolvePackedRowSpan(
  tile: TileConfig,
  policy: TileLayoutPolicy,
  spec: GridSpec,
  displayMode: NonNullable<TileConfig["displayMode"]>,
): number {
  const maxRowSpan = spec.columns === 1 ? Math.min(3, policy.maxRowSpan) : policy.maxRowSpan;
  const preferredRowSpan = clampSpan(tile.rowSpan, policy.minRowSpan, maxRowSpan);
  if (displayMode === "compact") {
    return Math.min(preferredRowSpan, spec.columns <= 2 ? 1 : 2);
  }
  if (spec.columns <= 2 && policy.tier >= 3) {
    return Math.min(preferredRowSpan, 2);
  }
  return preferredRowSpan;
}

function packTiles(tiles: TileConfig[], hiddenTileIds: Set<string>, spec: GridSpec): PackedTile[] {
  const visible = tiles
    .map((tile, sourceIndex) => ({ tile, sourceIndex }))
    .filter(({ tile }) => !hiddenTileIds.has(tile.id))
    .map(({ tile, sourceIndex }) => {
      const policy = tileLayoutPolicy(tile.viewId);
      const resolvedDisplayMode = resolvePackedDisplayMode(tile, policy, spec) ?? "default";
      return {
        tile,
        policy,
        maxColSpan: maxRenderableColSpan(policy, spec),
        maxRowSpan: policy.maxRowSpan,
        resolvedColSpan: resolvePackedColSpan(tile, policy, spec, resolvedDisplayMode),
        resolvedRowSpan: resolvePackedRowSpan(tile, policy, spec, resolvedDisplayMode),
        resolvedDisplayMode,
        sourceIndex,
        priority: 5 - policy.tier,
      };
    });

  const prioritized = spec.columns <= 6
    ? [...visible].sort((left, right) => right.priority - left.priority || left.sourceIndex - right.sourceIndex)
    : visible;

  return trimPackedTilesToBudget(prioritized, spec);
}

const DEFAULT_TILES: TileConfig[] = [
  { id: "t-chat", viewId: "search", ...defaultTileConfig("search") },
  { id: "t-email", viewId: "email", ...defaultTileConfig("email") },
  { id: "t-workflows", viewId: "workflows", ...defaultTileConfig("workflows") },
  { id: "t-calendar", viewId: "calendar", ...defaultTileConfig("calendar") },
  { id: "t-notes", viewId: "note", ...defaultTileConfig("note") },
];

function buildSeedTiles(args: {
  bootstrap: DashboardBootstrap | null;
  queueState: DecisionOsQueueBootstrapState;
  queueCompanionState: DecisionOsQueueCompanionState;
}): TileConfig[] {
  const tiles = [...DEFAULT_TILES];
  const addTile = (viewId: ViewName, colSpan: TileConfig["colSpan"], rowSpan: TileConfig["rowSpan"]) => {
    if (tiles.some((tile) => tile.viewId === viewId)) return;
    tiles.push({
      id: `t-${viewId}-seed`,
      viewId,
      colSpan,
      rowSpan,
    });
  };

  if (args.queueCompanionState.responseItems.length > 0) {
    const layout = defaultTileConfig("response_queue");
    addTile("response_queue", layout.colSpan, layout.rowSpan);
  }

  if (decisionOsQueueHasVisibleWork(args.queueState)) {
    const layout = defaultTileConfig("decision_queue");
    addTile("decision_queue", layout.colSpan, layout.rowSpan);
  }

  {
    const layout = defaultTileConfig("cost_dashboard");
    addTile("cost_dashboard", layout.colSpan, layout.rowSpan);
  }

  return tiles;
}

type ContentBody = { body?: string; text?: string; title?: string; subject?: string };
const MESSAGE_SUMMARY_FALLBACK = "-";
const COMPARISON_VALUE_SEPARATOR = " | ";

function msgText(m: { content: unknown }): string {
  const c = m.content as ContentBody;
  return c?.subject ?? c?.title ?? c?.body?.slice(0, 80) ?? c?.text?.slice(0, 80) ?? MESSAGE_SUMMARY_FALLBACK;
}

function ChatTile(props: { msgs: { type: string; content: unknown }[] }) {
  const recent = () => props.msgs.slice(0, 3);
  return (
    <div class="flex flex-col gap-2">
      <Show when={recent().length > 0} fallback={
        <p class="text-xs text-on-surface-variant/50 italic">No recent messages yet</p>
      }>
        <For each={recent()}>
          {(m) => (
            <div class="rounded-xl border border-white/50 bg-white/50 px-3 py-2">
              <p class="font-mono text-[9px] uppercase tracking-wider text-outline/50 truncate">
                {m.type.replace(/_/g, " ")}
              </p>
              <p class="mt-0.5 line-clamp-2 text-xs text-on-surface">{msgText(m)}</p>
            </div>
          )}
        </For>
      </Show>
    </div>
  );
}
function EmailTile(props: { msgs: { type: string; content: unknown }[] }) {
  return (
    <div class="flex flex-col gap-1.5">
      <p class="text-xs text-on-surface-variant">
        {props.msgs.length > 0 ? `${props.msgs.length} thread${props.msgs.length === 1 ? "" : "s"}` : "Inbox empty"}
      </p>
      <For each={props.msgs.slice(0, 2)} fallback={
        <p class="text-[11px] text-on-surface-variant/40 italic">No email messages</p>
      }>
        {(m) => (
          <p class="line-clamp-1 rounded-lg border border-white/45 bg-white/45 px-2 py-1 text-xs text-on-surface">
            {msgText(m)}
          </p>
        )}
      </For>
    </div>
  );
}

function ResponseQueueTile(props: {
  queueCompanionState: DecisionOsQueueCompanionState;
  messages: NonNullable<DashboardBootstrap["messages"]>;
}) {
  const responseItems = () => props.queueCompanionState.responseItems;
  const proactiveSuggestions = () => props.queueCompanionState.proactiveSuggestions;
  const simulatorResponsePreviewState = createMemo(() => {
    const item = proactiveSuggestions().find((entry) =>
      entry.kind === "simulator_reversible_preview"
      || entry.kind === "simulator_conflict_fusion",
    );
    return {
      item,
      lane: decisionOsPreparedWorkSimulatorLaneState(item),
      card: decisionOsPreparedWorkSimulatorTileState(item),
    };
  });
  const fieldEngineFamily = () =>
    fieldEngineFamilyLabel(latestFieldEnginePrimaryTypeFromMessages(props.messages));
  const fieldEngineSummary = () => latestFieldEngineSummaryFromMessages(props.messages);
  const draftReadyCount = () => responseItems().filter((item) => item.prepared_draft_available).length;
  const queueSummaryLabel = () => {
    const simulatorLane = simulatorResponsePreviewState().lane;
    return responseItems().length > 0
      ? `${responseItems().length} waiting response${responseItems().length === 1 ? "" : "s"}`
      : fieldEngineFamily() && fieldEngineSummary()
        ? `${fieldEngineFamily()} active`
        : simulatorLane?.title ?? "No pending replies";
  };
  const draftReadyLabel = () =>
    `${draftReadyCount()} draft${draftReadyCount() === 1 ? "" : "s"} ready`;
  return (
    <div class="flex flex-col gap-2">
      <p class="text-xs text-on-surface-variant">
        {queueSummaryLabel()}
      </p>
      <Show when={draftReadyCount() > 0}>
        <p class="text-[10px] font-medium text-emerald-700/80">
          {draftReadyLabel()}
        </p>
      </Show>
      <For each={responseItems().slice(0, 3)} fallback={
        <Show
          when={simulatorResponsePreviewState().item}
          fallback={<p class="text-[11px] text-on-surface-variant/40 italic">Response queue is clear</p>}
        >
          {(_preview) => {
            const previewState = simulatorResponsePreviewState();
            const previewCard = previewState.card;
            const trustBlockState = responseQueueTrustBlockState({
              sourceSummaryText: previewCard?.sourceSummary ?? null,
              previewBoundarySummaryText:
                previewState.item?.preview_only ? (previewCard?.previewBoundarySummary ?? null) : null,
            });
            const previewKind = previewCard?.kind ?? "reversible";
            const previewTone = previewKind === "fusion"
              ? {
                  border: "border-violet-100/70",
                  bg: "bg-violet-50/45",
                  badge: "border-violet-200/60 bg-white/85 text-violet-700",
                  detail: "text-violet-900/75",
                }
              : {
                  border: "border-teal-100/70",
                  bg: "bg-teal-50/45",
                  badge: "border-teal-200/60 bg-white/85 text-teal-700",
                  detail: "text-teal-900/75",
                };
            return (
              <div class={`rounded-xl border px-3 py-2 ${previewTone.border} ${previewTone.bg}`}>
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-xs font-medium text-on-surface">
                    {previewCard?.title}
                  </span>
                  <span class={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wide ${previewTone.badge}`}>
                    {simulatorPreviewBadgeLabel(previewKind)}
                  </span>
                </div>
                <p class={`mt-1 line-clamp-2 text-[10px] ${previewTone.detail}`}>
                  {previewCard?.detail ?? simulatorPreviewSummary(previewKind)}
                </p>
                <Show when={previewCard?.leadSummaryLine}>
                  {(line) => (
                    <p class="mt-1 line-clamp-2 text-[10px] text-on-surface-variant/65">
                      {line()}
                    </p>
                  )}
                </Show>
                <For each={previewCard?.supportingSummaryLines ?? []}>
                  {(line) => (
                    <p class="mt-1 line-clamp-2 text-[10px] text-on-surface-variant/65">
                      {line}
                    </p>
                  )}
                </For>
                <Show when={previewCard?.rolloutSummary}>
                  <p class="mt-1 line-clamp-2 text-[10px] text-on-surface-variant/65">
                    {previewCard!.rolloutSummary}
                  </p>
                </Show>
                <Show when={previewCard?.persistenceReason}>
                  <p class="mt-1 line-clamp-2 text-[10px] text-on-surface-variant/65">
                    {previewCard!.persistenceReason}
                  </p>
                </Show>
                <Show when={trustBlockState.showSharedTrustBlocks}>
                  <div class="mt-1 space-y-1">
                    <TrustSummaryBlocks
                      sourceSummary={trustBlockState.sourceSummaryText}
                      previewBoundarySummary={trustBlockState.previewBoundarySummaryText}
                    />
                  </div>
                </Show>
              </div>
            );
          }}
        </Show>
      }>
        {(item) => {
          const feedback = responseItemOutcomeFeedbackForItem(item, proactiveSuggestions());
          const feedbackLabel = () => outcomeFeedbackLabel(feedback);
          const presentationState = () => decisionOsResponsePreparedDraftPresentationState(item);
          const trustBlockState = () =>
            responseQueueTrustBlockState({
              sourceSummaryText: presentationState().sourceSummary,
              consequencePreviewText: presentationState().consequencePreview,
              provenanceCueText: presentationState().provenanceCue,
              autonomySummaryText: presentationState().autonomySummary,
            });
          const objectAnchorSummary = () =>
            responseItemPreparedDraftAnchorSummary({
              prepared_draft_summary_lines: item.prepared_draft_summary_lines,
              prepared_draft_object_labels: item.prepared_draft_object_labels,
              prefix: "Anchors",
              limit: 2,
            });
          const displayedDraftSummaryLines = () =>
            responseItemPreparedDraftDisplayedSummaryLines(item);
          const leadDraftSummary = () =>
            displayedDraftSummaryLines()[0] ?? null;
          const supportingDraftSummaryLines = () =>
            displayedDraftSummaryLines().slice(1, 2);
          const fieldEngineCue = () =>
            fieldEngineSummary() &&
            !(leadDraftSummary()?.toLowerCase().includes(fieldEngineSummary()!.toLowerCase()) ?? false) &&
            !(presentationState().boundedReason?.toLowerCase().includes(fieldEngineSummary()!.toLowerCase()) ?? false)
              ? fieldEngineFamily()
                ? `${fieldEngineFamily()}: ${fieldEngineSummary()}`
                : fieldEngineSummary()
              : null;
          const urgencyLabel = () => (item.urgency === "today" ? "due soon" : item.urgency);
          const displacedDraftLabel = () =>
            item.prepared_draft_class ? `Replaced by ${preparedDraftClassLabel(item.prepared_draft_class)}` : "";

          return (
            <div class="rounded-xl border border-white/55 bg-white/55 px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-xs font-medium text-on-surface">{item.title}</span>
                <div class="flex items-center gap-1.5">
                  <Show when={item.prepared_draft_available}>
                    <span class="rounded-full border border-emerald-200/60 bg-emerald-50/80 px-2 py-0.5 text-[9px] uppercase tracking-wide text-emerald-700">
                      draft
                    </span>
                  </Show>
                  <Show when={feedbackLabel()}>
                    <span class={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wide ${outcomeFeedbackTone(feedback)}`}>
                      {feedbackLabel()}
                    </span>
                  </Show>
                  <span class="rounded-full border border-sky-200/60 bg-sky-50/80 px-2 py-0.5 text-[9px] uppercase tracking-wide text-sky-700">
                    {item.channel}
                  </span>
                </div>
              </div>
              <div class="mt-1 flex items-center justify-between gap-2 text-[10px] text-on-surface-variant/70">
                <span>{item.response_due_hint}</span>
                <span>{urgencyLabel()}</span>
              </div>
              <Show when={presentationState().boundedReason}>
                <p class="mt-1 line-clamp-1 text-[10px] text-sky-900/72">
                  {presentationState().boundedReason}
                </p>
              </Show>
              <Show when={leadDraftSummary()}>
                <p class="mt-1 line-clamp-2 text-[10px] text-emerald-800/75">{leadDraftSummary()}</p>
              </Show>
              <Show when={fieldEngineCue()}>
                <p class="mt-1 line-clamp-2 text-[10px] text-sky-900/72">{fieldEngineCue()}</p>
              </Show>
              <Show when={presentationState().distinctSelectionReason}>
                <p class="mt-1 line-clamp-2 text-[10px] text-emerald-800/75">{presentationState().distinctSelectionReason}</p>
              </Show>
              <For each={supportingDraftSummaryLines()}>
                {(line) => (
                  <p class="mt-1 line-clamp-1 text-[10px] text-on-surface-variant/65">
                    {line}
                  </p>
                )}
              </For>
              <Show
                when={
                  objectAnchorSummary() &&
                  objectAnchorSummary() !== leadDraftSummary() &&
                  !supportingDraftSummaryLines().includes(objectAnchorSummary()!)
                }
              >
                <p class="mt-1 line-clamp-1 text-[10px] text-on-surface-variant/65">
                  {objectAnchorSummary()}
                </p>
              </Show>
              <Show when={trustBlockState().showSharedTrustBlocks}>
                <div class="mt-1 space-y-1">
                  <TrustSummaryBlocks
                    consequencePreview={trustBlockState().consequencePreviewText}
                    provenanceCue={trustBlockState().provenanceCueText}
                    autonomySummary={trustBlockState().autonomySummaryText}
                    sourceSummary={trustBlockState().sourceSummaryText}
                  />
                </div>
              </Show>
              <Show
                when={
                  item.prepared_draft_available &&
                  item.prepared_draft_class &&
                  item.prepared_draft_class !== "communication_reply"
                }
              >
                <p class="mt-1 line-clamp-1 text-[10px] text-on-surface-variant/70">
                  {displacedDraftLabel()}
                </p>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}

function DecisionQueueTile(props: {
  queueState: DecisionOsQueueBootstrapState;
  queueCompanionState: DecisionOsQueueCompanionState;
  messages: NonNullable<DashboardBootstrap["messages"]>;
}) {
  const preparedDraftItems = () => props.queueCompanionState.preparedDraftItems;
  const proactiveSuggestions = () => props.queueCompanionState.proactiveSuggestions;
  const simulatorDecisionPreviewState = createMemo(() => {
    const item = proactiveSuggestions().find((entry) =>
      entry.kind === "simulator_approval_preview"
      || entry.kind === "simulator_conflict_fusion",
    );
    return {
      item,
      lane: decisionOsPreparedWorkSimulatorLaneState(item),
      card: decisionOsPreparedWorkSimulatorTileState(item),
    };
  });
  const fieldEngineFamily = () =>
    fieldEngineFamilyLabel(latestFieldEnginePrimaryTypeFromMessages(props.messages));
  const fieldEngineSummary = () => latestFieldEngineSummaryFromMessages(props.messages);
  const decisionSupportDrafts = () =>
    preparedDraftItems().filter((item) =>
      preparedDraftDestinationForItem(item) === "decision_queue",
    );
  const queueEntries = () => buildQueueEntries(props.queueState);
  const priorityEntry = () => queueEntries().find((entry) => entry.source === "priority") ?? null;
  const actionEntries = () => queueEntries().filter((entry) => entry.source === "action");
  const total = () => queueEntries().length;
  const queueSummaryLabel = () => {
    const simulatorLane = simulatorDecisionPreviewState().lane;
    return total() > 0
      ? `${total()} pending judgment item${total() === 1 ? "" : "s"}`
      : simulatorLane?.title ?? "No pending decisions";
  };
  const draftReadyLabel = () =>
    `${decisionSupportDrafts().length} prepared artifact${decisionSupportDrafts().length === 1 ? "" : "s"} ready`;
  return (
    <div class="flex flex-col gap-2">
      <p class="text-xs text-on-surface-variant">
        {queueSummaryLabel()}
      </p>
      <Show when={decisionSupportDrafts().length > 0}>
        <p class="text-[10px] font-medium text-indigo-700/80">
          {draftReadyLabel()}
        </p>
      </Show>
      <Show when={priorityEntry()}>
        {(entry) => {
          const decision = () => entry().decision;
          const card = () => entry().queuePriorityCard ?? null;
          const trustState = () => queueEntryTrustState(entry());
          const openLabel = () => `Open ${decisionQueueEntryDestinationLabel(entry())}`;
          const urgencyLabel = () =>
            (card()?.requires_approval
              ? "approval"
              : decisionQueueUrgencyStyle(decision().urgency).label.toLowerCase());
          const priorityReason = () =>
            trustState().priorityRationale ?? decision().context;
          const fieldEngineCue = () =>
            fieldEngineSummary() &&
            !priorityReason().toLowerCase().includes(fieldEngineSummary()!.toLowerCase())
              ? fieldEngineFamily()
                ? `${fieldEngineFamily()}: ${fieldEngineSummary()}`
                : fieldEngineSummary()
              : null;
          const objectSummary = () =>
            summarizeReferenceLabels({
              object_refs: card()?.object_refs,
              object_labels: card()?.object_labels,
              limit: 2,
              prefix: "Object anchors",
            });
          const consequencePreview = () => trustState().consequencePreview;
          const provenanceCue = () => trustState().provenanceCue;
          const sourceSummary = () => trustState().sourceSummary;
          const confidenceSummary = () => queueEntryConfidenceLabel(entry());

          return (
            <div class="rounded-xl border border-white/55 bg-white/55 px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-xs font-medium text-on-surface">{decision().title}</span>
                <span class="rounded-full border border-indigo-200/60 bg-indigo-50/80 px-2 py-0.5 text-[9px] uppercase tracking-wide text-indigo-700">
                  {urgencyLabel()}
                </span>
              </div>
              <div class="mt-1 text-[10px] text-on-surface-variant/70">
                {openLabel()}
              </div>
              <p class="mt-1 line-clamp-2 text-[10px] text-indigo-900/75">
                {priorityReason()}
              </p>
              <Show when={fieldEngineCue()}>
                <p class="mt-1 line-clamp-2 text-[10px] text-indigo-800/72">
                  {fieldEngineCue()}
                </p>
              </Show>
              <Show when={objectSummary()}>
                <p class="mt-1 line-clamp-1 text-[10px] text-indigo-800/70">
                  {objectSummary()}
                </p>
              </Show>
              <div class="mt-1 space-y-1">
                <TrustSummaryBlocks
                  consequencePreview={consequencePreview()}
                  provenanceCue={provenanceCue()}
                  sourceSummary={sourceSummary()}
                  confidence={confidenceSummary()}
                />
              </div>
            </div>
          );
        }}
      </Show>
      <For each={actionEntries().slice(0, 2)} fallback={
      <Show
        when={simulatorDecisionPreviewState().item}
        fallback={<p class="text-[11px] text-on-surface-variant/40 italic">Decision queue is clear</p>}
      >
        {(_preview) => {
            const previewState = simulatorDecisionPreviewState();
            const previewCard = previewState.card;
            const previewKind = previewCard?.kind ?? "approval";
            const previewTone = previewKind === "fusion"
              ? {
                  border: "border-violet-100/70",
                  bg: "bg-violet-50/45",
                  badge: "border-violet-200/60 bg-white/85 text-violet-700",
                  detail: "text-violet-900/75",
                }
              : {
                  border: "border-amber-100/70",
                  bg: "bg-amber-50/45",
                  badge: "border-amber-200/60 bg-white/85 text-amber-700",
                  detail: "text-amber-900/75",
                };
            return (
              <div class={`rounded-xl border px-3 py-2 ${previewTone.border} ${previewTone.bg}`}>
                <div class="flex items-center justify-between gap-2">
                  <span class="truncate text-xs font-medium text-on-surface">
                    {previewCard?.title}
                  </span>
                  <span class={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wide ${previewTone.badge}`}>
                    {simulatorPreviewBadgeLabel(previewKind)}
                  </span>
                </div>
                <p class={`mt-1 line-clamp-2 text-[10px] ${previewTone.detail}`}>
                  {previewCard?.detail ?? simulatorPreviewSummary(previewKind)}
                </p>
                <Show when={previewCard?.leadSummaryLine}>
                  {(line) => (
                    <p class="mt-1 line-clamp-2 text-[10px] text-on-surface-variant/65">
                      {line()}
                    </p>
                  )}
                </Show>
                <For each={previewCard?.supportingSummaryLines ?? []}>
                  {(line) => (
                    <p class="mt-1 line-clamp-2 text-[10px] text-on-surface-variant/65">
                      {line}
                    </p>
                  )}
                </For>
                <Show when={previewCard?.rolloutSummary}>
                  <p class="mt-1 line-clamp-2 text-[10px] text-on-surface-variant/65">
                    {previewCard!.rolloutSummary}
                  </p>
                </Show>
                <Show when={previewCard?.persistenceReason}>
                  <p class="mt-1 line-clamp-2 text-[10px] text-on-surface-variant/65">
                    {previewCard!.persistenceReason}
                  </p>
                </Show>
                <div class="mt-1 space-y-1">
                  <TrustSummaryBlocks
                    consequencePreview={previewCard?.consequencePreview ?? null}
                    provenanceCue={previewCard?.provenanceCue ?? null}
                    sourceSummary={previewCard?.sourceSummary ?? null}
                    autonomySummary={previewCard?.autonomySummary ?? null}
                    previewBoundarySummary={
                      previewState.item?.preview_only ? (previewCard?.previewBoundarySummary ?? null) : null
                    }
                  />
                </div>
              </div>
            );
          }}
        </Show>
      }>
        {(entry) => {
          const trustState = () => queueEntryTrustState(entry);
          const boundedReason = () => trustState().boundedReason;
          const suggestedActionText = () => trustState().suggestedActionText;
          const consequencePreview = () => trustState().consequencePreview;
          const provenanceCue = () => trustState().provenanceCue;
          const sourceSummary = () => trustState().sourceSummary;
          const confidenceSummary = () => queueEntryConfidenceLabel(entry);
          return (
            <div class="rounded-xl border border-white/55 bg-white/55 px-3 py-2">
              <div class="flex items-center justify-between gap-2">
                <span class="truncate text-xs font-medium text-on-surface">{entry.decision.title}</span>
                <span class="rounded-full border border-indigo-200/60 bg-indigo-50/80 px-2 py-0.5 text-[9px] uppercase tracking-wide text-indigo-700">
                  {entry.queueActionItem!.requires_approval ? "approval" : decisionQueueUrgencyStyle(entry.decision.urgency).label.toLowerCase()}
                </span>
              </div>
              <Show when={suggestedActionText()}>
                <div class="mt-1 text-[10px] text-on-surface-variant/70">{suggestedActionText()}</div>
              </Show>
              <Show when={boundedReason()}>
                {(reason) => (
                  <p class="mt-1 line-clamp-1 text-[10px] text-indigo-900/72">
                    {reason()}
                  </p>
                )}
              </Show>
              <div class="mt-1 space-y-1">
                <TrustSummaryBlocks
                  consequencePreview={consequencePreview()}
                  provenanceCue={provenanceCue()}
                  sourceSummary={sourceSummary()}
                  confidence={confidenceSummary()}
                />
              </div>
            </div>
          );
        }}
      </For>
      <For each={decisionSupportDrafts().slice(0, 2)}>
        {(item) => {
          const feedback = preparedDraftOutcomeFeedbackForItem(item, proactiveSuggestions());
          const feedbackLabel = () => outcomeFeedbackLabel(feedback);
          const sourceSummary = () => sourceCountSummary(item.source_refs) ?? "No sources";
          const presentationState = () => decisionOsPreparedDraftPresentationState(item);
          const confidenceSummary = () => item.confidence ? `${item.confidence} confidence` : null;
          return (
          <div class="rounded-xl border border-indigo-100/70 bg-indigo-50/45 px-3 py-2">
            <div class="flex items-center justify-between gap-2">
              <span class="truncate text-xs font-medium text-on-surface">{item.title}</span>
              <div class="flex items-center gap-1.5">
                <Show when={feedbackLabel()}>
                  <span class={`rounded-full border px-2 py-0.5 text-[9px] uppercase tracking-wide ${outcomeFeedbackTone(feedback)}`}>
                    {feedbackLabel()}
                  </span>
                </Show>
                <span class="rounded-full border border-indigo-200/60 bg-white/85 px-2 py-0.5 text-[9px] uppercase tracking-wide text-indigo-700">
                  {preparedDraftClassLabel(item.draft_class)}
                </span>
              </div>
            </div>
            <p class="mt-1 line-clamp-2 text-[10px] text-indigo-900/75">{item.summary}</p>
            <Show when={presentationState().boundedReason}>
              <p class="mt-1 line-clamp-2 text-[10px] text-indigo-900/72">
                {presentationState().boundedReason}
              </p>
            </Show>
            <Show when={presentationState().distinctSelectionReason}>
              <p class="mt-1 line-clamp-2 text-[10px] text-indigo-800/75">
                {presentationState().distinctSelectionReason}
              </p>
            </Show>
            <div class="mt-1 space-y-1">
              <TrustSummaryBlocks
                consequencePreview={presentationState().consequencePreview}
                provenanceCue={presentationState().provenanceCue}
                autonomySummary={presentationState().autonomySummary}
                confidence={confidenceSummary()}
                sourceSummary={sourceSummary()}
              />
            </div>
            <Show when={(item.comparison_rows?.length ?? 0) > 0}>
              <div class="mt-2 rounded-lg border border-indigo-100/70 bg-white/75 px-2 py-1.5">
                <For each={item.comparison_rows?.slice(0, 2) ?? []}>
                  {(row) => (
                    <div class="flex items-center justify-between gap-2 text-[10px] text-on-surface-variant/75">
                      <span class="truncate font-medium text-on-surface">{row.label}</span>
                      <span class="truncate">{row.values.slice(0, 2).join(COMPARISON_VALUE_SEPARATOR)}</span>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        )}}
      </For>
    </div>
  );
}

function money(value: number): string {
  return `$${value.toFixed(value >= 100 ? 0 : 2)}`;
}

function CostDashboardTile(props: { snapshot: DashboardBootstrap["cost_snapshot"] | null | undefined }) {
  const snapshot = createMemo(() => props.snapshot ?? null);
  const pct = createMemo(() => {
    const cap = snapshot()?.monthly_budget_usd ?? 0;
    if (cap <= 0) return 0;
    return Math.min(100, ((snapshot()?.recent_spend_usd_14d ?? 0) / cap) * 100);
  });
  const barTone = createMemo(() => {
    if (pct() >= 100) return "bg-rose-500";
    if (pct() >= ((snapshot()?.soft_limit_ratio ?? 0.8) * 100)) return "bg-amber-400";
    return "bg-emerald-500";
  });
  const marginTone = createMemo(() => {
    const margin = snapshot()?.estimated_monthly_margin_usd ?? 0;
    return margin >= 0 ? "text-emerald-700" : "text-rose-600";
  });

  return (
    <div class="flex h-full flex-col gap-3">
      <div class="rounded-xl border border-white/55 bg-white/55 px-3 py-2.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60">14-day burn</span>
          <span class="font-mono text-xs text-on-surface">{money(snapshot()?.recent_spend_usd_14d ?? 0)}</span>
        </div>
        <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/70">
          <div class={`h-full rounded-full transition-[width] duration-500 ${barTone()}`} style={{ width: `${pct()}%` }} />
        </div>
        <p class="mt-2 text-[11px] text-on-surface-variant/70">
          {snapshot() ? `${money(snapshot()!.monthly_budget_usd)} monthly cap` : "No budget cap configured yet"}
        </p>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <div class="rounded-xl border border-white/55 bg-white/55 px-3 py-2">
          <p class="text-[9px] uppercase tracking-[0.14em] text-on-surface-variant/55">Margin</p>
          <p class={`mt-1 text-sm font-semibold ${marginTone()}`}>{money(snapshot()?.estimated_monthly_margin_usd ?? 0)}</p>
          <p class="mt-1 text-[10px] text-on-surface-variant/65">{money(snapshot()?.cost_month_usd ?? 0)} this month</p>
        </div>
        <div class="rounded-xl border border-white/55 bg-white/55 px-3 py-2">
          <p class="text-[9px] uppercase tracking-[0.14em] text-on-surface-variant/55">Deep queries</p>
          <p class="mt-1 text-sm font-semibold text-on-surface">
            {(snapshot()?.deep_queries_today ?? 0).toLocaleString()}
          </p>
          <p class="mt-1 text-[10px] text-on-surface-variant/65">
            / {(snapshot()?.daily_deep_query_limit ?? 0).toLocaleString()} today
          </p>
        </div>
      </div>

      <div class="mt-auto rounded-xl border border-white/55 bg-white/55 px-3 py-2">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/60">Guardrails</span>
          <span class="text-[10px] text-on-surface-variant/65">
            {(snapshot()?.margin_guard_active ?? false) || (snapshot()?.usage_guard_active ?? false) ? "active" : "quiet"}
          </span>
        </div>
        <p class="mt-1 text-[11px] leading-5 text-on-surface-variant/70">
          {(snapshot()?.margin_guard_active ?? false) ? "Margin guard watching monthly burn." : "Margin guard idle."}{" "}
          {(snapshot()?.usage_guard_active ?? false) ? "Usage guard watching execution depth." : "Usage guard idle."}
        </p>
      </div>
    </div>
  );
}

function WorkflowsTile(props: { msgs: { type: string; content: unknown }[] }) {
  return (
    <div class="flex flex-col gap-1.5">
      <p class="text-xs text-on-surface-variant">
        {props.msgs.length > 0
          ? `${props.msgs.length} workflow event${props.msgs.length === 1 ? "" : "s"}`
          : "No active runs"}
      </p>
      <For each={props.msgs.slice(0, 2)} fallback={
        <p class="text-[11px] text-on-surface-variant/40 italic">Build your first blueprint →</p>
      }>
        {(m) => (
          <p class="line-clamp-1 rounded-lg border border-white/45 bg-white/45 px-2 py-1 text-xs text-on-surface">
            {m.type.replace(/_/g, " ")}
          </p>
        )}
      </For>
    </div>
  );
}

function CalendarTile() {
  const now = new Date();
  const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return (
    <div class="flex flex-col items-center gap-2">
      <div class="w-full rounded-xl border border-white/45 bg-white/50 p-3 text-center">
        <p class="text-[10px] uppercase tracking-widest text-outline/60">{DAYS[now.getDay()]}</p>
        <p class="text-4xl font-bold tracking-[-0.01em] text-on-surface leading-tight">{now.getDate()}</p>
        <p class="text-xs text-on-surface-variant">{MONTHS[now.getMonth()]} {now.getFullYear()}</p>
      </div>
    </div>
  );
}

function CalendarMiniMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Mock task/event dots — real impl would derive from messages prop
  const dotMap: Record<number, string> = {
    3: "bg-emerald-400", 7: "bg-blue-400", 12: "bg-amber-400",
    15: "bg-violet-400", 20: "bg-emerald-400", 25: "bg-amber-400",
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div class="flex flex-col gap-1">
      <div class="flex items-center justify-between mb-0.5">
        <p class="text-[9px] font-semibold uppercase tracking-wider text-on-surface">
          {MONTHS[month]} {year}
        </p>
        <div class="flex items-center gap-1">
          <span class="h-1.5 w-1.5 rounded-full bg-amber-400" title="Todo" />
          <span class="h-1.5 w-1.5 rounded-full bg-blue-400" title="In progress" />
          <span class="h-1.5 w-1.5 rounded-full bg-emerald-400" title="Done" />
          <span class="h-1.5 w-1.5 rounded-full bg-violet-400" title="Event" />
          <span class="h-1.5 w-1.5 rounded-full bg-red-300" title="Public holiday" />
        </div>
      </div>
      <div class="grid grid-cols-7 gap-0.5">
        {["S","M","T","W","T","F","S"].map((d) => (
          <p class="text-center font-mono text-[7px] text-outline/40 py-0.5">{d}</p>
        ))}
        <For each={cells}>
          {(day) => (
            <div class={`relative flex h-5 items-center justify-center rounded text-[9px] leading-none ${
              day === today
                ? "bg-primary text-white font-bold"
                : day
                  ? "text-on-surface hover:bg-on-surface/6 cursor-default"
                  : ""
            }`}>
              {day ?? ""}
              <Show when={day !== null && dotMap[day!]}>
                <span class={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full ${dotMap[day!]}`} />
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

function GenericTile(props: { msgs: { type: string; content: unknown }[] }) {
  return (
    <div class="flex flex-col gap-1.5">
      <For each={props.msgs.slice(0, 2)} fallback={
        <p class="text-[11px] text-on-surface-variant/40 italic">No content yet</p>
      }>
        {(m) => (
          <p class="line-clamp-2 rounded-lg border border-white/45 bg-white/45 px-2 py-1 text-xs text-on-surface">
            {msgText(m)}
          </p>
        )}
      </For>
    </div>
  );
}

function bentoScalarString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function TaskTile(props: { msgs: Pick<AfpMessage, "type" | "content">[] }) {
  const now = new Date();
  const taskMsgs = () => props.msgs.filter((m) => taskMessagePresentation(m, now).isPending);
  const overdue = () => props.msgs.filter((m) => taskMessagePresentation(m, now).isOverdue);
  return (
    <div class="flex flex-col gap-2">
      <div class="flex gap-2">
        <div class="flex-1 rounded-xl border border-white/45 bg-white/50 px-2 py-1.5 text-center">
          <p class="text-lg font-bold text-on-surface leading-none">{taskMsgs().length}</p>
          <p class="text-[9px] text-on-surface-variant/60 mt-0.5">pending</p>
        </div>
        <Show when={overdue().length > 0}>
          <div class="flex-1 rounded-xl border border-red-200/60 bg-red-50/60 px-2 py-1.5 text-center">
            <p class="text-lg font-bold text-red-600 leading-none">{overdue().length}</p>
            <p class="text-[9px] text-red-400/80 mt-0.5">overdue</p>
          </div>
        </Show>
      </div>
      <For each={taskMsgs().slice(0, 2)} fallback={
        <p class="text-[11px] text-on-surface-variant/40 italic">No pending tasks</p>
      }>
        {(m) => {
          const state = taskMessagePresentation(m, now);
          return (
            <div class="rounded-xl border border-white/45 bg-white/45 px-2 py-1.5">
              <p class="text-xs text-on-surface line-clamp-1">{state.titleText}</p>
              <Show when={state.dueDateValue}>
                <p class="text-[9px] text-on-surface-variant/60 mt-0.5">
                  Due {state.dueDateLabel}
                </p>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}

function CompactTile(props: { meta: { label: string; desc: string }; count: number }) {
  return (
    <div class="flex flex-col items-center justify-center h-full gap-1 py-4">
      <p class="text-3xl font-bold tracking-[-0.01em] text-on-surface leading-none">{props.count}</p>
      <p class="text-[10px] text-on-surface-variant/60 text-center">{props.meta.desc}</p>
    </div>
  );
}

function GraphTile(props: { msgs: { type: string; content: unknown }[] }) {
  const bars = createMemo(() => {
    const data = Array.from({ length: 7 }, (_, i) => props.msgs.filter((_, idx) => idx % 7 === i).length);
    const maxVal = Math.max(...data, 1);
    return data.map((v) => Math.max(Math.round((v / maxVal) * 100), 8));
  });
  return (
    <div class="flex h-full flex-col justify-end gap-1 pb-1">
      <div class="flex items-end gap-1" style={{ height: "56px" }}>
        <For each={bars()}>
          {(h) => <div class="flex-1 rounded-t bg-atelier-lime/50 transition-all" style={{ height: `${h}%` }} />}
        </For>
      </div>
      <div class="flex gap-1">
        <For each={["M", "T", "W", "T", "F", "S", "S"]}>
          {(d) => <p class="flex-1 text-center font-mono text-[7px] text-outline/40">{d}</p>}
        </For>
      </div>
    </div>
  );
}


function TileOptionsMenu(props: {
  config: TileConfig;
  onSetBg: (key: string | undefined) => void;
  onSetBgImage: (url: string | undefined) => void;
  onSetMode: (mode: "default" | "compact" | "graph") => void;
  onExpandToFullView: () => void;
  onCollapseToMinimum: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [bgImageInput, setBgImageInput] = createSignal(props.config.bgImage ?? "");
  let imgFileRef: HTMLInputElement | undefined;

  function handleImgFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (typeof result !== "string") return;
      props.onSetBgImage(result);
      props.onClose();
    };
    reader.readAsDataURL(file);
  }

  return (
    <div class="absolute right-0 top-6 z-50 min-w-[200px] animate-fade-in rounded-2xl border border-white/50 bg-white/96 p-2 shadow-panel backdrop-blur-xl">
      <p class="mb-1.5 px-2 font-mono text-[8px] uppercase tracking-widest text-outline/50">Color</p>
      <div class="mb-2 flex flex-wrap gap-1.5 px-2">
        <button
          type="button"
          onClick={() => { props.onSetBg(undefined); props.onClose(); }}
          class={`h-5 w-5 rounded-full border-2 bg-gradient-to-br from-gray-100 to-white ${!props.config.bgKey && !props.config.bgImage ? "border-primary" : "border-outline/20"}`}
          title="Default"
        />
        <For each={Object.entries(TILE_BG_DOT)}>
          {([key, cls]) => (
            <button
              type="button"
              onClick={() => { props.onSetBg(key); props.onClose(); }}
              class={`h-5 w-5 rounded-full border-2 ${cls} ${props.config.bgKey === key ? "border-primary" : "border-white/50 shadow-sm"}`}
              title={key}
            />
          )}
        </For>
      </div>
      <p class="mb-1 px-2 font-mono text-[8px] uppercase tracking-widest text-outline/50">Photo</p>
      <div class="mb-2 flex flex-col gap-1.5 px-2">
        <div class="flex gap-1.5">
          <input
            type="text"
            class="flex-1 min-w-0 rounded-xl border border-black/10 bg-white/70 px-2 py-1 text-[10px] text-on-surface placeholder-on-surface-variant/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            placeholder="Paste image URL…"
            value={bgImageInput()}
            onInput={(e) => setBgImageInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && bgImageInput().trim()) {
                recordShortcutUse("form_submit");
                props.onSetBgImage(bgImageInput().trim());
                props.onClose();
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                recordShortcutUse("form_cancel");
                props.onClose();
              }
            }}
          />
          <button
            type="button"
            onClick={() => imgFileRef?.click()}
            class="rounded-xl border border-black/10 bg-white/60 px-2 py-1 text-[10px] text-on-surface-variant transition hover:bg-white/90"
            title="Upload image"
          >Upload</button>
        </div>
        <div class="flex gap-1.5">
          <button
            type="button"
            disabled={!bgImageInput().trim()}
            onClick={() => { props.onSetBgImage(bgImageInput().trim()); props.onClose(); }}
            class="flex-1 rounded-xl bg-primary py-1 text-[10px] font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >Apply</button>
          <Show when={props.config.bgImage}>
            <button
              type="button"
              onClick={() => { props.onSetBgImage(undefined); props.onClose(); }}
              class="rounded-xl border border-red-200/60 bg-red-50/60 px-2 py-1 text-[10px] text-red-500 transition hover:bg-red-100"
            >✕ Remove</button>
          </Show>
        </div>
        <input ref={imgFileRef} type="file" accept="image/*" class="hidden" onChange={handleImgFile} />
      </div>
      <div class="mx-2 my-1 h-px bg-outline/10" />
      <p class="mb-1 mt-1.5 px-2 font-mono text-[8px] uppercase tracking-widest text-outline/50">Display</p>
      <For each={(["default", "compact", "graph"] as const)}>
        {(mode) => (
          <button
            type="button"
            onClick={() => { props.onSetMode(mode); props.onClose(); }}
            class={`flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs transition hover:bg-on-surface/5 ${
              (props.config.displayMode ?? "default") === mode ? "text-primary font-medium" : "text-on-surface"
            }`}
          >
            <span class="w-4 text-center opacity-60">
              {mode === "default" ? "✦" : mode === "compact" ? "≡" : "▦"}
            </span>
            {mode === "graph" && props.config.viewId === "calendar" ? "Month view" : mode.charAt(0).toUpperCase() + mode.slice(1)}
            {(props.config.displayMode ?? "default") === mode && <span class="ml-auto text-primary text-[9px]">✓</span>}
          </button>
        )}
      </For>
      <div class="mx-2 my-1 h-px bg-outline/10" />
      <button
        type="button"
        onClick={() => { props.onExpandToFullView(); props.onClose(); }}
        class="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs text-on-surface transition hover:bg-on-surface/5"
      >
        <span class="w-4 text-center opacity-60">+</span> Expand to full view
      </button>
      <button
        type="button"
        onClick={() => { props.onCollapseToMinimum(); props.onClose(); }}
        class="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs text-on-surface transition hover:bg-on-surface/5"
      >
        <span class="w-4 text-center opacity-60">-</span> Collapse to minimum
      </button>
      <button
        type="button"
        onClick={() => { props.onDuplicate(); props.onClose(); }}
        class="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs text-on-surface transition hover:bg-on-surface/5"
      >
        <span class="w-4 text-center opacity-60">+</span> Duplicate tile
      </button>
      <div class="mx-2 my-1 h-px bg-outline/10" />
      <button
        type="button"
        onClick={() => { props.onRemove(); props.onClose(); }}
        class="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-xs text-red-500 transition hover:bg-red-50/80"
      >
        <span class="w-4 text-center">x</span> Remove tile
      </button>
    </div>
  );
}

function BentoTile(props: {
  config: TileConfig;
  gridWidth: number;
  gridSpec: GridSpec;
  maxColSpan: number;
  maxRowSpan: number;
  bootstrap: DashboardBootstrap | null;
  isDragging: boolean;
  isDropTarget: boolean;
  isActive: boolean;
  isMaximized: boolean;
  isHiddenByMaximize: boolean;
  menuOpen: boolean;
  quickAddOpen: boolean;
  onOpen: () => void;
  onActivate: () => void;
  onRemove: () => void;
  onResize: (colSpan: number, rowSpan: number) => void;
  onSetBg: (key: string | undefined) => void;
  onSetBgImage: (url: string | undefined) => void;
  onSetMode: (mode: "default" | "compact" | "graph") => void;
  onDragStart: () => void;
  onMenuToggle: (pos: { top: number; right: number }) => void;
  onContextMenuOpen: (pos: { top: number; right: number }) => void;
  onQuickAddToggle: (pos: { top: number; buttonRight: number }) => void;
  onEnabledChange: (enabled: boolean) => void;
  ref: (el: HTMLDivElement) => void;
}) {
  const [isResizing, setIsResizing] = createSignal(false);
  const meta = () => TILE_META[props.config.viewId] ?? { label: props.config.viewId, desc: "" };
  const bgClass = () =>
    props.config.bgKey
      ? (TILE_BG[props.config.bgKey] ?? ACCENT[props.config.viewId] ?? "from-gray-50/80 to-white/60 border-gray-200/40")
      : (ACCENT[props.config.viewId] ?? "from-gray-50/80 to-white/60 border-gray-200/40");

  const bgImageStyle = () => {
    const imageUrl = tileThumbnailUrl(props.config.bgImage);
    return imageUrl
      ? { "background-image": `url(${imageUrl})`, "background-size": "cover", "background-position": "center" }
      : {};
  };

  const msgs = createMemo(() => {
    const id = props.config.viewId;
    const all = dashboardBootstrapMessages(props.bootstrap);
    if (id === "search") return all;
    if (id === "email")  return all.filter((m) => m.type.includes("email"));
    if (id === "workflows") return all.filter((m) =>
      m.type.includes("workflow") || m.type.includes("blueprint") || m.type.includes("run")
    );
    if (id === "note") return all.filter((m) => m.type.includes("note"));
    if (id === "threads") return all.filter((m) => m.type.includes("thread"));
    if (id === "tasks") return all.filter((m) =>
      m.type === "task" || afpRecord(m.content).kind === "task"
    );
    return all.filter((m) => m.type.includes(id));
  });
  const queueState = createMemo(() => decisionOsQueueBootstrapState(props.bootstrap));
  const queueCompanionState = createMemo(() => decisionOsQueueCompanionState(props.bootstrap));

  const minH = () => resolveTileMinHeight(props.config, props.gridSpec);

    function startResize(axis: "col" | "row", e: PointerEvent) {
      e.stopPropagation();
      setIsResizing(true);
      const startPx = axis === "col" ? e.clientX : e.clientY;
    const startSpan = axis === "col" ? props.config.colSpan : props.config.rowSpan;
    const step = axis === "col"
      ? gridColumnStepPx(props.gridWidth, props.gridSpec)
      : gridRowStepPx(props.gridSpec);
    const max = axis === "col" ? props.maxColSpan : props.maxRowSpan;
    let lastSpan: number = startSpan;
    function onMove(ev: PointerEvent) {
      const delta = Math.round(((axis === "col" ? ev.clientX : ev.clientY) - startPx) / step);
      const raw = Math.max(1, Math.min(max, startSpan + delta));
      if (raw !== lastSpan) {
        lastSpan = raw;
        if (axis === "col") props.onResize(raw, props.config.rowSpan);
        else props.onResize(props.config.colSpan, raw);
      }
    }
    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setIsResizing(false);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return (
    <div
      ref={props.ref}
      class={`group/tile relative flex flex-col overflow-hidden rounded-[22px] border bg-gradient-to-br transition-[transform,box-shadow,opacity,min-height,filter] duration-200 ease-out will-change-[transform,min-height] ${bgClass()} ${
        props.isDropTarget
          ? "ring-2 ring-primary/40 shadow-lg scale-[1.01]"
          : props.isActive
            ? "ring-2 ring-primary/25 shadow-md"
            : "shadow-card hover:shadow-md"
      } ${props.isDragging ? "opacity-30 scale-95" : ""} ${isResizing() ? "ring-1 ring-primary/25 shadow-lg scale-[1.01] saturate-[1.03]" : ""} ${
        props.isMaximized ? "shadow-xl" : ""
      } ${props.isHiddenByMaximize ? "hidden" : ""}`}
      tabindex="0"
      style={{
        "grid-column": `span ${props.isMaximized ? props.gridSpec.columns : props.config.colSpan}`,
        "grid-row": `span ${props.config.rowSpan}`,
        "min-height": props.isMaximized ? "min(78vh, 960px)" : minH(),
        ...bgImageStyle(),
      }}
      onFocus={() => props.onActivate()}
      onPointerDown={() => props.onActivate()}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        props.onActivate();
        props.onContextMenuOpen({
          top: e.clientY,
          right: Math.max(16, window.innerWidth - e.clientX),
        });
      }}
    >
      {/* Drag handle header — icon+label is a click-to-open button; rest of row is the drag grip */}
      <div
        class="flex cursor-grab items-center gap-2 px-4 pt-4 pb-2 select-none active:cursor-grabbing"
        onPointerDown={() => props.onDragStart()}
      >
        {/* Icon + label: single click opens the view, stops drag propagation */}
        <button
          type="button"
          class="flex items-center gap-2 min-w-0 flex-1 outline-none text-left"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); props.onOpen(); }}
          title={`Go to ${meta().label}`}
        >
          <span class="text-on-surface/60 flex-shrink-0">
            <RailIcon id={props.config.viewId} />
          </span>
          <p class="text-xs font-semibold text-on-surface truncate hover:underline hover:text-primary transition-colors">
            {meta().label}
          </p>
        </button>

        {/* Controls group — visible on hover OR when menu is open */}
        <div class={`flex items-center gap-0.5 transition flex-shrink-0 ${props.menuOpen ? "opacity-100" : "opacity-0 group-hover/tile:opacity-100"}`}>
          {/* Tile settings (gear) */}
          <div onPointerDown={(e) => e.stopPropagation()}>
            <TileSettingsButton tileId={props.config.id} onEnabledChange={props.onEnabledChange} />
          </div>
          {/* Three-dot menu — position passed up so BentoGrid can portal the menu */}
          <div class="relative">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                props.onMenuToggle({ top: rect.bottom, right: window.innerWidth - rect.right });
              }}
              class="flex h-5 w-5 items-center justify-center rounded-full text-[12px] leading-none text-outline/40 hover:bg-on-surface/8 hover:text-on-surface"
              aria-label="Tile options"
            >
              ...
            </button>
          </div>
        </div>
      </div>

      {/* Tile content */}
      <div class="flex-1 overflow-hidden px-4 py-1">
        <Show when={(props.config.displayMode ?? "default") === "compact"}>
          <CompactTile meta={meta()} count={msgs().length} />
        </Show>
        <Show when={(props.config.displayMode ?? "default") === "graph"}>
          <Switch>
            <Match when={props.config.viewId === "calendar"}>
              <CalendarMiniMonth />
            </Match>
            <Match when={true}>
              <GraphTile msgs={msgs()} />
            </Match>
          </Switch>
        </Show>
        <Show when={!props.config.displayMode || props.config.displayMode === "default"}>
          <Switch>
            <Match when={props.config.viewId === "search"}>
              <ChatTile msgs={msgs()} />
            </Match>
            <Match when={props.config.viewId === "email"}>
              <EmailTile msgs={msgs()} />
            </Match>
            <Match when={props.config.viewId === "decision_queue"}>
              <DecisionQueueTile
                queueState={queueState()}
                queueCompanionState={queueCompanionState()}
                messages={dashboardBootstrapMessages(props.bootstrap)}
              />
            </Match>
            <Match when={props.config.viewId === "response_queue"}>
              <ResponseQueueTile
                queueCompanionState={queueCompanionState()}
                messages={dashboardBootstrapMessages(props.bootstrap)}
              />
            </Match>
            <Match when={props.config.viewId === "cost_dashboard"}>
              <CostDashboardTile snapshot={dashboardBootstrapCostSnapshot(props.bootstrap)} />
            </Match>
            <Match when={props.config.viewId === "workflows"}>
              <WorkflowsTile msgs={msgs()} />
            </Match>
            <Match when={props.config.viewId === "calendar"}>
              <CalendarTile />
            </Match>
            <Match when={props.config.viewId === "tasks"}>
              <TaskTile msgs={msgs()} />
            </Match>
            <Match when={props.config.viewId === "a2ui_card"}>
              <A2UICard />
            </Match>
            <Match when={true}>
              <GenericTile msgs={msgs()} />
            </Match>
          </Switch>
        </Show>
      </div>

      {/* Right edge resize handle */}
      <div
        class="absolute right-0 top-8 bottom-8 w-3 cursor-col-resize select-none opacity-0 group-hover/tile:opacity-100 transition-opacity flex items-center justify-center z-10"
        onPointerDown={(e) => startResize("col", e)}
        title="Drag to resize width"
      >
        <div class="h-8 w-[3px] rounded-full bg-outline/25" />
      </div>

      {/* Bottom edge resize handle */}
      <div
        class="absolute bottom-0 left-8 right-8 h-3 cursor-row-resize select-none opacity-0 group-hover/tile:opacity-100 transition-opacity flex items-center justify-center z-10"
        onPointerDown={(e) => startResize("row", e)}
        title="Drag to resize height"
      >
        <div class="w-8 h-[3px] rounded-full bg-outline/25" />
      </div>

      {/* Quick-add + button — bottom-right, shown on hover for every tile */}
      <div class="absolute bottom-10 right-3 opacity-0 group-hover/tile:opacity-100 transition-opacity z-20">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            props.onQuickAddToggle({ top: rect.top, buttonRight: rect.right });
          }}
          class="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-primary text-sm font-light shadow-sm transition hover:bg-primary/30"
          aria-label="Add content"
          title="Add content"
        >
          +
        </button>
      </div>
    </div>
  );
}

function WidgetTray(props: {
  activeTiles: TileConfig[];
  onAdd: (viewId: ViewName) => void;
  onClose: () => void;
  onResetLayout: () => void;
}) {
  const available = createMemo(() =>
    TILE_VIEW_IDS.filter(
      (v) => v !== "a2ui_card" && !props.activeTiles.some((t) => t.viewId === v)
    )
  );

  return (
    <>
      <div class="fixed inset-0 z-30" onClick={props.onClose} />
      <div class="absolute right-0 top-full z-50 mt-2 min-w-[210px] animate-fade-in rounded-2xl border border-white/45 bg-white/96 p-3 shadow-panel backdrop-blur-xl">
        <p class="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Add tile</p>
        <Show when={available().length === 0}>
          <p class="text-xs text-on-surface-variant/60">All views already pinned</p>
        </Show>
        <For each={available()}>
          {(viewId) => {
            const meta = TILE_META[viewId] ?? { label: viewId, desc: "" };
            return (
              <button
                type="button"
                onClick={() => { props.onAdd(viewId); props.onClose(); }}
                class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-xs transition hover:bg-on-surface/6"
              >
                <span class="text-outline/70 flex-shrink-0">
                  <RailIcon id={viewId} />
                </span>
                <div>
                  <p class="font-medium text-on-surface">{meta.label}</p>
                  <p class="text-[10px] text-on-surface-variant/60">{meta.desc}</p>
                </div>
              </button>
            );
          }}
        </For>
        {/* Custom cards section — always addable (multiple allowed) */}
        <div class="mx-1 mt-2 border-t border-outline/10 pt-2">
          <p class="mb-1.5 px-1 font-mono text-[8px] uppercase tracking-[0.18em] text-outline/50">Custom</p>
          <button
            type="button"
            onClick={() => { props.onAdd("a2ui_card"); props.onClose(); }}
            class="flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left text-xs transition hover:bg-primary/5"
          >
            <span class="flex-shrink-0 text-primary/70 text-sm">✦</span>
            <div>
              <p class="font-medium text-on-surface">Custom Card</p>
              <p class="text-[10px] text-on-surface-variant/60">Ask agent or attach a file</p>
            </div>
          </button>
        </div>
        <div class="mx-1 mt-1 border-t border-outline/10 pt-2">
          <button
            type="button"
            onClick={() => { props.onResetLayout(); props.onClose(); }}
            class="w-full rounded-xl px-2 py-1.5 text-left text-[10px] text-outline/60 transition hover:bg-red-50 hover:text-red-400"
          >
            ↺ Reset to default layout
          </button>
        </div>
      </div>
    </>
  );
}

export function BentoGrid(props: {
  bootstrap: DashboardBootstrap | null;
  signedIn?: boolean;
  onOpenView: (view: ViewName) => void;
  onRequestSearchFocus?: () => void;
  onRequestWorkspaceAssistDraftRefresh?: (input: WorkspaceAssistDraftRefreshInput) => void;
  workspaceAssistRefreshOrigin?: (surfaceKey: string) => WorkspaceAssistRefreshOrigin;
}) {
  const queueState = createMemo(() => decisionOsQueueBootstrapState(props.bootstrap));
  const queueCompanionState = createMemo(() => decisionOsQueueCompanionState(props.bootstrap));
  const initialLayout = loadBentoGridLayoutState(DEFAULT_TILES);
  const [tiles, setTiles] = createSignal<TileConfig[]>(initialLayout.tiles);
  const [hasSavedLayout, setHasSavedLayout] = createSignal(initialLayout.hasSavedLayout);
  const [activeTileId, setActiveTileId] = createSignal<string | null>(initialLayout.tiles[0]?.id ?? null);
  const [maximizedTileId, setMaximizedTileId] = createSignal<string | null>(null);
  const [draggingId, setDraggingId] = createSignal<string | null>(null);
  const [dropTargetId, setDropTargetId] = createSignal<string | null>(null);
  const [showTray, setShowTray] = createSignal(false);
  const [openMenuId, setOpenMenuId] = createSignal<string | null>(null);
  const [menuPos, setMenuPos] = createSignal<{ top: number; right: number } | null>(null);
  const [openQuickAddId, setOpenQuickAddId] = createSignal<string | null>(null);
  const [quickAddPos, setQuickAddPos] = createSignal<{ top: number; buttonRight: number } | null>(null);
  const [quickAddViewId, setQuickAddViewId] = createSignal<ViewName | null>(null);
  const [showComposeLauncher, setShowComposeLauncher] = createSignal(false);
  const [globalQuickAddViewId, setGlobalQuickAddViewId] = createSignal<ViewName | null>(null);
  const [undoRemovedTile, setUndoRemovedTile] = createSignal<TileConfig | null>(null);
  let undoRemoveTimer: ReturnType<typeof setTimeout> | undefined;

  // Tiles hidden via the gear-icon "Show tile" toggle (not removed, just hidden)
  const [hiddenTileIds, setHiddenTileIds] = createSignal<Set<string>>(
    loadHiddenBentoTileIds(tiles().map((tile) => tile.id))
  );
  const [undoHiddenTile, setUndoHiddenTile] = createSignal<TileConfig | null>(null);
  let undoHideTimer: ReturnType<typeof setTimeout> | undefined;

  const [updateAvailable, setUpdateAvailable] = createSignal(false);
  const [gridWidth, setGridWidth] = createSignal(
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  let gridRef: HTMLDivElement | undefined;
  let quickAddPanelRef: HTMLDivElement | undefined;
  let globalQuickAddPanelRef: HTMLDivElement | undefined;
  let composeLauncherRef: HTMLDivElement | undefined;
  let overlayReturnFocusEl: HTMLElement | null = null;

  onMount(() => {
    let knownSignature: string | null = null;
    async function checkForUpdate() {
      try {
        const sig = await fetchWorkspaceBundleSignature();
        if (!sig) return;
        if (knownSignature === null) { knownSignature = sig; return; }
        if (sig !== knownSignature) setUpdateAvailable(true);
      } catch { /* network errors are silently ignored */ }
    }
    void checkForUpdate();
    const id = setInterval(() => void checkForUpdate(), 30 * 60 * 1_000);
    onCleanup(() => clearInterval(id));
  });

  onMount(() => {
    let frameId = 0;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? gridRef?.clientWidth ?? window.innerWidth;
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => setGridWidth(width));
    });
    if (gridRef) observer.observe(gridRef);
    onCleanup(() => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
    });
  });

  onMount(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (showComposeLauncher()) {
          event.preventDefault();
          clearGlobalComposeState();
          return;
        }
        if (globalQuickAddViewId()) {
          event.preventDefault();
          clearGlobalComposeState();
          return;
        }
        if (openQuickAddId()) {
          event.preventDefault();
          clearQuickAddState();
          return;
        }
        if (!maximizedTileId()) return;
        event.preventDefault();
        setMaximizedTileId(null);
        return;
      }

      if (targetIsTypingSurface(event.target)) return;

      const isPrimaryModifier = event.ctrlKey || event.metaKey;
      if (!isPrimaryModifier || event.altKey) return;

      if (event.shiftKey) {
        const digit = Number.parseInt(event.key, 10);
        if (Number.isInteger(digit) && digit >= 1 && digit <= 8) {
          const packed = gridRenderState().packedTiles[digit - 1];
          if (!packed) return;
          event.preventDefault();
          recordShortcutUse("tile_maximize");
          toggleMaximizedTileById(packed.tile.id);
          return;
        }
        return;
      }

      if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        recordShortcutUse("compose_launcher");
        setShowComposeLauncher(true);
        setGlobalQuickAddViewId(null);
        clearMenuState();
        clearQuickAddState();
        return;
      }

      if (event.key.toLowerCase() !== "d") return;
      const tileId = activeTileId();
      if (!tileId || !tileById().has(tileId)) return;
      event.preventDefault();
      recordShortcutUse("tile_duplicate");
      duplicateTile(tileId);
    }
    window.addEventListener("keydown", onKeyDown);
    onCleanup(() => window.removeEventListener("keydown", onKeyDown));
  });

  onCleanup(() => {
    clearTimeout(undoRemoveTimer);
    clearTimeout(undoHideTimer);
  });

  const gridSpec = createMemo(() => resolveGridSpec(gridWidth()));
  const tileById = createMemo(() => new Map(tiles().map((tile) => [tile.id, tile] as const)));
  const gridRenderState = createMemo(() => {
    const spec = gridSpec();
    return {
      packedTiles: packTiles(tiles(), hiddenTileIds(), spec),
      gridStyle: {
        "grid-template-columns": `repeat(${spec.columns}, minmax(0, 1fr))`,
        "grid-auto-flow": "dense",
        "grid-auto-rows": `${spec.rowHeightPx}px`,
        gap: `${spec.gapPx}px`,
      },
      ghostDropZoneStyle: {
        "grid-column": "span 1",
        "min-height": ghostTileMinHeight(spec),
      },
    };
  });
  const workspaceUiState = createMemo(() => ({
    activeTileId: activeTileId(),
    maximizedTileId: maximizedTileId(),
    draggingTileId: draggingId(),
    dropTargetTileId: dropTargetId(),
    openMenuTileId: openMenuId(),
    openMenuPosition: menuPos(),
    openQuickAddTileId: openQuickAddId(),
    openQuickAddPosition: quickAddPos(),
    openQuickAddViewId: quickAddViewId(),
    isTrayOpen: showTray(),
    removedTile: undoRemovedTile(),
    hiddenTile: undoHiddenTile(),
    hasUpdateAvailable: updateAvailable(),
  }));
  const tileRefs = new Map<string, HTMLDivElement>();

  function targetIsTypingSurface(node: EventTarget | null): boolean {
    return node instanceof HTMLElement
      && Boolean(node.closest("input, textarea, select, [contenteditable='true'], .ProseMirror, .cm-editor"));
  }

  function toggleMaximizedTileById(tileId: string) {
    setMaximizedTileId((current) => (current === tileId ? null : tileId));
    requestAnimationFrame(() => tileRefs.get(tileId)?.focus());
  }

  function commitTiles(update: (tiles: TileConfig[]) => TileConfig[]): void {
    setTiles((prev) => {
      const next = update(prev);
      saveBentoGridLayout(next);
      return next;
    });
  }

  function updateTileById(tileId: string, update: (tile: TileConfig) => TileConfig): void {
    commitTiles((tiles) => tiles.map((tile) => tile.id === tileId ? update(tile) : tile));
  }

  function clearMenuState(): void {
    setOpenMenuId(null);
    setMenuPos(null);
  }

  function clearQuickAddState(options?: { restoreFocus?: boolean }): void {
    setOpenQuickAddId(null);
    setQuickAddPos(null);
    setQuickAddViewId(null);
    if (options?.restoreFocus === false) return;
    queueMicrotask(() => {
      overlayReturnFocusEl?.focus();
      overlayReturnFocusEl = null;
    });
  }

  function clearGlobalComposeState(options?: { restoreFocus?: boolean }): void {
    setShowComposeLauncher(false);
    setGlobalQuickAddViewId(null);
    if (options?.restoreFocus === false) return;
    queueMicrotask(() => {
      overlayReturnFocusEl?.focus();
      overlayReturnFocusEl = null;
    });
  }

  function rememberOverlayReturnFocus(): void {
    const active = document.activeElement;
    overlayReturnFocusEl = active instanceof HTMLElement ? active : null;
  }

  function focusFirstInteractiveElement(container: HTMLDivElement | undefined): void {
    const target = container?.querySelector<HTMLElement>(
      "input, textarea, select, button, [contenteditable='true'], .ProseMirror",
    );
    target?.focus();
  }

  function setTileHiddenState(tileId: string, hidden: boolean): void {
    setHiddenTileIds((prev) => {
      const next = new Set(prev);
      if (hidden) next.add(tileId);
      else next.delete(tileId);
      return next;
    });
  }

  function moveTileToEnd(tiles: TileConfig[], tileId: string): TileConfig[] {
    const next = [...tiles];
    const fromIndex = next.findIndex((tile) => tile.id === tileId);
    if (fromIndex === -1) return tiles;
    const [tile] = next.splice(fromIndex, 1);
    next.push(tile);
    return next;
  }

  function swapTilesById(tiles: TileConfig[], leftTileId: string, rightTileId: string): TileConfig[] {
    const next = [...tiles];
    const leftIndex = next.findIndex((tile) => tile.id === leftTileId);
    const rightIndex = next.findIndex((tile) => tile.id === rightTileId);
    if (leftIndex === -1 || rightIndex === -1) return tiles;
    [next[leftIndex], next[rightIndex]] = [next[rightIndex], next[leftIndex]];
    return next;
  }

  function applySeededLayout(): void {
    const seeded = buildSeedTiles({
      bootstrap: props.bootstrap,
      queueState: queueState(),
      queueCompanionState: queueCompanionState(),
    });
    setTiles(seeded);
    saveBentoGridLayout(seeded);
    setHasSavedLayout(true);
  }

  createEffect(() => {
    const bootstrap = props.bootstrap;
    if (hasSavedLayout()) return;
    if (!bootstrap) return;
    applySeededLayout();
  });

  function startDrag(tileId: string) {
    setDraggingId(tileId);
    let rafId = 0;

    function stopDragListeners() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }

    function onMove(e: PointerEvent) {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        let hit: string | null = null;
        for (const [id, el] of tileRefs) {
          const r = el.getBoundingClientRect();
          if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
            hit = id;
            break;
          }
        }
        setDropTargetId(hit);
      });
    }

    function onUp() {
      cancelAnimationFrame(rafId);
      const to = dropTargetId();
      if (to === "__ghost__") {
        commitTiles((prev) => moveTileToEnd(prev, tileId));
      } else if (to && to !== tileId) {
        commitTiles((prev) => swapTilesById(prev, tileId, to));
      }
      setDraggingId(null);
      setDropTargetId(null);
      stopDragListeners();
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    onCleanup(() => {
      cancelAnimationFrame(rafId);
      stopDragListeners();
    });
  }

  function addTile(viewId: ViewName) {
    const id = `t-${viewId}-${Date.now()}`;
    const layout = defaultTileConfig(viewId);
    saveBentoTileEnabled(id, true);
    commitTiles((prev) => [...prev, { id, viewId, ...layout } as TileConfig]);
  }

  function removeTile(tileId: string) {
    const removed = tileById().get(tileId) ?? null;
    commitTiles((prev) => prev.filter((t) => t.id !== tileId));
    setTileHiddenState(tileId, false);
    if (undoHiddenTile()?.id === tileId) {
      clearTimeout(undoHideTimer);
      setUndoHiddenTile(null);
    }
    if (removed) {
      clearTimeout(undoRemoveTimer);
      setUndoRemovedTile(removed);
      undoRemoveTimer = setTimeout(() => setUndoRemovedTile(null), 5000);
    }
  }

  function undoRemoveTile() {
    clearTimeout(undoRemoveTimer);
    const tile = undoRemovedTile();
    if (!tile) return;
    saveBentoTileEnabled(tile.id, true);
    commitTiles((prev) => prev.some((entry) => entry.id === tile.id) ? prev : [...prev, tile]);
    setUndoRemovedTile(null);
  }

  function resetLayout() {
    clearBentoGridLayout();
    for (const tile of tiles()) {
      clearBentoTileEnabled(tile.id);
    }
    clearTimeout(undoRemoveTimer);
    clearTimeout(undoHideTimer);
    setUndoRemovedTile(null);
    setUndoHiddenTile(null);
    setHiddenTileIds(new Set<string>());
    applySeededLayout();
  }

  function handleTileEnabledChange(tileId: string, enabled: boolean) {
    if (!enabled) {
      const tile = tileById().get(tileId) ?? null;
      saveBentoTileEnabled(tileId, false);
      setTileHiddenState(tileId, true);
      clearTimeout(undoHideTimer);
      setUndoHiddenTile(tile);
      undoHideTimer = setTimeout(() => setUndoHiddenTile(null), 5000);
    } else {
      saveBentoTileEnabled(tileId, true);
      setTileHiddenState(tileId, false);
      if (undoHiddenTile()?.id === tileId) {
        clearTimeout(undoHideTimer);
        setUndoHiddenTile(null);
      }
    }
  }

  function undoHideTile() {
    const tile = undoHiddenTile();
    if (!tile) return;
    clearTimeout(undoHideTimer);
    saveBentoTileEnabled(tile.id, true);
    setTileHiddenState(tile.id, false);
    setUndoHiddenTile(null);
  }

  function resizeTile(tileId: string, colSpan: number, rowSpan: number) {
    const spec = gridSpec();
    updateTileById(tileId, (tile) => {
      const policy = tileLayoutPolicy(tile.viewId);
      return {
        ...tile,
        colSpan: clampSpan(colSpan, policy.minColSpan, maxRenderableColSpan(policy, spec)),
        rowSpan: clampSpan(rowSpan, policy.minRowSpan, policy.maxRowSpan),
      };
    });
  }

  createEffect(() => {
    const removed = undoRemovedTile();
    if (removed && tileById().has(removed.id)) {
      clearTimeout(undoRemoveTimer);
      setUndoRemovedTile(null);
    }
    const hiddenTile = undoHiddenTile();
    if (hiddenTile && (!tileById().has(hiddenTile.id) || !hiddenTileIds().has(hiddenTile.id))) {
      clearTimeout(undoHideTimer);
      setUndoHiddenTile(null);
    }
  });

  createEffect(() => {
    const tilesNow = tiles();
    const active = activeTileId();
    const maximized = maximizedTileId();
    if (tilesNow.length === 0) {
      if (active !== null) setActiveTileId(null);
      if (maximized !== null) setMaximizedTileId(null);
      return;
    }
    if (!active || !tilesNow.some((tile) => tile.id === active)) {
      setActiveTileId(tilesNow[0]?.id ?? null);
    }
    if (maximized && !tilesNow.some((tile) => tile.id === maximized)) {
      setMaximizedTileId(null);
    }
  });

  function setBgTile(tileId: string, bgKey: string | undefined) {
    updateTileById(tileId, (tile) => ({ ...tile, bgKey }));
  }

  function setBgImageTile(tileId: string, bgImage: string | undefined) {
    updateTileById(tileId, (tile) => ({ ...tile, bgImage }));
  }

  function setModeTile(tileId: string, displayMode: "default" | "compact" | "graph") {
    updateTileById(tileId, (tile) => ({ ...tile, displayMode }));
  }

  function expandTileToFullView(tileId: string) {
    const spec = gridSpec();
    updateTileById(tileId, (tile) => {
      const policy = tileLayoutPolicy(tile.viewId);
      return {
        ...tile,
        displayMode: "default",
        colSpan: maxRenderableColSpan(policy, spec),
        rowSpan: policy.maxRowSpan,
      };
    });
  }

  function collapseTileToMinimum(tileId: string) {
    updateTileById(tileId, (tile) => {
      const policy = tileLayoutPolicy(tile.viewId);
      return {
        ...tile,
        displayMode: "compact",
        colSpan: policy.minColSpan,
        rowSpan: policy.minRowSpan,
      };
    });
  }

  function duplicateTile(tileId: string) {
    const tile = tileById().get(tileId);
    if (!tile) return;
    const duplicate: TileConfig = {
      ...tile,
      id: `t-${tile.viewId}-${Date.now()}`,
    };
    saveBentoTileEnabled(duplicate.id, true);
    commitTiles((prev) => {
      const index = prev.findIndex((entry) => entry.id === tileId);
      if (index === -1) return [...prev, duplicate];
      const next = [...prev];
      next.splice(index + 1, 0, duplicate);
      return next;
    });
    setActiveTileId(duplicate.id);
    requestAnimationFrame(() => tileRefs.get(duplicate.id)?.focus());
  }

  function closeAll() {
    clearMenuState();
    clearQuickAddState();
    clearGlobalComposeState();
  }

  function openQuickAdd(tileId: string, pos: { top: number; buttonRight: number }) {
    if (openQuickAddId() === tileId) { closeAll(); return; }
    const tile = tileById().get(tileId);
    rememberOverlayReturnFocus();
    setOpenQuickAddId(tileId);
    setQuickAddPos(pos);
    setQuickAddViewId(tile?.viewId ?? null);
    clearGlobalComposeState({ restoreFocus: false });
    clearMenuState();
  }

  function openGlobalQuickAdd(viewId: ViewName) {
    rememberOverlayReturnFocus();
    setGlobalQuickAddViewId(viewId);
    setShowComposeLauncher(false);
    clearQuickAddState({ restoreFocus: false });
    clearMenuState();
  }

  function handleComposeSelection(action: "ask_agent" | ViewName) {
    if (action === "ask_agent") {
      recordShortcutUse("search_focus");
      closeAll();
      props.onRequestSearchFocus?.();
      return;
    }
    recordShortcutUse(`compose:${action}`);
    openGlobalQuickAdd(action);
  }

  createEffect(() => {
    if (!showComposeLauncher()) return;
    queueMicrotask(() => focusFirstInteractiveElement(composeLauncherRef));
  });

  createEffect(() => {
    if (globalQuickAddViewId() === null) return;
    queueMicrotask(() => focusFirstInteractiveElement(globalQuickAddPanelRef));
  });

  createEffect(() => {
    if (openQuickAddId() === null) return;
    queueMicrotask(() => focusFirstInteractiveElement(quickAddPanelRef));
  });

  function toggleTileMenu(tileId: string, pos: { top: number; right: number }) {
    if (openMenuId() === tileId) {
      clearMenuState();
      return;
    }
    setOpenMenuId(tileId);
    setMenuPos(pos);
  }

  function renderPackedTile(packed: PackedTile) {
    const tileId = packed.tile.id;
    const viewId = packed.tile.viewId;
    const bootstrap = props.bootstrap;
    const config: TileConfig = {
      ...packed.tile,
      colSpan: packed.resolvedColSpan,
      rowSpan: packed.resolvedRowSpan,
      displayMode: packed.resolvedDisplayMode,
    };
    const isDragging = workspaceUiState().draggingTileId === tileId;
    const isDropTarget = workspaceUiState().dropTargetTileId === tileId;
    const isMaximized = workspaceUiState().maximizedTileId === tileId;
    const isHiddenByMaximize =
      workspaceUiState().maximizedTileId !== null && workspaceUiState().maximizedTileId !== tileId;
    const menuOpen = openMenuId() === tileId;
    const quickAddOpen = openQuickAddId() === tileId;
    return (
      <BentoTile
        config={config}
        gridWidth={gridWidth()}
        gridSpec={gridSpec()}
        maxColSpan={packed.maxColSpan}
        maxRowSpan={packed.maxRowSpan}
        bootstrap={bootstrap}
        isDragging={isDragging}
        isDropTarget={isDropTarget}
        isActive={workspaceUiState().activeTileId === tileId}
        isMaximized={isMaximized}
        isHiddenByMaximize={isHiddenByMaximize}
        menuOpen={menuOpen}
        quickAddOpen={quickAddOpen}
        onOpen={() => {
          if (viewId !== "a2ui_card") props.onOpenView(viewId);
        }}
        onActivate={() => setActiveTileId(tileId)}
        onRemove={() => removeTile(tileId)}
        onResize={(col, row) => resizeTile(tileId, col, row)}
        onSetBg={(key) => setBgTile(tileId, key)}
        onSetBgImage={(url) => setBgImageTile(tileId, url)}
        onSetMode={(mode) => setModeTile(tileId, mode)}
        onDragStart={() => startDrag(tileId)}
        onMenuToggle={(pos) => toggleTileMenu(tileId, pos)}
        onContextMenuOpen={(pos) => toggleTileMenu(tileId, pos)}
        onQuickAddToggle={(pos) => openQuickAdd(tileId, pos)}
        onEnabledChange={(enabled) => handleTileEnabledChange(tileId, enabled)}
        ref={(el) => tileRefs.set(tileId, el)}
      />
    );
  }

  const noticeShellClass =
    "flex items-center gap-3 rounded-full border border-white/45 bg-white/95 px-4 py-2 shadow-panel backdrop-blur-xl";
  const noticeActionClass =
    "rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary transition hover:bg-primary/20";
  const noticePortalBaseClass =
    "pointer-events-auto fixed left-1/2 z-[110] -translate-x-1/2 animate-fade-in";
  const tileOptionsMenuClass =
    "fixed z-[70] animate-fade-in";
  const menuBackdropClass =
    "fixed inset-0 z-[60]";
  const quickAddBackdropClass =
    "fixed inset-0 z-[90]";
  const quickAddPanelClass =
    "fixed z-[100] w-72 animate-fade-in rounded-2xl border border-white/50 bg-white/96 p-4 shadow-panel backdrop-blur-xl";
  const emptyWorkspaceClass =
    "flex flex-col items-center gap-3 py-16 text-center";
  const emptyWorkspaceIconClass =
    "text-2xl";
  const emptyWorkspaceTitleLabel =
    "Your workspace is empty";
  const emptyWorkspaceDetailLabel =
    "Ask your agent, open a composer, or add a surface to start working.";
  const emptyWorkspaceTitleClass =
    "text-sm font-medium text-on-surface";
  const emptyWorkspaceDetailClass =
    "text-xs text-on-surface-variant/60";
  const emptyWorkspaceActionsClass =
    "mt-2 flex flex-wrap items-center justify-center gap-2";
  const emptyWorkspaceActionButtonClass =
    "rounded-full border border-white/45 bg-white/70 px-3 py-1.5 text-xs font-medium text-on-surface transition hover:bg-white";
  const workspaceHeaderClass =
    "flex items-center justify-between";
  const workspaceHeaderSubtitleClass =
    "mt-0.5 text-xs text-on-surface-variant/60";
  const workspaceHeaderActionsClass =
    "relative flex items-center gap-2";
  const workspaceHeaderButtonClass =
    "glass-button flex h-9 w-9 items-center justify-center rounded-2xl border border-white/40 bg-white/60 text-lg font-light text-on-surface-variant shadow-card hover:bg-white/80 hover:text-on-surface";
  const workspaceTitleLabel =
    "Workspace";
  const workspaceSubtitleLabel =
    "Drag tiles to reorder - drag edge to resize - click + to add content - Ctrl+N to compose";
  const addTileTipLabel =
    "Add a new tile to your workspace";
  const addTileAriaLabel =
    "Add tile";
  const composeTipLabel =
    "Open the global compose launcher";
  const ghostDropZoneBaseClass =
    "flex items-center justify-center rounded-[22px] border-2 border-dashed transition-colors";
  const ghostDropZoneTextClass =
    "text-xs text-outline/40 select-none";
  const ghostDropZoneLabel =
    "Drop here";
  const noticeLabelClass =
    "text-xs text-on-surface-variant";
  const updateNoticeTitleLabel =
    "New version available";
  const updateNoticeLabelClass =
    "text-xs text-on-surface";
  const updateNoticeActionLabel =
    "Reload";
  const updateNoticeShellClass =
    "flex items-center gap-3 rounded-xl border border-primary/30 bg-white/95 px-4 py-3 shadow-panel backdrop-blur-xl";
  const updateNoticeActionClass =
    "rounded-full bg-primary px-3 py-1 text-xs font-medium text-white transition hover:bg-primary/80";
  const updateNoticeDismissClass =
    "text-xs text-on-surface-variant/60 transition hover:text-on-surface-variant";
  const updateNoticePortalClass =
    "fixed bottom-6 right-6 z-[110] animate-fade-in";
  const tileRemovedNoticeLabel =
    "Tile removed";
  const tileRemovedNoticeActionLabel =
    "Undo";
  const tileRemovedNoticeOffsetClass =
    "bottom-24";
  const tileHiddenNoticeLabel =
    "Tile hidden";
  const tileHiddenNoticeActionLabel =
    "Show again";
  const tileHiddenNoticeOffsetClass =
    "bottom-36";

  function activateBottomNoticeAction(event: Event, action: () => void) {
    event.preventDefault();
    event.stopPropagation();
    closeAll();
    action();
  }

  function renderBottomNotice(offsetClass: string, label: string, actionLabel: string, action: () => void) {
    return (
      <Portal>
        <div class={`${noticePortalBaseClass} ${offsetClass}`}>
          <div
            class={`${noticeShellClass} pointer-events-auto`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <span class={noticeLabelClass}>{label}</span>
            <button
              type="button"
              onPointerDown={(event) => activateBottomNoticeAction(event, action)}
              onClick={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  activateBottomNoticeAction(event, action);
                }
              }}
              class={noticeActionClass}
            >
              {actionLabel}
            </button>
          </div>
        </div>
      </Portal>
    );
  }

  function renderEmptyWorkspaceState() {
    return (
      <div class={emptyWorkspaceClass}>
        <p class={emptyWorkspaceIconClass}>+</p>
        <p class={emptyWorkspaceTitleClass}>{emptyWorkspaceTitleLabel}</p>
        <p class={emptyWorkspaceDetailClass}>{emptyWorkspaceDetailLabel}</p>
        <div class={emptyWorkspaceActionsClass}>
          <button
            type="button"
            class={emptyWorkspaceActionButtonClass}
            onClick={() => handleComposeSelection("ask_agent")}
          >
            Ask your agent
          </button>
          <button
            type="button"
            class={emptyWorkspaceActionButtonClass}
            onClick={() => setShowComposeLauncher(true)}
          >
            Compose
          </button>
          <button
            type="button"
            class={emptyWorkspaceActionButtonClass}
            onClick={() => setShowTray(true)}
          >
            Add tile
          </button>
        </div>
      </div>
    );
  }

  function renderWorkspaceFooterNotices() {
    const removedNotice = renderBottomNotice(
      tileRemovedNoticeOffsetClass,
      tileRemovedNoticeLabel,
      tileRemovedNoticeActionLabel,
      undoRemoveTile,
    );
    const hiddenNotice = renderBottomNotice(
      tileHiddenNoticeOffsetClass,
      tileHiddenNoticeLabel,
      tileHiddenNoticeActionLabel,
      undoHideTile,
    );
    return (
      <>
        <Show when={workspaceUiState().removedTile !== null}>
          {removedNotice}
        </Show>

        <Show when={workspaceUiState().hiddenTile !== null}>
          {hiddenNotice}
        </Show>
      </>
    );
  }

  function renderUpdateNotice() {
    return (
      <Portal>
        <div class={updateNoticePortalClass}>
          <div class={updateNoticeShellClass}>
            <span class={updateNoticeLabelClass}>{updateNoticeTitleLabel}</span>
            <button type="button" onClick={() => window.location.reload()} class={updateNoticeActionClass}>
              {updateNoticeActionLabel}
            </button>
            <button type="button" onClick={() => setUpdateAvailable(false)} class={updateNoticeDismissClass}>
              x
            </button>
          </div>
        </div>
      </Portal>
    );
  }

  function renderTileOptionsMenu() {
    const tileId = workspaceUiState().openMenuTileId;
    const tile = tileId ? (tileById().get(tileId) ?? null) : null;
    if (!tileId || !tile) return null;
    const pos = workspaceUiState().openMenuPosition!;
    const topPx = pos.top + 210 > window.innerHeight - 16 ? pos.top - 238 : pos.top + 4;
    const menuStyle = { top: `${topPx}px`, right: `${pos.right}px` };
    const onSetBg = (key: string | undefined) => {
      setBgTile(tileId, key);
      closeAll();
    };
    const onSetBgImage = (url: string | undefined) => {
      setBgImageTile(tileId, url);
      closeAll();
    };
    const onSetMode = (mode: "default" | "compact" | "graph") => {
      setModeTile(tileId, mode);
      closeAll();
    };
    const onExpandToFullView = () => {
      expandTileToFullView(tileId);
      closeAll();
    };
    const onCollapseToMinimum = () => {
      collapseTileToMinimum(tileId);
      closeAll();
    };
    const onDuplicate = () => {
      duplicateTile(tileId);
      closeAll();
    };
    const onRemove = () => {
      removeTile(tileId);
      closeAll();
    };
    return (
      <Portal>
        <div
          class={tileOptionsMenuClass}
          style={menuStyle}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <TileOptionsMenu
            config={tile}
            onSetBg={onSetBg}
            onSetBgImage={onSetBgImage}
            onSetMode={onSetMode}
            onExpandToFullView={onExpandToFullView}
            onCollapseToMinimum={onCollapseToMinimum}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
            onClose={closeAll}
          />
        </div>
      </Portal>
    );
  }

  function renderQuickAddContent(viewId: ViewName) {
    return (
      <Switch>
        <Match when={viewId === "calendar"}>
          <CalendarQuickAdd onClose={closeAll} />
        </Match>
        <Match when={viewId === "search"}>
          <ChatQuickAdd onClose={closeAll} />
        </Match>
        <Match when={viewId === "email"}>
          <EmailQuickAdd
            bootstrap={props.bootstrap}
            onClose={closeAll}
            onRequestWorkspaceAssistDraftRefresh={props.onRequestWorkspaceAssistDraftRefresh}
          />
        </Match>
        <Match when={viewId === "database"}>
          <DataQuickAdd onClose={closeAll} />
        </Match>
        <Match when={viewId === "tasks"}>
          <TaskQuickAdd onClose={closeAll} />
        </Match>
        <Match when={true}>
          <QuickAddPanel
            viewId={viewId}
            bootstrap={props.bootstrap}
            onClose={closeAll}
            onOpenWorkspaceAssist={(view) => {
              closeAll();
              props.onOpenView(view);
            }}
            onRequestWorkspaceAssistDraftRefresh={props.onRequestWorkspaceAssistDraftRefresh}
            workspaceAssistRefreshOrigin={props.workspaceAssistRefreshOrigin?.(`quickadd:${viewId}`)}
          />
        </Match>
      </Switch>
    );
  }

  function renderQuickAddPortal() {
    const viewId = normalizeViewName(workspaceUiState().openQuickAddViewId) ?? "note";
    const pos = workspaceUiState().openQuickAddPosition!;
    const panelStyle = {
      bottom: `${window.innerHeight - pos.top + 8}px`,
      left: `${Math.max(pos.buttonRight - 288, 80)}px`,
    };
    return (
      <Portal>
        <div class={quickAddBackdropClass} onClick={closeAll} />
        <div
          ref={quickAddPanelRef}
          class={quickAddPanelClass}
          style={panelStyle}
        >
          {renderQuickAddContent(viewId)}
        </div>
      </Portal>
    );
  }

  function renderGlobalQuickAddPortal() {
    const viewId = globalQuickAddViewId() ?? "note";
    return (
      <Portal>
        <div class={quickAddBackdropClass} onClick={closeAll} />
        <div
          ref={globalQuickAddPanelRef}
          class={`${quickAddPanelClass} left-1/2 top-24 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2`}
        >
          {renderQuickAddContent(viewId)}
        </div>
      </Portal>
    );
  }

  function renderComposeLauncher() {
    const actions: Array<{ id: "ask_agent" | ViewName; label: string; detail: string }> = [
      { id: "ask_agent", label: "Ask your agent", detail: "Jump to the master-agent bar and start typing" },
      { id: "note", label: "New note", detail: "Open a note draft in the shared editor" },
      { id: "email", label: "Compose email", detail: "Draft an email with the email editor" },
      { id: "tasks", label: "New task", detail: "Add a task with notes and due time" },
      { id: "calendar", label: "New event", detail: "Create an event or calendar-linked task" },
      { id: "search", label: "New message", detail: "Send a direct message without using the chat bar" },
    ];
    return (
      <Portal>
        <div class={quickAddBackdropClass} onClick={closeAll} />
        <div
          ref={composeLauncherRef}
          class="fixed left-1/2 top-24 z-[100] w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 animate-fade-in rounded-3xl border border-white/50 bg-white/96 p-4 shadow-panel backdrop-blur-xl"
        >
          <div class="mb-3 flex items-start justify-between gap-4">
            <div>
              <p class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline">Compose</p>
              <p class="mt-1 text-sm text-on-surface-variant/70">Quick entry points for the things you need to write or add.</p>
            </div>
            <button
              type="button"
              onClick={closeAll}
              class="rounded-full border border-white/40 bg-white/70 px-2.5 py-1 text-xs text-on-surface-variant transition hover:bg-white"
              aria-label="Close compose launcher"
            >
              Esc
            </button>
          </div>
          <div class="grid gap-2">
            <For each={actions}>
              {(action) => (
                <button
                  type="button"
                  onClick={() => handleComposeSelection(action.id)}
                  class="flex w-full items-start justify-between gap-3 rounded-2xl border border-white/40 bg-white/70 px-4 py-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
                >
                  <div>
                    <p class="text-sm font-semibold text-on-surface">{action.label}</p>
                    <p class="mt-1 text-xs text-on-surface-variant/65">{action.detail}</p>
                  </div>
                  <span class="font-mono text-[10px] uppercase tracking-[0.14em] text-outline/55">
                    {action.id === "ask_agent" ? "Ctrl+K" : "Open"}
                  </span>
                </button>
              )}
            </For>
          </div>
        </div>
      </Portal>
    );
  }

  function renderWorkspaceHeader() {
    return (
      <div class={workspaceHeaderClass}>
        <div>
          <h1 class="heading-tight text-xl font-bold text-on-surface">{workspaceTitleLabel}</h1>
          <p class={workspaceHeaderSubtitleClass}>
            {workspaceSubtitleLabel}
          </p>
        </div>
        <div class={workspaceHeaderActionsClass}>
          <Tip label={composeTipLabel} side="left">
            <button
              type="button"
              onClick={() => {
                setShowComposeLauncher((open) => !open);
                setGlobalQuickAddViewId(null);
                clearMenuState();
                clearQuickAddState();
              }}
              class="glass-button flex h-9 items-center gap-2 rounded-2xl border border-white/40 bg-white/60 px-3 text-xs font-medium text-on-surface-variant shadow-card hover:bg-white/80 hover:text-on-surface"
              aria-label="Open compose launcher"
            >
              <span class="text-base leading-none">+</span>
              <span>Compose</span>
            </button>
          </Tip>
          <Tip label={addTileTipLabel} side="left">
            <button
              type="button"
              onClick={() => setShowTray((visible) => !visible)}
              class={workspaceHeaderButtonClass}
              aria-label={addTileAriaLabel}
            >
              +
            </button>
          </Tip>
          <Show when={workspaceUiState().isTrayOpen}>
            {renderWidgetTray()}
          </Show>
        </div>
      </div>
    );
  }

  function renderWidgetTray() {
    return (
      <WidgetTray
        activeTiles={tiles()}
        onAdd={addTile}
        onClose={() => setShowTray(false)}
        onResetLayout={resetLayout}
      />
    );
  }

  function renderGhostDropZone() {
    const toneClass = workspaceUiState().dropTargetTileId === "__ghost__"
      ? "border-primary/50 bg-primary/5"
      : "border-outline/20 bg-transparent";
    const ghostStyle = gridRenderState().ghostDropZoneStyle;
    return (
      <div
        ref={(el) => tileRefs.set("__ghost__", el)}
        class={`${ghostDropZoneBaseClass} ${toneClass}`}
        style={ghostStyle}
      >
        <p class={ghostDropZoneTextClass}>{ghostDropZoneLabel}</p>
      </div>
    );
  }

  return (
    <div class="flex flex-col gap-4">
      {/* Global backdrop — closes tile menus on click-away */}
      <Show when={workspaceUiState().openMenuTileId !== null}>
        <div class={menuBackdropClass} onClick={closeAll} />
      </Show>

      {/* TileOptionsMenu Portal — above all content, flips up if near viewport bottom */}
      <Show when={workspaceUiState().openMenuTileId !== null && workspaceUiState().openMenuPosition !== null}>
        {renderTileOptionsMenu()}
      </Show>

      {/* Quick-add Portal — renders above everything, positioned near the + button */}
      <Show when={workspaceUiState().openQuickAddTileId !== null && workspaceUiState().openQuickAddPosition !== null}>
        {renderQuickAddPortal()}
      </Show>
      <Show when={globalQuickAddViewId() !== null}>
        {renderGlobalQuickAddPortal()}
      </Show>
      <Show when={showComposeLauncher()}>
        {renderComposeLauncher()}
      </Show>

      {/* Intelligence Brief — full-width, always visible */}
      <IntelligenceBrief
        onOpenView={props.onOpenView}
        signedIn={props.signedIn ?? false}
      />

      <ProactiveSuggestionStrip
        items={queueCompanionState().proactiveSuggestions}
        messages={dashboardBootstrapMessages(props.bootstrap)}
        threadSummaries={dashboardBootstrapThreadSummaries(props.bootstrap)}
      />

      {/* Header */}
      {renderWorkspaceHeader()}

      {/* Grid */}
      <div
        ref={gridRef}
        class="grid"
        style={gridRenderState().gridStyle}
      >
        <For each={gridRenderState().packedTiles}>
          {(packed) => renderPackedTile(packed)}
        </For>

        {/* Ghost drop zone — appears during drag, allows dropping to a blank spot */}
        <Show when={workspaceUiState().draggingTileId !== null}>
          {renderGhostDropZone()}
        </Show>
      </div>

      <Show when={tiles().length === 0}>
        {renderEmptyWorkspaceState()}
      </Show>

      {renderWorkspaceFooterNotices()}

      <Show when={workspaceUiState().hasUpdateAvailable}>
        {renderUpdateNotice()}
      </Show>
    </div>
  );
}
