// @locs-version: 1.0
import type { McpToolConnection, ToolConnectionDisconnectResponse } from "@/lib/api";
import { isMissingToolConnectionsBackend } from "@/lib/toolConnectionRegistry";

export type ConnectedAppDef = {
  id: string;
  name: string;
  icon: string;
  category: string;
  description: string;
  capabilities: string[];
  authType: "api_key" | "oauth2" | "none";
  connectionProvider: "mcp" | "composio" | "gmail";
  mcpServerUrl: string;
  providerToolkitSlug?: string;
};

export function connectedAppEnableBlockedReason(
  app: ConnectedAppDef,
  options: {
    signedIn: boolean;
    localOnlyMode: boolean;
    composioUsable: boolean;
    gmailConfigured: boolean;
  },
): string | null {
  if (!options.signedIn || options.localOnlyMode) {
    return null;
  }
  if (app.connectionProvider === "gmail") {
    return options.gmailConfigured
      ? null
      : "Gmail OAuth is not configured on this server.";
  }
  if (app.connectionProvider !== "composio") {
    return null;
  }
  if (!options.composioUsable) {
    return "Composio-backed apps cannot be enabled because the server Composio project key is not usable.";
  }
  if (!app.providerToolkitSlug) {
    return "This Composio-backed app is missing its provider toolkit mapping.";
  }
  return null;
}

export const isMissingConnectedAppsBackend = isMissingToolConnectionsBackend;

export function buildConnectedAppPayload(app: ConnectedAppDef): Record<string, unknown> {
  return {
    tool_slug: app.id,
    tool_name: app.name,
    connection_provider: app.connectionProvider,
    toolkit_slug: app.providerToolkitSlug,
    ...(app.connectionProvider === "composio" ? {} : { mcp_server_url: app.mcpServerUrl }),
    tool_descriptor: {
      app_category: app.category,
      app_description: app.description,
      capabilities: app.capabilities,
      auth_type: app.authType,
      app_icon: app.icon,
      app_surface: "connected_apps",
      composio_toolkit_slug: app.providerToolkitSlug,
    },
  };
}

export function mergeConnectedAppConnection(
  connections: McpToolConnection[],
  connection: McpToolConnection,
): McpToolConnection[] {
  const filtered = connections.filter((item) => item.tool_slug !== connection.tool_slug);
  return [...filtered, connection];
}

export function disconnectConnectedAppNotice(
  appName: string,
  receipt: ToolConnectionDisconnectResponse,
): string | null {
  if (!receipt.disconnected) {
    return null;
  }
  if (receipt.session_cleanup_recommended) {
    return `${appName} was disconnected from this workspace, but the upstream provider grant may still be active. Review the connected account in Composio or the provider console if you need a full revoke.`;
  }
  if (receipt.upstream_revocation_supported && receipt.revoke_attempted) {
    return `${appName} was disconnected and upstream provider cleanup was requested.`;
  }
  return `${appName} was disconnected for this account.`;
}
