"""
research_pipeline.py — ResearchPipelineExecutor: multi-source research workflow.

Composes: web_search → web_browse (top pages) → vector_memory → LLM synthesis

Input params:
  topic          (str, required)  — research topic
  depth          (str)            — "quick" | "standard" (default) | "deep"
  output_format  (str)            — "summary" (default) | "report" | "bullets"
  save_to_pdf    (bool)           — also generate a PDF report (default False)
  search_engine  (str)            — "duckduckgo" (default) | "google"

Depth profiles:
  quick:    1 search, browse top 2 pages, ~200-word summary
  standard: 1 search, browse top 4 pages, ~500-word report
  deep:     2 searches, browse top 8 pages, ~1500-word detailed report

Output (ExecutionResult.data):
  {
    "topic": str,
    "report": str,
    "sources": [{"title": str, "url": str}],
    "pdf_path"?: str,
    "depth": str,
  }

Streams:
  - search_results section
  - progress sections per browsed page
  - canvas section with synthesized report
  - attachments section if PDF generated
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from afp.executors.base import BaseExecutor, CostEstimate, ExecutionContext, ExecutionResult

if TYPE_CHECKING:
    pass

logger = logging.getLogger("agenton.executor.research_pipeline")

_DEPTH_CONFIG = {
    "quick":    {"searches": 1, "browse_count": 2, "max_words": 200,  "output_tokens": 350},
    "standard": {"searches": 1, "browse_count": 4, "max_words": 500,  "output_tokens": 800},
    "deep":     {"searches": 2, "browse_count": 8, "max_words": 1500, "output_tokens": 2500},
}


class ResearchPipelineExecutor(BaseExecutor):
    name = "research_pipeline"
    version = "1.0"

    def input_schema(self) -> dict:
        return {
            "type": "object",
            "required": ["topic"],
            "properties": {
                "topic":         {"type": "string"},
                "depth":         {"type": "string", "enum": ["quick", "standard", "deep"], "default": "standard"},
                "output_format": {"type": "string", "enum": ["summary", "report", "bullets"], "default": "summary"},
                "save_to_pdf":   {"type": "boolean", "default": False},
                "search_engine": {"type": "string", "enum": ["duckduckgo", "google"], "default": "duckduckgo"},
            },
        }

    def output_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "topic":    {"type": "string"},
                "report":   {"type": "string"},
                "sources":  {"type": "array", "items": {"type": "object"}},
                "pdf_path": {"type": "string"},
                "depth":    {"type": "string"},
            }
        }

    async def estimate_cost(self, params: dict, ctx: ExecutionContext) -> CostEstimate:
        depth = params.get("depth", "standard")
        cfg   = _DEPTH_CONFIG.get(depth, _DEPTH_CONFIG["standard"])

        # search + browse time
        search_time = 3.0 * cfg["searches"]
        browse_time = 6.0 * cfg["browse_count"]

        # LLM synthesis cost
        browsed_content_tok = cfg["browse_count"] * 800  # ~800 tokens per page
        input_tok  = browsed_content_tok + ctx.cost_model.estimate_tokens(params.get("topic", "")) + 300
        output_tok = cfg["output_tokens"]

        return ctx.cost_model.estimate_hybrid(
            self.name,
            executor_time_secs=search_time + browse_time,
            llm_input_tokens=input_tok,
            llm_output_tokens=output_tok,
        )

    async def execute(self, params: dict, ctx: ExecutionContext) -> ExecutionResult:
        t0 = time.monotonic()
        topic         = params.get("topic", "").strip()
        depth         = params.get("depth", "standard")
        output_format = params.get("output_format", "summary")
        save_to_pdf   = params.get("save_to_pdf", False)
        engine        = params.get("search_engine", "duckduckgo")
        cfg           = _DEPTH_CONFIG.get(depth, _DEPTH_CONFIG["standard"])

        if not topic:
            return ExecutionResult(success=False, data=None, error="topic is required")

        # ── Phase 1: Web search ───────────────────────────────────────────────
        search_ex = ctx.executor_registry.get("web_search")
        if not search_ex:
            return ExecutionResult(success=False, data=None, error="web_search executor not available")

        all_results: list[dict] = []
        queries = [topic]
        if depth == "deep":
            queries.append(f"{topic} detailed analysis")

        for q in queries:
            search_result = await search_ex.execute(
                {"query": q, "engine": engine, "max_results": cfg["browse_count"] + 2, "summarize": False},
                ctx,
            )
            if search_result.success and search_result.data:
                all_results.extend(search_result.data.get("results", []))

        # Deduplicate by URL
        seen_urls: set[str] = set()
        unique_results: list[dict] = []
        for r in all_results:
            if r["url"] not in seen_urls:
                seen_urls.add(r["url"])
                unique_results.append(r)

        sources = unique_results[: cfg["browse_count"]]

        # ── Phase 2: Browse top pages ─────────────────────────────────────────
        browse_ex = ctx.executor_registry.get("web_browse")
        page_texts: list[str] = []

        if browse_ex:
            for i, result in enumerate(sources):
                await ctx.emit_section({
                    "id": f"research-browse-{i}",
                    "type": "progress", "order": 30 + i,
                    "content": {
                        "text": f"Reading [{i+1}/{len(sources)}]: {result['title'][:60]}",
                        "pct":  int(30 + 40 * (i / max(len(sources), 1))),
                    },
                    "status": "streaming",
                })

                browse_result = await browse_ex.execute(
                    {"url": result["url"], "action": "read"},
                    ctx,
                )
                if browse_result.success and browse_result.data:
                    text = browse_result.data.get("text", "")
                    if text:
                        # Keep first 1500 chars per page to manage token budget
                        page_texts.append(f"Source: {result['url']}\n{text[:1500]}")

        # ── Phase 3: Store in vector memory (optional, for later recall) ──────
        mem_ex = ctx.executor_registry.get("vector_memory")
        if mem_ex and page_texts:
            for i, pt in enumerate(page_texts):
                await mem_ex.execute({
                    "operation": "store",
                    "collection": "research",
                    "text": pt,
                    "metadata": {"topic": topic, "source": sources[i]["url"] if i < len(sources) else ""},
                }, ctx)

        # ── Phase 4: LLM synthesis ────────────────────────────────────────────
        await ctx.emit_section({
            "id": "research-synthesizing",
            "type": "progress", "order": 80,
            "content": {"text": "Synthesizing research…", "pct": 80},
            "status": "streaming",
        })

        report = await self._synthesize(topic, page_texts, sources, output_format, cfg, ctx)

        # ── Phase 5: Stream final report ──────────────────────────────────────
        await ctx.emit_section({
            "id": "research-report",
            "type": "canvas", "order": 90,
            "content": {"text": report, "title": f"Research: {topic}"},
            "status": "complete",
        })

        # ── Phase 6: Optional PDF ─────────────────────────────────────────────
        pdf_path: str | None = None
        if save_to_pdf:
            doc_ex = ctx.executor_registry.get("doc_gen")
            if doc_ex:
                pdf_result = await doc_ex.execute({
                    "type": "pdf",
                    "filename": f"research_{_safe_filename(topic)}.pdf",
                    "content": {
                        "paragraphs": [
                            {"text": f"Research Report: {topic}", "style": "heading1"},
                            *[{"text": para, "style": "body"}
                              for para in report.split("\n\n") if para.strip()],
                        ]
                    },
                }, ctx)
                if pdf_result.success and pdf_result.data:
                    pdf_path = pdf_result.data.get("path")

        await ctx.emit_section({
            "id": "research-synthesizing",
            "type": "progress", "order": 80,
            "content": {"text": "Research complete", "pct": 100},
            "status": "complete",
        })

        return ExecutionResult(
            success=True,
            data={
                "topic":    topic,
                "report":   report,
                "sources":  [{"title": r["title"], "url": r["url"]} for r in sources],
                "pdf_path": pdf_path,
                "depth":    depth,
            },
            time_elapsed=time.monotonic() - t0,
        )

    async def _synthesize(
        self,
        topic: str,
        page_texts: list[str],
        sources: list[dict],
        output_format: str,
        cfg: dict,
        ctx: ExecutionContext,
    ) -> str:
        """Call the LLM to synthesize research into a coherent report."""
        if not ctx.llm_client or not page_texts:
            # Fallback: stitch snippets together
            return "\n\n".join(
                f"**{r['title']}**\n{r['snippet']}"
                for r in sources[:4]
            )

        format_instructions = {
            "summary": f"Write a concise ~{cfg['max_words']}-word factual summary.",
            "report":  f"Write a structured {cfg['max_words']}-word report with sections.",
            "bullets": "Write a bulleted list of the key findings and facts.",
        }

        content_block = "\n\n---\n\n".join(page_texts[:cfg["browse_count"]])
        prompt = (
            f"Research topic: {topic!r}\n\n"
            f"Source content:\n{content_block}\n\n"
            f"{format_instructions.get(output_format, format_instructions['summary'])} "
            "Focus on facts, data, and clear explanation. "
            "Do not mention the sources by URL — write in third person."
        )

        try:
            response = await ctx.llm_client.complete(
                messages=[{"role": "user", "content": prompt}],
                model=ctx.model,
                max_tokens=cfg["output_tokens"],
            )
            return response.content if hasattr(response, "content") else str(response)
        except Exception as exc:
            logger.error("Research synthesis LLM call failed: %s", exc)
            return "\n\n".join(f"- {r['title']}: {r['snippet']}" for r in sources[:5])


def _safe_filename(s: str) -> str:
    return "".join(c if c.isalnum() or c in "-_ " else "_" for c in s)[:40].strip()
