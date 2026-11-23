// @locs-version: 1.0
import { createSignal, type Accessor } from "solid-js";
import { localRouterRecoveryFeedback } from "./localRouterCopy.js";

export type LocalRouterRecoveryRefreshResult = {
  available: boolean;
  refreshed: boolean;
  reducedWarning: boolean;
  warningCleared: boolean;
  stillWarning: boolean;
};

export type LocalRouterRecoveryAction = {
  refreshingIndex: Accessor<boolean>;
  refreshingPreview: Accessor<boolean>;
  lastWarningPersists: Accessor<boolean>;
  lastPreviewRefreshAt: Accessor<string | null>;
  lastPreviewRefreshKind: Accessor<"preview_only" | "with_index" | null>;
  canRerunPreview: Accessor<boolean>;
  refreshFeedback: Accessor<string | null>;
  run: () => Promise<void>;
  rerunPreview: () => Promise<void>;
};

export type LocalRouterRecoveryDependencies<TCapabilities> = {
  getCapabilitiesSnapshot: () => Promise<TCapabilities | null>;
  refreshIndexNow: () => Promise<LocalRouterRecoveryRefreshResult>;
};

export function createLocalRouterRecoveryAction<TCapabilities>(options: {
  onCapabilities: (capabilities: TCapabilities | null) => void;
  onRefreshLocalPreview?: (() => Promise<unknown> | unknown) | undefined;
}, dependencies: LocalRouterRecoveryDependencies<TCapabilities>): LocalRouterRecoveryAction {
  const [refreshingIndex, setRefreshingIndex] = createSignal(false);
  const [refreshingPreview, setRefreshingPreview] = createSignal(false);
  const [lastWarningPersists, setLastWarningPersists] = createSignal(false);
  const [lastPreviewRefreshAt, setLastPreviewRefreshAt] = createSignal<string | null>(null);
  const [lastPreviewRefreshKind, setLastPreviewRefreshKind] = createSignal<"preview_only" | "with_index" | null>(null);
  const [refreshFeedback, setRefreshFeedback] = createSignal<string | null>(null);
  const canRerunPreview = () => !!options.onRefreshLocalPreview;

  async function rerunPreview() {
    if (!options.onRefreshLocalPreview || refreshingIndex() || refreshingPreview()) return;
    setRefreshingPreview(true);
    setRefreshFeedback(null);
    try {
      await options.onRefreshLocalPreview();
      setLastPreviewRefreshAt(new Date().toISOString());
      setLastPreviewRefreshKind("preview_only");
      setRefreshFeedback("Local preview refreshed.");
    } catch {
      setRefreshFeedback("Local preview refresh failed.");
    } finally {
      setRefreshingPreview(false);
    }
  }

  async function run() {
    if (refreshingIndex() || refreshingPreview()) return;
    setRefreshingIndex(true);
    setLastWarningPersists(false);
    setRefreshFeedback(null);
    try {
      const result = await dependencies.refreshIndexNow();
      setLastWarningPersists(result.stillWarning);
      setLastPreviewRefreshKind(null);
      if (result.available && result.refreshed) {
        options.onCapabilities(await dependencies.getCapabilitiesSnapshot());
        if (options.onRefreshLocalPreview) {
          setRefreshingPreview(true);
          await options.onRefreshLocalPreview();
          setLastPreviewRefreshAt(new Date().toISOString());
          setLastPreviewRefreshKind("with_index");
          setRefreshingPreview(false);
        }
      }
      const refreshedPreview = result.available && result.refreshed && !!options.onRefreshLocalPreview;
      setRefreshFeedback(localRouterRecoveryFeedback({
        available: result.available,
        refreshedPreview,
        warningCleared: result.warningCleared,
        reducedWarning: result.reducedWarning,
        stillWarning: result.stillWarning,
      }));
    } catch {
      setRefreshFeedback("Local index refresh failed.");
    } finally {
      setRefreshingPreview(false);
      setRefreshingIndex(false);
    }
  }

  return {
    refreshingIndex,
    refreshingPreview,
    lastWarningPersists,
    lastPreviewRefreshAt,
    lastPreviewRefreshKind,
    canRerunPreview,
    refreshFeedback,
    run,
    rerunPreview,
  };
}
