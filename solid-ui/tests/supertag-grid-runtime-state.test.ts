import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeSupertagGridRuntimeState,
  parseSupertagGridCrossRowDrop,
  parseSupertagGridShareHash,
} from "../src/lib/supertagGridRuntimeState.ts";

test("normalizeSupertagGridRuntimeState filters malformed state fields", () => {
  assert.deepEqual(
    normalizeSupertagGridRuntimeState({
      sortKeys: [{ field: " amount ", asc: false }, { field: "" }, "bad"],
      colOrder: [" amount ", "", 7],
      activeFilters: [" open ", null],
      pinnedCols: ["name"],
      hiddenCols: ["debug"],
      groupBy: true,
      density: "tiny",
      zebraStripe: false,
      filterCombinator: "or",
    }),
    {
      sortKeys: [{ field: "amount", asc: false }],
      colOrder: ["amount"],
      activeFilters: ["open"],
      pinnedCols: ["name"],
      hiddenCols: ["debug"],
      groupBy: true,
      zebraStripe: false,
      filterCombinator: "or",
    },
  );
});

test("parseSupertagGridShareHash decodes matching share links only", () => {
  const hash = `#sgrid_grid-1=${btoa(JSON.stringify({ density: "compact", activeFilters: ["x"] }))}`;
  assert.deepEqual(parseSupertagGridShareHash(hash, "grid-1"), {
    sortKeys: [],
    colOrder: [],
    activeFilters: ["x"],
    pinnedCols: [],
    hiddenCols: [],
    density: "compact",
  });
  assert.equal(parseSupertagGridShareHash(hash, "grid-2"), null);
  assert.equal(parseSupertagGridShareHash("#sgrid_grid-1=bad-base64", "grid-1"), null);
});

test("parseSupertagGridCrossRowDrop normalizes valid cross-grid drops", () => {
  assert.deepEqual(
    parseSupertagGridCrossRowDrop(JSON.stringify({
      sourceViewId: " source ",
      sourceTitle: " Source grid ",
      ledger_id: " row-1 ",
      cells: { name: "Acme" },
      supertags: [" customer ", "", 5],
    })),
    {
      sourceViewId: "source",
      sourceTitle: "Source grid",
      ledgerId: "row-1",
      cells: { name: "Acme" },
      supertags: ["customer"],
    },
  );
});

test("parseSupertagGridCrossRowDrop rejects malformed cross-grid drops", () => {
  assert.equal(parseSupertagGridCrossRowDrop("{bad-json"), null);
  assert.equal(parseSupertagGridCrossRowDrop(JSON.stringify({ sourceViewId: "x", sourceTitle: "y", cells: [] })), null);
  assert.equal(parseSupertagGridCrossRowDrop(JSON.stringify({ sourceViewId: "", sourceTitle: "y", cells: {} })), null);
});
