"""
web_browse.py — WebBrowseExecutor: Playwright-powered web browsing.

Actions:
  read        — navigate to URL, extract clean text content
  screenshot  — take a screenshot, save to workspace
  interact    — click a CSS selector
  fill_form   — fill a form field (selector + value)
  extract     — extract structured data matching a CSS selector

Input params:
  url       (str, required)
  action    (str)           — "read" (default) | "screenshot" | "interact" | "fill_form" | "extract"
  selector  (str)           — CSS selector for interact/fill_form/extract
  value     (str)           — value for fill_form
  timeout   (int)           — page load timeout ms (default 15000)
  wait_for  (str)           — optional CSS selector to wait for before extraction

Output (ExecutionResult.data):
  {
    "text"?:            str,
    "url":              str,
    "title":            str,
    "screenshot_path"?: str,
    "extracted"?:       list[str],
  }

Streams:
  - progress sections during navigation + extraction
  - canvas section with extracted text (for "read" action)
  - attachments section for screenshot
"""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path

from afp.executors.base import BaseExecutor, CostEstimate, ExecutionContext, ExecutionResult

logger = logging.getLogger("agenton.executor.web_browse")

_WORKSPACE_SCREENSHOTS = Path("/workspace/data/screenshots")
_PAGE_LOAD_SECS = 5.0
_SCREENSHOT_SECS = 3.0
_INTERACT_SECS = 2.0


class WebBrowseExecutor(BaseExecutor):
    name = "web_browse"
    version = "1.0"

    def input_schema(self) -> dict:
        return {
            "type": "object",
            "required": ["url"],
            "properties": {
                "url":      {"type": "string", "description": "The URL to navigate to"},
                "action":   {"type": "string", "enum": ["read", "screenshot", "interact", "fill_form", "extract"], "default": "read"},
                "selector": {"type": "string", "description": "CSS selector for interact/fill_form/extract actions"},
                "value":    {"type": "string", "description": "Value for fill_form action"},
                "timeout":  {"type": "integer", "default": 15000, "description": "Page load timeout in ms"},
                "wait_for": {"type": "string", "description": "CSS selector to wait for before extraction"},
            },
        }

    def output_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "text":             {"type": "string"},
                "url":              {"type": "string"},
                "title":            {"type": "string"},
                "screenshot_path":  {"type": "string"},
                "extracted":        {"type": "array", "items": {"type": "string"}},
            }
        }

    async def estimate_cost(self, params: dict, ctx: ExecutionContext) -> CostEstimate:
        action = params.get("action", "read")
        time_map = {
            "read":       _PAGE_LOAD_SECS + 1.0,
            "screenshot": _PAGE_LOAD_SECS + _SCREENSHOT_SECS,
            "interact":   _PAGE_LOAD_SECS + _INTERACT_SECS,
            "fill_form":  _PAGE_LOAD_SECS + _INTERACT_SECS,
            "extract":    _PAGE_LOAD_SECS + 1.5,
        }
        return ctx.cost_model.estimate_tool_call(
            self.name, params,
            executor_time_secs=time_map.get(action, _PAGE_LOAD_SECS),
            executor_tokens=0,  # no LLM calls in browse — pure compute
        )

    async def execute(self, params: dict, ctx: ExecutionContext) -> ExecutionResult:
        t0 = time.monotonic()
        url      = params.get("url", "").strip()
        action   = params.get("action", "read")
        selector = params.get("selector", "")
        value    = params.get("value", "")
        timeout  = int(params.get("timeout", 15000))
        wait_for = params.get("wait_for", "")

        if not url:
            return ExecutionResult(success=False, data=None, error="url is required")

        await ctx.emit_section({
            "id": f"browse-progress-{int(t0)}",
            "type": "progress", "order": 10,
            "content": {"text": f"Opening {url} …", "pct": 10},
            "status": "streaming",
        })

        try:
            from playwright.async_api import async_playwright  # type: ignore[import]
        except ImportError:
            return ExecutionResult(
                success=False, data=None,
                error="playwright is required. Run: pip install playwright && playwright install chromium",
                time_elapsed=time.monotonic() - t0,
            )

        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            try:
                page = await browser.new_page()
                await page.set_extra_http_headers({"User-Agent": "Mozilla/5.0 (compatible; Agenton/1.0)"})

                await page.goto(url, timeout=timeout, wait_until="domcontentloaded")

                if wait_for:
                    try:
                        await page.wait_for_selector(wait_for, timeout=5000)
                    except Exception:
                        pass  # best-effort

                final_url = page.url
                title = await page.title()

                await ctx.emit_section({
                    "id": f"browse-progress-{int(t0)}",
                    "type": "progress", "order": 10,
                    "content": {"text": f"Loaded: {title or url}", "pct": 50},
                    "status": "streaming",
                })

                data: dict = {"url": final_url, "title": title}

                if action == "read":
                    text = await self._extract_text(page)
                    data["text"] = text
                    await ctx.emit_section({
                        "id": f"browse-content-{int(t0)}",
                        "type": "canvas", "order": 20,
                        "content": {"text": text[:4000], "source_url": final_url, "title": title},
                        "status": "complete",
                    })

                elif action == "screenshot":
                    path = await self._take_screenshot(page, final_url)
                    data["screenshot_path"] = str(path)
                    await ctx.emit_section({
                        "id": f"browse-screenshot-{int(t0)}",
                        "type": "attachments", "order": 20,
                        "content": {"files": [{"name": path.name, "path": str(path), "mime": "image/png"}]},
                        "status": "complete",
                    })

                elif action == "interact":
                    if not selector:
                        raise ValueError("selector is required for interact action")
                    await page.click(selector)
                    data["text"] = f"Clicked element: {selector}"

                elif action == "fill_form":
                    if not selector:
                        raise ValueError("selector is required for fill_form action")
                    await page.fill(selector, value)
                    data["text"] = f"Filled {selector!r} with value"

                elif action == "extract":
                    if not selector:
                        raise ValueError("selector is required for extract action")
                    elements = await page.query_selector_all(selector)
                    extracted = []
                    for el in elements[:50]:
                        text = await el.inner_text()
                        if text.strip():
                            extracted.append(text.strip())
                    data["extracted"] = extracted
                    await ctx.emit_section({
                        "id": f"browse-extracted-{int(t0)}",
                        "type": "canvas", "order": 20,
                        "content": {"text": "\n".join(extracted), "source_url": final_url},
                        "status": "complete",
                    })

            finally:
                await browser.close()

        await ctx.emit_section({
            "id": f"browse-progress-{int(t0)}",
            "type": "progress", "order": 10,
            "content": {"text": "Done", "pct": 100},
            "status": "complete",
        })

        return ExecutionResult(
            success=True, data=data,
            time_elapsed=time.monotonic() - t0,
        )

    async def _extract_text(self, page) -> str:
        """Extract readable text from the page, stripping nav/footer/ads."""
        # Try main content areas first
        for selector in ["main", "article", "[role='main']", "#content", ".content"]:
            try:
                el = await page.query_selector(selector)
                if el:
                    text = await el.inner_text()
                    if len(text.strip()) > 200:
                        return _clean_text(text)
            except Exception:
                continue
        # Fallback to full body
        body = await page.query_selector("body")
        if body:
            return _clean_text(await body.inner_text())
        return ""

    async def _take_screenshot(self, page, url: str) -> Path:
        _WORKSPACE_SCREENSHOTS.mkdir(parents=True, exist_ok=True)
        safe = "".join(c if c.isalnum() else "_" for c in url)[:60]
        path = _WORKSPACE_SCREENSHOTS / f"screenshot_{safe}_{int(time.time())}.png"
        await page.screenshot(path=str(path), full_page=False)
        return path


def _clean_text(text: str) -> str:
    """Remove excessive whitespace from extracted page text."""
    lines = [line.strip() for line in text.splitlines()]
    lines = [line for line in lines if line]
    # Remove lines that are just navigation links (very short repeated items)
    return "\n".join(lines)
