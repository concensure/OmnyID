// @locs-version: 1.0
import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { WeddingDateEntryControl } from "@/components/WeddingDateEntryControl";
import {
  buildWeddingHomeOverviewActionTiles,
  buildWeddingHomeTimelineOverview,
} from "@/lib/weddingHomeOverviewState";
import { weddingTimelineWeddingDateLabel } from "@/lib/weddingTimelineWeddingDateState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import {
  calendarActionLabel,
  weddingBudgetSidebarAction,
  weddingDayCountdownDetail,
  weddingDayCountdownLabel,
  weddingTimelinePrimarySidebarAction,
} from "@/lib/weddingWorkspaceSidebarActionState";

export function WeddingHomeOverviewGrid(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction?: (action: WeddingWorkspaceSidebarAction) => void;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  onSaveWeddingDate?: (date: string) => Promise<void> | void;
}) {
  const countdown = () => weddingDayCountdownLabel(props.state);
  const countdownDetail = () => weddingDayCountdownDetail(props.state);
  const hasExactWeddingDate = () => weddingTimelineWeddingDateLabel(props.state) !== null;
  const timelineOverview = () => buildWeddingHomeTimelineOverview(props.state);
  const actionTiles = () => buildWeddingHomeOverviewActionTiles(props.state);
  const budgetTile = () => actionTiles().find((tile) => tile.id === "budget");
  const guestTile = () => actionTiles().find((tile) => tile.id === "guests");
  const seatingTile = () => actionTiles().find((tile) => tile.id === "seating");
  const vendorTile = () => actionTiles().find((tile) => tile.id === "vendors");
  function openBudget() {
    props.onSelectMenu?.("budget");
    props.onSidebarAction?.(weddingBudgetSidebarAction(props.state));
  }
  function openCalendar() {
    props.onSelectMenu?.("timeline");
    props.onSidebarAction?.(weddingTimelinePrimarySidebarAction(props.state));
  }
  function openTimelineOverview() {
    const overview = timelineOverview();
    props.onSelectMenu?.(overview.menuId);
    props.onSidebarAction?.(weddingTimelinePrimarySidebarAction(props.state, overview.selectedRowId));
  }
  function openMenu(menuId: WeddingWorkspaceMenuId | undefined) {
    if (menuId) props.onSelectMenu?.(menuId);
  }

  return (
    <div class="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3">
      <div class="col-span-full min-w-0 rounded-[24px] border border-indigo-100/80 bg-[linear-gradient(135deg,rgba(238,242,255,0.95),rgba(255,255,255,0.9))] p-4 shadow-card">
        <div class="flex items-start justify-between gap-2">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #334155" aria-hidden="true">
            <WeddingDashboardIcon id="calendar-days" class="h-5 w-5" />
          </span>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-indigo-900">Timeline</span>
        </div>
        <p class="mt-3 text-3xl font-bold tracking-tight text-indigo-950">{countdown()}</p>
        <p class="text-xs text-indigo-900/70">{hasExactWeddingDate() ? "days to the wedding" : "target date"}</p>
        {!hasExactWeddingDate() && props.onSaveWeddingDate
          ? (
            <div class="mt-2">
              <WeddingDateEntryControl onSave={props.onSaveWeddingDate} locale="en-AU" compact />
            </div>
          )
          : (
            <button
              type="button"
              class="mt-2 break-words text-left text-xs font-semibold leading-5 text-indigo-950/75 underline decoration-indigo-300 underline-offset-2"
              title={calendarActionLabel(props.state)}
              onClick={openCalendar}
            >
              {countdownDetail()}
            </button>
          )}
        <button
          type="button"
          class="mt-1 block break-words text-left text-xs font-semibold leading-5 text-indigo-950/70 underline decoration-indigo-200 underline-offset-2 transition hover:text-indigo-950"
          title={timelineOverview().actionLabel}
          onClick={openTimelineOverview}
        >
          {timelineOverview().detailLabel}
        </button>
      </div>

      <button type="button" class="min-w-0 rounded-[24px] border border-emerald-100/80 bg-emerald-50/80 p-3 text-left shadow-card transition hover:border-emerald-200 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300" title="Open wedding budget" onClick={openBudget}>
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #B45309" aria-hidden="true">
          <WeddingDashboardIcon id="banknotes" class="h-4 w-4" />
        </span>
        <p class="mt-2 break-words text-xl font-bold text-emerald-950">{budgetTile()?.valueLabel}</p>
        <p class="text-xs text-emerald-900/70">budget status</p>
        <span class="mt-1 inline-flex rounded-full border border-emerald-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-emerald-950">
          {budgetTile()?.toneLabel}
        </span>
        <p class="mt-0.5 break-words text-[11px] text-emerald-900/60">{budgetTile()?.detailLabel}</p>
        <p class="mt-0.5 break-words text-[11px] font-semibold text-emerald-900/70">{budgetTile()?.supportLabel}</p>
      </button>

      <button type="button" class="min-w-0 rounded-[24px] border border-sky-100/80 bg-sky-50/80 p-3 text-left shadow-card transition hover:border-sky-200 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300" title={guestTile()?.actionLabel ?? "Open guests"} onClick={() => openMenu(guestTile()?.menuId)}>
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #0F766E" aria-hidden="true">
          <WeddingDashboardIcon id="users" class="h-4 w-4" />
        </span>
        <p class="mt-2 break-words text-xl font-bold text-sky-950">{guestTile()?.valueLabel}</p>
        <span class="mt-1 inline-flex rounded-full border border-sky-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-sky-950">
          {guestTile()?.toneLabel}
        </span>
        <p class="text-xs text-sky-900/70">{guestTile()?.detailLabel}</p>
        <p class="mt-0.5 break-words text-[11px] text-sky-900/60">{guestTile()?.supportLabel}</p>
      </button>

      <button type="button" class="min-w-0 rounded-[24px] border border-fuchsia-100/80 bg-fuchsia-50/80 p-3 text-left shadow-card transition hover:border-fuchsia-200 hover:bg-fuchsia-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-300" title={seatingTile()?.actionLabel ?? "Open seating"} onClick={() => openMenu(seatingTile()?.menuId)}>
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #7C3AED" aria-hidden="true">
          <WeddingDashboardIcon id="table-cells" class="h-4 w-4" />
        </span>
        <p class="mt-2 break-words text-xl font-bold text-fuchsia-950">{seatingTile()?.valueLabel}</p>
        <span class="mt-1 inline-flex rounded-full border border-fuchsia-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-950">
          {seatingTile()?.toneLabel}
        </span>
        <p class="text-xs text-fuchsia-900/70">{seatingTile()?.detailLabel}</p>
        <p class="mt-0.5 break-words text-[11px] text-fuchsia-900/60">{seatingTile()?.supportLabel}</p>
      </button>

      <button type="button" class="min-w-0 rounded-[24px] border border-amber-100/80 bg-amber-50/85 p-3 text-left shadow-card transition hover:border-amber-200 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300" title={vendorTile()?.actionLabel ?? "Open vendor follow-ups"} onClick={() => openMenu(vendorTile()?.menuId)}>
        <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #D97706" aria-hidden="true">
          <WeddingDashboardIcon id="user-plus" class="h-4 w-4" />
        </span>
        <p class="mt-2 break-words text-xl font-bold text-amber-950">{vendorTile()?.valueLabel}</p>
        <span class="mt-1 inline-flex rounded-full border border-amber-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
          {vendorTile()?.toneLabel}
        </span>
        <p class="text-xs text-amber-900/70">{vendorTile()?.detailLabel}</p>
        <p class="mt-0.5 break-words text-[11px] text-amber-900/60">{vendorTile()?.supportLabel}</p>
      </button>
    </div>
  );
}
