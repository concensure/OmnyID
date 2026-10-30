// @locs-version: 1.0
import { createMemo, createSignal, For, Show } from "solid-js";

import { WeddingDashboardIcon, type WeddingDashboardIconId } from "@/components/WeddingDashboardIcons";
import { WeddingDateEntryControl } from "@/components/WeddingDateEntryControl";
import { WeddingPlanningJourneyStepper } from "@/components/WeddingPlanningJourneyStepper";
import type { SendAfpMessageInput } from "@/lib/api";
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
import { weddingDayCountdownLabel } from "@/lib/weddingWorkspaceSidebarActionState";

type Domain = "budget" | "guests" | "seating";

const DOMAIN_STYLE: Record<Domain, { icon: WeddingDashboardIconId; label: string }> = {
  budget: { icon: "banknotes", label: "Budget" },
  guests: { icon: "users", label: "Guests" },
  seating: { icon: "table-cells", label: "Seating" },
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
  if (tile.toneLabel === "Locked") return { shell: "bg-wedding-slate text-wedding-ink/70", icon: "lock" };
  if (tile.tone === "ready") return { shell: "bg-wedding-primary/10 text-wedding-primary", icon: "check-circle" };
  if (tile.tone === "attention") return { shell: "bg-wedding-status-progress-bg text-wedding-status-progress-ink", icon: "clock" };
  return { shell: "bg-wedding-status-action-bg text-wedding-status-action-ink", icon: "alert-circle" };
}

function DomainTile(props: { tile?: WeddingHomeOverviewActionTile; domain: Domain; dense: boolean; onOpen: () => void; desktopSpan?: string }) {
  const style = DOMAIN_STYLE[props.domain];
  const status = () => props.tile ? statusStyle(props.tile) : { shell: "bg-wedding-slate text-wedding-ink/70", icon: "lock" as const };
  return (
    <button
      type="button"
      class={`group min-h-[8.5rem] min-w-0 overflow-hidden rounded-xl border border-wedding-border bg-wedding-card p-4 text-left text-wedding-ink shadow-wedding-card transition-colors duration-150 hover:border-wedding-primary/40 hover:bg-wedding-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary focus-visible:ring-offset-2 sm:min-h-[10.5rem] sm:p-5 ${props.desktopSpan ?? ""} ${props.dense ? "min-h-[8rem] p-3 sm:min-h-[9rem] sm:p-3" : ""}`}
      title={props.tile?.actionLabel}
      onClick={props.onOpen}
    >
      <div class="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:justify-between">
        <div class="flex min-w-0 items-center gap-2">
          <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-wedding-slate text-wedding-primary" aria-hidden="true">
            <WeddingDashboardIcon id={style.icon} class="h-[18px] w-[18px]" />
          </span>
          <span class="truncate text-xs font-semibold uppercase tracking-[0.08em]">{style.label}</span>
        </div>
        <Show when={props.tile}>{(tile) => (
          <span class={`inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold sm:ml-auto ${status().shell}`}>
            <WeddingDashboardIcon id={status().icon} class="h-3.5 w-3.5" />
            <span>{tile().toneLabel}</span>
          </span>
        )}</Show>
      </div>
      <p class="mt-3 break-words text-[1.65rem] font-extrabold leading-8 tracking-[-.02em] tabular-nums sm:mt-4 sm:text-[2.125rem] sm:leading-9">{displayValue(props.tile)}</p>
      <p class="mt-1 line-clamp-2 text-sm leading-5 text-wedding-ink/70">{props.tile?.detailLabel}</p>
      <span class="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-wedding-secondary">
        {props.tile?.actionLabel}<WeddingDashboardIcon id="arrow-right" class="h-4 w-4" />
      </span>
    </button>
  );
}

export function WeddingHomeOverviewGrid(props: {
  state: WeddingResponseWorkspaceViewState;
  onSidebarAction?: (action: WeddingWorkspaceSidebarAction) => void;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  onSaveWeddingDate?: (date: string) => Promise<void> | void;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: (() => void) | null;
  dense?: boolean;
}) {
  const dense = () => props.dense === true;
  const weddingDate = () => weddingTimelineWeddingDateLabel(props.state);
  const countdown = () => weddingDayCountdownLabel(props.state);
  const progress = () => buildWeddingHomePlanningProgress(props.state);
  const timeline = () => buildWeddingHomeTimelineOverview(props.state);
  const tiles = () => buildWeddingHomeOverviewActionTiles(props.state);
  const visibleTiles = () => tiles().filter((item): item is WeddingHomeOverviewActionTile & { id: Domain } => item.id !== "vendors");
  const tile = (id: Domain) => tiles().find((item) => item.id === id);
  const [transportOpen, setTransportOpen] = createSignal(false);
  const transportTask = () => /transport|trackwork|guest logistics|access/i.test(timeline().detailLabel);
  const destination = createMemo(() => props.state.workspace.artifacts
    .flatMap((artifact) => artifact.locationLabels)
    .find((label) => label.trim().length > 0) ?? "your selected wedding venue");
  const encodedDestination = () => encodeURIComponent(destination());
  const openTile = (id: Domain) => {
    const selected = tile(id);
    if (selected?.menuId) props.onSelectMenu?.(selected.menuId);
  };
  const openTimeline = () => {
    if (transportTask()) {
      setTransportOpen((current) => !current);
      return;
    }
    props.onSelectMenu?.(timeline().menuId);
  };

  return (
    <section class={`grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:gap-4 ${dense() ? "gap-2" : ""}`} aria-label="Wedding plan overview">
      <article data-wedding-surface="countdown" class={`min-h-[13.75rem] min-w-0 overflow-hidden rounded-xl border border-wedding-border bg-wedding-card p-4 text-wedding-ink shadow-wedding-card sm:col-span-2 sm:p-5 lg:col-span-9 lg:p-6 ${dense() ? "min-h-[12rem] p-3 sm:p-4" : ""}`}>
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="break-words text-xs font-semibold uppercase tracking-[0.08em] text-wedding-primary">Wedding day · {dateLabel(weddingDate())}</p>
            <p class={`mt-3 break-words font-display font-bold tracking-[-.03em] text-wedding-primary tabular-nums ${/^\d+$/.test(countdown()) ? "text-6xl leading-[.9] sm:text-7xl lg:text-8xl" : "max-w-[10ch] text-4xl leading-tight"}`}>{countdown()}</p>
            <p class="mt-2 text-base text-wedding-ink/70">
              {weddingDate() ? `days to go · ${progress().percentage}% of planning complete` : "Add your date to start the countdown"}
            </p>
          </div>
          <button type="button" class="min-h-11 rounded-lg border border-wedding-secondary px-4 text-sm font-semibold text-wedding-secondary transition hover:bg-wedding-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary focus-visible:ring-offset-2" onClick={openTimeline}>
            Open timeline
          </button>
        </div>
        <WeddingPlanningJourneyStepper
          tasks={props.state.planningTaskItems}
          weddingPlanId={props.state.workspace.metadata.weddingPlanId}
          responseWorkspaceId={props.state.workspace.metadata.responseWorkspaceId}
          saveProjection={props.saveProjection}
          onRefreshWorkspace={props.onRefreshWorkspace}
          people={props.state.helperContactNames}
        />
        <Show when={!weddingDate() && props.onSaveWeddingDate} fallback={
          <button type="button" class="mt-5 flex min-h-12 w-full items-center justify-between gap-3 rounded-lg border border-wedding-border bg-wedding-page px-4 text-left text-sm font-semibold text-wedding-ink transition hover:border-wedding-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary" onClick={openTimeline}>
            <span class="min-w-0 truncate">Next · {timeline().detailLabel.replace(/^Next:\s*/i, "")}</span><WeddingDashboardIcon id="arrow-right" class="h-5 w-5 shrink-0" />
          </button>
        }>
          <div class="mt-4 rounded-lg border border-wedding-border bg-wedding-page p-3"><WeddingDateEntryControl onSave={props.onSaveWeddingDate!} locale="en-AU" compact /></div>
        </Show>
        <Show when={transportOpen()}>
          <section class="mt-3 rounded-lg border border-wedding-border bg-wedding-page p-4" aria-label="Transport and access check">
            <div class="flex flex-wrap items-start justify-between gap-2"><div><p class="text-sm font-semibold text-wedding-ink">Transport and access check</p><p class="mt-1 text-xs text-wedding-ink/65">For {destination()}</p></div><button type="button" class="min-h-10 rounded-lg border border-wedding-border bg-white px-3 text-xs font-semibold" onClick={() => setTransportOpen(false)}>Close</button></div>
            <ul class="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-wedding-ink/75">
              <li>Destination from the wedding plan: <strong>{destination()}</strong>.</li>
              <li>{weddingDate() ? `Wedding date on record: ${dateLabel(weddingDate())}.` : "Add the wedding date before relying on disruption or trackwork checks."}</li>
              <li>Live disruptions change frequently. Open the official alert immediately before publishing guest travel advice.</li>
            </ul>
            <div class="mt-3 flex flex-wrap gap-2">
              <a class="min-h-11 rounded-lg bg-wedding-primary px-3 py-3 text-xs font-semibold text-white" href="https://transportnsw.info/alerts" target="_blank" rel="noreferrer">Check official disruptions</a>
              <a class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 py-3 text-xs font-semibold text-wedding-secondary" href={`https://transportnsw.info/trip#/trip?to=${encodedDestination()}`} target="_blank" rel="noreferrer">Plan train and bus route</a>
              <a class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 py-3 text-xs font-semibold text-wedding-secondary" href={`https://www.google.com/maps/dir/?api=1&destination=${encodedDestination()}&travelmode=transit`} target="_blank" rel="noreferrer">Compare public transport</a>
            </div>
            <p class="mt-3 text-xs leading-5 text-wedding-ink/60">These links use the destination shown above. OmnyID does not mark a route or disruption as verified until the official source has been checked.</p>
          </section>
        </Show>
      </article>

      <aside class="order-last min-w-0 overflow-hidden rounded-xl border border-wedding-border bg-wedding-card p-4 text-wedding-ink shadow-wedding-card sm:col-span-2 lg:order-none lg:col-span-3 lg:row-span-3" aria-label="Wedding plan up next">
        <p class="text-xs font-semibold uppercase tracking-[0.08em] text-wedding-primary">Up next</p>
        <button type="button" class="mt-3 flex min-h-11 w-full items-start gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary" onClick={openTimeline}>
          <span class="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border-2 border-wedding-primary text-wedding-primary"><WeddingDashboardIcon id="calendar-days" class="h-4 w-4" /></span>
          <span class="min-w-0"><span class="block text-sm font-semibold">{timeline().detailLabel.replace(/^Next:\s*/i, "")}</span><span class="mt-0.5 block text-xs text-wedding-ink/65">Open the timeline</span></span>
        </button>
        <div class="mt-3 grid gap-1 border-t border-wedding-border pt-3">
          <For each={visibleTiles()}>{(item) => (
            <button type="button" class="flex min-h-11 items-center justify-between gap-2 rounded-lg px-1 text-left hover:bg-wedding-page focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary" onClick={() => openTile(item.id)}>
              <span class="min-w-0 truncate text-xs font-medium">{DOMAIN_STYLE[item.id].label}</span>
              <span class="shrink-0 text-[11px] text-wedding-ink/65">{item.toneLabel}</span>
            </button>
          )}</For>
        </div>
      </aside>

      <DomainTile domain="budget" tile={tile("budget")} dense={dense()} desktopSpan="lg:col-span-3" onOpen={() => openTile("budget")} />
      <DomainTile domain="guests" tile={tile("guests")} dense={dense()} desktopSpan="lg:col-span-3" onOpen={() => openTile("guests")} />
      <DomainTile domain="seating" tile={tile("seating")} dense={dense()} desktopSpan="lg:col-span-3" onOpen={() => openTile("seating")} />
    </section>
  );
}
