// @locs-version: 1.0
import { createEffect, For, Show } from "solid-js";
import type { ViewName } from "@/lib/viewNames";
import { dispatchWeddingWorkspaceMenuSelection, type WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";
import {
  mobileFocusHomeSections, mobileFocusMenuOpen, mobileFocusMode, setMobileFocusAskOpen, setMobileFocusMenuOpen,
  setMobileFocusMode, setMobileFocusSingleCardSectionId,
} from "@/lib/mobileFocusHomeState";
const WEDDING_MENU: Array<{ id: WeddingWorkspaceMenuId; label: string }> = [
  { id: "home", label: "Home" }, { id: "people", label: "People" }, { id: "plan", label: "Plan" }, { id: "budget", label: "Budget" }, { id: "documents", label: "Documents" }, { id: "inspiration", label: "Inspiration" }, { id: "timeline", label: "Timeline" },
];
export function MobileHomeMenuSheet(props: { userId?: string | null; onSelectApp: (view: ViewName) => void }) {
  let closeButton: HTMLButtonElement | undefined;
  createEffect(() => { if (mobileFocusMenuOpen()) queueMicrotask(() => closeButton?.focus()); });
  const close = () => setMobileFocusMenuOpen(false);
  return <Show when={mobileFocusMenuOpen()}><div class="fixed inset-0 z-[70] phone:block sm:hidden" role="presentation">
    <button type="button" class="absolute inset-0 h-full w-full bg-wedding-text/35" aria-label="Close menu" onClick={close}/>
    <section class="absolute inset-x-0 bottom-0 max-h-[88dvh] overflow-y-auto rounded-t-[28px] bg-wedding-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-panel" role="dialog" aria-modal="true" aria-label="Wedding planner menu" onKeyDown={(event) => { if (event.key === "Escape") close(); }}>
      <div class="mx-auto mb-3 h-1.5 w-10 rounded-full bg-wedding-muted"/>
      <button ref={closeButton} type="button" class="min-h-12 w-full rounded-xl border border-wedding-muted bg-white px-3 text-left text-sm font-semibold text-wedding-text" onClick={() => { setMobileFocusAskOpen(true); close(); }}>Ask the master agent</button>
      <fieldset class="mt-4"><legend class="text-xs font-semibold uppercase tracking-wide text-wedding-text">Focus</legend><div class="mt-2 grid grid-cols-3 gap-2"><For each={["decisions", "responses", "overview"] as const}>{(entry) => <button type="button" aria-pressed={mobileFocusMode() === entry} class={`min-h-12 rounded-xl border px-2 text-xs font-semibold ${mobileFocusMode() === entry ? "border-wedding-accent bg-wedding-surface-blush text-wedding-accent" : "border-wedding-muted bg-white text-wedding-text"}`} onClick={() => { setMobileFocusMode(entry, props.userId); close(); }}>{entry[0].toUpperCase() + entry.slice(1)}</button>}</For></div></fieldset>
      <MenuHeading title="Wedding planner"/><div class="grid grid-cols-2 gap-2"><For each={WEDDING_MENU}>{(item) => <MenuRow label={item.label} onClick={() => { dispatchWeddingWorkspaceMenuSelection(item.id); close(); }}/>}</For></div>
      <Show when={mobileFocusHomeSections().length > 0}><MenuHeading title="Home cards"/><div class="grid gap-2"><For each={mobileFocusHomeSections()}>{(section) => <MenuRow label={section.title} detail={section.summary} onClick={() => { setMobileFocusSingleCardSectionId(section.id); close(); }}/>}</For></div></Show>
      <MenuHeading title="App"/><div class="grid grid-cols-2 gap-2"><For each={[{ id: "search", label: "Chat" }, { id: "threads", label: "Threads" }, { id: "calendar", label: "Calendar" }, { id: "settings", label: "Settings" }]}>{(item) => <MenuRow label={item.label} onClick={() => { props.onSelectApp((item.id === "settings" ? "agent_settings" : item.id) as ViewName); close(); }}/>}</For></div>
    </section>
  </div></Show>;
}
function MenuHeading(props: { title: string }) { return <p class="mt-5 text-xs font-semibold uppercase tracking-wide text-wedding-text">{props.title}</p>; }
function MenuRow(props: { label: string; detail?: string; onClick: () => void }) { return <button type="button" class="min-h-12 rounded-xl border border-wedding-muted bg-white px-3 py-2 text-left text-sm font-semibold text-wedding-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-accent focus-visible:ring-offset-2" onClick={props.onClick}>{props.label}<Show when={props.detail}><span class="mt-0.5 block text-xs font-normal text-wedding-muted">{props.detail}</span></Show></button>; }
