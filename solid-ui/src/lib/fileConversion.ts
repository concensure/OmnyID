// @locs-version: 1.0
// Client-side file format conversion engine.
// Heavy libraries are dynamic-imported so they don't bloat the initial bundle.

import { readSession } from "./api";
const PDF_WORKER_SRC = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

export type ConvertibleFormat = "docx" | "html" | "pdf" | "pptx" | "txt" | "md";

/** 50 MB client-side guard — server also enforces 32 MB on the PDF path. */
const MAX_FILE_BYTES = 50 * 1024 * 1024;

/** Timeout for the server-side HTML→PDF fetch call (must outlast the 30 s node timeout). */
const PDF_FETCH_TIMEOUT_MS = 40_000;

export type ConversionResult = {
  blob: Blob;
  filename: string;
  mimeType: string;
};

export const FORMAT_MIME: Record<ConvertibleFormat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html",
  pdf: "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
};

export const FORMAT_LABEL: Record<ConvertibleFormat, string> = {
  docx: "Word (.docx)",
  html: "HTML",
  pdf: "PDF",
  pptx: "PowerPoint (.pptx)",
  txt: "Plain text",
  md: "Markdown",
};

const EXT_FORMAT: Record<string, ConvertibleFormat> = {
  docx: "docx", doc: "docx",
  html: "html", htm: "html",
  pdf: "pdf",
  pptx: "pptx", ppt: "pptx",
  txt: "txt",
  md: "md", markdown: "md",
};

// Ordered keyword patterns → target format, matched against user query.
const INTENT_PATTERNS: Array<[RegExp, ConvertibleFormat]> = [
  [/\bto\s+(?:a\s+)?(?:word|docx?)\b/i, "docx"],
  [/\bto\s+(?:a\s+)?pdf\b/i, "pdf"],
  [/\bto\s+(?:a\s+)?(?:powerpoint|pptx?|presentation|slides?)\b/i, "pptx"],
  [/\bto\s+(?:a\s+)?(?:plain\s+)?text|\.txt\b/i, "txt"],
  [/\bto\s+(?:a\s+)?(?:html?|web\s*page)\b/i, "html"],
  [/\bto\s+(?:a\s+)?(?:markdown|\.md)\b/i, "md"],
  [/\bconvert.*\b(?:word|docx?)\b/i, "docx"],
  [/\bconvert.*\bpdf\b/i, "pdf"],
  [/\bconvert.*\b(?:powerpoint|pptx?|slides?)\b/i, "pptx"],
];

export function detectFormat(file: File): ConvertibleFormat | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_FORMAT[ext] ?? null;
}

export function detectConversionIntent(query: string): ConvertibleFormat | null {
  for (const [re, fmt] of INTENT_PATTERNS) {
    if (re.test(query)) return fmt;
  }
  return null;
}

export function baseName(file: File): string {
  return file.name.replace(/\.[^.]+$/, "");
}

export function triggerDownload(result: ConversionResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = Object.assign(document.createElement("a"), {
    href: url,
    download: result.filename,
  });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      if (r.result instanceof ArrayBuffer) {
        resolve(r.result);
      } else {
        reject(new Error("Expected file reader to return an ArrayBuffer"));
      }
    };
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      if (typeof r.result === "string") {
        resolve(r.result);
      } else {
        reject(new Error("Expected file reader to return text"));
      }
    };
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

// ── DOCX → HTML ───────────────────────────────────────────────────────────────

async function docxToHtml(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await readAsArrayBuffer(file);
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  return typeof result.value === "string" ? result.value : "";
}

// ── HTML → DOCX ───────────────────────────────────────────────────────────────

// CGAP-010: walk the DOM recursively so nested sections, pre/code blocks,
// and inline bold/italic are preserved in the DOCX output.
function collectDocxChildren(
  node: Element,
  docx: { Paragraph: any; TextRun: any; HeadingLevel: any },
): any[] {
  const { Paragraph, TextRun, HeadingLevel } = docx;
  const out: any[] = [];

  for (const el of Array.from(node.children) as Element[]) {
    const tag = el.tagName.toLowerCase();

    if (tag === "h1") {
      const text = el.textContent?.trim() ?? "";
      if (text) out.push(new Paragraph({ text, heading: HeadingLevel.HEADING_1 }));
    } else if (tag === "h2") {
      const text = el.textContent?.trim() ?? "";
      if (text) out.push(new Paragraph({ text, heading: HeadingLevel.HEADING_2 }));
    } else if (tag === "h3") {
      const text = el.textContent?.trim() ?? "";
      if (text) out.push(new Paragraph({ text, heading: HeadingLevel.HEADING_3 }));
    } else if (tag === "pre" || tag === "code") {
      const text = el.textContent ?? "";
      if (text.trim()) {
        out.push(new Paragraph({
          children: [new TextRun({ text, font: { name: "Courier New" } })],
        }));
      }
    } else if (tag === "ul" || tag === "ol") {
      for (const li of Array.from(el.querySelectorAll("li")) as Element[]) {
        const runs = buildInlineRuns(li, TextRun);
        if (runs.length > 0) {
          out.push(new Paragraph({ children: runs, bullet: { level: 0 } }));
        }
      }
    } else if (tag === "p" || tag === "li") {
      const runs = buildInlineRuns(el, TextRun);
      if (runs.length > 0) out.push(new Paragraph({ children: runs }));
    } else if (tag === "br") {
      out.push(new Paragraph({ children: [new TextRun({ break: 1 })] }));
    } else {
      // container elements (div, section, article, blockquote, etc.) — recurse
      out.push(...collectDocxChildren(el, docx));
    }
  }
  return out;
}

function buildInlineRuns(el: Element, TextRun: any): any[] {
  const runs: any[] = [];
  for (const child of Array.from(el.childNodes)) {
    const type = child.nodeType;
    if (type === Node.TEXT_NODE) {
      const t = child.textContent ?? "";
      if (t) runs.push(new TextRun(t));
    } else if (type === Node.ELEMENT_NODE) {
      const childEl = child as Element;
      const tag = childEl.tagName.toLowerCase();
      const t = childEl.textContent ?? "";
      if (tag === "br") {
        runs.push(new TextRun({ break: 1 }));
      } else if (tag === "strong" || tag === "b") {
        if (t.trim()) runs.push(new TextRun({ text: t, bold: true }));
      } else if (tag === "em" || tag === "i") {
        if (t.trim()) runs.push(new TextRun({ text: t, italics: true }));
      } else if (tag === "code") {
        if (t.trim()) runs.push(new TextRun({ text: t, font: { name: "Courier New" } }));
      } else if (t.trim()) {
        runs.push(new TextRun(t));
      }
    }
  }
  return runs;
}

async function htmlToDocx(html: string): Promise<Blob> {
  const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import("docx");
  const doc = new DOMParser().parseFromString(html, "text/html");

  const children = collectDocxChildren(doc.body, { Paragraph, TextRun, HeadingLevel });
  if (children.length === 0) {
    children.push(new Paragraph({ children: [new TextRun(doc.body.textContent ?? "")] }));
  }

  const wordDoc = new Document({ sections: [{ children }] });
  return Packer.toBlob(wordDoc);
}

// ── HTML → PPTX ──────────────────────────────────────────────────────────────

interface SlideChunk { heading: string; body: string; }

// CGAP-011: use TreeWalker to visit all element nodes regardless of nesting depth.
// Previously only top-level body.children were scanned, so nested sections were lost.
function chunksFromHtml(html: string): SlideChunk[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const chunks: SlideChunk[] = [];
  let current: SlideChunk | null = null;

  const HEADING_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
  const LEAF_TAGS = new Set(["p", "li", "pre", "blockquote", "td", "th", "dt", "dd"]);

  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
  let node = walker.currentNode as Element | null;
  while (node) {
    const tag = node.tagName?.toLowerCase();
    if (tag && HEADING_TAGS.has(tag)) {
      if (current) chunks.push(current);
      current = { heading: node.textContent?.trim() ?? "", body: "" };
    } else if (tag && LEAF_TAGS.has(tag) && current) {
      const line = node.textContent?.trim() ?? "";
      if (line) current.body += line + "\n";
    }
    node = walker.nextNode() as Element | null;
  }
  if (current) chunks.push(current);
  if (chunks.length === 0 && doc.body.textContent?.trim()) {
    chunks.push({ heading: "", body: doc.body.textContent.trim() });
  }
  return chunks;
}

async function htmlToPptx(html: string, title: string): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  const chunks = chunksFromHtml(html);
  for (const chunk of chunks) {
    const slide = pptx.addSlide();
    if (chunk.heading) {
      slide.addText(chunk.heading, {
        x: 0.5, y: 0.4, w: 12, h: 1.0,
        fontSize: 28, bold: true, color: "1a1c1b",
      });
    }
    if (chunk.body) {
      const lines = chunk.body.split("\n").filter(Boolean).map((t) => ({
        text: t,
        options: { bullet: true, fontSize: 16, color: "444444" },
      }));
      slide.addText(lines, { x: 0.5, y: 1.6, w: 12, h: 5, breakLine: true });
    }
  }
  if (chunks.length === 0) {
    const slide = pptx.addSlide();
    slide.addText(title, { x: 0.5, y: 0.5, w: 12, h: 1, fontSize: 28, bold: true });
  }
  const buf = await pptx.write({ outputType: "arraybuffer" }) as ArrayBuffer;
  return new Blob([buf], { type: FORMAT_MIME.pptx });
}

// ── PDF → text ────────────────────────────────────────────────────────────────

async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  const buffer = await readAsArrayBuffer(file);
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item: any) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }
  return pages.join("\n\n");
}

// ── HTML → PDF (server-side via Playwright) ────────────────────────────────

async function htmlToPdf(html: string, apiBase: string): Promise<Blob> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDF_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${apiBase}/files/convert/pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ html }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      if (res.status === 413 || res.status === 507) {
        throw new Error("File is too large for PDF conversion (max 32 MB)");
      }
      if (res.status === 504) {
        throw new Error("PDF generation timed out — the document may be too complex");
      }
      throw new Error(`PDF conversion failed (${res.status}): ${text}`);
    }
    return res.blob();
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error("PDF request timed out — try a smaller document");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrapInHtmlDoc(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><body><pre style="font-family:sans-serif;white-space:pre-wrap">${escaped}</pre></body></html>`;
}

// ── Main conversion entry ─────────────────────────────────────────────────────

export async function convertFile(
  file: File,
  targetFormat: ConvertibleFormat,
  apiBase = "",
): Promise<ConversionResult> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(
      `File too large: ${(file.size / 1024 / 1024).toFixed(1)} MB — maximum is ${MAX_FILE_BYTES / 1024 / 1024} MB`,
    );
  }
  if (file.size === 0) {
    throw new Error("File is empty — nothing to convert");
  }

  const sourceFormat = detectFormat(file);
  if (!sourceFormat) {
    throw new Error(
      `Unsupported file type: ".${file.name.split(".").pop() ?? "?"}" — ` +
      "supported types are DOCX, PDF, TXT, MD, HTML",
    );
  }
  const name = baseName(file);

  if (sourceFormat === targetFormat) {
    return { blob: file, filename: file.name, mimeType: file.type || FORMAT_MIME[sourceFormat] };
  }

  let blob: Blob;
  let ext: string = targetFormat;

  if (sourceFormat === "docx") {
    const html = await docxToHtml(file);
    if (targetFormat === "html") {
      blob = new Blob([html], { type: FORMAT_MIME.html });
    } else if (targetFormat === "txt" || targetFormat === "md") {
      const doc = new DOMParser().parseFromString(html, "text/html");
      blob = new Blob([doc.body.innerText], { type: FORMAT_MIME[targetFormat] });
    } else if (targetFormat === "pdf") {
      blob = await htmlToPdf(html, apiBase);
    } else if (targetFormat === "pptx") {
      blob = await htmlToPptx(html, name);
    } else {
      throw new Error(`Cannot convert DOCX → ${targetFormat}`);
    }

  } else if (sourceFormat === "pdf") {
    const text = await pdfToText(file);
    if (targetFormat === "txt" || targetFormat === "md") {
      blob = new Blob([text], { type: FORMAT_MIME[targetFormat] });
    } else if (targetFormat === "html") {
      blob = new Blob([wrapInHtmlDoc(text)], { type: FORMAT_MIME.html });
    } else if (targetFormat === "docx") {
      blob = await htmlToDocx(wrapInHtmlDoc(text));
    } else if (targetFormat === "pptx") {
      blob = await htmlToPptx(wrapInHtmlDoc(text), name);
    } else {
      throw new Error(`Cannot convert PDF → ${targetFormat}`);
    }

  } else if (sourceFormat === "txt" || sourceFormat === "md") {
    const text = await readAsText(file);
    const html = wrapInHtmlDoc(text);
    if (targetFormat === "html") {
      blob = new Blob([html], { type: FORMAT_MIME.html });
    } else if (targetFormat === "docx") {
      blob = await htmlToDocx(html);
    } else if (targetFormat === "pdf") {
      blob = await htmlToPdf(html, apiBase);
    } else if (targetFormat === "pptx") {
      blob = await htmlToPptx(html, name);
    } else if (targetFormat === "md" || targetFormat === "txt") {
      blob = new Blob([text], { type: FORMAT_MIME[targetFormat] });
      ext = targetFormat;
    } else {
      throw new Error(`Cannot convert ${sourceFormat} → ${targetFormat}`);
    }

  } else if (sourceFormat === "html") {
    const html = await readAsText(file);
    if (targetFormat === "docx") {
      blob = await htmlToDocx(html);
    } else if (targetFormat === "pdf") {
      blob = await htmlToPdf(html, apiBase);
    } else if (targetFormat === "pptx") {
      blob = await htmlToPptx(html, name);
    } else if (targetFormat === "txt" || targetFormat === "md") {
      const doc = new DOMParser().parseFromString(html, "text/html");
      blob = new Blob([doc.body.innerText], { type: FORMAT_MIME[targetFormat] });
    } else {
      throw new Error(`Cannot convert HTML → ${targetFormat}`);
    }

  } else {
    throw new Error(`Source format "${sourceFormat ?? "unknown"}" is not supported`);
  }

  return { blob: blob!, filename: `${name}.${ext}`, mimeType: FORMAT_MIME[targetFormat] };
}

// ── Supported conversion matrix ───────────────────────────────────────────────

const SUPPORTED: Partial<Record<ConvertibleFormat, ConvertibleFormat[]>> = {
  docx: ["html", "txt", "md", "pdf", "pptx"],
  pdf:  ["txt", "md", "html", "docx", "pptx"],
  txt:  ["html", "docx", "pdf", "pptx", "md"],
  md:   ["html", "docx", "pdf", "pptx", "txt"],
  html: ["docx", "pdf", "pptx", "txt", "md"],
};

export function supportedTargets(source: ConvertibleFormat | null): ConvertibleFormat[] {
  if (!source) return [];
  return SUPPORTED[source] ?? [];
}
