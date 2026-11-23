// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { utcShortDateLabel } from "@/lib/messageTimestampPresentation";
import {
  threadViewMessageStringValues,
  threadViewSenderLabel,
} from "@/lib/threadViewPresentationState";

export type ThreadViewRenderUnit =
  | { kind: "standalone"; message: AfpMessage }
  | { kind: "generative_card"; card: AfpMessage; updates: AfpMessage[] }
  | { kind: "ledger_board"; message: AfpMessage; taskUpdates: AfpMessage[] };

export type ThreadViewRenderEntry =
  | { kind: "date_separator"; label: string; id: string }
  | { kind: "last_visit_divider"; id: string }
  | ThreadViewRenderUnit;

/** Operational liveness events are not conversation content. */
export function isThreadChatVisibleMessage(message: AfpMessage): boolean {
  return message.type !== "daemon_heartbeat";
}

export function threadViewMessageContentCardId(message: AfpMessage): string | null {
  const cardId = (message.encryption ? decryptedDisplayContent(message) : afpRecord(message.content)).card_id;
  return typeof cardId === "string" || typeof cardId === "number" ? String(cardId) : null;
}

export function threadViewRenderUnitMessage(unit: ThreadViewRenderUnit): AfpMessage {
  return unit.kind === "generative_card" ? unit.card : unit.message;
}

export function threadViewDateLabel(timestamp: string): string {
  return utcShortDateLabel(timestamp);
}

export function threadViewBuildRenderUnits(messages: AfpMessage[]): ThreadViewRenderUnit[] {
  const chatMessages = messages.filter(isThreadChatVisibleMessage);
  const cardMap = new Map<string, AfpMessage>();
  const ledgerBoardMap = new Map<string, AfpMessage>();
  for (const message of chatMessages) {
    if (message.type === "generative_card") {
      const cardId = threadViewMessageContentCardId(message) ?? message.id;
      cardMap.set(cardId, message);
    }
    if (message.type === "task" && message.subtype !== "update") {
      ledgerBoardMap.set(message.id, message);
    }
  }

  const updatesByCardId = new Map<string, AfpMessage[]>();
  const taskUpdatesByBoardId = new Map<string, AfpMessage[]>();
  for (const message of chatMessages) {
    if (message.type === "card_section_update") {
      const cardId = threadViewMessageContentCardId(message) ?? "";
      if (!cardId || !cardMap.has(cardId)) continue;
      const updates = updatesByCardId.get(cardId) ?? [];
      updates.push(message);
      updatesByCardId.set(cardId, updates);
    }
    if (isActiveTodosTaskUpdate(message) && message.parent_id && ledgerBoardMap.has(message.parent_id)) {
      const updates = taskUpdatesByBoardId.get(message.parent_id) ?? [];
      updates.push(message);
      taskUpdatesByBoardId.set(message.parent_id, updates);
    }
  }

  const units: ThreadViewRenderUnit[] = [];
  const seenCardIds = new Set<string>();
  for (const message of chatMessages) {
    if (message.type === "card_section_update") continue;
    if (isActiveTodosTaskUpdate(message) && message.parent_id && ledgerBoardMap.has(message.parent_id)) continue;
    if (message.type === "generative_card") {
      const cardId = threadViewMessageContentCardId(message) ?? message.id;
      if (seenCardIds.has(cardId)) continue;
      seenCardIds.add(cardId);
      units.push({
        kind: "generative_card",
        card: message,
        updates: updatesByCardId.get(cardId) ?? [],
      });
      continue;
    }
    if (ledgerBoardMap.has(message.id)) {
      units.push({
        kind: "ledger_board",
        message,
        taskUpdates: taskUpdatesByBoardId.get(message.id) ?? [],
      });
      continue;
    }
    units.push({ kind: "standalone", message });
  }
  return units;
}

function isActiveTodosTaskUpdate(message: AfpMessage): boolean {
  const metadata = message.metadata && typeof message.metadata === "object" && !Array.isArray(message.metadata)
    ? message.metadata
    : {};
  return message.type === "task"
    && message.subtype === "update"
    && metadata.task_update_source === "active_todos";
}

export function threadViewBuildRawMessageById(units: ThreadViewRenderUnit[]): Map<string, AfpMessage> {
  const map = new Map<string, AfpMessage>();
  for (const unit of units) {
    map.set(threadViewRenderUnitMessage(unit).id, threadViewRenderUnitMessage(unit));
  }
  return map;
}

export function threadViewBuildRenderEntries(
  units: ThreadViewRenderUnit[],
  lastReadId: string | null,
): ThreadViewRenderEntry[] {
  const firstUnreadIndex =
    lastReadId == null
      ? -1
      : units.findIndex((unit, index) => {
          if (index === 0) return false;
          return threadViewRenderUnitMessage(units[index - 1]).id === lastReadId;
        });

  const entries: ThreadViewRenderEntry[] = [];
  let lastDate = "";
  for (const [index, unit] of units.entries()) {
    const message = threadViewRenderUnitMessage(unit);
    if (message.timestamp) {
      const label = threadViewDateLabel(message.timestamp);
      if (label !== lastDate) {
        lastDate = label;
        entries.push({ kind: "date_separator", label, id: `sep-${label}` });
      }
    }
    if (index === firstUnreadIndex) {
      entries.push({ kind: "last_visit_divider", id: `last-visit-${message.id}` });
    }
    entries.push(unit);
  }
  return entries;
}

export function threadViewRenderableEntries(entries: ThreadViewRenderEntry[]): ThreadViewRenderUnit[] {
  return entries.filter((entry): entry is ThreadViewRenderUnit =>
    entry.kind === "standalone" || entry.kind === "generative_card" || entry.kind === "ledger_board"
  );
}

export function threadViewRenderSearchText(message: AfpMessage): string {
  return [...threadViewMessageStringValues(message), message.type].join(" ").toLowerCase();
}

export function threadViewFilterRenderEntriesByQuery(
  entries: ThreadViewRenderEntry[],
  query: string,
): ThreadViewRenderEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return entries;
  return threadViewRenderableEntries(entries).filter((entry) =>
    threadViewRenderSearchText(threadViewRenderUnitMessage(entry)).includes(normalized)
  );
}

export function threadViewFilterRenderEntriesBySender(
  entries: ThreadViewRenderEntry[],
  sender: string | null,
): ThreadViewRenderEntry[] {
  if (!sender) return entries;
  return threadViewRenderableEntries(entries).filter((entry) =>
    threadViewSenderLabel(threadViewRenderUnitMessage(entry).from ?? "agent") === sender
  );
}
