import assert from "node:assert/strict";
import test from "node:test";

import {
  QUICK_CONTROL_ACTIONS,
  quickControlActionById,
  quickControlActionByShortcut,
  quickControlLaunchNotice,
} from "../src/lib/quickControlShortcutState.ts";

function keyEvent(key: string, overrides: Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey">> = {}) {
  return {
    key,
    ctrlKey: overrides.ctrlKey ?? true,
    metaKey: overrides.metaKey ?? false,
    shiftKey: overrides.shiftKey ?? true,
    altKey: overrides.altKey ?? false,
  } as Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "key">;
}

test("quickControlActionByShortcut maps laptop shortcuts to safe destinations", () => {
  assert.equal(quickControlActionByShortcut(keyEvent("m"))?.id, "quick_model_switch");
  assert.equal(quickControlActionByShortcut(keyEvent("P"))?.id, "quick_thread_privacy");
  assert.equal(quickControlActionByShortcut(keyEvent("u"))?.id, "quick_workspace_privacy");
  assert.equal(quickControlActionByShortcut(keyEvent("u", { shiftKey: false })), null);
  assert.equal(quickControlActionByShortcut(keyEvent("u", { altKey: true })), null);
});

test("quick control actions keep privacy changes behind confirmation surfaces", () => {
  const privacyActions = QUICK_CONTROL_ACTIONS.filter((action) => action.id.includes("privacy"));
  assert.equal(privacyActions.length, 2);
  assert.ok(privacyActions.every((action) => action.requiresConfirmation));
  assert.deepEqual(privacyActions.map((action) => action.destinationView), ["threads", "sovereignty_audit"]);
});

test("quickControlActionById and launch notice support touch menu actions", () => {
  const action = quickControlActionById(" quick_model_switch ");
  assert.equal(action?.destinationView, "agent_settings");
  assert.equal(action?.settingsTab, "llm");
  assert.match(quickControlLaunchNotice(action!), /agent settings/i);
  assert.match(quickControlLaunchNotice(quickControlActionById("quick_workspace_privacy")!), /Confirm any public or unencrypted change/i);
});
