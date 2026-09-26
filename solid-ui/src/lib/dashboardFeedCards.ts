// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";

export function collectDashboardRenderableMessages(messages: AfpMessage[]): AfpMessage[] {
  return messages.filter((message) => message.type !== "card_section_update");
}

export function collectDashboardVisibleCards(messages: AfpMessage[], limit: number): AfpMessage[] {
  return collectDashboardRenderableMessages(messages).slice(0, Math.max(0, limit));
}

export function collectDashboardDismissedMessages(
  messages: AfpMessage[],
  dismissedIds: ReadonlySet<string>,
): AfpMessage[] {
  return collectDashboardRenderableMessages(messages).filter((message) => dismissedIds.has(message.id));
}

export function countDashboardOldCards(
  messages: AfpMessage[],
  dismissedIds: ReadonlySet<string>,
  pinnedIds: ReadonlySet<string>,
  now: number,
): number {
  return collectDashboardRenderableMessages(messages).filter((message) => {
    if (dismissedIds.has(message.id) || pinnedIds.has(message.id)) return false;
    return Math.floor((now - new Date(message.timestamp ?? 0).getTime()) / 1000) > 72 * 3600;
  }).length;
}

export function countDashboardNewCards(
  messages: AfpMessage[],
  lastReadAt: number,
): number {
  return collectDashboardRenderableMessages(messages).filter((message) => {
    const timestamp = message.timestamp ? new Date(message.timestamp).getTime() : 0;
    return timestamp > lastReadAt;
  }).length;
}
