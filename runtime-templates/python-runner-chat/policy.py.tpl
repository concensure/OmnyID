import json
from pathlib import Path
from urllib.parse import urlparse


def read_json(path: Path, fallback):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return fallback


def write_json(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_runtime_policy(path: Path):
    return read_json(path, {})


def load_starter_templates(path: Path):
    return read_json(path, [])


def ensure_runtime_shape(policy: dict) -> dict:
    policy = dict(policy or {})
    policy.setdefault("tool_policy", {})
    policy.setdefault("channel_policy", {})
    policy.setdefault("model_policy", {})
    policy.setdefault("network_policy", {})
    return policy


def tool_enabled(policy: dict, tool_name: str) -> bool:
    tool_entry = ensure_runtime_shape(policy).get("tool_policy", {}).get(tool_name, {})
    if isinstance(tool_entry, dict):
        return bool(tool_entry.get("enabled", False))
    return False


def channel_enabled(policy: dict, channel_name: str) -> bool:
    channel_entry = ensure_runtime_shape(policy).get("channel_policy", {}).get(channel_name, {})
    if isinstance(channel_entry, dict):
        return bool(channel_entry.get("enabled", False))
    return False


def allowlisted_host_for_tool(policy: dict, tool_name: str, host: str) -> bool:
    tool_entry = ensure_runtime_shape(policy).get("tool_policy", {}).get(tool_name, {})
    hosts = tool_entry.get("allowlisted_hosts", []) if isinstance(tool_entry, dict) else []
    network_hosts = ensure_runtime_shape(policy).get("network_policy", {}).get("allowed_hosts", [])
    combined = {str(item).lower() for item in list(hosts) + list(network_hosts)}
    if not combined:
        return False
    host = host.lower()
    return any(host == allowed or host.endswith("." + allowed) for allowed in combined)


def extract_host(candidate: str) -> str:
    parsed = urlparse(candidate)
    if parsed.netloc:
      return parsed.netloc.lower()
    return candidate.strip().lower()
