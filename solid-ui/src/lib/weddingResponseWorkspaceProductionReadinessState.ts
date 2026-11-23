// @locs-version: 2.0
import {
  buildWeddingWorkspaceProductionReadinessState,
  type WeddingWorkspaceProductionReadinessInput,
  type WeddingWorkspaceProductionReadinessState,
} from "@/lib/weddingWorkspaceProductionReadinessState";

export type {
  WeddingOracleUpdatePlanState,
  WeddingProductionGoNoGoPacketState,
  WeddingProductionReadinessEvidenceState,
  WeddingProductionRemainingWorkState,
  WeddingProductionReadinessState,
  WeddingWorkspaceProductionReadinessInput,
} from "@/lib/weddingWorkspaceProductionReadinessState";

export function buildWeddingResponseWorkspaceProductionReadinessState(
  input: WeddingWorkspaceProductionReadinessInput,
): WeddingWorkspaceProductionReadinessState {
  return buildWeddingWorkspaceProductionReadinessState({
    ...input,
    productionReadinessEvidence: input.productionReadinessEvidence ?? { strictOracleProofs: true },
  });
}
