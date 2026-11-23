import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWeddingSeatingCanvasTables,
  resizeWeddingSeatingCanvasTable,
  rotateWeddingSeatingCanvasTable,
  weddingSeatingSeatPosition,
  weddingSeatingTableLayout,
} from "@/lib/weddingSeatingCanvasLayoutState";
import type { WeddingSeatingOptimizationResult } from "@/lib/weddingSeatingOptimizationState";

const result = (overrides: Partial<WeddingSeatingOptimizationResult>): WeddingSeatingOptimizationResult => ({
  assignments: [],
  totalScore: 0,
  hardViolations: [],
  softSignals: [],
  explanationLabels: [],
  proactiveIssueLabels: [],
  applyLabel: "Apply seating plan",
  alternativeLabel: "Show alternatives",
  ...overrides,
});

test("saved table geometry restores before legacy table defaults", () => {
  const tables = buildWeddingSeatingCanvasTables(
    [{ id: "round-1", label: "Round 1", capacity: 8 }],
    result({
      assignments: [{ personId: "alex", personLabel: "Alex", tableId: "head-1", tableLabel: "Family table", score: 0, reasonLabels: [] }],
      tableLayout: [{ tableId: "head-1", label: "Family table", shape: "head", capacity: 12, x: 21.25, y: 43.5, rotation: 90 }],
    }),
  );

  assert.deepEqual(tables.map((table) => table.id), ["head-1", "round-1"]);
  assert.deepEqual(tables[0], {
    id: "head-1",
    tableId: "head-1",
    label: "Family table",
    capacity: 12,
    shape: "head",
    x: 21.25,
    y: 43.5,
    rotation: 90,
  });
  assert.equal(tables[1]?.shape, "round");
  assert.equal(tables[1]?.rotation, 0);
});

test("large tables rotate in deliberate increments while round tables stay orientation-free", () => {
  const [rectangle, round] = buildWeddingSeatingCanvasTables([
    { id: "long-1", label: "Long table", capacity: 10 },
    { id: "round-1", label: "Round table", capacity: 8 },
  ], null);

  assert.equal(rotateWeddingSeatingCanvasTable(rectangle!, 1).rotation, 45);
  assert.equal(rotateWeddingSeatingCanvasTable({ ...rectangle!, rotation: 0 }, -1).rotation, 315);
  assert.equal(rotateWeddingSeatingCanvasTable(round!, 1), round);
});

test("capacity controls are bounded and cannot create unreasonable table sizes", () => {
  const [table] = buildWeddingSeatingCanvasTables([{ id: "one", label: "Table 1", capacity: 1 }], null);
  assert.equal(resizeWeddingSeatingCanvasTable(table!, -1).capacity, 1);
  assert.equal(resizeWeddingSeatingCanvasTable({ ...table!, capacity: 40 }, 1).capacity, 40);
});

test("persisted layouts round coordinates and keep the head-table shape", () => {
  const [table] = buildWeddingSeatingCanvasTables([], result({
    tableLayout: [{ tableId: "head", label: "Head table", shape: "head", capacity: 8, x: 18.126, y: 20.994, rotation: 135 }],
  }));
  assert.deepEqual(weddingSeatingTableLayout([table!]), [
    { tableId: "head", label: "Head table", shape: "head", capacity: 8, x: 18.13, y: 20.99, rotation: 135 },
  ]);
});

test("seat coordinates rotate around rectangular and head tables without rotating names", () => {
  const before = weddingSeatingSeatPosition({ shape: "rectangle", rotation: 0, seatIndex: 0, seatCount: 4 });
  const after = weddingSeatingSeatPosition({ shape: "rectangle", rotation: 90, seatIndex: 0, seatCount: 4 });
  assert.ok(Math.abs(before.x) < 0.001);
  assert.ok(before.y < 0);
  assert.ok(after.x > 0);
  assert.ok(Math.abs(after.y) < 0.001);
});
