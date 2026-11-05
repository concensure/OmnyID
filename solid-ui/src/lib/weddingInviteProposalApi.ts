import { apiFetch } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

export type WeddingInviteProposalApprovalRecipient = {
  vendorId: string;
  vendorName: string;
  route: "authenticated_vendor" | "verified_email" | "unclaimed_referral";
  recipientEmail: string;
};

export type WeddingInviteProposalApprovalPreflight = {
  approved: boolean;
  briefId: string;
  revision: number;
  recipients: WeddingInviteProposalApprovalRecipient[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: unknown): WeddingInviteProposalApprovalPreflight {
  const record = isRecord(value) ? value : {};
  const recipients = Array.isArray(record.recipients) ? record.recipients : [];
  return {
    approved: record.approved === true,
    briefId: clean(record.brief_id),
    revision: typeof record.revision === "number" ? record.revision : 0,
    recipients: recipients.flatMap((entry) => {
      const recipient = isRecord(entry) ? entry : {};
      const route = recipient.route;
      const vendorId = clean(recipient.vendor_id);
      const vendorName = clean(recipient.vendor_name);
      const recipientEmail = clean(recipient.recipient_email);
      if (!vendorId || !vendorName || !recipientEmail || (route !== "authenticated_vendor" && route !== "verified_email" && route !== "unclaimed_referral")) return [];
      return [{ vendorId, vendorName, recipientEmail, route }];
    }),
  };
}

export const preflightWeddingInviteProposalApproval = (body: {
  wedding_plan_id: string;
  brief_id: string;
  revision: number;
  category: string;
  location?: string | null;
  vendor_ids: string[];
}): Promise<WeddingInviteProposalApprovalPreflight> => apiFetch<unknown>(
  "/wedding/invite-proposals/approval-preflight",
  { method: "POST", bodyJson: body },
).then(normalize);

export type WeddingInviteProposalDeliveryResult = {
  vendorId: string;
  draftMessageId: string;
  status: "provider_accepted" | "in_progress" | "failed";
  providerMessageId: string | null;
  clientMessageId: string;
  error: string | null;
};

export type WeddingInviteProposalSendResult = {
  batchId: string;
  status: "accepted" | "partial" | "failed";
  approvalFingerprint: string;
  deliveries: WeddingInviteProposalDeliveryResult[];
};

function normalizeSendResult(value: unknown): WeddingInviteProposalSendResult {
  const record = isRecord(value) ? value : {};
  const status = record.status === "accepted" || record.status === "partial" ? record.status : "failed";
  return {
    batchId: clean(record.batch_id),
    status,
    approvalFingerprint: clean(record.approval_fingerprint),
    deliveries: (Array.isArray(record.deliveries) ? record.deliveries : []).flatMap((entry) => {
      const delivery = isRecord(entry) ? entry : {};
      const deliveryStatus = delivery.status;
      const vendorId = clean(delivery.vendor_id);
      const draftMessageId = clean(delivery.draft_message_id);
      const clientMessageId = clean(delivery.client_message_id);
      if (!vendorId || !draftMessageId || !clientMessageId || (deliveryStatus !== "provider_accepted" && deliveryStatus !== "in_progress" && deliveryStatus !== "failed")) return [];
      return [{
        vendorId,
        draftMessageId,
        clientMessageId,
        status: deliveryStatus,
        providerMessageId: clean(delivery.provider_message_id) || null,
        error: clean(delivery.error) || null,
      }];
    }),
  };
}

export const approveAndSendWeddingInviteProposal = (body: {
  wedding_plan_id: string;
  brief_id: string;
  revision: number;
  category: string;
  location?: string | null;
  draft_message_ids: string[];
}): Promise<WeddingInviteProposalSendResult> => apiFetch<unknown>(
  "/wedding/invite-proposals/approve-and-send",
  { method: "POST", bodyJson: body },
).then(normalizeSendResult);
