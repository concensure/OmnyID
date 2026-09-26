// @locs-version: 1.0
/**
 * Markdown â†’ safe HTML for AFP messages.
 *
 * Pipeline:
 *   marked.parse(md)          â€” CommonMark + GFM, default renderer
 *   sanitizeMarkdownHtml(html) â€” DOM-based allowlist sanitizer:
 *                                 â€¢ escapes block-level raw HTML
 *                                 â€¢ strips arbitrary attributes/classes
 *                                 â€¢ javascript:/data: hrefs â†’ "#"
 *                                 â€¢ adds noopener on external links
 *                                 â€¢ task-list checkboxes forced disabled
 *
 * Inline safe tags emitted by tiptapMarkdown.ts (<u>, <s>, <mark>)
 * survive because they are on the sanitizer allowlist.
 */

import { marked } from "marked";
import { sanitizeMarkdownHtml } from "@/lib/htmlSanitizer";

marked.use({ gfm: true, breaks: true });

/**
 * Convert an AFP Markdown string to safe HTML.
 * Returns an empty string for blank/nullish input.
 */
export function renderMarkdown(md: string | undefined | null): string {
  if (!md?.trim()) return "";
  const raw = marked.parse(md) as string;
  return sanitizeMarkdownHtml(raw);
}
