import test from "node:test";
import assert from "node:assert/strict";

import {
  readComposioCallbackState,
  stripComposioCallbackParams,
} from "../src/lib/composioCallbackState.ts";
import type { ConnectedAppDef } from "../src/lib/connectedAppsViewModel.ts";

const APPS: ConnectedAppDef[] = [
  {
    id: "github",
    name: "GitHub",
    icon: "GH",
    category: "Developer",
    description: "Manage repos, issues, and PRs",
    capabilities: ["get_repo"],
    authType: "oauth2",
    connectionProvider: "composio",
    mcpServerUrl: "https://backend.composio.dev/api/v3.1",
    providerToolkitSlug: "github",
  },
  {
    id: "gmail",
    name: "Gmail",
    icon: "GM",
    category: "Communication",
    description: "Read and send email",
    capabilities: ["list_emails"],
    authType: "oauth2",
    connectionProvider: "mcp",
    mcpServerUrl: "https://backend.composio.dev/api/v3.1",
  },
];

test("readComposioCallbackState ignores non-callback searches", () => {
  assert.deepEqual(readComposioCallbackState("?foo=bar", APPS), { mode: "none" });
});

test("readComposioCallbackState fails closed for unknown or incomplete callback payloads", () => {
  assert.deepEqual(
    readComposioCallbackState("?composio=return&tool=unknown&state=s&connected_account_id=ca_1", APPS),
    {
      mode: "error",
      message: "Composio returned to the workspace without a recognized app mapping.",
    },
  );

  assert.deepEqual(
    readComposioCallbackState("?composio=return&tool=github&connected_account_id=ca_1", APPS),
    {
      mode: "error",
      message: "Composio did not return the required auth details for GitHub.",
    },
  );

  assert.deepEqual(
    readComposioCallbackState("?composio=return&tool=github&state=s&connected_account_id=ca_1&status=failed", APPS),
    {
      mode: "error",
      message: "Composio reported that GitHub was not connected successfully.",
    },
  );
});

test("readComposioCallbackState accepts successful composio callback payloads", () => {
  assert.deepEqual(
    readComposioCallbackState("?composio=return&tool=github&state=signed-state&connected_account_id=ca_123&status=success", APPS),
    {
      mode: "complete",
      app: APPS[0],
      composio_state: "signed-state",
      composio_connected_account_id: "ca_123",
      composio_status: "success",
    },
  );
});

test("stripComposioCallbackParams removes only composio callback query keys", () => {
  assert.equal(
    stripComposioCallbackParams("https://app.omnyid.com/workspace/?foo=1&composio=return&tool=github&state=signed&connected_account_id=ca_1&status=success#apps"),
    "/workspace/?foo=1#apps",
  );
});
