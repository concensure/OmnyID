// @locs-version: 2.0
import type { WeddingArtifactInput } from "@/lib/weddingArtifactState";
import {
  normalizeWeddingArtifactSummaries,
  weddingArtifactEvidenceStatus,
  type WeddingArtifactEvidenceStatus,
} from "@/lib/weddingArtifactState";
import {
  buildWeddingExportBundleState,
  type WeddingExportManifestEntry,
  type WeddingExportTargetId,
} from "@/lib/weddingExportState";
import { safeWeddingLabel } from "@/lib/weddingPlanningTemplateState";

export type WeddingArtifactExportPayload = {
  targetId: WeddingExportTargetId;
  filename: string;
  mimeType: string;
  content: string;
  action: "download" | "print";
  disabledReason: string | null;
};

export type WeddingWorkspaceBundleExportPayload = {
  targetId: "markdown" | "html" | "word_doc";
  filename: string;
  mimeType: string;
  content: string;
  action: "download";
  disabledReason: string | null;
  includedArtifactIds: string[];
  excludedArtifactIds: string[];
  warningLabels: string[];
};

export type WeddingWorkspaceBundleDecisionScope = {
  title: string;
  detail: string;
  artifactTitle?: string | null;
  metadataLabels?: readonly string[] | null;
  sourceLabels?: readonly string[] | null;
  sourceUrls?: readonly string[] | null;
  sourceProviderLabels?: readonly string[] | null;
};

export type WeddingWorkspaceBundleDecisionFocusItem = {
  title: string;
  pressureFamily?: string | null;
  sourceSurface?: string | null;
  dueLabel?: string | null;
  evidenceLabels?: readonly string[] | null;
};

export type WeddingWorkspaceBundleDecisionFocus = {
  summaryLabel: string;
  backlogCount?: number | null;
  focusItems?: readonly WeddingWorkspaceBundleDecisionFocusItem[] | null;
  reliefLabels?: readonly string[] | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function usableSourceUrl(value: unknown): string {
  const url = clean(value);
  return /^https?:\/\//i.test(url) ? url : "";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(title: string, body: string): string {
  const escapedLines = body.split(/\r?\n/).map((line) => {
    if (line.startsWith("# ")) return `<h1>${escapeHtml(line.slice(2))}</h1>`;
    if (line.startsWith("## ")) return `<h2>${escapeHtml(line.slice(3))}</h2>`;
    if (line.startsWith("- ")) return `<li>${escapeHtml(line.slice(2))}</li>`;
    if (line.trim() === "") return "";
    return `<p>${escapeHtml(line)}</p>`;
  });
  return [
    "<!doctype html>",
    "<html>",
    "<head>",
    `<meta charset="utf-8"><title>${escapeHtml(title)}</title>`,
    "<style>body{font-family:Georgia,serif;line-height:1.55;margin:40px;max-width:860px}table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px}</style>",
    "</head>",
    "<body>",
    ...escapedLines,
    "</body>",
    "</html>",
  ].join("\n");
}

function fallbackCsv(title: string, body: string): string {
  const safeTitle = title.replace(/"/g, '""');
  const safeBody = body.replace(/"/g, '""');
  return `"title","body"\n"${safeTitle}","${safeBody}"`;
}

function bodyTextByArtifactId(artifacts: readonly WeddingArtifactInput[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const artifact of artifacts) {
    const body = clean(artifact.bodyText);
    if (body) result.set(clean(artifact.id), body);
  }
  return result;
}

function evidenceStatusLabel(status: WeddingArtifactEvidenceStatus): string {
  if (status === "source_linked") return "source-linked";
  if (status === "source_labelled") return "source-labelled";
  return "source-unverified";
}

function evidenceCaveat(status: WeddingArtifactEvidenceStatus): string {
  if (status === "source_linked") return "source URL attached";
  if (status === "source_labelled") return "source label exists, but no source URL is attached";
  return "no source label or source URL is attached";
}

function isImportedPrivateSourceLabel(label: string): boolean {
  return /^wedding_import(?:$|:)/i.test(label)
    || /original upload/i.test(label)
    || /\b(?:csv|tsv|excel|xlsx?|ods) import:/i.test(label)
    || /\bsource:\s*[^,]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(label)
    || /\b[^,\s]+\.(?:csv|tsv|xlsx?|ods)\b/i.test(label);
}

function isImportedPrivateScope(scope: WeddingWorkspaceBundleDecisionScope): boolean {
  const labels = [
    clean(scope.artifactTitle),
    ...(scope.sourceLabels ?? []),
    ...(scope.metadataLabels ?? []),
  ];
  return labels.some((label) => isImportedPrivateSourceLabel(clean(label)));
}

function decisionScopeSourceLabelsForExport(scope: WeddingWorkspaceBundleDecisionScope): string[] {
  const sourceLabels = (scope.sourceLabels ?? []).map(clean).filter(Boolean);
  if (!isImportedPrivateScope(scope)) return sourceLabels.slice(0, 3);
  return ["Imported private planning file"];
}

function decisionScopeArtifactTitleForExport(scope: WeddingWorkspaceBundleDecisionScope): string {
  const title = clean(scope.artifactTitle);
  if (!title) return "";
  return isImportedPrivateScope(scope) ? "Imported private planning file" : title;
}

function isPrivateImportSourceUrl(value: string): boolean {
  return /\b(?:upload|uploads|attachment|attachments|storage|parser|source-file|source_file)\b/i.test(value)
    || /\b[^/?#]+\.(?:csv|tsv|xlsx?|ods)(?:$|[?#/])/i.test(value);
}

function decisionScopeSourceUrlsForExport(scope: WeddingWorkspaceBundleDecisionScope): string[] {
  const urls = (scope.sourceUrls ?? []).map(usableSourceUrl).filter(Boolean);
  if (!isImportedPrivateScope(scope)) return urls.slice(0, 3);
  return urls.filter((url) => !isPrivateImportSourceUrl(url)).slice(0, 3);
}

function markdownBundleContent(input: {
  title: string;
  included: Array<{
    id: string;
    title: string;
    category: string;
    body: string | null;
    evidenceStatus: WeddingArtifactEvidenceStatus;
    sourceMarkerCount: number;
  }>;
  excluded: Array<{ title: string; reason: string }>;
  warnings: readonly string[];
  decisionScopes: readonly WeddingWorkspaceBundleDecisionScope[];
  decisionFocus?: WeddingWorkspaceBundleDecisionFocus | null;
}): string {
  const sourceLinkedCount = input.included.filter((artifact) => artifact.evidenceStatus === "source_linked").length;
  const sourceLabelledCount = input.included.filter((artifact) => artifact.evidenceStatus === "source_labelled").length;
  const sourceUnverifiedCount = input.included.filter((artifact) => artifact.evidenceStatus === "source_unverified").length;
  return [
    `# ${input.title}`,
    "",
    "Generated as a wedding planning bundle. Verify live availability, prices, legal details, and vendor terms before acting.",
    "",
    "## Included files",
    "",
    ...input.included.map((artifact) => `- ${artifact.title} (${artifact.category})`),
    input.included.length === 0 ? "- No files included." : null,
    "",
    "## Selected choice",
    "",
    ...input.decisionScopes.map((scope) => {
      const artifactTitle = decisionScopeArtifactTitleForExport(scope);
      const source = artifactTitle ? ` from ${artifactTitle}` : "";
      const labels = (scope.metadataLabels ?? []).map(clean).filter(Boolean).slice(0, 3);
      const sourceProviders = (scope.sourceProviderLabels ?? []).map(clean).filter(Boolean).slice(0, 3);
      const sourceLabels = decisionScopeSourceLabelsForExport(scope);
      const sourceUrls = decisionScopeSourceUrlsForExport(scope);
      const labelSuffix = labels.length > 0 ? ` (${labels.join("; ")})` : "";
      const evidenceSuffix = [
        sourceProviders.length > 0 ? `providers: ${sourceProviders.join(", ")}` : null,
        sourceLabels.length > 0 ? `sources: ${sourceLabels.join(", ")}` : null,
        sourceUrls.length > 0 ? `${sourceUrls.length} source URL${sourceUrls.length === 1 ? "" : "s"}` : null,
      ].filter(Boolean).join("; ");
      return `- ${scope.title}${source}: ${scope.detail}${labelSuffix}${evidenceSuffix ? ` [${evidenceSuffix}]` : ""}`;
    }),
    input.decisionScopes.length === 0 ? "- No selected shortlist decision is saved in this bundle." : null,
    "",
    "Selected-scope note: follow-up reports should prefer selected rows first while keeping unticked alternatives available in the source files.",
    "",
    "## Three things worth your attention",
    "",
    input.decisionFocus?.summaryLabel ? `- ${input.decisionFocus.summaryLabel}` : "- No decision-focus summary is available.",
    typeof input.decisionFocus?.backlogCount === "number" && input.decisionFocus.backlogCount > 0
      ? `- Backlog context: ${Math.floor(input.decisionFocus.backlogCount)} lower-priority decision${Math.floor(input.decisionFocus.backlogCount) === 1 ? "" : "s"} can wait.`
      : null,
    ...(input.decisionFocus?.focusItems ?? []).map((item) => {
      const labels = (item.evidenceLabels ?? []).map(clean).filter(Boolean).slice(0, 3);
      const due = clean(item.dueLabel);
      const surface = clean(item.sourceSurface)?.replace(/_/g, " ");
      const pressure = clean(item.pressureFamily)?.replace(/_/g, " ");
      const detail = [
        pressure ? `pressure: ${pressure}` : null,
        surface ? `surface: ${surface}` : null,
        due ? `due: ${due}` : null,
        labels.length > 0 ? `evidence: ${labels.join("; ")}` : null,
      ].filter(Boolean).join("; ");
      return `- ${item.title}${detail ? ` (${detail})` : ""}`;
    }),
    ...(input.decisionFocus?.reliefLabels ?? []).map(clean).filter(Boolean).slice(0, 3).map((label) => `- ${label}`),
    "",
    "Attention note: use these items to reduce planning overwhelm. Do not treat backlog items as cancelled unless the user explicitly archives them.",
    "",
    "## Where this came from",
    "",
    `- Source-linked files: ${sourceLinkedCount}`,
    `- Source-labelled files: ${sourceLabelledCount}`,
    `- Source-unverified files: ${sourceUnverifiedCount}`,
    "",
    ...input.included.map((artifact) => (
      `- ${artifact.title}: ${evidenceStatusLabel(artifact.evidenceStatus)}; ${artifact.sourceMarkerCount} source${artifact.sourceMarkerCount === 1 ? "" : "s"} listed; ${evidenceCaveat(artifact.evidenceStatus)}.`
    )),
    input.included.length === 0 ? "- No included files to summarize." : null,
    "",
    "Evidence note: source status is a planning aid, not a guarantee. Verify live availability, prices, legal details, map routes, registry details, and vendor terms before acting.",
    "",
    "## Excluded or sensitive files",
    "",
    ...input.excluded.map((artifact) => `- ${artifact.title}: ${artifact.reason}`),
    input.excluded.length === 0 ? "- None." : null,
    "",
    "## Warnings",
    "",
    ...input.warnings.map((warning) => `- ${warning}`),
    input.warnings.length === 0 ? "- No private-file warnings for the included bundle." : null,
    "",
    ...input.included.flatMap((artifact) => [
      `## ${artifact.title}`,
      "",
      artifact.body || "This file's full text is not loaded yet; only its summary details were included.",
      "",
    ]),
  ].filter((line): line is string => line !== null).join("\n");
}

export function buildWeddingArtifactExportPayload(input: {
  title: string;
  bodyText?: string | null;
  entry: WeddingExportManifestEntry;
}): WeddingArtifactExportPayload {
  const body = clean(input.bodyText);
  if (!input.entry.enabled) {
    return {
      targetId: input.entry.id,
      filename: input.entry.filename,
      mimeType: input.entry.mimeType,
      content: "",
      action: "download",
      disabledReason: input.entry.detail,
    };
  }
  if (!body) {
    return {
      targetId: input.entry.id,
      filename: input.entry.filename,
      mimeType: input.entry.mimeType,
      content: "",
      action: input.entry.action === "print" ? "print" : "download",
      disabledReason: "This planning file is not loaded yet.",
    };
  }
  if (input.entry.action === "print") {
    return {
      targetId: input.entry.id,
      filename: input.entry.filename,
      mimeType: input.entry.mimeType,
      content: markdownToHtml(input.title, body),
      action: "print",
      disabledReason: null,
    };
  }
  const content = input.entry.id === "html" || input.entry.id === "word_doc"
    ? markdownToHtml(input.title, body)
    : input.entry.id === "csv"
      ? body.includes(",") ? body : fallbackCsv(input.title, body)
      : body;
  return {
    targetId: input.entry.id,
    filename: input.entry.filename,
    mimeType: input.entry.mimeType,
    content,
    action: "download",
    disabledReason: null,
  };
}

export function buildWeddingWorkspaceBundleExportPayload(input: {
  title?: string | null;
  artifacts: readonly WeddingArtifactInput[];
  selectedArtifactIds?: readonly string[] | null;
  includeSensitive?: boolean | null;
  targetId?: "markdown" | "html" | "word_doc" | null;
  decisionScopes?: readonly WeddingWorkspaceBundleDecisionScope[] | null;
  decisionFocus?: WeddingWorkspaceBundleDecisionFocus | null;
}): WeddingWorkspaceBundleExportPayload {
  const summaries = normalizeWeddingArtifactSummaries(input.artifacts);
  const bundle = buildWeddingExportBundleState({
    title: input.title,
    artifacts: summaries,
    selectedArtifactIds: input.selectedArtifactIds,
    includeSensitive: input.includeSensitive,
  });
  const targetId = input.targetId === "html" || input.targetId === "word_doc" ? input.targetId : "markdown";
  const extension = targetId === "html" ? ".html" : targetId === "word_doc" ? ".doc" : ".md";
  const mimeType = targetId === "html"
    ? "text/html;charset=utf-8"
    : targetId === "word_doc" ? "application/msword;charset=utf-8" : "text/markdown;charset=utf-8";
  const filename = `${safeWeddingLabel(bundle.title, "wedding-planning-packet")}${extension}`;
  const bodies = bodyTextByArtifactId(input.artifacts);
  const included = bundle.includedArtifacts.map((artifact) => ({
    id: artifact.id,
    title: artifact.title,
    category: artifact.category,
    body: bodies.get(artifact.id) ?? null,
    evidenceStatus: weddingArtifactEvidenceStatus(artifact),
    sourceMarkerCount: artifact.sourceLabels.length + artifact.sourceLinks.length,
  }));
  const excluded = bundle.excludedArtifacts.map((artifact) => ({
    title: artifact.title,
    reason: "Excluded by sensitivity filtering or explicit selection.",
  }));
  const markdown = markdownBundleContent({
    title: bundle.title,
    included,
    excluded,
    warnings: bundle.warningLabels,
    decisionScopes: input.decisionScopes ?? [],
    decisionFocus: input.decisionFocus ?? null,
  });

  return {
    targetId,
    filename,
    mimeType,
    content: targetId === "html" || targetId === "word_doc" ? markdownToHtml(bundle.title, markdown) : markdown,
    action: "download",
    disabledReason: bundle.canExportNow ? null : "No exportable wedding documents are selected.",
    includedArtifactIds: bundle.selectedArtifactIds,
    excludedArtifactIds: bundle.excludedArtifacts.map((artifact) => artifact.id),
    warningLabels: bundle.warningLabels,
  };
}
