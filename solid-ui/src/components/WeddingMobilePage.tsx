import { Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";
import WeddingMobileAppBar from "@/components/WeddingMobileAppBar";
import { WeddingMobileTabBar } from "@/components/WeddingMobileTabBar";
import { weddingMobilePageTitle } from "@/lib/weddingMobilePageState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

export { weddingMobilePageTitle };

export function WeddingMobilePage(props: {
  title: string;
  subtitle?: string;
  appBarTrailing?: JSX.Element;
  back?: { label: string; onBack: () => void };
  activeMenu?: WeddingWorkspaceMenuId;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  children: JSX.Element;
}) {
  let scrollRoot: HTMLDivElement | undefined;
  return (
    <div ref={scrollRoot} data-wedding-mobile-scroll-root class="min-w-0 bg-wedding-page phone:h-[100dvh] phone:overflow-y-auto phone:overscroll-y-contain sm:contents">
      <Show when={props.title || props.back || props.appBarTrailing}>
        <WeddingMobileAppBar
          title={props.title}
          back={props.back}
          trailing={props.appBarTrailing}
          scrollContainer={() => scrollRoot}
        />
      </Show>
      <Show when={props.activeMenu ?? props.title} keyed>{(_menu) => (
        <main class="wedding-mobile-content wedding-mobile-tab-content min-w-0 px-4 pb-[calc(10rem+env(safe-area-inset-bottom))] sm:contents">
          <Show when={props.title || props.subtitle}>
            <div class="mb-4 mt-1 sm:hidden">
              <Show when={props.title}><h1 data-wedding-mobile-large-title class="break-words font-display text-wed-large font-semibold text-wedding-ink">{props.title}</h1></Show>
              <Show when={props.subtitle}>{(subtitle) => <p class="mt-1 text-wed-caption text-wedding-ink/70">{subtitle()}</p>}</Show>
            </div>
          </Show>
          {props.children}
        </main>
      )}</Show>
      <Show when={props.activeMenu && props.onSelectMenu}>
        <Portal><WeddingMobileTabBar
          activeMenu={props.activeMenu!}
          onSelectMenu={props.onSelectMenu!}
          contentContainer={() => scrollRoot}
        /></Portal>
      </Show>
    </div>
  );
}
