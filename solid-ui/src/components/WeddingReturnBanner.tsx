// @locs-version: 1.0
import { createSignal, Show } from "solid-js";
import { loadAndClearWeddingReturnIntent } from "@/lib/weddingReturnIntentState";

/** Drop into any settings-ish view a wedding provider-setup link can send a user to. Shows once, then clears itself. */
export function WeddingReturnBanner(props: { onReturn: () => void }) {
  const [visible] = createSignal(loadAndClearWeddingReturnIntent());
  return (
    <Show when={visible()}>
      <button
        type="button"
        onClick={props.onReturn}
        class="mb-3 inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-950 transition hover:bg-rose-100"
      >
        <span aria-hidden="true">←</span>
        Back to your wedding
      </button>
    </Show>
  );
}
