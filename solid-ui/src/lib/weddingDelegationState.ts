// @locs-version: 2.0
import type { Contact } from "@/lib/contactsLocalState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingCollaboratorRole } from "@/lib/weddingCollaborationState";

export type WeddingDelegationCategory =
  | "legal_noim"
  | "celebrant"
  | "venue_selection"
  | "vendor_research"
  | "vendor_outreach"
  | "budget_tracking"
  | "guest_rsvp"
  | "seating"
  | "run_sheet"
  | "weather_backup"
  | "payments_contracts"
  | "vows_ceremony"
  | "travel_accommodation";

export type WeddingDelegateInput = {
  category: WeddingDelegationCategory | string;
  personName?: string | null;
  relationship?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
};

export type WeddingDelegationItem = {
  category: WeddingDelegationCategory | string;
  categoryLabel: string;
  categoryDescription: string;
  recommendedCollaboratorRoles: WeddingCollaboratorRole[];
  recommendedRoleLabels: string[];
  sensitiveScopeLabel: string;
  personName: string | null;
  relationship: string | null;
  phone: string | null;
  email: string | null;
  readyForContacts: boolean;
  missingLabels: string[];
  contact: Contact | null;
};

export type WeddingDelegationState = {
  items: WeddingDelegationItem[];
  contactDrafts: Contact[];
  blockerLabels: string[];
  categoryOptions: {
    id: WeddingDelegationCategory;
    label: string;
    description: string;
    recommendedCollaboratorRoles: WeddingCollaboratorRole[];
    sensitiveScopeLabel: string;
  }[];
};

export type WeddingDelegationTaskItemsInput = {
  delegation?: WeddingDelegationState | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  metadata?: unknown;
};

const CATEGORY_OPTIONS: WeddingDelegationState["categoryOptions"] = [
  { id: "legal_noim", label: "Legal and NOIM", description: "NOIM status, legal documents, authorised witness, and celebrant appointment timing.", recommendedCollaboratorRoles: ["co_owner", "planner"], sensitiveScopeLabel: "Sensitive: legal identity and relationship documents." },
  { id: "celebrant", label: "Celebrant coordination", description: "Celebrant shortlist, availability, legal meeting, and ceremony requirements.", recommendedCollaboratorRoles: ["co_owner", "planner"], sensitiveScopeLabel: "Sensitive: legal timing, identity documents, and ceremony commitments." },
  { id: "venue_selection", label: "Venue selection", description: "Venue shortlist, tours, capacity, deposits, contract terms, and backup spaces.", recommendedCollaboratorRoles: ["co_owner", "planner"], sensitiveScopeLabel: "Sensitive: deposits, contracts, guest count, and cancellation risk." },
  { id: "vendor_research", label: "Vendor research", description: "Shortlists for photographer, florist, music, catering, attire, transport, and emerging vendors.", recommendedCollaboratorRoles: ["planner", "contributor"], sensitiveScopeLabel: "Moderate: keep budget ceilings and private preferences scoped." },
  { id: "vendor_outreach", label: "Vendor outreach", description: "Approved enquiries, quote follow-ups, no-spam escalation, and response tracking.", recommendedCollaboratorRoles: ["co_owner", "planner"], sensitiveScopeLabel: "Sensitive: contact sharing requires explicit approval." },
  { id: "budget_tracking", label: "Budget and pricing", description: "Quote freshness, hidden fees, deposits, payment dates, and stale-pricing checks.", recommendedCollaboratorRoles: ["co_owner", "planner"], sensitiveScopeLabel: "Sensitive: financial data and payment status." },
  { id: "guest_rsvp", label: "Guest RSVP", description: "RSVPs, meal choices, dietary restrictions, accessibility needs, and final guest count.", recommendedCollaboratorRoles: ["planner", "contributor"], sensitiveScopeLabel: "Sensitive: dietary, accessibility, and guest contact data." },
  { id: "seating", label: "Seating plan", description: "Households, VIP tables, family sensitivities, accessibility needs, and vendor-ready seating export.", recommendedCollaboratorRoles: ["co_owner", "planner"], sensitiveScopeLabel: "Sensitive: family dynamics and accessibility needs." },
  { id: "run_sheet", label: "Run sheet", description: "Day-of timeline, vendor call times, buffers, delays, and dependency updates.", recommendedCollaboratorRoles: ["planner", "contributor"], sensitiveScopeLabel: "Moderate: day-of logistics should be shared by audience scope." },
  { id: "weather_backup", label: "Weather and backup plans", description: "Forecast checks, indoor/marquee options, umbrellas, transport, and notification paths.", recommendedCollaboratorRoles: ["planner", "contributor"], sensitiveScopeLabel: "Moderate: operational updates may affect guests and vendors." },
  { id: "payments_contracts", label: "Payments and contracts", description: "Contract review, cancellation terms, deposits, payment proof, and final confirmations.", recommendedCollaboratorRoles: ["co_owner", "planner"], sensitiveScopeLabel: "Sensitive: contracts, receipts, and payment evidence." },
  { id: "vows_ceremony", label: "Vows and ceremony", description: "Vow style, ceremony readings, relationship facts, processional, and ceremony flow.", recommendedCollaboratorRoles: ["co_owner", "contributor"], sensitiveScopeLabel: "Sensitive: private relationship facts and ceremony wording." },
  { id: "travel_accommodation", label: "Travel and accommodation", description: "Guest accommodation, transport providers, pickup points, and honeymoon/travel advisor tasks.", recommendedCollaboratorRoles: ["planner", "contributor"], sensitiveScopeLabel: "Moderate: guest travel and accommodation contacts." },
];

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "delegate";
}

function categoryLabel(category: string): string {
  return CATEGORY_OPTIONS.find((option) => option.id === category)?.label ?? category.replace(/_/g, " ");
}

function categoryOption(category: string): WeddingDelegationState["categoryOptions"][number] | null {
  return CATEGORY_OPTIONS.find((option) => option.id === category) ?? null;
}

function roleLabel(role: WeddingCollaboratorRole): string {
  if (role === "co_owner") return "Co-owner";
  if (role === "planner") return "Wedding planner";
  if (role === "contributor") return "Contributor";
  return "Viewer";
}

function contactRelationship(relationship: string | null): Contact["relationshipKind"] {
  const normalized = (relationship ?? "").toLowerCase();
  if (/vendor|supplier|celebrant|planner|venue|photographer|florist|caterer/.test(normalized)) return "supplier";
  if (/friend|family|parent|sibling|bride|groom|partner/.test(normalized)) return "friend";
  if (/team|coordinator|assistant/.test(normalized)) return "team";
  return "other";
}

function taskRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function existingDelegationKeys(existingTaskItems?: readonly WeddingPlanningTaskItem[] | null): Set<string> {
  const keys = new Set<string>();
  for (const task of existingTaskItems ?? []) {
    keys.add(task.id);
    const metadata = taskRecord(task.metadata);
    const category = clean(metadata.delegated_category);
    const name = clean(metadata.delegate_name);
    if (metadata.delegation_task === true && category && name) keys.add(`${category}:${safeId(name)}`);
  }
  return keys;
}

export function buildWeddingDelegationTaskItems(input: WeddingDelegationTaskItemsInput): WeddingPlanningTaskItem[] {
  const existingKeys = existingDelegationKeys(input.existingTaskItems);
  return (input.delegation?.items ?? [])
    .filter((item) => item.readyForContacts && item.personName)
    .flatMap((item): WeddingPlanningTaskItem[] => {
      const taskId = `wedding_delegation:${safeId(item.category)}:${safeId(item.personName!)}`;
      const key = `${item.category}:${safeId(item.personName!)}`;
      if (existingKeys.has(taskId) || existingKeys.has(key)) return [];
      existingKeys.add(taskId);
      existingKeys.add(key);
      return [{
        id: taskId,
        title: `Confirm ${item.personName} owns ${item.categoryLabel}`,
        kind: "vendor_coordination",
        priority: ["legal_noim", "payments_contracts", "venue_selection"].includes(item.category) ? "high" : "normal",
        assignee: item.personName,
        source: "agent",
        reviewStatus: "accepted",
        approvalState: "draft",
        metadata: {
          ...taskRecord(input.metadata),
          delegation_task: true,
          delegated_category: item.category,
          delegated_scope_label: item.categoryLabel,
          delegated_scope_description: item.categoryDescription,
          delegated_sensitive_scope_label: item.sensitiveScopeLabel,
          delegate_name: item.personName,
          delegate_relationship: item.relationship,
          delegate_email: item.email,
          delegate_phone: item.phone,
          contacts_projection_recommended: true,
          preparation_checklist: true,
          preparation_checklist_item: "delegated_responsibility",
          user_selectable: true,
          can_deselect_before_commit: true,
          alert_offset_days: [14, 7],
          schedule_basis: "delegated_responsibility_follow_up",
          searchable_terms: [
            "delegated responsibility",
            "wedding contacts",
            item.category,
            item.categoryLabel,
            item.personName,
            item.relationship,
            item.email,
          ].filter(Boolean),
        },
        notes: [
          `Confirm they accept ownership for ${item.categoryLabel}.`,
          `Recommended access role: ${item.recommendedRoleLabels.join(" or ")}.`,
          item.sensitiveScopeLabel,
          "Store the person in Contacts and keep follow-ups distinguishable from agent outreach.",
        ].join(" "),
      }];
    });
}

export function buildWeddingDelegationState(
  delegates: readonly WeddingDelegateInput[] = [],
): WeddingDelegationState {
  const items = delegates.map((delegate): WeddingDelegationItem => {
    const category = clean(delegate.category) ?? "vendor_research";
    const option = categoryOption(category);
    const personName = clean(delegate.personName);
    const relationship = clean(delegate.relationship);
    const phone = clean(delegate.phone);
    const email = clean(delegate.email);
    const missingLabels = [
      personName ? null : `${categoryLabel(category)} needs a delegate name.`,
      relationship ? null : `${categoryLabel(category)} needs the delegate relationship or role.`,
      phone || email ? null : `${categoryLabel(category)} needs phone or email for Contacts.`,
    ].filter((label): label is string => Boolean(label));
    const readyForContacts = missingLabels.length === 0;
    const contact: Contact | null = readyForContacts
      ? {
        id: `wedding-delegate:${safeId(category)}:${safeId(personName!)}`,
        name: personName!,
        relationshipKind: contactRelationship(relationship),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        notes: [
          `Wedding responsibility: ${categoryLabel(category)}`,
          `Relationship/role: ${relationship}`,
          clean(delegate.notes),
        ].filter(Boolean).join(" | "),
      }
      : null;
    return {
      category,
      categoryLabel: categoryLabel(category),
      categoryDescription: option?.description ?? "Custom delegated wedding responsibility.",
      recommendedCollaboratorRoles: option?.recommendedCollaboratorRoles ?? ["contributor"],
      recommendedRoleLabels: (option?.recommendedCollaboratorRoles ?? ["contributor"]).map(roleLabel),
      sensitiveScopeLabel: option?.sensitiveScopeLabel ?? "Custom scope: review what this person can see before sharing.",
      personName,
      relationship,
      phone,
      email,
      readyForContacts,
      missingLabels,
      contact,
    };
  });
  return {
    items,
    contactDrafts: items.map((item) => item.contact).filter((contact): contact is Contact => contact !== null),
    blockerLabels: items.flatMap((item) => item.missingLabels),
    categoryOptions: CATEGORY_OPTIONS,
  };
}
