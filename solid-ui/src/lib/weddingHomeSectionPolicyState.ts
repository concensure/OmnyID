// @locs-version: 1.0

export const WEDDING_HOME_SECTION_IDS = [
  "vendor_search",
  "planning_basics",
  "quote_replies",
  "vendor_follow_up",
  "decision_focus",
  "overview",
  "next_step",
  "notice",
  "status",
  "threads",
  "resilience",
  "approval",
] as const;

export type WeddingHomeSectionId = typeof WEDDING_HOME_SECTION_IDS[number];

const WEDDING_HOME_SECTION_SET = new Set<string>(WEDDING_HOME_SECTION_IDS);

const WEDDING_HOME_VISIBLE_SECTION_SET = new Set<WeddingHomeSectionId>([
  "vendor_search",
  "planning_basics",
  "quote_replies",
  "vendor_follow_up",
  "decision_focus",
  "overview",
]);

export function isWeddingHomeSectionId(value: unknown): value is WeddingHomeSectionId {
  return typeof value === "string" && WEDDING_HOME_SECTION_SET.has(value);
}

export function normalizeWeddingHomeSectionOrder(value: unknown): WeddingHomeSectionId[] {
  const raw = Array.isArray(value) ? value : [];
  const seen = new Set<WeddingHomeSectionId>();
  const order: WeddingHomeSectionId[] = [];
  for (const candidate of raw) {
    if (!isWeddingHomeSectionId(candidate)) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    order.push(candidate);
  }
  for (const id of WEDDING_HOME_SECTION_IDS) {
    if (!seen.has(id)) order.push(id);
  }
  return order;
}

export function shouldShowWeddingHomeSection(id: WeddingHomeSectionId): boolean {
  return WEDDING_HOME_VISIBLE_SECTION_SET.has(id);
}
