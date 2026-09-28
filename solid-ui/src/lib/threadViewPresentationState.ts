// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import { afpOptionalRecord, afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent, decryptedDisplayStringValues } from "@/lib/decryptedDisplayState";
import { utcShortDateLabel } from "@/lib/messageTimestampPresentation";

const DEFAULT_SENDER_COLOR_CLASSES = [
  "border-l-2 border-l-sky-400/50",
  "border-l-2 border-l-violet-400/50",
  "border-l-2 border-l-emerald-400/50",
  "border-l-2 border-l-rose-400/50",
  "border-l-2 border-l-amber-400/50",
] as const;

export const FEDERATION_SUBJECT_MAX_CHARS = 200;
export const FEDERATION_BODY_MAX_CHARS = 8_000;

export function senderColorClassForThreadView(
  senderName: string,
  senderColors = DEFAULT_SENDER_COLOR_CLASSES,
): string {
  let hash = 0;
  for (let index = 0; index < senderName.length; index += 1) {
    hash = (hash * 31 + senderName.charCodeAt(index)) & 0xffff;
  }
  return senderColors[hash % senderColors.length];
}

export function threadViewSenderLabel(from: string): string {
  const parts = from.split("/").filter(Boolean);
  const raw = parts[parts.length - 1] ?? from;
  return raw.replace(/_/g, " ");
}

export function threadViewSenderRole(from: string): string {
  const parts = from.split("/").filter(Boolean);
  return parts[parts.length - 2] ?? "";
}

export function threadViewMessageStringValues(message: AfpMessage): string[] {
  return decryptedDisplayStringValues(message);
}

export function threadViewMessageTextContent(message: AfpMessage): string {
  return threadViewMessageStringValues(message).join(" ").toLowerCase();
}

export function threadViewMessageWordCount(message: AfpMessage): number {
  return threadViewMessageStringValues(message).join(" ").split(/\s+/).filter(Boolean).length;
}

export function threadViewMessageMetadata(message: AfpMessage): Record<string, unknown> | undefined {
  return afpOptionalRecord(message.metadata);
}

export function threadViewMessageCostCents(message: AfpMessage): number {
  const cost = threadViewMessageMetadata(message)?.cost_cents;
  return typeof cost === "number" ? cost : 0;
}

export function threadViewMessageSmtpId(message: AfpMessage): string | null {
  if (message.type !== "email_inbound" && message.type !== "inbound_email") return null;
  const id = decryptedDisplayContent(message).message_id;
  return typeof id === "string" && id.trim() ? id : null;
}

export function threadViewMentionAliases(displayName: string): string[] {
  const normalized = displayName.trim().toLowerCase();
  if (!normalized) return [];
  const compact = normalized.replace(/[^a-z0-9]+/g, "");
  const underscored = normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const dashed = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const firstWord = normalized.split(/[^a-z0-9]+/).filter(Boolean)[0] ?? "";
  return [...new Set([normalized, compact, underscored, dashed, firstWord].filter(Boolean))];
}

export function threadViewMessageMentionsCurrentUser(message: AfpMessage, aliases: string[]): boolean {
  const text = threadViewMessageTextContent(message);
  if (!text) return false;
  return aliases.some((alias) => {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\w])@${escaped}(?=$|[^\\w-])`, "i").test(text);
  });
}

export function threadViewMessageObjectSearchSeed(message: AfpMessage): string {
  const tokens: string[] = [];
  if (message.kind?.trim()) {
    tokens.push(`kind:${message.kind.trim().toLowerCase()}`);
  }
  for (const tag of (message.supertags ?? []).slice(0, 2)) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) continue;
    tokens.push(`#${normalized}`);
  }
  if (tokens.length === 0) {
    tokens.push(`target:${message.id}`);
  }
  return tokens.join(" ");
}

export function threadViewObjectSearchSeed(messages: AfpMessage[]): string {
  const tagCounts = new Map<string, number>();
  const kindCounts = new Map<string, number>();
  for (const message of messages) {
    if (message.kind?.trim()) {
      const kind = message.kind.trim().toLowerCase();
      kindCounts.set(kind, (kindCounts.get(kind) ?? 0) + 1);
    }
    for (const tag of message.supertags ?? []) {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) continue;
      tagCounts.set(normalized, (tagCounts.get(normalized) ?? 0) + 1);
    }
  }
  const topTag = [...tagCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (topTag) return `#${topTag}`;
  const topKind = [...kindCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  if (topKind) return `kind:${topKind}`;
  return "kind:note";
}

export function threadViewTokenEstimate(messages: AfpMessage[]): number {
  return messages.reduce((accumulator, message) => {
    const chars = threadViewMessageStringValues(message).join(" ").length;
    return accumulator + Math.ceil(chars / 4);
  }, 0);
}

export function threadViewSenderCounts(messages: AfpMessage[]): Array<[string, number]> {
  const counts: Record<string, number> = {};
  for (const message of messages) {
    const name = threadViewSenderLabel(message.from ?? "agent");
    counts[name] = (counts[name] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

export function threadViewAtSuggestions(
  query: string | null,
  agentNames: readonly string[],
): string[] {
  if (query === null) return [];
  return agentNames.filter((agent) => agent.startsWith(query));
}

export function threadViewTotalCostCents(messages: AfpMessage[]): number {
  return messages.reduce((sum, message) => sum + threadViewMessageCostCents(message), 0);
}

export function threadViewTypingTask(messages: AfpMessage[], nowMs = Date.now()): string | null {
  const typingMessage = messages.find(
    (message) =>
      message.type === "daemon_typing"
      && message.timestamp
      && nowMs - new Date(message.timestamp).getTime() < 30_000,
  );
  const rawAction = typingMessage
    ? threadViewMessageMetadata(typingMessage)?.action ?? decryptedDisplayContent(typingMessage).action
    : "";
  const action = typeof rawAction === "string" || typeof rawAction === "number" ? String(rawAction) : "";
  if (action.includes("search") || action.includes("web")) return "Searching the web...";
  if (action.includes("email")) return "Checking email...";
  if (action.includes("read")) return "Reading documents...";
  return action || null;
}

export function threadViewTypingStatusLabel(
  explicitTask: string | null,
  elapsedSeconds: number,
  fallbackLabels: readonly string[],
): string {
  if (explicitTask) return explicitTask;
  const index = Math.min(
    fallbackLabels.length - 1,
    Math.floor(elapsedSeconds / 5) % fallbackLabels.length,
  );
  return fallbackLabels[index];
}

export function threadViewMessageDates(messages: AfpMessage[]): string[] {
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const message of messages) {
    if (!message.timestamp) continue;
    const date = utcShortDateLabel(message.timestamp);
    if (!seen.has(date)) {
      seen.add(date);
      dates.push(date);
    }
  }
  return dates;
}

export type FederationDeliveryStatus = {
  label: string;
  detail: string;
  tone: "pending" | "sent" | "failed";
  attemptedMessageId?: string;
};

export function federationDeliveryStatus(message: AfpMessage): FederationDeliveryStatus | null {
  const content = afpRecord(message.content);
  const metadata = afpRecord(message.metadata);
  if (message.subtype === "federated_outbound") {
    const recipient = typeof content["recipient_agent_id"] === "string"
      ? content["recipient_agent_id"]
      : "peer agent";
    const status = typeof content["delivery_status"] === "string"
      ? content["delivery_status"].replace(/_/g, " ")
      : "pending relay";
    return {
      label: "Federation pending",
      detail: `Queued for ${recipient}; ${status}.`,
      tone: "pending",
    };
  }
  if (message.subtype === "federated_delivery_sent") {
    const attemptedMessageId = typeof content["attempted_message_id"] === "string"
      ? content["attempted_message_id"]
      : typeof metadata["attempted_message_id"] === "string"
        ? metadata["attempted_message_id"]
        : undefined;
    return {
      label: "Federation accepted",
      detail: "Peer homeserver accepted the relay request.",
      tone: "sent",
      attemptedMessageId,
    };
  }
  if (message.subtype === "federated_delivery_failed") {
    const attemptedMessageId = typeof content["attempted_message_id"] === "string"
      ? content["attempted_message_id"]
      : typeof metadata["attempted_message_id"] === "string"
        ? metadata["attempted_message_id"]
        : undefined;
    const error = typeof content["error"] === "string" ? content["error"] : "Delivery failed.";
    return {
      label: "Federation failed",
      detail: error,
      tone: "failed",
      attemptedMessageId,
    };
  }
  return null;
}

export function acceptedFederationAttemptIds(messages: AfpMessage[]): Set<string> {
  const accepted = new Set<string>();
  for (const message of messages) {
    const status = federationDeliveryStatus(message);
    if (status?.tone === "sent" && status.attemptedMessageId) {
      accepted.add(status.attemptedMessageId);
    }
  }
  return accepted;
}

export function threadViewRecentTitles(messages: AfpMessage[]): string[] {
  return messages
    .map((message) => {
      const content = message.encryption ? decryptedDisplayContent(message) : afpRecord(message.content);
      const title = content.title ?? content.subject ?? content.label;
      return typeof title === "string" ? title.trim() : "";
    })
    .filter((value): value is string => Boolean(value))
    .slice(-5);
}

export function isFederatedAgentId(value: string): boolean {
  const trimmed = value.trim();
  const match = /^agent:([A-Za-z0-9._+\-]+)@([A-Za-z0-9.-]+)$/.exec(trimmed);
  if (!match) return false;
  const local = match[1] ?? "";
  const domain = match[2] ?? "";
  if (!local || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
  if (!domain || domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
  return domain.split(".").every((label) =>
    Boolean(label)
    && !label.startsWith("-")
    && !label.endsWith("-")
    && /^[A-Za-z0-9-]+$/.test(label)
  );
}

export function federatedTextCharCount(value: string): number {
  return Array.from(value).length;
}

export function federatedComposerValidationError(input: {
  recipientAgentId: string;
  subject?: string | null;
  body: string;
}): string | null {
  if (!isFederatedAgentId(input.recipientAgentId)) {
    return "Enter an agent id like agent:name@example.com.";
  }
  if (federatedTextCharCount((input.subject ?? "").trim()) > FEDERATION_SUBJECT_MAX_CHARS) {
    return `Subject must be ${FEDERATION_SUBJECT_MAX_CHARS} characters or fewer.`;
  }
  if (federatedTextCharCount(input.body.trim()) > FEDERATION_BODY_MAX_CHARS) {
    return `Message must be ${FEDERATION_BODY_MAX_CHARS.toLocaleString()} characters or fewer.`;
  }
  if (!input.body.trim()) {
    return "Message body is required.";
  }
  return null;
}
