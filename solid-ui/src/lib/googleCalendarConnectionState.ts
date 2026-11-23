// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";

export type GoogleCalendarConnectionStatus = {
  connected: boolean;
  google_email: string;
  configured: boolean;
  token_expiry?: string | null;
  connected_at?: string | null;
  token_expired?: boolean;
  expires_within_24h?: boolean;
};

function optionalGoogleCalendarString(value: unknown): string | null | undefined {
  return typeof value === "string" || value === null ? value : undefined;
}

export function normalizeGoogleCalendarConnectionStatus(payload: unknown): GoogleCalendarConnectionStatus {
  if (!isRecord(payload)) {
    return { connected: false, google_email: "", configured: true };
  }
  return {
    connected: typeof payload.connected === "boolean" ? payload.connected : false,
    google_email: typeof payload.google_email === "string" ? payload.google_email : "",
    configured: typeof payload.configured === "boolean" ? payload.configured : true,
    token_expiry: optionalGoogleCalendarString(payload.token_expiry),
    connected_at: optionalGoogleCalendarString(payload.connected_at),
    token_expired: typeof payload.token_expired === "boolean" ? payload.token_expired : undefined,
    expires_within_24h: typeof payload.expires_within_24h === "boolean" ? payload.expires_within_24h : undefined,
  };
}
