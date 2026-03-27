import json
import os

from policy import allowlisted_host_for_tool, extract_host, tool_enabled

_CAPABILITIES_PATH = os.getenv("CAPABILITIES_JSON_PATH", "/workspace/capabilities.json")

_LEGACY_TOOL_NAMES = [
    "web",
    "google_api",
    "stripe",
    "file_access",
    "vector_store",
    "simple_db",
    "scheduler",
    "afp_agent",
]


def _load_registered_capabilities() -> list[dict]:
    """Load capabilities registered via @agent.capability() / sync_capabilities()."""
    try:
        with open(_CAPABILITIES_PATH) as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return []


def describe_tools(policy: dict):
    tools = []
    # Legacy built-in tools
    for name in _LEGACY_TOOL_NAMES:
        tools.append({"name": name, "enabled": tool_enabled(policy, name)})
    # Dynamically registered capabilities
    for cap in _load_registered_capabilities():
        name = cap.get("name")
        if name and not any(t["name"] == name for t in tools):
            tools.append({"name": name, "enabled": True, "descriptor": cap})
    return tools


def infer_tools_from_prompt(prompt: str):
    lowered = prompt.lower()
    inferred = []
    if any(token in lowered for token in ["http://", "https://", "website", "search", "browser", "scrape"]):
        inferred.append(("web", _extract_first_url(prompt)))
    if any(token in lowered for token in ["calendar", "gmail", "google", "drive", "docs"]):
        inferred.append(("google_api", "www.googleapis.com"))
    if any(token in lowered for token in ["stripe", "payment", "invoice", "charge", "refund"]):
        inferred.append(("stripe", "api.stripe.com"))
    if any(token in lowered for token in ["file", "document", "notes", "workspace"]):
        inferred.append(("file_access", None))
    if any(token in lowered for token in ["remember", "memory", "vector", "retrieve"]):
        inferred.append(("vector_store", None))
    if any(token in lowered for token in ["database", "sql", "table", "query"]):
        inferred.append(("simple_db", None))
    if any(token in lowered for token in ["schedule", "every day", "every week", "remind me"]):
        inferred.append(("scheduler", None))
    if any(token in lowered for token in ["agent:", "send to", "relay", "afp"]):
        inferred.append(("afp_agent", None))
    return inferred


def execute_policy_checked_tools(prompt: str, policy: dict):
    traces = []
    approvals = []
    for tool_name, host_candidate in infer_tools_from_prompt(prompt):
        enabled = tool_enabled(policy, tool_name)
        host = extract_host(host_candidate or "")
        allowed = enabled
        blocked_reason = None
        if enabled and host_candidate:
            allowed = allowlisted_host_for_tool(policy, tool_name, host)
            if not allowed:
                blocked_reason = "host_not_allowlisted"
        elif not enabled:
            blocked_reason = "tool_disabled"

        traces.append(
            {
                "tool": tool_name,
                "host": host or None,
                "status": "allowed" if allowed else "blocked",
                "blocked_reason": blocked_reason,
            }
        )

        if tool_name in {"stripe", "google_api", "afp_agent"} and enabled:
            approvals.append(
                {
                    "tool": tool_name,
                    "status": "review_required",
                    "reason": "Sensitive action path requires a human check before execution.",
                }
            )
    return traces, approvals


def _extract_first_url(prompt: str):
    for chunk in prompt.split():
        if chunk.startswith("http://") or chunk.startswith("https://"):
            return chunk
    return ""
