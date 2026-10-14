// @locs-version: 2.0
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import { normalizeWeddingArtifactSummary } from "@/lib/weddingArtifactState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingOutreachReplyStatus = "not_sent" | "waiting" | "replied" | "unresponsive";
export type WeddingOutreachEscalationStage =
  | "initial_outreach"
  | "waiting_for_reply"
  | "follow_up_due"
  | "escalate_to_user"
  | "mark_unresponsive"
  | "closed";

export type WeddingOutreachEscalationOption = {
  id: "send_initial" | "send_one_follow_up" | "follow_up_again" | "move_on" | "call_vendor" | "suggest_alternatives" | "no_action";
  label: string;
  description: string;
  approvalRequired: boolean;
};

export type WeddingOutreachEscalationState = {
  metadata: WeddingPlanningMetadata;
  vendorLabel: string;
  vendorPhoneLabel: string | null;
  status: WeddingOutreachReplyStatus;
  stage: WeddingOutreachEscalationStage;
  dayCount: number | null;
  stageLabel: string;
  decisionPrompt: string;
  options: WeddingOutreachEscalationOption[];
  taskItem: WeddingPlanningTaskItem;
  artifactInput: WeddingArtifactInput;
  generatedArtifact: WeddingGeneratedArtifact | null;
  markdown: string;
};

export type WeddingOutreachEscalationInput = {
  metadata?: unknown;
  vendorLabel?: string | null;
  vendorId?: string | null;
  vendorTypeLabel?: string | null;
  vendorPhoneLabel?: string | null;
  vendorContactMethod?: string | null;
  vendorContactReceiptRef?: string | null;
  vendorContactThreadId?: string | null;
  initialOutreachSentAt?: string | null;
  replyReceivedAt?: string | null;
  followUpDueAt?: string | null;
  vendorReplySummary?: string | null;
  now?: string | null;
  alternativeVendorLabels?: readonly string[] | null;
  sourceLabels?: readonly string[] | null;
  createdAt?: number | null;
};

export type WeddingVendorContactOutreachRecord = {
  contactMethod?: string | null;
  lastContactAt?: string | null;
  responseReceivedAt?: string | null;
  followUpDueAt?: string | null;
  threadId?: string | null;
  receiptRef?: string | null;
  notes?: string | null;
};

export type WeddingVendorContactOutreachVendor = {
  vendorId?: string | null;
  vendorName?: string | null;
  category?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  address?: string | null;
  websiteUrl?: string | null;
  sourceLabel?: string | null;
  userContact?: WeddingVendorContactOutreachRecord | null;
};

export type WeddingVendorContactOutreachInput = {
  metadata?: unknown;
  vendor?: WeddingVendorContactOutreachVendor | null;
  now?: string | null;
  alternativeVendorLabels?: readonly string[] | null;
  createdAt?: number | null;
};

export type WeddingVendorContactOutreachTaskItemsInput = {
  metadata?: unknown;
  vendors?: readonly WeddingVendorContactOutreachVendor[] | null;
  now?: string | null;
  alternativeVendorLabels?: readonly string[] | null;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
  createdAt?: number | null;
};

function clean(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[] | null | undefined, limit = 16): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function replySummaryFromNotes(value: unknown): string | null {
  const notes = clean(value);
  if (!notes) return null;
  // Reply projection stores a provenance label, optional subject, and the
  // received-message excerpt separated by pipes. The excerpt is what helps a
  // couple decide what to do next; provider labels are not useful here.
  const parts = notes.split("|").map((part) => part.trim()).filter(Boolean);
  const meaningful = parts.filter((part) => !/^(?:AFP vendor reply|Subject:)/i.test(part));
  const bodyExcerpt = meaningful.at(-1);
  if (bodyExcerpt) {
    const summary = bodyExcerpt
    .replace(/\s+/g, " ")
    .trim();
    return summary ? summary.slice(0, 320) : null;
  }
  // A subject is routing metadata, not a useful response summary. If Gmail did
  // not return a body excerpt, turn an enquiry subject into a plain-language
  // status instead of displaying the raw subject line to the couple.
  const subject = parts.find((part) => /^Subject:/i.test(part))?.replace(/^Subject:\s*/i, "").trim() ?? "";
  if (/photograph/i.test(subject)) return "They replied about your wedding photography enquiry.";
  if (/venue/i.test(subject)) return "They replied about your wedding venue enquiry.";
  if (/celebran|offician/i.test(subject)) return "They replied about your ceremony enquiry.";
  return subject ? "They replied to your wedding enquiry; open the response for the details." : null;
}

function parseDate(value: unknown): Date | null {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function wholeDaysBetween(start: Date, end: Date): number {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

function stageFor(input: {
  initialSentAt: Date | null;
  replyReceivedAt: Date | null;
  followUpDueAt: Date | null;
  now: Date;
  dayCount: number | null;
}): WeddingOutreachEscalationStage {
  if (input.replyReceivedAt) return "closed";
  if (input.initialSentAt && input.followUpDueAt && input.followUpDueAt.getTime() > input.now.getTime()) {
    return "waiting_for_reply";
  }
  if (!input.initialSentAt) return "initial_outreach";
  if (input.followUpDueAt && input.followUpDueAt.getTime() <= input.now.getTime() && (input.dayCount ?? 0) < 7) {
    return "follow_up_due";
  }
  if ((input.dayCount ?? 0) >= 10) return "mark_unresponsive";
  if ((input.dayCount ?? 0) >= 7) return "escalate_to_user";
  if ((input.dayCount ?? 0) >= 5) return "follow_up_due";
  return "initial_outreach";
}

function optionsFor(stage: WeddingOutreachEscalationStage, phoneLabel: string | null): WeddingOutreachEscalationOption[] {
  if (stage === "closed") {
    return [{
      id: "no_action",
      label: "No action needed",
      description: "A reply has been recorded; continue from the vendor response instead of sending more outreach.",
      approvalRequired: false,
    }];
  }
  if (stage === "waiting_for_reply") {
    return [{
      id: "no_action",
      label: "Wait for reply",
      description: "The vendor has been contacted and the follow-up date has not arrived yet.",
      approvalRequired: false,
    }];
  }
  if (stage === "mark_unresponsive") {
    return [
      {
        id: "suggest_alternatives",
        label: "Mark unresponsive and suggest alternatives",
        description: "Close this outreach loop and move attention to other suitable vendors.",
        approvalRequired: false,
      },
      {
        id: "call_vendor",
        label: phoneLabel ? `Call them: ${phoneLabel}` : "Call them",
        description: phoneLabel ? "Use the recorded phone number before closing the vendor." : "Ask for or research a phone number before calling.",
        approvalRequired: false,
      },
    ];
  }
  if (stage === "escalate_to_user") {
    return [
      {
        id: "follow_up_again",
        label: "Follow up again",
        description: "Draft a last attempt. This remains blocked until the user approves sending.",
        approvalRequired: true,
      },
      {
        id: "move_on",
        label: "Move on to other vendors",
        description: "Collapse this vendor from the active shortlist and prioritize alternatives.",
        approvalRequired: false,
      },
      {
        id: "call_vendor",
        label: phoneLabel ? `Call them: ${phoneLabel}` : "Call them",
        description: phoneLabel ? "Use the recorded phone number." : "Ask for or research a phone number before calling.",
        approvalRequired: false,
      },
    ];
  }
  if (stage === "follow_up_due") {
    return [{
      id: "send_one_follow_up",
      label: "Send one follow-up",
      description: "Draft a single polite follow-up after 5 days without a response. User approval is required before sending.",
      approvalRequired: true,
    }];
  }
  return [{
    id: "send_initial",
    label: "Send initial outreach",
    description: "Draft the initial vendor inquiry. User approval is required before sharing contact details or sending.",
    approvalRequired: true,
  }];
}

function stageLabel(stage: WeddingOutreachEscalationStage): string {
  if (stage === "waiting_for_reply") return "Waiting for reply";
  if (stage === "follow_up_due") return "Second attempt due";
  if (stage === "escalate_to_user") return "Escalate to user";
  if (stage === "mark_unresponsive") return "Mark unresponsive";
  if (stage === "closed") return "Reply received";
  return "Initial outreach";
}

function decisionPrompt(input: {
  stage: WeddingOutreachEscalationStage;
  vendorLabel: string;
  dayCount: number | null;
  vendorReplySummary: string | null;
}): string {
  if (input.stage === "escalate_to_user") {
    return `No reply from ${input.vendorLabel} after ${input.dayCount ?? 7} days. Choose: follow up again, move on, or call them.`;
  }
  if (input.stage === "mark_unresponsive") {
    return `No reply from ${input.vendorLabel} after ${input.dayCount ?? 10} days. Mark as unresponsive and suggest alternatives.`;
  }
  if (input.stage === "follow_up_due") {
    return `${input.vendorLabel} has not replied after ${input.dayCount ?? 5} days. Draft one follow-up?`;
  }
  if (input.stage === "waiting_for_reply") {
    return `${input.vendorLabel} has been contacted. Wait until the planned follow-up date before nudging.`;
  }
  if (input.stage === "closed") {
    return input.vendorReplySummary
      ? `${input.vendorLabel} said: ${input.vendorReplySummary}`
      : `${input.vendorLabel} replied. Review the recorded response before taking another step.`;
  }
  return `Draft initial outreach to ${input.vendorLabel}?`;
}

function markdownFor(input: {
  vendorLabel: string;
  vendorTypeLabel: string;
  dayCount: number | null;
  stageLabel: string;
  decisionPrompt: string;
  options: readonly WeddingOutreachEscalationOption[];
  alternatives: readonly string[];
}): string {
  const alternatives = input.alternatives.length > 0
    ? input.alternatives.map((label) => `- ${label}`).join("\n")
    : "- No alternatives selected yet; research or ask the user before recommending replacements.";
  const options = input.options
    .map((option) => `- ${option.label}: ${option.description}${option.approvalRequired ? " Approval required before sending." : ""}`)
    .join("\n");
  return [
    `# Outreach escalation for ${input.vendorLabel}`,
    "",
    `Vendor type: ${input.vendorTypeLabel}`,
    `Current stage: ${input.stageLabel}`,
    `Days since initial outreach: ${input.dayCount ?? "not sent"}`,
    "",
    "## DecisionOS Prompt",
    "",
    input.decisionPrompt,
    "",
    "## Options",
    "",
    options,
    "",
    "## Alternative vendors",
    "",
    alternatives,
    "",
    "## No-spam rule",
    "",
    "- Send only after explicit user approval.",
    "- Send at most one automatic follow-up at day 5 unless the user chooses a final attempt at day 7.",
    "- Mark unresponsive at day 10 and suggest alternatives instead of continuing to chase.",
  ].join("\n");
}

export function buildWeddingOutreachEscalationState(input: WeddingOutreachEscalationInput): WeddingOutreachEscalationState {
  const metadata = normalizeWeddingPlanningMetadata({
    ...(input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {}),
    artifactKind: "email_draft",
    approvalState: "draft",
    supertags: ["wedding_outreach", "contact_follow_up", "decisionos"],
  });
  const vendorLabel = clean(input.vendorLabel) || "selected vendor";
  const vendorId = clean(input.vendorId) || null;
  const vendorTypeLabel = clean(input.vendorTypeLabel) || "vendor";
  const vendorPhoneLabel = clean(input.vendorPhoneLabel) || null;
  const vendorContactMethod = clean(input.vendorContactMethod) || null;
  const vendorContactReceiptRef = clean(input.vendorContactReceiptRef) || null;
  const vendorContactThreadId = clean(input.vendorContactThreadId) || null;
  const initialSentAt = parseDate(input.initialOutreachSentAt);
  const replyReceivedAt = parseDate(input.replyReceivedAt);
  const followUpDueAt = parseDate(input.followUpDueAt);
  const vendorReplySummary = clean(input.vendorReplySummary) || null;
  const now = parseDate(input.now) ?? new Date();
  const dayCount = initialSentAt ? wholeDaysBetween(initialSentAt, now) : null;
  const stage = stageFor({ initialSentAt, replyReceivedAt, followUpDueAt, now, dayCount });
  const label = stageLabel(stage);
  const options = optionsFor(stage, vendorPhoneLabel);
  const prompt = decisionPrompt({ stage, vendorLabel, dayCount, vendorReplySummary });
  const alternatives = uniqueStrings(input.alternativeVendorLabels, 8);
  const markdown = markdownFor({
    vendorLabel,
    vendorTypeLabel,
    dayCount,
    stageLabel: label,
    decisionPrompt: prompt,
    options,
    alternatives,
  });
  const taskItem: WeddingPlanningTaskItem = {
    id: `wedding-task:outreach-escalation:${safeWeddingLabel(metadata.weddingPlanId)}:${safeWeddingLabel(vendorLabel)}`,
    title: stage === "mark_unresponsive"
      ? `Mark ${vendorLabel} unresponsive and review alternatives`
      : stage === "escalate_to_user"
        ? `Decide next outreach step for ${vendorLabel}`
        : stage === "follow_up_due"
          ? `Review one follow-up to ${vendorLabel}`
          : stage === "closed"
            ? `Review reply from ${vendorLabel}`
            : stage === "waiting_for_reply"
              ? `Wait for reply from ${vendorLabel}`
            : `Review initial outreach to ${vendorLabel}`,
    kind: "vendor_follow_up",
    dueLabel: stage === "initial_outreach"
      ? "Before contacting vendor"
      : stage === "waiting_for_reply"
        ? followUpDueAt ? `Follow up on ${followUpDueAt.toISOString().slice(0, 10)}` : "Follow-up scheduled"
      : stage === "follow_up_due"
        ? "5 days after initial outreach"
        : stage === "escalate_to_user"
          ? "7 days after initial outreach"
          : stage === "mark_unresponsive"
            ? "10 days after initial outreach"
            : "Reply received",
    priority: stage === "mark_unresponsive" || stage === "escalate_to_user" ? "high" : "normal",
    source: "agent",
    reviewStatus: "needs_review",
    approvalState: options.some((option) => option.approvalRequired) ? "pending_user_approval" : "draft",
    notes: prompt,
    metadata: {
      ...metadata,
      outreach_escalation_stage: stage,
      vendor_id: vendorId,
      vendor_label: vendorLabel,
      vendor_type_label: vendorTypeLabel,
      vendor_contact_method: vendorContactMethod,
      vendor_contact_receipt_ref: vendorContactReceiptRef,
      vendor_contact_thread_id: vendorContactThreadId,
      day_count: dayCount,
      follow_up_due_at: followUpDueAt?.toISOString() ?? null,
      second_order_loop: "contact_follow_up",
      no_spam_policy: true,
      approval_required_option_ids: options.filter((option) => option.approvalRequired).map((option) => option.id),
    },
  };
  const artifactInput: WeddingArtifactInput = {
    id: `wedding_artifact:outreach_escalation:${safeWeddingLabel(metadata.weddingPlanId)}:${safeWeddingLabel(vendorLabel)}`,
    title: `Outreach escalation: ${vendorLabel}`,
    kind: "email_draft",
    createdAt: input.createdAt ?? Date.now(),
    metadata,
    exportTargets: ["markdown", "html", "word_doc"],
    sourceLabels: uniqueStrings([
      ...(input.sourceLabels ?? []),
      "Outreach escalation ladder",
      "No-spam policy",
      vendorLabel,
      vendorTypeLabel,
      ...alternatives,
    ]),
    vendorLabels: uniqueStrings([vendorLabel, ...alternatives]),
    linkedTaskIds: [taskItem.id],
    bodyText: markdown,
  };
  const summary = normalizeWeddingArtifactSummary(artifactInput);
  const generatedArtifact: WeddingGeneratedArtifact | null = summary
    ? {
      input: artifactInput,
      summary,
      markdown,
      csv: null,
    }
    : null;

  return {
    metadata,
    vendorLabel,
    vendorPhoneLabel,
    status: replyReceivedAt ? "replied" : stage === "mark_unresponsive" ? "unresponsive" : initialSentAt ? "waiting" : "not_sent",
    stage,
    dayCount,
    stageLabel: label,
    decisionPrompt: prompt,
    options,
    taskItem,
    artifactInput,
    generatedArtifact,
    markdown,
  };
}

export function buildWeddingOutreachEscalationStateFromVendorContact(
  input: WeddingVendorContactOutreachInput,
): WeddingOutreachEscalationState {
  const vendor = input.vendor ?? {};
  const contact = vendor.userContact ?? null;
  const sourceLabels = uniqueStrings([
    vendor.sourceLabel,
    contact?.receiptRef ? `Outreach receipt: ${contact.receiptRef}` : null,
    contact?.threadId ? `Thread: ${contact.threadId}` : null,
    contact?.contactMethod ? `Contact method: ${contact.contactMethod}` : null,
  ]);

  return buildWeddingOutreachEscalationState({
    metadata: input.metadata,
    vendorId: vendor.vendorId,
    vendorLabel: vendor.vendorName,
    vendorTypeLabel: vendor.category,
    vendorPhoneLabel: vendor.contactPhone,
    vendorContactMethod: contact?.contactMethod,
    vendorContactReceiptRef: contact?.receiptRef,
    vendorContactThreadId: contact?.threadId,
    initialOutreachSentAt: contact?.lastContactAt,
    replyReceivedAt: contact?.responseReceivedAt,
    followUpDueAt: contact?.followUpDueAt,
    vendorReplySummary: replySummaryFromNotes(contact?.notes),
    now: input.now,
    alternativeVendorLabels: input.alternativeVendorLabels,
    sourceLabels,
    createdAt: input.createdAt,
  });
}

export function buildWeddingVendorContactOutreachTaskItems(
  input: WeddingVendorContactOutreachTaskItemsInput,
): WeddingPlanningTaskItem[] {
  const existingIds = new Set((input.existingTaskItems ?? []).map((task) => task.id));
  const tasks: WeddingPlanningTaskItem[] = [];
  for (const vendor of input.vendors ?? []) {
    if (!vendor.userContact?.lastContactAt) continue;
    const state = buildWeddingOutreachEscalationStateFromVendorContact({
      metadata: input.metadata,
      vendor,
      now: input.now,
      alternativeVendorLabels: input.alternativeVendorLabels,
      createdAt: input.createdAt,
    });
    if (state.stage === "closed" || state.stage === "waiting_for_reply") continue;
    if (existingIds.has(state.taskItem.id)) continue;
    existingIds.add(state.taskItem.id);
    tasks.push(state.taskItem);
  }
  return tasks;
}
