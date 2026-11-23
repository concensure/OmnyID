import type {
  WeddingSeatingOptimizationResult,
  WeddingSeatingTableLayout,
  WeddingSeatingTableNode,
} from "@/lib/weddingSeatingOptimizationState";

export type WeddingSeatingCanvasTable = WeddingSeatingTableNode & WeddingSeatingTableLayout;

function inferredShape(table: WeddingSeatingTableNode): WeddingSeatingTableLayout["shape"] {
  if (/head|bridal|couple/i.test(table.label)) return "head";
  if (/long|rectangle|trestle/i.test(table.label)) return "rectangle";
  return "round";
}

export function buildWeddingSeatingCanvasTables(
  sourceTables: readonly WeddingSeatingTableNode[],
  result: WeddingSeatingOptimizationResult | null,
): WeddingSeatingCanvasTable[] {
  const sourceById = new Map(sourceTables.map((table) => [table.id, table]));
  for (const assignment of result?.assignments ?? []) {
    if (!sourceById.has(assignment.tableId)) {
      sourceById.set(assignment.tableId, {
        id: assignment.tableId,
        label: assignment.tableLabel,
        capacity: 8,
      });
    }
  }
  const savedById = new Map((result?.tableLayout ?? []).map((table) => [table.tableId, table]));
  const orderedIds = [
    ...(result?.tableLayout ?? []).map((table) => table.tableId),
    ...sourceById.keys(),
  ].filter((id, index, all) => all.indexOf(id) === index);

  return orderedIds.map((id, index) => {
    const source = sourceById.get(id);
    const saved = savedById.get(id);
    const label = saved?.label || source?.label || `Table ${index + 1}`;
    const shape = saved?.shape ?? inferredShape({ id, label, capacity: source?.capacity ?? 8 });
    return {
      ...source,
      id,
      tableId: id,
      label,
      capacity: saved?.capacity ?? source?.capacity ?? (shape === "head" ? 8 : 10),
      shape,
      x: saved?.x ?? 8 + (index % 3) * 31,
      y: saved?.y ?? 9 + Math.floor(index / 3) * 31,
      rotation: shape === "round" ? 0 : saved?.rotation ?? 0,
    };
  });
}

export function rotateWeddingSeatingCanvasTable(
  table: WeddingSeatingCanvasTable,
  direction: -1 | 1 = 1,
): WeddingSeatingCanvasTable {
  if (table.shape === "round") return table;
  return { ...table, rotation: ((table.rotation + direction * 45) % 360 + 360) % 360 };
}

export function resizeWeddingSeatingCanvasTable(
  table: WeddingSeatingCanvasTable,
  change: -1 | 1,
): WeddingSeatingCanvasTable {
  return { ...table, capacity: Math.max(1, Math.min(40, table.capacity + change)) };
}

export function weddingSeatingTableLayout(
  tables: readonly WeddingSeatingCanvasTable[],
): WeddingSeatingTableLayout[] {
  return tables.map((table) => ({
    tableId: table.id,
    label: table.label,
    shape: table.shape,
    capacity: table.capacity,
    x: Math.round(table.x * 100) / 100,
    y: Math.round(table.y * 100) / 100,
    rotation: table.shape === "round" ? 0 : table.rotation,
  }));
}

export function weddingSeatingSeatPosition(input: {
  shape: WeddingSeatingTableLayout["shape"];
  rotation: number;
  seatIndex: number;
  seatCount: number;
}): { x: number; y: number } {
  const count = Math.max(1, input.seatCount);
  const angle = (Math.PI * 2 * input.seatIndex / count) - Math.PI / 2;
  const radiusX = input.shape === "head" ? 142 : input.shape === "rectangle" ? 112 : 94;
  const radiusY = input.shape === "head" ? 54 : input.shape === "rectangle" ? 76 : 92;
  const unrotatedX = Math.cos(angle) * radiusX;
  const unrotatedY = Math.sin(angle) * radiusY;
  const rotation = input.shape === "round" ? 0 : input.rotation * Math.PI / 180;
  return {
    x: unrotatedX * Math.cos(rotation) - unrotatedY * Math.sin(rotation),
    y: unrotatedX * Math.sin(rotation) + unrotatedY * Math.cos(rotation),
  };
}
