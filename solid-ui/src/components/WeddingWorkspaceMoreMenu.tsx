import { createSignal, For, Show } from "solid-js";

import { RailIcon } from "@/components/RailIcons";
import type { WeddingWorkspaceDesktopMenuItem } from "@/lib/weddingWorkspaceDesktopMenuState";

export function WeddingWorkspaceMoreMenu(props: {
  items: readonly WeddingWorkspaceDesktopMenuItem[];
  onSelect: (item: WeddingWorkspaceDesktopMenuItem) => void;
}) {
  const [open, setOpen] = createSignal(false);
  return (
    <div class="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open()} class="inline-flex min-h-10 items-center gap-2 rounded-full border border-slate-200 bg-slate-50/80 px-3 text-xs font-semibold text-slate-800 transition hover:border-slate-300" onClick={() => setOpen((value) => !value)}>
        <span class="relative inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/80"><RailIcon id="more" /></span><span>More</span>
      </button>
      <Show when={open()}>
        <div role="menu" aria-label="More wedding sections" class="absolute right-0 top-[calc(100%+0.5rem)] z-[4000] min-w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
          <For each={props.items}>{(item) => (
            <button type="button" role="menuitem" class="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-xs font-semibold text-slate-800 hover:bg-slate-100" onClick={() => { setOpen(false); props.onSelect(item); }}>
              <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-50"><RailIcon id={item.icon} /></span>{item.label}
            </button>
          )}</For>
        </div>
      </Show>
    </div>
  );
}
