// @locs-version: 2.0
import type { WeddingArtifactKind } from "@/lib/weddingPlanningTemplateState";
import {
  buildWeddingComparisonColumns,
  type WeddingComparisonColumnState,
} from "@/lib/weddingComparisonColumnState";

export type WeddingArtifactTablePreview = {
  kind: "table";
  headers: string[];
  columns?: WeddingComparisonColumnState[];
  rows: string[][];
  rowCountLabel: string;
  budgetSummary?: WeddingArtifactBudgetSummary | null;
};

export type WeddingArtifactBudgetSummary = {
  summaryLabel: string;
  unknownCostCount: number;
  dueAmountCount: number;
  unpaidCount: number;
  warningCount: number;
  warningLabels: string[];
};

export type WeddingArtifactEmailPreview = {
  kind: "email";
  recipient: string;
  subject: string;
  disclosureSummary: string;
  body: string;
};

export type WeddingArtifactDocumentPreview = {
  kind: "document";
  summaryLines: string[];
};

export type WeddingArtifactLegalPreview = {
  kind: "legal";
  statusLines: string[];
  guidanceCards: Array<{ title: string; body: string }>;
  caveatLabel: string;
};

export type WeddingArtifactTimelinePreview = {
  kind: "timeline";
  items: Array<{ label: string; detail: string; stageLabel: string; timingLabel: string }>;
  stageGroups: Array<{ label: string; timingLabel: string; items: Array<{ label: string; detail: string }> }>;
  readinessLabel: string;
};

export type WeddingArtifactMapPreview = {
  kind: "map";
  locations: Array<{ label: string; detail: string; searchQuery: string; mapUrl: string }>;
  mapReadinessLabel: string;
  routeLabel: string;
  locationSearchUrl: string;
};

export type WeddingArtifactGuestPreview = {
  kind: "guest";
  headers: string[];
  rows: string[][];
  privacyLabel: string;
};

export type WeddingArtifactQuotePreview = {
  kind: "quote";
  vendorName: string;
  amount: number | null;
  amountLabel: string;
  currency: string;
  budgetDeltaAmount: number | null;
  budgetDeltaLabel: string | null;
  inclusions: string[];
  exclusions?: string[];
  mandatoryFees?: string[];
  paymentSchedule?: string[];
  assumptions?: string[];
  eventDate?: string | null;
  guestCount?: number | null;
  availabilityLabel?: string | null;
  packageLabel?: string | null;
  depositLabel?: string | null;
  taxLabel?: string | null;
  validUntil: string | null;
  attachmentUrl: string | null;
  attachmentTextStatus?: "none" | "linked_unverified" | "extracted";
  attachmentEvidenceLabels?: string[];
};

export type WeddingArtifactPreviewState =
  | WeddingArtifactTablePreview
  | WeddingArtifactEmailPreview
  | WeddingArtifactDocumentPreview
  | WeddingArtifactLegalPreview
  | WeddingArtifactTimelinePreview
  | WeddingArtifactMapPreview
  | WeddingArtifactGuestPreview
  | WeddingArtifactQuotePreview;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanDisplayText(value: unknown): string {
  return clean(value).replace(/<[^>]*>/g, " ").replace(/[ \t]+/g, " ").trim();
}

function stripHeading(line: string): string {
  return line.replace(/^#{1,6}\s+/, "").trim();
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cleanDisplayText(cell));
}

function isDividerRow(cells: readonly string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function parseMarkdownTable(body: string): WeddingArtifactTablePreview | null {
  const lines = body.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index]?.trim() ?? "";
    const dividerLine = lines[index + 1]?.trim() ?? "";
    if (!headerLine.startsWith("|") || !dividerLine.startsWith("|")) continue;
    const headers = splitMarkdownTableRow(headerLine);
    const divider = splitMarkdownTableRow(dividerLine);
    if (!isDividerRow(divider)) continue;
    const rows: string[][] = [];
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const rowLine = lines[rowIndex]?.trim() ?? "";
      if (!rowLine.startsWith("|")) break;
      rows.push(splitMarkdownTableRow(rowLine));
    }
    return {
      kind: "table",
      headers,
      columns: buildWeddingComparisonColumns(headers),
      rows,
      rowCountLabel: `${rows.length} row${rows.length === 1 ? "" : "s"}`,
    };
  }
  return null;
}

function headerIndex(headers: readonly string[], pattern: RegExp): number {
  return headers.findIndex((header) => pattern.test(header));
}

function cellAt(row: readonly string[], index: number): string {
  return index >= 0 ? clean(row[index]) : "";
}

function hasUnknownCost(value: string): boolean {
  return !value || /\b(tbc|tbd|unknown|unconfirmed|estimate pending|quote pending|needs quote|not quoted|n\/a)\b/i.test(value);
}

function hasMoneyOrAmount(value: string): boolean {
  return /[$£€¥]|(?:aud|usd|gbp|eur)\b|\b\d+(?:,\d{3})*(?:\.\d{2})?\b/i.test(value);
}

function isPaid(value: string): boolean {
  return /\b(paid|yes|settled|complete|completed)\b/i.test(value);
}

function buildBudgetSummary(table: WeddingArtifactTablePreview): WeddingArtifactBudgetSummary {
  const estimateIndex = headerIndex(table.headers, /\bestimate|quoted?|price|cost\b/i);
  const confirmedIndex = headerIndex(table.headers, /\bconfirmed|actual\b/i);
  const paidIndex = headerIndex(table.headers, /\bpaid|settled\b/i);
  const dueIndex = headerIndex(table.headers, /\bdue|balance|owed\b/i);
  const warningIndex = headerIndex(table.headers, /\bwarning|risk|note|caveat|hidden\b/i);

  let unknownCostCount = 0;
  let dueAmountCount = 0;
  let unpaidCount = 0;
  const warningLabels: string[] = [];

  for (const row of table.rows) {
    const estimate = cellAt(row, estimateIndex);
    const confirmed = cellAt(row, confirmedIndex);
    const paid = cellAt(row, paidIndex);
    const due = cellAt(row, dueIndex);
    const warning = cellAt(row, warningIndex);
    if (hasUnknownCost(estimate) && hasUnknownCost(confirmed)) unknownCostCount += 1;
    if (hasMoneyOrAmount(due) && !/\b0(?:\.00)?\b/.test(due)) dueAmountCount += 1;
    if (paid && !isPaid(paid)) unpaidCount += 1;
    if (warning && !/\bnone|no warning|clear\b/i.test(warning)) warningLabels.push(warning);
  }

  const warningCount = warningLabels.length;
  const riskParts = [
    unknownCostCount > 0 ? `${unknownCostCount} unknown cost${unknownCostCount === 1 ? "" : "s"}` : null,
    dueAmountCount > 0 ? `${dueAmountCount} due amount${dueAmountCount === 1 ? "" : "s"}` : null,
    unpaidCount > 0 ? `${unpaidCount} unpaid row${unpaidCount === 1 ? "" : "s"}` : null,
    warningCount > 0 ? `${warningCount} warning${warningCount === 1 ? "" : "s"}` : null,
  ].filter((part): part is string => Boolean(part));

  return {
    summaryLabel: riskParts.length > 0
      ? riskParts.join(" · ")
      : "No budget risk markers detected in this table.",
    unknownCostCount,
    dueAmountCount,
    unpaidCount,
    warningCount,
    warningLabels: warningLabels.slice(0, 4),
  };
}

function sectionAfter(body: string, heading: string): string {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => stripHeading(line).toLowerCase() === heading.toLowerCase());
  if (start < 0) return "";
  const result: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^#{1,6}\s+/.test(line) && result.some((item) => item.trim())) break;
    result.push(line);
  }
  return result.join("\n").trim();
}

function sectionAfterWithSubheadings(body: string, heading: string): string {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((line) => stripHeading(line).toLowerCase() === heading.toLowerCase());
  if (start < 0) return "";
  const headingLevel = lines[start]?.match(/^(#{1,6})\s+/)?.[1]?.length ?? 6;
  const result: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const nextLevel = line.match(/^(#{1,6})\s+/)?.[1]?.length;
    if (nextLevel && nextLevel <= headingLevel && result.some((item) => item.trim())) break;
    result.push(line);
  }
  return result.join("\n").trim();
}

function sectionLines(body: string, heading: string, limit = 6): string[] {
  return sectionAfter(body, heading)
    .split(/\r?\n/)
    .map((line) => cleanDisplayText(line.replace(/^- /, "")))
    .filter(Boolean)
    .slice(0, limit);
}

function parseLabelDetail(line: string): { label: string; detail: string } {
  const normalized = cleanDisplayText(line.replace(/^- /, ""));
  const separator = normalized.includes(":") ? ":" : normalized.includes(" - ") ? " - " : "";
  if (!separator) return { label: normalized, detail: "Needs confirmation before acting." };
  const [label, ...rest] = normalized.split(separator);
  return {
    label: clean(label) || normalized,
    detail: clean(rest.join(separator)) || "Needs confirmation before acting.",
  };
}

function timelineStage(value: string): { stageLabel: string; timingLabel: string } {
  const lower = value.toLowerCase();
  if (/\b(day-of|day of|incident|emergency|no-show|live update|lost item|payment verification|vendor delay)\b/.test(lower)) {
    return { stageLabel: "Day-of execution", timingLabel: "Wedding-day live coordination" };
  }
  if (/\b(anytime|when ready|optional|ongoing)\b/.test(lower)) {
    return { stageLabel: "Anytime", timingLabel: "No fixed deadline" };
  }
  if (/\b(month|rsvp|numbers|seating|menu|fitting)\b/.test(lower)) {
    return { stageLabel: "Final month", timingLabel: "8-30 days" };
  }
  if (/\b(today|tomorrow|this week|urgent|final|week of|day before|morning of)\b/.test(lower)) {
    return { stageLabel: "Final checks", timingLabel: "0-7 days" };
  }
  if (/\b(venue|booking|deposit|contract|celebrant|noim|photographer|cater)\b/.test(lower)) {
    return { stageLabel: "Core planning", timingLabel: "31-90 days or vendor-led" };
  }
  return { stageLabel: "Early prep", timingLabel: "91+ days or unconfirmed" };
}

function dayOfIncidentItems(body: string): Array<{ label: string; detail: string }> {
  const section = sectionAfterWithSubheadings(body, "Day-of execution incident playbooks");
  if (!section) return [];
  const lines = section.split(/\r?\n/);
  const items: Array<{ label: string; detail: string }> = [];
  let currentLabel = "";
  const details: string[] = [];

  function flush() {
    if (!currentLabel) return;
    items.push({
      label: currentLabel,
      detail: details.join(" ").replace(/\s+/g, " ").trim() || "Incident options need confirmation before action.",
    });
    currentLabel = "";
    details.length = 0;
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s+/.test(trimmed)) {
      flush();
      currentLabel = stripHeading(trimmed);
      continue;
    }
    if (currentLabel && /^(trigger|affected parties|provider requirement):/i.test(trimmed)) {
      details.push(trimmed);
    }
  }
  flush();
  return items.slice(0, 8);
}

function mapLocation(input: { label: string; detail: string }): WeddingArtifactMapPreview["locations"][number] {
  const searchQuery = [input.label, input.detail]
    .map(clean)
    .filter(Boolean)
    .join(" ");
  return {
    ...input,
    searchQuery,
    mapUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(searchQuery || input.label)}`,
  };
}

function parseEmailPreview(body: string): WeddingArtifactEmailPreview | null {
  const recipient = body.match(/^Recipient:\s*(.+)$/m)?.[1]?.trim();
  const subject = body.match(/^Subject:\s*(.+)$/m)?.[1]?.trim();
  if (!recipient || !subject) return null;
  return {
    kind: "email",
    recipient,
    subject,
    disclosureSummary: sectionAfter(body, "Disclosure summary"),
    body: sectionAfter(body, "Draft"),
  };
}

function labeledValue(body: string, labels: readonly string[]): string {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  return clean(body.match(new RegExp(`^(?:${labelPattern})\\s*:\\s*(.+)$`, "im"))?.[1]);
}

function numericMoney(value: string): number | null {
  const match = value.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return null;
  const amount = Number(match[0].replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

function currencyFrom(value: string): string {
  if (/\b(usd|us\$)\b/i.test(value)) return "USD";
  if (/\b(gbp)\b|£/i.test(value)) return "GBP";
  if (/\b(eur)\b|€/i.test(value)) return "EUR";
  if (/\b(aud|a\$)\b|\$/i.test(value)) return "AUD";
  return "AUD";
}

function urlFrom(value: string): string | null {
  const candidate = clean(value.match(/https?:\/\/[^\s)]+/i)?.[0]);
  try {
    return candidate ? new URL(candidate).toString() : null;
  } catch {
    return null;
  }
}

function attachmentTextStatusFrom(body: string, attachmentUrl: string | null): WeddingArtifactQuotePreview["attachmentTextStatus"] {
  if (!attachmentUrl) return "none";
  const status = labeledValue(body, [
    "Attachment text status",
    "Attachment extraction",
    "Attachment parsed",
    "Attachment text extracted",
  ]);
  if (/\b(extracted|parsed|read|yes|server parsed|ocr)\b/i.test(status)) return "extracted";
  if (/^##\s+Attachment text\b/im.test(body) && sectionLines(body, "Attachment text", 3).length > 0) return "extracted";
  return "linked_unverified";
}

function attachmentEvidenceLabelsFrom(
  body: string,
  attachmentUrl: string | null,
  status: WeddingArtifactQuotePreview["attachmentTextStatus"],
): string[] {
  if (!attachmentUrl) return ["No original quote attachment linked"];
  const labels = [
    status === "extracted"
      ? "Original quote attachment text was extracted"
      : "Original quote attachment is linked but text extraction is not verified",
    labeledValue(body, ["Attachment name", "Original file name", "File name"]),
    labeledValue(body, ["Attachment parser", "Parser", "Extraction provider"]),
  ].map(clean).filter(Boolean);
  return [...new Set(labels)];
}

function parseQuotePreview(body: string): WeddingArtifactQuotePreview | null {
  const vendorName = labeledValue(body, ["Vendor", "Supplier", "Venue", "Quote from"]);
  const amountLabel = labeledValue(body, ["Quote amount", "Quoted amount", "Total quote", "Total", "Amount"]);
  if (!vendorName || !amountLabel || !/\bquote|quoted|total|amount|invoice|proposal\b/i.test(body)) return null;
  const budgetDeltaLabel = labeledValue(body, ["Budget delta", "Budget impact", "Over budget", "Difference"]);
  const inclusionLines = sectionLines(body, "Inclusions", 8);
  const exclusions = [
    ...sectionLines(body, "Exclusions", 8),
    ...sectionLines(body, "Not included", 8),
  ];
  const mandatoryFees = [
    ...sectionLines(body, "Mandatory fees", 8),
    ...sectionLines(body, "Required fees", 8),
  ];
  const paymentSchedule = [
    ...sectionLines(body, "Payment schedule", 8),
    ...sectionLines(body, "Payments", 8),
  ];
  const assumptions = [
    ...sectionLines(body, "Assumptions", 8),
    ...sectionLines(body, "Estimate basis", 8),
  ];
  const eventDate = labeledValue(body, ["Wedding date", "Event date", "Date"]);
  const guestCountLabel = labeledValue(body, ["Guest count", "Guests", "Attendees"]);
  const validUntil = labeledValue(body, ["Valid until", "Quote valid until", "Expires"]);
  const attachmentRaw = labeledValue(body, [
    "Attachment",
    "Original file",
    "Quote file",
    "Original PDF",
    "Quote PDF",
    "Original Word",
    "Quote Word",
    "Original DOC",
    "Quote DOC",
    "Source",
  ]);
  const attachmentUrl = urlFrom(attachmentRaw);
  const attachmentTextStatus = attachmentTextStatusFrom(body, attachmentUrl);
  return {
    kind: "quote",
    vendorName,
    amount: numericMoney(amountLabel),
    amountLabel,
    currency: currencyFrom(`${amountLabel} ${body}`),
    budgetDeltaAmount: budgetDeltaLabel ? numericMoney(budgetDeltaLabel) : null,
    budgetDeltaLabel: budgetDeltaLabel || null,
    inclusions: inclusionLines,
    exclusions: [...new Set(exclusions)],
    mandatoryFees: [...new Set(mandatoryFees)],
    paymentSchedule: [...new Set(paymentSchedule)],
    assumptions: [...new Set(assumptions)],
    eventDate: eventDate || null,
    guestCount: guestCountLabel ? numericMoney(guestCountLabel) : null,
    availabilityLabel: labeledValue(body, ["Availability", "Date availability", "Hold status"]) || null,
    packageLabel: labeledValue(body, ["Package", "Package name", "Option"]) || null,
    depositLabel: labeledValue(body, ["Deposit", "Booking deposit", "Initial payment"]) || null,
    taxLabel: labeledValue(body, ["GST", "Tax", "Taxes"]) || null,
    validUntil: validUntil || null,
    attachmentUrl,
    attachmentTextStatus,
    attachmentEvidenceLabels: attachmentEvidenceLabelsFrom(body, attachmentUrl, attachmentTextStatus),
  };
}

function legalPreview(body: string): WeddingArtifactLegalPreview {
  const statusLines = sectionLines(body, "Current status", 6);
  const guidanceCards = ["How", "When", "Where", "Cost questions", "Sources to verify"]
    .map((title) => ({ title, body: sectionLines(body, title, 4).join(" ") }))
    .filter((card) => card.body);
  return {
    kind: "legal",
    statusLines,
    guidanceCards,
    caveatLabel: "Planning aid only; no forms are submitted, bookings made, or legal compliance guaranteed.",
  };
}

function timelinePreview(body: string): WeddingArtifactTimelinePreview {
  const table = parseMarkdownTable(body);
  const rows = table?.rows.map((row) => ({
    label: clean(row[0]) || "Wedding milestone",
    detail: row.slice(1).map(clean).filter(Boolean).join(" - ") || "Needs confirmation before committing.",
  }));
  const fallback = sectionLines(body, "Timeline", 10).map(parseLabelDetail);
  const incidents = dayOfIncidentItems(body);
  const sourceItems = [
    ...(rows?.length ? rows : fallback),
    ...incidents,
  ];
  const items = sourceItems.slice(0, 12).map((item) => ({
    ...item,
    ...timelineStage(`${item.label} ${item.detail}`),
  }));
  const grouped = new Map<string, WeddingArtifactTimelinePreview["stageGroups"][number]>();
  for (const item of items) {
    const group = grouped.get(item.stageLabel) ?? {
      label: item.stageLabel,
      timingLabel: item.timingLabel,
      items: [],
    };
    group.items.push({ label: item.label, detail: item.detail });
    grouped.set(item.stageLabel, group);
  }
  return {
    kind: "timeline",
    items,
    stageGroups: Array.from(grouped.values()),
    readinessLabel: items.length > 0 ? `${items.length} timeline item${items.length === 1 ? "" : "s"} detected` : "Timeline structure not measured",
  };
}

function mapPreview(body: string): WeddingArtifactMapPreview {
  // Map artifacts may contain provider tables or web snippets. Only project
  // explicitly labelled location sections so unrelated Brave snippets cannot
  // masquerade as verified travel or weather evidence.
  const requested = sectionLines(body, "Requested locations", 10)
    .filter((line) => !/^no location supplied$/i.test(clean(line)))
    .map((line) => ({ label: clean(line), detail: "Requested wedding location" }));
  const legacy = sectionLines(body, "Locations", 10).map(parseLabelDetail);
  const mapEvidence = sectionLines(body, "Map evidence", 10)
    .filter((line) => !/^no geocode results returned/i.test(clean(line)))
    .map(parseLabelDetail);
  const sourceRows = requested.length > 0 ? requested : legacy.length > 0 ? legacy : mapEvidence;
  const locations = sourceRows.slice(0, 10).map(mapLocation);
  const fallbackQuery = locations[0]?.searchQuery || "wedding location";
  return {
    kind: "map",
    locations,
    mapReadinessLabel: locations.length > 0 ? `${locations.length} location${locations.length === 1 ? "" : "s"} ready for map handoff` : "No structured locations detected",
    routeLabel: locations.length > 1 ? "Route order is a planning hint; verify travel times in Maps." : "Open the location search before relying on travel time.",
    locationSearchUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fallbackQuery)}`,
  };
}

function guestPreview(body: string): WeddingArtifactGuestPreview {
  const table = parseMarkdownTable(body);
  return {
    kind: "guest",
    headers: table?.headers ?? [],
    rows: table?.rows.slice(0, 12) ?? [],
    privacyLabel: "Guest details are private by default and should not be shared with vendors without explicit approval.",
  };
}

function documentPreview(body: string): WeddingArtifactDocumentPreview {
  const summaryLines = body
    .split(/\r?\n/)
    .map((line) => cleanDisplayText(stripHeading(line).replace(/^- /, "")))
    .filter(Boolean)
    .slice(0, 8);
  return {
    kind: "document",
    summaryLines,
  };
}

export function buildWeddingArtifactPreviewState(input: {
  artifactKind: WeddingArtifactKind;
  bodyText?: string | null;
}): WeddingArtifactPreviewState | null {
  const body = clean(input.bodyText);
  if (!body) return null;
  const quote = parseQuotePreview(body);
  if (quote && (input.artifactKind === "vendor_table" || input.artifactKind === "budget_sheet" || input.artifactKind === "research")) {
    return quote;
  }
  if (input.artifactKind === "legal") return legalPreview(body);
  if (input.artifactKind === "timeline") return timelinePreview(body);
  if (input.artifactKind === "map_collection") return mapPreview(body);
  if (input.artifactKind === "guest_list") return guestPreview(body);
  if (input.artifactKind === "email_draft") return parseEmailPreview(body) ?? documentPreview(body);
  if (
    input.artifactKind === "vendor_table"
    || input.artifactKind === "budget_sheet"
    || input.artifactKind === "registry"
  ) {
    const table = parseMarkdownTable(body);
    if (!table) return documentPreview(body);
    return input.artifactKind === "budget_sheet"
      ? { ...table, budgetSummary: buildBudgetSummary(table) }
      : table;
  }
  return documentPreview(body);
}
