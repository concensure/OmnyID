// @locs-version: 2.0
import { saveWeddingNavigationIntent } from "@/lib/weddingNavigationLocalState";
import {
  subscribeWeddingNavigationIntent,
  type WeddingNavigationIntent,
} from "@/lib/weddingNavigationState";
import type { ViewName } from "@/lib/viewNames";

export type WeddingNavigationAppBridgeOptions = {
  selectView: (view: ViewName) => void;
  storage?: Storage | null;
  target?: Window;
  nowIso?: string | null;
  onSaved?: (intent: WeddingNavigationIntent) => void;
};

export function subscribeWeddingNavigationAppBridge(
  options: WeddingNavigationAppBridgeOptions,
): () => void {
  return subscribeWeddingNavigationIntent((intent) => {
    saveWeddingNavigationIntent(intent, {
      storage: options.storage,
      nowIso: options.nowIso,
    });
    options.onSaved?.(intent);
    options.selectView(intent.view);
  }, options.target);
}
