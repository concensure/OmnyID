// @locs-version: 2.1
import { For, Show } from "solid-js";

import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import { weddingImportNextActionTarget } from "@/lib/weddingImportNextActionState";

export function WeddingAdvancedAuditPanels(props: {
  state: WeddingResponseWorkspaceViewState;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
}) {
  return (
    <>
      <div class="min-w-0 rounded-[24px] border border-teal-100/80 bg-teal-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
        <div class="flex items-start justify-between gap-2">
          <p class="text-base font-semibold text-teal-950">Import check</p>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-teal-900">
            {props.state.importParserReadiness.statusLabel}
          </span>
        </div>
        <p class="mt-2 text-sm leading-6 text-teal-900/75">
          {props.state.importParserReadiness.summaryLabel}
        </p>
        <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <For each={[
            ["Ready", props.state.importParserReadiness.synthesizedCount],
            ["Review", props.state.importParserReadiness.reviewNeededCount],
            ["Needs help", props.state.importParserReadiness.parserNeededCount],
            ["Saved", props.state.importParserReadiness.originalUploadSavedCount],
            ["Follow-up", props.state.importParserReadiness.parserJobReadyCount],
          ] as const}>
            {([label, count]) => (
              <div class="rounded-2xl border border-teal-100 bg-white/75 px-2.5 py-2">
                <p class="text-xs font-semibold text-teal-950/60">{label}</p>
                <p class="mt-1 text-xs font-semibold text-teal-950">{count}</p>
              </div>
            )}
          </For>
        </div>
        <Show when={props.state.importParserReadiness.blockerLabels.length > 0} fallback={
          <ul class="mt-3 space-y-1">
            <For each={props.state.importParserReadiness.readyLabels.slice(0, 4)}>
              {(label) => <li class="text-xs leading-5 text-teal-950/70">{label}</li>}
            </For>
          </ul>
        }>
          <ul class="mt-3 space-y-1">
            <For each={props.state.importParserReadiness.blockerLabels}>
              {(label) => <li class="text-xs leading-5 text-teal-950/75">{label}</li>}
            </For>
          </ul>
        </Show>
        <div class="mt-3 rounded-2xl border border-teal-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-teal-950/60">Next step</p>
          <ul class="mt-2 space-y-1">
            <For each={props.state.importParserReadiness.nextActionLabels.slice(0, 3)}>
              {(label) => (
                <li>
                  <button
                    type="button"
                    class="group w-full rounded-xl border border-teal-100 bg-teal-50/70 px-2.5 py-2 text-left text-xs leading-5 text-teal-950/75 transition hover:bg-white"
                    onClick={() => props.onSelectMenu?.(weddingImportNextActionTarget(label).menuId)}
                  >
                    <span class="block font-semibold">{label}</span>
                    <span class="mt-0.5 block text-[10px] font-semibold text-teal-800/70 group-hover:text-teal-900">
                      {weddingImportNextActionTarget(label).actionLabel}
                    </span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </div>

      <Show when={props.state.providerHandoffAuditCard}>
        {(card) => (
          <div class="min-w-0 rounded-[24px] border border-orange-100/80 bg-orange-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
            <div class="flex items-start justify-between gap-2">
              <p class="break-words text-sm font-semibold text-orange-950">Connected apps for sending</p>
              <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold text-orange-900">
                {card().statusLabel}
              </span>
            </div>
            <p class="mt-2 text-[11px] leading-5 text-orange-900/75">{card().detailLabel}</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <For each={card().metadataLabels}>
                {(label) => (
                  <span class="max-w-full break-words rounded-full border border-orange-100 bg-white/75 px-2 py-1 text-[10px] text-orange-900/80">
                    {label}
                  </span>
                )}
              </For>
            </div>
            <Show when={card().pendingReceiptTitles.length > 0}>
              <ul class="mt-2 space-y-1">
                <For each={card().pendingReceiptTitles}>
                  {(title) => <li class="text-[10px] leading-4 text-orange-950/70">Pending: {title}</li>}
                </For>
              </ul>
            </Show>
            <button
              type="button"
              disabled={!card().action.enabled}
              class="mt-3 w-full rounded-full border border-orange-200 bg-white/75 px-3 py-2 text-[11px] font-semibold text-orange-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:py-1.5"
              onClick={() => props.onSidebarAction(card().action)}
            >
              {card().action.label}
            </button>
          </div>
        )}
      </Show>

      <div class="min-w-0 rounded-[24px] border border-cyan-100/80 bg-cyan-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
        <div class="flex items-start justify-between gap-2">
          <p class="break-words text-sm font-semibold text-cyan-950">{props.state.expectedBehaviorAuditCard.title}</p>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold text-cyan-900">
            {props.state.expectedBehaviorAuditCard.statusLabel}
          </span>
        </div>
        <p class="mt-2 text-[11px] leading-5 text-cyan-900/75">
          {props.state.expectedBehaviorAuditCard.detailLabel}
        </p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <span class="max-w-full break-words rounded-full border border-cyan-100 bg-white/75 px-2 py-1 text-[10px] font-semibold text-cyan-950">
            {props.state.expectedBehaviorAuditCard.readyCountLabel}
          </span>
          <span class="max-w-full break-words rounded-full border border-cyan-100 bg-white/75 px-2 py-1 text-[10px] font-semibold text-cyan-950">
            {props.state.expectedBehaviorAuditCard.blockerCountLabel}
          </span>
          <For each={props.state.expectedBehaviorAuditCard.metadataLabels}>
            {(label) => (
              <span class="max-w-full break-words rounded-full border border-cyan-100 bg-white/75 px-2 py-1 text-[10px] text-cyan-900/80">
                {label}
              </span>
            )}
          </For>
        </div>
        <Show when={props.state.expectedBehaviorAuditCard.blockedItems.length > 0}>
          <ul class="mt-3 space-y-1">
            <For each={props.state.expectedBehaviorAuditCard.blockedItems.slice(0, 5)}>
              {(item) => <li class="text-[10px] leading-4 text-cyan-950/70">{item.userFacingLabel}</li>}
            </For>
          </ul>
        </Show>
        <Show when={props.state.expectedBehaviorAuditCard.suggestedTaskItems.length > 0}>
          <div class="mt-3 space-y-1 rounded-2xl border border-cyan-100 bg-white/70 p-2">
            <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-950/70">Suggested tasks</p>
            <For each={props.state.expectedBehaviorAuditCard.suggestedTaskItems.slice(0, 3)}>
              {(task) => <p class="text-[10px] leading-4 text-cyan-950/75">{task.title} - {task.dueLabel}</p>}
            </For>
          </div>
        </Show>
        <button
          type="button"
          disabled={!props.state.expectedBehaviorAuditCard.action.enabled}
          class="mt-3 w-full rounded-full border border-cyan-200 bg-white/75 px-3 py-2 text-[11px] font-semibold text-cyan-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:py-1.5"
          onClick={() => props.onSidebarAction(props.state.expectedBehaviorAuditCard.action)}
        >
          {props.state.expectedBehaviorAuditCard.action.label}
        </button>
      </div>

      <Show when={props.state.approvalReceiptCards.length > 0}>
        <div class="min-w-0 rounded-[24px] border border-amber-100/80 bg-amber-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
          <p class="text-sm font-semibold text-amber-950">Approval history</p>
          <div class="mt-3 space-y-2">
            <For each={props.state.approvalReceiptCards}>
              {(card) => (
                <article class="rounded-2xl border border-amber-100 bg-white/75 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <p class="break-words text-xs font-semibold text-amber-950">{card.title}</p>
                    <span class="max-w-full break-words rounded-full bg-amber-50 px-2 py-1 text-[10px] font-medium text-amber-900">
                      {card.statusLabel}
                    </span>
                  </div>
                  <p class="mt-2 text-[11px] leading-5 text-amber-900/75">{card.detailLabel}</p>
                  <Show when={card.blockLabel}>
                    {(label) => (
                      <span class="mt-2 inline-flex max-w-full break-words rounded-full border border-amber-100 bg-amber-50/80 px-2 py-1 text-[10px] font-semibold text-amber-950">
                        {label()}
                      </span>
                    )}
                  </Show>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={card.metadataLabels.slice(0, 4)}>
                      {(label) => (
                        <span class="max-w-full break-words rounded-full border border-amber-100 bg-amber-50/70 px-2 py-1 text-[10px] text-amber-900/80">
                          {label}
                        </span>
                      )}
                    </For>
                  </div>
                  <Show when={card.riskLabels.length > 0}>
                    <div class="mt-2 space-y-1">
                      <For each={card.riskLabels}>
                        {(risk) => <p class="text-[10px] leading-4 text-amber-950/65">{risk}</p>}
                      </For>
                    </div>
                  </Show>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={props.state.decisionRecordCards.length > 0}>
        <div class="min-w-0 rounded-[24px] border border-sky-100/80 bg-sky-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
          <p class="text-sm font-semibold text-sky-950">Choices you've locked in</p>
          <p class="mt-1 text-xs leading-5 text-sky-900/75">
            OmnyID will use these selected options first when it writes follow-up plans.
          </p>
          <div class="mt-3 space-y-2">
            <For each={props.state.decisionRecordCards}>
              {(card) => (
                <article class="rounded-2xl border border-sky-100 bg-white/75 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <p class="break-words text-xs font-semibold text-sky-950">{card.title}</p>
                    <span class="max-w-full break-words rounded-full bg-sky-50 px-2 py-1 text-[10px] font-medium text-sky-900">
                      {card.statusLabel}
                    </span>
                  </div>
                  <p class="mt-1 text-[11px] leading-5 text-sky-900/75">{card.detailLabel}</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={card.metadataLabels}>
                      {(label) => (
                        <span class="max-w-full break-words rounded-full border border-sky-100 bg-sky-50/70 px-2 py-1 text-[10px] text-sky-900/80">
                          {label}
                        </span>
                      )}
                    </For>
                  </div>
                  <Show when={card.evidenceLabels.length > 0}>
                    <ul class="mt-2 space-y-1">
                      <For each={card.evidenceLabels}>
                        {(label) => <li class="text-[10px] leading-4 text-sky-950/65">{label}</li>}
                      </For>
                    </ul>
                  </Show>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={props.state.secondOrderLoopCards.length > 0}>
        <div class="min-w-0 rounded-[24px] border border-emerald-100/80 bg-emerald-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
          <p class="text-sm font-semibold text-emerald-950">Follow-ups we can handle</p>
          <p class="mt-1 text-xs leading-5 text-emerald-900/75">
            Suggested follow-ups for weather, legal, vendors, guests, logistics, and budget.
          </p>
          <div class="mt-3 space-y-2">
            <For each={props.state.secondOrderLoopCards}>
              {(card) => (
                <article class="rounded-2xl border border-emerald-100 bg-white/75 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <p class="break-words text-xs font-semibold text-emerald-950">{card.title}</p>
                    <span class="max-w-full break-words rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-900">
                      {card.statusLabel}
                    </span>
                  </div>
                  <p class="mt-1 text-[11px] leading-5 text-emerald-900/75">{card.detailLabel}</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={card.evidenceLabels}>
                      {(label) => (
                        <span class="max-w-full break-words rounded-full border border-emerald-100 bg-emerald-50/70 px-2 py-1 text-[10px] text-emerald-900/80">
                          {label}
                        </span>
                      )}
                    </For>
                  </div>
                  <p class="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-2.5 py-2 text-[11px] leading-5 text-emerald-950/80">
                    Next: {card.nextActionLabel}
                  </p>
                  <Show when={card.suggestedTask}>
                    {(task) => (
                      <p class="mt-2 rounded-xl border border-emerald-200 bg-white/80 px-2.5 py-2 text-[10px] leading-4 text-emerald-950/75">
                        Suggested task: {task().title} - {task().dueLabel}
                      </p>
                    )}
                  </Show>
                  <button
                    type="button"
                    disabled={!card.action.enabled}
                    class="mt-3 w-full rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:py-1.5"
                    onClick={() => props.onSidebarAction(card.action)}
                  >
                    {card.action.label}
                  </button>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={props.state.recommendationCards.length > 0}>
        <div class="min-w-0 rounded-[24px] border border-violet-100/80 bg-violet-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
          <p class="text-sm font-semibold text-violet-950">Suggested connections</p>
          <div class="mt-3 space-y-2">
            <For each={props.state.recommendationCards}>
              {(card) => (
                <article class="rounded-2xl border border-violet-100 bg-white/75 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <p class="break-words text-xs font-semibold text-violet-950">{card.title}</p>
                    <span class="max-w-full break-words rounded-full bg-violet-50 px-2 py-1 text-[10px] font-medium text-violet-900">
                      {card.kind.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p class="mt-1 text-[11px] leading-5 text-violet-900/75">{card.body}</p>
                  <p class="mt-2 text-[10px] leading-4 text-violet-950/70">{card.evidenceLabel}</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={card.graphContextLabels}>
                      {(label) => (
                        <span class="max-w-full break-words rounded-full border border-violet-100 bg-violet-50/70 px-2 py-1 text-[10px] text-violet-900/80">
                          {label}
                        </span>
                      )}
                    </For>
                  </div>
                  <button
                    type="button"
                    class="mt-3 w-full rounded-full border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-semibold text-violet-950 transition hover:bg-violet-100 sm:w-auto sm:py-1.5"
                    onClick={() => props.onSidebarAction(card.graphAction)}
                  >
                    {card.graphAction.label}
                  </button>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>
    </>
  );
}
