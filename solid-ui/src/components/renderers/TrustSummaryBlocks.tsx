// @locs-version: 1.0
import { For, Show, createMemo } from "solid-js";
import {
  trustSummaryBlockItems,
  type TrustSummaryBlockInput,
} from "@/lib/trustSummaryBlockState";

export function TrustSummaryBlocks(props: TrustSummaryBlockInput) {
  const blockState = createMemo(() => {
    const items = trustSummaryBlockItems(props);
    return {
      items,
      showBlocks: items.length > 0,
    };
  });

  return (
    <Show when={blockState().showBlocks}>
      <For each={blockState().items}>
        {(item) => (
          <div class={item.containerClass}>
            <p class={item.titleClass}>{item.title}</p>
            <p class={item.summaryClass}>{item.summary}</p>
          </div>
        )}
      </For>
    </Show>
  );
}
