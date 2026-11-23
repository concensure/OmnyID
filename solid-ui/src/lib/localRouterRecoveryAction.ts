// @locs-version: 1.0
import {
  getLocalRouterCapabilitiesSnapshot,
  refreshLocalRouterIndexNow,
  type LocalRouterCapabilities,
} from "@/lib/localSemanticRouter";
import {
  createLocalRouterRecoveryAction as createLocalRouterRecoveryActionCore,
  type LocalRouterRecoveryAction,
  type LocalRouterRecoveryDependencies,
} from "./localRouterRecoveryActionCore";

export type { LocalRouterRecoveryAction };

const DEFAULT_LOCAL_ROUTER_RECOVERY_DEPENDENCIES: LocalRouterRecoveryDependencies<LocalRouterCapabilities> = {
  getCapabilitiesSnapshot: getLocalRouterCapabilitiesSnapshot,
  refreshIndexNow: refreshLocalRouterIndexNow,
};

export function createLocalRouterRecoveryAction(options: {
  onCapabilities: (capabilities: LocalRouterCapabilities | null) => void;
  onRefreshLocalPreview?: (() => Promise<unknown> | unknown) | undefined;
}, dependencies: LocalRouterRecoveryDependencies<LocalRouterCapabilities> = DEFAULT_LOCAL_ROUTER_RECOVERY_DEPENDENCIES): LocalRouterRecoveryAction {
  return createLocalRouterRecoveryActionCore(options, dependencies);
}
