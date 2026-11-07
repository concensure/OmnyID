import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

export const WEDDING_VENDOR_SHORTLIST_PREFERENCES = [
  "interested",
  "favourite",
  "concerned",
  "need_more_information",
] as const;

export type WeddingVendorShortlistPreference = (typeof WEDDING_VENDOR_SHORTLIST_PREFERENCES)[number];

export type WeddingVendorShortlistPreferenceRecord = {
  vendorId: string;
  vendorName: string;
  preference: WeddingVendorShortlistPreference;
  reason: string | null;
  changedAt: string;
};

const clean = (value: unknown): string => typeof value === "string" ? value.trim() : "";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : {};

function preference(value: unknown): WeddingVendorShortlistPreference | null {
  const candidate = clean(value) as WeddingVendorShortlistPreference;
  return WEDDING_VENDOR_SHORTLIST_PREFERENCES.includes(candidate) ? candidate : null;
}

export function projectWeddingVendorShortlistPreferences(messages: readonly AfpMessage[]): Map<string, WeddingVendorShortlistPreferenceRecord> {
  const records = new Map<string, WeddingVendorShortlistPreferenceRecord>();
  [...messages]
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp))
    .forEach((message) => {
      const content = object(message.content);
      const kind = clean(message.kind) || clean(message.subtype) || clean(message.type) || clean(content.kind);
      if (kind !== "wedding_vendor_shortlist_preference") return;
      const vendorId = clean(content.vendor_id);
      const vendorName = clean(content.vendor_name);
      const nextPreference = preference(content.preference);
      if (!vendorId || !vendorName || !nextPreference) return;
      records.set(vendorId, {
        vendorId,
        vendorName,
        preference: nextPreference,
        reason: clean(content.reason) || null,
        changedAt: message.timestamp,
      });
    });
  return records;
}

export function weddingVendorShortlistPreferenceToAfpSendInput(input: {
  metadata: WeddingPlanningMetadata;
  vendorId: string;
  vendorName: string;
  preference: WeddingVendorShortlistPreference;
  reason?: string | null;
  source?: "limited_specials" | "vendor_comparison";
}): SendAfpMessageInput {
  const timestamp = new Date().toISOString();
  const reason = clean(input.reason).slice(0, 500) || null;
  return {
    thread_id: `wedding-vendor-shortlist:${input.metadata.responseWorkspaceId}:${input.vendorId}`,
    from: "omnyid:wedding",
    to: ["omnyid:workspace"],
    timestamp,
    type: "wedding_vendor_shortlist_preference",
    kind: "wedding_vendor_shortlist_preference",
    subtype: input.preference,
    content: {
      kind: "wedding_vendor_shortlist_preference",
      vendor_id: input.vendorId,
      vendor_name: input.vendorName,
      preference: input.preference,
      reason,
      source: input.source ?? "limited_specials",
    },
    metadata: {
      ...input.metadata,
      source: "wedding_vendor_shared_shortlist",
      vendor_id: input.vendorId,
      vendor_name: input.vendorName,
      shortlist_preference: input.preference,
    },
    supertags: ["wedding_vendor_shortlist", `preference:${input.preference}`, `vendor:${input.vendorId}`],
    references: [],
    views: [{
      format: "summary",
      content: {
        title: `${input.vendorName}: ${input.preference.replace(/_/g, " ")}`,
        reason,
      },
      priority: 1,
    }],
    attachments: [],
    store_in_relational: true,
  };
}
