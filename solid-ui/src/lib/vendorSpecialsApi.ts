export type VendorSpecialOperation =
  | "offer_publish"
  | "offer_pause"
  | "offer_withdraw"
  | "offer_reconfirm"
  | "slot_place_hold"
  | "slot_mark_booked"
  | "slot_pause"
  | "slot_withdraw"
  | "slot_reconfirm";

export type VendorSpecialSlot = {
  slot_id: string;
  local_date: string;
  timezone: string;
  space_label: string;
  session_label: string;
  state: string;
  maximum_capacity: number | null;
  minimum_spend_cents: number | null;
  indicative_per_head_cents: number | null;
  inclusions: string[];
  public_conditions: string | null;
  revision: number;
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
    revision: number;
    slots: VendorSpecialSlot[];
  };
};

const endpoint = "/api/public/wedding/vendor-specials/manage";

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "This management link is unavailable.");
  return body as T;
}

export async function exchangeVendorSpecialLink(token: string) {
  const response = await fetch(`${endpoint}/exchange`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return responseJson<{ csrf_token: string; expires_at: string; account_access: false }>(response);
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
    }),
  });
  return responseJson<Record<string, unknown>>(response);
}
