// @locs-version: 1.0
import { For, Show, createMemo } from "solid-js";
import type { AfpMessage } from "@/lib/api";
import { A2UIFormulaField } from "@/components/renderers/A2UIFormulaField";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

interface FormulaVariable {
  name: string;
  value: string;
  unit?: string;
}

type FormulaVariableItem = {
  name: string;
  value: string;
  unit: string | null;
  showUnit: boolean;
  rowClass: string;
};

const FORMULA_DEFAULT_TITLE = "Formula";
const FORMULA_EXPRESSION_LABEL = "Expression";
const FORMULA_EDIT_HELPER = "Edit the LaTeX expression above. Changes are local only.";
const FORMULA_RESULT_LABEL = "Result";
const FORMULA_VARIABLES_LABEL = "Variables";
const FORMULA_LEDGER_PREFIX = "Source: ledger/";

function asString(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseVariables(raw: unknown): FormulaVariable[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(afpRecord).filter((value) => Object.keys(value).length > 0).map((value) => ({
    name: asString(value["name"]),
    value: asString(value["value"]),
    unit: typeof value["unit"] === "string" ? value["unit"] : undefined,
  }));
}

export function FormulaRenderer(props: { message: AfpMessage }) {
  const rendererState = createMemo(() => {
    const content = afpRecord(decryptedDisplayContent(props.message));
    const title = asString(content.title) || FORMULA_DEFAULT_TITLE;
    const description = asString(content.description).trim();
    const latex = asString(content.latex);
    const result = typeof content.result === "string" ? content.result : null;
    const mode: "display" | "edit" = asString(content.mode) === "edit" ? "edit" : "display";
    const contextLedgerId =
      typeof content.context_ledger_id === "string" ? content.context_ledger_id : null;
    const variableItems: FormulaVariableItem[] = parseVariables(content.variables).map((variable, index) => ({
      name: variable.name,
      value: variable.value,
      unit: variable.unit ?? null,
      showUnit: Boolean(variable.unit),
      rowClass: index % 2 === 1 ? "border-t border-white/6 bg-white/[0.02]" : "border-t border-white/6",
    }));

    return {
      title,
      description,
      showDescription: description.length > 0,
      latex,
      mode,
      helperText: mode === "edit" ? FORMULA_EDIT_HELPER : undefined,
      result,
      showResult: Boolean(result),
      variableItems,
      showVariables: variableItems.length > 0,
      contextLedgerId,
      showLedgerSource: Boolean(contextLedgerId),
    };
  });

  return (
    <div class="space-y-4">
      <div>
        <p class="font-semibold text-on-surface">{rendererState().title}</p>
        <Show when={rendererState().showDescription}>
          <p class="mt-0.5 text-xs text-on-surface-variant">{rendererState().description}</p>
        </Show>
      </div>

      <A2UIFormulaField
        title={undefined}
        label={FORMULA_EXPRESSION_LABEL}
        value={rendererState().latex}
        mode={rendererState().mode}
        helperText={rendererState().helperText}
      />

      <Show when={rendererState().showResult}>
        <div class="flex items-center justify-between gap-3 rounded-xl border border-emerald-400/20 bg-emerald-500/8 px-4 py-2.5">
          <span class="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-emerald-400/70">
            {FORMULA_RESULT_LABEL}
          </span>
          <span class="tabular-nums text-base font-semibold text-emerald-300">
            {rendererState().result}
          </span>
        </div>
      </Show>

      <Show when={rendererState().showVariables}>
        <div class="overflow-hidden rounded-xl border border-white/10 bg-white/4">
          <p class="border-b border-white/8 px-3 py-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-outline">
            {FORMULA_VARIABLES_LABEL}
          </p>
          <table class="w-full text-sm">
            <tbody>
              <For each={rendererState().variableItems}>
                {(variable) => (
                  <tr class={variable.rowClass}>
                    <td class="w-1/3 px-3 py-2 font-mono text-amber-300">{variable.name}</td>
                    <td class="px-3 py-2 tabular-nums text-on-surface">{variable.value}</td>
                    <Show when={variable.showUnit}>
                      <td class="px-3 py-2 text-xs text-on-surface-variant">{variable.unit}</td>
                    </Show>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      <Show when={rendererState().showLedgerSource}>
        <p class="font-mono text-[0.6rem] text-on-surface-variant/50">
          {FORMULA_LEDGER_PREFIX}{rendererState().contextLedgerId}
        </p>
      </Show>
    </div>
  );
}
