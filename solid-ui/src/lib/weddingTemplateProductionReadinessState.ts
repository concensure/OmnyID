// @locs-version: 1.0
import type { WeddingTemplateDeepLinkLaunchState } from "@/lib/weddingTemplateDeepLinkLaunchState";
import type { WeddingTemplateLaunchState } from "@/lib/weddingTemplateLaunchState";
import {
  cleanWeddingProductionLabel,
  cleanWeddingProductionLabels,
  durableWeddingProductionProofLabels,
} from "@/lib/weddingProductionLabelState";

export type WeddingTemplateProductionReadinessInput = {
  deepLinkLaunch?: WeddingTemplateDeepLinkLaunchState | null;
  templateLaunch?: WeddingTemplateLaunchState | null;
  firstRunIntakeVisible?: boolean | null;
  proofReferencePolicy?: "optional" | "required" | null;
  proofRef?: string | null;
};

export type WeddingTemplateProductionReadinessState = {
  status: "ready" | "blocked";
  productionEvidenceReady: boolean;
  summary: string;
  detail: string;
  evidenceLabels: string[];
  blockerLabels: string[];
  nextActionLabels: string[];
  proofReferenceLabel: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function durableProofRef(value: unknown): string | null {
  const ref = cleanWeddingProductionLabel(clean(value));
  if (!ref) return null;
  if (ref === "...") return null;
  if (durableWeddingProductionProofLabels([ref]).length === 0) return null;
  if (/\.{3,}/.test(ref)) return null;
  if (/^https?:\/\//i.test(ref)) {
    try {
      const url = new URL(ref);
      const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
      if (url.protocol !== "https:") return null;
      if (
        hostname === "localhost"
        || hostname === "127.0.0.1"
        || hostname === "0.0.0.0"
        || hostname === "::1"
      ) {
        return null;
      }
    } catch {
      return null;
    }
  }
  return ref;
}

function launchDeepLinkReady(launch: WeddingTemplateDeepLinkLaunchState | null | undefined): boolean {
  return launch?.viewTarget === "response_queue"
    && launch.intent?.surface === "planning_files"
    && launch.intent.metadata.template === "wedding_planning";
}

function realWorkspaceLaunchReady(launch: WeddingTemplateLaunchState | null | undefined): boolean {
  return Boolean(
    launch?.metadata.template === "wedding_planning"
    && launch.metadata.supertags.includes("template_launch:wedding_planning")
    && launch.workspaceView.workspace.totalArtifacts > 0
    && launch.workspaceView.projectionQueue?.primaryAction.kind === "save_pending_outputs"
    && launch.richResponse.primaryAction.kind === "open_planning_files"
    && clean(launch.nextQuestionLabel),
  );
}

function launchGuardrailsReady(launch: WeddingTemplateLaunchState | null | undefined): boolean {
  const artifactMarkdown = launch?.artifactGeneration.artifacts
    .map((artifact) => artifact.markdown)
    .join("\n") ?? "";
  const firstResponsePrompt = launch?.firstResponsePrompt ?? "";
  const labels = launch?.launchLabels ?? [];
  return /No live vendor availability/i.test(artifactMarkdown)
    && /Ask first:/i.test(firstResponsePrompt)
    && labels.includes("No demo vendor claims")
    && labels.includes("Need-To-Know first")
    && labels.includes("Real workspace");
}

export function buildWeddingTemplateProductionReadinessState(
  input: WeddingTemplateProductionReadinessInput = {},
): WeddingTemplateProductionReadinessState {
  const proofRef = clean(input.proofRef);
  const durableRef = durableProofRef(proofRef);
  const proofReferenceRequired = input.proofReferencePolicy === "required";
  const proofReferenceLabel = durableRef ? `Wedding template launch proof: ${durableRef}` : null;
  const deepLinkReady = launchDeepLinkReady(input.deepLinkLaunch);
  const workspaceReady = realWorkspaceLaunchReady(input.templateLaunch);
  const intakeReady = input.firstRunIntakeVisible === true;
  const guardrailsReady = launchGuardrailsReady(input.templateLaunch);
  const proofReady = !proofReferenceRequired || Boolean(proofReferenceLabel);
  const blockerLabels = cleanWeddingProductionLabels([
    deepLinkReady ? null : "Wedding template deep link does not open the planning-files workspace target.",
    workspaceReady ? null : "Wedding template launch does not create a saved real workspace with pending-output projection.",
    intakeReady ? null : "Wedding template first-run intake gate is not proven before generated planning work.",
    guardrailsReady ? null : "Wedding template launch guardrails are incomplete: Need-To-Know, privacy, or no-live-claims copy is missing.",
    proofReady
      ? null
      : proofReferenceRequired && proofRef && !durableRef
        ? "Wedding template launch proof reference must be a durable audit ID or remote HTTPS proof link, not a local, dry-run, placeholder, localhost, or browser-only reference."
        : "Wedding template launch proof reference is missing.",
  ]);
  const evidenceLabels = cleanWeddingProductionLabels([
    deepLinkReady ? "Wedding template deep link opens planning files." : null,
    workspaceReady ? "Wedding template creates a real saved workspace." : null,
    intakeReady ? "Wedding template first-run intake gate is proven." : null,
    guardrailsReady ? "Wedding template launch guardrails are mounted." : null,
    proofReferenceLabel,
  ]);
  const productionEvidenceReady = blockerLabels.length === 0;

  return {
    status: productionEvidenceReady ? "ready" : "blocked",
    productionEvidenceReady,
    summary: productionEvidenceReady
      ? "Wedding template launch and first-run intake proof is complete."
      : "Wedding template launch and first-run intake proof is incomplete.",
    detail: productionEvidenceReady
      ? "Deep link, real workspace creation, first-run intake, privacy guardrails, Need-To-Know-first copy, and proof reference requirements are satisfied."
      : blockerLabels.join(" "),
    evidenceLabels,
    blockerLabels,
    nextActionLabels: productionEvidenceReady
      ? []
      : cleanWeddingProductionLabels([
        deepLinkReady ? null : "Wire the wedding template deep link to the planning-files workspace target.",
        workspaceReady ? null : "Prove the template creates a saveable workspace instead of a demo-only response.",
        intakeReady ? null : "Prove first-run intake appears before generated planning work for new template launches.",
        guardrailsReady ? null : "Restore Need-To-Know-first, private-workspace, and no-live-claims launch copy.",
        proofReady ? null : "Attach a durable wedding template launch proof reference.",
      ]),
    proofReferenceLabel,
  };
}
