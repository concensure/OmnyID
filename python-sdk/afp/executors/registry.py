"""
registry.py — ExecutorRegistry: central lookup and management for all capability executors.

Usage:
    registry = ExecutorRegistry()
    registry.register(WebSearchExecutor())
    registry.register(DocGenExecutor())

    executor = registry.get("web_search")
    if executor:
        result = await executor.execute(params, ctx)

    # Get all names + input schemas for LLM prompt construction
    caps = registry.list_all()

    # Run estimate_cost on every executor to compare strategies
    estimates = await registry.estimate_all(params, ctx)
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from afp.executors.base import BaseExecutor, CostEstimate, ExecutionContext

logger = logging.getLogger("agenton.executor_registry")


class ExecutorRegistry:
    """
    Thread-safe (single-process asyncio) registry of BaseExecutor instances.

    Registration is by executor.name — duplicate names overwrite the previous entry
    with a warning. This allows hot-swapping executors without restart.
    """

    def __init__(self) -> None:
        self._executors: dict[str, "BaseExecutor"] = {}

    # ── Registration ──────────────────────────────────────────────────────────

    def register(self, executor: "BaseExecutor") -> None:
        """
        Register an executor. executor.name must be a non-empty string.
        Overwrites any existing executor with the same name (with a warning).
        """
        if not executor.name:
            raise ValueError(
                f"Executor {type(executor).__name__} has no name set. "
                "Set the `name` class attribute before registering."
            )
        if executor.name in self._executors:
            logger.warning(
                "ExecutorRegistry: overwriting executor %r (was %s, now %s)",
                executor.name,
                type(self._executors[executor.name]).__name__,
                type(executor).__name__,
            )
        self._executors[executor.name] = executor
        logger.debug("Registered executor: %r (v%s)", executor.name, executor.version)

    def unregister(self, name: str) -> bool:
        """Remove an executor by name. Returns True if it existed."""
        existed = name in self._executors
        self._executors.pop(name, None)
        return existed

    # ── Lookup ────────────────────────────────────────────────────────────────

    def get(self, name: str) -> "BaseExecutor | None":
        """Return the executor for the given name, or None if not registered."""
        return self._executors.get(name)

    def has(self, name: str) -> bool:
        return name in self._executors

    # ── Introspection ─────────────────────────────────────────────────────────

    def list_all(self) -> list[tuple[str, dict, dict]]:
        """
        Return list of (name, input_schema, output_schema) for all registered executors.
        Used by MasterAgent._reason() to pass capability descriptions to the LLM.
        """
        return [
            (name, ex.input_schema(), ex.output_schema())
            for name, ex in self._executors.items()
        ]

    def names(self) -> list[str]:
        return list(self._executors.keys())

    def __len__(self) -> int:
        return len(self._executors)

    def __repr__(self) -> str:
        return f"ExecutorRegistry({list(self._executors.keys())})"

    # ── Batch cost estimation ─────────────────────────────────────────────────

    async def estimate_all(
        self,
        params: dict,
        ctx: "ExecutionContext",
    ) -> list[tuple[str, "CostEstimate"]]:
        """
        Call estimate_cost() on every registered executor with the given params.
        Returns a list of (executor_name, CostEstimate) sorted by dollar_cost_cents ascending.

        Used when the cost engine wants to compare strategies across executors.
        Silently skips executors whose estimate_cost() raises an exception.
        """
        results: list[tuple[str, "CostEstimate"]] = []
        for name, executor in self._executors.items():
            try:
                estimate = await executor.estimate_cost(params, ctx)
                results.append((name, estimate))
            except Exception as exc:
                logger.warning(
                    "estimate_cost() failed for executor %r: %s", name, exc
                )
        results.sort(key=lambda x: x[1].dollar_cost_cents)
        return results
