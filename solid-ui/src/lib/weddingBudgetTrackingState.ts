// @locs-version: 2.1
import type { WeddingPersistedDecisionRecord } from "@/lib/weddingPersistedWorkspaceState";
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";
import {
  isWeddingBudgetAllocationDecisionRecord,
  weddingBudgetAllocationFromDecisionRecords,
  type WeddingBudgetAllocationCategoryAmount,
} from "@/lib/weddingBudgetAllocationState";
import {
  buildWeddingBudgetInsightsState,
  type WeddingBudgetInsightsState,
} from "@/lib/weddingBudgetInsightsState";
import {
  isWeddingBudgetContributionDecisionRecord,
  weddingBudgetContributionsFromDecisionRecords,
} from "@/lib/weddingBudgetContributionState";

export type WeddingBudgetLinePriceStatus = "quoted" | "projected" | "unknown";

export type WeddingBudgetLineItem = {
  id: string;
  linkedArtifactId: string | null;
  vendorName: string;
  categoryLabel: string;
  amount: number | null;
  currency: string;
  priceStatus: WeddingBudgetLinePriceStatus;
  sourceLabel: string;
  confidenceLabel: string;
  warningLabels: string[];
  rowCells: string[];
};

export type WeddingBudgetCategoryRollup = {
  categoryLabel: string;
  amount: number;
  itemCount: number;
  projectedCount: number;
  quotedCount: number;
  unknownCount: number;
  currency: string;
};

export type WeddingBudgetTaskCandidate = {
  id: string;
  title: string;
  categoryLabel: string;
  vendorName: string;
  priorityLabel: string;
  reasonLabel: string;
  sourceLabel: string;
};

export type WeddingBudgetPaymentTaskCandidate = {
  id: string;
  title: string;
  categoryLabel: string;
  vendorName: string;
  dueAmountLabel: string | null;
  dueDateLabel: string | null;
  dueAt: string | null;
  priorityLabel: string;
  reasonLabel: string;
  sourceLabel: string;
  linkedArtifactId: string | null;
};

export type WeddingBudgetTrackingState = {
  lineItems: WeddingBudgetLineItem[];
  categoryRollups: WeddingBudgetCategoryRollup[];
  quoteTaskCandidates: WeddingBudgetTaskCandidate[];
  paymentTaskCandidates: WeddingBudgetPaymentTaskCandidate[];
  /** The couple's own set-and-allocated budget (see weddingBudgetAllocationState.ts), distinct
   * from categoryRollups, which tracks actual selected-vendor spend per category. */
  budgetAllocation: WeddingBudgetAllocationCategoryAmount[];
  insights: WeddingBudgetInsightsState;
  budgetTargetAmount: number | null;
  remainingAmount: number | null;
  overBudgetAmount: number;
  budgetUtilizationPercent: number | null;
  budgetStatusLabel: string;
  totalProjectedAmount: number;
  totalQuotedAmount: number;
  totalKnownAmount: number;
  unknownCount: number;
  projectedCount: number;
  quotedCount: number;
  summaryLabel: string;
  warningLabels: string[];
};

export type WeddingBudgetQuoteTaskInput = {
  budgetTracking?: WeddingBudgetTrackingState | null;
  metadata?: unknown;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
};

export type WeddingBudgetPaymentTaskInput = WeddingBudgetQuoteTaskInput;
export type WeddingBudgetVendorOutreachTaskInput = WeddingBudgetQuoteTaskInput;

export type WeddingVendorPursuitClosureReason =
  | "not_suitable"
  | "too_expensive"
  | "no_availability"
  | "chose_another_vendor"
  | "unresponsive"
  | "other";

export type WeddingVendorPursuitClosureTaskInput = {
  lineItem: WeddingBudgetLineItem;
  metadata?: unknown;
  reason?: WeddingVendorPursuitClosureReason | null;
  note?: string | null;
  closedAt?: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function usableSourceUrls(values: readonly unknown[] | null | undefined): string[] {
  return (values ?? [])
    .map((value) => clean(value))
    .filter(remoteHttpUrl);
}

function remoteHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return hostname !== "localhost"
      && hostname !== "127.0.0.1"
      && hostname !== "0.0.0.0"
      && hostname !== "::1"
      && hostname !== "[::1]";
  } catch {
    return false;
  }
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function metadataSupertags(artifact: WeddingArtifactInput): string[] {
  const metadata = metadataRecord(artifact.metadata);
  const tags = metadata.supertags ?? metadata.super_tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0) : [];
}

function importedPrivateLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

function importedPrivateArtifact(artifact: WeddingArtifactInput): boolean {
  return metadataSupertags(artifact).some((tag) => /^wedding_import(?:$|:)/i.test(tag))
    || clean(artifact.id).startsWith("wedding_import:")
    || [
      artifact.title,
      ...(artifact.sourceLabels ?? []),
    ].map(clean).some(importedPrivateLabel);
}

function artifactSourceLabelForBudget(artifact: WeddingArtifactInput, fallback: string): string {
  if (importedPrivateArtifact(artifact)) return "Imported private planning file";
  return clean(artifact.title) || fallback;
}

function decisionSourceLabelForBudget(record: WeddingPersistedDecisionRecord): string {
  const labels = [
    record.artifactTitle,
    ...(record.sourceLabels ?? []),
  ].map(clean);
  return labels.some(importedPrivateLabel) ? "Imported private planning file" : clean(record.artifactTitle);
}

function moneyValue(text: string): number | null {
  const normalized = text.replace(/,/g, "");
  const range = normalized.match(/(?:\$|aud|usd|gbp|eur)?\s*(\d{3,7})(?:\s*(?:-|to|–)\s*(?:\$|aud|usd|gbp|eur)?\s*(\d{3,7}))?/i);
  if (!range) return null;
  const first = Number(range[1]);
  const second = range[2] ? Number(range[2]) : null;
  if (!Number.isFinite(first)) return null;
  if (second && Number.isFinite(second)) return Math.round((first + second) / 2);
  return Math.round(first);
}

function budgetTargetFromText(text: string): number | null {
  const normalized = text.replace(/,/g, "");
  const match = normalized.match(/\b(?:overall|total|target|ceiling|maximum|max|comfort|available|planning)\s+budget\b[^\d$]{0,28}(?:\$|aud|usd|gbp|eur)?\s*(\d{4,8})/i)
    ?? normalized.match(/\bbudget\s+(?:target|ceiling|maximum|max|comfort|available)\b[^\d$]{0,28}(?:\$|aud|usd|gbp|eur)?\s*(\d{4,8})/i);
  if (!match) return null;
  const amount = Number(match[1]);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
}

function budgetTargetAmount(input: {
  explicitTargetAmount?: number | null;
  budgetTargetText?: string | null;
  artifacts?: readonly WeddingArtifactInput[] | null;
}): number | null {
  if (typeof input.explicitTargetAmount === "number" && Number.isFinite(input.explicitTargetAmount) && input.explicitTargetAmount > 0) {
    return Math.round(input.explicitTargetAmount);
  }
  const textSources = [
    clean(input.budgetTargetText),
    ...(input.artifacts ?? []).flatMap((artifact) => [
      clean(artifact.title),
      artifact.kind === "budget_sheet" || /\bbudget\b/i.test(clean(artifact.title)) ? clean(artifact.bodyText) : "",
    ]),
  ].filter(Boolean);
  for (const text of textSources) {
    const amount = budgetTargetFromText(text);
    if (amount !== null) return amount;
  }
  return null;
}

function priceStatus(text: string): WeddingBudgetLinePriceStatus {
  if (/\b(request|needs?|need|awaiting|pending)\b.{0,24}\bquote\b/i.test(text)) return "projected";
  if (/\b(quote|quoted|invoice|contract|confirmed|deposit paid|final price)\b/i.test(text)) return "quoted";
  if (/\b(estimate|estimated|projected|from|starting|package|approx|around|typical|guide)\b/i.test(text)) return "projected";
  return moneyValue(text) === null ? "unknown" : "projected";
}

function currencyFor(text: string): string {
  if (/\busd\b/i.test(text)) return "USD";
  if (/\bgbp\b/i.test(text)) return "GBP";
  if (/\beur\b/i.test(text)) return "EUR";
  return "AUD";
}

function categoryFor(record: WeddingPersistedDecisionRecord): string {
  const text = `${record.artifactTitle} ${record.selectedOptionDetail} ${record.selectedOptionCells.join(" ")}`;
  const match = text.match(/\b(venue|planner|photographer|florist|floral|dj|band|caterer|decor|rental|videographer|officiant|celebrant|hair|makeup|entertainment|lighting|cake|transport|stationer|calligrapher|bartending|accommodation|attire|alterations|emcee|jeweler|photo booth|honeymoon)\b/i);
  return match ? match[1].replace(/\b\w/g, (letter) => letter.toUpperCase()) : record.artifactKind.replace(/_/g, " ");
}

function warningLabelsFor(status: WeddingBudgetLinePriceStatus, amount: number | null, text: string): string[] {
  const warnings: string[] = [];
  if (amount === null) warnings.push("No usable amount found");
  if (status === "projected") warnings.push("Projected amount; request current quote");
  if (/\b(hidden|service fee|overtime|minimum spend|travel fee|gst|tax|surcharge|cancellation|non-refundable)\b/i.test(text)) {
    warnings.push("Check hidden fees and contract terms");
  }
  return warnings;
}

function lineItemFor(record: WeddingPersistedDecisionRecord): WeddingBudgetLineItem | null {
  // The user's own overall-budget allocation is a target, not a vendor spend line — and
  // its artifactKind ("budget_sheet") would otherwise match the "budget" keyword below and
  // get miscounted as a single vendor line. It's summarized separately (see budgetAllocation).
  if (isWeddingBudgetAllocationDecisionRecord(record)) return null;
  if (isWeddingBudgetContributionDecisionRecord(record)) return null;
  if (!/vendor|venue|budget|quote|package|price|cost|photographer|florist|caterer|band|dj|celebrant|officiant/i.test(`${record.artifactKind} ${record.artifactTitle} ${record.selectedOptionDetail}`)) {
    return null;
  }
  const rowText = [record.selectedOptionLabel, record.selectedOptionDetail, ...record.selectedOptionCells].map(clean).filter(Boolean).join(" ");
  const amount = moneyValue(rowText);
  const status = priceStatus(rowText);
  return {
    id: record.id,
    linkedArtifactId: clean(record.artifactId) || null,
    vendorName: clean(record.selectedOptionLabel) || "Selected vendor",
    categoryLabel: categoryFor(record),
    amount,
    currency: currencyFor(rowText),
    priceStatus: status,
    sourceLabel: decisionSourceLabelForBudget(record),
    confidenceLabel: status === "quoted" ? "Quote-backed" : status === "projected" ? "Projected from selected vendor row" : "Needs quote",
    warningLabels: warningLabelsFor(status, amount, rowText),
    rowCells: record.selectedOptionCells.map(clean),
  };
}

function persistedKey(record: WeddingPersistedDecisionRecord): string {
  return `${record.artifactId}::${record.selectedOptionId}`;
}

function recordFromProjection(decision: WeddingDecisionProjectionInput): WeddingPersistedDecisionRecord {
  return {
    id: clean(decision.id) || `local:${decision.artifactId}:${decision.selectedOption.id}`,
    artifactId: decision.artifactId,
    artifactTitle: decision.artifactTitle,
    artifactKind: decision.artifactKind,
    selectedOptionId: decision.selectedOption.id,
    selectedOptionLabel: decision.selectedOption.label,
    selectedOptionDetail: decision.selectedOption.detail,
    selectedOptionCells: decision.selectedOption.cells,
    selectedOptionColumnCells: (decision.selectedOption.columnCells ?? []).map((cell) => ({
      key: cell.header,
      label: cell.label,
      kind: cell.kind,
      value: cell.value,
    })),
    sourceLabels: decision.sourceLabels ? [...decision.sourceLabels] : [],
    sourceUrls: usableSourceUrls(decision.sourceUrls),
    sourceProviderLabels: decision.sourceProviderLabels ? [...decision.sourceProviderLabels] : [],
    createdAt: clean(decision.createdAt) || new Date(0).toISOString(),
    source: decision.source ?? "local_selection",
    metadataLabels: [
      decision.artifactTitle,
      decision.artifactKind.replace(/_/g, " "),
      decision.selectedOption.id,
    ].filter(Boolean),
  };
}

function mergedBudgetDecisionRecords(input: {
  decisionRecords?: readonly WeddingPersistedDecisionRecord[] | null;
  selectedDecisionItems?: readonly WeddingDecisionProjectionInput[] | null;
}): WeddingPersistedDecisionRecord[] {
  const persisted = [...(input.decisionRecords ?? [])];
  const persistedKeys = new Set(persisted.map(persistedKey));
  const localRecords = (input.selectedDecisionItems ?? [])
    .map(recordFromProjection)
    .filter((record) => !persistedKeys.has(persistedKey(record)));
  return [...persisted, ...localRecords];
}

function categoryRollups(lineItems: readonly WeddingBudgetLineItem[]): WeddingBudgetCategoryRollup[] {
  const map = new Map<string, WeddingBudgetCategoryRollup>();
  for (const item of lineItems) {
    const key = item.categoryLabel.toLowerCase();
    const current = map.get(key) ?? {
      categoryLabel: item.categoryLabel,
      amount: 0,
      itemCount: 0,
      projectedCount: 0,
      quotedCount: 0,
      unknownCount: 0,
      currency: item.currency,
    };
    current.itemCount += 1;
    current.amount += item.amount ?? 0;
    current.projectedCount += item.priceStatus === "projected" ? 1 : 0;
    current.quotedCount += item.priceStatus === "quoted" ? 1 : 0;
    current.unknownCount += item.amount === null ? 1 : 0;
    map.set(key, current);
  }
  return Array.from(map.values())
    .sort((left, right) => right.amount - left.amount || left.categoryLabel.localeCompare(right.categoryLabel));
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isDividerRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTable(body: string): { headers: string[]; rows: string[][] } | null {
  const lines = body.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index]?.trim() ?? "";
    const dividerLine = lines[index + 1]?.trim() ?? "";
    if (!headerLine.startsWith("|") || !dividerLine.startsWith("|")) continue;
    const headers = splitMarkdownTableRow(headerLine);
    if (!isDividerRow(splitMarkdownTableRow(dividerLine))) continue;
    const rows: string[][] = [];
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const rowLine = lines[rowIndex]?.trim() ?? "";
      if (!rowLine.startsWith("|")) break;
      rows.push(splitMarkdownTableRow(rowLine));
    }
    return { headers, rows };
  }
  return null;
}

function headerIndex(headers: readonly string[], pattern: RegExp): number {
  return headers.findIndex((header) => pattern.test(header));
}

function cell(row: readonly string[], index: number): string {
  return index >= 0 ? clean(row[index]) : "";
}

function usableAmount(value: string): boolean {
  return moneyValue(value) !== null && !/\b0(?:\.00)?\b/.test(value.replace(/,/g, ""));
}

function paidCellIsUnpaid(value: string): boolean {
  if (!value) return false;
  if (/\b(unpaid|not\s+paid|no|outstanding|pending|due|owed)\b/i.test(value)) return true;
  return !/\b(paid|yes|settled|complete|completed)\b/i.test(value);
}

function usableVendorLabel(value: string): boolean {
  return Boolean(value) && !/^(?:unknown|n\/?a|none|not\s+known|tbc|vendor|supplier|budget\s+item)$/i.test(value);
}

function isoDateFromCell(value: string): string | null {
  const iso = value.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const slash = value.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (!slash) return null;
  const day = slash[1]?.padStart(2, "0");
  const month = slash[2]?.padStart(2, "0");
  return `${slash[3]}-${month}-${day}`;
}

function artifactHasPaymentSignals(artifact: WeddingArtifactInput): boolean {
  return /\b(budget|quote|contract|invoice|receipt|deposit|instalment|installment|payment|balance|due|cancellation|refund|non-refundable)\b/i
    .test(`${artifact.kind ?? ""} ${artifact.title ?? ""} ${artifact.bodyText ?? ""}`);
}

function paymentLineClauses(line: string): string[] {
  const cleaned = clean(line);
  const paymentStarts = Array.from(cleaned.matchAll(/\b(?:deposit|final\s+balance|balance|instalment|installment|payment)\b[^$€£\d]{0,36}(?:(?:\$|aud|usd|gbp|eur)\s*\d|\d[\d,]*(?:\.\d+)?\s*(?:aud|usd|gbp|eur)\b)/gi))
    .map((match) => match.index ?? 0)
    .filter((index, arrayIndex, indexes) => arrayIndex === 0 || index !== indexes[arrayIndex - 1]);
  if (paymentStarts.length < 2) return [cleaned];
  return paymentStarts.map((start, index) => {
    const end = paymentStarts[index + 1] ?? cleaned.length;
    return clean(cleaned.slice(start, end).replace(/\s+(?:and|then)\s*$/i, ""));
  }).filter(Boolean);
}

function paymentAmountLabelFromText(text: string): string | null {
  const withoutDates = text.replace(/\b20\d{2}-\d{2}-\d{2}\b/g, " ");
  const labelled = withoutDates.match(/(?:\$|aud|usd|gbp|eur)\s*\d[\d,]*(?:\.\d+)?/i)
    ?? withoutDates.match(/\b\d[\d,]*(?:\.\d+)?\s*(?:aud|usd|gbp|eur)\b/i);
  if (labelled) return clean(labelled[0]);
  if (!/\b(amount|price|cost|fee|deposit|balance|payment|invoice)\b/i.test(withoutDates)) return null;
  const unlabelled = withoutDates.match(/\b\d[\d,]*(?:\.\d+)?\b/);
  return unlabelled ? clean(unlabelled[0]) : null;
}

function paymentTaskCandidateFromTextLine(input: {
  artifact: WeddingArtifactInput;
  line: string;
  lineIndex: number;
  clauseIndex?: number;
  fallbackVendor: string;
}): WeddingBudgetPaymentTaskCandidate | null {
  const line = clean(input.line);
  if (!/\b(deposit|instalment|installment|payment|balance|invoice|receipt|due|refund|cancellation|non-refundable)\b/i.test(line)) {
    return null;
  }
  const dueAmount = paymentAmountLabelFromText(line);
  const dueAt = isoDateFromCell(line);
  if (!dueAmount && !dueAt && !/\b(deposit|balance due|payment schedule|non-refundable)\b/i.test(line)) return null;
  const vendor = clean(input.artifact.vendorLabels?.[0]) || input.fallbackVendor;
  if (!usableVendorLabel(vendor)) return null;
  const clauseSuffix = typeof input.clauseIndex === "number" ? `-${input.clauseIndex + 1}` : "";
  return {
    id: `wedding_budget_payment_task:${safeWeddingLabel(clean(input.artifact.id) || clean(input.artifact.title) || "payment")}:line-${input.lineIndex + 1}${clauseSuffix}`,
    title: `Review payment detail for ${vendor}`,
    categoryLabel: "Payment schedule",
    vendorName: vendor,
    dueAmountLabel: dueAmount,
    dueDateLabel: dueAt ?? null,
    dueAt,
    priorityLabel: dueAt || dueAmount ? "High: payment deadline or due amount" : "Medium: payment terms need review",
    reasonLabel: `Payment detail found: ${line.slice(0, 180)}${line.length > 180 ? "..." : ""}`,
    sourceLabel: artifactSourceLabelForBudget(input.artifact, "Uploaded file"),
    linkedArtifactId: clean(input.artifact.id) || null,
  };
}

function quoteTaskCandidates(lineItems: readonly WeddingBudgetLineItem[]): WeddingBudgetTaskCandidate[] {
  return lineItems
    .filter((item) => item.priceStatus !== "quoted" || item.warningLabels.length > 0)
    .map((item) => ({
      id: `wedding_budget_quote_task:${item.id}`,
      title: item.amount === null
        ? `Get current quote for ${item.vendorName}`
        : `Verify ${item.vendorName} pricing before deposit`,
      categoryLabel: item.categoryLabel,
      vendorName: item.vendorName,
      priorityLabel: item.amount === null ? "High: amount missing" : "Medium: projected or contract-risk amount",
      reasonLabel: item.warningLabels[0] ?? "Quote needs confirmation before budget is reliable.",
      sourceLabel: item.sourceLabel,
    }));
}

function paymentTaskCandidates(artifacts: readonly WeddingArtifactInput[]): WeddingBudgetPaymentTaskCandidate[] {
  return artifacts
    .filter(artifactHasPaymentSignals)
    .flatMap((artifact): WeddingBudgetPaymentTaskCandidate[] => {
      const table = parseMarkdownTable(clean(artifact.bodyText));
      const fallbackVendor = clean(artifact.vendorLabels?.[0]) || clean(artifact.title) || "";
      if (!table) {
        return clean(artifact.bodyText)
          .split(/\r?\n/)
          .flatMap((line, lineIndex): WeddingBudgetPaymentTaskCandidate[] => {
            return paymentLineClauses(line).flatMap((clause, clauseIndex): WeddingBudgetPaymentTaskCandidate[] => {
              const candidate = paymentTaskCandidateFromTextLine({ artifact, line: clause, lineIndex, clauseIndex, fallbackVendor });
              return candidate ? [candidate] : [];
            });
          });
      }
      const categoryIndex = headerIndex(table.headers, /\b(category|item|vendor|supplier|service)\b/i);
      const vendorIndex = headerIndex(table.headers, /\b(vendor|supplier|provider|name)\b/i);
      const paidIndex = headerIndex(table.headers, /\bpaid|settled|status\b/i);
      const dueIndex = headerIndex(table.headers, /\bdue|balance|owed\b/i);
      const dueDateIndex = headerIndex(table.headers, /\b(due date|deadline|payment date|date)\b/i);
      const warningIndex = headerIndex(table.headers, /\bwarning|risk|note|caveat|hidden\b/i);
      return table.rows.flatMap((row, rowIndex): WeddingBudgetPaymentTaskCandidate[] => {
        const category = cell(row, categoryIndex) || "Budget item";
        const vendor = cell(row, vendorIndex) || category;
        const paid = cell(row, paidIndex);
        const due = cell(row, dueIndex);
        const dueDate = cell(row, dueDateIndex);
        const warning = cell(row, warningIndex);
        const hasDueAmount = usableAmount(due);
        const isUnpaid = paidCellIsUnpaid(paid);
        const paymentRisk = /\b(deposit|balance|payment|due|invoice|receipt|refund|cancellation|non-refundable|overdue)\b/i.test(`${category} ${vendor} ${paid} ${due} ${dueDate} ${warning}`);
        if (!hasDueAmount && !isUnpaid && !paymentRisk) return [];
        if (!usableVendorLabel(vendor)) return [];
        const dueAt = isoDateFromCell(dueDate);
        const reasonLabel = [
          hasDueAmount ? `Due amount recorded: ${due}.` : null,
          isUnpaid ? `Paid/status cell needs confirmation: ${paid}.` : null,
          warning && !/\bnone|clear|no warning\b/i.test(warning) ? `Warning: ${warning}.` : null,
        ].filter(Boolean).join(" ") || "Payment or receipt status needs confirmation before marking the budget as settled.";
        return [{
          id: `wedding_budget_payment_task:${safeWeddingLabel(clean(artifact.id) || clean(artifact.title) || "budget")}:${rowIndex + 1}`,
          title: `Review payment status for ${vendor}`,
          categoryLabel: category,
          vendorName: vendor,
          dueAmountLabel: hasDueAmount ? due : null,
          dueDateLabel: dueDate || null,
          dueAt,
          priorityLabel: dueAt || hasDueAmount ? "High: payment deadline or due amount" : "Medium: payment status needs review",
          reasonLabel,
          sourceLabel: artifactSourceLabelForBudget(artifact, "Budget sheet"),
          linkedArtifactId: clean(artifact.id) || null,
        }];
      });
    });
}

function taskRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function existingQuoteTaskKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = taskRecord(item.metadata);
    const sourceLineId = clean(metadata.budget_line_item_id);
    if (sourceLineId) keys.add(`wedding_budget_quote_task:${sourceLineId}`);
  }
  return keys;
}

function existingPaymentTaskKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = taskRecord(item.metadata);
    const sourceCandidateId = clean(metadata.budget_payment_candidate_id);
    if (sourceCandidateId) keys.add(sourceCandidateId);
  }
  return keys;
}

function existingVendorOutreachTaskKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = taskRecord(item.metadata);
    const sourceLineId = clean(metadata.vendor_outreach_line_item_id);
    if (sourceLineId) keys.add(`wedding_vendor_outreach_task:${sourceLineId}`);
  }
  return keys;
}

function pursuitClosureReasonLabel(reason: WeddingVendorPursuitClosureReason | null | undefined): string {
  if (reason === "too_expensive") return "Too expensive";
  if (reason === "no_availability") return "No availability";
  if (reason === "chose_another_vendor") return "Chose another vendor";
  if (reason === "unresponsive") return "Unresponsive";
  if (reason === "not_suitable") return "Not suitable";
  return "Other reason";
}

function vendorOutreachDraftSubject(item: WeddingBudgetLineItem): string {
  return `Wedding quote request - ${item.categoryLabel}`;
}

function vendorOutreachDraftBody(item: WeddingBudgetLineItem): string {
  return [
    `Hi ${item.vendorName},`,
    "",
    `We are considering you for our wedding ${item.categoryLabel.toLowerCase()} and would like to confirm availability, package inclusions, and a current quote.`,
    "",
    "Could you please share:",
    "- Availability for our wedding date",
    "- Package inclusions and exclusions",
    "- Current pricing, deposit, payment schedule, and any overtime, travel, GST, or service fees",
    "- Cancellation or change terms",
    "- The best next step if we would like to proceed",
    "",
    "Thank you.",
  ].join("\n");
}

export function buildWeddingVendorPursuitClosureTaskItem(
  input: WeddingVendorPursuitClosureTaskInput,
): WeddingPlanningTaskItem {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const reason = input.reason ?? "other";
  const reasonLabel = pursuitClosureReasonLabel(reason);
  const note = clean(input.note);
  const closedAt = clean(input.closedAt) || new Date(0).toISOString();
  return {
    id: `wedding_vendor_outreach_task:${input.lineItem.id}`,
    title: `Stopped pursuing ${input.lineItem.vendorName}`,
    kind: "vendor_follow_up",
    dueLabel: "Closed",
    priority: "normal",
    source: "user",
    reviewStatus: "ignored",
    approvalState: "archived",
    metadata: {
      ...metadata,
      vendor_outreach_from_selected_decision: true,
      vendor_outreach_line_item_id: input.lineItem.id,
      vendor_outreach_vendor_label: input.lineItem.vendorName,
      vendor_outreach_category_label: input.lineItem.categoryLabel,
      vendor_outreach_source_label: input.lineItem.sourceLabel,
      budget_line_item_id: input.lineItem.id,
      budget_quote_verification: true,
      vendor_outreach_pursuit_status: "not_pursuing",
      vendor_outreach_closure_reason: reason,
      vendor_outreach_closed_at: closedAt,
      outreach_escalation_stage: "closed",
      second_order_loop: "vendor_choice_to_quote_thread",
      second_order_task: true,
      second_order_evidence_labels: [
        "User chose not to pursue this selected vendor further.",
        `Reason: ${reasonLabel}.`,
        note ? `Note: ${note}.` : null,
      ].filter(Boolean),
      searchable_terms: [
        "vendor outreach",
        "not pursuing",
        "closed",
        reasonLabel,
        input.lineItem.vendorName,
        input.lineItem.categoryLabel,
        input.lineItem.sourceLabel,
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ].filter(Boolean),
    },
    linkedArtifactId: input.lineItem.linkedArtifactId,
    notes: [
      `${input.lineItem.vendorName} was removed from active follow-up.`,
      `Reason: ${reasonLabel}.`,
      note ? `Note: ${note}.` : null,
    ].filter(Boolean).join(" "),
  };
}

export function buildWeddingBudgetQuoteTaskItems(input: WeddingBudgetQuoteTaskInput): WeddingPlanningTaskItem[] {
  const budget = input.budgetTracking;
  if (!budget) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existingKeys = existingQuoteTaskKeys(input.existingTaskItems ?? []);
  return budget.quoteTaskCandidates
    .filter((candidate) => !existingKeys.has(candidate.id))
    .map((candidate): WeddingPlanningTaskItem => ({
      id: candidate.id,
      title: candidate.title,
      kind: "budget_review",
      dueLabel: "Before deposit / booking",
      priority: candidate.priorityLabel.toLowerCase().startsWith("high") ? "high" : "normal",
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        ...metadata,
        budget_quote_verification: true,
        budget_line_item_id: candidate.id.replace(/^wedding_budget_quote_task:/, ""),
        budget_vendor_label: candidate.vendorName,
        budget_category_label: candidate.categoryLabel,
        budget_source_label: candidate.sourceLabel,
        second_order_loop: "budget_drift",
        second_order_evidence_labels: [
          "Selected vendor amount still needs quote verification.",
          `Vendor: ${candidate.vendorName}.`,
          `Category: ${candidate.categoryLabel}.`,
        ],
        preparation_checklist: true,
        preparation_checklist_item: "quote_verification",
        user_selectable: true,
        can_deselect_before_commit: true,
        alert_offset_days: [14, 3],
        schedule_basis: "selected_vendor_budget_quote",
        searchable_terms: [
          candidate.title,
          candidate.vendorName,
          candidate.categoryLabel,
          candidate.reasonLabel,
          candidate.sourceLabel,
          "wedding budget",
          "quote verification",
          metadata.weddingPlanId,
          metadata.responseWorkspaceId,
        ].filter(Boolean),
      },
      linkedArtifactId: null,
      notes: [
        candidate.reasonLabel,
        `Category: ${candidate.categoryLabel}.`,
        `Vendor: ${candidate.vendorName}.`,
        `Source: ${candidate.sourceLabel}.`,
        `Task key: ${safeWeddingLabel(candidate.id)}.`,
      ].join(" "),
    }));
}

export function buildWeddingBudgetVendorOutreachTaskItems(input: WeddingBudgetVendorOutreachTaskInput): WeddingPlanningTaskItem[] {
  const budget = input.budgetTracking;
  if (!budget) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existingKeys = existingVendorOutreachTaskKeys(input.existingTaskItems ?? []);
  return budget.lineItems
    .filter((item) => item.priceStatus !== "quoted" || item.amount === null || item.warningLabels.length > 0)
    .map((item) => ({
      item,
      id: `wedding_vendor_outreach_task:${item.id}`,
    }))
    .filter(({ id }) => !existingKeys.has(id))
    .map(({ item, id }): WeddingPlanningTaskItem => {
      const draftSubject = vendorOutreachDraftSubject(item);
      const draftBody = vendorOutreachDraftBody(item);
      const requestChecklist = [
        "availability",
        "package inclusions",
        "current quote",
        "deposit",
        "payment schedule",
        "overtime fees",
        "travel fees",
        "exclusions",
        "cancellation terms",
      ];
      return {
        id,
        title: `Prepare approval-gated quote request for ${item.vendorName}`,
        kind: "vendor_follow_up",
        dueLabel: "After user confirms this vendor",
        priority: item.amount === null ? "high" : "normal",
        source: "agent",
        reviewStatus: "accepted",
        approvalState: "draft",
        metadata: {
          ...metadata,
          vendor_outreach_from_selected_decision: true,
          vendor_outreach_line_item_id: item.id,
          vendor_outreach_vendor_label: item.vendorName,
          vendor_outreach_category_label: item.categoryLabel,
          vendor_outreach_source_label: item.sourceLabel,
          vendor_outreach_draft_subject: draftSubject,
          vendor_outreach_draft_body: draftBody,
          vendor_outreach_request_checklist: requestChecklist,
          vendor_outreach_draft_requires_approval: true,
          vendor_outreach_provider_receipt_required: true,
          approval_required_before_outreach: true,
          no_external_send_without_approval: true,
          selected_decision_required: true,
          provider_receipt_required: true,
          outreach_escalation_stage: "initial_quote_request",
          second_order_loop: "vendor_choice_to_quote_thread",
          second_order_task: true,
          second_order_evidence_labels: [
            "Vendor was selected from planning evidence.",
            "Outreach must be reviewed before any external send.",
            "Quote replies should attach to the vendor thread as proof.",
          ],
          preparation_checklist: true,
          preparation_checklist_item: "selected_vendor_quote_request",
          user_selectable: true,
          can_deselect_before_commit: true,
          searchable_terms: [
            "vendor outreach",
            "quote request",
            "approval gated",
            item.vendorName,
            item.categoryLabel,
            item.sourceLabel,
            metadata.weddingPlanId,
            metadata.responseWorkspaceId,
          ].filter(Boolean),
        },
        linkedArtifactId: item.linkedArtifactId,
        notes: [
          `Draft an initial quote request for ${item.vendorName}.`,
          "Do not send it externally until the user reviews and approves the message.",
          "Ask for availability, package inclusions, final quote, deposit, payment schedule, overtime, travel, exclusions, and cancellation terms.",
          `Source: ${item.sourceLabel}.`,
        ].join(" "),
      };
    });
}

export function buildWeddingBudgetPaymentTaskItems(input: WeddingBudgetPaymentTaskInput): WeddingPlanningTaskItem[] {
  const budget = input.budgetTracking;
  if (!budget) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const existingKeys = existingPaymentTaskKeys(input.existingTaskItems ?? []);
  return budget.paymentTaskCandidates
    .filter((candidate) => !existingKeys.has(candidate.id))
    .map((candidate): WeddingPlanningTaskItem => ({
      id: candidate.id,
      title: candidate.title,
      kind: "budget_review",
      dueAt: candidate.dueAt,
      dueLabel: candidate.dueDateLabel || "Before payment deadline / vendor final confirmation",
      priority: candidate.priorityLabel.toLowerCase().startsWith("high") ? "high" : "normal",
      source: "agent",
      reviewStatus: "accepted",
      approvalState: "draft",
      metadata: {
        ...metadata,
        budget_payment_review: true,
        budget_payment_candidate_id: candidate.id,
        budget_payment_due_amount_label: candidate.dueAmountLabel,
        budget_payment_due_date_label: candidate.dueDateLabel,
        budget_vendor_label: candidate.vendorName,
        budget_category_label: candidate.categoryLabel,
        budget_source_label: candidate.sourceLabel,
        second_order_loop: "budget_drift",
        second_order_evidence_labels: [
          "Payment schedule needs follow-up so monthly cash needs stay accurate.",
          candidate.dueAmountLabel ? `Due amount: ${candidate.dueAmountLabel}.` : null,
          candidate.dueDateLabel ? `Due date: ${candidate.dueDateLabel}.` : null,
        ].filter(Boolean),
        preparation_checklist: true,
        preparation_checklist_item: "payment_review",
        user_selectable: true,
        can_deselect_before_commit: true,
        alert_offset_days: [14, 7, 3],
        schedule_basis: "budget_sheet_payment_review",
        searchable_terms: [
          candidate.title,
          candidate.vendorName,
          candidate.categoryLabel,
          candidate.dueAmountLabel,
          candidate.dueDateLabel,
          candidate.reasonLabel,
          candidate.sourceLabel,
          "wedding budget",
          "payment review",
          "final payment",
          "receipt verification",
          metadata.weddingPlanId,
          metadata.responseWorkspaceId,
        ].filter(Boolean),
      },
      linkedArtifactId: candidate.linkedArtifactId,
      notes: candidate.reasonLabel,
    }));
}

function importedBudgetLineItems(artifacts: readonly WeddingArtifactInput[]): WeddingBudgetLineItem[] {
  return artifacts.flatMap((artifact): WeddingBudgetLineItem[] => {
    const metadata = artifact.metadata && typeof artifact.metadata === "object" && !Array.isArray(artifact.metadata)
      ? artifact.metadata as Record<string, unknown>
      : {};
    if (artifact.kind !== "budget_sheet" || (metadata.importDeclaredKind !== "budget" && !/^Imported budget\b/i.test(clean(artifact.title)))) return [];
    const table = parseMarkdownTable(clean(artifact.bodyText));
    if (!table) return [];
    const categoryIndex = headerIndex(table.headers, /\b(category|item|service|budget item|expense|thing|description|name)\b/i);
    const vendorIndex = headerIndex(table.headers, /\b(vendor|supplier|provider)\b/i);
    const amountIndex = headerIndex(table.headers, /\b(amount|budget|estimate|estimated|projected|cost|price|total|value|allocated)\b/i);
    const statusIndex = headerIndex(table.headers, /\b(status|basis|type|certainty)\b/i);
    const noteIndex = headerIndex(table.headers, /\b(note|notes|detail|description)\b/i);
    if (amountIndex < 0) return [];
    return table.rows.flatMap((row, rowIndex): WeddingBudgetLineItem[] => {
      const amountText = cell(row, amountIndex);
      const amount = moneyValue(amountText);
      const categoryLabel = cell(row, categoryIndex) || cell(row, vendorIndex) || `Budget item ${rowIndex + 1}`;
      if (!categoryLabel || amount === null) return [];
      const vendorName = cell(row, vendorIndex) || categoryLabel;
      const context = [cell(row, statusIndex), cell(row, noteIndex), amountText].filter(Boolean).join(" ");
      const status = priceStatus(context);
      return [{
        id: `wedding_import_budget:${safeWeddingLabel(clean(artifact.id) || clean(artifact.title) || "budget")}:${rowIndex + 1}`,
        linkedArtifactId: clean(artifact.id) || null,
        vendorName,
        categoryLabel,
        amount,
        currency: currencyFor(amountText),
        priceStatus: status,
        sourceLabel: artifactSourceLabelForBudget(artifact, "Imported budget list"),
        confidenceLabel: "User-provided imported amount",
        warningLabels: warningLabelsFor(status, amount, context),
        rowCells: row.map(clean),
      }];
    });
  });
}

export function buildWeddingBudgetTrackingState(input: {
  decisionRecords?: readonly WeddingPersistedDecisionRecord[] | null;
  selectedDecisionItems?: readonly WeddingDecisionProjectionInput[] | null;
  artifacts?: readonly WeddingArtifactInput[] | null;
  budgetTargetAmount?: number | null;
  budgetTargetText?: string | null;
}): WeddingBudgetTrackingState {
  const mergedRecords = mergedBudgetDecisionRecords(input);
  const lineItems = [...mergedRecords.flatMap((record): WeddingBudgetLineItem[] => {
    const item = lineItemFor(record);
    return item ? [item] : [];
  }), ...importedBudgetLineItems(input.artifacts ?? [])];
  const budgetAllocationSummary = weddingBudgetAllocationFromDecisionRecords(mergedRecords);
  const savedContributionRows = weddingBudgetContributionsFromDecisionRecords(mergedRecords);
  const totalProjectedAmount = lineItems
    .filter((item) => item.priceStatus === "projected" && item.amount !== null)
    .reduce((total, item) => total + (item.amount ?? 0), 0);
  const totalQuotedAmount = lineItems
    .filter((item) => item.priceStatus === "quoted" && item.amount !== null)
    .reduce((total, item) => total + (item.amount ?? 0), 0);
  const unknownCount = lineItems.filter((item) => item.amount === null).length;
  const projectedCount = lineItems.filter((item) => item.priceStatus === "projected").length;
  const quotedCount = lineItems.filter((item) => item.priceStatus === "quoted").length;
  const totalKnownAmount = totalProjectedAmount + totalQuotedAmount;
  const targetAmount = budgetTargetAmount({
    // A structured allocation the couple actually set always wins over a number merely
    // guessed from free text — it's an explicit decision, not an inference.
    explicitTargetAmount: budgetAllocationSummary?.totalAmount ?? input.budgetTargetAmount,
    budgetTargetText: input.budgetTargetText,
    artifacts: input.artifacts,
  });
  const remainingAmount = targetAmount === null ? null : targetAmount - totalKnownAmount;
  const overBudgetAmount = remainingAmount !== null && remainingAmount < 0 ? Math.abs(remainingAmount) : 0;
  const budgetUtilizationPercent = targetAmount === null
    ? null
    : Math.round((totalKnownAmount / targetAmount) * 1000) / 10;
  const rollups = categoryRollups(lineItems);
  const tasks = quoteTaskCandidates(lineItems);
  const paymentTasks = paymentTaskCandidates(input.artifacts ?? []);
  const insights = buildWeddingBudgetInsightsState({
    lineItems,
    paymentTaskCandidates: paymentTasks,
    budgetAllocation: budgetAllocationSummary?.categories ?? [],
    savedContributionRows,
    budgetTargetAmount: targetAmount,
    totalKnownAmount,
    totalProjectedAmount,
    totalQuotedAmount,
    remainingAmount,
    artifacts: input.artifacts,
  });
  const warningLabels = [
    overBudgetAmount > 0 ? `Selected vendor path is ${overBudgetAmount.toLocaleString(undefined, { style: "currency", currency: lineItems[0]?.currency ?? "AUD", maximumFractionDigits: 0 })} over the explicit budget target` : null,
    projectedCount > 0 ? `${projectedCount} selected vendor amount${projectedCount === 1 ? "" : "s"} still projected` : null,
    unknownCount > 0 ? `${unknownCount} selected vendor${unknownCount === 1 ? "" : "s"} missing usable amount` : null,
  ].filter((label): label is string => Boolean(label));

  return {
    lineItems,
    categoryRollups: rollups,
    quoteTaskCandidates: tasks,
    paymentTaskCandidates: paymentTasks,
    budgetAllocation: budgetAllocationSummary?.categories ?? [],
    insights,
    budgetTargetAmount: targetAmount,
    remainingAmount,
    overBudgetAmount,
    budgetUtilizationPercent,
    budgetStatusLabel: targetAmount === null
      ? "No explicit overall budget target found yet."
      : overBudgetAmount > 0
        ? `Over target by ${overBudgetAmount.toLocaleString(undefined, { style: "currency", currency: lineItems[0]?.currency ?? "AUD", maximumFractionDigits: 0 })}.`
        : `${(remainingAmount ?? 0).toLocaleString(undefined, { style: "currency", currency: lineItems[0]?.currency ?? "AUD", maximumFractionDigits: 0 })} remaining against explicit target.`,
    totalProjectedAmount,
    totalQuotedAmount,
    totalKnownAmount,
    unknownCount,
    projectedCount,
    quotedCount,
    summaryLabel: lineItems.length === 0
      ? "No selected vendors are contributing to the budget yet."
      : `${lineItems.length} selected vendor${lineItems.length === 1 ? "" : "s"} tracked; known total ${totalKnownAmount.toLocaleString(undefined, { style: "currency", currency: lineItems[0]?.currency ?? "AUD", maximumFractionDigits: 0 })}.`,
    warningLabels,
  };
}
