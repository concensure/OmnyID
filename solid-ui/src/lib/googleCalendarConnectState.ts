import { fetchGoogleCalendarOAuthConfig, fetchGoogleCalendarOAuthUrl, type GoogleCalendarOAuthConfig } from "@/lib/api";

export type GoogleCalendarConnectFailure = {
  message: string;
  reauthRequired: boolean;
};

export function googleCalendarConnectFailure(
  error: unknown,
  config: GoogleCalendarOAuthConfig | null,
): GoogleCalendarConnectFailure {
  const detail = error instanceof Error ? error.message.toLowerCase() : "";
  if (detail.includes("recent sign-in required")) {
    return {
      message: "For your security, reconnecting Google Calendar needs a fresh sign-in. Sign in again, then return to Calendar and press Reconnect.",
      reauthRequired: true,
    };
  }
  if (config && !config.configured) {
    return {
      message: "Google Calendar is not configured on this server yet. Your OmnyID wedding calendar is still available.",
      reauthRequired: false,
    };
  }
  return {
    message: "Google Calendar did not start the secure connection. Your OmnyID wedding calendar is still available; try again in a moment.",
    reauthRequired: false,
  };
}

export async function startGoogleCalendarConnection(assign: (url: string) => void): Promise<GoogleCalendarConnectFailure | null> {
  try {
    const config = await fetchGoogleCalendarOAuthConfig();
    if (!config.configured) throw new Error("Google Calendar OAuth not configured");
    assign(await fetchGoogleCalendarOAuthUrl());
    return null;
  } catch (error) {
    const config = await fetchGoogleCalendarOAuthConfig().catch(() => null);
    return googleCalendarConnectFailure(error, config);
  }
}
