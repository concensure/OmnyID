// @locs-version: 1.0
import { For } from "solid-js";
import { dispatchDevViewportEvent } from "@/lib/devViewportEvent";

interface DevicePreset {
  label: string;
  width: number;
}

const PRESETS: DevicePreset[] = [
  { label: "Watch", width: 280 },
  { label: "Phone", width: 390 },
  { label: "Tablet", width: 768 },
  { label: "Desktop", width: 1440 },
];

export function DeviceSwitcher() {
  if (!import.meta.env.DEV) return null;

  function emit(width: number) {
    dispatchDevViewportEvent({ width });
  }

  return (
    <div
      style="position:fixed;bottom:1rem;right:1rem;z-index:9999"
      class="flex flex-col gap-1 rounded-2xl border border-white/40 bg-white/95 p-2 shadow-panel backdrop-blur"
    >
      <p class="px-1 font-mono text-[9px] uppercase tracking-widest text-on-surface-variant/60">
        Device
      </p>
      <For each={PRESETS}>
        {(preset) => (
          <button
            type="button"
            onClick={() => emit(preset.width)}
            class="rounded-xl px-3 py-1.5 text-left text-xs font-medium text-on-surface transition hover:bg-primary/10 hover:text-primary"
          >
            {preset.label}
            <span class="ml-1.5 text-[9px] text-on-surface-variant/50">{preset.width}px</span>
          </button>
        )}
      </For>
    </div>
  );
}
