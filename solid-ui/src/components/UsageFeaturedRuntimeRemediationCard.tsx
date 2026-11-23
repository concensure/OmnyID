// @locs-version: 1.0
import { Show } from "solid-js";
import type { OperatorRuntimeRemediationReceipt } from "@/lib/api";

type FeaturedRuntimeRemediationAction = {
  kind: "show_queue" | "copy_command" | "clear_summary_pin";
  label: string;
};

type FeaturedRuntimeRemediationDraftAction = {
  kind: "complete_from_draft" | "show_drafts" | "clear_local_draft";
  label: string;
  tone: "success" | "info" | "neutral";
  disabled: boolean;
};

type FeaturedRuntimeRemediationCardModel = {
  receiptId: string | null;
  outcomeDraft: string;
  proofDraft: string;
  hasLocalDraft: boolean;
  canCompleteFromDraft: boolean;
  heading: string;
  sourceLabel: string;
  approvalLabel: string;
  localDraftBadgeLabel: string;
  receiptSectionTitle: string;
  lifecycleSectionTitle: string;
  completionSectionTitle: string;
  localDraftSectionTitle: string;
  proofLabelPrefix: string;
  draftActions: FeaturedRuntimeRemediationDraftAction[];
  actions: FeaturedRuntimeRemediationAction[];
};

export type UsageFeaturedRuntimeRemediationCardProps = {
  receipt: OperatorRuntimeRemediationReceipt;
  cardModel: FeaturedRuntimeRemediationCardModel;
  issuedAtLabel: string;
  lifecycleLabel: string;
  completedAtLabel: string | null | undefined;
  onAction: (actionKind: FeaturedRuntimeRemediationAction["kind"], receiptId: string | null) => void;
  onDraftAction: (actionKind: FeaturedRuntimeRemediationDraftAction["kind"], receiptId: string | null) => void;
};

function readDraftActionClassName(tone: FeaturedRuntimeRemediationDraftAction["tone"]): string {
  if (tone === "success") {
    return "border-emerald-300/60 bg-emerald-50/80 text-emerald-950 hover:bg-emerald-50";
  }
  if (tone === "info") {
    return "border-sky-300/60 bg-sky-50/80 text-sky-950 hover:bg-sky-50";
  }
  return "border-slate-300/60 bg-white/80 text-slate-900 hover:bg-white";
}

export default function UsageFeaturedRuntimeRemediationCard(props: UsageFeaturedRuntimeRemediationCardProps) {
  return (
    <div class="mt-4 rounded-2xl border border-sky-300/40 bg-sky-50/70 p-4 text-sm text-slate-900">
      <p class="font-semibold">{props.cardModel.heading}</p>
      <p class="mt-1 leading-6">{props.receipt.summary}</p>
      <Show when={props.cardModel.hasLocalDraft}>
        <div class="mt-2 inline-flex rounded-full border border-sky-300/50 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-sky-950">
          {props.cardModel.localDraftBadgeLabel}
        </div>
      </Show>
      <p class="mt-2 text-[11px] text-slate-600">
        {props.cardModel.sourceLabel}
      </p>
      <div class="mt-3 flex flex-wrap gap-2">
        {props.cardModel.actions.map((action) => (
          <button
            type="button"
            onClick={() => props.onAction(action.kind, props.cardModel.receiptId)}
            class="rounded-xl border border-sky-300/60 bg-white/80 px-3 py-1.5 text-xs font-medium text-sky-950 transition hover:bg-white"
          >
            {action.label}
          </button>
        ))}
      </div>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <div class="rounded-xl border border-white/60 bg-white/85 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{props.cardModel.receiptSectionTitle}</p>
          <p class="mt-1 font-mono text-[11px] text-slate-900">{props.receipt.receipt_id}</p>
          <p class="mt-1 text-[11px] text-slate-600">
            Issued {props.issuedAtLabel}
          </p>
        </div>
        <div class="rounded-xl border border-white/60 bg-white/85 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{props.cardModel.lifecycleSectionTitle}</p>
          <p class="mt-1 text-sm text-slate-900">
            {props.lifecycleLabel}
          </p>
          <p class="mt-1 text-[11px] text-slate-600">
            {props.cardModel.approvalLabel}
          </p>
        </div>
      </div>
      <Show when={props.receipt.completed_at || props.receipt.outcome_note || props.receipt.proof_reference}>
        <div class="mt-3 rounded-xl border border-white/60 bg-white/85 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{props.cardModel.completionSectionTitle}</p>
          <Show when={props.completedAtLabel}>
            {(completedAtLabel) => (
              <p class="mt-1 text-[11px] text-slate-600">
                Completed {completedAtLabel()}
              </p>
            )}
          </Show>
          <Show when={props.receipt.outcome_note}>
            <p class="mt-1 text-sm text-slate-900">{props.receipt.outcome_note}</p>
          </Show>
          <Show when={props.receipt.proof_reference}>
            <p class="mt-1 text-[11px] text-slate-600">
              {props.cardModel.proofLabelPrefix} {props.receipt.proof_reference}
            </p>
          </Show>
        </div>
      </Show>
      <Show when={props.cardModel.hasLocalDraft}>
        <div class="mt-3 rounded-xl border border-sky-200/70 bg-white/85 p-3">
          <p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{props.cardModel.localDraftSectionTitle}</p>
          <Show when={props.cardModel.outcomeDraft}>
            <p class="mt-1 text-sm text-slate-900">{props.cardModel.outcomeDraft}</p>
          </Show>
          <Show when={props.cardModel.proofDraft}>
            <p class="mt-1 text-[11px] text-slate-600">{props.cardModel.proofLabelPrefix} {props.cardModel.proofDraft}</p>
          </Show>
          <div class="mt-3 flex flex-wrap gap-2">
            {props.cardModel.draftActions.map((action) => (
              <button
                type="button"
                onClick={() => props.onDraftAction(action.kind, props.cardModel.receiptId)}
                disabled={action.disabled}
                class={`rounded-xl border px-3 py-1.5 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${readDraftActionClassName(action.tone)}`}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      </Show>
      <pre class="mt-3 overflow-x-auto rounded-xl bg-slate-950 px-3 py-2 font-mono text-[11px] text-slate-50">
        {props.receipt.command}
      </pre>
    </div>
  );
}
