import test from "node:test";
import assert from "node:assert/strict";
import {
  parseWeddingVendorAttributeValue,
  weddingVendorAttributeCoverage,
} from "../src/lib/weddingVendorAttributeCatalogState.ts";

test("attribute coverage counts active vendors and groups evidence authority", () => {
  const [row] = weddingVendorAttributeCoverage({
    catalog: [{ key: "latitude", label: "Latitude", kind: "coordinate", enumValues: [], appliesTo: [], group: "location" }],
    vendors: [
      { status: "active", attributes: { latitude: { status: "known", value: -33.8, confidence: 0.9, authority: "independent_aggregate" } } },
      { status: "active", attributes: { latitude: { status: "unknown", value: null, confidence: null, authority: null } } },
      { status: "hidden", attributes: { latitude: { status: "known", value: -33.9, confidence: 0.9, authority: "operator" } } },
    ],
  });
  assert.equal(row?.percentage, 50);
  assert.deepEqual(row?.authorities, { independent_aggregate: 1 });
});

test("operator quality scores are constrained to the catalog's 1-5 scale", () => {
  const entry = { key: "condition_score", label: "Condition score", kind: "number" as const, enumValues: [], appliesTo: ["venue"], group: "quality" };
  assert.deepEqual(parseWeddingVendorAttributeValue(entry, "4.5"), { ok: true, value: 4.5 });
  assert.equal(parseWeddingVendorAttributeValue(entry, "0").ok, false);
  assert.equal(parseWeddingVendorAttributeValue(entry, "6").ok, false);
});
