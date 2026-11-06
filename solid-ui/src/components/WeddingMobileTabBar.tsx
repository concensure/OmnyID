import { For, createSignal, onCleanup, onMount } from "solid-js";
import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { WeddingMobileMoreSheet } from "@/components/WeddingMobileMoreSheet";
import { WEDDING_MOBILE_TABS, weddingMobileTabForMenu } from "@/lib/weddingMobileTabState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export function WeddingMobileTabBar(props: {
  activeMenu: WeddingWorkspaceMenuId;
  onSelectMenu: (menu: WeddingWorkspaceMenuId) => void;
  contentContainer?: () => HTMLElement | undefined;
}) {
  const [moreOpen, setMoreOpen] = createSignal(false);
  const [keyboardOpen, setKeyboardOpen] = createSignal(false);

  onMount(() => {
    const content = props.contentContainer?.() ?? document;
    const viewport = window.visualViewport;
    const initialHeight = viewport?.height ?? window.innerHeight;
    const isTextControl = (target: EventTarget | null) => target instanceof HTMLElement
      && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
    const focusIn = (event: Event) => isTextControl(event.target) && setKeyboardOpen(true);
    const focusOut = () => queueMicrotask(() => setKeyboardOpen(isTextControl(document.activeElement)));
    const resize = () => setKeyboardOpen((viewport?.height ?? window.innerHeight) < initialHeight - 150);
    content.addEventListener("focusin", focusIn);
    content.addEventListener("focusout", focusOut);
    viewport?.addEventListener("resize", resize);
    onCleanup(() => {
      content.removeEventListener("focusin", focusIn);
      content.removeEventListener("focusout", focusOut);
      viewport?.removeEventListener("resize", resize);
    });
  });

  const select = (menu: WeddingWorkspaceMenuId | null) => {
    if (menu) props.onSelectMenu(menu);
    else setMoreOpen(true);
  };

  return (
    <>
      <nav
        aria-label="Wedding planner"
        class={`fixed inset-x-0 bottom-0 z-30 h-[calc(3.25rem+env(safe-area-inset-bottom))] border-t border-wedding-border bg-wedding-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl transition-transform sm:hidden ${keyboardOpen() ? "translate-y-full pointer-events-none" : "translate-y-0"}`}
      >
        <div class="grid h-full grid-cols-5" role="tablist" aria-label="Wedding planner sections">
          <For each={WEDDING_MOBILE_TABS}>{(tab) => {
            const active = () => weddingMobileTabForMenu(props.activeMenu) === tab.id;
            return (
              <button
                type="button"
                role="tab"
                aria-selected={active()}
                aria-current={active() ? "page" : undefined}
                class={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 text-[0.7rem] font-medium active:bg-wedding-slate ${active() ? "text-wedding-primary" : "text-wedding-ink/65"}`}
                onClick={() => select(tab.menu)}
              >
                <WeddingDashboardIcon id={tab.icon} class="h-[1.35rem] w-[1.35rem]" />
                <span class="truncate">{tab.label}</span>
              </button>
            );
          }}</For>
        </div>
      </nav>
      <WeddingMobileMoreSheet
        open={moreOpen()}
        onClose={() => setMoreOpen(false)}
        onSelectMenu={props.onSelectMenu}
      />
    </>
  );
}
