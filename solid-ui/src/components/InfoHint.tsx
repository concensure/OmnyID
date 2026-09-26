// @locs-version: 1.0
import { createSignal, Show } from "solid-js";

export function InfoHint(props: {
  text: string;
  label?: string;
  class?: string;
  buttonClass?: string;
  tooltipClass?: string;
}) {
  const [visible, setVisible] = createSignal(false);

  return (
    <span class={props.class ?? "relative inline-flex"}>
      <button
        type="button"
        class={
          props.buttonClass
          ?? "touch-target inline-flex h-4 w-4 items-center justify-center rounded-full border border-outline/20 bg-white/70 text-[10px] font-semibold text-on-surface-variant/70 transition hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        }
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        aria-label={props.label ?? props.text}
      >
        i
      </button>
      <Show when={visible()}>
        <div
          role="tooltip"
          class={
            props.tooltipClass
            ?? "absolute bottom-full left-1/2 z-50 mb-2 w-64 -translate-x-1/2 rounded-xl border border-white/40 bg-white/88 px-3 py-2 text-xs leading-5 text-on-surface shadow-lg backdrop-blur-md"
          }
        >
          {props.text}
        </div>
      </Show>
    </span>
  );
}
