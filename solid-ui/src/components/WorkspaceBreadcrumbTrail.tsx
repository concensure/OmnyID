// @locs-version: 1.0
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";

import type { ViewName } from "@/lib/viewNames";
import {
  dispatchWeddingWorkspaceMenuSelection,
  loadWeddingWorkspaceMenu,
  loadWeddingWorkspaceMenuFromUrl,
  WEDDING_WORKSPACE_MENU_EVENT,
  weddingWorkspaceMenuIdFromEvent,
  type WeddingWorkspaceMenuId,
} from "@/lib/weddingWorkspaceMenuState";

type Crumb = { label: string; view?: ViewName; menu?: WeddingWorkspaceMenuId };

const WEDDING_LABELS: Record<WeddingWorkspaceMenuId, string> = {
  home: "Wedding Planner",
  people: "People",
  plan: "Plan",
  tasks: "Tasks",
  vision: "Inspiration",
  documents: "Documents",
  budget: "Budget",
  guests: "Guests",
  inspiration: "Inspiration",
  seating: "Seating",
  helpers: "People",
  response_queue: "Vendors",
  timeline: "Timeline",
  advanced: "Setup checks",
};

function weddingCrumbs(menu: WeddingWorkspaceMenuId): Crumb[] {
  const root: Crumb[] = [
    { label: "Home", view: "home" },
    { label: "Wedding Planner", menu: "home" },
  ];
  if (menu === "home") return root;
  if (["guests", "seating"].includes(menu)) root.push({ label: "People", menu: "people" });
  if (["timeline", "tasks", "response_queue"].includes(menu)) root.push({ label: "Plan", menu: "plan" });
  root.push({ label: WEDDING_LABELS[menu], menu });
  return root;
}

export function WorkspaceBreadcrumbTrail(props: {
  trail: readonly ViewName[];
  labels: Partial<Record<ViewName, string>>;
  weddingActive: boolean;
  onSelectView: (view: ViewName) => void;
}) {
  const initialMenu = typeof window === "undefined"
    ? "home"
    : loadWeddingWorkspaceMenuFromUrl(window.location.search, window.location.hash) ?? loadWeddingWorkspaceMenu();
  const [weddingMenu, setWeddingMenu] = createSignal<WeddingWorkspaceMenuId>(initialMenu);

  onMount(() => {
    const handler = (event: Event) => {
      const menu = weddingWorkspaceMenuIdFromEvent(event);
      if (menu) setWeddingMenu(menu);
    };
    window.addEventListener(WEDDING_WORKSPACE_MENU_EVENT, handler);
    onCleanup(() => window.removeEventListener(WEDDING_WORKSPACE_MENU_EVENT, handler));
  });

  const crumbs = () => props.weddingActive
    ? weddingCrumbs(weddingMenu())
    : props.trail.map((view) => ({ label: props.labels[view] ?? view, view }));

  function select(crumb: Crumb): void {
    if (crumb.view) props.onSelectView(crumb.view);
    else if (crumb.menu) dispatchWeddingWorkspaceMenuSelection(crumb.menu);
  }

  return (
    <Show when={crumbs().length > 1}>
      <nav aria-label="Breadcrumb" class="mb-2.5 flex min-w-0 items-center gap-0.5 overflow-x-auto text-xs text-on-surface-variant/60 animate-fade-in">
        <For each={crumbs()}>{(crumb, index) => (
          <span class="flex shrink-0 items-center gap-0.5">
            <Show when={index() > 0}><span aria-hidden="true" class="select-none px-0.5 text-outline/30">›</span></Show>
            <Show when={index() < crumbs().length - 1} fallback={
              <span aria-current="page" class="rounded px-1.5 py-0.5 font-medium text-on-surface/70">{crumb.label}</span>
            }>
              <button type="button" onClick={() => select(crumb)} class="min-h-8 rounded px-1.5 py-0.5 transition hover:bg-on-surface/5 hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                {crumb.label}
              </button>
            </Show>
          </span>
        )}</For>
      </nav>
    </Show>
  );
}
