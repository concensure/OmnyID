// @locs-version: 1.0
// @module-id: ui.mobile-global-navigation
// @primary-capability: accessible-mobile-navigation
// @stability: active
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { ViewName } from "@/lib/viewNames";
import { mobileNavigationGroups, mobileNavigationLabel } from "@/lib/mobileGlobalNavigationState";
import {
  buildWeddingPlannerHomeIntent,
  dispatchWeddingNavigationIntent,
} from "@/lib/weddingNavigationState";
import {
  loadWeddingNavigationIntent,
} from "@/lib/weddingNavigationLocalState";
import {
  buildWeddingTemplateEntryState,
} from "@/lib/weddingTemplateEntryState";
import {
  dispatchWeddingWorkspaceMenuSelection,
  replaceWeddingWorkspaceMenuInUrl,
  saveWeddingWorkspaceMenu,
  type WeddingWorkspaceMenuId,
} from "@/lib/weddingWorkspaceMenuState";
import {
  mobileFocusHomeSections,
  mobileFocusMenuAttentionCount,
  mobileFocusMenuOpen,
  mobileFocusMode,
  setMobileFocusAskOpen,
  setMobileFocusMenuOpen,
  setMobileFocusMode,
  setMobileFocusSingleCardSectionId,
} from "@/lib/mobileFocusHomeState";

const DIALOG_ID = "mobile-global-navigation";
const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex='-1'])";
type WeddingMenuDestination = { id: WeddingWorkspaceMenuId; label: string; sectionId?: string; mode?: "decisions" | "responses" | "overview" };
const WEDDING_MENU: WeddingMenuDestination[] = [
  { id: "home", label: "Wedding Home", mode: "decisions" },
  { id: "home", label: "Live vendor research", sectionId: "vendor_search", mode: "overview" },
  { id: "people", label: "People" }, { id: "plan", label: "Plan" },
  { id: "budget", label: "Budget" }, { id: "documents", label: "Documents" },
  { id: "inspiration", label: "Inspiration" }, { id: "timeline", label: "Timeline" },
];

export function MobileHomeMenuSheet(props: {
  activeView: ViewName;
  advanced: boolean;
  paraViewEnabled: boolean;
  studyLensEnabled: boolean;
  adminAccount?: boolean;
  hideTrigger?: boolean;
  userId?: string | null;
  onSelectApp: (view: ViewName) => void;
}) {
  const [query, setQuery] = createSignal("");
  const groups = createMemo(() => mobileNavigationGroups({
    advanced: props.advanced,
    paraViewEnabled: props.paraViewEnabled,
    studyLensEnabled: props.studyLensEnabled,
    adminAccount: props.adminAccount,
    query: query(),
  }));
  let dialog: HTMLElement | undefined;
  let closeButton: HTMLButtonElement | undefined;
  let returnFocus: HTMLElement | null = null;
  let previousOverflow = "";
  let wasOpen = false;

  const close = () => setMobileFocusMenuOpen(false);
  const open = () => setMobileFocusMenuOpen(true);
  const selectApp = (view: ViewName) => {
    close();
    props.onSelectApp(view);
    requestAnimationFrame(() => {
      const destination = document.getElementById("workspace-shell");
      destination?.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: "instant" });
    });
  };
  const selectWeddingMenu = (destination: WeddingMenuDestination) => {
    if (destination.mode) setMobileFocusMode(destination.mode, props.userId);
    setMobileFocusSingleCardSectionId(destination.sectionId ?? null);
    saveWeddingWorkspaceMenu(destination.id);
    replaceWeddingWorkspaceMenuInUrl(destination.id);
    dispatchWeddingWorkspaceMenuSelection(destination.id);
    const existing = loadWeddingNavigationIntent();
    const entry = buildWeddingTemplateEntryState();
    dispatchWeddingNavigationIntent(buildWeddingPlannerHomeIntent(
      existing ?? {
        weddingPlanId: entry.metadata.weddingPlanId,
        responseWorkspaceId: entry.metadata.responseWorkspaceId,
        sourceResponseId: entry.metadata.sourceResponseId,
        metadata: entry.metadata,
      },
    ));
    selectApp("response_queue");
  };

  createEffect(() => {
    const isOpen = mobileFocusMenuOpen();
    if (isOpen && !wasOpen) {
      returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      setQuery("");
      queueMicrotask(() => closeButton?.focus());
    } else if (!isOpen && wasOpen) {
      document.body.style.overflow = previousOverflow;
      queueMicrotask(() => returnFocus?.isConnected && returnFocus.focus());
    }
    wasOpen = isOpen;
  });
  onCleanup(() => {
    if (wasOpen) document.body.style.overflow = previousOverflow;
    setMobileFocusMenuOpen(false);
  });

  function handleDialogKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== "Tab" || !dialog) return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => !element.hidden);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return <>
    <Show when={!props.hideTrigger}><button
      type="button"
      class="fixed left-[max(0.75rem,env(safe-area-inset-left))] top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex min-h-12 min-w-12 items-center justify-center rounded-2xl border border-white/70 bg-white/95 px-3 text-sm font-semibold text-on-surface shadow-card backdrop-blur-xl sm:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={`Open navigation menu. Current page: ${mobileNavigationLabel(props.activeView)}`}
      aria-haspopup="dialog"
      aria-controls={DIALOG_ID}
      aria-expanded={mobileFocusMenuOpen()}
      onClick={open}
    >
      <span aria-hidden="true" class="text-lg leading-none">☰</span>
      <Show when={mobileFocusMenuAttentionCount() > 0}>
        <span class="absolute -right-1 -top-1 min-w-5 rounded-full bg-error px-1 text-center text-xs leading-5 text-white" aria-label={`${mobileFocusMenuAttentionCount()} items need attention`}>{mobileFocusMenuAttentionCount()}</span>
      </Show>
      <span class="sr-only">Menu</span>
    </button></Show>

    <Show when={mobileFocusMenuOpen()}>
      <div class="fixed inset-0 z-[70] phone:block sm:hidden" role="presentation">
        <button type="button" tabindex="-1" aria-hidden="true" class="absolute inset-0 h-full w-full bg-on-surface/45" onClick={close}/>
        <section
          ref={dialog}
          id={DIALOG_ID}
          class="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-[28px] bg-surface-container-low shadow-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mobile-navigation-title"
          onKeyDown={handleDialogKeyDown}
        >
          <header class="flex shrink-0 items-center gap-3 border-b border-outline/15 px-4 pb-3 pt-4">
            <div class="min-w-0 flex-1">
              <h2 id="mobile-navigation-title" class="text-lg font-semibold text-on-surface">Navigate</h2>
              <p class="truncate text-xs text-on-surface-variant">Current page: {mobileNavigationLabel(props.activeView)}</p>
            </div>
            <button ref={closeButton} type="button" class="inline-flex min-h-12 min-w-12 items-center justify-center rounded-2xl border border-outline/20 bg-white text-xl text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label="Close navigation menu" onClick={close}>×</button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <label class="sticky top-0 z-10 block bg-surface-container-low py-3 text-xs font-semibold text-on-surface" for="mobile-navigation-search">Find a page</label>
            <input id="mobile-navigation-search" type="search" value={query()} onInput={(event) => setQuery(event.currentTarget.value)} placeholder="Search navigation" autocomplete="off" class="min-h-12 w-full rounded-xl border border-outline/25 bg-white px-3 text-base text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"/>

            <button type="button" class="mt-3 min-h-12 w-full rounded-xl bg-primary px-3 text-left text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" onClick={() => { setMobileFocusAskOpen(true); close(); }}>Ask the master agent</button>

            <fieldset class="mt-4">
              <legend class="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Wedding focus</legend>
              <div class="mt-2 grid gap-2" style={{ "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 7rem), 1fr))" }}>
                <For each={["decisions", "responses", "overview"] as const}>{(entry) => <button type="button" aria-pressed={mobileFocusMode() === entry} class={`min-h-12 rounded-xl border px-2 text-xs font-semibold ${mobileFocusMode() === entry ? "border-primary bg-primary/10 text-primary" : "border-outline/20 bg-white text-on-surface"}`} onClick={() => { setMobileFocusMode(entry, props.userId); selectWeddingMenu({ id: "home", label: entry }); }}>{entry[0].toUpperCase() + entry.slice(1)}</button>}</For>
              </div>
            </fieldset>

            <MenuHeading title="Wedding planner"/>
            <div class="grid gap-2" style={{ "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 9rem), 1fr))" }}><For each={WEDDING_MENU}>{(item) => <MenuRow label={item.label} onClick={() => selectWeddingMenu(item)}/>}</For></div>

            <Show when={mobileFocusHomeSections().length > 0}>
              <MenuHeading title="Home cards"/>
              <div class="grid gap-2"><For each={mobileFocusHomeSections()}>{(section) => <MenuRow label={section.title} detail={section.summary} onClick={() => selectWeddingMenu({ id: "home", label: section.title, sectionId: section.id, mode: "overview" })}/>}</For></div>
            </Show>

            <Show when={groups().length > 0} fallback={<p class="py-8 text-center text-sm text-on-surface-variant" role="status">No pages match “{query()}”.</p>}>
              <For each={groups()}>{(group) => <section aria-labelledby={`mobile-nav-group-${group.id}`}>
                <MenuHeading id={`mobile-nav-group-${group.id}`} title={group.label}/>
                <div class="grid gap-2" style={{ "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 9rem), 1fr))" }}><For each={group.items}>{(item) => <MenuRow label={item.label} current={props.activeView === item.id} onClick={() => selectApp(item.id)}/>}</For></div>
              </section>}</For>
            </Show>
          </div>
        </section>
      </div>
    </Show>
  </>;
}

function MenuHeading(props: { id?: string; title: string }) {
  return <h3 id={props.id} class="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{props.title}</h3>;
}

function MenuRow(props: { label: string; detail?: string; current?: boolean; onClick: () => void }) {
  return <button type="button" aria-current={props.current ? "page" : undefined} class={`min-h-12 rounded-xl border px-3 py-2 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${props.current ? "border-primary bg-primary/10 text-primary" : "border-outline/20 bg-white text-on-surface"}`} onClick={props.onClick}>{props.label}<Show when={props.detail}><span class="mt-0.5 block text-xs font-normal text-on-surface-variant">{props.detail}</span></Show></button>;
}
