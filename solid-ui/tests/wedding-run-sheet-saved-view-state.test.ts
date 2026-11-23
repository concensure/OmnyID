import assert from "node:assert/strict";
import test from "node:test";

import { projectWeddingRunSheetRows } from "../src/lib/weddingRunSheetEditingState.ts";
import {
  buildWeddingRunSheetSavedViewContent,
  projectWeddingRunSheetSavedView,
  weddingRunSheetSavedViewPreset,
  weddingRunSheetSavedViewPresets,
} from "../src/lib/weddingRunSheetSavedViewState.ts";

const rows = projectWeddingRunSheetRows([
  {
    id: "vendor-item", databaseId: "database:runsheet", table: "run_sheet", revision: 1, timestamp: "",
    data: { title: "Venue access", start_at: "2027-11-20T01:00:00Z", visibility: ["master", "vendor"], owner_refs: ["venue"], private_notes: "alarm code", couple_phone: "0400000000" },
  },
  {
    id: "vip-item", databaseId: "database:runsheet", table: "run_sheet", revision: 1, timestamp: "",
    data: { title: "Bridal party transport", start_at: "2027-11-20T02:00:00Z", visibility: ["master", "vip"], owner_refs: ["best-person"] },
  },
]);

test("role presets project the same source record ids without copying private fields", () => {
  assert.deepEqual(projectWeddingRunSheetSavedView(rows, weddingRunSheetSavedViewPreset("vendor")).map((row) => row.sourceRecordId), ["vendor-item"]);
  assert.deepEqual(projectWeddingRunSheetSavedView(rows, weddingRunSheetSavedViewPreset("vip")).map((row) => row.sourceRecordId), ["vip-item"]);
  const vendor = projectWeddingRunSheetSavedView(rows, weddingRunSheetSavedViewPreset("vendor"))[0]!;
  assert.equal("private_notes" in vendor.values, false);
  assert.equal("couple_phone" in vendor.values, false);
});

test("all six presets are versioned saved-view definitions with deny-by-default contact resolution", () => {
  assert.deepEqual(weddingRunSheetSavedViewPresets.map((preset) => preset.id), ["master", "vendor", "photo_video", "vip", "guest", "print"]);
  const vendor = buildWeddingRunSheetSavedViewContent({ databaseId: "database:runsheet", preset: weddingRunSheetSavedViewPreset("vendor") });
  assert.equal(vendor.profile_revision, 1);
  assert.equal(vendor.field_policy.resolve_contact_fields, false);
  assert.deepEqual(vendor.filters, [{ field: "visibility", operator: "contains", value: "vendor" }]);
});

test("master and print remain projections over every record while print excludes private fields", () => {
  assert.deepEqual(projectWeddingRunSheetSavedView(rows, weddingRunSheetSavedViewPreset("master")).map((row) => row.sourceRecordId), ["vendor-item", "vip-item"]);
  const printable = projectWeddingRunSheetSavedView(rows, weddingRunSheetSavedViewPreset("print"));
  assert.deepEqual(printable.map((row) => row.sourceRecordId), ["vendor-item", "vip-item"]);
  assert.equal("private_notes" in printable[0]!.values, false);
});
