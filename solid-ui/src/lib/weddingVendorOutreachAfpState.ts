// @locs-version: 1.0
import type { SendAfpMessageInput } from "@/lib/api";
import { safeWeddingLabel, type WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import type { WeddingVendorOutreachFlowState } from "@/lib/weddingVendorOutreachFlowState";
import type { WeddingVendorChoiceIntent } from "@/lib/weddingVendorChoiceActionState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function timestampOrNow(value: string | null | undefined): string {
  const raw = clean(value);
  if (!raw) return new Date().toISOString();
  return Number.isFinite(Date.parse(raw)) ? raw : new Date().toISOString();
}

const CROCKFORD_BASE32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// The homeserver's validate_proto_message (GAP-098, src/server/mod.rs) requires
// thread_id to be a bare 26-char Crockford base32 ULID — a human-readable label
// is rejected outright. This deterministically maps an arbitrary seed string onto
// a valid-format pseudo-ULID (same input -> same output), mirroring the server's
// own deterministic_ulid() (src/server/auth.rs) used for the same reason.
function deterministicPseudoUlid(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x9e3779b9;
  let h4 = 0x85ebca6b;
  for (let i = 0; i < seed.length; i += 1) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2654435761) >>> 0;
    h3 = Math.imul((h3 ^ c) + h1, 2246822519) >>> 0;
    h4 = Math.imul((h4 ^ c) + h2, 3266489917) >>> 0;
  }
  const bytes = new Uint8Array(16);
  [h1, h2, h3, h4].forEach((word, index) => {
    bytes[index * 4] = (word >>> 24) & 0xff;
    bytes[index * 4 + 1] = (word >>> 16) & 0xff;
    bytes[index * 4 + 2] = (word >>> 8) & 0xff;
    bytes[index * 4 + 3] = word & 0xff;
  });
  let bits = "";
  for (const byte of bytes) bits += byte.toString(2).padStart(8, "0");
  bits = bits.padEnd(130, "0");
  let out = "";
  for (let i = 0; i < 26; i += 1) {
    out += CROCKFORD_BASE32[parseInt(bits.slice(i * 5, i * 5 + 5), 2)];
  }
  return out;
}

export function weddingVendorOutreachThreadId(input: {
  responseWorkspaceId: string;
  choiceId: string;
}): string {
  const seed = `wedding_vendor_outreach:${safeWeddingLabel(input.responseWorkspaceId)}:${safeWeddingLabel(input.choiceId)}`;
  return deterministicPseudoUlid(seed);
}

export function weddingVendorOutreachDraftAfpSendInput(input: {
  flow: WeddingVendorOutreachFlowState;
  metadata: WeddingPlanningMetadata;
  sourceArtifactId?: string | null;
  vendorId?: string | null;
  editorHtml?: string | null;
  createdAt?: string | null;
  actionIntent?: WeddingVendorChoiceIntent | null;
}): SendAfpMessageInput {
  const timestamp = timestampOrNow(input.createdAt);
  const threadId = weddingVendorOutreachThreadId({
    responseWorkspaceId: input.metadata.responseWorkspaceId,
    choiceId: input.flow.choiceId,
  });
  const to = clean(input.flow.recipientEmail ?? "");
  const subject = clean(input.flow.subject);
  const text = clean(input.flow.bodyMarkdown);
  const html = clean(input.editorHtml ?? "");
  const metadataId = `afp-${safeWeddingLabel(threadId)}-draft-${safeWeddingLabel(timestamp)}`;
  return {
    id: deterministicPseudoUlid(metadataId),
    thread_id: threadId,
    from: "agent://wedding-planning",
    to: ["user://couple", "agent://decision-queue", "agent://knowledge-graph"],
    timestamp,
    type: "email_draft",
    kind: "wedding_vendor_outreach_draft",
    subtype: "wedding_vendor_outreach_draft",
    content: {
      to,
      subject,
      text,
      ...(html ? { html } : {}),
      wedding_plan_id: input.metadata.weddingPlanId,
      response_workspace_id: input.metadata.responseWorkspaceId,
      vendor_label: input.flow.vendorName,
      vendor_id: input.vendorId ?? null,
      choice_id: input.flow.choiceId,
      grounded_on: input.flow.groundedOnLabels,
      source_artifact_id: input.sourceArtifactId ?? null,
      action_intent: input.actionIntent ?? "CHECK_AVAILABILITY_AND_REQUEST_QUOTE",
    },
    views: [{
      format: "email",
      content: { to, subject, text, ...(html ? { html } : {}) },
    }],
    attachments: [],
    references: input.sourceArtifactId
      ? [{ type: "wedding_vendor_search_artifact", target: input.sourceArtifactId, label: "Vendor search result" }]
      : [],
    supertags: uniqueStrings([
      ...input.metadata.supertags,
      "wedding_vendor_outreach",
      "wedding_email_draft",
    ]),
    metadata: {
      id: metadataId,
      wedding_plan_id: input.metadata.weddingPlanId,
      response_workspace_id: input.metadata.responseWorkspaceId,
      choice_id: input.flow.choiceId,
      vendor_id: input.vendorId ?? null,
      vendor_label: input.flow.vendorName,
      action_intent: input.actionIntent ?? "CHECK_AVAILABILITY_AND_REQUEST_QUOTE",
    },
    store_in_relational: true,
  };
}

export function weddingVendorOutreachSentAfpSendInput(input: {
  flow: WeddingVendorOutreachFlowState;
  metadata: WeddingPlanningMetadata;
  draftMessageId: string;
  providerReceipt: { providerMessageId: string | null; clientMessageId: string | null };
  vendorId?: string | null;
  createdAt?: string | null;
  actionIntent?: WeddingVendorChoiceIntent | null;
}): SendAfpMessageInput {
  const timestamp = timestampOrNow(input.createdAt);
  const threadId = weddingVendorOutreachThreadId({
    responseWorkspaceId: input.metadata.responseWorkspaceId,
    choiceId: input.flow.choiceId,
  });
  const to = clean(input.flow.recipientEmail ?? "");
  const subject = clean(input.flow.subject);
  const text = clean(input.flow.bodyMarkdown);
  return {
    id: deterministicPseudoUlid(`${threadId}:sent:${input.draftMessageId}:${timestamp}`),
    thread_id: threadId,
    parent_id: input.draftMessageId,
    from: "agent://wedding-planning",
    to: ["user://couple", "agent://decision-queue", "agent://knowledge-graph"],
    timestamp,
    type: "email",
    kind: "wedding_vendor_outreach_sent",
    subtype: "wedding_vendor_outreach_sent",
    content: {
      to,
      subject,
      text,
      wedding_plan_id: input.metadata.weddingPlanId,
      response_workspace_id: input.metadata.responseWorkspaceId,
      vendor_label: input.flow.vendorName,
      vendor_id: input.vendorId ?? null,
      choice_id: input.flow.choiceId,
      provider: "gmail",
      provider_message_id: input.providerReceipt.providerMessageId,
      client_message_id: input.providerReceipt.clientMessageId,
      sent_at: timestamp,
      action_intent: input.actionIntent ?? "CHECK_AVAILABILITY_AND_REQUEST_QUOTE",
    },
    views: [{
      format: "email",
      content: { to, subject, text },
    }],
    attachments: [],
    references: [{ type: "wedding_vendor_outreach_draft", target: input.draftMessageId, label: "Outreach draft" }],
    supertags: uniqueStrings([
      ...input.metadata.supertags,
      "wedding_vendor_outreach",
      "delivery_confirmed",
    ]),
    metadata: {
      wedding_plan_id: input.metadata.weddingPlanId,
      response_workspace_id: input.metadata.responseWorkspaceId,
      vendor_contact_thread_id: threadId,
      vendor_contact_receipt_ref: input.providerReceipt.clientMessageId,
      approval_mode: "explicit_user_send",
      action_intent: input.actionIntent ?? "CHECK_AVAILABILITY_AND_REQUEST_QUOTE",
    },
    store_in_relational: true,
  };
}
