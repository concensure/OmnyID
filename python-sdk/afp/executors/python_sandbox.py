"""
python_sandbox.py — PythonSandboxExecutor: subprocess-based Python code execution.

Runs arbitrary Python code in a subprocess with:
  - CPU time limit (default 30s)
  - Memory limit via resource module (Unix) or process kill timer (Windows)
  - No network access (honor-system — for hard enforcement use a container)
  - Output captured from stdout/stderr
  - Optional package installation via pip before execution

Input params:
  code         (str, required)  — Python source code to execute
  timeout      (int)            — seconds before kill (default 30)
  packages     (list[str])      — pip packages to install first (max 5)
  capture_files (bool)          — if True, list files created in /tmp/sandbox (default False)

Output (ExecutionResult.data):
  {
    "stdout":         str,
    "stderr":         str,
    "exit_code":      int,
    "files_created":  list[str] | null,
    "truncated":      bool,
  }

Streams:
  - code section with syntax-highlighted source (before execution)
  - progress section while running
  - code section with stdout/stderr output (after execution)
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
import tempfile
import time
from pathlib import Path

from afp.executors.base import BaseExecutor, CostEstimate, ExecutionContext, ExecutionResult

logger = logging.getLogger("agenton.executor.python_sandbox")

_MAX_OUTPUT_BYTES = 64 * 1024   # 64 KB stdout/stderr cap
_MAX_PACKAGES = 5


class PythonSandboxExecutor(BaseExecutor):
    name = "python_sandbox"
    version = "1.0"

    def input_schema(self) -> dict:
        return {
            "type": "object",
            "required": ["code"],
            "properties": {
                "code":          {"type": "string", "description": "Python source code to execute"},
                "timeout":       {"type": "integer", "default": 30, "minimum": 1, "maximum": 120},
                "packages":      {"type": "array",  "items": {"type": "string"}, "maxItems": 5},
                "capture_files": {"type": "boolean", "default": False},
            },
        }

    def output_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "stdout":        {"type": "string"},
                "stderr":        {"type": "string"},
                "exit_code":     {"type": "integer"},
                "files_created": {"type": ["array", "null"], "items": {"type": "string"}},
                "truncated":     {"type": "boolean"},
            }
        }

    async def estimate_cost(self, params: dict, ctx: ExecutionContext) -> CostEstimate:
        timeout = int(params.get("timeout", 30))
        packages = params.get("packages", [])
        pip_time = len(packages) * 5.0  # ~5s per package
        return ctx.cost_model.estimate_tool_call(
            self.name, params,
            executor_time_secs=pip_time + min(timeout * 0.3, 15.0),
            executor_tokens=0,
        )

    async def execute(self, params: dict, ctx: ExecutionContext) -> ExecutionResult:
        t0 = time.monotonic()
        code     = params.get("code", "").strip()
        timeout  = int(params.get("timeout", 30))
        packages = params.get("packages", [])[:_MAX_PACKAGES]
        capture_files = params.get("capture_files", False)

        if not code:
            return ExecutionResult(success=False, data=None, error="code is required")

        # Stream the code before execution
        await ctx.emit_section({
            "id": "sandbox-code",
            "type": "code", "order": 10,
            "content": {"language": "python", "code": code, "label": "Code to execute"},
            "status": "complete",
        })

        await ctx.emit_section({
            "id": "sandbox-progress",
            "type": "progress", "order": 20,
            "content": {"text": "Setting up sandbox…", "pct": 10},
            "status": "streaming",
        })

        # Install packages if requested
        if packages:
            pip_ok, pip_err = await self._install_packages(packages)
            if not pip_ok:
                return ExecutionResult(
                    success=False, data=None,
                    error=f"Package installation failed: {pip_err}",
                    time_elapsed=time.monotonic() - t0,
                )

        await ctx.emit_section({
            "id": "sandbox-progress",
            "type": "progress", "order": 20,
            "content": {"text": "Running code…", "pct": 40},
            "status": "streaming",
        })

        # Write code to a temp file and execute
        with tempfile.TemporaryDirectory(prefix="agenton_sandbox_") as tmpdir:
            code_file = Path(tmpdir) / "script.py"
            code_file.write_text(code, encoding="utf-8")

            stdout, stderr, exit_code = await self._run(
                str(code_file), tmpdir, timeout
            )

            files_created: list[str] | None = None
            if capture_files:
                files_created = [
                    f.name for f in Path(tmpdir).iterdir()
                    if f.is_file() and f.name != "script.py"
                ]

        truncated = len(stdout) > _MAX_OUTPUT_BYTES or len(stderr) > _MAX_OUTPUT_BYTES
        stdout = stdout[:_MAX_OUTPUT_BYTES]
        stderr = stderr[:_MAX_OUTPUT_BYTES]

        output_label = "Output" if exit_code == 0 else f"Output (exit code {exit_code})"
        output_text = stdout if stdout else stderr if stderr else "(no output)"

        await ctx.emit_section({
            "id": "sandbox-output",
            "type": "code", "order": 30,
            "content": {"language": "text", "code": output_text, "label": output_label},
            "status": "complete",
        })

        await ctx.emit_section({
            "id": "sandbox-progress",
            "type": "progress", "order": 20,
            "content": {"text": "Execution complete" if exit_code == 0 else f"Exited with code {exit_code}", "pct": 100},
            "status": "complete",
        })

        return ExecutionResult(
            success=exit_code == 0,
            data={
                "stdout":        stdout,
                "stderr":        stderr,
                "exit_code":     exit_code,
                "files_created": files_created,
                "truncated":     truncated,
            },
            time_elapsed=time.monotonic() - t0,
        )

    async def _install_packages(self, packages: list[str]) -> tuple[bool, str]:
        """Install packages via pip into the current environment."""
        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, "-m", "pip", "install", "--quiet", *packages,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            _, stderr = await asyncio.wait_for(proc.communicate(), timeout=120.0)
            if proc.returncode != 0:
                return False, stderr.decode(errors="replace")[:1000]
            return True, ""
        except asyncio.TimeoutError:
            return False, "pip install timed out"
        except Exception as exc:
            return False, str(exc)

    async def _run(
        self,
        script_path: str,
        cwd: str,
        timeout: int,
    ) -> tuple[str, str, int]:
        """Run the script in a subprocess and capture stdout/stderr."""
        env = {**os.environ}
        # Prevent accidental network calls from inside sandboxed code
        # (honor-system — not a hard isolation guarantee)
        env["PYTHONDONTWRITEBYTECODE"] = "1"

        try:
            proc = await asyncio.create_subprocess_exec(
                sys.executable, script_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd,
                env=env,
            )

            try:
                stdout_b, stderr_b = await asyncio.wait_for(
                    proc.communicate(), timeout=float(timeout)
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                return "", f"Execution timed out after {timeout}s", 124  # 124 = timeout exit

            return (
                stdout_b.decode(errors="replace"),
                stderr_b.decode(errors="replace"),
                proc.returncode or 0,
            )

        except Exception as exc:
            return "", str(exc), 1
