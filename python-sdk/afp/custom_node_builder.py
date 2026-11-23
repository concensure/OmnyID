"""
custom_node_builder.py — Phase 6: CustomNodeBuilderAgent

Implements the bounded custom-node generation path described in the visual
workflow builder plan (Section 6):

  1. CapabilityRouterNode identifies missing capability
  2. CustomNodeBuilderAgent proposes a new node manifest        ← this file
  3. PolicyNode validates allowed tools and mask
  4. ModelBrokerNode assigns model class
  5. Node implementation stub is generated                      ← this file
  6. Dry-run validation occurs                                  ← this file
  7. Node is registered as temporary or reusable                ← this file

Key types:
  CustomNodeManifest   — the proposed node contract
  CustomNodeRegistry   — temporary + reusable node registry
  CustomNodeBuilderAgent — orchestrates proposal, validation, stub gen, dry-run

Design constraints (from plan):
  - Do NOT let the supervisor invent arbitrary runtime logic inline.
  - Every generated node must declare capability boundaries, allowed tools, AFP
    message families, and an execution stub before it can be dispatched.
  - Dry-run validation must pass before a node is registered.
  - Temporary nodes exist for one workflow run; reusable nodes are persisted.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Awaitable

from afp.executors.base import ExecutionContext, ExecutionResult

logger = logging.getLogger("agenton.custom_node_builder")


# ── Custom node manifest ───────────────────────────────────────────────────────

class NodeScope(str, Enum):
    TEMPORARY = "temporary"   # valid for one workflow run
    REUSABLE  = "reusable"    # persisted to the capability registry


@dataclass
class CustomNodeManifest:
    """
    Complete contract for a generated capability node.

    Every field mirrors the compiled IR manifest contract so the WorkflowSupervisor
    can schedule a custom node identically to a native preset node.
    """
    node_id: str
    capability_id: str                # unique slug, e.g. "invoice_parser_v1"
    display_name: str
    description: str
    node_kind: str                    # "executor" | "plan" | "reflection" | …
    runtime_kind: str                 # same as node_kind for backwards compat
    connector_family: str             # "internal" | "openai_function" | "mcp" | "a2a"
    execution_path: str               # "llm_agent" | "direct_http" | "delegation"
    allowed_tools: list[str]          # capability IDs this node may use
    afp_message_families: list[str]   # AFP agent:subtype strings this node emits/consumes
    input_schema: dict                # JSON Schema for inputs
    output_schema: dict               # JSON Schema for outputs
    system_prompt: str                # short orchestration instruction
    model_profile: str                # "cheap" | "medium" | "premium"
    retry_policy: dict                # {"max_retries": int, "backoff_seconds": float}
    scope: NodeScope                  # temporary vs reusable
    dry_run_result: dict | None = None   # set after successful dry-run
    registered_at: float = field(default_factory=time.time)
    workflow_id: str | None = None    # set for temporary nodes


@dataclass
class DryRunResult:
    passed: bool
    node_id: str
    output_sample: Any = None
    error: str | None = None
    tokens_used: int = 0
    elapsed_seconds: float = 0.0
    validation_notes: list[str] = field(default_factory=list)


# ── Registry ───────────────────────────────────────────────────────────────────

class CustomNodeRegistry:
    """
    In-memory registry for custom nodes.

    Temporary nodes are keyed by (workflow_id, node_id).
    Reusable nodes are keyed by capability_id (global).

    In a production deployment the reusable registry would be backed by the
    database (saved_workflow_records or a dedicated custom_nodes table).
    """

    def __init__(self) -> None:
        self._temporary: dict[tuple[str, str], CustomNodeManifest] = {}
        self._reusable:  dict[str, CustomNodeManifest] = {}

    def register(self, manifest: CustomNodeManifest) -> None:
        if manifest.scope == NodeScope.TEMPORARY:
            workflow_id = manifest.workflow_id or "default"
            self._temporary[(workflow_id, manifest.node_id)] = manifest
            logger.info(
                "Registered temporary node %s for workflow %s",
                manifest.node_id, workflow_id,
            )
        else:
            self._reusable[manifest.capability_id] = manifest
            logger.info("Registered reusable node %s", manifest.capability_id)

    def get_temporary(
        self, workflow_id: str, node_id: str
    ) -> CustomNodeManifest | None:
        return self._temporary.get((workflow_id, node_id))

    def get_reusable(self, capability_id: str) -> CustomNodeManifest | None:
        return self._reusable.get(capability_id)

    def get(
        self, capability_id: str, workflow_id: str | None = None
    ) -> CustomNodeManifest | None:
        """Try reusable first, then fall back to any temporary node with this capability."""
        if capability_id in self._reusable:
            return self._reusable[capability_id]
        if workflow_id:
            for (wf_id, node_id), manifest in self._temporary.items():
                if wf_id == workflow_id and manifest.capability_id == capability_id:
                    return manifest
        return None

    def retire_temporary(self, workflow_id: str) -> int:
        """Remove all temporary nodes for a finished workflow run. Returns count removed."""
        keys = [k for k in self._temporary if k[0] == workflow_id]
        for k in keys:
            del self._temporary[k]
        return len(keys)

    def list_reusable(self) -> list[CustomNodeManifest]:
        return list(self._reusable.values())

    def list_temporary(self, workflow_id: str) -> list[CustomNodeManifest]:
        return [v for (wf_id, _), v in self._temporary.items() if wf_id == workflow_id]


# ── Builder ────────────────────────────────────────────────────────────────────

# Template system prompt injected for every custom-node proposal.
_PROPOSAL_SYSTEM_PROMPT = """\
You are a workflow-node architect for OmnyID. Your job is to propose a safe,
bounded capability node given a capability gap description.

Rules:
- Every node must declare explicit allowed_tools (list of capability IDs).
- Execution must be one of: llm_agent, direct_http, or delegation.
- The system_prompt must be ≤ 300 tokens — short orchestration instruction only.
- The connector_family must be one of: internal, openai_function, mcp, a2a.
- Output ONLY valid JSON — no markdown, no preamble.

Required JSON shape:
{
  "capability_id": "snake_case_slug",
  "display_name": "Human Name",
  "description": "One sentence",
  "node_kind": "executor",
  "connector_family": "internal",
  "execution_path": "llm_agent",
  "allowed_tools": ["web_search", "file_ops"],
  "afp_message_families": ["agent:node_request", "agent:node_result"],
  "input_schema": {"type": "object", "properties": {}, "required": []},
  "output_schema": {"type": "object", "properties": {}, "required": []},
  "system_prompt": "Short instruction ...",
  "model_profile": "cheap",
  "retry_policy": {"max_retries": 2, "backoff_seconds": 1.0}
}
"""

# Allowed connector families and execution paths — guard against prompt injection.
_ALLOWED_CONNECTOR_FAMILIES = {"internal", "openai_function", "mcp", "a2a"}
_ALLOWED_EXECUTION_PATHS = {"llm_agent", "direct_http", "delegation"}
_ALLOWED_NODE_KINDS = {
    "executor", "plan", "reflection", "goal_intake",
    "capability_router", "approval", "merge", "termination",
}


def _validate_manifest_fields(raw: dict) -> list[str]:
    """Return a list of validation errors, or empty list if manifest is valid."""
    errors: list[str] = []

    required = [
        "capability_id", "display_name", "description", "node_kind",
        "connector_family", "execution_path", "allowed_tools",
        "afp_message_families", "input_schema", "output_schema",
        "system_prompt", "model_profile", "retry_policy",
    ]
    for field_name in required:
        if field_name not in raw:
            errors.append(f"missing required field: {field_name}")

    if errors:
        return errors

    cap_id: str = raw["capability_id"]
    if not re.fullmatch(r"[a-z][a-z0-9_]{1,62}", cap_id):
        errors.append(
            f"capability_id must be lowercase snake_case (2–63 chars), got: {cap_id!r}"
        )

    cf = raw["connector_family"]
    if cf not in _ALLOWED_CONNECTOR_FAMILIES:
        errors.append(
            f"connector_family must be one of {sorted(_ALLOWED_CONNECTOR_FAMILIES)}, got: {cf!r}"
        )

    ep = raw["execution_path"]
    if ep not in _ALLOWED_EXECUTION_PATHS:
        errors.append(
            f"execution_path must be one of {sorted(_ALLOWED_EXECUTION_PATHS)}, got: {ep!r}"
        )

    nk = raw["node_kind"]
    if nk not in _ALLOWED_NODE_KINDS:
        errors.append(
            f"node_kind must be one of {sorted(_ALLOWED_NODE_KINDS)}, got: {nk!r}"
        )

    sp: str = raw.get("system_prompt", "")
    # Rough token estimate: 4 chars ≈ 1 token
    if len(sp) > 1200:
        errors.append(
            "system_prompt exceeds 300-token limit (estimated from character count)"
        )

    if not isinstance(raw.get("allowed_tools"), list):
        errors.append("allowed_tools must be a list")

    rp = raw.get("retry_policy", {})
    if not isinstance(rp.get("max_retries"), int) or rp["max_retries"] < 0:
        errors.append("retry_policy.max_retries must be a non-negative integer")

    return errors


class CustomNodeBuilderAgent:
    """
    Orchestrates the bounded custom-node generation path (Plan § 6).

    Usage::

        registry = CustomNodeRegistry()
        builder  = CustomNodeBuilderAgent(registry)

        manifest = await builder.propose_and_register(
            capability_gap="Extract line items from a PDF invoice and return structured JSON",
            workflow_id="wf_01",
            scope=NodeScope.TEMPORARY,
            ctx=execution_ctx,
        )
        if manifest:
            # node is validated, dry-run passed, and registered
            print(manifest.node_id, manifest.capability_id)
    """

    def __init__(self, registry: CustomNodeRegistry) -> None:
        self._registry = registry

    # ── Public API ─────────────────────────────────────────────────────────────

    async def propose_and_register(
        self,
        capability_gap: str,
        workflow_id: str,
        scope: NodeScope,
        ctx: ExecutionContext,
    ) -> CustomNodeManifest | None:
        """
        Full pipeline: propose → validate → dry-run → register.

        Returns the registered manifest on success, or None if any stage fails.
        The caller (CapabilityRouterNode) should fall back to the legacy
        orchestration path when None is returned.
        """
        raw = await self._propose(capability_gap, ctx)
        if raw is None:
            return None

        errors = _validate_manifest_fields(raw)
        if errors:
            logger.warning(
                "Custom node proposal for %r failed validation: %s",
                capability_gap, errors,
            )
            return None

        manifest = self._build_manifest(raw, workflow_id, scope)

        dry = await self._dry_run(manifest, ctx)
        if not dry.passed:
            logger.warning(
                "Custom node %s failed dry-run: %s", manifest.node_id, dry.error
            )
            return None

        manifest.dry_run_result = {
            "passed": True,
            "output_sample": dry.output_sample,
            "tokens_used": dry.tokens_used,
            "elapsed_seconds": dry.elapsed_seconds,
            "notes": dry.validation_notes,
        }

        self._registry.register(manifest)
        return manifest

    async def propose_only(
        self,
        capability_gap: str,
        ctx: ExecutionContext,
    ) -> tuple[dict | None, list[str]]:
        """
        Propose a manifest and validate it without registering.

        Returns (raw_dict, errors).  Useful for previewing a node in the builder UI.
        """
        raw = await self._propose(capability_gap, ctx)
        if raw is None:
            return None, ["LLM failed to produce a valid JSON proposal"]
        errors = _validate_manifest_fields(raw)
        return raw, errors

    # ── Internal stages ────────────────────────────────────────────────────────

    async def _propose(
        self, capability_gap: str, ctx: ExecutionContext
    ) -> dict | None:
        """Call the LLM to propose a node manifest JSON."""
        try:
            from afp.inference_helpers import chat_completion  # type: ignore
        except ImportError:
            # Fallback: use the ExecutionContext's llm_client directly if available.
            chat_completion = None

        user_prompt = (
            f"Capability gap: {capability_gap}\n\n"
            "Propose a node manifest JSON that fills this gap.\n"
            "Output ONLY the JSON object — no markdown, no extra text."
        )

        if chat_completion is not None:
            text = await chat_completion(
                client=ctx.llm_client,
                model=ctx.model,
                system=_PROPOSAL_SYSTEM_PROMPT,
                user=user_prompt,
                max_tokens=1024,
            )
        elif hasattr(ctx, "llm_client") and ctx.llm_client is not None:
            try:
                response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: ctx.llm_client.messages.create(
                        model=ctx.model,
                        max_tokens=1024,
                        system=_PROPOSAL_SYSTEM_PROMPT,
                        messages=[{"role": "user", "content": user_prompt}],
                    ),
                )
                text = response.content[0].text if response.content else ""
            except Exception as exc:
                logger.error("LLM proposal failed: %s", exc)
                return None
        else:
            logger.error("No LLM client available for custom node proposal")
            return None

        # Extract JSON from the response.
        text = text.strip()
        start = text.find("{")
        end = text.rfind("}") + 1
        if start == -1 or end == 0:
            logger.warning("LLM response contained no JSON object")
            return None

        try:
            return json.loads(text[start:end])
        except json.JSONDecodeError as exc:
            logger.warning("Failed to parse LLM proposal as JSON: %s", exc)
            return None

    def _build_manifest(
        self, raw: dict, workflow_id: str, scope: NodeScope
    ) -> CustomNodeManifest:
        node_id = f"custom_{raw['capability_id']}_{uuid.uuid4().hex[:8]}"
        return CustomNodeManifest(
            node_id=node_id,
            capability_id=raw["capability_id"],
            display_name=raw["display_name"],
            description=raw["description"],
            node_kind=raw["node_kind"],
            runtime_kind=raw["node_kind"],
            connector_family=raw["connector_family"],
            execution_path=raw["execution_path"],
            allowed_tools=list(raw.get("allowed_tools", [])),
            afp_message_families=list(raw.get("afp_message_families", [])),
            input_schema=raw.get("input_schema", {}),
            output_schema=raw.get("output_schema", {}),
            system_prompt=raw["system_prompt"],
            model_profile=raw.get("model_profile", "cheap"),
            retry_policy=raw.get("retry_policy", {"max_retries": 2, "backoff_seconds": 1.0}),
            scope=scope,
            workflow_id=workflow_id if scope == NodeScope.TEMPORARY else None,
        )

    async def _dry_run(
        self, manifest: CustomNodeManifest, ctx: ExecutionContext
    ) -> DryRunResult:
        """
        Validate the node by running a minimal synthetic input through it.

        For `direct_http` and `delegation` execution paths the dry-run is a
        schema-only validation (no actual network call).  For `llm_agent` paths
        a short LLM call is made with a synthetic input derived from the
        input_schema to confirm the system_prompt is coherent.
        """
        start = time.monotonic()
        notes: list[str] = []

        # Schema coherence checks.
        if not manifest.input_schema.get("properties"):
            notes.append("input_schema has no properties — node may accept any input")
        if not manifest.output_schema.get("properties"):
            notes.append("output_schema has no properties — output shape is unverified")

        # AFP message family check.
        if not manifest.afp_message_families:
            return DryRunResult(
                passed=False,
                node_id=manifest.node_id,
                error="afp_message_families must not be empty",
            )
        node_request_found = any("node_request" in f for f in manifest.afp_message_families)
        node_result_found  = any("node_result"  in f for f in manifest.afp_message_families)
        if not node_request_found or not node_result_found:
            notes.append(
                "AFP families should include agent:node_request and agent:node_result"
            )

        # For non-llm_agent paths, schema validation is sufficient.
        if manifest.execution_path != "llm_agent":
            elapsed = time.monotonic() - start
            return DryRunResult(
                passed=True,
                node_id=manifest.node_id,
                output_sample={"status": "schema_validated"},
                elapsed_seconds=elapsed,
                validation_notes=notes,
            )

        # For llm_agent paths, probe the system_prompt with a minimal call.
        synthetic_input = _synthetic_input_from_schema(manifest.input_schema)
        probe_prompt = (
            f"[DRY RUN — respond in ≤ 50 words]\n"
            f"Input: {json.dumps(synthetic_input)}\n"
            "Output a brief placeholder result matching your output schema."
        )

        try:
            if hasattr(ctx, "llm_client") and ctx.llm_client is not None:
                response = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: ctx.llm_client.messages.create(
                        model=ctx.model,
                        max_tokens=128,
                        system=manifest.system_prompt,
                        messages=[{"role": "user", "content": probe_prompt}],
                    ),
                )
                output_text = response.content[0].text if response.content else ""
                tokens = getattr(response.usage, "input_tokens", 0) + getattr(response.usage, "output_tokens", 0)
            else:
                output_text = "dry_run_skipped_no_client"
                tokens = 0
        except Exception as exc:
            elapsed = time.monotonic() - start
            return DryRunResult(
                passed=False,
                node_id=manifest.node_id,
                error=f"LLM dry-run call failed: {exc}",
                elapsed_seconds=elapsed,
                validation_notes=notes,
            )

        elapsed = time.monotonic() - start
        return DryRunResult(
            passed=True,
            node_id=manifest.node_id,
            output_sample={"llm_response_preview": output_text[:200]},
            tokens_used=tokens,
            elapsed_seconds=elapsed,
            validation_notes=notes,
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _synthetic_input_from_schema(schema: dict) -> dict:
    """Generate a minimal valid input dict from a JSON Schema for dry-run probing."""
    props: dict = schema.get("properties", {})
    required: list[str] = schema.get("required", [])

    result: dict = {}
    for key in required:
        prop = props.get(key, {})
        t = prop.get("type", "string")
        if t == "string":
            result[key] = prop.get("default", f"<{key}>")
        elif t == "integer":
            result[key] = prop.get("default", 1)
        elif t == "number":
            result[key] = prop.get("default", 1.0)
        elif t == "boolean":
            result[key] = prop.get("default", True)
        elif t == "array":
            result[key] = []
        elif t == "object":
            result[key] = {}
        else:
            result[key] = None

    # Fill optional props with defaults where available.
    for key, prop in props.items():
        if key not in result and "default" in prop:
            result[key] = prop["default"]

    return result
