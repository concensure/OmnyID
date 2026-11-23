// @locs-version: 1.0
export type GmailRedirectState =
  | "connected"
  | "error"
  | "not_configured"
  | "redirect_mismatch"
  | "invalid_client"
  | "invalid_grant"
  | "token_exchange_failed"
  | "access_denied"
  | "invalid_request"
  | "unauthorized_client"
  | "store_failed"
  | "capability_sync_failed";

export function guestGmailRedirectMessage(state: GmailRedirectState): string {
  if (state === "connected") {
    return "Gmail authorization finished. Sign in to this workspace again to verify the connection.";
  }
  if (state === "not_configured") {
    return "Gmail OAuth is not configured on this server.";
  }
  if (state === "access_denied") {
    return "Gmail connection was cancelled before access was granted.";
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
  if (state === "redirect_mismatch") {
    return "Gmail connection failed because Google rejected the redirect URI. Confirm the deployed server is using the same OMNYID_GMAIL_REDIRECT_URI that is registered in Google Cloud, then restart/redeploy the API service.";
  }
  if (state === "invalid_client" || state === "unauthorized_client") {
    return "Gmail connection failed because Google rejected the OAuth client. Confirm the deployed client ID and client secret match the Google Cloud OAuth client, then restart/redeploy the API service.";
  }
  if (state === "invalid_grant") {
    return "Gmail connection failed because Google rejected the one-time authorization code. Try Connect Gmail again; if it repeats, check for stale server OAuth settings.";
  }
  if (state === "token_exchange_failed") {
    return "Gmail connection failed while exchanging the Google authorization code. Check the deployed Gmail OAuth env values and server logs.";
  }
  if (state === "access_denied") {
    return "Gmail connection was cancelled before access was granted.";
  }
  if (state === "invalid_request") {
    return "Gmail connection failed because Google rejected the OAuth request. Check the deployed redirect URI, client type, and Gmail scopes.";
  }
  if (state === "store_failed") {
    return "Google authorized Gmail, but OmnyID could not save the Gmail token. Check database/token storage logs before retrying.";
  }
  if (state === "capability_sync_failed") {
    return "Google authorized Gmail and the token was saved, but OmnyID could not refresh connected email capabilities. Try refreshing the workspace.";
  }
  return "Gmail connection failed. Try again.";
}
