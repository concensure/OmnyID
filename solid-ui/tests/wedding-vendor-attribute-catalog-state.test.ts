import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingVendorAttributeWrites,
  normalizeWeddingVendorAttributeCatalog,
  normalizeWeddingVendorAttributeFields,
  parseWeddingVendorAttributeValue,
  weddingVendorAttributeRows,
  type WeddingVendorAttributeCatalogEntry,
  type WeddingVendorAttributeEdit,
} from "../src/lib/weddingVendorAttributeCatalogState.ts";

const catalogPayload = [
  { key: "capacity_seated_max", label: "Seated capacity (max)", kind: "number", enum_values: [], applies_to: ["venue"], group: "feasibility" },
  { key: "pets_allowed", label: "Pets allowed", kind: "bool", enum_values: [], applies_to: ["venue"], group: "feasibility" },
  { key: "wet_weather_option", label: "Wet-weather option", kind: "enum", enum_values: ["none", "partial", "equivalent"], applies_to: ["venue"], group: "fit" },
  { key: "style_tags", label: "Style tags", kind: "tags", enum_values: [], applies_to: [], group: "fit" },
  { key: "backup_shooter", label: "Backup shooter", kind: "bool", enum_values: [], applies_to: ["photographer", "videographer"], group: "risk" },
  { key: "official_website", label: "Official website", kind: "url", enum_values: [], applies_to: [], group: "identity" },
  { key: "curfew_time", label: "Curfew time", kind: "time", enum_values: [], applies_to: ["venue"], group: "feasibility" },
  { key: "broken", label: "Broken", kind: "mystery" },
];

const catalog = normalizeWeddingVendorAttributeCatalog(catalogPayload);
const entry = (key: string): WeddingVendorAttributeCatalogEntry => {
  const found = catalog.find((item) => item.key === key);
  assert.ok(found, `catalog entry ${key}`);
  return found;
};

test("catalog normalisation keeps valid entries and drops unknown kinds", () => {
  assert.equal(catalog.length, 7);
  assert.deepEqual(entry("wet_weather_option").enumValues, ["none", "partial", "equivalent"]);
  assert.deepEqual(entry("backup_shooter").appliesTo, ["photographer", "videographer"]);
  assert.deepEqual(normalizeWeddingVendorAttributeCatalog("nope"), []);
});

test("rows are filtered by category and ordered by group, keeping keys that already hold a value", () => {
  const venue = weddingVendorAttributeRows({ catalog, attributes: {}, category: "Venue" });
  assert.deepEqual(venue.map((group) => group.group), ["feasibility", "fit", "identity"]);
  assert.deepEqual(
    venue[0]?.rows.map((row) => row.entry.key),
    ["capacity_seated_max", "pets_allowed", "curfew_time"],
  );
  assert.ok(!venue.flatMap((group) => group.rows).some((row) => row.entry.key === "backup_shooter"));

  const photographer = weddingVendorAttributeRows({ catalog, attributes: {}, category: "Photographer" });
  assert.ok(photographer.flatMap((group) => group.rows).some((row) => row.entry.key === "backup_shooter"));
  assert.ok(!photographer.flatMap((group) => group.rows).some((row) => row.entry.key === "capacity_seated_max"));

  const withStoredValue = weddingVendorAttributeRows({
    catalog,
    attributes: { capacity_seated_max: { status: "known", value: 80, confidence: 0.9, authority: "primary_official" } },
    category: "Photographer",
  });
  assert.ok(withStoredValue.flatMap((group) => group.rows).some((row) => row.entry.key === "capacity_seated_max"));
});

test("rows start from the stored evidence and show its authority read-only", () => {
  const attributes = normalizeWeddingVendorAttributeFields({
    attributes: {
      capacity_seated_max: { status: "known", value: 140, confidence: 0.9, authority: "primary_official", source_url: "https://venue.test/" },
      style_tags: { status: "estimated", value: ["rustic", "garden"], confidence: 0.5, authority: "inferred" },
      pets_allowed: { status: "unknown", value: null, confidence: null, authority: null },
    },
  }).attributes;
  const rows = weddingVendorAttributeRows({ catalog, attributes, category: "venue" }).flatMap((group) => group.rows);
  const capacity = rows.find((row) => row.entry.key === "capacity_seated_max");
  assert.deepEqual(capacity?.initial, { status: "known", valueText: "140", sourceUrl: "https://venue.test/" });
  assert.equal(capacity?.authority, "primary_official");
  assert.equal(capacity?.confidence, 0.9);
  assert.equal(rows.find((row) => row.entry.key === "style_tags")?.initial.valueText, "rustic, garden");
  assert.deepEqual(rows.find((row) => row.entry.key === "pets_allowed")?.initial, { status: "unknown", valueText: "", sourceUrl: "" });
});

test("value parsing validates each kind", () => {
  assert.deepEqual(parseWeddingVendorAttributeValue(entry("capacity_seated_max"), " 120 "), { ok: true, value: 120 });
  assert.equal(parseWeddingVendorAttributeValue(entry("capacity_seated_max"), "-3").ok, false);
  assert.equal(parseWeddingVendorAttributeValue(entry("capacity_seated_max"), "many").ok, false);
  assert.deepEqual(parseWeddingVendorAttributeValue(entry("pets_allowed"), "false"), { ok: true, value: false });
  assert.equal(parseWeddingVendorAttributeValue(entry("pets_allowed"), "").ok, false);
  assert.deepEqual(parseWeddingVendorAttributeValue(entry("style_tags"), "rustic, , garden"), { ok: true, value: ["rustic", "garden"] });
  assert.equal(parseWeddingVendorAttributeValue(entry("wet_weather_option"), "sometimes").ok, false);
  assert.deepEqual(parseWeddingVendorAttributeValue(entry("wet_weather_option"), "partial"), { ok: true, value: "partial" });
  assert.equal(parseWeddingVendorAttributeValue(entry("official_website"), "ftp://x.test").ok, false);
  assert.deepEqual(parseWeddingVendorAttributeValue(entry("curfew_time"), "23:00"), { ok: true, value: "23:00" });
  assert.equal(parseWeddingVendorAttributeValue(entry("curfew_time"), "late").ok, false);
});

test("only changed rows are written, as typed values with operator confidence", () => {
  const rows = weddingVendorAttributeRows({
    catalog,
    attributes: { capacity_seated_max: { status: "known", value: 140, confidence: 0.9, authority: "primary_official" } },
    category: "venue",
  });
  const edits: Record<string, WeddingVendorAttributeEdit | undefined> = {
    capacity_seated_max: { status: "known", valueText: "140", sourceUrl: "" },
    pets_allowed: { status: "known", valueText: "true", sourceUrl: "https://venue.test/faq " },
    style_tags: { status: "estimated", valueText: "rustic, garden", sourceUrl: "" },
    curfew_time: { status: "unknown", valueText: "", sourceUrl: "" },
  };
  const { writes, errors } = buildWeddingVendorAttributeWrites({ rows, edits });
  assert.deepEqual(errors, []);
  assert.deepEqual(writes.map((write) => write.key).sort(), ["pets_allowed", "style_tags"]);
  const pets = writes.find((write) => write.key === "pets_allowed");
  assert.deepEqual(pets, { key: "pets_allowed", value: true, status: "known", confidence: 0.95, source_url: "https://venue.test/faq" });
  assert.equal(writes.find((write) => write.key === "style_tags")?.confidence, 0.6);
});

test("changing a known row back to unknown writes an explicit unknown", () => {
  const rows = weddingVendorAttributeRows({
    catalog,
    attributes: { capacity_seated_max: { status: "known", value: 140, confidence: 0.9, authority: "primary_official" } },
    category: "venue",
  });
  const { writes } = buildWeddingVendorAttributeWrites({
    rows,
    edits: { capacity_seated_max: { status: "unknown", valueText: "140", sourceUrl: "" } },
  });
  assert.deepEqual(writes, [{ key: "capacity_seated_max", value: null, status: "unknown", confidence: null, source_url: null }]);
});

test("invalid edits are reported by name and not written", () => {
  const rows = weddingVendorAttributeRows({ catalog, attributes: {}, category: "venue" });
  const { writes, errors } = buildWeddingVendorAttributeWrites({
    rows,
    edits: {
      capacity_seated_max: { status: "known", valueText: "lots", sourceUrl: "" },
      pets_allowed: { status: "known", valueText: "true", sourceUrl: "" },
    },
  });
  assert.deepEqual(writes.map((write) => write.key), ["pets_allowed"]);
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", /Seated capacity \(max\) needs a non-negative number/);
});
