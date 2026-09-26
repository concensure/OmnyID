#!/usr/bin/env node
// Converts an HTML file to PDF using Playwright headless Chromium.
// Usage: node scripts/pdf-from-html.mjs <input.html> <output.pdf>
// Exit code 0 on success, non-zero on failure.
import { chromium } from "playwright";
import { readFileSync, statSync } from "fs";

const MAX_HTML_BYTES = 32 * 1024 * 1024; // 32 MB guard
const PAGE_TIMEOUT_MS = 25_000; // 25s; must fit within Rust's 30s kill window

const [, , inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: pdf-from-html.mjs <input.html> <output.pdf>");
  process.exit(1);
}

let html;
try {
  const { size } = statSync(inputPath);
  if (size > MAX_HTML_BYTES) {
    console.error(`Input file too large: ${size} bytes (max ${MAX_HTML_BYTES})`);
    process.exit(2);
  }
  html = readFileSync(inputPath, "utf8");
} catch (e) {
  console.error(`Failed to read ${inputPath}: ${e.message}`);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.setDefaultTimeout(PAGE_TIMEOUT_MS);
  page.setDefaultNavigationTimeout(PAGE_TIMEOUT_MS);
  // networkidle can stall indefinitely for external resources; domcontentloaded is safer.
  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
  await page.pdf({
    path: outputPath,
    format: "A4",
    printBackground: true,
    margin: { top: "20mm", bottom: "20mm", left: "15mm", right: "15mm" },
  });
} finally {
  await browser.close();
}
