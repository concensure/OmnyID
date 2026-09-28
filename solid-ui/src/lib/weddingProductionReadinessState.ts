// @locs-version: 2.0
export type WeddingProductionReadinessCheckId =
  | "backend_pagination"
  | "template_launch_intake"
  | "live_map_geocoding"
  | "graph_canvas_highlighting"
  | "approval_execution_ui"
  | "vendor_comparison_ui"
  | "vendor_quote_reply_ui"
  | "native_export_workers"
  | "llm_need_to_know_extraction"
  | "seeded_vendor_corpus"
  | "expected_behavior_coverage"
  | "import_parser_readiness"
  | "collaboration_access_controls"
  | "collaboration_lifecycle_audit"
  | "admin_ai_routing_policy"
  | "admin_ops_backend_metrics"
  | "provider_executor_integrations"
  | "oracle_release_gate";

export type WeddingProductionReadinessCheck = {
  id: WeddingProductionReadinessCheckId;
  label: string;
  status: "pass" | "blocked";
  detail: string;
  requiredForOracle: boolean;
};

export type WeddingProductionReadinessState = {
  status: "production_ready" | "not_production_ready";
  oracleUploadAllowed: boolean;
  blockerCount: number;
  checks: WeddingProductionReadinessCheck[];
  summary: string;
  nextActions: string[];
};

export type WeddingProductionReadinessEvidence = {
  backendPaginationReady?: boolean;
  backendScaleProofReady?: boolean;
  templateLaunchIntakeReady?: boolean;
  liveMapGeocodingReady?: boolean;
  graphCanvasHighlightingReady?: boolean;
  approvalExecutionUiReady?: boolean;
  vendorComparisonUiReady?: boolean;
  vendorQuoteReplyUiReady?: boolean;
  vendorQuoteReplyProductionReady?: boolean;
  nativeExportWorkersReady?: boolean;
  llmNeedToKnowExtractionReady?: boolean;
  seededVendorCorpusReady?: boolean;
  expectedBehaviorCoverageReady?: boolean;
  importParserReady?: boolean;
  collaborationAccessControlsReady?: boolean;
  collaborationLifecycleAuditReady?: boolean;
  adminAiRoutingPolicyReady?: boolean;
  adminOpsBackendMetricsReady?: boolean;
  providerExecutorsReady?: boolean;
  oracleReleaseGateReady?: boolean;
};

const DEFAULT_CHECKS: readonly WeddingProductionReadinessCheck[] = [
  {
    id: "backend_pagination",
    label: "Backend refresh pagination and query tuning",
    status: "blocked",
    detail: "Wedding workspace reload still depends on first-pass wedding supertag refresh behavior; production needs bounded pagination and query tuning.",
    requiredForOracle: true,
  },
  {
    id: "template_launch_intake",
    label: "Wedding template launch and first-run intake",
    status: "blocked",
    detail: "The wedding template must prove its deep link, real saved workspace launch, first-run intake gate, private-workspace copy, Need-To-Know-first copy, and no-live-claims guardrails before production upload.",
    requiredForOracle: true,
  },
  {
    id: "live_map_geocoding",
    label: "Live map and geocoding verification",
    status: "blocked",
    detail: "Current map/location previews use deterministic metadata and handoff URLs, not verified live route, geocode, or travel-time data.",
    requiredForOracle: false,
  },
  {
    id: "graph_canvas_highlighting",
    label: "Deeper graph canvas highlighting",
    status: "blocked",
    detail: "Knowledge Graph handoff packets carry focus context, but production graph highlighting and path emphasis are still pending.",
    requiredForOracle: false,
  },
  {
    id: "approval_execution_ui",
    label: "Real approval execution UI",
    status: "blocked",
    detail: "Approval gates and runner contracts exist, but production needs polished connected-provider execution controls and receipts.",
    requiredForOracle: true,
  },
  {
    id: "vendor_comparison_ui",
    label: "Dynamic vendor comparison UI",
    status: "blocked",
    detail: "Vendor comparison needs default top-three display, optional top-five expansion, multi-select choices, safe source links, confirmation, approval-gated follow-up routing, unselected-vendor queue suppression, and closed-vendor history retention before production upload.",
    requiredForOracle: true,
  },
  {
    id: "vendor_quote_reply_ui",
    label: "Inline vendor quote reply flow",
    status: "blocked",
    detail: "Vendor quote replies need state-derived decision actions, conditional Tiptap editing, separate wording approval, separate budget acknowledgement, undo window, sent-history logging, connected-app send status, live provider proof, and durable sent proof before Oracle upload.",
    requiredForOracle: true,
  },
  {
    id: "native_export_workers",
    label: "Native export workers",
    status: "blocked",
    detail: "Markdown, HTML, Word-openable .doc, print-to-PDF, and CSV are ready; native DOCX/JPG/PNG/ZIP workers are still planned blockers.",
    requiredForOracle: false,
  },
  {
    id: "llm_need_to_know_extraction",
    label: "LLM-backed Need-To-Know extraction",
    status: "blocked",
    detail: "Current extraction is deterministic and useful for pasted planning notes; production needs robust transcript/chat extraction with conservative review.",
    requiredForOracle: false,
  },
  {
    id: "seeded_vendor_corpus",
    label: "Source-backed seeded vendor corpus",
    status: "blocked",
    detail: "Seeded vendor data is not yet proven as a source-backed planning corpus with enough categories, source links, and fresh checked dates.",
    requiredForOracle: false,
  },
  {
    id: "provider_executor_integrations",
    label: "Connected app integrations",
    status: "blocked",
    detail: "Email, calendar, maps, registry, and vendor connected-app actions need production proof before live use.",
    requiredForOracle: true,
  },
  {
    id: "collaboration_access_controls",
    label: "Shared wedding workspace access controls",
    status: "blocked",
    detail: "Partner, planner, contributor, and viewer roles are scaffolded in the wedding workspace, but production shared editing needs backend ACLs, shared E2EE key distribution, per-collaborator audit trails, and conflict handling.",
    requiredForOracle: true,
  },
  {
    id: "collaboration_lifecycle_audit",
    label: "Collaborator lifecycle audit records",
    status: "blocked",
    detail: "Collaborator invite, expiry, revocation, and stale-access-review records must be saved as guarded AFP access-control projections before shared wedding workspaces can be treated as production-ready.",
    requiredForOracle: true,
  },
  {
    id: "admin_ai_routing_policy",
    label: "Admin-funded wedding AI routing policy",
    status: "blocked",
    detail: "Admin-funded wedding-template background AI routing is still local-only until backend policy, tenant boundaries, budget guardrails, AFP/audit receipts, and Master Agent query exclusion are proven.",
    requiredForOracle: true,
  },
  {
    id: "admin_ops_backend_metrics",
    label: "Admin Oracle and user metrics",
    status: "blocked",
    detail: "Admin wedding operations still need backend-mounted exact user count plus Oracle disk/RAM usage and source labels before production upload.",
    requiredForOracle: true,
  },
  {
    id: "expected_behavior_coverage",
    label: "Expected wedding behaviour coverage",
    status: "blocked",
    detail: "Legal/admin, vendor matching, outreach, follow-ups, run sheet, RSVP, seating, and weather contingency must be audited so the UI can distinguish ready, provider-blocked, and UI-blocked behaviours.",
    requiredForOracle: false,
  },
  {
    id: "import_parser_readiness",
    label: "Wedding import parser readiness",
    status: "blocked",
    detail: "Imported guest lists, budgets, and vendor spreadsheets must either be synthesized safely from CSV/TSV/text or kept blocked until backend XLS/XLSX parsing has durable proof.",
    requiredForOracle: true,
  },
  {
    id: "oracle_release_gate",
    label: "Oracle release gate",
    status: "blocked",
    detail: "Oracle upload must wait for release-readiness, production-go/no-go, backup/restore, secret, and remote proof gates to pass on the intended deployment target.",
    requiredForOracle: true,
  },
];

export function buildWeddingProductionReadinessState(
  overrides: Partial<Record<WeddingProductionReadinessCheckId, "pass" | "blocked">> = {},
  evidence: WeddingProductionReadinessEvidence = {},
): WeddingProductionReadinessState {
  const checks = DEFAULT_CHECKS.map((check) => ({
    ...check,
    status:
      overrides[check.id] ??
      (check.id === "backend_pagination" && evidence.backendPaginationReady && evidence.backendScaleProofReady
        ? "pass"
        : check.id === "template_launch_intake" && evidence.templateLaunchIntakeReady
          ? "pass"
        : check.id === "live_map_geocoding" && evidence.liveMapGeocodingReady
          ? "pass"
        : check.id === "graph_canvas_highlighting" && evidence.graphCanvasHighlightingReady
          ? "pass"
        : check.id === "approval_execution_ui" && evidence.approvalExecutionUiReady
          ? "pass"
        : check.id === "vendor_comparison_ui" && evidence.vendorComparisonUiReady
          ? "pass"
        : check.id === "vendor_quote_reply_ui" && evidence.vendorQuoteReplyUiReady && evidence.vendorQuoteReplyProductionReady
          ? "pass"
          : check.id === "native_export_workers" && evidence.nativeExportWorkersReady
            ? "pass"
          : check.id === "llm_need_to_know_extraction" && evidence.llmNeedToKnowExtractionReady
            ? "pass"
          : check.id === "seeded_vendor_corpus" && evidence.seededVendorCorpusReady
            ? "pass"
          : check.id === "expected_behavior_coverage" && evidence.expectedBehaviorCoverageReady
            ? "pass"
          : check.id === "import_parser_readiness" && evidence.importParserReady === true
            ? "pass"
          : check.id === "collaboration_access_controls" && evidence.collaborationAccessControlsReady
            ? "pass"
          : check.id === "collaboration_lifecycle_audit" && evidence.collaborationLifecycleAuditReady
            ? "pass"
          : check.id === "provider_executor_integrations" && evidence.providerExecutorsReady
            ? "pass"
          : check.id === "admin_ai_routing_policy" && evidence.adminAiRoutingPolicyReady
            ? "pass"
          : check.id === "admin_ops_backend_metrics" && evidence.adminOpsBackendMetricsReady
            ? "pass"
          : check.id === "oracle_release_gate" && evidence.oracleReleaseGateReady
            ? "pass"
          : check.status),
    detail:
      check.id === "backend_pagination" && evidence.backendPaginationReady && evidence.backendScaleProofReady && !overrides[check.id]
        ? "Wedding workspace refresh has bounded backend pagination metadata and repeatable scale-proof evidence across multiple saved AFP pages."
        : check.id === "template_launch_intake" && evidence.templateLaunchIntakeReady && !overrides[check.id]
          ? "Wedding template launch deep link, real saved workspace creation, first-run intake gate, private-workspace copy, Need-To-Know-first prompt, and no-live-claims guardrails are proven."
        : check.id === "backend_pagination" && evidence.backendPaginationReady && !overrides[check.id]
          ? "Wedding workspace refresh has bounded backend pagination metadata with offset, has_more, and next_offset support, but live multi-page scale proof is still required before Oracle upload."
        : check.id === "live_map_geocoding" && evidence.liveMapGeocodingReady && !overrides[check.id]
          ? "Wedding map outputs have verified live geocodes/routes, fresh travel-time evidence, fallback map links, and visible caveats."
        : check.id === "graph_canvas_highlighting" && evidence.graphCanvasHighlightingReady && !overrides[check.id]
          ? "Wedding Knowledge Graph focus packets are consumed by the graph canvas with node highlights, edge/path emphasis, outside-focus dimming, legend copy, and clear-focus controls."
        : check.id === "approval_execution_ui" && evidence.approvalExecutionUiReady && !overrides[check.id]
          ? "Wedding approval UI has controls, rejection path, execution path, disclosure preview, risk labels, app setup routing, AFP receipt projection, failure copy, keyboard fallback, and blocked-state proof. External app delivery remains covered by the connected-app gate."
        : check.id === "vendor_comparison_ui" && evidence.vendorComparisonUiReady && !overrides[check.id]
          ? "Vendor comparison supports default top-three display, optional top-five expansion, multi-select vendor choice, safe source links, selected-vendor fan-out, approval-gated follow-up routing, unselected-vendor queue suppression, closed-vendor history retention, and malformed/local URL guards."
        : check.id === "vendor_quote_reply_ui"
          && evidence.vendorQuoteReplyUiReady
          && evidence.vendorQuoteReplyProductionReady
          && !overrides[check.id]
          ? "Vendor quote reply keeps the user in one card with a structured quote summary, state-derived primary and secondary actions, conditional Tiptap email editing, separate wording and budget confirmations, undo-send, sent-history logging, provider setup recovery, live-region status, telemetry, actual connected-provider send proof, and durable sent proof."
          : check.id === "native_export_workers" && evidence.nativeExportWorkersReady && !overrides[check.id]
            ? "ZIP, DOCX, JPG, and PNG downloads are connected with private-file filtering, repeatable filenames, saved receipts, and safe error messages."
          : check.id === "llm_need_to_know_extraction" && evidence.llmNeedToKnowExtractionReady && !overrides[check.id]
            ? "LLM-backed Need-To-Know extraction has transcript/chat proof, conservative review labels, deterministic fallback, AFP projection, and no overwrite without review."
          : check.id === "seeded_vendor_corpus" && evidence.seededVendorCorpusReady && !overrides[check.id]
            ? "Seeded vendor corpus has enough source-backed rows, categories, source links, and fresh checked dates for conservative planning support. Live price, fit, availability, and outreach remain separately gated."
          : check.id === "expected_behavior_coverage" && evidence.expectedBehaviorCoverageReady && !overrides[check.id]
            ? "Wedding expected behaviours are audited with ready, provider-blocked, and UI-blocked labels for lifecycle, legal/admin, vendor, outreach, RSVP, seating, and weather loops."
          : check.id === "import_parser_readiness" && evidence.importParserReady === true && !overrides[check.id]
            ? "Wedding import onboarding is safe for CSV/TSV/text, imported evidence is private and AFP-projected, and no current spreadsheet import needs an unproven binary parser."
          : check.id === "collaboration_access_controls" && evidence.collaborationAccessControlsReady && !overrides[check.id]
            ? "Shared wedding workspace roles are backed by backend ACLs, shared E2EE key distribution, per-collaborator audit trails, conflict handling, and conservative sensitive-decision restrictions."
          : check.id === "collaboration_lifecycle_audit" && evidence.collaborationLifecycleAuditReady && !overrides[check.id]
            ? "Collaborator invite, expiry, revocation, and stale-access-review actions are projected as guarded searchable AFP access-control records with shared editing disabled until backend approval proof exists."
          : check.id === "provider_executor_integrations" && evidence.providerExecutorsReady && !overrides[check.id]
            ? "Email, calendar, registry, and vendor connected-app actions are connected with sign-in checks and durable receipts."
          : check.id === "admin_ai_routing_policy" && evidence.adminAiRoutingPolicyReady && !overrides[check.id]
            ? "Admin-funded wedding-template background AI routing is backed by backend policy, tenant boundaries, budget guardrails, AFP/audit receipts, wedding-template scope, and direct Master Agent query exclusion."
          : check.id === "admin_ops_backend_metrics" && evidence.adminOpsBackendMetricsReady && !overrides[check.id]
            ? "Admin wedding operations has backend-mounted exact user count, Oracle disk usage, Oracle RAM usage, and metric source labels."
          : check.id === "oracle_release_gate" && evidence.oracleReleaseGateReady && !overrides[check.id]
            ? "Repository release-readiness, production-go/no-go, backup verification, restore drill, secret sync, and fresh Oracle remote proof have passed for the intended target."
        : check.detail,
  }));
  const blockers = checks.filter((check) => check.status === "blocked");
  const oracleBlockers = blockers.filter((check) => check.requiredForOracle);
  const oracleUploadAllowed = oracleBlockers.length === 0;
  const status = blockers.length === 0 ? "production_ready" : "not_production_ready";

  return {
    status,
    oracleUploadAllowed,
    blockerCount: blockers.length,
    checks,
    summary: oracleUploadAllowed
      ? "Wedding planning has no Oracle-blocking readiness gaps in the current gate state."
      : `Wedding planning is blocked from Oracle upload by ${oracleBlockers.length} required readiness gate${oracleBlockers.length === 1 ? "" : "s"}.`,
    nextActions: oracleBlockers.map((check) => check.label),
  };
}
