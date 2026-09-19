// @locs-version: 1.0
// @module-id: ui.queue-density-toggle
// @primary-capability: queue-density-controls
// @stability: beta
import { For } from "solid-js";
import type { QueueDensity } from "@/lib/queueDensityLocalState";

export const QUEUE_DENSITY_MODES = ["comfortable", "compact"] as const;
const QUEUE_DENSITY_LABEL = "Density";
const QUEUE_DENSITY_BUTTON_BASE_CLASS =
  "inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border text-[10px] font-semibold transition";
const QUEUE_DENSITY_MODE_TITLE = {
  comfortable: "Comfortable spacing",
  compact: "Compact spacing",
} as const;
const QUEUE_DENSITY_MODE_LABEL = {
  comfortable: "M",
  compact: "S",
} as const;

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
  const modeTitle = (mode: QueueDensity) => QUEUE_DENSITY_MODE_TITLE[mode];
  const modeLabel = (mode: QueueDensity) => QUEUE_DENSITY_MODE_LABEL[mode];
  const selectMode = (mode: QueueDensity) => onSelect()(mode);
  const toggleState = () => ({
    shellClass: shellClass(),
    labelClass: labelClass(),
    modeItems: QUEUE_DENSITY_MODES.map((mode) => ({
      mode,
      active: isActiveMode(mode),
      buttonClass: buttonClass(mode),
      title: modeTitle(mode),
      label: modeLabel(mode),
    })),
  });

  return (
    <div class={toggleState().shellClass}>
      <span class={toggleState().labelClass}>{QUEUE_DENSITY_LABEL}</span>
      <For each={toggleState().modeItems}>
        {(item) => (
          <button
            type="button"
            onClick={() => selectMode(item.mode)}
            aria-pressed={item.active}
            class={item.buttonClass}
            title={item.title}
          >
            {item.label}
          </button>
        )}
      </For>
    </div>
  );
}
