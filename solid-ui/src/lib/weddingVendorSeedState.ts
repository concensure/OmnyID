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
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import {
  buildWeddingVendorFreshnessState,
  type WeddingVendorFreshnessStatus,
} from "@/lib/weddingVendorFreshnessState";

export type WeddingVendorSeedDetail = {
  vendorSlug?: string | null;
  vendorName?: string | null;
  category?: string | null;
  serviceArea?: string | null;
  websiteUrl?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  sourceUrl?: string | null;
  sourceLabel?: string | null;
  sourceCheckedAt?: string | null;
  evidence?: Record<string, unknown> | string | null;
  caveatLabels?: readonly string[] | null;
};

export type WeddingVendorSeedState = {
  status: "ready" | "needs_live_recheck" | "stale" | "empty";
  summary: string;
  vendorCount: number;
  categoryCount: number;
  sourceCount: number;
  evidenceCount: number;
  staleCount: number;
  freshnessStatus: WeddingVendorFreshnessStatus;
  freshnessSummary: string;
  freshnessActionLabels: string[];
  caveatLabels: string[];
  proofReferenceLabels: string[];
  metadata: WeddingPlanningMetadata;
  artifactInput: WeddingArtifactInput | null;
  summaryArtifact: WeddingArtifactSummary | null;
  markdown: string | null;
};

export type WeddingVendorSeedTaskItemsInput = {
  artifacts?: readonly WeddingArtifactInput[] | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  metadata?: unknown;
};

type NormalizedWeddingVendorSeed = {
  vendorSlug: string;
  vendorName: string;
  category: string;
  serviceArea: string;
  websiteUrl: string;
  contactPhone: string;
  contactEmail: string;
  sourceUrl: string;
  sourceLabel: string;
  sourceCheckedAt: string;
  evidenceLabels: string[];
  caveatLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function usableSourceUrl(value: unknown): boolean {
  const candidate = clean(value);
  if (!/^https?:\/\//i.test(candidate)) return false;
  try {
    const url = new URL(candidate);
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

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function unique(values: readonly unknown[], limit = 40): string[] {
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

function parsedEvidence(value: WeddingVendorSeedDetail["evidence"]): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function evidenceStringList(value: unknown): string[] {
  if (Array.isArray(value)) return unique(value);
  const single = clean(value);
  return single ? [single] : [];
}

function evidenceLabelsFor(evidence: Record<string, unknown>): string[] {
  const verifiedFields = evidenceStringList(evidence.verified_fields);
  const serviceNotes = evidenceStringList(evidence.service_notes);
  const priceBasis = clean(evidence.price_basis);
  const availabilityBasis = clean(evidence.availability_basis);
  const labels = [
    verifiedFields.length > 0 ? `Verified fields: ${verifiedFields.slice(0, 5).join(", ")}` : null,
    serviceNotes.length > 0 ? `Services: ${serviceNotes.slice(0, 4).join(", ")}` : null,
    priceBasis ? `Price basis: ${priceBasis}` : null,
    availabilityBasis ? `Availability basis: ${availabilityBasis}` : null,
  ];
  return unique(labels);
}

function existingSeedReviewKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const metadata = record(item.metadata);
    const actionId = clean(metadata.vendor_seed_action_id);
    if (metadata.vendor_seed_review_task === true && actionId) keys.add(actionId);
  }
  return keys;
}

function isSeededVendorArtifact(artifact: WeddingArtifactInput): boolean {
  const metadata = record(artifact.metadata);
  return artifact.kind === "vendor_table"
    && /seeded vendor details|wedding_vendor_seed_details|seeded_vendor_details|Freshness review/i.test([
      clean(artifact.id),
      clean(artifact.title),
      clean(artifact.bodyText),
      clean(metadata.source),
    ].join("\n"));
}

function metadataNumber(metadata: Record<string, unknown>, key: string): number {
  const value = metadata[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function seedReviewTask(
  metadata: WeddingPlanningMetadata,
  artifact: WeddingArtifactInput,
  actionId: string,
  title: string,
  notes: string,
  priority: WeddingPlanningTaskItem["priority"],
  extraMetadata: Record<string, unknown> = {},
): WeddingPlanningTaskItem {
  const artifactMetadata = record(artifact.metadata);
  return {
    id: `wedding_vendor_seed_task:${safeWeddingLabel(actionId)}:${safeWeddingLabel(metadata.responseWorkspaceId)}`,
    title,
    kind: "research",
    priority,
    source: "agent",
    reviewStatus: "accepted",
    approvalState: "draft",
    metadata: {
      ...metadata,
      vendor_seed_review_task: true,
      vendor_seed_action_id: actionId,
      vendor_search_review_task: true,
      vendor_search_action_id: `seed-${actionId}`,
      vendor_source_kind: "seeded_vendor_database",
      vendor_seed_count: metadataNumber(artifactMetadata, "vendorSeedCount"),
      stale_seed_count: metadataNumber(artifactMetadata, "staleSeedCount"),
      vendor_price_recheck_count: metadataNumber(artifactMetadata, "vendorPriceRecheckCount"),
      vendor_availability_recheck_count: metadataNumber(artifactMetadata, "vendorAvailabilityRecheckCount"),
      vendor_relevance_blocker_count: metadataNumber(artifactMetadata, "vendorRelevanceBlockerCount"),
      source_verification_required: true,
      vendor_price_freshness_required: true,
      vendor_availability_freshness_required: true,
      preparation_checklist: true,
      preparation_checklist_item: `vendor-seed-${actionId}`,
      user_selectable: true,
      can_deselect_before_commit: true,
      second_order_loop: "vendor_evidence_freshness",
      second_order_task: true,
      second_order_evidence_labels: [
        "Seeded vendor data",
        "Live recheck required before recommendation",
        "No outreach without approval",
      ],
      searchable_terms: [
        "seeded vendor",
        "vendor seed",
        "vendor source freshness",
        "stale pricing",
        "availability recheck",
        "vendor relevance",
      ],
      ...extraMetadata,
    },
    linkedArtifactId: clean(artifact.id) || null,
    notes,
  };
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor(Math.abs(a.getTime() - b.getTime()) / 86_400_000);
}

function isStale(dateText: string, now: Date, maxAgeDays: number): boolean {
  if (!dateText) return true;
  const parsed = new Date(`${dateText}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return true;
  return daysBetween(parsed, now) > maxAgeDays;
}

function normalizedSeed(seed: WeddingVendorSeedDetail): NormalizedWeddingVendorSeed {
  const evidence = parsedEvidence(seed.evidence);
  return {
    vendorSlug: clean(seed.vendorSlug),
    vendorName: clean(seed.vendorName),
    category: clean(seed.category),
    serviceArea: clean(seed.serviceArea),
    websiteUrl: clean(seed.websiteUrl),
    contactPhone: clean(seed.contactPhone),
    contactEmail: clean(seed.contactEmail),
    sourceUrl: clean(seed.sourceUrl),
    sourceLabel: clean(seed.sourceLabel),
    sourceCheckedAt: clean(seed.sourceCheckedAt),
    evidenceLabels: evidenceLabelsFor(evidence),
    caveatLabels: unique(seed.caveatLabels ?? []),
  };
}

function markdownFor(
  seeds: readonly ReturnType<typeof normalizedSeed>[],
  staleSlugs: readonly string[],
  freshnessSummary: string,
  freshnessActionLabels: readonly string[],
): string {
  const staleSet = new Set(staleSlugs);
  return [
    "# Seeded wedding vendor details",
    "",
    "These rows are source-backed starting points for vendor research. They are not live availability checks, quotes, endorsements, or booking confirmations.",
    "",
    "| Vendor | Category | Area | Contact | Source | Evidence | Status |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...seeds.map((seed) => {
      const contact = [seed.contactPhone, seed.contactEmail].filter(Boolean).join(" / ") || "Check website";
      const source = seed.sourceUrl ? `[${seed.sourceLabel || "Source"}](${seed.sourceUrl})` : "Missing source";
      const evidence = seed.evidenceLabels.join("; ") || "No structured evidence beyond source link";
      const status = staleSet.has(seed.vendorSlug) ? "Recheck source before use" : "Seed source current enough for planning";
      return `| ${seed.vendorName} | ${seed.category} | ${seed.serviceArea} | ${contact} | ${source} | ${evidence} | ${status} |`;
    }),
    "",
    "## Freshness review",
    "",
    freshnessSummary,
    "",
    ...freshnessActionLabels.map((label) => `- ${label}`),
    "",
    "## Guardrails",
    "",
    "- Reconfirm price, package inclusions, availability, cancellation policy, travel fees, and contact details before recommending a shortlist.",
    "- Ask the user to select vendor categories and preferences before using these seeds to personalize research.",
    "- Keep user approval required before outreach or sharing contact details.",
    "- Treat celebrant legality as unverified until checked against the official Australian register.",
  ].join("\n");
}

export function weddingVendorSeedDetailFromDbRow(row: Record<string, unknown>): WeddingVendorSeedDetail {
  const evidence = parsedEvidence(row.evidence as WeddingVendorSeedDetail["evidence"]);
  const address = clean(row.address);
  return {
    vendorSlug: clean(row.vendor_slug ?? row.vendorSlug),
    vendorName: clean(row.vendor_name ?? row.vendorName),
    category: clean(row.category),
    serviceArea: clean(row.service_area ?? row.serviceArea),
    websiteUrl: clean(row.website_url ?? row.websiteUrl),
    contactPhone: clean(row.contact_phone ?? row.contactPhone),
    contactEmail: clean(row.contact_email ?? row.contactEmail),
    sourceUrl: clean(row.source_url ?? row.sourceUrl) || clean(row.website_url ?? row.websiteUrl),
    sourceLabel: clean(row.source_label ?? row.sourceLabel) || "Editable wedding vendor directory",
    sourceCheckedAt: clean(row.source_checked_at ?? row.sourceCheckedAt),
    evidence: {
      ...evidence,
      ...(address && !clean(evidence.address) ? { address } : {}),
      verified_fields: unique([
        ...evidenceStringList(evidence.verified_fields),
        address ? "address" : null,
        clean(row.contact_email ?? row.contactEmail) ? "email" : null,
        clean(row.contact_phone ?? row.contactPhone) ? "phone" : null,
      ]),
    },
    caveatLabels: Array.isArray(row.caveat_labels)
      ? unique(row.caveat_labels)
      : Array.isArray(row.caveatLabels)
        ? unique(row.caveatLabels)
        : unique([row.caveat_labels, row.caveatLabels]),
  };
}

export function weddingVendorSeedDetailsFromEditableVendorRows(
  rows: readonly Record<string, unknown>[] | null | undefined,
): WeddingVendorSeedDetail[] {
  return (rows ?? [])
    .filter((row) => clean(row.status) !== "hidden" && clean(row.status) !== "archived")
    .map(weddingVendorSeedDetailFromDbRow);
}

export function buildWeddingVendorSeedTaskItems(input: WeddingVendorSeedTaskItemsInput): WeddingPlanningTaskItem[] {
  const artifact = (input.artifacts ?? []).find(isSeededVendorArtifact);
  if (!artifact) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata ?? artifact.metadata);
  const artifactMetadata = record(artifact.metadata);
  const existingKeys = existingSeedReviewKeys(input.existingTaskItems ?? []);
  const staleCount = metadataNumber(artifactMetadata, "staleSeedCount");
  const priceRecheckCount = metadataNumber(artifactMetadata, "vendorPriceRecheckCount");
  const availabilityRecheckCount = metadataNumber(artifactMetadata, "vendorAvailabilityRecheckCount");
  const relevanceBlockerCount = metadataNumber(artifactMetadata, "vendorRelevanceBlockerCount");
  const tasks = [
    staleCount > 0
      ? seedReviewTask(
        metadata,
        artifact,
        "refresh-stale-sources",
        "Refresh stale seeded vendor source pages",
        `${staleCount} seeded vendor source${staleCount === 1 ? "" : "s"} need live recheck before the agent recommends, compares, or contacts those vendors.`,
        "high",
      )
      : null,
    priceRecheckCount > 0 || availabilityRecheckCount > 0
      ? seedReviewTask(
        metadata,
        artifact,
        "verify-seeded-price-availability",
        "Verify seeded vendor price and date-specific availability",
        `${priceRecheckCount} price check${priceRecheckCount === 1 ? "" : "s"} and ${availabilityRecheckCount} availability check${availabilityRecheckCount === 1 ? "" : "s"} are needed before projected budget or shortlist recommendations rely on seeded rows.`,
        "high",
        {
          budget_projection_update_required: true,
        },
      )
      : null,
    relevanceBlockerCount > 0
      ? seedReviewTask(
        metadata,
        artifact,
        "resolve-seeded-relevance",
        "Resolve seeded vendor category, location, or preference-fit blockers",
        `${relevanceBlockerCount} seeded vendor fit blocker${relevanceBlockerCount === 1 ? "" : "s"} must be resolved before personalized vendor suggestions use these rows.`,
        "normal",
        {
          selected_decision_required: true,
        },
      )
      : null,
    seedReviewTask(
      metadata,
      artifact,
      "approval-gated-seed-outreach",
      "Keep seeded vendor outreach approval-gated",
      "Seeded contact details are for planning only. Draft outreach after user selection, but do not send messages or share couple contact details without explicit approval.",
      "high",
      {
        no_external_send_without_approval: true,
        approval_required_before_outreach: true,
        approval_required_option_ids: ["send_initial_outreach", "share_contact_info"],
        outreach_escalation_stage: "initial_outreach",
      },
    ),
  ].filter((item): item is WeddingPlanningTaskItem => Boolean(item));
  return tasks.filter((item) => {
    const actionId = clean(record(item.metadata).vendor_seed_action_id);
    return !existingKeys.has(item.id) && !existingKeys.has(actionId);
  });
}

export function buildWeddingVendorSeedState(input: {
  metadata?: unknown;
  seeds?: readonly WeddingVendorSeedDetail[] | null;
  now?: Date;
  maxSourceAgeDays?: number;
  location?: string | null;
  selectedCategories?: readonly string[] | null;
  preferenceText?: string | null;
  proofReferenceLabels?: readonly string[] | null;
}): WeddingVendorSeedState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const now = input.now ?? new Date();
  const maxSourceAgeDays = Math.max(1, Math.trunc(input.maxSourceAgeDays ?? 120));
  const usableSeedInputs = (input.seeds ?? []).filter((seed) => usableSourceUrl(seed.sourceUrl));
  const seeds = usableSeedInputs
    .map(normalizedSeed)
    .filter((seed) => seed.vendorName && seed.category && seed.serviceArea && usableSourceUrl(seed.sourceUrl));
  const staleSlugs = seeds
    .filter((seed) => isStale(seed.sourceCheckedAt, now, maxSourceAgeDays))
    .map((seed) => seed.vendorSlug || seed.vendorName);
  const categories = unique(seeds.map((seed) => seed.category));
  const sourceUrls = unique(seeds.map((seed) => seed.sourceUrl));
  const evidenceLabels = unique(seeds.flatMap((seed) => seed.evidenceLabels));
  const caveatLabels = unique([
    ...seeds.flatMap((seed) => seed.caveatLabels),
    "Seeded vendors require live recheck before recommendation or outreach.",
    "Seeded vendors do not prove availability, pricing, or fit.",
  ]);
  const proofReferenceLabels = unique(input.proofReferenceLabels ?? [])
    .filter((label) => !/\b(?:dry-run|example|fake|mock|placeholder|stub|test)\b/i.test(label));
  const freshness = buildWeddingVendorFreshnessState({
    vendors: usableSeedInputs,
    now,
    maxSourceAgeDays: maxSourceAgeDays,
    location: input.location,
    selectedCategories: input.selectedCategories,
    preferenceText: input.preferenceText,
  });
  const relevanceBlockerCount = freshness.rows.filter((row) => row.relevanceStatus !== "matched").length;

  if (seeds.length === 0) {
    return {
      status: "empty",
      summary: "No source-backed wedding vendor seed rows are available.",
      vendorCount: 0,
      categoryCount: 0,
      sourceCount: 0,
      evidenceCount: 0,
      staleCount: 0,
      freshnessStatus: freshness.status,
      freshnessSummary: freshness.summary,
      freshnessActionLabels: freshness.actionLabels,
      caveatLabels,
      proofReferenceLabels: [],
      metadata,
      artifactInput: null,
      summaryArtifact: null,
      markdown: null,
    };
  }

  const markdown = markdownFor(seeds, staleSlugs, freshness.summary, freshness.actionLabels);
  const artifactInput: WeddingArtifactInput = {
    id: [
      "wedding_artifact",
      "seeded_vendor_details",
      safeWeddingLabel(metadata.responseWorkspaceId),
    ].join(":"),
    title: "Seeded vendor details",
    kind: "vendor_table",
    metadata: {
      ...metadata,
      artifactKind: "vendor_table",
      source: "wedding_vendor_seed_details",
      vendorSeedCount: seeds.length,
      vendorSeedEvidenceCount: evidenceLabels.length,
      staleSeedCount: staleSlugs.length,
      vendorFreshnessStatus: freshness.status,
      vendorFreshnessReady: freshness.readyForRecommendation,
      vendorPriceRecheckCount: freshness.priceRecheckCount,
      vendorAvailabilityRecheckCount: freshness.availabilityRecheckCount,
      vendorRelevanceBlockerCount: relevanceBlockerCount,
      vendorSeedProofReferenceLabels: proofReferenceLabels,
    },
    sourceLabels: unique(seeds.map((seed) => seed.sourceLabel || seed.sourceUrl)),
    sourceLinks: seeds.map((seed) => ({
      label: seed.sourceLabel || seed.vendorName,
      url: seed.sourceUrl,
    })),
    searchLabels: evidenceLabels,
    vendorLabels: unique(seeds.map((seed) => seed.vendorName)),
    bodyText: markdown,
    exportTargets: ["csv", "html", "browser_pdf"],
  };
  const summaryArtifact = normalizeWeddingArtifactSummary(artifactInput);
  const status: WeddingVendorSeedState["status"] = staleSlugs.length > 0
    ? "stale"
    : freshness.readyForRecommendation
      ? "ready"
      : "needs_live_recheck";

  return {
    status,
    summary: staleSlugs.length > 0
      ? `${seeds.length} seeded vendor row${seeds.length === 1 ? "" : "s"} available, but ${staleSlugs.length} need source recheck.`
      : !freshness.readyForRecommendation
        ? `${seeds.length} source-backed seeded vendor row${seeds.length === 1 ? "" : "s"} available across ${categories.length} categor${categories.length === 1 ? "y" : "ies"}, but live price, availability, or fit checks are still required before recommendation.`
      : `${seeds.length} source-backed seeded vendor row${seeds.length === 1 ? "" : "s"} available across ${categories.length} categor${categories.length === 1 ? "y" : "ies"}.`,
    vendorCount: seeds.length,
    categoryCount: categories.length,
    sourceCount: sourceUrls.length,
    evidenceCount: evidenceLabels.length,
    staleCount: staleSlugs.length,
    freshnessStatus: freshness.status,
    freshnessSummary: freshness.summary,
    freshnessActionLabels: freshness.actionLabels,
    caveatLabels,
    proofReferenceLabels,
    metadata,
    artifactInput: summaryArtifact ? artifactInput : null,
    summaryArtifact,
    markdown: summaryArtifact ? markdown : null,
  };
}
