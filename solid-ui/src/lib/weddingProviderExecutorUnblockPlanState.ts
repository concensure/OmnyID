// @locs-version: 2.0
import type {
  WeddingProviderExecutorSuiteCapability,
  WeddingProviderExecutorSuiteReadinessState,
} from "@/lib/weddingProviderExecutorSuiteReadinessState";

export type WeddingProviderExecutorUnblockStepKind =
  | "connect_credentials"
  | "build_executor"
  | "run_smoke_test"
  | "attach_receipts"
  | "ready";

export type WeddingProviderExecutorUnblockStep = {
  capability: WeddingProviderExecutorSuiteCapability;
  kind: WeddingProviderExecutorUnblockStepKind;
  title: string;
  detail: string;
  priority: "high" | "normal";
  setupSurface: "email" | "calendar" | "connected_apps" | "provider_executor_registry";
  envHints: string[];
  proofHints: string[];
  acceptanceCriteria: string[];
};

export type WeddingProviderExecutorUnblockPlanState = {
  status: "ready" | "blocked";
  summary: string;
  nextStep: WeddingProviderExecutorUnblockStep | null;
  steps: WeddingProviderExecutorUnblockStep[];
  productionChecklist: string[];
};

const CAPABILITY_LABELS: Record<WeddingProviderExecutorSuiteCapability, string> = {
  email: "email",
  calendar: "calendar",
  registry: "registry",
  vendor_search: "vendor search",
};

const ACTION_LABELS: Record<WeddingProviderExecutorSuiteCapability, string> = {
  email: "approved vendor email or follow-up",
  calendar: "approved wedding calendar event",
  registry: "approved registry publishing handoff",
  vendor_search: "source-cited vendor research query",
};

const SETUP_SURFACES: Record<WeddingProviderExecutorSuiteCapability, WeddingProviderExecutorUnblockStep["setupSurface"]> = {
  email: "email",
  calendar: "calendar",
  registry: "connected_apps",
  vendor_search: "connected_apps",
};

const CREDENTIAL_ENV_HINTS: Record<WeddingProviderExecutorSuiteCapability, string[]> = {
  email: ["Gmail/OAuth provider credentials", "SMTP fallback credentials if Gmail is unavailable"],
  calendar: ["Google Calendar OAuth credentials", "Calendar provider refresh-token storage"],
  registry: ["Registry provider API credentials or connected-app identity"],
  vendor_search: [
    "OMNYID_ADMIN_BRAVE_SEARCH_API_KEY_FILE",
    "OMNYID_BRAVE_SEARCH_API_KEY_FILE",
    "OMNYID_ADMIN_GOOGLE_PLACES_API_KEY_FILE",
    "OMNYID_GOOGLE_PLACES_API_KEY_FILE",
    "OMNYID_OVERPASS_API_URL",
    "OMNYID_OVERPASS_CONTACT_EMAIL",
  ],
};

const EXECUTOR_PROOF_HINTS: Record<WeddingProviderExecutorSuiteCapability, string[]> = {
  email: ["dry-run vendor email receipt", "approved send_email/contact_vendor receipt", "failure/retry receipt"],
  calendar: ["dry-run calendar creation receipt", "external event id or provider receipt", "failure/retry receipt"],
  registry: ["approved registry handoff receipt", "provider publish receipt when integration exists", "unsupported-provider fallback receipt"],
  vendor_search: ["provider query receipt", "source URL count", "provider labels and query context"],
};

const SAFE_SMOKE_TARGETS: Record<WeddingProviderExecutorSuiteCapability, string> = {
  email: "Use an internal test inbox or sandbox address; never send to real vendors without approval.",
  calendar: "Use a private test calendar and disposable event; never invite guests/vendors without approval.",
  registry: "Use draft/sandbox publish mode or OmnyID-only handoff until a registry provider exists.",
  vendor_search: "Use a bounded test query and store source receipts; do not treat results as recommendations without user intake.",
};

function credentialStep(capability: WeddingProviderExecutorSuiteCapability): WeddingProviderExecutorUnblockStep {
  const label = CAPABILITY_LABELS[capability];
  return {
    capability,
    kind: "connect_credentials",
    title: `Connect ${label} credentials`,
    detail: `Connect and refresh the ${label} provider account or API key before OmnyID claims real execution.`,
    priority: "high",
    setupSurface: SETUP_SURFACES[capability],
    envHints: CREDENTIAL_ENV_HINTS[capability],
    proofHints: ["fresh credential status", "stale/missing credential blocker copy"],
    acceptanceCriteria: [
      "Connected status is stored in provider readiness state.",
      "Expired or expiring credentials are reported as stale, not ready.",
      "Setup action routes to the existing provider or Connected Apps surface.",
    ],
  };
}

function executorStep(capability: WeddingProviderExecutorSuiteCapability): WeddingProviderExecutorUnblockStep {
  const action = ACTION_LABELS[capability];
  return {
    capability,
    kind: "build_executor",
    title: `Register executor for ${action}`,
    detail: `Wire the approved wedding action to a callable executor handler; approval staging alone must remain insufficient.`,
    priority: "high",
    setupSurface: "provider_executor_registry",
    envHints: [],
    proofHints: EXECUTOR_PROOF_HINTS[capability],
    acceptanceCriteria: [
      "Handler is registered for the matching wedding approval action kind.",
      "Handler returns structured success, declined, and thrown-error receipts.",
      "No outbound action runs unless the request has explicit user approval.",
    ],
  };
}

function smokeTestStep(capability: WeddingProviderExecutorSuiteCapability): WeddingProviderExecutorUnblockStep {
  const action = ACTION_LABELS[capability];
  return {
    capability,
    kind: "run_smoke_test",
    title: `Run smoke test for ${action}`,
    detail: `Execute against a safe test target or dry-run sandbox and keep the receipt as production evidence. ${SAFE_SMOKE_TARGETS[capability]}`,
    priority: "normal",
    setupSurface: SETUP_SURFACES[capability],
    envHints: [],
    proofHints: EXECUTOR_PROOF_HINTS[capability],
    acceptanceCriteria: [
      "Success path records an external id or provider receipt.",
      "Declined and failed paths are retryable and visible to the user.",
      "The smoke test does not send real vendor or guest data without explicit approval.",
    ],
  };
}

function receiptStep(capability: WeddingProviderExecutorSuiteCapability): WeddingProviderExecutorUnblockStep {
  const label = CAPABILITY_LABELS[capability];
  return {
    capability,
    kind: "attach_receipts",
    title: `Attach ${label} execution proof to production readiness`,
    detail: "Feed the provider readiness proof into the wedding production gate so Oracle upload remains blocked until evidence is complete.",
    priority: "normal",
    setupSurface: "provider_executor_registry",
    envHints: [],
    proofHints: ["provider suite readiness check", "wedding production-readiness evidence adapter", "AFP/searchable receipt"],
    acceptanceCriteria: [
      "Provider suite readiness marks this capability ready only after credential and executor proof.",
      "Production readiness includes this capability in the required connected-app gate.",
      "Readiness copy tells the user exactly what remains blocked.",
    ],
  };
}

function readyStep(capability: WeddingProviderExecutorSuiteCapability): WeddingProviderExecutorUnblockStep {
  const label = CAPABILITY_LABELS[capability];
  return {
    capability,
    kind: "ready",
    title: `${label} connected app action is production-ready`,
    detail: "Sign-in and action proof are both present.",
    priority: "normal",
    setupSurface: SETUP_SURFACES[capability],
    envHints: [],
    proofHints: EXECUTOR_PROOF_HINTS[capability],
    acceptanceCriteria: [
      "Capability can be used by approved wedding workflows.",
      "Receipts remain searchable as AFP messages.",
      "Failures remain safe and retryable.",
    ],
  };
}

function stepsForCheck(check: WeddingProviderExecutorSuiteReadinessState["checks"][number]): WeddingProviderExecutorUnblockStep[] {
  if (check.status === "ready") return [readyStep(check.capability)];

  const blockerText = check.blockerLabels.join(" ").toLowerCase();
  const steps: WeddingProviderExecutorUnblockStep[] = [];
  if (blockerText.includes("credential") || blockerText.includes("readiness proof is missing")) {
    steps.push(credentialStep(check.capability));
  }
  if (blockerText.includes("executor") || blockerText.includes("connected app action") || blockerText.includes("readiness proof is missing")) {
    steps.push(executorStep(check.capability));
  }
  steps.push(smokeTestStep(check.capability), receiptStep(check.capability));
  return steps;
}

export function buildWeddingProviderExecutorUnblockPlanState(
  suite: WeddingProviderExecutorSuiteReadinessState,
): WeddingProviderExecutorUnblockPlanState {
  const steps = suite.checks.flatMap(stepsForCheck).filter((step) => step.kind !== "ready");
  const readySteps = suite.checks.flatMap(stepsForCheck).filter((step) => step.kind === "ready");
  const unresolvedSteps = steps.length > 0 ? steps : readySteps;
  const nextStep = steps.find((step) => step.priority === "high") ?? steps[0] ?? null;

  return {
    status: suite.productionEvidenceReady ? "ready" : "blocked",
    summary: suite.productionEvidenceReady
      ? "External wedding connected apps are ready for approved production use."
      : "Real app delivery is blocked until sign-ins, connected app actions, smoke tests, and production evidence are complete.",
    nextStep,
    steps: unresolvedSteps,
    productionChecklist: [
      "Keep user approval required for every outbound email, calendar creation, registry publish, and vendor-facing share.",
      "Use connected apps only for the selected wedding workflow, not unrelated Master Agent user queries.",
      "Record every execution result as a receipt that can be projected into AFP search and audit history.",
      "Keep Oracle upload blocked until connected app suite, backend scale, approval UI, and release rollback evidence all pass.",
    ],
  };
}
