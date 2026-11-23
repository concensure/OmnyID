import { Show, createSignal, onCleanup, onMount, type JSX } from "solid-js";

export type WeddingMobileAppBarProps = {
  title: string;
  back?: { label: string; onBack: () => void };
  trailing?: JSX.Element;
  scrollContainer?: () => HTMLElement | undefined;
};

export default function WeddingMobileAppBar(props: WeddingMobileAppBarProps) {
  const [scrolled, setScrolled] = createSignal(false);
  const [largeTitleVisible, setLargeTitleVisible] = createSignal(true);
  let bar: HTMLElement | undefined;

  onMount(() => {
    const scrollRoot = props.scrollContainer?.();
    const scrollTarget: HTMLElement | Window = scrollRoot ?? window;
    const readScroll = () => setScrolled((scrollRoot?.scrollTop ?? window.scrollY) > 8);
    readScroll();
    scrollTarget.addEventListener("scroll", readScroll, { passive: true });

    const titleRoot = scrollRoot ?? bar?.parentElement ?? document;
    const largeTitle = titleRoot.querySelector<HTMLElement>("[data-wedding-mobile-large-title]");
    const observer = largeTitle && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver(
          ([entry]) => setLargeTitleVisible(entry?.isIntersecting ?? false),
          { root: scrollRoot ?? null, rootMargin: "-56px 0px 0px", threshold: 0 },
        )
      : null;
    if (largeTitle) observer?.observe(largeTitle);

    onCleanup(() => {
      scrollTarget.removeEventListener("scroll", readScroll);
      observer?.disconnect();
    });
  });

  const showTitle = () => Boolean(props.title) && (Boolean(props.back) || !largeTitleVisible());

  return (
    <header
      ref={bar}
      class={`wedding-mobile-app-bar sticky top-0 z-30 grid h-[calc(3.5rem+env(safe-area-inset-top))] grid-cols-[1fr_auto_1fr] items-end border-b px-[max(1rem,env(safe-area-inset-left))] pb-0 pt-[env(safe-area-inset-top)] transition-colors sm:hidden ${
        scrolled()
          ? "border-wedding-border bg-wedding-page/95 backdrop-blur-xl"
          : "border-transparent bg-wedding-page"
      }`}
    >
      <div class="flex h-app-bar min-w-0 items-center justify-start">
        <Show when={props.back} keyed>
          {(back) => (
            <button
              type="button"
              class="inline-flex h-11 min-w-11 max-w-full items-center gap-1 rounded-lg pr-2 text-wed-callout font-medium text-wedding-secondary active:bg-wedding-slate focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary"
              aria-label={`Back to ${back.label}`}
              onClick={back.onBack}
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" class="h-5 w-5 shrink-0" fill="none">
                <path d="m15 18-6-6 6-6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span class="truncate">{back.label}</span>
            </button>
          )}
        </Show>
      </div>

      <div
        class={`flex h-app-bar max-w-[12rem] items-center justify-center truncate px-2 text-wed-headline font-semibold text-wedding-ink transition-opacity duration-150 ${showTitle() ? "opacity-100" : "opacity-0"}`}
        aria-hidden={!showTitle()}
      >
        {props.title}
      </div>

      <div class="flex h-app-bar min-w-0 items-center justify-end gap-2">{props.trailing}</div>
    </header>
  );
}
