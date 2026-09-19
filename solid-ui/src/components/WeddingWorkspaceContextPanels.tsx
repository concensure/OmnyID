// @locs-version: 2.0
import { For, Show } from "solid-js";

import type {
  WeddingResponseWorkspaceViewState,
} from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import { WeddingBackgroundAutomationCard } from "@/components/WeddingBackgroundAutomationCard";
import { WeddingBudgetTrackerCard } from "@/components/WeddingBudgetTrackerCard";
import { WeddingCollaborationAccessCard } from "@/components/WeddingCollaborationAccessCard";
import { WeddingGuestOperationsCard } from "@/components/WeddingGuestOperationsCard";
import { WeddingProductionGateCard } from "@/components/WeddingProductionGateCard";
import { buildWeddingDecisionFocusSidebarAction } from "@/lib/weddingDecisionFocusActionState";
import type { WeddingVendorContactWorkspaceCard } from "@/lib/weddingResponseWorkspaceViewState";

function vendorContactStatusClass(tone: WeddingVendorContactWorkspaceCard["tone"]): string {
  if (tone === "urgent") return "bg-rose-50 text-rose-900";
  if (tone === "due") return "bg-amber-50 text-amber-900";
  if (tone === "waiting") return "bg-sky-50 text-sky-900";
  if (tone === "closed") return "bg-emerald-50 text-emerald-900";
  return "bg-stone-50 text-stone-800";
}

function vendorContactItemClass(tone: WeddingVendorContactWorkspaceCard["tone"]): string {
  if (tone === "urgent") return "rounded-2xl border border-rose-100 bg-white/80 p-3";
  if (tone === "due") return "rounded-2xl border border-amber-100 bg-white/80 p-3";
  if (tone === "waiting") return "rounded-2xl border border-sky-100 bg-white/80 p-3";
  if (tone === "closed") return "rounded-2xl border border-emerald-100 bg-white/80 p-3";
  return "rounded-2xl border border-stone-100 bg-white/80 p-3";
}

function pressureLabel(label: string): string {
  if (label === "attention") return "Needs attention";
  if (label === "obligation") return "Must do";
  if (label === "knowledge") return "Needs info";
  if (label === "opportunity") return "Good option";
  return label.replace(/_/g, " ");
}

function WeddingPanelSection(props: {
  label: string;
  detail: string;
  tone: "everyday" | "advanced";
}) {
  const toneClass = () => props.tone === "advanced"
    ? "border-slate-200/80 bg-slate-50/75 text-slate-800"
    : "border-rose-100/80 bg-rose-50/75 text-rose-950";
  return (
    <div class={`rounded-2xl border px-3 py-2 ${toneClass()}`}>
      <p class="text-sm font-semibold">{props.label}</p>
      <p class="mt-0.5 text-sm leading-6 opacity-75">{props.detail}</p>
    </div>
  );
}

export function WeddingDecisionFocusCard(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
}) {
  const decisionFocusAction = () => buildWeddingDecisionFocusSidebarAction(props.state.personalOsProjection.decisionLoadRelief);
  return (
    <Show when={props.state.personalOsProjection.hasWeddingPersonalOsSignal}>
      <div class="min-w-0 rounded-[24px] border border-pink-100/80 bg-pink-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
        <div class="flex items-start justify-between gap-2">
          <p class="text-base font-semibold text-pink-950">What needs your yes/no</p>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-pink-900">
            {props.state.personalOsProjection.decisionLoadRelief.focusItems.length} now
          </span>
        </div>
        <p class="mt-2 text-sm leading-6 text-pink-900/75">
          {props.state.personalOsProjection.decisionLoadRelief.summaryLabel}
        </p>
        <Show when={props.state.personalOsProjection.decisionLoadRelief.focusItems.length > 0} fallback={
          <p class="mt-3 rounded-2xl border border-pink-100 bg-white/70 px-3 py-2 text-sm leading-6 text-pink-950/75">
            Nothing needs a yes/no right now.
          </p>
        }>
          <div class="mt-3 space-y-2">
            <For each={props.state.personalOsProjection.decisionLoadRelief.focusItems}>
              {(item) => (
                <article class="rounded-2xl border border-pink-100 bg-white/75 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <p class="break-words text-sm font-semibold text-pink-950">{item.title}</p>
                    <span class="max-w-full break-words rounded-full bg-pink-50 px-2 py-1 text-xs font-medium text-pink-900">
                      {pressureLabel(item.pressureFamily)}
                    </span>
                  </div>
                  <p class="mt-1 text-xs leading-5 text-pink-950/70">
                    {item.explanation}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={item.evidenceLabels.slice(0, 3)}>
                      {(label) => (
                        <span class="max-w-full break-words rounded-full border border-pink-100 bg-pink-50/70 px-2 py-1 text-xs text-pink-900/80">
                          {label}
                        </span>
                      )}
                    </For>
                  </div>
                </article>
              )}
            </For>
          </div>
        </Show>
        <Show when={props.state.personalOsProjection.decisionLoadRelief.reliefLabels.length > 0}>
          <ul class="mt-3 space-y-1">
            <For each={props.state.personalOsProjection.decisionLoadRelief.reliefLabels.slice(0, 3)}>
              {(label) => <li class="text-xs leading-5 text-pink-950/70">{label}</li>}
            </For>
          </ul>
        </Show>
        <button
          type="button"
          disabled={props.state.personalOsProjection.decisionLoadRelief.focusItems.length === 0}
          class="mt-3 w-full rounded-full border border-pink-200 bg-white/75 px-3 py-2 text-xs font-semibold text-pink-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:py-1.5"
          onClick={() => props.onSidebarAction(decisionFocusAction())}
        >
          {decisionFocusAction().label}
        </button>
      </div>
    </Show>
  );
}

export function WeddingWorkspaceContextPanels(props: {
  state: WeddingResponseWorkspaceViewState;
  showTechnicalDetails?: boolean;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
}) {
  return (
    <>
      <Show when={props.showTechnicalDetails}>
        <WeddingPanelSection
          label="Setup details"
          detail="Connection, approval, and launch checks. Most couples can leave this closed."
          tone="advanced"
        />
        <WeddingProductionGateCard packet={props.state.productionGoNoGoPacket} />

        <WeddingBackgroundAutomationCard state={props.state.backgroundAutomationCoverage} />
      </Show>

      <WeddingPanelSection
        label="Planning snapshot"
        detail="The main wedding details to check today."
        tone="everyday"
      />

      <WeddingCollaborationAccessCard state={props.state.collaboration} />

      <Show when={props.showTechnicalDetails}>
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
          <div class="rounded-2xl border border-teal-100 bg-white/75 px-2.5 py-2">
            <p class="text-xs font-semibold text-teal-950/60">Ready</p>
            <p class="mt-1 text-xs font-semibold text-teal-950">{props.state.importParserReadiness.synthesizedCount}</p>
          </div>
          <div class="rounded-2xl border border-teal-100 bg-white/75 px-2.5 py-2">
            <p class="text-xs font-semibold text-teal-950/60">Review</p>
            <p class="mt-1 text-xs font-semibold text-teal-950">{props.state.importParserReadiness.reviewNeededCount}</p>
          </div>
          <div class="rounded-2xl border border-teal-100 bg-white/75 px-2.5 py-2">
            <p class="text-xs font-semibold text-teal-950/60">Needs help</p>
            <p class="mt-1 text-xs font-semibold text-teal-950">{props.state.importParserReadiness.parserNeededCount}</p>
          </div>
          <div class="rounded-2xl border border-teal-100 bg-white/75 px-2.5 py-2">
            <p class="text-xs font-semibold text-teal-950/60">Saved</p>
            <p class="mt-1 text-xs font-semibold text-teal-950">{props.state.importParserReadiness.originalUploadSavedCount}</p>
          </div>
          <div class="rounded-2xl border border-teal-100 bg-white/75 px-2.5 py-2">
            <p class="text-xs font-semibold text-teal-950/60">Follow-up</p>
            <p class="mt-1 text-xs font-semibold text-teal-950">{props.state.importParserReadiness.parserJobReadyCount}</p>
          </div>
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
              {(label) => <li class="text-xs leading-5 text-teal-950/70">{label}</li>}
            </For>
          </ul>
        </div>
      </div>
      </Show>

      <WeddingBudgetTrackerCard state={props.state.budgetTracking} />

      <WeddingGuestOperationsCard state={props.state.guestTracking} />

      <div class="min-w-0 rounded-[24px] border border-sky-100/80 bg-sky-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
        <div class="flex items-start justify-between gap-2">
          <p class="text-base font-semibold text-sky-950">Seating plan</p>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-sky-900">
            {props.state.seatingPlan.statusLabel}
          </span>
        </div>
        <p class="mt-2 text-sm leading-6 text-sky-900/75">
          {props.state.seatingPlan.summaryLabel}
        </p>
        <div class="mt-3 grid grid-cols-3 gap-2">
          <div class="rounded-2xl border border-sky-100 bg-white/75 px-2.5 py-2">
            <p class="text-xs font-semibold text-sky-950/65">Assigned</p>
            <p class="mt-1 text-2xl font-semibold text-sky-950">{props.state.seatingPlan.assignedSeatCount}</p>
          </div>
          <div class="rounded-2xl border border-sky-100 bg-white/75 px-2.5 py-2">
            <p class="text-xs font-semibold text-sky-950/65">Unassigned</p>
            <p class="mt-1 text-2xl font-semibold text-sky-950">{props.state.seatingPlan.unassignedAttendingCount}</p>
          </div>
          <div class="rounded-2xl border border-sky-100 bg-white/75 px-2.5 py-2">
            <p class="text-xs font-semibold text-sky-950/65">Tables</p>
            <p class="mt-1 text-2xl font-semibold text-sky-950">{props.state.seatingPlan.suggestedTableCount}</p>
          </div>
        </div>
        <div class="mt-3 flex flex-wrap gap-1.5">
          <span class="max-w-full break-words rounded-full border border-sky-100 bg-white/80 px-2 py-1 text-xs text-sky-950/75">
            {props.state.seatingPlan.householdGroupCount} household group{props.state.seatingPlan.householdGroupCount === 1 ? "" : "s"}
          </span>
          <span class="max-w-full break-words rounded-full border border-sky-100 bg-white/80 px-2 py-1 text-xs text-sky-950/75">
            {props.state.seatingPlan.vipOrWeddingPartyCount} VIP/party guest{props.state.seatingPlan.vipOrWeddingPartyCount === 1 ? "" : "s"}
          </span>
        </div>
        <Show when={props.state.seatingPlan.warningLabels.length > 0} fallback={
          <p class="mt-3 rounded-2xl border border-sky-100 bg-white/70 px-2.5 py-2 text-sm leading-6 text-sky-950/75">
            Seating looks okay right now.
          </p>
        }>
          <ul class="mt-3 space-y-1">
            <For each={props.state.seatingPlan.warningLabels}>
              {(label) => <li class="text-xs leading-5 text-sky-950/70">{label}</li>}
            </For>
          </ul>
        </Show>
        <Show when={props.state.seatingPlan.actionItems.length > 0}>
          <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
            <p class="text-xs font-semibold text-sky-950/70">Seating to-dos</p>
            <ul class="mt-2 space-y-1">
              <For each={props.state.seatingPlan.actionItems.slice(0, 4)}>
                {(item) => (
                  <li class="text-xs leading-5 text-sky-950/70">
                    <span class="font-semibold">{item.title}</span> - {item.priorityLabel}
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
        <Show when={props.state.seatingPlan.tableBriefs.length > 0}>
          <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
            <p class="text-xs font-semibold text-sky-950/70">Table notes</p>
            <div class="mt-2 space-y-1.5">
              <For each={props.state.seatingPlan.tableBriefs.slice(0, 4)}>
                {(brief) => (
                  <p class="text-xs leading-5 text-sky-950/70">
                    <span class="font-semibold">{brief.tableLabel}</span> - {brief.summaryLabel}
                  </p>
                )}
              </For>
            </div>
          </div>
        </Show>
        <Show when={props.state.seatingPlan.vendorBriefLines.length > 0}>
          <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
            <p class="text-xs font-semibold text-sky-950/70">Notes for vendors</p>
            <ul class="mt-2 space-y-1">
              <For each={props.state.seatingPlan.vendorBriefLines.slice(0, 4)}>
                {(line) => <li class="text-xs leading-5 text-sky-950/70">{line}</li>}
              </For>
            </ul>
          </div>
        </Show>
        <Show when={props.state.seatingPlan.dietaryAccessibilityBrief.dietarySummaryLabels.length > 0 || props.state.seatingPlan.dietaryAccessibilityBrief.accessibilitySummaryLabels.length > 0}>
          <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
            <p class="text-xs font-semibold text-sky-950/65">Meal and access notes</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <For each={[...props.state.seatingPlan.dietaryAccessibilityBrief.dietarySummaryLabels, ...props.state.seatingPlan.dietaryAccessibilityBrief.accessibilitySummaryLabels].slice(0, 6)}>
                {(label) => (
                  <span class="max-w-full break-words rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-xs text-sky-950/75">
                    {label}
                  </span>
                )}
              </For>
            </div>
            <Show when={props.state.seatingPlan.dietaryAccessibilityBrief.approvalRequiredLabels.length > 0}>
              <ul class="mt-2 space-y-1">
                <For each={props.state.seatingPlan.dietaryAccessibilityBrief.approvalRequiredLabels.slice(0, 3)}>
                  {(label) => <li class="text-xs leading-5 text-sky-950/70">{label}</li>}
                </For>
              </ul>
            </Show>
            <p class="mt-2 text-xs leading-5 text-sky-950/60">
              {props.state.seatingPlan.dietaryAccessibilityBrief.correctionLoopLabel}
            </p>
          </div>
        </Show>
        <Show when={props.state.seatingPlan.tableLabels.length > 0}>
          <p class="mt-3 text-xs leading-5 text-sky-950/65">
            Tables: {props.state.seatingPlan.tableLabels.slice(0, 6).join(", ")}
          </p>
        </Show>
      </div>

      <div class="min-w-0 rounded-[24px] border border-fuchsia-100/80 bg-fuchsia-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
        <div class="flex items-start justify-between gap-2">
          <p class="text-base font-semibold text-fuchsia-950">Who is helping</p>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-fuchsia-900">
            {props.state.delegation.contactDrafts.length} contact draft{props.state.delegation.contactDrafts.length === 1 ? "" : "s"}
          </span>
        </div>
        <p class="mt-2 text-sm leading-6 text-fuchsia-900/75">
          Give wedding jobs to named people, like legal forms, vendors, RSVPs, seating, payments, vows, travel, and ceremony tasks.
        </p>
        <Show when={props.state.delegation.items.length > 0} fallback={
          <div class="mt-3 rounded-2xl border border-fuchsia-100 bg-white/70 p-2">
            <p class="text-sm leading-6 text-fuchsia-950/75">
              No helpers added yet. Start with legal forms, venue choice, vendor outreach, budget, guest RSVPs, or weather backup.
            </p>
          </div>
        }>
          <div class="mt-3 space-y-2">
            <For each={props.state.delegation.items.slice(0, 5)}>
              {(item) => (
                <article class="rounded-2xl border border-fuchsia-100 bg-white/75 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <p class="break-words text-sm font-semibold text-fuchsia-950">{item.categoryLabel}</p>
                    <span class="max-w-full break-words rounded-full bg-fuchsia-50 px-2 py-1 text-xs text-fuchsia-900">
                      {item.readyForContacts ? "Ready to contact" : "Add details"}
                    </span>
                  </div>
                  <p class="mt-1 text-xs leading-5 text-fuchsia-900/75">
                    {item.personName ?? "No person assigned"}{item.relationship ? ` - ${item.relationship}` : ""}
                  </p>
                  <p class="mt-1 text-xs leading-5 text-fuchsia-950/65">
                    {item.categoryDescription}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={item.recommendedRoleLabels}>
                      {(label) => (
                        <span class="max-w-full break-words rounded-full border border-fuchsia-100 bg-fuchsia-50 px-2 py-1 text-xs font-semibold text-fuchsia-950/70">
                          {label}
                        </span>
                      )}
                    </For>
                  </div>
                  <p class="mt-2 rounded-2xl border border-fuchsia-100 bg-fuchsia-50/70 px-2.5 py-2 text-xs leading-5 text-fuchsia-950/70">
                    {item.sensitiveScopeLabel}
                  </p>
                  <Show when={item.missingLabels.length > 0}>
                    <ul class="mt-2 space-y-1">
                      <For each={item.missingLabels}>
                        {(label) => <li class="text-xs leading-5 text-fuchsia-950/65">{label}</li>}
                      </For>
                    </ul>
                  </Show>
                </article>
              )}
            </For>
          </div>
        </Show>
        <Show when={props.state.delegation.blockerLabels.length > 0}>
          <p class="mt-3 rounded-2xl border border-fuchsia-100 bg-white/70 px-2.5 py-2 text-xs leading-5 text-fuchsia-950/75">
            Next: complete name, relationship, and phone or email before saving delegation to Contacts.
          </p>
        </Show>
      </div>

      <div class="min-w-0 rounded-[24px] border border-indigo-100/80 bg-indigo-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
        <div class="flex items-start justify-between gap-2">
          <p class="text-base font-semibold text-indigo-950">Timeline</p>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-indigo-900">
            {props.state.ganttTimeline.rows.length} dated item{props.state.ganttTimeline.rows.length === 1 ? "" : "s"}
          </span>
        </div>
        <Show when={props.state.ganttTimeline.undatedItems.length > 0}>
          <div class="mt-3 rounded-2xl border border-indigo-100 bg-white/75 p-3">
            <p class="text-xs font-semibold text-indigo-950/70">Can do anytime</p>
            <ul class="mt-2 space-y-1">
              <For each={props.state.ganttTimeline.undatedItems.slice(0, 4)}>
                {(item) => (
                  <li class="text-xs leading-5 text-indigo-950/70">
                    <span class="font-semibold">{item.title}</span> - {item.categoryLabel} - {item.statusLabel}
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
        <Show when={props.state.ganttTimeline.riskLabels.length > 0}>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <For each={props.state.ganttTimeline.riskLabels.slice(0, 4)}>
              {(risk) => (
                <span class="max-w-full break-words rounded-full border border-indigo-100 bg-white/80 px-2 py-1 text-xs font-semibold text-indigo-950/75">
                  {risk.label}
                </span>
              )}
            </For>
          </div>
        </Show>
        <Show when={props.state.ganttTimeline.rows.length > 0} fallback={
          <p class="mt-2 rounded-2xl border border-indigo-100 bg-white/70 px-2.5 py-2 text-xs leading-5 text-indigo-950/75">
            {props.state.ganttTimeline.blockerLabels[0]}
          </p>
        }>
          <div class="mt-3 space-y-2">
            <For each={props.state.ganttTimeline.rows.slice(0, 6)}>
              {(row) => (
                <article class="min-w-0">
                  <div class="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <p class="min-w-0 break-words text-sm font-semibold text-indigo-950">{row.title}</p>
                    <span class="shrink-0 text-xs text-indigo-900/65">{row.startLabel}</span>
                  </div>
                  <div class="h-3 rounded-full bg-white/80">
                    <div
                      class="h-3 rounded-full"
                      style={{
                        "margin-left": `${row.offsetPercent}%`,
                        width: `${row.widthPercent}%`,
                        "background-color": row.color,
                      }}
                    />
                  </div>
                  <p class="mt-1 break-words text-xs leading-5 text-indigo-950/65">
                    {row.categoryLabel} - {row.durationDays} day{row.durationDays === 1 ? "" : "s"} - {row.statusLabel}
                  </p>
                </article>
              )}
            </For>
          </div>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <For each={props.state.ganttTimeline.legend}>
              {(item) => (
                <span class="inline-flex max-w-full items-center gap-1 break-words rounded-full border border-indigo-100 bg-white/75 px-2 py-1 text-xs text-indigo-900/80">
                  <span class="h-2 w-2 rounded-full" style={{ "background-color": item.color }} />
                  {item.label}
                </span>
              )}
            </For>
          </div>
        </Show>
      </div>

      <Show when={props.state.contextCards.length > 0}>
        <div class="min-w-0 rounded-[24px] border border-rose-100/80 bg-rose-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
          <p class="text-base font-semibold text-rose-950">Important details</p>
          <div class="mt-3 space-y-2">
            <For each={props.state.contextCards}>
              {(card) => (
                <article class="rounded-2xl border border-rose-100 bg-white/75 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <p class="break-words text-xs font-semibold text-rose-950">{card.title}</p>
                    <span class="max-w-full break-words rounded-full bg-rose-50 px-2 py-1 text-xs font-medium text-rose-900">
                      {card.statusLabel}
                    </span>
                  </div>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={card.metadataLabels.slice(0, 3)}>
                      {(label) => (
                        <span class="max-w-full break-words rounded-full border border-rose-100 bg-rose-50/70 px-2 py-1 text-xs text-rose-900/80">
                          {label}
                        </span>
                      )}
                    </For>
                  </div>
                  <ul class="mt-2 space-y-1">
                    <For each={card.answeredLabels.slice(0, 5)}>
                      {(label) => <li class="text-xs leading-5 text-rose-900/75">{label}</li>}
                    </For>
                  </ul>
                  <p class="mt-2 rounded-xl border border-rose-100 bg-rose-50/70 px-2.5 py-2 text-xs leading-5 text-rose-950/80">
                    Next: {card.nextQuestionLabel}
                  </p>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={props.showTechnicalDetails && props.state.providerHandoffAuditCard}>
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

      <Show when={props.state.vendorContactCards.length > 0}>
        <div class="min-w-0 rounded-[24px] border border-amber-100/80 bg-amber-50/85 p-3 shadow-card sm:rounded-[28px] sm:p-4">
          <div class="flex items-start justify-between gap-2">
            <p class="break-words text-base font-semibold text-amber-950">Vendors to follow up</p>
            <span class="max-w-full break-words rounded-full bg-white/85 px-2 py-1 text-xs font-semibold text-amber-900">
              {props.state.vendorContactCards.length} tracked
            </span>
          </div>
          <div class="mt-3 space-y-2">
            <For each={props.state.vendorContactCards}>
              {(card) => (
                <article class={vendorContactItemClass(card.tone)}>
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="break-words text-sm font-semibold text-stone-950">{card.vendorName}</p>
                      <p class="mt-0.5 text-xs leading-5 text-stone-700/75">{card.categoryLabel}</p>
                    </div>
                    <span class={`max-w-full shrink-0 break-words rounded-full px-2 py-1 text-xs font-semibold ${vendorContactStatusClass(card.tone)}`}>
                      {card.statusLabel}
                    </span>
                  </div>
                  <p class="mt-2 text-sm leading-6 text-stone-800/75">{card.detailLabel}</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={card.metadataLabels.slice(0, 4)}>
                      {(label) => (
                        <span class="max-w-full break-words rounded-full border border-stone-200 bg-stone-50/80 px-2 py-1 text-xs text-stone-800/75">
                          {label}
                        </span>
                      )}
                    </For>
                  </div>
                  <p class="mt-2 rounded-xl border border-stone-200 bg-white/70 px-2.5 py-2 text-xs leading-5 text-stone-800/80">
                    Next step: {card.nextActionLabel}
                  </p>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>

      <Show when={props.showTechnicalDetails}>
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
              {(item) => (
                <li class="text-[10px] leading-4 text-cyan-950/70">
                  {item.userFacingLabel}
                </li>
              )}
            </For>
          </ul>
        </Show>
        <Show when={props.state.expectedBehaviorAuditCard.suggestedTaskItems.length > 0}>
          <div class="mt-3 space-y-1 rounded-2xl border border-cyan-100 bg-white/70 p-2">
            <p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-950/70">
              Suggested tasks
            </p>
            <For each={props.state.expectedBehaviorAuditCard.suggestedTaskItems.slice(0, 3)}>
              {(task) => (
                <p class="text-[10px] leading-4 text-cyan-950/75">
                  {task.title} - {task.dueLabel}
                </p>
              )}
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
      </Show>

      <Show when={props.showTechnicalDetails && props.state.approvalReceiptCards.length > 0}>
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

      <Show when={props.showTechnicalDetails && props.state.decisionRecordCards.length > 0}>
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

      <Show when={props.showTechnicalDetails && props.state.secondOrderLoopCards.length > 0}>
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

      <Show when={props.showTechnicalDetails && props.state.recommendationCards.length > 0}>
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
