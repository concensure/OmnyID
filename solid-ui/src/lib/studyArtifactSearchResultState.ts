// @locs-version: 1.0
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";
import {
  buildStudyArtifactAvailableActions,
  type StudyArtifactSearchResultAction,
} from "@/lib/studyArtifactExportActionState";
import {
  buildStudyArtifactSearchIndex,
  searchStudyArtifacts,
  type StudyArtifactSearchIndexEntry,
} from "@/lib/studyArtifactSearchIndexState";
import {
  buildStudyAcademicScopeLabels,
} from "@/lib/studyAcademicScopeState";

export type StudyArtifactSearchResult = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  badges: string[];
  matchedFields: string[];
  actions: StudyArtifactSearchResultAction[];
  artifact: StudyReportArtifact;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ");
}

function exportBadge(format: string, state: "ready" | "planned"): string {
  if (format === "native_docx_planned") return "native docx planned";
  if (format === "image_export_planned") return "image export planned";
  return `${humanize(format)} ${state}`;
}

function uniqueStrings(values: readonly (string | null | undefined)[], limit = 10): string[] {
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

function sentenceSnippet(markdown: string): string {
  const firstUsefulLine = markdown
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").replace(/^\s*[-*]\s+/, "").trim())
    .find((line) => line.length > 0);
  if (!firstUsefulLine) return "Saved study output with reusable academic context.";
  return firstUsefulLine.length > 150 ? `${firstUsefulLine.slice(0, 147).trimEnd()}...` : firstUsefulLine;
}

function matchedFieldsForEntry(entry: StudyArtifactSearchIndexEntry, query: string): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];
  const candidates = [
    ["title", entry.title],
    ["filename", entry.filename],
    ["report", entry.reportLabel ?? entry.reportKind],
    ["course", entry.courseTag],
    ["chapter", entry.chapterTag],
    ["unit", entry.unitTag],
    ["module", entry.moduleLabel],
    ["deadline", [entry.dueLabel, entry.deadlineId].filter(Boolean).join(" ")],
    ["provider", entry.providerId],
    ["source", entry.sourceLabels.join(" ")],
    ["answer policy", entry.answersIncluded === true ? "answers included" : entry.answersIncluded === false ? "answers withheld" : null],
    ["structured rows", entry.structuredItemCount > 0 ? `${entry.structuredItemCount} structured rows` : null],
    ["exports", [...entry.readyExportFormats, ...entry.plannedExportFormats, entry.exportCapabilitySummary].join(" ")],
    ["repair", [
      ...entry.metadataLabels.filter((label) =>
        /^Medical .* repair$/i.test(label) || /^score band:/i.test(label) || /^relationship:/i.test(label)
      ),
      ...entry.tokens.filter((token) =>
        token.includes("repair") || token.startsWith("score_band:") || token.startsWith("relationship:")
      ),
    ].join(" ")],
    ["quality", [
      ...entry.metadataLabels.filter((label) =>
        /^Medical .*upgrade$/i.test(label) || /^Medical review-load control$/i.test(label) || /shallow first-order signal/i.test(label)
      ),
      ...entry.tokens.filter((token) =>
        token.includes("quality_action") || token.includes("first_order") || token.includes("review") || token.includes("overload")
      ),
    ].join(" ")],
    ["workflow", [
      ...entry.metadataLabels.filter((label) =>
        /^Medical graph-gap cloze deck$/i.test(label) || /^Medical vignette block$/i.test(label)
      ),
      ...entry.tokens.filter((token) =>
        token.includes("medical_gap_cloze_deck") || token.includes("medical_vignette_block") || token.includes("graph-gap") || token.includes("vignette")
      ),
    ].join(" ")],
    ["topology", [
      ...entry.metadataLabels.filter((label) =>
        /^Medical topology coverage$/i.test(label)
        || /^(pathophys|pharm|presentation|investigation|management|complication|contraindication)$/i.test(label)
        || /^(system|condition|pathophys|pharm|presentation|investigation|management|complication|contraindication):/i.test(label)
        || /^Needs source locator$/i.test(label)
        || /^Source-only topology gap$/i.test(label)
        || /^Review overload topology gap$/i.test(label)
        || /^\d+ source locators?$/i.test(label)
      ),
      ...entry.tokens.filter((token) =>
        token.includes("topology")
        || token.includes("coverage")
        || token.includes("locator")
        || token.includes("source-only")
        || token.includes("overload")
        || /^(system|condition|pathophys|pharm|presentation|investigation|management|complication|contraindication):/.test(token)
      ),
    ].join(" ")],
    ["reference", [
      ...entry.metadataLabels.filter((label) =>
        /^Medical trusted grounding$/i.test(label)
        || /^Trusted reference supported$/i.test(label)
        || /^Student-source primary$/i.test(label)
        || /^No internal-knowledge citations$/i.test(label)
        || /^Clinical dataset restricted$/i.test(label)
        || /^Detail zoom:/i.test(label)
      ),
      ...entry.tokens.filter((token) =>
        token.includes("trusted")
        || token.includes("detail_zoom")
        || token.includes("student-source")
        || token.includes("internal-knowledge")
        || token.includes("clinical")
      ),
    ].join(" ")],
    ["body", entry.artifact.markdown],
  ] as const;
  return candidates
    .filter(([, value]) => {
      const normalized = clean(value).toLowerCase();
      return normalized && terms.some((term) => normalized.includes(term));
    })
    .map(([field]) => field);
}

function resultForEntry(entry: StudyArtifactSearchIndexEntry, query = ""): StudyArtifactSearchResult {
  const scope = buildStudyAcademicScopeLabels(entry, {
    includeProviderId: true,
    limit: 6,
  }).join(" - ");
  const report = entry.reportLabel ?? "saved study output";
  const subtitle = scope ? `${report} - ${scope}` : report;
  const exportBadges = [
    ...entry.readyExportFormats.map((format) => exportBadge(format, "ready")),
    ...entry.plannedExportFormats.map((format) => exportBadge(format, "planned")),
  ];
  const answerBadge = entry.answersIncluded === true
    ? "answers included"
    : entry.answersIncluded === false ? "answers withheld" : null;
  const repairBadges = entry.metadataLabels.filter((label) =>
    /^Medical .* repair$/i.test(label) || /^score band:/i.test(label) || /^relationship:/i.test(label)
  );
  const qualityBadges = entry.metadataLabels.filter((label) =>
    /^Medical .*upgrade$/i.test(label) || /^Medical review-load control$/i.test(label) || /shallow first-order signal/i.test(label)
  );
  const workflowBadges = entry.metadataLabels.filter((label) =>
    /^Medical graph-gap cloze deck$/i.test(label) || /^Medical vignette block$/i.test(label)
  );
  const topologyGapBadges = entry.metadataLabels.filter((label) =>
    /^Needs source locator$/i.test(label)
    || /^Source-only topology gap$/i.test(label)
    || /^Review overload topology gap$/i.test(label)
  );
  const topologyBadges = entry.metadataLabels.filter((label) =>
    /^Medical topology coverage$/i.test(label)
    || /^(pathophys|pharm|presentation|investigation|management|complication|contraindication)$/i.test(label)
    || /^(system|condition|pathophys|pharm|presentation|investigation|management|complication|contraindication):/i.test(label)
    || /^\d+ source locators?$/i.test(label)
  );
  const referenceBadges = entry.metadataLabels.filter((label) =>
    /^Medical trusted grounding$/i.test(label)
    || /^Trusted reference supported$/i.test(label)
    || /^Student-source primary$/i.test(label)
    || /^No internal-knowledge citations$/i.test(label)
    || /^Clinical dataset restricted$/i.test(label)
    || /^Detail zoom:/i.test(label)
  );

  return {
    id: entry.id,
    title: entry.title,
    subtitle,
    description: sentenceSnippet(entry.artifact.markdown),
    badges: uniqueStrings([
      entry.reportLabel,
      ...referenceBadges.slice(0, 6),
      ...buildStudyAcademicScopeLabels(entry, {
        includeDeadlineId: true,
        includeProviderId: true,
        limit: 7,
      }),
      answerBadge,
      entry.structuredItemCount > 0 ? `${entry.structuredItemCount} structured rows` : null,
      ...repairBadges.slice(0, 3),
      ...qualityBadges.slice(0, 3),
      ...workflowBadges.slice(0, 2),
      ...topologyGapBadges.slice(0, 2),
      ...topologyBadges.slice(0, 4),
      ...entry.sourceLabels.slice(0, 2),
      entry.exportCapabilitySummary,
      ...exportBadges,
    ], 18),
    matchedFields: uniqueStrings(matchedFieldsForEntry(entry, query), 8),
    actions: buildStudyArtifactAvailableActions(entry.artifact),
    artifact: entry.artifact,
  };
}

export function buildStudyArtifactSearchResults(
  artifacts: readonly StudyReportArtifact[],
  query?: string | null,
  limit = 8,
): StudyArtifactSearchResult[] {
  const normalizedLimit = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 8;
  const matched = searchStudyArtifacts(artifacts, query);
  const entriesById = new Map(buildStudyArtifactSearchIndex(matched).map((entry) => [entry.id, entry]));
  return matched
    .flatMap((artifact): StudyArtifactSearchResult[] => {
      const entry = entriesById.get(artifact.id);
      return entry ? [resultForEntry(entry, clean(query))] : [];
    })
    .slice(0, normalizedLimit);
}
