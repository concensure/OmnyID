import test from "node:test";
import assert from "node:assert/strict";

import type {
  ComposioStatusResponse,
  McpToolConnection,
  ToolConnectionDisconnectResponse,
} from "../src/lib/api.ts";
import {
  composioStatusDetailText,
  connectedAppsGmailConnectionRecord,
  finalizeConnectedAppsCallbackState,
  loadConnectedAppsBootstrapState,
  localConnectedAppsConnectionRecord,
  toggleConnectedAppState,
} from "../src/lib/connectedAppsState.ts";
import type { ConnectedAppDef } from "../src/lib/connectedAppsViewModel.ts";
import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import { CONNECTED_KEY } from "../src/lib/connectedAppsStorage.ts";
import { signedInLocalRegistryNotice } from "../src/lib/toolConnectionRegistry.ts";

const APP: ConnectedAppDef = {
  id: "github",
  name: "GitHub",
  icon: "GH",
  category: "Developer",
  description: "Manage repos, issues, and PRs",
  capabilities: ["get_repo", "list_prs", "create_issue"],
  authType: "oauth2",
  connectionProvider: "composio",
  mcpServerUrl: "https://backend.composio.dev/api/v3.1",
  providerToolkitSlug: "github",
};

const GMAIL_APP: ConnectedAppDef = {
  id: "gmail",
  name: "Gmail",
  icon: "GM",
  category: "Communication",
  description: "Read, compose, and manage email",
  capabilities: ["list_emails", "create_draft", "send_email"],
  authType: "oauth2",
  connectionProvider: "gmail",
  mcpServerUrl: "https://backend.composio.dev/api/v3.1",
};

const localStorageState = new Map<string, string>();

Object.assign(globalThis, {
  localStorage: {
    getItem(key: string) {
      return localStorageState.has(key) ? localStorageState.get(key)! : null;
    },
    setItem(key: string, value: string) {
      localStorageState.set(key, value);
    },
    removeItem(key: string) {
      localStorageState.delete(key);
    },
  },
});

function disconnectReceipt(overrides: Partial<ToolConnectionDisconnectResponse> = {}): ToolConnectionDisconnectResponse {
  return {
    ok: true,
    disconnected: true,
    revoke_attempted: true,
    upstream_revocation_supported: true,
    capability_registry_refreshed: true,
    cleared_capability_count: 1,
    invalidate_local_cache_keys: [],
    session_cleanup_recommended: false,
    connection_provider: "composio",
    ...overrides,
  };
}

test.beforeEach(() => {
  localStorageState.clear();
});

test("connection record helpers emit stable local representations", () => {
  assert.deepEqual(
    localConnectedAppsConnectionRecord(APP, "2026-09-01T10:00:00.000Z"),
    {
      id: "local-github",
      tool_slug: "github",
      tool_name: "GitHub",
      mcp_server_url: "https://backend.composio.dev/api/v3.1",
      connected_at: "2026-09-01T10:00:00.000Z",
      connection_provider: "composio",
    },
  );

  assert.deepEqual(
    connectedAppsGmailConnectionRecord("2026-09-01T10:01:00.000Z"),
    {
      id: "gmail-oauth",
      tool_slug: "gmail",
      tool_name: "Gmail",
      mcp_server_url: "https://accounts.google.com/o/oauth2/v2/auth",
      connected_at: "2026-09-01T10:01:00.000Z",
      connection_provider: "gmail",
    },
  );
});

test("composioStatusDetailText explains failing upstream states without overstating healthy ones", () => {
  assert.equal(composioStatusDetailText(null), null);
  assert.equal(composioStatusDetailText({ configured: true, usable: true }), null);
  assert.match(
    composioStatusDetailText({ configured: true, usable: false, failure_reason: "unauthorized", http_status: 401 }) ?? "",
    /HTTP 401/i,
  );
  assert.match(
    composioStatusDetailText({ configured: true, usable: false, failure_reason: "upstream_error", http_status: 503 }) ?? "",
    /upstream server error/i,
  );
});

test("loadConnectedAppsBootstrapState returns signed-out local-only defaults", async () => {
  const result = await loadConnectedAppsBootstrapState({
    signedIn: false,
    loadConnections: async () => {
      throw new Error("should not load");
    },
    loadComposioStatus: async () => ({ configured: true, usable: true }),
    loadGmailStatus: async () => ({ connected: true, gmail_email: "person@example.com", configured: true }),
  });

  assert.deepEqual(result, {
    connections: [],
    localOnlyMode: true,
    error: null,
    notice: null,
    composioConfigured: false,
    composioUsable: false,
    composioStatusDetail: null,
    gmailConfigured: false,
  });
});

test("loadConnectedAppsBootstrapState merges gmail status into server connections", async () => {
  const result = await loadConnectedAppsBootstrapState({
    signedIn: true,
    loadConnections: async () => ({
      connections: [
        {
          id: "1",
          tool_slug: "github",
          tool_name: "GitHub",
          mcp_server_url: "https://backend.composio.dev/api/v3.1",
          connected_at: "2026-09-01T09:00:00.000Z",
          connection_provider: "composio",
        },
      ],
    }),
    loadComposioStatus: async (): Promise<ComposioStatusResponse> => ({
      configured: true,
      usable: false,
      failure_reason: "rate_limited",
    }),
    loadGmailStatus: async () => ({
      connected: true,
      gmail_email: "person@example.com",
      configured: true,
    }),
  });

  assert.equal(result.localOnlyMode, false);
  assert.equal(result.error, null);
  assert.equal(result.gmailConfigured, true);
  assert.equal(result.composioConfigured, true);
  assert.equal(result.composioUsable, false);
  assert.deepEqual(
    result.connections.map((connection) => connection.tool_slug).sort(),
    ["github", "gmail"].sort(),
  );
});

test("loadConnectedAppsBootstrapState falls back to local registry notice when backend is missing", async () => {
  const result = await loadConnectedAppsBootstrapState({
    signedIn: true,
    loadConnections: async () => {
      throw new Error("Cannot GET /tools/connections");
    },
    loadComposioStatus: async () => ({ configured: true, usable: true }),
    loadGmailStatus: async () => ({ connected: false, gmail_email: "", configured: true }),
  });

  assert.equal(result.localOnlyMode, true);
  assert.equal(result.error, null);
  assert.equal(result.notice, signedInLocalRegistryNotice());
});

test("finalizeConnectedAppsCallbackState emits a merged connection payload and success notice", async () => {
  let receivedBody: Record<string, unknown> | null = null;

  const result = await finalizeConnectedAppsCallbackState({
    app: APP,
    composioConnectedAccountId: "acct_123",
    composioState: "state_123",
    composioStatus: "success",
    completeLink: async (body) => {
      receivedBody = body;
      return {
        connection: {
          id: "conn_123",
          tool_slug: "github",
          tool_name: "GitHub",
          mcp_server_url: "https://backend.composio.dev/api/v3.1",
          connected_at: "2026-09-01T10:05:00.000Z",
          connection_provider: "composio",
        },
      };
    },
  });

  assert.equal(receivedBody?.tool_slug, "github");
  assert.equal(receivedBody?.toolkit_slug, "github");
  assert.equal(receivedBody?.composio_connected_account_id, "acct_123");
  assert.equal(result.error, null);
  assert.equal(result.notice, "GitHub is now connected for this account.");
  assert.equal(result.connection?.id, "conn_123");
});

test("toggleConnectedAppState updates local-only storage without touching remote services", async () => {
  const result = await toggleConnectedAppState({
    app: APP,
    signedIn: true,
    localOnlyMode: true,
    connectedIds: new Set<string>(),
    legacyConnectedIds: [],
    sessionUserId: "user-1",
    validConnectedAppIds: new Set(["github", "gmail"]),
    composioUsable: false,
    gmailConfigured: false,
    connections: [],
    saveConnectedIds: (userId, ids) => {
      localStorageState.set(accountScopedStorageKey(CONNECTED_KEY, userId), JSON.stringify(ids));
    },
    clearConnectedIds: () => {
      throw new Error("should not clear");
    },
    disconnectGmail: async () => disconnectReceipt(),
    disconnectTool: async () => disconnectReceipt(),
    fetchGmailOAuthUrl: async () => "https://example.test/gmail",
    beginComposioLink: async () => ({ ok: true, redirect_url: "https://example.test/composio", tool_slug: "github", toolkit_slug: "github" }),
    connectTool: async () => ({
      connection: {
        id: "conn_1",
        tool_slug: "github",
        tool_name: "GitHub",
        mcp_server_url: APP.mcpServerUrl,
        connected_at: "2026-09-01T10:10:00.000Z",
      },
    }),
  });

  assert.deepEqual(result.legacyConnectedIds, ["github"]);
  assert.equal(result.localOnlyMode, true);
  assert.equal(
    localStorageState.get(accountScopedStorageKey(CONNECTED_KEY, "user-1")),
    JSON.stringify(["github"]),
  );
});

test("toggleConnectedAppState blocks enable when provider prerequisites are not satisfied", async () => {
  const result = await toggleConnectedAppState({
    app: APP,
    signedIn: true,
    localOnlyMode: false,
    connectedIds: new Set<string>(),
    legacyConnectedIds: [],
    sessionUserId: "user-1",
    validConnectedAppIds: new Set(["github", "gmail"]),
    composioUsable: false,
    gmailConfigured: true,
    connections: [],
    saveConnectedIds: () => {
      throw new Error("should not save");
    },
    clearConnectedIds: () => {
      throw new Error("should not clear");
    },
    disconnectGmail: async () => disconnectReceipt(),
    disconnectTool: async () => disconnectReceipt(),
    fetchGmailOAuthUrl: async () => "https://example.test/gmail",
    beginComposioLink: async () => ({ ok: true, redirect_url: "https://example.test/composio", tool_slug: "github", toolkit_slug: "github" }),
    connectTool: async () => {
      throw new Error("should not connect");
    },
  });

  assert.match(result.error ?? "", /project key is not usable/i);
  assert.equal(result.redirectUrl, null);
});

test("toggleConnectedAppState returns provider redirect URLs for oauth-backed enable flows", async () => {
  const gmailResult = await toggleConnectedAppState({
    app: GMAIL_APP,
    signedIn: true,
    localOnlyMode: false,
    connectedIds: new Set<string>(),
    legacyConnectedIds: [],
    sessionUserId: "user-1",
    validConnectedAppIds: new Set(["github", "gmail"]),
    composioUsable: true,
    gmailConfigured: true,
    connections: [],
    saveConnectedIds: () => {
      throw new Error("should not save");
    },
    clearConnectedIds: () => {
      throw new Error("should not clear");
    },
    disconnectGmail: async () => disconnectReceipt(),
    disconnectTool: async () => disconnectReceipt(),
    fetchGmailOAuthUrl: async () => "https://example.test/gmail-oauth",
    beginComposioLink: async () => ({ ok: true, redirect_url: "https://example.test/composio", tool_slug: "gmail", toolkit_slug: "gmail" }),
    connectTool: async () => {
      throw new Error("should not connect");
    },
  });

  assert.equal(gmailResult.redirectUrl, "https://example.test/gmail-oauth");

  const composioResult = await toggleConnectedAppState({
    app: APP,
    signedIn: true,
    localOnlyMode: false,
    connectedIds: new Set<string>(),
    legacyConnectedIds: [],
    sessionUserId: "user-1",
    validConnectedAppIds: new Set(["github", "gmail"]),
    composioUsable: true,
    gmailConfigured: true,
    connections: [],
    saveConnectedIds: () => {
      throw new Error("should not save");
    },
    clearConnectedIds: () => {
      throw new Error("should not clear");
    },
    disconnectGmail: async () => disconnectReceipt(),
    disconnectTool: async () => disconnectReceipt(),
    fetchGmailOAuthUrl: async () => "https://example.test/gmail-oauth",
    beginComposioLink: async () => ({ ok: true, redirect_url: "https://example.test/composio", tool_slug: "github", toolkit_slug: "github" }),
    connectTool: async () => {
      throw new Error("should not connect");
    },
  });

  assert.equal(composioResult.redirectUrl, "https://example.test/composio");
});

test("toggleConnectedAppState removes remote connections and clears legacy cache when requested", async () => {
  const key = accountScopedStorageKey(CONNECTED_KEY, "user-1");
  localStorageState.set(key, JSON.stringify(["github"]));
  let clearedUserId: string | null = "not-called";
  const currentConnections: McpToolConnection[] = [
    {
      id: "conn_1",
      tool_slug: "github",
      tool_name: "GitHub",
      mcp_server_url: APP.mcpServerUrl,
      connected_at: "2026-09-01T10:15:00.000Z",
      connection_provider: "composio",
    },
    {
      id: "conn_2",
      tool_slug: "slack",
      tool_name: "Slack",
      mcp_server_url: APP.mcpServerUrl,
      connected_at: "2026-09-01T10:16:00.000Z",
      connection_provider: "composio",
    },
  ];

  const result = await toggleConnectedAppState({
    app: APP,
    signedIn: true,
    localOnlyMode: false,
    connectedIds: new Set(["github"]),
    legacyConnectedIds: ["github"],
    sessionUserId: "user-1",
    validConnectedAppIds: new Set(["github", "gmail", "slack"]),
    composioUsable: true,
    gmailConfigured: true,
    connections: currentConnections,
    saveConnectedIds: () => {
      throw new Error("should not save");
    },
    clearConnectedIds: (userId) => {
      clearedUserId = userId;
      localStorageState.delete(accountScopedStorageKey(CONNECTED_KEY, userId));
    },
    disconnectGmail: async () => disconnectReceipt(),
    disconnectTool: async () => disconnectReceipt({
      invalidate_local_cache_keys: ["connected_apps_storage"],
      revoke_attempted: false,
    }),
    fetchGmailOAuthUrl: async () => "https://example.test/gmail-oauth",
    beginComposioLink: async () => ({ ok: true, redirect_url: "https://example.test/composio", tool_slug: "github", toolkit_slug: "github" }),
    connectTool: async () => {
      throw new Error("should not connect");
    },
  });

  assert.equal(clearedUserId, "user-1");
  assert.deepEqual(result.connections?.map((connection) => connection.tool_slug), ["slack"]);
  assert.deepEqual(result.legacyConnectedIds, []);
  assert.equal(localStorageState.has(key), false);
  assert.match(result.notice ?? "", /GitHub was disconnected/i);
});

test("toggleConnectedAppState falls back to local staging when the backend disappears mid-action", async () => {
  const result = await toggleConnectedAppState({
    app: APP,
    signedIn: true,
    localOnlyMode: false,
    connectedIds: new Set<string>(),
    legacyConnectedIds: [],
    sessionUserId: "user-1",
    validConnectedAppIds: new Set(["github", "gmail"]),
    composioUsable: true,
    gmailConfigured: true,
    connections: [],
    saveConnectedIds: (userId, ids) => {
      localStorageState.set(accountScopedStorageKey(CONNECTED_KEY, userId), JSON.stringify(ids));
    },
    clearConnectedIds: () => {
      throw new Error("should not clear");
    },
    disconnectGmail: async () => disconnectReceipt(),
    disconnectTool: async () => disconnectReceipt(),
    fetchGmailOAuthUrl: async () => "https://example.test/gmail-oauth",
    beginComposioLink: async () => {
      throw new Error("Cannot POST /tools/connections");
    },
    connectTool: async () => {
      throw new Error("should not connect");
    },
  });

  assert.equal(result.localOnlyMode, true);
  assert.deepEqual(result.legacyConnectedIds, ["github"]);
  assert.equal(result.notice, signedInLocalRegistryNotice());
});
