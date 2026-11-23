import { createEffect, createMemo, createResource, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { Portal } from "solid-js/web";
import { GridStack } from "gridstack";
import {
  threadSummaryMetaLine,
  threadSummaryPrimaryText,
  threadSummaryRefineQuery,
} from "afp-ts/retrieval";
import {
  type AfpMessage,
  type DashboardBootstrap,
  type SupertagDefinitionRecord,
} from "@/lib/api";
import { objectKindLabel } from "@/lib/objectKinds";
import { openThreadSearch } from "@/lib/threadSearchNavigation";
import { AlternateViewsInspector } from "@/components/AlternateViewsInspector";
import { ThreadDiscoveryStateSummary } from "@/components/ThreadDiscoveryStateSummary";
import { ViewDispatcher } from "@/components/ViewDispatcher";
import { WorkspaceSetupBanner } from "@/components/WorkspaceSetupBanner";
import type { SetupItemId } from "@/lib/workspaceSetupBannerTypes";
import { dispatchAfpInspectEvent } from "@/lib/afpInspectEvent";
import { ReversibleActionNotice } from "@/components/renderers/ReversibleActionNotice";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { pruneDashboardFeedLayout } from "@/lib/dashboardFeedLayout";
import { buildDashboardFeedActivitySpark } from "@/lib/dashboardFeedActivitySpark";
import {
  collectDashboardDismissedMessages,
  countDashboardNewCards,
  collectDashboardRenderableMessages,
  collectDashboardVisibleCards,
  countDashboardOldCards,
} from "@/lib/dashboardFeedCards";
import {
  collectPinnedFeedIdsInVisibleOrder,
  normalizePinnedFeedNavIndex,
} from "@/lib/dashboardFeedPinnedNav";
import {
  clearDashboardFeedScopeTransientState,
  pruneDashboardFeedActiveTypes,
} from "@/lib/dashboardFeedScopeState";
import {
  buildDashboardFeedActiveTypeScopeLabel,
  buildDashboardFeedAllCaughtUpSummaryParts,
} from "@/lib/dashboardFeedSummaryState";
import { collectDashboardFeedOpenThreadSummaries } from "@/lib/dashboardFeedThreadSummaries";
import {
  collectDashboardFeedAvailableTopicKinds,
  collectDashboardFeedFallbackTopicTags,
  includeActiveDashboardFeedTopicKind,
  includeActiveDashboardFeedTopicTag,
  isDashboardFeedTopicLensLoading,
  normalizeDashboardFeedActiveTopicKind,
  resolveDashboardFeedTopicLensError,
  resolveDashboardFeedTopicBaseMessages,
  resolveDashboardFeedTopicSelectionMessages,
  selectDashboardFeedAvailableTopicTags,
  shouldShowDashboardFeedTopicLensControls,
} from "@/lib/dashboardFeedTopicLens";
import {
  clearDashboardFeedStoredStringSet,
  clearDashboardFeedLayout,
  saveDashboardFeedGridLayout,
  loadDashboardFeedReadAt,
  loadDashboardFeedSeenFlag,
  loadDashboardFeedStoredLayout,
  loadDashboardFeedStoredSnoozed,
  loadDashboardFeedStoredStringSet,
  pruneExpiredDashboardFeedSnoozed,
  pruneDashboardFeedSnoozedAgainstDismissed,
  removeDashboardFeedSnoozedIds,
  removeDashboardFeedStringSetIds,
  pruneDashboardFeedSnoozed,
  pruneDashboardFeedStringSet,
  saveDashboardFeedReadAt,
  saveDashboardFeedSeenFlag,
  saveDashboardFeedStoredLayout,
  saveDashboardFeedStoredSnoozed,
  saveDashboardFeedStoredStringSet,
} from "@/lib/dashboardFeedStorage";
import { afpRecord } from "@/lib/afpMessageRecord";
import {
  dashboardBootstrapMessages,
  dashboardBootstrapThreadRetrievalState,
  dashboardBootstrapThreadSummaries,
} from "@/lib/dashboardBootstrapState";
import {
  dashboardFeedCardAgeOpacity,
  dashboardFeedCardGridHeight,
  dashboardFeedMessageTypeLabel,
  dashboardFeedScalarString,
  dashboardFeedTypeHue,
  normalizeDashboardFeedSupertagKey,
} from "@/lib/dashboardFeedCardPresentation";
import {
  absoluteDisplayTimestamp,
  absoluteUtcTimestamp,
  displayMessageTimestamp,
  relativeMessageTime,
} from "@/lib/messageTimestampPresentation";
import {
  loadDashboardFeedMetadataState,
  loadDashboardFeedTopicLensState,
} from "@/lib/dashboardFeedResourceState";

const LAYOUT_KEY = "omnyid.grid-layout";
const PINNED_KEY = "omnyid.pinned-msgs";
const DISMISSED_KEY = "omnyid.dismissed-msgs";
const FILTER_HINT_KEY = "omnyid.feed.filter_hint_seen";
const SNOOZE_KEY = "omnyid.feed.snoozed";
const READ_AT_KEY = "omnyid.feed.last_read_at";
const COLLAPSED_KEY = "omnyid.feed.collapsed";

function relativeTime(ts: string): string {
  return relativeMessageTime(ts);
}

function displayTimestamp(ts: string): string {
  return displayMessageTimestamp(ts);
}

function typeHue(type: string): number {
  return dashboardFeedTypeHue(type);
}

function messageTypeLabel(type: string): string {
  return dashboardFeedMessageTypeLabel(type);
}

function cardAgeOpacity(ts: string | undefined): string {
  return dashboardFeedCardAgeOpacity(ts);
}

function cardGridHeight(message: AfpMessage, expanded: boolean): number {
  return dashboardFeedCardGridHeight(message, expanded);
}

function feedScalarString(value: unknown, fallback = ""): string {
  return dashboardFeedScalarString(value, fallback);
}

function normalizeSupertagKey(tag: string): string {
  return normalizeDashboardFeedSupertagKey(tag);
}

function isActiveTodosTaskUpdate(message: AfpMessage): boolean {
  const metadata = message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
    ? message.metadata
    : {};
  return message.type === "task"
    && message.subtype === "update"
    && metadata.task_update_source === "active_todos";
}

function textFromPossibleHtml(value: string | undefined): string {
  if (!value) return "";
  const normalized = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized || value;
}

type RenderUnit =
  | { kind: "standalone"; message: AfpMessage }
  | { kind: "generative_card"; card: AfpMessage; updates: AfpMessage[] }
  | { kind: "ledger_board"; message: AfpMessage; taskUpdates: AfpMessage[] };
type FeedContextMenuState = {
  msgId: string;
  x: number;
  y: number;
};

export function DashboardFeed(props: {
  bootstrap: DashboardBootstrap | null;
  signedIn?: boolean;
  commandSummary?: string;
  advanced?: boolean;
  onOpenThread?: (threadId: string) => void;
  onNavigate?: (view: string, hint?: SetupItemId) => void;
}) {
  let gridEl: HTMLDivElement | undefined;
  let gs: GridStack | undefined;
  let filterRowRef: HTMLDivElement | undefined;

  const PAGE_SIZE = 12;
  const [visibleCount, setVisibleCount] = createSignal(PAGE_SIZE);
  const [activeTypes, setActiveTypes] = createSignal<Set<string>>(new Set());
  const [activeSupertag, setActiveSupertag] = createSignal<string | null>(null);
  const [activeTopicKind, setActiveTopicKind] = createSignal<string | null>(null);
  const [feedContextMenu, setFeedContextMenu] = createSignal<FeedContextMenuState | null>(null);
  const [tick, setTick] = createSignal(0);
  const [dismissed, setDismissed] = createSignal<Set<string>>(loadDashboardFeedStoredStringSet(DISMISSED_KEY));
  const [snoozed, setSnoozed] = createSignal<Map<string, number>>(loadDashboardFeedStoredSnoozed(SNOOZE_KEY));
  const [pinned, setPinned] = createSignal<Set<string>>(loadDashboardFeedStoredStringSet(PINNED_KEY));

  const [metadataState, { refetch: refetchMetadataState }] = createResource(
    () => props.signedIn ?? false,
    async (signedIn) => loadDashboardFeedMetadataState(signedIn),
  );

  const [topicLensState, { refetch: refetchTopicLensState }] = createResource(
    () => {
      if (!(props.signedIn ?? false)) return null;
      const tag = activeSupertag();
      if (!tag) return null;
      return { tag, kind: activeTopicKind() };
    },
    async (selection) => loadDashboardFeedTopicLensState(true, selection),
  );

  const availableTopicKinds = createMemo(() => {
    void tick();
    return collectDashboardFeedAvailableTopicKinds(
      resolveDashboardFeedTopicBaseMessages(activeSupertag(), topicLensState.latest?.base),
      dismissed(),
      snoozed(),
      Date.now(),
      activeTypes(),
    );
  });
  const visibleTopicKinds = createMemo(() =>
    includeActiveDashboardFeedTopicKind(
      availableTopicKinds(),
      activeTopicKind(),
    )
  );

  createEffect(() => {
    const nextKind = normalizeDashboardFeedActiveTopicKind(
      activeSupertag(),
      activeTopicKind(),
      availableTopicKinds(),
    );
    if (nextKind !== activeTopicKind()) {
      setActiveTopicKind(nextKind);
    }
  });

  const topicLensLoading = createMemo(() =>
    isDashboardFeedTopicLensLoading(
      activeSupertag(),
      topicLensState.loading,
      topicLensState.loading,
    )
  );

  const topicLensError = createMemo(() => {
    return resolveDashboardFeedTopicLensError(
      activeSupertag(),
      topicLensLoading(),
      topicLensState()?.selectionError,
      topicLensState()?.baseError,
    );
  });

  // Declared here (ahead of their old spot further down) because createMemo runs its
  // computation immediately, and showTopicLensControls below reads visibleTopicLensTags
  // as soon as it's created.
  const renderableBootstrapMessages = createMemo(() =>
    collectDashboardRenderableMessages(dashboardBootstrapMessages(props.bootstrap))
  );
  const topicTagBaselineMessages = createMemo(() => {
    const types = activeTypes();
    return renderableBootstrapMessages().filter((message) => types.size === 0 || types.has(message.type));
  });
  const fallbackTopicLensTags = createMemo(() => {
    void tick();
    return collectDashboardFeedFallbackTopicTags(
      topicTagBaselineMessages(),
      dismissed(),
      snoozed(),
      Date.now(),
    );
  });
  const availableSupertags = createMemo(() => {
    return selectDashboardFeedAvailableTopicTags(
      activeTypes().size,
      metadataState()?.supertags,
      fallbackTopicLensTags(),
    );
  });
  const visibleTopicLensTags = createMemo(() =>
    includeActiveDashboardFeedTopicTag(
      availableSupertags(),
      activeSupertag(),
      fallbackTopicLensTags(),
    )
  );
  const showTopicLensControls = createMemo(() =>
    shouldShowDashboardFeedTopicLensControls(
      visibleTopicLensTags().length,
      activeSupertag(),
      Boolean(metadataState()?.supertagsError || metadataState()?.definitionsError),
    )
  );

  function retryTopicLens() {
    if (!activeSupertag()) return;
    void refetchTopicLensState();
    if (metadataState()?.definitionsError) void refetchMetadataState();
  }

  function retrySupertagMetadata() {
    void refetchMetadataState();
  }

  const topicalMessages = createMemo(() => {
    const selectedTag = activeSupertag();
    if (!selectedTag) return dashboardBootstrapMessages(props.bootstrap);
    return resolveDashboardFeedTopicSelectionMessages(
      selectedTag,
      activeTopicKind(),
      topicLensState.latest?.selection,
    );
  });
  const topicalRenderableMessages = createMemo(() =>
    collectDashboardRenderableMessages(topicalMessages())
  );

  const allFilteredMessages = createMemo(() => {
    void tick(); // re-evaluate every minute so snooze expiries wake cards
    const types = activeTypes();
    const snz = snoozed();
    const now = Date.now();
    return topicalMessages()
      .filter((m) => !dismissed().has(m.id))
      .filter((m) => { const wakeAt = snz.get(m.id); return wakeAt === undefined || wakeAt <= now; })
      .filter((m) => types.size === 0 || types.has(m.type));
  });
  const filteredRenderableMessages = createMemo(() =>
    collectDashboardRenderableMessages(allFilteredMessages())
  );

  // Declared here (ahead of their old spot further down) because createMemo runs its
  // computation immediately, and allCaughtUpSummaryParts below reads dismissedScopedCount /
  // snoozedScopedCount as soon as it's created.
  const scopedRenderableMessages = createMemo(() => {
    const types = activeTypes();
    return topicalRenderableMessages().filter((message) => types.size === 0 || types.has(message.type));
  });
  const dismissedMessages = createMemo(() =>
    collectDashboardDismissedMessages(scopedRenderableMessages(), dismissed())
  );
  const dismissedScopedCount = createMemo(() => dismissedMessages().length);
  const snoozedScopedCount = createMemo(() => {
    void tick();
    const scopedIds = new Set(scopedRenderableMessages().map((message) => message.id));
    const now = Date.now();
    let count = 0;
    for (const [id, wakeAt] of snoozed()) {
      if (scopedIds.has(id) && wakeAt > now) count += 1;
    }
    return count;
  });
  const availableRenderableMessages = createMemo(() => {
    void tick();
    const snz = snoozed();
    const now = Date.now();
    return topicalRenderableMessages().filter((message) => {
      if (dismissed().has(message.id)) return false;
      const wakeAt = snz.get(message.id);
      return wakeAt === undefined || wakeAt <= now;
    });
  });
  const messages = createMemo(() =>
    collectDashboardVisibleCards(allFilteredMessages(), visibleCount())
  );
  const visibleRenderableCount = createMemo(() =>
    Math.min(visibleCount(), filteredRenderableMessages().length)
  );
  const filteredOutRenderableCount = createMemo(() =>
    Math.max(0, availableRenderableMessages().length - filteredRenderableMessages().length)
  );
  const hasActiveFeedFilters = createMemo(() =>
    activeTypes().size > 0 || Boolean(activeSupertag()) || Boolean(activeTopicKind())
  );
  const activeTypeScopeLabel = createMemo(() =>
    buildDashboardFeedActiveTypeScopeLabel(Array.from(activeTypes()), messageTypeLabel)
  );
  const allCaughtUpSummaryParts = createMemo(() =>
    buildDashboardFeedAllCaughtUpSummaryParts({
      activeTopicKindLabel: activeTopicKind() ? objectKindLabel(activeTopicKind() ?? "") : null,
      activeSupertag: activeSupertag(),
      activeTypeScopeLabel: activeTypeScopeLabel(),
      dismissedCount: dismissedScopedCount(),
      snoozedCount: snoozedScopedCount(),
    })
  );

  const renderUnits = createMemo<RenderUnit[]>(() => {
    const visibleCards = messages();
    const visibleCardIds = new Set(visibleCards.map((message) => message.id));
    const updatesMap = new Map<string, AfpMessage[]>();
    const taskUpdatesMap = new Map<string, AfpMessage[]>();
    const units: RenderUnit[] = [];

    for (const msg of allFilteredMessages()) {
      if (msg.type === "card_section_update") {
        const cardId = feedScalarString(afpRecord(msg.content)["card_id"]);
        if (!cardId || !visibleCardIds.has(cardId)) continue;
        const arr = updatesMap.get(cardId) ?? [];
        arr.push(msg);
        updatesMap.set(cardId, arr);
      }
      if (isActiveTodosTaskUpdate(msg) && msg.parent_id && visibleCardIds.has(msg.parent_id)) {
        const arr = taskUpdatesMap.get(msg.parent_id) ?? [];
        arr.push(msg);
        taskUpdatesMap.set(msg.parent_id, arr);
      }
    }

    for (const msg of visibleCards) {
      if (isActiveTodosTaskUpdate(msg) && msg.parent_id && visibleCardIds.has(msg.parent_id)) continue;
      if (msg.type === "generative_card") {
        const cardId = feedScalarString(afpRecord(msg.content)["card_id"], msg.id);
        units.push({
          kind: "generative_card",
          card: msg,
          updates: updatesMap.get(cardId) ?? [],
        });
      } else if (msg.type === "task" && msg.subtype !== "update") {
        units.push({
          kind: "ledger_board",
          message: msg,
          taskUpdates: taskUpdatesMap.get(msg.id) ?? [],
        });
      } else {
        units.push({ kind: "standalone", message: msg });
      }
    }

    return units;
  });

  const [undoDismissId, setUndoDismissId] = createSignal<string | null>(null);
  let undoTimer: ReturnType<typeof setTimeout> | undefined;
  const [raisedCardId, setRaisedCardId] = createSignal<string | null>(null);
  let pendingGridSyncFrame: number | undefined;
  let pendingGridContentFrame: number | undefined;
  let pendingGridInitFrame: number | undefined;

  const [lastReadAt, setLastReadAt] = createSignal<number>(loadDashboardFeedReadAt(READ_AT_KEY));
  function markAllRead() {
    const now = saveDashboardFeedReadAt(READ_AT_KEY, Date.now());
    setLastReadAt(now);
  }
  const newCardCount = createMemo(() =>
    countDashboardNewCards(renderableBootstrapMessages(), lastReadAt())
  );
  const [collapsed, setCollapsed] = createSignal<Set<string>>(loadDashboardFeedStoredStringSet(COLLAPSED_KEY));
  const feedMessageMap = createMemo(() => {
    const map = new Map<string, AfpMessage>();
    for (const unit of renderUnits()) {
      const msg = unit.kind === "generative_card" ? unit.card : unit.message;
      map.set(msg.id, msg);
    }
    return map;
  });
  const bootstrapMessageIds = createMemo(() =>
    new Set(renderableBootstrapMessages().map((message) => message.id))
  );

  createEffect(() => {
    void tick();
    const validIds = bootstrapMessageIds();

    const nextPinned = pruneDashboardFeedStringSet(pinned(), validIds);
    if (nextPinned.size !== pinned().size) {
      setPinned(nextPinned);
      saveDashboardFeedStoredStringSet(PINNED_KEY, nextPinned);
    }

    const nextDismissed = pruneDashboardFeedStringSet(dismissed(), validIds);
    if (nextDismissed.size !== dismissed().size) {
      setDismissed(nextDismissed);
      saveDashboardFeedStoredStringSet(DISMISSED_KEY, nextDismissed);
    }

    const nextCollapsed = pruneDashboardFeedStringSet(collapsed(), validIds);
    if (nextCollapsed.size !== collapsed().size) {
      setCollapsed(nextCollapsed);
      saveDashboardFeedStoredStringSet(COLLAPSED_KEY, nextCollapsed);
    }

    const nextSnoozed = pruneExpiredDashboardFeedSnoozed(
      pruneDashboardFeedSnoozed(snoozed(), validIds),
      Date.now(),
    );
    const nextSnoozedWithoutDismissed = pruneDashboardFeedSnoozedAgainstDismissed(
      nextSnoozed,
      nextDismissed,
    );
    if (nextSnoozedWithoutDismissed.size !== snoozed().size) {
      setSnoozed(nextSnoozedWithoutDismissed);
      saveDashboardFeedStoredSnoozed(SNOOZE_KEY, nextSnoozedWithoutDismissed);
    }
  });

  function bringCardToFront(msgId: string) {
    setRaisedCardId(msgId);
  }

  function scheduleGridSyncFrame(callback: () => void) {
    if (pendingGridSyncFrame !== undefined) cancelAnimationFrame(pendingGridSyncFrame);
    pendingGridSyncFrame = requestAnimationFrame(() => {
      pendingGridSyncFrame = undefined;
      callback();
    });
  }

  function scheduleGridInitFrame(callback: () => void) {
    if (pendingGridInitFrame !== undefined) cancelAnimationFrame(pendingGridInitFrame);
    pendingGridInitFrame = requestAnimationFrame(() => {
      pendingGridInitFrame = undefined;
      callback();
    });
  }

  function scheduleGridContentFrame(callback: () => void) {
    if (pendingGridContentFrame !== undefined) cancelAnimationFrame(pendingGridContentFrame);
    pendingGridContentFrame = requestAnimationFrame(() => {
      pendingGridContentFrame = undefined;
      callback();
    });
  }

  function cancelPendingGridFrames() {
    if (pendingGridSyncFrame !== undefined) {
      cancelAnimationFrame(pendingGridSyncFrame);
      pendingGridSyncFrame = undefined;
    }
    if (pendingGridContentFrame !== undefined) {
      cancelAnimationFrame(pendingGridContentFrame);
      pendingGridContentFrame = undefined;
    }
    if (pendingGridInitFrame !== undefined) {
      cancelAnimationFrame(pendingGridInitFrame);
      pendingGridInitFrame = undefined;
    }
  }

  function updateGridCardItem(item: HTMLElement, message: AfpMessage, expanded: boolean) {
    if (!gs || !gridEl || !gridEl.isConnected || !item.isConnected) return;
    gs.update(item, {
      h: cardGridHeight(message, expanded),
      sizeToContent: true,
    });
    const visibleIds = renderUnits().map((unit) => (unit.kind === "generative_card" ? unit.card.id : unit.message.id));
    saveDashboardFeedGridLayout(LAYOUT_KEY, gs, visibleIds);
  }

  function syncGridCardState(msgId: string, expanded: boolean) {
    if (!gs || !gridEl || !gridEl.isConnected) return;
    const item = gridEl.querySelector(`[data-msg-id="${msgId}"]`) as HTMLElement | null;
    const message = feedMessageMap().get(msgId);
    if (!item || !message) return;
    scheduleGridSyncFrame(() => {
      updateGridCardItem(item, message, expanded);
      if (expanded) {
        scheduleGridContentFrame(() => updateGridCardItem(item, message, true));
      }
    });
  }

  function stopCardActionPointer(event: PointerEvent) {
    event.stopPropagation();
  }

  function stopCardActionClick(event: MouseEvent) {
    event.stopPropagation();
  }

  function syncAllVisibleGridCardHeights() {
    if (!gs || !gridEl || !gridEl.isConnected) return;
    const messageMap = feedMessageMap();
    const collapsedIds = collapsed();
    scheduleGridSyncFrame(() => {
      if (!gs || !gridEl || !gridEl.isConnected) return;
      for (const item of gridEl.querySelectorAll(".grid-stack-item")) {
        const el = item as HTMLElement;
        const msgId = el.getAttribute("data-msg-id");
        if (!msgId) continue;
        const message = messageMap.get(msgId);
        if (!message) continue;
        gs.update(el, {
          h: cardGridHeight(message, !collapsedIds.has(msgId)),
          sizeToContent: true,
        });
      }
      const visibleIds = renderUnits().map((unit) => (unit.kind === "generative_card" ? unit.card.id : unit.message.id));
      saveDashboardFeedGridLayout(LAYOUT_KEY, gs, visibleIds);
    });
  }

  function toggleCollapse(msgId: string) {
    let expanded = false;
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId); else next.add(msgId);
      expanded = !next.has(msgId);
      return saveDashboardFeedStoredStringSet(COLLAPSED_KEY, next);
    });
    if (expanded) bringCardToFront(msgId);
    else if (raisedCardId() === msgId) setRaisedCardId(null);
    syncGridCardState(msgId, expanded);
  }
  const [snoozePickerId, setSnoozePickerId] = createSignal<string | null>(null);
  const [snoozePickerDays, setSnoozePickerDays] = createSignal(0);
  const [snoozePickerHours, setSnoozePickerHours] = createSignal(1);
  const [snoozedToastId, setSnoozedToastId] = createSignal<string | null>(null);
  let snoozeToastTimer: ReturnType<typeof setTimeout> | undefined;

  function snoozeCard(msgId: string, durationMs: number) {
    const wakeAt = Date.now() + durationMs;
    setDismissed((prev) => {
      if (!prev.has(msgId)) return prev;
      const next = new Set(prev);
      next.delete(msgId);
      return saveDashboardFeedStoredStringSet(DISMISSED_KEY, next);
    });
    setSnoozed((prev) => {
      const next = new Map(prev);
      next.set(msgId, wakeAt);
      return saveDashboardFeedStoredSnoozed(SNOOZE_KEY, next);
    });
    setSnoozePickerId(null);
    clearTimeout(snoozeToastTimer);
    setSnoozedToastId(msgId);
    snoozeToastTimer = setTimeout(() => setSnoozedToastId(null), 5000);
  }
  function unsnoozeCard(msgId: string) {
    setSnoozed((prev) => {
      const next = new Map(prev);
      next.delete(msgId);
      return saveDashboardFeedStoredSnoozed(SNOOZE_KEY, next);
    });
    setSnoozedToastId(null);
  }

  function dismissCard(msgId: string) {
    if (pinned().has(msgId)) return; // pinned cards cannot be dismissed
    setSnoozed((prev) => {
      if (!prev.has(msgId)) return prev;
      const next = new Map(prev);
      next.delete(msgId);
      return saveDashboardFeedStoredSnoozed(SNOOZE_KEY, next);
    });
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(msgId);
      return saveDashboardFeedStoredStringSet(DISMISSED_KEY, next);
    });
    clearTimeout(undoTimer);
    setUndoDismissId(msgId);
    undoTimer = setTimeout(() => setUndoDismissId(null), 5000);
  }

  function undoDismiss() {
    const id = undoDismissId();
    if (!id) return;
    clearTimeout(undoTimer);
    setDismissed((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return saveDashboardFeedStoredStringSet(DISMISSED_KEY, next);
    });
    setUndoDismissId(null);
  }
  function restoreDismissedIds(ids: ReadonlySet<string>) {
    setDismissed((prev) => {
      const next = removeDashboardFeedStringSetIds(prev, ids);
      if (next.size === 0) clearDashboardFeedStoredStringSet(DISMISSED_KEY);
      else saveDashboardFeedStoredStringSet(DISMISSED_KEY, next);
      return next;
    });
  }

  function togglePin(msgId: string) {
    let nextPinnedState = false;
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) {
        next.delete(msgId);
        nextPinnedState = false;
      } else {
        next.add(msgId);
        nextPinnedState = true;
      }
      return saveDashboardFeedStoredStringSet(PINNED_KEY, next);
    });

    if (!gs || !gridEl) return;
    const el = gridEl
      .querySelector(`[data-msg-id="${msgId}"]`)
      ?.closest(".grid-stack-item") as HTMLElement | null;
    if (!el) return;
    gs.update(el, {
      locked: nextPinnedState,
      noMove: nextPinnedState,
      noResize: nextPinnedState,
    });
  }

  function openFeedContextMenu(event: MouseEvent, msgId: string) {
    event.preventDefault();
    event.stopPropagation();
    setFeedContextMenu({
      msgId,
      x: Math.min(event.clientX, window.innerWidth - 220),
      y: Math.min(event.clientY, window.innerHeight - 240),
    });
  }

  function closeFeedContextMenu() {
    setFeedContextMenu(null);
  }

  createEffect(() => {
    if (!feedContextMenu()) return;
    const close = () => setFeedContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", handleKeyDown);
    });
  });

  function initGrid() {
    if (!gridEl || !gridEl.isConnected) return;
    if (gs) {
      gs.off("change");
      gs.destroy(false);
    }
    gs = GridStack.init(
      {
        float: true,
        margin: 8,
        cellHeight: 60,
        animate: true,
        handle: ".drag-handle",
        resizable: { handles: "se" },
        sizeToContent: true,
      },
      gridEl
    );
    const visibleIds = renderUnits().map((unit) => (unit.kind === "generative_card" ? unit.card.id : unit.message.id));
    const saved = loadDashboardFeedStoredLayout(LAYOUT_KEY, visibleIds);
    if (saved.length) {
      try {
        gs.load(saved, false);
        saveDashboardFeedStoredLayout(LAYOUT_KEY, saved, visibleIds);
      } catch {
        /* ignore */
      }
    }
    for (const msgId of pinned()) {
      const el = gridEl
        .querySelector(`[data-msg-id="${msgId}"]`)
        ?.closest(".grid-stack-item") as HTMLElement | null;
      if (el) gs.update(el, { locked: true, noMove: true, noResize: true });
    }
    gs.on("dragstart", (_event, el) => {
      const msgId = (el as HTMLElement | null)?.getAttribute("data-msg-id");
      if (msgId) bringCardToFront(msgId);
    });
    gs.on("change", () => {
      if (!gs) return;
      const visibleIds = renderUnits().map((unit) => (unit.kind === "generative_card" ? unit.card.id : unit.message.id));
      saveDashboardFeedGridLayout(LAYOUT_KEY, gs, visibleIds);
    });
  }

  createEffect(() => {
    const units = renderUnits();
    if (!gridEl || !gridEl.isConnected || units.length === 0) {
      cancelPendingGridFrames();
      if (gs) {
        gs.off("change");
        gs.destroy(false);
        gs = undefined;
      }
      return;
    }
    scheduleGridInitFrame(() => {
      if (units.length > 0) initGrid();
    });
  });

  createEffect(() => {
    const visibleIds = new Set(renderUnits().map((unit) => (unit.kind === "generative_card" ? unit.card.id : unit.message.id)));
    const raisedId = raisedCardId();
    if (raisedId && !visibleIds.has(raisedId)) {
      setRaisedCardId(null);
    }
    const menu = feedContextMenu();
    if (menu && !visibleIds.has(menu.msgId)) {
      setFeedContextMenu(null);
    }
    const snoozeId = snoozePickerId();
    if (snoozeId && !visibleIds.has(snoozeId)) {
      setSnoozePickerId(null);
    }
    const focusedId = focusedCardId();
    if (focusedId && !visibleIds.has(focusedId)) {
      setFocusedCardId(null);
    }
  });

  createEffect(() => {
    const dismissedId = undoDismissId();
    if (dismissedId && !dismissed().has(dismissedId)) {
      clearTimeout(undoTimer);
      setUndoDismissId(null);
    }
    const snoozedId = snoozedToastId();
    if (snoozedId && !snoozed().has(snoozedId)) {
      clearTimeout(snoozeToastTimer);
      setSnoozedToastId(null);
    }
  });

  createEffect(() => {
    renderUnits();
    collapsed();
    if (!gs || !gridEl) return;
    syncAllVisibleGridCardHeights();
  });

  onCleanup(() => {
    clearTimeout(undoTimer);
    clearTimeout(snoozeToastTimer);
    clearTimeout(resetTimer);
    clearTimeout(bulkDismissTimer);
    cancelPendingGridFrames();
    gs?.off("change");
    gs?.destroy(false);
    gs = undefined;
  });

  const [pinnedNavIdx, setPinnedNavIdx] = createSignal(0);
  const [focusedCardId, setFocusedCardId] = createSignal<string | null>(null);
  const filteredRenderableIds = createMemo(() =>
    filteredRenderableMessages().map((message) => message.id)
  );
  const pinnedFilteredIds = createMemo(() =>
    collectPinnedFeedIdsInVisibleOrder(
      filteredRenderableIds(),
      pinned(),
    )
  );

  createEffect(() => {
    setPinnedNavIdx((current) => normalizePinnedFeedNavIndex(current, pinnedFilteredIds().length));
  });

  function scrollToPinned(idx: number) {
    const ids = pinnedFilteredIds();
    if (ids.length === 0 || !gridEl) return;
    const clamped = normalizePinnedFeedNavIndex(idx, ids.length);
    setPinnedNavIdx((clamped + 1) % ids.length);
    const targetId = ids[clamped];
    const targetIndex = filteredRenderableIds().indexOf(targetId);
    if (targetIndex >= 0 && targetIndex >= visibleCount()) {
      setVisibleCount((current) => Math.max(current, targetIndex + 1));
    }
    scheduleGridSyncFrame(() => {
      const el = gridEl?.querySelector(`[data-msg-id="${targetId}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  const [summaryExpanded, setSummaryExpanded] = createSignal(false);
  const commandSummaryText = createMemo(() => textFromPossibleHtml(props.commandSummary));
  createEffect(() => {
    props.commandSummary;
    setSummaryExpanded(false);
  });
  const [showDismissed, setShowDismissed] = createSignal(false);
  const [filterHintSeen, setFilterHintSeen] = createSignal(loadDashboardFeedSeenFlag(FILTER_HINT_KEY));
  createEffect(() => {
    if (activeTypes().size > 0 && !filterHintSeen()) {
      setFilterHintSeen(saveDashboardFeedSeenFlag(FILTER_HINT_KEY, true));
    }
  });
  const [resetPending, setResetPending] = createSignal(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  function startReset() {
    clearTimeout(resetTimer);
    setResetPending(true);
    resetTimer = setTimeout(() => setResetPending(false), 4000);
  }
  function confirmReset() {
    clearTimeout(resetTimer);
    setResetPending(false);
    clearDashboardFeedLayout(LAYOUT_KEY);
    cancelPendingGridFrames();
    if (gs) { gs.off("change"); gs.destroy(false); gs = undefined; }
    scheduleGridInitFrame(() => initGrid());
  }

  const [bulkDismissPending, setBulkDismissPending] = createSignal(false);
  let bulkDismissTimer: ReturnType<typeof setTimeout> | undefined;
  const oldCardCount = () =>
    countDashboardOldCards(filteredRenderableMessages(), dismissed(), pinned(), Date.now());
  function startBulkDismiss() {
    clearTimeout(bulkDismissTimer);
    setBulkDismissPending(true);
    bulkDismissTimer = setTimeout(() => setBulkDismissPending(false), 4000);
  }
  function confirmBulkDismiss() {
    clearTimeout(bulkDismissTimer);
    setBulkDismissPending(false);
    const dismissedIds = new Set<string>();
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const m of filteredRenderableMessages()) {
        if (pinned().has(m.id)) continue;
        const age = Math.floor((Date.now() - new Date(m.timestamp ?? 0).getTime()) / 1000);
        if (age > 72 * 3600) {
          next.add(m.id);
          dismissedIds.add(m.id);
        }
      }
      return saveDashboardFeedStoredStringSet(DISMISSED_KEY, next);
    });
    if (dismissedIds.size > 0) {
      setSnoozed((prev) => {
        const next = removeDashboardFeedSnoozedIds(prev, dismissedIds);
        if (next.size === prev.size) return prev;
        return saveDashboardFeedStoredSnoozed(SNOOZE_KEY, next);
      });
    }
  }
  createEffect(() => {
    activeTypes();
    activeSupertag();
    activeTopicKind();
    const nextScopeState = clearDashboardFeedScopeTransientState({
      bulkDismissPending: bulkDismissPending(),
      showDismissed: showDismissed(),
      snoozedToastId: snoozedToastId(),
      undoDismissId: undoDismissId(),
    });
    if (nextScopeState.showDismissed !== showDismissed()) {
      setShowDismissed(false);
    }
    if (nextScopeState.undoDismissId !== undoDismissId()) {
      clearTimeout(undoTimer);
      setUndoDismissId(null);
    }
    if (nextScopeState.snoozedToastId !== snoozedToastId()) {
      clearTimeout(snoozeToastTimer);
      setSnoozedToastId(null);
    }
    if (nextScopeState.bulkDismissPending !== bulkDismissPending()) {
      clearTimeout(bulkDismissTimer);
      setBulkDismissPending(false);
    }
  });
  createEffect(() => {
    if (bulkDismissPending() && oldCardCount() === 0) {
      clearTimeout(bulkDismissTimer);
      setBulkDismissPending(false);
    }
  });
  createEffect(() => { activeTypes(); setVisibleCount(PAGE_SIZE); });
  createEffect(() => { activeSupertag(); setActiveTopicKind(null); setVisibleCount(PAGE_SIZE); });
  createEffect(() => { activeTopicKind(); setVisibleCount(PAGE_SIZE); });

  const allMessageTypes = createMemo(() => {
    const types = new Set<string>();
    for (const m of availableRenderableMessages()) types.add(m.type);
    return [...types];
  });

  createEffect(() => {
    const nextTypes = pruneDashboardFeedActiveTypes(activeTypes(), allMessageTypes());
    if (nextTypes.size !== activeTypes().size) {
      setActiveTypes(nextTypes);
    }
  });


  const activeSupertagDefinition = createMemo<SupertagDefinitionRecord | null>(() => {
    const selected = activeSupertag();
    const definitions = metadataState()?.definitions ?? [];
    if (!selected || definitions.length === 0) return null;
    const key = normalizeSupertagKey(selected);
    return (
      definitions.find((definition) => normalizeSupertagKey(definition.tag_name) === key) ?? null
    );
  });

  createEffect(() => {
    if (showDismissed() && dismissedScopedCount() === 0) {
      setShowDismissed(false);
    }
  });

  function clearFeedFilters() {
    setActiveTypes(new Set<string>());
    setActiveSupertag(null);
    setActiveTopicKind(null);
  }

  onMount(() => {
    const id = setInterval(() => setTick((n) => n + 1), 60_000);

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        if (activeTypes().size === 0 && !activeSupertag() && !activeTopicKind()) return;
        e.preventDefault();
        recordShortcutUse("filter_reset");
        clearFeedFilters();
        return;
      }
      if (e.key === "Escape") { setFocusedCardId(null); return; }
      if (e.key !== "f" || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      e.preventDefault();
      filterRowRef?.querySelector("button")?.focus();
    }
    document.addEventListener("keydown", onKeyDown);

    onCleanup(() => { clearInterval(id); document.removeEventListener("keydown", onKeyDown); });
  });

  const openThreadSummaries = createMemo(() => {
    return collectDashboardFeedOpenThreadSummaries(
      filteredRenderableMessages(),
      dashboardBootstrapThreadSummaries(props.bootstrap),
    );
  });

  const typeCountMap = createMemo(() => {
    const map = new Map<string, number>();
    for (const m of availableRenderableMessages()) {
      map.set(m.type, (map.get(m.type) ?? 0) + 1);
    }
    return map;
  });

  const typeSpark = createMemo(() => {
    return buildDashboardFeedActivitySpark(filteredRenderableMessages());
  });

  return (
    <div class="space-y-4">
      <Show when={Boolean(props.onNavigate)}>
        <WorkspaceSetupBanner
          signedIn={props.signedIn ?? false}
          onNavigate={(view, hint) => props.onNavigate!(view, hint)}
        />
      </Show>
      <div class={`glass-surface rounded-[24px] border p-5 shadow-panel transition-colors ${activeTypes().size > 0 ? "border-primary/35 border-t-[3px]" : "border-white/40"}`}>
        <div class="flex items-center justify-between gap-2">
          <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">Agent feed</p>
          <div class="flex items-center gap-3">
            <Show when={newCardCount() > 0}>
              <button
                type="button"
                onClick={markAllRead}
                title="Mark all cards as read"
                class="flex items-center gap-1 text-[10px] text-primary/70 transition hover:text-primary"
              >
                <span class="h-1.5 w-1.5 rounded-full bg-primary animate-pulse flex-shrink-0" />
                {newCardCount()} new | mark read
              </button>
            </Show>
            <Show when={pinnedFilteredIds().length > 0}>
              <button
                type="button"
                onClick={() => scrollToPinned(pinnedNavIdx())}
                title="Click to scroll to pinned card"
                class="font-mono text-[10px] text-primary/70 transition hover:text-primary"
              >
                {pinnedFilteredIds().length} pinned up
              </button>
            </Show>
            <Show when={dismissedScopedCount() > 0}>
              <button
                type="button"
                onClick={() => setShowDismissed((v) => !v)}
                class="text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
              >
                {dismissedScopedCount()} dismissed {showDismissed() ? "open" : "closed"}
              </button>
            </Show>
            <Show when={oldCardCount() > 0 && !bulkDismissPending()} fallback={
              <Show when={bulkDismissPending()}>
                <div class="flex items-center gap-[0.6em]">
                  <button
                    type="button"
                    onClick={confirmBulkDismiss}
                    class="text-[10px] text-red-500 transition hover:text-red-400"
                  >
                    Dismiss {oldCardCount()} old?
                  </button>
                  <button
                    type="button"
                    onClick={() => { clearTimeout(bulkDismissTimer); setBulkDismissPending(false); }}
                    class="text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
                  >
                    x
                  </button>
                </div>
              </Show>
            }>
              <button
                type="button"
                onClick={startBulkDismiss}
                title="Dismiss all non-pinned cards older than 72h"
                class="text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
              >
                Dismiss old ({oldCardCount()})
              </button>
            </Show>
            <Show
              when={resetPending()}
              fallback={
                <button
                  type="button"
                  onClick={startReset}
                  class="text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
                >
                  Reset layout
                </button>
              }
            >
              <div class="flex items-center gap-[0.6em]">
                <button
                  type="button"
                  onClick={confirmReset}
                  class="text-[10px] text-red-500 transition hover:text-red-400"
                >
                  Confirm reset
                </button>
                <button
                  type="button"
                  onClick={() => { clearTimeout(resetTimer); setResetPending(false); }}
                  class="text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
                >
                  x
                </button>
              </div>
            </Show>
          </div>
        </div>
        <Show when={allMessageTypes().length > 1}>
          <div ref={filterRowRef} class="mt-2 flex flex-wrap gap-1.5" title="Press F to focus filters">
            <For each={allMessageTypes()}>
              {(type) => (
                <button
                  type="button"
                  title="Click to toggle | Right-click to isolate"
                  onClick={() => setActiveTypes((prev) => {
                    const next = new Set(prev);
                    if (next.has(type)) next.delete(type);
                    else next.add(type);
                    return next;
                  })}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setActiveTypes(new Set([type]));
                  }}
                  class={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] transition ${
                    activeTypes().has(type)
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-white/25 bg-white/15 text-on-surface-variant/50 hover:bg-white/30"
                  }`}
                >
                  {messageTypeLabel(type)}
                  <span class="ml-[0.3em] tabular-nums opacity-60">({typeCountMap().get(type) ?? 0})</span>
                </button>
              )}
            </For>
            <Show when={activeTypes().size > 0}>
              <button
                type="button"
                onClick={() => setActiveTypes(new Set())}
                class="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-mono text-[9px] text-on-surface-variant/40 transition hover:bg-white/20 hover:text-on-surface-variant"
              >
                clear x
              </button>
            </Show>
            <Show when={!filterHintSeen()}>
              <kbd class="ml-auto self-center rounded border border-on-surface/15 bg-on-surface/5 px-1.5 py-0.5 font-mono text-[9px] text-on-surface-variant/30 select-none">f</kbd>
            </Show>
          </div>
        </Show>
        <Show when={showTopicLensControls()}>
          <div class="mt-2 flex flex-wrap items-center gap-1.5">
            <span class="font-mono text-[9px] uppercase tracking-[0.16em] text-outline">
              Topic lens
            </span>
            <For each={visibleTopicLensTags()}>
              {(entry) => (
                <button
                  type="button"
                  onClick={() => setActiveSupertag((current) => current === entry.tag ? null : entry.tag)}
                  class={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] transition ${
                    activeSupertag() === entry.tag
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-white/25 bg-white/15 text-on-surface-variant/55 hover:bg-white/30"
                  }`}
                  title={`Browse messages tagged ${entry.tag}`}
                >
                  #{entry.tag}
                  <span class="ml-[0.3em] tabular-nums opacity-60">({entry.count})</span>
                </button>
              )}
            </For>
            <Show when={activeSupertag()}>
              <button
                type="button"
                onClick={() => setActiveSupertag(null)}
                class="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-mono text-[9px] text-on-surface-variant/40 transition hover:text-on-surface-variant"
              >
                clear topic x
              </button>
            </Show>
            <Show when={topicLensLoading()}>
              <span class="text-[10px] text-on-surface-variant/45">Loading topic...</span>
            </Show>
            <Show when={metadataState()?.supertagsError || metadataState()?.definitionsError}>
              <button
                type="button"
                onClick={retrySupertagMetadata}
                class="rounded-full border border-amber-200/60 bg-amber-50/80 px-2.5 py-0.5 text-[10px] font-medium text-amber-800 transition hover:bg-amber-50"
                title="Retry topic metadata"
              >
                Retry topic metadata
              </button>
            </Show>
          </div>
          <Show when={topicLensError()}>
            <div class="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200/70 bg-amber-50/85 px-3 py-2 text-xs text-amber-800 shadow-card">
              <span>{topicLensError()}</span>
              <button
                type="button"
                onClick={retryTopicLens}
                class="rounded-full border border-amber-200/70 bg-white/80 px-2.5 py-1 text-[10px] font-medium text-amber-800 transition hover:bg-white"
              >
                Retry topic lens
              </button>
            </div>
          </Show>
          <Show when={activeSupertag() && visibleTopicKinds().length > 0}>
            <div class="mt-2 flex flex-wrap items-center gap-1.5">
              <span class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline">
                kind lens
              </span>
              <For each={visibleTopicKinds()}>
                {(entry) => (
                  <button
                    type="button"
                    onClick={() => setActiveTopicKind((current) => current === entry.kind ? null : entry.kind)}
                    class={`rounded-full border px-2.5 py-0.5 font-mono text-[9px] transition ${
                      activeTopicKind() === entry.kind
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-white/20 bg-white/10 text-on-surface-variant/55 hover:bg-white/20"
                    }`}
                    title={`Browse ${objectKindLabel(entry.kind)} in #${activeSupertag()}`}
                  >
                    {objectKindLabel(entry.kind)}
                    <span class="ml-[0.3em] tabular-nums opacity-60">({entry.count})</span>
                  </button>
                )}
              </For>
              <Show when={activeTopicKind()}>
                <button
                  type="button"
                  onClick={() => setActiveTopicKind(null)}
                  class="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 font-mono text-[9px] text-on-surface-variant/40 transition hover:text-on-surface-variant"
                >
                  clear kind x
                </button>
              </Show>
            </div>
          </Show>
          <Show when={activeSupertagDefinition()}>
            {(definition) => (
              <div class="mt-2 rounded-2xl border border-white/12 bg-white/5 px-3 py-2">
                <div class="flex flex-wrap items-center gap-1.5">
                  <span class="font-mono text-[9px] uppercase tracking-[0.16em] text-outline">
                    hierarchy
                  </span>
                  <span class="rounded-full border border-white/12 bg-white/10 px-2 py-0.5 font-mono text-[9px] text-on-surface-variant/75">
                    mode {definition().hierarchy_mode}
                  </span>
                  <Show when={definition().parent_tags.length > 0}>
                    <span class="text-[10px] text-on-surface-variant/60">
                      parents {definition().parent_tags.map((tag) => `#${tag}`).join(", ")}
                    </span>
                  </Show>
                  <Show when={definition().alias_tags.length > 0}>
                    <span class="text-[10px] text-on-surface-variant/60">
                      aliases {definition().alias_tags.map((tag) => `#${tag}`).join(", ")}
                    </span>
                  </Show>
                </div>
              </div>
            )}
          </Show>
        </Show>
        <Show when={typeSpark() !== null}>
          <div class="mt-2 flex items-end gap-[2px]" title="7-day message activity">
            <For each={typeSpark()!.totals}>
              {(count, i) => (
                <div
                  class="flex-1 min-w-0 rounded-sm transition-all"
                  style={`height: ${count > 0 ? Math.max(4, Math.round((count / typeSpark()!.max) * 24)) : 2}px; background: ${count > 0 ? "rgba(49,86,142,0.32)" : "rgba(0,0,0,0.06)"}`}
                  title={`${typeSpark()!.labels[i()]}: ${count} message${count === 1 ? "" : "s"}`}
                />
              )}
            </For>
          </div>
        </Show>
        <Show when={showDismissed() && dismissedMessages().length > 0}>
          <div class="mt-3 space-y-1 rounded-xl border border-white/20 bg-white/10 p-3 animate-fade-in">
            <div class="flex items-center justify-between mb-2">
              <p class="font-mono text-[9px] uppercase tracking-[0.18em] text-outline">Dismissed cards</p>
              <button
                type="button"
                onClick={() => {
                  const scopedDismissedIds = new Set(dismissedMessages().map((message) => message.id));
                  restoreDismissedIds(scopedDismissedIds);
                  setShowDismissed(false);
                }}
                class="text-[10px] text-on-surface-variant/40 transition hover:text-on-surface-variant"
              >
                Restore all
              </button>
            </div>
            <For each={dismissedMessages()}>
              {(msg) => (
                <div class="flex items-center justify-between gap-2 rounded-lg bg-white/10 px-3 py-1.5">
                  <span class="font-mono text-[9px] uppercase tracking-[0.12em] text-on-surface-variant truncate">
                    {messageTypeLabel(msg.type)} | {msg.id.slice(0, 8)}
                  </span>
                  <button
                    type="button"
                    onClick={() => restoreDismissedIds(new Set([msg.id]))}
                    class="flex-shrink-0 rounded-full border border-white/30 bg-white/30 px-2 py-0.5 text-[10px] text-primary transition hover:bg-white/50"
                  >
                    Restore
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
        <h3 class="mt-2 text-lg font-semibold text-on-surface">Messages &amp; summaries</h3>
        <Show
          when={commandSummaryText()}
          fallback={
            <p class="mt-2 text-sm leading-7 text-on-surface-variant">
              Drag the handle bar to reorder cards. Resize with the corner handle. Click pin to pin a card in place.
            </p>
          }
        >
          <div class="mt-2 group">
            <p class={`whitespace-pre-line text-sm leading-7 text-on-surface-variant ${summaryExpanded() ? "" : "line-clamp-3"}`}>
              {commandSummaryText()}
            </p>
            <Show when={commandSummaryText().length > 160}>
              <button
                type="button"
                onClick={() => setSummaryExpanded((v) => !v)}
                class="mt-0.5 text-[10px] font-medium text-primary hover:text-primary/70 transition"
              >
                {summaryExpanded() ? "Show less" : "Show more"}
              </button>
            </Show>
          </div>
        </Show>
        <Show when={openThreadSummaries().length > 0 && Boolean(props.onOpenThread)}>
          <div class="mt-4 flex flex-wrap gap-2">
            <ThreadDiscoveryStateSummary
              class="w-full rounded-2xl border border-primary/20 bg-primary/8 px-4 py-3 shadow-card backdrop-blur"
              state={dashboardBootstrapThreadRetrievalState(props.bootstrap)}
            />
            <Show when={threadSummaryRefineQuery(openThreadSummaries()[0])}>
              {(query) => (
                <button
                  type="button"
                  onClick={() =>
                    openThreadSearch({
                      query: query(),
                      launchContext: {
                        sourceLabel: "Dashboard feed",
                        reason: "Refine the currently surfaced thread neighborhood",
                      },
                    })
                  }
                  class="rounded-full border border-primary/20 bg-primary/8 px-3 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/14"
                >
                  Refine thread search
                </button>
              )}
            </Show>
            <span class="self-center font-mono text-[9px] uppercase tracking-[0.2em] text-outline">
              Open thread
            </span>
            <For each={openThreadSummaries()}>
              {(summary) => {
                const primary = () => threadSummaryPrimaryText(summary);
                const meta = () => threadSummaryMetaLine(summary, 1);
                return (
                  <button
                    type="button"
                    onClick={() => props.onOpenThread!(summary.thread_id)}
                    title={primary()}
                    class="flex items-center gap-1.5 rounded-full border border-white/40 bg-white/40 px-3 py-1 font-mono text-[10px] text-on-surface transition hover:bg-white/60"
                  >
                    {meta() ?? primary()}
                  </button>
                );
              }}
            </For>
          </div>
        </Show>
      </div>

      <Show when={props.bootstrap === null}>
        <div class="space-y-3">
          {[0, 1, 2].map(() => (
            <div class="animate-pulse rounded-[20px] border border-white/20 bg-white/15 shadow-panel">
              <div class="flex items-center justify-between border-b border-white/10 bg-white/10 px-4 py-2">
                <div class="h-2.5 w-24 rounded-full bg-white/30" />
                <div class="h-2.5 w-10 rounded-full bg-white/20" />
              </div>
              <div class="space-y-2 p-4">
                <div class="h-3 w-3/4 rounded-full bg-white/25" />
                <div class="h-3 w-1/2 rounded-full bg-white/20" />
              </div>
            </div>
          ))}
        </div>
      </Show>

      <Show
        when={props.bootstrap !== null && renderUnits().length > 0}
        fallback={
          <Show when={props.bootstrap !== null}>
            <div class="glass-surface rounded-[22px] border border-dashed border-white/35 p-5 shadow-panel">
              <Show
              when={hasActiveFeedFilters()}
              fallback={
                  <Show when={dismissedScopedCount() > 0 || snoozedScopedCount() > 0} fallback={<>
                    <p class="text-sm text-on-surface-variant">Your agents haven't sent anything yet.</p>
                    <p class="mt-2 text-xs font-medium text-primary">
                      {"-> "}Try asking a question above, or activate an agent in <strong class="text-on-surface">Workflows</strong>.
                    </p>
                  </>}>
                    <div class="flex flex-col items-center gap-2 py-2 text-center animate-fade-in">
                      <p class="text-base font-semibold text-on-surface">All caught up</p>
                      <p class="text-xs text-on-surface-variant/60">{allCaughtUpSummaryParts().join(" | ")}</p>
                      <Show when={dismissedScopedCount() > 0}>
                        <button
                          type="button"
                          onClick={() => restoreDismissedIds(new Set(dismissedMessages().map((message) => message.id)))}
                          class="mt-1 rounded-full border border-primary/25 bg-primary/8 px-4 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/15"
                        >
                          Restore all {"->"}
                        </button>
                      </Show>
                    </div>
                  </Show>
                }
              >
                <p class="text-sm text-on-surface-variant">No messages match the active filter.</p>
                <div class="mt-2 flex items-center gap-3">
                  <Show when={activeTypes().size > 0}>
                    <button
                    type="button"
                    onClick={() => setActiveTypes(new Set())}
                    class="text-xs font-medium text-primary transition hover:text-primary/70"
                  >
                    Clear type filter {"->"}
                    </button>
                  </Show>
                  <Show when={activeTopicKind()}>
                    <button
                      type="button"
                      onClick={() => setActiveTopicKind(null)}
                      class="text-xs font-medium text-primary transition hover:text-primary/70"
                    >
                      Clear kind lens {"->"}
                    </button>
                  </Show>
                  <Show when={activeSupertag()}>
                    <button
                      type="button"
                      onClick={() => setActiveSupertag(null)}
                      class="text-xs font-medium text-primary transition hover:text-primary/70"
                    >
                      Clear topic lens {"->"}
                    </button>
                  </Show>
                </div>
              </Show>
            </div>
          </Show>
        }
      >
        <div ref={(el) => { gridEl = el; }} class="grid-stack">
          <For each={renderUnits()}>
            {(unit) => {
              const msg = unit.kind === "generative_card" ? unit.card : unit.message;
              return (
                <div
                  class={`grid-stack-item ${raisedCardId() === msg.id ? "dashboard-feed-item-elevated" : ""}`}
                  data-msg-id={msg.id}
                  gs-id={msg.id}
                  gs-w="12"
                  gs-h={String(cardGridHeight(msg, !collapsed().has(msg.id)))}
                  gs-size-to-content="true"
                >
                  <div class={`dashboard-feed-card grid-stack-item-content group relative rounded-[20px] border shadow-panel backdrop-blur-sm transition-colors ${
                    pinned().has(msg.id)
                      ? "border-primary/30 bg-primary/5 border-l-2 border-l-primary/60"
                      : `border-white/35 bg-white/20 ${cardAgeOpacity(msg.timestamp)}`
                  }`} onContextMenu={(event) => openFeedContextMenu(event, msg.id)} onPointerDown={() => bringCardToFront(msg.id)}>
                    <Show when={!pinned().has(msg.id)}>
                      <div
                        class="drag-handle absolute left-0 top-0 z-10 flex h-full w-4 cursor-grab items-center justify-center active:cursor-grabbing"
                        title={`Drag to reorder. Right-click to toggle ${messageTypeLabel(msg.type)} filter`}
                        onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setActiveTypes((prev) => { const next = new Set(prev); if (next.has(msg.type)) next.delete(msg.type); else next.add(msg.type); return next; }); }}
                      >
                        <div
                          class="pointer-events-none h-[82%] w-[4px] rounded-full"
                          style={`background: hsl(${typeHue(msg.type)}, 50%, 60%); opacity: 0.72`}
                        />
                      </div>
                    </Show>
                    <div
                      class={`${pinned().has(msg.id) ? "flex cursor-default" : "drag-handle flex cursor-grab active:cursor-grabbing"} select-none items-start justify-between gap-3 px-4 pt-4`}
                      tabIndex={pinned().has(msg.id) ? -1 : 0}
                      aria-label={pinned().has(msg.id)
                        ? `Card ${messageTypeLabel(msg.type)} - pinned in place.`
                        : `Card ${messageTypeLabel(msg.type)} - drag handle. Alt+Up/Down to reorder.`}
                      title={pinned().has(msg.id) ? "Pinned in place" : "Drag to reorder"}
                      onKeyDown={(e) => {
                        if (pinned().has(msg.id)) return;
                        if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                        e.preventDefault();
                        const item = (e.currentTarget as HTMLElement).closest(".grid-stack-item") as HTMLElement | null;
                        if (!item || !gs) return;
                        const currentY = parseInt(item.getAttribute("gs-y") ?? "0");
                        const dir = e.key === "ArrowUp" ? -1 : 1;
                        const newY = Math.max(0, currentY + dir);
                        if (newY !== currentY) {
                          gs.update(item, { y: newY });
                          const visibleIds = renderUnits().map((unit) => (unit.kind === "generative_card" ? unit.card.id : unit.message.id));
                          saveDashboardFeedGridLayout(LAYOUT_KEY, gs, visibleIds);
                        }
                        (e.currentTarget as HTMLElement).focus();
                      }}
                    >
                      <div class="min-w-0 flex-1" data-msg-id={msg.id}>
                        <div class="flex flex-wrap items-center gap-2.5">
                        <span class="text-xs leading-none text-on-surface-variant opacity-40">{pinned().has(msg.id) ? "pin" : "drag"}</span>
                        <Show when={(msg.timestamp ? new Date(msg.timestamp).getTime() : 0) > lastReadAt()}>
                          <span class="h-2 w-2 flex-shrink-0 rounded-full bg-primary shadow-sm" title="New since last read" />
                        </Show>
                        <span class="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface/80">
                          {messageTypeLabel(msg.type)}
                        </span>
                        <Show when={msg.timestamp}>
                          {/* tick() read ensures the memo re-evaluates every minute */}
                          <button
                            type="button"
                            title={`Inspect AFP message | ${absoluteUtcTimestamp(msg.timestamp)}`}
                            onClick={(e) => { e.stopPropagation(); dispatchAfpInspectEvent(msg); }}
                            class="rounded-full border border-white/40 bg-white/70 px-2.5 py-1 font-mono text-[10px] text-on-surface/75 shadow-sm transition hover:border-primary/30 hover:bg-white hover:text-primary"
                          >
                            {(tick(), displayTimestamp(msg.timestamp))}
                          </button>
                        </Show>
                        <Show when={Boolean(props.onOpenThread) && Boolean(msg.thread_id)}>
                          <button
                            type="button"
                            title="Open thread"
                            onClick={() => props.onOpenThread!(msg.thread_id)}
                            class="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-mono text-[10px] font-medium text-primary shadow-sm transition hover:bg-primary/18"
                          >
                            Thread
                          </button>
                        </Show>
                        {(() => {
                          const parts = (msg.from ?? "").split("/").filter(Boolean);
                          const role = parts[parts.length - 2] ?? "";
                          const isUser = role === "user" || role === "workspace";
                          const name = (parts[parts.length - 1] ?? "").replace(/_/g, " ");
                          return !isUser && name ? (
                            <span class="font-mono text-[10px] text-on-surface/55">
                              {name}
                            </span>
                          ) : null;
                        })()}
                        </div>
                      </div>
                      <div
                        class="dashboard-feed-card-actions flex flex-wrap items-center justify-end gap-1.5"
                        onPointerDown={stopCardActionPointer}
                        onClick={stopCardActionClick}
                      >
                        <button
                          type="button"
                          title={pinned().has(msg.id) ? "Pinned - click to unpin" : "Click to pin in place"}
                          class={`rounded-full border px-3 py-1 text-[10px] font-medium shadow-sm transition ${
                            pinned().has(msg.id)
                              ? "border-primary/30 bg-primary/12 text-primary"
                              : "border-white/40 bg-white/72 text-on-surface/72 hover:border-primary/20 hover:bg-white"
                          }`}
                          onPointerDown={stopCardActionPointer}
                          onClick={(e) => { e.stopPropagation(); togglePin(msg.id); }}
                        >
                          {pinned().has(msg.id) ? "pinned" : "pin"}
                        </button>
                        <button
                          type="button"
                          aria-expanded={!collapsed().has(msg.id)}
                          title={collapsed().has(msg.id) ? "Expand card" : "Collapse card"}
                          class="rounded-full border border-white/40 bg-white/72 px-3 py-1 font-medium text-[10px] text-on-surface/72 shadow-sm transition hover:border-primary/20 hover:bg-white"
                          onPointerDown={stopCardActionPointer}
                          onClick={(e) => { e.stopPropagation(); toggleCollapse(msg.id); }}
                        >
                          {collapsed().has(msg.id) ? "closed" : "open"}
                        </button>
                        <Show when={!pinned().has(msg.id)}>
                          <div class="relative">
                            <button
                              type="button"
                              title="Snooze card"
                              class="rounded-full border border-white/40 bg-white/72 px-3 py-1 font-medium text-[10px] text-on-surface/72 shadow-sm transition hover:border-primary/20 hover:bg-white"
                              onClick={(e) => { e.stopPropagation(); setSnoozePickerId((prev) => prev === msg.id ? null : msg.id); setSnoozePickerDays(0); setSnoozePickerHours(1); }}
                            >
                              snooze
                            </button>
                            <Show when={snoozePickerId() === msg.id}>
                              <div class="absolute right-0 top-full z-30 mt-1 w-52 animate-fade-in rounded-2xl border border-white/45 bg-white/97 p-3 shadow-panel backdrop-blur-xl">
                                <p class="mb-2 font-mono text-[8px] uppercase tracking-[0.15em] text-outline">Snooze for</p>
                                <div class="flex flex-wrap gap-1 mb-2.5">
                                  {([
                                    { label: "1h", ms: 3_600_000 },
                                    { label: "4h", ms: 14_400_000 },
                                    { label: "8h", ms: 28_800_000 },
                                    { label: "1d", ms: 86_400_000 },
                                    { label: "3d", ms: 259_200_000 },
                                  ] as const).map(({ label, ms }) => (
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); snoozeCard(msg.id, ms); }}
                                      class="rounded-full border border-primary/25 bg-primary/8 px-2.5 py-0.5 text-[10px] font-medium text-primary transition hover:bg-primary/15"
                                    >{label}</button>
                                  ))}
                                </div>
                                <div class="flex items-center gap-1 border-t border-white/30 pt-2">
                                  <input
                                    type="number"
                                    min="0"
                                    max="30"
                                    value={snoozePickerDays()}
                                    onInput={(e) => setSnoozePickerDays(Math.max(0, parseInt(e.currentTarget.value) || 0))}
                                    class="w-11 rounded-md border border-white/30 bg-white/50 px-1.5 py-0.5 text-center text-[10px] text-on-surface outline-none focus:border-primary/40"
                                  />
                                  <span class="text-[9px] text-on-surface-variant/50">d</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="23"
                                    value={snoozePickerHours()}
                                    onInput={(e) => setSnoozePickerHours(Math.max(0, Math.min(23, parseInt(e.currentTarget.value) || 0)))}
                                    class="w-11 rounded-md border border-white/30 bg-white/50 px-1.5 py-0.5 text-center text-[10px] text-on-surface outline-none focus:border-primary/40"
                                  />
                                  <span class="text-[9px] text-on-surface-variant/50">h</span>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); const ms = snoozePickerDays() * 86_400_000 + snoozePickerHours() * 3_600_000; if (ms > 0) snoozeCard(msg.id, ms); }}
                                    class="ml-auto rounded-md bg-primary/10 px-2.5 py-0.5 text-[10px] font-medium text-primary transition hover:bg-primary/20"
                                  >set</button>
                                </div>
                              </div>
                            </Show>
                          </div>
                          <button
                            type="button"
                            title="Dismiss card"
                            class="rounded-full border border-rose-200/70 bg-rose-50/90 px-3 py-1 font-medium text-[10px] text-rose-700 shadow-sm transition hover:bg-rose-100"
                            onClick={() => dismissCard(msg.id)}
                          >
                            dismiss
                          </button>
                        </Show>
                      </div>
                    </div>
                    <Show when={!collapsed().has(msg.id)}>
                    {(() => {
                      let swipeX = 0;
                      let swipeY = 0;
                      return (
                        <div
                          class="px-4 pb-4 pt-3 min-h-[60px]"
                          onDblClick={() => setFocusedCardId(msg.id)}
                          onPointerDown={(e) => { swipeX = e.clientX; swipeY = e.clientY; }}
                          onPointerUp={(e) => {
                            const dx = e.clientX - swipeX;
                            const dy = Math.abs(e.clientY - swipeY);
                            const emPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
                            if (dx > 3 * emPx && dy < dx * 0.7 && !pinned().has(msg.id)) {
                              snoozeCard(msg.id, 3_600_000);
                            } else if (dx < -(3 * emPx) && dy < Math.abs(dx) * 0.7) {
                              togglePin(msg.id);
                            }
                          }}
                        >
                      <div class="space-y-3">
                        {unit.kind === "generative_card" ? (
                          <ViewDispatcher
                            message={unit.card}
                            cardUpdates={unit.updates}
                          />
                        ) : unit.kind === "ledger_board" ? (
                          <ViewDispatcher
                            message={unit.message}
                            taskUpdates={unit.taskUpdates}
                          />
                        ) : (
                          <ViewDispatcher message={msg} />
                        )}
                        <Show when={props.advanced}>
                          <AlternateViewsInspector
                            message={unit.kind === "generative_card" ? unit.card : msg}
                            cardUpdates={unit.kind === "generative_card" ? unit.updates : undefined}
                            compact
                          />
                        </Show>
                      </div>
                        </div>
                      );
                    })()}
                    </Show>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
        <div class="mt-3 flex flex-wrap items-center justify-center gap-3">
          <p class="font-mono text-[0.65em] text-on-surface-variant/50">
            Showing {visibleRenderableCount()} of {filteredRenderableMessages().length}
            <Show when={hasActiveFeedFilters() && filteredOutRenderableCount() > 0}>
              <span> &middot; {filteredOutRenderableCount()} filtered out</span>
            </Show>
          </p>
          <Show when={filteredRenderableMessages().length > visibleCount()}>
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
              class="rounded-full border border-white/35 bg-white/35 px-4 py-1.5 font-mono text-[0.75em] text-on-surface-variant transition hover:bg-white/50"
            >
              Show more
            </button>
          </Show>
        </div>
      </Show>
      <Show when={feedContextMenu()} keyed>
        {(menu) => {
          const targetMessage = () =>
            renderUnits()
              .map((unit) => (unit.kind === "generative_card" ? unit.card : unit.message))
              .find((message) => message.id === menu.msgId);
          return (
            <Portal>
              <div
                class="fixed inset-0 z-[130]"
                onPointerDown={() => closeFeedContextMenu()}
                onContextMenu={(event) => {
                  event.preventDefault();
                  closeFeedContextMenu();
                }}
              >
                <div
                  class="absolute w-52 rounded-2xl border border-white/55 bg-white/96 p-2 shadow-panel backdrop-blur-xl"
                  style={{ left: `${menu.x}px`, top: `${menu.y}px` }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  <div class="px-2 pb-2 pt-1">
                    <p class="truncate text-sm font-semibold text-on-surface">{messageTypeLabel(targetMessage()?.type ?? "message")}</p>
                    <p class="font-mono text-[10px] uppercase tracking-[0.14em] text-on-surface-variant/55">Card actions</p>
                  </div>
                  <div class="space-y-1">
                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                      onClick={() => {
                        togglePin(menu.msgId);
                        closeFeedContextMenu();
                      }}
                    >
                      <span>{pinned().has(menu.msgId) ? "Unpin card" : "Pin card"}</span>
                      <span class="font-mono text-[10px] text-on-surface-variant/55">pin</span>
                    </button>
                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                      onClick={() => {
                        toggleCollapse(menu.msgId);
                        closeFeedContextMenu();
                      }}
                    >
                      <span>{collapsed().has(menu.msgId) ? "Expand card" : "Collapse card"}</span>
                      <span class="font-mono text-[10px] text-on-surface-variant/55">{collapsed().has(menu.msgId) ? "open" : "compact"}</span>
                    </button>
                    <Show when={!pinned().has(menu.msgId)}>
                      <>
                        <button
                          type="button"
                          class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                          onClick={() => {
                            snoozeCard(menu.msgId, 3_600_000);
                            closeFeedContextMenu();
                          }}
                        >
                          <span>Snooze 1 hour</span>
                          <span class="font-mono text-[10px] text-on-surface-variant/55">1h</span>
                        </button>
                        <button
                          type="button"
                          class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                          onClick={() => {
                            snoozeCard(menu.msgId, 86_400_000);
                            closeFeedContextMenu();
                          }}
                        >
                          <span>Snooze 1 day</span>
                          <span class="font-mono text-[10px] text-on-surface-variant/55">1d</span>
                        </button>
                        <button
                          type="button"
                          class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-rose-700 transition hover:bg-rose-50/85"
                          onClick={() => {
                            dismissCard(menu.msgId);
                            closeFeedContextMenu();
                          }}
                        >
                          <span>Dismiss card</span>
                          <span class="font-mono text-[10px] text-rose-500/80">hide</span>
                        </button>
                      </>
                    </Show>
                    <Show when={Boolean(props.onOpenThread) && Boolean(targetMessage()?.thread_id)}>
                      <button
                        type="button"
                        class="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-on-surface transition hover:bg-white/80"
                        onClick={() => {
                          if (targetMessage()?.thread_id) props.onOpenThread?.(targetMessage()!.thread_id);
                          closeFeedContextMenu();
                        }}
                      >
                        <span>Open thread</span>
                        <span class="font-mono text-[10px] text-on-surface-variant/55">open</span>
                      </button>
                    </Show>
                  </div>
                </div>
              </div>
            </Portal>
          );
        }}
      </Show>
      <Show when={undoDismissId() !== null}>
        <Portal>
          <div class="fixed bottom-6 left-1/2 z-[120] -translate-x-1/2 animate-fade-in">
            <ReversibleActionNotice
              status="rejected"
              tone="neutral"
              summary="Card dismissed."
              class="rounded-full border-white/45 bg-white/95 px-4 py-2 text-xs text-on-surface-variant shadow-panel backdrop-blur-xl"
              actionLabel="Undo"
              onAction={undoDismiss}
              actionClass="bg-primary/10 text-primary hover:bg-primary/20"
            />
          </div>
        </Portal>
      </Show>
      <Show when={snoozedToastId() !== null}>
        <Portal>
          <div class="fixed bottom-16 left-1/2 z-[120] -translate-x-1/2 animate-fade-in">
            <div class="flex items-center gap-3 rounded-full border border-white/45 bg-white/95 px-4 py-2 shadow-panel backdrop-blur-xl">
              <span class="text-xs text-on-surface-variant">Card snoozed</span>
              <button
                type="button"
                onClick={() => unsnoozeCard(snoozedToastId()!)}
                class="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary transition hover:bg-primary/20"
              >
                Undo
              </button>
            </div>
          </div>
        </Portal>
      </Show>
      {/* Card focus mode overlay - double-click a card body to activate, ESC or click outside to dismiss */}
      <Show when={focusedCardId() !== null}>
        {(() => {
          const focusedMsg = focusedCardId() ? feedMessageMap().get(focusedCardId()!) : undefined;
          if (!focusedMsg) return null;
          return (
            <div
              class="fixed inset-0 z-[200] flex items-center justify-center bg-on-surface/40 backdrop-blur-md animate-fade-in"
              onClick={() => setFocusedCardId(null)}
            >
              <div
                class="relative mx-4 w-full max-w-3xl max-h-[80vh] overflow-auto rounded-[24px] border border-white/45 bg-white/97 p-6 shadow-panel backdrop-blur-xl animate-slide-down"
                onClick={(e) => e.stopPropagation()}
              >
                <div class="mb-3 flex items-center justify-between">
                  <span class="font-mono text-[9px] uppercase tracking-[0.2em] text-outline">{focusedMsg.type}</span>
                  <button
                    type="button"
                    onClick={() => setFocusedCardId(null)}
                    class="rounded-full border border-white/40 bg-white/40 px-3 py-1 text-xs text-on-surface-variant transition hover:bg-white/60"
                  >
                    x Close (ESC)
                  </button>
                </div>
                <ViewDispatcher message={focusedMsg} />
              </div>
            </div>
          );
        })()}
      </Show>
    </div>
  );
}
