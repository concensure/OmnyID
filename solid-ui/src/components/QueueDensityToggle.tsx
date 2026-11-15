// @locs-version: 1.0
// @module-id: ui.queue-density-toggle
// @primary-capability: queue-density-controls
// @stability: beta
import { createEffect, createSignal, For, Show } from "solid-js";
import { applyQueueFontSize, type QueueDensity } from "@/lib/queueDensityLocalState";

export const QUEUE_DENSITY_MODES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] as const;
const QUEUE_DENSITY_LABEL = "Font size";
const QUEUE_DENSITY_BUTTON_BASE_CLASS =
  "inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border font-semibold transition";

const DENSITY_TONE_STYLES = {
  indigo: {
    shellClass:
      "inline-flex items-center gap-1 rounded-full border border-indigo-200/70 bg-white/85 p-1 text-[10px] text-indigo-700 shadow-sm",
    labelClass:
      "px-1.5 font-mono uppercase tracking-[0.16em] text-indigo-700/70",
    activeButtonClass:
      "border-indigo-300/80 bg-indigo-100 text-indigo-700 shadow-sm",
    idleButtonClass:
      "border-transparent bg-transparent text-indigo-700/65 hover:bg-indigo-50",
  },
  sky: {
    shellClass:
      "inline-flex items-center gap-1 rounded-full border border-sky-200/70 bg-white/85 p-1 text-[10px] text-sky-700 shadow-sm",
    labelClass:
      "px-1.5 font-mono uppercase tracking-[0.16em] text-sky-700/70",
    activeButtonClass:
      "border-sky-300/80 bg-sky-100 text-sky-700 shadow-sm",
    idleButtonClass:
      "border-transparent bg-transparent text-sky-700/65 hover:bg-sky-50",
  },
} as const;

export function QueueDensityToggle(props: {
  density: QueueDensity;
  onSelect: (mode: QueueDensity) => void;
  tone: "indigo" | "sky";
}) {
  const tone = () => props.tone;
  const [expanded, setExpanded] = createSignal(false);
  const density = () => props.density;
  const onSelect = () => props.onSelect;
  const selectedDensity = () => density();
  const toneStyles = () => DENSITY_TONE_STYLES[tone()];
  const shellClass = () => toneStyles().shellClass;
  const labelClass = () => toneStyles().labelClass;
  const isActiveMode = (mode: QueueDensity) => selectedDensity() === mode;
  const buttonStateClass = (mode: QueueDensity) =>
    isActiveMode(mode) ? toneStyles().activeButtonClass : toneStyles().idleButtonClass;
  const buttonClass = (mode: QueueDensity) =>
    `${QUEUE_DENSITY_BUTTON_BASE_CLASS} ${buttonStateClass(mode)}`;
  const modeTitle = (mode: QueueDensity) => `Font size ${mode} of 10`;
  const modeLabel = (mode: QueueDensity) => {
    if (mode === "1") return "A";
    if (mode === "10") return "A";
    return "";
  };
  const modeLabelClass = (mode: QueueDensity) => {
    if (mode === "1") return "text-[9px] leading-none";
    if (mode === "10") return "text-[15px] leading-none";
    return "h-1.5 w-1.5 rounded-full bg-current opacity-70";
  };
  const selectMode = (mode: QueueDensity) => onSelect()(mode);
  createEffect(() => applyQueueFontSize(selectedDensity()));
  const toggleState = () => ({
    shellClass: shellClass(),
    labelClass: labelClass(),
    modeItems: QUEUE_DENSITY_MODES.map((mode) => ({
      mode,
      active: isActiveMode(mode),
      buttonClass: buttonClass(mode),
      title: modeTitle(mode),
      label: modeLabel(mode),
      labelClass: modeLabelClass(mode),
    })),
  });

  return (
    <div
      class={`${toggleState().shellClass} phone:hidden`}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <span class={toggleState().labelClass}>{QUEUE_DENSITY_LABEL}</span>
      <Show
        when={expanded()}
        fallback={
          <>
            <button
              type="button"
              onClick={() => selectMode("1")}
              aria-label="Font size 1 of 10"
              class={`${QUEUE_DENSITY_BUTTON_BASE_CLASS} ${buttonStateClass("1")}`}
              title="Font size 1 of 10"
            >
              <span class={modeLabelClass("1")}>A</span>
            </button>
            <button
              type="button"
              onClick={() => selectMode("10")}
              aria-label="Font size 10 of 10"
              class={`${QUEUE_DENSITY_BUTTON_BASE_CLASS} ${buttonStateClass("10")}`}
              title="Font size 10 of 10"
            >
              <span class={modeLabelClass("10")}>A</span>
            </button>
          </>
        }
      >
        <For each={toggleState().modeItems}>
          {(item) => (
            <button
              type="button"
              onClick={() => selectMode(item.mode)}
              aria-pressed={item.active}
              aria-label={item.title}
              class={item.buttonClass}
              title={item.title}
            >
              <span class={item.labelClass}>{item.label}</span>
            </button>
          )}
        </For>
      </Show>
    </div>
  );
}
