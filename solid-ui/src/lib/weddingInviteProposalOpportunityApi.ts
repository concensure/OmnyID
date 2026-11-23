import { apiFetch } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

export type WeddingProposalOpportunity = {
  opportunityId: string;
  category: string;
  location: string | null;
  briefText: string;
  sharedContext: Record<string, unknown>;
  status: string;
  expiresAt: string;
  responseCount: number;
  claimedVendorViewCount: number;
  shareCount: number;
};

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

function opportunity(value: unknown): WeddingProposalOpportunity | null {
  const record = isRecord(value) ? value : {};
  const opportunityId = clean(record.opportunity_id);
  const category = clean(record.category);
  if (!opportunityId || !category) return null;
  return {
    opportunityId,
    category,
    location: clean(record.location) || null,
    briefText: clean(record.brief_text),
    sharedContext: isRecord(record.shared_context) ? record.shared_context : {},
    status: clean(record.status) || "open",
    expiresAt: clean(record.expires_at),
    responseCount: number(record.response_count),
    claimedVendorViewCount: number(record.claimed_vendor_view_count),
    shareCount: number(record.share_count),
  };
}

export async function publishWeddingProposalOpportunity(input: {
  wedding_plan_id: string;
  response_workspace_id: string;
  brief_id: string;
  category: string;
  location?: string | null;
  brief_text: string;
  shared_context: Record<string, unknown>;
}): Promise<{ opportunityId: string; expiresAt: string }> {
  const result = await apiFetch<Record<string, unknown>>("/wedding/invite-proposals/opportunities", {
    method: "POST",
    bodyJson: input,
  });
  return { opportunityId: clean(result.opportunity_id), expiresAt: clean(result.expires_at) };
}

export async function loadWeddingProposalOpportunities(): Promise<WeddingProposalOpportunity[]> {
  const result = await apiFetch<Record<string, unknown>>("/wedding/invite-proposals/opportunities");
  return (Array.isArray(result.opportunities) ? result.opportunities : []).flatMap((value) => {
    const normalized = opportunity(value);
    return normalized ? [normalized] : [];
  });
}

export async function createWeddingProposalShareLink(opportunityId: string): Promise<{ url: string; expiresAt: string; notice: string }> {
  const result = await apiFetch<Record<string, unknown>>(
    `/wedding/invite-proposals/opportunities/${encodeURIComponent(opportunityId)}/share-link`,
    { method: "POST", bodyJson: {} },
  );
  return { url: clean(result.url), expiresAt: clean(result.expires_at), notice: clean(result.notice) };
}

export async function closeWeddingProposalOpportunity(opportunityId: string): Promise<void> {
  await apiFetch<Record<string, unknown>>(
    `/wedding/invite-proposals/opportunities/${encodeURIComponent(opportunityId)}/close`,
    { method: "POST", bodyJson: {} },
  );
}
