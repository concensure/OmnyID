// @locs-version: 1.0
import type { PulseNewsChannel, PulseNewsItem } from "@/lib/pulseFeedResponseState";

export function pulseFeedVisibleItems(items: readonly PulseNewsItem[]): PulseNewsItem[] {
  return items.filter((item) => !item.dismissed);
}

export function pulseFeedSelectActiveChannelId(
  channels: readonly PulseNewsChannel[],
  currentChannelId: string | null,
): string | null {
  if (currentChannelId && channels.some((channel) => channel.channel_id === currentChannelId)) {
    return currentChannelId;
  }
  return channels[0]?.channel_id ?? null;
}

export function pulseFeedShouldLoadChannelItems(
  previousActiveChannelId: string | null,
  nextActiveChannelId: string | null,
): boolean {
  return !!nextActiveChannelId && previousActiveChannelId !== nextActiveChannelId;
}

export function pulseFeedUpsertChannel(
  channels: readonly PulseNewsChannel[],
  savedChannel: PulseNewsChannel,
): PulseNewsChannel[] {
  const existingIndex = channels.findIndex((channel) => channel.channel_id === savedChannel.channel_id);
  if (existingIndex === -1) {
    return [...channels, savedChannel];
  }
  return channels.map((channel) =>
    channel.channel_id === savedChannel.channel_id ? savedChannel : channel,
  );
}

export function pulseFeedDeleteChannelState(
  channels: readonly PulseNewsChannel[],
  activeChannelId: string | null,
  deletedChannelId: string,
): { channels: PulseNewsChannel[]; activeChannelId: string | null } {
  const remainingChannels = channels.filter((channel) => channel.channel_id !== deletedChannelId);
  return {
    channels: remainingChannels,
    activeChannelId:
      activeChannelId === deletedChannelId
        ? pulseFeedSelectActiveChannelId(remainingChannels, null)
        : pulseFeedSelectActiveChannelId(remainingChannels, activeChannelId),
  };
}

export function pulseFeedDismissedItems(
  items: readonly PulseNewsItem[],
  dismissedItemId: string,
): PulseNewsItem[] {
  return items.filter((item) => item.id !== dismissedItemId);
}

export function pulseFeedSavedItems(
  items: readonly PulseNewsItem[],
  savedItemId: string,
): PulseNewsItem[] {
  return items.map((item) =>
    item.id === savedItemId ? { ...item, saved_to_knowledge: true } : item,
  );
}
