// @module-id: wedding.vendor-lifecycle-state
// @primary-capability: account-scoped-afp-vendor-lifecycle-projection
// @locs-version: 1.0
// @stability: beta
// @owner: omnyid
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

export type WeddingVendorLifecycleFilter = "all" | "enquired" | "favourited" | "quote_received" | "booked";

export type WeddingVendorLifecycleRecord = {
  key: string;
  vendorId: string | null;
  vendorName: string;
  enquired: boolean;
  favourited: boolean;
  quoteReceived: boolean;
  quoteAccepted: boolean;
  booked: boolean;
  followUpDismissed: boolean;
  followUpDismissedAt: string | null;
  reminderAt: string | null;
  sourceMessageIds: string[];
};

export type WeddingVendorLifecycleCandidate = {
  vendorId?: string | null;
  vendorName: string;
  favourited?: boolean;
};

const clean = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const keyPart = (value: unknown): string => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function messageVendor(message: AfpMessage): { vendorId: string | null; vendorName: string } | null {
  const content = object(message.content);
  const metadata = object(message.metadata);
  const quote = object(content.quote);
  const vendorId = clean(content.vendor_id) || clean(metadata.vendor_id) || null;
  const vendorName = clean(content.vendor_name)
    || clean(content.vendor_label)
    || clean(content.option_label)
    || clean(quote.vendorName)
    || clean(quote.vendor_name)
    || clean(object(content.selected_option).label)
    || clean(metadata.vendor_name)
    || clean(metadata.vendor_label)
    || clean(metadata.selected_vendor_name);
  return vendorId || vendorName ? { vendorId, vendorName: vendorName || "Wedding vendor" } : null;
}

function timestamp(message: AfpMessage): number {
  const parsed = Date.parse(message.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
}

function messageKindTokens(message: AfpMessage): string[] {
  const content = object(message.content);
  const metadata = object(message.metadata);
  return [message.kind, message.subtype, message.type, content.kind, metadata.kind, ...(message.supertags ?? [])]
    .map((value) => clean(value).toLowerCase())
    .filter(Boolean);
}

function hasKind(tokens: readonly string[], kind: string): boolean {
  return tokens.includes(kind) || tokens.some((token) => token.endsWith(`:${kind}`));
}

export function projectWeddingVendorLifecycle(messages: readonly AfpMessage[]): WeddingVendorLifecycleRecord[] {
  const records = new Map<string, WeddingVendorLifecycleRecord & { favouriteChangedAt: number }>();
  [...messages].sort((left, right) => timestamp(left) - timestamp(right)).forEach((message) => {
    const vendor = messageVendor(message);
    if (!vendor) return;
    const nameKey = `name:${keyPart(vendor.vendorName)}`;
    const idKey = vendor.vendorId ? `id:${keyPart(vendor.vendorId)}` : "";
    const existingByName = [...records.values()].find((candidate) => keyPart(candidate.vendorName) === keyPart(vendor.vendorName));
    const key = existingByName?.key || idKey || nameKey;
    const current = records.get(key) ?? {
      key, vendorId: vendor.vendorId, vendorName: vendor.vendorName, enquired: false, favourited: false,
      quoteReceived: false, quoteAccepted: false, booked: false, followUpDismissed: false, followUpDismissedAt: null,
      reminderAt: null, sourceMessageIds: [], favouriteChangedAt: 0,
    };
    const kinds = messageKindTokens(message);
    if (hasKind(kinds, "wedding_vendor_outreach_sent") || hasKind(kinds, "wedding_vendor_enquiry_sent")) current.enquired = true;
    if (hasKind(kinds, "wedding_vendor_quote_received") || hasKind(kinds, "wedding_vendor_quote_attached")) current.quoteReceived = true;
    if (hasKind(kinds, "wedding_vendor_quote_accepted")) {
      current.quoteReceived = true;
      current.quoteAccepted = true;
    }
    if (hasKind(kinds, "wedding_vendor_booking_confirmed")) current.booked = true;
    if (hasKind(kinds, "wedding_vendor_booking_cancelled")) current.booked = false;
    if (hasKind(kinds, "wedding_vendor_follow_up_reminder")) current.reminderAt = clean(message.content.reminder_at) || null;
    if (hasKind(kinds, "wedding_vendor_follow_up_dismissed")) {
      current.followUpDismissed = true;
      current.followUpDismissedAt = clean(message.content.dismissed_at) || message.timestamp;
    }
    if (hasKind(kinds, "wedding_vendor_contact_reference") && timestamp(message) >= current.favouriteChangedAt) {
      current.favourited = message.content.selected_for_follow_up === true;
      current.favouriteChangedAt = timestamp(message);
    }
    if (hasKind(kinds, "wedding_vendor_shortlist_preference") && timestamp(message) >= current.favouriteChangedAt) {
      current.favourited = clean(message.content.preference) === "favourite";
      current.favouriteChangedAt = timestamp(message);
    }
    current.vendorId = current.vendorId ?? vendor.vendorId;
    if (current.vendorName === "Wedding vendor" && vendor.vendorName) current.vendorName = vendor.vendorName;
    current.sourceMessageIds.push(message.id);
    records.set(key, current);
  });
  return [...records.values()]
    .map(({ favouriteChangedAt: _, ...record }) => record)
    .filter((record) =>
      record.enquired
      || record.favourited
      || record.quoteReceived
      || record.quoteAccepted
      || record.booked
      || record.followUpDismissed
      || Boolean(record.reminderAt)
    )
    .sort((left, right) => left.vendorName.localeCompare(right.vendorName));
}

export function mergeWeddingVendorLifecycleCandidates(
  records: readonly WeddingVendorLifecycleRecord[],
  candidates: readonly WeddingVendorLifecycleCandidate[],
): WeddingVendorLifecycleRecord[] {
  const merged = records.map((record) => ({ ...record, sourceMessageIds: [...record.sourceMessageIds] }));
  for (const candidate of candidates) {
    if (!candidate.favourited || !clean(candidate.vendorName)) continue;
    const existing = findWeddingVendorLifecycle({ records: merged, vendorId: candidate.vendorId, vendorName: candidate.vendorName });
    if (existing) {
      existing.favourited = true;
      continue;
    }
    merged.push({
      key: candidate.vendorId ? `id:${keyPart(candidate.vendorId)}` : `name:${keyPart(candidate.vendorName)}`,
      vendorId: clean(candidate.vendorId) || null,
      vendorName: clean(candidate.vendorName),
      enquired: false,
      favourited: true,
      quoteReceived: false,
      quoteAccepted: false,
      booked: false,
      followUpDismissed: false,
      followUpDismissedAt: null,
      reminderAt: null,
      sourceMessageIds: [],
    });
  }
  return merged.sort((left, right) => left.vendorName.localeCompare(right.vendorName));
}

export function weddingVendorLifecycleMatches(record: WeddingVendorLifecycleRecord, filter: WeddingVendorLifecycleFilter): boolean {
  if (filter === "all") return true;
  if (filter === "enquired") return record.enquired;
  if (filter === "favourited") return record.favourited;
  if (filter === "quote_received") return record.quoteReceived;
  return record.booked;
}

export function findWeddingVendorLifecycle(input: {
  records: readonly WeddingVendorLifecycleRecord[];
  vendorId?: string | null;
  vendorName?: string | null;
}): WeddingVendorLifecycleRecord | null {
  const vendorId = keyPart(input.vendorId);
  const vendorName = keyPart(input.vendorName);
  return input.records.find((record) =>
    (vendorId && keyPart(record.vendorId) === vendorId) || (vendorName && keyPart(record.vendorName) === vendorName)
  ) ?? null;
}

function lifecycleInput(input: {
  metadata: WeddingPlanningMetadata;
  vendorId?: string | null;
  vendorName: string;
  kind: "wedding_vendor_follow_up_reminder" | "wedding_vendor_follow_up_dismissed";
  reminderAt?: string | null;
}): SendAfpMessageInput {
  const vendorKey = keyPart(input.vendorId || input.vendorName) || "vendor";
  const timestamp = new Date().toISOString();
  const title = input.kind === "wedding_vendor_follow_up_dismissed"
      ? `${input.vendorName} follow-up dismissed`
      : `Reminder set for ${input.vendorName}`;
  return {
    thread_id: `wedding-vendor-lifecycle:${input.metadata.responseWorkspaceId}:${vendorKey}`,
    from: "omnyid:wedding",
    to: ["omnyid:workspace"],
    timestamp,
    type: input.kind,
    kind: input.kind,
    subtype: input.kind,
    content: {
      kind: input.kind,
      vendor_id: input.vendorId ?? null,
      vendor_name: input.vendorName,
      reminder_at: input.reminderAt ?? null,
      dismissed_at: input.kind === "wedding_vendor_follow_up_dismissed" ? timestamp : null,
      payment_executed: false,
    },
    metadata: {
      ...input.metadata,
      source: "wedding_vendor_lifecycle",
      vendor_id: input.vendorId ?? null,
      vendor_name: input.vendorName,
      reminder_at: input.reminderAt ?? null,
      payment_executed: false,
    },
    supertags: ["wedding_vendor_lifecycle", input.kind, `vendor:${vendorKey}`],
    references: [],
    views: [{ format: "summary", content: { title, reminder_at: input.reminderAt ?? null, payment_executed: false }, priority: 1 }],
    attachments: [],
    store_in_relational: true,
  };
}

export const weddingVendorReminderToAfpSendInput = (input: { metadata: WeddingPlanningMetadata; vendorId?: string | null; vendorName: string; reminderAt: string }) =>
  lifecycleInput({ ...input, kind: "wedding_vendor_follow_up_reminder", reminderAt: input.reminderAt });

export const weddingVendorFollowUpDismissalToAfpSendInput = (input: { metadata: WeddingPlanningMetadata; vendorId?: string | null; vendorName: string }) =>
  lifecycleInput({ ...input, kind: "wedding_vendor_follow_up_dismissed" });
