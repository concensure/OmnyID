// @locs-version: 1.0
import { createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { MathfieldElement } from "mathlive";
import "mathlive";
import "mathlive/static.css";

const DANGEROUS_LATEX_CMDS = /\\(href|htmlData|placeholder|html)\s*\{/gi;
const COPIED_BUTTON_TEXT = "Copied";
const COPY_BUTTON_TEXT = "Copy LaTeX";
const RESET_BUTTON_TEXT = "Reset";
const HIDE_SOURCE_BUTTON_TEXT = "Hide source";
const SHOW_SOURCE_BUTTON_TEXT = "Show source";
const EDITABLE_MODE_TEXT = "Editable formula";
const RENDERED_MODE_TEXT = "Rendered formula";
const LATEX_SOURCE_TITLE = "LaTeX source";
const EMPTY_SOURCE_TEXT = "No formula yet.";

type FormulaFieldProps = {
  title?: string;
  label?: string;
  description?: string;
  helperText?: string;
  value?: string;
  placeholder?: string;
  mode?: "display" | "edit";
  showSource?: boolean;
};

type FormulaHeaderState = {
  label: string;
  showLabel: boolean;
  title: string;
  showTitle: boolean;
  description: string;
  showDescription: boolean;
};

type FormulaToolbarState = {
  editable: boolean;
  modeBadgeClass: string;
  modeText: string;
  copyButtonText: string;
  showReset: boolean;
  sourceToggleText: string;
};

type FormulaSourceState = {
  showSource: boolean;
  helperText: string;
  showHelperText: boolean;
  sourceText: string;
};

type FormulaFieldState = {
  header: FormulaHeaderState;
  toolbar: FormulaToolbarState;
  source: FormulaSourceState;
};

function sanitizeLatex(raw: string): string {
  return raw.replace(DANGEROUS_LATEX_CMDS, "\\text{[removed]}{");
}

function headerState(props: FormulaFieldProps): FormulaHeaderState {
  const label = props.label ?? "";
  const title = props.title ?? "";
  const description = props.description ?? "";
  return {
    label,
    showLabel: Boolean(label),
    title,
    showTitle: Boolean(title),
    description,
    showDescription: Boolean(description),
  };
}

function toolbarState(
  editable: boolean,
  copied: boolean,
  showSource: boolean
): FormulaToolbarState {
  return {
    editable,
    modeBadgeClass: editable ? "bg-sky-400/12 text-sky-100" : "bg-white/10 text-on-surface-variant",
    modeText: editable ? EDITABLE_MODE_TEXT : RENDERED_MODE_TEXT,
    copyButtonText: copied ? COPIED_BUTTON_TEXT : COPY_BUTTON_TEXT,
    showReset: editable,
    sourceToggleText: showSource ? HIDE_SOURCE_BUTTON_TEXT : SHOW_SOURCE_BUTTON_TEXT,
  };
}

function sourceState(
  props: FormulaFieldProps,
  latex: string,
  showSource: boolean
): FormulaSourceState {
  const helperText = props.helperText ?? "";
  return {
    showSource,
    helperText,
    showHelperText: Boolean(helperText),
    sourceText: latex.trim() || (props.placeholder ?? EMPTY_SOURCE_TEXT),
  };
}

function formulaFieldState(
  props: FormulaFieldProps,
  latex: string,
  copied: boolean,
  showSource: boolean
): FormulaFieldState {
  const editable = props.mode === "edit";
  return {
    header: headerState(props),
    toolbar: toolbarState(editable, copied, showSource),
    source: sourceState(props, latex, showSource),
  };
}

function syncMathField(
  field: MathfieldElement | undefined,
  editable: boolean,
  placeholder: string,
  latex: string
) {
  if (!field) return;
  field.readOnly = !editable;
  field.placeholder = placeholder;
  field.setAttribute("virtual-keyboard-mode", editable ? "onfocus" : "off");
  if (field.getValue("latex") !== latex) {
    field.setValue(latex, { silenceNotifications: true });
  }
}

export function A2UIFormulaField(props: FormulaFieldProps) {
  let field: MathfieldElement | undefined;
  const initialValue = () => props.value ?? "";
  const editable = () => props.mode === "edit";
  const [latex, setLatex] = createSignal(initialValue());
  const [showSource, setShowSource] = createSignal(Boolean(props.showSource));
  const [copied, setCopied] = createSignal(false);
  let copiedTimer: number | undefined;

  const viewState = createMemo(() =>
    formulaFieldState(props, latex(), copied(), showSource())
  );

  onMount(() => {
    if (!field) return;
    const handleInput = () => setLatex(field?.getValue("latex") ?? "");
    field.addEventListener("input", handleInput);
    syncMathField(field, editable(), props.placeholder ?? "", latex());
    onCleanup(() => field?.removeEventListener("input", handleInput));
  });

  createEffect(() => {
    setLatex(sanitizeLatex(initialValue()));
  });

  createEffect(() => {
    syncMathField(field, editable(), props.placeholder ?? "", latex());
  });

  const copyLatex = async () => {
    const value = latex().trim();
    if (!value) return;
    await navigator.clipboard.writeText(value);
    window.clearTimeout(copiedTimer);
    setCopied(true);
    copiedTimer = window.setTimeout(() => setCopied(false), 1400);
  };

  const resetLatex = () => {
    setLatex(sanitizeLatex(initialValue()));
  };

  const toggleSource = () => {
    setShowSource((value) => !value);
  };

  onCleanup(() => window.clearTimeout(copiedTimer));

  return (
    <div class="space-y-3 rounded-[1.35rem] border border-white/15 bg-white/6 p-4 shadow-[0_12px_32px_rgba(15,23,42,0.08)]">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="space-y-1">
          <Show when={viewState().header.showLabel}>
            <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
              {viewState().header.label}
            </p>
          </Show>
          <Show when={viewState().header.showTitle}>
            <h3 class="text-base font-semibold text-on-surface">{viewState().header.title}</h3>
          </Show>
          <Show when={viewState().header.showDescription}>
            <p class="max-w-2xl text-sm leading-6 text-on-surface-variant">
              {viewState().header.description}
            </p>
          </Show>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span
            class={`rounded-full px-2.5 py-1 text-[11px] font-medium ${viewState().toolbar.modeBadgeClass}`}
          >
            {viewState().toolbar.modeText}
          </span>
          <button
            type="button"
            class="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/10"
            onClick={() => void copyLatex()}
          >
            {viewState().toolbar.copyButtonText}
          </button>
          <Show when={viewState().toolbar.showReset}>
            <button
              type="button"
              class="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/10"
              onClick={resetLatex}
            >
              {RESET_BUTTON_TEXT}
            </button>
          </Show>
          <button
            type="button"
            class="rounded-full border border-white/20 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white/10"
            onClick={toggleSource}
          >
            {viewState().toolbar.sourceToggleText}
          </button>
        </div>
      </div>

      <math-field
        ref={(element) => {
          field = element as MathfieldElement;
        }}
        class="block min-h-[5.25rem] w-full rounded-[1.1rem] border border-white/18 bg-surface-container px-4 py-3 text-lg text-on-surface shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        style={{
          "font-size": "1.1rem",
          "--caret-color": "rgb(59 130 246)",
          "--primary-color": "rgb(59 130 246)",
          "--selection-background-color": "rgba(59,130,246,0.18)",
          "--contains-highlight-background-color": "rgba(59,130,246,0.08)",
        }}
      />

      <Show when={viewState().source.showHelperText}>
        <p class="text-xs leading-5 text-on-surface-variant">{viewState().source.helperText}</p>
      </Show>

      <Show when={viewState().source.showSource}>
        <div class="rounded-2xl border border-white/12 bg-black/25 px-3 py-3">
          <p class="font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/70">
            {LATEX_SOURCE_TITLE}
          </p>
          <pre class="mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-on-surface">
            {viewState().source.sourceText}
          </pre>
        </div>
      </Show>
    </div>
  );
}
