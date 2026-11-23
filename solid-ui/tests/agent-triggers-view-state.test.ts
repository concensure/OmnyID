import test from "node:test";
import assert from "node:assert/strict";

import {
  agentTriggerDraftFromTemplate,
  agentTriggerDraftWithObjectiveSuggestion,
  agentTriggerCreateValidationError,
  cloneAgentTriggerDraft,
  createAgentTriggerViewState,
  DEFAULT_AGENT_TRIGGER_DRAFT,
  createAgentTriggerAndReload,
  deleteAgentTriggerAndReload,
  loadAgentTriggersViewState,
  toggleExpandedAgentTriggerIds,
  toggleAgentTriggerAndReload,
} from "../src/lib/agentTriggersViewState.ts";
import type { AgentTriggerStarterTemplate } from "../src/lib/agentTriggerTemplates.ts";

test("agentTriggerCreateValidationError requires a non-empty objective", () => {
  assert.equal(agentTriggerCreateValidationError(""), "Objective is required.");
  assert.equal(agentTriggerCreateValidationError("  "), "Objective is required.");
  assert.equal(agentTriggerCreateValidationError("Run daily review"), null);
});

test("loadAgentTriggersViewState preserves trigger results and one-sided failures", async () => {
  const success = await loadAgentTriggersViewState(async () => [
    { id: "tr-1", trigger_type: "scheduled", config_json: {}, enabled: true },
  ]);
  assert.equal(success.error, null);
  assert.equal(success.triggers[0]?.id, "tr-1");

  const failure = await loadAgentTriggersViewState(async () => {
    throw new Error("temporarily unavailable");
  });
  assert.equal(failure.triggers.length, 0);
  assert.equal(failure.error?.title, "Trigger load could not finish right now");
});

test("createAgentTriggerAndReload reloads the stable trigger list", async () => {
  const calls: string[] = [];
  const result = await createAgentTriggerAndReload(
    { trigger_type: "scheduled", config: { cron: "0 8 * * *" } },
    {
      async createTrigger(body) {
        calls.push(`create:${body.trigger_type}`);
      },
      async loadTriggers() {
        calls.push("load");
        return [{ id: "tr-2", trigger_type: "scheduled", config_json: {}, enabled: false }];
      },
    },
  );

  assert.deepEqual(calls, ["create:scheduled", "load"]);
  assert.equal(result.error, null);
  assert.equal(result.triggers[0]?.id, "tr-2");
});

test("agent trigger draft helpers preserve defaults, suggestions, templates, and expansion ids", () => {
  const draft = cloneAgentTriggerDraft();
  assert.deepEqual(draft, DEFAULT_AGENT_TRIGGER_DRAFT);

  const suggested = agentTriggerDraftWithObjectiveSuggestion(draft, "Every weekday at 9am send a summary");
  assert.equal(suggested.objective, "Every weekday at 9am send a summary");
  assert.equal(suggested.kind, "scheduled");
  assert.match(suggested.cron, /\S/);

  const template: AgentTriggerStarterTemplate = {
    id: "template-1",
    label: "Webhook",
    kind: "webhook",
    objective: "Process inbound webhook",
  };
  const templated = agentTriggerDraftFromTemplate(template, suggested);
  assert.equal(templated.kind, "webhook");
  assert.equal(templated.objective, "Process inbound webhook");
  assert.equal(templated.cron, suggested.cron);

  const expandedOnce = toggleExpandedAgentTriggerIds(new Set<string>(), "tr-1");
  const expandedTwice = toggleExpandedAgentTriggerIds(expandedOnce, "tr-1");
  assert.deepEqual([...expandedOnce], ["tr-1"]);
  assert.deepEqual([...expandedTwice], []);
});

test("createAgentTriggerViewState validates locally and resets the draft after success", async () => {
  const invalid = await createAgentTriggerViewState(
    {
      ...DEFAULT_AGENT_TRIGGER_DRAFT,
      objective: "   ",
    },
    {
      async createTrigger() {
        throw new Error("should not be called");
      },
      async loadTriggers() {
        return [];
      },
    },
  );
  assert.equal(invalid.formError, "Objective is required.");
  assert.equal(invalid.error, null);
  assert.equal(invalid.shouldCloseForm, false);

  const calls: string[] = [];
  const success = await createAgentTriggerViewState(
    {
      ...DEFAULT_AGENT_TRIGGER_DRAFT,
      objective: "Send morning summary",
      cron: "0 8 * * 1-5",
    },
    {
      async createTrigger(body) {
        calls.push(`create:${body.trigger_type}:${String(body.config.objective)}`);
      },
      async loadTriggers() {
        calls.push("load");
        return [{ id: "tr-3", trigger_type: "scheduled", config_json: {}, enabled: true }];
      },
    },
  );

  assert.deepEqual(calls, ["create:scheduled:Send morning summary", "load"]);
  assert.equal(success.formError, null);
  assert.equal(success.error, null);
  assert.equal(success.shouldCloseForm, true);
  assert.deepEqual(success.nextDraft, DEFAULT_AGENT_TRIGGER_DRAFT);
  assert.equal(success.triggers[0]?.id, "tr-3");
});

test("deleteAgentTriggerAndReload returns receipts for failed deletes", async () => {
  const result = await deleteAgentTriggerAndReload("tr-9", {
    async deleteTrigger() {
      throw new Error("403 forbidden");
    },
    async loadTriggers() {
      return [];
    },
  });

  assert.equal(result.triggers.length, 0);
  assert.equal(result.error?.title, "Trigger delete needs a fresh sign-in");
});

test("toggleAgentTriggerAndReload flips enabled state through the update dependency", async () => {
  const calls: string[] = [];
  const result = await toggleAgentTriggerAndReload(
    { id: "tr-7", trigger_type: "interval", config_json: {}, enabled: true },
    {
      async updateTrigger(id, patch) {
        calls.push(`${id}:${String(patch.enabled)}`);
      },
      async loadTriggers() {
        return [{ id: "tr-7", trigger_type: "interval", config_json: {}, enabled: false }];
      },
    },
  );

  assert.deepEqual(calls, ["tr-7:false"]);
  assert.equal(result.error, null);
  assert.equal(result.triggers[0]?.enabled, false);
});
