import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { WeddingInlineHelpNote } from "@/components/WeddingInlineHelpNote";
import {
  buildWeddingSeatingCanvasTables,
  resizeWeddingSeatingCanvasTable,
  rotateWeddingSeatingCanvasTable,
  weddingSeatingSeatPosition,
  weddingSeatingTableLayout,
  type WeddingSeatingCanvasTable,
} from "@/lib/weddingSeatingCanvasLayoutState";
import { weddingAccountScopedStorageKey } from "@/lib/weddingLocalAccountScope";
import type {
  WeddingSeatingOptimizationAssignment,
  WeddingSeatingOptimizationResult,
  WeddingSeatingPersonNode,
  WeddingSeatingTableLayout,
  WeddingSeatingTableNode,
} from "@/lib/weddingSeatingOptimizationState";

const GUEST_DRAG_TYPE = "application/x-omnyid-wedding-guests";

function draggedGuestIds(event: DragEvent, activeIds: readonly string[]): string[] {
  if (activeIds.length > 0) return [...activeIds];
  const encoded = event.dataTransfer?.getData(GUEST_DRAG_TYPE);
  if (encoded) {
    try {
      const parsed = JSON.parse(encoded);
      if (Array.isArray(parsed)) return parsed.filter((value): value is string => typeof value === "string" && value.length > 0);
    } catch { /* fall through to the interoperable text payload */ }
  }
  return (event.dataTransfer?.getData("text/plain") ?? "").split(",").filter(Boolean);
}

function tableBodyClass(shape: WeddingSeatingTableLayout["shape"]): string {
  if (shape === "head") return "h-20 w-72 rounded-xl";
  if (shape === "rectangle") return "h-28 w-52 rounded-2xl";
  return "h-40 w-40 rounded-full";
}

export function WeddingSeatingCanvas(props: {
  workspaceId: string;
  people: readonly WeddingSeatingPersonNode[];
  tables: readonly WeddingSeatingTableNode[];
  result: WeddingSeatingOptimizationResult | null;
  saving?: boolean;
  onApply: (result: WeddingSeatingOptimizationResult) => void;
}) {
  const [tables, setTables] = createSignal<WeddingSeatingCanvasTable[]>([]);
  const [assignments, setAssignments] = createSignal<WeddingSeatingOptimizationAssignment[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = createSignal<string[]>([]);
  const [hoveredPersonId, setHoveredPersonId] = createSignal<string | null>(null);
  const [draggedPersonIds, setDraggedPersonIds] = createSignal<string[]>([]);
  const [seatDropTarget, setSeatDropTarget] = createSignal<{ tableId: string; personId: string | null } | null>(null);
  const [draggingTableId, setDraggingTableId] = createSignal<string | null>(null);
  const [zoom, setZoom] = createSignal(1);
  const [pan, setPan] = createSignal({ x: 0, y: 0 });
  const [panMode, setPanMode] = createSignal(false);
  const [fullscreen, setFullscreen] = createSignal(false);
  const [showGuide, setShowGuide] = createSignal(true);
  const [canvasNotice, setCanvasNotice] = createSignal("Select a guest to begin.");
  let viewport: HTMLDivElement | undefined;
  let initializedFor = "";
  let panStart: { clientX: number; clientY: number; x: number; y: number } | null = null;

  createEffect(() => {
    const fingerprint = props.result?.fingerprint
      ?? `${props.people.map((person) => person.id).join("|")}:${props.tables.map((table) => table.id).join("|")}`;
    if (initializedFor === fingerprint) return;
    initializedFor = fingerprint;
    setTables(buildWeddingSeatingCanvasTables(props.tables, props.result));
    setAssignments(props.result?.assignments ?? []);
  });

  const assignedIds = createMemo(() => new Set(assignments().map((assignment) => assignment.personId)));
  const unassigned = createMemo(() => props.people.filter((person) => !assignedIds().has(person.id)));
  const hovered = createMemo(() => props.people.find((person) => person.id === hoveredPersonId()) ?? null);
  const peopleAt = (tableId: string) => assignments().filter((assignment) => assignment.tableId === tableId);

  const fitCanvas = () => {
    if (!viewport) return;
    const next = Math.min((viewport.clientWidth - 20) / 960, (viewport.clientHeight - 20) / 620, 1.35);
    setZoom(Math.max(0.32, next));
    setPan({ x: 0, y: 0 });
  };

  onMount(() => {
    try {
      setShowGuide(localStorage.getItem(weddingAccountScopedStorageKey(`omnyid.wedding.seating.guide.${props.workspaceId}`)) !== "dismissed");
    } catch { /* storage is optional */ }
    fitCanvas();
    const observer = new ResizeObserver(fitCanvas);
    if (viewport) observer.observe(viewport);
    onCleanup(() => observer.disconnect());
  });
  createEffect(() => { if (fullscreen()) requestAnimationFrame(fitCanvas); });

  function addTable(shape: WeddingSeatingTableLayout["shape"]): void {
    const index = tables().length + 1;
    const shapeLabel = shape === "head" ? "Head" : shape === "rectangle" ? "Rectangle" : "Round";
    const id = `canvas-table-${Date.now()}`;
    setTables((current) => [...current, {
      id,
      tableId: id,
      label: `${shapeLabel} table ${index}`,
      capacity: shape === "head" ? 8 : shape === "rectangle" ? 10 : 8,
      shape,
      x: 38,
      y: 36,
      rotation: 0,
    }]);
    setCanvasNotice(`${shapeLabel} table added. Drag it into place.`);
  }

  function updateTable(tableId: string, update: (table: WeddingSeatingCanvasTable) => WeddingSeatingCanvasTable): void {
    setTables((current) => current.map((table) => table.id === tableId ? update(table) : table));
  }

  function assignMany(personIds: readonly string[], tableId: string, beforePersonId: string | null = null): void {
    const table = tables().find((item) => item.id === tableId);
    if (!table) return;
    const uniqueIds = [...new Set(personIds)].filter((id) => props.people.some((person) => person.id === id));
    const alreadyAtTarget = peopleAt(tableId).filter((item) => !uniqueIds.includes(item.personId)).length;
    const accepted = uniqueIds.slice(0, Math.max(0, table.capacity - alreadyAtTarget));
    setAssignments((current) => {
      const retained = current.filter((item) => !accepted.includes(item.personId));
      const inserted = accepted.flatMap((personId) => {
        const person = props.people.find((item) => item.id === personId);
        return person ? [{
          personId,
          personLabel: person.label,
          tableId,
          tableLabel: table.label,
          score: 0,
          reasonLabels: ["Placed by the couple on the seating canvas."],
        }] : [];
      });
      const targetIndex = beforePersonId
        ? retained.findIndex((item) => item.tableId === tableId && item.personId === beforePersonId)
        : -1;
      return targetIndex < 0
        ? [...retained, ...inserted]
        : [...retained.slice(0, targetIndex), ...inserted, ...retained.slice(targetIndex)];
    });
    setSeatDropTarget(null);
    setDraggedPersonIds([]);
    setSelectedPersonIds([]);
    setCanvasNotice(accepted.length > 0
      ? `${accepted.length} guest${accepted.length === 1 ? "" : "s"} placed at ${table.label}.`
      : `${table.label} is full. Increase its seats, move a guest, or choose another table.`);
  }

  function unseatSelected(): void {
    const ids = selectedPersonIds();
    if (ids.length === 0) return;
    setAssignments((current) => current.filter((assignment) => !ids.includes(assignment.personId)));
    setCanvasNotice(`${ids.length} guest${ids.length === 1 ? "" : "s"} moved back to the unseated list.`);
    setSelectedPersonIds([]);
  }

  function dismissGuide(): void {
    setShowGuide(false);
    try {
      localStorage.setItem(weddingAccountScopedStorageKey(`omnyid.wedding.seating.guide.${props.workspaceId}`), "dismissed");
    } catch { /* storage is optional */ }
  }

  function renameTable(tableId: string, label: string): void {
    const cleanLabel = label.trim().slice(0, 80) || "Untitled table";
    updateTable(tableId, (table) => ({ ...table, label: cleanLabel }));
    setAssignments((current) => current.map((assignment) => assignment.tableId === tableId
      ? { ...assignment, tableLabel: cleanLabel }
      : assignment));
  }

  function moveTable(event: PointerEvent, tableId: string): void {
    if (!viewport || panMode() || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const table = tables().find((item) => item.id === tableId);
    if (!table) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const start = { x: table.x, y: table.y };
    const target = event.currentTarget as HTMLElement;
    setDraggingTableId(tableId);
    target.setPointerCapture(event.pointerId);
    let frame = 0;
    const onMove = (move: PointerEvent) => {
      const dx = (move.clientX - startX) / Math.max(zoom(), 0.1) / 960 * 100;
      const dy = (move.clientY - startY) / Math.max(zoom(), 0.1) / 620 * 100;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => updateTable(tableId, (item) => ({
        ...item,
        x: Math.max(0, Math.min(82, start.x + dx)),
        y: Math.max(0, Math.min(76, start.y + dy)),
      })));
    };
    const onUp = () => {
      setDraggingTableId(null);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }

  function startGuestDrag(event: DragEvent, person: WeddingSeatingPersonNode, selected: boolean): void {
    event.stopPropagation();
    const ids = selected ? selectedPersonIds() : [person.id];
    setDraggedPersonIds(ids);
    if (!event.dataTransfer) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(GUEST_DRAG_TYPE, JSON.stringify(ids));
    event.dataTransfer.setData("text/plain", ids.join(","));
  }

  function guestButton(person: WeddingSeatingPersonNode, compact = false, tableId: string | null = null) {
    const selected = () => selectedPersonIds().includes(person.id);
    return <button
      type="button"
      draggable={true}
      aria-label={`${person.label}. Drag to a table or select for tap placement.`}
      aria-pressed={selected()}
      onPointerDown={(event) => event.stopPropagation()}
      onDragStart={(event) => startGuestDrag(event, person, selected())}
      onDragOver={(event) => {
        if (!tableId) return;
        event.preventDefault();
        event.stopPropagation();
        setSeatDropTarget({ tableId, personId: person.id });
      }}
      onDrop={(event) => {
        if (!tableId) return;
        event.preventDefault();
        event.stopPropagation();
        assignMany(draggedGuestIds(event, draggedPersonIds()), tableId, person.id);
      }}
      onDragEnd={() => { setDraggedPersonIds([]); setSeatDropTarget(null); }}
      onMouseEnter={() => setHoveredPersonId(person.id)}
      onMouseLeave={() => setHoveredPersonId(null)}
      onFocus={() => setHoveredPersonId(person.id)}
      onBlur={() => setHoveredPersonId(null)}
      onClick={(event) => {
        event.stopPropagation();
        setSelectedPersonIds((current) => current.includes(person.id)
          ? current.filter((id) => id !== person.id)
          : [...current, person.id]);
      }}
      class={`${compact ? "max-w-28 px-2 py-1 text-[11px] shadow-sm" : "min-h-10 w-full px-3 py-2 text-left text-xs"} cursor-grab break-words rounded-lg border font-semibold active:cursor-grabbing ${seatDropTarget()?.personId === person.id ? "ring-4 ring-emerald-300" : ""} ${selected() ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border bg-white text-wedding-ink"}`}
    >{person.label}</button>;
  }

  function rotateTable(table: WeddingSeatingCanvasTable, direction: -1 | 1): void {
    const rotated = rotateWeddingSeatingCanvasTable(table, direction);
    updateTable(table.id, () => rotated);
    setCanvasNotice(`${table.label} rotated to ${rotated.rotation} degrees.`);
  }

  function changeCapacity(table: WeddingSeatingCanvasTable, change: -1 | 1): void {
    const resized = resizeWeddingSeatingCanvasTable(table, change);
    updateTable(table.id, () => resized);
    setCanvasNotice(`${table.label} now has ${resized.capacity} seats.`);
  }

  function save(): void {
    const base = props.result;
    props.onApply({
      assignments: assignments(),
      tableLayout: weddingSeatingTableLayout(tables()),
      totalScore: base?.totalScore ?? 0,
      hardViolations: base?.hardViolations ?? [],
      softSignals: base?.softSignals ?? [],
      explanationLabels: ["Updated by the couple on the visual seating canvas."],
      proactiveIssueLabels: base?.proactiveIssueLabels ?? [],
      applyLabel: "Apply seating plan",
      alternativeLabel: base?.alternativeLabel ?? "Show another option",
      fingerprint: null,
      semanticTags: base?.semanticTags,
      semanticKind: base?.semanticKind,
      semanticObject: base?.semanticObject,
    });
  }

  return <section
    class={`${fullscreen() ? "fixed inset-0 z-[6000] overflow-auto bg-white p-4" : "mt-3 rounded-xl border border-wedding-border bg-wedding-card p-3"}`}
    aria-labelledby="seating-canvas-title"
  >
    <div class="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 id="seating-canvas-title" class="text-sm font-semibold text-wedding-ink">Visual seating plan</h3>
        <p class="mt-1 text-xs leading-5 text-wedding-ink/65">Drag a guest name onto a table, or select names and tap a table. Move and rotate tables to match the room.</p>
      </div>
      <div class="flex flex-wrap gap-2" aria-label="Add a table">
        <button type="button" class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold" onClick={() => addTable("round")}>+ Round</button>
        <button type="button" class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold" onClick={() => addTable("rectangle")}>+ Rectangle</button>
        <button type="button" class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold" onClick={() => addTable("head")}>+ Head table</button>
        <button type="button" class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold" onClick={() => setFullscreen((value) => !value)}>{fullscreen() ? "Exit full screen" : "Full screen"}</button>
      </div>
    </div>
    <WeddingInlineHelpNote class="mt-3">Table moves, names, seat counts and rotation are saved with this seating plan. Turn Pan on before dragging the room itself.</WeddingInlineHelpNote>
    <Show when={showGuide()}>
      <div class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3" aria-label="Seating plan quick start">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="text-sm font-semibold text-emerald-950">Seat guests in three steps</p>
            <ol class="mt-2 grid gap-2 text-sm text-emerald-950/80 sm:grid-cols-3">
              <li><strong>1.</strong> Drag a name, or select one or more.</li>
              <li><strong>2.</strong> Drop or tap on a table.</li>
              <li><strong>3.</strong> Arrange the room and save.</li>
            </ol>
          </div>
          <button type="button" class="min-h-10 shrink-0 rounded-lg border border-emerald-700 px-3 text-xs font-semibold text-emerald-950" onClick={dismissGuide}>Got it</button>
        </div>
      </div>
    </Show>
    <div class="mt-3 flex flex-wrap items-center gap-2 text-xs" aria-label="Seating progress">
      <span class="rounded-lg bg-wedding-page px-2 py-1 font-semibold">{assignments().length} seated</span>
      <span class="rounded-lg bg-wedding-page px-2 py-1 font-semibold">{unassigned().length} to seat</span>
      <span class="rounded-lg bg-wedding-page px-2 py-1 font-semibold">{tables().length} tables</span>
    </div>
    <p class="sr-only" aria-live="polite">{canvasNotice()}</p>
    <div class="mt-3 grid gap-3 lg:grid-cols-[minmax(13rem,18rem)_minmax(0,1fr)]">
      <aside class="max-h-[34rem] overflow-auto rounded-xl border border-wedding-border bg-wedding-page p-3">
        <div class="flex items-center justify-between gap-2">
          <div><p class="text-xs font-semibold">To seat</p><p class="mt-1 text-[11px] text-wedding-ink/60">Drag a name onto a table.</p></div>
          <span class="text-[11px] text-wedding-ink/60">{selectedPersonIds().length} selected</span>
        </div>
        <div class="mt-2 grid gap-2"><For each={unassigned()}>{(person) => guestButton(person)}</For></div>
        <Show when={unassigned().length === 0}><p class="mt-2 text-xs text-wedding-ink/65">Every guest is assigned. Drag a seated name to move them.</p></Show>
        <Show when={selectedPersonIds().length > 0}>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold" onClick={() => setSelectedPersonIds([])}>Clear selection</button>
            <Show when={selectedPersonIds().some((id) => assignedIds().has(id))}>
              <button type="button" class="min-h-10 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-950" onClick={unseatSelected}>Move to unseated</button>
            </Show>
          </div>
        </Show>
      </aside>
      <div class="min-w-0">
        <div class="mb-2 flex flex-wrap gap-2">
          <button type="button" class="min-h-10 rounded-lg border bg-white px-3 text-xs font-semibold" onClick={fitCanvas}>Fit</button>
          <button type="button" class="min-h-10 rounded-lg border bg-white px-3 text-xs font-semibold" onClick={() => setZoom((value) => Math.min(1.8, value + 0.15))}>Zoom in</button>
          <button type="button" class="min-h-10 rounded-lg border bg-white px-3 text-xs font-semibold" onClick={() => setZoom((value) => Math.max(0.32, value - 0.15))}>Zoom out</button>
          <button type="button" aria-pressed={panMode()} class={`min-h-10 rounded-lg border px-3 text-xs font-semibold ${panMode() ? "bg-wedding-primary text-white" : "bg-white"}`} onClick={() => setPanMode((value) => !value)}>Pan {panMode() ? "on" : "off"}</button>
        </div>
        <div
          ref={viewport}
          class={`${fullscreen() ? "h-[calc(100dvh-14rem)]" : "h-[30rem]"} relative overflow-hidden rounded-xl border border-wedding-border bg-[radial-gradient(circle_at_center,_rgba(20,83,45,0.08)_1px,_transparent_1px)] bg-[length:18px_18px] touch-none`}
          aria-label="Reception floor canvas"
          onWheel={(event) => { event.preventDefault(); setZoom((value) => Math.max(0.32, Math.min(1.8, value + (event.deltaY < 0 ? 0.08 : -0.08)))); }}
          onPointerDown={(event) => {
            if (!panMode() || event.target !== event.currentTarget) return;
            panStart = { clientX: event.clientX, clientY: event.clientY, ...pan() };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => { if (panStart) setPan({ x: panStart.x + event.clientX - panStart.clientX, y: panStart.y + event.clientY - panStart.clientY }); }}
          onPointerUp={() => { panStart = null; }}
          onPointerCancel={() => { panStart = null; }}
        >
          <div class="absolute left-1/2 top-1/2 h-[620px] w-[960px] origin-center" style={{ transform: `translate(calc(-50% + ${pan().x}px), calc(-50% + ${pan().y}px)) scale(${zoom()})` }}>
            <For each={tables()}>{(table) => {
              const seated = () => peopleAt(table.id);
              return <div
                role="group"
                tabIndex={0}
                aria-label={`${table.label}, ${seated().length} of ${table.capacity} seats filled${table.shape === "round" ? "" : `, rotated ${table.rotation} degrees`}`}
                class="absolute h-56 w-80"
                style={{ left: `${table.x}%`, top: `${table.y}%`, "will-change": draggingTableId() === table.id ? "left, top" : "auto" }}
                onDragOver={(event) => { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "move"; setSeatDropTarget({ tableId: table.id, personId: null }); }}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setSeatDropTarget(null); }}
                onDrop={(event) => { event.preventDefault(); event.stopPropagation(); assignMany(draggedGuestIds(event, draggedPersonIds()), table.id); }}
                onClick={() => { if (selectedPersonIds().length) assignMany(selectedPersonIds(), table.id); }}
                onKeyDown={(event) => {
                  if ((event.key === "Enter" || event.key === " ") && selectedPersonIds().length > 0) {
                    event.preventDefault();
                    assignMany(selectedPersonIds(), table.id);
                  }
                }}
              >
                <div
                  data-table-body
                  class={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none flex-col items-center justify-center border-2 bg-white/95 p-3 shadow-sm transition-[border-color,box-shadow] active:cursor-grabbing motion-reduce:transition-none ${tableBodyClass(table.shape)} ${seatDropTarget()?.tableId === table.id ? "border-emerald-500 ring-4 ring-emerald-200" : "border-wedding-primary/45"}`}
                  style={{ transform: `translate(-50%, -50%) rotate(${table.rotation}deg)` }}
                  onPointerDown={(event) => moveTable(event, table.id)}
                />
                <div class="pointer-events-none absolute left-1/2 top-1/2 z-10 w-40 -translate-x-1/2 -translate-y-1/2 text-center">
                  <input
                    aria-label={`Table name for ${table.label}`}
                    value={table.label}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => renameTable(table.id, event.currentTarget.value)}
                    class="pointer-events-auto w-full rounded border-0 bg-white/75 px-1 text-center text-xs font-bold text-wedding-ink focus:bg-white focus:ring-2 focus:ring-wedding-primary"
                  />
                  <p class="mt-1 text-[11px] font-semibold text-wedding-ink/65">{seated().length}/{table.capacity} seats</p>
                </div>
                <div class="absolute right-0 top-0 z-20 flex items-center gap-1 rounded-lg border border-wedding-border bg-white p-1 shadow-sm" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                  <button type="button" aria-label={`Remove one seat from ${table.label}`} disabled={table.capacity <= Math.max(1, seated().length)} class="h-9 min-w-9 rounded-md border text-sm font-bold disabled:opacity-35" onClick={() => changeCapacity(table, -1)}>−</button>
                  <span class="min-w-12 text-center text-[11px] font-semibold">{table.capacity} seats</span>
                  <button type="button" aria-label={`Add one seat to ${table.label}`} disabled={table.capacity >= 40} class="h-9 min-w-9 rounded-md border text-sm font-bold disabled:opacity-35" onClick={() => changeCapacity(table, 1)}>+</button>
                </div>
                <Show when={table.shape !== "round"}>
                  <div class="absolute bottom-0 right-0 z-20 flex gap-1" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                    <button type="button" aria-label={`Rotate ${table.label} left 45 degrees`} class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold shadow-sm" onClick={() => rotateTable(table, -1)}>↶ Rotate</button>
                    <button type="button" aria-label={`Rotate ${table.label} right 45 degrees`} class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold shadow-sm" onClick={() => rotateTable(table, 1)}>Rotate ↷</button>
                  </div>
                </Show>
                <For each={seated()}>{(assignment, seatIndex) => {
                  const person = props.people.find((item) => item.id === assignment.personId);
                  const position = () => weddingSeatingSeatPosition({
                    shape: table.shape,
                    rotation: table.rotation,
                    seatIndex: seatIndex(),
                    seatCount: seated().length,
                  });
                  return person ? <div class="absolute left-1/2 top-1/2 z-20" style={{ transform: `translate(calc(-50% + ${position().x}px), calc(-50% + ${position().y}px))` }}>{guestButton(person, true, table.id)}</div> : null;
                }}</For>
              </div>;
            }}</For>
          </div>
        </div>
      </div>
    </div>
    <Show when={hovered()}>{(person) => <div class="mt-2 rounded-lg border border-wedding-border bg-wedding-page p-3 text-xs text-wedding-ink" role="status">
      <p class="font-semibold">{person().label}</p>
      <p class="mt-1 text-wedding-ink/70">{[
        person().relationshipLabel,
        person().weddingPartyRole,
        ...(person().dietaryRequirements ?? []),
        ...(person().accessibilityNeeds ?? []),
        ...(person().socialGroups ?? []),
      ].filter(Boolean).join(" · ") || "No additional guest notes recorded."}</p>
    </div>}</Show>
    <button type="button" disabled={props.saving || assignments().length === 0} class="mt-3 min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={save}>{props.saving ? "Saving…" : "Save visual seating plan"}</button>
  </section>;
}
