import importlib.util
import pathlib
import sys
import types
import unittest
from importlib.machinery import SourceFileLoader


ROOT = pathlib.Path(__file__).resolve().parents[2]
RUNNER_TEMPLATE_PATH = ROOT / "runtime-templates" / "python-runner-chat" / "runner_chat.py.tpl"


POLICY_STUB = types.ModuleType("policy")
POLICY_STUB.ensure_runtime_shape = lambda policy: dict(policy or {})
POLICY_STUB.load_runtime_policy = lambda path: {}
POLICY_STUB.load_starter_templates = lambda path: []
POLICY_STUB.read_json = lambda path, fallback: fallback
POLICY_STUB.write_json = lambda path, payload: None
sys.modules["policy"] = POLICY_STUB

TOOL_REGISTRY_STUB = types.ModuleType("tool_registry")
TOOL_REGISTRY_STUB.describe_tools = lambda policy: []
TOOL_REGISTRY_STUB.execute_policy_checked_tools = lambda content, policy: ([], [])
sys.modules["tool_registry"] = TOOL_REGISTRY_STUB

AFP_STUB = types.ModuleType("afp")


class _StubMasterAgent:
    def __init__(self, **kwargs):
        self.kwargs = kwargs
        self.runs = []

    async def run(self, intent):
        self.runs.append(intent)
        return types.SimpleNamespace(
            status="done",
            final_answer=f"completed:{intent}",
            steps_taken=2,
        )


class _StubAgentClass:
    pass


AFP_STUB.MasterAgent = _StubMasterAgent
AFP_STUB.build_default_registry = lambda: {"registry": "stub"}
AFP_STUB.Agent = _StubAgentClass
sys.modules["afp"] = AFP_STUB

SPEC = importlib.util.spec_from_loader(
    "runner_chat_template_under_test",
    SourceFileLoader("runner_chat_template_under_test", str(RUNNER_TEMPLATE_PATH)),
)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = MODULE
SPEC.loader.exec_module(MODULE)


class _FakeResponse:
    def __init__(self, status_code=200, payload=None):
        self.status_code = status_code
        self._payload = payload if payload is not None else {}

    def json(self):
        return self._payload


class _FakeClient:
    def __init__(self, tasks):
        self.tasks = [dict(task) for task in tasks]
        self.posts = []

    async def get(self, url, params=None, headers=None):
        del headers
        if url.endswith("/agent/tasks"):
            assert params == {"status": "pending", "limit": 5}
            pending = [
                task for task in self.tasks if task.get("status", "pending") == "pending"
            ]
            return _FakeResponse(200, {"tasks": pending})
        raise AssertionError(f"Unexpected GET {url}")

    async def post(self, url, json=None, headers=None):
        del headers
        self.posts.append((url, json))
        if "/agent/tasks/" in url and url.endswith("/complete"):
            task_id = url.rsplit("/", 2)[-2]
            for task in self.tasks:
                if task.get("id") == task_id:
                    task["status"] = "completed"
                    task["result"] = (json or {}).get("result")
                    break
        return _FakeResponse(200, {"ok": True})


class _FakeAgent:
    def __init__(self, tasks):
        self.agent_id = "agent:runner@omnyid.local"
        self.client = _FakeClient(tasks)

    def _auth_headers(self):
        return {"Authorization": "Bearer test"}


class RunnerTemplateFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_process_pending_tasks_once_posts_completion_payload(self):
        agent = _FakeAgent(
            [
                {
                    "id": "task-1",
                    "intent": "Plan my day",
                    "priority": "normal",
                    "status": "pending",
                },
                {
                    "id": "task-2",
                    "content": {"intent": "Summarize my notes"},
                    "priority": "high",
                    "status": "pending",
                },
                {"id": "task-ignored", "content": {}, "priority": "low"},
            ]
        )
        master = _StubMasterAgent()

        completions = await MODULE._process_pending_tasks_once(
            agent=agent,
            master=master,
            api_base="https://api.omnyid.test",
        )

        self.assertEqual(master.runs, ["Plan my day", "Summarize my notes"])
        self.assertEqual(len(completions), 2)
        self.assertEqual(completions[0]["task_id"], "task-1")
        self.assertEqual(completions[0]["result"]["result"]["status"], "done")
        self.assertEqual(
            agent.client.posts,
            [
                (
                    "https://api.omnyid.test/agent/tasks/task-1/complete",
                    {
                        "result": {
                            "status": "done",
                            "final_answer": "completed:Plan my day",
                            "steps_taken": 2,
                        }
                    },
                ),
                (
                    "https://api.omnyid.test/agent/tasks/task-2/complete",
                    {
                        "result": {
                            "status": "done",
                            "final_answer": "completed:Summarize my notes",
                            "steps_taken": 2,
                        }
                    },
                ),
            ],
        )

    async def test_process_pending_tasks_once_does_not_rerun_completed_tasks(self):
        agent = _FakeAgent(
            [
                {
                    "id": "task-1",
                    "intent": "Plan my day",
                    "priority": "normal",
                    "status": "pending",
                }
            ]
        )
        master = _StubMasterAgent()

        first = await MODULE._process_pending_tasks_once(
            agent=agent,
            master=master,
            api_base="https://api.omnyid.test",
        )
        second = await MODULE._process_pending_tasks_once(
            agent=agent,
            master=master,
            api_base="https://api.omnyid.test",
        )

        self.assertEqual(len(first), 1)
        self.assertEqual(second, [])
        self.assertEqual(master.runs, ["Plan my day"])
        self.assertEqual(len(agent.client.posts), 1)
        self.assertEqual(agent.client.tasks[0]["status"], "completed")
        self.assertEqual(
            agent.client.tasks[0]["result"],
            {
                "status": "done",
                "final_answer": "completed:Plan my day",
                "steps_taken": 2,
            },
        )

    def test_build_master_agent_for_runner_uses_live_prefs_and_config(self):
        sys.modules["afp"] = AFP_STUB
        runtime_policy = {
            "review_required_capabilities": ["payments"],
            "model_policy": {"optimization_mode": "cost"},
        }
        llm_config = {
            "provider": "anthropic",
            "model": "claude-haiku-4-5-20251001",
        }
        prefs = {"optimization_mode": "speed"}
        agent = _FakeAgent([])

        master = MODULE._build_master_agent_for_runner(
            agent=agent,
            runtime_policy=runtime_policy,
            llm_config=llm_config,
            remote_prefs=prefs,
        )

        self.assertIsInstance(master, _StubMasterAgent)
        self.assertEqual(master.kwargs["agent"], agent)
        self.assertEqual(master.kwargs["model"], "claude-haiku-4-5-20251001")
        self.assertEqual(master.kwargs["optimization_mode"], "speed")
        self.assertEqual(
            master.kwargs["execution_policy"]["review_required_capabilities"],
            ["payments"],
        )


if __name__ == "__main__":
    unittest.main()
