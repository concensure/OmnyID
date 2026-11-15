import { apiFetch } from "@/lib/api";

export type PublicationVisibility = Record<"description" | "email" | "phone" | "website_url" | "instagram_url" | "facebook_url" | "photos", boolean>;
export interface VendorPublication {
  draft: { revision: number; description?: string | null; public_contact: Record<string, string | null> };
  published: { revision?: number | null; description?: string | null; public_contact: Record<string, string | null>; visibility: PublicationVisibility; published_at?: string | null };
  revisions: Array<{ revision_id: string; profile_revision: number; status: string; moderation_required: boolean; submitted_at: string; review_note?: string | null }>;
}
export interface VendorResource { resource_id: string; name: string; description?: string | null; capacity_seated?: number | null; capacity_standing?: number | null; inclusions: string[]; status: string; revision: number; date_count: number; booked_count: number }
export interface VendorMember { membership_id: string; email: string; role: string; status: string; revision: number; accepted_at?: string | null; created_at: string }
export interface VendorNotifications { new_enquiry: boolean; follow_up_reminders: boolean; calendar_freshness: boolean; expiring_holds: boolean; publication_updates: boolean; product_updates: boolean; revision: number; security_notifications: "always_on" }
export interface VendorEntitlements { tier: string; status: string; current_period_end?: string | null; features: Record<string, boolean>; data_retained_on_downgrade: boolean }
export interface PendingVendorPublication { revision_id: string; profile_revision: number; vendor_slug: string; vendor_name: string; category: string; submitted_at: string; snapshot: { description?: string | null; public_contact?: Record<string, string | null> }; visibility: PublicationVisibility }
export type VendorSalesStage = "enquiry_received" | "qualification" | "availability_check" | "tailored_quote" | "tour_booking" | "tour_completed" | "follow_up" | "hold" | "contract" | "deposit" | "booked" | "declined" | "lost";
export interface VendorJourneyHistoryItem { event_id: string; kind: string; stage?: VendorSalesStage; direction?: string; afp_type?: string; occurred_at: string; next_action_at?: string | null; delivered?: boolean; acknowledged?: boolean }
export interface VendorSalesJourney { journey_id?: string | null; thread_ref: string; customer_label: string; current_stage: VendorSalesStage; next_action_at?: string | null; revision: number; first_activity_at: string; last_activity_at: string; enquiry_count: number; response_count: number; history: VendorJourneyHistoryItem[] }
export interface VendorOperationsSummary { period_days: number; enquiries: number; responses: number; quotes_delivered: number; tours_booked: number; tours_completed: number; holds: number; contracts: number; deposits: number; bookings: number; average_response_minutes?: number | null }
export interface VendorOperationsTrend { week_start: string; enquiries: number; responses: number }
export interface VendorOperationsException { kind: string; subject_ref: string; due_at: string; label: string; resource_name?: string | null }
export interface VendorOperationsResource { resource_id: string; name: string; status: string }
export interface VendorOperationsSlot { slot_id: string; resource_id?: string | null; local_date: string; state: "available" | "enquiry_received" | "provisional_hold" | "booked" | "price_review" | "paused" | "withdrawn" | "stale"; space_label: string; hold_expires_at?: string | null; minimum_spend_cents?: number | null; indicative_per_head_cents?: number | null; updated_at: string }
export interface VendorOperations {
  vendor: { vendor_id: string; vendor_slug: string; vendor_name: string; category: string; role: string; owner: boolean };
  generated_at: string;
  summary: VendorOperationsSummary;
  trends: VendorOperationsTrend[];
  journeys: VendorSalesJourney[];
  exceptions: VendorOperationsException[];
  calendar: { from: string; to: string; resources: VendorOperationsResource[]; slots: VendorOperationsSlot[] };
}

const key = (kind: string) => `${kind}-${crypto.randomUUID()}`;
const query = (slug: string) => `vendor_slug=${encodeURIComponent(slug)}`;

export const getVendorPublication = (slug: string) => apiFetch<VendorPublication>(`/api/wedding/vendor/portal/publication?${query(slug)}`);
export const submitVendorPublication = (slug: string, revision: number, visibility: PublicationVisibility) => apiFetch<{ status: string; moderation_required: boolean }>("/api/wedding/vendor/portal/publication/submit", { method: "POST", bodyJson: { vendor_slug: slug, expected_revision: revision, visibility, idempotency_key: key("publication") } });
export const getVendorResources = async (slug: string) => (await apiFetch<{ items: VendorResource[] }>(`/api/wedding/vendor/portal/resources?${query(slug)}`)).items;
export const createVendorResource = (slug: string, input: { name: string; description: string; capacitySeated: number | null; capacityStanding: number | null; inclusions: string[] }) => apiFetch<{ resource_id: string; revision: number }>("/api/wedding/vendor/portal/resources", { method: "POST", bodyJson: { vendor_slug: slug, name: input.name, description: input.description || null, capacity_seated: input.capacitySeated, capacity_standing: input.capacityStanding, inclusions: input.inclusions, status: "active", idempotency_key: key("resource") } });
export const updateVendorResource = (slug: string, resource: VendorResource, status = resource.status) => apiFetch<{ revision: number }>(`/api/wedding/vendor/portal/resources/${encodeURIComponent(resource.resource_id)}`, { method: "PUT", bodyJson: { vendor_slug: slug, expected_revision: resource.revision, name: resource.name, description: resource.description, capacity_seated: resource.capacity_seated, capacity_standing: resource.capacity_standing, inclusions: resource.inclusions, status, idempotency_key: key("resource-update") } });
export const bulkUpdateVendorCalendar = (input: { vendorSlug: string; offerId: string; resourceId: string; offerRevision: number; dates: string[]; state: string; maximumCapacity: number | null; minimumSpendCents: number | null; perHeadCents: number | null; inclusions: string[]; publicConditions: string | null }) => apiFetch<{ updated: number; offer_revision: number }>("/api/wedding/vendor/portal/calendar/bulk", { method: "POST", bodyJson: { vendor_slug: input.vendorSlug, offer_id: input.offerId, resource_id: input.resourceId, expected_offer_revision: input.offerRevision, dates: input.dates, state: input.state, vendor_confirmed: true, maximum_capacity: input.maximumCapacity, minimum_spend_cents: input.minimumSpendCents, indicative_per_head_cents: input.perHeadCents, inclusions: input.inclusions, public_conditions: input.publicConditions, idempotency_key: key("calendar-bulk") } });
export const getVendorTeam = async (slug: string) => (await apiFetch<{ members: VendorMember[] }>(`/api/wedding/vendor/portal/team?${query(slug)}`)).members;
export const inviteVendorMember = (slug: string, email: string, role: string) => apiFetch("/api/wedding/vendor/portal/team", { method: "POST", bodyJson: { vendor_slug: slug, email, role, idempotency_key: key("member") } });
export const updateVendorMember = (slug: string, member: VendorMember, status: string, role = member.role) => apiFetch(`/api/wedding/vendor/portal/team/${encodeURIComponent(member.membership_id)}`, { method: "PUT", bodyJson: { vendor_slug: slug, role, status, expected_revision: member.revision, idempotency_key: key("member-update") } });
export const getVendorNotifications = (slug: string) => apiFetch<VendorNotifications>(`/api/wedding/vendor/portal/notifications?${query(slug)}`);
export const updateVendorNotifications = (slug: string, value: VendorNotifications) => apiFetch<VendorNotifications>("/api/wedding/vendor/portal/notifications", { method: "PUT", bodyJson: { vendor_slug: slug, ...value, idempotency_key: key("notifications") } });
export const getVendorEntitlements = (slug: string) => apiFetch<VendorEntitlements>(`/api/wedding/vendor/portal/entitlements?${query(slug)}`);
export const getPendingVendorPublications = async () => (await apiFetch<{ items: PendingVendorPublication[] }>("/admin/wedding/vendor/portal/publication/pending")).items;
export const decideVendorPublication = (revisionId: string, decision: "publish" | "reject", note: string) => apiFetch("/admin/wedding/vendor/portal/publication/decision", { method: "POST", bodyJson: { revision_id: revisionId, decision, note } });
export const getVendorOperations = (slug: string, from?: string, to?: string) => apiFetch<VendorOperations>(`/api/wedding/vendor/portal/operations?${query(slug)}${from ? `&from=${encodeURIComponent(from)}` : ""}${to ? `&to=${encodeURIComponent(to)}` : ""}`);
export const recordVendorSalesStage = (input: { vendorSlug: string; threadRef: string; stage: VendorSalesStage; nextActionAt?: string | null; expectedRevision?: number | null }) => apiFetch<{ journey_id: string; revision?: number; replayed: boolean }>("/api/wedding/vendor/portal/journeys/stage", { method: "POST", bodyJson: { vendor_slug: input.vendorSlug, enquiry_thread_id: input.threadRef, stage: input.stage, next_action_at: input.nextActionAt || null, expected_revision: input.expectedRevision && input.expectedRevision > 0 ? input.expectedRevision : null, idempotency_key: key("sales-stage") } });
