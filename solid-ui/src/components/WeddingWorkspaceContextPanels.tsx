// @locs-version: 2.1
import { createEffect, createMemo, createSignal, For, Show } from "solid-js";

import type { SendAfpMessageInput } from "@/lib/api";
import type {
  WeddingResponseWorkspaceViewState,
} from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import {
  isWeddingWorkspaceMenuId,
  type WeddingWorkspaceMenuId,
} from "@/lib/weddingWorkspaceMenuState";
import { WeddingBackgroundAutomationCard } from "@/components/WeddingBackgroundAutomationCard";
import { WeddingBoundaryManagementCard } from "@/components/WeddingBoundaryManagementCard";
import { WeddingBudgetTrackerCard } from "@/components/WeddingBudgetTrackerCard";
import { WeddingCollaborationAccessCard } from "@/components/WeddingCollaborationAccessCard";
import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { WeddingGuestOperationsCard } from "@/components/WeddingGuestOperationsCard";
import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import { WeddingProductionGateCard } from "@/components/WeddingProductionGateCard";
import {
  buildWeddingBoundaryRequestDecision,
  type WeddingBoundaryRequestDecision,
} from "@/lib/weddingBoundaryDecisionState";
import { weddingBoundaryLedgerObjectToAfpSendInput } from "@/lib/weddingBoundaryLedgerState";
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

function currencyLabel(amount: number | null | undefined): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "Set budget";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function weddingLocationAdviceLabel(state: WeddingResponseWorkspaceViewState): string {
  const locationLabel = state.workspace.artifacts
    .flatMap((artifact) => artifact.locationLabels)
    .find((label) => label.trim().length > 0);
  return locationLabel ?? "your wedding location";
}

function weddingDayCountdownLabel(state: WeddingResponseWorkspaceViewState): string {
  const latestEnd = state.ganttTimeline.rows
    .map((row) => new Date(`${row.endLabel}T09:00:00.000Z`).getTime())
    .filter((time) => Number.isFinite(time))
    .sort((left, right) => right - left)[0];
  if (!latestEnd) return "Add date";
  const days = Math.ceil((latestEnd - Date.now()) / 86_400_000);
  if (days < 0) return "Passed";
  if (days === 0) return "Today";
  return String(days);
}

function weddingDayCountdownDetail(state: WeddingResponseWorkspaceViewState): string {
  const sortedEndLabels = state.ganttTimeline.rows
    .map((row) => row.endLabel)
    .filter(Boolean)
    .sort();
  const latestEnd = sortedEndLabels[sortedEndLabels.length - 1];
  return latestEnd ? `Wedding day: ${latestEnd}` : "Add the wedding date to start the countdown.";
}

function weddingTimelineSidebarAction(
  kind: Extract<WeddingWorkspaceSidebarAction["kind"], "open_calendar" | "open_tasks">,
  state: WeddingResponseWorkspaceViewState,
  rowId?: string,
): WeddingWorkspaceSidebarAction {
  const row = rowId ? state.ganttTimeline.rows.find((item) => item.id === rowId) : null;
  return {
    kind,
    label: kind === "open_calendar" ? "Open wedding calendar" : "Open wedding tasks",
    enabled: kind === "open_calendar" ? state.ganttTimeline.rows.length > 0 : true,
    reason: state.ganttTimeline.rows.length > 0 || kind === "open_tasks"
      ? null
      : "Add dated wedding tasks before opening the calendar timeline.",
    metadata: {
      wedding_timeline: {
        version: 1,
        selected_row_id: row?.id ?? null,
        selected_title: row?.title ?? null,
        selected_start: row?.startLabel ?? null,
        selected_end: row?.endLabel ?? null,
        dated_count: state.ganttTimeline.rows.length,
        undated_count: state.ganttTimeline.undatedItems.length,
      },
    },
    contextLabels: row ? [row.title, row.startLabel, row.endLabel] : state.ganttTimeline.rows.slice(0, 3).map((item) => item.title),
  };
}

function weddingBudgetSidebarAction(state: WeddingResponseWorkspaceViewState): WeddingWorkspaceSidebarAction {
  return {
    kind: "open_budget",
    label: "Open wedding budget",
    enabled: true,
    reason: null,
    metadata: {
      wedding_budget: {
        version: 1,
        target_amount: state.budgetTracking.budgetTargetAmount,
        remaining_amount: state.budgetTracking.remainingAmount,
        known_amount: state.budgetTracking.totalKnownAmount,
      },
    },
    contextLabels: ["Budget", currencyLabel(state.budgetTracking.remainingAmount)],
  };
}

function calendarActionLabel(state: WeddingResponseWorkspaceViewState): string {
  return state.ganttTimeline.rows.length > 0 ? "Open wedding calendar" : "Add wedding date";
}

function taskDueLabel(task: WeddingResponseWorkspaceViewState["planningTaskItems"][number]): string {
  if (task.dueLabel?.trim()) return task.dueLabel;
  if (task.dueAt?.trim()) return task.dueAt.slice(0, 10);
  return "Add due date";
}

function taskIsOverdue(task: WeddingResponseWorkspaceViewState["planningTaskItems"][number]): boolean {
  const due = task.dueAt ? new Date(task.dueAt).getTime() : Number.NaN;
  return Number.isFinite(due) && due < Date.now();
}

function taskPriorityLabel(task: WeddingResponseWorkspaceViewState["planningTaskItems"][number]): string {
  if (task.priority === "urgent") return "Urgent";
  if (task.priority === "high") return "High";
  if (task.priority === "low") return "Low";
  return "Normal";
}

function timelineStatusLabel(status: string | null | undefined): string {
  const normalized = (status ?? "").trim().toLowerCase();
  if (normalized === "accepted" || normalized === "complete" || normalized === "completed") return "Done";
  if (normalized === "draft") return "Draft";
  if (normalized === "high") return "High";
  if (normalized === "urgent") return "Urgent";
  if (normalized === "normal") return "Normal";
  if (normalized === "low") return "Low";
  if (normalized === "planned") return "Planned";
  if (normalized === "anytime") return "Anytime";
  return status?.trim() || "Planned";
}

function timelineBarWidth(widthPercent: number, offsetPercent = 0): number {
  if (!Number.isFinite(widthPercent)) return 8;
  const normalized = Math.max(8, Math.min(28, widthPercent));
  return Math.max(4, Math.min(normalized, 100 - Math.max(0, offsetPercent)));
}

function seatingTaskSidebarAction(
  actionTitle: string,
  state: WeddingResponseWorkspaceViewState,
): WeddingWorkspaceSidebarAction {
  return {
    kind: "open_tasks",
    label: "Open wedding tasks",
    enabled: true,
    reason: null,
    metadata: {
      wedding_seating_task: {
        version: 1,
        title: actionTitle,
        unassigned_attending_count: state.seatingPlan.unassignedAttendingCount,
        table_count: state.seatingPlan.tableCount,
      },
    },
    contextLabels: [actionTitle, "Seating plan"],
  };
}

type WeddingCustomWorkspaceItem = {
  id: string;
  menu: WeddingWorkspaceMenuId;
  kind: "image" | "text";
  title: string;
  body: string;
  imageUrl: string | null;
};

function customWorkspaceStorageKey(scope: string): string {
  return `omnyid:wedding_custom_surface:${scope}`;
}

function customWorkspaceItem(value: unknown): WeddingCustomWorkspaceItem | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<WeddingCustomWorkspaceItem>;
  if (typeof record.id !== "string" || !isWeddingWorkspaceMenuId(record.menu) || typeof record.title !== "string") return null;
  if (record.kind !== "image" && record.kind !== "text") return null;
  return {
    id: record.id,
    menu: record.menu,
    kind: record.kind,
    title: record.title,
    body: typeof record.body === "string" ? record.body : "",
    imageUrl: typeof record.imageUrl === "string" ? record.imageUrl : null,
  };
}

function loadCustomWorkspaceItems(scope: string): WeddingCustomWorkspaceItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(customWorkspaceStorageKey(scope)) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.map(customWorkspaceItem).filter((item): item is WeddingCustomWorkspaceItem => item !== null)
      : [];
  } catch {
    return [];
  }
}

function saveCustomWorkspaceItems(scope: string, items: readonly WeddingCustomWorkspaceItem[]): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(customWorkspaceStorageKey(scope), JSON.stringify(items.slice(0, 24)));
  } catch {
    // Storage can be unavailable or full; the in-page draft still remains usable.
  }
}

function WeddingCustomSurfaceTools(props: {
  activeMenu: WeddingWorkspaceMenuId;
  storageKey: string;
}) {
  const [open, setOpen] = createSignal(false);
  const [mode, setMode] = createSignal<WeddingCustomWorkspaceItem["kind"] | null>(null);
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [imageUrl, setImageUrl] = createSignal<string | null>(null);
  const [items, setItems] = createSignal<WeddingCustomWorkspaceItem[]>(loadCustomWorkspaceItems(props.storageKey));
  const visibleItems = createMemo(() => items().filter((item) => item.menu === props.activeMenu));

  createEffect(() => {
    saveCustomWorkspaceItems(props.storageKey, items());
  });

  function resetDraft() {
    setTitle("");
    setBody("");
    setImageUrl(null);
    setMode(null);
  }

  function addItem(kind: WeddingCustomWorkspaceItem["kind"]) {
    const safeTitle = title().trim() || (kind === "image" ? "Wedding image" : "Planning note");
    const safeBody = body().trim();
    if (kind === "text" && !safeBody) return;
    if (kind === "image" && !imageUrl()) return;
    setItems((current) => [
      ...current,
      {
        id: `wedding-custom-${Date.now()}-${current.length}`,
        menu: props.activeMenu,
        kind,
        title: safeTitle,
        body: safeBody,
        imageUrl: imageUrl(),
      },
    ]);
    resetDraft();
    setOpen(false);
  }

  function moveItem(id: string, direction: -1 | 1) {
    setItems((current) => {
      const pageItems = current.filter((item) => item.menu === props.activeMenu);
      const pageIndex = pageItems.findIndex((item) => item.id === id);
      const swapIndex = pageIndex + direction;
      if (pageIndex < 0 || swapIndex < 0 || swapIndex >= pageItems.length) return current;
      const reordered = [...pageItems];
      const moving = reordered[pageIndex]!;
      reordered[pageIndex] = reordered[swapIndex]!;
      reordered[swapIndex] = moving;
      let nextPageIndex = 0;
      return current.map((item) => item.menu === props.activeMenu ? reordered[nextPageIndex++]! : item);
    });
  }

  function removeItem(id: string) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  function selectImage(event: Event) {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!title().trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") setImageUrl(reader.result);
    });
    reader.readAsDataURL(file);
  }

  return (
    <div class="rounded-[24px] border border-white/60 bg-white/75 p-3 shadow-card backdrop-blur sm:rounded-[28px]">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-on-surface">Add something here</p>
          <p class="mt-1 text-xs leading-5 text-on-surface-variant">
            Add a photo or note to this wedding page and move it into the order you like.
          </p>
        </div>
        <div class="relative">
          <button
            type="button"
            class="flex h-10 w-10 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-lg font-bold text-rose-950 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            title="Add a photo or note"
            aria-label="Add a photo or note"
            aria-expanded={open()}
            onClick={() => setOpen((current) => !current)}
          >
            +
          </button>
          <Show when={open()}>
            <div class="absolute right-0 z-20 mt-2 w-52 rounded-2xl border border-stone-200 bg-white p-2 shadow-xl">
              <button
                type="button"
                class="w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
                onClick={() => setMode(mode() === "image" ? null : "image")}
              >
                Image
              </button>
              <button
                type="button"
                class="mt-1 w-full rounded-xl px-3 py-2 text-left text-sm font-semibold text-stone-800 transition hover:bg-stone-50"
                onClick={() => setMode(mode() === "text" ? null : "text")}
              >
                Text note
              </button>
            </div>
          </Show>
        </div>
      </div>

      <Show when={mode()}>
        {(selectedMode) => (
          <div class="mt-3 rounded-2xl border border-stone-200 bg-white/80 p-3">
            <label class="text-xs font-semibold text-stone-700">
              Title
              <input
                class="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                value={title()}
                onInput={(event) => setTitle(event.currentTarget.value)}
                placeholder={selectedMode() === "image" ? "Photo title" : "Note title"}
              />
            </label>
            <Show when={selectedMode() === "image"} fallback={
              <label class="mt-3 block text-xs font-semibold text-stone-700">
                Text
                <textarea
                  class="mt-1 min-h-24 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
                  value={body()}
                  onInput={(event) => setBody(event.currentTarget.value)}
                  placeholder="Write the note you want to keep here."
                />
              </label>
            }>
              <label class="mt-3 block text-xs font-semibold text-stone-700">
                Upload image
                <input
                  class="mt-1 block w-full text-sm text-stone-700 file:mr-3 file:rounded-full file:border-0 file:bg-rose-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-rose-950"
                  type="file"
                  accept="image/*"
                  onChange={selectImage}
                />
              </label>
              <Show when={imageUrl()}>
                {(url) => <img src={url()} alt={title() || "Uploaded wedding image"} class="mt-3 max-h-48 w-full rounded-2xl object-cover" />}
              </Show>
            </Show>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                class="rounded-full bg-rose-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-800 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={selectedMode() === "image" ? !imageUrl() : !body().trim()}
                onClick={() => addItem(selectedMode())}
              >
                Add
              </button>
              <button
                type="button"
                class="rounded-full border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition hover:bg-stone-50"
                onClick={resetDraft}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Show>

      <Show when={visibleItems().length > 0}>
        <div class="mt-3 space-y-2">
          <For each={visibleItems()}>
            {(item, index) => (
              <article class="rounded-2xl border border-stone-200 bg-white/80 p-3">
                <div class="flex items-start justify-between gap-2">
                  <p class="break-words text-sm font-semibold text-stone-900">{item.title}</p>
                  <div class="flex shrink-0 flex-wrap justify-end gap-1">
                    <button type="button" class="rounded-full border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700 disabled:opacity-40" disabled={index() === 0} onClick={() => moveItem(item.id, -1)}>Up</button>
                    <button type="button" class="rounded-full border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700 disabled:opacity-40" disabled={index() === visibleItems().length - 1} onClick={() => moveItem(item.id, 1)}>Down</button>
                    <button type="button" class="rounded-full border border-stone-200 px-2 py-1 text-xs font-semibold text-stone-700" onClick={() => removeItem(item.id)}>Remove</button>
                  </div>
                </div>
                <Show when={item.imageUrl} fallback={<p class="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-stone-700">{item.body}</p>}>
                  {(url) => <img src={url()} alt={item.title} class="mt-2 max-h-72 w-full rounded-2xl object-cover" />}
                </Show>
              </article>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}

// Always-visible at-a-glance summary for the Home tab — unlike WeddingDecisionFocusCard
// (which only renders once personalOsProjection.hasWeddingPersonalOsSignal is true), this
// has nothing to hide behind, so a first-time couple with nothing set up yet still sees
// where things stand instead of a blank Home tab. Deliberately asymmetric (one wide hero
// tile + three square ones) with a category icon on each, per feedback that a uniform
// grid of text-only cards reads as flat and unclear.
export function WeddingHomeOverviewGrid(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction?: (action: WeddingWorkspaceSidebarAction) => void;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
}) {
  const countdown = () => weddingDayCountdownLabel(props.state);
  const countdownDetail = () => weddingDayCountdownDetail(props.state);
  const nextMilestone = () => {
    const upcoming = props.state.ganttTimeline.rows
      .filter((row) => row.statusLabel.toLowerCase() !== "done" && row.statusLabel.toLowerCase() !== "complete")
      .sort((left, right) => left.endLabel.localeCompare(right.endLabel))[0];
    return upcoming ? `Next: ${upcoming.title}` : "No upcoming timeline items yet.";
  };
  const budgetTarget = () => props.state.budgetTracking.budgetTargetAmount;
  const budgetRemaining = () => {
    const remaining = props.state.budgetTracking.remainingAmount;
    if (remaining === null) return currencyLabel(null);
    return remaining >= 0 ? currencyLabel(remaining) : `${currencyLabel(Math.abs(remaining))} over`;
  };
  const budgetDetail = () => {
    const target = budgetTarget();
    return target === null ? "No overall budget set yet." : `of ${currencyLabel(target)} total budget`;
  };
  const guests = () => props.state.guestTracking;
  const respondedCount = () => guests().attendingCount + guests().declinedCount;
  const seating = () => props.state.seatingPlan;
  function openBudget() {
    props.onSelectMenu?.("budget");
    props.onSidebarAction?.(weddingBudgetSidebarAction(props.state));
  }
  function openCalendar() {
    props.onSelectMenu?.("timeline");
    props.onSidebarAction?.(weddingTimelineSidebarAction("open_calendar", props.state));
  }

  return (
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div class="col-span-2 min-w-0 rounded-[24px] border border-indigo-100/80 bg-[linear-gradient(135deg,rgba(238,242,255,0.95),rgba(255,255,255,0.9))] p-4 shadow-card">
        <div class="flex items-start justify-between gap-2">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #334155" aria-hidden="true">
            <WeddingDashboardIcon id="calendar-days" class="h-5 w-5" />
          </span>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-indigo-900">Timeline</span>
        </div>
        <p class="mt-3 text-3xl font-bold tracking-tight text-indigo-950">{countdown()}</p>
        <p class="text-xs text-indigo-900/70">days to the wedding</p>
        <button
          type="button"
          class="mt-2 break-words text-left text-xs font-semibold leading-5 text-indigo-950/75 underline decoration-indigo-300 underline-offset-2"
          title={calendarActionLabel(props.state)}
          onClick={openCalendar}
        >
          {countdownDetail()}
        </button>
        <p class="mt-1 break-words text-xs leading-5 text-indigo-950/70">{nextMilestone()}</p>
      </div>

      <button
        type="button"
        class="min-w-0 rounded-[24px] border border-emerald-100/80 bg-emerald-50/80 p-3 text-left shadow-card transition hover:border-emerald-200 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
        title="Open wedding budget"
        onClick={openBudget}
      >
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #B45309" aria-hidden="true">
          <WeddingDashboardIcon id="banknotes" class="h-4 w-4" />
        </span>
        <p class="mt-2 break-words text-xl font-bold text-emerald-950">{budgetRemaining()}</p>
        <p class="text-xs text-emerald-900/70">budget left</p>
        <p class="mt-0.5 break-words text-[11px] text-emerald-900/60">{budgetDetail()}</p>
      </button>

      <div class="min-w-0 rounded-[24px] border border-sky-100/80 bg-sky-50/80 p-3 shadow-card">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #0F766E" aria-hidden="true">
          <WeddingDashboardIcon id="users" class="h-4 w-4" />
        </span>
        <p class="mt-2 break-words text-xl font-bold text-sky-950">{guests().attendingCount} attending</p>
        <p class="text-xs text-sky-900/70">{respondedCount()} of {guests().guestRowCount} invited have RSVP'd</p>
        <p class="mt-0.5 break-words text-[11px] text-sky-900/60">{guests().pendingCount} still pending</p>
      </div>

      <div class="min-w-0 rounded-[24px] border border-fuchsia-100/80 bg-fuchsia-50/80 p-3 shadow-card">
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #7C3AED" aria-hidden="true">
          <WeddingDashboardIcon id="table-cells" class="h-4 w-4" />
        </span>
        <p class="mt-2 break-words text-xl font-bold text-fuchsia-950">{seating().assignedSeatCount} seated</p>
        <p class="text-xs text-fuchsia-900/70">{seating().unassignedAttendingCount} still unassigned</p>
      </div>
    </div>
  );
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
  const budgetRemaining = () => {
    const remaining = props.state.budgetTracking.remainingAmount;
    if (remaining === null) return currencyLabel(null);
    return remaining >= 0 ? currencyLabel(remaining) : `${currencyLabel(Math.abs(remaining))} over`;
  };
  const countdown = () => weddingDayCountdownLabel(props.state);
  function openBudget() {
    props.onSidebarAction(weddingBudgetSidebarAction(props.state));
  }
  function openCalendar() {
    props.onSidebarAction(weddingTimelineSidebarAction("open_calendar", props.state));
  }
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
        <div class="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            class="rounded-2xl border border-pink-100 bg-white/75 px-3 py-2 text-left transition hover:border-pink-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
            title="Open wedding budget"
            onClick={openBudget}
          >
            <p class="text-xs font-semibold text-pink-950/65">Budget left</p>
            <p class="mt-1 break-words text-2xl font-semibold text-pink-950">{budgetRemaining()}</p>
          </button>
          <button
            type="button"
            class="rounded-2xl border border-pink-100 bg-white/75 px-3 py-2 text-left transition hover:border-pink-200 hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300"
            title={calendarActionLabel(props.state)}
            onClick={openCalendar}
          >
            <p class="text-xs font-semibold text-pink-950/65">Days to wedding</p>
            <p class="mt-1 break-words text-2xl font-semibold text-pink-950">{countdown()}</p>
            <p class="mt-1 text-xs leading-5 text-pink-950/60">{weddingDayCountdownDetail(props.state)}</p>
          </button>
        </div>
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
  showHomeOverview?: boolean;
  activeMenu?: WeddingWorkspaceMenuId;
  sharePlanOpen?: boolean;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: () => void;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  onOpenArtifact?: (artifactId: string) => void;
  onOpenSavedOutputs?: () => void;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
}) {
  const activeMenu = () => props.activeMenu ?? "home";
  const [doneTaskIds, setDoneTaskIds] = createSignal<Record<string, true>>({});
  const [taskAssignees, setTaskAssignees] = createSignal<Record<string, string>>({});
  const [taskConsultedPeople, setTaskConsultedPeople] = createSignal<Record<string, string>>({});
  const [taskLastContactDates, setTaskLastContactDates] = createSignal<Record<string, string>>({});
  const [customHelperName, setCustomHelperName] = createSignal("");
  const [customHelpers, setCustomHelpers] = createSignal<string[]>([]);
  const helperPeople = createMemo(() => {
    const seen = new Set<string>();
    const names = [
      ...props.state.helperContactNames,
      ...customHelpers(),
      "Partner 1",
      "Partner 2",
    ].filter((name) => {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return names.length > 0 ? names : ["Partner 1", "Partner 2"];
  });
  const helperTasks = createMemo(() => props.state.planningTaskItems.slice(0, 30));
  const taskAssignee = (task: WeddingResponseWorkspaceViewState["planningTaskItems"][number]) =>
    taskAssignees()[task.id] ?? task.assignee ?? "Unassigned";
  const openHelperTasks = createMemo(() => helperTasks().filter((task) => !doneTaskIds()[task.id]));
  const doneHelperTasks = createMemo(() => helperTasks().filter((task) => doneTaskIds()[task.id]));
  const workloadRows = createMemo(() => helperPeople().map((name) => {
    const tasks = openHelperTasks().filter((task) => taskAssignee(task) === name);
    return {
      name,
      openCount: tasks.length,
      overdueCount: tasks.filter(taskIsOverdue).length,
      workloadLabel: `${tasks.length} open task${tasks.length === 1 ? "" : "s"}`,
    };
  }));
  const workloadSuggestion = createMemo(() => {
    const rows = workloadRows().filter((row) => row.openCount > 0).sort((left, right) => right.openCount - left.openCount);
    const busiest = rows[0];
    const lightest = rows[rows.length - 1];
    if (!busiest || !lightest || busiest.openCount - lightest.openCount < 3) return "Workload looks reasonably balanced right now.";
    return `${busiest.name} has ${busiest.openCount} open tasks and ${lightest.name} has ${lightest.openCount}. Consider moving two lower-priority tasks or inviting a helper.`;
  });
  const weeklyAgendaItems = createMemo(() => openHelperTasks()
    .slice()
    .sort((left, right) => {
      if (taskIsOverdue(left) !== taskIsOverdue(right)) return taskIsOverdue(left) ? -1 : 1;
      return taskDueLabel(left).localeCompare(taskDueLabel(right));
    })
    .slice(0, 5));
  function setTaskDone(taskId: string, done: boolean): void {
    setDoneTaskIds((current) => {
      const next = { ...current };
      if (done) next[taskId] = true;
      else delete next[taskId];
      return next;
    });
  }
  function addCustomHelper(): void {
    const name = customHelperName().trim();
    if (!name) return;
    setCustomHelpers((current) => current.some((item) => item.toLowerCase() === name.toLowerCase()) ? current : [...current, name]);
    setCustomHelperName("");
  }
  async function saveBudgetAllocation(input: SendAfpMessageInput) {
    if (!props.saveProjection) throw new Error("Saving is not connected yet.");
    await props.saveProjection(input);
    props.onRefreshWorkspace?.();
  }
  async function decideBoundaryRequest(requestId: string, decision: WeddingBoundaryRequestDecision): Promise<string> {
    if (!props.saveProjection) throw new Error("Saving is not connected yet.");
    const request = props.state.boundaryState.approvalQueue.find((item) => item.requestId === requestId);
    if (!request) throw new Error("This guest-list request is no longer waiting for review.");
    const result = buildWeddingBoundaryRequestDecision({
      request,
      decision,
      decidedBy: "couple",
      publicReason: decision === "approve"
        ? "Approved by the couple."
        : "Declined by the couple.",
    });
    await props.saveProjection(weddingBoundaryLedgerObjectToAfpSendInput(result.updatedRequest, props.state.workspace.metadata));
    if (result.rationale) {
      await props.saveProjection(weddingBoundaryLedgerObjectToAfpSendInput(result.rationale, props.state.workspace.metadata));
    }
    props.onRefreshWorkspace?.();
    return result.statusLabel;
  }
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

      <Show when={activeMenu() !== "advanced"}>
        <WeddingCustomSurfaceTools
          activeMenu={activeMenu()}
          storageKey={props.state.workspace.metadata.responseWorkspaceId}
        />
      </Show>

      <Show when={(props.showHomeOverview ?? true) && activeMenu() === "home"}>
        <WeddingPanelSection
          label="Planning snapshot"
          detail="The main wedding details to check today."
          tone="everyday"
        />
        <div class="mt-3">
          <WeddingHomeOverviewGrid
            state={props.state}
            onSelectMenu={props.onSelectMenu}
            onSidebarAction={props.onSidebarAction}
          />
        </div>
      </Show>

      <Show when={props.sharePlanOpen}>
        <WeddingCollaborationAccessCard state={props.state.collaboration} />
      </Show>

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

      <div hidden={activeMenu() !== "budget"}>
        <WeddingBudgetTrackerCard
          state={props.state.budgetTracking}
          weddingPlanId={props.state.workspace.metadata.weddingPlanId}
          locationLabel={weddingLocationAdviceLabel(props.state)}
          metadata={props.state.workspace.metadata}
          onSaveAllocation={saveBudgetAllocation}
        />
      </div>

      <div hidden={activeMenu() !== "guests"}>
        <WeddingGuestOperationsCard state={props.state.guestTracking} />
        <div class="mt-3">
          <WeddingBoundaryManagementCard
            state={props.state.boundaryState}
            topology={props.state.boundaryTopology}
            onDecideRequest={decideBoundaryRequest}
          />
        </div>
      </div>

      <div hidden={activeMenu() !== "seating"}>
      <div class="min-w-0 rounded-[24px] border border-sky-100/80 bg-sky-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #7C3AED" aria-hidden="true">
              <WeddingDashboardIcon id="table-cells" class="h-4 w-4" />
            </span>
            <p class="text-lg font-bold tracking-tight text-sky-950">Seating plan</p>
            <WeddingInfoTip title="Seating tip" tone="sky">
              Start with households, VIPs, accessibility needs, and known guest tensions. Share table counts and meal needs with vendors, but keep private relationship notes only for the couple.
            </WeddingInfoTip>
          </div>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-sky-900">
            {props.state.seatingPlan.statusLabel}
          </span>
        </div>
        <p class="mt-2 text-sm leading-6 text-sky-900/75">
          {props.state.seatingPlan.summaryLabel}
        </p>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 px-3 py-2">
          <p class="text-sm font-semibold text-sky-950">
            {props.state.seatingPlan.guestRowsConsidered > 0 ? "Seating draft can start from your guest list." : "Add attending guests to start a seating draft."}
          </p>
          <p class="mt-1 text-xs leading-5 text-sky-950/70">
            {props.state.seatingPlan.guestRowsConsidered > 0
              ? "OmnyID can group guests into a first draft when the guest list includes names and attendance. Household, meal, access, and table notes make the draft better."
              : "Once attending guests are saved, this page can suggest table counts and seating follow-ups."}
          </p>
          <button
            type="button"
            class="mt-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-950 transition hover:bg-white"
            onClick={() => props.onSelectMenu?.("guests")}
          >
            Open guest list
          </button>
        </div>
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
            <ul class="mt-2 space-y-2">
              <For each={props.state.seatingPlan.actionItems.slice(0, 4)}>
                {(item) => (
                  <li class="rounded-xl border border-sky-100 bg-sky-50/70 px-2.5 py-2 text-xs leading-5 text-sky-950/70">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <span><span class="font-semibold">{item.title}</span> - {item.priorityLabel}</span>
                      <button
                        type="button"
                        class="rounded-full border border-sky-100 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-sky-950 transition hover:bg-white"
                        onClick={() => props.onSidebarAction(seatingTaskSidebarAction(item.title, props.state))}
                      >
                        Open task
                      </button>
                    </div>
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
      </div>

      <div hidden={activeMenu() !== "helpers"}>
      <div class="min-w-0 rounded-[24px] border border-fuchsia-100/80 bg-fuchsia-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #C2410C" aria-hidden="true">
                <WeddingDashboardIcon id="user-plus" class="h-4 w-4" />
              </span>
              <p class="text-lg font-bold tracking-tight text-fuchsia-950">Who is helping</p>
              <WeddingInfoTip title="Helper tip" tone="fuchsia">
                Give each task one owner and one due date. Use Consult when someone should be asked, but should not become responsible for finishing the task.
              </WeddingInfoTip>
            </div>
            <p class="mt-1 text-sm leading-6 text-fuchsia-900/75">
              Give every wedding task one clear owner, a due date, and someone to consult when needed.
            </p>
          </div>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-fuchsia-900">
            {openHelperTasks().length} to do
          </span>
        </div>
        <div class="mt-3 grid gap-2 md:grid-cols-3">
          <For each={workloadRows().slice(0, 6)}>
            {(row) => (
              <div class="rounded-2xl border border-fuchsia-100 bg-white/75 px-3 py-2">
                <p class="break-words text-xs font-semibold text-fuchsia-950">{row.name}</p>
                <p class="mt-1 text-sm font-semibold text-fuchsia-900">{row.workloadLabel}</p>
                <p class="mt-0.5 text-xs leading-5 text-fuchsia-900/65">{row.overdueCount} overdue</p>
              </div>
            )}
          </For>
        </div>
        <p class="mt-3 rounded-2xl border border-fuchsia-100 bg-white/70 px-3 py-2 text-sm leading-6 text-fuchsia-950/75">
          {workloadSuggestion()}
        </p>
        <div class="mt-3 flex flex-col gap-2 rounded-2xl border border-fuchsia-100 bg-white/70 p-3 sm:flex-row sm:items-end">
          <label class="min-w-0 flex-1 text-xs font-semibold text-fuchsia-950">
            Add a helper
            <input
              value={customHelperName()}
              onInput={(event) => setCustomHelperName(event.currentTarget.value)}
              placeholder="Name from contacts, guest list, family, or coordinator"
              class="mt-1 w-full rounded-full border border-fuchsia-100 bg-white px-3 py-2 text-sm font-normal text-fuchsia-950 outline-none focus:border-fuchsia-300"
            />
          </label>
          <button
            type="button"
            disabled={!customHelperName().trim()}
            onClick={addCustomHelper}
            class="rounded-full border border-fuchsia-200 bg-fuchsia-100/80 px-3 py-2 text-xs font-semibold text-fuchsia-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
          >
            Add person
          </button>
        </div>
        <div class="mt-3 rounded-2xl border border-fuchsia-100 bg-white/70 p-3">
          <p class="text-sm font-semibold text-fuchsia-950">Weekly 10-minute agenda</p>
          <Show when={weeklyAgendaItems().length > 0} fallback={<p class="mt-1 text-sm leading-6 text-fuchsia-950/70">No open tasks need review right now.</p>}>
            <ol class="mt-2 space-y-1">
              <For each={weeklyAgendaItems()}>
                {(task) => (
                  <li class="text-xs leading-5 text-fuchsia-950/75">
                    {task.title} - {taskAssignee(task)} - {taskDueLabel(task)}
                  </li>
                )}
              </For>
            </ol>
          </Show>
        </div>
        <Show when={helperTasks().length > 0} fallback={
          <div class="mt-3 rounded-2xl border border-fuchsia-100 bg-white/70 p-2">
            <p class="text-sm leading-6 text-fuchsia-950/75">
              No tasks are ready to assign yet. Add wedding tasks, import a list, or ask OmnyID to create the next planning checklist.
            </p>
          </div>
        }>
          <div class="mt-3 space-y-2">
            <For each={openHelperTasks()}>
              {(task) => (
                <article class="rounded-2xl border border-fuchsia-100 bg-white/75 p-3">
                  <div class="flex flex-wrap items-start justify-between gap-2">
                    <div class="min-w-0">
                      <p class="break-words text-sm font-semibold text-fuchsia-950">{task.title}</p>
                      <p class="mt-1 text-xs leading-5 text-fuchsia-900/70">
                        Due:{" "}
                        <button
                          type="button"
                          class="font-semibold underline decoration-fuchsia-300 underline-offset-2"
                          title="Open this task"
                          onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_tasks", props.state, task.id))}
                        >
                          {taskDueLabel(task)}
                        </button>
                        {" "}- Priority: {taskPriorityLabel(task)}
                      </p>
                    </div>
                    <span class="max-w-full break-words rounded-full bg-fuchsia-50 px-2 py-1 text-xs text-fuchsia-900">
                      To do
                    </span>
                  </div>
                  <div class="mt-3 grid gap-2 md:grid-cols-3">
                    <label class="text-xs font-semibold text-fuchsia-950">
                      Owner
                      <select
                        value={taskAssignee(task)}
                        onChange={(event) => setTaskAssignees((current) => ({ ...current, [task.id]: event.currentTarget.value }))}
                        class="mt-1 w-full rounded-full border border-fuchsia-100 bg-white px-3 py-2 text-xs font-medium text-fuchsia-950 outline-none"
                      >
                        <option value="Unassigned">Unassigned</option>
                        <For each={helperPeople()}>
                          {(name) => <option value={name}>{name}</option>}
                        </For>
                      </select>
                    </label>
                    <label class="text-xs font-semibold text-fuchsia-950">
                      Consult
                      <select
                        value={taskConsultedPeople()[task.id] ?? "No one yet"}
                        onChange={(event) => setTaskConsultedPeople((current) => ({ ...current, [task.id]: event.currentTarget.value }))}
                        class="mt-1 w-full rounded-full border border-fuchsia-100 bg-white px-3 py-2 text-xs font-medium text-fuchsia-950 outline-none"
                      >
                        <option value="No one yet">No one yet</option>
                        <For each={helperPeople()}>
                          {(name) => <option value={name}>{name}</option>}
                        </For>
                      </select>
                    </label>
                    <label class="text-xs font-semibold text-fuchsia-950">
                      Last contact
                      <input
                        type="date"
                        value={taskLastContactDates()[task.id] ?? ""}
                        onInput={(event) => setTaskLastContactDates((current) => ({ ...current, [task.id]: event.currentTarget.value }))}
                        class="mt-1 w-full rounded-full border border-fuchsia-100 bg-white px-3 py-2 text-xs font-medium text-fuchsia-950 outline-none"
                      />
                      <span class="mt-1 block text-[11px] font-normal leading-4 text-fuchsia-900/60">
                        For this page. Vendor follow-ups are tracked in Response queue.
                      </span>
                    </label>
                  </div>
                  <button
                    type="button"
                    class="mt-3 rounded-full border border-fuchsia-200 bg-fuchsia-100/80 px-3 py-2 text-xs font-semibold text-fuchsia-950 transition hover:bg-white sm:py-1.5"
                    onClick={() => setTaskDone(task.id, true)}
                  >
                    Mark done
                  </button>
                </article>
              )}
            </For>
          </div>
        </Show>
        <Show when={doneHelperTasks().length > 0}>
          <div class="mt-3 rounded-2xl border border-fuchsia-100 bg-white/70 p-3">
            <p class="text-sm font-semibold text-fuchsia-950">Done</p>
            <div class="mt-2 space-y-1">
              <For each={doneHelperTasks()}>
                {(task) => (
                  <div class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-fuchsia-100 bg-white/75 px-3 py-2">
                    <p class="break-words text-xs font-semibold text-fuchsia-950">{task.title}</p>
                    <button
                      type="button"
                      class="rounded-full border border-fuchsia-100 bg-fuchsia-50 px-2 py-1 text-[11px] font-semibold text-fuchsia-950"
                      onClick={() => setTaskDone(task.id, false)}
                    >
                      Move to to-do
                    </button>
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>
      </div>

      <div hidden={activeMenu() !== "timeline"}>
      <div class="min-w-0 rounded-[24px] border border-indigo-100/80 bg-indigo-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <p class="text-base font-semibold text-indigo-950">Timeline</p>
              <WeddingInfoTip title="Timeline tip" tone="indigo">
                Put legal deadlines, payment due dates, and vendor lock-in dates on the calendar. If a date is still uncertain, keep it as a task until it is confirmed.
              </WeddingInfoTip>
            </div>
            <p class="mt-1 text-sm leading-6 text-indigo-900/70">
              Open dated items in Calendar, or review all wedding tasks in Tasks.
            </p>
          </div>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-indigo-900">
            {props.state.ganttTimeline.rows.length} dated item{props.state.ganttTimeline.rows.length === 1 ? "" : "s"}
          </span>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={props.state.ganttTimeline.rows.length === 0}
            class="rounded-full border border-indigo-200 bg-white/85 px-3 py-2 text-xs font-semibold text-indigo-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 sm:py-1.5"
            onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_calendar", props.state))}
          >
            Open wedding calendar
          </button>
          <button
            type="button"
            class="rounded-full border border-indigo-200 bg-indigo-100/80 px-3 py-2 text-xs font-semibold text-indigo-950 transition hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-45 sm:py-1.5"
            onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_tasks", props.state))}
          >
            Open wedding tasks
          </button>
        </div>
        <Show when={props.state.ganttTimeline.rows.length === 0}>
          <p class="mt-2 text-xs leading-5 text-indigo-950/65">
            Add a task with a date before opening the calendar view.
          </p>
        </Show>
        <Show when={props.state.ganttTimeline.undatedItems.length > 0}>
          <div class="mt-3 rounded-2xl border border-indigo-100 bg-white/75 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs font-semibold text-indigo-950/70">Done or no-date items</p>
              <button
                type="button"
                disabled={!props.onOpenSavedOutputs}
                class="rounded-full border border-indigo-100 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-indigo-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                onClick={() => props.onOpenSavedOutputs?.()}
              >
                All files
              </button>
            </div>
            <ul class="mt-2 space-y-2">
              <For each={props.state.ganttTimeline.undatedItems.slice(0, 4)}>
                {(item) => (
                  <li class="rounded-xl border border-indigo-100 bg-indigo-50/60 px-2.5 py-2 text-xs leading-5 text-indigo-950/70">
                    <button
                      type="button"
                      class="text-left font-semibold underline decoration-indigo-300 underline-offset-2"
                      onClick={() => item.linkedArtifactId
                        ? props.onOpenArtifact?.(item.linkedArtifactId)
                        : props.onSidebarAction(weddingTimelineSidebarAction("open_tasks", props.state, item.id))}
                    >
                      {item.title}
                    </button>
                    <span> - {item.categoryLabel} - </span>
                    <button
                      type="button"
                      class="font-semibold underline decoration-indigo-300 underline-offset-2"
                      onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_tasks", props.state, item.id))}
                    >
                      {timelineStatusLabel(item.statusLabel)}
                    </button>
                    <Show when={item.linkedArtifactId}>
                      <button
                        type="button"
                        class="ml-2 rounded-full border border-indigo-100 bg-white/80 px-2 py-0.5 text-[11px] font-semibold text-indigo-950 transition hover:bg-white"
                        onClick={() => props.onOpenArtifact?.(item.linkedArtifactId!)}
                      >
                        View file
                      </button>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
        <Show when={props.state.ganttTimeline.rows.length > 0} fallback={
          <div class="mt-3 rounded-2xl border border-indigo-100 bg-white/70 px-3 py-3">
            <p class="text-sm font-semibold text-indigo-950">No dated timeline yet</p>
            <p class="mt-1 text-sm leading-6 text-indigo-950/70">
              {props.state.ganttTimeline.blockerLabels[0] ?? "Add wedding tasks with dates, then they will appear here and in Calendar."}
            </p>
            <button
              type="button"
              class="mt-3 rounded-full border border-indigo-200 bg-indigo-100/80 px-3 py-2 text-xs font-semibold text-indigo-950 transition hover:bg-indigo-50 sm:py-1.5"
              onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_tasks", props.state))}
            >
              Open Tasks
            </button>
          </div>
        }>
          <div class="mt-3 space-y-2">
            <For each={props.state.ganttTimeline.rows.slice(0, 6)}>
              {(row) => (
                <article class="min-w-0">
                  <div class="mb-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <p class="min-w-0 break-words text-sm font-semibold text-indigo-950">{row.title}</p>
                    <button
                      type="button"
                      class="shrink-0 text-left text-xs font-semibold text-indigo-900/75 underline decoration-indigo-300 underline-offset-2"
                      title="Open this date in the wedding calendar"
                      onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_calendar", props.state, row.id))}
                    >
                      {row.startLabel}
                    </button>
                  </div>
                  <div class="h-3 rounded-full bg-white/80">
                    <div
                      class="h-3 rounded-full"
                      style={{
                        "margin-left": `${row.offsetPercent}%`,
                        width: `${timelineBarWidth(row.widthPercent, row.offsetPercent)}%`,
                        "background-color": row.color,
                      }}
                    />
                  </div>
                  <p class="mt-1 break-words text-xs leading-5 text-indigo-950/65">
                    {row.categoryLabel} - {row.durationDays} day{row.durationDays === 1 ? "" : "s"} - {timelineStatusLabel(row.statusLabel)}
                  </p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      class="rounded-full border border-indigo-100 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-indigo-950 transition hover:bg-white"
                      onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_calendar", props.state, row.id))}
                    >
                      View date
                    </button>
                    <button
                      type="button"
                      class="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-950 transition hover:bg-white"
                      onClick={() => props.onSidebarAction(weddingTimelineSidebarAction("open_tasks", props.state, row.id))}
                    >
                      View task
                    </button>
                    <Show when={row.linkedArtifactId}>
                      <button
                        type="button"
                        class="rounded-full border border-indigo-100 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-indigo-950 transition hover:bg-white"
                        onClick={() => props.onOpenArtifact?.(row.linkedArtifactId!)}
                      >
                        View file
                      </button>
                    </Show>
                  </div>
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
      </div>

      <div hidden={activeMenu() !== "home" || props.state.contextCards.length === 0}>
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
      </div>

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

      <div hidden={activeMenu() !== "response_queue" || props.state.vendorContactCards.length === 0}>
        <div class="min-w-0 rounded-[24px] border border-amber-100/80 bg-amber-50/85 p-3 shadow-card sm:rounded-[28px] sm:p-4">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
              <p class="break-words text-base font-semibold text-amber-950">Vendors to follow up</p>
              <WeddingInfoTip title="Follow-up tip" tone="rose">
                After an outreach email, wait about 3 to 5 business days before nudging. Keep the last-contact date updated so the planner can suggest the next step without guesswork.
              </WeddingInfoTip>
            </div>
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
      </div>

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
