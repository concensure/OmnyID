// @locs-version: 1.0
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

export type WeddingQuoteMessageCandidate = {
  sourceMessageId: string;
  threadId: string;
  vendorLabel: string;
  subjectLabel: string;
  receivedLabel: string;
  attachmentCount: number;
  alreadyClassified: boolean;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function messageTokens(message: AfpMessage): string {
  return [message.type, message.kind, message.subtype, ...stringArray(message.supertags)]
    .map(clean).join(" ").toLowerCase();
}

function contentText(message: AfpMessage): string {
  const content = record(message.content);
  return [content.subject, content.title, content.summary, content.body, content.text]
    .map(clean).join(" ").slice(0, 4_000);
}

function classifiedSourceIds(messages: readonly AfpMessage[]): Set<string> {
  return new Set(messages.flatMap((message) => {
    if (!messageTokens(message).includes("wedding_vendor_quote_source_classified")) return [];
    const sourceId = clean(record(message.content).source_message_id ?? message.metadata?.source_message_id);
    return sourceId ? [sourceId] : [];
  }));
}

export function weddingQuoteMessageCandidates(messages: readonly AfpMessage[]): WeddingQuoteMessageCandidate[] {
  const classified = classifiedSourceIds(messages);
  return messages.flatMap((message): WeddingQuoteMessageCandidate[] => {
    const tokens = messageTokens(message);
    if (tokens.includes("wedding_vendor_quote_source_classified")) return [];
    const text = contentText(message);
    const hasQuoteSignal = /\b(?:quote|quotation|proposal|estimate|pricing|package|invoice)\b/i.test(`${tokens} ${text}`);
    const vendorSignal = /\b(?:vendor|supplier|venue|photographer|cater|florist|celebrant|musician)\b/i.test(tokens)
      || Boolean(clean(message.metadata?.vendor_id ?? message.metadata?.vendor_name));
    if (!hasQuoteSignal && !(vendorSignal && message.attachments.length > 0)) return [];
    const content = record(message.content);
    const vendorLabel = clean(message.metadata?.vendor_name ?? content.vendor_name ?? content.vendor)
      || clean(message.from).replace(/^.*:\/\//, "")
      || "Vendor message";
    const subjectLabel = clean(content.subject ?? content.title ?? content.summary)
      || (message.attachments.length > 0 ? "Message with vendor attachment" : "Vendor pricing message");
    return [{
      sourceMessageId: message.id,
      threadId: message.thread_id,
      vendorLabel,
      subjectLabel,
      receivedLabel: new Date(message.timestamp).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }),
      attachmentCount: message.attachments.length,
      alreadyClassified: tokens.includes("wedding_vendor_quote_received") || classified.has(message.id),
    }];
  }).sort((a, b) => b.receivedLabel.localeCompare(a.receivedLabel));
}

export function weddingQuoteMessageClassificationInput(input: {
  source: WeddingQuoteMessageCandidate;
  metadata: unknown;
  nowIso?: string;
}): SendAfpMessageInput {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const nowIso = input.nowIso ?? new Date().toISOString();
  return {
    id: `wedding_quote_source_classified:${input.source.sourceMessageId}`,
    thread_id: input.source.threadId,
    from: "user://couple",
    to: ["agent://wedding-planning"],
    type: "wedding_vendor_quote_source_classified",
    kind: "wedding_vendor_quote_source_classified",
    subtype: "user_confirmed_quote_source",
    timestamp: nowIso,
    parent_id: input.source.sourceMessageId,
    content: {
      source_message_id: input.source.sourceMessageId,
      classification: "vendor_quote",
      user_confirmed: true,
    },
    references: [{ type: "afp_message", id: input.source.sourceMessageId }],
    supertags: ["wedding", "quotation", "source:user-confirmed", "review:required"],
    metadata: {
      wedding_plan_id: metadata.weddingPlanId,
      response_workspace_id: metadata.responseWorkspaceId,
      source_message_id: input.source.sourceMessageId,
      content_copied: false,
    },
    store_in_relational: true,
  };
}
