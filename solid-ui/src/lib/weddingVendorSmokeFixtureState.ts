// @locs-version: 1.0
import {
  normalizeWeddingArtifactSummary,
  type WeddingArtifactInput,
} from "@/lib/weddingArtifactState";
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import {
  loadWeddingImportedArtifacts,
  saveWeddingImportedArtifacts,
  weddingImportScopedStorageKey,
} from "@/lib/weddingImportSynthesisState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export const WEDDING_VENDOR_SMOKE_PLANNER_EMAIL = "concensure@gmail.com";
export const WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL = "concensure+omnyidtest@gmail.com";
export const WEDDING_VENDOR_SMOKE_VENDOR_NAME = "OmnyID Wedding Smoke Vendor";

export type WeddingVendorSmokeFixtureState = {
  metadata: WeddingPlanningMetadata;
  plannerEmail: string;
  vendorEmail: string;
  disposableVendorLabel: string;
  generatedArtifacts: WeddingGeneratedArtifact[];
  cleanupSearchLabels: string[];
};

export type WeddingVendorSmokeFixtureCleanupState = {
  removedCount: number;
  remainingCount: number;
  cleanupComplete: boolean;
};

export type WeddingVendorSmokeFixtureCleanupGateState = {
  status: "clear" | "blocked";
  disposableArtifactCount: number;
  blockerLabel: string | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function makeArtifact(input: WeddingArtifactInput, markdown: string): WeddingGeneratedArtifact {
  const summary = normalizeWeddingArtifactSummary({ ...input, bodyText: markdown });
  if (!summary) throw new Error("Wedding vendor smoke artifact could not be normalized.");
  return {
    input: { ...input, bodyText: markdown },
    summary,
    markdown,
    csv: null,
  };
}

function smokeMetadata(metadata: WeddingPlanningMetadata, extra: Record<string, unknown> = {}) {
  return {
    ...metadata,
    source: "wedding_vendor_smoke_fixture",
    disposableSmokeVendor: true,
    smokePlannerEmail: WEDDING_VENDOR_SMOKE_PLANNER_EMAIL,
    smokeVendorEmail: WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL,
    cleanupRequiredBeforeRealSearch: true,
    ...extra,
  };
}

export function buildWeddingVendorSmokeFixtureState(input: {
  metadata?: unknown;
  quoteAmountLabel?: string | null;
  budgetDeltaLabel?: string | null;
  validUntil?: string | null;
  inclusions?: readonly string[] | null;
} = {}): WeddingVendorSmokeFixtureState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const quoteAmountLabel = clean(input.quoteAmountLabel) || "AUD $799";
  const budgetDeltaLabel = clean(input.budgetDeltaLabel) || "$200 over budget";
  const validUntil = clean(input.validUntil) || "2026-10-15";
  const inclusions = (input.inclusions ?? ["Smoke-test ceremony florals", "Smoke-test reception bud vases"])
    .map(clean)
    .filter(Boolean)
    .slice(0, 8);
  const cleanupSearchLabels = [
    "wedding_vendor_smoke_fixture",
    WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL,
    WEDDING_VENDOR_SMOKE_VENDOR_NAME,
  ];
  const idPrefix = `wedding_vendor_smoke:${safeWeddingLabel(metadata.responseWorkspaceId)}`;
  const quoteMarkdown = [
    `# ${WEDDING_VENDOR_SMOKE_VENDOR_NAME} quote`,
    "",
    `Vendor: ${WEDDING_VENDOR_SMOKE_VENDOR_NAME}`,
    `Quote amount: ${quoteAmountLabel}`,
    `Budget delta: ${budgetDeltaLabel}`,
    `Valid until: ${validUntil}`,
    "",
    "## Inclusions",
    "",
    ...inclusions.map((item) => `- ${item}`),
    "",
    "## Smoke fixture",
    "",
    `Planner login: ${WEDDING_VENDOR_SMOKE_PLANNER_EMAIL}`,
    `Disposable vendor recipient: ${WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL}`,
    "Remove this fixture after validating the real quote/reply/follow-up path.",
  ].join("\n");
  const draftMarkdown = [
    `# Reply draft - ${WEDDING_VENDOR_SMOKE_VENDOR_NAME}`,
    "",
    `Recipient: ${WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL}`,
    "Subject: Smoke-test wedding quote reply",
    "",
    "## Disclosure summary",
    "",
    "Smoke-test reply for validating the wedding vendor quote workflow. Do not keep this disposable vendor after validation.",
    "",
    "## Draft",
    "",
    `Hi ${WEDDING_VENDOR_SMOKE_VENDOR_NAME},`,
    "",
    `Thanks for sending the quote for ${quoteAmountLabel}. We are using this message to validate the OmnyID wedding vendor workflow end to end.`,
    `Please reply to confirm this smoke-test thread was received by ${WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL}.`,
    "",
    "Thank you.",
  ].join("\n");
  const quote = makeArtifact({
    id: `${idPrefix}:quote`,
    title: `${WEDDING_VENDOR_SMOKE_VENDOR_NAME} quote`,
    kind: "vendor_table",
    metadata: smokeMetadata(metadata, { artifactKind: "vendor_table", smokeArtifactRole: "quote" }),
    sourceLabels: ["Wedding vendor smoke fixture"],
    searchLabels: cleanupSearchLabels,
    vendorLabels: [WEDDING_VENDOR_SMOKE_VENDOR_NAME],
    exportTargets: ["markdown", "html", "browser_pdf"],
  }, quoteMarkdown);
  const draft = makeArtifact({
    id: `${idPrefix}:reply_draft`,
    title: "Smoke-test wedding quote reply",
    kind: "email_draft",
    metadata: smokeMetadata(metadata, { artifactKind: "email_draft", smokeArtifactRole: "reply_draft" }),
    sourceLabels: ["Wedding vendor smoke fixture"],
    searchLabels: cleanupSearchLabels,
    vendorLabels: [WEDDING_VENDOR_SMOKE_VENDOR_NAME],
    exportTargets: ["markdown", "html", "word_doc"],
  }, draftMarkdown);

  return {
    metadata,
    plannerEmail: WEDDING_VENDOR_SMOKE_PLANNER_EMAIL,
    vendorEmail: WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL,
    disposableVendorLabel: WEDDING_VENDOR_SMOKE_VENDOR_NAME,
    generatedArtifacts: [quote, draft],
    cleanupSearchLabels,
  };
}

export function isWeddingVendorSmokeFixtureArtifact(artifact: Pick<WeddingGeneratedArtifact, "input" | "summary">): boolean {
  const inputMetadata = artifact.input.metadata;
  const summaryMetadata = artifact.summary.metadata;
  const metadata = inputMetadata && typeof inputMetadata === "object" && !Array.isArray(inputMetadata)
    ? inputMetadata as Record<string, unknown>
    : summaryMetadata as unknown as Record<string, unknown>;
  return metadata.disposableSmokeVendor === true
    || artifact.summary.searchText.toLowerCase().includes(WEDDING_VENDOR_SMOKE_TEST_VENDOR_EMAIL)
    || artifact.summary.searchText.toLowerCase().includes("wedding_vendor_smoke_fixture");
}

export function buildWeddingVendorSmokeFixtureCleanupGateState(input: {
  artifacts?: readonly Pick<WeddingGeneratedArtifact, "input" | "summary">[] | null;
}): WeddingVendorSmokeFixtureCleanupGateState {
  const disposableArtifactCount = (input.artifacts ?? []).filter(isWeddingVendorSmokeFixtureArtifact).length;
  return {
    status: disposableArtifactCount > 0 ? "blocked" : "clear",
    disposableArtifactCount,
    blockerLabel: disposableArtifactCount > 0
      ? `Remove ${disposableArtifactCount} disposable smoke fixture artifact${disposableArtifactCount === 1 ? "" : "s"} before running real vendor search.`
      : null,
  };
}

export function saveWeddingVendorSmokeFixtureArtifacts(input: {
  responseWorkspaceId: string;
  metadata?: unknown;
  storage?: Storage;
  userId?: string | null;
}): WeddingVendorSmokeFixtureState {
  const fixture = buildWeddingVendorSmokeFixtureState({
    metadata: {
      ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
        ? input.metadata as Record<string, unknown>
        : {}),
      responseWorkspaceId: input.responseWorkspaceId,
    },
  });
  saveWeddingImportedArtifacts(
    fixture.metadata.responseWorkspaceId,
    fixture.generatedArtifacts,
    input.storage,
    input.userId,
  );
  return fixture;
}

export function removeWeddingVendorSmokeFixtureArtifacts(input: {
  responseWorkspaceId: string;
  storage?: Storage;
  userId?: string | null;
}): WeddingVendorSmokeFixtureCleanupState {
  const storage = input.storage ?? localStorage;
  const artifacts = loadWeddingImportedArtifacts(input.responseWorkspaceId, storage, input.userId);
  const remaining = artifacts.filter((artifact) => !isWeddingVendorSmokeFixtureArtifact(artifact));
  storage.setItem(weddingImportScopedStorageKey(input.responseWorkspaceId, input.userId), JSON.stringify(remaining));
  return {
    removedCount: artifacts.length - remaining.length,
    remainingCount: remaining.length,
    cleanupComplete: remaining.every((artifact) => !isWeddingVendorSmokeFixtureArtifact(artifact)),
  };
}
