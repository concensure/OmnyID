"""
base.py — Abstract base classes and shared types for the Agenton executor plugin system.

Every executor implements BaseExecutor and exposes:
  - estimate_cost()  → CostEstimate  (called before execution for user preview)
  - execute()        → ExecutionResult
  - input_schema()   → JSON Schema dict
  - output_schema()  → JSON Schema dict

ExecutionContext is threaded through every executor call so executors can:
  - Stream UI sections via emit_section() callback
  - Spawn sub-executors via executor_registry
  - Know the active provider/model for cost-aware decisions
  - Respect the user's optimization_mode and budget_remaining_cents
"""
from __future__ import annotations

import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable, TYPE_CHECKING

if TYPE_CHECKING:
    from afp.executors.registry import ExecutorRegistry
    from afp.cost_engine import CostModel


# ── Result types ──────────────────────────────────────────────────────────────

@dataclass
class CostEstimate:
    """Pre-execution cost/time estimate for one execution strategy."""
    strategy_label: str          # "tool_call" | "code_gen" | "hybrid"
    token_cost: int              # estimated total tokens (input + output)
    dollar_cost_cents: float     # estimated cost in cents (0.0 for local backends)
    time_seconds: float          # estimated wall-clock seconds
    confidence: float            # 0.0–1.0 — how reliable is this estimate
    rationale: str               # human-readable explanation shown in cost_estimate section
    provider: str = ""           # "anthropic" | "ollama" | "runpod" | "byok"
    model: str = ""              # e.g. "claude-haiku-4-5-20251001", "llama3.1:8b"
    compute_note: str = ""       # e.g. "RunPod A100 GPU", "local CPU", "Anthropic API"


@dataclass
class ExecutionResult:
    """Outcome of a single executor.execute() call."""
    success: bool
    data: Any                    # executor-specific output (dict, str, list, etc.)
    error: str | None = None
    tokens_used: int = 0
    cost_cents: float = 0.0
    time_elapsed: float = 0.0   # actual seconds taken


# ── Execution context ─────────────────────────────────────────────────────────

@dataclass
class ExecutionContext:
    """
    Shared context passed to every executor.estimate_cost() and execute() call.

    Built by MasterAgent._act() from the active AgentContext + user LLM config.
    Executors MUST NOT modify the context directly; use emit_section() to stream UI updates.
    """
    thread_id: str
    agent_id: str
    objective: str               # the original user query
    llm_client: Any              # the configured LLM client (for executors that need LLM calls)
    model: str                   # active model ID, e.g. "claude-haiku-4-5-20251001"
    provider: str                # active provider: "anthropic" | "ollama" | "runpod" | "byok"
    cost_model: "CostModel"      # provider/model-aware cost estimator
    policy: dict                 # agent policy dict (approval_mode, allowed_ops, etc.)
    emit_section: Callable[[dict], Awaitable[None]]  # stream a generative card section
    optimization_mode: str       # "speed" | "cost" | "balanced"
    budget_remaining_cents: float
    executor_registry: "ExecutorRegistry"  # for composed executors (e.g. research_pipeline)


# ── Base executor ─────────────────────────────────────────────────────────────

class BaseExecutor(ABC):
    """
    Abstract base for all capability executors.

    Subclasses MUST set the `name` class attribute — this is the key used in
    ExecutorRegistry and the capability name sent to the LLM in _reason().

    Lifecycle per task:
      1. MasterAgent calls estimate_cost() → streams cost_estimate section
      2. User confirms (if above threshold)
      3. MasterAgent calls execute() → executor streams progress/result sections
      4. execute() returns ExecutionResult → MasterAgent updates ctx cost tracking
    """

    name: str = ""       # Must be overridden: e.g. "web_search", "doc_gen"
    version: str = "1.0"

    @abstractmethod
    async def estimate_cost(self, params: dict, ctx: ExecutionContext) -> CostEstimate:
        """
        Return a cost estimate WITHOUT executing anything.

        Called before execute() so the user can see cost/time before committing.
        Should be fast (no I/O if possible) — use heuristics based on params.
        """

    @abstractmethod
    async def execute(self, params: dict, ctx: ExecutionContext) -> ExecutionResult:
        """
        Execute the capability and return the result.

        MUST call ctx.emit_section() to stream progress, intermediate results,
        and the final output as generative card sections.

        Track start/end time and report actual cost via ExecutionResult.
        """

    @abstractmethod
    def input_schema(self) -> dict:
        """
        Return a JSON Schema dict describing the accepted params.
        Used by MasterAgent._reason() to describe capabilities to the LLM.
        """

    @abstractmethod
    def output_schema(self) -> dict:
        """
        Return a JSON Schema dict describing the ExecutionResult.data shape.
        """

    def display_name(self) -> str:
        """Human-readable display name (default: title-case of name)."""
        return self.name.replace("_", " ").title()

    async def _timed_execute(self, params: dict, ctx: ExecutionContext) -> ExecutionResult:
        """
        Convenience wrapper: calls execute() and fills in time_elapsed.
        Executors that override execute() directly don't need to call this.
        """
        t0 = time.monotonic()
        result = await self.execute(params, ctx)
        if result.time_elapsed == 0.0:
            result.time_elapsed = time.monotonic() - t0
        return result
