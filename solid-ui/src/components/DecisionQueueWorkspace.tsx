// @locs-version: 1.0
import { createMemo, createSignal, For, onCleanup, onMount } from "solid-js";
import type { DecisionOsQueueBootstrapState } from "@/lib/decisionOsQueueBootstrapState";
import {
  buildQueueEntries,
} from "@/lib/decisionQueueModel";
import { openDecisionQueueEntryTarget } from "@/lib/decisionQueueNavigation";
import { subscribeMagicActionEvent } from "@/lib/magicActionEvent";
import {
  DecisionQueueCard,
  DecisionQueueContextPanel,
} from "@/components/DecisionQueuePanels";
import { EmptyState } from "@/components/EmptyState";
import { QueueWorkspaceLayout } from "@/components/QueueWorkspaceLayout";

const DECISION_QUEUE_EMPTY_STATE_CLASS = "py-10";
const DECISION_QUEUE_EMPTY_STATE_ICON = "DQ";
const DECISION_QUEUE_EMPTY_STATE_TITLE = "Decision queue is clear";
const DECISION_QUEUE_EMPTY_STATE_BODY =
  "No approvals or judgment calls are waiting right now. New continuity decisions will surface here once the workspace has something that needs your call.";

type DecisionQueueWorkspaceProps = {
  queueState: DecisionOsQueueBootstrapState;
  compact?: boolean;
};

export function DecisionQueueWorkspace(props: DecisionQueueWorkspaceProps) {
  const queueState = () => props.queueState;
  const compact = () => props.compact ?? false;
  const queueEntries = createMemo(() => buildQueueEntries(queueState()));
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const compactMode = createMemo(() => compact());

  function findQueueEntryById(entryId: string | null) {
    if (!entryId) return null;
    return queueEntries().find((entry) => entry.id === entryId) ?? null;
  }

  const workspaceState = createMemo(() => {
    const entries = queueEntries();
    const selectedQueueEntry = findQueueEntryById(selectedId()) ?? entries[0] ?? null;

    return {
      entries,
      hasEntries: entries.length > 0,
      selectedQueueEntry,
      selectedQueueEntryId: selectedQueueEntry?.id ?? null,
      showMobilePanel: entries.length > 0 && selectedQueueEntry !== null,
      desktopContextPanelEntry: selectedQueueEntry,
      mobileContextPanelEntry: selectedQueueEntry,
    };
  });

  function selectQueueEntryById(entryId: string) {
    setSelectedId(entryId);
  }

  function clearSelectedQueueEntry() {
    setSelectedId(null);
  }

  function openQueueEntry(entry = workspaceState().selectedQueueEntry) {
    openDecisionQueueEntryTarget(entry);
  }

  function openQueueEntryById(entryId: string) {
    const entry = findQueueEntryById(entryId);
    if (!entry) return;
    selectQueueEntryById(entryId);
    openQueueEntry(entry);
  }

  function isSelectedQueueEntry(entryId: string) {
    return workspaceState().selectedQueueEntryId === entryId;
  }

  function queueEntrySelectAction(entryId: string) {
    return () => selectQueueEntryById(entryId);
  }

  function openDesktopContextQueueEntry() {
    openQueueEntry(workspaceState().desktopContextPanelEntry);
  }

  function openMobileContextQueueEntry() {
    openQueueEntry(workspaceState().mobileContextPanelEntry);
  }

  onMount(() => {
    const unsubscribeMagicActionEvent = subscribeMagicActionEvent(({ action, msgId }) => {
      if (action !== "open" || !msgId) return;
      openQueueEntryById(msgId);
    });
    onCleanup(() => unsubscribeMagicActionEvent());
  });

  return (
    <QueueWorkspaceLayout
      list={
        <For
          each={workspaceState().entries}
          fallback={
            <EmptyState
              icon={DECISION_QUEUE_EMPTY_STATE_ICON}
              title={DECISION_QUEUE_EMPTY_STATE_TITLE}
              body={DECISION_QUEUE_EMPTY_STATE_BODY}
              class={DECISION_QUEUE_EMPTY_STATE_CLASS}
            />
          }
        >
          {(entry) => (
            <DecisionQueueCard
              entry={entry}
              selected={isSelectedQueueEntry(entry.id)}
              onSelect={queueEntrySelectAction(entry.id)}
              compact={compactMode()}
            />
          )}
        </For>
      }
      desktopPanel={
        <DecisionQueueContextPanel
          entry={workspaceState().desktopContextPanelEntry}
          onOpen={openDesktopContextQueueEntry}
        />
      }
      mobileOpen={workspaceState().showMobilePanel}
      mobilePanel={
        <DecisionQueueContextPanel
          entry={workspaceState().mobileContextPanelEntry}
          onOpen={openMobileContextQueueEntry}
          onClose={clearSelectedQueueEntry}
        />
      }
    />
  );
}
