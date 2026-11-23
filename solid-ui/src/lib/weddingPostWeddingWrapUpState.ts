// @locs-version: 2.0
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type { WeddingPlanningTaskItem } from "@/lib/weddingCalendarProjectionState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingPostWeddingAudience = "guests" | "vendors" | "family";

export type WeddingPostWeddingThankYouDraft = {
  id: string;
  audience: WeddingPostWeddingAudience;
  title: string;
  decisionPrompt: string;
  recipientCount: number;
  sampleLine: string;
  approvalRequired: true;
  knownMemoryLabels: string[];
};

export type WeddingPostWeddingFeedbackPrompt = {
  id: string;
  vendorLabel: string;
  ratingPrompt: string;
  notePrompt: string;
};

export type WeddingPostWeddingKeepsakeExportOption = {
  id: "secure_pdf" | "digital_scrapbook";
  label: string;
  description: string;
  exportTargets: readonly ("browser_pdf" | "html" | "word_doc" | "bundle_planned")[];
  privacyNote: string;
};

export type WeddingPostWeddingWrapUpState = {
  metadata: WeddingPlanningMetadata;
  status: "ready" | "needs_context";
  summaryLabel: string;
  decisionPrompt: string;
  thankYouDrafts: WeddingPostWeddingThankYouDraft[];
  feedbackPrompts: WeddingPostWeddingFeedbackPrompt[];
  keepsakeExportOptions: WeddingPostWeddingKeepsakeExportOption[];
  taskItems: WeddingPlanningTaskItem[];
  artifactInput: WeddingArtifactInput;
  markdown: string;
};

export type WeddingPostWeddingWrapUpInput = {
  metadata?: unknown;
  coupleLabel?: string | null;
  weddingDateLabel?: string | null;
  guestNames?: readonly string[] | null;
  vendorNames?: readonly string[] | null;
  familyNames?: readonly string[] | null;
  knownMemoryLabels?: readonly string[] | null;
  sourceLabels?: readonly string[] | null;
  createdAt?: number | null;
};

export type WeddingPostWeddingTaskItemsInput = {
  artifacts?: readonly WeddingArtifactInput[] | null;
  metadata?: unknown;
  existingTaskItems?: readonly WeddingPlanningTaskItem[] | null;
};

function clean(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[] | null | undefined, limit = 18): string[] {
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

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function taskId(metadata: WeddingPlanningMetadata, label: string): string {
  return `wedding-task:post-wedding:${safeWeddingLabel(metadata.weddingPlanId)}:${safeWeddingLabel(label)}`;
}

function thankYouDraft(
  metadata: WeddingPlanningMetadata,
  audience: WeddingPostWeddingAudience,
  recipients: readonly string[],
  knownMemoryLabels: readonly string[],
): WeddingPostWeddingThankYouDraft {
  const audienceLabel = audience === "guests" ? "guests" : audience === "vendors" ? "vendors" : "family";
  const memoryCue = knownMemoryLabels[0] ?? "known wedding memories only";
  return {
    id: `thank-you:${safeWeddingLabel(metadata.weddingPlanId)}:${audience}`,
    audience,
    title: `Draft thank-you notes for ${audienceLabel}`,
    decisionPrompt: `Should I draft ${audienceLabel} thank-you notes now?`,
    recipientCount: recipients.length,
    sampleLine: audience === "vendors"
      ? `Thank you for helping make the day run smoothly; personalize with confirmed vendor contribution such as ${memoryCue}.`
      : `Thank you for being part of our wedding; personalize with confirmed memories such as ${memoryCue}.`,
    approvalRequired: true,
    knownMemoryLabels: [...knownMemoryLabels],
  };
}

function wrapUpTask(
  metadata: WeddingPlanningMetadata,
  input: {
    idLabel: string;
    title: string;
    kind: WeddingPlanningTaskItem["kind"];
    notes: string;
    dueLabel?: string | null;
    priority?: WeddingPlanningTaskItem["priority"];
  },
): WeddingPlanningTaskItem {
  return {
    id: taskId(metadata, input.idLabel),
    title: input.title,
    kind: input.kind,
    dueLabel: input.dueLabel ?? "Post-wedding wrap-up",
    priority: input.priority ?? "normal",
    source: "agent",
    reviewStatus: "needs_review",
    approvalState: "draft",
    notes: input.notes,
    metadata: {
      ...metadata,
      wedding_phase: "post_wedding",
      post_wedding_wrap_up: true,
      post_wedding_action_id: input.idLabel,
      decisionos_surface: true,
      reversible_completion: true,
      no_external_send_without_approval: true,
      preparation_checklist: true,
      preparation_checklist_item: "post_wedding_wrap_up",
      user_selectable: true,
      can_deselect_before_commit: true,
      searchable_terms: [
        input.title,
        input.notes,
        "post-wedding",
        "thank-you notes",
        "vendor feedback",
        "keepsake export",
        metadata.weddingPlanId,
        metadata.responseWorkspaceId,
      ],
    },
  };
}

function taskRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function existingPostWeddingKeys(taskItems: readonly WeddingPlanningTaskItem[]): Set<string> {
  const keys = new Set<string>();
  for (const item of taskItems) {
    keys.add(item.id);
    const actionId = clean(taskRecord(item.metadata).post_wedding_action_id);
    if (actionId) keys.add(actionId);
  }
  return keys;
}

function isPostWeddingWrapUpArtifact(artifact: WeddingArtifactInput): boolean {
  return artifact.kind === "decision_log"
    && /post-wedding|post wedding|thank-you|thank you|vendor feedback|keepsake|digital scrapbook/i.test(`${clean(artifact.title)}\n${clean(artifact.bodyText)}`);
}

export function buildWeddingPostWeddingWrapUpTaskItems(input: WeddingPostWeddingTaskItemsInput): WeddingPlanningTaskItem[] {
  const artifact = (input.artifacts ?? []).find(isPostWeddingWrapUpArtifact);
  if (!artifact) return [];
  const metadata = normalizeWeddingPlanningMetadata(input.metadata ?? artifact.metadata);
  const existingKeys = existingPostWeddingKeys(input.existingTaskItems ?? []);
  return [
    wrapUpTask(metadata, {
      idLabel: "draft-thank-you-notes",
      title: "Draft post-wedding thank-you notes",
      kind: "email_draft",
      priority: "high",
      notes: "Prepare guest, vendor, and family drafts from confirmed memories only; user approval required before sending.",
    }),
    wrapUpTask(metadata, {
      idLabel: "collect-vendor-feedback",
      title: "Collect private vendor feedback",
      kind: "vendor_follow_up",
      notes: "Capture ratings and notes for booked vendors before any public review or testimonial is shared.",
    }),
    wrapUpTask(metadata, {
      idLabel: "prepare-keepsake-export",
      title: "Prepare secure wedding log and digital scrapbook exports",
      kind: "decision",
      notes: "Offer Secure PDF and Digital scrapbook export options with private-by-default sharing.",
    }),
  ].filter((task) => !existingKeys.has(task.id) && !existingKeys.has(clean(taskRecord(task.metadata).post_wedding_action_id)))
    .map((task) => ({ ...task, linkedArtifactId: clean(artifact.id) || null }));
}

function markdownFor(input: {
  coupleLabel: string;
  weddingDateLabel: string;
  thankYouDrafts: readonly WeddingPostWeddingThankYouDraft[];
  feedbackPrompts: readonly WeddingPostWeddingFeedbackPrompt[];
  keepsakeExportOptions: readonly WeddingPostWeddingKeepsakeExportOption[];
  knownMemoryLabels: readonly string[];
}): string {
  const memories = input.knownMemoryLabels.length > 0
    ? input.knownMemoryLabels.map((item) => `- ${item}`).join("\n")
    : "- No confirmed memories available yet. Ask the user before inventing personal details.";
  const thankYous = input.thankYouDrafts
    .map((draft) => `- ${draft.title}: ${draft.recipientCount} recipients. Approval required before sending.`)
    .join("\n");
  const feedback = input.feedbackPrompts.length > 0
    ? input.feedbackPrompts.map((prompt) => `- ${prompt.vendorLabel}: ${prompt.ratingPrompt}`).join("\n")
    : "- No vendor names captured yet; ask before building vendor feedback prompts.";
  const exports = input.keepsakeExportOptions
    .map((option) => `- ${option.label}: ${option.description}`)
    .join("\n");

  return [
    `# Post-wedding wrap-up for ${input.coupleLabel}`,
    "",
    `Wedding date: ${input.weddingDateLabel}`,
    "",
    "## DecisionOS Prompt",
    "",
    "Generate thank-you notes, collect vendor feedback, and prepare a keepsake export. No emails or public sharing occur until the user approves.",
    "",
    "## Confirmed Memory Cues",
    "",
    memories,
    "",
    "## Thank-you Notes",
    "",
    thankYous,
    "",
    "## Feedback Collection",
    "",
    feedback,
    "",
    "## Keepsake Exports",
    "",
    exports,
  ].join("\n");
}

export function buildWeddingPostWeddingWrapUpState(input: WeddingPostWeddingWrapUpInput): WeddingPostWeddingWrapUpState {
  const metadata = normalizeWeddingPlanningMetadata({
    ...(input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {}),
    artifactKind: "decision_log",
    approvalState: "draft",
    supertags: ["wedding_post_wedding", "wedding_wrap_up", "decisionos"],
  });
  const coupleLabel = clean(input.coupleLabel) || "the couple";
  const weddingDateLabel = clean(input.weddingDateLabel) || "date not captured";
  const guests = uniqueStrings(input.guestNames, 60);
  const vendors = uniqueStrings(input.vendorNames, 40);
  const family = uniqueStrings(input.familyNames, 40);
  const knownMemoryLabels = uniqueStrings(input.knownMemoryLabels, 24);
  const sourceLabels = uniqueStrings([
    ...(input.sourceLabels ?? []),
    ...knownMemoryLabels,
    knownMemoryLabels.length > 0 ? "Known wedding memories" : null,
    guests.length > 0 ? "Guest list" : null,
    vendors.length > 0 ? "Vendor list" : null,
    "Secure PDF export",
    "Digital scrapbook export",
  ]);
  const thankYouDrafts = [
    thankYouDraft(metadata, "guests", guests, knownMemoryLabels),
    thankYouDraft(metadata, "vendors", vendors, knownMemoryLabels),
    thankYouDraft(metadata, "family", family, knownMemoryLabels),
  ];
  const feedbackPrompts = vendors.map((vendorLabel) => ({
    id: `feedback:${safeWeddingLabel(metadata.weddingPlanId)}:${safeWeddingLabel(vendorLabel)}`,
    vendorLabel,
    ratingPrompt: `Rate ${vendorLabel} and capture what went well or needs follow-up.`,
    notePrompt: "Save private notes first; ask before sharing public reviews or testimonials.",
  }));
  const keepsakeExportOptions: WeddingPostWeddingKeepsakeExportOption[] = [
    {
      id: "secure_pdf",
      label: "Secure PDF",
      description: "Printable wedding log containing decisions, contracts, approved notes, and memories.",
      exportTargets: ["browser_pdf", "word_doc"],
      privacyNote: "Private by default; sharing requires explicit approval.",
    },
    {
      id: "digital_scrapbook",
      label: "Digital scrapbook",
      description: "A browsable keepsake bundle with timeline, memories, selected photos, and approved text.",
      exportTargets: ["html", "bundle_planned"],
      privacyNote: "Do not include guest-sensitive details unless the user approves the audience.",
    },
  ];
  const taskItems = [
    wrapUpTask(metadata, {
      idLabel: "draft-thank-you-notes",
      title: "Draft post-wedding thank-you notes",
      kind: "email_draft",
      priority: "high",
      notes: "Prepare guest, vendor, and family drafts from confirmed memories only; user approval required before sending.",
    }),
    wrapUpTask(metadata, {
      idLabel: "collect-vendor-feedback",
      title: "Collect private vendor feedback",
      kind: "vendor_follow_up",
      notes: "Capture ratings and notes for booked vendors before any public review or testimonial is shared.",
    }),
    wrapUpTask(metadata, {
      idLabel: "prepare-keepsake-export",
      title: "Prepare secure wedding log and digital scrapbook exports",
      kind: "decision",
      notes: "Offer Secure PDF and Digital scrapbook export options with private-by-default sharing.",
    }),
  ];
  const markdown = markdownFor({
    coupleLabel,
    weddingDateLabel,
    thankYouDrafts,
    feedbackPrompts,
    keepsakeExportOptions,
    knownMemoryLabels,
  });
  const artifactInput: WeddingArtifactInput = {
    id: `wedding_artifact:post_wedding_wrap_up:${safeWeddingLabel(metadata.weddingPlanId)}`,
    title: "Post-wedding wrap-up log",
    kind: "decision_log",
    createdAt: input.createdAt ?? Date.now(),
    metadata,
    exportTargets: ["markdown", "html", "word_doc", "browser_pdf", "bundle_planned"],
    sourceLabels,
    linkedTaskIds: taskItems.map((task) => task.id),
    bodyText: markdown,
  };
  const status = guests.length > 0 || vendors.length > 0 || family.length > 0 || knownMemoryLabels.length > 0
    ? "ready"
    : "needs_context";

  return {
    metadata,
    status,
    summaryLabel: [
      countLabel(thankYouDrafts.reduce((total, draft) => total + draft.recipientCount, 0), "recipient"),
      countLabel(feedbackPrompts.length, "vendor"),
      "2 keepsake export options",
    ].join(" · "),
    decisionPrompt: "Should I draft thank-you notes, collect vendor feedback, and prepare the wedding keepsake export now?",
    thankYouDrafts,
    feedbackPrompts,
    keepsakeExportOptions,
    taskItems,
    artifactInput,
    markdown,
  };
}
