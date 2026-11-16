// @locs-version: 2.0
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import type {
  WeddingPersistedApprovalReceipt,
  WeddingPersistedDecisionRecord,
} from "@/lib/weddingPersistedWorkspaceState";
import type {
  WeddingWorkspaceSidebarAction,
  WeddingWorkspaceSidebarActionKind,
} from "@/lib/weddingWorkspaceActionState";

export type WeddingSecondOrderLoopCard = {
  id: string;
  title: string;
  statusLabel: string;
  detailLabel: string;
  evidenceLabels: string[];
  nextActionLabel: string;
  action: WeddingWorkspaceSidebarAction;
  suggestedTask: WeddingPlanningTaskItem | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function taskSafeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace";
}

function decisionIsContextualOption(record: WeddingPersistedDecisionRecord): boolean {
  const kind = clean(record.artifactKind).toLowerCase();
  const title = clean(record.artifactTitle).toLowerCase();
  const option = clean(record.selectedOptionLabel);
  if (/budget|contribution/.test(`${kind} ${title}`)) return false;
  if (/^(?:aud\s*)?\$?[\d,.]+\s+total$/i.test(option)) return false;
  if (/^20\d{2}-\d{2}-\d{2}$/.test(option) || /^\d{1,2}[/-]\d{1,2}[/-]20\d{2}$/.test(option)) return false;
  return Boolean(option);
}

function decisionIsVendorSelection(record: WeddingPersistedDecisionRecord): boolean {
  if (!decisionIsContextualOption(record)) return false;
  const descriptor = `${record.artifactKind} ${record.artifactTitle}`.toLowerCase();
  return /vendor|supplier|venue|celebrant|photograph|florist|cater|planner|music|dj|band|cake|beauty|hair|makeup|transport|quote|proposal/.test(descriptor);
}

function selectedVendorSubjectLabel(
  records: readonly WeddingPersistedDecisionRecord[] | null | undefined,
  artifacts: readonly WeddingArtifactInput[],
): string | null {
  const selected = (records ?? []).find(decisionIsVendorSelection)?.selectedOptionLabel.trim();
  if (selected) return selected;
  const quoteVendor = artifacts.find((artifact) => {
    const descriptor = `${artifact.kind} ${artifact.title} ${artifact.bodyText ?? ""}`.toLowerCase();
    return (artifact.vendorLabels?.length ?? 0) > 0
      && /quote|proposal|contract|invoice|pricing|package|minimum spend/.test(descriptor);
  })?.vendorLabels?.find((label) => label.trim().length > 0)?.trim();
  return quoteVendor || null;
}

function decisionContextLabels(records: readonly WeddingPersistedDecisionRecord[] | null | undefined): string[] {
  return (records ?? [])
    .filter(decisionIsContextualOption)
    .slice(0, 6)
    .map((record) => `Selected ${record.artifactKind.replace(/_/g, " ")}: ${record.selectedOptionLabel}`);
}

function primaryDecisionRecord(records: readonly WeddingPersistedDecisionRecord[] | null | undefined): WeddingPersistedDecisionRecord | null {
  // An overall budget is context for allocation, not the named subject of a
  // transport, weather, legal or access task. Attaching "$35,000 total" to
  // those tasks made the entire wedding budget look like category spend.
  return (records ?? []).find(decisionIsContextualOption) ?? null;
}

function importedPrivateLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

function decisionArtifactTitleForMetadata(decision: WeddingPersistedDecisionRecord): string {
  const labels = [
    decision.artifactTitle,
    ...(decision.sourceLabels ?? []),
  ].map(clean);
  return labels.some(importedPrivateLabel) ? "Imported private planning file" : decision.artifactTitle;
}

function searchableArtifactText(artifact: WeddingArtifactInput): string {
  return [
    artifact.title,
    artifact.kind,
    artifact.bodyText,
    ...(artifact.vendorLabels ?? []),
    ...(artifact.locationLabels ?? []),
    ...(artifact.sourceLabels ?? []),
  ].map((value) => clean(value)).filter(Boolean).join(" ").toLowerCase();
}

function secondOrderAction(
  kind: WeddingWorkspaceSidebarActionKind,
  label: string,
  enabled: boolean,
  reason: string | null,
  loopKind: string,
  contextLabels: string[],
): WeddingWorkspaceSidebarAction {
  return {
    kind,
    label,
    enabled,
    reason,
    metadata: { second_order_loop: loopKind },
    contextLabels,
  };
}

function secondOrderTaskMetadata(input: {
  metadata?: unknown;
  loopKind: string;
  evidenceLabels: readonly string[];
  primaryDecision?: WeddingPersistedDecisionRecord | null;
  linkedArtifactId?: string | null;
}): Record<string, unknown> {
  const decision = input.primaryDecision ?? null;
  return {
    ...record(input.metadata),
    second_order_task: true,
    second_order_loop: input.loopKind,
    second_order_evidence_labels: input.evidenceLabels,
    second_order_linked_artifact_id: clean(input.linkedArtifactId) || clean(decision?.artifactId) || null,
    selected_decision_scope: decision
      ? {
        decision_id: decision.id,
        artifact_id: decision.artifactId,
        artifact_title: decisionArtifactTitleForMetadata(decision),
        artifact_kind: decision.artifactKind,
        selected_option_id: decision.selectedOptionId,
        selected_option_label: decision.selectedOptionLabel,
        selected_option_detail: decision.selectedOptionDetail,
      }
      : null,
  };
}

function taskSecondOrderLoop(task: WeddingPlanningTaskItem): string {
  return clean(record(task.metadata).second_order_loop);
}

function taskMatchesLoop(task: WeddingPlanningTaskItem, loopKind: string): boolean {
  return taskSecondOrderLoop(task) === loopKind;
}

function outreachEscalationStage(task: WeddingPlanningTaskItem): string {
  return clean(record(task.metadata).outreach_escalation_stage);
}

function outreachEscalationStageLabel(stage: string): string | null {
  if (stage === "follow_up_due") return "day 5 follow-up due";
  if (stage === "escalate_to_user") return "day 7 escalation";
  if (stage === "mark_unresponsive") return "day 10 unresponsive";
  if (stage === "initial_outreach") return "initial outreach";
  if (stage === "closed") return "reply received";
  return null;
}

function strongestOutreachEscalationStage(tasks: readonly WeddingPlanningTaskItem[]): string | null {
  const stages = tasks.map(outreachEscalationStage).filter(Boolean);
  if (stages.includes("escalate_to_user")) return "escalate_to_user";
  if (stages.includes("mark_unresponsive")) return "mark_unresponsive";
  if (stages.includes("follow_up_due")) return "follow_up_due";
  if (stages.includes("initial_outreach")) return "initial_outreach";
  if (stages.includes("closed")) return "closed";
  return null;
}

function outreachStatusLabel(stage: string | null, fallback: string): string {
  if (stage === "escalate_to_user") return "Escalation needs user choice";
  if (stage === "mark_unresponsive") return "Vendor unresponsive";
  if (stage === "follow_up_due") return "One follow-up due";
  if (stage === "initial_outreach") return "Initial outreach needs approval";
  if (stage === "closed") return "Reply received";
  return fallback;
}

function outreachDetailLabel(stage: string | null, selectedDecisionLabels: readonly string[], fallback: string): string {
  const suffix = selectedDecisionLabels.length > 0 ? " for the selected planning path" : "";
  if (stage === "escalate_to_user") {
    return `No reply after 7 days${suffix}. The user should choose whether to send a final follow-up, move on to alternatives, or call the vendor.`;
  }
  if (stage === "mark_unresponsive") {
    return `No reply after 10 days${suffix}. Mark the vendor unresponsive and shift attention to suitable alternatives rather than continuing to chase.`;
  }
  if (stage === "follow_up_due") {
    return `One polite follow-up is due after 5 days without a reply${suffix}. Sending still requires explicit user approval.`;
  }
  if (stage === "initial_outreach") {
    return `Initial outreach is drafted${suffix}. Contact details or messages should not be sent until the user approves.`;
  }
  if (stage === "closed") {
    return `A reply has been recorded${suffix}. Continue from the vendor response instead of sending more follow-ups.`;
  }
  return fallback;
}

function outreachNextActionLabel(stage: string | null, fallback: string): string {
  if (stage === "escalate_to_user") return "Choose: final follow-up, move on to other vendors, or call.";
  if (stage === "mark_unresponsive") return "Mark unresponsive and review alternative vendors.";
  if (stage === "follow_up_due") return "Review and approve one follow-up if it is still worth sending.";
  if (stage === "initial_outreach") return "Review the initial outreach before sending or sharing contact details.";
  if (stage === "closed") return "Open the response and update the next planning task.";
  return fallback;
}

export function buildWeddingSecondOrderLoopCards(input: {
  metadata?: unknown;
  artifacts: readonly WeddingArtifactInput[];
  taskItems?: readonly WeddingPlanningTaskItem[] | null;
  scheduleItems?: readonly WeddingPlanningScheduleItem[] | null;
  approvalReceipts?: readonly WeddingPersistedApprovalReceipt[] | null;
  decisionRecords?: readonly WeddingPersistedDecisionRecord[] | null;
}): WeddingSecondOrderLoopCard[] {
  const corpus = input.artifacts.map(searchableArtifactText);
  const joined = corpus.join(" ");
  const selectedDecisionLabels = decisionContextLabels(input.decisionRecords);
  const primaryDecision = primaryDecisionRecord(input.decisionRecords);
  const selectedOptionLabel = clean(primaryDecision?.selectedOptionLabel);
  const selectedVendorLabel = selectedVendorSubjectLabel(input.decisionRecords, input.artifacts);
  const selectedEvidenceLabels = selectedDecisionLabels.length > 0
    ? selectedDecisionLabels.map((label) => `selected scope: ${label.replace(/^Selected\s+/i, "")}`)
    : [];
  const hasVenueEvidence = corpus.some((text) => /venue|ceremony|reception|location|garden|beach|harbour|outdoor/.test(text));
  const hasWeatherExposure = /weather|rain|wet.weather|outdoor|garden|beach|harbour|marquee/.test(joined);
  const hasBackupEvidence = /backup|contingenc|wet.weather|rain plan|indoor option|fallback/.test(joined);
  const backupTasks = (input.taskItems ?? []).filter((task) => taskMatchesLoop(task, "weather_backup") || /backup|weather|contingenc|rain|fallback/i.test(`${task.title} ${task.notes ?? ""}`));
  const weatherEvents = (input.scheduleItems ?? []).filter((item) => /weather|backup|contingenc|rain|outdoor/i.test(`${item.title} ${item.notes ?? ""}`));
  const contactArtifacts = input.artifacts.filter((artifact) => artifact.kind === "email_draft");
  const followUpTasks = (input.taskItems ?? []).filter((task) => taskMatchesLoop(task, "contact_follow_up") || task.kind === "vendor_follow_up" || task.kind === "email_draft");
  const hasLegalEvidence = /noim|notice of intended marriage|celebrant|legal|marriage form|registry/i.test(joined);
  const hasCommitmentEvidence = /deposit|payment|contract|terms|minimum spend|cancellation|refund|due date/i.test(joined);
  const commitmentTasks = (input.taskItems ?? []).filter((task) => (
    taskMatchesLoop(task, "commitment_timing")
    || task.kind === "legal"
    || task.kind === "budget_review"
    || /noim|celebrant|legal|deposit|payment|contract|terms|minimum spend|cancellation|refund/i.test(`${task.title} ${task.notes ?? ""}`)
  ));
  const commitmentEvents = (input.scheduleItems ?? []).filter((item) => (
    item.kind === "deposit_due"
    || item.kind === "contract_review"
    || item.kind === "noim_reminder"
    || /noim|celebrant|legal|deposit|payment|contract|review|lodg/i.test(`${item.title} ${item.notes ?? ""}`)
  ));
  const hasGuestLogisticsEvidence = /guest count|guests|transport|shuttle|parking|taxi|rideshare|accommodation|hotel|accessibility|wheelchair|mobility|stairs|pram|elderly|seating|venue access/i.test(joined);
  const hasMapOrLocationEvidence = input.artifacts.some((artifact) => (
    artifact.kind === "map_collection"
    || (artifact.locationLabels?.length ?? 0) > 0
    || /map|location|route|travel|accommodation|parking|transport/i.test(searchableArtifactText(artifact))
  ));
  const logisticsTasks = (input.taskItems ?? []).filter((task) => taskMatchesLoop(task, "guest_logistics") || /transport|shuttle|parking|taxi|rideshare|accommodation|hotel|accessibility|wheelchair|mobility|stairs|seating|guest logistics/i.test(`${task.title} ${task.notes ?? ""}`));
  const hasBudgetDriftEvidence = /unknown|tbc|estimate|estimated|minimum spend|overtime|service fee|tax|gst|travel fee|corkage|surcharge|cancellation|refund|hidden cost|extra cost|not included/i.test(joined);
  const hasBudgetArtifact = input.artifacts.some((artifact) => artifact.kind === "budget_sheet" || /budget|price|cost|quote|estimate/i.test(searchableArtifactText(artifact)));
  const budgetTasks = (input.taskItems ?? []).filter((task) => (
    taskMatchesLoop(task, "budget_drift")
    || task.kind === "budget_review"
    || /budget|quote|estimate|minimum spend|overtime|service fee|tax|gst|travel fee|surcharge|hidden cost|unknown cost/i.test(`${task.title} ${task.notes ?? ""}`)
  ));
  const executedContactReceipts = (input.approvalReceipts ?? []).filter((receipt) => (
    receipt.status === "executed"
    && (receipt.actionKind === "send_email" || receipt.actionKind === "contact_vendor")
  ));
  const cards: WeddingSecondOrderLoopCard[] = [];

  if (hasVenueEvidence || hasWeatherExposure || hasBackupEvidence || backupTasks.length > 0) {
    const evidenceLabels = [
      hasWeatherExposure ? "weather-exposed plan" : "weather exposure not explicit",
      hasBackupEvidence ? "backup mentioned" : "no backup artifact found",
      backupTasks.length > 0 ? `${backupTasks.length} backup task${backupTasks.length === 1 ? "" : "s"}` : "no backup task",
      weatherEvents.length > 0 ? `${weatherEvents.length} weather date${weatherEvents.length === 1 ? "" : "s"}` : "no weather date",
      ...selectedEvidenceLabels,
    ];
    const suggestedTask = backupTasks.length === 0
      ? {
        id: `second-order:weather-backup:${selectedOptionLabel ? taskSafeLabel(selectedOptionLabel) : "workspace"}`,
        title: selectedOptionLabel ? `Confirm wet-weather backup for ${selectedOptionLabel}` : "Confirm wet-weather backup plan",
        kind: "vendor_follow_up" as const,
        dueLabel: "Before deposit or venue commitment",
        priority: "high" as const,
        source: "agent" as const,
        reviewStatus: "accepted" as const,
        approvalState: "draft" as const,
        metadata: secondOrderTaskMetadata({
          metadata: input.metadata,
          loopKind: "weather_backup",
          evidenceLabels,
          primaryDecision,
        }),
        linkedArtifactId: primaryDecision?.artifactId ?? null,
        notes: selectedDecisionLabels.length > 0
          ? `Smart Action for selected planning path: ${selectedDecisionLabels.join("; ")}. Verify owner, indoor/fallback option, trigger date, and weather-check reminder.`
          : "Smart Action. Verify owner, indoor/fallback option, trigger date, and weather-check reminder.",
      }
      : null;
    cards.push({
      id: "second_order:weather_backup",
      title: "Weather backup Smart Action",
      statusLabel: hasBackupEvidence || backupTasks.length > 0 ? "Backup evidence found" : "Needs backup check",
      detailLabel: hasBackupEvidence
          ? `There is written evidence of a backup plan${selectedDecisionLabels.length > 0 ? " for the selected planning path" : ""}. Next, confirm the owner, timing, and day-before weather reminder.`
        : `The ${selectedDecisionLabels.length > 0 ? "selected planning path" : "plan"} has venue/location evidence but no clear wet-weather or fallback plan in the current workspace evidence.`,
      evidenceLabels,
      nextActionLabel: hasBackupEvidence
        ? "Assign the backup owner and weather-check reminder."
        : `Create or ask for a wet-weather backup task${selectedDecisionLabels.length > 0 ? " for the selected option" : ""} before treating venue planning as closed.`,
      action: secondOrderAction(
        backupTasks.length > 0 ? "open_tasks" : "open_graph",
        backupTasks.length > 0 ? "Open backup tasks" : "Show contingency gap",
        backupTasks.length > 0 || hasVenueEvidence,
        backupTasks.length > 0 || hasVenueEvidence ? null : "Needs venue or ceremony evidence first.",
        "weather_backup",
        evidenceLabels,
      ),
      suggestedTask,
    });
  }

  if (hasLegalEvidence || hasCommitmentEvidence || commitmentTasks.length > 0 || commitmentEvents.length > 0) {
    const evidenceLabels = [
      hasLegalEvidence ? "legal/celebrant evidence" : "legal evidence not explicit",
      hasCommitmentEvidence ? "deposit/contract evidence" : "deposit/contract evidence not explicit",
      commitmentTasks.length > 0 ? `${commitmentTasks.length} commitment task${commitmentTasks.length === 1 ? "" : "s"}` : "no commitment task",
      commitmentEvents.length > 0 ? `${commitmentEvents.length} commitment date${commitmentEvents.length === 1 ? "" : "s"}` : "no commitment date",
      ...selectedEvidenceLabels,
    ];
    const suggestedTask = commitmentTasks.length === 0
      ? {
        id: `second-order:commitment-timing:${selectedOptionLabel ? taskSafeLabel(selectedOptionLabel) : "workspace"}`,
        title: selectedOptionLabel ? `Verify legal, deposit, and contract timing for ${selectedOptionLabel}` : "Verify legal, deposit, and contract timing",
        kind: hasLegalEvidence ? "legal" as const : "budget_review" as const,
        dueLabel: "Before signing, paying, or lodging",
        priority: "high" as const,
        source: "agent" as const,
        reviewStatus: "accepted" as const,
        approvalState: "draft" as const,
        metadata: secondOrderTaskMetadata({
          metadata: input.metadata,
          loopKind: "commitment_timing",
          evidenceLabels,
          primaryDecision,
        }),
        linkedArtifactId: primaryDecision?.artifactId ?? null,
        notes: selectedDecisionLabels.length > 0
          ? `Smart Action for selected planning path: ${selectedDecisionLabels.join("; ")}. Verify NOIM/celebrant requirements, deposit due dates, contract review, cancellation terms, and whether any proof or approval receipt exists before treating commitments as closed.`
          : "Smart Action. Verify NOIM/celebrant requirements, deposit due dates, contract review, cancellation terms, and whether any proof or approval receipt exists before treating commitments as closed.",
      }
      : null;
    cards.push({
      id: "second_order:commitment_timing",
      title: "Legal and contract Smart Action",
      statusLabel: commitmentTasks.length > 0 || commitmentEvents.length > 0 ? "Commitment timing evidenced" : "Commitment timing needs review",
      detailLabel: commitmentTasks.length > 0 || commitmentEvents.length > 0
        ? `The workspace has commitment timing evidence${selectedDecisionLabels.length > 0 ? " for the selected planning path" : ""}. Keep it closed by checking proof, approval, and due-date follow-through.`
        : `The ${selectedDecisionLabels.length > 0 ? "selected planning path" : "plan"} mentions legal, deposit, payment, or contract commitments but has no clear task showing who owns the next check.`,
      evidenceLabels,
      nextActionLabel: commitmentTasks.length > 0
        ? "Open the commitment task and verify proof, owner, and due date."
        : `Create a legal/deposit/contract verification task${selectedDecisionLabels.length > 0 ? " for the selected option" : ""} before signing, paying, or lodging anything.`,
      action: secondOrderAction(
        commitmentTasks.length > 0 ? "open_tasks" : commitmentEvents.length > 0 ? "open_calendar" : "open_graph",
        commitmentTasks.length > 0 ? "Open commitment tasks" : commitmentEvents.length > 0 ? "Open commitment dates" : "Show commitment gap",
        commitmentTasks.length > 0 || commitmentEvents.length > 0 || hasLegalEvidence || hasCommitmentEvidence,
        null,
        "commitment_timing",
        evidenceLabels,
      ),
      suggestedTask,
    });
  }

  if (hasGuestLogisticsEvidence || hasMapOrLocationEvidence || logisticsTasks.length > 0) {
    const evidenceLabels = [
      hasGuestLogisticsEvidence ? "guest logistics evidence" : "guest logistics not explicit",
      hasMapOrLocationEvidence ? "map/location evidence" : "map/location evidence not explicit",
      logisticsTasks.length > 0 ? `${logisticsTasks.length} logistics task${logisticsTasks.length === 1 ? "" : "s"}` : "no logistics task",
      ...selectedEvidenceLabels,
    ];
    const suggestedTask = logisticsTasks.length === 0
      ? {
        id: `second-order:guest-logistics:${selectedOptionLabel ? taskSafeLabel(selectedOptionLabel) : "workspace"}`,
        title: selectedOptionLabel ? `Verify transport, access, and guest logistics for ${selectedOptionLabel}` : "Verify transport, access, and guest logistics",
        kind: "research" as const,
        dueLabel: "Before final venue or guest logistics decisions",
        priority: "normal" as const,
        source: "agent" as const,
        reviewStatus: "accepted" as const,
        approvalState: "draft" as const,
        metadata: secondOrderTaskMetadata({
          metadata: input.metadata,
          loopKind: "guest_logistics",
          evidenceLabels,
          primaryDecision,
        }),
        linkedArtifactId: primaryDecision?.artifactId ?? null,
        notes: selectedDecisionLabels.length > 0
          ? `Smart Action for selected planning path: ${selectedDecisionLabels.join("; ")}. Verify transport, parking, accommodation, accessibility, seating, and route assumptions before treating guest logistics as solved.`
          : "Smart Action. Verify transport, parking, accommodation, accessibility, seating, and route assumptions before treating guest logistics as solved.",
      }
      : null;
    cards.push({
      id: "second_order:guest_logistics",
      title: "Guest logistics Smart Action",
      statusLabel: logisticsTasks.length > 0 ? "Guest logistics task found" : "Guest logistics needs check",
      detailLabel: logisticsTasks.length > 0
        ? `The workspace has a logistics task${selectedDecisionLabels.length > 0 ? " for the selected planning path" : ""}. Keep it closed by checking routes, accessibility, accommodation, and guest movement assumptions.`
        : `The ${selectedDecisionLabels.length > 0 ? "selected planning path" : "plan"} has venue, map, guest, or access evidence but no clear task owning transport and guest logistics.`,
      evidenceLabels,
      nextActionLabel: logisticsTasks.length > 0
        ? "Open the logistics task and verify route, access, parking, and accommodation assumptions."
        : `Create a transport/access logistics task${selectedDecisionLabels.length > 0 ? " for the selected option" : ""} before treating the venue or guest plan as ready.`,
      action: secondOrderAction(
        logisticsTasks.length > 0 ? "open_tasks" : "open_graph",
        logisticsTasks.length > 0 ? "Open logistics tasks" : "Show logistics gap",
        logisticsTasks.length > 0 || hasGuestLogisticsEvidence || hasMapOrLocationEvidence,
        null,
        "guest_logistics",
        evidenceLabels,
      ),
      suggestedTask,
    });
  }

  if (hasBudgetDriftEvidence || hasBudgetArtifact || budgetTasks.length > 0) {
    const evidenceLabels = [
      hasBudgetArtifact ? "budget/cost evidence" : "budget artifact not explicit",
      hasBudgetDriftEvidence ? "unknown or hidden-cost cue" : "hidden-cost cue not explicit",
      budgetTasks.length > 0 ? `${budgetTasks.length} budget task${budgetTasks.length === 1 ? "" : "s"}` : "no budget verification task",
      ...selectedEvidenceLabels,
    ];
    const suggestedTask = budgetTasks.length === 0 && selectedVendorLabel
      ? {
        id: `second-order:budget-drift:${taskSafeLabel(selectedVendorLabel)}`,
        title: `Verify unknown costs in ${selectedVendorLabel}'s pricing`,
        kind: "budget_review" as const,
        dueLabel: "Before confirming budget or vendor choice",
        priority: "high" as const,
        source: "agent" as const,
        reviewStatus: "accepted" as const,
        approvalState: "draft" as const,
        metadata: secondOrderTaskMetadata({
          metadata: input.metadata,
          loopKind: "budget_drift",
          evidenceLabels,
          primaryDecision,
        }),
        linkedArtifactId: primaryDecision?.artifactId ?? null,
        notes: selectedDecisionLabels.length > 0
          ? `Smart Action for selected planning path: ${selectedDecisionLabels.join("; ")}. Verify unknown/TBC estimates, minimum spend, overtime, tax/GST, service fees, travel fees, cancellation terms, and exclusions before treating budget as reliable.`
          : "Smart Action. Verify unknown/TBC estimates, minimum spend, overtime, tax/GST, service fees, travel fees, cancellation terms, and exclusions before treating budget as reliable.",
      }
      : null;
    cards.push({
      id: "second_order:budget_drift",
      title: "Budget check Smart Action",
      statusLabel: budgetTasks.length > 0 ? "Budget verification task found" : "Budget needs verification",
      detailLabel: budgetTasks.length > 0
        ? `The workspace has a budget verification task${selectedDecisionLabels.length > 0 ? " for the selected planning path" : ""}. Keep it closed by checking hidden costs, exclusions, and estimate confidence.`
        : `The ${selectedDecisionLabels.length > 0 ? "selected planning path" : "plan"} has budget or cost evidence but no clear task owning unknown costs and hidden-fee verification.`,
      evidenceLabels,
      nextActionLabel: budgetTasks.length > 0
        ? "Open the budget task and verify estimates, hidden costs, exclusions, and owner."
        : `Create a budget verification task${selectedDecisionLabels.length > 0 ? " for the selected option" : ""} before treating estimates as reliable.`,
      action: secondOrderAction(
        budgetTasks.length > 0 ? "open_tasks" : "open_graph",
        budgetTasks.length > 0 ? "Open budget tasks" : "Show budget gap",
        budgetTasks.length > 0 || hasBudgetDriftEvidence || hasBudgetArtifact,
        null,
        "budget_drift",
        evidenceLabels,
      ),
      suggestedTask,
    });
  }

  if (contactArtifacts.length > 0 || followUpTasks.length > 0 || executedContactReceipts.length > 0) {
    const unexecutedDraftCount = Math.max(0, contactArtifacts.length - executedContactReceipts.length);
    const outreachStage = strongestOutreachEscalationStage(followUpTasks);
    const outreachStageLabel = outreachStage ? outreachEscalationStageLabel(outreachStage) : null;
    const evidenceLabels = [
      `${contactArtifacts.length} email draft${contactArtifacts.length === 1 ? "" : "s"}`,
      `${executedContactReceipts.length} sent/contact receipt${executedContactReceipts.length === 1 ? "" : "s"}`,
      `${followUpTasks.length} follow-up task${followUpTasks.length === 1 ? "" : "s"}`,
      outreachStageLabel,
      ...selectedEvidenceLabels,
    ].filter((label): label is string => Boolean(label));
    const linkedArtifactId = contactArtifacts[0]?.id ?? primaryDecision?.artifactId ?? null;
    const suggestedTask = followUpTasks.length === 0
      ? {
        id: `second-order:contact-follow-up:${selectedOptionLabel ? taskSafeLabel(selectedOptionLabel) : "workspace"}`,
        title: selectedOptionLabel ? `Track response follow-up for ${selectedOptionLabel}` : "Track vendor/contact response follow-up",
        kind: "vendor_follow_up" as const,
        dueLabel: "After approved send or contact attempt",
        priority: unexecutedDraftCount > 0 ? "high" as const : "normal" as const,
        source: "agent" as const,
        reviewStatus: "accepted" as const,
        approvalState: "draft" as const,
        metadata: secondOrderTaskMetadata({
          metadata: input.metadata,
          loopKind: "contact_follow_up",
          evidenceLabels,
          primaryDecision,
          linkedArtifactId,
        }),
        linkedArtifactId,
        notes: selectedDecisionLabels.length > 0
          ? `Smart Action for selected planning path: ${selectedDecisionLabels.join("; ")}. Add response deadline, next call/email step, and closure note after approval/provider execution.`
          : "Smart Action. Add response deadline, next call/email step, and closure note after approval/provider execution.",
      }
      : null;
    cards.push({
      id: "second_order:contact_follow_up",
      title: "Contact follow-up Smart Action",
      statusLabel: outreachStatusLabel(
        outreachStage,
        unexecutedDraftCount > 0 ? "Drafts not closed" : followUpTasks.length > 0 ? "Follow-up active" : "Contact evidence saved",
      ),
      detailLabel: outreachDetailLabel(outreachStage, selectedDecisionLabels, unexecutedDraftCount > 0
        ? `The workspace has vendor-facing drafts or contacts${selectedDecisionLabels.length > 0 ? " for the selected planning path" : ""} that still need approval/provider execution and a follow-up task.`
        : `Contact/send receipts exist${selectedDecisionLabels.length > 0 ? " for the selected planning path" : ""}; keep this organized by tracking response deadlines, next calls, and unanswered vendors.`),
      evidenceLabels,
      nextActionLabel: outreachNextActionLabel(outreachStage, unexecutedDraftCount > 0
        ? `Approve/send only after review, then add a response follow-up deadline${selectedDecisionLabels.length > 0 ? " for the selected option" : ""}.`
        : "Check whether every contacted person has a next response date or closure note."),
      action: secondOrderAction(
        "open_tasks",
        "Open follow-up tasks",
        followUpTasks.length > 0,
        followUpTasks.length > 0 ? null : "Create a follow-up task after approving or sending the contact draft.",
        "contact_follow_up",
        evidenceLabels,
      ),
      suggestedTask,
    });
  }

  return cards;
}
