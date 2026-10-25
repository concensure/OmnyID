import { createEffect, createMemo, createSignal, For, Show } from "solid-js";
import { WeddingInlineHelpNote } from "@/components/WeddingInlineHelpNote";

import type {
  WeddingSeatingOptimizationAssignment,
  WeddingSeatingOptimizationResult,
  WeddingSeatingPersonNode,
  WeddingSeatingTableNode,
} from "@/lib/weddingSeatingOptimizationState";

type CanvasTable = WeddingSeatingTableNode & { shape?: "round" | "long" };

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
  const [selectedPersonId, setSelectedPersonId] = createSignal<string | null>(null);
  const [hoveredPersonId, setHoveredPersonId] = createSignal<string | null>(null);
  const [draggedPersonId, setDraggedPersonId] = createSignal<string | null>(null);
  let initializedFor = "";

  createEffect(() => {
    const fingerprint = props.result?.fingerprint ?? `${props.people.map((person) => person.id).join("|")}:${props.tables.map((table) => table.id).join("|")}`;
    if (initializedFor === fingerprint) return;
    initializedFor = fingerprint;
    setTables(props.tables.map((table) => ({ ...table, shape: "round" })));
    setAssignments(props.result?.assignments ?? []);
  });

  const assignedIds = createMemo(() => new Set(assignments().map((assignment) => assignment.personId)));
  const unassigned = createMemo(() => props.people.filter((person) => !assignedIds().has(person.id)));
  const hovered = createMemo(() => props.people.find((person) => person.id === hoveredPersonId()) ?? null);
  const peopleAt = (tableId: string) => assignments().filter((assignment) => assignment.tableId === tableId);

  function addTable(shape: "round" | "long"): void {
    const index = tables().length + 1;
    setTables((current) => [...current, { id: `canvas-table-${Date.now()}`, label: `${shape === "round" ? "Round" : "Long"} table ${index}`, capacity: shape === "round" ? 8 : 10, shape }]);
  }

  function assign(personId: string, tableId: string): void {
    const person = props.people.find((item) => item.id === personId);
    const table = tables().find((item) => item.id === tableId);
    if (!person || !table) return;
    const currentAtTable = peopleAt(tableId).filter((item) => item.personId !== personId);
    if (currentAtTable.length >= table.capacity) return;
    setAssignments((current) => [
      ...current.filter((item) => item.personId !== personId),
      { personId, personLabel: person.label, tableId, tableLabel: table.label, score: 0, reasonLabels: ["Placed by the couple on the seating canvas."] },
    ]);
    setSelectedPersonId(null);
  }

  function guestButton(person: WeddingSeatingPersonNode, compact = false) {
    return (
      <button
        type="button"
        draggable
        onDragStart={() => setDraggedPersonId(person.id)}
        onDragEnd={() => setDraggedPersonId(null)}
        onMouseEnter={() => setHoveredPersonId(person.id)}
        onMouseLeave={() => setHoveredPersonId(null)}
        onFocus={() => setHoveredPersonId(person.id)}
        onBlur={() => setHoveredPersonId(null)}
        aria-pressed={selectedPersonId() === person.id}
        onClick={(event) => { event.stopPropagation(); setSelectedPersonId((current) => current === person.id ? null : person.id); }}
        class={`${compact ? "px-2 py-1 text-[11px]" : "min-h-10 px-3 py-2 text-xs"} max-w-full cursor-grab break-words rounded-lg border font-semibold ${selectedPersonId() === person.id ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border bg-white text-wedding-ink"}`}
      >{person.label}</button>
    );
  }

  function save(): void {
    const base = props.result;
    props.onApply({
      assignments: assignments(), totalScore: base?.totalScore ?? 0,
      hardViolations: base?.hardViolations ?? [], softSignals: base?.softSignals ?? [],
      explanationLabels: ["Updated by the couple on the visual seating canvas."],
      proactiveIssueLabels: base?.proactiveIssueLabels ?? [], applyLabel: "Apply seating plan",
      alternativeLabel: base?.alternativeLabel ?? "Show another option", fingerprint: null,
      semanticTags: base?.semanticTags, semanticKind: base?.semanticKind, semanticObject: base?.semanticObject,
    });
  }

  return (
    <section class="mt-3 rounded-xl border border-wedding-border bg-wedding-card p-3" aria-labelledby="seating-canvas-title">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div><h3 id="seating-canvas-title" class="text-sm font-semibold text-wedding-ink">Visual seating plan</h3><p class="mt-1 text-xs leading-5 text-wedding-ink/65">Drag a guest to a table, or select their name and then tap a table.</p></div>
        <div class="flex flex-wrap gap-2"><button type="button" class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold" onClick={() => addTable("round")}>+ Round table</button><button type="button" class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold" onClick={() => addTable("long")}>+ Long table</button></div>
      </div>
      <WeddingInlineHelpNote class="mt-3">Click any guest and then a table to assign them. On a larger screen, you can drag names directly onto tables.</WeddingInlineHelpNote>
      <Show when={unassigned().length > 0}>
        <div class="mt-3 rounded-lg border border-dashed border-wedding-border bg-wedding-page p-2"><p class="mb-2 text-xs font-semibold text-wedding-ink/65">Unassigned guests</p><div class="flex flex-wrap gap-2"><For each={unassigned()}>{(person) => guestButton(person)}</For></div></div>
      </Show>
      <div class="mt-3 grid min-h-80 auto-rows-min gap-4 overflow-auto rounded-xl border border-wedding-border bg-[radial-gradient(circle_at_center,_rgba(20,83,45,0.08)_1px,_transparent_1px)] bg-[length:18px_18px] p-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Reception floor canvas">
        <For each={tables()}>{(table) => (
          <div
            role="button" tabindex="0" aria-label={`${table.label}, ${peopleAt(table.id).length} of ${table.capacity} seats filled`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); const personId = draggedPersonId() || event.dataTransfer?.getData("text/plain"); if (personId) assign(personId, table.id); }}
            onClick={() => { const personId = selectedPersonId(); if (personId) assign(personId, table.id); }}
            onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && selectedPersonId()) assign(selectedPersonId()!, table.id); }}
            class={`mx-auto flex min-h-36 w-full max-w-64 flex-col items-center justify-center border-2 border-wedding-primary/45 bg-white/95 p-3 shadow-sm outline-none focus:ring-2 focus:ring-wedding-primary ${table.shape === "long" ? "rounded-xl" : "rounded-[999px]"}`}
          >
            <p class="text-center text-xs font-bold text-wedding-ink">{table.label}</p><p class="text-[11px] text-wedding-ink/60">{peopleAt(table.id).length}/{table.capacity}</p>
            <div class="mt-2 flex max-w-full flex-wrap justify-center gap-1"><For each={peopleAt(table.id)}>{(assignment) => { const person = props.people.find((item) => item.id === assignment.personId); return person ? guestButton(person, true) : null; }}</For></div>
          </div>
        )}</For>
      </div>
      <Show when={hovered()}>{(person) => <div class="mt-2 rounded-lg border border-wedding-border bg-wedding-page p-3 text-xs text-wedding-ink" role="status"><p class="font-semibold">{person().label}</p><p class="mt-1 text-wedding-ink/70">{[person().relationshipLabel, person().weddingPartyRole, ...(person().dietaryRequirements ?? []), ...(person().accessibilityNeeds ?? []), ...(person().socialGroups ?? [])].filter(Boolean).join(" · ") || "No additional guest notes recorded."}</p></div>}</Show>
      <button type="button" disabled={props.saving || assignments().length === 0} class="mt-3 min-h-11 rounded-lg bg-wedding-primary px-4 text-sm font-semibold text-white disabled:opacity-50" onClick={save}>{props.saving ? "Saving…" : "Save visual seating plan"}</button>
    </section>
  );
}
