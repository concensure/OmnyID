// @locs-version: 1.0
type CompanionStat = {
  label: string;
  value: string;
};

type ExecutionState = {
  executionBadges: string[];
  skipBadges: string[];
  densityBadges: string[];
  budgetBadges: string[];
  layerLabel: string | null;
};

type RouterResultLike = {
  a2ui: {
    confidenceLabel: string;
    confidenceBand: string;
  };
  terminalLayer: string;
  sources: unknown[];
  candidates: Array<{
    scores: Record<string, unknown>;
    decryptedExcerpt?: string | null;
  }>;
  budget: {
    elapsedMs: number;
    embeddings: number;
    decryptions: number;
    tokens: number;
  };
};

export type LocalRouterCompanionState = {
  tone: "success" | "info" | "warning";
  title: string;
  detail: string;
  stats: CompanionStat[];
  badges: string[];
  capabilityBadges: string[];
  executionBadges: string[];
  skipBadges: string[];
  densityBadges: string[];
  budgetBadges: string[];
  confidenceLabel: string;
  confidenceBand: string;
  terminalLayer: string;
};

export function buildLocalRouterCompanionState(copy: {
  routerResult?: RouterResultLike | null;
  capabilityBadges: string[];
  executionState: ExecutionState;
  projectionBadgeLabels: string[];
  indexedRowCount?: number | null;
}): LocalRouterCompanionState | null;

export function buildLocalRouterPreviewPayload(
  companion: LocalRouterCompanionState | null | undefined,
): {
  title: string;
  tone: "success" | "info" | "warning";
  detail: string;
  confidence_label: string;
  confidence_band: string;
  terminal_layer: string;
  capability_badges: string[];
  execution_badges: string[];
  skip_badges: string[];
  density_badges: string[];
  budget_badges: string[];
  stats: CompanionStat[];
} | null;
