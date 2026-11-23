// @locs-version: 1.0
import type { AfpMessage, DashboardBootstrap } from "./api";

type ActionLogEntry = NonNullable<DashboardBootstrap["action_log"]>[number];

export type ReversibleAuditReviewTarget = {
  threadId: string;
  messageId: string;
};

function candidateMessageIdsForEntry(entry: ActionLogEntry): string[] {
  return [
    entry.reversible_summary?.action_message_id,
    typeof entry.output?.target_message_id === "string" ? entry.output.target_message_id : null,
    typeof entry.output?.revert_result_message_id === "string" ? entry.output.revert_result_message_id : null,
    typeof entry.output?.checkpoint_message_id === "string" ? entry.output.checkpoint_message_id : null,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function lookupKeysForEntry(entry: ActionLogEntry): string[] {
  return [
    entry.reversible_summary?.rollback_checkpoint_id,
    entry.reversible_summary?.provenance_record_id,
    typeof entry.output?.checkpoint_message_id === "string" ? entry.output.checkpoint_message_id : null,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

function messageIdExistsInThread(
  threadId: string,
  messageId: string,
  messages: AfpMessage[],
): boolean {
  return messages.some((message) => message.thread_id === threadId && message.id === messageId);
}

function resolveDirectMessageId(
  entry: ActionLogEntry,
  messages: AfpMessage[],
): string | null {
  for (const messageId of candidateMessageIdsForEntry(entry)) {
    if (messageIdExistsInThread(entry.thread_id, messageId, messages)) {
      return messageId;
    }
  }
  return null;
}

export function resolveReversibleAuditReviewTarget(
  entry: ActionLogEntry,
  actionLog: ActionLogEntry[],
  messages: AfpMessage[],
): ReversibleAuditReviewTarget | null {
  const directMessageId = resolveDirectMessageId(entry, messages);
  if (directMessageId) {
    return {
      threadId: entry.thread_id,
      messageId: directMessageId,
    };
  }

  const lookupKeys = lookupKeysForEntry(entry);
  for (const key of lookupKeys) {
    for (const candidateEntry of actionLog) {
      if (candidateEntry.thread_id !== entry.thread_id) continue;
      const candidateKeys = new Set<string>([
        ...candidateMessageIdsForEntry(candidateEntry),
        ...lookupKeysForEntry(candidateEntry),
      ]);
      if (!candidateKeys.has(key)) continue;
      const candidateMessageId = resolveDirectMessageId(candidateEntry, messages);
      if (candidateMessageId) {
        return {
          threadId: candidateEntry.thread_id,
          messageId: candidateMessageId,
        };
      }
    }
    if (messageIdExistsInThread(entry.thread_id, key, messages)) {
      return {
        threadId: entry.thread_id,
        messageId: key,
      };
    }
  }

  return null;
}
