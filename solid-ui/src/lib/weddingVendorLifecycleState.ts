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
  booked: boolean;
  reminderAt: string | null;
  sourceMessageIds: string[];
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
    || clean(metadata.vendor_name)
    || clean(metadata.vendor_label)
    || clean(metadata.selected_vendor_name);
  return vendorId || vendorName ? { vendorId, vendorName: vendorName || "Wedding vendor" } : null;
}

function timestamp(message: AfpMessage): number {
  const parsed = Date.parse(message.timestamp);
  return Number.isFinite(parsed) ? parsed : 0;
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
      quoteReceived: false, booked: false, reminderAt: null, sourceMessageIds: [], favouriteChangedAt: 0,
    };
    const kind = clean(message.kind) || clean(message.subtype) || clean(message.type);
    if (kind === "wedding_vendor_outreach_sent") current.enquired = true;
    if (kind === "wedding_vendor_quote_received") current.quoteReceived = true;
    if (kind === "wedding_vendor_booking_confirmed") current.booked = true;
    if (kind === "wedding_vendor_booking_cancelled") current.booked = false;
    if (kind === "wedding_vendor_follow_up_reminder") current.reminderAt = clean(message.content.reminder_at) || null;
    if (kind === "wedding_vendor_contact_reference" && timestamp(message) >= current.favouriteChangedAt) {
      current.favourited = message.content.selected_for_follow_up === true;
      current.favouriteChangedAt = timestamp(message);
    }
    current.vendorId = current.vendorId ?? vendor.vendorId;
    if (current.vendorName === "Wedding vendor" && vendor.vendorName) current.vendorName = vendor.vendorName;
    current.sourceMessageIds.push(message.id);
    records.set(key, current);
  });
  return [...records.values()]
    .map(({ favouriteChangedAt: _, ...record }) => record)
    .filter((record) => record.enquired || record.favourited || record.quoteReceived || record.booked)
    .sort((left, right) => left.vendorName.localeCompare(right.vendorName));
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
  kind: "wedding_vendor_booking_confirmed" | "wedding_vendor_follow_up_reminder";
  reminderAt?: string | null;
}): SendAfpMessageInput {
  const vendorKey = keyPart(input.vendorId || input.vendorName) || "vendor";
  const timestamp = new Date().toISOString();
  const title = input.kind === "wedding_vendor_booking_confirmed"
    ? `${input.vendorName} marked as booked`
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

export const weddingVendorBookingToAfpSendInput = (input: { metadata: WeddingPlanningMetadata; vendorId?: string | null; vendorName: string }) =>
  lifecycleInput({ ...input, kind: "wedding_vendor_booking_confirmed" });

export const weddingVendorReminderToAfpSendInput = (input: { metadata: WeddingPlanningMetadata; vendorId?: string | null; vendorName: string; reminderAt: string }) =>
  lifecycleInput({ ...input, kind: "wedding_vendor_follow_up_reminder", reminderAt: input.reminderAt });
