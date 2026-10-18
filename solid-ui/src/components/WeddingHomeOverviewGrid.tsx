// @locs-version: 1.0
import { Show } from "solid-js";

import { WeddingDashboardIcon, type WeddingDashboardIconId } from "@/components/WeddingDashboardIcons";
import { WeddingDateEntryControl } from "@/components/WeddingDateEntryControl";
import { WeddingPlanningProgressRing } from "@/components/WeddingPlanningProgressRing";
import {
  buildWeddingHomeOverviewActionTiles,
  buildWeddingHomePlanningProgress,
  buildWeddingHomeTimelineOverview,
  type WeddingHomeOverviewActionTile,
} from "@/lib/weddingHomeOverviewState";
import { weddingTimelineWeddingDateLabel } from "@/lib/weddingTimelineWeddingDateState";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import { weddingDayCountdownLabel, weddingTimelinePrimarySidebarAction } from "@/lib/weddingWorkspaceSidebarActionState";

type Domain = "budget" | "guests" | "seating" | "vendors";

const DOMAIN_STYLE: Record<Domain, { shell: string; pop: string; icon: WeddingDashboardIconId; label: string }> = {
  budget: { shell: "bg-wedding-tile-budget-bg text-wedding-tile-budget-ink", pop: "bg-wedding-tile-budget-pop", icon: "banknotes", label: "Budget" },
  guests: { shell: "bg-wedding-tile-guests-bg text-wedding-tile-guests-ink", pop: "bg-wedding-tile-guests-pop", icon: "users", label: "Guests" },
  seating: { shell: "bg-wedding-tile-seating-bg text-wedding-tile-seating-ink", pop: "bg-wedding-tile-seating-pop", icon: "table-cells", label: "Seating" },
  vendors: { shell: "bg-wedding-tile-vendors-bg text-wedding-tile-vendors-ink", pop: "bg-wedding-tile-vendors-pop", icon: "user-plus", label: "Vendors" },
};

function dateLabel(value: string | null): string {
  if (!value) return "DATE NOT SET";
  const parsed = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return value.toUpperCase();
  return new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric" }).format(parsed).toUpperCase();
}

function displayValue(tile: WeddingHomeOverviewActionTile | undefined): string {
  const value = tile?.valueLabel.trim() ?? "—";
  return /budget noted|set budget|add guests|plan seating|track vendors/i.test(value) ? "—" : value;
}

function statusStyle(tile: WeddingHomeOverviewActionTile): { shell: string; icon: WeddingDashboardIconId } {
  if (tile.toneLabel === "Locked") return { shell: "bg-wedding-status-locked-bg text-wedding-status-locked-ink", icon: "lock" };
  if (tile.tone === "ready") return { shell: "bg-wedding-status-track-bg text-wedding-status-track-ink", icon: "check-circle" };
  if (tile.tone === "attention") return { shell: "bg-wedding-status-progress-bg text-wedding-status-progress-ink", icon: "clock" };
  return { shell: "bg-wedding-status-action-bg text-wedding-status-action-ink", icon: "alert-circle" };
}

function DomainTile(props: { tile?: WeddingHomeOverviewActionTile; domain: Domain; dense: boolean; onOpen: () => void; desktopSpan?: string }) {
  const style = DOMAIN_STYLE[props.domain];
  const status = () => props.tile ? statusStyle(props.tile) : { shell: "bg-wedding-status-locked-bg text-wedding-status-locked-ink", icon: "lock" as const };
  return (
    <button
      type="button"
      class={`group min-h-[10.5rem] min-w-0 rounded-[24px] border border-transparent p-4 text-left shadow-card transition duration-200 ease-out hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2 motion-reduce:transform-none sm:p-5 ${style.shell} ${props.desktopSpan ?? ""} ${props.dense ? "min-h-[9rem] p-3 sm:p-3" : ""}`}
      title={props.tile?.actionLabel}
      onClick={props.onOpen}
    >
      <div class="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <div class="flex min-w-0 items-center gap-2">
          <span class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${style.pop}`} aria-hidden="true">
            <WeddingDashboardIcon id={style.icon} class="h-[18px] w-[18px]" />
          </span>
          <span class="truncate text-xs font-semibold uppercase tracking-[0.08em]">{style.label}</span>
        </div>
        <Show when={props.tile}>{(tile) => (
          <span class={`ml-auto inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${status().shell}`}>
            <WeddingDashboardIcon id={status().icon} class="h-3.5 w-3.5" />
            <span>{tile().toneLabel}</span>
          </span>
        )}</Show>
      </div>
      <p class="mt-4 break-words text-[2.125rem] font-extrabold leading-9 tracking-[-.02em] tabular-nums">{displayValue(props.tile)}</p>
      <p class="mt-1 line-clamp-2 text-sm leading-5 opacity-80">{props.tile?.detailLabel}</p>
      <span class="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold">
        {props.tile?.actionLabel}<WeddingDashboardIcon id="arrow-right" class="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
      </span>
    </button>
  );
}

export function WeddingHomeOverviewGrid(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction?: (action: WeddingWorkspaceSidebarAction) => void;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  onSaveWeddingDate?: (date: string) => Promise<void> | void;
  dense?: boolean;
}) {
  const dense = () => props.dense === true;
  const weddingDate = () => weddingTimelineWeddingDateLabel(props.state);
  const countdown = () => weddingDayCountdownLabel(props.state);
  const progress = () => buildWeddingHomePlanningProgress(props.state);
  const timeline = () => buildWeddingHomeTimelineOverview(props.state);
  const tiles = () => buildWeddingHomeOverviewActionTiles(props.state);
  const tile = (id: Domain) => tiles().find((item) => item.id === id);
  const openTile = (id: Domain) => {
    const selected = tile(id);
    if (selected?.menuId) props.onSelectMenu?.(selected.menuId);
    if (id === "vendors" && typeof window !== "undefined") window.setTimeout(() => {
      document.querySelector("[data-wedding-home-section='vendor_follow_up']")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };
  const openTimeline = () => {
    props.onSelectMenu?.(timeline().menuId);
    props.onSidebarAction?.(weddingTimelinePrimarySidebarAction(props.state, timeline().selectedRowId));
  };

  return (
    <section class={`grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-12 lg:gap-4 ${dense() ? "gap-2" : ""}`} aria-label="Wedding plan overview">
      <article class={`relative col-span-2 min-h-[13.75rem] min-w-0 overflow-hidden rounded-[32px] bg-gradient-to-br from-wedding-plum via-wedding-plum-light to-wedding-plum-warm p-5 text-white shadow-card lg:col-span-7 lg:row-span-2 lg:p-6 ${dense() ? "min-h-[12rem] p-4" : ""}`}>
        <div class="pointer-events-none absolute -right-8 -top-12 h-44 w-44 rounded-full bg-wedding-bubblegum/20 blur-2xl" aria-hidden="true" />
        <div class="relative flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="break-words text-xs font-semibold uppercase tracking-[0.08em] text-wedding-butter">Wedding day · {dateLabel(weddingDate())}</p>
            <p class={`mt-3 break-words font-display font-bold tracking-[-.03em] tabular-nums ${/^\d+$/.test(countdown()) ? "text-7xl leading-[.9] lg:text-8xl" : "max-w-[10ch] text-4xl leading-tight"}`}>{countdown()}</p>
            <p class="mt-2 text-base text-white/80">{weddingDate() ? "days to go" : "Add your date to start the countdown"}</p>
          </div>
          <WeddingPlanningProgressRing percentage={progress().percentage} size={dense() ? 82 : 96} />
        </div>
        <Show when={!weddingDate() && props.onSaveWeddingDate} fallback={
          <button type="button" class="relative mt-5 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 text-left text-sm font-semibold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-butter" onClick={openTimeline}>
            <span class="min-w-0 truncate">Next · {timeline().detailLabel.replace(/^Next:\s*/i, "")}</span><WeddingDashboardIcon id="arrow-right" class="h-5 w-5 shrink-0" />
          </button>
        }>
          <div class="relative mt-4 rounded-2xl bg-white/10 p-3"><WeddingDateEntryControl onSave={props.onSaveWeddingDate!} locale="en-AU" compact /></div>
        </Show>
      </article>

      <DomainTile domain="budget" tile={tile("budget")} dense={dense()} desktopSpan="lg:col-span-5" onOpen={() => openTile("budget")} />
      <DomainTile domain="guests" tile={tile("guests")} dense={dense()} desktopSpan="lg:col-span-2" onOpen={() => openTile("guests")} />
      <DomainTile domain="seating" tile={tile("seating")} dense={dense()} desktopSpan="lg:col-span-3" onOpen={() => openTile("seating")} />
      <DomainTile domain="vendors" tile={tile("vendors")} dense={dense()} desktopSpan="lg:col-span-12 lg:min-h-[9rem]" onOpen={() => openTile("vendors")} />
    </section>
  );
}
