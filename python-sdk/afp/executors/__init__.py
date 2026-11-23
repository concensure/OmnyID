"""
afp.executors — Agenton capability executor plugin system.

Public API:
    BaseExecutor, CostEstimate, ExecutionContext, ExecutionResult
    ExecutorRegistry
    All concrete executor classes

Quick start:
    from afp.executors import ExecutorRegistry, WebSearchExecutor, DocGenExecutor

    registry = ExecutorRegistry()
    registry.register(WebSearchExecutor())
    registry.register(DocGenExecutor())
"""

from afp.executors.base import (
    BaseExecutor,
    CostEstimate,
    ExecutionContext,
    ExecutionResult,
)
from afp.executors.registry import ExecutorRegistry

# Concrete executors — imported lazily to avoid hard dep failures when optional
# packages (playwright, chromadb, etc.) are not installed.
def _lazy_import(module_name: str, class_name: str):
    """Return a factory that imports the class on first call."""
    def _get():
        import importlib
        mod = importlib.import_module(f"afp.executors.{module_name}")
        return getattr(mod, class_name)
    return _get

_executor_classes = {
    "WebSearchExecutor":      _lazy_import("web_search",       "WebSearchExecutor"),
    "WebBrowseExecutor":      _lazy_import("web_browse",       "WebBrowseExecutor"),
    "FileOpsExecutor":        _lazy_import("file_ops",         "FileOpsExecutor"),
    "PythonSandboxExecutor":  _lazy_import("python_sandbox",   "PythonSandboxExecutor"),
    "VectorMemoryExecutor":   _lazy_import("vector_memory",    "VectorMemoryExecutor"),
    "DocGenExecutor":         _lazy_import("doc_gen",          "DocGenExecutor"),
    "ResearchPipelineExecutor": _lazy_import("research_pipeline", "ResearchPipelineExecutor"),
    "EcommerceExecutor":      _lazy_import("ecommerce",        "EcommerceExecutor"),
}

def __getattr__(name: str):
    if name in _executor_classes:
        return _executor_classes[name]()
    raise AttributeError(f"module 'afp.executors' has no attribute {name!r}")


def build_default_registry() -> ExecutorRegistry:
    """
    Build and return an ExecutorRegistry pre-populated with all available executors.
    Silently skips executors whose dependencies are not installed.

    Usage in runner_chat.py.tpl:
        from afp.executors import build_default_registry
        registry = build_default_registry()
    """
    import importlib
    registry = ExecutorRegistry()

    executor_specs = [
        ("web_search",        "WebSearchExecutor"),
        ("web_browse",        "WebBrowseExecutor"),
        ("file_ops",          "FileOpsExecutor"),
        ("python_sandbox",    "PythonSandboxExecutor"),
        ("vector_memory",     "VectorMemoryExecutor"),
        ("doc_gen",           "DocGenExecutor"),
        ("research_pipeline", "ResearchPipelineExecutor"),
        ("ecommerce",         "EcommerceExecutor"),
    ]

    for module_name, class_name in executor_specs:
        try:
            mod = importlib.import_module(f"afp.executors.{module_name}")
            cls = getattr(mod, class_name)
            registry.register(cls())
        except ImportError as e:
            import logging
            logging.getLogger("agenton.executors").warning(
                "Skipping %s — missing dependency: %s", class_name, e
            )
        except Exception as e:
            import logging
            logging.getLogger("agenton.executors").error(
                "Failed to load %s: %s", class_name, e
            )

    return registry


__all__ = [
    "BaseExecutor",
    "CostEstimate",
    "ExecutionContext",
    "ExecutionResult",
    "ExecutorRegistry",
    "build_default_registry",
]
