import assert from "node:assert/strict";
import test from "node:test";

import { databaseProfileColumns, databaseProfilePlugin } from "../src/lib/databaseProfilePluginState.ts";

test("ordinary databases do not receive profile controls or column changes", () => {
  const discovered = [{ key: "isbn", label: "ISBN" }];
  assert.equal(databaseProfilePlugin(null), null);
  assert.equal(databaseProfilePlugin("unknown.v1"), null);
  assert.deepEqual(databaseProfileColumns({ profileId: null, discovered }), discovered);
});

test("wedding run sheet profile orders required fields and preserves custom fields", () => {
  const plugin = databaseProfilePlugin("wedding_runsheet.v1");
  assert.equal(plugin?.toolbarKind, "wedding_run_sheet");
  const columns = databaseProfileColumns({
    profileId: "wedding_runsheet.v1",
    discovered: [
      { key: "source_refs", label: "Source refs" },
      { key: "private_note", label: "Private note" },
      { key: "anchor_offset_minutes", label: "Anchor offset" },
      { key: "title", label: "Custom title" },
    ],
  });
  assert.equal(columns[0].key, "title");
  assert.equal(columns[0].label, "Custom title");
  assert.ok(columns.some((column) => column.key === "private_note"));
  assert.equal(columns.some((column) => column.key === "source_refs"), false);
  assert.ok(columns.findIndex((column) => column.key === "anchor_offset_minutes") < columns.findIndex((column) => column.key === "private_note"));
});
