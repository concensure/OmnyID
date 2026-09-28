/**
 * costStrategy.ts — Frontend cost-awareness layer for the UI Presentation system.
 *
 * Responsibilities:
 *   1. Define CardLoadStrategy per card type (immediate / lazy / onInteraction)
 *   2. Provide SolidJS signals for the current retrieval stage and budget status
 *   3. Expose trigger functions for Stage 2 and Stage 3 escalation
 *   4. Provide a useLazyCard() hook that resolves the effective load mode given
 *      the current stage and budget pressure
 *
 * This module does NOT call APIs itself — it coordinates timing.
 * The actual data fetching is done by the server via card_section_update AFP messages.
 *
 * Budget data comes from GET /api/cost/budget (polled once on mount).
 */

import { createSignal, createMemo } from "solid-js";
import { parseCostBudgetResponse } from "@/lib/costBudgetResponseState";
import type { CardType } from "@/lib/presentationState";

// ── Card load strategy ────────────────────────────────────────────────────────

export type CardLoadMode = "immediate" | "lazy" | "onInteraction";

export type CardLoadStrategy = {
  /** When to initiate the data fetch for this card */
  load: CardLoadMode;
  /** Minimum retrieval stage required to populate this card */
  stage: 1 | 2 | 3;
  /** Estimated USD cost to load this card at its required stage */
  estimatedCostUSD: number;
  /** Show a skeleton placeholder while loading */
  showSkeleton: boolean;
};

/**
 * Default load strategy per card type.
 *
 * Alignment with the backend's multi-stage retrieval pipeline:
 *   Stage 1 → LLM reasoning, cached data, heuristics   (cheap)
 *   Stage 2 → Filtered API calls                        (moderate)
 *   Stage 3 → Full API datasets, deep comparisons       (expensive)
 *
 * immediate     → render at Stage 1 with data already in the AFP response
 * lazy          → render after Stage 1 completes, before user interaction
 * onInteraction → only fetch when user expands the card shell
 */
export const CARD_LOAD_STRATEGIES: Record<CardType, CardLoadStrategy> = {
  // ── Universal ───────────────────────────────────────────────────────────────
  summary:           { load: "immediate",     stage: 1, estimatedCostUSD: 0.001, showSkeleton: false },
  key_facts:         { load: "immediate",     stage: 1, estimatedCostUSD: 0.001, showSkeleton: false },
  definition:        { load: "immediate",     stage: 1, estimatedCostUSD: 0.001, showSkeleton: false },
  sources:           { load: "lazy",          stage: 1, estimatedCostUSD: 0.000, showSkeleton: false },
  timeline:          { load: "lazy",          stage: 1, estimatedCostUSD: 0.001, showSkeleton: true  },
  comparison:        { load: "lazy",          stage: 2, estimatedCostUSD: 0.005, showSkeleton: true  },
  profile:           { load: "lazy",          stage: 1, estimatedCostUSD: 0.001, showSkeleton: true  },
  // ── Science ─────────────────────────────────────────────────────────────────
  compound:          { load: "immediate",     stage: 1, estimatedCostUSD: 0.001, showSkeleton: false },
  element_breakdown: { load: "lazy",          stage: 1, estimatedCostUSD: 0.001, showSkeleton: true  },
  properties_table:  { load: "lazy",          stage: 2, estimatedCostUSD: 0.003, showSkeleton: true  },
  // ── Travel ──────────────────────────────────────────────────────────────────
  map:               { load: "immediate",     stage: 1, estimatedCostUSD: 0.000, showSkeleton: false },
  weather:           { load: "immediate",     stage: 2, estimatedCostUSD: 0.001, showSkeleton: true  },
  flights:           { load: "onInteraction", stage: 3, estimatedCostUSD: 0.005, showSkeleton: true  },
  accommodation:     { load: "onInteraction", stage: 3, estimatedCostUSD: 0.003, showSkeleton: true  },
  activities:        { load: "lazy",          stage: 2, estimatedCostUSD: 0.002, showSkeleton: true  },
  itinerary:         { load: "lazy",          stage: 2, estimatedCostUSD: 0.005, showSkeleton: true  },
  // ── Finance ─────────────────────────────────────────────────────────────────
  price_metrics:     { load: "lazy",          stage: 2, estimatedCostUSD: 0.002, showSkeleton: true  },
  // ── Recipe ──────────────────────────────────────────────────────────────────
  ingredients:       { load: "immediate",     stage: 1, estimatedCostUSD: 0.001, showSkeleton: false },
  steps:             { load: "immediate",     stage: 1, estimatedCostUSD: 0.001, showSkeleton: false },
  // ── Developer ───────────────────────────────────────────────────────────────
  code_snippet:      { load: "immediate",     stage: 1, estimatedCostUSD: 0.002, showSkeleton: false },
};

// ── Budget status ─────────────────────────────────────────────────────────────

export type BudgetStatus = "ok" | "soft_exceeded" | "hard_exceeded";

export type BudgetSnapshot = {
  maxCostUSD:    number;
  maxAPICalls:   number;
  maxLLMTokens:  number;
  softLimitRatio: number;
};

// ── Stage context ─────────────────────────────────────────────────────────────

export type RetrievalStage = 1 | 2 | 3;

/**
 * Creates a self-contained cost strategy context for a single
 * PresentationCardRenderer instance.
 *
 * Usage:
 *   const strategy = createCostStrategy();
 *   // pass strategy to all cards
 *   <FlightsCard strategy={strategy} ... />
 *
 * The strategy is NOT global — each PresentationCardRenderer gets its own
 * independent instance, matching how PresentationStateCtx works.
 */
export function createCostStrategy(initialBudget?: Partial<BudgetSnapshot>) {
  // ── Reactive stage signal ─────────────────────────────────────────────────
  // Stage advances as user interacts or server returns data.
  const [stage, setStage] = createSignal<RetrievalStage>(1);

  // ── Budget snapshot (loaded from /api/cost/budget on mount) ───────────────
  const [budget, setBudget] = createSignal<BudgetSnapshot>({
    maxCostUSD:    initialBudget?.maxCostUSD    ?? 0.10,
    maxAPICalls:   initialBudget?.maxAPICalls   ?? 20,
    maxLLMTokens:  initialBudget?.maxLLMTokens  ?? 50_000,
    softLimitRatio: initialBudget?.softLimitRatio ?? 0.80,
  });

  // ── Spending tracker ──────────────────────────────────────────────────────
  const [spent, setSpent] = createSignal(0);
  const [cardsLoaded, setCardsLoaded] = createSignal<Set<string>>(new Set());

  // ── Derived budget status ─────────────────────────────────────────────────
  const budgetStatus = createMemo<BudgetStatus>(() => {
    const b = budget();
    const s = spent();
    if (s >= b.maxCostUSD) return "hard_exceeded";
    if (s >= b.maxCostUSD * b.softLimitRatio) return "soft_exceeded";
    return "ok";
  });

  // ── Stage advancement ─────────────────────────────────────────────────────

  /** Advance to Stage 2 — triggered automatically after Stage 1 cards render. */
  function advanceToStage2() {
    if (stage() < 2 && budgetStatus() !== "hard_exceeded") {
      setStage(2);
    }
  }

  /** Advance to Stage 3 — triggered on card interaction (expand/click). */
  function advanceToStage3() {
    if (stage() < 3 && budgetStatus() === "ok") {
      setStage(3);
    }
  }

  /** Mark a card as having been loaded (avoids duplicate fetch triggers). */
  function markCardLoaded(cardId: string) {
    setCardsLoaded(prev => new Set([...prev, cardId]));
  }

  function isCardLoaded(cardId: string) {
    return cardsLoaded().has(cardId);
  }

  /** Track that a card cost was incurred — updates the spent signal. */
  function recordCardCost(cardType: CardType) {
    const strategy = CARD_LOAD_STRATEGIES[cardType];
    if (strategy) {
      setSpent(prev => prev + strategy.estimatedCostUSD);
    }
  }

  // ── Effective load mode ───────────────────────────────────────────────────

  /**
   * Compute the effective load mode for a card given current stage and budget.
   *
   * Rules:
   *   - If card's required stage > allowed_stage → demote to onInteraction
   *   - If hard_exceeded → all non-stage-1 cards become onInteraction
   *   - If soft_exceeded → stage-3 cards stay onInteraction; stage-2 become lazy
   */
  function effectiveLoadMode(cardType: CardType): CardLoadMode {
    const s = CARD_LOAD_STRATEGIES[cardType];
    if (!s) return "immediate";

    const status = budgetStatus();
    const allowedStage: RetrievalStage =
      status === "hard_exceeded" ? 1 :
      status === "soft_exceeded" ? 2 :
      3;

    if (s.stage > allowedStage) {
      return "onInteraction";
    }
    return s.load;
  }

  /**
   * Returns true if the card should render its data now (rather than a skeleton).
   *
   * - immediate → always true
   * - lazy      → true once stage >= card.stage
   * - onInteraction → true only if the card has been explicitly loaded
   */
  function shouldRenderData(cardType: CardType, cardId: string): boolean {
    const s = CARD_LOAD_STRATEGIES[cardType];
    if (!s) return true;

    const mode = effectiveLoadMode(cardType);
    if (mode === "immediate") return true;
    if (mode === "onInteraction") return isCardLoaded(cardId);
    // lazy — true once stage has reached the card's required stage
    return stage() >= s.stage;
  }

  /**
   * Called when user expands a card. Advances stage if needed and marks loaded.
   * Returns true if a new stage-3 fetch was triggered.
   */
  function onCardExpand(cardType: CardType, cardId: string): boolean {
    markCardLoaded(cardId);
    const s = CARD_LOAD_STRATEGIES[cardType];
    if (!s) return false;

    if (s.stage === 3 && stage() < 3) {
      advanceToStage3();
      recordCardCost(cardType);
      return true;
    }
    if (s.stage === 2 && stage() < 2) {
      advanceToStage2();
      recordCardCost(cardType);
      return true;
    }
    return false;
  }

  // ── Budget loading ────────────────────────────────────────────────────────

  /** Fetch user's budget from the server and update signals. */
  async function loadBudget(authToken: string) {
    try {
      const res = await fetch("/api/cost/budget", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) return;
      setBudget(parseCostBudgetResponse(await res.json()));
    } catch {
      // Non-fatal: budget defaults are sufficient
    }
  }

  return {
    // ── Reactive state ──────────────────────────────────────────────────────
    stage,
    budget,
    budgetStatus,
    spent,
    // ── Mutations ───────────────────────────────────────────────────────────
    advanceToStage2,
    advanceToStage3,
    markCardLoaded,
    isCardLoaded,
    recordCardCost,
    loadBudget,
    // ── Query helpers ────────────────────────────────────────────────────────
    effectiveLoadMode,
    shouldRenderData,
    onCardExpand,
  } as const;
}

export type CostStrategyCtx = ReturnType<typeof createCostStrategy>;

// ── Skeleton component data ───────────────────────────────────────────────────

/** Returns a loading label for skeleton states. */
export function skeletonLabel(cardType: CardType): string {
  const s = CARD_LOAD_STRATEGIES[cardType];
  if (!s) return "Loading…";
  switch (s.stage) {
    case 1: return "Loading…";
    case 2: return "Fetching live data…";
    case 3: return "Tap to load live results";
  }
}

/** True for cards that defer until user interaction (flights, hotels). */
export function isInteractionGated(cardType: CardType): boolean {
  return CARD_LOAD_STRATEGIES[cardType]?.load === "onInteraction";
}

/** Estimated total cost to fully load all cards for a domain. */
export function estimateDomainCost(cardTypes: CardType[]): number {
  return cardTypes.reduce((sum, ct) => {
    return sum + (CARD_LOAD_STRATEGIES[ct]?.estimatedCostUSD ?? 0);
  }, 0);
}
