// @locs-version: 2.0
import type { WeddingPersistedDecisionRecord } from "@/lib/weddingPersistedWorkspaceState";
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import { normalizeWeddingPlanningMetadata, safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingBudgetLinePriceStatus = "quoted" | "projected" | "unknown";

export type WeddingBudgetLineItem = {
  id: string;
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

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function usableSourceUrls(values: readonly unknown[] | null | undefined): string[] {
  return (values ?? [])
    .map((value) => clean(value))
    .filter((value) => /^https?:\/\//i.test(value));
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
  if (!/vendor|venue|budget|quote|package|price|cost|photographer|florist|caterer|band|dj|celebrant|officiant/i.test(`${record.artifactKind} ${record.artifactTitle} ${record.selectedOptionDetail}`)) {
    return null;
  }
  const rowText = [record.selectedOptionLabel, record.selectedOptionDetail, ...record.selectedOptionCells].map(clean).filter(Boolean).join(" ");
  const amount = moneyValue(rowText);
  const status = priceStatus(rowText);
  return {
    id: record.id,
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
  return Boolean(value) && !/\b(paid|yes|settled|complete|completed)\b/i.test(value);
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
    .filter((artifact) => artifact.kind === "budget_sheet")
    .flatMap((artifact): WeddingBudgetPaymentTaskCandidate[] => {
      const table = parseMarkdownTable(clean(artifact.bodyText));
      if (!table) return [];
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

export function buildWeddingBudgetTrackingState(input: {
  decisionRecords?: readonly WeddingPersistedDecisionRecord[] | null;
  selectedDecisionItems?: readonly WeddingDecisionProjectionInput[] | null;
  artifacts?: readonly WeddingArtifactInput[] | null;
  budgetTargetAmount?: number | null;
  budgetTargetText?: string | null;
}): WeddingBudgetTrackingState {
  const lineItems = mergedBudgetDecisionRecords(input).flatMap((record): WeddingBudgetLineItem[] => {
    const item = lineItemFor(record);
    return item ? [item] : [];
  });
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
    explicitTargetAmount: input.budgetTargetAmount,
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
