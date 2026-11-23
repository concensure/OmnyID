// @locs-version: 1.0
import type { AfpMessage, AfpView } from "./api";
import { resolveViewRouting } from "./viewRouting";
import {
  resolveViewDispatcherRoutingFromInputs,
  type ViewDispatcherRoutingInfo,
} from "./viewDispatcherRoutingState";

export function resolveViewDispatcherRouting(
  message: AfpMessage,
  viewOverride?: AfpView | null,
): ViewDispatcherRoutingInfo {
  const routing = resolveViewRouting(message, viewOverride);
  return resolveViewDispatcherRoutingFromInputs({
    chosenView: routing.chosenView ?? null,
    effectiveFormat: routing.effectiveFormat,
    heuristicFormat: routing.heuristicFormat,
    agentDriven: routing.agentDriven,
    encrypted: Boolean(message.encryption),
  });
}
