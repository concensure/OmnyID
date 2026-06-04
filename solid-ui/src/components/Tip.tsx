// @locs-version: 2.0
// @module-id: ui.tip
// @primary-capability: tooltip-overlay
// @stability: stable
import type { JSX } from "solid-js";

type Side = "top" | "right" | "bottom" | "left";

interface TipProps {
  label: string | JSX.Element;
  side?: Side;
  class?: string;
  children: JSX.Element;
}

// CSS-only tooltip — zero JS at idle. Wraps any element and shows a glass
// label on hover. Use side="right" for items near the left edge (e.g. rail).
export function Tip(props: TipProps) {
  const pos = () => {
    switch (props.side ?? "top") {
      case "right":
        return "left-full top-1/2 ml-2 -translate-y-1/2 translate-x-[-4px] group-hover/tip:translate-x-0";
      case "left":
        return "right-full top-1/2 mr-2 -translate-y-1/2 translate-x-[4px] group-hover/tip:translate-x-0";
      case "bottom":
        return "top-full left-1/2 mt-1.5 -translate-x-1/2 translate-y-[-4px] group-hover/tip:translate-y-0";
      default:
        return "bottom-full left-1/2 mb-1.5 -translate-x-1/2 translate-y-[4px] group-hover/tip:translate-y-0";
    }
  };

  return (
    <div class={`group/tip relative inline-flex${props.class ? " " + props.class : ""}`}>
      {props.children}
      <div
        role="tooltip"
        class={`pointer-events-none absolute z-50 whitespace-nowrap rounded-xl border border-white/50 bg-white/96 px-2.5 py-1 text-xs font-medium text-on-surface opacity-0 shadow-card backdrop-blur-xl transition-[opacity,transform] duration-150 group-hover/tip:opacity-100 ${pos()}`}
      >
        {props.label}
      </div>
    </div>
  );
}
