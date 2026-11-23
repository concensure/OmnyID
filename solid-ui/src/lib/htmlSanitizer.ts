// @locs-version: 1.0
/**
 * DOM-based HTML sanitizer — used for both email and Markdown rendering.
 *
 * Uses the browser's DOMParser to parse raw HTML, then walks the tree and:
 *   - Removes any element not on the allowlist (unwrapping children)
 *   - Strips every attribute not on the per-tag allowlist
 *   - Validates href/src schemes against per-mode rules
 *   - Sanitizes inline style declarations to a safe property set (email only)
 */

interface SanitizerConfig {
  allowedTags: Set<string>;
  /** Attributes allowed on all tags in this mode */
  globalAttrs: string[];
  /** Extra per-tag attributes on top of globalAttrs */
  tagAttrs: Record<string, string[]>;
  /** Href scheme validator */
  safeHref: RegExp;
  /** Src scheme validator (undefined = no src allowed) */
  safeSrc?: RegExp;
  /** Allow inline style attributes (email mode only) */
  allowStyle: boolean;
  /** Callback run on each allowed element after attr strip */
  postProcess?: (el: Element, tag: string) => void;
}

// ── Email mode config ─────────────────────────────────────────────────────────

const EMAIL_CONFIG: SanitizerConfig = {
  allowedTags: new Set([
    "p", "br", "b", "strong", "i", "em", "u", "s", "del", "strike",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "blockquote", "pre", "code",
    "a", "img",
    "table", "thead", "tbody", "tr", "th", "td",
    "div", "span",
    "hr",
  ]),
  globalAttrs: ["class", "style", "dir"],
  tagAttrs: {
    a:   ["href", "title", "target", "rel"],
    img: ["src", "alt", "width", "height", "title"],
    th:  ["colspan", "rowspan"],
    td:  ["colspan", "rowspan"],
  },
  safeHref: /^(https?:|mailto:)/i,
  // Raster image data URIs only — SVG data URIs are excluded (can carry scripts)
  safeSrc: /^(https?:|data:image\/(png|jpeg|jpg|gif|webp|avif);base64,)/i,
  allowStyle: true,
  postProcess(el, tag) {
    if (tag === "a") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
  },
};

// ── Markdown mode config ──────────────────────────────────────────────────────
// Stricter than email: no style attributes, no div/span/img, add task-list inputs.
// Only language-* classes are preserved on <code> for future syntax highlighting.

const MARKDOWN_CONFIG: SanitizerConfig = {
  allowedTags: new Set([
    "p", "br", "b", "strong", "i", "em", "u", "s", "del", "strike",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li",
    "blockquote", "pre", "code",
    "a",
    "table", "thead", "tbody", "tr", "th", "td",
    "hr",
    "input",  // task-list checkboxes
  ]),
  globalAttrs: [],  // no class/style on arbitrary elements
  tagAttrs: {
    a:     ["href", "title"],   // rel/target are force-set in postProcess
    code:  ["class"],           // restricted to language-* below
    input: ["type", "checked", "disabled"],
    th:    ["colspan", "rowspan", "align"],
    td:    ["colspan", "rowspan", "align"],
  },
  safeHref: /^(https?:|mailto:|#)/i,
  allowStyle: false,
  postProcess(el, tag) {
    if (tag === "a") {
      const href = el.getAttribute("href") ?? "";
      el.classList.add("md-link");
      // Only open external URLs in a new tab
      if (/^https?:\/\//i.test(href)) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      } else {
        el.removeAttribute("target");
        el.removeAttribute("rel");
      }
    }
    if (tag === "code") {
      // Strip any class that isn't a language identifier
      const cls = el.getAttribute("class") ?? "";
      if (cls && !/^language-[\w-]+$/.test(cls.trim())) {
        el.removeAttribute("class");
      }
    }
    if (tag === "input") {
      // Task-list checkboxes must always be disabled (read-only in rendered view)
      el.setAttribute("disabled", "");
      // Only allow checkbox type
      if (el.getAttribute("type") !== "checkbox") el.remove();
    }
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

export function sanitizeEmailHtml(rawHtml: string): string {
  return sanitize(rawHtml, EMAIL_CONFIG);
}

export function sanitizeMarkdownHtml(rawHtml: string): string {
  return sanitize(rawHtml, MARKDOWN_CONFIG);
}

// ── Core sanitizer ────────────────────────────────────────────────────────────

function sanitize(rawHtml: string, cfg: SanitizerConfig): string {
  const doc = new DOMParser().parseFromString(rawHtml, "text/html");
  walkElement(doc.body, cfg);
  return doc.body.innerHTML;
}

function walkElement(parent: Node, cfg: SanitizerConfig): void {
  const children = Array.from(parent.childNodes);

  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) continue;

    if (child.nodeType !== Node.ELEMENT_NODE) {
      parent.removeChild(child);
      continue;
    }

    const el    = child as Element;
    const tag   = el.tagName.toLowerCase();

    if (!cfg.allowedTags.has(tag)) {
      // Unwrap: hoist children in place
      const frag = document.createDocumentFragment();
      while (el.firstChild) frag.appendChild(el.firstChild);
      parent.replaceChild(frag, el);
      continue;
    }

    stripAttributes(el, tag, cfg);
    cfg.postProcess?.(el, tag);
    walkElement(el, cfg);
  }
}

function stripAttributes(el: Element, tag: string, cfg: SanitizerConfig): void {
  const allowed = new Set([...cfg.globalAttrs, ...(cfg.tagAttrs[tag] ?? [])]);
  const names   = Array.from(el.attributes).map(a => a.name);

  for (const name of names) {
    if (!allowed.has(name)) {
      el.removeAttribute(name);
      continue;
    }

    const value = el.getAttribute(name) ?? "";

    if (name === "href" && !cfg.safeHref.test(value)) {
      el.setAttribute("href", "#");
      continue;
    }
    if (name === "src") {
      if (!cfg.safeSrc || !cfg.safeSrc.test(value)) {
        el.removeAttribute(name);
      }
      continue;
    }
    if (name === "style") {
      if (!cfg.allowStyle) {
        el.removeAttribute(name);
      } else {
        const safe = sanitizeStyle(value);
        if (safe) el.setAttribute("style", safe);
        else      el.removeAttribute("style");
      }
    }
  }
}

const SAFE_STYLE_PROPS = new Set([
  "color", "background-color", "font-weight", "font-style",
  "text-decoration", "text-align", "font-size", "font-family",
  "padding", "margin", "border", "border-collapse",
  "width", "max-width", "min-width",
]);

function sanitizeStyle(raw: string): string {
  const safe: string[] = [];
  for (const decl of raw.split(";")) {
    const colonIdx = decl.indexOf(":");
    if (colonIdx === -1) continue;
    const prop  = decl.slice(0, colonIdx).trim().toLowerCase();
    const value = decl.slice(colonIdx + 1).trim();
    if (!prop || !value) continue;
    if (!SAFE_STYLE_PROPS.has(prop)) continue;
    // Block CSS expression() and url()-based injections
    if (/expression\s*\(|javascript\s*:|url\s*\(/i.test(value)) continue;
    safe.push(`${prop}: ${value}`);
  }
  return safe.join("; ");
}
