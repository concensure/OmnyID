// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";

export type GmailConnectionStatus = {
  connected: boolean;
  gmail_email: string;
  configured: boolean;
  token_expiry?: string | null;
  connected_at?: string | null;
  token_expired?: boolean;
  expires_within_24h?: boolean;
};

export type GmailOAuthConfig = {
  configured: boolean;
  clientIdConfigured: boolean;
  clientSecretConfigured: boolean;
  csrfSecretConfigured: boolean;
  homeserverUrlConfigured: boolean;
  redirectUri: string | null;
  requiredAuthorizedRedirectUri: string | null;
  oauthClientSource: string | null;
  requiredScopes: string[];
};

function optionalGmailString(value: unknown): string | null | undefined {
  return typeof value === "string" || value === null ? value : undefined;
}

function stringAlias(payload: Record<string, unknown>, snakeKey: string, camelKey: string): string {
  const snake = payload[snakeKey];
  if (typeof snake === "string") return snake;
  const camel = payload[camelKey];
  return typeof camel === "string" ? camel : "";
}

function optionalStringAlias(payload: Record<string, unknown>, snakeKey: string, camelKey: string): string | null | undefined {
  const snake = optionalGmailString(payload[snakeKey]);
  if (snake !== undefined) return snake;
  return optionalGmailString(payload[camelKey]);
}

function optionalBooleanAlias(payload: Record<string, unknown>, snakeKey: string, camelKey: string): boolean | undefined {
  const snake = payload[snakeKey];
  if (typeof snake === "boolean") return snake;
  const camel = payload[camelKey];
  return typeof camel === "boolean" ? camel : undefined;
}

export function normalizeGmailConnectionStatus(payload: unknown): GmailConnectionStatus {
  if (!isRecord(payload)) {
    return { connected: false, gmail_email: "", configured: true };
  }
  return {
    connected: typeof payload.connected === "boolean" ? payload.connected : false,
    gmail_email: stringAlias(payload, "gmail_email", "gmailEmail"),
    configured: typeof payload.configured === "boolean" ? payload.configured : true,
    token_expiry: optionalStringAlias(payload, "token_expiry", "tokenExpiry"),
    connected_at: optionalStringAlias(payload, "connected_at", "connectedAt"),
    token_expired: optionalBooleanAlias(payload, "token_expired", "tokenExpired"),
    expires_within_24h: optionalBooleanAlias(payload, "expires_within_24h", "expiresWithin24h"),
  };
}

export function oauthUrlFromResponse(payload: unknown): string {
  if (!isRecord(payload) || typeof payload.url !== "string" || !/^https:\/\//i.test(payload.url)) {
    throw new Error("Invalid OAuth redirect URL received from server.");
  }
  return payload.url;
}

function booleanAlias(payload: Record<string, unknown>, snakeKey: string, camelKey: string): boolean {
  const snake = payload[snakeKey];
  if (typeof snake === "boolean") return snake;
  const camel = payload[camelKey];
  return typeof camel === "boolean" ? camel : false;
}

function stringListAlias(payload: Record<string, unknown>, snakeKey: string, camelKey: string): string[] {
  const value = Array.isArray(payload[snakeKey]) ? payload[snakeKey] : payload[camelKey];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

export function normalizeGmailOAuthConfig(payload: unknown): GmailOAuthConfig {
  const record = isRecord(payload) ? payload : {};
  return {
    configured: booleanAlias(record, "configured", "configured"),
    clientIdConfigured: booleanAlias(record, "client_id_configured", "clientIdConfigured"),
    clientSecretConfigured: booleanAlias(record, "client_secret_configured", "clientSecretConfigured"),
    csrfSecretConfigured: booleanAlias(record, "csrf_secret_configured", "csrfSecretConfigured"),
    homeserverUrlConfigured: booleanAlias(record, "homeserver_url_configured", "homeserverUrlConfigured"),
    redirectUri: optionalStringAlias(record, "redirect_uri", "redirectUri") ?? null,
    requiredAuthorizedRedirectUri: optionalStringAlias(
      record,
      "required_authorized_redirect_uri",
      "requiredAuthorizedRedirectUri",
    ) ?? null,
    oauthClientSource: optionalStringAlias(record, "oauth_client_source", "oauthClientSource") ?? null,
    requiredScopes: stringListAlias(record, "required_scopes", "requiredScopes"),
  };
}

export function gmailOAuthConfigFailureMessage(config: GmailOAuthConfig | null | undefined): string {
  if (!config) return "Gmail connection failed. Check the server OAuth configuration.";
  const missing = [
    !config.clientIdConfigured ? "client ID" : null,
    !config.clientSecretConfigured ? "client secret" : null,
    !config.csrfSecretConfigured ? "session secret" : null,
    !config.homeserverUrlConfigured ? "homeserver URL" : null,
  ].filter((item): item is string => Boolean(item));
  if (missing.length > 0) {
    return `Gmail OAuth is missing ${missing.join(", ")}.`;
  }
  if (config.requiredAuthorizedRedirectUri) {
    return `Gmail connection failed. In Google Cloud Console, confirm this authorized redirect URI is registered: ${config.requiredAuthorizedRedirectUri}`;
  }
  return "Gmail connection failed. Check the OAuth client type, consent screen, redirect URI, and Gmail scopes.";
}

export type GmailConnectionWarningState = {
  tone: "warning" | "danger";
  title: string;
  detail: string;
  actionLabel: string;
} | null;

export type GmailActionAvailabilityState = {
  blocking: boolean;
  tone: "neutral" | "warning" | "danger";
  summary: string;
  detail: string;
  actionLabel: string | null;
} | null;

function gmailExpiryRelativeLabel(tokenExpiry?: string | null, nowMs = Date.now()): string {
  if (!tokenExpiry) return "soon";
  const expiresAtMs = Date.parse(tokenExpiry);
  if (Number.isNaN(expiresAtMs)) return "soon";
  const deltaMs = expiresAtMs - nowMs;
  if (deltaMs <= 0) return "already expired";
  const deltaMinutes = Math.ceil(deltaMs / 60000);
  if (deltaMinutes <= 60) return `in ${deltaMinutes}m`;
  const deltaHours = Math.ceil(deltaMinutes / 60);
  if (deltaHours <= 24) return `in ${deltaHours}h`;
  const deltaDays = Math.ceil(deltaHours / 24);
  return `in ${deltaDays}d`;
}

export function gmailConnectionWarningState(
  status: GmailConnectionStatus | null | undefined,
  nowMs = Date.now(),
): GmailConnectionWarningState {
  if (!status?.connected) return null;
  if (status.token_expired) {
    return {
      tone: "danger",
      title: "Gmail token expired",
      detail: "Reconnect Gmail before approving email actions so the agent does not queue work it cannot deliver.",
      actionLabel: "Reconnect Gmail",
    };
  }
  if (status.expires_within_24h) {
    return {
      tone: "warning",
      title: "Gmail connection expires soon",
      detail: `This Gmail connection expires ${gmailExpiryRelativeLabel(status.token_expiry, nowMs)}. Reconnect now so reply and triage actions do not fail mid-flow.`,
      actionLabel: "Reconnect Gmail",
    };
  }
  return null;
}

function gmailConnectedRelativeLabel(connectedAt?: string | null, nowMs = Date.now()): string {
  if (!connectedAt) return "sync time unavailable";
  const connectedAtMs = Date.parse(connectedAt);
  if (Number.isNaN(connectedAtMs)) return "sync time unavailable";
  const deltaMinutes = Math.max(0, Math.floor((nowMs - connectedAtMs) / 60000));
  if (deltaMinutes < 1) return "synced just now";
  if (deltaMinutes < 60) return `synced ${deltaMinutes}m ago`;
  const deltaHours = Math.floor(deltaMinutes / 60);
  if (deltaHours < 24) return `synced ${deltaHours}h ago`;
  const deltaDays = Math.floor(deltaHours / 24);
  return `synced ${deltaDays}d ago`;
}

export function gmailActionAvailabilityState(
  status: GmailConnectionStatus | null | undefined,
  nowMs = Date.now(),
): GmailActionAvailabilityState {
  if (!status?.connected) return null;
  if (status.token_expired) {
    return {
      blocking: true,
      tone: "danger",
      summary: "Using Gmail | token expired",
      detail: "Reconnect first. Reply and inbox actions can queue work the agent cannot deliver while this token is stale.",
      actionLabel: "Reconnect Gmail",
    };
  }
  if (status.expires_within_24h) {
    return {
      blocking: false,
      tone: "warning",
      summary: `Using Gmail | expires ${gmailExpiryRelativeLabel(status.token_expiry, nowMs)}`,
      detail: "Reconnect soon so draft, reply, and labeling actions do not fail mid-flow.",
      actionLabel: "Reconnect Gmail",
    };
  }
  return {
    blocking: false,
    tone: "neutral",
    summary: `Using Gmail | connected | ${gmailConnectedRelativeLabel(status.connected_at, nowMs)}`,
    detail: "Inbox actions will use the connected Gmail account.",
    actionLabel: null,
  };
}
