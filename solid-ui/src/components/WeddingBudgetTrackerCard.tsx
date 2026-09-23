// @locs-version: 2.1
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { weddingDecisionProjectionToAfpSendInput } from "@/lib/weddingDecisionAfpProjectionState";
import type { WeddingBudgetTrackingState } from "@/lib/weddingBudgetTrackingState";
import {
  WEDDING_BUDGET_CATEGORIES,
  buildWeddingBudgetAllocationSaveState,
  buildWeddingBudgetAllocationProjectionInput,
  emptyWeddingBudgetAllocationDraft,
  loadWeddingBudgetAllocationDraft,
  saveWeddingBudgetAllocationDraft,
  weddingBudgetAllocationAllocatedAmount,
  weddingBudgetAllocationIsBalanced,
  weddingBudgetAllocationRemaining,
  withWeddingBudgetAutoBalance,
  type WeddingBudgetAllocationDraft,
  type WeddingBudgetCategoryId,
} from "@/lib/weddingBudgetAllocationState";

function moneyLabel(amount: number, currency: string): string {
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

function draftFromTrackingState(state: WeddingBudgetTrackingState, fallbackCurrency: string): WeddingBudgetAllocationDraft {
  const draft = emptyWeddingBudgetAllocationDraft(fallbackCurrency);
  if (state.budgetAllocation.length === 0) return draft;
  draft.totalAmount = state.budgetAllocation.reduce((sum, category) => sum + category.amount, 0);
  for (const category of state.budgetAllocation) {
    draft.categoryAmounts[category.categoryId] = category.amount;
  }
  return draft;
}

function budgetAllocationSignature(state: WeddingBudgetTrackingState): string {
  return state.budgetAllocation.map((category) => `${category.categoryId}:${category.amount}`).join("|");
}

export function WeddingBudgetTrackerCard(props: {
  state: WeddingBudgetTrackingState;
  weddingPlanId?: string | null;
  metadata?: unknown;
  onSaveAllocation?: (input: SendAfpMessageInput) => Promise<unknown>;
}) {
  const currency = props.state.lineItems[0]?.currency ?? "AUD";
  const [draft, setDraft] = createSignal<WeddingBudgetAllocationDraft>(
    // Prefer what's already saved; otherwise resume an unsaved draft on this browser; otherwise start blank.
    props.state.budgetAllocation.length > 0
      ? draftFromTrackingState(props.state, currency)
      : (props.weddingPlanId ? loadWeddingBudgetAllocationDraft(props.weddingPlanId) : null) ?? emptyWeddingBudgetAllocationDraft(currency),
  );
  const [saving, setSaving] = createSignal(false);
  const [saveNotice, setSaveNotice] = createSignal<string | null>(null);
  const [lastSyncedAllocationSignature, setLastSyncedAllocationSignature] = createSignal(budgetAllocationSignature(props.state));
  const allocated = createMemo(() => weddingBudgetAllocationAllocatedAmount(draft()));
  const remaining = createMemo(() => weddingBudgetAllocationRemaining(draft()));
  const balanced = createMemo(() => weddingBudgetAllocationIsBalanced(draft()));
  const saveState = createMemo(() => buildWeddingBudgetAllocationSaveState({
    draft: draft(),
    saving: saving(),
    saveAvailable: Boolean(props.onSaveAllocation),
  }));
  const helperNotice = createMemo(() => {
    if (saveNotice()) return saveNotice();
    if (draft().totalAmount > 0 || !props.onSaveAllocation) return saveState().disabledReason;
    return null;
  });

  createEffect(() => {
    const signature = budgetAllocationSignature(props.state);
    if (!signature || signature === lastSyncedAllocationSignature()) return;
    const nextDraft = draftFromTrackingState(props.state, draft().currency);
    setDraft(nextDraft);
    setLastSyncedAllocationSignature(signature);
    setSaveNotice(null);
    if (props.weddingPlanId) saveWeddingBudgetAllocationDraft(props.weddingPlanId, nextDraft);
  });

  function updateDraft(next: WeddingBudgetAllocationDraft) {
    setDraft(next);
    setSaveNotice(null);
    if (props.weddingPlanId) saveWeddingBudgetAllocationDraft(props.weddingPlanId, next);
  }

  function setTotalAmount(value: number) {
    const totalAmount = Math.max(0, Math.round(value) || 0);
    updateDraft(withWeddingBudgetAutoBalance({ ...draft(), totalAmount }));
  }

  function setCategoryAmount(categoryId: WeddingBudgetCategoryId, value: number) {
    const clamped = Math.max(0, Math.round(value) || 0);
    const next = { ...draft(), categoryAmounts: { ...draft().categoryAmounts, [categoryId]: clamped } };
    updateDraft(categoryId === "other_misc" ? next : withWeddingBudgetAutoBalance(next));
  }

  async function saveAllocation() {
    if (!saveState().canSave || !props.onSaveAllocation) return;
    setSaving(true);
    try {
      const projection = buildWeddingBudgetAllocationProjectionInput(draft(), props.metadata ?? {});
      await props.onSaveAllocation(weddingDecisionProjectionToAfpSendInput(projection));
      setSaveNotice("Budget saved. Your planner will use it when checking costs and next steps.");
    } catch {
      setSaveNotice("Could not save the budget right now. Try again in a moment.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class="min-w-0 rounded-[24px] border border-emerald-100/80 bg-emerald-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #B45309" aria-hidden="true">
            <WeddingDashboardIcon id="banknotes" class="h-4 w-4" />
          </span>
          <p class="text-lg font-bold tracking-tight text-emerald-950">Budget</p>
        </div>
        <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-emerald-900">
          {props.state.lineItems.length} selected
        </span>
      </div>
      <p class="mt-2 text-sm leading-6 text-emerald-900/75">{props.state.summaryLabel}</p>
      <Show when={props.state.insights.missingContextLabels.length > 0}>
        <div class="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2">
          <p class="text-xs font-semibold text-amber-950">Details needed</p>
          <p class="mt-1 text-sm leading-6 text-amber-900/80">
            Add {props.state.insights.missingContextLabels.join(", ")} so the budget can compare quotes against the real wedding plan.
          </p>
        </div>
      </Show>
      <div class="mt-3 rounded-2xl border border-emerald-100 bg-white/75 px-2.5 py-2">
        <p class="text-xs font-semibold text-emerald-950/65">Budget target</p>
        <p class="mt-1 text-sm leading-6 text-emerald-950/75">{props.state.budgetStatusLabel}</p>
        <Show when={props.state.budgetTargetAmount !== null}>
          <div class="mt-2">
            <p class="text-xs leading-5 text-emerald-900/65">
              Target {moneyLabel(props.state.budgetTargetAmount ?? 0, currency)}
              <Show when={props.state.budgetUtilizationPercent !== null}>
                {" "}- {props.state.budgetUtilizationPercent}% used by selected vendors
              </Show>
            </p>
            <Show when={props.state.budgetUtilizationPercent !== null}>
              <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-emerald-100">
                <div
                  class={`h-full rounded-full transition-all ${(props.state.budgetUtilizationPercent ?? 0) > 100 ? "bg-rose-500" : "bg-emerald-600"}`}
                  style={`width: ${Math.min(100, props.state.budgetUtilizationPercent ?? 0)}%`}
                />
              </div>
            </Show>
          </div>
        </Show>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <div class="rounded-2xl border border-emerald-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-emerald-950/65">Committed</p>
          <p class="mt-1 break-words text-lg font-semibold text-emerald-950">{moneyLabel(props.state.insights.committedAmount, currency)}</p>
        </div>
        <div class="rounded-2xl border border-emerald-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-emerald-950/65">Estimated</p>
          <p class="mt-1 break-words text-lg font-semibold text-emerald-950">{moneyLabel(props.state.insights.estimatedAmount, currency)}</p>
        </div>
        <div class="rounded-2xl border border-emerald-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-emerald-950/65">Paid</p>
          <p class="mt-1 break-words text-lg font-semibold text-emerald-950">{moneyLabel(props.state.insights.paidAmount, currency)}</p>
        </div>
        <div class="rounded-2xl border border-emerald-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-emerald-950/65">Remaining</p>
          <p class="mt-1 break-words text-lg font-semibold text-emerald-950">
            {props.state.insights.remainingAmount === null ? "Set budget" : moneyLabel(props.state.insights.remainingAmount, currency)}
          </p>
        </div>
        <div class="rounded-2xl border border-rose-100 bg-rose-50/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-rose-950/65">At risk</p>
          <p class="mt-1 break-words text-lg font-semibold text-rose-950">{moneyLabel(props.state.insights.atRiskAmount, currency)}</p>
        </div>
      </div>

      <div class="mt-3 rounded-2xl border border-emerald-100 bg-white/75 p-3">
        <p class="text-sm font-semibold text-emerald-950">Set your budget</p>
        <p class="mt-1 text-xs leading-5 text-emerald-900/70">
          Set an overall figure, then split it across categories. "Stationery, Transport & Other" automatically absorbs whatever's left, so the total always stays balanced.
        </p>
        <label class="mt-3 block text-xs font-semibold text-emerald-950">
          Total budget
          <input
            type="number"
            inputmode="numeric"
            min="0"
            step="100"
            class="mt-1 w-full rounded-2xl border border-emerald-100 bg-white px-3 py-2 text-sm font-normal text-emerald-950 outline-none focus:border-emerald-300"
            value={draft().totalAmount || ""}
            placeholder="0"
            onInput={(event) => setTotalAmount(Number(event.currentTarget.value))}
          />
        </label>
        <div class="mt-3 space-y-3">
          <For each={WEDDING_BUDGET_CATEGORIES}>
            {(category) => {
              const amount = () => draft().categoryAmounts[category.id];
              const sliderMax = () => Math.max(draft().totalAmount, amount(), 1);
              return (
                <div class="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-3 py-2.5">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-semibold text-emerald-950">
                      {category.label}
                      <Show when={category.id === "other_misc"}>
                        {" "}<span class="font-normal text-emerald-900/60">(auto-balances)</span>
                      </Show>
                    </span>
                    <span class="shrink-0 text-xs font-semibold text-emerald-950">{moneyLabel(amount(), draft().currency)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={sliderMax()}
                    step="100"
                    value={amount()}
                    aria-label={`${category.label} amount`}
                    class="mt-2 w-full accent-emerald-700"
                    onInput={(event) => setCategoryAmount(category.id, Number(event.currentTarget.value))}
                  />
                  <input
                    type="number"
                    inputmode="numeric"
                    min="0"
                    step="100"
                    value={amount() || ""}
                    placeholder="0"
                    aria-label={`${category.label} exact amount`}
                    class="mt-2 w-full rounded-2xl border border-emerald-100 bg-white px-3 py-1.5 text-sm font-normal text-emerald-950 outline-none focus:border-emerald-300"
                    onInput={(event) => setCategoryAmount(category.id, Number(event.currentTarget.value))}
                  />
                </div>
              );
            }}
          </For>
        </div>
        <div class={`mt-3 rounded-2xl border px-3 py-2.5 text-sm font-semibold ${
          balanced()
            ? "border-emerald-200 bg-emerald-100/70 text-emerald-950"
            : remaining() > 0
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-rose-200 bg-rose-50 text-rose-900"
        }`}>
          Allocated {moneyLabel(allocated(), draft().currency)} of {moneyLabel(draft().totalAmount, draft().currency)}
          <Show when={!balanced() && draft().totalAmount > 0}>
            {" "}- {remaining() > 0
              ? `${moneyLabel(remaining(), draft().currency)} left to allocate`
              : `${moneyLabel(Math.abs(remaining()), draft().currency)} over the total`}
          </Show>
        </div>
        <button
          type="button"
          disabled={!saveState().canSave}
          onClick={() => void saveAllocation()}
          class="mt-3 w-full rounded-full bg-emerald-900 px-4 py-2.5 text-sm font-semibold text-white shadow-card transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300 sm:w-auto sm:py-2"
        >
          {saving() ? "Saving..." : "Save budget"}
        </button>
        <Show when={helperNotice()}>
          {(notice) => <p class="mt-2 text-xs leading-5 text-emerald-950">{notice()}</p>}
        </Show>
      </div>
      <Show when={props.state.warningLabels.length > 0}>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <For each={props.state.warningLabels}>
            {(label) => (
              <span class="max-w-full break-words rounded-full border border-emerald-100 bg-white/80 px-2 py-1 text-xs font-semibold text-emerald-950/75">
                {label}
              </span>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.state.categoryRollups.length > 0}>
        <div class="mt-3 rounded-2xl border border-emerald-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-emerald-950/65">Top categories</p>
          <div class="mt-2 space-y-1.5">
            <For each={props.state.categoryRollups.slice(0, 3)}>
              {(rollup) => (
                <div class="flex items-center justify-between gap-2 text-xs text-emerald-950/75">
                  <span class="min-w-0 break-words font-semibold">{rollup.categoryLabel}</span>
                  <span class="shrink-0">{moneyLabel(rollup.amount, rollup.currency)} - {rollup.itemCount}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
      <div class="mt-3 rounded-2xl border border-emerald-100 bg-white/75 p-3">
        <div class="flex flex-wrap items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-emerald-950">Safe, balanced, stretch</p>
            <p class="mt-1 text-xs leading-5 text-emerald-900/70">Shows the effect of choices against three budget versions.</p>
          </div>
          <span class="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900">
            {moneyLabel(props.state.totalKnownAmount, currency)} selected
          </span>
        </div>
        <div class="mt-3 grid gap-2 sm:grid-cols-3">
          <For each={props.state.insights.scenarios}>
            {(scenario) => (
              <div class="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                <p class="text-xs font-semibold text-emerald-950">{scenario.label}</p>
                <p class="mt-1 text-sm font-semibold text-emerald-950">
                  {scenario.targetAmount === null ? "Set budget" : moneyLabel(scenario.targetAmount, currency)}
                </p>
                <p class="mt-1 text-xs leading-5 text-emerald-900/70">{scenario.summaryLabel}</p>
              </div>
            )}
          </For>
        </div>
      </div>
      <Show when={props.state.insights.unaffordableWarningLabels.length > 0}>
        <div class="mt-3 rounded-2xl border border-rose-100 bg-rose-50/80 p-3">
          <p class="text-sm font-semibold text-rose-950">Budget warning</p>
          <ul class="mt-2 space-y-1">
            <For each={props.state.insights.unaffordableWarningLabels}>
              {(label) => <li class="text-xs leading-5 text-rose-950/75">{label}</li>}
            </For>
          </ul>
        </div>
      </Show>
      <div class="mt-3 rounded-2xl border border-emerald-100 bg-white/75 p-3">
        <p class="text-sm font-semibold text-emerald-950">Extra costs to check</p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <For each={props.state.insights.feeCoverageLabels}>
            {(label) => (
              <span class="max-w-full break-words rounded-full border border-emerald-100 bg-emerald-50/70 px-2 py-1 text-xs text-emerald-950/75">
                {label}
              </span>
            )}
          </For>
        </div>
      </div>
      <Show when={props.state.insights.monthlyCashNeeds.length > 0}>
        <div class="mt-3 rounded-2xl border border-emerald-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-emerald-950">Cash needed by month</p>
          <div class="mt-2 space-y-1.5">
            <For each={props.state.insights.monthlyCashNeeds.slice(0, 6)}>
              {(row) => (
                <div class="flex items-center justify-between gap-2 text-xs text-emerald-950/75">
                  <span class="font-semibold">{row.monthLabel}</span>
                  <span>{moneyLabel(row.amount, row.currency)} - {row.itemCount} payment{row.itemCount === 1 ? "" : "s"}</span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={props.state.quoteTaskCandidates.length > 0}>
        <div class="mt-3 rounded-2xl border border-emerald-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-emerald-950/70">Quotes to check</p>
          <ul class="mt-2 space-y-1">
            <For each={props.state.quoteTaskCandidates.slice(0, 3)}>
              {(task) => (
                <li class="text-xs leading-5 text-emerald-950/70">
                  <span class="font-semibold">{task.title}</span> - {task.priorityLabel}
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={props.state.insights.quoteNormalForms.length > 0}>
        <div class="mt-3 rounded-2xl border border-emerald-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-emerald-950">Quote normaliser</p>
          <p class="mt-1 text-xs leading-5 text-emerald-900/70">Turns different vendor quote styles into the same fields.</p>
          <div class="mt-3 space-y-2">
            <For each={props.state.insights.quoteNormalForms.slice(0, 4)}>
              {(quote) => (
                <article class="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <p class="break-words text-sm font-semibold text-emerald-950">{quote.vendorName}</p>
                    <span class="rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-emerald-900">{quote.basePriceLabel}</span>
                  </div>
                  <div class="mt-2 grid gap-1.5 text-xs leading-5 text-emerald-950/75 sm:grid-cols-2">
                    <p><span class="font-semibold">Included:</span> {quote.includedLabel}</p>
                    <p><span class="font-semibold">Hours:</span> {quote.hoursLabel}</p>
                    <p><span class="font-semibold">Guest/unit:</span> {quote.guestUnitLabel}</p>
                    <p><span class="font-semibold">Add-ons:</span> {quote.addOnsLabel}</p>
                    <p><span class="font-semibold">Tax:</span> {quote.taxLabel}</p>
                    <p><span class="font-semibold">Service fee:</span> {quote.serviceFeeLabel}</p>
                    <p><span class="font-semibold">Travel:</span> {quote.travelFeeLabel}</p>
                    <p><span class="font-semibold">Overtime:</span> {quote.overtimeLabel}</p>
                    <p><span class="font-semibold">Cancellation:</span> {quote.cancellationLabel}</p>
                    <p><span class="font-semibold">Payments:</span> {quote.depositScheduleLabel}</p>
                  </div>
                  <Show when={quote.missingLabels.length > 0}>
                    <p class="mt-2 rounded-xl border border-amber-100 bg-white/80 px-2.5 py-2 text-xs leading-5 text-amber-900">
                      Ask vendor about: {quote.missingLabels.slice(0, 5).join(", ")}
                    </p>
                  </Show>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>
      <div class="mt-3 rounded-2xl border border-emerald-100 bg-white/75 p-3">
        <p class="text-sm font-semibold text-emerald-950">Contributions</p>
        <Show when={props.state.insights.contributionRows.length > 0} fallback={
          <p class="mt-1 text-xs leading-5 text-emerald-900/70">
            Add who is contributing and any conditions in an uploaded budget, quote, or contract so spending stays clear.
          </p>
        }>
          <div class="mt-2 space-y-1.5">
            <For each={props.state.insights.contributionRows}>
              {(row) => (
                <div class="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs leading-5 text-emerald-950/75">
                  <span class="font-semibold">{row.personLabel}</span> - {row.amountLabel} - {row.conditionLabel}
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
      <Show
        when={props.state.lineItems.length > 0}
        fallback={
          <p class="mt-3 rounded-2xl border border-emerald-100 bg-white/70 px-2.5 py-2 text-sm leading-6 text-emerald-950/75">
            Tick a vendor decision from a comparison table to add its quote or projected price here.
          </p>
        }
      >
        <div class="mt-3 space-y-2">
          <For each={props.state.lineItems.slice(0, 5)}>
            {(item) => (
              <article class="rounded-2xl border border-emerald-100 bg-white/75 p-3 shadow-sm transition hover:border-emerald-200 hover:bg-white hover:shadow">
                <div class="flex items-start justify-between gap-2">
                  <p class="break-words text-sm font-semibold text-emerald-950">{item.vendorName}</p>
                  <span class="max-w-full break-words rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900">
                    {item.priceStatus}
                  </span>
                </div>
                <p class="mt-1 text-sm leading-6 text-emerald-900/75">
                  {item.categoryLabel} - {item.amount === null ? "Amount needed" : moneyLabel(item.amount, item.currency)}
                </p>
                <Show when={item.warningLabels.length > 0}>
                  <ul class="mt-2 space-y-1">
                    <For each={item.warningLabels}>
                      {(label) => <li class="text-xs leading-5 text-emerald-950/65">{label}</li>}
                    </For>
                  </ul>
                </Show>
              </article>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
