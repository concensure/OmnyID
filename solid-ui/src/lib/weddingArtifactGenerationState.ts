// @locs-version: 2.0
import {
  normalizeWeddingArtifactSummary,
  type WeddingArtifactInput,
  type WeddingArtifactSummary,
} from "@/lib/weddingArtifactState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingVendorRow = {
  name: string;
  category?: string | null;
  location?: string | null;
  priceEstimate?: string | null;
  capacity?: string | null;
  fitReason?: string | null;
  risks?: string | null;
  contact?: string | null;
  source?: string | null;
};

export type WeddingBudgetRow = {
  category: string;
  estimate?: string | null;
  confirmedCost?: string | null;
  paidAmount?: string | null;
  dueAmount?: string | null;
  dueDate?: string | null;
  vendor?: string | null;
  warning?: string | null;
};

export type WeddingEmailDraftInput = {
  recipientLabel: string;
  subject: string;
  body: string;
  disclosureSummary?: string | null;
  vendor?: string | null;
};

export type WeddingRegistryRow = {
  item: string;
  category?: string | null;
  priority?: "low" | "medium" | "high" | null;
  priceBand?: string | null;
  source?: string | null;
};

export type WeddingArtifactGenerationInput = {
  metadata?: unknown;
  title?: string | null;
  researchNotes?: readonly string[] | null;
  assumptions?: readonly string[] | null;
  verificationActions?: readonly string[] | null;
  vendors?: readonly WeddingVendorRow[] | null;
  budgetRows?: readonly WeddingBudgetRow[] | null;
  emailDrafts?: readonly WeddingEmailDraftInput[] | null;
  registryRows?: readonly WeddingRegistryRow[] | null;
  sourceLabels?: readonly string[] | null;
  locationLabels?: readonly string[] | null;
  vendorLabels?: readonly string[] | null;
};

export type WeddingGeneratedArtifact = {
  input: WeddingArtifactInput;
  summary: WeddingArtifactSummary;
  markdown: string;
  csv: string | null;
};

export type WeddingArtifactGenerationState = {
  metadata: WeddingPlanningMetadata;
  artifacts: WeddingGeneratedArtifact[];
  artifactInputs: WeddingArtifactInput[];
  summaries: WeddingArtifactSummary[];
  summaryLabel: string;
  caveatLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 24): string[] {
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

function csvCell(value: unknown): string {
  return `"${clean(value).replace(/"/g, '""')}"`;
}

function csvRows(headers: readonly string[], rows: readonly (readonly unknown[])[]): string {
  return [
    headers.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");
}

function markdownList(title: string, values: readonly unknown[]): string[] {
  const items = uniqueStrings(values);
  if (items.length === 0) return [];
  return [`## ${title}`, "", ...items.map((item) => `- ${item}`), ""];
}

function markdownTable(headers: readonly string[], rows: readonly (readonly unknown[])[]): string[] {
  if (rows.length === 0) return [];
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map((value) => clean(value) || "Unknown").join(" | ")} |`),
    "",
  ];
}

function artifactId(metadata: WeddingPlanningMetadata, kind: string, title: string): string {
  return `wedding_artifact:${safeWeddingLabel(kind)}:${safeWeddingLabel(metadata.responseWorkspaceId)}:${safeWeddingLabel(title)}`;
}

function makeArtifact(input: WeddingArtifactInput, markdown: string, csv: string | null): WeddingGeneratedArtifact | null {
  const summary = normalizeWeddingArtifactSummary({ ...input, bodyText: markdown });
  return summary ? { input: { ...input, bodyText: markdown }, summary, markdown, csv } : null;
}

function researchArtifact(input: WeddingArtifactGenerationInput, metadata: WeddingPlanningMetadata): WeddingGeneratedArtifact | null {
  const notes = uniqueStrings(input.researchNotes ?? []);
  if (notes.length === 0) return null;
  const title = clean(input.title) || "Wedding research notes";
  const markdown = [
    `# ${title}`,
    "",
    "Generated as a planning artifact. Verify live availability, pricing, and legal details before acting.",
    "",
    ...markdownList("Research notes", notes),
    ...markdownList("Assumptions", input.assumptions ?? []),
    ...markdownList("Next verification actions", input.verificationActions ?? []),
    ...markdownList("Vendor focus", input.vendorLabels ?? []),
    ...markdownList("Sources", input.sourceLabels ?? []),
  ].join("\n");
  return makeArtifact({
    id: artifactId(metadata, "research", title),
    title,
    kind: "research",
    metadata,
    sourceLabels: input.sourceLabels,
    locationLabels: input.locationLabels,
    vendorLabels: input.vendorLabels,
    exportTargets: ["markdown", "html", "word_doc", "browser_pdf"],
  }, markdown, null);
}

function vendorArtifact(input: WeddingArtifactGenerationInput, metadata: WeddingPlanningMetadata): WeddingGeneratedArtifact | null {
  const vendors = input.vendors ?? [];
  if (vendors.length === 0) return null;
  const title = "Vendor comparison";
  const headers = ["Name", "Category", "Location", "Price estimate", "Capacity", "Fit reason", "Risks", "Contact", "Source"];
  const rows = vendors.map((vendor) => [
    vendor.name,
    vendor.category,
    vendor.location,
    vendor.priceEstimate,
    vendor.capacity,
    vendor.fitReason,
    vendor.risks || "Unknown risks; verify before booking",
    vendor.contact,
    vendor.source,
  ]);
  const markdown = [
    "# Vendor comparison",
    "",
    "Unknown price, capacity, and availability are labelled rather than inferred.",
    "",
    ...markdownTable(headers, rows),
  ].join("\n");
  return makeArtifact({
    id: artifactId(metadata, "vendor_table", title),
    title,
    kind: "vendor_table",
    metadata,
    sourceLabels: uniqueStrings(vendors.map((vendor) => vendor.source)),
    locationLabels: uniqueStrings(vendors.map((vendor) => vendor.location)),
    vendorLabels: uniqueStrings(vendors.map((vendor) => vendor.name)),
    exportTargets: ["csv", "html", "browser_pdf"],
  }, markdown, csvRows(headers, rows));
}

function budgetArtifact(input: WeddingArtifactGenerationInput, metadata: WeddingPlanningMetadata): WeddingGeneratedArtifact | null {
  const budgetRows = input.budgetRows ?? [];
  if (budgetRows.length === 0) return null;
  const title = "Budget sheet";
  const headers = ["Category", "Estimate", "Confirmed cost", "Paid", "Due", "Due date", "Vendor", "Warning"];
  const rows = budgetRows.map((row) => [
    row.category,
    row.estimate,
    row.confirmedCost,
    row.paidAmount,
    row.dueAmount,
    row.dueDate,
    row.vendor,
    row.warning || "Check hidden costs before confirming",
  ]);
  const markdown = [
    "# Budget sheet",
    "",
    "Estimates, confirmed costs, paid amounts, due amounts, and hidden-cost warnings remain separate.",
    "",
    ...markdownTable(headers, rows),
  ].join("\n");
  return makeArtifact({
    id: artifactId(metadata, "budget_sheet", title),
    title,
    kind: "budget_sheet",
    metadata,
    vendorLabels: uniqueStrings(budgetRows.map((row) => row.vendor)),
    exportTargets: ["csv", "markdown", "html", "word_doc", "browser_pdf"],
  }, markdown, csvRows(headers, rows));
}

function emailArtifacts(input: WeddingArtifactGenerationInput, metadata: WeddingPlanningMetadata): WeddingGeneratedArtifact[] {
  return (input.emailDrafts ?? []).flatMap((draft): WeddingGeneratedArtifact[] => {
    const title = `Email draft - ${draft.recipientLabel}`;
    const markdown = [
      `# ${title}`,
      "",
      `Recipient: ${draft.recipientLabel}`,
      `Subject: ${draft.subject}`,
      "",
      "## Disclosure summary",
      "",
      draft.disclosureSummary || "Review before sending. No email is sent without explicit approval.",
      "",
      "## Draft",
      "",
      draft.body,
    ].join("\n");
    const artifact = makeArtifact({
      id: artifactId(metadata, "email_draft", title),
      title,
      kind: "email_draft",
      metadata: { ...metadata, approvalState: "pending_user_approval" },
      vendorLabels: draft.vendor ? [draft.vendor] : [],
      exportTargets: ["markdown", "html", "word_doc"],
    }, markdown, null);
    return artifact ? [artifact] : [];
  });
}

function registryArtifact(input: WeddingArtifactGenerationInput, metadata: WeddingPlanningMetadata): WeddingGeneratedArtifact | null {
  const registryRows = input.registryRows ?? [];
  if (registryRows.length === 0) return null;
  const title = "Registry draft";
  const headers = ["Item", "Category", "Priority", "Price band", "Source"];
  const rows = registryRows.map((row) => [row.item, row.category, row.priority, row.priceBand, row.source]);
  const markdown = [
    "# Registry draft",
    "",
    "This is an internal planning artifact. It does not publish to an external registry.",
    "",
    ...markdownTable(headers, rows),
  ].join("\n");
  return makeArtifact({
    id: artifactId(metadata, "registry", title),
    title,
    kind: "registry",
    metadata,
    sourceLabels: uniqueStrings(registryRows.map((row) => row.source)),
    exportTargets: ["csv", "markdown", "html", "browser_pdf"],
  }, markdown, csvRows(headers, rows));
}

export function buildWeddingArtifactGenerationState(input: WeddingArtifactGenerationInput): WeddingArtifactGenerationState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const artifacts = [
    researchArtifact(input, metadata),
    vendorArtifact(input, metadata),
    budgetArtifact(input, metadata),
    ...emailArtifacts(input, metadata),
    registryArtifact(input, metadata),
  ].filter((artifact): artifact is WeddingGeneratedArtifact => Boolean(artifact));
  const caveatLabels = [
    artifacts.some((artifact) => artifact.summary.kind === "vendor_table")
      ? "Vendor availability and prices require live verification before booking."
      : null,
    artifacts.some((artifact) => artifact.summary.kind === "email_draft")
      ? "Email drafts remain approval-gated and unsent."
      : null,
    artifacts.some((artifact) => artifact.summary.kind === "registry")
      ? "Registry drafts are local planning files, not published registries."
      : null,
  ].filter((value): value is string => Boolean(value));

  return {
    metadata,
    artifacts,
    artifactInputs: artifacts.map((artifact) => artifact.input),
    summaries: artifacts.map((artifact) => artifact.summary),
    summaryLabel: `${artifacts.length} generated wedding artifact${artifacts.length === 1 ? "" : "s"}`,
    caveatLabels,
  };
}
