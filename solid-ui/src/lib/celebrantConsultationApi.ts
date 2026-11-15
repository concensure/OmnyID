import { apiFetch } from "@/lib/api";

export interface CelebrantWindow {
  window_id: string;
  kind: "recurring" | "exception_open" | "exception_closed";
  weekday?: number | null;
  local_date?: string | null;
  starts_at: string;
  ends_at: string;
  enabled: boolean;
  revision: number;
}

export interface CelebrantRequest {
  request_id: string;
  mode: "immediate" | "scheduled";
  intent: string;
  topic: string;
  location?: string | null;
  wedding_date?: string | null;
  status: string;
  approval_state?: "pending" | "approved" | "not_applicable";
  requester_name?: string | null;
  account_linked?: boolean;
  scheduled_start?: string | null;
  hold_expires_at?: string | null;
  accepted_at?: string | null;
  revision: number;
}

export interface CelebrantDashboard {
  vendor: { vendor_slug: string; name: string; category: string };
  profile?: {
    register_status: string;
    register_type?: string | null;
    register_checked_at?: string | null;
    service_regions: string[];
    languages: string[];
    topics: string[];
    accepted_intents: string[];
    buffer_minutes: number;
    consultation_minutes: number;
    business_phone_configured: boolean;
    revision: number;
  } | null;
  windows: CelebrantWindow[];
  live?: { session_id: string; starts_at: string; expires_at: string; call_cap: number; paused: boolean; revision: number } | null;
  requests: CelebrantRequest[];
}

const query = (slug: string) => `vendor_slug=${encodeURIComponent(slug)}`;

export const getCelebrantDashboard = (slug: string) => apiFetch<CelebrantDashboard>(`/api/wedding/vendor/portal/celebrant-consultations?${query(slug)}`);

export const saveCelebrantSettings = (slug: string, input: {
  expectedRevision?: number;
  serviceRegions: string[];
  languages: string[];
  topics: string[];
  acceptedIntents: string[];
  businessPhone?: string;
  bufferMinutes: number;
}) => apiFetch<{ saved: boolean; revision: number }>(`/api/wedding/vendor/portal/celebrant-consultations?${query(slug)}`, {
  method: "PUT",
  bodyJson: {
    expected_revision: input.expectedRevision ?? null,
    service_regions: input.serviceRegions,
    languages: input.languages,
    topics: input.topics,
    accepted_intents: input.acceptedIntents,
    business_phone: input.businessPhone || null,
    buffer_minutes: input.bufferMinutes,
  },
});

export const addCelebrantWindow = (slug: string, input: { kind: string; weekday: number | null; localDate: string | null; startsAt: string; endsAt: string }) => apiFetch<{ window_id: string; saved: boolean }>(`/api/wedding/vendor/portal/celebrant-consultations/windows?${query(slug)}`, {
  method: "POST",
  bodyJson: { kind: input.kind, weekday: input.weekday, local_date: input.localDate, starts_at: input.startsAt, ends_at: input.endsAt },
});

export const removeCelebrantWindow = (slug: string, windowId: string) => apiFetch<{ removed: boolean }>(`/api/wedding/vendor/portal/celebrant-consultations/windows/${encodeURIComponent(windowId)}/remove?${query(slug)}`, { method: "POST", bodyJson: {} });

export const setCelebrantLive = (slug: string, action: "start" | "pause", durationMinutes = 60, callCap = 3) => apiFetch<{ live: boolean; expires_at?: string }>(`/api/wedding/vendor/portal/celebrant-consultations/live?${query(slug)}`, {
  method: "PUT", bodyJson: { action, duration_minutes: durationMinutes, call_cap: callCap },
});

export const actionCelebrantRequest = (slug: string, request: CelebrantRequest, action: "accept" | "pass" | "cancel" | "reschedule" | "connected" | "not_connected", rescheduleStart?: string) => apiFetch<{ status: string; approval_state?: string; callback_phone?: string; number_notice?: string }>(`/api/wedding/vendor/portal/celebrant-consultations/requests/${encodeURIComponent(request.request_id)}/action?${query(slug)}`, {
  method: "POST", bodyJson: { action, expected_revision: request.revision, reschedule_start: rescheduleStart ?? null },
});
