"""
capability_registry.py — lightweight capability dispatcher for the runner.

Handlers are registered by name and dispatched from the /invoke HTTP endpoint.
Descriptors are written to capabilities.json so tool_registry can discover them.
"""
from __future__ import annotations

import json
import os
from typing import Any, Callable

_handlers: dict[str, Callable] = {}
_descriptors: dict[str, dict] = {}

_CAPABILITIES_PATH = os.getenv("CAPABILITIES_JSON_PATH", "/workspace/capabilities.json")


def register(name: str, descriptor: dict, handler: Callable) -> None:
    """Register a capability handler with its descriptor."""
    _handlers[name] = handler
    _descriptors[name] = descriptor


def register_from_executor(executor: Any, handler: Callable | None = None) -> dict:
    """
    Bridge an AFP BaseExecutor into the runner capability registry.

    This lets runner-scoped executors participate in homeserver capability
    registration without hand-authoring a second descriptor.
    """
    name = getattr(executor, "name", executor.__class__.__name__)
    descriptor = {
        "name": name,
        "description": (getattr(executor, "__doc__", "") or "").strip().splitlines()[0] if getattr(executor, "__doc__", None) else "",
        "input_schema": executor.input_schema() if hasattr(executor, "input_schema") else {},
        "output_schema": executor.output_schema() if hasattr(executor, "output_schema") else {},
        "version": getattr(executor, "version", "1.0"),
        "source": "executor_bridge",
    }
    if handler is None:
        async def _default_handler(params: dict):
            raise RuntimeError(
                f"Executor-backed capability '{name}' is registered for discovery only; "
                "invoke it through MasterAgent or provide a custom handler."
            )
        handler = _default_handler
    register(name, descriptor, handler)
    return descriptor


def get_handler(name: str) -> Callable | None:
    return _handlers.get(name)


def list_descriptors() -> list[dict]:
    return list(_descriptors.values())


def save_capabilities_json(path: str | None = None) -> None:
    """Write all registered descriptors to capabilities.json for tool_registry discovery."""
    target = path or _CAPABILITIES_PATH
    os.makedirs(os.path.dirname(target) if os.path.dirname(target) else ".", exist_ok=True)
    with open(target, "w") as f:
        json.dump(list_descriptors(), f, indent=2)


async def dispatch(name: str, params: dict) -> Any:
    """Dispatch a capability invocation. Raises KeyError for unknown capabilities."""
    handler = get_handler(name)
    if handler is None:
        raise KeyError(f"Unknown capability: {name!r}")
    import asyncio
    if asyncio.iscoroutinefunction(handler):
        return await handler(params)
    return await asyncio.to_thread(handler, params)
