"""
MasterAgent — Conversational Agentic Loop with:
  - Local executor plugin system (BaseExecutor / ExecutorRegistry)
  - Provider/model-aware cost estimation (CostModel)
  - Generative UI: single streaming card per query (card_section_update protocol)
  - Decision framework: ambiguity detection, user decision points
  - Optimization mode: "speed" | "cost" | "balanced"
  - Pre-execution cost estimates shown before each executor call
  - LoRA personalisation hints

Loop: Understand Intent → (Decision Points if ambiguous) → Reason (ReAct) → Act → Observe → Reflect
      All output within one generative_card AFP message per query.
"""
from __future__ import annotations

import asyncio
import datetime
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable

from ulid import ULID

from .client import Agent, Message

logger = logging.getLogger("agenton.master")

# Optional event bus
try:
    from event_bus import make_event, publish as _eb_publish  # type: ignore[import]
    _EVENT_BUS = True
except ImportError:
    _EVENT_BUS = False

# Optional executor system
try:
    from afp.executors.base import ExecutionContext, ExecutionResult
    from afp.executors.registry import ExecutorRegistry
    from afp.cost_engine import CostModel, StrategySelector, PreExecutionEstimate
    from afp.decision_framework import (
        AmbiguityResult, DecisionResolver, AMBIGUITY_PROMPT_EXTENSION,
        make_strategy_decision_point,
        evaluate_trust_filter,
    )
    _EXECUTORS_AVAILABLE = True
except ImportError:
    _EXECUTORS_AVAILABLE = False
    ExecutorRegistry = None  # type: ignore[assignment,misc]
    CostModel = None         # type: ignore[assignment,misc]


async def _publish_event(event_type: str, agent_id: str, payload: dict, correlation_id: str | None = None) -> None:
    if not _EVENT_BUS:
        return
    try:
        await _eb_publish(make_event(event_type, agent_id, payload, correlation_id))
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class AgentStep:
    id: str
    action_type: str  # "invoke_capability" | "orchestrate" | "await_user" | "done" | "escalate"
    capability_name: str | None
    params: dict
    rationale: str
    status: str = "pending"  # "pending" | "running" | "ok" | "failed"
    result: Any = None
    error: str | None = None
    retry_count: int = 0


@dataclass
class AgentContext:
    objective: str
    steps: list[AgentStep] = field(default_factory=list)
    current_plan: str = ""
    progress_summary: str = ""
    status: str = "running"  # "running" | "done" | "escalated" | "failed"
    thread_id: str = ""
    # Conversational Agentic Loop
    preferred_view: str = "generative_card"
    intent_type: str = "chat"
    lora_hints: str = ""
    # Generative card
    card_id: str = ""
    cost_so_far: float = 0.0
    tokens_used: int = 0
    budget_remaining: float = 100.0      # cents
    auto_confirm_threshold: float = 5.0  # cents — below this, no confirmation needed
    ambiguities: list[dict] = field(default_factory=list)
    resolved_decisions: dict[str, str] = field(default_factory=dict)
    reflection_history: list[dict[str, str]] = field(default_factory=list)
    replan_constraints: dict[str, list[str]] = field(default_factory=dict)
    # Decision resolver (set during run())
    _decision_resolver: Any = field(default=None, repr=False)


@dataclass
class AgentResult:
    objective: str
    thread_id: str
    final_answer: str
    steps_taken: int
    status: str  # "done" | "escalated" | "failed"
    preferred_view: str = "generative_card"
    card_id: str = ""


@dataclass
class SubAgentHandle:
    delegation_id: str
    scoped_agent: Agent
    capability_name: str
    expires_at: str

    async def run(self, params: dict) -> dict:
        try:
            resp = await self.scoped_agent.client.post(
                f"{self.scoped_agent.url}/agent/invoke",
                json={
                    "capability_name": self.capability_name,
                    "params": params,
                    "delegation_id": self.delegation_id,
                },
                headers={"Authorization": f"Bearer {self.delegation_id}"},
            )
            resp.raise_for_status()
            result = resp.json()
            await _publish_event(
                "sub_agent_result", self.scoped_agent.agent_id,
                {"delegation_id": self.delegation_id, "capability_name": self.capability_name,
                 "status": "ok", "result": result, "error": None},
            )
            return result
        except Exception as exc:
            await _publish_event(
                "sub_agent_result", self.scoped_agent.agent_id,
                {"delegation_id": self.delegation_id, "capability_name": self.capability_name,
                 "status": "failed", "result": None, "error": str(exc)},
            )
            raise

    async def revoke(self) -> None:
        try:
            await self.scoped_agent.client.delete(
                f"{self.scoped_agent.url}/agent/delegate/{self.delegation_id}",
                headers=self.scoped_agent._auth_headers(),
            )
        except Exception:
            pass


# ---------------------------------------------------------------------------
# LLM system prompts
# ---------------------------------------------------------------------------

_UNDERSTAND_INTENT_SYSTEM = """You are an AI intent classifier for a personal agent assistant.
Analyse the user's objective and return ONLY valid JSON — no markdown, no code fences.

Return this schema (all fields required):
{
  "intent_type": "schedule" | "research" | "task" | "note" | "orchestrate" | "confirm" | "chat",
  "preferred_view": "draggable_calendar" | "task_board" | "note_canvas" | "search_result" | "confirmation_modal" | "orchestrate_progress" | "generative_card" | "chat",
  "needs_confirmation": true | false,
  "clarification": null | "<question if critical info missing>",
  "is_ambiguous": true | false,
  "confidence": 0.0 to 1.0,
  "ambiguities": []
}

preferred_view rules:
- "draggable_calendar": scheduling, day planning, time blocking
- "task_board": to-dos, shopping lists, tasks, reminders
- "note_canvas": note-taking, memos, capturing information
- "search_result": web research, factual lookups
- "confirmation_modal": actions affecting external systems (booking, deleting, payments)
- "orchestrate_progress": complex multi-step background work
- "generative_card": rich interactive agent output (research, comparison, doc generation, code)
- "chat": simple conversational replies

needs_confirmation: true for actions affecting real external systems.
is_ambiguous: true when execution strategy would change significantly based on missing info.

""" + AMBIGUITY_PROMPT_EXTENSION if _EXECUTORS_AVAILABLE else """You are an AI intent classifier for a personal agent assistant.
Analyse the user's objective and return ONLY valid JSON — no markdown, no code fences:
{
  "intent_type": "schedule" | "research" | "task" | "note" | "orchestrate" | "confirm" | "chat",
  "preferred_view": "draggable_calendar" | "task_board" | "note_canvas" | "search_result" | "confirmation_modal" | "orchestrate_progress" | "chat",
  "needs_confirmation": true | false,
  "clarification": null | "<question to ask the user if critical info is missing before acting>"
}
"""

_REASON_SYSTEM = """You are an autonomous agent. Given the objective, available capabilities,
progress summary, and recent steps, decide the SINGLE best next action.

Respond with valid JSON only — no markdown, no explanation outside the JSON:
{
  "action_type": "invoke_capability" | "orchestrate" | "await_user" | "done" | "escalate",
  "capability_name": "<name> or null",
  "params": {},
  "rationale": "<one sentence>",
  "progress_message": "<brief user-facing status>",
  "progress_pct": 0
}

Rules:
- Use "invoke_capability" for any registered capability.
- Use "orchestrate" to delegate a sub-objective.
- Use "await_user" ONLY when you need the user's confirmation before an irreversible action.
- Use "done" when the objective is fully satisfied — include "result" key in params.
- Use "escalate" if the task is impossible or requires human intervention.
- Never repeat a failed action with the same params.
"""

_REFLECT_SYSTEM = """You are evaluating whether an agent step succeeded and what to do next.
Respond with one word only: continue | retry | replan | done | escalate

- continue: step succeeded, proceed
- retry: step failed with transient/recoverable error
- replan: step failed, needs different approach
- done: objective satisfied by this step's result
- escalate: task impossible or requires human intervention
"""


# ---------------------------------------------------------------------------
# MasterAgent
# ---------------------------------------------------------------------------

class MasterAgent:
    def __init__(
        self,
        agent: Agent,
        llm_client: Any,
        model: str = "claude-haiku-4-5-20251001",
        max_iterations: int = 20,
        step_timeout_secs: int = 60,
        max_retries_per_step: int = 3,
        compression_threshold: int = 8,
        # Executor plugin system
        executor_registry: "ExecutorRegistry | None" = None,
        cost_model: "CostModel | None" = None,
        optimization_mode: str = "balanced",
        execution_policy: dict[str, Any] | None = None,
    ):
        self.agent = agent
        self.llm = llm_client
        self.model = model
        self.max_iterations = max_iterations
        self.step_timeout_secs = step_timeout_secs
        self.max_retries_per_step = max_retries_per_step
        self.compression_threshold = compression_threshold
        self.executors = executor_registry
        self.cost_model = cost_model
        self.optimization_mode = optimization_mode
        self.execution_policy = execution_policy or {}

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    async def run(self, objective: str) -> AgentResult:
        card_id = f"gc-{ULID()}"
        thread_id = f"agent-objective:{ULID()}"
        ctx = AgentContext(
            objective=objective,
            thread_id=thread_id,
            card_id=card_id,
        )

        # Phase 0a: Load user's LLM config → initialize provider-aware cost model
        if _EXECUTORS_AVAILABLE and self.cost_model is None:
            llm_config = await self._load_llm_config()
            self.cost_model = CostModel(llm_config)

        if self.cost_model is not None:
            ctx.budget_remaining = self.cost_model.budget_remaining

        # Phase 0b: Load agent preferences (auto_confirm_threshold, optimization_mode)
        await self._load_agent_preferences(ctx)

        # Phase 0c: LoRA personalisation hints
        ctx.lora_hints = await self._read_lora_hints()

        # Phase 1: Intent classification + ambiguity detection
        await self._understand_intent(ctx)

        # Create the generative card (ONE AFP message per query interaction)
        await self._send_afp(ctx, "generative_card", {
            "card_id": card_id,
            "query": objective,
            "status": "streaming",
            "sections": [],
            "optimization_mode": self.optimization_mode,
            "provider": getattr(self.cost_model, "provider", ""),
            "model": getattr(self.cost_model, "model", self.model),
            "cost_so_far_cents": 0.0,
            "tokens_used": 0,
        })

        # If ambiguities detected, stream decision_point sections and wait
        if ctx.ambiguities and _EXECUTORS_AVAILABLE:
            from afp.decision_framework import DecisionPoint, DecisionResolver
            resolver = DecisionResolver()
            dps = [DecisionPoint.from_dict(a) for a in ctx.ambiguities]
            ctx._decision_resolver = resolver
            resolver.register_all(dps)

            for dp in dps:
                await self._stream_section(ctx, {
                    "id": dp.id,
                    "type": "decision_point",
                    "order": 5,
                    "content": dp.to_section_content(),
                    "status": "awaiting_input",
                })

            if any(dp.required for dp in dps):
                resolved = await resolver.await_all(dps, timeout=300.0)
                ctx.resolved_decisions = resolved

        # Emit thinking section start
        await self._stream_section(ctx, {
            "id": "thinking",
            "type": "thinking",
            "order": 8,
            "content": {"text": f"Planning how to: {objective}"},
            "status": "streaming",
        })

        await self._emit_progress(ctx, "Analysing your request…", 5)

        result = await self._react_loop(ctx)

        # Mark card complete
        await self._send_afp(ctx, "card_section_update", {
            "card_id": card_id,
            "section": {
                "id": "thinking",
                "type": "thinking",
                "order": 8,
                "content": {"text": f"Completed: {objective}"},
                "status": "complete",
            },
            "cost_so_far_cents": ctx.cost_so_far,
            "tokens_used": ctx.tokens_used,
        })

        return result

    # ------------------------------------------------------------------
    # ReAct loop
    # ------------------------------------------------------------------

    async def _react_loop(self, ctx: AgentContext) -> AgentResult:
        total = self.max_iterations
        for i in range(total):
            step = await self._reason(ctx)

            prog_msg = step.params.get("progress_message") or f"Step {i + 1}: {step.rationale[:80]}"
            prog_pct = step.params.get("progress_pct") or min(10 + int((i / total) * 80), 88)
            await self._emit_progress(ctx, prog_msg, prog_pct)

            if step.action_type == "done":
                ctx.status = "done"
                await self._log_step_as_afp(step, ctx)
                final = step.params.get("result") or step.rationale

                # Stream final_answer section
                await self._stream_section(ctx, {
                    "id": "final-answer",
                    "type": "final_answer",
                    "order": 1000,
                    "content": {"text": final},
                    "status": "complete",
                })
                await self._emit_progress(ctx, "Done!", 100)
                await self._send_afp(ctx, "agent_result", {
                    "final_answer": final,
                    "steps_taken": len(ctx.steps),
                    "card_id": ctx.card_id,
                })
                return AgentResult(
                    objective=ctx.objective, thread_id=ctx.thread_id,
                    final_answer=final, steps_taken=len(ctx.steps),
                    status="done", preferred_view=ctx.preferred_view,
                    card_id=ctx.card_id,
                )

            if step.action_type == "escalate":
                return await self._escalate(ctx, step.rationale)

            if step.action_type == "await_user":
                confirmation_prompt = step.params.get("confirmation_prompt", "Please confirm to proceed.")
                step.status = "running"
                ctx.steps.append(step)
                await self._log_step_as_afp(step, ctx)
                user_reply = await self._await_user(ctx, confirmation_prompt)
                if user_reply is None:
                    return await self._escalate(ctx, "User confirmation timed out (5 minutes).")
                step.status = "ok"
                step.result = {"user_reply": user_reply}
                continue

            step.status = "running"
            ctx.steps.append(step)
            await self._log_step_as_afp(step, ctx)

            try:
                result = await asyncio.wait_for(
                    self._act(step, ctx), timeout=self.step_timeout_secs
                )
                await self._observe(step, result, None)
            except asyncio.TimeoutError:
                await self._observe(step, None, f"Timed out after {self.step_timeout_secs}s")
                await self._stream_failure_for_step(
                    ctx,
                    step,
                    failure_kind="timeout",
                    error_text=f"Step timed out after {self.step_timeout_secs}s.",
                )
            except Exception as exc:
                await self._observe(step, None, str(exc))
                await self._stream_failure_for_step(
                    ctx,
                    step,
                    failure_kind="executor_error",
                    error_text=f"Error in {step.capability_name}: {exc}",
                )

            decision, decision_source, decision_reason = await self._reflect(step, ctx)
            await self._stream_section(
                ctx,
                _reflection_summary_section(
                    section_id=f"reflect-{step.id}-{len(ctx.steps)}",
                    order=19,
                    executor_name=step.capability_name or step.action_type,
                    decision=decision,
                    source=decision_source,
                    reason=decision_reason,
                ),
            )

            if decision == "done":
                ctx.status = "done"
                final = str(step.result) if step.result is not None else step.rationale
                await self._stream_section(ctx, {
                    "id": "final-answer",
                    "type": "final_answer",
                    "order": 1000,
                    "content": {"text": final},
                    "status": "complete",
                })
                await self._emit_progress(ctx, "Done!", 100)
                await self._send_afp(ctx, "agent_result", {
                    "final_answer": final, "steps_taken": len(ctx.steps), "card_id": ctx.card_id
                })
                return AgentResult(
                    objective=ctx.objective, thread_id=ctx.thread_id,
                    final_answer=final, steps_taken=len(ctx.steps),
                    status="done", preferred_view=ctx.preferred_view,
                    card_id=ctx.card_id,
                )
            elif decision == "retry":
                if step.retry_count < self.max_retries_per_step:
                    retry_plan = _plan_retry_for_step(step)
                    step.retry_count += 1
                    if retry_plan is not None:
                        step.params = retry_plan["updated_params"]
                        await self._stream_section(
                            ctx,
                            _retry_summary_section(
                                section_id=f"retry-{step.id}-{step.retry_count}",
                                order=19,
                                executor_name=step.capability_name or step.action_type,
                                retry_count=step.retry_count,
                                max_retries=self.max_retries_per_step,
                                mode=retry_plan["mode"],
                                source=decision_source,
                                title=retry_plan["title"],
                                text=retry_plan["text"],
                                from_strategy=retry_plan["from_strategy"],
                                to_strategy=retry_plan["to_strategy"],
                            ),
                        )
                    step.status = "pending"
                    ctx.steps.pop()
                else:
                    return await self._escalate(
                        ctx,
                        f"Step '{step.capability_name}' failed after {self.max_retries_per_step} retries: {step.error}",
                    )
            elif decision == "replan":
                replan = _plan_replan_for_step(step, decision_source, decision_reason)
                ctx.current_plan = replan["next_plan"]
                ctx.replan_constraints = replan["constraints"]
                await self._stream_section(
                    ctx,
                    _replan_summary_section(
                        section_id=f"replan-{step.id}-{len(ctx.steps)}",
                        order=20,
                        executor_name=step.capability_name or step.action_type,
                        source=decision_source,
                        title=replan["title"],
                        text=replan["text"],
                        next_plan=replan["next_plan"],
                        constraints=replan["constraints"],
                    ),
                )
            elif decision == "escalate":
                return await self._escalate(ctx, step.error or "Escalation requested by reflect")

            if len(ctx.steps) >= self.compression_threshold:
                await self._compress_context(ctx)

        return await self._escalate(ctx, f"Max iterations ({self.max_iterations}) reached")

    # ------------------------------------------------------------------
    # ReAct sub-steps
    # ------------------------------------------------------------------

    async def _reason(self, ctx: AgentContext) -> AgentStep:
        # Build capability list: local executors take priority over registered caps
        capabilities: list[dict] = []
        if self.executors is not None:
            for name, input_schema, output_schema in self.executors.list_all():
                capabilities.append({"name": name, "input_schema": input_schema})
        else:
            capabilities = [{"name": n} for n in self.agent._capabilities.keys()]

        recent_steps = [
            {
                "id": s.id,
                "action_type": s.action_type,
                "capability_name": s.capability_name,
                "params": s.params,
                "rationale": s.rationale,
                "status": s.status,
                "result": str(s.result)[:200] if s.result is not None else None,
                "error": s.error,
            }
            for s in ctx.steps[-5:]
        ]

        decisions_block = ""
        if ctx.resolved_decisions:
            decisions_block = f"User decisions: {json.dumps(ctx.resolved_decisions)}\n"

        reflection_history = ctx.reflection_history[-4:]
        reflection_block = ""
        if reflection_history:
            reflection_block = f"Recent reflection outcomes: {json.dumps(reflection_history)}\n"

        reflection_guidance = _planning_guidance_from_reflections(reflection_history)
        replan_constraints_block = ""
        if ctx.replan_constraints:
            replan_constraints_block = f"Replan constraints: {json.dumps(ctx.replan_constraints)}\n"

        user_content = (
            f"Objective: {ctx.objective}\n"
            f"Intent type: {ctx.intent_type}\n"
            f"Preferred UI view: {ctx.preferred_view}\n"
            f"Available capabilities: {json.dumps(capabilities)}\n"
            + (f"Progress summary: {ctx.progress_summary}\n" if ctx.progress_summary else "")
            + f"Recent steps: {json.dumps(recent_steps)}\n"
            f"Current plan: {ctx.current_plan or 'none'}\n"
            + decisions_block
            + reflection_block
            + replan_constraints_block
            + (f"Planning guidance: {reflection_guidance}\n" if reflection_guidance else "")
            + (f"LoRA hint: {ctx.lora_hints}\n" if ctx.lora_hints else "")
            + "What is the next action?"
        )
        raw = await self._llm_call(_REASON_SYSTEM, user_content)
        try:
            data = json.loads(raw)
        except Exception:
            return AgentStep(
                id=str(ULID()), action_type="escalate", capability_name=None,
                params={}, rationale=f"LLM returned unparseable response: {raw[:200]}",
            )
        guarded = _apply_reasoning_guardrails(
            data=data,
            reflection_history=reflection_history,
            replan_constraints=ctx.replan_constraints,
        )
        guardrail_summary = guarded.pop("_omnyid_guardrail_summary", None)
        if isinstance(guardrail_summary, dict):
            await self._stream_section(
                ctx,
                _planning_guardrail_section(
                    section_id=f"planning-guardrail-{ULID()}",
                    order=11,
                    mode=str(guardrail_summary.get("mode", "bias")),
                    source=str(guardrail_summary.get("source", "reflection_history")),
                    title=str(guardrail_summary.get("title", "Planner adjusted")),
                    text=str(guardrail_summary.get("text", "")),
                    capability_name=str(guardrail_summary.get("capability_name", "")),
                ),
            )
        return AgentStep(
            id=str(ULID()),
            action_type=guarded.get("action_type", "escalate"),
            capability_name=guarded.get("capability_name"),
            params=guarded.get("params") or {},
            rationale=guarded.get("rationale", ""),
        )

    async def _act(self, step: AgentStep, ctx: AgentContext) -> Any:
        if step.action_type == "invoke_capability":
            name = step.capability_name or ""

            # ── Try local executor first ──────────────────────────────────
            if self.executors is not None:
                executor = self.executors.get(name)
                if executor is not None and _EXECUTORS_AVAILABLE:
                    exec_ctx = ExecutionContext(
                        thread_id=ctx.thread_id,
                        agent_id=self.agent.agent_id,
                        objective=ctx.objective,
                        llm_client=self._make_llm_adapter(),
                        model=self.model,
                        provider=getattr(self.cost_model, "provider", "anthropic"),
                        cost_model=self.cost_model,
                        policy=self.execution_policy,
                        emit_section=lambda sec: self._stream_section(ctx, sec),
                        optimization_mode=self.optimization_mode,
                        budget_remaining_cents=ctx.budget_remaining,
                        executor_registry=self.executors,
                    )

                    trust_verdict = evaluate_trust_filter(
                        objective=ctx.objective,
                        capability_name=name,
                        params=step.params,
                        policy=exec_ctx.policy,
                    )
                    if trust_verdict.requires_confirmation:
                        trust_dp_id = f"trust-{step.id}"
                        await self._stream_section(ctx, {
                            "id": trust_dp_id,
                            "type": "decision_point",
                            "order": 12,
                            "content": {
                                "id": trust_dp_id,
                                "question": f"Review risky step before running {name}?",
                                "category": "confirmation",
                                "context": trust_verdict.rationale,
                                "required": True,
                                "default_option_id": "confirm",
                                "risk_level": trust_verdict.risk_level,
                                "matched_signals": trust_verdict.matched_signals,
                                "options": [
                                    {
                                        "id": "confirm",
                                        "label": "Run it",
                                        "description": "Proceed with the reviewed step.",
                                        "pros": ["Keeps the workflow moving"],
                                        "cons": ["May change external or local state"],
                                        "is_default": True,
                                    },
                                    {
                                        "id": "cancel",
                                        "label": "Cancel",
                                        "description": "Stop this risky step and keep the current state.",
                                        "pros": ["No side effects"],
                                        "cons": ["The task may remain incomplete"],
                                        "is_default": False,
                                    },
                                ],
                            },
                            "status": "awaiting_input",
                        })
                        trust_reply = await self._await_user(
                            ctx,
                            f"High-risk step detected for {name}. Proceed? (run/cancel)",
                            expected_decision_point_id=trust_dp_id,
                            show_prompt_section=False,
                        )
                        ctx.resolved_decisions[trust_dp_id] = trust_reply or "cancel"
                        if trust_reply is None or trust_reply.strip().lower() in (
                            "cancel", "no", "n", "stop"
                        ):
                            await self._stream_section(
                                ctx,
                                _decision_callout_section(
                                    section_id=trust_dp_id,
                                    order=12,
                                    title="Risk review declined",
                                    text=f"OmnyID kept {name} paused because you did not approve the high-risk step.",
                                    tone="warning",
                                ),
                            )
                            return {
                                "status": "cancelled_by_user",
                                "reason": "trust_filter_cancelled",
                                "risk_level": trust_verdict.risk_level,
                            }
                        await self._stream_section(
                            ctx,
                            _decision_callout_section(
                                section_id=trust_dp_id,
                                order=12,
                                title="Risk review approved",
                                text=f"OmnyID can now run {name} with the reviewed side-effect boundary.",
                                tone="confirmation",
                            ),
                        )

                    selected_candidate_meta: dict[str, Any] | None = None
                    selected_estimate = None
                    strategy_selection_mode = "single_path"

                    # Pre-execution cost estimate
                    try:
                        estimate = await executor.estimate_cost(step.params, exec_ctx)
                        selected_params = dict(step.params)
                        selected_estimate = estimate

                        if self.cost_model is not None:
                            selector = StrategySelector(self.cost_model)
                            candidate_strategies = await self._build_executor_strategy_candidates(
                                executor,
                                name,
                                step.params,
                                exec_ctx,
                            )
                            if candidate_strategies:
                                forced_candidate = _forced_strategy_candidate_from_params(
                                    candidate_strategies,
                                    step.params,
                                )
                                if forced_candidate is not None:
                                    selected_candidate = forced_candidate
                                    selected_estimate = forced_candidate["estimate"]
                                    selected_candidate_meta = forced_candidate
                                    selected_params = dict(forced_candidate["params"])
                                    await self._stream_section(
                                        ctx,
                                        _decision_callout_section(
                                            section_id=f"strategy-bias-{step.id}",
                                            order=14,
                                            title="Execution path adjusted",
                                            text=(
                                                f"OmnyID is preferring the {forced_candidate['label']} path for "
                                                f"{name} because recent attempts suggested a faster strategy is safer."
                                            ),
                                            tone="strategy",
                                        ),
                                    )
                                else:
                                    candidate_estimates = [
                                        candidate["estimate"] for candidate in candidate_strategies
                                    ]
                                    selected_estimate = selector.select(
                                        candidate_estimates,
                                        self.optimization_mode,
                                    )
                                    selected_candidate = next(
                                        (
                                            candidate for candidate in candidate_strategies
                                            if candidate["estimate"] is selected_estimate
                                        ),
                                        candidate_strategies[0],
                                    )
                                    selected_candidate_meta = selected_candidate
                                    selected_params = dict(selected_candidate["params"])

                                if forced_candidate is None and selector.should_present_as_decision(candidate_estimates):
                                    strategy_dp_id = f"strategy-{step.id}"
                                    await self._stream_section(ctx, {
                                        "id": strategy_dp_id,
                                        "type": "decision_point",
                                        "order": 14,
                                        "content": {
                                            "id": strategy_dp_id,
                                            "question": "How should I approach this step?",
                                            "category": "strategy",
                                            "context": (
                                                "These execution paths are close enough that your preference "
                                                "is more important than auto-selection."
                                            ),
                                            "required": False,
                                            "default_option_id": selected_candidate["option_id"],
                                            "options": [
                                                {
                                                    "id": candidate["option_id"],
                                                    "label": candidate["label"],
                                                    "description": candidate["description"],
                                                    "pros": [
                                                        self.cost_model.format_estimate(candidate["estimate"]),
                                                        f"Confidence: {candidate['estimate'].confidence:.0%}",
                                                    ],
                                                    "cons": candidate.get("cons", []),
                                                    "is_default": candidate["option_id"] == selected_candidate["option_id"],
                                                }
                                                for candidate in candidate_strategies
                                            ],
                                        },
                                        "status": "awaiting_input",
                                    })
                                    strategy_reply = await self._await_user(
                                        ctx,
                                        "Choose a strategy for this step.",
                                        expected_decision_point_id=strategy_dp_id,
                                        show_prompt_section=False,
                                    )
                                    chosen_candidate = next(
                                        (
                                            candidate for candidate in candidate_strategies
                                            if candidate["option_id"] == strategy_reply
                                        ),
                                        selected_candidate,
                                    )
                                    ctx.resolved_decisions[strategy_dp_id] = chosen_candidate["option_id"]
                                    selected_candidate_meta = chosen_candidate
                                    selected_params = dict(chosen_candidate["params"])
                                    selected_estimate = chosen_candidate["estimate"]
                                    await self._stream_section(
                                        ctx,
                                        _decision_callout_section(
                                            section_id=strategy_dp_id,
                                            order=14,
                                            title="Execution strategy locked",
                                            text=(
                                                f"OmnyID is using the {chosen_candidate['label']} path for "
                                                f"{name}."
                                            ),
                                            tone="strategy",
                                        ),
                                    )
                                    await self._stream_section(
                                        ctx,
                                        _strategy_outcome_section(
                                            section_id=f"{strategy_dp_id}-summary",
                                            order=15,
                                            executor_name=name,
                                            strategy_label=chosen_candidate["label"],
                                            expected_outcome=chosen_candidate["expected_outcome"],
                                        ),
                                    )
                                else:
                                    await self._stream_section(
                                        ctx,
                                        _strategy_outcome_section(
                                            section_id=f"strategy-auto-{step.id}",
                                            order=15,
                                            executor_name=name,
                                            strategy_label=selected_candidate["label"],
                                            expected_outcome=selected_candidate["expected_outcome"],
                                        ),
                                    )

                            strategy_selection_mode = (
                                "user_selected"
                                if any(
                                    key == f"strategy-{step.id}"
                                    for key in ctx.resolved_decisions
                                )
                                else ("auto_selected" if selected_candidate_meta else "single_path")
                            )

                            await self._stream_section(ctx, {
                                "id": f"cost-{step.id}",
                                "type": "cost_estimate",
                                "order": 15,
                                "content": {
                                    "strategies": [
                                        _dataclass_to_dict(candidate["estimate"])
                                        for candidate in candidate_strategies
                                    ] if candidate_strategies else [_dataclass_to_dict(selected_estimate)],
                                    "selected": _dataclass_to_dict(selected_estimate),
                                    "budget_remaining_cents": ctx.budget_remaining,
                                    "budget_used_this_month_cents": 0,
                                    "requires_confirmation": selected_estimate.dollar_cost_cents > ctx.auto_confirm_threshold,
                                    "provider": selected_estimate.provider,
                                    "model": selected_estimate.model,
                                    "optimization_mode": self.optimization_mode,
                                    "selected_strategy_executor": name,
                                    "selected_strategy_label": (
                                        selected_candidate_meta["label"]
                                        if selected_candidate_meta else selected_estimate.strategy_label
                                    ),
                                    "selected_strategy_outcome": (
                                        selected_candidate_meta["expected_outcome"]
                                        if selected_candidate_meta else ""
                                    ),
                                    "strategy_selection_mode": strategy_selection_mode,
                                    "selected_strategy_summary": (
                                        (
                                            f"Using the {selected_candidate_meta['label']} path for {name}. "
                                            f"Expected outcome: {selected_candidate_meta['expected_outcome']}"
                                        )
                                        if selected_candidate_meta
                                        else (
                                            f"Using the default execution path for {name}."
                                            if name
                                            else "Using the default execution path."
                                        )
                                    ),
                                    "user_message": self.cost_model.format_estimate(selected_estimate),
                                },
                                "status": "complete",
                            })
                            selected_params["_omnyid_strategy_contract"] = {
                                "executor_name": name,
                                "strategy_option_id": (
                                    selected_candidate_meta["option_id"]
                                    if selected_candidate_meta else ""
                                ),
                                "strategy_label": (
                                    selected_candidate_meta["label"]
                                    if selected_candidate_meta else selected_estimate.strategy_label
                                ),
                                "expected_outcome": (
                                    selected_candidate_meta["expected_outcome"]
                                    if selected_candidate_meta else ""
                                ),
                                "selection_mode": strategy_selection_mode,
                                "estimated_time_seconds": selected_estimate.time_seconds,
                                "estimated_cost_cents": selected_estimate.dollar_cost_cents,
                                "estimated_tokens": selected_estimate.token_cost,
                                "retry_fallback": _build_retry_fallback(
                                    candidate_strategies,
                                    selected_candidate_meta,
                                ),
                            }

                            # Ask for confirmation if cost is above threshold
                            if selected_estimate.dollar_cost_cents > ctx.auto_confirm_threshold:
                                cost_str = f"~${selected_estimate.dollar_cost_cents / 100:.4f}"
                                time_str = f"~{selected_estimate.time_seconds:.0f}s"
                                cost_dp_id = f"cost-confirm-{step.id}"
                                await self._stream_section(ctx, {
                                    "id": cost_dp_id,
                                    "type": "decision_point",
                                    "order": 16,
                                    "content": {
                                        "id": cost_dp_id,
                                        "question": "Do you want me to spend budget on this step?",
                                        "category": "confirmation",
                                        "context": (
                                            f"This step is estimated at {cost_str} and {time_str} "
                                            f"using {selected_estimate.model or self.model}."
                                        ),
                                        "required": True,
                                        "default_option_id": "confirm",
                                        "options": [
                                            {
                                                "id": "confirm",
                                                "label": "Proceed",
                                                "description": "Run this step with the estimated budget and time cost.",
                                                "pros": ["Keeps the workflow moving"],
                                                "cons": ["Consumes budget"],
                                                "is_default": True,
                                            },
                                            {
                                                "id": "cancel",
                                                "label": "Cancel",
                                                "description": "Do not spend budget on this step yet.",
                                                "pros": ["No cost incurred"],
                                                "cons": ["The task may remain incomplete"],
                                                "is_default": False,
                                            },
                                        ],
                                    },
                                    "status": "awaiting_input",
                                })
                                reply = await self._await_user(
                                    ctx,
                                    f"This will cost {cost_str} and take {time_str}. Proceed? (yes/no)",
                                    expected_decision_point_id=cost_dp_id,
                                    show_prompt_section=False,
                                )
                                ctx.resolved_decisions[cost_dp_id] = reply or "cancel"
                                if reply is None or reply.strip().lower() in ("no", "cancel", "n"):
                                    await self._stream_section(
                                        ctx,
                                        _decision_callout_section(
                                            section_id=cost_dp_id,
                                            order=16,
                                            title="Budget approval declined",
                                            text=f"OmnyID skipped this step instead of spending {cost_str} on {selected_estimate.strategy_label}.",
                                            tone="warning",
                                        ),
                                    )
                                    return {"status": "cancelled_by_user"}
                                await self._stream_section(
                                    ctx,
                                    _decision_callout_section(
                                        section_id=cost_dp_id,
                                        order=16,
                                        title="Budget approval granted",
                                        text=f"OmnyID can spend up to {cost_str} on the {selected_estimate.strategy_label} strategy for this step.",
                                        tone="confirmation",
                                    ),
                                )
                        step.params = selected_params
                    except Exception as exc:
                        logger.debug("Cost estimation failed (non-fatal): %s", exc)

                    # Execute locally
                    exec_result: ExecutionResult = await executor.execute(step.params, exec_ctx)

                    # Update cost tracking
                    ctx.cost_so_far += exec_result.cost_cents
                    ctx.tokens_used += exec_result.tokens_used
                    ctx.budget_remaining = max(0, ctx.budget_remaining - exec_result.cost_cents)

                    if exec_result.success:
                        if selected_estimate is not None:
                            strategy_label = (
                                selected_candidate_meta["label"]
                                if selected_candidate_meta else selected_estimate.strategy_label
                            )
                            expected_outcome = (
                                selected_candidate_meta["expected_outcome"]
                                if selected_candidate_meta else ""
                            )
                            result_summary = _summarize_execution_result_data(exec_result.data)
                            alignment, alignment_reason = _evaluate_execution_alignment(
                                selected_estimate=selected_estimate,
                                actual_time_seconds=exec_result.time_elapsed,
                                actual_cost_cents=exec_result.cost_cents,
                                actual_tokens=exec_result.tokens_used,
                                has_expected_outcome=bool(expected_outcome),
                            )
                            await self._stream_section(
                                ctx,
                                _execution_outcome_section(
                                    section_id=f"execution-summary-{step.id}",
                                    order=17,
                                    executor_name=name,
                                    strategy_label=strategy_label,
                                    expected_outcome=expected_outcome,
                                    result_summary=result_summary,
                                    alignment=alignment,
                                    alignment_reason=alignment_reason,
                                    estimated_time_seconds=selected_estimate.time_seconds,
                                    estimated_cost_cents=selected_estimate.dollar_cost_cents,
                                    estimated_tokens=selected_estimate.token_cost,
                                    time_elapsed=exec_result.time_elapsed,
                                    cost_cents=exec_result.cost_cents,
                                    tokens_used=exec_result.tokens_used,
                                    selection_mode=strategy_selection_mode,
                                ),
                            )
                        return exec_result.data
                    else:
                        raise RuntimeError(exec_result.error or "Executor returned failure")

            # ── Fallback to remote sub-agent delegation ───────────────────
            handle = await self.spawn_sub_agent(name)
            try:
                return await handle.run(step.params)
            finally:
                await handle.revoke()

        elif step.action_type == "orchestrate":
            resp = await self.agent.client.post(
                f"{self.agent.url}/agent/orchestrate",
                json={"intent": step.params.get("intent", ctx.objective), "params": step.params},
                headers=self.agent._auth_headers(),
            )
            resp.raise_for_status()
            return resp.json()

        raise ValueError(f"Unknown action_type: {step.action_type}")

    async def _observe(self, step: AgentStep, result: Any, error: str | None) -> None:
        if error:
            step.status = "failed"
            step.error = error
        else:
            step.status = "ok"
            step.result = result

    async def _reflect(self, step: AgentStep, ctx: AgentContext) -> tuple[str, str, str]:
        heuristic_decision = _recommended_reflection_decision(
            step=step,
            max_retries=self.max_retries_per_step,
        )
        if heuristic_decision is not None:
            heuristic_reason = _reflection_reason_for_decision(step, heuristic_decision)
            ctx.reflection_history.append({
                "step_id": step.id,
                "executor_name": step.capability_name or step.action_type,
                "decision": heuristic_decision,
                "source": "heuristic_policy",
                "reason": heuristic_reason,
                "error": step.error or "",
            })
            ctx.reflection_history = ctx.reflection_history[-8:]
            await _publish_event(
                "reflection_complete", self.agent.agent_id,
                {
                    "task_id": ctx.thread_id,
                    "step_id": step.id,
                    "decision": heuristic_decision,
                    "source": "heuristic_policy",
                    "reason": heuristic_reason,
                },
                correlation_id=ctx.thread_id,
            )
            return heuristic_decision, "heuristic_policy", heuristic_reason

        prompt = (
            f"Objective: {ctx.objective}\n"
            f"Step: {step.capability_name} (action_type={step.action_type})\n"
            f"Status: {step.status}\n"
            f"Result: {str(step.result)[:300] if step.result is not None else 'none'}\n"
            f"Error: {step.error or 'none'}\n"
            f"Retry count: {step.retry_count} of {self.max_retries_per_step}\n"
            "Decision?"
        )
        decision = (await self._llm_call(_REFLECT_SYSTEM, prompt)).strip().lower()
        valid = {"continue", "retry", "replan", "done", "escalate"}
        decision = decision if decision in valid else "continue"
        llm_reason = _reflection_reason_for_decision(step, decision)
        ctx.reflection_history.append({
            "step_id": step.id,
            "executor_name": step.capability_name or step.action_type,
            "decision": decision,
            "source": "llm",
            "reason": llm_reason,
            "error": step.error or "",
        })
        ctx.reflection_history = ctx.reflection_history[-8:]
        await _publish_event(
            "reflection_complete", self.agent.agent_id,
            {
                "task_id": ctx.thread_id,
                "step_id": step.id,
                "decision": decision,
                "source": "llm",
                "reason": llm_reason,
            },
            correlation_id=ctx.thread_id,
        )
        return decision, "llm", llm_reason

    async def _compress_context(self, ctx: AgentContext) -> None:
        if len(ctx.steps) <= 3:
            return
        old_steps = ctx.steps[:-3]
        summary_prompt = (
            "Summarize the following agent steps into 3-5 bullet points, "
            "preserving key findings, decisions, and failures:\n"
            + "\n".join(
                f"- [{s.status}] {s.capability_name or s.action_type}: {s.rationale}"
                + (f" → {str(s.result)[:100]}" if s.result else "")
                + (f" (error: {s.error})" if s.error else "")
                for s in old_steps
            )
        )
        summary = await self._llm_call("You are a concise summarizer.", summary_prompt)
        ctx.progress_summary = (
            (ctx.progress_summary + "\n" + summary).strip() if ctx.progress_summary else summary
        )
        ctx.steps = ctx.steps[-3:]

    async def _escalate(self, ctx: AgentContext, reason: str) -> AgentResult:
        ctx.status = "escalated"
        await self._stream_section(ctx, {
            "id": "escalation-error",
            "type": "error", "order": 999,
            "content": {"text": f"Could not complete: {reason}"},
            "status": "complete",
        })
        await self._send_afp(ctx, "agent_escalation", {
            "reason": reason, "steps_taken": len(ctx.steps), "card_id": ctx.card_id
        })
        return AgentResult(
            objective=ctx.objective, thread_id=ctx.thread_id,
            final_answer=f"Escalated: {reason}", steps_taken=len(ctx.steps),
            status="escalated", preferred_view=ctx.preferred_view, card_id=ctx.card_id,
        )

    # ------------------------------------------------------------------
    # Conversational Agentic Loop: intent, progress, confirmation, LoRA
    # ------------------------------------------------------------------

    async def _understand_intent(self, ctx: AgentContext) -> None:
        try:
            raw = await self._llm_call(_UNDERSTAND_INTENT_SYSTEM, ctx.objective)
            raw_stripped = (
                raw.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
            )
            data = json.loads(raw_stripped)
            ctx.intent_type = data.get("intent_type", "chat")
            ctx.preferred_view = data.get("preferred_view", "generative_card")

            clarification = data.get("clarification")
            if clarification:
                ctx.current_plan = f"Ask the user: {clarification}"

            if _EXECUTORS_AVAILABLE:
                ambiguity_result = AmbiguityResult.from_llm_response(data)
                ctx.ambiguities = [
                    dp.__dict__ if hasattr(dp, "__dict__") else {}
                    for dp in ambiguity_result.decision_points
                ]
                # Store raw dicts for DecisionPoint.from_dict reconstruction
                ctx.ambiguities = data.get("ambiguities", [])
        except Exception as exc:
            logger.debug("_understand_intent failed (non-fatal): %s", exc)

    async def _emit_progress(self, ctx: AgentContext, message: str, progress_pct: int = 0) -> None:
        """Stream a progress section into the generative card."""
        await self._stream_section(ctx, {
            "id": "main-progress",
            "type": "progress",
            "order": 999,
            "content": {"text": message, "pct": progress_pct},
            "status": "streaming" if progress_pct < 100 else "complete",
        })

    async def _stream_failure_for_step(
        self,
        ctx: AgentContext,
        step: AgentStep,
        failure_kind: str,
        error_text: str,
    ) -> None:
        contract = _extract_strategy_contract(step.params)
        if contract is not None and step.capability_name:
            await self._stream_section(
                ctx,
                _execution_failure_section(
                    section_id=f"execution-failure-{step.id}",
                    order=18,
                    executor_name=step.capability_name,
                    strategy_label=str(contract.get("strategy_label", "")),
                    expected_outcome=str(contract.get("expected_outcome", "")),
                    failure_kind=failure_kind,
                    failure_reason=_failure_reason_for_kind(failure_kind, error_text),
                    error_text=error_text,
                    estimated_time_seconds=float(contract.get("estimated_time_seconds", 0.0) or 0.0),
                    estimated_cost_cents=float(contract.get("estimated_cost_cents", 0.0) or 0.0),
                    estimated_tokens=int(contract.get("estimated_tokens", 0) or 0),
                    selection_mode=str(contract.get("selection_mode", "single_path")),
                ),
            )
            return

        await self._stream_section(ctx, {
            "id": f"error-{step.id}",
            "type": "error",
            "order": 900,
            "content": {"text": error_text},
            "status": "complete",
        })

    async def _await_user(
        self,
        ctx: AgentContext,
        prompt: str,
        expected_decision_point_id: str | None = None,
        show_prompt_section: bool = True,
    ) -> str | None:
        """
        Event-driven user reply wait.
        First checks for pending decision resolver (generative card decision_point).
        Falls back to polling the thread for user_reply / text messages.
        """
        if show_prompt_section:
            await self._stream_section(ctx, {
                "id": f"user-input-{len(ctx.steps)}",
                "type": "user_input",
                "order": 950,
                "content": {"prompt": prompt},
                "status": "awaiting_input",
            })

        loop = asyncio.get_event_loop()
        deadline = loop.time() + 300  # 5-minute window
        started_at = datetime.datetime.now(datetime.timezone.utc)

        while loop.time() < deadline:
            await asyncio.sleep(5)
            try:
                resp = await self.agent.client.get(
                    f"{self.agent.url}/thread/{ctx.thread_id}",
                    headers=self.agent._auth_headers(),
                )
                if resp.status_code == 200:
                    for msg in reversed(resp.json()):
                        msg_type = msg.get("type", "")
                        msg_timestamp = _parse_iso_timestamp(msg.get("timestamp"))
                        if msg_timestamp is not None and msg_timestamp < started_at:
                            continue
                        if msg_type == "user_decision":
                            content = msg.get("content") or {}
                            dp_id = content.get("decision_point_id", "")
                            opt_id = content.get("selected_option_id", "")
                            if expected_decision_point_id and dp_id != expected_decision_point_id:
                                continue
                            # Resolve decision via resolver if present
                            if ctx._decision_resolver is not None:
                                ctx._decision_resolver.receive_decision(dp_id, opt_id)
                                return opt_id
                            return content.get("selected_option_id", "confirmed")
                        if (
                            msg_type in ("user_reply", "text")
                            and msg.get("from") != self.agent.agent_id
                        ):
                            content = msg.get("content") or {}
                            text = content.get("text") or content.get("body", "")
                            if text:
                                return text
            except Exception:
                pass
        return None

    async def _read_lora_hints(self) -> str:
        try:
            resp = await self.agent.client.get(
                f"{self.agent.url}/agent/lora-confidence",
                headers=self.agent._auth_headers(),
            )
            if resp.status_code == 200:
                score = float((resp.json() or {}).get("score", 0.5))
                if score >= 0.8:
                    return "user prefers autonomous action — act without asking for confirmation unless strictly necessary"
                elif score <= 0.3:
                    return "user prefers to confirm every significant action before execution"
                else:
                    return "user wants confirmation only before irreversible or high-impact actions"
        except Exception:
            pass
        return ""

    async def _build_executor_strategy_candidates(
        self,
        executor: Any,
        executor_name: str,
        params: dict,
        exec_ctx: Any,
    ) -> list[dict[str, Any]]:
        variants = _strategy_variants_for_executor(executor_name, params)
        if not variants:
            return []

        candidates: list[dict[str, Any]] = []
        for variant in variants:
            merged_params = {**params, **variant["params_patch"]}
            estimate = await executor.estimate_cost(merged_params, exec_ctx)
            estimate.strategy_label = variant["label"]
            candidates.append({
                "option_id": variant["option_id"],
                "label": variant["label"],
                "description": variant["description"],
                "cons": list(variant.get("cons", [])),
                "expected_outcome": variant["expected_outcome"],
                "params": merged_params,
                "estimate": estimate,
            })

        return candidates

    async def _load_llm_config(self) -> dict:
        """Fetch GET /user/llm-config to initialize the provider-aware cost model."""
        try:
            resp = await self.agent.client.get(
                f"{self.agent.url}/user/llm-config",
                headers=self.agent._auth_headers(),
            )
            if resp.status_code == 200:
                return resp.json()
        except Exception:
            pass
        return {
            "backend":                   "hosted",
            "provider":                  "anthropic",
            "model":                     self.model,
            "monthly_budget_cents":      10000,
            "usage_cents_current_month": 0,
        }

    async def _load_agent_preferences(self, ctx: AgentContext) -> None:
        """Fetch GET /user/agent-preferences and apply to ctx."""
        try:
            resp = await self.agent.client.get(
                f"{self.agent.url}/user/agent-preferences",
                headers=self.agent._auth_headers(),
            )
            if resp.status_code == 200:
                prefs = resp.json()
                ctx.auto_confirm_threshold = float(prefs.get("auto_confirm_threshold_cents", 5.0))
                mode = prefs.get("optimization_mode", self.optimization_mode)
                if mode in ("speed", "cost", "balanced"):
                    self.optimization_mode = mode
        except Exception:
            pass

    # ------------------------------------------------------------------
    # Generative card section streaming
    # ------------------------------------------------------------------

    async def _stream_section(self, ctx: AgentContext, section: dict) -> None:
        """Stream a single section update into the generative card via AFP."""
        await self._send_afp(ctx, "card_section_update", {
            "card_id": ctx.card_id,
            "section": section,
            "cost_so_far_cents": ctx.cost_so_far,
            "tokens_used": ctx.tokens_used,
        })

    # ------------------------------------------------------------------
    # Sub-agent spawning
    # ------------------------------------------------------------------

    async def spawn_sub_agent(
        self,
        capability_name: str,
        mask: str = "private",
        expires_in: int = 3600,
    ) -> SubAgentHandle:
        resp = await self.agent.client.post(
            f"{self.agent.url}/agent/delegate",
            json={"scope": capability_name, "mask": mask, "expires_in": expires_in},
            headers=self.agent._auth_headers(),
        )
        resp.raise_for_status()
        delegation = resp.json()
        scoped = Agent(
            homeserver_url=self.agent.url,
            agent_id=self.agent.agent_id,
            signing_key_hex=delegation.get("delegated_key_hex"),
        )
        await _publish_event(
            "capability_registered", self.agent.agent_id,
            {"capability_name": capability_name, "version": "delegated",
             "approval_mode": "autonomous", "agent_id": self.agent.agent_id},
        )
        return SubAgentHandle(
            delegation_id=delegation["id"],
            scoped_agent=scoped,
            capability_name=capability_name,
            expires_at=delegation.get("expires_at", ""),
        )

    # ------------------------------------------------------------------
    # AFP helpers
    # ------------------------------------------------------------------

    async def _log_step_as_afp(self, step: AgentStep, ctx: AgentContext) -> None:
        await self._send_afp(ctx, "agent_step", {
            "step_id": step.id,
            "action_type": step.action_type,
            "capability_name": step.capability_name,
            "params": step.params,
            "rationale": step.rationale,
            "status": step.status,
            "result": str(step.result)[:500] if step.result is not None else None,
            "error": step.error,
            "retry_count": step.retry_count,
        })

    async def _send_afp(self, ctx: AgentContext, msg_type: str, content: dict) -> None:
        try:
            normalized = _normalize_agent_afp_message(msg_type, content)
            msg = Message(
                thread_id=ctx.thread_id,
                type=normalized["type"],
                subtype=normalized["subtype"],
                content=normalized["content"],
                metadata=normalized["metadata"],
            )
            await self.agent.send(msg)
        except Exception:
            pass

    # ------------------------------------------------------------------
    # LLM adapter
    # ------------------------------------------------------------------

    def _make_llm_adapter(self):
        """
        Return a simple object with a .complete() async method that executors can call.
        Wraps the injected llm_client to provide a uniform interface.
        """
        llm = self.llm
        model = self.model

        class _LlmAdapter:
            async def complete(self, messages: list, max_tokens: int = 800, **kwargs):
                try:
                    if hasattr(llm, "messages"):
                        # Anthropic SDK
                        create_fn = llm.messages.create
                        kw = dict(
                            model=model,
                            max_tokens=max_tokens,
                            messages=messages,
                        )
                        if asyncio.iscoroutinefunction(create_fn):
                            resp = await create_fn(**kw)
                        else:
                            resp = await asyncio.to_thread(create_fn, **kw)
                        resp.content = resp.content[0].text
                        return resp
                    # OpenAI-compatible
                    create_fn = llm.chat.completions.create
                    kw = dict(model=model, messages=messages, max_tokens=max_tokens)
                    if asyncio.iscoroutinefunction(create_fn):
                        resp = await create_fn(**kw)
                    else:
                        resp = await asyncio.to_thread(create_fn, **kw)
                    resp.content = resp.choices[0].message.content or ""
                    return resp
                except Exception as exc:
                    class _Err:
                        content = f"[LLM error: {exc}]"
                    return _Err()

        return _LlmAdapter()


def _normalize_agent_afp_message(msg_type: str, content: dict) -> dict:
    legacy_agent_types = {
        "agent_provisioned": "provisioned",
        "agent_plan": "plan",
        "agent_step": "step",
        "agent_result": "result",
        "agent_approval_request": "approval_request",
        "agent_approval_granted": "approval_granted",
        "agent_approval_rejected": "approval_rejected",
        "agent_conflict_detected": "conflict_detected",
        "agent_triage": "triage",
        "agent_message": "message",
        "agent_escalation": "escalation",
        "agent_research_result": "research_result",
    }

    if msg_type in {"generative_card", "card_section_update"}:
        return {
            "type": msg_type,
            "subtype": None,
            "content": content,
            "metadata": None,
        }

    subtype = legacy_agent_types.get(msg_type)
    if subtype is None:
        return {
            "type": msg_type,
            "subtype": None,
            "content": content,
            "metadata": None,
        }

    metadata = {"legacy_type": msg_type}
    if "card_id" in content:
        metadata["card_id"] = content["card_id"]

    return {
        "type": "agent",
        "subtype": subtype,
        "content": content,
        "metadata": metadata,
    }

    async def _llm_call(self, system: str, user: str) -> str:
        try:
            if hasattr(self.llm, "messages"):
                create_fn = self.llm.messages.create
                kwargs = dict(
                    model=self.model,
                    max_tokens=1024,
                    system=system,
                    messages=[{"role": "user", "content": user}],
                )
                if asyncio.iscoroutinefunction(create_fn):
                    resp = await create_fn(**kwargs)
                else:
                    resp = await asyncio.to_thread(create_fn, **kwargs)
                return resp.content[0].text
            create_fn = self.llm.chat.completions.create
            kwargs = dict(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
            )
            if asyncio.iscoroutinefunction(create_fn):
                resp = await create_fn(**kwargs)
            else:
                resp = await asyncio.to_thread(create_fn, **kwargs)
            return resp.choices[0].message.content or ""
        except Exception as exc:
            return f'{{"action_type": "escalate", "capability_name": null, "params": {{}}, "rationale": "LLM error: {str(exc)[:100]}"}}'


# ---------------------------------------------------------------------------
# Utility
# ---------------------------------------------------------------------------

def _dataclass_to_dict(obj) -> dict:
    """Convert a dataclass to dict, handling non-dataclass objects gracefully."""
    try:
        from dataclasses import asdict
        return asdict(obj)
    except Exception:
        return obj.__dict__ if hasattr(obj, "__dict__") else {}


def _decision_callout_section(
    section_id: str,
    order: int,
    title: str,
    text: str,
    tone: str,
) -> dict:
    return {
        "id": section_id,
        "type": "callout",
        "order": order,
        "content": {
            "title": title,
            "text": text,
            "tone": tone,
        },
        "status": "complete",
    }


def _parse_iso_timestamp(value: str | None) -> datetime.datetime | None:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
    except Exception:
        return None


def _strategy_outcome_section(
    section_id: str,
    order: int,
    executor_name: str,
    strategy_label: str,
    expected_outcome: str,
) -> dict:
    return {
        "id": section_id,
        "type": "strategy_summary",
        "order": order,
        "content": {
            "executor_name": executor_name,
            "strategy_label": strategy_label,
            "title": f"{executor_name.replace('_', ' ').title()} · {strategy_label}",
            "text": expected_outcome,
        },
        "status": "complete",
    }


def _execution_outcome_section(
    section_id: str,
    order: int,
    executor_name: str,
    strategy_label: str,
    expected_outcome: str,
    result_summary: str,
    alignment: str,
    alignment_reason: str,
    estimated_time_seconds: float,
    estimated_cost_cents: float,
    estimated_tokens: int,
    time_elapsed: float,
    cost_cents: float,
    tokens_used: int,
    selection_mode: str,
) -> dict:
    title = (
        f"{executor_name.replace('_', ' ').title()} completed via {strategy_label}"
        if strategy_label else f"{executor_name.replace('_', ' ').title()} completed"
    )
    return {
        "id": section_id,
        "type": "execution_summary",
        "order": order,
        "content": {
            "executor_name": executor_name,
            "strategy_label": strategy_label,
            "expected_outcome": expected_outcome,
            "result_summary": result_summary,
            "alignment": alignment,
            "alignment_reason": alignment_reason,
            "estimated_time_seconds": estimated_time_seconds,
            "estimated_cost_cents": estimated_cost_cents,
            "estimated_tokens": estimated_tokens,
            "time_elapsed": time_elapsed,
            "cost_cents": cost_cents,
            "tokens_used": tokens_used,
            "selection_mode": selection_mode,
            "title": title,
        },
        "status": "complete",
    }


def _execution_failure_section(
    section_id: str,
    order: int,
    executor_name: str,
    strategy_label: str,
    expected_outcome: str,
    failure_kind: str,
    failure_reason: str,
    error_text: str,
    estimated_time_seconds: float,
    estimated_cost_cents: float,
    estimated_tokens: int,
    selection_mode: str,
) -> dict:
    title = (
        f"{executor_name.replace('_', ' ').title()} could not complete {strategy_label}"
        if strategy_label else f"{executor_name.replace('_', ' ').title()} could not complete"
    )
    return {
        "id": section_id,
        "type": "execution_failure",
        "order": order,
        "content": {
            "executor_name": executor_name,
            "strategy_label": strategy_label,
            "expected_outcome": expected_outcome,
            "failure_kind": failure_kind,
            "failure_reason": failure_reason,
            "error_text": error_text,
            "estimated_time_seconds": estimated_time_seconds,
            "estimated_cost_cents": estimated_cost_cents,
            "estimated_tokens": estimated_tokens,
            "selection_mode": selection_mode,
            "title": title,
        },
        "status": "complete",
    }


def _retry_summary_section(
    section_id: str,
    order: int,
    executor_name: str,
    retry_count: int,
    max_retries: int,
    mode: str,
    source: str,
    title: str,
    text: str,
    from_strategy: str,
    to_strategy: str,
) -> dict:
    return {
        "id": section_id,
        "type": "retry_summary",
        "order": order,
        "content": {
            "executor_name": executor_name,
            "retry_count": retry_count,
            "max_retries": max_retries,
            "mode": mode,
            "source": source,
            "title": title,
            "text": text,
            "from_strategy": from_strategy,
            "to_strategy": to_strategy,
            "a2ui": _a2ui_retry_summary(
                title=title,
                text=text,
                mode=mode,
                source=source,
                retry_count=retry_count,
                max_retries=max_retries,
                from_strategy=from_strategy,
                to_strategy=to_strategy,
            ),
        },
        "status": "complete",
    }


def _replan_summary_section(
    section_id: str,
    order: int,
    executor_name: str,
    source: str,
    title: str,
    text: str,
    next_plan: str,
    constraints: dict[str, list[str]],
) -> dict:
    return {
        "id": section_id,
        "type": "replan_summary",
        "order": order,
        "content": {
            "executor_name": executor_name,
            "source": source,
            "title": title,
            "text": text,
            "next_plan": next_plan,
            "constraints": constraints,
            "a2ui": _a2ui_replan_summary(
                title=title,
                text=text,
                next_plan=next_plan,
                source=source,
                constraints=constraints,
            ),
        },
        "status": "complete",
    }


def _reflection_summary_section(
    section_id: str,
    order: int,
    executor_name: str,
    decision: str,
    source: str,
    reason: str,
) -> dict:
    return {
        "id": section_id,
        "type": "reflection_summary",
        "order": order,
        "content": {
            "executor_name": executor_name,
            "decision": decision,
            "source": source,
            "reason": reason,
            "title": f"Next action: {decision.replace('_', ' ')}",
            "a2ui": _a2ui_reflection_summary(
                executor_name=executor_name,
                decision=decision,
                source=source,
                reason=reason,
            ),
        },
        "status": "complete",
    }


def _extract_strategy_contract(params: dict | None) -> dict[str, Any] | None:
    if not params:
        return None
    contract = params.get("_omnyid_strategy_contract")
    return contract if isinstance(contract, dict) else None


def _build_retry_fallback(
    candidate_strategies: list[dict[str, Any]],
    selected_candidate_meta: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not candidate_strategies or not selected_candidate_meta:
        return None
    selected_index = next(
        (
            index for index, candidate in enumerate(candidate_strategies)
            if candidate["option_id"] == selected_candidate_meta["option_id"]
        ),
        -1,
    )
    if selected_index <= 0:
        return None
    fallback = candidate_strategies[selected_index - 1]
    return {
        "option_id": fallback["option_id"],
        "label": fallback["label"],
        "expected_outcome": fallback.get("expected_outcome", ""),
        "params_patch": dict(fallback.get("params_patch", {})),
    }


def _failure_reason_for_kind(failure_kind: str, error_text: str) -> str:
    if failure_kind == "timeout":
        return "The selected path did not finish within the allowed execution window."
    if "dependency" in error_text.lower():
        return "The selected path was blocked by a missing dependency in the executor environment."
    if "permission" in error_text.lower() or "denied" in error_text.lower():
        return "The selected path was blocked by a policy or permission boundary."
    return "The selected path failed during execution before it could deliver the expected outcome."


def _plan_retry_for_step(step: AgentStep) -> dict[str, Any] | None:
    contract = _extract_strategy_contract(step.params)
    if contract is None:
        return {
            "updated_params": step.params,
            "mode": "same_path",
            "title": "Retrying the same path",
            "text": "OmnyID will retry this step with the same execution path because no safer fallback was available.",
            "from_strategy": "",
            "to_strategy": "",
        }

    error_text = (step.error or "").lower()
    fallback = contract.get("retry_fallback")
    can_downgrade = (
        isinstance(fallback, dict)
        and ("timed out" in error_text or "timeout" in error_text)
        and isinstance(fallback.get("params_patch"), dict)
    )
    updated_params = dict(step.params)
    from_strategy = str(contract.get("strategy_label", ""))
    to_strategy = from_strategy

    if can_downgrade:
        patch = dict(fallback.get("params_patch", {}))
        updated_params.update(patch)
        to_strategy = str(fallback.get("label", from_strategy))
        new_contract = dict(contract)
        new_contract["strategy_option_id"] = str(fallback.get("option_id", ""))
        new_contract["strategy_label"] = to_strategy
        new_contract["expected_outcome"] = str(fallback.get("expected_outcome", contract.get("expected_outcome", "")))
        updated_params["_omnyid_strategy_contract"] = new_contract
        return {
            "updated_params": updated_params,
            "mode": "downgraded_path",
            "title": "Retrying with a safer path",
            "text": (
                f"OmnyID is stepping down from {from_strategy} to {to_strategy} to improve the chance "
                "of finishing within the execution window."
            ),
            "from_strategy": from_strategy,
            "to_strategy": to_strategy,
        }

    return {
        "updated_params": updated_params,
        "mode": "same_path",
        "title": "Retrying the same path",
        "text": (
            f"OmnyID will retry {from_strategy or step.capability_name or 'this step'} without changing "
            "strategy yet."
        ),
        "from_strategy": from_strategy,
        "to_strategy": to_strategy,
    }


def _recommended_reflection_decision(step: AgentStep, max_retries: int) -> str | None:
    if step.status != "failed":
        return None

    error_text = (step.error or "").lower()
    retries_left = step.retry_count < max_retries

    if any(token in error_text for token in ("permission", "forbidden", "denied", "unauthorized")):
        return "escalate"

    if "missing dependency" in error_text or "modulenotfounderror" in error_text:
        return "escalate"

    if "timed out" in error_text or "timeout" in error_text:
        return "retry" if retries_left else "escalate"

    if "rate limit" in error_text or "too many requests" in error_text:
        return "retry" if retries_left else "escalate"

    return None


def _reflection_reason_for_decision(step: AgentStep, decision: str) -> str:
    error_text = step.error or ""
    if decision == "retry":
        if "timed out" in error_text.lower() or "timeout" in error_text.lower():
            return "Retrying because the step hit a time boundary and may succeed on another attempt or a downgraded path."
        if "rate limit" in error_text.lower():
            return "Retrying because the failure looks transient and may clear on the next attempt."
        return "Retrying because the step may still succeed without a full replan."
    if decision == "escalate":
        if "missing dependency" in error_text.lower():
            return "Escalating because the executor environment is missing a required dependency."
        if any(token in error_text.lower() for token in ("permission", "forbidden", "denied", "unauthorized")):
            return "Escalating because the step is blocked by a permission or policy boundary."
        return "Escalating because continuing automatically is unlikely to succeed safely."
    if decision == "done":
        return "The step appears to have fully satisfied the objective."
    if decision == "replan":
        return "The current plan no longer looks like the best path forward."
    return "Continuing because the current plan still looks viable."


def _planning_guidance_from_reflections(reflections: list[dict[str, str]]) -> str:
    if not reflections:
        return ""

    recent = reflections[-4:]
    timeout_retries = [
        item for item in recent
        if item.get("decision") == "retry"
        and any(token in item.get("error", "").lower() for token in ("timeout", "timed out"))
    ]
    policy_escalations = [
        item for item in recent
        if item.get("decision") == "escalate"
        and item.get("source") == "heuristic_policy"
    ]

    guidance: list[str] = []
    if len(timeout_retries) >= 2:
        guidance.append(
            "Avoid proposing another high-latency path for the same capability; prefer a cheaper or faster strategy, or replan."
        )
    if policy_escalations:
        guidance.append(
            "Do not repeat steps that recently escalated due to hard policy, permission, or dependency boundaries."
        )
    return " ".join(guidance)


def _plan_replan_for_step(step: AgentStep, source: str, reason: str) -> dict[str, str]:
    capability = step.capability_name or step.action_type
    constraints = {
        "avoid_capabilities": [capability] if capability else [],
    }
    next_plan = (
        f"Replan after {capability}: avoid repeating the previous failing path and choose a safer alternative."
    )
    if step.error:
        next_plan = (
            f"Replan after {capability}: account for the failure '{step.error}' and choose a different execution path."
        )
    return {
        "title": "Plan adjusted before the next step",
        "text": (
            f"OmnyID is replanning after {capability}. "
            f"{reason}"
        ),
        "next_plan": next_plan,
        "source": source,
        "constraints": constraints,
    }


def _apply_reasoning_guardrails(
    data: dict[str, Any],
    reflection_history: list[dict[str, str]],
    replan_constraints: dict[str, list[str]] | None = None,
) -> dict[str, Any]:
    action_type = data.get("action_type", "escalate")
    capability_name = data.get("capability_name")
    params = dict(data.get("params") or {})

    if action_type != "invoke_capability" or not capability_name:
        return {
            "action_type": action_type,
            "capability_name": capability_name,
            "params": params,
            "rationale": data.get("rationale", ""),
        }

    if _capability_blocked_by_replan_constraints(capability_name, replan_constraints or {}):
        return {
            "action_type": "escalate",
            "capability_name": None,
            "params": {},
            "rationale": (
                f"Planner proposed {capability_name}, but the active replan constraints say to avoid that capability."
            ),
            "_omnyid_guardrail_summary": {
                "mode": "blocked",
                "source": "replan_constraints",
                "title": "Planner proposal blocked",
                "text": (
                    f"OmnyID blocked {capability_name} because the current replan constraints explicitly avoid it."
                ),
                "capability_name": capability_name,
            },
        }

    if _capability_blocked_by_reflections(capability_name, reflection_history):
        return {
            "action_type": "escalate",
            "capability_name": None,
            "params": {},
            "rationale": (
                f"Planner proposed {capability_name}, but recent reflection history shows it is blocked by "
                "policy, permission, or missing dependency boundaries."
            ),
            "_omnyid_guardrail_summary": {
                "mode": "blocked",
                "source": "reflection_history",
                "title": "Planner proposal blocked",
                "text": (
                    f"OmnyID blocked {capability_name} before execution because recent attempts hit a hard "
                    "policy, permission, or dependency boundary."
                ),
                "capability_name": capability_name,
            },
        }

    if _capability_has_repeat_timeouts(capability_name, reflection_history):
        retry_guidance = dict(params.get("_omnyid_retry_guidance") or {})
        retry_guidance["prefer_faster_strategy"] = True
        retry_guidance["source"] = "reflection_history"
        params["_omnyid_retry_guidance"] = retry_guidance
        return {
            "action_type": action_type,
            "capability_name": capability_name,
            "params": params,
            "rationale": data.get("rationale", ""),
            "_omnyid_guardrail_summary": {
                "mode": "biased_faster",
                "source": "reflection_history",
                "title": "Planner proposal adjusted",
                "text": (
                    f"OmnyID kept {capability_name}, but biased it toward a faster execution path because "
                    "recent attempts timed out."
                ),
                "capability_name": capability_name,
            },
        }

    return {
        "action_type": action_type,
        "capability_name": capability_name,
        "params": params,
        "rationale": data.get("rationale", ""),
    }


def _capability_blocked_by_reflections(
    capability_name: str,
    reflection_history: list[dict[str, str]],
) -> bool:
    for item in reversed(reflection_history[-6:]):
        if item.get("executor_name") != capability_name:
            continue
        if item.get("decision") != "escalate" or item.get("source") != "heuristic_policy":
            continue
        error_text = item.get("error", "").lower()
        if any(token in error_text for token in ("permission", "forbidden", "denied", "unauthorized", "missing dependency")):
            return True
    return False


def _capability_has_repeat_timeouts(
    capability_name: str,
    reflection_history: list[dict[str, str]],
) -> bool:
    timeout_count = 0
    for item in reversed(reflection_history[-6:]):
        if item.get("executor_name") != capability_name:
            continue
        error_text = item.get("error", "").lower()
        if item.get("decision") == "retry" and any(token in error_text for token in ("timeout", "timed out")):
            timeout_count += 1
        if timeout_count >= 2:
            return True
    return False


def _capability_blocked_by_replan_constraints(
    capability_name: str,
    replan_constraints: dict[str, list[str]],
) -> bool:
    return capability_name in replan_constraints.get("avoid_capabilities", [])


def _forced_strategy_candidate_from_params(
    candidate_strategies: list[dict[str, Any]],
    params: dict[str, Any],
) -> dict[str, Any] | None:
    retry_guidance = params.get("_omnyid_retry_guidance")
    if not isinstance(retry_guidance, dict):
        return None
    if not retry_guidance.get("prefer_faster_strategy"):
        return None
    if not candidate_strategies:
        return None
    return min(
        candidate_strategies,
        key=lambda candidate: (
            float(candidate["estimate"].time_seconds),
            float(candidate["estimate"].dollar_cost_cents),
        ),
    )


def _planning_guardrail_section(
    section_id: str,
    order: int,
    mode: str,
    source: str,
    title: str,
    text: str,
    capability_name: str,
) -> dict:
    return {
        "id": section_id,
        "type": "planning_guardrail",
        "order": order,
        "content": {
            "mode": mode,
            "source": source,
            "title": title,
            "text": text,
            "capability_name": capability_name,
            "a2ui": _a2ui_planning_guardrail(
                mode=mode,
                source=source,
                title=title,
                text=text,
                capability_name=capability_name,
            ),
        },
        "status": "complete",
    }


def _a2ui_callout_node(node_id: str, tone: str, title: str, body: str) -> dict[str, Any]:
    return {
        "id": node_id,
        "type": "callout",
        "props": {
            "tone": tone,
            "title": title,
            "body": body,
        },
    }


def _a2ui_stats_node(node_id: str, items: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "id": node_id,
        "type": "stats_grid",
        "props": {
            "items": items,
        },
    }


def _a2ui_constraint_badges(node_id: str, items: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "id": node_id,
        "type": "constraint_badges",
        "props": {
            "items": items,
        },
    }


def _a2ui_text_node(node_id: str, label: str, value: str) -> dict[str, Any]:
    return {
        "id": node_id,
        "type": "text",
        "props": {
            "label": label,
            "value": value,
        },
    }


def _a2ui_reflection_summary(
    executor_name: str,
    decision: str,
    source: str,
    reason: str,
) -> dict[str, Any]:
    return {
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": "Reflection",
        "description": executor_name.replace("_", " "),
        "layout": {"type": "stack", "gap": "md"},
        "nodes": [
            _a2ui_callout_node(
                "reflection-callout",
                "info",
                f"Next action: {decision.replace('_', ' ')}",
                reason,
            ),
            _a2ui_stats_node(
                "reflection-meta",
                [
                    {"label": "Decision", "value": decision.replace("_", " ")},
                    {"label": "Source", "value": "System policy" if source == "heuristic_policy" else "Planner judgment"},
                ],
            ),
        ],
    }


def _a2ui_retry_summary(
    title: str,
    text: str,
    mode: str,
    source: str,
    retry_count: int,
    max_retries: int,
    from_strategy: str,
    to_strategy: str,
) -> dict[str, Any]:
    nodes = [
        _a2ui_callout_node(
            "retry-callout",
            "warning" if mode == "downgraded_path" else "info",
            title,
            text,
        ),
        _a2ui_stats_node(
            "retry-meta",
            [
                {"label": "Attempt", "value": f"{retry_count} of {max_retries}"},
                {"label": "Source", "value": "System policy" if source == "heuristic_policy" else "Planner judgment"},
            ],
        ),
    ]
    if from_strategy or to_strategy:
        nodes.append(
            _a2ui_stats_node(
                "retry-paths",
                [
                    {"label": "Previous path", "value": from_strategy or "Unspecified"},
                    {"label": "Retry path", "value": to_strategy or from_strategy or "Unspecified"},
                ],
            )
        )
    return {
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": "Retry",
        "layout": {"type": "stack", "gap": "md"},
        "nodes": nodes,
    }


def _a2ui_replan_summary(
    title: str,
    text: str,
    next_plan: str,
    source: str,
    constraints: dict[str, list[str]],
) -> dict[str, Any]:
    nodes = [
        _a2ui_callout_node("replan-callout", "strategy", title, text),
        _a2ui_text_node("replan-next-plan", "Next plan", next_plan),
        _a2ui_stats_node(
            "replan-source",
            [{"label": "Source", "value": "System policy" if source == "heuristic_policy" else "Planner judgment"}],
        ),
    ]
    avoid_capabilities = constraints.get("avoid_capabilities", [])
    if avoid_capabilities:
        nodes.append(
            _a2ui_constraint_badges(
                "replan-constraints",
                [{"kind": "avoid_capability", "label": capability} for capability in avoid_capabilities],
            )
        )
    return {
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": "Replan",
        "layout": {"type": "stack", "gap": "md"},
        "nodes": nodes,
    }


def _a2ui_planning_guardrail(
    mode: str,
    source: str,
    title: str,
    text: str,
    capability_name: str,
) -> dict[str, Any]:
    nodes = [
        _a2ui_callout_node(
            "guardrail-callout",
            "danger" if mode == "blocked" else "warning",
            title,
            text,
        ),
        _a2ui_stats_node(
            "guardrail-meta",
            [
                {"label": "Mode", "value": mode.replace("_", " ")},
                {"label": "Source", "value": "Recent failures" if source == "reflection_history" else source.replace("_", " ")},
            ],
        ),
    ]
    if capability_name:
        nodes.append(
            _a2ui_constraint_badges(
                "guardrail-capability",
                [{"kind": "capability", "label": capability_name}],
            )
        )
    return {
        "schema_version": "a2ui.v1",
        "kind": "panel",
        "title": "Planner Guardrail",
        "layout": {"type": "stack", "gap": "md"},
        "nodes": nodes,
    }


def _evaluate_execution_alignment(
    selected_estimate: Any,
    actual_time_seconds: float,
    actual_cost_cents: float,
    actual_tokens: int,
    has_expected_outcome: bool,
) -> tuple[str, str]:
    estimated_time = max(float(getattr(selected_estimate, "time_seconds", 0.0) or 0.0), 0.0)
    estimated_cost = max(float(getattr(selected_estimate, "dollar_cost_cents", 0.0) or 0.0), 0.0)
    estimated_tokens = max(int(getattr(selected_estimate, "token_cost", 0) or 0), 0)

    slow = estimated_time > 0 and actual_time_seconds > estimated_time * 1.35
    over_cost = estimated_cost > 0 and actual_cost_cents > estimated_cost * 1.35
    over_tokens = estimated_tokens > 0 and actual_tokens > estimated_tokens * 1.35

    if slow and over_cost:
        return (
            "drifted_time_and_budget",
            "The run finished outside the expected time and spend envelope for the selected path.",
        )
    if over_cost:
        return (
            "drifted_budget",
            "The run completed, but it cost more than the selected strategy predicted.",
        )
    if slow:
        return (
            "drifted_time",
            "The run completed, but it took longer than the selected strategy predicted.",
        )
    if over_tokens:
        return (
            "drifted_tokens",
            "The run completed, but it consumed more model tokens than expected for this path.",
        )
    if has_expected_outcome:
        return (
            "matched_strategy",
            "The run stayed within the expected envelope for the selected strategy.",
        )
    return (
        "completed_default_path",
        "The run completed on the default execution path within its expected envelope.",
    )


def _summarize_execution_result_data(data: Any) -> str:
    if data is None:
        return "The step completed without returning a user-facing payload."

    if isinstance(data, str):
        return data[:220] + ("…" if len(data) > 220 else "")

    if isinstance(data, dict):
        for key in ("summary", "message", "result", "answer", "status"):
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value[:220] + ("…" if len(value) > 220 else "")
        keys = list(data.keys())[:4]
        key_list = ", ".join(str(key) for key in keys)
        if len(data) > 4:
            key_list += ", …"
        return f"Returned structured data with keys: {key_list}."

    if isinstance(data, list):
        return f"Returned {len(data)} item(s)."

    rendered = str(data)
    return rendered[:220] + ("…" if len(rendered) > 220 else "")


def _strategy_variants_for_executor(executor_name: str, params: dict) -> list[dict[str, Any]]:
    if executor_name == "research_pipeline" and "depth" not in params:
        return [
            {
                "option_id": "quick",
                "label": "Quick scan",
                "description": "Search fewer sources and return a faster summary.",
                "expected_outcome": "A short research brief built from fewer sources with faster turnaround.",
                "params_patch": {"depth": "quick"},
                "cons": ["Less comprehensive coverage"],
            },
            {
                "option_id": "standard",
                "label": "Standard research",
                "description": "Balance speed and coverage for a solid research pass.",
                "expected_outcome": "A balanced report with enough coverage for most decisions.",
                "params_patch": {"depth": "standard"},
                "cons": [],
            },
            {
                "option_id": "deep",
                "label": "Deep research",
                "description": "Browse more sources and synthesize a more detailed report.",
                "expected_outcome": "A more comprehensive report with broader source coverage and deeper synthesis.",
                "params_patch": {"depth": "deep"},
                "cons": ["Slower and more expensive"],
            },
        ]

    if executor_name == "web_search" and "max_results" not in params and "summarize" not in params:
        return [
            {
                "option_id": "fast_scan",
                "label": "Fast scan",
                "description": "Get a quick list of sources with minimal overhead.",
                "expected_outcome": "A lightweight source list you can inspect quickly.",
                "params_patch": {"max_results": 5, "summarize": False},
                "cons": ["Less synthesis"],
            },
            {
                "option_id": "balanced_summary",
                "label": "Balanced summary",
                "description": "Search a bit wider and include a concise summary.",
                "expected_outcome": "A concise answer with a moderate set of supporting sources.",
                "params_patch": {"max_results": 8, "summarize": True},
                "cons": [],
            },
            {
                "option_id": "deep_summary",
                "label": "Deep summary",
                "description": "Search wider and summarize more aggressively.",
                "expected_outcome": "A broader summary with more source coverage and stronger synthesis.",
                "params_patch": {"max_results": 12, "summarize": True},
                "cons": ["Higher cost and more latency"],
            },
        ]

    if executor_name == "ecommerce" and params.get("action") == "compare" and "max_products" not in params:
        return [
            {
                "option_id": "focused_compare",
                "label": "Focused compare",
                "description": "Compare a smaller shortlist for a quicker answer.",
                "expected_outcome": "A faster buying recommendation built from a tighter shortlist.",
                "params_patch": {"max_products": 3},
                "cons": ["May miss niche contenders"],
            },
            {
                "option_id": "balanced_compare",
                "label": "Balanced compare",
                "description": "Compare a moderate shortlist for a practical buying decision.",
                "expected_outcome": "A practical comparison across a balanced set of product options.",
                "params_patch": {"max_products": 4},
                "cons": [],
            },
            {
                "option_id": "broad_compare",
                "label": "Broad compare",
                "description": "Browse more product pages before making a recommendation.",
                "expected_outcome": "A broader recommendation that considers more product pages and tradeoffs.",
                "params_patch": {"max_products": 5},
                "cons": ["Slower and more expensive"],
            },
        ]

    return []
