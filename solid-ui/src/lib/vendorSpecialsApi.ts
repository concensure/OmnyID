import { apiFetch } from "@/lib/api";

export type VendorSpecialOperation =
  | "offer_edit"
  | "offer_publish"
  | "offer_pause"
  | "offer_withdraw"
  | "offer_reconfirm"
  | "slot_record_enquiry"
  | "slot_calendar_open"
  | "slot_confirm_availability"
  | "slot_place_hold"
  | "slot_mark_booked"
  | "slot_reopen_cancelled_booking"
  | "slot_pause"
  | "slot_withdraw"
  | "slot_reconfirm";

export type VendorSpecialSlot = {
  slot_id: string;
  local_date: string;
  timezone: string;
  starts_at: string | null;
  ends_at: string | null;
  space_label: string;
  session_label: string;
  state: string;
  availability_scope: "calendar_open" | "vendor_confirmed";
  availability_scope_updated_at: string;
  maximum_capacity: number | null;
  minimum_spend_cents: number | null;
  indicative_per_head_cents: number | null;
  inclusions: string[];
  public_conditions: string | null;
  revision: number;
  affected_enquiry_count?: number;
  operator_warning?: string | null;
  last_confirmed_at: string;
  confirmation_expires_at: string;
};

export type VendorSpecialSession = {
  grant_id: string;
  generation: number;
  allowed_operations: VendorSpecialOperation[];
  account_access: false;
  offer: {
    offer_id: string;
    title: string;
    summary: string;
    publication_state: string;
    currency: string;
    inclusions: string[];
    public_conditions: string | null;
    revision: number;
    slots: VendorSpecialSlot[];
  };
};

const endpoint = "/api/public/wedding/vendor-specials/manage";

async function responseJson<T>(response: Response): Promise<T> {
  const raw = await response.text();
  let body: { error?: string } & Record<string, unknown> = {};
  try {
    body = raw ? JSON.parse(raw) as typeof body : {};
  } catch {
    // Axum route errors are intentionally plain text; surface their bounded,
    // user-facing explanation instead of hiding every conflict behind a
    // generic unavailable message.
  }
  if (!response.ok) throw new Error(body.error || raw.trim() || "This management link is unavailable.");
  return body as T;
}

export type VendorSpecialOffer = VendorSpecialSession["offer"];

export async function listClaimedVendorSpecials(vendorSlug: string, guestCount?: number) {
  const params = new URLSearchParams({ vendor_slug: vendorSlug });
  if (guestCount) params.set("guest_count", String(guestCount));
  const value = await apiFetch<{ items?: VendorSpecialOffer[] }>(`/wedding/vendor/special-offers?${params}`);
  return Array.isArray(value.items) ? value.items : [];
}

export async function createClaimedVendorSpecial(input: {
  vendorSlug: string;
  title: string;
  summary: string;
  date: string;
  maximumCapacity: number | null;
  minimumSpendCents: number | null;
  indicativePerHeadCents: number | null;
  inclusions: string[];
  publicConditions: string | null;
  mandatoryChargesKnown: boolean;
}) {
  return apiFetch<Record<string, unknown>>("/wedding/vendor/special-offers", {
    method: "POST",
    body: JSON.stringify({
      vendor_slug: input.vendorSlug,
      idempotency_key: `vendor-special-${crypto.randomUUID()}`,
      room_id: null,
      title: input.title,
      summary: input.summary,
      offer_type: input.indicativePerHeadCents !== null ? "per_head" : "minimum_spend",
      guest_min: null,
      guest_max: input.maximumCapacity,
      pricing: {
        currency: "AUD", fixed_total_cents: null, per_guest_cents: input.indicativePerHeadCents,
        hire_fee_cents: null, minimum_spend_cents: input.minimumSpendCents,
        mandatory_charges_cents: input.mandatoryChargesKnown ? 0 : null,
        mandatory_charges_known: input.mandatoryChargesKnown,
        mandatory_charges_summary: input.mandatoryChargesKnown ? "Vendor confirmed no additional mandatory charges" : null,
        estimate_min_cents: null, estimate_max_cents: null, reference_price_cents: null,
        savings_basis_label: null, savings_evidence_ref: null,
      },
      inclusions: input.inclusions,
      exclusions: [],
      public_conditions: input.publicConditions,
      approved_package_version: null,
      slots: [{
        local_date: input.date, timezone: "Australia/Sydney", starts_at: null, ends_at: null,
        space_label: null, session_label: null, maximum_capacity: input.maximumCapacity,
        minimum_spend_cents: input.minimumSpendCents, indicative_per_head_cents: input.indicativePerHeadCents,
        inclusions: input.inclusions, public_conditions: input.publicConditions,
      }],
    }),
  });
}

export type VendorSpecialManagementLink = {
  grant_id: string;
  management_url: string;
  expires_at: string;
  rotated_previous_links: boolean;
  notice: string;
};

export async function createClaimedVendorSpecialManagementLink(input: {
  vendorSlug: string;
  offerId: string;
  expiresInDays?: number;
}) {
  return apiFetch<VendorSpecialManagementLink>(`/wedding/vendor/special-offers/${encodeURIComponent(input.offerId)}/management-links`, {
    method: "POST",
    body: JSON.stringify({
      vendor_slug: input.vendorSlug,
      expires_in_days: input.expiresInDays ?? 14,
      allowed_operations: [
        "offer_edit", "offer_publish", "offer_pause", "offer_reconfirm",
        "slot_place_hold", "slot_mark_booked", "slot_pause", "slot_withdraw", "slot_reconfirm",
        "slot_calendar_open", "slot_confirm_availability",
        "slot_reopen_cancelled_booking",
      ],
    }),
  });
}

export async function editClaimedVendorSpecial(input: {
  vendorSlug: string;
  offer: VendorSpecialOffer;
  slot: VendorSpecialSlot;
  title: string;
  summary: string;
  date: string;
  maximumCapacity: number | null;
  minimumSpendCents: number | null;
  indicativePerHeadCents: number | null;
  inclusions: string[];
  publicConditions: string | null;
}) {
  return apiFetch<Record<string, unknown>>(`/wedding/vendor/special-offers/${encodeURIComponent(input.offer.offer_id)}/edit`, {
    method: "POST",
    body: JSON.stringify({
      vendor_slug: input.vendorSlug,
      idempotency_key: `vendor-special-edit-${crypto.randomUUID()}`,
      expected_offer_revision: input.offer.revision,
      slot_id: input.slot.slot_id,
      expected_slot_revision: input.slot.revision,
      title: input.title,
      summary: input.summary,
      slot: {
        local_date: input.date, timezone: input.slot.timezone || "Australia/Sydney",
        starts_at: input.slot.starts_at, ends_at: input.slot.ends_at, space_label: input.slot.space_label || null,
        session_label: input.slot.session_label || null, maximum_capacity: input.maximumCapacity,
        minimum_spend_cents: input.minimumSpendCents,
        indicative_per_head_cents: input.indicativePerHeadCents,
        inclusions: input.inclusions, public_conditions: input.publicConditions,
      },
    }),
  });
}

export async function commandClaimedVendorOffer(input: { vendorSlug: string; offerId: string; revision: number; action: "publish" | "pause" | "withdraw" | "reconfirm" }) {
  const path = input.action === "publish" ? "publish" : "state";
  return apiFetch<Record<string, unknown>>(`/wedding/vendor/special-offers/${encodeURIComponent(input.offerId)}/${path}`, {
    method: "POST",
    body: JSON.stringify({
      vendor_slug: input.vendorSlug,
      idempotency_key: `vendor-special-${input.action}-${crypto.randomUUID()}`,
      expected_revision: input.revision,
      action: input.action === "publish" ? null : input.action,
    }),
  });
}

export async function commandClaimedVendorSlot(input: { vendorSlug: string; offerId: string; slotId: string; revision: number; action: "calendar_open" | "confirm_availability" | "place_hold" | "mark_booked" | "reopen_cancelled_booking" | "pause" | "withdraw" | "reconfirm"; holdExpiresAt?: string; reason?: string }) {
  return apiFetch<Record<string, unknown>>(`/wedding/vendor/special-offers/${encodeURIComponent(input.offerId)}/slots/${encodeURIComponent(input.slotId)}/state`, {
    method: "POST",
    body: JSON.stringify({
      vendor_slug: input.vendorSlug,
      idempotency_key: `vendor-special-${input.action}-${crypto.randomUUID()}`,
      expected_revision: input.revision,
      action: input.action,
      hold_expires_at: input.holdExpiresAt ?? null,
      confirmation_expires_at: null,
      reason: input.reason ?? null,
    }),
  });
}

export async function exchangeVendorSpecialLink(token: string) {
  const response = await fetch(`${endpoint}/exchange`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return responseJson<{ csrf_token: string; expires_at: string; account_access: false; referral_grant_id: string }>(response);
}

export async function attributeVendorSpecialSignup(grantId: string) {
  return apiFetch<{ attributed: boolean; grant_id: string }>("/wedding/vendor-specials/manage/attribute-signup", {
    method: "POST",
    bodyJson: { grant_id: grantId },
  });
}

export async function getVendorSpecialSession() {
  const response = await fetch(`${endpoint}/session`, {
    credentials: "same-origin",
    headers: { accept: "application/json" },
  });
  return responseJson<VendorSpecialSession>(response);
}

export async function commandVendorSpecial(input: {
  csrfToken: string;
  operation: VendorSpecialOperation;
  expectedRevision: number;
  idempotencyKey: string;
  slotId?: string;
  holdExpiresAt?: string;
  reason?: string;
  edit?: {
    title: string; summary: string; slotRevision: number; localDate: string; timezone: string;
    startsAt: string | null; endsAt: string | null;
    spaceLabel: string | null; sessionLabel: string | null; maximumCapacity: number | null;
    minimumSpendCents: number | null; indicativePerHeadCents: number | null;
    inclusions: string[]; publicConditions: string | null;
  };
}) {
  const response = await fetch(`${endpoint}/command`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-csrf-token": input.csrfToken,
    },
    body: JSON.stringify({
      operation: input.operation,
      expected_revision: input.expectedRevision,
      idempotency_key: input.idempotencyKey,
      slot_id: input.slotId,
      hold_expires_at: input.holdExpiresAt,
      reason: input.reason,
      edit: input.edit ? {
        title: input.edit.title, summary: input.edit.summary,
        slot_revision: input.edit.slotRevision, local_date: input.edit.localDate,
        timezone: input.edit.timezone, starts_at: input.edit.startsAt, ends_at: input.edit.endsAt,
        space_label: input.edit.spaceLabel,
        session_label: input.edit.sessionLabel, maximum_capacity: input.edit.maximumCapacity,
        minimum_spend_cents: input.edit.minimumSpendCents,
        indicative_per_head_cents: input.edit.indicativePerHeadCents,
        inclusions: input.edit.inclusions, public_conditions: input.edit.publicConditions,
      } : undefined,
    }),
  });
  return responseJson<Record<string, unknown>>(response);
}
