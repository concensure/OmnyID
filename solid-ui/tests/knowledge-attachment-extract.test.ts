import test from "node:test";
import assert from "node:assert/strict";

import { classifyKnowledgeAttachmentSupport } from "../src/lib/knowledgeAttachmentExtract.ts";

test("classifyKnowledgeAttachmentSupport marks images as OCR gap when server OCR is unavailable", () => {
  const file = new File(["fake"], "whiteboard.png", { type: "image/png" });
  const support = classifyKnowledgeAttachmentSupport(file, {
    image_ocr_supported: false,
    pdf_server_processing_supported: false,
    legacy_office_supported: false,
  });

  assert.equal(support.mode, "not_supported_yet");
  assert.equal(support.label, "OCR gap");
});

test("classifyKnowledgeAttachmentSupport marks legacy office files as server-readable when enabled", () => {
  const file = new File(["fake"], "week3-notes.ppt", { type: "application/vnd.ms-powerpoint" });
  const support = classifyKnowledgeAttachmentSupport(file, {
    image_ocr_supported: true,
    pdf_server_processing_supported: false,
    legacy_office_supported: true,
  });

  assert.equal(support.mode, "server_processing");
  assert.equal(support.label, "Server read");
});

test("classifyKnowledgeAttachmentSupport explains server fallback for PDFs when configured", () => {
  const file = new File(["fake"], "lecture-scan.pdf", { type: "application/pdf" });
  const support = classifyKnowledgeAttachmentSupport(file, {
    image_ocr_supported: true,
    pdf_server_processing_supported: true,
    legacy_office_supported: false,
  });

  assert.equal(support.mode, "inline_text");
  assert.match(support.description, /fall back to server parsing/i);
});
