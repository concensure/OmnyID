// @locs-version: 2.0
export type AdminWeddingAiRoutingPolicyInput = {
  backendPolicyEndpointMounted?: boolean | null;
  auditReceiptProjectionReady?: boolean | null;
  tenantBoundaryEnforced?: boolean | null;
  budgetGuardrailsReady?: boolean | null;
  weddingTemplateScopeOnly?: boolean | null;
  masterAgentQueryExcluded?: boolean | null;
  lastVerifiedAt?: string | null;
  policyProofRef?: string | null;
  policySourceLabel?: string | null;
  proofReferencePolicy?: "optional" | "required" | null;
};

export type AdminWeddingAiRoutingPolicyState = {
  status: "ready" | "local_only" | "blocked";
  productionReady: boolean;
  summary: string;
  detail: string;
  blockerLabels: string[];
  evidenceLabels: string[];
  proofReferenceLabels: string[];
  nextActionLabels: string[];
  lastVerifiedLabel: string | null;
};

function clean(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function durableProofRef(value: unknown): string | null {
  const ref = clean(value);
  if (!ref) return null;
  if (/^(receipt|local|draft|display):/i.test(ref)) return null;
  if (/^(file|blob|data):/i.test(ref)) return null;
  if (/^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|::1)(?::|\/|$)/i.test(ref)) return null;
  return ref;
}

export function buildAdminWeddingAiRoutingPolicyState(
  input: AdminWeddingAiRoutingPolicyInput = {},
): AdminWeddingAiRoutingPolicyState {
  const lastVerifiedLabel = clean(input.lastVerifiedAt);
  const rawPolicyProofRef = clean(input.policyProofRef);
  const policyProofRef = durableProofRef(rawPolicyProofRef);
  const proofReferencesRequired = input.proofReferencePolicy === "required";
  const checks = [
    {
      ready: input.backendPolicyEndpointMounted === true,
      evidence: "Backend policy endpoint mounted",
      blocker: "Backend policy endpoint is not mounted.",
    },
    {
      ready: input.auditReceiptProjectionReady === true,
      evidence: "AFP/audit receipt projection ready",
      blocker: "AFP/audit receipt projection is not proven.",
    },
    {
      ready: input.tenantBoundaryEnforced === true,
      evidence: "Tenant boundary enforcement ready",
      blocker: "Tenant boundary enforcement is not proven.",
    },
    {
      ready: input.budgetGuardrailsReady === true,
      evidence: "Admin API budget guardrails ready",
      blocker: "Admin API budget guardrails are not proven.",
    },
    {
      ready: input.weddingTemplateScopeOnly === true,
      evidence: "Wedding-template scope enforced",
      blocker: "Wedding-template-only scope is not proven.",
    },
    {
      ready: input.masterAgentQueryExcluded === true,
      evidence: "Direct Master Agent query exclusion enforced",
      blocker: "Direct Master Agent query exclusion is not proven.",
    },
    ...(proofReferencesRequired || policyProofRef
      ? [{
        ready: Boolean(policyProofRef),
        evidence: `Admin routing policy proof reference mounted: ${policyProofRef}`,
        blocker: rawPolicyProofRef
          ? "Admin routing policy proof reference must be a durable audit ID or remote proof link, not a local receipt, localhost URL, or browser-only file reference."
          : "Admin routing policy proof reference is not mounted.",
      }]
      : []),
    ...(proofReferencesRequired || lastVerifiedLabel
      ? [{
        ready: Boolean(lastVerifiedLabel),
        evidence: `Admin routing policy verification timestamp mounted: ${lastVerifiedLabel}`,
        blocker: "Admin routing policy verification timestamp is not mounted.",
      }]
      : []),
  ];
  const evidenceLabels = checks.filter((check) => check.ready).map((check) => check.evidence);
  const blockerLabels = checks.filter((check) => !check.ready).map((check) => check.blocker);
  const productionReady = blockerLabels.length === 0;
  const partial = evidenceLabels.length > 0;
  const policySource = clean(input.policySourceLabel) ?? "backend policy";
  const proofReferenceLabels = policyProofRef ? [`admin routing policy proof: ${policyProofRef}`] : [];

  return {
    status: productionReady ? "ready" : partial ? "local_only" : "blocked",
    productionReady,
    summary: productionReady
      ? "Admin-funded wedding background AI routing is enforceable."
      : partial
        ? "Admin-funded wedding AI routing has partial policy evidence only."
        : "Admin-funded wedding AI routing is local-only until backend policy is mounted.",
    detail: productionReady
      ? `Verified by ${policySource}; routing may be enabled for wedding-template background work only.`
      : "Keep the toggle as an admin planning control until backend policy, audit, tenant, budget, scope, and Master Agent exclusion checks all pass.",
    blockerLabels,
    evidenceLabels,
    proofReferenceLabels,
    nextActionLabels: blockerLabels.map((label) => {
      if (/proof reference|local receipt|localhost URL|browser-only file reference/i.test(label)) return "Attach a durable admin routing policy proof reference.";
      if (/endpoint/i.test(label)) return "Mount the backend wedding AI routing policy endpoint.";
      if (/audit/i.test(label)) return "Project admin routing decisions into durable AFP/audit receipts.";
      if (/Tenant/i.test(label)) return "Enforce tenant boundaries before enabling admin-funded routing.";
      if (/budget/i.test(label)) return "Mount admin API request, token, and spend guardrails.";
      if (/Wedding-template/i.test(label)) return "Constrain admin-funded routing to wedding-template background work.";
      if (/Master Agent/i.test(label)) return "Exclude direct Master Agent user queries from admin-funded routing.";
      if (/verification timestamp/i.test(label)) return "Expose the latest admin routing policy verification timestamp.";
      return "Complete admin wedding AI routing policy proof.";
    }),
    lastVerifiedLabel,
  };
}
