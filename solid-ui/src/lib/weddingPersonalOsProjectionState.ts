// @locs-version: 2.0
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import {
  buildContinuityPersonalOsProjectionState,
  type ContinuityDecisionLoadReliefState,
  type ContinuityPersonalOsProjectionState,
  type ContinuityPressureFamily,
  type ContinuityRankedItem,
} from "@/lib/continuityProjectionState";
import type { WeddingDecisionProjectionInput } from "@/lib/weddingDecisionAfpProjectionState";
import {
  weddingDecisionSourceLabelsForProjection,
  weddingDecisionSourceUrlsForProjection,
} from "@/lib/weddingDecisionAfpProjectionState";
import type {
  WeddingPersistedApprovalReceipt,
  WeddingPersistedDecisionDeferral,
} from "@/lib/weddingPersistedWorkspaceState";

export type WeddingPersonalOsPressureFamily = ContinuityPressureFamily;

export type WeddingPersonalOsRankedItemKind =
  | "task"
  | "calendar_event"
  | "decision"
  | "approval";

export type WeddingPersonalOsRankedItem = ContinuityRankedItem<WeddingPersonalOsRankedItemKind> & {
  sourceSurface: "tasks" | "calendar" | "decision_queue" | "approval_queue";
  linkedArtifactId?: string | null;
  workspaceMenu?: string | null;
  actionMetadata?: Record<string, unknown>;
};

export type WeddingDecisionLoadReliefState = ContinuityDecisionLoadReliefState<WeddingPersonalOsRankedItem>;

export type WeddingPersonalOsProjectionState = Omit<ContinuityPersonalOsProjectionState<WeddingPersonalOsRankedItem>, "hasSignal"> & {
  hasWeddingPersonalOsSignal: boolean;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function uniqueStrings(values: readonly unknown[], limit = 24): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function usableSourceUrlCount(value: unknown): number {
  return stringArray(value).filter((url) => /^https?:\/\//i.test(url.trim())).length;
}

function timestamp(value: unknown): number | null {
  const text = clean(value);
  if (!text) return null;
  const parsed = new Date(text).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function daysUntil(value: unknown, now: Date): number | null {
  const at = timestamp(value);
  if (at === null) return null;
  const day = 86_400_000;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const due = new Date(at);
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  return Math.round((dueStart - start) / day);
}

function duePressure(value: unknown, now: Date): number {
  const days = daysUntil(value, now);
  if (days === null) return 0;
  if (days < 0) return 45;
  if (days === 0) return 40;
  if (days <= 2) return 34;
  if (days <= 7) return 26;
  if (days <= 30) return 14;
  return 4;
}

function dueExplanation(value: unknown, label: string | null, now: Date): string | null {
  const days = daysUntil(value, now);
  if (days === null) return label ? `Timing cue: ${label}.` : null;
  if (days < 0) return `${label || "Due date"} is overdue.`;
  if (days === 0) return `${label || "Due date"} is today.`;
  if (days === 1) return `${label || "Due date"} is tomorrow.`;
  if (days <= 7) return `${label || "Due date"} is in ${days} days.`;
  return label ? `Timing cue: ${label}.` : null;
}

function secondOrderEvidence(metadata: unknown): string[] {
  return stringArray(record(metadata).second_order_evidence_labels).slice(0, 5);
}

function hasSecondOrder(metadata: unknown): boolean {
  const data = record(metadata);
  return data.second_order_task === true || clean(data.second_order_loop).length > 0;
}

function hasBudgetQuoteVerification(metadata: unknown): boolean {
  return record(metadata).budget_quote_verification === true;
}

function hasBudgetPaymentReview(metadata: unknown): boolean {
  return record(metadata).budget_payment_review === true;
}

function hasGuestFollowUp(metadata: unknown): boolean {
  return record(metadata).guest_follow_up === true;
}

function hasGuestFinalCountDecision(metadata: unknown): boolean {
  return record(metadata).guest_final_count_decision === true;
}

function hasPostWeddingWrapUp(metadata: unknown): boolean {
  return record(metadata).post_wedding_wrap_up === true;
}

function hasVowPlanningTask(metadata: unknown): boolean {
  return record(metadata).vow_planning_task === true;
}

function hasSeatingAction(metadata: unknown): boolean {
  return record(metadata).seating_action === true;
}

function hasDelegationTask(metadata: unknown): boolean {
  return record(metadata).delegation_task === true;
}

function hasFinalPhaseTask(metadata: unknown): boolean {
  return record(metadata).final_phase_task === true;
}

function hasLegalAdministrationTask(metadata: unknown): boolean {
  return record(metadata).legal_administration_task === true;
}

function hasVendorSearchReviewTask(metadata: unknown): boolean {
  return record(metadata).vendor_search_review_task === true;
}

function hasVendorLeadTimeResearchTask(metadata: unknown): boolean {
  return record(metadata).vendor_lead_time_research_task === true;
}

function hasVendorComparisonDecisionTask(metadata: unknown): boolean {
  return record(metadata).vendor_comparison_decision_task === true;
}

function hasVendorSeedReviewTask(metadata: unknown): boolean {
  return record(metadata).vendor_seed_review_task === true;
}

function hasExpectedBehaviorGap(metadata: unknown): boolean {
  return record(metadata).expected_behavior_gap === true;
}

function hasOracleUpdatePlanTask(metadata: unknown): boolean {
  return record(metadata).oracle_update_plan_task === true;
}

function hasProductionRemainingWorkTask(metadata: unknown): boolean {
  return record(metadata).production_remaining_work_task === true;
}

function productionRemainingWorkRequiresOracle(metadata: unknown): boolean {
  return record(metadata).production_remaining_work_required_for_oracle === true
    || record(metadata).production_readiness_oracle_gate === true;
}

function hasBackgroundAutomationTask(metadata: unknown): boolean {
  return record(metadata).background_automation_task === true;
}

function hasProviderHandoffTask(metadata: unknown): boolean {
  return record(metadata).provider_handoff_task === true;
}

function oracleUpdateIsBlocked(metadata: unknown): boolean {
  return record(metadata).oracle_update_blocked === true;
}

function outreachEscalationStage(metadata: unknown): string | null {
  const stage = clean(record(metadata).outreach_escalation_stage);
  return stage || null;
}

function outreachEscalationWeight(stage: string | null): number {
  if (stage === "escalate_to_user") return 28;
  if (stage === "mark_unresponsive") return 24;
  if (stage === "follow_up_due") return 18;
  if (stage === "initial_outreach") return 8;
  if (stage === "closed") return -40;
  return 0;
}

function outreachEscalationEvidenceLabel(stage: string | null): string | null {
  if (stage === "escalate_to_user") return "day 7 escalation";
  if (stage === "mark_unresponsive") return "day 10 unresponsive";
  if (stage === "follow_up_due") return "day 5 follow-up";
  if (stage === "initial_outreach") return "initial outreach";
  if (stage === "closed") return "reply received";
  return null;
}

function outreachEscalationExplanation(stage: string | null): string | null {
  if (stage === "escalate_to_user") return "No reply after 7 days; user should choose final follow-up, move on, or call.";
  if (stage === "mark_unresponsive") return "No reply after 10 days; mark unresponsive and switch attention to alternatives.";
  if (stage === "follow_up_due") return "One follow-up is due after 5 days without a reply.";
  if (stage === "initial_outreach") return "Initial vendor outreach needs review and approval before sending.";
  if (stage === "closed") return "Vendor replied; continue from the response instead of chasing.";
  return null;
}

function familyForTask(task: WeddingPlanningTaskItem): WeddingPersonalOsPressureFamily {
  if (task.kind === "legal" || task.kind === "budget_review") return "obligation";
  if (task.kind === "vendor_follow_up" || task.kind === "email_draft") return "attention";
  if (hasSecondOrder(task.metadata)) return "knowledge";
  if (task.kind === "decision" || task.kind === "research") return "opportunity";
  return task.priority === "urgent" || task.priority === "high" ? "attention" : "obligation";
}

function simulatorKindForFamily(family: WeddingPersonalOsPressureFamily): WeddingPersonalOsRankedItem["simulatorSeedKind"] {
  if (family === "obligation") return "commitment";
  if (family === "attention") return "response";
  if (family === "opportunity") return "decision";
  return "context";
}

function taskWeight(task: WeddingPlanningTaskItem, now: Date): number {
  const priority = task.priority === "urgent" ? 30 : task.priority === "high" ? 22 : task.priority === "normal" ? 8 : 0;
  const review = task.reviewStatus === "needs_review" ? -20 : task.reviewStatus === "ignored" ? -100 : 0;
  const approval = task.approvalState === "archived" ? -100 : task.approvalState === "pending_user_approval" ? 12 : 0;
  const loop = hasSecondOrder(task.metadata) ? 15 : 0;
  const quote = hasBudgetQuoteVerification(task.metadata) ? 34 : 0;
  const payment = hasBudgetPaymentReview(task.metadata) ? 22 : 0;
  const guest = hasGuestFollowUp(task.metadata) ? 16 : 0;
  const finalCount = hasGuestFinalCountDecision(task.metadata) ? 20 : 0;
  const postWedding = hasPostWeddingWrapUp(task.metadata) ? 36 : 0;
  const vow = hasVowPlanningTask(task.metadata) ? 16 : 0;
  const seating = hasSeatingAction(task.metadata) ? 16 : 0;
  const delegation = hasDelegationTask(task.metadata) ? 18 : 0;
  const finalPhase = hasFinalPhaseTask(task.metadata) ? 20 : 0;
  const legalAdmin = hasLegalAdministrationTask(task.metadata) ? 24 : 0;
  const vendorSearch = hasVendorSearchReviewTask(task.metadata) ? 21 : 0;
  const vendorLeadTime = hasVendorLeadTimeResearchTask(task.metadata)
    ? Math.min(40, Math.max(10, Number(record(task.metadata).vendor_lead_time_urgency_score) || 18))
    : 0;
  const vendorComparison = hasVendorComparisonDecisionTask(task.metadata) ? 18 : 0;
  const vendorSeed = hasVendorSeedReviewTask(task.metadata) ? 5 : 0;
  const expectedBehaviorGap = hasExpectedBehaviorGap(task.metadata) ? 19 : 0;
  const oracleUpdatePlan = hasOracleUpdatePlanTask(task.metadata) ? oracleUpdateIsBlocked(task.metadata) ? 30 : 18 : 0;
  const productionRemainingWork = hasProductionRemainingWorkTask(task.metadata)
    ? productionRemainingWorkRequiresOracle(task.metadata) ? 28 : 12
    : 0;
  const backgroundAutomation = hasBackgroundAutomationTask(task.metadata) ? 17 : 0;
  const providerHandoff = hasProviderHandoffTask(task.metadata) ? 23 : 0;
  return 20 + priority + duePressure(task.dueAt, now) + approval + loop + review
    + quote + payment + guest + finalCount + postWedding + vow + seating + delegation + finalPhase + legalAdmin
    + vendorSearch + vendorLeadTime + vendorComparison + vendorSeed + expectedBehaviorGap + oracleUpdatePlan + productionRemainingWork
    + backgroundAutomation + providerHandoff
    + outreachEscalationWeight(outreachEscalationStage(task.metadata));
}

function taskItem(task: WeddingPlanningTaskItem, now: Date): WeddingPersonalOsRankedItem | null {
  const title = clean(task.title);
  if (!title || task.reviewStatus === "ignored" || task.approvalState === "archived"
    || task.semanticTags?.some((tag) => tag.toLowerCase() === "wedding_task_status:done")) return null;
  const family = familyForTask(task);
  const timing = dueExplanation(task.dueAt, clean(task.dueLabel) || null, now);
  const escalationStage = outreachEscalationStage(task.metadata);
  const metadata = record(task.metadata);
  const actionMetadata = {
    vendor_lead_time_research_task: metadata.vendor_lead_time_research_task === true ? true : undefined,
    vendor_lead_time_category_id: clean(metadata.vendor_lead_time_category_id) || undefined,
    vendor_lead_time_label: clean(metadata.vendor_lead_time_label) || undefined,
    vendor_search_review_task: metadata.vendor_search_review_task === true ? true : undefined,
    vendor_search_action_id: clean(metadata.vendor_search_action_id) || undefined,
    vendor_search_categories: stringArray(metadata.vendor_search_categories).slice(0, 6),
    vendor_search_scope: clean(metadata.vendor_search_scope) || undefined,
  };
  const compactActionMetadata = Object.fromEntries(
    Object.entries(actionMetadata).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== undefined
    ),
  );
  const evidenceLabels = [
    clean(task.kind).replace(/_/g, " "),
    task.priority ? `priority: ${task.priority}` : "",
    hasSecondOrder(task.metadata) ? "Smart Action" : "",
    hasBudgetQuoteVerification(task.metadata) ? "selected vendor quote check" : "",
    hasBudgetPaymentReview(task.metadata) ? "payment review" : "",
    hasGuestFollowUp(task.metadata) ? "guest follow-up" : "",
    hasGuestFinalCountDecision(task.metadata) ? "final guest count decision" : "",
    hasPostWeddingWrapUp(task.metadata) ? "post-wedding wrap-up" : "",
    hasVowPlanningTask(task.metadata) ? "vow preparation" : "",
    hasSeatingAction(task.metadata) ? "seating action" : "",
    hasDelegationTask(task.metadata) ? "delegated responsibility" : "",
    hasFinalPhaseTask(task.metadata) ? "final-phase coordination" : "",
    hasLegalAdministrationTask(task.metadata) ? "legal administration" : "",
    hasVendorSearchReviewTask(task.metadata) ? "vendor search freshness" : "",
    hasVendorLeadTimeResearchTask(task.metadata) ? "vendor research timing" : "",
    hasVendorComparisonDecisionTask(task.metadata) ? "top-three vendor comparison" : "",
    hasVendorSeedReviewTask(task.metadata) ? "seeded vendor data" : "",
    hasExpectedBehaviorGap(task.metadata) ? "launch check" : "",
    hasOracleUpdatePlanTask(task.metadata) ? "live update check" : "",
    hasProductionRemainingWorkTask(task.metadata)
      ? productionRemainingWorkRequiresOracle(task.metadata) ? "launch blocker" : "production polish"
      : "",
    hasBackgroundAutomationTask(task.metadata) ? "automation setup gap" : "",
    hasProviderHandoffTask(task.metadata) ? "vendor connection gap" : "",
    outreachEscalationEvidenceLabel(escalationStage) ?? "",
    ...secondOrderEvidence(task.metadata),
    ...stringArray(record(task.metadata).expected_behavior_blocker_labels),
    ...stringArray(record(task.metadata).oracle_update_blocker_labels),
  ].filter(Boolean).slice(0, 6);
  return {
    id: `task:${task.id}`,
    kind: "task",
    title,
    pressureFamily: family,
    rankWeight: taskWeight(task, now),
    dueLabel: clean(task.dueLabel) || null,
    dueAt: clean(task.dueAt) || null,
    explanation: [
      timing,
      outreachEscalationExplanation(escalationStage),
      hasBudgetQuoteVerification(task.metadata) ? "Selected vendor pricing should be verified before deposit or booking." : null,
      hasBudgetPaymentReview(task.metadata) ? "Budget sheet shows a due amount, unpaid status, or payment risk that should be verified before treating it as settled." : null,
      hasGuestFollowUp(task.metadata) ? "Guest-list gaps affect RSVP count, catering, seating, updates, or final vendor briefs." : null,
      hasGuestFinalCountDecision(task.metadata) ? "Final-count options should be chosen before caterer confirmation to avoid late-count fees or day-of shortages." : null,
      hasPostWeddingWrapUp(task.metadata) ? "Post-wedding wrap-up should use confirmed memories only and requires approval before external thank-you notes or public reviews." : null,
      hasVowPlanningTask(task.metadata) ? "Vow preparation should use confirmed relationship facts only and can be refined early before ceremony scripting." : null,
      hasSeatingAction(task.metadata) ? "Seating gaps affect table export, venue layout, accessibility placement, or sensitive family constraints." : null,
      hasDelegationTask(task.metadata) ? "Delegated wedding ownership should be confirmed so follow-ups and Contacts stay accountable." : null,
      hasFinalPhaseTask(task.metadata) ? "Final-phase wedding work affects run sheet, confirmations, day-of fallback, guests, vendors, or final payments." : null,
      hasLegalAdministrationTask(task.metadata) ? "Legal document and NOIM preparation should stay visible before celebrant review; no form is lodged automatically." : null,
      hasVendorSearchReviewTask(task.metadata) ? "Review the shortlist and choose who you want to contact." : null,
      hasVendorLeadTimeResearchTask(task.metadata) ? "This vendor category is surfacing because its planning lead-time window is open or close to opening." : null,
      hasVendorComparisonDecisionTask(task.metadata) ? "The top-three vendor comparison is ready for the user to choose preferred vendors before outreach or report narrowing." : null,
      hasVendorSeedReviewTask(task.metadata) ? "Seeded vendor rows are planning hints only; refresh source pages and verify fit before using them for recommendations or outreach." : null,
      hasExpectedBehaviorGap(task.metadata) ? "This wedding feature still needs proof before users can rely on it end-to-end." : null,
      hasProductionRemainingWorkTask(task.metadata)
        ? productionRemainingWorkRequiresOracle(task.metadata)
          ? "This production-readiness item must clear before Oracle upload."
          : "This production-readiness item can follow Oracle upload, but remains open before final production-ready signoff."
        : null,
      hasBackgroundAutomationTask(task.metadata) ? "Automatic wedding updates are not fully set up yet; finish this before relying on them." : null,
      hasProviderHandoffTask(task.metadata) ? "This approved action still needs a connected vendor/email/calendar service before live delivery or sync." : null,
      hasOracleUpdatePlanTask(task.metadata)
        ? oracleUpdateIsBlocked(task.metadata)
          ? "The live wedding planner cannot be updated until required launch checks pass."
          : "The live wedding planner is ready for the release sequence: preflight, update, verify, then save proof."
        : null,
      hasSecondOrder(task.metadata) ? "This Smart Action is backed by the wedding plan and ready to review." : null,
      task.approvalState === "pending_user_approval" ? "Needs user approval before downstream action." : null,
    ].filter(Boolean).join(" "),
    evidenceLabels,
    sourceSurface: "tasks",
    linkedArtifactId: clean(task.linkedArtifactId) || null,
    workspaceMenu: clean(metadata.wedding_workspace_menu) || null,
    actionMetadata: Object.keys(compactActionMetadata).length > 0 ? compactActionMetadata : undefined,
    simulatorSeedKind: simulatorKindForFamily(family),
  };
}

function scheduleWeight(item: WeddingPlanningScheduleItem, now: Date): number {
  const kind = item.kind === "noim_reminder" || item.kind === "deposit_due" || item.kind === "contract_review" ? 26 : 12;
  const review = item.reviewStatus === "needs_review" ? -12 : item.reviewStatus === "ignored" ? -100 : 0;
  return 18 + kind + duePressure(item.startAt, now) + review;
}

function scheduleItem(item: WeddingPlanningScheduleItem, now: Date): WeddingPersonalOsRankedItem | null {
  const title = clean(item.title);
  if (!title || item.reviewStatus === "ignored" || item.approvalState === "archived") return null;
  const family: WeddingPersonalOsPressureFamily = (
    item.kind === "noim_reminder"
    || item.kind === "deposit_due"
    || item.kind === "contract_review"
    || item.kind === "rsvp_deadline"
    || item.kind === "final_numbers_due"
  ) ? "obligation" : "attention";
  return {
    id: `calendar_event:${item.id}`,
    kind: "calendar_event",
    title,
    pressureFamily: family,
    rankWeight: scheduleWeight(item, now),
    dueLabel: clean(item.dateLabel) || null,
    dueAt: clean(item.startAt) || null,
    explanation: dueExplanation(item.startAt, clean(item.dateLabel) || null, now)
      || "Wedding calendar commitment can shape today's planning order.",
    evidenceLabels: [clean(item.kind).replace(/_/g, " "), item.location ? `location: ${item.location}` : ""].filter(Boolean).slice(0, 4),
    sourceSurface: "calendar",
    simulatorSeedKind: simulatorKindForFamily(family),
  };
}

function decisionItem(decision: WeddingDecisionProjectionInput): WeddingPersonalOsRankedItem | null {
  const title = clean(decision.selectedOption.label);
  if (!title) return null;
  const tradeoffs = decision.selectedOption.tradeoffLabels.length + decision.selectedOption.missingPreferenceLabels.length;
  const sourceProviderLabels = stringArray(decision.sourceProviderLabels).map((label) => `provider: ${label}`);
  const sourceLabels = weddingDecisionSourceLabelsForProjection(decision).slice(0, 3).map((label) => `source: ${label}`);
  const sourceUrlCount = usableSourceUrlCount(weddingDecisionSourceUrlsForProjection(decision));
  return {
    id: `decision:${decision.id}`,
    kind: "decision",
    title: `Confirm selected wedding option: ${title}`,
    pressureFamily: tradeoffs > 0 ? "knowledge" : "opportunity",
    rankWeight: 30 + Math.min(tradeoffs * 5, 20),
    dueLabel: null,
    dueAt: null,
    explanation: tradeoffs > 0
      ? "Selected option has tradeoffs or missing preference evidence before follow-up reports should narrow around it."
      : "Selected option can narrow wedding reports and next actions without hiding alternatives.",
    evidenceLabels: [
      decision.artifactKind.replace(/_/g, " "),
      decision.selectedOption.preferenceSummaryLabel,
      ...sourceProviderLabels,
      ...sourceLabels,
      sourceUrlCount > 0 ? `${sourceUrlCount} source url${sourceUrlCount === 1 ? "" : "s"}` : "",
      ...decision.selectedOption.tradeoffLabels,
      ...decision.selectedOption.missingPreferenceLabels,
    ].filter(Boolean).slice(0, 6),
    sourceSurface: "decision_queue",
    simulatorSeedKind: tradeoffs > 0 ? "context" : "decision",
  };
}

function approvalItem(receipt: WeddingPersistedApprovalReceipt): WeddingPersonalOsRankedItem | null {
  if (receipt.status === "executed") return null;
  const title = clean(receipt.title);
  if (!title) return null;
  return {
    id: `approval:${receipt.id}`,
    kind: "approval",
    title,
    pressureFamily: "attention",
    rankWeight: 42 + Math.min(receipt.riskLabels.length * 3, 12),
    dueLabel: null,
    dueAt: null,
    explanation: receipt.blockedReason || "Wedding action is blocked until the user reviews or approves it.",
    evidenceLabels: [
      receipt.actionKind.replace(/_/g, " "),
      receipt.blockKind ? receipt.blockKind.replace(/_/g, " ") : "",
      ...receipt.riskLabels,
    ].filter(Boolean).slice(0, 6),
    sourceSurface: "approval_queue",
    simulatorSeedKind: "response",
  };
}

function suppressDeferredItem(deferral: WeddingPersistedDecisionDeferral, now: Date): boolean {
  const deferredUntil = deferral.deferredUntilAt ? Date.parse(deferral.deferredUntilAt) : Number.NaN;
  if (Number.isFinite(deferredUntil)) return now.getTime() < deferredUntil;
  const staleAfter = deferral.staleAfterAt ? Date.parse(deferral.staleAfterAt) : Number.NaN;
  if (Number.isFinite(staleAfter) && now.getTime() >= staleAfter) return false;
  const dueDays = daysUntil(deferral.dueAt, now);
  if (dueDays !== null && dueDays <= 3) return false;
  const createdDays = daysUntil(deferral.createdAt, now);
  if (createdDays !== null && createdDays <= -7) return false;
  return true;
}

function rankedItemDependencyFingerprint(item: WeddingPersonalOsRankedItem): string {
  return uniqueStrings([
    item.id,
    item.kind,
    item.pressureFamily,
    item.sourceSurface,
    item.dueAt ?? "",
    item.dueLabel ?? "",
    ...item.evidenceLabels,
  ]).join("|").toLowerCase();
}

function familySummary(family: WeddingPersonalOsPressureFamily | null, top: WeddingPersonalOsRankedItem | null): string | null {
  if (!family || !top) return null;
  if (family === "obligation") return `Wedding obligation pressure: ${top.title}`;
  if (family === "attention") return `Wedding attention pressure: ${top.title}`;
  if (family === "knowledge") return `Wedding evidence pressure: ${top.title}`;
  return `Wedding opportunity pressure: ${top.title}`;
}

function decisionLoadCandidate(item: WeddingPersonalOsRankedItem): boolean {
  if (item.kind === "task") return true;
  if (item.kind === "decision" || item.pressureFamily === "knowledge" || item.pressureFamily === "opportunity") return true;
  if (/^(Confirm|Decide|Choose|Verify|Review)\b/i.test(item.title)) return true;
  return item.evidenceLabels.some((label) =>
    /decision|shortlist|quote check|payment review|guest count|seating action|vendor search freshness|cached workbook values/i.test(label),
  ) || item.evidenceLabels.some((label) =>
    /vendor research timing/i.test(label),
  );
}

function decisionLoadReliefLabels(
  _focusItems: readonly WeddingPersonalOsRankedItem[],
  _backlogCount: number,
): string[] {
  return [];
}

export function buildWeddingPersonalOsProjectionState(input: {
  setupItems?: readonly WeddingPersonalOsRankedItem[] | null;
  taskItems?: readonly WeddingPlanningTaskItem[] | null;
  scheduleItems?: readonly WeddingPlanningScheduleItem[] | null;
  decisionItems?: readonly WeddingDecisionProjectionInput[] | null;
  approvalReceipts?: readonly WeddingPersistedApprovalReceipt[] | null;
  decisionDeferrals?: readonly WeddingPersistedDecisionDeferral[] | null;
  now?: Date | null;
  limit?: number | null;
  decisionFocusLimit?: number | null;
}): WeddingPersonalOsProjectionState {
  const now = input.now ?? new Date();
  const candidateItems = [
    ...(input.setupItems ?? []),
    ...(input.taskItems ?? []).map((item) => taskItem(item, now)),
    ...(input.scheduleItems ?? []).map((item) => scheduleItem(item, now)),
    ...(input.decisionItems ?? []).map(decisionItem),
    ...(input.approvalReceipts ?? []).map(approvalItem),
  ]
    .filter((item): item is WeddingPersonalOsRankedItem => Boolean(item));
  const limit = Math.max(1, Math.trunc(input.limit ?? Math.max(1, candidateItems.length)));
  const decisionFocusLimit = Math.max(1, Math.trunc(input.decisionFocusLimit ?? limit));
  const candidateById = new Map(candidateItems.map((item) => [item.id, item]));
  const deferredIds = new Set((input.decisionDeferrals ?? [])
    .filter((deferral) => {
      if (!suppressDeferredItem(deferral, now)) return false;
      const currentItem = candidateById.get(deferral.focusItemId);
      if (!currentItem || !deferral.dependencyFingerprint) return true;
      return rankedItemDependencyFingerprint(currentItem) === deferral.dependencyFingerprint;
    })
    .map((item) => item.focusItemId));
  const activeItems = candidateItems
    .filter((item) => !deferredIds.has(item.id))
    .filter((item) => item.rankWeight > 0);
  const genericProjection = buildContinuityPersonalOsProjectionState({
    items: activeItems,
    limit,
    decisionFocusLimit,
    summarySubject: "wedding",
    familySummary,
    decisionLoadCandidate,
    decisionLoadReliefLabels,
    guardrailLabels: [
      "Uses existing PersonalOS field engine and simulator only.",
      "Does not create a wedding-specific field engine or simulator.",
      "Does not infer booking, payment, lodgement, availability, or legal compliance.",
      "Demo, ignored, archived, and unsourced speculative items should not outrank actionable wedding evidence.",
    ],
  });

  const { hasSignal, ...projection } = genericProjection;
  return {
    ...projection,
    hasWeddingPersonalOsSignal: hasSignal,
  };
}
