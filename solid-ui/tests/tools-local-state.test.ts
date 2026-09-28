import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import {
  LOCAL_CONNECTIONS_KEY,
  RECENTLY_USED_KEY,
  TOOL_USAGE_KEY,
  loadLocalToolConnections,
  loadRecentlyUsedToolSlugs,
  loadToolUseCount,
  recordRecentlyUsedToolSlug,
  saveLocalToolConnections,
} from "../src/lib/toolsLocalState.ts";

const userId = "user-1";
const usageKey = accountScopedStorageKey(TOOL_USAGE_KEY, userId);
const recentKey = accountScopedStorageKey(RECENTLY_USED_KEY, userId);
const connectionsKey = accountScopedStorageKey(LOCAL_CONNECTIONS_KEY, userId);
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

test.beforeEach(() => {
  localStorageState.clear();
});

test("loadToolUseCount keeps only finite non-negative numeric usage values", () => {
  localStorageState.set(
    usageKey,
    JSON.stringify({
      "github_2026-07": 4,
      "slack_2026-07": -1,
      "notion_2026-07": "9",
    }),
  );

  assert.equal(loadToolUseCount("github", new Date("2026-07-18T00:00:00.000Z"), userId), 4);
  assert.equal(loadToolUseCount("slack", new Date("2026-07-18T00:00:00.000Z"), userId), 0);
  assert.equal(loadToolUseCount("notion", new Date("2026-07-18T00:00:00.000Z"), userId), 0);
  assert.deepEqual(JSON.parse(localStorageState.get(usageKey) ?? "null"), {
    "github_2026-07": 4,
  });
});

test("loadRecentlyUsedToolSlugs filters blanks and duplicate entries", () => {
  localStorageState.set(
    recentKey,
    JSON.stringify(["github", "", "slack", "github", 7]),
  );

  assert.deepEqual(loadRecentlyUsedToolSlugs(userId), ["github", "slack"]);
  assert.deepEqual(JSON.parse(localStorageState.get(recentKey) ?? "null"), ["github", "slack"]);
});

test("loadLocalToolConnections keeps only complete local connection rows", () => {
  localStorageState.set(
    connectionsKey,
    JSON.stringify([
      {
        id: " local-github ",
        tool_slug: " github ",
        tool_name: " GitHub ",
        mcp_server_url: " local://workspace/github ",
        connected_at: " 2026-07-18T00:00:00.000Z ",
      },
      {
        id: "missing-url",
        tool_slug: "slack",
        tool_name: "Slack",
        connected_at: "2026-07-18T00:00:00.000Z",
      },
      7,
    ]),
  );

  assert.deepEqual(loadLocalToolConnections(userId), [
    {
      id: "local-github",
      tool_slug: "github",
      tool_name: "GitHub",
      mcp_server_url: "local://workspace/github",
      connected_at: "2026-07-18T00:00:00.000Z",
    },
  ]);
  assert.deepEqual(JSON.parse(localStorageState.get(connectionsKey) ?? "null"), [
    {
      id: "local-github",
      tool_slug: "github",
      tool_name: "GitHub",
      mcp_server_url: "local://workspace/github",
      connected_at: "2026-07-18T00:00:00.000Z",
    },
  ]);
});

test("tools local state loaders clear unparseable storage", () => {
  localStorageState.set(usageKey, "{bad json");
  localStorageState.set(recentKey, "{bad json");
  localStorageState.set(connectionsKey, "{bad json");

  assert.equal(loadToolUseCount("github", new Date("2026-07-18T00:00:00.000Z"), userId), 0);
  assert.deepEqual(loadRecentlyUsedToolSlugs(userId), []);
  assert.deepEqual(loadLocalToolConnections(userId), []);
  assert.equal(localStorageState.has(usageKey), false);
  assert.equal(localStorageState.has(recentKey), false);
  assert.equal(localStorageState.has(connectionsKey), false);
});

test("recordRecentlyUsedToolSlug persists only normalized unique slugs", () => {
  localStorageState.set(
    recentKey,
    JSON.stringify(["github", "", "slack"]),
  );

  const next = recordRecentlyUsedToolSlug("  slack  ", userId);

  assert.deepEqual(next, ["slack", "github"]);
  assert.equal(localStorageState.get(recentKey), JSON.stringify(["slack", "github"]));
});

test("saveLocalToolConnections persists only normalized local connection rows", () => {
  saveLocalToolConnections(userId, [
    {
      id: " local-github ",
      tool_slug: " github ",
      tool_name: " GitHub ",
      mcp_server_url: " local://workspace/github ",
      connected_at: " 2026-07-18T00:00:00.000Z ",
    },
    {
      id: "missing-url",
      tool_slug: "slack",
      tool_name: "Slack",
      connected_at: "2026-07-18T00:00:00.000Z",
    } as any,
  ]);

  assert.equal(
    localStorageState.get(connectionsKey),
    JSON.stringify([
      {
        id: "local-github",
        tool_slug: "github",
        tool_name: "GitHub",
        mcp_server_url: "local://workspace/github",
        connected_at: "2026-07-18T00:00:00.000Z",
      },
    ]),
  );
});

test("tools local state migrates legacy global storage into scoped keys", () => {
  localStorageState.set(TOOL_USAGE_KEY, JSON.stringify({ "github_2026-07": 4 }));
  localStorageState.set(RECENTLY_USED_KEY, JSON.stringify(["github", "slack"]));
  localStorageState.set(
    LOCAL_CONNECTIONS_KEY,
    JSON.stringify([{ id: "local-github", tool_slug: "github", tool_name: "GitHub", mcp_server_url: "local://workspace/github", connected_at: "2026-07-18T00:00:00.000Z" }]),
  );

  assert.equal(loadToolUseCount("github", new Date("2026-07-18T00:00:00.000Z"), userId), 4);
  assert.deepEqual(loadRecentlyUsedToolSlugs(userId), ["github", "slack"]);
  assert.deepEqual(loadLocalToolConnections(userId), [
    {
      id: "local-github",
      tool_slug: "github",
      tool_name: "GitHub",
      mcp_server_url: "local://workspace/github",
      connected_at: "2026-07-18T00:00:00.000Z",
    },
  ]);
  assert.equal(localStorageState.has(TOOL_USAGE_KEY), false);
  assert.equal(localStorageState.has(RECENTLY_USED_KEY), false);
  assert.equal(localStorageState.has(LOCAL_CONNECTIONS_KEY), false);
});
