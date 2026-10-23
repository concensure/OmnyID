/**
 * cost.ts — Cost-aware orchestration types and helpers for the OmnyID AFP SDK.
 *
 * Design principles:
 *  - All cost fields are OPTIONAL in AFP messages (additive, never breaking)
 *  - Budget is propagated through ExecutionContext on every workflow run
 *  - Stages 1→2→3 represent increasing cost/quality trade-offs
 *  - API tier selection is deterministic given a budget status
 *  - Card load strategies decouple UI rendering from data fetching cost
 */

import { z } from "zod/v3";

// ── Budget ────────────────────────────────────────────────────────────────────

export const BudgetSchema = z.object({
  maxCostUSD:    z.number().nonnegative().default(0.10),
  maxAPICalls:   z.number().int().nonnegative().default(20),
  maxLLMTokens:  z.number().int().nonnegative().default(50_000),
  /** 0–1 fraction: once spent/max exceeds this, switch to degraded mode */
  softLimitRatio: z.number().min(0).max(1).default(0.80),
});
export type Budget = z.infer<typeof BudgetSchema>;

export const DEFAULT_BUDGET: Budget = {
  maxCostUSD:    0.10,
  maxAPICalls:   20,
  maxLLMTokens:  50_000,
  softLimitRatio: 0.80,
};

// ── Execution context ─────────────────────────────────────────────────────────

export const ExecutionContextSchema = z.object({
  runId:      z.string(),
  userId:     z.string(),
  workflowId: z.string().optional(),
  budget:     BudgetSchema,
  costSoFar:  z.number().nonnegative().default(0),
  apiCallsSoFar:  z.number().int().nonnegative().default(0),
  tokensSoFar:    z.number().int().nonnegative().default(0),
  currentStage: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  /** 'active' | 'degraded' | 'halted' | 'completed' */
  status: z.enum(["active", "degraded", "halted", "completed"]).default("active"),
});
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;

// ── Budget status helpers ─────────────────────────────────────────────────────

export type BudgetStatus = "ok" | "soft_exceeded" | "hard_exceeded";

export function getBudgetStatus(ctx: ExecutionContext): BudgetStatus {
  const { budget, costSoFar, apiCallsSoFar, tokensSoFar } = ctx;
  if (
    costSoFar   >= budget.maxCostUSD   ||
    apiCallsSoFar >= budget.maxAPICalls ||
    tokensSoFar   >= budget.maxLLMTokens
  ) return "hard_exceeded";
  if (
    costSoFar   >= budget.maxCostUSD   * budget.softLimitRatio ||
    apiCallsSoFar >= budget.maxAPICalls * budget.softLimitRatio ||
    tokensSoFar   >= budget.maxLLMTokens * budget.softLimitRatio
  ) return "soft_exceeded";
  return "ok";
}

export function remainingBudget(ctx: ExecutionContext): Budget {
  return {
    maxCostUSD:   Math.max(0, ctx.budget.maxCostUSD   - ctx.costSoFar),
    maxAPICalls:  Math.max(0, ctx.budget.maxAPICalls  - ctx.apiCallsSoFar),
    maxLLMTokens: Math.max(0, ctx.budget.maxLLMTokens - ctx.tokensSoFar),
    softLimitRatio: ctx.budget.softLimitRatio,
  };
}

export function canAfford(ctx: ExecutionContext, estimatedCostUSD: number, estimatedTokens = 0): boolean {
  return (
    ctx.costSoFar + estimatedCostUSD <= ctx.budget.maxCostUSD &&
    ctx.tokensSoFar + estimatedTokens <= ctx.budget.maxLLMTokens &&
    ctx.apiCallsSoFar + 1 <= ctx.budget.maxAPICalls
  );
}

export function addCost(ctx: ExecutionContext, costUSD: number, tokens = 0): ExecutionContext {
  const updated: ExecutionContext = {
    ...ctx,
    costSoFar:    ctx.costSoFar    + costUSD,
    tokensSoFar:  ctx.tokensSoFar  + tokens,
    apiCallsSoFar: ctx.apiCallsSoFar + (costUSD > 0 ? 1 : 0),
  };
  const status = getBudgetStatus(updated);
  return {
    ...updated,
    status: status === "hard_exceeded" ? "halted" : status === "soft_exceeded" ? "degraded" : "active",
  };
}

// ── Cost record ───────────────────────────────────────────────────────────────

export const CostTypeSchema = z.enum(["llm", "api", "cache_miss", "embedding"]);
export type CostType = z.infer<typeof CostTypeSchema>;

export const CostRecordSchema = z.object({
  id:         z.string().optional(),
  userId:     z.string(),
  workflowId: z.string().optional(),
  runId:      z.string().optional(),
  nodeId:     z.string().optional(),
  cardType:   z.string().optional(),
  costUSD:    z.number().nonnegative(),
  costType:   CostTypeSchema,
  apiTier:    z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
  tokensUsed: z.number().int().nonnegative().optional(),
  source:     z.string().optional(),   // API name, model id, endpoint
  stage:      z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  metadata:   z.record(z.unknown()).default({}),
  timestamp:  z.number().default(() => Date.now()),
});
export type CostRecord = z.infer<typeof CostRecordSchema>;

// ── API tier ──────────────────────────────────────────────────────────────────

export const ApiTierSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type ApiTier = z.infer<typeof ApiTierSchema>;

export const ApiDescriptorSchema = z.object({
  name:           z.string(),
  tier:           ApiTierSchema,
  taskTypes:      z.array(z.string()),
  costUSDPerCall: z.number().nonnegative(),
  requiresKey:    z.boolean().default(false),
});
export type ApiDescriptor = z.infer<typeof ApiDescriptorSchema>;

/** Built-in API catalogue. Mirrors api_tier_registry DB seed. */
export const API_CATALOGUE: ApiDescriptor[] = [
  { name: "duckduckgo",        tier: 1, taskTypes: ["search"],               costUSDPerCall: 0,        requiresKey: false },
  { name: "llm_cache_lookup",  tier: 1, taskTypes: ["llm", "reasoning"],     costUSDPerCall: 0.0001,   requiresKey: false },
  { name: "static_knowledge",  tier: 1, taskTypes: ["facts", "definitions"], costUSDPerCall: 0,        requiresKey: false },
  { name: "openweather_free",  tier: 2, taskTypes: ["weather"],              costUSDPerCall: 0.0001,   requiresKey: true  },
  { name: "skyscanner_basic",  tier: 2, taskTypes: ["flights"],              costUSDPerCall: 0.001,    requiresKey: true  },
  { name: "openweather_pro",   tier: 2, taskTypes: ["weather"],              costUSDPerCall: 0.0005,   requiresKey: true  },
  { name: "amadeus_search",    tier: 3, taskTypes: ["flights", "booking"],   costUSDPerCall: 0.005,    requiresKey: true  },
  { name: "booking_com",       tier: 3, taskTypes: ["accommodation"],        costUSDPerCall: 0.003,    requiresKey: true  },
  { name: "google_maps",       tier: 3, taskTypes: ["map", "activities"],    costUSDPerCall: 0.002,    requiresKey: true  },
];

/**
 * Select the appropriate API tier for a task type given the current budget status.
 *
 * Rules:
 *   hard_exceeded → tier 1 only (cached/free)
 *   soft_exceeded → tier 1 or 2
 *   ok            → tier 1, 2, or 3
 */
export function selectApiTier(
  taskType: string,
  budgetStatus: BudgetStatus,
  preferredTier: ApiTier = 3,
): ApiDescriptor | null {
  const maxTier: ApiTier =
    budgetStatus === "hard_exceeded" ? 1 :
    budgetStatus === "soft_exceeded" ? 2 :
    preferredTier;

  // Find best (highest tier ≤ maxTier) API for the task type
  const candidates = API_CATALOGUE
    .filter(a => a.taskTypes.includes(taskType) && a.tier <= maxTier)
    .sort((a, b) => b.tier - a.tier);  // descending tier = best quality first

  return candidates[0] ?? null;
}

export function estimateApiCost(taskType: string, budgetStatus: BudgetStatus): number {
  const api = selectApiTier(taskType, budgetStatus);
  return api?.costUSDPerCall ?? 0;
}

// ── Retrieval stages ──────────────────────────────────────────────────────────

export type RetrievalStage = 1 | 2 | 3;

export const STAGE_DESCRIPTIONS: Record<RetrievalStage, string> = {
  1: "Stage 1 — LLM reasoning, cached data, heuristics (cheap)",
  2: "Stage 2 — Limited API calls, filtered queries (moderate)",
  3: "Stage 3 — Full API datasets, deep comparisons (expensive)",
};

/** Cost estimate per stage in USD */
export const STAGE_COST_ESTIMATE: Record<RetrievalStage, number> = {
  1: 0.002,   // LLM reasoning only
  2: 0.010,   // + a few API calls
  3: 0.050,   // + multiple full API datasets
};

export function allowedStage(ctx: ExecutionContext): RetrievalStage {
  const status = getBudgetStatus(ctx);
  if (status === "hard_exceeded") return 1;
  if (status === "soft_exceeded") return 2;
  return 3;
}

// ── Card load strategies ──────────────────────────────────────────────────────

export type CardLoadMode = "immediate" | "lazy" | "onInteraction";

export type CardLoadStrategy = {
  load: CardLoadMode;
  /** Which retrieval stage this card requires. Lazy/onInteraction cards skip until triggered. */
  stage: RetrievalStage;
  /** Estimated cost in USD to fully load this card */
  estimatedCostUSD: number;
  /** If true, render a skeleton/placeholder when data isn't loaded yet */
  showSkeleton: boolean;
};

/**
 * All supported card types — mirrors CardType in presentationState.ts.
 * Duplicated here so the SDK does not depend on SolidJS frontend code.
 */
export type CardType =
  | "summary" | "key_facts" | "sources" | "timeline" | "definition"
  | "comparison" | "compound" | "element_breakdown" | "properties_table"
  | "map" | "weather" | "flights" | "accommodation" | "activities"
  | "itinerary" | "price_metrics" | "ingredients" | "steps"
  | "code_snippet" | "profile";

/**
 * Default load strategy per card type.
 *
 * immediate → rendered on Stage 1 (cheap, always)
 * lazy      → rendered after Stage 1 completes, before user interaction
 * onInteraction → only fetched when user expands/clicks the card
 */
export const CARD_LOAD_STRATEGIES: Record<CardType, CardLoadStrategy> = {
  // ── Universal — always cheap ────────────────────────────────────────────────
  summary:           { load: "immediate",     stage: 1, estimatedCostUSD: 0.001, showSkeleton: false },
  key_facts:         { load: "immediate",     stage: 1, estimatedCostUSD: 0.001, showSkeleton: false },
  definition:        { load: "immediate",     stage: 1, estimatedCostUSD: 0.001, showSkeleton: false },
  sources:           { load: "lazy",          stage: 1, estimatedCostUSD: 0.000, showSkeleton: false },
  // ── Structured content — stage 1/2 ──────────────────────────────────────────
  timeline:          { load: "lazy",          stage: 1, estimatedCostUSD: 0.001, showSkeleton: true },
  comparison:        { load: "lazy",          stage: 2, estimatedCostUSD: 0.005, showSkeleton: true },
  profile:           { load: "lazy",          stage: 1, estimatedCostUSD: 0.001, showSkeleton: true },
  // ── Science cards ────────────────────────────────────────────────────────────
  compound:          { load: "immediate",     stage: 1, estimatedCostUSD: 0.001, showSkeleton: false },
  element_breakdown: { load: "lazy",          stage: 1, estimatedCostUSD: 0.001, showSkeleton: true },
  properties_table:  { load: "lazy",          stage: 2, estimatedCostUSD: 0.003, showSkeleton: true },
  // ── Travel — map/weather cheap; flights/hotels expensive ─────────────────────
  map:               { load: "immediate",     stage: 1, estimatedCostUSD: 0.000, showSkeleton: false },
  weather:           { load: "immediate",     stage: 2, estimatedCostUSD: 0.001, showSkeleton: true },
  flights:           { load: "onInteraction", stage: 3, estimatedCostUSD: 0.005, showSkeleton: true },
  accommodation:     { load: "onInteraction", stage: 3, estimatedCostUSD: 0.003, showSkeleton: true },
  activities:        { load: "lazy",          stage: 2, estimatedCostUSD: 0.002, showSkeleton: true },
  itinerary:         { load: "lazy",          stage: 2, estimatedCostUSD: 0.005, showSkeleton: true },
  // ── Finance ──────────────────────────────────────────────────────────────────
  price_metrics:     { load: "lazy",          stage: 2, estimatedCostUSD: 0.002, showSkeleton: true },
  // ── Recipe / food ─────────────────────────────────────────────────────────────
  ingredients:       { load: "immediate",     stage: 1, estimatedCostUSD: 0.001, showSkeleton: false },
  steps:             { load: "immediate",     stage: 1, estimatedCostUSD: 0.001, showSkeleton: false },
  // ── Developer ─────────────────────────────────────────────────────────────────
  code_snippet:      { load: "immediate",     stage: 1, estimatedCostUSD: 0.002, showSkeleton: false },
};

/** Returns the effective load mode given the current budget status.
 *  Budget pressure can force lazy → immediate (use cached estimate) or
 *  onInteraction → never (skip card entirely if budget is hard-exceeded). */
export function effectiveLoadMode(
  cardType: CardType,
  budgetStatus: BudgetStatus,
): CardLoadMode {
  const strategy = CARD_LOAD_STRATEGIES[cardType];
  if (!strategy) return "immediate";
  if (budgetStatus === "hard_exceeded" && strategy.load !== "immediate") {
    // Only stage-1 immediate cards survive hard budget exceeded
    return strategy.stage === 1 ? "lazy" : "onInteraction";
  }
  if (budgetStatus === "soft_exceeded" && strategy.load === "onInteraction" && strategy.stage === 3) {
    // Keep onInteraction for expensive cards — user must explicitly request them
    return "onInteraction";
  }
  return strategy.load;
}

// ── Strategy downgrade decisions ──────────────────────────────────────────────

export type DowngradeAction =
  | { type: "use_cache";     cacheKey: string }
  | { type: "use_estimate";  estimatedValue: unknown }
  | { type: "skip_card";     cardType: CardType }
  | { type: "reduce_tokens"; newMaxTokens: number }
  | { type: "delay_node";    nodeId: string; delayMs: number }
  | { type: "use_tier";      tier: ApiTier };

export function computeDowngrade(
  ctx: ExecutionContext,
  cardType: CardType,
  estimatedCostUSD: number,
): DowngradeAction {
  const status = getBudgetStatus(ctx);
  const strategy = CARD_LOAD_STRATEGIES[cardType];

  if (status === "hard_exceeded") {
    if (strategy?.stage === 3) return { type: "skip_card", cardType };
    return { type: "use_tier", tier: 1 };
  }

  if (ctx.costSoFar + estimatedCostUSD > ctx.budget.maxCostUSD) {
    if (strategy?.stage >= 3) return { type: "use_estimate", estimatedValue: null };
    return { type: "use_tier", tier: 2 };
  }

  return { type: "use_tier", tier: allowedStage(ctx) as ApiTier };
}

// ── Cache key helpers ─────────────────────────────────────────────────────────

export type CacheKeyParams = {
  dataType:    string;
  destination?: string;
  dateRange?:  string;
  travelers?:  number;
  query?:      string;
  cardType?:   string;
  [key: string]: unknown;
};

/** Stable, deterministic cache key from a parameter object. */
export function buildCacheKey(params: CacheKeyParams): string {
  // Sort keys for determinism
  const sorted = Object.keys(params).sort().reduce<Record<string, unknown>>((acc, k) => {
    if (params[k] !== undefined && params[k] !== null && params[k] !== "") {
      acc[k] = params[k];
    }
    return acc;
  }, {});
  return JSON.stringify(sorted);
}

/** TTL in seconds per data type (stale-while-revalidate windows). */
export const CACHE_TTL_SECONDS: Record<string, number> = {
  weather:       3_600,      // 1 hour — weather changes hourly
  flights:       1_800,      // 30 min — prices shift frequently
  accommodation: 7_200,      // 2 hours
  activities:    86_400,     // 24 hours — activity lists are stable
  summary:       3_600,      // 1 hour
  key_facts:     86_400,     // 24 hours
  map:           604_800,    // 7 days — coordinates don't change
  compound:      604_800,    // 7 days — chemical data is static
  price_metrics: 900,        // 15 min — market data
  code_snippet:  86_400,     // 24 hours
};

export function cacheTtl(dataType: string): number {
  return CACHE_TTL_SECONDS[dataType] ?? 3_600;
}

// ── LLM cost estimation ────────────────────────────────────────────────────────

/** Approximate USD cost given model and token counts. */
export function estimateLlmCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  // Prices per 1M tokens (USD) — conservative estimates
  const pricing: Record<string, { input: number; output: number }> = {
    "claude-haiku-4-5":   { input: 0.25,  output: 1.25  },
    "claude-sonnet-4-6":  { input: 3.00,  output: 15.00 },
    "claude-opus-4-6":    { input: 15.00, output: 75.00 },
    "gpt-4o-mini":        { input: 0.15,  output: 0.60  },
    "gpt-4o":             { input: 5.00,  output: 15.00 },
    default:              { input: 1.00,  output: 5.00  },
  };
  const p = pricing[model] ?? pricing.default;
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000;
}

// CardType is defined above — no re-export needed.
