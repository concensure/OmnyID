import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const source = await readFile(new URL("../assets/js/magnet-core.js", import.meta.url), "utf8");

function core() {
  const window = { crypto: { randomUUID: () => "result-1" } };
  vm.runInNewContext(source, { window, Blob, URL, Date, Math });
  return window.OmnyWeddingMagnets;
}

function memoryStorage(blocked = false) {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (blocked) throw new Error("blocked");
      values.set(key, value);
    },
    removeItem: (key) => values.delete(key),
  };
}

test("magnet envelope round-trips without a network or account", () => {
  const api = core();
  const envelope = api.createEnvelope({
    schema: "budget_reality_check",
    engine_version: "1.0.0",
    data_version: "budget-model.v1",
    inputs: { state: "NSW" },
    result: { target: 40_000 },
    origin: { page: "/wedding/wedding-cost-calculator.html" },
  }, "2026-11-02T00:00:00.000Z");
  const storage = memoryStorage();

  assert.equal(api.save(storage, "budget", envelope).ok, true);
  assert.equal(api.load(storage, "budget", "budget_reality_check").value.result_id, "result-1");
  assert.equal(api.remove(storage, "budget").ok, true);
  assert.equal(api.load(storage, "budget", "budget_reality_check").value, null);
});

test("blocked storage leaves the result usable and returns visible copy", () => {
  const api = core();
  const envelope = api.createEnvelope({
    schema: "wedding_countdown",
    inputs: {},
    result: {},
    origin: { page: "/wedding/wedding-planning-checklist-australia.html" },
  });
  const saved = api.save(memoryStorage(true), "countdown", envelope);
  assert.equal(saved.ok, false);
  assert.match(saved.message, /result is ready/i);
});

test("continue URL accepts only registered lead magnet sources", () => {
  const api = core();
  assert.equal(api.continueUrl("budget"), "/workspace/?auth=register&source=wedding&from=budget");
  assert.equal(api.continueUrl("attacker"), "/workspace/?auth=register&source=wedding");
});
