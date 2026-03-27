"""
web_search.py — WebSearchExecutor: DuckDuckGo/Google web search with LLM summarization.

Input params:
  query       (str, required)  — search query
  engine      (str, optional)  — "duckduckgo" (default) | "google"
  max_results (int, optional)  — max results to fetch (default 8, max 20)
  summarize   (bool, optional) — whether to run LLM summarization (default True)

Output (ExecutionResult.data):
  {
    "results": [{"title": str, "url": str, "snippet": str}, ...],
    "summary": str | null,
    "query": str,
    "engine": str,
    "result_count": int
  }

Streams:
  - progress section while fetching
  - search_results section with results + summary
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

from afp.executors.base import BaseExecutor, CostEstimate, ExecutionContext, ExecutionResult

logger = logging.getLogger("agenton.executor.web_search")

_DEFAULT_MAX_RESULTS = 8
_SUMMARY_OUTPUT_TOKENS = 400
_FETCH_TIME_SECS = 3.0
_GOOGLE_FETCH_TIME_SECS = 5.0


class WebSearchExecutor(BaseExecutor):
    name = "web_search"
    version = "1.0"

    # ── Schema ────────────────────────────────────────────────────────────────

    def input_schema(self) -> dict:
        return {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query":       {"type": "string", "description": "The search query"},
                "engine":      {"type": "string", "enum": ["duckduckgo", "google"], "default": "duckduckgo"},
                "max_results": {"type": "integer", "minimum": 1, "maximum": 20, "default": 8},
                "summarize":   {"type": "boolean", "default": True},
            },
        }

    def output_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "results": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title":   {"type": "string"},
                            "url":     {"type": "string"},
                            "snippet": {"type": "string"},
                        }
                    }
                },
                "summary":      {"type": ["string", "null"]},
                "query":        {"type": "string"},
                "engine":       {"type": "string"},
                "result_count": {"type": "integer"},
            }
        }

    # ── Cost estimation ───────────────────────────────────────────────────────

    async def estimate_cost(self, params: dict, ctx: ExecutionContext) -> CostEstimate:
        engine = params.get("engine", "duckduckgo")
        summarize = params.get("summarize", True)
        fetch_time = _GOOGLE_FETCH_TIME_SECS if engine == "google" else _FETCH_TIME_SECS

        if summarize:
            # LLM is called to summarize results
            query_tok = ctx.cost_model.estimate_tokens(params.get("query", ""))
            results_tok = 600   # estimated tokens for serialized search results
            input_tok = query_tok + results_tok + 200  # + system prompt
            output_tok = _SUMMARY_OUTPUT_TOKENS
            return ctx.cost_model.estimate_tool_call(
                self.name, params,
                executor_time_secs=fetch_time,
                executor_tokens=input_tok + output_tok,
            )
        else:
            return ctx.cost_model.estimate_tool_call(
                self.name, params,
                executor_time_secs=fetch_time,
                executor_tokens=0,
            )

    # ── Execution ─────────────────────────────────────────────────────────────

    async def execute(self, params: dict, ctx: ExecutionContext) -> ExecutionResult:
        t0 = time.monotonic()
        query       = params.get("query", "").strip()
        engine      = params.get("engine", "duckduckgo")
        max_results = min(int(params.get("max_results", _DEFAULT_MAX_RESULTS)), 20)
        summarize   = params.get("summarize", True)

        if not query:
            return ExecutionResult(success=False, data=None, error="query is required")

        # Stream progress start
        await ctx.emit_section({
            "id": f"search-progress-{int(t0)}",
            "type": "progress",
            "order": 10,
            "content": {"text": f"Searching {engine} for: {query!r}", "pct": 10},
            "status": "streaming",
        })

        # Fetch search results
        try:
            results = await self._fetch(query, engine, max_results)
        except Exception as exc:
            logger.error("Search fetch failed: %s", exc)
            await ctx.emit_section({
                "id": f"search-progress-{int(t0)}",
                "type": "error",
                "order": 10,
                "content": {"text": f"Search failed: {exc}"},
                "status": "complete",
            })
            return ExecutionResult(success=False, data=None, error=str(exc), time_elapsed=time.monotonic() - t0)

        await ctx.emit_section({
            "id": f"search-progress-{int(t0)}",
            "type": "progress",
            "order": 10,
            "content": {"text": f"Found {len(results)} results — processing…", "pct": 60},
            "status": "streaming",
        })

        # Optional LLM summarization
        summary: str | None = None
        tokens_used = 0
        cost_cents = 0.0

        if summarize and results and ctx.llm_client is not None:
            try:
                summary, tokens_used, cost_cents = await self._summarize(query, results, ctx)
            except Exception as exc:
                logger.warning("Summarization failed (non-fatal): %s", exc)

        # Stream final search_results section
        await ctx.emit_section({
            "id": f"search-results-{int(t0)}",
            "type": "search_results",
            "order": 20,
            "content": {
                "query":   query,
                "results": results,
                "summary": summary,
                "engine":  engine,
            },
            "status": "complete",
        })

        # Mark progress done
        await ctx.emit_section({
            "id": f"search-progress-{int(t0)}",
            "type": "progress",
            "order": 10,
            "content": {"text": "Search complete", "pct": 100},
            "status": "complete",
        })

        return ExecutionResult(
            success=True,
            data={
                "results":      results,
                "summary":      summary,
                "query":        query,
                "engine":       engine,
                "result_count": len(results),
            },
            tokens_used=tokens_used,
            cost_cents=cost_cents,
            time_elapsed=time.monotonic() - t0,
        )

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _fetch(self, query: str, engine: str, max_results: int) -> list[dict]:
        """Fetch search results from the chosen engine."""
        if engine == "google":
            return await self._fetch_google(query, max_results)
        return await self._fetch_ddg(query, max_results)

    async def _fetch_ddg(self, query: str, max_results: int) -> list[dict]:
        """DuckDuckGo search via duckduckgo_search library."""
        try:
            from duckduckgo_search import DDGS  # type: ignore[import]
        except ImportError:
            raise ImportError(
                "duckduckgo_search is required for web_search. "
                "Add 'duckduckgo_search>=6.0.0' to requirements.txt"
            )

        def _sync_search() -> list[dict]:
            with DDGS() as ddgs:
                raw = ddgs.text(query, max_results=max_results)
                return [
                    {
                        "title":   r.get("title", ""),
                        "url":     r.get("href", ""),
                        "snippet": r.get("body", ""),
                    }
                    for r in (raw or [])
                ]

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _sync_search)

    async def _fetch_google(self, query: str, max_results: int) -> list[dict]:
        """
        Google Custom Search JSON API.
        Requires GOOGLE_CSE_API_KEY and GOOGLE_CSE_ID env vars.
        Falls back to DuckDuckGo if env vars not set.
        """
        import os
        api_key = os.environ.get("GOOGLE_CSE_API_KEY")
        cse_id  = os.environ.get("GOOGLE_CSE_ID")

        if not api_key or not cse_id:
            logger.warning("GOOGLE_CSE_API_KEY/GOOGLE_CSE_ID not set — falling back to DuckDuckGo")
            return await self._fetch_ddg(query, max_results)

        import httpx
        url = "https://www.googleapis.com/customsearch/v1"
        params = {
            "key": api_key,
            "cx":  cse_id,
            "q":   query,
            "num": min(max_results, 10),
        }
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()

        return [
            {
                "title":   item.get("title", ""),
                "url":     item.get("link", ""),
                "snippet": item.get("snippet", ""),
            }
            for item in data.get("items", [])
        ]

    async def _summarize(
        self,
        query: str,
        results: list[dict],
        ctx: ExecutionContext,
    ) -> tuple[str, int, float]:
        """Call the LLM to produce a concise summary of search results."""
        snippets = "\n".join(
            f"[{i+1}] {r['title']}: {r['snippet']}"
            for i, r in enumerate(results[:8])
        )
        prompt = (
            f"Based on these web search results for the query: {query!r}\n\n"
            f"{snippets}\n\n"
            "Write a concise, factual 2–4 sentence summary that directly answers "
            "the query. Include key facts and figures. Do not mention the sources."
        )

        try:
            # Use the llm_client's standard interface
            response = await ctx.llm_client.complete(
                messages=[{"role": "user", "content": prompt}],
                model=ctx.model,
                max_tokens=_SUMMARY_OUTPUT_TOKENS,
            )
            summary = response.content if hasattr(response, "content") else str(response)
            tokens  = getattr(response, "tokens_used", ctx.cost_model.estimate_tokens(prompt + summary))
            cost    = ctx.cost_model.estimate_llm_cost_cents(
                ctx.cost_model.estimate_tokens(prompt), _SUMMARY_OUTPUT_TOKENS
            )
            return summary, tokens, cost
        except AttributeError:
            # Fallback: build a simple extractive summary from snippets
            sentences = []
            for r in results[:3]:
                s = r.get("snippet", "").strip()
                if s and s not in sentences:
                    sentences.append(s)
            return " ".join(sentences[:2]), 0, 0.0
