// @locs-version: 1.0
import { apiFetch } from "@/lib/api";

export type WeddingVendorEnrichmentProposal = {
  vendorId: string;
  key: string;
  value: unknown;
  quote: string;
  sourceKind: string;
  confidence: number;
  dateContext?: string;
};

export type AdminWeddingVendorEnrichmentProposalResponse = {
  status: "proposed" | "fallback";
  provider?: string;
  model?: string;
  proposals: WeddingVendorEnrichmentProposal[];
  approvalToken?: string;
};

export type AdminWeddingVendorEnrichmentCoverage = {
  activeVenues: number;
  coverage: { styleFacets: number; capacity: number; price: number; coordinates: number };
};

function normalizeProposal(value: unknown): WeddingVendorEnrichmentProposal | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const vendorId = typeof record.vendor_id === "string" ? record.vendor_id : "";
  const key = typeof record.key === "string" ? record.key : "";
  const quote = typeof record.quote === "string" ? record.quote : "";
  const sourceKind = typeof record.source_kind === "string" ? record.source_kind : "";
  const confidence = typeof record.confidence === "number" ? record.confidence : Number.NaN;
  if (!vendorId || !key || !quote || !sourceKind || !Number.isFinite(confidence)) return null;
  return {
    vendorId,
    key,
    value: record.value,
    quote,
    sourceKind,
    confidence,
    dateContext: typeof record.date_context === "string" ? record.date_context : undefined,
  };
}

function wireProposal(proposal: WeddingVendorEnrichmentProposal) {
  return {
    vendor_id: proposal.vendorId,
    key: proposal.key,
    value: proposal.value,
    quote: proposal.quote,
    source_kind: proposal.sourceKind,
    confidence: proposal.confidence,
    date_context: proposal.dateContext,
  };
}

function normalizeProposalResponse(value: unknown): AdminWeddingVendorEnrichmentProposalResponse {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    status: record.status === "proposed" ? "proposed" : "fallback",
    provider: typeof record.provider === "string" ? record.provider : undefined,
    model: typeof record.model === "string" ? record.model : undefined,
    proposals: Array.isArray(record.proposals)
      ? record.proposals.flatMap((proposal) => {
        const normalized = normalizeProposal(proposal);
        return normalized ? [normalized] : [];
      })
      : [],
    approvalToken: typeof record.approval_token === "string" ? record.approval_token : undefined,
  };
}

export const proposeAdminWeddingVendorEnrichment = (vendorIds: string[]) =>
  apiFetch<unknown>("/admin/wedding/vendors/enrichment/propose", {
    method: "POST",
    bodyJson: { vendor_ids: vendorIds },
  }).then(normalizeProposalResponse);

export const applyAdminWeddingVendorEnrichment = (
  approvalToken: string,
  approved: WeddingVendorEnrichmentProposal[],
) => apiFetch<unknown>("/admin/wedding/vendors/enrichment/apply", {
  method: "POST",
  bodyJson: { approval_token: approvalToken, approved: approved.map(wireProposal) },
});

export const fetchAdminWeddingVendorEnrichmentCoverage = () =>
  apiFetch<unknown>("/admin/wedding/vendors/enrichment/coverage")
    .then((value): AdminWeddingVendorEnrichmentCoverage => {
      const record = value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
      const coverage = record.coverage && typeof record.coverage === "object" && !Array.isArray(record.coverage)
        ? record.coverage as Record<string, unknown>
        : {};
      const number = (item: unknown) => typeof item === "number" && Number.isFinite(item) ? item : 0;
      return {
        activeVenues: number(record.active_venues),
        coverage: {
          styleFacets: number(coverage.style_facets),
          capacity: number(coverage.capacity),
          price: number(coverage.price),
          coordinates: number(coverage.coordinates),
        },
      };
    });
