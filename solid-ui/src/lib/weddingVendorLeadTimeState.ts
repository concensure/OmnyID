// @locs-version: 1.0
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import { WEDDING_VENDOR_CHECKLIST, normalizeWeddingVendorSelections, weddingVendorSelectionLabels } from "@/lib/weddingVendorChecklistState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
} from "@/lib/weddingPlanningTemplateState";
import { WEDDING_VENDOR_LEAD_TIME_RULES } from "@/lib/weddingTaskCatalogueState";
import { WEDDING_FORMAT_MUST_DECIDE_FIRST, type WeddingFormat } from "@/lib/weddingFormatState";

export type WeddingVendorLeadTimeCategory = {
  categoryId: string;
  label: string;
  idealLeadMonths: readonly [number, number];
  hardDeadlineMonths?: number;
  mustDecideFirst?: boolean;
};

export type WeddingVendorLeadTimeRecommendation = {
  categoryId: string;
  label: string;
  idealLeadMonths: readonly [number, number];
  hardDeadlineMonths: number | null;
  mustDecideFirst: boolean;
  urgencyScore: number;
  rankWeight: number;
  windowOpenAt: string | null;
  windowCloseAt: string | null;
  timingLabel: string;
  reasonLabel: string;
  status: "early" | "open" | "closing" | "late" | "unknown_date";
};

const LEAD_TIME_MONTHS = Object.fromEntries(WEDDING_VENDOR_LEAD_TIME_RULES.map((rule) => [rule.categoryId, {
  idealLeadMonths: rule.idealLeadMonths,
  hardDeadlineMonths: rule.hardDeadlineMonths,
  mustDecideFirst: rule.mustDecideFirst,
}])) as Record<string, Omit<WeddingVendorLeadTimeCategory, "categoryId" | "label">>;

const DAY_MS = 86_400_000;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function uniqueStrings(values: readonly unknown[], limit = 48): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function exactDate(value: unknown): Date | null {
  const label = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return null;
  const parsed = new Date(`${label}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function monthDistance(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (DAY_MS * 30.4375);
}

function canonicalLeadTimeCategories(): WeddingVendorLeadTimeCategory[] {
  return WEDDING_VENDOR_CHECKLIST.filter((item) => item.id !== "officiant").map((item) => ({
    categoryId: item.id,
    label: item.label,
    ...(LEAD_TIME_MONTHS[item.id] ?? { idealLeadMonths: [3, 6] as const, hardDeadlineMonths: 2 }),
  }));
}

export const WEDDING_VENDOR_LEAD_TIME_CATEGORIES: WeddingVendorLeadTimeCategory[] = canonicalLeadTimeCategories();

export function weddingVendorLeadTimeCoverageState(): { checklistCount: number; tableCount: number; missingCategoryIds: string[] } {
  const tableIds = new Set(WEDDING_VENDOR_LEAD_TIME_CATEGORIES.map((item) => item.categoryId));
  return {
    checklistCount: WEDDING_VENDOR_CHECKLIST.length,
    tableCount: WEDDING_VENDOR_LEAD_TIME_CATEGORIES.length,
    missingCategoryIds: WEDDING_VENDOR_CHECKLIST.map((item) => item.id).filter((id) => id !== "officiant" && !tableIds.has(id)),
  };
}

export function weddingVendorMustDecideFirstCategories(format?: WeddingFormat | null): WeddingVendorLeadTimeCategory[] {
  const ids = new Set(format ? WEDDING_FORMAT_MUST_DECIDE_FIRST[format] : WEDDING_VENDOR_LEAD_TIME_CATEGORIES.filter((item) => item.mustDecideFirst).map((item) => item.categoryId));
  return WEDDING_VENDOR_CHECKLIST.filter((item) => ids.has(item.id)).map((item) => {
    const known = WEDDING_VENDOR_LEAD_TIME_CATEGORIES.find((category) => category.categoryId === item.id);
    return known ?? { categoryId: item.id, label: item.label, idealLeadMonths: [6, 12] as const, hardDeadlineMonths: 2, mustDecideFirst: true };
  });
}

function terminalCategoryIds(input: {
  artifacts?: readonly WeddingArtifactInput[] | null;
  selectedDecisionItems?: readonly WeddingDecisionProjectionInput[] | null;
}): Set<string> {
  const labels = uniqueStrings([
    ...(input.selectedDecisionItems ?? []).flatMap((decision) => [
      decision.artifactTitle,
      decision.selectedOption.label,
      ...stringArray(record(decision.metadata).vendorCategories),
      ...stringArray(record(decision.metadata).vendor_categories),
    ]),
    ...(input.artifacts ?? []).flatMap((artifact) => {
      const metadata = record(artifact.metadata);
      const booked = metadata.vendor_booking_state === "booked"
        || metadata.vendor_pursuit_status === "booked"
        || metadata.wedding_vendor_booked === true
        || /booked|selected vendor|deposit paid/i.test(`${artifact.title}\n${artifact.bodyText}`);
      return booked ? [
        artifact.title,
        ...stringArray(metadata.vendorCategories),
        ...stringArray(metadata.vendor_categories),
      ] : [];
    }),
  ]);
  return new Set(normalizeWeddingVendorSelections(labels));
}

export function buildWeddingVendorLeadTimeRecommendations(input: {
  weddingFormat?: WeddingFormat | null;
  weddingDateOrSeason?: string | null;
  now?: Date | string | null;
  selectedCategoryIds?: readonly unknown[] | null;
  skippedCategoryIds?: readonly unknown[] | null;
  artifacts?: readonly WeddingArtifactInput[] | null;
  selectedDecisionItems?: readonly WeddingDecisionProjectionInput[] | null;
}): WeddingVendorLeadTimeRecommendation[] {
  const now = input.now instanceof Date ? input.now : input.now ? new Date(input.now) : new Date();
  const usableNow = Number.isNaN(now.getTime()) ? new Date() : now;
  const weddingDate = exactDate(input.weddingDateOrSeason);
  const selected = new Set(normalizeWeddingVendorSelections(input.selectedCategoryIds));
  const skipped = new Set(normalizeWeddingVendorSelections(input.skippedCategoryIds));
  const terminal = terminalCategoryIds(input);
  const formatFirst = new Set(weddingVendorMustDecideFirstCategories(input.weddingFormat).map((item) => item.categoryId));
  return WEDDING_VENDOR_LEAD_TIME_CATEGORIES
    .filter((category) => !skipped.has(category.categoryId))
    .filter((category) => !terminal.has(category.categoryId))
    .map((category): WeddingVendorLeadTimeRecommendation => {
      const [minMonths, maxMonths] = category.idealLeadMonths;
      if (!weddingDate) {
        const hasPlanningWindow = clean(input.weddingDateOrSeason).length > 0;
        return {
          categoryId: category.categoryId,
          label: category.label,
          idealLeadMonths: category.idealLeadMonths,
          hardDeadlineMonths: category.hardDeadlineMonths ?? null,
          mustDecideFirst: formatFirst.has(category.categoryId),
          urgencyScore: formatFirst.has(category.categoryId) ? 30 : selected.has(category.categoryId) ? 18 : 8,
          rankWeight: formatFirst.has(category.categoryId) ? 42 : selected.has(category.categoryId) ? 28 : 16,
          windowOpenAt: null,
          windowCloseAt: null,
          status: "unknown_date",
          timingLabel: `${category.label}: ideally research ${minMonths}-${maxMonths} months before the wedding.`,
          reasonLabel: formatFirst.has(category.categoryId)
            ? hasPlanningWindow
              ? "Use the saved date or season as a search range, then confirm exact availability before treating a venue as viable."
              : "Venue availability can help set the wedding date; compare suitable options first, then confirm an exact date before booking."
            : "Capture an exact wedding date to place this vendor category on the calendar.",
        };
      }
      const monthsUntilWedding = monthDistance(usableNow, weddingDate);
      const windowOpenAt = addUtcMonths(weddingDate, -maxMonths);
      const windowCloseAt = addUtcMonths(weddingDate, -minMonths);
      const monthsUntilClose = monthsUntilWedding - minMonths;
      let status: WeddingVendorLeadTimeRecommendation["status"] = "early";
      if (monthsUntilWedding < minMonths) status = "late";
      else if (monthsUntilWedding <= minMonths + 1) status = "closing";
      else if (monthsUntilWedding <= maxMonths) status = "open";
      const urgencyScore = status === "late"
        ? 100
        : status === "closing"
          ? 86
          : status === "open"
            ? Math.max(45, Math.round(76 - monthsUntilClose * 3))
            : Math.max(0, Math.round(36 - (monthsUntilWedding - maxMonths) * 2));
      return {
        categoryId: category.categoryId,
        label: category.label,
        idealLeadMonths: category.idealLeadMonths,
        hardDeadlineMonths: category.hardDeadlineMonths ?? null,
        mustDecideFirst: formatFirst.has(category.categoryId),
        urgencyScore,
        rankWeight: 18 + urgencyScore + (formatFirst.has(category.categoryId) ? 10 : 0) + (selected.has(category.categoryId) ? 8 : 0),
        windowOpenAt: isoDate(windowOpenAt),
        windowCloseAt: isoDate(windowCloseAt),
        status,
        timingLabel: status === "late"
          ? `${category.label} is past its ideal ${minMonths}-${maxMonths} month research window.`
          : status === "closing"
            ? `${category.label}'s ideal research window is closing soon.`
            : status === "open"
              ? `${category.label}'s ideal research window is open now.`
              : `${category.label}'s ideal research window opens ${isoDate(windowOpenAt)}.`,
        reasonLabel: `Ideal lead time is ${minMonths}-${maxMonths} months before the wedding; deadline buffer is ${category.hardDeadlineMonths ?? minMonths} month${(category.hardDeadlineMonths ?? minMonths) === 1 ? "" : "s"}.`,
      };
    })
    .filter((item) => item.status !== "early" || item.urgencyScore > 0)
    .sort((left, right) => right.rankWeight - left.rankWeight || left.label.localeCompare(right.label));
}

function existingLeadTimeKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const task of taskItems) {
    keys.add(task.id);
    const metadata = record(task.metadata);
    const categoryId = clean(metadata.vendor_lead_time_category_id);
    if (metadata.vendor_lead_time_research_task === true && categoryId) keys.add(categoryId);
  }
  return keys;
}

export function buildWeddingVendorLeadTimeTaskItems(input: {
  weddingDateOrSeason?: string | null;
  selectedCategoryIds?: readonly unknown[] | null;
  skippedCategoryIds?: readonly unknown[] | null;
  artifacts?: readonly WeddingArtifactInput[] | null;
  selectedDecisionItems?: readonly WeddingDecisionProjectionInput[] | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  metadata?: unknown;
  now?: Date | string | null;
}): WeddingPlanningTaskItem[] {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existingKeys = existingLeadTimeKeys(input.existingTaskItems ?? []);
  return buildWeddingVendorLeadTimeRecommendations(input)
    .filter((recommendation) => recommendation.status !== "unknown_date" || recommendation.mustDecideFirst)
    .filter((recommendation) => !existingKeys.has(recommendation.categoryId))
    .map((recommendation): WeddingPlanningTaskItem => ({
      id: `wedding_vendor_lead_time:${safeWeddingLabel(recommendation.categoryId)}:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
      title: `Search for ${recommendation.label.toLowerCase()}`,
      kind: "research",
      dueLabel: recommendation.windowCloseAt
        ? `Research window closes ${recommendation.windowCloseAt}`
        : recommendation.timingLabel,
      dueAt: recommendation.windowOpenAt ?? undefined,
      priority: recommendation.status === "late" || recommendation.status === "closing" ? "high" : "normal",
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        ...metadata,
        vendor_lead_time_research_task: true,
        vendor_lead_time_category_id: recommendation.categoryId,
        vendor_lead_time_label: recommendation.label,
        vendor_lead_time_status: recommendation.status,
        vendor_lead_time_must_decide_first: recommendation.mustDecideFirst,
        vendor_lead_time_urgency_score: recommendation.urgencyScore,
        vendor_lead_time_rank_weight: recommendation.rankWeight,
        vendor_lead_time_window_open_at: recommendation.windowOpenAt,
        vendor_lead_time_window_close_at: recommendation.windowCloseAt,
        vendor_lead_time_ideal_months: recommendation.idealLeadMonths,
        vendor_lead_time_hard_deadline_months: recommendation.hardDeadlineMonths,
        vendor_search_review_task: true,
        vendor_search_action_id: `lead-time-${recommendation.categoryId}`,
        vendor_search_categories: weddingVendorSelectionLabels([recommendation.categoryId]),
        vendor_search_scope: "lead_time_category",
        wedding_workspace_menu: "response_queue",
        preparation_checklist: true,
        preparation_checklist_item: "vendor_research_timing",
        user_selectable: true,
        can_deselect_before_commit: true,
        resurface_policy: {
          kind: "vendor_lead_time",
          resurface_before_months: recommendation.hardDeadlineMonths ?? recommendation.idealLeadMonths[0],
          window_close_at: recommendation.windowCloseAt,
        },
        searchable_terms: uniqueStrings([
          "vendor research right now",
          recommendation.label,
          recommendation.categoryId,
          ...weddingVendorSelectionLabels([recommendation.categoryId]),
          recommendation.timingLabel,
          recommendation.reasonLabel,
          metadata.weddingPlanId,
          metadata.responseWorkspaceId,
        ]),
      },
      notes: `${recommendation.timingLabel} ${recommendation.reasonLabel} Use the existing vendor research flow; do not contact vendors without approval.`,
    }));
}
