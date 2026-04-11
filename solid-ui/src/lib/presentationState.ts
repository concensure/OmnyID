/**
 * Shared state engine for the universal UI Presentation layer.
 *
 * PresentationState is the single source of truth shared across all interactive
 * cards in a PresentationCardRenderer instance. Cards subscribe to specific keys
 * via SolidJS fine-grained signals — unrelated updates don't trigger re-renders.
 *
 * Domain detection maps any query/intent to a card set without server changes.
 */

import { createSignal } from "solid-js";

// ── Card type taxonomy ────────────────────────────────────────────────────────

export type CardType =
  // Universal — shown for all queries
  | "summary"           // Text overview + bullets
  | "key_facts"         // Key-value pairs extracted from bullets
  | "sources"           // Source links
  | "timeline"          // Chronological events
  | "definition"        // Concept/term definition
  | "comparison"        // Side-by-side comparison table
  // Science / chemistry
  | "compound"          // Compound overview (name, formula, class)
  | "element_breakdown" // Periodic-table-style element tiles + bond table
  | "properties_table"  // Scientific/physical properties grid
  // Travel
  | "map"               // Location card with coordinates
  | "weather"           // Weather conditions
  | "flights"           // Flight options
  | "accommodation"     // Hotel/stay options
  | "activities"        // Activities list
  | "itinerary"         // Day-by-day plan
  // Finance
  | "price_metrics"     // Price + key financial metrics
  // Food / recipe
  | "ingredients"       // Ingredient list
  | "steps"             // Step-by-step instructions
  // Developer
  | "code_snippet"      // Code block with syntax
  // People / Bio
  | "profile";          // Entity / person profile

// ── Domain classification ─────────────────────────────────────────────────────

export type PresentationDomain =
  | "travel"
  | "science"
  | "finance"
  | "recipe"
  | "dev"
  | "general";

const DOMAIN_SIGNALS: Record<PresentationDomain, string[]> = {
  travel:  ["trip", "travel", "flight", "hotel", "visit", "tour", "vacation", "itinerary", "destination", "airport"],
  science: ["compound", "molecule", "element", "chemical", "formula", "reaction", "atom", "bond", "chemistry", "biology", "physics", "co2", "h2o", "nacl"],
  finance: ["stock", "price", "market", "crypto", "bitcoin", "etf", "earnings", "revenue", "valuation", "invest"],
  recipe:  ["recipe", "cook", "bake", "ingredient", "how to make", "calories", "nutrition", "food", "dish", "meal"],
  dev:     ["code", "function", "algorithm", "implement", "javascript", "python", "rust", "typescript", "api", "sql", "regex"],
  general: [],
};

export function detectDomain(query: string): PresentationDomain {
  const q = query.toLowerCase();
  for (const [domain, signals] of Object.entries(DOMAIN_SIGNALS) as [PresentationDomain, string[]][]) {
    if (domain === "general") continue;
    if (signals.some((s) => q.includes(s))) return domain;
  }
  return "general";
}

// Default card sets per domain — ordered by priority (first = shown by default)
export const DOMAIN_DEFAULT_CARDS: Record<PresentationDomain, CardType[]> = {
  travel:  ["summary", "map", "weather", "flights", "accommodation", "activities", "itinerary"],
  science: ["summary", "compound", "element_breakdown", "properties_table", "key_facts", "sources"],
  finance: ["summary", "price_metrics", "key_facts", "timeline", "comparison", "sources"],
  recipe:  ["summary", "ingredients", "steps", "key_facts", "sources"],
  dev:     ["summary", "code_snippet", "key_facts", "definition", "sources"],
  general: ["summary", "key_facts", "timeline", "definition", "comparison", "sources"],
};

// ── Card spec ─────────────────────────────────────────────────────────────────

export type CardSpec = {
  id: string;
  type: CardType;
  /** Destination / subject label for multi-instance cards (e.g. "Tokyo") */
  subject?: string;
  title: string;
  /** Structured data extracted from server response bullets/summary */
  data: Record<string, unknown>;
};

// ── Shared state ──────────────────────────────────────────────────────────────

export type PresentationState = {
  query: string;
  domain: PresentationDomain;
  /** For travel: destination names. For science: compound name. For finance: ticker. etc. */
  subjects: string[];
  /** User-adjustable parameters (dates, count, budget, etc.) */
  params: Record<string, unknown>;
  /** Which card IDs are expanded */
  expanded: Set<string>;
  /** Which card IDs are hidden */
  hidden: Set<string>;
  /** Which card IDs are saved/favourited */
  saved: Set<string>;
};

export function createPresentationState(initial: Partial<PresentationState> = {}) {
  const [state, setRaw] = createSignal<PresentationState>({
    query: "",
    domain: "general",
    subjects: [],
    params: {},
    expanded: new Set(),
    hidden: new Set(),
    saved: new Set(),
    ...initial,
  });

  function setState(patch: Partial<PresentationState>) {
    setRaw((prev) => ({ ...prev, ...patch }));
  }
  function expand(id: string) {
    setRaw((p) => ({ ...p, expanded: new Set([...p.expanded, id]) }));
  }
  function collapse(id: string) {
    setRaw((p) => { const s = new Set(p.expanded); s.delete(id); return { ...p, expanded: s }; });
  }
  function hide(id: string) {
    setRaw((p) => ({ ...p, hidden: new Set([...p.hidden, id]) }));
  }
  function toggleSaved(id: string) {
    setRaw((p) => {
      const s = new Set(p.saved);
      s.has(id) ? s.delete(id) : s.add(id);
      return { ...p, saved: s };
    });
  }

  return { state, setState, expand, collapse, hide, toggleSaved } as const;
}

export type PresentationStateCtx = ReturnType<typeof createPresentationState>;

// ── Full content shape embedded in AFP ui_presentation view ───────────────────

export type PresentationContent = {
  presentation_id: string;
  query: string;
  summary: string;
  domain: PresentationDomain;
  subjects: string[];
  cards: CardSpec[];
};

// ── Bullet parser helpers ─────────────────────────────────────────────────────
// Parse structured data from free-text bullets the server returns.

export function parseKeyFacts(bullets: string[]): Array<{ key: string; value: string }> {
  return bullets
    .map((b) => {
      const colonIdx = b.indexOf(":");
      if (colonIdx > 0 && colonIdx < 40) {
        return { key: b.slice(0, colonIdx).trim(), value: b.slice(colonIdx + 1).trim() };
      }
      const dashIdx = b.indexOf(" — ");
      if (dashIdx > 0) {
        return { key: b.slice(0, dashIdx).trim(), value: b.slice(dashIdx + 3).trim() };
      }
      return null;
    })
    .filter((x): x is { key: string; value: string } => x !== null);
}

export function extractSubjects(query: string): string[] {
  // Extract proper nouns after "to", "about", "for", "of", or comma-separated lists.
  const patterns = [
    /\bto ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    /\band ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    /\babout ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
    /\bof ([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g,
  ];
  const found = new Set<string>();
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(query)) !== null) found.add(m[1]);
  }
  // Also grab chemical formula tokens (e.g. H2O, NaCl, CO2)
  const chemRe = /\b([A-Z][a-z]?\d*(?:[A-Z][a-z]?\d*)*)\b/g;
  let m: RegExpExecArray | null;
  while ((m = chemRe.exec(query)) !== null) {
    if (/\d/.test(m[1]) || m[1].length <= 6) found.add(m[1]);
  }
  return [...found].slice(0, 4);
}
