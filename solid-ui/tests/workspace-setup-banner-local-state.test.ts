import test from "node:test";
import assert from "node:assert/strict";

import {
  loadWorkspaceSetupBannerDismissed,
  loadWorkspaceSetupGmailDone,
  loadWorkspaceSetupLlmOk,
  loadWorkspaceSetupSkillActivationTimes,
  saveWorkspaceSetupBannerDismissed,
  saveWorkspaceSetupGmailDone,
  saveWorkspaceSetupLlmOk,
  WORKSPACE_SETUP_BANNER_DISMISSED_KEY,
  WORKSPACE_SETUP_GMAIL_DONE_KEY,
  WORKSPACE_SETUP_LLM_OK_KEY,
  WORKSPACE_SETUP_SKILLS_TIMES_KEY,
} from "../src/lib/workspaceSetupBannerLocalState.ts";

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

test("workspace setup banner local state reads only explicit completion flags", () => {
  localStorageState.set(WORKSPACE_SETUP_BANNER_DISMISSED_KEY, "1");
  localStorageState.set(WORKSPACE_SETUP_GMAIL_DONE_KEY, "0");
  localStorageState.set(WORKSPACE_SETUP_LLM_OK_KEY, "1");

  assert.equal(loadWorkspaceSetupBannerDismissed(), true);
  assert.equal(loadWorkspaceSetupGmailDone(), false);
  assert.equal(loadWorkspaceSetupLlmOk(), true);
  assert.equal(localStorageState.has(WORKSPACE_SETUP_GMAIL_DONE_KEY), false);
});

test("workspace setup banner local state clears malformed optional flags", () => {
  localStorageState.set(WORKSPACE_SETUP_BANNER_DISMISSED_KEY, "true");
  localStorageState.set(WORKSPACE_SETUP_GMAIL_DONE_KEY, "false");
  localStorageState.set(WORKSPACE_SETUP_LLM_OK_KEY, "maybe");

  assert.equal(loadWorkspaceSetupBannerDismissed(), false);
  assert.equal(loadWorkspaceSetupGmailDone(), false);
  assert.equal(loadWorkspaceSetupLlmOk(), false);
  assert.equal(localStorageState.has(WORKSPACE_SETUP_BANNER_DISMISSED_KEY), false);
  assert.equal(localStorageState.has(WORKSPACE_SETUP_GMAIL_DONE_KEY), false);
  assert.equal(localStorageState.has(WORKSPACE_SETUP_LLM_OK_KEY), false);
});

test("workspace setup skill activation times keep only finite positive timestamps", () => {
  localStorageState.set(
    WORKSPACE_SETUP_SKILLS_TIMES_KEY,
    JSON.stringify({
      writing: 1721299200000,
      blank: 0,
      broken: "1721299200000",
      "": 1721299200000,
      " research ": 1721385600000,
      research: 1721385600000,
    }),
  );

  assert.deepEqual(loadWorkspaceSetupSkillActivationTimes(), {
    writing: 1721299200000,
    research: 1721385600000,
  });
  assert.equal(
    localStorageState.get(WORKSPACE_SETUP_SKILLS_TIMES_KEY),
    JSON.stringify({
      writing: 1721299200000,
      research: 1721385600000,
    }),
  );
});

test("workspace setup skill activation loader clears unparseable persisted json", () => {
  localStorageState.set(WORKSPACE_SETUP_SKILLS_TIMES_KEY, "{bad-json");

  assert.deepEqual(loadWorkspaceSetupSkillActivationTimes(), {});
  assert.equal(localStorageState.has(WORKSPACE_SETUP_SKILLS_TIMES_KEY), false);
});

test("workspace setup banner local state writers persist or clear explicit flags", () => {
  saveWorkspaceSetupBannerDismissed(true);
  saveWorkspaceSetupGmailDone(true);
  saveWorkspaceSetupLlmOk(true);

  assert.equal(localStorageState.get(WORKSPACE_SETUP_BANNER_DISMISSED_KEY), "1");
  assert.equal(localStorageState.get(WORKSPACE_SETUP_GMAIL_DONE_KEY), "1");
  assert.equal(localStorageState.get(WORKSPACE_SETUP_LLM_OK_KEY), "1");

  saveWorkspaceSetupBannerDismissed(false);
  saveWorkspaceSetupGmailDone(false);
  saveWorkspaceSetupLlmOk(false);

  assert.equal(localStorageState.has(WORKSPACE_SETUP_BANNER_DISMISSED_KEY), false);
  assert.equal(localStorageState.has(WORKSPACE_SETUP_GMAIL_DONE_KEY), false);
  assert.equal(localStorageState.has(WORKSPACE_SETUP_LLM_OK_KEY), false);
});
