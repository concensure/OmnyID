// @locs-version: 1.0
import { Show } from "solid-js";
import type { OperatorRuntimeRemediationReceipt } from "@/lib/api";

type RuntimeRemediationBadge = {
  label: string;
  tone: "featured" | "latest" | "draft";
};

type RuntimeRemediationAction = {
  kind: "pin_summary" | "copy_command";
  label: string;
  tone: "featured" | "neutral";
};

type RuntimeRemediationCompletionForm = {
  title: string;
  outcomePlaceholder: string;
  proofPlaceholder: string;
  submitLabel: string;
  submitDisabled: boolean;
  showClearDraft: boolean;
  clearDraftLabel: string;
};

type RuntimeRemediationRowModel = {
  badges: RuntimeRemediationBadge[];
  actions: RuntimeRemediationAction[];
  completionForm: RuntimeRemediationCompletionForm;
};

export type UsageRuntimeRemediationRowProps = {
  entry: OperatorRuntimeRemediationReceipt;
  rowModel: RuntimeRemediationRowModel;
  receiptMetaLine: string;
  executionModeLabel: string;
  artifactSummaryLine: string | null;
  pressureLine: string | null;
  completedAtLabel: string | null;
  outcomeNoteDraft: string;
  proofReferenceDraft: string;
  onPinSummary: (receiptId: string) => void;
  onCopyCommand: (command: string) => void;
  onOutcomeDraftChange: (receiptId: string, value: string) => void;
  onProofDraftChange: (receiptId: string, value: string) => void;
  onCompleteReceipt: (receiptId: string) => void;
  onClearDraft: (receiptId: string) => void;
};

function readBadgeClassName(tone: RuntimeRemediationBadge["tone"]): string {
  if (tone === "featured") {
    return "border border-indigo-300/50 bg-indigo-50 text-indigo-900";
  }
  if (tone === "latest") {
    return "border border-amber-300/50 bg-amber-50 text-amber-900";
  }
  return "border border-sky-300/50 bg-sky-50 text-sky-900";
}

function readLifecycleClassName(lifecycleStatus: string): string {
  return lifecycleStatus === "completed"
    ? "border border-emerald-300/50 bg-emerald-50 text-emerald-900"
    : "border border-amber-300/50 bg-amber-50 text-amber-900";
}

function readActionClassName(tone: RuntimeRemediationAction["tone"]): string {
  return tone === "featured"
    ? "border-sky-300/60 bg-sky-50/80 text-sky-950"
    : "border-slate-300/60 bg-white/80 text-slate-900 hover:bg-white";
}

export default function UsageRuntimeRemediationRow(props: UsageRuntimeRemediationRowProps) {
  return (
    <div class="rounded-xl border border-white/60 bg-white/90 p-3">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-medium text-slate-900">{props.entry.summary}</p>
            {props.rowModel.badges.map((badge) => (
              <span class={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${readBadgeClassName(badge.tone)}`}>
                {badge.label}
              </span>
            ))}
          </div>
          <p class="mt-1 text-[11px] text-slate-600">
            {props.receiptMetaLine}
          </p>
        </div>
        <div class="text-right">
          <span class={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${readLifecycleClassName(props.entry.lifecycle_status)}`}>
            {props.entry.lifecycle_status}
          </span>
          <p class="font-mono text-[11px] text-slate-900">{props.entry.receipt_id}</p>
          <p class="mt-1 text-[11px] text-slate-600">
            {props.executionModeLabel}
          </p>
        </div>
      </div>

      <Show when={props.artifactSummaryLine}>
        {(artifactSummaryLine) => (
          <p class="mt-2 text-[11px] leading-5 text-slate-600">
            {artifactSummaryLine()}
          </p>
        )}
      </Show>

      <Show when={props.pressureLine}>
        {(pressureLine) => (
          <p class="mt-2 text-[11px] text-slate-600">
            {pressureLine()}
          </p>
        )}
      </Show>

      <Show when={props.entry.note}>
        <p class="mt-2 text-xs text-slate-700">Note: {props.entry.note}</p>
      </Show>

      <Show when={props.entry.completed_at || props.entry.outcome_note || props.entry.proof_reference}>
        <div class="mt-2 rounded-lg border border-emerald-200/70 bg-emerald-50/70 px-3 py-2">
          <Show when={props.completedAtLabel}>
            {(completedAtLabel) => (
              <p class="text-[11px] text-emerald-900/80">
                Completed {completedAtLabel()}
              </p>
            )}
          </Show>
          <Show when={props.entry.outcome_note}>
            <p class="mt-1 text-xs text-emerald-950">{props.entry.outcome_note}</p>
          </Show>
          <Show when={props.entry.proof_reference}>
            <p class="mt-1 text-[11px] text-emerald-900/80">Proof: {props.entry.proof_reference}</p>
          </Show>
        </div>
      </Show>

      <div class="mt-3 flex flex-wrap gap-2">
        {props.rowModel.actions.map((action) => (
          <button
            type="button"
            onClick={() => {
              if (action.kind === "pin_summary") {
                props.onPinSummary(props.entry.receipt_id);
                return;
              }
              props.onCopyCommand(props.entry.command);
            }}
            class={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${readActionClassName(action.tone)}`}
          >
            {action.label}
          </button>
        ))}
        <Show when={props.entry.lifecycle_status !== "completed"}>
          <div class="w-full rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3">
            <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-900">
              {props.rowModel.completionForm.title}
            </p>
            <textarea
              value={props.outcomeNoteDraft}
              onInput={(event) => props.onOutcomeDraftChange(props.entry.receipt_id, event.currentTarget.value)}
              rows={3}
              placeholder={props.rowModel.completionForm.outcomePlaceholder}
              class="mt-2 min-h-[84px] w-full rounded-xl border border-emerald-200 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
            />
            <input
              type="text"
              value={props.proofReferenceDraft}
              onInput={(event) => props.onProofDraftChange(props.entry.receipt_id, event.currentTarget.value)}
              placeholder={props.rowModel.completionForm.proofPlaceholder}
              class="mt-2 w-full rounded-xl border border-emerald-200 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-emerald-400"
            />
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => props.onCompleteReceipt(props.entry.receipt_id)}
                disabled={props.rowModel.completionForm.submitDisabled}
                class="rounded-xl border border-emerald-300/60 bg-emerald-50/80 px-3 py-1.5 text-xs font-medium text-emerald-950 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {props.rowModel.completionForm.submitLabel}
              </button>
              <Show when={props.rowModel.completionForm.showClearDraft}>
                <button
                  type="button"
                  onClick={() => props.onClearDraft(props.entry.receipt_id)}
                  class="rounded-xl border border-slate-300/60 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-900 transition hover:bg-white"
                >
                  {props.rowModel.completionForm.clearDraftLabel}
                </button>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}
