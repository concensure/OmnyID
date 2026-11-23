/**
 * Per-query budgets. The router NEVER exceeds these; when a layer would,
 * it degrades gracefully (returns best-so-far with a budget report) rather
 * than silently decrypting or embedding more.
 */

export interface Budget {
  /** Hard cap on bodies decrypted in L5. */
  maxDecryptions: number;
  /** Approx. token cap for anything sent to an LLM (L5 synthesis). */
  maxTokens: number;
  /** Soft wall-clock cap; checked between layers. */
  maxLatencyMs: number;
  /** Cap on candidates carried between layers (working-set memory). */
  maxWorkingSet: number;
  /** Cap on embedding computations for novel query text. */
  maxEmbeddings: number;
}

export const DEFAULT_BUDGET: Budget = {
  maxDecryptions: 8,
  maxTokens: 4_000,
  maxLatencyMs: 1_500,
  maxWorkingSet: 200,
  maxEmbeddings: 1,
};

/** Conservative profile for Background Watcher (runs constantly, must be calm). */
export const BACKGROUND_BUDGET: Budget = {
  maxDecryptions: 0,
  maxTokens: 0,
  maxLatencyMs: 400,
  maxWorkingSet: 100,
  maxEmbeddings: 0,
};

export interface BudgetReport {
  decryptions: number;
  tokens: number;
  embeddings: number;
  elapsedMs: number;
  exhausted: ('decryptions' | 'tokens' | 'latency' | 'embeddings')[];
}

export class BudgetTracker {
  readonly budget: Budget;
  private readonly start = performance.now();
  private decryptions = 0;
  private tokens = 0;
  private embeddings = 0;
  private exhausted = new Set<BudgetReport['exhausted'][number]>();

  constructor(overrides?: Partial<Budget>) {
    this.budget = { ...DEFAULT_BUDGET, ...overrides };
  }

  get elapsedMs(): number {
    return performance.now() - this.start;
  }

  get latencyOk(): boolean {
    const ok = this.elapsedMs < this.budget.maxLatencyMs;
    if (!ok) this.exhausted.add('latency');
    return ok;
  }

  /** Reserve n decryptions; returns how many are actually allowed. */
  reserveDecryptions(n: number): number {
    const allowed = Math.max(0, Math.min(n, this.budget.maxDecryptions - this.decryptions));
    this.decryptions += allowed;
    if (allowed < n) this.exhausted.add('decryptions');
    return allowed;
  }

  reserveEmbeddings(n: number): number {
    const allowed = Math.max(0, Math.min(n, this.budget.maxEmbeddings - this.embeddings));
    this.embeddings += allowed;
    if (allowed < n) this.exhausted.add('embeddings');
    return allowed;
  }

  spendTokens(n: number): boolean {
    if (this.tokens + n > this.budget.maxTokens) {
      this.exhausted.add('tokens');
      return false;
    }
    this.tokens += n;
    return true;
  }

  report(): BudgetReport {
    return {
      decryptions: this.decryptions,
      tokens: this.tokens,
      embeddings: this.embeddings,
      elapsedMs: Math.round(this.elapsedMs),
      exhausted: [...this.exhausted],
    };
  }
}
