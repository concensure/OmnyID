// @locs-version: 1.0
import type { WeddingLiveWorkflowReadinessState } from "@/lib/weddingLiveWorkflowReadinessState";

export type WeddingVendorEndToEndValidationInput = {
  expectedPlannerEmail?: string | null;
  actualPlannerEmail?: string | null;
  expectedTestVendorEmail?: string | null;
  quoteRecipientEmail?: string | null;
  testVendorCleanupRequired?: boolean | null;
  testVendorCleanupConfirmed?: boolean | null;
  vendorSearchReadiness?: WeddingLiveWorkflowReadinessState | null;
  vendorProviderConfigured?: boolean | null;
  liveVendorArtifactSaved?: boolean | null;
  liveVendorComparisonSaved?: boolean | null;
  topFiveComparisonExpansionAvailable?: boolean | null;
  selectedComparisonVendorsConfirmed?: boolean | null;
  unselectedVendorQueueSuppressed?: boolean | null;
  dynamicVendorDecisionSurfaceVisible?: boolean | null;
  selectedVendorDraftTasksProjected?: boolean | null;
  selectedVendorDraftsApprovalGated?: boolean | null;
  quoteReplyFlowCount?: number | null;
  emailProviderReady?: boolean | null;
  draftReplyContextual?: boolean | null;
  durableSendReceiptRecorded?: boolean | null;
  sentQuoteReplyLeavesLiveQueue?: boolean | null;
  sentQuoteReplyHistoryVisible?: boolean | null;
  followUpTaskProjected?: boolean | null;
  responseEvidenceRecorded?: boolean | null;
};

export type WeddingVendorEndToEndValidationStep = {
  id: string;
  label: string;
  status: "passed" | "blocked";
  detail: string;
};

export type WeddingVendorEndToEndValidationState = {
  status: "ready_for_usage_validation" | "blocked";
  passedCount: number;
  blockedCount: number;
  steps: WeddingVendorEndToEndValidationStep[];
  blockerLabels: string[];
  nextActionLabels: string[];
  estimatedPassesToUsage: number;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function email(value: unknown): string {
  return clean(value).toLowerCase();
}

function step(
  id: string,
  label: string,
  passed: boolean,
  passedDetail: string,
  blockedDetail: string,
): WeddingVendorEndToEndValidationStep {
  return {
    id,
    label,
    status: passed ? "passed" : "blocked",
    detail: passed ? passedDetail : blockedDetail,
  };
}

function nextActionFor(stepId: string, detail: string): string {
  switch (stepId) {
    case "planner_identity":
      return "Sign in with the expected planner Gmail account before running the vendor workflow smoke test.";
    case "test_vendor_routing":
      return "Route the quote/reply smoke test to the expected disposable vendor Gmail address.";
    case "test_vendor_cleanup":
      return "Remove the disposable test vendor before using live search for real vendors again.";
    case "intake":
      return "Capture the missing date/season, location, guests, budget, priorities, and vendor categories.";
    case "provider_search":
      return "Confirm admin-configured Brave Search, Google Places, or Overpass provider status.";
    case "vendor_artifact":
      return "Run live vendor search and save the generated vendor-search artifact into the workspace.";
    case "vendor_comparison":
      return "Save the source-backed vendor comparison after live vendor search.";
    case "top_five_expansion":
      return "Verify the comparison starts with the top three and can expand to the top five when more source-backed choices are available.";
    case "selected_vendor_choice":
      return "Select one or more vendors from the comparison table and save the selected-vendor decision.";
    case "unselected_vendor_suppression":
      return "Verify unselected comparison vendors leave the active decision and response queues.";
    case "dynamic_decision_surface":
      return "Open the projection approval surface and verify it shows selected-vendor consequences before saving.";
    case "selected_vendor_drafts":
      return "Project internal outreach draft tasks for selected vendors only, without sending external email.";
    case "selected_vendor_draft_guard":
      return "Verify selected-vendor draft tasks require approval and cannot send externally from the save step.";
    case "quote_flow":
      return "Import or receive at least one vendor quote so the threaded quote-reply card appears.";
    case "email_provider":
      return "Connect the Gmail/email executor before testing external reply send.";
    case "draft":
      return "Verify the suggested reply includes amount, inclusions, budget stance, validity, and requested terms.";
    case "send_receipt":
      return "Approve and send one reply, then verify a durable provider receipt is recorded.";
    case "sent_reply_live_queue":
      return "Verify the sent quote reply leaves the live decision queue after provider receipt is recorded.";
    case "sent_reply_history":
      return "Verify the sent quote reply remains visible in response-queue history/proof.";
    case "response_evidence":
      return "Record or refresh the vendor thread so the workspace has response evidence from the vendor.";
    case "follow_up":
      return "Project a follow-up task from the vendor search or vendor thread.";
    default:
      return detail;
  }
}

export function buildWeddingVendorEndToEndValidationState(
  input: WeddingVendorEndToEndValidationInput,
): WeddingVendorEndToEndValidationState {
  const expectedPlannerEmail = email(input.expectedPlannerEmail);
  const actualPlannerEmail = email(input.actualPlannerEmail);
  const expectedTestVendorEmail = email(input.expectedTestVendorEmail);
  const quoteRecipientEmail = email(input.quoteRecipientEmail);
  const missingIntake = input.vendorSearchReadiness?.status === "blocked"
    ? input.vendorSearchReadiness.missing.map(clean).filter(Boolean)
    : [];
  const steps = [
    step(
      "planner_identity",
      "Planner account",
      !expectedPlannerEmail || actualPlannerEmail === expectedPlannerEmail,
      expectedPlannerEmail
        ? `Planner is signed in as ${expectedPlannerEmail}.`
        : "No planner account constraint is required for this validation.",
      actualPlannerEmail
        ? `Expected ${expectedPlannerEmail || "configured planner account"}, got ${actualPlannerEmail}.`
        : `Expected ${expectedPlannerEmail || "configured planner account"}, but no signed-in planner email was confirmed.`,
    ),
    step(
      "test_vendor_routing",
      "Smoke-test vendor routing",
      !expectedTestVendorEmail || quoteRecipientEmail === expectedTestVendorEmail,
      expectedTestVendorEmail
        ? `Quote/reply smoke test is routed to ${expectedTestVendorEmail}.`
        : "No disposable test vendor is required for this validation.",
      quoteRecipientEmail
        ? `Expected test vendor ${expectedTestVendorEmail || "configured vendor email"}, got ${quoteRecipientEmail}.`
        : `Expected test vendor ${expectedTestVendorEmail || "configured vendor email"}, but no quote recipient email was confirmed.`,
    ),
    step(
      "intake",
      "Planning intake",
      input.vendorSearchReadiness?.status === "ready",
      "Vendor-search intake is complete enough for live provider search.",
      missingIntake.length > 0
        ? `Missing ${missingIntake.join(", ")}.`
        : "Vendor-search readiness has not been evaluated.",
    ),
    step(
      "provider_search",
      "Search provider",
      input.vendorProviderConfigured === true,
      "At least one live vendor-search provider is configured server-side.",
      "No live vendor-search provider is confirmed.",
    ),
    step(
      "vendor_artifact",
      "Saved search artifact",
      input.liveVendorArtifactSaved === true,
      "Live vendor-search notes are saved as a source-backed artifact.",
      "No saved source-backed vendor-search artifact has been confirmed.",
    ),
    step(
      "vendor_comparison",
      "Vendor comparison",
      input.liveVendorComparisonSaved === true,
      "Source-backed vendor comparison is saved.",
      "No saved vendor comparison has been confirmed.",
    ),
    step(
      "top_five_expansion",
      "Top-five expansion",
      input.topFiveComparisonExpansionAvailable === true,
      "Vendor comparison can expand from the default top three to the top five.",
      "Vendor comparison has not been verified as expandable from top three to top five.",
    ),
    step(
      "selected_vendor_choice",
      "Selected vendor choices",
      input.selectedComparisonVendorsConfirmed === true,
      "One or more comparison vendors are confirmed as selected follow-up choices.",
      "No selected vendor choice has been confirmed from the comparison table.",
    ),
    step(
      "unselected_vendor_suppression",
      "Unselected vendor suppression",
      input.unselectedVendorQueueSuppressed === true,
      "Unselected comparison vendors are suppressed from active queues.",
      "Unselected comparison vendors have not been verified as removed from active queues.",
    ),
    step(
      "dynamic_decision_surface",
      "Dynamic decision surface",
      input.dynamicVendorDecisionSurfaceVisible === true,
      "Projection approval surface shows selected-vendor consequences before saving.",
      "Selected-vendor consequences are not yet visible in the approval surface.",
    ),
    step(
      "selected_vendor_drafts",
      "Selected-vendor draft tasks",
      input.selectedVendorDraftTasksProjected === true,
      "Internal outreach draft tasks are projected for selected vendors only.",
      "Selected-vendor internal outreach draft tasks have not been confirmed.",
    ),
    step(
      "selected_vendor_draft_guard",
      "Selected-vendor draft guard",
      input.selectedVendorDraftsApprovalGated === true,
      "Selected-vendor drafts are approval-gated and cannot send externally from the save step.",
      "Selected-vendor drafts have not been verified as approval-gated internal drafts.",
    ),
    step(
      "quote_flow",
      "Quote thread",
      (input.quoteReplyFlowCount ?? 0) > 0,
      `${input.quoteReplyFlowCount ?? 0} quote reply flow${input.quoteReplyFlowCount === 1 ? "" : "s"} available.`,
      "No vendor quote reply flow is available yet.",
    ),
    step(
      "email_provider",
      "Email executor",
      input.emailProviderReady === true,
      "Email executor is ready for approval-gated sends.",
      "Email executor is not ready.",
    ),
    step(
      "draft",
      "Contextual reply draft",
      input.draftReplyContextual === true,
      "Suggested reply reflects quote amount, inclusions, budget stance, validity, and requested terms.",
      "Suggested reply context has not been validated.",
    ),
    step(
      "send_receipt",
      "Durable send proof",
      input.durableSendReceiptRecorded === true,
      "A sent vendor reply has durable external provider receipt proof.",
      "No durable provider send receipt has been confirmed.",
    ),
    step(
      "sent_reply_live_queue",
      "Sent reply leaves live queue",
      input.sentQuoteReplyLeavesLiveQueue === true,
      "Sent vendor quote reply is no longer active decision work.",
      "Sent vendor quote reply has not been verified as removed from the live decision queue.",
    ),
    step(
      "sent_reply_history",
      "Sent reply history",
      input.sentQuoteReplyHistoryVisible === true,
      "Sent vendor quote reply remains available as history/proof.",
      "Sent vendor quote reply history/proof is not visible yet.",
    ),
    step(
      "response_evidence",
      "Threaded response evidence",
      input.responseEvidenceRecorded === true,
      "Vendor response evidence is visible in the threaded workspace.",
      "No vendor response evidence has been recorded in the threaded workspace yet.",
    ),
    step(
      "follow_up",
      "Follow-up closure",
      input.followUpTaskProjected === true,
      "Follow-up task is projected back into the wedding workspace.",
      "No follow-up task has been projected yet.",
    ),
    step(
      "test_vendor_cleanup",
      "Disposable vendor cleanup",
      input.testVendorCleanupRequired !== true || input.testVendorCleanupConfirmed === true,
      input.testVendorCleanupRequired === true
        ? "Disposable test vendor has been removed after smoke validation."
        : "No disposable test vendor cleanup is required.",
      expectedTestVendorEmail
        ? `Remove ${expectedTestVendorEmail} from saved/search fixture state before real vendor search.`
        : "Remove the disposable test vendor before real vendor search.",
    ),
  ];
  const blocked = steps.filter((item) => item.status === "blocked");
  const blockerLabels = blocked.map((item) => `${item.label}: ${item.detail}`);
  return {
    status: blocked.length === 0 ? "ready_for_usage_validation" : "blocked",
    passedCount: steps.length - blocked.length,
    blockedCount: blocked.length,
    steps,
    blockerLabels,
    nextActionLabels: blocked.map((item) => nextActionFor(item.id, item.detail)),
    estimatedPassesToUsage: Math.max(1, Math.ceil(blocked.length / 2)),
  };
}
