import test from "node:test";
import assert from "node:assert/strict";

import type { McpToolConnection } from "../src/lib/api.ts";
import {
  buildConnectedAppPayload,
  connectedAppEnableBlockedReason,
  disconnectConnectedAppNotice,
  isMissingConnectedAppsBackend,
  mergeConnectedAppConnection,
  type ConnectedAppDef,
} from "../src/lib/connectedAppsViewModel.ts";
import {
  connectToolBlockedInLocalRegistryReason,
  signedInLocalRegistryBanner,
  signedInLocalRegistryNotice,
} from "../src/lib/toolConnectionRegistry.ts";

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

test("isMissingConnectedAppsBackend detects missing route failures", () => {
  assert.equal(isMissingConnectedAppsBackend(new Error("Cannot GET /tools/connections")), true);
  assert.equal(isMissingConnectedAppsBackend(new Error("404 not found")), true);
  assert.equal(isMissingConnectedAppsBackend(new Error("401 unauthorized")), false);
});

test("buildConnectedAppPayload emits a server-safe registry payload", () => {
  assert.deepEqual(buildConnectedAppPayload(APP), {
    tool_slug: "github",
    tool_name: "GitHub",
    connection_provider: "composio",
    toolkit_slug: "github",
    tool_descriptor: {
      app_category: "Developer",
      app_description: "Manage repos, issues, and PRs",
      capabilities: ["get_repo", "list_prs", "create_issue"],
      auth_type: "oauth2",
      app_icon: "GH",
      app_surface: "connected_apps",
      composio_toolkit_slug: "github",
    },
  });

  assert.deepEqual(buildConnectedAppPayload({ ...APP, connectionProvider: "mcp" }), {
    tool_slug: "github",
    tool_name: "GitHub",
    mcp_server_url: "https://backend.composio.dev/api/v3.1",
    connection_provider: "mcp",
    toolkit_slug: "github",
    tool_descriptor: {
      app_category: "Developer",
      app_description: "Manage repos, issues, and PRs",
      capabilities: ["get_repo", "list_prs", "create_issue"],
      auth_type: "oauth2",
      app_icon: "GH",
      app_surface: "connected_apps",
      composio_toolkit_slug: "github",
    },
  });
});

test("connectedAppEnableBlockedReason fails closed for incomplete composio activation", () => {
  assert.equal(
    connectedAppEnableBlockedReason(APP, {
      signedIn: true,
      localOnlyMode: false,
      composioUsable: false,
      gmailConfigured: true,
    }),
    "Composio-backed apps cannot be enabled because the server Composio project key is not usable.",
  );

  assert.equal(
    connectedAppEnableBlockedReason(APP, {
      signedIn: true,
      localOnlyMode: false,
      composioUsable: true,
      gmailConfigured: true,
    }),
    null,
  );

  assert.equal(
    connectedAppEnableBlockedReason(
      { ...APP, connectionProvider: "mcp" },
      {
        signedIn: true,
        localOnlyMode: false,
        composioUsable: false,
        gmailConfigured: true,
      },
    ),
    null,
  );

  assert.equal(
    connectedAppEnableBlockedReason(
      { ...APP, providerToolkitSlug: undefined },
      {
        signedIn: true,
        localOnlyMode: false,
        composioUsable: true,
        gmailConfigured: true,
      },
    ),
    "This Composio-backed app is missing its provider toolkit mapping.",
  );

  assert.equal(
    connectedAppEnableBlockedReason(GMAIL_APP, {
      signedIn: true,
      localOnlyMode: false,
      composioUsable: true,
      gmailConfigured: false,
    }),
    "Gmail OAuth is not configured on this server.",
  );

  assert.equal(
    connectedAppEnableBlockedReason(GMAIL_APP, {
      signedIn: true,
      localOnlyMode: false,
      composioUsable: false,
      gmailConfigured: true,
    }),
    null,
  );
});

test("mergeConnectedAppConnection replaces the existing row for one slug", () => {
  const current: McpToolConnection[] = [
    {
      id: "1",
      tool_slug: "github",
      tool_name: "GitHub",
      mcp_server_url: "https://old.example",
      connected_at: "2026-08-13T00:00:00Z",
    },
    {
      id: "2",
      tool_slug: "slack",
      tool_name: "Slack",
      mcp_server_url: "https://backend.composio.dev/api/v3.1",
      connected_at: "2026-08-13T00:00:00Z",
    },
  ];

  const merged = mergeConnectedAppConnection(current, {
    id: "3",
    tool_slug: "github",
    tool_name: "GitHub",
    mcp_server_url: "https://backend.composio.dev/api/v3.1",
    connected_at: "2026-08-13T01:00:00Z",
    connection_provider: "composio",
  });

  assert.deepEqual(merged, [
    {
      id: "2",
      tool_slug: "slack",
      tool_name: "Slack",
      mcp_server_url: "https://backend.composio.dev/api/v3.1",
      connected_at: "2026-08-13T00:00:00Z",
    },
    {
      id: "3",
      tool_slug: "github",
      tool_name: "GitHub",
      mcp_server_url: "https://backend.composio.dev/api/v3.1",
      connected_at: "2026-08-13T01:00:00Z",
      connection_provider: "composio",
    },
  ]);
});

test("shared tool connection registry copy is explicit about browser-only staging", () => {
  assert.match(signedInLocalRegistryNotice(), /browser-only staging data/i);
  assert.match(signedInLocalRegistryBanner(), /not active runtime connections/i);
  assert.match(connectToolBlockedInLocalRegistryReason("Slack"), /cannot connect slack right now/i);
});

test("disconnectConnectedAppNotice explains upstream cleanup outcomes without overstating them", () => {
  assert.equal(
    disconnectConnectedAppNotice("GitHub", {
      ok: true,
      disconnected: true,
      revoke_attempted: true,
      upstream_revocation_supported: true,
      capability_registry_refreshed: true,
      cleared_capability_count: 2,
      invalidate_local_cache_keys: [],
      session_cleanup_recommended: false,
      connection_provider: "composio",
    }),
    "GitHub was disconnected and upstream provider cleanup was requested.",
  );

  assert.match(
    disconnectConnectedAppNotice("GitHub", {
      ok: true,
      disconnected: true,
      revoke_attempted: false,
      upstream_revocation_supported: true,
      capability_registry_refreshed: true,
      cleared_capability_count: 0,
      invalidate_local_cache_keys: [],
      session_cleanup_recommended: true,
      connection_provider: "composio",
    }) ?? "",
    /provider grant may still be active/i,
  );

  assert.equal(
    disconnectConnectedAppNotice("Gmail", {
      ok: true,
      disconnected: true,
      revoke_attempted: false,
      upstream_revocation_supported: false,
      capability_registry_refreshed: true,
      cleared_capability_count: 0,
      invalidate_local_cache_keys: [],
      session_cleanup_recommended: false,
      connection_provider: "gmail",
    }),
    "Gmail was disconnected for this account.",
  );
});
