"""
cost_engine.py — Provider/model-aware cost estimation engine for Agenton.

Hierarchy:
  ModelProfile      — per-model pricing, speed, context window
  MODEL_REGISTRY    — all known models
  get_profile()     — lookup with fallback inference from provider
  CostModel         — initialized from GET /user/llm-config; all estimate methods
  StrategySelector  — picks best CostEstimate given optimization_mode
  PreExecutionEstimate — full pre-task summary shown to user

Usage:
    from afp.cost_engine import CostModel, StrategySelector

    llm_config = await agent.fetch_llm_config()      # dict from /user/llm-config
    cost_model = CostModel(llm_config)

    estimate = cost_model.estimate_tool_call("web_search", params={}, executor_time_secs=3.0)
    print(cost_model.format_estimate(estimate))      # "Tool call · free (local) · ~3s"
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field

logger = logging.getLogger("agenton.cost_engine")


# ── Model profiles ────────────────────────────────────────────────────────────

@dataclass
class ModelProfile:
    """Pricing and performance characteristics for one model on one provider."""
    provider: str               # "anthropic" | "ollama" | "runpod" | "byok" | "openai"
    model_id: str               # canonical model ID string
    input_cost_per_1m: float    # USD per 1M input tokens (0.0 for self-hosted)
    output_cost_per_1m: float   # USD per 1M output tokens (0.0 for self-hosted)
    compute_cost_per_hr: float  # USD/hr for self-hosted GPU (0.0 for cloud API)
    avg_tokens_per_sec: float   # output generation speed (for time estimates)
    context_window: int         # max context tokens
    quality_tier: str           # "high" | "medium" | "low"


# Latest stable prices as of Q1 2026 — update if Anthropic/providers change pricing
MODEL_REGISTRY: dict[str, ModelProfile] = {
    # ── Anthropic cloud ───────────────────────────────────────────────────────
    "claude-haiku-4-5-20251001": ModelProfile(
        provider="anthropic", model_id="claude-haiku-4-5-20251001",
        input_cost_per_1m=0.80,  output_cost_per_1m=4.00,
        compute_cost_per_hr=0.0, avg_tokens_per_sec=180,
        context_window=200_000,  quality_tier="medium",
    ),
    "claude-haiku-4-5": ModelProfile(
        provider="anthropic", model_id="claude-haiku-4-5",
        input_cost_per_1m=0.80,  output_cost_per_1m=4.00,
        compute_cost_per_hr=0.0, avg_tokens_per_sec=180,
        context_window=200_000,  quality_tier="medium",
    ),
    "claude-sonnet-4-6": ModelProfile(
        provider="anthropic", model_id="claude-sonnet-4-6",
        input_cost_per_1m=3.00,  output_cost_per_1m=15.00,
        compute_cost_per_hr=0.0, avg_tokens_per_sec=120,
        context_window=200_000,  quality_tier="high",
    ),
    "claude-sonnet-4-20250514": ModelProfile(
        provider="anthropic", model_id="claude-sonnet-4-20250514",
        input_cost_per_1m=3.00,  output_cost_per_1m=15.00,
        compute_cost_per_hr=0.0, avg_tokens_per_sec=120,
        context_window=200_000,  quality_tier="high",
    ),
    "claude-opus-4-6": ModelProfile(
        provider="anthropic", model_id="claude-opus-4-6",
        input_cost_per_1m=15.00, output_cost_per_1m=75.00,
        compute_cost_per_hr=0.0, avg_tokens_per_sec=50,
        context_window=200_000,  quality_tier="high",
    ),
    # ── RunPod self-hosted (vLLM) ─────────────────────────────────────────────
    "Qwen/Qwen3.5-35B-A3B": ModelProfile(
        provider="runpod", model_id="Qwen/Qwen3.5-35B-A3B",
        input_cost_per_1m=0.0,   output_cost_per_1m=0.0,
        compute_cost_per_hr=0.50, avg_tokens_per_sec=80,
        context_window=32_768,   quality_tier="medium",
    ),
    "Qwen/Qwen2.5-72B-Instruct": ModelProfile(
        provider="runpod", model_id="Qwen/Qwen2.5-72B-Instruct",
        input_cost_per_1m=0.0,   output_cost_per_1m=0.0,
        compute_cost_per_hr=0.50, avg_tokens_per_sec=55,
        context_window=32_768,   quality_tier="high",
    ),
    "mistralai/Mistral-7B-Instruct-v0.3": ModelProfile(
        provider="runpod", model_id="mistralai/Mistral-7B-Instruct-v0.3",
        input_cost_per_1m=0.0,   output_cost_per_1m=0.0,
        compute_cost_per_hr=0.20, avg_tokens_per_sec=120,
        context_window=32_768,   quality_tier="low",
    ),
    # ── Ollama local ──────────────────────────────────────────────────────────
    "llama3.1:8b": ModelProfile(
        provider="ollama", model_id="llama3.1:8b",
        input_cost_per_1m=0.0,   output_cost_per_1m=0.0,
        compute_cost_per_hr=0.0, avg_tokens_per_sec=40,
        context_window=8_192,    quality_tier="low",
    ),
    "llama3.1:70b": ModelProfile(
        provider="ollama", model_id="llama3.1:70b",
        input_cost_per_1m=0.0,   output_cost_per_1m=0.0,
        compute_cost_per_hr=0.0, avg_tokens_per_sec=10,
        context_window=8_192,    quality_tier="medium",
    ),
    "qwen2.5:14b": ModelProfile(
        provider="ollama", model_id="qwen2.5:14b",
        input_cost_per_1m=0.0,   output_cost_per_1m=0.0,
        compute_cost_per_hr=0.0, avg_tokens_per_sec=25,
        context_window=32_768,   quality_tier="medium",
    ),
    "qwen2.5:7b": ModelProfile(
        provider="ollama", model_id="qwen2.5:7b",
        input_cost_per_1m=0.0,   output_cost_per_1m=0.0,
        compute_cost_per_hr=0.0, avg_tokens_per_sec=45,
        context_window=32_768,   quality_tier="low",
    ),
    "mistral:7b": ModelProfile(
        provider="ollama", model_id="mistral:7b",
        input_cost_per_1m=0.0,   output_cost_per_1m=0.0,
        compute_cost_per_hr=0.0, avg_tokens_per_sec=40,
        context_window=8_192,    quality_tier="low",
    ),
}


def get_profile(provider: str, model: str) -> ModelProfile:
    """
    Look up a ModelProfile. Falls back to provider-default estimates when the
    exact model ID is not in the registry.
    """
    if model in MODEL_REGISTRY:
        return MODEL_REGISTRY[model]

    logger.debug("Unknown model %r on provider %r — using provider defaults", model, provider)

    if provider == "ollama":
        return ModelProfile(
            provider="ollama", model_id=model,
            input_cost_per_1m=0.0, output_cost_per_1m=0.0,
            compute_cost_per_hr=0.0, avg_tokens_per_sec=30,
            context_window=8_192, quality_tier="low",
        )
    if provider == "runpod":
        return ModelProfile(
            provider="runpod", model_id=model,
            input_cost_per_1m=0.0, output_cost_per_1m=0.0,
            compute_cost_per_hr=0.50, avg_tokens_per_sec=60,
            context_window=32_768, quality_tier="medium",
        )
    # Anthropic / BYOK / unknown — assume Haiku-class pricing as conservative estimate
    return ModelProfile(
        provider=provider, model_id=model,
        input_cost_per_1m=0.80, output_cost_per_1m=4.00,
        compute_cost_per_hr=0.0, avg_tokens_per_sec=100,
        context_window=200_000, quality_tier="medium",
    )


# ── CostEstimate (re-exported here for convenience) ───────────────────────────

@dataclass
class CostEstimate:
    """
    Provider/model-aware cost estimate for one execution strategy.
    Mirrors afp.executors.base.CostEstimate — defined here to avoid circular imports
    when cost_engine is used standalone. They are duck-type compatible.
    """
    strategy_label: str          # "tool_call" | "code_gen" | "hybrid"
    token_cost: int              # estimated total tokens (input + output)
    dollar_cost_cents: float     # estimated cost in cents (0.0 for local backends)
    time_seconds: float          # estimated wall-clock seconds
    confidence: float            # 0.0–1.0
    rationale: str               # human-readable explanation
    provider: str = ""           # "anthropic" | "ollama" | "runpod" | "byok"
    model: str = ""              # specific model ID
    compute_note: str = ""       # e.g. "RunPod A100 GPU" or "local CPU"


# ── CostModel ─────────────────────────────────────────────────────────────────

class CostModel:
    """
    Provider/model-aware cost estimator initialized from the user's LLM config.

    Initialized once per task run from GET /user/llm-config:
      {backend, provider, model, monthly_budget_cents, usage_cents_current_month, ollama_url}
    """

    # Per-provider network latency overhead in seconds
    _PROVIDER_OVERHEAD: dict[str, float] = {
        "anthropic": 1.5,
        "runpod":    3.0,
        "ollama":    0.5,
        "byok":      2.0,
    }

    def __init__(self, llm_config: dict | None = None) -> None:
        cfg = llm_config or {}
        self.backend: str  = cfg.get("backend",  "hosted")
        self.provider: str = cfg.get("provider", "anthropic")
        self.model: str    = cfg.get("model",    "claude-haiku-4-5-20251001")
        self.profile = get_profile(self.provider, self.model)

        budget   = float(cfg.get("monthly_budget_cents",       10_000))
        used     = float(cfg.get("usage_cents_current_month",  0))
        self.budget_remaining: float = max(0.0, budget - used)

        # Compute note for display
        if self.provider == "ollama":
            self.compute_note = f"local ({self.model})"
        elif self.provider == "runpod":
            self.compute_note = f"RunPod GPU ({self.model})"
        else:
            self.compute_note = f"{self.provider.title()} API ({self.model})"

    # ── Token utilities ───────────────────────────────────────────────────────

    def estimate_tokens(self, text: str) -> int:
        """
        Approximate token count.
        ~4 chars per token for English/Latin scripts; ~2 for CJK.
        Returns at least 1.
        """
        if not text:
            return 1
        # Simple heuristic: count CJK characters as 2 tokens, rest as 0.25 tokens
        cjk = sum(1 for c in text if '\u4e00' <= c <= '\u9fff' or '\u3040' <= c <= '\u30ff')
        latin = len(text) - cjk
        return max(1, int(cjk * 0.5 + latin * 0.25))

    # ── Cost calculators ──────────────────────────────────────────────────────

    def estimate_llm_cost_cents(self, input_tokens: int, output_tokens: int) -> float:
        """
        Estimate monetary cost for a single LLM call.

        Cloud API (Anthropic, BYOK): per-token pricing.
        Self-hosted GPU (RunPod): cost = GPU-hour rate × generation time.
        Local (Ollama): free.
        """
        p = self.profile
        if p.input_cost_per_1m > 0:
            # Cloud API: pay per token
            cost_usd = (
                input_tokens  * p.input_cost_per_1m  / 1_000_000 +
                output_tokens * p.output_cost_per_1m / 1_000_000
            )
            return cost_usd * 100  # → cents

        if p.compute_cost_per_hr > 0:
            # Self-hosted GPU: charge for GPU time, not tokens
            gen_time_secs = output_tokens / max(1.0, p.avg_tokens_per_sec)
            return (gen_time_secs / 3600.0) * p.compute_cost_per_hr * 100

        return 0.0  # Ollama: user's own hardware, no cost

    def estimate_time_secs(self, input_tokens: int, output_tokens: int) -> float:
        """
        Estimate total wall-clock time for an LLM call.
        = network latency overhead + token generation time.
        """
        overhead = self._PROVIDER_OVERHEAD.get(self.provider, 2.0)
        gen_time = output_tokens / max(1.0, self.profile.avg_tokens_per_sec)
        return overhead + gen_time

    # ── Strategy estimators ───────────────────────────────────────────────────

    def estimate_code_gen(self, task_description: str) -> "CostEstimate":
        """
        Estimate cost of having the LLM generate Python code to solve a task.
        Assumes ~500 token system prompt + task tokens for input, ~800 tokens output.
        """
        input_tok  = self.estimate_tokens(task_description) + 500  # system prompt overhead
        output_tok = 800  # typical code generation

        return CostEstimate(
            strategy_label="code_gen",
            token_cost=input_tok + output_tok,
            dollar_cost_cents=self.estimate_llm_cost_cents(input_tok, output_tok),
            time_seconds=self.estimate_time_secs(input_tok, output_tok),
            confidence=0.6,
            rationale=(
                f"LLM generates Python code "
                f"({self.model}, ~{input_tok} input + ~{output_tok} output tokens)"
            ),
            provider=self.provider,
            model=self.model,
            compute_note=self.compute_note,
        )

    def estimate_tool_call(
        self,
        executor_name: str,
        params: dict,
        executor_time_secs: float,
        executor_tokens: int = 0,
    ) -> "CostEstimate":
        """
        Estimate cost of calling a tool executor.

        executor_time_secs: wall-clock time for the tool itself (e.g. Playwright, file I/O)
        executor_tokens: tokens consumed IF the executor also makes an LLM call
                         (e.g. web_search uses LLM to summarize results)
        """
        llm_cost = (
            self.estimate_llm_cost_cents(executor_tokens, executor_tokens // 2)
            if executor_tokens > 0
            else 0.0
        )
        llm_time = (
            self.estimate_time_secs(executor_tokens, executor_tokens // 2)
            if executor_tokens > 0
            else 0.0
        )

        token_note = (
            f" + {executor_tokens} tokens on {self.model}"
            if executor_tokens > 0
            else "no LLM call"
        )

        return CostEstimate(
            strategy_label="tool_call",
            token_cost=executor_tokens,
            dollar_cost_cents=llm_cost,
            time_seconds=executor_time_secs + llm_time,
            confidence=0.8,
            rationale=f"Executor '{executor_name}' ({token_note})",
            provider=self.provider,
            model=self.model,
            compute_note=self.compute_note,
        )

    def estimate_hybrid(
        self,
        executor_name: str,
        executor_time_secs: float,
        llm_input_tokens: int,
        llm_output_tokens: int,
    ) -> "CostEstimate":
        """
        Estimate cost for a hybrid strategy: tool call + LLM synthesis.
        Used by research_pipeline, ecommerce comparison, etc.
        """
        llm_cost = self.estimate_llm_cost_cents(llm_input_tokens, llm_output_tokens)
        llm_time = self.estimate_time_secs(llm_input_tokens, llm_output_tokens)
        total_tokens = llm_input_tokens + llm_output_tokens

        return CostEstimate(
            strategy_label="hybrid",
            token_cost=total_tokens,
            dollar_cost_cents=llm_cost,
            time_seconds=executor_time_secs + llm_time,
            confidence=0.75,
            rationale=(
                f"Tool '{executor_name}' + LLM synthesis "
                f"(~{total_tokens} tokens on {self.model})"
            ),
            provider=self.provider,
            model=self.model,
            compute_note=self.compute_note,
        )

    # ── Display helpers ───────────────────────────────────────────────────────

    def format_estimate(self, estimate: "CostEstimate") -> str:
        """One-line human-readable summary for terminal / log output."""
        parts = [estimate.strategy_label]

        if estimate.dollar_cost_cents > 0:
            parts.append(f"~${estimate.dollar_cost_cents / 100:.4f}")
        elif self.provider == "ollama":
            parts.append("free (local)")
        elif self.provider == "runpod":
            if estimate.dollar_cost_cents > 0:
                parts.append(f"~${estimate.dollar_cost_cents / 100:.4f} GPU")
            else:
                parts.append("~$0 GPU")
        else:
            parts.append("$0")

        parts.append(f"~{estimate.time_seconds:.0f}s")
        parts.append(f"model: {self.model}")

        if estimate.token_cost > 0:
            parts.append(f"{estimate.token_cost:,} tokens")

        return " · ".join(parts)


# ── StrategySelector ──────────────────────────────────────────────────────────

class StrategySelector:
    """
    Selects the best CostEstimate from a list of candidates based on optimization_mode.

    Provider-aware weighting:
      - Anthropic cloud: token cost is real money → cost matters more in "balanced"
      - RunPod GPU: GPU-hour is real cost but mostly time-bound → time matters more
      - Ollama: everything is free → just pick fastest regardless of mode
    """

    def __init__(self, cost_model: CostModel) -> None:
        self.cost_model = cost_model

    def select(self, candidates: list["CostEstimate"], mode: str) -> "CostEstimate":
        if not candidates:
            raise ValueError("No strategy candidates to select from")

        if mode == "speed":
            return min(candidates, key=lambda c: c.time_seconds)

        if mode == "cost":
            p = self.cost_model.profile
            if p.input_cost_per_1m == 0 and p.compute_cost_per_hr == 0:
                # Ollama: all strategies are free — just go fastest
                return min(candidates, key=lambda c: c.time_seconds)
            return min(candidates, key=lambda c: c.dollar_cost_cents)

        # "balanced" — provider-specific weighting
        p = self.cost_model.profile
        if p.compute_cost_per_hr > 0:
            # RunPod: GPU time IS cost → weight time higher
            return min(candidates, key=lambda c: c.time_seconds * 0.6 + c.dollar_cost_cents * 0.4)
        if p.input_cost_per_1m > 0:
            # Anthropic cloud: token cost is real → weight cost higher
            return min(candidates, key=lambda c: c.time_seconds * 0.3 + c.dollar_cost_cents * 0.7)
        # Ollama local: free → just fastest
        return min(candidates, key=lambda c: c.time_seconds)

    def format_for_user(self, estimate: "CostEstimate") -> str:
        """Full multi-field string for display in the cost_estimate section."""
        return self.cost_model.format_estimate(estimate)

    def should_present_as_decision(
        self,
        candidates: list["CostEstimate"],
        threshold_pct: float = 0.20,
    ) -> bool:
        """
        Returns True if the top-2 strategies are within threshold_pct of each other
        in their primary comparison metric. When True, the user should be shown a
        decision_point instead of auto-selecting.
        """
        if len(candidates) < 2:
            return False
        sorted_c = sorted(candidates, key=lambda c: c.dollar_cost_cents)
        best, second = sorted_c[0], sorted_c[1]
        # Compare on cost if there's a real cost; otherwise on time
        if best.dollar_cost_cents > 0:
            diff = abs(second.dollar_cost_cents - best.dollar_cost_cents)
            return diff / max(best.dollar_cost_cents, 0.001) < threshold_pct
        else:
            diff = abs(second.time_seconds - best.time_seconds)
            return diff / max(best.time_seconds, 0.001) < threshold_pct


# ── PreExecutionEstimate ──────────────────────────────────────────────────────

@dataclass
class PreExecutionEstimate:
    """
    Full pre-task summary sent to the frontend as a cost_estimate section.

    Rendered by CostEstimateSectionView in GenerativeCardRenderer as a
    strategy comparison table with mode override toggles.
    """
    strategies: list[CostEstimate]       # all evaluated strategies (for display)
    selected: CostEstimate               # auto-selected by StrategySelector
    budget_remaining_cents: float
    budget_used_this_month_cents: float
    requires_confirmation: bool          # True if cost > user auto-confirm threshold
    provider: str                        # active provider
    model: str                           # active model
    optimization_mode: str              # "speed" | "cost" | "balanced"
    user_message: str                    # human-readable one-liner for accessibility

    def to_section_content(self) -> dict:
        """Serialize to the dict format expected by GenerativeCardRenderer."""
        from dataclasses import asdict
        return {
            "strategies": [asdict(s) for s in self.strategies],
            "selected": asdict(self.selected),
            "budget_remaining_cents": self.budget_remaining_cents,
            "budget_used_this_month_cents": self.budget_used_this_month_cents,
            "requires_confirmation": self.requires_confirmation,
            "provider": self.provider,
            "model": self.model,
            "optimization_mode": self.optimization_mode,
            "user_message": self.user_message,
        }
