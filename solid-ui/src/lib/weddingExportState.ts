// @locs-version: 2.0
import type {
  WeddingArtifactSummary,
  WeddingExportTarget as WeddingArtifactExportTarget,
} from "@/lib/weddingArtifactState";
import { safeWeddingLabel, type WeddingArtifactKind } from "@/lib/weddingPlanningTemplateState";

export type WeddingExportAvailability = "ready" | "browser_print" | "planned";
export type WeddingExportAction = "download" | "print" | "planned";
export type WeddingExportTargetId = "markdown" | "html" | "pdf" | "word_doc" | "docx" | "jpg" | "png" | "csv" | "bundle";

export type WeddingExportTarget = {
  id: WeddingExportTargetId;
  label: string;
  extension: string;
  mimeType: string;
  availability: WeddingExportAvailability;
  detail: string;
};

export type WeddingExportManifestEntry = WeddingExportTarget & {
  filename: string;
  enabled: boolean;
  action: WeddingExportAction;
};

export type WeddingArtifactExportManifest = {
  artifactId: string;
  title: string;
  baseFilename: string;
  privacyLabel: string;
  metadataLabels: string[];
  warningLabels: string[];
  entries: WeddingExportManifestEntry[];
  readyEntries: WeddingExportManifestEntry[];
  plannedEntries: WeddingExportManifestEntry[];
};

export type WeddingExportBundleState = {
  title: string;
  artifactCount: number;
  selectedArtifactIds: string[];
  includedArtifacts: WeddingArtifactSummary[];
  excludedArtifacts: WeddingArtifactSummary[];
  warningLabels: string[];
  readyDownloadLabels: string[];
  plannedConversionLabels: string[];
  bundleFilename: string;
  canExportNow: boolean;
};

export type WeddingPacketPlannedConversion = {
  id: "zip" | "docx" | "jpg" | "png";
  label: string;
  filename: string;
  blockedReason: string;
  requiresWorker: string;
};

export type WeddingPacketExportCapabilityState = {
  readyFormats: Array<{ id: "markdown" | "html" | "word_doc"; label: string; detail: string }>;
  plannedConversions: WeddingPacketPlannedConversion[];
  summaryLabel: string;
};

const SENSITIVE_ARTIFACT_WARNINGS: Partial<Record<WeddingArtifactKind, string>> = {
  budget_sheet: "Budget exports can reveal private ceilings, deposits, and family contribution details.",
  guest_list: "Guest list exports can include private contact, RSVP, family, or accessibility details.",
  email_draft: "Email draft exports can reveal negotiation position, contact details, and unsent wording.",
  legal: "Legal exports can include ceremony, notice, contract, or identity-sensitive planning details.",
  registry: "Registry exports can reveal gift preferences, household details, and price bands.",
  decision_log: "Decision log exports can include private family tradeoffs and unresolved disagreements.",
};

function isWeddingImportArtifact(artifact: WeddingArtifactSummary): boolean {
  return artifact.id.startsWith("wedding_import:")
    || artifact.metadata.supertags.some((tag) => /^wedding_import(?:$|:)/i.test(tag));
}

function targetDefinition(id: WeddingExportTargetId): WeddingExportTarget {
  const targets: Record<WeddingExportTargetId, WeddingExportTarget> = {
    markdown: {
      id,
      label: "Markdown",
      extension: ".md",
      mimeType: "text/markdown;charset=utf-8",
      availability: "ready",
      detail: "Ready now for portable planning notes.",
    },
    html: {
      id,
      label: "HTML",
      extension: ".html",
      mimeType: "text/html;charset=utf-8",
      availability: "ready",
      detail: "Ready now as a printable browser document.",
    },
    pdf: {
      id,
      label: "PDF",
      extension: ".pdf",
      mimeType: "application/pdf",
      availability: "browser_print",
      detail: "Available through the browser print dialog using Save as PDF.",
    },
    word_doc: {
      id,
      label: "Word (.doc)",
      extension: ".doc",
      mimeType: "application/msword;charset=utf-8",
      availability: "ready",
      detail: "Ready now as Word-openable HTML saved with a .doc extension.",
    },
    docx: {
      id,
      label: "Word",
      extension: ".docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      availability: "planned",
      detail: "Coming soon as a one-click Word download.",
    },
    jpg: {
      id,
      label: "JPG",
      extension: ".jpg",
      mimeType: "image/jpeg",
      availability: "planned",
      detail: "Requires image rendering of the wedding planning surface.",
    },
    png: {
      id,
      label: "PNG",
      extension: ".png",
      mimeType: "image/png",
      availability: "planned",
      detail: "Requires image rendering of the wedding planning surface.",
    },
    csv: {
      id,
      label: "CSV",
      extension: ".csv",
      mimeType: "text/csv;charset=utf-8",
      availability: "ready",
      detail: "Ready now for tables such as vendors, budgets, registries, and guest lists.",
    },
    bundle: {
      id,
      label: "Bundle",
      extension: ".zip",
      mimeType: "application/zip",
      availability: "planned",
      detail: "Coming soon as one zipped planning folder.",
    },
  };
  return targets[id];
}

function targetIdsForArtifactTarget(target: WeddingArtifactExportTarget): WeddingExportTargetId[] {
  if (target === "browser_pdf") return ["pdf"];
  if (target === "image_planned") return ["jpg", "png"];
  if (target === "bundle_planned") return ["bundle"];
  return [target];
}

function uniqueTargets(targets: readonly WeddingArtifactExportTarget[]): WeddingExportTarget[] {
  const seen = new Set<WeddingExportTargetId>();
  const result: WeddingExportTarget[] = [];
  for (const target of targets) {
    for (const id of targetIdsForArtifactTarget(target)) {
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(targetDefinition(id));
    }
  }
  return result;
}

function filenameFor(title: string, target: WeddingExportTarget): string {
  const slug = safeWeddingLabel(title, "wedding-artifact").replace(/:/g, "-").slice(0, 72) || "wedding-artifact";
  return `${slug}${target.extension}`;
}

function entryFor(title: string, target: WeddingExportTarget): WeddingExportManifestEntry {
  return {
    ...target,
    filename: filenameFor(title, target),
    enabled: target.availability !== "planned",
    action: target.availability === "planned"
      ? "planned"
      : target.availability === "browser_print" ? "print" : "download",
  };
}

function isImportedPrivateSourceLabel(value: string): boolean {
  return /^wedding_import(?:$|:)/i.test(value)
    || /original upload/i.test(value)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(value)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(value);
}

function sourceLabelsForExportManifest(artifact: WeddingArtifactSummary): string[] {
  const labels = artifact.sourceLabels.slice(0, 3);
  if (!isWeddingImportArtifact(artifact) && !labels.some(isImportedPrivateSourceLabel)) return labels;
  return artifact.sourceLabels.length > 0 ? ["Imported private planning file"] : [];
}

function titleForExportFilename(artifact: WeddingArtifactSummary): string {
  return isWeddingImportArtifact(artifact) ? "Imported private planning file" : artifact.title;
}

function approvalStateLabel(state: string): string {
  if (state === "approved") return "Approved";
  if (state === "pending_user_approval") return "Needs approval";
  if (state === "rejected") return "Not approved";
  if (state === "draft") return "Draft";
  return state.replace(/_/g, " ");
}

function metadataLabelsFor(artifact: WeddingArtifactSummary): string[] {
  return [
    artifact.category,
    artifact.kind.replace(/_/g, " "),
    artifact.metadata.privacyScope.replace(/_/g, " "),
    approvalStateLabel(artifact.approvalState),
    ...artifact.vendorLabels.slice(0, 3),
    ...artifact.locationLabels.slice(0, 3),
    ...sourceLabelsForExportManifest(artifact),
  ].filter(Boolean);
}

export function weddingArtifactWarningLabels(artifact: WeddingArtifactSummary): string[] {
  return [
    SENSITIVE_ARTIFACT_WARNINGS[artifact.kind] ?? null,
    isWeddingImportArtifact(artifact)
      ? "Imported wedding files are private source evidence; include them only after explicit export review."
      : null,
    artifact.metadata.privacyScope !== "private"
      ? `Export is currently scoped as ${artifact.metadata.privacyScope.replace(/_/g, " ")}.`
      : null,
    artifact.approvalState === "pending_user_approval"
      ? "This document still needs your approval."
      : null,
  ].filter((value): value is string => Boolean(value));
}

export function buildWeddingArtifactExportManifest(artifact: WeddingArtifactSummary): WeddingArtifactExportManifest {
  const targets = uniqueTargets(artifact.exportTargets);
  const exportFilenameTitle = titleForExportFilename(artifact);
  const entries = targets.map((target) => entryFor(exportFilenameTitle, target));
  const readyEntries = entries.filter((entry) => entry.enabled);
  const plannedEntries = entries.filter((entry) => !entry.enabled);

  return {
    artifactId: artifact.id,
    title: exportFilenameTitle,
    baseFilename: filenameFor(exportFilenameTitle, targetDefinition("markdown")),
    privacyLabel: artifact.metadata.privacyScope.replace(/_/g, " "),
    metadataLabels: metadataLabelsFor(artifact),
    warningLabels: weddingArtifactWarningLabels(artifact),
    entries,
    readyEntries,
    plannedEntries,
  };
}

export function buildWeddingExportBundleState(input: {
  title?: string | null;
  artifacts: readonly WeddingArtifactSummary[];
  selectedArtifactIds?: readonly string[] | null;
  includeSensitive?: boolean | null;
}): WeddingExportBundleState {
  const selected = new Set(input.selectedArtifactIds ?? []);
  const hasExplicitSelection = selected.size > 0;
  const includeSensitive = Boolean(input.includeSensitive);
  const includedArtifacts = input.artifacts.filter((artifact) => {
    if (hasExplicitSelection && !selected.has(artifact.id)) return false;
    return includeSensitive || weddingArtifactWarningLabels(artifact).length === 0;
  });
  const excludedArtifacts = input.artifacts.filter((artifact) => !includedArtifacts.some((included) => included.id === artifact.id));
  const readyLabels = [...new Set(includedArtifacts.flatMap((artifact) => (
    buildWeddingArtifactExportManifest(artifact).readyEntries.map((entry) => entry.label)
  )))];
  const plannedLabels = [...new Set([
    "Bundle",
    ...includedArtifacts.flatMap((artifact) => (
      buildWeddingArtifactExportManifest(artifact).plannedEntries.map((entry) => entry.label)
    )),
  ])];
  const warningSource = includeSensitive ? includedArtifacts : excludedArtifacts;
  const warningLabels = [
    ...new Set(warningSource.flatMap(weddingArtifactWarningLabels)),
  ];
  const title = input.title?.trim() || "Wedding planning bundle";

  return {
    title,
    artifactCount: input.artifacts.length,
    selectedArtifactIds: includedArtifacts.map((artifact) => artifact.id),
    includedArtifacts,
    excludedArtifacts,
    warningLabels,
    readyDownloadLabels: readyLabels,
    plannedConversionLabels: plannedLabels,
    bundleFilename: `${safeWeddingLabel(title, "wedding-planning-bundle")}.zip`,
    canExportNow: includedArtifacts.length > 0 && readyLabels.length > 0,
  };
}

export function buildWeddingPacketExportCapabilityState(input: {
  title?: string | null;
} = {}): WeddingPacketExportCapabilityState {
  const base = safeWeddingLabel(input.title?.trim() || "wedding-planning-bundle", "wedding-planning-bundle");
  const plannedConversions: WeddingPacketPlannedConversion[] = [
    {
      id: "zip",
      label: "ZIP bundle",
      filename: `${base}.zip`,
      blockedReason: "One-click ZIP download is not available yet.",
      requiresWorker: "zip_packet_worker",
    },
    {
      id: "docx",
      label: "Word bundle",
      filename: `${base}.docx`,
      blockedReason: "One-click Word download is not available yet.",
      requiresWorker: "docx_packet_worker",
    },
    {
      id: "jpg",
      label: "JPG image",
      filename: `${base}.jpg`,
      blockedReason: "Image download is not available yet.",
      requiresWorker: "image_packet_worker",
    },
    {
      id: "png",
      label: "PNG image",
      filename: `${base}.png`,
      blockedReason: "Image download is not available yet.",
      requiresWorker: "image_packet_worker",
    },
  ];
  return {
    readyFormats: [
      { id: "markdown", label: "Text file", detail: "Ready now as a simple text file." },
      { id: "html", label: "Printable HTML / Save as PDF", detail: "Ready now for browser printing or Save as PDF." },
      { id: "word_doc", label: "Word document", detail: "Ready now as a file you can open in Microsoft Word." },
    ],
    plannedConversions,
    summaryLabel: `${plannedConversions.length} extra download format${plannedConversions.length === 1 ? "" : "s"} will be added after final export setup.`,
  };
}
