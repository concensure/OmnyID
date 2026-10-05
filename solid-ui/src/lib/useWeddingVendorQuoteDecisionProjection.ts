// @locs-version: 1.0
import { createEffect, createSignal } from "solid-js";

import type { WeddingProjectionSaveFn } from "@/components/WeddingResponseWorkspaceViewTypes";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import { weddingVendorQuoteDecisionDispatches } from "@/lib/weddingVendorQuoteDecisionDispatchState";

/** Appends each unresolved quote's stable DecisionOS request once per saved quote identity. */
export function useWeddingVendorQuoteDecisionProjection(input: {
  state: () => WeddingResponseWorkspaceViewState;
  saveProjection: () => WeddingProjectionSaveFn | null | undefined;
  onRefreshWorkspace: () => void | undefined;
}): void {
  const [attemptedKeys, setAttemptedKeys] = createSignal<ReadonlySet<string>>(new Set());
  createEffect(() => {
    const saveProjection = input.saveProjection();
    if (!saveProjection) return;
    const dispatches = weddingVendorQuoteDecisionDispatches({
      flows: input.state().activeVendorQuoteReplyFlows,
      messages: input.state().afpMessages,
      attemptedKeys: attemptedKeys(),
    });
    if (dispatches.length === 0) return;
    setAttemptedKeys((current) => new Set([...current, ...dispatches.map((item) => item.idempotencyKey)]));
    void Promise.all(dispatches.map((item) => saveProjection(item.sendInput)))
      .then(() => input.onRefreshWorkspace())
      .catch(() => {
        // Keep the local key claimed for this mount. A refresh/reload retries the stable key.
      });
  });
}
