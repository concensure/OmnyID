// @locs-version: 1.0
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

  return (
    <span class="group relative inline-flex shrink-0 align-middle">
      <button
        type="button"
        aria-label={props.label ?? props.title}
        class={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold leading-none shadow-sm transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-white/80 ${toneClasses[tone()]}`}
      >
        i
      </button>
      <span
        role="tooltip"
        class="pointer-events-none absolute right-0 top-[calc(100%+0.45rem)] z-40 hidden w-72 max-w-[78vw] rounded-2xl border border-stone-200 bg-white p-3 text-left text-xs leading-5 text-stone-800 shadow-xl group-hover:block group-focus-within:block"
      >
        <span class="block font-semibold text-stone-950">{props.title}</span>
        <span class="mt-1 block">{props.children}</span>
      </span>
    </span>
  );
}
