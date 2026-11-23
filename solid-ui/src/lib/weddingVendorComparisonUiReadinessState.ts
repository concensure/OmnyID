// @locs-version: 1.0
import { cleanWeddingProductionLabels } from "@/lib/weddingProductionLabelState";

export type WeddingVendorComparisonUiReadinessInput = {
  comparisonTableMounted?: boolean | null;
  expandableTopFiveControlMounted?: boolean | null;
  multiSelectControlsMounted?: boolean | null;
  sourceLinkActionsMounted?: boolean | null;
  confirmSelectedActionMounted?: boolean | null;
  followUpQueueActionMounted?: boolean | null;
  approvalGatingCopyMounted?: boolean | null;
  selectedVendorProjectionMounted?: boolean | null;
  unselectedVendorQueueSuppressionMounted?: boolean | null;
  closedVendorHistoryMounted?: boolean | null;
  malformedSourceUrlGuardMounted?: boolean | null;
  localSourceUrlGuardMounted?: boolean | null;
};

export type WeddingVendorComparisonUiReadinessState = {
  status: "ready" | "partial" | "blocked";
  productionReady: boolean;
  summary: string;
  detail: string;
  evidenceLabels: string[];
  blockerLabels: string[];
  nextActionLabels: string[];
  telemetryEvent: string | null;
};

type ReadinessCheck = {
  ready: boolean;
  evidence: string;
  blocker: string;
};

function check(ready: boolean | null | undefined, evidence: string, blocker: string): ReadinessCheck {
  return { ready: ready === true, evidence, blocker };
}

export function buildWeddingVendorComparisonUiReadinessState(
  input: WeddingVendorComparisonUiReadinessInput = {},
): WeddingVendorComparisonUiReadinessState {
  const checks: ReadinessCheck[] = [
    check(input.comparisonTableMounted, "Top-three vendor comparison table mounted", "Top-three vendor comparison table is not mounted."),
    check(
      input.expandableTopFiveControlMounted,
      "Top-five expansion control mounted",
      "Top-five expansion control is not mounted.",
    ),
    check(input.multiSelectControlsMounted, "Multi-select vendor controls mounted", "Multi-select vendor controls are not mounted."),
    check(input.sourceLinkActionsMounted, "Per-vendor source link actions mounted", "Per-vendor source link actions are not mounted."),
    check(input.confirmSelectedActionMounted, "Confirm selected vendors action mounted", "Confirm selected vendors action is not mounted."),
    check(input.followUpQueueActionMounted, "Follow-up queue action mounted", "Follow-up queue action is not mounted."),
    check(input.approvalGatingCopyMounted, "Approval-gated follow-up copy mounted", "Approval-gated follow-up copy is not mounted."),
    check(input.selectedVendorProjectionMounted, "Selected-vendor projection fan-out mounted", "Selected-vendor projection fan-out is not mounted."),
    check(
      input.unselectedVendorQueueSuppressionMounted,
      "Unselected vendor queue suppression mounted",
      "Unselected vendor queue suppression is not mounted.",
    ),
    check(
      input.closedVendorHistoryMounted,
      "Closed vendor history surface mounted",
      "Closed vendor history surface is not mounted.",
    ),
    check(input.malformedSourceUrlGuardMounted, "Malformed source URL guard mounted", "Malformed source URL guard is not mounted."),
    check(input.localSourceUrlGuardMounted, "Local source URL guard mounted", "Local source URL guard is not mounted."),
  ];
  const evidenceLabels = cleanWeddingProductionLabels(checks.filter((item) => item.ready).map((item) => item.evidence));
  const blockerLabels = cleanWeddingProductionLabels(checks.filter((item) => !item.ready).map((item) => item.blocker));
  const productionReady = blockerLabels.length === 0;
  const nextActionLabels = cleanWeddingProductionLabels(blockerLabels.map((label) => {
    if (/comparison table/i.test(label)) return "Mount the top-three comparison table after live vendor search.";
    if (/Top-five expansion/i.test(label)) return "Mount the expansion control so users can grow the comparison from top three to top five.";
    if (/Multi-select/i.test(label)) return "Mount controls that let the user choose one or more vendors.";
    if (/source link/i.test(label)) return "Mount safe source-link actions for each vendor row.";
    if (/Confirm selected/i.test(label)) return "Mount a confirm action for selected vendors.";
    if (/Follow-up queue/i.test(label)) return "Mount the action that opens approval-gated follow-up work.";
    if (/Approval-gated/i.test(label)) return "Show that follow-up is approval-gated before outreach.";
    if (/projection fan-out/i.test(label)) return "Project every selected vendor into its own follow-up decision/task.";
    if (/Unselected vendor queue suppression/i.test(label)) return "Remove unselected search vendors from active decision and response queues.";
    if (/Closed vendor history/i.test(label)) return "Keep vendors the user stops pursuing in response-queue history.";
    if (/Malformed source URL/i.test(label)) return "Reject malformed vendor source URLs before rendering source actions.";
    if (/Local source URL/i.test(label)) return "Reject localhost and loopback source URLs before rendering source actions.";
    return "Complete vendor comparison UI safeguard.";
  }));

  return {
    status: productionReady ? "ready" : evidenceLabels.length > 0 ? "partial" : "blocked",
    productionReady,
    summary: productionReady
      ? "Vendor comparison UI has the required selection, top-five expansion, queue, history, source, follow-up, and URL safety controls."
      : "Vendor comparison UI is not production-ready yet.",
    detail: productionReady
      ? "The table can move from live search results to user-confirmed, approval-gated vendor follow-up, expand from the default top three to top five, remove unselected vendors from active queues, and retain closed paths as history without treating search snippets as bookings."
      : "Keep vendor comparison behind the readiness gate until top-three display, top-five expansion, dynamic selection, queue suppression, history retention, source links, follow-up routing, and URL guards pass.",
    evidenceLabels,
    blockerLabels,
    nextActionLabels,
    telemetryEvent: productionReady ? null : "wedding_vendor_comparison_ui_readiness_blocked",
  };
}
