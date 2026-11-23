// @locs-version: 1.0
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { AfpMessage, AfpView, PlanAssumption, PlanOption } from "@/lib/api";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { recordShortcutUse } from "@/lib/shortcutRecency";

const COPY_BUTTON_IDLE_TEXT = "Copy";
const COPY_BUTTON_DONE_TEXT = "Copied";
const HEADER_SEPARATOR = "·";
const RISK_FLAG_PREFIX = "!";
const UNRESOLVED_ANSWER_LABEL = "Answer";

const CONFIDENCE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  high: { bg: "bg-green-500/15", text: "text-green-600", label: "High confidence" },
  medium: { bg: "bg-yellow-400/15", text: "text-yellow-600", label: "Medium confidence" },
  low: { bg: "bg-slate-400/15", text: "text-slate-500", label: "Low confidence" },
};

function planningString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function planningStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function planOptionItems(value: unknown): PlanOption[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is PlanOption => {
      const record = afpRecord(entry);
      return typeof record.id === "string" && typeof record.title === "string";
    })
    : [];
}

function planAssumptionItems(value: unknown): PlanAssumption[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is PlanAssumption => {
      const record = afpRecord(entry);
      return typeof record.key === "string" && typeof record.label === "string";
    })
    : [];
}

function comparisonRowItems(value: unknown): Array<{ label: string; values: string[] }> {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
      const record = afpRecord(entry);
      const label = planningString(record.label);
      const values = planningStringArray(record.values);
      return label ? [{ label, values }] : [];
    })
    : [];
}

function ConfidenceBadge(props: { level: string }) {
  const style = () => CONFIDENCE_STYLES[props.level] ?? CONFIDENCE_STYLES.medium;
  return (
    <span
      class={`max-w-full rounded-full border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.15em] break-words ${style().bg} ${style().text}`}
    >
      {style().label}
    </span>
  );
}

function CopyButton(props: { text: string }) {
  const [copied, setCopied] = createSignal(false);
  const buttonState = createMemo(() => ({
    copied: copied(),
    label: copied() ? COPY_BUTTON_DONE_TEXT : COPY_BUTTON_IDLE_TEXT,
    labelClass: copied() ? "text-green-600" : "",
  }));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore clipboard errors in non-secure contexts */
    }
  };

  return (
    <button
      type="button"
      title="Copy to clipboard"
      onClick={handleCopy}
      class="flex min-w-0 items-center gap-1 rounded-lg bg-white/20 px-2 py-1 text-[10px] text-on-surface-variant transition hover:bg-white/40 hover:text-on-surface"
    >
      <span class={buttonState().labelClass}>{buttonState().label}</span>
    </button>
  );
}

function OptionCard(props: {
  option: PlanOption;
  rank: number;
  onChipClick?: (chip: string) => void;
}) {
  const optionState = createMemo(() => {
    const option = props.option;
    const metricText =
      option.metric_label && option.metric_value
        ? `${option.metric_label}: ${option.metric_value}`
        : null;
    return {
      option,
      metricText,
      showMetric: Boolean(metricText),
      showRiskFlags: option.risk_flags.length > 0,
      followUpChips: option.follow_up_chips ?? [],
      showFollowUpChips: (option.follow_up_chips ?? []).length > 0,
    };
  });

  const copyText = () => {
    const option = optionState().option;
    let text = `${option.title}\n${option.description}\n\nWhy: ${option.rationale}`;
    if (option.metric_label && option.metric_value) {
      text += `\n${option.metric_label}: ${option.metric_value}`;
    }
    if (option.risk_flags.length > 0) {
      text += `\nRisks: ${option.risk_flags.join(", ")}`;
    }
    return text;
  };

  return (
    <div class="glass-card relative rounded-2xl border border-white/30 bg-white/25 p-4 shadow-sm">
      <div class="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span
            class={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              props.rank === 1 ? "bg-primary text-white" : "bg-white/40 text-on-surface-variant"
            }`}
          >
            {props.rank}
          </span>
          <h4 class="min-w-0 break-words text-sm font-semibold leading-5 text-on-surface">
            {optionState().option.title}
          </h4>
        </div>
        <CopyButton text={copyText()} />
      </div>

      <p class="mb-3 break-words text-xs leading-5 text-on-surface-variant">
        {optionState().option.description}
      </p>

      <div class="mb-3 flex flex-wrap items-center gap-2">
        <Show when={optionState().showMetric}>
          <span class="max-w-full rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary break-words">
            {optionState().metricText}
          </span>
        </Show>
        <ConfidenceBadge level={optionState().option.confidence ?? "medium"} />
      </div>

      <p class="mb-3 break-words text-xs leading-5 text-on-surface">
        {optionState().option.rationale}
      </p>

      <Show when={optionState().showRiskFlags}>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <For each={optionState().option.risk_flags}>
            {(flag) => (
              <span class="max-w-full rounded-full bg-red-500/10 px-2 py-1 text-[10px] text-red-600 break-words">
                {RISK_FLAG_PREFIX} {flag}
              </span>
            )}
          </For>
        </div>
      </Show>

      <Show when={optionState().showFollowUpChips}>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <For each={optionState().followUpChips}>
            {(chip) => (
              <button
                type="button"
                class="glass-button max-w-full rounded-full border border-white/40 bg-white/20 px-3 py-1 text-[11px] text-on-surface-variant transition hover:bg-white/40 hover:text-on-surface break-words"
                onClick={() => props.onChipClick?.(chip)}
              >
                {chip}
              </button>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

function AssumptionsStrip(props: {
  assumptions: PlanAssumption[];
  onChangeAssumption?: (key: string, newValue: string) => void;
}) {
  const [savedKey, setSavedKey] = createSignal<string | null>(null);
  const stripState = createMemo(() => ({
    assumptions: props.assumptions,
    showEditableInputs: Boolean(props.onChangeAssumption),
    savedKey: savedKey(),
  }));

  function submitChange(key: string, newValue: string, previousValue: string) {
    if (!newValue || newValue === previousValue || !props.onChangeAssumption) return;
    props.onChangeAssumption(key, newValue);
    setSavedKey(key);
    const timeoutId = setTimeout(() => setSavedKey((current) => (current === key ? null : current)), 1500);
    createEffect(() => onCleanup(() => clearTimeout(timeoutId)));
  }

  return (
    <div class="rounded-xl border border-white/30 bg-white/10 px-4 py-3">
      <p class="mb-2 font-mono text-[9px] uppercase tracking-[0.18em] text-outline">
        Assumptions
      </p>
      <div class="flex flex-wrap gap-x-5 gap-y-1.5">
        <For each={stripState().assumptions}>
          {(assumption) => (
            <div class="flex min-w-0 flex-wrap items-center gap-1.5">
              <span class="break-words text-[11px] text-on-surface-variant">{assumption.label}:</span>
              <Show
                when={assumption.editable && stripState().showEditableInputs}
                fallback={
                  <span class="min-w-0 break-words text-[11px] font-medium text-on-surface">{assumption.value}</span>
                }
              >
                <input
                  type="text"
                  value={assumption.value}
                  onBlur={(event) => {
                    submitChange(
                      assumption.key,
                      (event.target as HTMLInputElement).value.trim(),
                      assumption.value,
                    );
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      recordShortcutUse("form_submit");
                      submitChange(
                        assumption.key,
                        (event.currentTarget as HTMLInputElement).value.trim(),
                        assumption.value,
                      );
                      (event.currentTarget as HTMLInputElement).blur();
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      recordShortcutUse("form_cancel");
                      (event.currentTarget as HTMLInputElement).value = assumption.value;
                      (event.currentTarget as HTMLInputElement).blur();
                    }
                  }}
                  class={`min-w-0 flex-1 rounded border bg-white/20 px-1.5 py-1 text-[11px] font-medium text-on-surface outline-none transition focus:bg-white/30 sm:flex-none sm:min-w-[5rem] ${
                    stripState().savedKey === assumption.key
                      ? "border-green-500/50 focus:border-green-500/50"
                      : "border-white/30 focus:border-primary/50"
                  }`}
                />
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

function ComparisonTable(props: {
  headers: string[];
  rows: Array<{ label: string; values: string[] }>;
}) {
  return (
    <div class="overflow-x-auto rounded-xl border border-white/25 bg-white/10">
      <table class="min-w-full text-[11px]">
        <thead>
          <tr class="border-b border-white/20">
            <th class="px-3 py-2 text-left font-mono uppercase tracking-[0.12em] text-outline" />
            <For each={props.headers}>
              {(header) => (
                <th class="px-3 py-2 text-left font-mono uppercase tracking-[0.12em] text-outline">
                  {header}
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody>
          <For each={props.rows}>
            {(row) => (
              <tr class="border-b border-white/10 last:border-0">
                <td class="px-3 py-2 font-medium text-on-surface break-words">{row.label}</td>
                <For each={row.values}>
                  {(value) => (
                    <td class="px-3 py-2 text-on-surface-variant break-words">{value}</td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

export function PlanningCardRenderer(props: {
  message: AfpMessage;
  view?: AfpView;
  onFollowUp?: (text: string) => void;
  onAssumptionChange?: (key: string, value: string) => void;
  onPrefillQuery?: (text: string) => void;
}) {
  const content = () => afpRecord(decryptedDisplayContent(props.message));
  const rendererState = createMemo(() => {
    const planningContent = content();
    const summary = planningString(planningContent.summary);
    const goal = planningString(planningContent.goal);
    const options = planOptionItems(planningContent.options);
    const assumptions = planAssumptionItems(planningContent.assumptions);
    const comparisonHeaders = planningStringArray(planningContent.comparison_headers);
    const comparisonRows = comparisonRowItems(planningContent.comparison_rows);
    const unresolvedQuestions = planningStringArray(planningContent.unresolved);

    return {
      summary,
      goal,
      options,
      assumptions,
      comparisonHeaders,
      comparisonRows,
      unresolvedQuestions,
      optionCountLabel: `${options.length} option${options.length !== 1 ? "s" : ""}`,
      showSummary: Boolean(summary),
      showAssumptions: assumptions.length > 0,
      showComparison: comparisonHeaders.length > 0 && comparisonRows.length > 0,
      showUnresolved: unresolvedQuestions.length > 0,
      showPrefillAction: Boolean(props.onPrefillQuery),
    };
  });

  const handleChip = (chip: string) => props.onFollowUp?.(chip);
  const handleAssumptionChange = (key: string, value: string) => {
    props.onAssumptionChange?.(key, value);
  };

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="break-words font-mono text-[9px] uppercase tracking-[0.2em] text-outline">
            Plan {HEADER_SEPARATOR} {rendererState().goal}
          </p>
          <Show when={rendererState().showSummary}>
            <p class="mt-1 break-words text-sm font-medium leading-5 text-on-surface">
              {rendererState().summary}
            </p>
          </Show>
        </div>
        <span class="max-w-full rounded-full bg-primary/15 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-primary break-words">
          {rendererState().optionCountLabel}
        </span>
      </div>

      <Show when={rendererState().showAssumptions}>
        <AssumptionsStrip
          assumptions={rendererState().assumptions}
          onChangeAssumption={handleAssumptionChange}
        />
      </Show>

      <div class="space-y-3">
        <For each={rendererState().options}>
          {(option, idx) => (
            <OptionCard
              option={option}
              rank={idx() + 1}
              onChipClick={handleChip}
            />
          )}
        </For>
      </div>

      <Show when={rendererState().showComparison}>
        <div>
          <p class="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-outline">
            Compare options
          </p>
          <ComparisonTable
            headers={rendererState().comparisonHeaders}
            rows={rendererState().comparisonRows}
          />
        </div>
      </Show>

      <Show when={rendererState().showUnresolved}>
        <div class="rounded-xl border border-yellow-400/30 bg-yellow-400/8 p-3">
          <p class="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-yellow-600">
            Needs clarification
          </p>
          <ul class="space-y-1">
            <For each={rendererState().unresolvedQuestions}>
              {(question) => (
                <li class="flex min-w-0 flex-wrap items-start gap-2 text-xs text-on-surface-variant">
                  <span class="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-yellow-500" />
                  <span class="min-w-0 flex-1 break-words">{question}</span>
                  <Show when={rendererState().showPrefillAction}>
                    <button
                      type="button"
                      onClick={() => props.onPrefillQuery?.(question)}
                      class="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2 py-1 text-[10px] text-yellow-600 transition hover:bg-yellow-400/20"
                    >
                      {UNRESOLVED_ANSWER_LABEL}
                    </button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </div>
  );
}
