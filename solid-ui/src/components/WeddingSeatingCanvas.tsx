import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { WeddingInlineHelpNote } from "@/components/WeddingInlineHelpNote";

import type {
  WeddingSeatingOptimizationAssignment,
  WeddingSeatingOptimizationResult,
  WeddingSeatingPersonNode,
  WeddingSeatingTableNode,
} from "@/lib/weddingSeatingOptimizationState";

type CanvasTable = WeddingSeatingTableNode & { shape: "round" | "long"; x: number; y: number };

function positionedTables(tables: readonly WeddingSeatingTableNode[], result: WeddingSeatingOptimizationResult | null): CanvasTable[] {
  const merged = new Map<string, WeddingSeatingTableNode>();
  for (const table of tables) merged.set(table.id, table);
  for (const assignment of result?.assignments ?? []) {
    if (!merged.has(assignment.tableId)) merged.set(assignment.tableId, { id: assignment.tableId, label: assignment.tableLabel, capacity: 8 });
  }
  return [...merged.values()].map((table, index) => ({
    ...table, shape: /long/i.test(table.label) ? "long" : "round",
    x: 8 + (index % 3) * 31, y: 9 + Math.floor(index / 3) * 31,
  }));
}

export function WeddingSeatingCanvas(props: {
  workspaceId: string;
  people: readonly WeddingSeatingPersonNode[];
  tables: readonly WeddingSeatingTableNode[];
  result: WeddingSeatingOptimizationResult | null;
  saving?: boolean;
  onApply: (result: WeddingSeatingOptimizationResult) => void;
}) {
  const [tables, setTables] = createSignal<CanvasTable[]>([]);
  const [assignments, setAssignments] = createSignal<WeddingSeatingOptimizationAssignment[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = createSignal<string[]>([]);
  const [hoveredPersonId, setHoveredPersonId] = createSignal<string | null>(null);
  const [draggedPersonIds, setDraggedPersonIds] = createSignal<string[]>([]);
  const [zoom, setZoom] = createSignal(1);
  const [pan, setPan] = createSignal({ x: 0, y: 0 });
  const [panMode, setPanMode] = createSignal(false);
  const [fullscreen, setFullscreen] = createSignal(false);
  let viewport: HTMLDivElement | undefined;
  let initializedFor = "";
  let panStart: { clientX: number; clientY: number; x: number; y: number } | null = null;

  createEffect(() => {
    const fingerprint = props.result?.fingerprint ?? `${props.people.map((person) => person.id).join("|")}:${props.tables.map((table) => table.id).join("|")}`;
    if (initializedFor === fingerprint) return;
    initializedFor = fingerprint;
    setTables(positionedTables(props.tables, props.result));
    setAssignments(props.result?.assignments ?? []);
  });

  const assignedIds = createMemo(() => new Set(assignments().map((assignment) => assignment.personId)));
  const unassigned = createMemo(() => props.people.filter((person) => !assignedIds().has(person.id)));
  const hovered = createMemo(() => props.people.find((person) => person.id === hoveredPersonId()) ?? null);
  const peopleAt = (tableId: string) => assignments().filter((assignment) => assignment.tableId === tableId);

  const fitCanvas = () => {
    if (!viewport) return;
    const next = Math.min((viewport.clientWidth - 20) / 900, (viewport.clientHeight - 20) / 560, 1.35);
    setZoom(Math.max(0.32, next));
    setPan({ x: 0, y: 0 });
  };
  onMount(() => {
    fitCanvas();
    const observer = new ResizeObserver(fitCanvas);
    if (viewport) observer.observe(viewport);
    onCleanup(() => observer.disconnect());
  });
  createEffect(() => { if (fullscreen()) requestAnimationFrame(fitCanvas); });

  function addTable(shape: "round" | "long"): void {
    const index = tables().length + 1;
    setTables((current) => [...current, {
      id: `canvas-table-${Date.now()}`, label: `${shape === "round" ? "Round" : "Long"} table ${index}`,
      capacity: shape === "round" ? 8 : 10, shape, x: 40, y: 40,
    }]);
  }

  function assignMany(personIds: readonly string[], tableId: string): void {
    const table = tables().find((item) => item.id === tableId);
    if (!table) return;
    const uniqueIds = [...new Set(personIds)].filter((id) => props.people.some((person) => person.id === id));
    const alreadyAtTarget = peopleAt(tableId).filter((item) => !uniqueIds.includes(item.personId)).length;
    const accepted = uniqueIds.slice(0, Math.max(0, table.capacity - alreadyAtTarget));
    setAssignments((current) => [
      ...current.filter((item) => !accepted.includes(item.personId)),
      ...accepted.flatMap((personId) => {
        const person = props.people.find((item) => item.id === personId);
        return person ? [{ personId, personLabel: person.label, tableId, tableLabel: table.label, score: 0, reasonLabels: ["Placed by the couple on the seating canvas."] }] : [];
      }),
    ]);
    setSelectedPersonIds([]);
  }

  function renameTable(tableId: string, label: string): void {
    const cleanLabel = label.trim().slice(0, 80) || "Untitled table";
    setTables((current) => current.map((table) => table.id === tableId ? { ...table, label: cleanLabel } : table));
    setAssignments((current) => current.map((assignment) => assignment.tableId === tableId ? { ...assignment, tableLabel: cleanLabel } : assignment));
  }

  function moveTable(event: PointerEvent, tableId: string): void {
    if (!viewport || panMode()) return;
    event.preventDefault(); event.stopPropagation();
    const table = tables().find((item) => item.id === tableId);
    if (!table) return;
    const startX = event.clientX, startY = event.clientY, start = { x: table.x, y: table.y };
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture(event.pointerId);
    const onMove = (move: PointerEvent) => {
      const dx = (move.clientX - startX) / Math.max(zoom(), 0.1) / 900 * 100;
      const dy = (move.clientY - startY) / Math.max(zoom(), 0.1) / 560 * 100;
      setTables((current) => current.map((item) => item.id === tableId ? { ...item, x: Math.max(0, Math.min(80, start.x + dx)), y: Math.max(0, Math.min(72, start.y + dy)) } : item));
    };
    const onUp = () => {
      target.removeEventListener("pointermove", onMove); target.removeEventListener("pointerup", onUp); target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove); target.addEventListener("pointerup", onUp); target.addEventListener("pointercancel", onUp);
  }

  function guestButton(person: WeddingSeatingPersonNode, compact = false) {
    const selected = () => selectedPersonIds().includes(person.id);
    return <button type="button" draggable
      onDragStart={(event) => { const ids = selected() ? selectedPersonIds() : [person.id]; setDraggedPersonIds(ids); event.dataTransfer?.setData("text/plain", ids.join(",")); }}
      onDragEnd={() => setDraggedPersonIds([])} onMouseEnter={() => setHoveredPersonId(person.id)} onMouseLeave={() => setHoveredPersonId(null)} onFocus={() => setHoveredPersonId(person.id)} onBlur={() => setHoveredPersonId(null)} aria-pressed={selected()}
      onClick={(event) => { event.stopPropagation(); setSelectedPersonIds((current) => current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id]); }}
      class={`${compact ? "px-2 py-1 text-[11px]" : "min-h-10 px-3 py-2 text-xs"} max-w-full cursor-grab break-words rounded-lg border font-semibold ${selected() ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border bg-white text-wedding-ink"}`}>{person.label}</button>;
  }

  function save(): void {
    const base = props.result;
    props.onApply({ assignments: assignments(), totalScore: base?.totalScore ?? 0, hardViolations: base?.hardViolations ?? [], softSignals: base?.softSignals ?? [], explanationLabels: ["Updated by the couple on the visual seating canvas."], proactiveIssueLabels: base?.proactiveIssueLabels ?? [], applyLabel: "Apply seating plan", alternativeLabel: base?.alternativeLabel ?? "Show another option", fingerprint: null, semanticTags: base?.semanticTags, semanticKind: base?.semanticKind, semanticObject: base?.semanticObject });
  }

  return <section class={`${fullscreen() ? "fixed inset-0 z-[6000] overflow-auto bg-white p-4" : "mt-3 rounded-xl border border-wedding-border bg-wedding-card p-3"}`} aria-labelledby="seating-canvas-title">
    <div class="flex flex-wrap items-start justify-between gap-2"><div><h3 id="seating-canvas-title" class="text-sm font-semibold text-wedding-ink">Visual seating plan</h3><p class="mt-1 text-xs leading-5 text-wedding-ink/65">Select one or more guests, then tap or drag them onto a table. Drag table cards to arrange the room.</p></div><div class="flex flex-wrap gap-2"><button type="button" class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold" onClick={() => addTable("round")}>+ Round table</button><button type="button" class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold" onClick={() => addTable("long")}>+ Long table</button><button type="button" class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold" onClick={() => setFullscreen((value) => !value)}>{fullscreen() ? "Exit full screen" : "Full screen"}</button></div></div>
    <WeddingInlineHelpNote class="mt-3">Use Fit to show every table. Pan and zoom with the controls; turn Pan on before dragging the room itself.</WeddingInlineHelpNote>
    <div class="mt-3 grid gap-3 lg:grid-cols-[minmax(12rem,17rem)_minmax(0,1fr)]">
      <aside class="max-h-[32rem] overflow-auto rounded-xl border border-wedding-border bg-wedding-page p-3"><div class="flex items-center justify-between gap-2"><p class="text-xs font-semibold">Guest list</p><span class="text-[11px] text-wedding-ink/60">{selectedPersonIds().length} selected</span></div><div class="mt-2 flex flex-wrap gap-2"><For each={unassigned()}>{(person) => guestButton(person)}</For></div><Show when={unassigned().length === 0}><p class="mt-2 text-xs text-wedding-ink/65">Every guest is assigned. Select a seated name to move them.</p></Show></aside>
      <div class="min-w-0"><div class="mb-2 flex flex-wrap gap-2"><button type="button" class="min-h-10 rounded-lg border bg-white px-3 text-xs font-semibold" onClick={fitCanvas}>Fit</button><button type="button" class="min-h-10 rounded-lg border bg-white px-3 text-xs font-semibold" onClick={() => setZoom((value) => Math.min(1.8, value + 0.15))}>Zoom in</button><button type="button" class="min-h-10 rounded-lg border bg-white px-3 text-xs font-semibold" onClick={() => setZoom((value) => Math.max(0.32, value - 0.15))}>Zoom out</button><button type="button" aria-pressed={panMode()} class={`min-h-10 rounded-lg border px-3 text-xs font-semibold ${panMode() ? "bg-wedding-primary text-white" : "bg-white"}`} onClick={() => setPanMode((value) => !value)}>Pan {panMode() ? "on" : "off"}</button></div>
        <div ref={viewport} class={`${fullscreen() ? "h-[calc(100dvh-14rem)]" : "h-[28rem]"} relative overflow-hidden rounded-xl border border-wedding-border bg-[radial-gradient(circle_at_center,_rgba(20,83,45,0.08)_1px,_transparent_1px)] bg-[length:18px_18px] touch-none`} aria-label="Reception floor canvas" onWheel={(event) => { event.preventDefault(); setZoom((value) => Math.max(0.32, Math.min(1.8, value + (event.deltaY < 0 ? 0.08 : -0.08)))); }} onPointerDown={(event) => { if (!panMode() || event.target !== event.currentTarget) return; panStart = { clientX: event.clientX, clientY: event.clientY, ...pan() }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!panStart) return; setPan({ x: panStart.x + event.clientX - panStart.clientX, y: panStart.y + event.clientY - panStart.clientY }); }} onPointerUp={() => { panStart = null; }} onPointerCancel={() => { panStart = null; }}>
          <div class="absolute left-1/2 top-1/2 h-[560px] w-[900px] origin-center" style={{ transform: `translate(calc(-50% + ${pan().x}px), calc(-50% + ${pan().y}px)) scale(${zoom()})` }}>
            <For each={tables()}>{(table) => <div role="group" aria-label={`${table.label}, ${peopleAt(table.id).length} of ${table.capacity} seats filled`} onPointerDown={(event) => moveTable(event, table.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); event.stopPropagation(); const ids = draggedPersonIds().length ? draggedPersonIds() : event.dataTransfer?.getData("text/plain").split(",").filter(Boolean) ?? []; assignMany(ids, table.id); }} onClick={() => { if (selectedPersonIds().length) assignMany(selectedPersonIds(), table.id); }} class={`absolute flex min-h-36 w-44 touch-none flex-col items-center justify-center border-2 border-wedding-primary/45 bg-white/95 p-3 shadow-sm ${table.shape === "long" ? "rounded-xl" : "rounded-[999px]"}`} style={{ left: `${table.x}%`, top: `${table.y}%` }}>
              <input aria-label={`Table name for ${table.label}`} value={table.label} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onChange={(event) => renameTable(table.id, event.currentTarget.value)} class="w-full rounded border-0 bg-transparent px-1 text-center text-xs font-bold text-wedding-ink focus:bg-white focus:ring-2 focus:ring-wedding-primary"/><p class="text-[11px] text-wedding-ink/60">{peopleAt(table.id).length}/{table.capacity}</p><div class="mt-2 flex max-w-full flex-wrap justify-center gap-1"><For each={peopleAt(table.id)}>{(assignment) => { const person = props.people.find((item) => item.id === assignment.personId); return person ? guestButton(person, true) : null; }}</For></div>
            </div>}</For>
          </div>
        </div>
      </div>
    </div>
    <Show when={hovered()}>{(person) => <div class="mt-2 rounded-lg border border-wedding-border bg-wedding-page p-3 text-xs text-wedding-ink" role="status"><p class="font-semibold">{person().label}</p><p class="mt-1 text-wedding-ink/70">{[person().relationshipLabel, person().weddingPartyRole, ...(person().dietaryRequirements ?? []), ...(person().accessibilityNeeds ?? []), ...(person().socialGroups ?? [])].filter(Boolean).join(" · ") || "No additional guest notes recorded."}</p></div>}</Show>
    <button type="button" disabled={props.saving || assignments().length === 0} class="mt-3 min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={save}>{props.saving ? "Saving…" : "Save visual seating plan"}</button>
  </section>;
}
