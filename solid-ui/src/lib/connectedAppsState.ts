// @locs-version: 1.0
import type {
  ComposioLinkResponse,
  ComposioStatusResponse,
  McpToolConnection,
  ToolConnectionDisconnectResponse,
} from "@/lib/api";
import type { GmailConnectionStatus } from "@/lib/gmailConnectionState";
import {
  buildConnectedAppPayload,
  connectedAppEnableBlockedReason,
  disconnectConnectedAppNotice,
  isMissingConnectedAppsBackend,
  mergeConnectedAppConnection,
  type ConnectedAppDef,
} from "@/lib/connectedAppsViewModel";
import { signedInLocalRegistryNotice } from "@/lib/toolConnectionRegistry";

export type ConnectedAppsBootstrapState = {
  connections: McpToolConnection[];
  localOnlyMode: boolean;
  error: string | null;
  notice: string | null;
  composioConfigured: boolean;
  composioUsable: boolean;
  composioStatusDetail: ComposioStatusResponse | null;
  gmailConfigured: boolean;
};

export type ConnectedAppsCallbackCompletionResult = {
  connection: McpToolConnection | null;
  error: string | null;
  notice: string | null;
};

export type ConnectedAppsToggleResult = {
  connections: McpToolConnection[] | null;
  legacyConnectedIds: string[] | null;
  localOnlyMode: boolean | null;
  error: string | null;
  notice: string | null;
  redirectUrl: string | null;
};

export function localConnectedAppsConnectionRecord(
  app: ConnectedAppDef,
  nowIso = new Date().toISOString(),
): McpToolConnection {
  return {
    id: `local-${app.id}`,
    tool_slug: app.id,
    tool_name: app.name,
    mcp_server_url: app.mcpServerUrl,
    connected_at: nowIso,
    connection_provider: app.connectionProvider,
  };
}

export function connectedAppsGmailConnectionRecord(
  nowIso = new Date().toISOString(),
): McpToolConnection {
  return {
    id: "gmail-oauth",
    tool_slug: "gmail",
    tool_name: "Gmail",
    mcp_server_url: "https://accounts.google.com/o/oauth2/v2/auth",
    connected_at: nowIso,
    connection_provider: "gmail",
  };
}

export function composioStatusDetailText(status: ComposioStatusResponse | null): string | null {
  if (!status || status.usable) return null;
  switch (status.failure_reason) {
    case "unauthorized":
      return `Composio rejected the configured project key${status.http_status ? ` with HTTP ${status.http_status}` : ""}.`;
    case "rate_limited":
      return "Composio is rate-limiting the project key verification checks right now.";
    case "upstream_error":
      return `Composio returned an upstream server error${status.http_status ? ` (HTTP ${status.http_status})` : ""}.`;
    case "failing":
      return `Composio verification is failing${status.http_status ? ` with HTTP ${status.http_status}` : ""}.`;
    case "not_configured":
      return "Composio is not configured on this server.";
    default:
      return null;
  }
}

export async function loadConnectedAppsBootstrapState(args: {
  signedIn: boolean;
  loadConnections: () => Promise<{ connections: McpToolConnection[] }>;
  loadComposioStatus: () => Promise<ComposioStatusResponse>;
  loadGmailStatus: () => Promise<GmailConnectionStatus>;
}): Promise<ConnectedAppsBootstrapState> {
  if (!args.signedIn) {
    return {
      connections: [],
      localOnlyMode: true,
      error: null,
      notice: null,
      composioConfigured: false,
      composioUsable: false,
      composioStatusDetail: null,
      gmailConfigured: false,
    };
  }

  try {
    const [{ connections }, composioStatus, gmailStatus] = await Promise.all([
      args.loadConnections(),
      args.loadComposioStatus().catch(() => ({ configured: false, usable: false })),
      args.loadGmailStatus().catch(() => ({ connected: false, gmail_email: "", configured: false })),
    ]);
    return {
      connections: gmailStatus.connected
        ? mergeConnectedAppConnection(connections, connectedAppsGmailConnectionRecord())
        : connections.filter((connection: McpToolConnection) => connection.tool_slug !== "gmail"),
      localOnlyMode: false,
      error: null,
      notice: null,
      composioConfigured: composioStatus.configured,
      composioUsable: composioStatus.usable,
      composioStatusDetail: composioStatus,
      gmailConfigured: gmailStatus.configured,
    };
  } catch (error) {
    if (isMissingConnectedAppsBackend(error)) {
      return {
        connections: [],
        localOnlyMode: true,
        error: null,
        notice: signedInLocalRegistryNotice(),
        composioConfigured: false,
        composioUsable: false,
        composioStatusDetail: null,
        gmailConfigured: false,
      };
    }
    return {
      connections: [],
      localOnlyMode: false,
      error: error instanceof Error ? error.message : "Failed to load connected apps.",
      notice: null,
      composioConfigured: false,
      composioUsable: false,
      composioStatusDetail: null,
      gmailConfigured: false,
    };
  }
}

export async function finalizeConnectedAppsCallbackState(args: {
  app: ConnectedAppDef;
  composioConnectedAccountId: string;
  composioState?: string | null;
  composioStatus?: string | null;
  completeLink: (body: Record<string, unknown>) => Promise<{ connection: McpToolConnection }>;
}): Promise<ConnectedAppsCallbackCompletionResult> {
  const response = await args.completeLink({
    ...buildConnectedAppPayload(args.app),
    composio_connected_account_id: args.composioConnectedAccountId,
    composio_state: args.composioState,
    composio_status: args.composioStatus,
  });
  return {
    connection: response.connection,
    error: null,
    notice: `${args.app.name} is now connected for this account.`,
  };
}

export async function toggleConnectedAppState(args: {
  app: ConnectedAppDef;
  signedIn: boolean;
  localOnlyMode: boolean;
  connectedIds: ReadonlySet<string>;
  legacyConnectedIds: string[];
  sessionUserId: string | null;
  validConnectedAppIds: ReadonlySet<string>;
  composioUsable: boolean;
  gmailConfigured: boolean;
  connections: McpToolConnection[];
  saveConnectedIds: (userId: string | null, ids: string[], validIds: ReadonlySet<string>) => void;
  clearConnectedIds: (userId: string | null) => void;
  disconnectGmail: () => Promise<ToolConnectionDisconnectResponse>;
  disconnectTool: (slug: string) => Promise<ToolConnectionDisconnectResponse>;
  fetchGmailOAuthUrl: (scope: "workspace") => Promise<string>;
  beginComposioLink: (body: Record<string, unknown>) => Promise<ComposioLinkResponse>;
  connectTool: (body: Record<string, unknown>) => Promise<{ connection: McpToolConnection }>;
}): Promise<ConnectedAppsToggleResult> {
  const { app } = args;

  try {
    if (args.localOnlyMode || !args.signedIn) {
      const next = args.connectedIds.has(app.id)
        ? args.legacyConnectedIds.filter((id) => id !== app.id)
        : [...args.legacyConnectedIds, app.id];
      args.saveConnectedIds(args.sessionUserId, next, args.validConnectedAppIds);
      return {
        connections: null,
        legacyConnectedIds: next,
        localOnlyMode: args.localOnlyMode,
        error: null,
        notice: null,
        redirectUrl: null,
      };
    }

    if (args.connectedIds.has(app.id)) {
      const receipt =
        app.connectionProvider === "gmail"
          ? await args.disconnectGmail()
          : await args.disconnectTool(app.id);
      if (receipt.invalidate_local_cache_keys.includes("connected_apps_storage")) {
        args.clearConnectedIds(args.sessionUserId);
      }
      return {
        connections: args.connections.filter((connection) => connection.tool_slug !== app.id),
        legacyConnectedIds: receipt.invalidate_local_cache_keys.includes("connected_apps_storage") ? [] : null,
        localOnlyMode: false,
        error: null,
        notice: disconnectConnectedAppNotice(app.name, receipt),
        redirectUrl: null,
      };
    }

    const blockedReason = connectedAppEnableBlockedReason(app, {
      signedIn: args.signedIn,
      localOnlyMode: args.localOnlyMode,
      composioUsable: args.composioUsable,
      gmailConfigured: args.gmailConfigured,
    });
    if (blockedReason) {
      return {
        connections: null,
        legacyConnectedIds: null,
        localOnlyMode: null,
        error: blockedReason,
        notice: null,
        redirectUrl: null,
      };
    }
    if (app.connectionProvider === "gmail") {
      return {
        connections: null,
        legacyConnectedIds: null,
        localOnlyMode: false,
        error: null,
        notice: null,
        redirectUrl: await args.fetchGmailOAuthUrl("workspace"),
      };
    }
    if (app.connectionProvider === "composio") {
      const response = await args.beginComposioLink(buildConnectedAppPayload(app));
      return {
        connections: null,
        legacyConnectedIds: null,
        localOnlyMode: false,
        error: null,
        notice: null,
        redirectUrl: response.redirect_url,
      };
    }
    const response = await args.connectTool(buildConnectedAppPayload(app));
    return {
      connections: mergeConnectedAppConnection(args.connections, response.connection),
      legacyConnectedIds: null,
      localOnlyMode: false,
      error: null,
      notice: null,
      redirectUrl: null,
    };
  } catch (error) {
    if (isMissingConnectedAppsBackend(error)) {
      const nextIds = new Set(args.legacyConnectedIds);
      if (nextIds.has(app.id)) nextIds.delete(app.id);
      else nextIds.add(app.id);
      const next = [...nextIds];
      args.saveConnectedIds(args.sessionUserId, next, args.validConnectedAppIds);
      return {
        connections: null,
        legacyConnectedIds: next,
        localOnlyMode: true,
        error: null,
        notice: signedInLocalRegistryNotice(),
        redirectUrl: null,
      };
    }
    return {
      connections: null,
      legacyConnectedIds: null,
      localOnlyMode: null,
      error: error instanceof Error ? error.message : `Failed to update ${app.name}.`,
      notice: null,
      redirectUrl: null,
    };
  }
}
