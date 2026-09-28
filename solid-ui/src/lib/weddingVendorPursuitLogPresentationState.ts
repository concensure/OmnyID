// @locs-version: 2.0
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import {
  cleanWeddingProductionLabel,
  cleanWeddingProductionLabels,
} from "@/lib/weddingProductionLabelState";

export type WeddingVendorPursuitLogReason =
  | "not_suitable"
  | "too_expensive"
  | "no_availability"
  | "chose_another_vendor"
  | "unresponsive"
  | "other";

export type WeddingVendorPursuitLogCard = {
  id: string;
  vendorLabel: string;
  title: string;
  reasonLabel: string;
  detailLabel: string;
  closedAtLabel: string | null;
  closedAtIso: string | null;
  categoryLabel: string | null;
  sourceLabel: string | null;
  noteLabel: string | null;
  metadataLabels: string[];
};

function clean(value: unknown, maxLength = 180): string {
  return cleanWeddingProductionLabel(
    typeof value === "string" ? value : null,
    { maxLength, wordAware: true },
  ) ?? "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function isVendorPursuitLogTask(task: WeddingPlanningTaskItem): boolean {
  const metadata = record(task.metadata);
  return metadata.vendor_outreach_pursuit_status === "not_pursuing"
    || (
      metadata.outreach_escalation_stage === "closed"
      && Boolean(clean(metadata.vendor_outreach_line_item_id))
      && task.reviewStatus === "ignored"
    );
}

function pursuitReasonLabel(reason: unknown): string {
  if (reason === "too_expensive") return "Too expensive";
  if (reason === "no_availability") return "No availability";
  if (reason === "chose_another_vendor") return "Chose another vendor";
  if (reason === "unresponsive") return "Unresponsive";
  if (reason === "not_suitable") return "Not suitable";
  return "Other reason";
}

function dateParts(value: unknown): { label: string | null; iso: string | null; time: number } {
  const raw = clean(value, 80);
  if (!raw) return { label: null, iso: null, time: 0 };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { label: raw, iso: null, time: 0 };
  const iso = date.toISOString();
  return {
    label: `Closed ${iso.slice(0, 10)}`,
    iso,
    time: date.getTime(),
  };
}

function noteLabel(task: WeddingPlanningTaskItem, metadata: Record<string, unknown>): string | null {
  const direct = clean(metadata.vendor_outreach_closure_note, 220);
  if (direct) return direct;
  const notes = clean(task.notes, 260);
  const noteMatch = notes.match(/\bNote:\s*([^]+?)(?:\s*$)/i);
  return clean(noteMatch?.[1]?.replace(/\.$/, ""), 220) || null;
}

function titleFor(vendorLabel: string, reasonLabel: string): string {
  return `Stopped pursuing ${vendorLabel}: ${reasonLabel}`;
}

export function buildWeddingVendorPursuitLogCards(
  taskItems: readonly WeddingPlanningTaskItem[] | null | undefined,
): WeddingVendorPursuitLogCard[] {
  const cards = (taskItems ?? [])
    .filter(isVendorPursuitLogTask)
    .map((task) => {
      const metadata = record(task.metadata);
      const fallbackVendor = clean(task.title.replace(/^Stopped pursuing\s+/i, ""), 120);
      const vendorLabel = clean(metadata.vendor_outreach_vendor_label, 120) || fallbackVendor || "Vendor";
      const categoryLabel = clean(metadata.vendor_outreach_category_label, 80) || null;
      const sourceLabel = clean(metadata.vendor_outreach_source_label, 120) || null;
      const reasonLabel = pursuitReasonLabel(metadata.vendor_outreach_closure_reason);
      const closed = dateParts(metadata.vendor_outreach_closed_at);
      const note = noteLabel(task, metadata);
      return {
        id: task.id,
        vendorLabel,
        title: titleFor(vendorLabel, reasonLabel),
        reasonLabel,
        detailLabel: `${vendorLabel} was removed from active vendor follow-up.`,
        closedAtLabel: closed.label,
        closedAtIso: closed.iso,
        categoryLabel,
        sourceLabel,
        noteLabel: note,
        metadataLabels: cleanWeddingProductionLabels([
          categoryLabel,
          sourceLabel,
          closed.label,
        ], { maxLength: 120, wordAware: true }),
        sortTime: closed.time,
      };
    });

  return cards
    .sort((a, b) => b.sortTime - a.sortTime || a.vendorLabel.localeCompare(b.vendorLabel))
    .map(({ sortTime: _sortTime, ...card }) => card);
}
