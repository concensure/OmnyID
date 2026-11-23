"""
file_ops.py — FileOpsExecutor: sandboxed filesystem operations.

All paths are resolved relative to WORKSPACE_ROOT (/workspace/data/files/).
Any path that attempts to escape the sandbox is rejected with an error.

Operations:
  read      — read file content
  write     — write content to file (creates parent dirs if needed)
  list      — list directory contents
  move      — move/rename a file or directory
  delete    — delete a file (NOT directories — use with caution)
  mkdir     — create directory tree
  organize  — LLM-assisted: classify and reorganize files by type/topic

Input params:
  operation   (str, required)  — one of the above
  path        (str, required)  — relative path within workspace
  content     (str)            — for write operation
  destination (str)            — for move operation
  recursive   (bool)           — for list (default False)
  encoding    (str)            — for read/write (default "utf-8")

Output (ExecutionResult.data):
  Varies by operation — see each _op_*() method.
"""
from __future__ import annotations

import logging
import os
import shutil
import time
from pathlib import Path

from afp.executors.base import BaseExecutor, CostEstimate, ExecutionContext, ExecutionResult

logger = logging.getLogger("agenton.executor.file_ops")

WORKSPACE_ROOT = Path(os.environ.get("AGENT_WORKSPACE", "/workspace/data/files"))
_MAX_READ_BYTES = 512 * 1024   # 512 KB read limit per file


class FileOpsExecutor(BaseExecutor):
    name = "file_ops"
    version = "1.0"

    def input_schema(self) -> dict:
        return {
            "type": "object",
            "required": ["operation", "path"],
            "properties": {
                "operation":   {"type": "string", "enum": ["read", "write", "list", "move", "delete", "mkdir", "organize"]},
                "path":        {"type": "string", "description": "Relative path within agent workspace"},
                "content":     {"type": "string", "description": "Content for write operation"},
                "destination": {"type": "string", "description": "Destination path for move operation"},
                "recursive":   {"type": "boolean", "default": False, "description": "List subdirectories recursively"},
                "encoding":    {"type": "string", "default": "utf-8"},
            },
        }

    def output_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path":    {"type": "string"},
                "content": {"type": "string"},
                "entries": {"type": "array", "items": {"type": "object"}},
                "message": {"type": "string"},
            }
        }

    async def estimate_cost(self, params: dict, ctx: ExecutionContext) -> CostEstimate:
        op = params.get("operation", "")
        organize_tok = 800 if op == "organize" else 0
        return ctx.cost_model.estimate_tool_call(
            self.name, params,
            executor_time_secs=2.0 if op == "organize" else 0.2,
            executor_tokens=organize_tok,
        )

    async def execute(self, params: dict, ctx: ExecutionContext) -> ExecutionResult:
        t0 = time.monotonic()
        op = params.get("operation", "")
        raw_path = params.get("path", "")

        if not op:
            return ExecutionResult(success=False, data=None, error="operation is required")
        if not raw_path:
            return ExecutionResult(success=False, data=None, error="path is required")

        try:
            safe_path = self._resolve_safe(raw_path)
        except ValueError as e:
            return ExecutionResult(success=False, data=None, error=str(e), time_elapsed=time.monotonic() - t0)

        await ctx.emit_section({
            "id": f"fileops-progress-{int(t0)}",
            "type": "progress", "order": 10,
            "content": {"text": f"{op}: {raw_path}", "pct": 20},
            "status": "streaming",
        })

        try:
            result_data = await self._dispatch(op, safe_path, params, ctx)
        except Exception as exc:
            logger.error("file_ops %s failed: %s", op, exc)
            return ExecutionResult(success=False, data=None, error=str(exc), time_elapsed=time.monotonic() - t0)

        await ctx.emit_section({
            "id": f"fileops-progress-{int(t0)}",
            "type": "progress", "order": 10,
            "content": {"text": f"Done: {op}", "pct": 100},
            "status": "complete",
        })

        return ExecutionResult(success=True, data=result_data, time_elapsed=time.monotonic() - t0)

    # ── Dispatch ──────────────────────────────────────────────────────────────

    async def _dispatch(self, op: str, path: Path, params: dict, ctx: ExecutionContext) -> dict:
        if op == "read":
            return self._op_read(path, params)
        if op == "write":
            return self._op_write(path, params)
        if op == "list":
            return self._op_list(path, params)
        if op == "move":
            dest_raw = params.get("destination", "")
            if not dest_raw:
                raise ValueError("destination is required for move operation")
            dest = self._resolve_safe(dest_raw)
            return self._op_move(path, dest)
        if op == "delete":
            return self._op_delete(path)
        if op == "mkdir":
            return self._op_mkdir(path)
        if op == "organize":
            return await self._op_organize(path, ctx)
        raise ValueError(f"Unknown operation: {op!r}")

    # ── Operations ────────────────────────────────────────────────────────────

    def _op_read(self, path: Path, params: dict) -> dict:
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path.relative_to(WORKSPACE_ROOT)}")
        if not path.is_file():
            raise IsADirectoryError(f"Path is a directory: {path.relative_to(WORKSPACE_ROOT)}")
        encoding = params.get("encoding", "utf-8")
        content = path.read_bytes()[:_MAX_READ_BYTES].decode(encoding, errors="replace")
        return {"path": str(path.relative_to(WORKSPACE_ROOT)), "content": content}

    def _op_write(self, path: Path, params: dict) -> dict:
        content = params.get("content", "")
        encoding = params.get("encoding", "utf-8")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding=encoding)
        return {"path": str(path.relative_to(WORKSPACE_ROOT)), "message": f"Written {len(content)} chars"}

    def _op_list(self, path: Path, params: dict) -> dict:
        if not path.exists():
            raise FileNotFoundError(f"Directory not found: {path.relative_to(WORKSPACE_ROOT)}")
        if not path.is_dir():
            raise NotADirectoryError(f"Not a directory: {path.relative_to(WORKSPACE_ROOT)}")

        recursive = params.get("recursive", False)
        entries = []

        if recursive:
            for entry in sorted(path.rglob("*")):
                try:
                    stat = entry.stat()
                    entries.append({
                        "name": entry.name,
                        "path": str(entry.relative_to(WORKSPACE_ROOT)),
                        "type": "file" if entry.is_file() else "dir",
                        "size": stat.st_size if entry.is_file() else None,
                    })
                except OSError:
                    pass
        else:
            for entry in sorted(path.iterdir()):
                try:
                    stat = entry.stat()
                    entries.append({
                        "name": entry.name,
                        "path": str(entry.relative_to(WORKSPACE_ROOT)),
                        "type": "file" if entry.is_file() else "dir",
                        "size": stat.st_size if entry.is_file() else None,
                    })
                except OSError:
                    pass

        return {"path": str(path.relative_to(WORKSPACE_ROOT)), "entries": entries}

    def _op_move(self, src: Path, dest: Path) -> dict:
        if not src.exists():
            raise FileNotFoundError(f"Source not found: {src.relative_to(WORKSPACE_ROOT)}")
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(src), str(dest))
        return {
            "message": f"Moved {src.relative_to(WORKSPACE_ROOT)} → {dest.relative_to(WORKSPACE_ROOT)}"
        }

    def _op_delete(self, path: Path) -> dict:
        if not path.exists():
            raise FileNotFoundError(f"File not found: {path.relative_to(WORKSPACE_ROOT)}")
        if path.is_dir():
            raise IsADirectoryError("Use move to archive directories rather than delete")
        path.unlink()
        return {"message": f"Deleted {path.relative_to(WORKSPACE_ROOT)}"}

    def _op_mkdir(self, path: Path) -> dict:
        path.mkdir(parents=True, exist_ok=True)
        return {"path": str(path.relative_to(WORKSPACE_ROOT)), "message": "Directory created"}

    async def _op_organize(self, path: Path, ctx: ExecutionContext) -> dict:
        """
        LLM-assisted file organization: list files, ask LLM for a folder structure,
        then move files accordingly.
        """
        if not path.is_dir():
            raise NotADirectoryError(f"organize requires a directory path")

        # Collect all files
        files = [e for e in path.rglob("*") if e.is_file()]
        if not files:
            return {"message": "No files to organize", "entries": []}

        file_list = "\n".join(
            f"- {f.relative_to(path)} ({f.suffix or 'no ext'}, {f.stat().st_size} bytes)"
            for f in files[:100]
        )

        prompt = (
            f"I have these files in a directory:\n{file_list}\n\n"
            "Suggest a clear folder organization plan. For each file, specify which "
            "subdirectory it should go in. Return a JSON array: "
            '[{"file": "original_name.ext", "dest_dir": "category/subfolder"}, ...]'
        )

        moves: list[dict] = []
        if ctx.llm_client:
            try:
                import json as _json
                response = await ctx.llm_client.complete(
                    messages=[{"role": "user", "content": prompt}],
                    model=ctx.model,
                    max_tokens=800,
                )
                raw = response.content if hasattr(response, "content") else str(response)
                # Extract JSON array from response
                start = raw.find("[")
                end   = raw.rfind("]") + 1
                if start >= 0 and end > start:
                    plan = _json.loads(raw[start:end])
                    for item in plan:
                        src_name  = item.get("file", "")
                        dest_subdir = item.get("dest_dir", "")
                        src = path / src_name
                        if src.exists() and dest_subdir:
                            dest = self._resolve_safe(str(path.relative_to(WORKSPACE_ROOT) / dest_subdir / src_name))
                            dest.parent.mkdir(parents=True, exist_ok=True)
                            shutil.move(str(src), str(dest))
                            moves.append({
                                "file": src_name,
                                "moved_to": str(dest.relative_to(WORKSPACE_ROOT)),
                            })
            except Exception as exc:
                logger.warning("organize LLM plan failed: %s", exc)

        await ctx.emit_section({
            "id": "fileops-organize-result",
            "type": "canvas", "order": 20,
            "content": {
                "text": f"Organized {len(moves)} files.\n" +
                        "\n".join(f"  {m['file']} → {m['moved_to']}" for m in moves),
            },
            "status": "complete",
        })

        return {"message": f"Organized {len(moves)} files", "entries": moves}

    # ── Path sandboxing ───────────────────────────────────────────────────────

    def _resolve_safe(self, raw_path: str) -> Path:
        """
        Resolve raw_path relative to WORKSPACE_ROOT.
        Raises ValueError if the resolved path escapes the sandbox.
        """
        WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
        resolved = (WORKSPACE_ROOT / raw_path).resolve()
        try:
            resolved.relative_to(WORKSPACE_ROOT.resolve())
        except ValueError:
            raise ValueError(
                f"Path {raw_path!r} escapes the agent workspace sandbox. "
                "All file operations must stay within /workspace/data/files/."
            )
        return resolved
