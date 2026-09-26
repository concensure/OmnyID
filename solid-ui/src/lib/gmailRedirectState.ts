// @locs-version: 1.0
export type GmailRedirectState = "connected" | "error" | "not_configured";

export function guestGmailRedirectMessage(state: GmailRedirectState): string {
  if (state === "connected") {
    return "Gmail authorization finished. Sign in to this workspace again to verify the connection.";
  }
  if (state === "not_configured") {
    return "Gmail OAuth is not configured on this server.";
  }
  return "Gmail connection failed. Sign in and try again.";
}

export function signedInGmailRedirectFallbackMessage(state: GmailRedirectState): string {
  if (state === "connected") {
    return "Gmail authorization finished, but this workspace could not confirm a stored Gmail connection. Try reconnecting. If it still fails, check the server Gmail OAuth configuration.";
  }
  if (state === "not_configured") {
    return "Gmail OAuth is not configured on this server.";
  }
  return "Gmail connection failed. Try again.";
}
