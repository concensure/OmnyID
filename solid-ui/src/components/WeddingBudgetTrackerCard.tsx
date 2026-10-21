// @locs-version: 2.1
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import { weddingDecisionProjectionToAfpSendInput } from "@/lib/weddingDecisionAfpProjectionState";
import { loadContacts, saveContacts } from "@/lib/contactsLocalState";
import {
  upsertWeddingHelperContact,
  weddingHelperContactToAfpSendInput,
} from "@/lib/weddingHelpersPanelState";
import type { WeddingBudgetTrackingState } from "@/lib/weddingBudgetTrackingState";
import {
  WEDDING_BUDGET_CATEGORIES,
  buildWeddingBudgetAllocationSaveState,
  buildWeddingBudgetAllocationProjectionInput,
  clearWeddingBudgetAllocationPendingDecision,
  dispatchWeddingBudgetAllocationLocalSave,
  emptyWeddingBudgetAllocationDraft,
  loadWeddingBudgetAllocationDraft,
  saveWeddingBudgetAllocationDraft,
  saveWeddingBudgetAllocationPendingDecision,
  weddingBudgetAllocationAllocatedAmount,
  weddingBudgetAllocationIsBalanced,
  weddingBudgetAllocationRemaining,
  withWeddingBudgetAutoBalance,
  type WeddingBudgetAllocationDraft,
  type WeddingBudgetCategoryId,
} from "@/lib/weddingBudgetAllocationState";
import { buildWeddingBudgetContributionProjectionInput } from "@/lib/weddingBudgetContributionState";
import { buildWeddingBudgetCategoryGuidanceLabel } from "@/lib/weddingBudgetGuidanceState";

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
  locationLabel?: string | null;
  metadata?: unknown;
  onSaveAllocation?: (input: SendAfpMessageInput) => Promise<unknown>;
  onSaveContribution?: (input: SendAfpMessageInput) => Promise<unknown>;
  onSaveContributorContact?: (input: SendAfpMessageInput) => Promise<unknown>;
  contributorPeople?: readonly string[];
  contactUserId?: string | null;
  onOpenArtifact?: (artifactId: string) => void;
}) {
  const currency = props.state.lineItems[0]?.currency ?? "AUD";
  const [draft, setDraft] = createSignal<WeddingBudgetAllocationDraft>(
    // Prefer what's already saved; otherwise resume an unsaved draft on this browser; otherwise start blank.
    props.state.budgetAllocation.length > 0
      ? draftFromTrackingState(props.state, currency)
      : (props.weddingPlanId ? loadWeddingBudgetAllocationDraft(props.weddingPlanId) : null) ?? emptyWeddingBudgetAllocationDraft(currency),
  );
  const [saving, setSaving] = createSignal(false);
  const [activeScenario, setActiveScenario] = createSignal<"safe" | "balanced" | "stretch">("balanced");
  const [savingContribution, setSavingContribution] = createSignal(false);
  const [saveNotice, setSaveNotice] = createSignal<string | null>(null);
  const [contributionNotice, setContributionNotice] = createSignal<string | null>(null);
  const [contributorLabel, setContributorLabel] = createSignal("");
  const [contributionAmount, setContributionAmount] = createSignal("");
  const [contributionCondition, setContributionCondition] = createSignal("");
  const [showContributorContactFields, setShowContributorContactFields] = createSignal(false);
  const [contributorContactName, setContributorContactName] = createSignal("");
  const [contributorContactEmail, setContributorContactEmail] = createSignal("");
  const [savingContributorContact, setSavingContributorContact] = createSignal(false);
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
  const contributorPeople = createMemo(() => [...new Set((props.contributorPeople ?? [])
    .map((person) => person.trim())
    .filter(Boolean))].slice(0, 60));

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
      if (props.weddingPlanId) clearWeddingBudgetAllocationPendingDecision(props.weddingPlanId);
      setSaveNotice("Budget saved. Your planner will use it when checking costs and next steps.");
    } catch {
      if (props.weddingPlanId) saveWeddingBudgetAllocationDraft(props.weddingPlanId, draft());
      const projection = buildWeddingBudgetAllocationProjectionInput(draft(), props.metadata ?? {});
      if (props.weddingPlanId) saveWeddingBudgetAllocationPendingDecision(props.weddingPlanId, projection);
      dispatchWeddingBudgetAllocationLocalSave();
      setSaveNotice("Budget saved on this device. Account memory will sync when saving is available.");
    } finally {
      setSaving(false);
    }
  }

  async function saveContribution() {
    if (!props.onSaveContribution || savingContribution()) return;
    const projection = buildWeddingBudgetContributionProjectionInput({
      personLabel: contributorLabel(),
      amount: Number(contributionAmount()),
      conditionLabel: contributionCondition(),
      currency,
    }, props.metadata ?? {});
    if (!projection) {
      setContributionNotice("Add who is contributing and the amount before saving.");
      return;
    }
    setSavingContribution(true);
    try {
      await props.onSaveContribution(weddingDecisionProjectionToAfpSendInput(projection));
      setContributorLabel("");
      setContributionAmount("");
      setContributionCondition("");
      setContributionNotice("Contribution saved. Conditions will stay visible in the budget.");
    } catch {
      setContributionNotice("Could not save the contribution right now. Try again in a moment.");
    } finally {
      setSavingContribution(false);
    }
  }

  async function addContributorContact(): Promise<void> {
    const name = contributorContactName().trim();
    if (!name || savingContributorContact()) return;
    const email = contributorContactEmail().trim();
    setSavingContributorContact(true);
    const result = upsertWeddingHelperContact(loadContacts(props.contactUserId), {
      name,
      email,
      role: "Budget contributor",
    });
    if (result) saveContacts(result.contacts, props.contactUserId);
    // Fill the contribution field immediately. The AFP event makes the new
    // person available to the rest of the wedding workspace on its next read.
    setContributorLabel(name);
    try {
      const message = weddingHelperContactToAfpSendInput({
        name,
        email,
        role: "Budget contributor",
        metadata: props.metadata ?? {},
      });
      if (message && props.onSaveContributorContact) await props.onSaveContributorContact(message);
      setContributionNotice(`${name} added to Contacts and selected as the contributor.`);
      setShowContributorContactFields(false);
      setContributorContactName("");
      setContributorContactEmail("");
    } catch {
      setContributionNotice(`${name} is selected here and saved in Contacts. Wedding memory will retry when saving is available.`);
    } finally {
      setSavingContributorContact(false);
    }
  }

  return (
    <div class="min-w-0 rounded-xl border border-wedding-border bg-wedding-card p-3 text-wedding-ink shadow-wedding-card phone:rounded-none phone:border-0 phone:bg-transparent phone:p-0 phone:shadow-none sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #B45309" aria-hidden="true">
            <WeddingDashboardIcon id="banknotes" class="h-4 w-4" />
          </span>
          <p class="font-display text-lg font-semibold tracking-tight text-wedding-ink">Budget</p>
          <WeddingInfoTip title="Budget guide" tone="stone">
            These are planning ranges, not quotes. Costs change by location, season, guest count, venue rules, and whether tax, service fees, delivery, and gratuity are included.
          </WeddingInfoTip>
        </div>
        <span class="max-w-full break-words rounded-lg bg-wedding-slate px-2 py-1 text-xs font-semibold text-wedding-ink/75">
          {props.state.lineItems.length} selected
        </span>
      </div>
      <p class="mt-2 text-sm leading-6 text-wedding-ink/75">{props.state.summaryLabel}</p>
      <Show when={props.state.insights.missingContextLabels.length > 0}>
        <div class="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 px-3 py-2">
          <p class="text-xs font-semibold text-amber-950">Details needed</p>
          <p class="mt-1 text-sm leading-6 text-amber-900/80">
            Add {props.state.insights.missingContextLabels.join(", ")} so the budget can compare quotes against the real wedding plan.
          </p>
        </div>
      </Show>
      <div class="mt-3 rounded-xl border border-wedding-border bg-white px-2.5 py-2">
        <p class="text-xs font-semibold text-wedding-ink/65">Budget target</p>
        <p class="mt-1 text-sm leading-6 text-wedding-ink/75">{props.state.budgetStatusLabel}</p>
        <Show when={props.state.budgetTargetAmount !== null}>
          <div class="mt-2">
            <p class="text-xs leading-5 text-wedding-ink/65">
              Target {moneyLabel(props.state.budgetTargetAmount ?? 0, currency)}
              <Show when={props.state.budgetUtilizationPercent !== null}>
                {" "}- {props.state.budgetUtilizationPercent}% used by selected vendors
              </Show>
            </p>
            <Show when={props.state.budgetUtilizationPercent !== null}>
              <div class="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-wedding-slate">
                <div
                  class={`h-full rounded-full transition-all ${(props.state.budgetUtilizationPercent ?? 0) > 100 ? "bg-rose-500" : "bg-wedding-primary"}`}
                  style={`width: ${Math.min(100, props.state.budgetUtilizationPercent ?? 0)}%`}
                />
              </div>
            </Show>
          </div>
        </Show>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-6">
        <div class="rounded-xl border border-wedding-border bg-white px-2.5 py-2">
          <p class="text-xs font-semibold text-wedding-ink/65">Committed</p>
          <p class="mt-1 break-words text-lg font-semibold text-wedding-ink">{moneyLabel(props.state.insights.committedAmount, currency)}</p>
        </div>
        <div class="rounded-xl border border-wedding-border bg-white px-2.5 py-2">
          <p class="text-xs font-semibold text-wedding-ink/65">Estimated</p>
          <p class="mt-1 break-words text-lg font-semibold text-wedding-ink">{moneyLabel(props.state.insights.estimatedAmount, currency)}</p>
        </div>
        <div class="rounded-xl border border-wedding-border bg-white px-2.5 py-2">
          <p class="text-xs font-semibold text-wedding-ink/65">Paid</p>
          <p class="mt-1 break-words text-lg font-semibold text-wedding-ink">{moneyLabel(props.state.insights.paidAmount, currency)}</p>
        </div>
        <div class="rounded-xl border border-wedding-border bg-white px-2.5 py-2">
          <p class="text-xs font-semibold text-wedding-ink/65">Remaining</p>
          <p class="mt-1 break-words text-lg font-semibold text-wedding-ink">
            {props.state.insights.remainingAmount === null ? "Set budget" : moneyLabel(props.state.insights.remainingAmount, currency)}
          </p>
        </div>
        <div class="rounded-2xl border border-rose-100 bg-rose-50/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-rose-950/65">At risk</p>
          <p class="mt-1 break-words text-lg font-semibold text-rose-950">{moneyLabel(props.state.insights.atRiskAmount, currency)}</p>
        </div>
        <div class="rounded-2xl border border-amber-100 bg-amber-50/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-amber-950/65">Forecast range</p>
          <p class="mt-1 break-words text-sm font-semibold leading-5 text-amber-950">{props.state.insights.forecastRangeLabel}</p>
        </div>
      </div>

      <div class="mt-3 rounded-xl border border-wedding-border bg-white p-3">
        <p class="text-sm font-semibold text-wedding-ink">Set your budget</p>
        <p class="mt-1 text-xs leading-5 text-wedding-ink/70">
          Set an overall figure, then split it across categories. "Stationery, Transport & Other" automatically absorbs whatever's left, so the total always stays balanced.
        </p>
        <label class="mt-3 block text-xs font-semibold text-wedding-ink">
          Total budget
          <input
            type="number"
            inputmode="numeric"
            min="0"
            step="100"
            class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 py-2 text-sm font-normal text-wedding-ink outline-none focus:border-wedding-primary"
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
                <div class="rounded-xl border border-wedding-border bg-wedding-page px-3 py-2.5 phone:rounded-none phone:border-0 phone:border-t phone:bg-transparent phone:px-0">
                  <div class="flex items-center justify-between gap-2">
                    <span class="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-wedding-ink">
                      <span class="min-w-0 break-words">
                        {category.label}
                        <Show when={category.id === "other_misc"}>
                          {" "}<span class="font-normal text-wedding-ink/60">(auto-balances)</span>
                        </Show>
                      </span>
                      <WeddingInfoTip title={`${category.label} guide`} tone="stone">
                        {(() => {
                          const guidance = buildWeddingBudgetCategoryGuidanceLabel({
                            categoryId: category.id,
                            totalAmount: draft().totalAmount,
                            currency: draft().currency,
                            locationLabel: props.locationLabel,
                          });
                          return `${guidance.rangeLabel} ${guidance.averageLabel} ${guidance.locationNote} ${guidance.practicalTip}`;
                        })()}
                      </WeddingInfoTip>
                    </span>
                    <span class="shrink-0 text-xs font-semibold text-wedding-ink">{moneyLabel(amount(), draft().currency)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max={sliderMax()}
                    step="100"
                    value={amount()}
                    aria-label={`${category.label} amount`}
                    class="mt-2 w-full accent-wedding-primary"
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
                    class="mt-2 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 py-1.5 text-sm font-normal text-wedding-ink outline-none focus:border-wedding-primary"
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
          class="mt-3 min-h-11 w-full rounded-lg bg-wedding-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-wedding-primary/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-2"
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
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
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
      <section class="mt-4" aria-labelledby="wedding-budget-version-heading">
        <div class="flex items-baseline justify-between gap-2">
          <h3 id="wedding-budget-version-heading" class="text-sm font-semibold text-emerald-950">Budget version</h3>
          <Show when={props.state.totalKnownAmount > 0}>
            <span class="text-xs text-emerald-900/70">{moneyLabel(props.state.totalKnownAmount, currency)} selected</span>
          </Show>
        </div>
        <div class="mt-2 space-y-2" role="radiogroup" aria-labelledby="wedding-budget-version-heading">
          <For each={props.state.insights.scenarios}>
            {(scenario) => {
              const active = () => activeScenario() === scenario.id;
              return (
                <button
                  type="button"
                  role="radio"
                  aria-checked={active()}
                  onClick={() => setActiveScenario(scenario.id)}
                  class={`block min-h-11 w-full rounded-xl p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 ${
                    active()
                      ? "border-2 border-emerald-800 bg-white shadow-card"
                      : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-white"
                  }`}
                >
                  <span class="flex items-center justify-between gap-2">
                    <span class="flex min-w-0 items-center gap-2">
                      <span
                        class={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${active() ? "border-emerald-800 bg-emerald-800" : "border-slate-300 bg-white"}`}
                        aria-hidden="true"
                      >
                        <Show when={active()}>
                          <svg viewBox="0 0 24 24" class="h-3 w-3" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                        </Show>
                      </span>
                      <span class={`text-sm font-semibold ${active() ? "text-emerald-950" : "text-slate-700"}`}>{scenario.label}</span>
                      <Show when={scenario.id === "balanced"}>
                        <span class="rounded-full bg-emerald-800 px-2 py-0.5 text-xs font-semibold text-white">Recommended</span>
                      </Show>
                    </span>
                    <span class={`shrink-0 text-sm font-semibold ${active() ? "text-emerald-950" : "text-slate-700"}`}>
                      {scenario.targetAmount === null ? "Set budget" : moneyLabel(scenario.targetAmount, currency)}
                    </span>
                  </span>
                  <span class="mt-1 block pl-7 text-xs">{scenario.summaryLabel}</span>
                  <Show when={active()}>
                    <span class="mt-2 block pl-7 text-sm text-emerald-950">
                      {scenario.meaningLabel}
                      <Show when={scenario.nextStepLabel}>
                        {" "}<span class="font-semibold">{scenario.nextStepLabel}</span>
                      </Show>
                    </span>
                  </Show>
                </button>
              );
            }}
          </For>
        </div>
      </section>
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
      <Show when={props.state.insights.riskExplanationLabels.length > 0}>
        <div class="mt-3 rounded-2xl border border-amber-100 bg-amber-50/80 p-3">
          <p class="text-sm font-semibold text-amber-950">What could still move</p>
          <ul class="mt-2 space-y-1">
            <For each={props.state.insights.riskExplanationLabels}>
              {(label) => <li class="text-xs leading-5 text-amber-950/75">{label}</li>}
            </For>
          </ul>
        </div>
      </Show>
      <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
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
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <p class="text-sm font-semibold text-emerald-950">Cash needed by month</p>
          <p class="mt-1 text-xs leading-5 text-emerald-900/70">{props.state.insights.monthlyCashNeedsSummaryLabel}</p>
          <div class="mt-2 space-y-1.5">
            <For each={props.state.insights.monthlyCashNeeds.slice(0, 6)}>
              {(row) => (
                <div class="flex items-center justify-between gap-2 text-xs text-emerald-950/75">
                  <span class="font-semibold">{row.monthLabel}</span>
                  <span>
                    {row.amount > 0 ? moneyLabel(row.amount, row.currency) : "Amount to confirm"} - {row.itemCount} payment{row.itemCount === 1 ? "" : "s"}
                    <Show when={row.amountToConfirmCount > 0}>
                      {" "}({row.amountToConfirmCount} amount{row.amountToConfirmCount === 1 ? "" : "s"} to confirm)
                    </Show>
                  </span>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={props.state.paymentTaskCandidates.length > 0}>
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
          <p class="text-sm font-semibold text-emerald-950">Payments to check</p>
          <p class="mt-1 text-xs leading-5 text-emerald-900/70">
            Review deposits, balances, receipts, and due dates before anyone pays.
          </p>
          <div class="mt-2 space-y-2">
            <For each={props.state.paymentTaskCandidates.slice(0, 4)}>
              {(task) => (
                <article class="rounded-2xl border border-emerald-100 bg-emerald-50/50 px-3 py-2">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="break-words text-xs font-semibold text-emerald-950">{task.title}</p>
                      <p class="mt-1 text-xs leading-5 text-emerald-950/70">
                        {[task.dueAmountLabel, task.dueDateLabel].filter(Boolean).join(" - ") || task.priorityLabel}
                      </p>
                    </div>
                    <Show when={task.linkedArtifactId && props.onOpenArtifact}>
                      <button
                        type="button"
                        data-magic-action="open"
                        data-magic-icon="source"
                        data-magic-label={`View source for ${task.title}`}
                        data-magic-id={`wedding:budget:payment:${task.id}:source`}
                        onClick={() => task.linkedArtifactId && props.onOpenArtifact?.(task.linkedArtifactId)}
                        class="rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-50"
                      >
                        View source
                      </button>
                    </Show>
                  </div>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={props.state.quoteTaskCandidates.length > 0}>
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
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
        <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
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
                  <Show when={quote.linkedArtifactId && props.onOpenArtifact}>
                    <button
                      type="button"
                      data-magic-action="open"
                      data-magic-icon="source"
                      data-magic-label={`View source for ${quote.vendorName}`}
                      data-magic-id={`wedding:budget:quote:${quote.vendorName}:source`}
                      onClick={() => quote.linkedArtifactId && props.onOpenArtifact?.(quote.linkedArtifactId)}
                      class="mt-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-50"
                    >
                      View source
                    </button>
                  </Show>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>
      <div class="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
        <p class="text-sm font-semibold text-emerald-950">Contributions</p>
        <div class="mt-2 grid gap-2 sm:grid-cols-[1fr_9rem]">
          <input
            type="text"
            list="wedding-budget-contributor-people"
            value={contributorLabel()}
            placeholder="Who is contributing?"
            class="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-emerald-950 outline-none focus:border-emerald-300"
            onInput={(event) => {
              const value = event.currentTarget.value;
              if (value === "__add_new_contributor_contact__") {
                setContributorLabel("");
                setShowContributorContactFields(true);
                return;
              }
              setContributorLabel(value);
              setContributionNotice(null);
            }}
          />
          <datalist id="wedding-budget-contributor-people">
            <For each={contributorPeople()}>
              {(person) => <option value={person} />}
            </For>
            <option value="__add_new_contributor_contact__">Add a new contact…</option>
          </datalist>
          <input
            type="number"
            inputmode="numeric"
            min="0"
            step="100"
            value={contributionAmount()}
            placeholder="Amount"
            class="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-emerald-950 outline-none focus:border-emerald-300"
            onInput={(event) => {
              setContributionAmount(event.currentTarget.value);
              setContributionNotice(null);
            }}
          />
        </div>
        <button
          type="button"
          aria-expanded={showContributorContactFields()}
          class="mt-2 text-xs font-semibold text-emerald-900 underline decoration-emerald-300 underline-offset-2"
          onClick={() => setShowContributorContactFields((value) => !value)}
        >
          Add a contact
        </button>
        <Show when={showContributorContactFields()}>
          <div class="mt-2 grid gap-2 rounded-xl border border-emerald-100 bg-emerald-50/60 p-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label class="text-xs font-semibold text-emerald-950">
              Name
              <input type="text" value={contributorContactName()} onInput={(event) => setContributorContactName(event.currentTarget.value)} class="mt-1 min-h-10 w-full rounded-lg border border-emerald-200 bg-white px-2 text-sm font-normal text-emerald-950 outline-none" />
            </label>
            <label class="text-xs font-semibold text-emerald-950">
              Email (optional)
              <input type="email" value={contributorContactEmail()} onInput={(event) => setContributorContactEmail(event.currentTarget.value)} class="mt-1 min-h-10 w-full rounded-lg border border-emerald-200 bg-white px-2 text-sm font-normal text-emerald-950 outline-none" />
            </label>
            <button type="button" disabled={!contributorContactName().trim() || savingContributorContact()} onClick={() => void addContributorContact()} class="min-h-10 rounded-lg border border-emerald-200 bg-white px-3 text-xs font-semibold text-emerald-950 disabled:cursor-not-allowed disabled:opacity-50">
              {savingContributorContact() ? "Adding..." : "Add and select"}
            </button>
          </div>
        </Show>
        <input
          type="text"
          value={contributionCondition()}
          placeholder="Condition, for example: venue only, no condition, paid after invoice"
          class="mt-2 w-full min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-emerald-950 outline-none focus:border-emerald-300"
          onInput={(event) => {
            setContributionCondition(event.currentTarget.value);
            setContributionNotice(null);
          }}
        />
        <button
          type="button"
          disabled={!props.onSaveContribution || savingContribution()}
          onClick={() => void saveContribution()}
          class="mt-2 rounded-full border border-emerald-200 bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-emerald-300"
        >
          {savingContribution() ? "Saving..." : "Save contribution"}
        </button>
        <Show when={contributionNotice()}>
          {(notice) => <p class="mt-2 text-xs leading-5 text-emerald-950/75">{notice()}</p>}
        </Show>
        <Show when={props.state.insights.contributionRows.length > 0} fallback={
          <p class="mt-1 text-xs leading-5 text-emerald-900/70">
            Add who is contributing and any conditions in an uploaded budget, quote, or contract so spending stays clear.
          </p>
        }>
          <div class="mt-2 space-y-1.5">
            <For each={props.state.insights.contributionRows}>
              {(row) => (
                <div class="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs leading-5 text-emerald-950/75">
                  <span class="font-semibold">{row.personLabel}</span> - {row.amountLabel}
                  <Show when={row.conditionLabel && row.conditionLabel !== "No condition recorded."}>
                    {(condition) => <> - {condition()}</>}
                  </Show>
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
              <article class="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-emerald-200 hover:bg-white hover:shadow">
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
                <Show when={item.linkedArtifactId && props.onOpenArtifact}>
                  <button
                    type="button"
                    data-magic-action="open"
                    data-magic-icon="source"
                    data-magic-label={`View source for ${item.vendorName}`}
                    data-magic-id={`wedding:budget:line-item:${item.id}:source`}
                    onClick={() => item.linkedArtifactId && props.onOpenArtifact?.(item.linkedArtifactId)}
                    class="mt-2 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-950 transition hover:bg-emerald-50"
                  >
                    View source
                  </button>
                </Show>
              </article>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
