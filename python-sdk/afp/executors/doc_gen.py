"""
doc_gen.py — DocGenExecutor: generate Word, Excel, PowerPoint, PDF, and image files.

Input params:
  type      (str, required)  — "docx" | "xlsx" | "pptx" | "pdf" | "image"
  content   (dict, required) — format-specific content (see schemas below)
  filename  (str)            — output filename (default: "output.<ext>")

Content schemas by type:

  docx: {"sections": [{"heading": str, "text": str, "level": int (1-6)}]}
  xlsx: {"sheets": [{"name": str, "rows": [[cell_value, ...]]}]}
  pptx: {"slides": [{"title": str, "body": str, "layout": "title_content" | "blank"}]}
  pdf:  {"paragraphs": [{"text": str, "style": "heading1"|"heading2"|"body"|"code"}]}
  image:{"width": int, "height": int, "background": "#rrggbb",
         "elements": [{"type": "text", "x": int, "y": int, "text": str, "size": int, "color": str}]}

Output saved to WORKSPACE_ROOT/documents/<filename>.
Output (ExecutionResult.data):
  {"path": str, "filename": str, "size_bytes": int, "type": str}

Streams:
  - progress section during generation
  - attachments section with download link on completion
"""
from __future__ import annotations

import logging
import os
import time
from pathlib import Path

from afp.executors.base import BaseExecutor, CostEstimate, ExecutionContext, ExecutionResult

logger = logging.getLogger("agenton.executor.doc_gen")

DOCUMENTS_DIR = Path(os.environ.get("AGENT_WORKSPACE", "/workspace/data")) / "documents"
_GEN_TIME_MAP = {"docx": 1.5, "xlsx": 1.0, "pptx": 2.0, "pdf": 1.5, "image": 0.5}


class DocGenExecutor(BaseExecutor):
    name = "doc_gen"
    version = "1.0"

    def input_schema(self) -> dict:
        return {
            "type": "object",
            "required": ["type", "content"],
            "properties": {
                "type":     {"type": "string", "enum": ["docx", "xlsx", "pptx", "pdf", "image"]},
                "content":  {"type": "object", "description": "Format-specific content structure"},
                "filename": {"type": "string", "description": "Output filename (without path)"},
            },
        }

    def output_schema(self) -> dict:
        return {
            "type": "object",
            "properties": {
                "path":       {"type": "string"},
                "filename":   {"type": "string"},
                "size_bytes": {"type": "integer"},
                "type":       {"type": "string"},
            }
        }

    async def estimate_cost(self, params: dict, ctx: ExecutionContext) -> CostEstimate:
        doc_type = params.get("type", "docx")
        return ctx.cost_model.estimate_tool_call(
            self.name, params,
            executor_time_secs=_GEN_TIME_MAP.get(doc_type, 1.5),
            executor_tokens=0,   # pure compute — no LLM calls
        )

    async def execute(self, params: dict, ctx: ExecutionContext) -> ExecutionResult:
        t0 = time.monotonic()
        doc_type = params.get("type", "")
        content  = params.get("content", {})
        filename = params.get("filename", f"output.{doc_type}")

        if not doc_type:
            return ExecutionResult(success=False, data=None, error="type is required")

        DOCUMENTS_DIR.mkdir(parents=True, exist_ok=True)
        out_path = DOCUMENTS_DIR / filename

        await ctx.emit_section({
            "id": f"docgen-progress-{int(t0)}",
            "type": "progress", "order": 10,
            "content": {"text": f"Generating {doc_type.upper()}: {filename}…", "pct": 20},
            "status": "streaming",
        })

        try:
            gen_map = {
                "docx":  self._gen_docx,
                "xlsx":  self._gen_xlsx,
                "pptx":  self._gen_pptx,
                "pdf":   self._gen_pdf,
                "image": self._gen_image,
            }
            if doc_type not in gen_map:
                raise ValueError(f"Unknown document type: {doc_type!r}")

            gen_map[doc_type](content, out_path)

        except ImportError as exc:
            return ExecutionResult(
                success=False, data=None,
                error=f"Missing dependency for {doc_type}: {exc}",
                time_elapsed=time.monotonic() - t0,
            )
        except Exception as exc:
            logger.error("doc_gen %s failed: %s", doc_type, exc)
            return ExecutionResult(
                success=False, data=None, error=str(exc),
                time_elapsed=time.monotonic() - t0,
            )

        size = out_path.stat().st_size

        await ctx.emit_section({
            "id": f"docgen-result-{int(t0)}",
            "type": "attachments", "order": 20,
            "content": {
                "files": [{
                    "name":       filename,
                    "path":       str(out_path),
                    "size_bytes": size,
                    "mime":       _MIME_TYPES.get(doc_type, "application/octet-stream"),
                }]
            },
            "status": "complete",
        })

        await ctx.emit_section({
            "id": f"docgen-progress-{int(t0)}",
            "type": "progress", "order": 10,
            "content": {"text": f"Created {filename} ({size:,} bytes)", "pct": 100},
            "status": "complete",
        })

        return ExecutionResult(
            success=True,
            data={"path": str(out_path), "filename": filename, "size_bytes": size, "type": doc_type},
            time_elapsed=time.monotonic() - t0,
        )

    # ── Generators ────────────────────────────────────────────────────────────

    def _gen_docx(self, content: dict, path: Path) -> None:
        from docx import Document  # type: ignore[import]
        from docx.shared import Pt

        doc = Document()
        for section in content.get("sections", []):
            heading = section.get("heading", "")
            text    = section.get("text", "")
            level   = int(section.get("level", 2))

            if heading:
                doc.add_heading(heading, level=min(level, 9))
            if text:
                doc.add_paragraph(text)

        doc.save(str(path))

    def _gen_xlsx(self, content: dict, path: Path) -> None:
        from openpyxl import Workbook  # type: ignore[import]
        from openpyxl.styles import Font

        wb = Workbook()
        wb.remove(wb.active)  # remove default sheet

        for sheet_spec in content.get("sheets", [{"name": "Sheet1", "rows": []}]):
            ws = wb.create_sheet(title=sheet_spec.get("name", "Sheet1"))
            for row_idx, row in enumerate(sheet_spec.get("rows", []), start=1):
                for col_idx, cell_value in enumerate(row, start=1):
                    ws.cell(row=row_idx, column=col_idx, value=cell_value)
                # Bold first row (headers)
                if row_idx == 1:
                    for col_idx in range(1, len(row) + 1):
                        ws.cell(row=1, column=col_idx).font = Font(bold=True)

        wb.save(str(path))

    def _gen_pptx(self, content: dict, path: Path) -> None:
        from pptx import Presentation  # type: ignore[import]
        from pptx.util import Inches, Pt

        prs = Presentation()

        for slide_spec in content.get("slides", []):
            layout_name = slide_spec.get("layout", "title_content")
            # Layout index: 0=title, 1=title+content
            layout_idx = 1 if layout_name == "title_content" else 6  # 6=blank
            slide_layout = prs.slide_layouts[min(layout_idx, len(prs.slide_layouts) - 1)]
            slide = prs.slides.add_slide(slide_layout)

            if slide.shapes.title:
                slide.shapes.title.text = slide_spec.get("title", "")

            body = slide_spec.get("body", "")
            if body and len(slide.placeholders) > 1:
                try:
                    slide.placeholders[1].text = body
                except Exception:
                    pass

        prs.save(str(path))

    def _gen_pdf(self, content: dict, path: Path) -> None:
        from reportlab.lib.pagesizes import letter  # type: ignore[import]
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

        styles = getSampleStyleSheet()
        story = []

        for para in content.get("paragraphs", []):
            text  = para.get("text", "")
            style = para.get("style", "Normal")

            rl_style_map = {
                "heading1": styles["Heading1"],
                "heading2": styles["Heading2"],
                "heading3": styles["Heading3"],
                "body":     styles["Normal"],
                "code":     styles["Code"],
            }
            rl_style = rl_style_map.get(style, styles["Normal"])

            if text:
                story.append(Paragraph(text, rl_style))
                story.append(Spacer(1, 6))

        doc = SimpleDocTemplate(str(path), pagesize=letter)
        doc.build(story)

    def _gen_image(self, content: dict, path: Path) -> None:
        from PIL import Image, ImageDraw, ImageFont  # type: ignore[import]

        width  = int(content.get("width",  800))
        height = int(content.get("height", 600))
        bg     = content.get("background", "#ffffff")

        img  = Image.new("RGB", (width, height), color=bg)
        draw = ImageDraw.Draw(img)

        for el in content.get("elements", []):
            el_type = el.get("type", "")
            x = int(el.get("x", 0))
            y = int(el.get("y", 0))

            if el_type == "text":
                text  = el.get("text", "")
                size  = int(el.get("size", 16))
                color = el.get("color", "#000000")
                try:
                    font = ImageFont.truetype("arial.ttf", size)
                except Exception:
                    font = ImageFont.load_default()
                draw.text((x, y), text, fill=color, font=font)

            elif el_type == "rect":
                w      = int(el.get("width",  100))
                h      = int(el.get("height", 50))
                color  = el.get("color", "#000000")
                filled = el.get("filled", True)
                if filled:
                    draw.rectangle([x, y, x + w, y + h], fill=color)
                else:
                    draw.rectangle([x, y, x + w, y + h], outline=color)

        img.save(str(path))


_MIME_TYPES = {
    "docx":  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xlsx":  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "pptx":  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "pdf":   "application/pdf",
    "image": "image/png",
}
