"""
ecommerce.py — EcommerceExecutor: product search, comparison, and cart automation.

Composes: web_search + web_browse (Playwright)

Actions:
  search_products  — search and rank products by query/criteria
  compare          — side-by-side comparison of products from URLs or search
  add_to_cart      — Playwright automation (ALWAYS requires user confirmation)
  track            — track price/availability for a product URL

Input params:
  action    (str, required)  — "search_products" | "compare" | "add_to_cart" | "track"
  query     (str)            — product search query
  urls      (list[str])      — specific product URLs for compare/track/add_to_cart
  criteria  (list[str])      — comparison criteria (e.g. ["price", "battery", "weight"])
  budget    (str)            — max price filter (e.g. "$500")

Safety: add_to_cart ALWAYS streams a decision_point confirmation before any cart action.

Output (ExecutionResult.data):
  search_products: {"products": [{"title", "url", "price", "rating", "snippet"}]}
  compare:         {"products": [...], "comparison_table": {...}}
  add_to_cart:     {"status": "added" | "cancelled" | "failed", "product": str}
  track:           {"product": str, "price": str, "availability": str, "url": str}
"""
from __future__ import annotations

import logging
import re
import time
from typing import Any

from afp.executors.base import BaseExecutor, CostEstimate, ExecutionContext, ExecutionResult

logger = logging.getLogger("agenton.executor.ecommerce")

_SEARCH_TIME = 4.0
_BROWSE_TIME = 6.0
_CART_TIME   = 10.0


class EcommerceExecutor(BaseExecutor):
    name = "ecommerce"
    version = "1.0"

    def input_schema(self) -> dict:
        return {
            "type": "object",
            "required": ["action"],
            "properties": {
                "action":   {"type": "string", "enum": ["search_products", "compare", "add_to_cart", "track"]},
                "query":    {"type": "string"},
                "urls":     {"type": "array", "items": {"type": "string"}},
                "criteria": {"type": "array", "items": {"type": "string"}},
                "budget":   {"type": "string"},
            },
        }

    def output_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "products":         {"type": "array", "items": {"type": "object"}},
                "comparison_table": {"type": "object"},
                "status":           {"type": "string"},
                "product":          {"type": "string"},
                "price":            {"type": "string"},
                "availability":     {"type": "string"},
                "url":              {"type": "string"},
            }
        }

    async def estimate_cost(self, params: dict, ctx: ExecutionContext) -> CostEstimate:
        action = params.get("action", "search_products")
        max_products = max(1, min(int(params.get("max_products", 4)), 10))
        time_map = {
            "search_products": _SEARCH_TIME + max(0, max_products - 4) * 0.4,
            "compare":         _SEARCH_TIME + _BROWSE_TIME * max_products,
            "add_to_cart":     _CART_TIME,
            "track":           _BROWSE_TIME,
        }
        tok_map = {
            "compare": 300 + max_products * 120,  # LLM for comparison synthesis
        }
        return ctx.cost_model.estimate_tool_call(
            self.name, params,
            executor_time_secs=time_map.get(action, _SEARCH_TIME),
            executor_tokens=tok_map.get(action, 0),
        )

    async def execute(self, params: dict, ctx: ExecutionContext) -> ExecutionResult:
        t0 = time.monotonic()
        action = params.get("action", "search_products")

        action_map = {
            "search_products": self._search_products,
            "compare":         self._compare,
            "add_to_cart":     self._add_to_cart,
            "track":           self._track,
        }

        if action not in action_map:
            return ExecutionResult(success=False, data=None, error=f"Unknown action: {action!r}")

        try:
            data = await action_map[action](params, ctx)
        except Exception as exc:
            logger.error("ecommerce %s failed: %s", action, exc)
            return ExecutionResult(success=False, data=None, error=str(exc), time_elapsed=time.monotonic() - t0)

        return ExecutionResult(success=True, data=data, time_elapsed=time.monotonic() - t0)

    # ── Action handlers ───────────────────────────────────────────────────────

    async def _search_products(self, params: dict, ctx: ExecutionContext) -> dict:
        query  = params.get("query", "")
        budget = params.get("budget", "")
        max_products = max(1, min(int(params.get("max_products", 10)), 10))
        if not query:
            raise ValueError("query is required for search_products")

        full_query = query
        if budget:
            full_query += f" under {budget}"

        search_ex = ctx.executor_registry.get("web_search")
        if not search_ex:
            raise RuntimeError("web_search executor not available")

        result = await search_ex.execute(
            {"query": full_query, "max_results": max_products, "summarize": False},
            ctx,
        )

        if not result.success or not result.data:
            return {"products": []}

        raw = result.data.get("results", [])
        products = [
            {
                "title":   r["title"],
                "url":     r["url"],
                "snippet": r["snippet"],
                "price":   _extract_price(r["snippet"] + " " + r["title"]),
                "rating":  _extract_rating(r["snippet"]),
            }
            for r in raw
        ]

        # Stream search_results section
        await ctx.emit_section({
            "id": "ecom-search-results",
            "type": "search_results", "order": 20,
            "content": {"query": full_query, "results": raw, "summary": None},
            "status": "complete",
        })

        return {"products": products}

    async def _compare(self, params: dict, ctx: ExecutionContext) -> dict:
        urls      = params.get("urls", [])
        query     = params.get("query", "")
        criteria  = params.get("criteria", ["price", "features", "rating", "availability"])
        max_products = max(2, min(int(params.get("max_products", 4)), 5))

        # If no URLs, search first
        if not urls and query:
            search_data = await self._search_products(params, ctx)
            urls = [p["url"] for p in search_data.get("products", [])[:max_products]]

        if not urls:
            raise ValueError("Either urls or query is required for compare action")

        # Browse each product page
        browse_ex = ctx.executor_registry.get("web_browse")
        product_pages: list[dict] = []

        for i, url in enumerate(urls[:max_products]):
            await ctx.emit_section({
                "id": f"ecom-browse-{i}",
                "type": "progress", "order": 30 + i,
                "content": {"text": f"Reading product [{i+1}/{len(urls[:max_products])}]…", "pct": 30 + i * 10},
                "status": "streaming",
            })

            if browse_ex:
                br = await browse_ex.execute({"url": url, "action": "read"}, ctx)
                if br.success and br.data:
                    product_pages.append({
                        "url":   url,
                        "title": br.data.get("title", url),
                        "text":  br.data.get("text", "")[:2000],
                    })

        # LLM comparison synthesis
        comparison_text = await self._synthesize_comparison(product_pages, criteria, query, ctx)

        # Build comparison table structure
        comp_table = {"criteria": criteria, "products": []}
        for pp in product_pages:
            comp_table["products"].append({
                "title": pp["title"],
                "url":   pp["url"],
                "data":  {c: _extract_field(pp["text"], c) for c in criteria},
            })

        # Stream comparison section
        await ctx.emit_section({
            "id": "ecom-comparison",
            "type": "comparison", "order": 50,
            "content": {
                "products":         comp_table["products"],
                "criteria":         criteria,
                "summary":          comparison_text,
            },
            "status": "complete",
        })

        # Stream table section
        await ctx.emit_section({
            "id": "ecom-table",
            "type": "table", "order": 60,
            "content": {
                "headers": ["Product"] + criteria,
                "rows": [
                    [p["title"][:40]] + [p["data"].get(c, "—") for c in criteria]
                    for p in comp_table["products"]
                ],
            },
            "status": "complete",
        })

        return {"products": comp_table["products"], "comparison_table": comp_table}

    async def _add_to_cart(self, params: dict, ctx: ExecutionContext) -> dict:
        """Add a product to cart — ALWAYS requires user confirmation via decision_point."""
        urls = params.get("urls", [])
        if not urls:
            raise ValueError("urls is required for add_to_cart action")

        url = urls[0]

        # Mandatory confirmation decision point
        await ctx.emit_section({
            "id": "ecom-confirm-cart",
            "type": "decision_point", "order": 10,
            "content": {
                "id":       "dp-cart-confirm",
                "question": f"Add item from {url} to cart?",
                "category": "confirmation",
                "context":  "This will interact with the website on your behalf.",
                "options": [
                    {
                        "id":    "confirm",
                        "label": "Yes, add to cart",
                        "pros":  ["Completes the action you requested"],
                        "cons":  ["Will interact with the e-commerce site"],
                        "is_default": False,
                    },
                    {
                        "id":    "cancel",
                        "label": "Cancel",
                        "pros":  ["No action taken"],
                        "cons":  [],
                        "is_default": True,
                    },
                ],
                "required": True,
            },
            "status": "awaiting_input",
        })

        # Note: actual Playwright add-to-cart automation would be here after confirmation.
        # The agent's _await_user() flow handles waiting for decision resolution.
        # This executor signals the intent — MasterAgent wires the actual wait.
        return {
            "status":  "pending_confirmation",
            "product": url,
            "note":    "Awaiting user confirmation before proceeding with cart action.",
        }

    async def _track(self, params: dict, ctx: ExecutionContext) -> dict:
        urls = params.get("urls", [])
        if not urls:
            raise ValueError("urls is required for track action")

        url       = urls[0]
        browse_ex = ctx.executor_registry.get("web_browse")

        if not browse_ex:
            raise RuntimeError("web_browse executor not available for price tracking")

        await ctx.emit_section({
            "id": "ecom-track-progress",
            "type": "progress", "order": 10,
            "content": {"text": f"Fetching price for {url[:60]}…", "pct": 30},
            "status": "streaming",
        })

        br = await browse_ex.execute({"url": url, "action": "read"}, ctx)
        price = availability = "unknown"

        if br.success and br.data:
            text         = br.data.get("text", "")
            price        = _extract_price(text) or "not found"
            availability = _extract_availability(text)
            title        = br.data.get("title", url)

            await ctx.emit_section({
                "id": "ecom-track-result",
                "type": "canvas", "order": 20,
                "content": {"text": f"**{title}**\nPrice: {price}\nAvailability: {availability}\nURL: {url}"},
                "status": "complete",
            })

        await ctx.emit_section({
            "id": "ecom-track-progress",
            "type": "progress", "order": 10,
            "content": {"text": "Done", "pct": 100},
            "status": "complete",
        })

        return {"product": url, "price": price, "availability": availability, "url": url}

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _synthesize_comparison(
        self,
        pages: list[dict],
        criteria: list[str],
        query: str,
        ctx: ExecutionContext,
    ) -> str:
        if not ctx.llm_client or not pages:
            return ""

        products_block = "\n\n".join(
            f"**{p['title']}** ({p['url']})\n{p['text'][:800]}"
            for p in pages
        )
        criteria_str = ", ".join(criteria)
        prompt = (
            f"Compare these products based on: {criteria_str}.\n\n"
            f"Products:\n{products_block}\n\n"
            "Write a concise comparison that helps a buyer choose. "
            "For each criterion, state which product is best and why. "
            "End with a clear recommendation."
        )

        try:
            response = await ctx.llm_client.complete(
                messages=[{"role": "user", "content": prompt}],
                model=ctx.model,
                max_tokens=600,
            )
            return response.content if hasattr(response, "content") else str(response)
        except Exception as exc:
            logger.warning("Comparison synthesis failed: %s", exc)
            return ""


# ── Text extraction helpers ───────────────────────────────────────────────────

def _extract_price(text: str) -> str:
    """Extract first price pattern from text."""
    m = re.search(r"[\$£€¥]\s?\d[\d,]*(?:\.\d{2})?", text)
    return m.group(0) if m else ""

def _extract_rating(text: str) -> str:
    """Extract star rating pattern from text."""
    m = re.search(r"(\d(?:\.\d)?)\s*(?:out of\s*)?(?:\/\s*)?5\s*stars?", text, re.IGNORECASE)
    if m:
        return f"{m.group(1)}/5"
    m = re.search(r"(\d+(?:\.\d+)?)\s*\★", text)
    return f"{m.group(1)}" if m else ""

def _extract_availability(text: str) -> str:
    """Extract availability status from product page text."""
    text_lower = text.lower()
    if "in stock" in text_lower or "add to cart" in text_lower:
        return "In Stock"
    if "out of stock" in text_lower or "unavailable" in text_lower:
        return "Out of Stock"
    if "ships in" in text_lower or "delivery" in text_lower:
        return "Available"
    return "Unknown"

def _extract_field(text: str, field: str) -> str:
    """Best-effort extraction of a specific field from product page text."""
    field_lower = field.lower()
    # Look for lines containing the field keyword
    for line in text.splitlines():
        if field_lower in line.lower() and len(line) < 200:
            return line.strip()[:80]
    return "—"
