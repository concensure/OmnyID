import { isRecord } from "@/lib/eventDetail";

const endpoint = "/api/public/wedding/celebrants/manage";

async function responseJson<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = isRecord(payload) && typeof payload.message === "string"
      ? payload.message
      : "This celebrant calendar link is unavailable.";
    throw new Error(message);
  }
  return payload as T;
}

export type CelebrantManagementWindow = {
  window_id: string;
  kind: "recurring" | "exception_open" | "exception_closed";
  weekday: number | null;
  local_date: string | null;
  starts_at: string;
  ends_at: string;
  revision: number;
};

export type CelebrantManagementSession = {
  vendor: { slug: string; name: string; service_area: string };
  profile: {
    register_status: string;
    register_checked_at: string | null;
    phone_configured: boolean;
    participation_status: "not_asked" | "accepted" | "declined" | "paused";
    participation_updated_at: string | null;
    callback_phone_confirmed: boolean;
  } | null;
  capabilities: {
    granted: string[];
    consultation_availability: boolean;
    wedding_date_availability: boolean;
    separate_wedding_date_calendar: boolean;
    notice: string;
  };
  windows: CelebrantManagementWindow[];
  live: { session_id: string; expires_at: string; call_cap: number; paused: boolean; revision: number } | null;
};

export async function exchangeCelebrantManagementLink(token: string) {
  const response = await fetch(`${endpoint}/exchange`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
  });
  return responseJson<{ csrf_token: string; expires_at: string; account_access: false }>(response);
}

export async function getCelebrantManagementSession() {
  const response = await fetch(`${endpoint}/session`, { credentials: "same-origin", headers: { accept: "application/json" } });
  return responseJson<CelebrantManagementSession>(response);
}

export async function commandCelebrantManagement(csrfToken: string, input: Record<string, unknown>) {
  const response = await fetch(`${endpoint}/command`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
    body: JSON.stringify({ ...input, idempotency_key: `${String(input.operation ?? "calendar")}-${crypto.randomUUID()}` }),
  });
  return responseJson<{ saved?: boolean; replayed?: boolean }>(response);
}
