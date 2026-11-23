import asyncio
import importlib.util
import json
import os
import signal
import sys
import threading
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from policy import ensure_runtime_shape, load_runtime_policy, load_starter_templates, read_json, write_json
from tool_registry import describe_tools, execute_policy_checked_tools

try:
    from event_bus import dispatch_loop, dlq_drain_loop, make_event, publish, subscribe
    _EVENT_BUS_AVAILABLE = True
except ImportError:
    _EVENT_BUS_AVAILABLE = False


RUNNING = True
WORKSPACE_ROOT = Path("/workspace")
STATE_PATH = WORKSPACE_ROOT / "state.json"
PROFILE_PATH = WORKSPACE_ROOT / "agent_profile.json"
POLICY_PATH = Path(os.getenv("OMNYID_RUNNER_POLICY_PATH", "/workspace/runtime_policy.json"))
STARTER_TEMPLATES_PATH = Path(
    os.getenv("OMNYID_STARTER_TEMPLATES_PATH", "/workspace/starter_templates.json")
)
CHAT_PORT = int(os.getenv("OMNYID_CHAT_PORT", "7860"))


def stop_handler(signum, frame):
    del signum, frame
    global RUNNING
    RUNNING = False


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def bootstrap_state():
    profile = read_json(PROFILE_PATH, {})
    policy = ensure_runtime_shape(load_runtime_policy(POLICY_PATH))
    starter_templates = load_starter_templates(STARTER_TEMPLATES_PATH)
    default_template_id = profile.get("default_template_id") or (
        starter_templates[0]["id"] if starter_templates else None
    )
    active_template = next(
        (template for template in starter_templates if template.get("id") == default_template_id),
        starter_templates[0] if starter_templates else {},
    )
    state = {
        "started_at": now_iso(),
        "framework": os.getenv("OMNYID_FRAMEWORK"),
        "gui": os.getenv("OMNYID_FRAMEWORK_GUI"),
        "owner_user_id": os.getenv("OMNYID_OWNER_USER_ID"),
        "owner_email": os.getenv("OMNYID_OWNER_EMAIL"),
        "api_base": os.getenv("OMNYID_API_BASE"),
        "agent_id": os.getenv("AGENT_ID") or profile.get("agent_id"),
        "private_key_path": os.getenv("PRIVATE_KEY_PATH"),
        "ollama_host": os.getenv("OLLAMA_HOST"),
        "primary_agent_id": profile.get("agent_id"),
        "toolchain": [
            "requests",
            "beautifulsoup4",
            "playwright",
            "stripe",
            "google-api-python-client",
            "ollama",
            "chromadb",
            "duckdb",
        ],
        "policy": policy,
        "channels": policy.get("channel_policy", {}),
        "tools": describe_tools(policy),
        "templates": starter_templates,
        "active_template_id": active_template.get("id"),
        "messages": [
            {
                "role": "system",
                "content": "OmnyID private runner booted. This workspace stays isolated per user and treats the website as a control plane, not a shared data plane.",
                "timestamp": now_iso(),
            },
            {
                "role": "assistant",
                "content": "Ready. Pick a starter template or tell me what you want help with next. I will log tool traces, keep a prompt history, and queue sensitive actions for review instead of acting silently.",
                "timestamp": now_iso(),
            },
        ],
        "events": [
            {
                "event": "runtime_boot",
                "timestamp": now_iso(),
                "summary": "Private Python runner and agent IDE surface started.",
            }
        ],
        "logs": [
            {
                "timestamp": now_iso(),
                "level": "info",
                "message": "Runner started with a private per-user policy boundary.",
            }
        ],
        "tool_traces": [],
        "prompt_versions": [
            {
                "id": "prompt-v1",
                "label": "Default starter prompt",
                "template_id": active_template.get("id"),
                "system_prompt": active_template.get("system_prompt", ""),
                "created_at": now_iso(),
            }
        ],
        "saved_tests": [],
        "review_queue": [],
        "last_good_run": {
            "timestamp": now_iso(),
            "summary": "Runner booted successfully.",
        },
        "run_counters": {
            "turns": 0,
            "replays": 0,
        },
    }
    write_json(STATE_PATH, state)


def append_log(state, level, message):
    logs = state.setdefault("logs", [])
    logs.append(
        {
            "timestamp": now_iso(),
            "level": level,
            "message": message,
        }
    )


def append_message(state, role, content):
    state.setdefault("messages", []).append(
        {
            "role": role,
            "content": content,
            "timestamp": now_iso(),
        }
    )


def persist_turn(content, replay=False):
    state = read_json(STATE_PATH, {})
    policy = ensure_runtime_shape(load_runtime_policy(POLICY_PATH))
    templates = load_starter_templates(STARTER_TEMPLATES_PATH)
    active_template = next(
        (
            template
            for template in templates
            if template.get("id") == state.get("active_template_id")
        ),
        templates[0] if templates else {},
    )

    append_message(state, "user", content)
    append_log(state, "info", "User turn received.")
    state.setdefault("events", []).append(
        {
            "event": "command_received",
            "timestamp": now_iso(),
            "summary": content[:140],
        }
    )
    state.setdefault("run_counters", {}).setdefault("turns", 0)
    state["run_counters"]["turns"] += 1
    if replay:
        state["run_counters"]["replays"] = state["run_counters"].get("replays", 0) + 1

    tool_traces, approvals = execute_policy_checked_tools(content, policy)
    for trace in tool_traces:
        trace["timestamp"] = now_iso()
        state.setdefault("tool_traces", []).append(trace)
        if trace["status"] == "allowed":
            append_log(state, "info", "Tool planned: " + trace["tool"])
        else:
            append_log(
                state,
                "warn",
                "Tool blocked: " + trace["tool"] + " (" + str(trace.get("blocked_reason")) + ")",
            )

    for approval in approvals:
        approval["id"] = "review-" + now_iso()
        approval["created_at"] = now_iso()
        state.setdefault("review_queue", []).append(approval)

    state.setdefault("saved_tests", []).append(
        {
            "id": "test-" + now_iso(),
            "input": content,
            "template_id": active_template.get("id"),
            "created_at": now_iso(),
        }
    )
    state["saved_tests"] = state["saved_tests"][-8:]

    assistant_reply = render_assistant_reply(content, active_template, tool_traces, approvals)
    append_message(state, "assistant", assistant_reply)
    append_log(state, "info", "Assistant reply generated.")
    state["last_good_run"] = {
        "timestamp": now_iso(),
        "summary": assistant_reply.splitlines()[0][:160],
    }
    write_json(STATE_PATH, state)
    return state


def render_assistant_reply(content, active_template, tool_traces, approvals):
    template_name = active_template.get("name", "Private Runner")
    bullets = []
    lowered = content.lower()

    if active_template.get("id") == "student_day_planner" or "study" in lowered or "class" in lowered:
        bullets = [
            "1. Identify the fixed commitments first, then protect two focused work blocks.",
            "2. Keep one low-energy backup task ready so the day does not collapse after a slip.",
            "3. End with a short reset so tomorrow starts with fewer open loops.",
        ]
    elif active_template.get("id") == "appointment_assistant" or "appointment" in lowered or "booking" in lowered:
        bullets = [
            "1. Confirm the time, location, and anything you need to bring.",
            "2. Draft the reminder or reschedule steps before touching a live booking flow.",
            "3. Queue any payment or booking action for review instead of auto-executing it.",
        ]
    else:
        bullets = [
            "1. Clarify the goal, the deadline, and the minimum useful output.",
            "2. Decide whether this needs web research, local notes, or a follow-up question.",
            "3. Capture the next action so the task is easy to replay later.",
        ]

    trace_summary = "No tools were needed for this turn."
    if tool_traces:
        trace_summary = "Tool plan: " + ", ".join(
            trace["tool"] + " (" + trace["status"] + ")" for trace in tool_traces
        )

    approval_summary = (
        "Sensitive action queued for review."
        if approvals
        else "No human review gate was triggered on this turn."
    )

    return "\n".join(
        [
            template_name + " reply",
            "",
            trace_summary,
            approval_summary,
            "",
            *bullets,
        ]
    )


INDEX_HTML = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OmnyID Private Python Runner</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; background: #f9f9f7; color: #1a1c1b; margin: 0; }
    .shell { max-width: 1180px; margin: 0 auto; padding: 24px 20px 40px; }
    .panel { background: #ffffff; border: 1px solid #c3c6d1; border-radius: 24px; padding: 20px; box-shadow: 0 12px 32px rgba(26, 28, 27, 0.06); }
    .kicker { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #31568e; }
    .title { font-size: 30px; margin: 8px 0 10px; }
    .sub { color: #434750; line-height: 1.7; margin-bottom: 18px; }
    .grid { display: grid; gap: 16px; }
    .grid.two { grid-template-columns: 1.1fr 0.9fr; }
    .grid.three { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .meta-card, .stack-card { background: #f4f4f2; border-radius: 16px; padding: 14px; }
    .meta-card span, .stack-card span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #737781; }
    .meta-card strong, .stack-card strong { display: block; margin-top: 8px; }
    .log, .trace, .history, .queue { background: #f4f4f2; border-radius: 16px; padding: 16px; min-height: 180px; max-height: 420px; overflow: auto; }
    .msg { padding: 12px 14px; border-radius: 14px; margin-bottom: 10px; white-space: pre-wrap; }
    .msg.user { background: #d6e3ff; }
    .msg.assistant { background: #d4e8d3; }
    .msg.system { background: #e8e8e6; }
    form { margin-top: 16px; display: flex; gap: 12px; flex-wrap: wrap; }
    textarea { flex: 1 1 520px; min-height: 96px; border-radius: 16px; border: 1px solid #c3c6d1; padding: 14px; font: inherit; background: #ffffff; }
    button { border: 0; border-radius: 16px; background: #31568e; color: white; font-weight: 700; padding: 0 22px; min-height: 50px; cursor: pointer; }
    .secondary { background: #526352; }
    .small { margin-top: 12px; color: #434750; font-size: 14px; line-height: 1.7; }
    .tag { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; background: #ffffff; padding: 6px 10px; font-size: 11px; margin: 4px 6px 0 0; }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; background: #ffffff; padding: 6px 10px; font-size: 11px; margin: 4px 6px 0 0; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    @media (max-width: 900px) {
      .grid.two, .grid.three { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="panel">
      <div class="kicker">OmnyID Runtime</div>
      <h1 class="title">Private Python runner + chat window</h1>
      <p class="sub">This is a per-user agent IDE surface for natural-language workflows like planning the day, researching a topic, or preparing a booking flow. The runtime logs traces, keeps a prompt history, and queues sensitive actions for review instead of acting silently.</p>
      <div id="meta" class="grid three"></div>
      <div class="grid two" style="margin-top:16px;">
        <div>
          <div id="messages" class="log"></div>
          <form id="chat-form">
            <textarea id="prompt" placeholder="Tell your private runner what to do next..."></textarea>
            <button type="submit">Send command</button>
            <button id="replay-last" type="button" class="secondary">Replay last test input</button>
          </form>
        </div>
        <div class="grid">
          <div class="stack-card">
            <span>Channels</span>
            <div id="channels" class="small"></div>
          </div>
          <div class="stack-card">
            <span>Tools</span>
            <div id="tools" class="small"></div>
          </div>
          <div class="stack-card">
            <span>Templates</span>
            <div id="templates" class="small"></div>
          </div>
        </div>
      </div>
      <div class="grid two" style="margin-top:16px;">
        <div class="trace">
          <div class="kicker" style="color:#526352;">Tool trace timeline</div>
          <div id="tool-traces" class="small">No tool traces yet.</div>
        </div>
        <div class="history">
          <div class="kicker" style="color:#526352;">Prompt history and tests</div>
          <div id="prompt-history" class="small">No prompt history yet.</div>
        </div>
      </div>
      <div class="grid two" style="margin-top:16px;">
        <div class="queue">
          <div class="kicker" style="color:#526352;">Human review queue</div>
          <div id="review-queue" class="small">No review items queued.</div>
        </div>
        <div class="queue">
          <div class="kicker" style="color:#526352;">Runtime logs</div>
          <div id="runtime-logs" class="small">No runtime logs yet.</div>
        </div>
      </div>
      <p class="small">OmnyID Cloud should treat this runtime as a private data plane. The control plane may monitor health and status, but not casually read or mix runtime state across users.</p>
    </section>
  </main>
  <script>
    async function loadState() {
      const response = await fetch('/state');
      return response.json();
    }
    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    function renderTags(targetId, values, activeKey) {
      const target = document.getElementById(targetId);
      if (!target) return;
      const items = Array.isArray(values) ? values : [];
      if (!items.length) {
        target.innerHTML = '<span class="pill">None yet</span>';
        return;
      }
      target.innerHTML = items.map(function (item) {
        if (typeof item === 'string') {
          return '<span class="pill">' + escapeHtml(item) + '</span>';
        }
        const active = activeKey && item.id === activeKey;
        return '<span class="pill"' + (active ? ' style="border:1px solid #31568e;"' : '') + '>' +
          escapeHtml(item.name || item.id || 'item') + '</span>';
      }).join('');
    }
    function renderState(state) {
      const meta = document.getElementById('meta');
      const messages = document.getElementById('messages');
      const toolTraces = document.getElementById('tool-traces');
      const promptHistory = document.getElementById('prompt-history');
      const reviewQueue = document.getElementById('review-queue');
      const runtimeLogs = document.getElementById('runtime-logs');
      meta.innerHTML = [
        ['Owner', state.owner_email || 'unknown'],
        ['Primary Agent', state.primary_agent_id || state.agent_id || 'not set'],
        ['Model mode', state.policy && state.policy.model_policy ? state.policy.model_policy.mode : 'omnyid_managed_default'],
        ['Last good run', state.last_good_run && state.last_good_run.timestamp ? state.last_good_run.timestamp : 'not yet'],
        ['Private key path', state.private_key_path || 'not set'],
        ['Ollama host', state.ollama_host || 'not set']
      ].map(function (item) {
        return '<div class="meta-card"><span>' + escapeHtml(item[0]) + '</span><strong class="mono">' + escapeHtml(item[1]) + '</strong></div>';
      }).join('');
      messages.innerHTML = (state.messages || []).slice(-10).map(function (message) {
        const klass = message.role || 'system';
        return '<div class="msg ' + escapeHtml(klass) + '"><strong>' + escapeHtml(klass) + '</strong><br>' + escapeHtml(message.content || '') + '</div>';
      }).join('');
      messages.scrollTop = messages.scrollHeight;
      renderTags('channels', Object.keys(state.channels || {}).filter(function (name) { return state.channels[name] && state.channels[name].enabled; }));
      renderTags('tools', (state.tools || []).filter(function (entry) { return entry.enabled; }));
      renderTags('templates', state.templates || [], state.active_template_id);
      toolTraces.innerHTML = (state.tool_traces || []).slice(-8).map(function (trace) {
        return '<div class="tag mono">' + escapeHtml(trace.tool) + ' - ' + escapeHtml(trace.status) + (trace.host ? ' - ' + escapeHtml(trace.host) : '') + '</div>';
      }).join('') || 'No tool traces yet.';
      promptHistory.innerHTML = [
        '<div class="mono">Prompt versions: ' + escapeHtml(String((state.prompt_versions || []).length)) + '</div>',
        (state.saved_tests || []).slice(-5).map(function (entry) {
          return '<div class="tag mono">' + escapeHtml(entry.input || '') + '</div>';
        }).join('')
      ].join('');
      reviewQueue.innerHTML = (state.review_queue || []).slice(-5).map(function (entry) {
        return '<div class="tag mono">' + escapeHtml(entry.tool || 'review') + ' - ' + escapeHtml(entry.reason || entry.status || 'queued') + '</div>';
      }).join('') || 'No review items queued.';
      runtimeLogs.innerHTML = (state.logs || []).slice(-8).map(function (entry) {
        return '<div class="tag mono">' + escapeHtml(entry.level || 'info') + ' - ' + escapeHtml(entry.message || '') + '</div>';
      }).join('') || 'No runtime logs yet.';
    }
    document.getElementById('chat-form').addEventListener('submit', async function (event) {
      event.preventDefault();
      const prompt = document.getElementById('prompt');
      const content = prompt.value.trim();
      if (!content) return;
      await fetch('/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content: content })
      });
      prompt.value = '';
      renderState(await loadState());
    });
    document.getElementById('replay-last').addEventListener('click', async function () {
      await fetch('/replay', { method: 'POST' });
      renderState(await loadState());
    });
    loadState().then(renderState);
    setInterval(async function () {
      renderState(await loadState());
    }, 5000);
  </script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def _json_response(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/":
            body = INDEX_HTML.encode("utf-8")
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/state":
            self._json_response(read_json(STATE_PATH, {}))
            return
        if self.path == "/healthz":
            self._json_response({"status": "ok", "service": "omnyid-python-runner"})
            return
        self._json_response({"error": "not_found"}, status=HTTPStatus.NOT_FOUND)

    def do_POST(self):
        if self.path == "/replay":
            state = read_json(STATE_PATH, {})
            saved_tests = state.get("saved_tests", [])
            if not saved_tests:
                self._json_response({"error": "no_saved_tests"}, status=HTTPStatus.BAD_REQUEST)
                return
            latest = saved_tests[-1]
            next_state = persist_turn(latest.get("input", ""), replay=True)
            self._json_response({"status": "replayed", "state": next_state})
            return

        if self.path == "/template":
            content_length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(content_length) or b"{}")
            template_id = str(payload.get("template_id", "")).strip()
            state = read_json(STATE_PATH, {})
            starter_templates = load_starter_templates(STARTER_TEMPLATES_PATH)
            if not any(template.get("id") == template_id for template in starter_templates):
                self._json_response({"error": "template_not_found"}, status=HTTPStatus.BAD_REQUEST)
                return
            state["active_template_id"] = template_id
            append_log(state, "info", "Active template changed to " + template_id)
            write_json(STATE_PATH, state)
            self._json_response({"status": "ok", "template_id": template_id})
            return

        if self.path != "/chat":
            self._json_response({"error": "not_found"}, status=HTTPStatus.NOT_FOUND)
            return
        content_length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(content_length) or b"{}")
        content = str(payload.get("content", "")).strip()
        if not content:
            self._json_response({"error": "content_required"}, status=HTTPStatus.BAD_REQUEST)
            return
        next_state = persist_turn(content)
        self._json_response({"status": "queued", "state": next_state})

    def log_message(self, fmt, *args):
        sys.stdout.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), fmt % args))
        sys.stdout.flush()


def _run_http_server_blocking():
    """Run the legacy ThreadingHTTPServer in a daemon thread (backward compat)."""
    server = ThreadingHTTPServer(("0.0.0.0", CHAT_PORT), Handler)
    server.timeout = 1
    while RUNNING:
        server.handle_request()


def _load_user_capability_handlers(agent):
    """Import /workspace/user_capabilities.py and register its @agent.capability() handlers."""
    user_caps_path = WORKSPACE_ROOT / "user_capabilities.py"
    if not user_caps_path.exists():
        return
    try:
        spec = importlib.util.spec_from_file_location("user_capabilities", user_caps_path)
        mod = importlib.util.module_from_spec(spec)
        mod.agent = agent  # expose the Agent instance to the user module
        spec.loader.exec_module(mod)
    except Exception as exc:
        print(f"[runner] Warning: failed to load user_capabilities.py: {exc}", flush=True)


def _register_executor_capability_descriptors():
    """
    Publish executor-backed capability descriptors for discovery.
    Execution still routes through MasterAgent; this is for visibility and schema sharing.
    """
    try:
        from afp import build_default_registry
        from capability_registry import register_from_executor, save_capabilities_json

        registry = build_default_registry()
        for name, _, _ in registry.list_all():
            executor = registry.get(name)
            if executor is not None:
                register_from_executor(executor)
        save_capabilities_json()
    except Exception as exc:
        print(f"[runner] Warning: failed to register executor capability descriptors: {exc}", flush=True)


async def _fetch_runner_llm_config(agent):
    """Read the user's current /user/llm-config, with env/policy-safe fallbacks."""
    try:
        response = await agent.client.get(
            f"{agent.url}/user/llm-config",
            headers=agent._auth_headers(),
        )
        if response.status_code == 200:
            payload = response.json()
            if isinstance(payload, dict):
                return payload
    except Exception as exc:
        print(f"[runner] Warning: failed to fetch /user/llm-config: {exc}", flush=True)

    return {}


async def _fetch_runner_agent_preferences(agent):
    """Read the user's current /user/agent-preferences, with graceful fallback."""
    try:
        response = await agent.client.get(
            f"{agent.url}/user/agent-preferences",
            headers=agent._auth_headers(),
        )
        if response.status_code == 200:
            payload = response.json()
            if isinstance(payload, dict):
                return payload
    except Exception as exc:
        print(f"[runner] Warning: failed to fetch /user/agent-preferences: {exc}", flush=True)

    return {}


def _effective_runtime_llm_config(runtime_policy, remote_config):
    """Merge server-backed LLM config with runtime fallbacks for hosted/private runner use."""
    remote_config = dict(remote_config or {})
    model_policy = ensure_runtime_shape(runtime_policy).get("model_policy", {})
    backend = str(remote_config.get("backend") or model_policy.get("backend") or "hosted")
    provider = str(remote_config.get("provider") or os.getenv("OMNYID_LLM_PROVIDER") or "anthropic")
    model = str(
        remote_config.get("model")
        or os.getenv("OMNYID_LLM_MODEL")
        or os.getenv("OPENAI_MODEL")
        or "claude-haiku-4-5-20251001"
    )
    monthly_budget_cents = float(
        remote_config.get("monthly_budget_cents")
        or int(float(model_policy.get("monthly_spend_cap_usd", 25.0)) * 100)
    )
    usage_cents_current_month = float(remote_config.get("usage_cents_current_month") or 0)
    ollama_url = (
        remote_config.get("ollama_url")
        or os.getenv("OLLAMA_HOST")
        or "http://host.docker.internal:11434"
    )
    return {
        "backend": backend,
        "provider": provider,
        "model": model,
        "monthly_budget_cents": monthly_budget_cents,
        "usage_cents_current_month": usage_cents_current_month,
        "ollama_url": ollama_url,
    }


def _resolve_runner_optimization_mode(runtime_policy, remote_prefs):
    model_policy = ensure_runtime_shape(runtime_policy).get("model_policy", {})
    mode = (
        (remote_prefs or {}).get("optimization_mode")
        or model_policy.get("optimization_mode")
        or os.getenv("OMNYID_OPTIMIZATION_MODE")
        or "balanced"
    )
    mode = str(mode).strip().lower()
    return mode if mode in {"speed", "cost", "balanced"} else "balanced"


def _build_static_failure_llm(reason):
    """Return an OpenAI-shaped stub client that makes MasterAgent fail closed."""
    message = (
        '{"action_type":"escalate","capability_name":null,"params":{},'
        f'"rationale":"{reason.replace(chr(34), chr(39))}","progress_message":"LLM unavailable","progress_pct":0}}'
    )

    class _ResponseMessage:
        content = message

    class _Choice:
        message = _ResponseMessage()

    class _Response:
        choices = [_Choice()]

    class _Completions:
        def create(self, **kwargs):
            del kwargs
            return _Response()

    class _Chat:
        completions = _Completions()

    class _Client:
        chat = _Chat()

    return _Client()


def _build_runner_llm_client(llm_config):
    """Create a provider-appropriate client using env-backed secrets only."""
    backend = str(llm_config.get("backend") or "").lower()
    provider = str(llm_config.get("provider") or "").lower()
    model = str(llm_config.get("model") or "")
    if backend == "ollama" or provider == "ollama":
        try:
            from openai import OpenAI

            ollama_url = str(llm_config.get("ollama_url") or os.getenv("OLLAMA_HOST") or "").rstrip("/")
            if not ollama_url:
                return _build_static_failure_llm("Ollama host is not configured for this runner.")
            return OpenAI(base_url=f"{ollama_url}/v1", api_key=os.getenv("OLLAMA_API_KEY", "ollama"))
        except Exception as exc:
            return _build_static_failure_llm(f"Ollama client unavailable: {exc}")

    if provider in {"openai", "runpod", "byok"}:
        try:
            from openai import OpenAI

            api_key = os.getenv("OPENAI_API_KEY")
            if not api_key:
                return _build_static_failure_llm(
                    f"{provider} model access is configured for {model}, but OPENAI_API_KEY is missing."
                )
            base_url = (
                os.getenv("OMNYID_LLM_BASE_URL")
                or os.getenv("RUNPOD_OPENAI_BASE_URL")
                or None
            )
            kwargs = {"api_key": api_key}
            if base_url:
                kwargs["base_url"] = base_url
            return OpenAI(**kwargs)
        except Exception as exc:
            return _build_static_failure_llm(f"OpenAI-compatible client unavailable: {exc}")

    try:
        import anthropic

        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            return _build_static_failure_llm(
                f"Anthropic model access is configured for {model}, but ANTHROPIC_API_KEY is missing."
            )
        return anthropic.Anthropic(api_key=api_key)
    except Exception as exc:
        return _build_static_failure_llm(f"Anthropic client unavailable: {exc}")


def _build_master_agent_for_runner(agent, runtime_policy, llm_config, remote_prefs):
    from afp import MasterAgent, build_default_registry

    optimization_mode = _resolve_runner_optimization_mode(runtime_policy, remote_prefs)
    return MasterAgent(
        agent=agent,
        llm_client=_build_runner_llm_client(llm_config),
        model=str(llm_config.get("model") or "claude-haiku-4-5-20251001"),
        executor_registry=build_default_registry(),
        cost_model=None,
        optimization_mode=optimization_mode,
        execution_policy={
            "review_required_capabilities": runtime_policy.get("review_required_capabilities", []),
            "runtime_policy": runtime_policy,
        },
    )


async def _process_pending_tasks_once(agent, master, api_base):
    resp = await agent.client.get(
        f"{api_base}/agent/tasks",
        params={"status": "pending", "limit": 5},
        headers=agent._auth_headers(),
    )
    if resp.status_code != 200:
        return []

    payload = resp.json()
    if isinstance(payload, list):
        tasks = payload
    elif isinstance(payload, dict) and isinstance(payload.get("tasks"), list):
        tasks = payload.get("tasks", [])
    else:
        tasks = []
    completions = []
    for task in tasks:
        task_id = task.get("id")
        intent = task.get("intent") or task.get("content", {}).get("intent", "")
        if not task_id or not intent:
            continue
        if _EVENT_BUS_AVAILABLE:
            try:
                await publish(make_event(
                    "task_created",
                    source_agent_id=getattr(agent, "agent_id", "runner"),
                    payload={
                        "task_id": task_id,
                        "intent": intent,
                        "priority": task.get("priority", "normal"),
                    },
                    correlation_id=task_id,
                ))
            except Exception:
                pass
        try:
            result = await master.run(intent)
            result_json = {
                "result": {
                    "status": result.status,
                    "final_answer": result.final_answer,
                    "steps_taken": result.steps_taken,
                }
            }
            if _EVENT_BUS_AVAILABLE:
                try:
                    await publish(make_event(
                        "task_completed",
                        source_agent_id=getattr(agent, "agent_id", "runner"),
                        payload={
                            "task_id": task_id,
                            "result_summary": result.final_answer[:200],
                            "steps_taken": result.steps_taken,
                        },
                        correlation_id=task_id,
                    ))
                except Exception:
                    pass
        except Exception as exc:
            result_json = {"result": {"status": "failed", "error": str(exc)}}
        try:
            await agent.client.post(
                f"{api_base}/agent/tasks/{task_id}/complete",
                json=result_json,
                headers=agent._auth_headers(),
            )
        except Exception:
            pass
        completions.append({"task_id": task_id, "result": result_json})

    return completions


async def _event_loop(agent):
    """Subscribe to AFP relay WebSocket and dispatch capability_invoke messages."""
    try:
        from capability_registry import dispatch
    except ImportError:
        print("[runner] capability_registry not available; event loop skipped", flush=True)
        return

    backoff = 5
    while RUNNING:
        try:
            async for event in agent.relay_events():
                if not RUNNING:
                    return
                if not isinstance(event, dict):
                    continue
                if event.get("type") != "capability_invoke":
                    continue
                capability_name = event.get("content", {}).get("capability_name")
                params = event.get("content", {}).get("params") or {}
                thread_id = event.get("thread_id", "")
                # Publish message_received event
                if _EVENT_BUS_AVAILABLE:
                    try:
                        await publish(make_event(
                            "message_received",
                            source_agent_id=getattr(agent, "agent_id", "runner"),
                            payload={
                                "thread_id": thread_id,
                                "message_id": event.get("id", ""),
                                "from": event.get("from", ""),
                                "type": event.get("type", "capability_invoke"),
                                "timestamp": event.get("timestamp", now_iso()),
                            },
                            correlation_id=thread_id,
                        ))
                    except Exception:
                        pass

                try:
                    result = await dispatch(capability_name, params)
                except KeyError:
                    result = {"error": f"Unknown capability: {capability_name}"}
                except Exception as exc:
                    result = {"error": str(exc)}
                from afp import Agent as _Agent, Message
                reply = Message(
                    thread_id=thread_id,
                    type="capability_result",
                    content={"capability_name": capability_name, "result": result},
                )
                try:
                    await agent.send(reply)
                except Exception:
                    pass
            backoff = 5
        except Exception as exc:
            print(f"[runner] event_loop error: {exc}; reconnecting in {backoff}s", flush=True)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)


async def _trigger_loop(agent):
    """Poll pending agent_tasks every 10s and run MasterAgent for each."""
    api_base = os.getenv("OMNYID_API_BASE", "")
    if not api_base:
        return

    while RUNNING:
        try:
            runtime_policy = ensure_runtime_shape(load_runtime_policy(POLICY_PATH))
            remote_llm_config = await _fetch_runner_llm_config(agent)
            remote_prefs = await _fetch_runner_agent_preferences(agent)
            llm_config = _effective_runtime_llm_config(runtime_policy, remote_llm_config)
            master = _build_master_agent_for_runner(
                agent=agent,
                runtime_policy=runtime_policy,
                llm_config=llm_config,
                remote_prefs=remote_prefs,
            )
            await _process_pending_tasks_once(agent, master, api_base)
        except Exception as exc:
            print(f"[runner] trigger_loop error: {exc}", flush=True)

        await asyncio.sleep(10)


async def main():
    signal.signal(signal.SIGTERM, stop_handler)
    signal.signal(signal.SIGINT, stop_handler)
    bootstrap_state()

    print("OmnyID Python runner + chat window booted")
    print(
        json.dumps(
            {
                "owner_user_id": os.getenv("OMNYID_OWNER_USER_ID"),
                "owner_email": os.getenv("OMNYID_OWNER_EMAIL"),
                "framework": os.getenv("OMNYID_FRAMEWORK"),
                "gui": os.getenv("OMNYID_FRAMEWORK_GUI"),
                "agent_scope": json.loads(os.getenv("OMNYID_AGENT_SCOPE_JSON", "{}")),
                "chat_port": CHAT_PORT,
                "agent_id": os.getenv("AGENT_ID"),
                "private_key_path": os.getenv("PRIVATE_KEY_PATH"),
                "ollama_host": os.getenv("OLLAMA_HOST"),
            },
            indent=2,
        )
    )
    sys.stdout.flush()

    # Build the AFP Agent for event/trigger loops
    api_base = os.getenv("OMNYID_API_BASE", "http://localhost:8080")
    agent_id = os.getenv("AGENT_ID", "")
    signing_key_hex = None
    private_key_path = os.getenv("PRIVATE_KEY_PATH")
    if private_key_path:
        try:
            signing_key_hex = Path(private_key_path).read_text().strip()
        except Exception:
            pass

    try:
        from afp import Agent
        agent = Agent(
            homeserver_url=api_base,
            agent_id=agent_id,
            signing_key_hex=signing_key_hex,
        )
        _register_executor_capability_descriptors()
        _load_user_capability_handlers(agent)
        await agent.sync_capabilities()
    except Exception as exc:
        print(f"[runner] Agent init warning: {exc}; event/trigger loops disabled", flush=True)
        agent = None

    # Backward-compat HTTP server runs in a daemon thread
    http_thread = threading.Thread(target=_run_http_server_blocking, daemon=True)
    http_thread.start()

    tasks = []
    if _EVENT_BUS_AVAILABLE:
        tasks.append(asyncio.create_task(dispatch_loop()))
        tasks.append(asyncio.create_task(dlq_drain_loop(agent if agent is not None else None)))
    if agent is not None:
        tasks.append(asyncio.create_task(_event_loop(agent)))
        tasks.append(asyncio.create_task(_trigger_loop(agent)))

    # Wait forever (or until RUNNING is cleared by signal handler)
    try:
        await asyncio.Event().wait()
    except (KeyboardInterrupt, SystemExit):
        pass

    for t in tasks:
        t.cancel()
    print("OmnyID Python runner + chat window shutting down cleanly", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
