import { apiFetch } from "@/lib/api";

export type IssuedQuotationResponseCapability = {
  capabilityId: string;
  responseToken: string;
  expiresAt: string;
};

export async function issueQuotationResponseCapability(input: {
  threadId: string;
  grantMessageId: string;
}): Promise<IssuedQuotationResponseCapability> {
  const response = await apiFetch<{
    capability_id?: unknown;
    response_token?: unknown;
    expires_at?: unknown;
  }>("/quotation/response-capabilities", {
    method: "POST",
    bodyJson: { thread_id: input.threadId, grant_message_id: input.grantMessageId },
  });
  const capabilityId = typeof response.capability_id === "string" ? response.capability_id : "";
  const responseToken = typeof response.response_token === "string" ? response.response_token : "";
  const expiresAt = typeof response.expires_at === "string" ? response.expires_at : "";
  if (!capabilityId || !responseToken || !expiresAt) throw new Error("The secure response link was not issued.");
  return { capabilityId, responseToken, expiresAt };
}

export function quotationResponsePortalUrl(responseToken: string, origin = window.location.origin): string {
  return `${origin}/workspace/quotation-response.html#token=${encodeURIComponent(responseToken)}`;
}
