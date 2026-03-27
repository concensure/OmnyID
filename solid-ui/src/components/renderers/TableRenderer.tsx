import { For, Show } from "solid-js";
import type { AfpMessage, AfpView } from "@/lib/api";

type TableRow = Record<string, unknown>;

/**
 * Renders an AFP message as a compact data table / action-log surface.
 * Agents write `views: [{format:"table", content:{columns:[...], rows:[...]}}]`.
 */
export function TableRenderer(props: { message: AfpMessage; view?: AfpView }) {
  const tableContent = () => props.view?.content ?? props.message.content;

  const columns = (): string[] => {
    const raw = tableContent().columns;
    if (Array.isArray(raw)) return raw as string[];
    // Derive columns from first row or content keys
    const rows = tableContent().rows;
    if (Array.isArray(rows) && rows.length > 0) {
      return Object.keys(rows[0] as object);
    }
    return Object.keys(props.message.content).filter((k) => k !== "views");
  };

  const rows = (): TableRow[] => {
    const raw = tableContent().rows;
    if (Array.isArray(raw)) return raw as TableRow[];
    // Fallback: one row from content fields
    return [props.message.content as TableRow];
  };

  const label = () =>
    (tableContent().label as string | undefined) ??
    (tableContent().title as string | undefined) ??
    props.message.type;

  return (
    <div class="space-y-2">
      <div class="flex items-center gap-3">
        <p class="font-mono text-[10px] uppercase tracking-[0.22em] text-outline">{label()}</p>
        <span class="ml-auto text-xs text-on-surface-variant">{props.message.from}</span>
      </div>
      <Show when={columns().length > 0 && rows().length > 0}>
        <div class="overflow-auto rounded-2xl border border-white/35">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-white/25 bg-white/20">
                <For each={columns()}>
                  {(col) => (
                    <th class="px-4 py-2 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-outline">
                      {col}
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={rows()}>
                {(row) => (
                  <tr class="border-b border-white/15 last:border-0 hover:bg-white/20">
                    <For each={columns()}>
                      {(col) => (
                        <td class="px-4 py-2.5 text-on-surface-variant">
                          {String(row[col] ?? "—")}
                        </td>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>
    </div>
  );
}
