// @locs-version: 2.0
import { For, Show, createEffect } from "solid-js";
import {
  WEDDING_VENDOR_ATTRIBUTE_STATUS_LABELS,
  type WeddingVendorAttributeEdit,
  type WeddingVendorAttributeRow,
} from "@/lib/weddingVendorAttributeCatalogState";
import type { WeddingVendorAttributeStatus } from "@/lib/weddingVendorRankingState";
import { WEDDING_FACET_VOCABULARY } from "@/lib/weddingFacetVocabularyState";

const STATUS_OPTIONS = Object.keys(WEDDING_VENDOR_ATTRIBUTE_STATUS_LABELS) as WeddingVendorAttributeStatus[];
const INPUT_CLASS = "min-w-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900";

function groupLabel(group: string): string {
  return group.charAt(0).toUpperCase() + group.slice(1);
}

// Unset, yes and no are three different facts, so a plain checkbox is not enough.
function nextBoolText(current: string): string {
  return current === "" ? "true" : current === "true" ? "false" : "";
}

export default function UsageAdminWeddingVendorAttributesEditor(props: {
  groups: ReadonlyArray<{ group: string; rows: readonly WeddingVendorAttributeRow[] }>;
  edits: Record<string, WeddingVendorAttributeEdit | undefined>;
  onEdit: (key: string, edit: WeddingVendorAttributeEdit) => void;
  disabled?: boolean;
}) {
  const current = (row: WeddingVendorAttributeRow): WeddingVendorAttributeEdit => props.edits[row.entry.key] ?? row.initial;
  const patch = (row: WeddingVendorAttributeRow, changes: Partial<WeddingVendorAttributeEdit>) =>
    props.onEdit(row.entry.key, { ...current(row), ...changes });
  // Typing a value implies the operator knows it; clearing it returns the row to unknown.
  const setValue = (row: WeddingVendorAttributeRow, valueText: string) => {
    const status = current(row).status;
    const carriesValue = status === "known" || status === "estimated";
    patch(row, {
      valueText,
      status: valueText.trim() === "" ? "unknown" : carriesValue ? status : "known",
    });
  };

  return (
    <details class="mt-3 rounded-xl border border-slate-200 bg-white/80 p-3">
      <summary class="cursor-pointer text-sm font-semibold text-slate-950">Ranking attributes</summary>
      <p class="mt-2 text-xs leading-5 text-slate-600">
        Facts the planner uses to rank this vendor. Unknown is fine and is never counted against a vendor. Only the rows you change are saved, as operator-confirmed evidence.
      </p>
      <Show when={props.groups.length === 0}>
        <p class="mt-2 text-xs text-slate-500">The attribute catalog is not available yet.</p>
      </Show>
      <For each={props.groups}>
        {(group) => (
          <fieldset class="mt-3 min-w-0">
            <legend class="font-mono text-[10px] uppercase tracking-[0.18em] text-rose-700/70">{groupLabel(group.group)}</legend>
            <div class="mt-1 grid gap-2">
              <For each={group.rows}>
                {(row) => {
                  const edit = () => current(row);
                  const carriesValue = () => edit().status === "known" || edit().status === "estimated";
                  let checkbox: HTMLInputElement | undefined;
                  createEffect(() => {
                    if (checkbox) checkbox.indeterminate = !carriesValue() || edit().valueText === "";
                  });
                  return (
                    <div class="grid min-w-0 gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_8.5rem]">
                      <div class="min-w-0">
                        <p class="break-words text-xs font-semibold text-slate-900">{row.entry.label}</p>
                        <Show when={row.authority}>
                          {(authority) => (
                            <p class="mt-0.5 break-words text-[11px] text-slate-500">
                              {authority().replace(/_/g, " ")}
                              {row.confidence !== null ? ` · ${Math.round(row.confidence * 100)}% confidence` : ""}
                            </p>
                          )}
                        </Show>
                      </div>
                      <div class="min-w-0">
                        <Show when={row.entry.kind === "bool"}>
                          <input
                            type="checkbox"
                            class="h-4 w-4"
                            aria-label={row.entry.label}
                            disabled={props.disabled}
                            checked={edit().valueText === "true"}
                            ref={checkbox}
                            onClick={(event) => {
                              event.preventDefault();
                              setValue(row, nextBoolText(carriesValue() ? edit().valueText : ""));
                            }}
                          />
                        </Show>
                        <Show when={row.entry.kind === "enum"}>
                          <select
                            class={`${INPUT_CLASS} w-full`}
                            disabled={props.disabled}
                            value={edit().valueText}
                            onChange={(event) => setValue(row, event.currentTarget.value)}
                          >
                            <option value="">Unknown</option>
                            <For each={row.entry.enumValues}>{(option) => <option value={option}>{option}</option>}</For>
                          </select>
                        </Show>
                        <Show when={row.entry.key === "style_facets"}>
                          <select
                            class={`${INPUT_CLASS} min-h-28 w-full`}
                            aria-label={row.entry.label}
                            disabled={props.disabled}
                            multiple
                            value={edit().valueText.split(",").map((value) => value.trim()).filter(Boolean)}
                            onChange={(event) => setValue(row, Array.from(event.currentTarget.selectedOptions, (option) => option.value).join(", "))}
                          >
                            <For each={WEDDING_FACET_VOCABULARY}>{(facet) => <option value={facet.id}>{facet.label}</option>}</For>
                          </select>
                        </Show>
                        <Show when={!["bool", "enum"].includes(row.entry.kind) && row.entry.key !== "style_facets"}>
                          <input
                            class={`${INPUT_CLASS} w-full`}
                            aria-label={row.entry.label}
                            disabled={props.disabled}
                            type={
                              row.entry.kind === "number" || row.entry.kind === "money" || row.entry.kind === "coordinate"
                                ? "number"
                                : row.entry.kind === "url"
                                  ? "url"
                                  : row.entry.kind === "time"
                                    ? "time"
                                    : "text"
                            }
                            min={["condition_score", "food_score", "service_score"].includes(row.entry.key) ? 1 : row.entry.kind === "number" || row.entry.kind === "money" ? 0 : row.entry.kind === "coordinate" ? -180 : undefined}
                            max={["condition_score", "food_score", "service_score"].includes(row.entry.key) ? 5 : row.entry.kind === "coordinate" ? 180 : undefined}
                            step={row.entry.kind === "number" || row.entry.kind === "money" || row.entry.kind === "coordinate" ? "any" : undefined}
                            placeholder={row.entry.kind === "tags" ? "comma, separated, tags" : row.entry.kind === "json" ? "JSON object or array" : "Unknown"}
                            value={edit().valueText}
                            onInput={(event) => setValue(row, event.currentTarget.value)}
                          />
                        </Show>
                        <Show when={carriesValue()}>
                          <input
                            class={`${INPUT_CLASS} mt-1 w-full text-xs`}
                            type="url"
                            aria-label={`${row.entry.label} source URL`}
                            placeholder="Source URL (optional)"
                            disabled={props.disabled}
                            value={edit().sourceUrl}
                            onInput={(event) => patch(row, { sourceUrl: event.currentTarget.value })}
                          />
                        </Show>
                      </div>
                      <select
                        class={INPUT_CLASS}
                        aria-label={`${row.entry.label} status`}
                        disabled={props.disabled}
                        value={edit().status}
                        onChange={(event) => patch(row, { status: event.currentTarget.value as WeddingVendorAttributeStatus })}
                      >
                        <For each={STATUS_OPTIONS}>
                          {(status) => <option value={status}>{WEDDING_VENDOR_ATTRIBUTE_STATUS_LABELS[status]}</option>}
                        </For>
                      </select>
                    </div>
                  );
                }}
              </For>
            </div>
          </fieldset>
        )}
      </For>
    </details>
  );
}
