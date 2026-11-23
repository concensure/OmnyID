"""
vector_memory.py — VectorMemoryExecutor: ChromaDB-backed persistent semantic memory.

Provides store/query/delete operations on named collections. Collections are
persisted on disk at VECTOR_DB_PATH (/workspace/data/vector_db by default).

Operations:
  store   — embed and store text with optional metadata
  query   — semantic similarity search
  delete  — remove documents by ID or metadata filter

Input params:
  operation   (str, required)  — "store" | "query" | "delete"
  collection  (str)            — collection name (default "default")
  text        (str)            — text to store (for store) or query text (for query)
  query       (str)            — alias for text in query context
  n           (int)            — max results to return (default 5)
  metadata    (dict)           — metadata to attach to stored documents
  doc_id      (str)            — document ID for targeted delete
  where       (dict)           — ChromaDB where-filter for delete

Output (ExecutionResult.data):
  store:   {"stored_id": str, "collection": str}
  query:   {"matches": [{"text": str, "score": float, "metadata": dict, "id": str}], "collection": str}
  delete:  {"deleted": int, "collection": str}
"""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path
from typing import Any

from afp.executors.base import BaseExecutor, CostEstimate, ExecutionContext, ExecutionResult

logger = logging.getLogger("agenton.executor.vector_memory")

VECTOR_DB_PATH = Path(os.environ.get("VECTOR_DB_PATH", "/workspace/data/vector_db"))


class VectorMemoryExecutor(BaseExecutor):
    name = "vector_memory"
    version = "1.0"

    def __init__(self) -> None:
        self._client: Any = None   # lazy-initialized ChromaDB client

    def input_schema(self) -> dict:
        return {
            "type": "object",
            "required": ["operation"],
            "properties": {
                "operation":  {"type": "string", "enum": ["store", "query", "delete"]},
                "collection": {"type": "string", "default": "default"},
                "text":       {"type": "string", "description": "Text to store or query"},
                "query":      {"type": "string", "description": "Alias for text in query context"},
                "n":          {"type": "integer", "default": 5, "minimum": 1, "maximum": 50},
                "metadata":   {"type": "object"},
                "doc_id":     {"type": "string"},
                "where":      {"type": "object"},
            },
        }

    def output_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "stored_id":  {"type": "string"},
                "collection": {"type": "string"},
                "matches": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "text":     {"type": "string"},
                            "score":    {"type": "number"},
                            "metadata": {"type": "object"},
                            "id":       {"type": "string"},
                        }
                    }
                },
                "deleted": {"type": "integer"},
            }
        }

    async def estimate_cost(self, params: dict, ctx: ExecutionContext) -> CostEstimate:
        # Vector DB operations are fast and free (local embeddings)
        op = params.get("operation", "")
        time_map = {"store": 0.5, "query": 0.3, "delete": 0.2}
        return ctx.cost_model.estimate_tool_call(
            self.name, params,
            executor_time_secs=time_map.get(op, 0.3),
            executor_tokens=0,  # chromadb uses local embedding model
        )

    async def execute(self, params: dict, ctx: ExecutionContext) -> ExecutionResult:
        t0 = time.monotonic()
        op         = params.get("operation", "")
        collection = params.get("collection", "default") or "default"

        if not op:
            return ExecutionResult(success=False, data=None, error="operation is required")

        try:
            chroma = self._get_client()
            coll   = chroma.get_or_create_collection(name=collection)
        except Exception as exc:
            logger.error("ChromaDB init failed: %s", exc)
            return ExecutionResult(
                success=False, data=None,
                error=f"Vector DB unavailable: {exc}. Ensure chromadb is installed.",
                time_elapsed=time.monotonic() - t0,
            )

        try:
            if op == "store":
                data = await self._store(coll, params)
            elif op == "query":
                data = await self._query(coll, params, ctx)
            elif op == "delete":
                data = await self._delete(coll, params)
            else:
                raise ValueError(f"Unknown operation: {op!r}")
        except Exception as exc:
            logger.error("vector_memory %s failed: %s", op, exc)
            return ExecutionResult(
                success=False, data=None, error=str(exc),
                time_elapsed=time.monotonic() - t0,
            )

        data["collection"] = collection

        # Emit a small canvas section only for query results
        if op == "query" and data.get("matches"):
            matches_text = "\n".join(
                f"[{i+1}] (score {m['score']:.3f}) {m['text'][:200]}"
                for i, m in enumerate(data["matches"])
            )
            await ctx.emit_section({
                "id": f"memory-results-{int(t0)}",
                "type": "canvas", "order": 20,
                "content": {"text": f"Memory recall ({len(data['matches'])} matches):\n\n{matches_text}"},
                "status": "complete",
            })

        return ExecutionResult(success=True, data=data, time_elapsed=time.monotonic() - t0)

    # ── ChromaDB operations ───────────────────────────────────────────────────

    async def _store(self, coll, params: dict) -> dict:
        import uuid
        text = params.get("text", "")
        if not text:
            raise ValueError("text is required for store operation")
        metadata = dict(params.get("metadata", {}) or {})
        doc_id = params.get("doc_id") or str(uuid.uuid4())
        coll.upsert(ids=[doc_id], documents=[text], metadatas=[metadata])
        return {"stored_id": doc_id}

    async def _query(self, coll, params: dict, ctx: ExecutionContext) -> dict:
        text = params.get("text") or params.get("query", "")
        if not text:
            raise ValueError("text or query is required for query operation")
        n = int(params.get("n", 5))
        results = coll.query(query_texts=[text], n_results=n)

        matches = []
        if results and results.get("documents"):
            docs      = results["documents"][0]
            ids       = (results.get("ids") or [[]])[0]
            metas     = (results.get("metadatas") or [[]])[0]
            distances = (results.get("distances") or [[]])[0]

            for doc, did, meta, dist in zip(docs, ids, metas, distances):
                # ChromaDB returns L2 distance — convert to similarity score 0..1
                score = max(0.0, 1.0 - (dist / 2.0))
                matches.append({
                    "id":       did,
                    "text":     doc,
                    "score":    round(score, 4),
                    "metadata": meta or {},
                })

        return {"matches": matches}

    async def _delete(self, coll, params: dict) -> dict:
        doc_id = params.get("doc_id")
        where  = params.get("where")

        if doc_id:
            coll.delete(ids=[doc_id])
            return {"deleted": 1}
        if where:
            # ChromaDB .delete(where=...) returns deleted IDs in newer versions
            coll.delete(where=where)
            return {"deleted": -1}  # -1 = unknown count
        raise ValueError("Either doc_id or where filter is required for delete")

    # ── Client init ───────────────────────────────────────────────────────────

    def _get_client(self):
        if self._client is not None:
            return self._client
        try:
            import chromadb  # type: ignore[import]
        except ImportError:
            raise ImportError(
                "chromadb is required for vector_memory. "
                "Add 'chromadb>=0.5.0' to requirements.txt"
            )
        VECTOR_DB_PATH.mkdir(parents=True, exist_ok=True)
        self._client = chromadb.PersistentClient(path=str(VECTOR_DB_PATH))
        return self._client
