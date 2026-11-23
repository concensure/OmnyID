import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const fieldSource = await readFile(new URL("../assets/js/magnet-profile-fields.js", import.meta.url), "utf8");
const profileSource = await readFile(new URL("../assets/js/magnet-profile.js", import.meta.url), "utf8");
const canonicalRegistry = JSON.parse(await readFile(new URL("../../solid-ui/src/lib/weddingMagnetProfileFields.v1.json", import.meta.url), "utf8"));

function api() {
  const window = {};
  vm.runInNewContext(fieldSource, { window });
  vm.runInNewContext(profileSource, { window, Date, JSON, Object, Array, Set, String, Number });
  return window.OmnyWeddingMagnetProfile;
}

function memoryStorage(blocked = false) {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw new Error("blocked"); values.set(key, value); },
    removeItem: (key) => values.delete(key),
  };
}

test("registry contains every v1 field and descriptive import metadata", () => {
  const fields = api().fields();
  assert.equal(fields.length, 36);
  for (const field of fields) {
    assert.ok(field.key);
    assert.ok(field.writers.length > 0);
    assert.ok(field.workspace_target);
    assert.ok(field.conflict_rule);
    assert.ok(field.why);
  }
});

test("generated static registry stays byte-for-data aligned with the workspace registry", () => {
  const window = {};
  vm.runInNewContext(fieldSource, { window });
  assert.deepEqual(JSON.parse(JSON.stringify(window.OmnyWeddingMagnetProfileFields)), canonicalRegistry);
});

test("a tool cannot write a field it did not declare", () => {
  const profile = api().emptyProfile("2026-11-03T00:00:00.000Z");
  const result = api().writeFact(profile, "PAL", "budget_total_aud", 50000, { result_id: "palette-1" });
  assert.equal(result.ok, false);
  assert.match(result.message, /not allowed/i);
});

test("facts retain three prior values and surface a conflict", () => {
  let profile = api().emptyProfile("2026-11-03T00:00:00.000Z");
  for (let index = 1; index <= 5; index += 1) {
    const result = api().writeFact(profile, "BUD", "guest_count", 80 + index, {
      result_id: `budget-${index}`,
      recorded_at: `2026-11-0${index}T00:00:00.000Z`,
    });
    assert.equal(result.ok, true);
    profile = result.profile;
  }
  assert.equal(profile.facts.guest_count.value, 85);
  assert.equal(profile.facts.guest_count.history.length, 3);
  assert.equal(profile.facts.guest_count.history[0].value, 84);
});

test("a quote candidate date cannot replace a stated countdown date", () => {
  const base = api().writeFact(api().emptyProfile(), "CDN", "wedding_date", "2027-11-20", { result_id: "countdown-1" }).profile;
  const result = api().writeFact(base, "QDEC", "wedding_date", "2027-11-27", { result_id: "quote-1", authority: "candidate" });
  assert.equal(result.ok, true);
  assert.equal(result.conflict, true);
  assert.equal(result.profile.facts.wedding_date.value, "2027-11-20");
});

test("blocked local storage keeps the generated result usable", () => {
  const result = api().writeAndSave(memoryStorage(true), "BUD", "guest_count", 90, { result_id: "budget-1" });
  assert.equal(result.ok, false);
  assert.equal(result.profile.facts.guest_count.value, 90);
  assert.match(result.message, /browser blocked/i);
});

test("manual profile edits keep source history and can be exported", () => {
  const storage = memoryStorage();
  assert.equal(api().writeAndSave(storage, "BUD", "guest_count", 90, { result_id: "budget-1" }).ok, true);
  const changed = api().editFact(storage, "guest_count", 82);
  assert.equal(changed.ok, true);
  assert.equal(changed.value.facts.guest_count.source_label, "Manual change");
  assert.equal(changed.value.facts.guest_count.history[0].value, 90);
  assert.equal(JSON.parse(api().exportJson(changed.value)).facts.guest_count.value, 82);
});
