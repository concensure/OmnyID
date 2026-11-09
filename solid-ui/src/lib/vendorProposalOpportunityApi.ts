import { apiFetch } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

export type VendorProposalOpportunity = {
  opportunityId: string;
  category: string;
  location: string | null;
  briefText: string;
  sharedContext: Record<string, unknown>;
  expiresAt: string;
};

export type VendorProposalLeadFeed = {
  vendorId: string;
  vendorName: string;
  expiresAt: string;
  opportunities: VendorProposalOpportunity[];
};

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

function normalize(value: unknown): VendorProposalOpportunity | null {
  const record = isRecord(value) ? value : {};
  const opportunityId = clean(record.opportunity_id);
  const category = clean(record.category);
  if (!opportunityId || !category) return null;
  return {
    opportunityId, category, location: clean(record.location) || null,
    briefText: clean(record.brief_text),
    sharedContext: isRecord(record.shared_context) ? record.shared_context : {},
    expiresAt: clean(record.expires_at),
  };
}

export async function loadClaimedVendorProposalOpportunities(vendorSlug: string): Promise<VendorProposalOpportunity[]> {
  const result = await apiFetch<Record<string, unknown>>(
    `/wedding/vendor/proposal-opportunities?vendor_slug=${encodeURIComponent(vendorSlug)}`,
  );
  return (Array.isArray(result.opportunities) ? result.opportunities : []).flatMap((value) => {
    const item = normalize(value);
    return item ? [item] : [];
  });
}

export async function submitClaimedVendorProposal(input: {
  vendorSlug: string; opportunityId: string; message: string;
  amount?: number; currency?: string; validUntil?: string;
}): Promise<void> {
  await apiFetch(`/wedding/vendor/proposal-opportunities/${encodeURIComponent(input.opportunityId)}/responses`, {
    method: "POST",
    bodyJson: {
      vendor_slug: input.vendorSlug, message: input.message,
      amount: input.amount, currency: input.currency, valid_until: input.validUntil,
    },
  });
}

export async function loadPublicVendorProposalOpportunity(token: string): Promise<VendorProposalOpportunity> {
  const response = await fetch(`/api/public/wedding/proposal-opportunities/${encodeURIComponent(token)}`, {
    credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(await response.text());
  const item = normalize(await response.json());
  if (!item) throw new Error("This proposal opportunity is not available.");
  return item;
}

export async function submitPublicVendorProposal(input: {
  token: string; businessName: string; businessEmail: string; message: string;
  amount?: number; currency?: string; validUntil?: string;
}): Promise<void> {
  const response = await fetch(`/api/public/wedding/proposal-opportunities/${encodeURIComponent(input.token)}`, {
    method: "POST", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      business_name: input.businessName, business_email: input.businessEmail,
      message: input.message, amount: input.amount, currency: input.currency,
      valid_until: input.validUntil,
    }),
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function createClaimedVendorProposalLeadLink(vendorSlug: string): Promise<{ url: string; expiresAt: string }> {
  const result = await apiFetch<Record<string, unknown>>("/wedding/vendor/proposal-lead-link", {
    method: "POST", bodyJson: { vendor_slug: vendorSlug },
  });
  return { url: clean(result.url), expiresAt: clean(result.expires_at) };
}

export async function revokeClaimedVendorProposalLeadLink(vendorSlug: string): Promise<void> {
  await apiFetch("/wedding/vendor/proposal-lead-link/revoke", {
    method: "POST", bodyJson: { vendor_slug: vendorSlug },
  });
}

export async function loadPublicVendorProposalLeadFeed(token: string): Promise<VendorProposalLeadFeed> {
  const response = await fetch(`/api/public/wedding/proposal-leads/${encodeURIComponent(token)}`, {
    credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
  });
  if (!response.ok) throw new Error(await response.text());
  const result = await response.json() as unknown;
  const record = isRecord(result) ? result : {};
  return {
    vendorId: clean(record.vendor_id), vendorName: clean(record.vendor_name), expiresAt: clean(record.expires_at),
    opportunities: (Array.isArray(record.opportunities) ? record.opportunities : []).flatMap((value) => {
      const item = normalize(value); return item ? [item] : [];
    }),
  };
}

export async function submitPublicVendorLeadResponse(input: {
  token: string; opportunityId: string; responseKind: "proposal" | "available_date" | "notify_couple";
  message: string; availableDate?: string; amount?: number; currency?: string; validUntil?: string;
}): Promise<void> {
  const response = await fetch(
    `/api/public/wedding/proposal-leads/${encodeURIComponent(input.token)}/${encodeURIComponent(input.opportunityId)}/responses`,
    {
      method: "POST", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        response_kind: input.responseKind, message: input.message, available_date: input.availableDate,
        amount: input.amount, currency: input.currency, valid_until: input.validUntil,
      }),
    },
  );
  if (!response.ok) throw new Error(await response.text());
}
