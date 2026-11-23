import importlib.util
import pathlib
import sys
import unittest
import datetime
import types
import asyncio


ROOT = pathlib.Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "afp" / "decision_framework.py"
SPEC = importlib.util.spec_from_file_location("decision_framework_under_test", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)
evaluate_trust_filter = MODULE.evaluate_trust_filter

AFP_PACKAGE = types.ModuleType("afp")
AFP_PACKAGE.__path__ = [str(ROOT / "afp")]
sys.modules["afp"] = AFP_PACKAGE

CLIENT_STUB = types.ModuleType("afp.client")


class _DummyAction:
    pass


class _DummyAgent:
    pass


class _DummyMessage:
    def __init__(self, *args, **kwargs):
        self.args = args
        self.kwargs = kwargs


class _DummyView:
    pass


CLIENT_STUB.Action = _DummyAction
CLIENT_STUB.Agent = _DummyAgent
CLIENT_STUB.Message = _DummyMessage
CLIENT_STUB.View = _DummyView
sys.modules["afp.client"] = CLIENT_STUB

ULID_STUB = types.ModuleType("ulid")


class _DummyULID:
    def __str__(self):
        return "01TESTULID"


ULID_STUB.ULID = _DummyULID
sys.modules["ulid"] = ULID_STUB

MASTER_SPEC = importlib.util.spec_from_file_location("afp.master", ROOT / "afp" / "master.py")
MASTER_MODULE = importlib.util.module_from_spec(MASTER_SPEC)
assert MASTER_SPEC and MASTER_SPEC.loader
sys.modules[MASTER_SPEC.name] = MASTER_MODULE
MASTER_SPEC.loader.exec_module(MASTER_MODULE)
_decision_callout_section = MASTER_MODULE._decision_callout_section
_build_retry_fallback = MASTER_MODULE._build_retry_fallback
_apply_reasoning_guardrails = MASTER_MODULE._apply_reasoning_guardrails
_capability_blocked_by_reflections = MASTER_MODULE._capability_blocked_by_reflections
_capability_blocked_by_replan_constraints = MASTER_MODULE._capability_blocked_by_replan_constraints
_capability_has_repeat_timeouts = MASTER_MODULE._capability_has_repeat_timeouts
_evaluate_execution_alignment = MASTER_MODULE._evaluate_execution_alignment
_execution_failure_section = MASTER_MODULE._execution_failure_section
_execution_outcome_section = MASTER_MODULE._execution_outcome_section
_extract_strategy_contract = MASTER_MODULE._extract_strategy_contract
_failure_reason_for_kind = MASTER_MODULE._failure_reason_for_kind
_forced_strategy_candidate_from_params = MASTER_MODULE._forced_strategy_candidate_from_params
_normalize_agent_afp_message = MASTER_MODULE._normalize_agent_afp_message
_parse_iso_timestamp = MASTER_MODULE._parse_iso_timestamp
_plan_retry_for_step = MASTER_MODULE._plan_retry_for_step
_plan_replan_for_step = MASTER_MODULE._plan_replan_for_step
_planning_guardrail_section = MASTER_MODULE._planning_guardrail_section
_planning_guidance_from_reflections = MASTER_MODULE._planning_guidance_from_reflections
_recommended_reflection_decision = MASTER_MODULE._recommended_reflection_decision
_replan_summary_section = MASTER_MODULE._replan_summary_section
_reflection_reason_for_decision = MASTER_MODULE._reflection_reason_for_decision
_reflection_summary_section = MASTER_MODULE._reflection_summary_section
_retry_summary_section = MASTER_MODULE._retry_summary_section
_summarize_execution_result_data = MASTER_MODULE._summarize_execution_result_data
_strategy_outcome_section = MASTER_MODULE._strategy_outcome_section
_strategy_variants_for_executor = MASTER_MODULE._strategy_variants_for_executor
AgentContext = MASTER_MODULE.AgentContext
AgentStep = MASTER_MODULE.AgentStep
MasterAgent = MASTER_MODULE.MasterAgent
ExecutionResult = MASTER_MODULE.ExecutionResult
ExecutorRegistry = MASTER_MODULE.ExecutorRegistry


class TrustFilterTests(unittest.TestCase):
    def test_low_risk_lookup_does_not_require_confirmation(self):
        verdict = evaluate_trust_filter(
            objective="Summarize this article",
            capability_name="web_search",
            params={"query": "agent protocols"},
        )
        self.assertFalse(verdict.requires_confirmation)
        self.assertEqual(verdict.risk_level, "low")

    def test_destructive_file_operation_requires_confirmation(self):
        verdict = evaluate_trust_filter(
            objective="Delete the old export files",
            capability_name="file_ops",
            params={"operation": "delete", "path": "/workspace/data/files/old"},
        )
        self.assertTrue(verdict.requires_confirmation)
        self.assertEqual(verdict.risk_level, "high")
        self.assertTrue(any(signal.startswith("file_op:delete") for signal in verdict.matched_signals))

    def test_browser_form_interaction_requires_confirmation(self):
        verdict = evaluate_trust_filter(
            objective="Fill the checkout form",
            capability_name="web_browse",
            params={"action": "fill_form", "url": "https://example.com/checkout"},
        )
        self.assertTrue(verdict.requires_confirmation)
        self.assertIn("browser_action:fill_form", verdict.matched_signals)

    def test_policy_can_force_review_even_without_keyword_match(self):
        verdict = evaluate_trust_filter(
            objective="Refresh partner API state",
            capability_name="custom_sync",
            params={"mode": "push"},
            policy={"review_required_capabilities": ["custom_sync"]},
        )
        self.assertTrue(verdict.requires_confirmation)
        self.assertIn("policy:review_required", verdict.matched_signals)


class MasterAgentHelperTests(unittest.TestCase):
    def test_decision_callout_section_has_expected_shape(self):
        section = _decision_callout_section(
            section_id="trust-1",
            order=12,
            title="Risk review approved",
            text="OmnyID can proceed.",
            tone="confirmation",
        )
        self.assertEqual(section["id"], "trust-1")
        self.assertEqual(section["type"], "callout")
        self.assertEqual(section["order"], 12)
        self.assertEqual(section["status"], "complete")
        self.assertEqual(section["content"]["tone"], "confirmation")

    def test_parse_iso_timestamp_accepts_zulu_and_rejects_garbage(self):
        parsed = _parse_iso_timestamp("2026-03-27T10:15:30Z")
        self.assertIsNotNone(parsed)
        assert parsed is not None
        self.assertEqual(parsed.tzinfo, datetime.timezone.utc)
        self.assertIsNone(_parse_iso_timestamp("not-a-timestamp"))

    def test_normalize_agent_afp_message_maps_legacy_agent_types(self):
        normalized = _normalize_agent_afp_message(
            "agent_result",
            {"final_answer": "done", "card_id": "card_123"},
        )
        self.assertEqual(normalized["type"], "agent")
        self.assertEqual(normalized["subtype"], "result")
        self.assertEqual(normalized["metadata"]["legacy_type"], "agent_result")
        self.assertEqual(normalized["metadata"]["card_id"], "card_123")

    def test_normalize_agent_afp_message_preserves_card_formats(self):
        normalized = _normalize_agent_afp_message(
            "generative_card",
            {"card_id": "card_123"},
        )
        self.assertEqual(normalized["type"], "generative_card")
        self.assertIsNone(normalized["subtype"])
        self.assertIsNone(normalized["metadata"])

    def test_normalize_agent_afp_message_maps_more_legacy_variants(self):
        provisioned = _normalize_agent_afp_message(
            "agent_provisioned",
            {"agent_id": "agent:test@omnyid.local"},
        )
        self.assertEqual(provisioned["type"], "agent")
        self.assertEqual(provisioned["subtype"], "provisioned")
        self.assertEqual(provisioned["metadata"]["legacy_type"], "agent_provisioned")

        escalation = _normalize_agent_afp_message(
            "agent_escalation",
            {"reason": "Need human input"},
        )
        self.assertEqual(escalation["type"], "agent")
        self.assertEqual(escalation["subtype"], "escalation")
        self.assertEqual(escalation["metadata"]["legacy_type"], "agent_escalation")

    def test_strategy_variants_for_research_pipeline_are_meaningful(self):
        variants = _strategy_variants_for_executor("research_pipeline", {"topic": "agent protocols"})
        self.assertEqual([variant["option_id"] for variant in variants], ["quick", "standard", "deep"])
        self.assertEqual(variants[0]["params_patch"]["depth"], "quick")
        self.assertEqual(variants[2]["params_patch"]["depth"], "deep")
        self.assertIn("expected_outcome", variants[1])

    def test_strategy_variants_respect_explicit_params(self):
        self.assertEqual(
            _strategy_variants_for_executor("research_pipeline", {"topic": "agent protocols", "depth": "deep"}),
            [],
        )
        self.assertEqual(
            _strategy_variants_for_executor("web_search", {"query": "omnyid", "summarize": True}),
            [],
        )

    def test_strategy_variants_for_ecommerce_compare_are_real(self):
        variants = _strategy_variants_for_executor("ecommerce", {"action": "compare", "query": "best laptops"})
        self.assertEqual(
            [variant["option_id"] for variant in variants],
            ["focused_compare", "balanced_compare", "broad_compare"],
        )
        self.assertEqual(variants[0]["params_patch"]["max_products"], 3)
        self.assertEqual(variants[2]["params_patch"]["max_products"], 5)

    def test_strategy_outcome_section_has_expected_shape(self):
        section = _strategy_outcome_section(
            section_id="strategy-auto-1",
            order=15,
            executor_name="research_pipeline",
            strategy_label="Deep research",
            expected_outcome="A more comprehensive report.",
        )
        self.assertEqual(section["type"], "strategy_summary")
        self.assertEqual(section["content"]["title"], "Research Pipeline · Deep research")
        self.assertEqual(section["content"]["strategy_label"], "Deep research")
        self.assertIn("comprehensive", section["content"]["text"])

    def test_execution_outcome_section_has_expected_shape(self):
        section = _execution_outcome_section(
            section_id="execution-summary-1",
            order=17,
            executor_name="research_pipeline",
            strategy_label="Deep research",
            expected_outcome="A more comprehensive report.",
            result_summary="Delivered a synthesised report across multiple sources.",
            alignment="matched_strategy",
            alignment_reason="The run stayed within the expected envelope for the selected strategy.",
            estimated_time_seconds=4.0,
            estimated_cost_cents=0.8,
            estimated_tokens=1400,
            time_elapsed=4.2,
            cost_cents=0.81,
            tokens_used=1530,
            selection_mode="auto_selected",
        )
        self.assertEqual(section["type"], "execution_summary")
        self.assertEqual(section["content"]["alignment"], "matched_strategy")
        self.assertIn("expected envelope", section["content"]["alignment_reason"])
        self.assertEqual(section["content"]["strategy_label"], "Deep research")
        self.assertIn("research", section["content"]["title"].lower())

    def test_execution_failure_section_has_expected_shape(self):
        section = _execution_failure_section(
            section_id="execution-failure-1",
            order=18,
            executor_name="web_search",
            strategy_label="Balanced summary",
            expected_outcome="A concise summary with enough source coverage.",
            failure_kind="timeout",
            failure_reason="The selected path did not finish within the allowed execution window.",
            error_text="Step timed out after 45s.",
            estimated_time_seconds=10.0,
            estimated_cost_cents=0.3,
            estimated_tokens=1200,
            selection_mode="user_selected",
        )
        self.assertEqual(section["type"], "execution_failure")
        self.assertEqual(section["content"]["failure_kind"], "timeout")
        self.assertIn("Balanced summary", section["content"]["title"])

    def test_summarize_execution_result_data_prefers_message_and_handles_lists(self):
        self.assertEqual(
            _summarize_execution_result_data({"message": "Finished comparing three options."}),
            "Finished comparing three options.",
        )
        self.assertEqual(
            _summarize_execution_result_data([1, 2, 3]),
            "Returned 3 item(s).",
        )

    def test_evaluate_execution_alignment_detects_budget_drift(self):
        estimate = types.SimpleNamespace(
            time_seconds=5.0,
            dollar_cost_cents=1.0,
            token_cost=1000,
        )
        alignment, reason = _evaluate_execution_alignment(
            selected_estimate=estimate,
            actual_time_seconds=5.5,
            actual_cost_cents=1.6,
            actual_tokens=980,
            has_expected_outcome=True,
        )
        self.assertEqual(alignment, "drifted_budget")
        self.assertIn("cost more", reason)

    def test_evaluate_execution_alignment_marks_match_when_within_envelope(self):
        estimate = types.SimpleNamespace(
            time_seconds=5.0,
            dollar_cost_cents=1.0,
            token_cost=1000,
        )
        alignment, reason = _evaluate_execution_alignment(
            selected_estimate=estimate,
            actual_time_seconds=5.2,
            actual_cost_cents=1.1,
            actual_tokens=950,
            has_expected_outcome=True,
        )
        self.assertEqual(alignment, "matched_strategy")
        self.assertIn("within the expected envelope", reason)

    def test_extract_strategy_contract_and_failure_reason_helpers(self):
        params = {
            "_omnyid_strategy_contract": {
                "strategy_label": "Deep research",
            }
        }
        self.assertEqual(
            _extract_strategy_contract(params),
            {"strategy_label": "Deep research"},
        )
        self.assertIn("missing dependency", _failure_reason_for_kind("executor_error", "Missing dependency for pdf: reportlab"))
        self.assertIn("allowed execution window", _failure_reason_for_kind("timeout", "Timed out after 30s"))

    def test_build_retry_fallback_and_retry_plan_can_downgrade_after_timeout(self):
        variants = _strategy_variants_for_executor("research_pipeline", {"topic": "agent protocols"})
        selected = variants[2]
        fallback = _build_retry_fallback(variants, selected)
        self.assertEqual(fallback["option_id"], "standard")

        step = AgentStep(
            id="step-1",
            action_type="invoke_capability",
            capability_name="research_pipeline",
            params={
                "topic": "agent protocols",
                "depth": "deep",
                "_omnyid_strategy_contract": {
                    "strategy_label": "Deep research",
                    "retry_fallback": fallback,
                },
            },
            rationale="Research the topic deeply.",
            status="failed",
            error="Timed out after 30s",
        )
        retry_plan = _plan_retry_for_step(step)
        self.assertEqual(retry_plan["mode"], "downgraded_path")
        self.assertEqual(retry_plan["to_strategy"], "Standard research")
        self.assertEqual(retry_plan["updated_params"]["depth"], "standard")

    def test_retry_summary_section_has_expected_shape(self):
        section = _retry_summary_section(
            section_id="retry-step-1-1",
            order=19,
            executor_name="research_pipeline",
            retry_count=1,
            max_retries=3,
            mode="downgraded_path",
            source="heuristic_policy",
            title="Retrying with a safer path",
            text="OmnyID is stepping down from Deep research to Standard research.",
            from_strategy="Deep research",
            to_strategy="Standard research",
        )
        self.assertEqual(section["type"], "retry_summary")
        self.assertEqual(section["content"]["mode"], "downgraded_path")
        self.assertEqual(section["content"]["source"], "heuristic_policy")
        self.assertEqual(section["content"]["retry_count"], 1)

    def test_recommended_reflection_decision_retries_timeout_then_escalates(self):
        retry_step = AgentStep(
            id="step-timeout-retry",
            action_type="invoke_capability",
            capability_name="web_search",
            params={},
            rationale="Search the web.",
            status="failed",
            error="Timed out after 30s",
            retry_count=0,
        )
        self.assertEqual(_recommended_reflection_decision(retry_step, max_retries=2), "retry")

        escalate_step = AgentStep(
            id="step-timeout-escalate",
            action_type="invoke_capability",
            capability_name="web_search",
            params={},
            rationale="Search the web.",
            status="failed",
            error="Timed out after 30s",
            retry_count=2,
        )
        self.assertEqual(_recommended_reflection_decision(escalate_step, max_retries=2), "escalate")

    def test_recommended_reflection_decision_escalates_permissions_and_dependencies(self):
        denied_step = AgentStep(
            id="step-denied",
            action_type="invoke_capability",
            capability_name="file_ops",
            params={},
            rationale="Delete a file.",
            status="failed",
            error="Permission denied while deleting file",
        )
        self.assertEqual(_recommended_reflection_decision(denied_step, max_retries=3), "escalate")

        dependency_step = AgentStep(
            id="step-dep",
            action_type="invoke_capability",
            capability_name="doc_gen",
            params={},
            rationale="Generate a PDF.",
            status="failed",
            error="Missing dependency for pdf: reportlab",
        )
        self.assertEqual(_recommended_reflection_decision(dependency_step, max_retries=3), "escalate")

    def test_reflection_summary_and_reason_helpers_have_expected_shape(self):
        step = AgentStep(
            id="step-reflect",
            action_type="invoke_capability",
            capability_name="doc_gen",
            params={},
            rationale="Generate a PDF.",
            status="failed",
            error="Missing dependency for pdf: reportlab",
        )
        reason = _reflection_reason_for_decision(step, "escalate")
        self.assertIn("missing a required dependency", reason)
        section = _reflection_summary_section(
            section_id="reflect-step-reflect-1",
            order=19,
            executor_name="doc_gen",
            decision="escalate",
            source="heuristic_policy",
            reason=reason,
        )
        self.assertEqual(section["type"], "reflection_summary")
        self.assertEqual(section["content"]["source"], "heuristic_policy")
        self.assertIn("Next action", section["content"]["title"])

    def test_planning_guidance_from_reflections_warns_on_repeat_failures(self):
        guidance = _planning_guidance_from_reflections([
            {
                "decision": "retry",
                "source": "heuristic_policy",
                "error": "Timed out after 30s",
            },
            {
                "decision": "retry",
                "source": "heuristic_policy",
                "error": "Timeout while browsing",
            },
            {
                "decision": "escalate",
                "source": "heuristic_policy",
                "error": "Permission denied",
            },
        ])
        self.assertIn("high-latency path", guidance)
        self.assertIn("hard policy", guidance)

    def test_reasoning_guardrails_block_repeated_hard_boundary_capability(self):
        guarded = _apply_reasoning_guardrails(
            data={
                "action_type": "invoke_capability",
                "capability_name": "doc_gen",
                "params": {"type": "pdf"},
                "rationale": "Generate the PDF.",
            },
            reflection_history=[
                {
                    "executor_name": "doc_gen",
                    "decision": "escalate",
                    "source": "heuristic_policy",
                    "error": "Missing dependency for pdf: reportlab",
                }
            ],
        )
        self.assertEqual(guarded["action_type"], "escalate")
        self.assertIn("blocked by policy", guarded["rationale"])
        self.assertEqual(guarded["_omnyid_guardrail_summary"]["mode"], "blocked")

    def test_reasoning_guardrails_bias_repeat_timeout_capability_toward_faster_strategy(self):
        guarded = _apply_reasoning_guardrails(
            data={
                "action_type": "invoke_capability",
                "capability_name": "research_pipeline",
                "params": {"topic": "agent protocols"},
                "rationale": "Research the topic.",
            },
            reflection_history=[
                {
                    "executor_name": "research_pipeline",
                    "decision": "retry",
                    "source": "heuristic_policy",
                    "error": "Timed out after 30s",
                },
                {
                    "executor_name": "research_pipeline",
                    "decision": "retry",
                    "source": "heuristic_policy",
                    "error": "Timeout while browsing",
                },
            ],
        )
        self.assertTrue(guarded["params"]["_omnyid_retry_guidance"]["prefer_faster_strategy"])
        self.assertEqual(guarded["_omnyid_guardrail_summary"]["mode"], "biased_faster")

    def test_forced_strategy_candidate_prefers_fastest_option(self):
        variants = _strategy_variants_for_executor("research_pipeline", {"topic": "agent protocols"})
        candidates = []
        for index, variant in enumerate(variants):
            estimate = types.SimpleNamespace(
                time_seconds=[4.0, 7.0, 12.0][index],
                dollar_cost_cents=[0.2, 0.5, 1.1][index],
            )
            candidates.append({
                "label": variant["label"],
                "estimate": estimate,
            })
        chosen = _forced_strategy_candidate_from_params(
            candidates,
            {"_omnyid_retry_guidance": {"prefer_faster_strategy": True}},
        )
        self.assertEqual(chosen["label"], "Quick scan")

    def test_planning_guardrail_section_has_expected_shape(self):
        section = _planning_guardrail_section(
            section_id="planning-guardrail-1",
            order=11,
            mode="biased_faster",
            source="reflection_history",
            title="Planner proposal adjusted",
            text="OmnyID biased the step toward a faster path.",
            capability_name="research_pipeline",
        )
        self.assertEqual(section["type"], "planning_guardrail")
        self.assertEqual(section["content"]["mode"], "biased_faster")
        self.assertEqual(section["content"]["capability_name"], "research_pipeline")

    def test_replan_helpers_have_expected_shape(self):
        step = AgentStep(
            id="step-replan",
            action_type="invoke_capability",
            capability_name="web_search",
            params={},
            rationale="Search for sources.",
            status="failed",
            error="Search results were too shallow",
        )
        plan = _plan_replan_for_step(
            step,
            source="llm",
            reason="The current plan no longer looks like the best path forward.",
        )
        self.assertIn("Replan after web_search", plan["next_plan"])
        section = _replan_summary_section(
            section_id="replan-step-replan-1",
            order=20,
            executor_name="web_search",
            source="llm",
            title=plan["title"],
            text=plan["text"],
            next_plan=plan["next_plan"],
            constraints=plan["constraints"],
        )
        self.assertEqual(section["type"], "replan_summary")
        self.assertEqual(section["content"]["source"], "llm")
        self.assertIn("web_search", section["content"]["next_plan"])
        self.assertIn("web_search", plan["constraints"]["avoid_capabilities"])

    def test_reasoning_guardrails_respect_replan_constraints(self):
        self.assertTrue(
            _capability_blocked_by_replan_constraints(
                "web_search",
                {"avoid_capabilities": ["web_search"]},
            )
        )
        guarded = _apply_reasoning_guardrails(
            data={
                "action_type": "invoke_capability",
                "capability_name": "web_search",
                "params": {"query": "agent protocols"},
                "rationale": "Search again.",
            },
            reflection_history=[],
            replan_constraints={"avoid_capabilities": ["web_search"]},
        )
        self.assertEqual(guarded["action_type"], "escalate")
        self.assertEqual(guarded["_omnyid_guardrail_summary"]["source"], "replan_constraints")


class _FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"http {self.status_code}")


class _FakeClient:
    def __init__(self):
        self.calls = []

    async def get(self, url, headers=None, **kwargs):
        del headers, kwargs
        self.calls.append(("GET", url))
        if url.endswith("/user/agent-preferences"):
            return _FakeResponse(
                200,
                {
                    "optimization_mode": "balanced",
                    "auto_confirm_threshold_cents": 5.0,
                    "show_cost_estimates": True,
                },
            )
        if url.endswith("/agent/lora-confidence"):
            return _FakeResponse(200, {"score": 0.55})
        if url.endswith("/user/llm-config"):
            return _FakeResponse(
                200,
                {
                    "backend": "hosted",
                    "provider": "anthropic",
                    "model": "claude-haiku-4-5-20251001",
                    "monthly_budget_cents": 10000,
                    "usage_cents_current_month": 0,
                },
            )
        return _FakeResponse(404, {})


class _FakeAgentRuntime:
    def __init__(self):
        self.agent_id = "agent:test@omnyid.local"
        self.url = "https://api.omnyid.test"
        self.client = _FakeClient()
        self._capabilities = {}
        self.sent_messages = []

    def _auth_headers(self):
        return {"Authorization": "Bearer test"}

    async def send(self, msg):
        self.sent_messages.append(msg)
        return {"ok": True}


class _StaticCostModel:
    provider = "anthropic"
    model = "claude-haiku-4-5-20251001"
    budget_remaining = 10000.0

    def format_estimate(self, estimate):
        return f"{estimate.strategy_label} via {estimate.model} in ~{estimate.time_seconds:.0f}s"


class _DummyExecutor:
    name = "dummy_executor"
    version = "1.0"

    async def estimate_cost(self, params, ctx):
        del params, ctx
        return types.SimpleNamespace(
            strategy_label="tool_call",
            token_cost=120,
            dollar_cost_cents=1.25,
            time_seconds=2.0,
            confidence=0.9,
            rationale="A lightweight local dummy executor run.",
            provider="anthropic",
            model="claude-haiku-4-5-20251001",
            compute_note="test harness",
        )

    async def execute(self, params, ctx):
        await ctx.emit_section(
            {
                "id": "dummy-progress",
                "type": "progress",
                "order": 200,
                "content": {"text": f"Dummy executor handled {params.get('query', 'work')}", "pct": 72},
                "status": "streaming",
            }
        )
        await asyncio.sleep(0)
        return ExecutionResult(
            success=True,
            data={"summary": f"dummy result for {params.get('query', 'work')}"},
            tokens_used=140,
            cost_cents=1.1,
            time_elapsed=1.8,
        )

    def input_schema(self):
        return {"type": "object", "properties": {"query": {"type": "string"}}}

    def output_schema(self):
        return {"type": "object", "properties": {"summary": {"type": "string"}}}


class _ScriptedMasterAgent(MasterAgent):
    def __init__(self, *args, llm_responses=None, **kwargs):
        super().__init__(*args, **kwargs)
        self._llm_responses = list(llm_responses or [])

    async def _llm_call(self, system: str, user: str) -> str:
        del system, user
        if not self._llm_responses:
            raise AssertionError("No scripted LLM response left for this test")
        return self._llm_responses.pop(0)


class MasterAgentRunFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_run_streams_generative_card_and_normalized_result(self):
        agent = _FakeAgentRuntime()
        registry = ExecutorRegistry()
        registry.register(_DummyExecutor())
        master = _ScriptedMasterAgent(
            agent=agent,
            llm_client=object(),
            model="claude-haiku-4-5-20251001",
            executor_registry=registry,
            cost_model=_StaticCostModel(),
            optimization_mode="balanced",
            llm_responses=[
                (
                    '{"intent_type":"research","preferred_view":"generative_card",'
                    '"needs_confirmation":false,"clarification":null,"is_ambiguous":false,'
                    '"confidence":0.96,"ambiguities":[]}'
                ),
                (
                    '{"action_type":"invoke_capability","capability_name":"dummy_executor",'
                    '"params":{"query":"plan my day"},"rationale":"Run the dummy executor.",'
                    '"progress_message":"Running dummy executor","progress_pct":34}'
                ),
                "done",
            ],
        )

        result = await master.run("Plan my day with a dummy executor")

        self.assertEqual(result.status, "done")
        self.assertEqual(result.preferred_view, "generative_card")
        self.assertTrue(result.card_id)

        sent = [getattr(msg, "kwargs", {}) for msg in agent.sent_messages]
        self.assertGreaterEqual(len(sent), 4)

        generative_cards = [msg for msg in sent if msg.get("type") == "generative_card"]
        self.assertEqual(len(generative_cards), 1)
        self.assertEqual(generative_cards[0].get("content", {}).get("card_id"), result.card_id)

        updates = [msg for msg in sent if msg.get("type") == "card_section_update"]
        self.assertTrue(
            any(msg.get("content", {}).get("section", {}).get("type") == "cost_estimate" for msg in updates)
        )
        self.assertTrue(
            any(msg.get("content", {}).get("section", {}).get("type") == "execution_summary" for msg in updates)
        )
        self.assertTrue(
            any(msg.get("content", {}).get("section", {}).get("type") == "final_answer" for msg in updates)
        )

        final_results = [
            msg for msg in sent if msg.get("type") == "agent" and msg.get("subtype") == "result"
        ]
        self.assertEqual(len(final_results), 1)
        self.assertEqual(final_results[0].get("metadata", {}).get("legacy_type"), "agent_result")
        self.assertIn("summary", final_results[0].get("content", {}).get("final_answer", ""))


if __name__ == "__main__":
    unittest.main()
