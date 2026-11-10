import test from "node:test";
import assert from "node:assert/strict";

import { accountScopedStorageKey } from "../src/lib/accountScopedStorage.ts";
import { loadCustomViews, saveCustomViews } from "../src/lib/customViewStorage.ts";

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

test("loadCustomViews trims valid rows and ignores malformed stored views", () => {
  localStorageState.clear();
  localStorageState.set(
    accountScopedStorageKey("omnyid.custom_views", "user-1"),
    JSON.stringify([
      {
        id: "  cv_valid  ",
        name: "  Research Lens  ",
        description: "  Shows research outputs  ",
        filterType: "  agent  ",
        filterSubtype: "  summary  ",
        keywords: "  battery, graph  ",
        workflowFamilyId: "  family_research  ",
        familyAssetWorkflowId: "  wf_asset  ",
        instanceWorkflowId: "  wf_instance  ",
      },
      {
        id: "cv_missing_name",
        name: "   ",
        description: "",
        filterType: "",
        filterSubtype: "",
        keywords: "",
      },
      {
        id: 7,
        name: "Bad row",
        description: "",
        filterType: "",
        filterSubtype: "",
        keywords: "",
      },
    ]),
  );

  assert.deepEqual(loadCustomViews("user-1"), [
    {
      id: "cv_valid",
      name: "Research Lens",
      description: "Shows research outputs",
      filterType: "agent",
      filterSubtype: "summary",
      keywords: "battery, graph",
      workflowFamilyId: "family_research",
      familyAssetWorkflowId: "wf_asset",
      instanceWorkflowId: "wf_instance",
    },
  ]);
  assert.deepEqual(JSON.parse(localStorageState.get(accountScopedStorageKey("omnyid.custom_views", "user-1")) ?? "null"), [
    {
      id: "cv_valid",
      name: "Research Lens",
      description: "Shows research outputs",
      filterType: "agent",
      filterSubtype: "summary",
      keywords: "battery, graph",
      workflowFamilyId: "family_research",
      familyAssetWorkflowId: "wf_asset",
      instanceWorkflowId: "wf_instance",
    },
  ]);
});

test("loadCustomViews returns an empty list for non-array payloads", () => {
  localStorageState.clear();
  localStorageState.set(accountScopedStorageKey("omnyid.custom_views", "user-1"), JSON.stringify({ id: "cv_bad" }));
  assert.deepEqual(loadCustomViews("user-1"), []);
  assert.deepEqual(JSON.parse(localStorageState.get(accountScopedStorageKey("omnyid.custom_views", "user-1")) ?? "null"), []);
});

test("loadCustomViews clears unparseable stored custom views", () => {
  localStorageState.clear();
  localStorageState.set(accountScopedStorageKey("omnyid.custom_views", "user-1"), "{bad json");
  assert.deepEqual(loadCustomViews("user-1"), []);
  assert.equal(localStorageState.has(accountScopedStorageKey("omnyid.custom_views", "user-1")), false);
});

test("saveCustomViews persists only normalized valid custom views", () => {
  localStorageState.clear();
  saveCustomViews([
    {
      id: "  cv_valid  ",
      name: "  Research Lens  ",
      description: "  Shows research outputs  ",
      filterType: "  agent  ",
      filterSubtype: "  summary  ",
      keywords: "  battery, graph  ",
      workflowFamilyId: "  family_research  ",
      familyAssetWorkflowId: "  wf_asset  ",
      instanceWorkflowId: "  wf_instance  ",
    },
    {
      id: "",
      name: "Bad",
      description: "",
      filterType: "",
      filterSubtype: "",
      keywords: "",
    },
  ], "user-1");

  assert.deepEqual(JSON.parse(localStorageState.get(accountScopedStorageKey("omnyid.custom_views", "user-1")) ?? "null"), [
    {
      id: "cv_valid",
      name: "Research Lens",
      description: "Shows research outputs",
      filterType: "agent",
      filterSubtype: "summary",
      keywords: "battery, graph",
      workflowFamilyId: "family_research",
      familyAssetWorkflowId: "wf_asset",
      instanceWorkflowId: "wf_instance",
    },
  ]);
});

test("authenticated custom views ignore an unowned legacy global key", () => {
  localStorageState.clear();
  localStorageState.set("omnyid.custom_views", JSON.stringify([{ id: "cv_1", name: "Lens", description: "", filterType: "", filterSubtype: "", keywords: "" }]));

  assert.deepEqual(loadCustomViews("user-1"), []);
  assert.equal(localStorageState.has("omnyid.custom_views"), true);
  assert.equal(localStorageState.get(accountScopedStorageKey("omnyid.custom_views", "user-1")), undefined);
});
