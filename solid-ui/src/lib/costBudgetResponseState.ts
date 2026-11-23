// @locs-version: 1.0
import type { BudgetSnapshot } from "@/lib/costStrategy";

const DEFAULT_BUDGET: BudgetSnapshot = {
  maxCostUSD: 0.10,
  maxAPICalls: 20,
  maxLLMTokens: 50_000,
  softLimitRatio: 0.80,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finitePositive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function finiteRatio(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 1 ? value : fallback;
}

export function parseCostBudgetResponse(payload: unknown): BudgetSnapshot {
  if (!isRecord(payload)) return { ...DEFAULT_BUDGET };
  return {
    maxCostUSD: finitePositive(payload.max_cost_usd, DEFAULT_BUDGET.maxCostUSD),
    maxAPICalls: finitePositive(payload.max_api_calls, DEFAULT_BUDGET.maxAPICalls),
    maxLLMTokens: finitePositive(payload.max_llm_tokens, DEFAULT_BUDGET.maxLLMTokens),
    softLimitRatio: finiteRatio(payload.soft_limit_ratio, DEFAULT_BUDGET.softLimitRatio),
  };
}
