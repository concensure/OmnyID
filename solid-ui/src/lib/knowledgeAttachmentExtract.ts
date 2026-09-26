// @locs-version: 1.0
import type { AttachmentIngestCapabilities } from "./api";

const PDF_WORKER_BASE_URL =
  typeof import.meta !== "undefined" && import.meta.env?.BASE_URL
    ? import.meta.env.BASE_URL
    : "/";
const PDF_WORKER_SRC = `${PDF_WORKER_BASE_URL}pdf.worker.min.mjs`;

const INLINE_TEXT_EXTENSIONS = [
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "xml",
  "rtf",
  "srt",
  "vtt",
] as const;

const XLSX_EXTENSIONS = ["xlsx", "xlsm", "xltx", "xltm"] as const;
const PPTX_EXTENSIONS = ["pptx", "ppsx", "potx"] as const;

export type InlineKnowledgeExtract = {
  text: string;
  contentType: string;
  extractionMode: string;
};

export type KnowledgeAttachmentSupportMode =
  | "inline_text"
  | "server_processing"
  | "not_supported_yet";

export type KnowledgeAttachmentSupport = {
  mode: KnowledgeAttachmentSupportMode;
  label: string;
  description: string;
};

const SERVER_PROCESSING_EXTENSIONS = [
  "mp3",
  "wav",
  "m4a",
  "aac",
  "ogg",
  "webm",
  "mp4",
  "mov",
] as const;

const NOT_SUPPORTED_YET_EXTENSIONS = [
  "doc",
  "xls",
  "xlsxb",
  "ppt",
  "heic",
  "heif",
] as const;

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "svg"] as const;

function fileExt(file: File): string {
  return file.name.split(".").pop()?.toLowerCase() ?? "";
}

function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("Expected binary file data."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsArrayBuffer(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Expected text file data."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
    reader.readAsText(file);
  });
}

async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  const buffer = await readAsArrayBuffer(file);
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    pages.push(
      content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" "),
    );
  }
  return pages.join("\n\n");
}

async function docxToText(file: File): Promise<string> {
  const mammoth = await import("mammoth");
  const buffer = await readAsArrayBuffer(file);
  const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
  const html = typeof result.value === "string" ? result.value : "";
  return new DOMParser().parseFromString(html, "text/html").body.innerText.trim();
}

function htmlToText(html: string): string {
  return new DOMParser().parseFromString(html, "text/html").body.innerText.trim();
}

function xmlToText(xml: string): string {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  const parserError = parsed.querySelector("parsererror");
  if (parserError) {
    return xml
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return (parsed.documentElement?.textContent ?? parsed.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function fileStem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function normalizeLine(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function sortZipPaths(paths: string[]): string[] {
  return [...paths].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  );
}

async function loadZip(file: File) {
  const JSZip = (await import("jszip")).default;
  return JSZip.loadAsync(await readAsArrayBuffer(file));
}

async function xlsxToText(file: File): Promise<string> {
  const zip = await loadZip(file);
  const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const sharedStrings = sharedStringsXml
    ? Array.from(
        new DOMParser()
          .parseFromString(sharedStringsXml, "application/xml")
          .getElementsByTagName("si"),
      ).map((node) => normalizeLine(node.textContent ?? ""))
    : [];

  const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
  const workbookSheetNames = workbookXml
    ? Array.from(
        new DOMParser()
          .parseFromString(workbookXml, "application/xml")
          .getElementsByTagName("sheet"),
      ).map((sheet) => sheet.getAttribute("name") || "")
    : [];

  const sheetPaths = sortZipPaths(
    Object.keys(zip.files).filter(
      (path) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(path) && !zip.files[path]?.dir,
    ),
  );

  const sheetTexts = await Promise.all(
    sheetPaths.map(async (path, index) => {
      const xml = await zip.file(path)?.async("string");
      if (!xml) return "";
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      const rows = Array.from(doc.getElementsByTagName("row"))
        .map((row) => {
          const values = Array.from(row.getElementsByTagName("c"))
            .map((cell) => {
              const cellType = cell.getAttribute("t");
              const valueNode = cell.getElementsByTagName("v")[0];
              const inlineNode = cell.getElementsByTagName("is")[0];
              if (cellType === "s" && valueNode?.textContent) {
                const sharedIndex = Number.parseInt(valueNode.textContent, 10);
                return sharedStrings[sharedIndex] ?? "";
              }
              if (cellType === "inlineStr" && inlineNode?.textContent) {
                return normalizeLine(inlineNode.textContent);
              }
              return normalizeLine(valueNode?.textContent ?? "");
            })
            .filter(Boolean);
          return values.join("\t");
        })
        .filter(Boolean);
      if (rows.length === 0) return "";
      const sheetName = workbookSheetNames[index] || `Sheet ${index + 1}`;
      return `${sheetName}\n${rows.join("\n")}`;
    }),
  );

  return sheetTexts.filter(Boolean).join("\n\n");
}

async function pptxToText(file: File): Promise<string> {
  const zip = await loadZip(file);
  const slidePaths = sortZipPaths(
    Object.keys(zip.files).filter(
      (path) => /^ppt\/slides\/slide\d+\.xml$/i.test(path) && !zip.files[path]?.dir,
    ),
  );
  const slideTexts = await Promise.all(
    slidePaths.map(async (path, index) => {
      const xml = await zip.file(path)?.async("string");
      if (!xml) return "";
      const text = xmlToText(xml);
      if (!text) return "";
      return `Slide ${index + 1}\n${text}`;
    }),
  );

  const notesPaths = sortZipPaths(
    Object.keys(zip.files).filter(
      (path) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(path) && !zip.files[path]?.dir,
    ),
  );
  const notesTexts = await Promise.all(
    notesPaths.map(async (path, index) => {
      const xml = await zip.file(path)?.async("string");
      if (!xml) return "";
      const text = xmlToText(xml);
      if (!text) return "";
      return `Slide ${index + 1} notes\n${text}`;
    }),
  );

  return [...slideTexts, ...notesTexts].filter(Boolean).join("\n\n");
}

async function subtitleToText(file: File): Promise<string> {
  const text = await readAsText(file);
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^\d+$/.test(line)) return false;
      if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}[.,]\d{3}$/.test(line)) {
        return false;
      }
      if (/^\d{2}:\d{2}[.:]\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}[.:]\d{2}\.\d{3}/.test(line)) {
        return false;
      }
      if (line.toUpperCase() === "WEBVTT") return false;
      return true;
    })
    .join("\n")
    .trim();
}

export function supportsInlineKnowledgeExtraction(file: File): boolean {
  const ext = fileExt(file);
  return [
    "pdf",
    "docx",
    "html",
    "htm",
    ...INLINE_TEXT_EXTENSIONS,
    ...XLSX_EXTENSIONS,
    ...PPTX_EXTENSIONS,
  ].includes(ext as
    | typeof INLINE_TEXT_EXTENSIONS[number]
    | typeof XLSX_EXTENSIONS[number]
    | typeof PPTX_EXTENSIONS[number]
    | "pdf"
    | "docx"
    | "html"
    | "htm");
}

export function classifyKnowledgeAttachmentSupport(
  file: File,
  capabilities?: AttachmentIngestCapabilities | null,
): KnowledgeAttachmentSupport {
  const ext = fileExt(file);
  const ocrSupported = capabilities?.image_ocr_supported ?? true;
  const pdfServerSupported = capabilities?.pdf_server_processing_supported ?? false;
  const legacyOfficeSupported = capabilities?.legacy_office_supported ?? false;

  if (ext === "pdf") {
    return {
      mode: "inline_text",
      label: "Ready now",
      description: pdfServerSupported
        ? "PDF text can be read immediately, and harder PDFs can fall back to server parsing after upload."
        : "PDF text can be read immediately, but scanned or image-only PDFs may still need a server parser.",
    };
  }
  if (supportsInlineKnowledgeExtraction(file)) {
    return {
      mode: "inline_text",
      label: "Ready now",
      description: "This file can be read into connected notes immediately.",
    };
  }
  if (SERVER_PROCESSING_EXTENSIONS.includes(ext as typeof SERVER_PROCESSING_EXTENSIONS[number])) {
    return {
      mode: "server_processing",
      label: "Server read",
      description: "This file depends on server-side transcription or parsing after upload.",
    };
  }
  if (IMAGE_EXTENSIONS.includes(ext as typeof IMAGE_EXTENSIONS[number])) {
    return {
      mode: ocrSupported ? "server_processing" : "not_supported_yet",
      label: ocrSupported ? "Server OCR" : "OCR gap",
      description: ocrSupported
        ? "This image can be turned into connected notes with server-side OCR after upload."
        : "Image-to-notes OCR is not configured on this server yet.",
      };
  }
  if (NOT_SUPPORTED_YET_EXTENSIONS.includes(ext as typeof NOT_SUPPORTED_YET_EXTENSIONS[number]) && !legacyOfficeSupported) {
    return {
      mode: "not_supported_yet",
      label: "Legacy gap",
      description: "This legacy file format is not yet converted into connected notes reliably.",
    };
  }
  if (NOT_SUPPORTED_YET_EXTENSIONS.includes(ext as typeof NOT_SUPPORTED_YET_EXTENSIONS[number]) && legacyOfficeSupported) {
    return {
      mode: "server_processing",
      label: "Server read",
      description: "This legacy format depends on server-side conversion after upload.",
    };
  }
  return {
    mode: "not_supported_yet",
    label: "Limited",
    description: "This attachment can be stored, but note synthesis support is not confirmed yet.",
  };
}

export async function extractInlineKnowledgeText(
  file: File,
): Promise<InlineKnowledgeExtract | null> {
  const ext = fileExt(file);
  if (ext === "pdf") {
    const text = (await pdfToText(file)).trim();
    return text ? { text, contentType: "text/plain", extractionMode: "client_pdf_text" } : null;
  }
  if (ext === "docx") {
    const text = (await docxToText(file)).trim();
    return text ? { text, contentType: "text/plain", extractionMode: "client_docx_text" } : null;
  }
  if (XLSX_EXTENSIONS.includes(ext as typeof XLSX_EXTENSIONS[number])) {
    const text = (await xlsxToText(file)).trim();
    return text ? { text, contentType: "text/tab-separated-values", extractionMode: "client_xlsx_text" } : null;
  }
  if (PPTX_EXTENSIONS.includes(ext as typeof PPTX_EXTENSIONS[number])) {
    const text = (await pptxToText(file)).trim();
    return text ? { text, contentType: "text/plain", extractionMode: "client_pptx_text" } : null;
  }
  if (["html", "htm"].includes(ext)) {
    const text = htmlToText(await readAsText(file));
    return text ? { text, contentType: "text/plain", extractionMode: "client_html_text" } : null;
  }
  if (["srt", "vtt"].includes(ext)) {
    const text = await subtitleToText(file);
    return text ? { text, contentType: "text/plain", extractionMode: "client_subtitle_text" } : null;
  }
  if (INLINE_TEXT_EXTENSIONS.includes(ext as typeof INLINE_TEXT_EXTENSIONS[number])) {
    const text = (await readAsText(file)).trim();
    return text ? { text, contentType: "text/plain", extractionMode: "client_text_read" } : null;
  }
  return null;
}
