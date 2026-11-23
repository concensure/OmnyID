// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import { normalizeWeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";

export type WeddingRsvpTestDelivery = {
  id: string;
  recipient: string;
  subject: string;
  hostLabel: string;
  fallbackUrl: string;
  body: string;
  householdLabel: string;
};

function base(input: WeddingRsvpTestDelivery, metadataInput: unknown, kind: "wedding_rsvp_test_draft" | "wedding_rsvp_test_approval", nowIso: string): SendAfpMessageInput {
  const metadata = normalizeWeddingPlanningMetadata(metadataInput);
  const approval = kind.endsWith("approval");
  return {
    id: `${input.id}:${approval ? "approval" : "draft"}:${globalThis.crypto?.randomUUID?.() ?? Date.now()}`,
    thread_id: `wedding_rsvp_tests:${metadata.responseWorkspaceId}`,
    from: "user://wedding-couple", to: ["agent://wedding-planning"], type: "ledger", kind, subtype: kind,
    content: {
      kind, contract_version: 1, test_id: input.id, household_label: input.householdLabel,
      recipient: input.recipient.toLowerCase(), subject: input.subject, host_label: input.hostLabel,
      fallback_url: input.fallbackUrl, exact_content: input.body, approval_status: approval ? "approved" : "draft",
      sends_message: false, changes_household_lifecycle: false, created_at: nowIso,
    },
    metadata: { template: "wedding_planning", weddingPlanId: metadata.weddingPlanId, responseWorkspaceId: metadata.responseWorkspaceId, origin: "wedding_rsvp_test_delivery", approval_status: approval ? "approved" : "draft", sends_message: false, model_calls: 0 },
    references: [{ type: "test_view", target: input.fallbackUrl, label: "Short-lived RSVP test view" }],
    supertags: ["template:wedding_planning", `wedding_rsvp:test_${approval ? "approval" : "draft"}`, "household_lifecycle:not_changed"],
    store_in_relational: true,
  };
}

export function weddingRsvpTestDraftToAfp(input: WeddingRsvpTestDelivery, metadata?: unknown, nowIso = new Date().toISOString()) { return base(input, metadata, "wedding_rsvp_test_draft", nowIso); }
export function weddingRsvpTestApprovalToAfp(input: WeddingRsvpTestDelivery, metadata?: unknown, nowIso = new Date().toISOString()) { return base(input, metadata, "wedding_rsvp_test_approval", nowIso); }
