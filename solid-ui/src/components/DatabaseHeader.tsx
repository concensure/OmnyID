// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";

import type { DatabaseDefinitionProjection } from "@/lib/databaseRegistryState";

export type DatabaseDensityMode = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10";

const DENSITY_MODES: DatabaseDensityMode[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

function densityLabel(mode: DatabaseDensityMode): string {
  if (mode === "1") return "A";
  if (mode === "10") return "A";
  return "";
}

function densityLabelClass(mode: DatabaseDensityMode): string {
  if (mode === "1") return "text-[9px] leading-none";
  if (mode === "10") return "text-[15px] leading-none";
  return "h-1.5 w-1.5 rounded-full bg-current opacity-70";
}

export function DatabaseHeader(props: {
  definitions: DatabaseDefinitionProjection[];
  selectedDatabaseId: string | null;
  name: string;
  densityMode: DatabaseDensityMode;
  fullscreen: boolean;
  readOnly?: boolean;
  readOnlyReason?: string;
  onSelect: (databaseId: string) => void;
  onNameInput: (name: string) => void;
  onNameCommit: () => void;
  onDensityChange: (mode: DatabaseDensityMode) => void;
  onToggleFullscreen: () => void;
  onNewDatabase: () => void;
  onNewRecord: () => void;
  onNewTable: () => void;
  onNewField: () => void;
  onImport: () => void;
  onArchiveToggle: () => void;
}) {
  const [showNewMenu, setShowNewMenu] = createSignal(false);
  const selected = () => props.definitions.find((definition) => definition.databaseId === props.selectedDatabaseId) ?? null;
  const run = (action: () => void) => { setShowNewMenu(false); action(); };
  return (
    <header class="space-y-3">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0 flex-1">
          <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-outline">Database</p>
          <div class="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center">
            <label class="sr-only" for="database-switcher">Open database</label>
            <select
              id="database-switcher"
              value={props.selectedDatabaseId ?? ""}
              onChange={(event) => props.onSelect(event.currentTarget.value)}
              class="min-h-11 max-w-full rounded-xl border border-outline/20 bg-white/70 px-3 text-sm font-semibold text-on-surface outline-none focus:border-primary/50 sm:max-w-xs"
            >
              <For each={props.definitions}>{(definition) => (
                <option value={definition.databaseId}>
                  {definition.name}{definition.archived ? " (archived)" : ""}
                </option>
              )}</For>
            </select>
            <input
              value={props.name}
              disabled={selected()?.legacy || selected()?.archived || props.readOnly}
              onInput={(event) => props.onNameInput(event.currentTarget.value)}
              onBlur={props.onNameCommit}
              onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
              aria-label="Database name"
              class="min-h-11 min-w-0 flex-1 border-b border-transparent bg-transparent px-1 text-xl font-bold text-on-surface outline-none transition placeholder:text-on-surface/30 focus:border-primary/30 disabled:opacity-70"
              placeholder="Unnamed database"
            />
          </div>
          <p class="mt-1 text-sm text-on-surface-variant">
            {props.readOnlyReason || (selected()?.archived
              ? "This database is archived and read-only until you restore it."
              : "Add rows and fields to this private, account-scoped database.")}
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2 lg:justify-end">
          <div class="flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-outline/15 bg-white/30 p-1 text-[10px] text-on-surface-variant" aria-label="Font size">
            <span class="shrink-0 px-1.5 font-mono uppercase tracking-[0.16em] text-outline/70">Font size</span>
            <For each={DENSITY_MODES}>{(mode) => (
              <button
                type="button"
                onClick={() => props.onDensityChange(mode)}
                class={`inline-flex min-h-8 min-w-7 shrink-0 items-center justify-center rounded-full border font-semibold transition ${props.densityMode === mode ? "border-primary/25 bg-primary/15 text-primary shadow-sm" : "border-transparent text-on-surface-variant/60 hover:bg-white/55"}`}
                aria-pressed={props.densityMode === mode}
                aria-label={`Font size ${mode} of 10`}
              >
                <span class={densityLabelClass(mode)}>{densityLabel(mode)}</span>
              </button>
            )}</For>
          </div>
          <button type="button" onClick={props.onToggleFullscreen} class="min-h-11 rounded-full border border-outline/20 bg-white/40 px-3 text-xs font-medium text-on-surface-variant transition hover:bg-white/60">
            {props.fullscreen ? "Exit fullscreen" : "Fullscreen"}
          </button>
          <button type="button" onClick={props.onArchiveToggle} disabled={selected()?.legacy || (props.readOnly && !selected()?.archived)} class="min-h-11 rounded-full border border-outline/20 bg-white/40 px-3 text-xs font-medium text-on-surface-variant transition hover:bg-white/60 disabled:opacity-45">
            {selected()?.archived ? "Restore" : "Archive"}
          </button>
          <button type="button" onClick={props.onNewDatabase} class="min-h-11 rounded-full border border-primary/30 bg-primary/5 px-4 text-xs font-semibold text-primary transition hover:bg-primary/10">
            New database
          </button>
          <div class="relative">
            <button type="button" disabled={selected()?.archived || props.readOnly} onClick={() => setShowNewMenu((value) => !value)} class="flex min-h-11 items-center gap-1 rounded-full bg-primary px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/80 disabled:opacity-50">
              Add <span aria-hidden="true" class={`text-[8px] opacity-70 transition-transform ${showNewMenu() ? "rotate-180" : ""}`}>▼</span>
            </button>
            <Show when={showNewMenu()}>
              <div class="absolute right-0 top-full z-50 mt-1 min-w-[190px] rounded-2xl border border-white/45 bg-white/96 p-1.5 shadow-panel backdrop-blur-xl">
                <For each={[
                  ["New record", props.onNewRecord],
                  ["New table", props.onNewTable],
                  ["New field", props.onNewField],
                  ["Import CSV / JSON", props.onImport],
                ] as const}>{(item) => (
                  <button type="button" onClick={() => run(item[1])} class="flex min-h-11 w-full items-center rounded-xl px-3 text-left text-sm text-on-surface transition hover:bg-primary/6">
                    {item[0]}
                  </button>
                )}</For>
              </div>
              <button type="button" aria-label="Close add menu" class="fixed inset-0 z-40 cursor-default" onClick={() => setShowNewMenu(false)} />
            </Show>
          </div>
        </div>
      </div>
    </header>
  );
}
