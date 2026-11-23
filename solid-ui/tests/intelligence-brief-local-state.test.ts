import test from "node:test";
import assert from "node:assert/strict";

import {
  loadBriefRead,
  loadBriefSettings,
  loadTileEnabled,
  saveBriefRead,
  saveBriefSettings,
  saveTileEnabled,
} from "../src/lib/intelligenceBriefLocalState.ts";

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

test("intelligence brief local state falls back to normalized settings", () => {
  localStorageState.set(
    "omnyid.brief.settings",
    JSON.stringify({
      enabled: false,
      collapsed: "yes",
      show_goal_pulse: true,
      show_agent_offer: null,
      show_ambient: false,
    }),
  );

  assert.deepEqual(loadBriefSettings(), {
    enabled: false,
    collapsed: false,
    show_goal_pulse: true,
    show_agent_offer: true,
    show_ambient: false,
  });
  assert.equal(
    localStorageState.get("omnyid.brief.settings"),
    JSON.stringify({
      enabled: false,
      collapsed: false,
      show_goal_pulse: true,
      show_agent_offer: true,
      show_ambient: false,
    }),
  );
});

test("intelligence brief local state clears unparseable settings", () => {
  localStorageState.set("omnyid.brief.settings", "{bad-json");

  assert.deepEqual(loadBriefSettings(), {
    enabled: true,
    collapsed: false,
    show_goal_pulse: true,
    show_agent_offer: true,
    show_ambient: true,
  });
  assert.equal(localStorageState.has("omnyid.brief.settings"), false);
});

test("intelligence brief local state persists normalized settings and read state", () => {
  saveBriefSettings({
    enabled: false,
    collapsed: true,
    show_goal_pulse: true,
    show_agent_offer: false,
    show_ambient: true,
  });
  saveBriefRead("2026-07-19", true);

  assert.equal(
    localStorageState.get("omnyid.brief.settings"),
    JSON.stringify({
      enabled: false,
      collapsed: true,
      show_goal_pulse: true,
      show_agent_offer: false,
      show_ambient: true,
    }),
  );
  assert.equal(loadBriefRead("2026-07-19"), true);
  assert.equal(localStorageState.get("omnyid.brief.read.2026-07-19"), "1");

  localStorageState.set("omnyid.brief.read.2026-07-20", "true");
  assert.equal(loadBriefRead("2026-07-20"), false);
  assert.equal(localStorageState.has("omnyid.brief.read.2026-07-20"), false);

  saveBriefRead("2026-07-19", false);
  assert.equal(loadBriefRead("2026-07-19"), false);
  assert.equal(localStorageState.has("omnyid.brief.read.2026-07-19"), false);
});

test("intelligence brief tile-enabled state defaults on malformed values and persists toggles", () => {
  localStorageState.set("omnyid.tile.enabled.brief", "maybe");
  assert.equal(loadTileEnabled("brief"), true);
  assert.equal(localStorageState.get("omnyid.tile.enabled.brief"), "1");

  saveTileEnabled("brief", false);
  assert.equal(localStorageState.get("omnyid.tile.enabled.brief"), "0");
  assert.equal(loadTileEnabled("brief"), false);
});
