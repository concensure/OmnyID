import test from "node:test";
import assert from "node:assert/strict";

import {
  checkAliasSettingsAvailability,
  loadAliasSettingsState,
  saveAliasSettingsState,
} from "../src/lib/aliasSettingsState.ts";

test("loadAliasSettingsState preserves missing aliases as a non-error empty state", async () => {
  const result = await loadAliasSettingsState({
    async loadAlias() {
      throw new Error("no alias found for this agent");
    },
  });

  assert.equal(result.current, null);
  assert.equal(result.error, null);
});

test("loadAliasSettingsState returns a receipt for real load failures", async () => {
  const result = await loadAliasSettingsState({
    async loadAlias() {
      throw new Error("403 forbidden");
    },
  });

  assert.equal(result.current, null);
  assert.equal(result.error?.tone, "danger");
  assert.match(result.error?.title ?? "", /load alias settings needs a fresh sign-in/i);
});

test("checkAliasSettingsAvailability returns availability and receipts consistently", async () => {
  const success = await checkAliasSettingsAvailability("memory-agent", {
    async checkAvailability(alias) {
      assert.equal(alias, "memory-agent");
      return { available: true, valid: true, reason: "" };
    },
  });
  assert.deepEqual(success, {
    result: { available: true, valid: true, reason: "" },
    error: null,
  });

  const failure = await checkAliasSettingsAvailability("memory-agent", {
    async checkAvailability() {
      throw new Error("already taken");
    },
  });
  assert.equal(failure.result, null);
  assert.equal(failure.error?.tone, "warning");
  assert.match(failure.error?.nextStep ?? "", /choose a different alias/i);
});

test("saveAliasSettingsState uses claim for new aliases and preserves current state on failure", async () => {
  const created = await saveAliasSettingsState(
    {
      alias: "memory-agent",
      current: null,
    },
    {
      async claim(alias) {
        assert.equal(alias, "memory-agent");
        return {
          alias,
          display_address: "memory-agent@omnyid.com",
          next_change_at: null,
        };
      },
      async change() {
        throw new Error("should not be called");
      },
    },
  );
  assert.equal(created.error, null);
  assert.equal(created.didCreate, true);
  assert.equal(created.current?.alias, "memory-agent");

  const existing = {
    alias: "old-agent",
    display_address: "old-agent@omnyid.com",
    next_change_at: null,
  };
  const failed = await saveAliasSettingsState(
    {
      alias: "next-agent",
      current: existing,
    },
    {
      async claim() {
        throw new Error("should not be called");
      },
      async change() {
        throw new Error("network timeout");
      },
    },
  );
  assert.equal(failed.didCreate, false);
  assert.equal(failed.current, existing);
  assert.equal(failed.error?.tone, "warning");
  assert.match(failed.error?.title ?? "", /save alias could not finish right now/i);
});
