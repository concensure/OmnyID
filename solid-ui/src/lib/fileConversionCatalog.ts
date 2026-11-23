// @locs-version: 1.0
export type ConvertibleFormat = "docx" | "html" | "pdf" | "pptx" | "txt" | "md";

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

const SUPPORTED: Partial<Record<ConvertibleFormat, ConvertibleFormat[]>> = {
  docx: ["html", "txt", "md", "pdf", "pptx"],
  pdf:  ["txt", "md", "html", "docx", "pptx"],
  txt:  ["html", "docx", "pdf", "pptx", "md"],
  md:   ["html", "docx", "pdf", "pptx", "txt"],
  html: ["docx", "pdf", "pptx", "txt", "md"],
  pptx: ["pdf", "html", "txt", "md", "docx"],
};

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

export function triggerDownload(result: { blob: Blob; filename: string }): void {
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

export function supportedTargets(source: ConvertibleFormat | null): ConvertibleFormat[] {
  return source ? [...(SUPPORTED[source] ?? [])] : [];
}
