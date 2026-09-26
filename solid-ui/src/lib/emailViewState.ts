// @locs-version: 1.0
import type { AfpMessage } from "./api";
import { decryptedDisplayContent, decryptedDisplayLabel } from "./decryptedDisplayState";
import type { LocalEmailDraft, LocalEmailMailboxKey } from "./emailLocalState";
import { surfaceDateTitleLabel, surfaceRelativeTimestamp } from "./surfaceTimestampPresentation";

export type MailboxKey = LocalEmailMailboxKey;

export type EmailMessageCard = {
  id: string;
  threadId: string;
  message: AfpMessage;
  mailbox: MailboxKey;
  sender: string;
  senderDetail?: string | null;
  subject: string;
  preview: string;
  body: string;
  timestamp: string;
  labels: string[];
  supertags: string[];
  unread: boolean;
  actionable: boolean;
  requiresApproval: boolean;
};

export type QuotedEmailSegment = {
  primaryBody: string;
  quotedBody: string | null;
  hiddenMessageCount: number;
};

export type EmailMailboxOption = {
  key: MailboxKey;
  label: string;
  hint: string;
};

export type EmailSmartFolderRule = {
  id: string;
  label: string;
  test: (item: EmailMessageCard) => boolean;
};

export const MAILBOX_OPTIONS: EmailMailboxOption[] = [
  { key: "inbox", label: "Inbox", hint: "Incoming messages and triage work" },
  { key: "sent", label: "Sent", hint: "Messages you have already sent" },
  { key: "drafts", label: "Drafts", hint: "Prepared replies and outbound drafts" },
  { key: "archive", label: "Archive", hint: "Background knowledge and completed threads" },
  { key: "trash", label: "Trash", hint: "Low-value or disposable messages" },
];

export const SMART_FOLDER_RULES: EmailSmartFolderRule[] = [
  {
    id: "waiting",
    label: "Waiting for Reply",
    test: (item) =>
      item.mailbox === "inbox"
      && item.actionable
      && (item.labels.some((label) => label.toLowerCase().includes("follow"))
        || item.supertags.some((tag) => tag.toLowerCase().includes("relationship"))),
  },
  {
    id: "finance",
    label: "Finance",
    test: (item) =>
      item.labels.some((label) => /finance|invoice|billing|expense/i.test(label))
      || /finance|invoice|billing|expense/i.test(`${item.subject} ${item.preview}`),
  },
  {
    id: "travel",
    label: "Travel",
    test: (item) =>
      item.labels.some((label) => /travel|flight|hotel|itinerary/i.test(label))
      || /travel|flight|hotel|itinerary/i.test(`${item.subject} ${item.preview}`),
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function firstNonEmpty(...values: Array<unknown>): string | null {
  for (const value of values) {
    const found = readString(value);
    if (found) return found;
  }
  return null;
}

function snippetFromContent(content: Record<string, unknown>): string {
  const contentText = firstNonEmpty(
    content.summary,
    content.preview,
    content.snippet,
    content.body_preview,
    content.body_text,
    content.body,
    content.text,
    content.message,
    content.note,
  );
  if (contentText) return contentText;
  return "No structured email preview yet. Open the thread to inspect the AFP message details.";
}

export function splitQuotedEmailBody(body: string): QuotedEmailSegment {
  const normalized = body.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { primaryBody: "", quotedBody: null, hiddenMessageCount: 0 };
  }

  const quoteMarkers = [
    /^\s*On .+wrote:\s*$/m,
    /^\s*From:\s.+$/m,
    /^\s*Sent:\s.+$/m,
    /^\s*>.+$/m,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
  ];

  let splitIndex = -1;
  for (const marker of quoteMarkers) {
    const match = marker.exec(normalized);
    if (match && match.index >= 0) {
      splitIndex = splitIndex === -1 ? match.index : Math.min(splitIndex, match.index);
    }
  }

  if (splitIndex === -1) {
    return { primaryBody: normalized, quotedBody: null, hiddenMessageCount: 0 };
  }

  const primaryBody = normalized.slice(0, splitIndex).trimEnd();
  const quotedBody = normalized.slice(splitIndex).trim();
  const markerCount =
    (quotedBody.match(/^\s*On .+wrote:\s*$/gm) ?? []).length
    + (quotedBody.match(/^\s*From:\s.+$/gm) ?? []).length
    + (quotedBody.match(/^\s*-{2,}\s*Original Message\s*-{2,}\s*$/gim) ?? []).length;
  const hiddenMessageCount = Math.max(1, markerCount || 1);

  return {
    primaryBody: primaryBody || normalized,
    quotedBody: quotedBody || null,
    hiddenMessageCount: quotedBody ? hiddenMessageCount : 0,
  };
}

export function extractEmailMessage(message: AfpMessage): EmailMessageCard {
  const content = isRecord(decryptedDisplayContent(message)) ? decryptedDisplayContent(message) : {};
  const metadata = isRecord(message.metadata) ? message.metadata : {};
  const searchable = isRecord(metadata.searchable_metadata) ? metadata.searchable_metadata : {};
  const labels = Array.from(
    new Set([
      ...readStringArray(content.labels),
      ...readStringArray(metadata.labels),
      ...readStringArray(searchable.labels),
      ...readStringArray(searchable.suggested_actions),
    ]),
  );
  const supertags = Array.from(new Set(message.supertags ?? []));
  const rawMailbox = firstNonEmpty(
    content.mailbox,
    metadata.mailbox,
    searchable.mailbox,
    message.kind,
    message.subtype,
    message.type,
  )?.toLowerCase() ?? "";
  const mailbox: MailboxKey =
    /trash|spam|deleted/.test(rawMailbox) ? "trash"
      : /sent|outbound/.test(rawMailbox) ? "sent"
        : /draft|prepared/.test(rawMailbox) ? "drafts"
          : /archive|history|knowledge|context/.test(rawMailbox) ? "archive"
            : "inbox";
  const sender = firstNonEmpty(
    content.from_name,
    content.sender_name,
    content.from,
    content.sender,
    metadata.from_name,
    metadata.sender_name,
    message.from,
  ) ?? (message.encryption ? "Encrypted sender" : "Unknown sender");
  const senderDetail = firstNonEmpty(
    content.from_email,
    content.sender_email,
    metadata.from_email,
    metadata.sender_email,
    metadata.source_ref,
  );
  const subject = firstNonEmpty(
    content.subject,
    metadata.subject,
    content.title,
    metadata.title,
    content.summary,
  ) ?? decryptedDisplayLabel(message) ?? "Untitled email";
  const preview = snippetFromContent(content);
  const body = firstNonEmpty(
    content.body_text,
    content.body,
    content.text,
    content.message,
    content.summary,
    content.preview,
  ) ?? preview;
  const unread = readBoolean(content.unread)
    ?? readBoolean(metadata.unread)
    ?? readBoolean(searchable.unread)
    ?? mailbox === "inbox";
  const actionable = Boolean(
    /reply|follow|decision|approval|request|urgent/i.test(
      `${subject} ${preview} ${labels.join(" ")} ${supertags.join(" ")}`,
    ),
  );
  const requiresApproval = Boolean(
    readBoolean(content.requires_approval)
    ?? readBoolean(metadata.requires_approval)
    ?? message.type.includes("approval"),
  );
  return {
    id: message.id,
    threadId: message.thread_id,
    message,
    mailbox,
    sender,
    senderDetail,
    subject,
    preview,
    body,
    timestamp: message.timestamp,
    labels,
    supertags,
    unread,
    actionable,
    requiresApproval,
  };
}

export function relativeEmailTime(iso: string, nowMs = Date.now()): string {
  const timestampMs = new Date(iso).getTime();
  if (!Number.isFinite(timestampMs)) return iso;
  const ageMs = nowMs - timestampMs;
  if (ageMs >= 7 * 86400_000) {
    return surfaceDateTitleLabel(iso) || iso;
  }
  return surfaceRelativeTimestamp(iso, nowMs) || iso;
}

export function mailboxLabel(value: MailboxKey): string {
  return MAILBOX_OPTIONS.find((option) => option.key === value)?.label ?? value;
}

export function localDraftToEmailMessage(draft: LocalEmailDraft): EmailMessageCard {
  return {
    id: draft.id,
    threadId: draft.threadId,
    message: {
      id: draft.id,
      thread_id: draft.threadId,
      type: "email_draft",
      kind: "prepared_draft",
      subtype: "local",
      timestamp: draft.timestamp,
      from: draft.sender,
      content: {
        subject: draft.subject,
        body: draft.body,
        summary: draft.preview,
      },
      metadata: {},
      supertags: draft.supertags,
      views: [],
      attachments: [],
      references: [],
    } as AfpMessage,
    mailbox: "drafts",
    sender: draft.sender,
    senderDetail: draft.senderDetail ?? null,
    subject: draft.subject,
    preview: draft.preview,
    body: draft.body,
    timestamp: draft.timestamp,
    labels: ["Local draft"],
    supertags: draft.supertags,
    unread: false,
    actionable: true,
    requiresApproval: false,
  };
}

export function initialComposerBody(selected: EmailMessageCard | null): string {
  if (!selected) return "";
  return [
    `Subject: Re: ${selected.subject}`,
    "",
    `Hi ${selected.sender.split(" ")[0] || "there"},`,
    "",
    "",
    "Best,",
  ].join("\n");
}

export function buildEmailItems(args: {
  messages: AfpMessage[];
  localDrafts: LocalEmailDraft[];
  mailboxOverrides: Record<string, MailboxKey>;
  readMessageIds: Set<string>;
}): EmailMessageCard[] {
  return [
    ...args.messages
      .filter((message) =>
        message.type.includes("email")
        || message.type.includes("inbox")
        || message.type.includes("reply")
        || message.type.includes("action_log")
        || message.type.includes("approval")
        || message.kind === "email"
        || message.kind === "prepared_draft",
      )
      .map(extractEmailMessage),
    ...args.localDrafts.map(localDraftToEmailMessage),
  ]
    .map((item) => ({
      ...item,
      mailbox: args.mailboxOverrides[item.id] ?? item.mailbox,
      unread: args.readMessageIds.has(item.id) ? false : item.unread,
    }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export function emailLabelOptions(items: EmailMessageCard[]): string[] {
  return Array.from(new Set(items.flatMap((item) => item.labels))).slice(0, 12);
}

export function emailSmartFolderCounts(items: EmailMessageCard[]) {
  return SMART_FOLDER_RULES.map((rule) => ({
    ...rule,
    count: items.filter(rule.test).length,
  })).filter((rule) => rule.count > 0);
}

export function emailMailboxCounts(items: EmailMessageCard[]) {
  return MAILBOX_OPTIONS.map((option) => ({
    ...option,
    count: items.filter((item) => item.mailbox === option.key).length,
  }));
}

export function filterEmailItems(args: {
  items: EmailMessageCard[];
  selectedMailbox: MailboxKey;
  selectedSmartFolder: string | null;
  query: string;
}): EmailMessageCard[] {
  const query = args.query.trim().toLowerCase();
  let items = args.items.filter((item) => item.mailbox === args.selectedMailbox);
  if (args.selectedSmartFolder) {
    const rule = SMART_FOLDER_RULES.find((entry) => entry.id === args.selectedSmartFolder);
    if (rule) items = items.filter(rule.test);
  }
  if (!query) return items;
  return items.filter((item) =>
    `${item.sender} ${item.senderDetail ?? ""} ${item.subject} ${item.preview} ${item.labels.join(" ")} ${item.supertags.join(" ")}`
      .toLowerCase()
      .includes(query),
  );
}

export function unreadEmailItemCount(items: EmailMessageCard[]): number {
  return items.filter((item) => item.unread).length;
}

export function selectedEmailItem(
  items: EmailMessageCard[],
  selectedMessageId: string | null,
): EmailMessageCard | null {
  return items.find((item) => item.id === selectedMessageId) ?? null;
}
