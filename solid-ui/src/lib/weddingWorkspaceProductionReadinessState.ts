// @locs-version: 2.0
import {
  buildWeddingOracleUpdatePlanState,
  type WeddingOracleUpdatePlanState,
} from "@/lib/weddingOracleUpdatePlanState";
import {
  buildWeddingProductionReadinessState,
  type WeddingProductionReadinessState,
} from "@/lib/weddingProductionReadinessState";
import type { WeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";
import { buildWeddingProductionGoNoGoPacketState } from "@/lib/weddingProductionGoNoGoPacketState";
import {
  buildWeddingProductionReadinessEvidenceState,
  type WeddingProductionReadinessEvidenceInput,
  type WeddingProductionReadinessEvidenceState,
} from "@/lib/weddingProductionReadinessEvidenceState";
import {
  buildWeddingProductionRemainingWorkState,
  type WeddingProductionRemainingWorkState,
} from "@/lib/weddingProductionRemainingWorkState";

export type {
  WeddingOracleUpdatePlanState,
  WeddingProductionGoNoGoPacketState,
  WeddingProductionReadinessEvidenceInput,
  WeddingProductionReadinessEvidenceState,
  WeddingProductionRemainingWorkState,
  WeddingProductionReadinessState,
};

export type WeddingWorkspaceProductionReadinessInput = {
  oracleTargetLabel?: string | null;
  productionReadinessEvidence?: WeddingProductionReadinessEvidenceInput | null;
  productionReadiness?: WeddingProductionReadinessState | null;
  productionGoNoGoPacket?: WeddingProductionGoNoGoPacketState | null;
  oracleUpdatePlan?: WeddingOracleUpdatePlanState | null;
};

export type WeddingWorkspaceProductionReadinessState = {
  productionReadinessEvidence: WeddingProductionReadinessEvidenceState | null;
  productionGoNoGoPacket: WeddingProductionGoNoGoPacketState | null;
  productionReadiness: WeddingProductionReadinessState;
  productionRemainingWork: WeddingProductionRemainingWorkState;
  oracleUpdatePlan: WeddingOracleUpdatePlanState;
};

function strictProductionReadinessEvidenceInput(
  input: WeddingProductionReadinessEvidenceInput,
): WeddingProductionReadinessEvidenceInput {
  return {
    ...input,
    strictOracleProofs: input.strictOracleProofs ?? true,
  };
}

export function buildWeddingWorkspaceProductionReadinessState(
  input: WeddingWorkspaceProductionReadinessInput,
): WeddingWorkspaceProductionReadinessState {
  const productionReadinessEvidence = input.productionReadinessEvidence
    ? buildWeddingProductionReadinessEvidenceState(
      strictProductionReadinessEvidenceInput(input.productionReadinessEvidence),
    )
    : null;
  const productionGoNoGoPacket = input.productionGoNoGoPacket
    ?? (productionReadinessEvidence ? buildWeddingProductionGoNoGoPacketState(productionReadinessEvidence) : null);
  const productionReadiness = input.productionReadiness
    ?? buildWeddingProductionReadinessState({}, productionReadinessEvidence?.evidence);
  const productionRemainingWork = buildWeddingProductionRemainingWorkState(
    productionReadiness,
    productionGoNoGoPacket,
    productionReadinessEvidence,
  );
  return {
    productionReadinessEvidence,
    productionGoNoGoPacket,
    productionReadiness,
    productionRemainingWork,
    oracleUpdatePlan: input.oracleUpdatePlan ?? buildWeddingOracleUpdatePlanState({
      productionReadiness,
      productionGoNoGoPacket,
      targetLabel: input.oracleTargetLabel,
    }),
  };
}
