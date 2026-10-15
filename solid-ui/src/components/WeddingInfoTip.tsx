// @locs-version: 1.0
import { createSignal, Show } from "solid-js";
import { Portal } from "solid-js/web";
import type { JSX } from "solid-js";

type WeddingInfoTone = "emerald" | "sky" | "fuchsia" | "indigo" | "rose" | "stone";

const toneClasses: Record<WeddingInfoTone, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
  sky: "border-sky-200 bg-sky-50 text-sky-950",
  fuchsia: "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950",
  indigo: "border-indigo-200 bg-indigo-50 text-indigo-950",
  rose: "border-rose-200 bg-rose-50 text-rose-950",
  stone: "border-stone-200 bg-stone-50 text-stone-950",
};

export function WeddingInfoTip(props: {
  title: string;
  children: JSX.Element;
  label?: string;
  tone?: WeddingInfoTone;
}) {
  const tone = () => props.tone ?? "stone";
  const [open, setOpen] = createSignal(false);
  const [position, setPosition] = createSignal({ top: 0, left: 0, maxHeight: 0 });
  let trigger: HTMLButtonElement | undefined;
  const show = () => {
    if (trigger) {
      const rect = trigger.getBoundingClientRect();
      const viewportMargin = 12;
      const estimatedTipHeight = Math.min(320, Math.max(120, window.innerHeight - viewportMargin * 2));
      const tooltipWidth = Math.min(288, Math.max(0, window.innerWidth - viewportMargin * 2));
      const preferredTop = rect.bottom + 8;
      const spaceBelow = window.innerHeight - preferredTop;
      // A lower phone control needs its tooltip to flip above the trigger
      // rather than disappearing past the viewport edge.
      const opensBelow = spaceBelow >= estimatedTipHeight;
      const top = opensBelow
        ? preferredTop
        : Math.max(viewportMargin, rect.top - estimatedTipHeight - 8);
      // Use a viewport-clamped left edge instead of anchoring with `right`.
      // The latter could push a 288px tooltip off the left of smaller phones.
      const left = Math.min(
        Math.max(viewportMargin, rect.left),
        Math.max(viewportMargin, window.innerWidth - tooltipWidth - viewportMargin),
      );
      const availableHeight = opensBelow
        ? window.innerHeight - top - viewportMargin
        : rect.top - top - 8;
      setPosition({ top, left, maxHeight: Math.max(80, availableHeight) });
    }
    setOpen(true);
  };

  return (
    <span class="inline-flex shrink-0 align-middle">
      <button
        ref={trigger}
        type="button"
        aria-label={props.label ?? props.title}
        aria-describedby={open() ? "wedding-info-tip" : undefined}
        class={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold leading-none shadow-sm transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-white/80 ${toneClasses[tone()]}`}
        onMouseEnter={show}
        onMouseLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        // Focus fires before click on touch devices. Always showing here avoids
        // that event order immediately closing the freshly opened tooltip.
        onClick={show}
      >
        i
      </button>
      <Show when={open()}>
        <Portal>
          <span
            id="wedding-info-tip"
            role="tooltip"
            style={{ top: `${position().top}px`, left: `${position().left}px`, "max-height": `${position().maxHeight}px` }}
            class="pointer-events-none fixed z-[9999] w-72 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-3 text-left text-xs leading-5 text-stone-800 shadow-xl"
          >
            <span class="block font-semibold text-stone-950">{props.title}</span>
            <span class="mt-1 block">{props.children}</span>
          </span>
        </Portal>
      </Show>
    </span>
  );
}
