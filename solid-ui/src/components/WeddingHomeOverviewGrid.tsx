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
  weddingDayCountdownDetail,
  weddingDayCountdownLabel,
  weddingTimelinePrimarySidebarAction,
} from "@/lib/weddingWorkspaceSidebarActionState";

export function WeddingHomeOverviewGrid(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction?: (action: WeddingWorkspaceSidebarAction) => void;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  onSaveWeddingDate?: (date: string) => Promise<void> | void;
  dense?: boolean;
}) {
  const dense = () => props.dense === true;
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
    // This is an in-planner tab change. Sending the sidebar action afterwards
    // also emits a global navigation event, which can overwrite the local tab
    // with the generic Response Queue surface.
    props.onSelectMenu?.("budget");
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
  function openVendorFollowUps() {
    // Vendor replies are rendered in the wedding-home follow-up panel. Keep
    // the planner on its wedding surface and take the user directly to it.
    props.onSelectMenu?.("home");
    if (typeof window === "undefined") return;
    window.setTimeout(() => {
      document.querySelector("[data-wedding-home-section='vendor_follow_up']")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 0);
  }

  return (
    <div class={`grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 sm:grid-cols-3 ${dense() ? "grid-cols-2" : ""}`}>
      <div class={`col-span-full min-w-0 rounded-[24px] border border-indigo-100/80 bg-[linear-gradient(135deg,rgba(238,242,255,0.95),rgba(255,255,255,0.9))] shadow-card ${dense() ? "p-3" : "p-4"}`}>
        <div class="flex items-start justify-between gap-2">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #334155" aria-hidden="true">
            <WeddingDashboardIcon id="calendar-days" class="h-5 w-5" />
          </span>
          <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-indigo-900">Timeline</span>
        </div>
        <p class={`mt-3 font-bold tracking-tight text-indigo-950 ${dense() ? "text-2xl" : "text-3xl"}`}>{countdown()}</p>
        <p class="text-xs text-indigo-900/85">{hasExactWeddingDate() ? "days to the wedding" : "target date"}</p>
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
          class={`mt-1 block break-words text-left text-xs font-semibold leading-5 text-indigo-950/85 underline decoration-indigo-200 underline-offset-2 transition hover:text-indigo-950 ${dense() ? "line-clamp-1" : ""}`}
          title={timelineOverview().actionLabel}
          onClick={openTimelineOverview}
        >
          {timelineOverview().detailLabel}
        </button>
      </div>

      <button type="button" class="min-h-[11rem] min-w-0 rounded-[24px] border border-emerald-100/80 bg-emerald-50/80 p-4 text-left shadow-card transition hover:border-emerald-200 hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2 sm:min-h-12 sm:p-3" title="Open wedding budget" onClick={openBudget}>
        <TileHeading icon="banknotes" title="Budget" color="#B45309" />
        <p class={`mt-2 break-words font-bold text-emerald-950 ${dense() ? "text-xl" : "text-xl"}`}>{budgetTile()?.valueLabel}</p>
        <div class="mt-1 flex items-center gap-2 text-xs text-emerald-900/85">
          <span>budget status</span>
          <span class="inline-flex rounded-full border border-emerald-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-emerald-950">{budgetTile()?.toneLabel}</span>
        </div>
        <p class={`mt-0.5 break-words text-[11px] text-emerald-900/85 ${dense() ? "line-clamp-1" : ""}`}>{budgetTile()?.detailLabel}</p>
        <p class={`mt-0.5 break-words text-[11px] font-semibold text-emerald-900/85 ${dense() ? "hidden" : ""}`}>{budgetTile()?.supportLabel}</p>
      </button>

      <button type="button" class="min-h-[11rem] min-w-0 rounded-[24px] border border-sky-100/80 bg-sky-50/80 p-4 text-left shadow-card transition hover:border-sky-200 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2 sm:min-h-12 sm:p-3" title={guestTile()?.actionLabel ?? "Open guests"} onClick={() => openMenu(guestTile()?.menuId)}>
        <TileHeading icon="users" title="Expected turnout" color="#0F766E" />
        <p class={`mt-2 break-words font-bold text-sky-950 ${dense() ? "text-xl" : "text-xl"}`}>{guestTile()?.valueLabel}</p>
        <span class="mt-1 inline-flex rounded-full border border-sky-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-sky-950">{guestTile()?.toneLabel}</span>
        <p class={`text-xs text-sky-900/85 ${dense() ? "line-clamp-1" : ""}`}>{guestTile()?.detailLabel}</p>
        <p class={`mt-0.5 break-words text-[11px] text-sky-900/85 ${dense() ? "hidden" : ""}`}>{guestTile()?.supportLabel}</p>
      </button>

      <button type="button" class="min-h-[11rem] min-w-0 rounded-[24px] border border-fuchsia-100/80 bg-fuchsia-50/80 p-4 text-left shadow-card transition hover:border-fuchsia-200 hover:bg-fuchsia-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2 sm:min-h-12 sm:p-3" title={seatingTile()?.actionLabel ?? "Open seating"} onClick={() => openMenu(seatingTile()?.menuId)}>
        <TileHeading icon="table-cells" title="Plan seating" color="#7C3AED" />
        <p class={`mt-2 break-words font-bold text-fuchsia-950 ${dense() ? "text-xl" : "text-xl"}`}>{seatingTile()?.valueLabel}</p>
        <span class="mt-1 inline-flex rounded-full border border-fuchsia-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-950">
          {seatingTile()?.toneLabel}
        </span>
        <p class={`text-xs text-fuchsia-900/85 ${dense() ? "line-clamp-1" : ""}`}>{seatingTile()?.detailLabel}</p>
        <p class={`mt-0.5 break-words text-[11px] text-fuchsia-900/85 ${dense() ? "hidden" : ""}`}>{seatingTile()?.supportLabel}</p>
      </button>

      <button type="button" class="min-h-[11rem] min-w-0 rounded-[24px] border border-amber-100/80 bg-amber-50/85 p-4 text-left shadow-card transition hover:border-amber-200 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2 sm:min-h-12 sm:p-3" title={vendorTile()?.actionLabel ?? "Open vendor follow-ups"} onClick={openVendorFollowUps}>
        <TileHeading icon="user-plus" title="Track vendors" color="#B45309" />
        <p class={`mt-2 break-words font-bold text-amber-950 ${dense() ? "text-xl" : "text-xl"}`}>{vendorTile()?.valueLabel}</p>
        <span class="mt-1 inline-flex rounded-full border border-amber-200/80 bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
          {vendorTile()?.toneLabel}
        </span>
        <p class={`text-xs text-amber-900/85 ${dense() ? "line-clamp-1" : ""}`}>{vendorTile()?.detailLabel}</p>
        <p class={`mt-0.5 break-words text-[11px] text-amber-900/85 ${dense() ? "hidden" : ""}`}>{vendorTile()?.supportLabel}</p>
      </button>
    </div>
  );
}

function TileHeading(props: { icon: Parameters<typeof WeddingDashboardIcon>[0]["id"]; title: string; color: string }) {
  return (
    <div class="flex items-center gap-2">
      <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style={{ "background-color": props.color }} aria-hidden="true">
        <WeddingDashboardIcon id={props.icon} class="h-4 w-4" />
      </span>
      <p class="text-sm font-semibold text-wedding-text">{props.title}</p>
    </div>
  );
}
