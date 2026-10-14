// @locs-version: 1.0
// @module-id: wedding-vendor-contact-reference-afp-state
// @primary-capability: response-queue-wedding-workspace
// @stability: beta
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

export type WeddingVendorContactReferenceDetails = {
  title?: string | null;
  provider?: string | null;
  websiteUrl?: string | null;
  instagramUrl?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  mapUrl?: string | null;
  sourceUrl?: string | null;
};

export type WeddingVendorContactReferenceInput = {
  metadata: WeddingPlanningMetadata;
  artifactId: string;
  artifactTitle: string;
  optionId: string;
  optionLabel: string;
  selected?: boolean;
  contact?: WeddingVendorContactReferenceDetails | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function weddingVendorContactReferenceToAfpSendInput(
  input: WeddingVendorContactReferenceInput,
): SendAfpMessageInput {
  const contact = input.contact ?? null;
  const vendorName = clean(contact?.title) || clean(input.optionLabel) || "Selected vendor";
  const contactDetails = {
    website_url: clean(contact?.websiteUrl) || null,
    instagram_url: clean(contact?.instagramUrl) || null,
    email: clean(contact?.email) || null,
    phone: clean(contact?.phone) || null,
    address: clean(contact?.address) || null,
    map_url: clean(contact?.mapUrl) || null,
    source_url: clean(contact?.sourceUrl) || null,
    source_provider: clean(contact?.provider) || null,
  };
  const selected = input.selected !== false;
  return {
    thread_id: input.artifactId,
    parent_id: input.artifactId,
    from: "omnyid:wedding",
    to: ["omnyid:workspace"],
    type: "wedding_vendor_contact_reference",
    kind: "wedding_vendor_contact_reference",
    subtype: "selected_vendor_contact_details",
    content: {
      kind: "wedding_vendor_contact_reference",
      vendor_name: vendorName,
      option_id: input.optionId,
      option_label: input.optionLabel,
      artifact_id: input.artifactId,
      artifact_title: input.artifactTitle,
      contact_details: contactDetails,
      selected_for_follow_up: selected,
      next_step: selected
        ? "Use these details for approval-gated quote questions or outreach only after the user approves the message."
        : "Remove this vendor from the follow-up list.",
    },
    metadata: {
      ...input.metadata,
      source: "wedding_vendor_comparison_selection",
      artifact_id: input.artifactId,
      selected_option_id: input.optionId,
      selected_vendor_name: vendorName,
      selected_for_follow_up: selected,
      contact_details_available: Object.values(contactDetails).some(Boolean),
    },
    supertags: [
      selected ? "wedding_vendor_selected" : "wedding_vendor_deselected",
      "wedding_vendor_contact_reference",
      "wedding_vendor_follow_up",
      "decisionos:wedding_vendor_selection",
    ],
    references: [
      { id: input.artifactId, rel: "source_artifact" },
      ...(contact?.sourceUrl ? [{ id: contact.sourceUrl, rel: "vendor_source" }] : []),
      ...(contact?.websiteUrl ? [{ id: contact.websiteUrl, rel: "vendor_website" }] : []),
      ...(contact?.mapUrl ? [{ id: contact.mapUrl, rel: "vendor_map" }] : []),
    ],
    views: [{
      format: "summary",
      content: {
        title: selected ? `${vendorName} selected for follow-up` : `${vendorName} removed from follow-up`,
        detail: selected ? "Saved vendor contact details for the wedding planner workflow." : "Removed this vendor from the wedding follow-up list.",
        contact_details: contactDetails,
      },
      priority: 1,
    }],
    attachments: [],
    store_in_relational: true,
  };
}
