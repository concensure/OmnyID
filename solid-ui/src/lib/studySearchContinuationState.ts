// @locs-version: 1.0
import type { AttachmentGroundingEvidence } from "@/lib/attachmentGroundingEvidence";
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import { reportSourceRequirementsForKind } from "@/lib/reportGeneratorState";
import { inferReportKindFromText, inferReportOutputFormatFromText, reportLabelForKind } from "@/lib/reportSeedMetadata";
import type { ReportKind } from "@/lib/reportGeneratorState";
import type { StudySearchSection } from "@/lib/studySearchResultState";
import { buildStudyAdjacentSourceRecommendation } from "@/lib/studyAdjacentSourceRecommendation";

function clean(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

function uniqueDescriptorValue(
  evidence: AttachmentGroundingEvidence,
  selector: (item: AttachmentGroundingEvidence["sourceDescriptors"][number]) => string | null,
): string | null {
  const values = evidence.sourceDescriptors
    .map(selector)
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  const unique = [...new Set(values)];
  return unique.length === 1 ? unique[0] ?? null : null;
}

function descriptorStringList(
  evidence: AttachmentGroundingEvidence,
  selector: (item: AttachmentGroundingEvidence["sourceDescriptors"][number]) => readonly string[] | null | undefined,
): string[] {
  const values = evidence.sourceDescriptors
    .flatMap((item) => selector(item) ?? [])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  return [...new Set(values)];
}

function focusBadgesForEvidence(evidence: AttachmentGroundingEvidence): string[] {
  const graphGroupKey = uniqueDescriptorValue(evidence, (item) => item.knowledgeGraphGroupKey ?? null);
  const graphTags = descriptorStringList(evidence, (item) => item.knowledgeGraphLinkTags).slice(0, 3);
  const badges = [
    uniqueDescriptorValue(evidence, (item) => item.academicKind ? humanize(item.academicKind) : null),
    uniqueDescriptorValue(evidence, (item) => item.courseTag),
    uniqueDescriptorValue(evidence, (item) => item.unitTag ?? null),
    uniqueDescriptorValue(evidence, (item) => item.chapterTag ?? null),
    uniqueDescriptorValue(evidence, (item) => item.weekTag),
    uniqueDescriptorValue(evidence, (item) => item.lectureTag),
    graphGroupKey,
    ...graphTags,
    uniqueDescriptorValue(evidence, (item) => item.zettelkastenStage ? `stage ${humanize(item.zettelkastenStage)}` : null),
    evidence.sourceCount > 1 ? `${evidence.sourceCount} sources` : "1 source",
  ].filter((value): value is string => Boolean(value));
  return [...new Set(badges)];
}

function reportFocusBadges(query: string | null): string[] {
  const kind = inferReportKindFromText(query);
  if (!kind) return [];
  const sourceNeeds = reportSourceRequirementsForKind(kind)
    .map((source) => `source_need:${source.label.toLowerCase()}`)
    .slice(0, 2);
  const outputFormat = inferReportOutputFormatFromText(query);
  return [`report_kind:${kind}`, ...(outputFormat ? [`output_format:${outputFormat}`] : []), ...sourceNeeds];
}

function reportCopy(kind: ReportKind | null): {
  label: string | null;
  continueLabel: string;
  rerunLabel: string;
  description: string;
  valuePromise: string;
} {
  if (!kind) {
    return {
      label: null,
      continueLabel: "",
      rerunLabel: "",
      description: "",
      valuePromise: "",
    };
  }
  const label = reportLabelForKind(kind);
  return {
    label,
    continueLabel: `Continue this ${label}`,
    rerunLabel: `Rerun this ${label} with memory`,
    description: `Keep the ${label} tied to the same retained sources, supertags, graph links, and next action instead of starting a generic study chat.`,
    valuePromise: `Carry the ${label} into the next action so the student can strengthen the same report without re-explaining the material.`,
  };
}

function contextLabel(evidence: AttachmentGroundingEvidence): string {
  const academicKind = uniqueDescriptorValue(evidence, (item) => item.academicKind ? humanize(item.academicKind) : null);
  const courseTag = uniqueDescriptorValue(evidence, (item) => item.courseTag);
  const unitTag = uniqueDescriptorValue(evidence, (item) => item.unitTag ?? null);
  const chapterTag = uniqueDescriptorValue(evidence, (item) => item.chapterTag ?? null);
  const weekTag = uniqueDescriptorValue(evidence, (item) => item.weekTag);
  const lectureTag = uniqueDescriptorValue(evidence, (item) => item.lectureTag);
  const graphGroupKey = uniqueDescriptorValue(evidence, (item) => item.knowledgeGraphGroupKey ?? null);
  const graphTag = descriptorStringList(evidence, (item) => item.knowledgeGraphLinkTags)[0] ?? null;
  const parts = [academicKind, courseTag, unitTag, chapterTag, weekTag, lectureTag, graphGroupKey, graphTag].filter((value): value is string => Boolean(value));
  if (parts.length === 0) {
    return evidence.sourceCount > 1 ? "my uploaded study sources" : "my uploaded study source";
  }
  return `${evidence.sourceCount > 1 ? "my uploaded study sources" : "my uploaded study source"} for ${parts.join(", ")}`;
}

function firstSectionItem(
  sections: readonly StudySearchSection[] | undefined,
  id: StudySearchSection["id"],
): string | null {
  const item = sections?.find((section) => section.id === id)?.items[0]?.trim();
  return item ? item : null;
}

function trimSentence(value: string | null, maxLength = 180): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

function followUpFocusSuffix(sections: readonly StudySearchSection[] | undefined): string {
  const concept = trimSentence(firstSectionItem(sections, "concepts"));
  const risk = trimSentence(firstSectionItem(sections, "risks"));
  const action = trimSentence(firstSectionItem(sections, "actions"));
  const overlap = trimSentence(firstSectionItem(sections, "overlaps"));
  const clauses = [
    concept ? `Keep this key concept central: ${concept}` : null,
    overlap ? `Use this overlap as context: ${overlap}` : null,
    risk ? `Address this likely weak spot: ${risk}` : null,
    action ? `Turn this into the next concrete study step: ${action}` : null,
  ].filter((value): value is string => Boolean(value));
  return clauses.length > 0 ? ` ${clauses.join(" ")}` : "";
}

function graphContinuationSuffix(evidence: AttachmentGroundingEvidence): string {
  const groupKey = uniqueDescriptorValue(evidence, (item) => item.knowledgeGraphGroupKey ?? null);
  const linkTags = descriptorStringList(evidence, (item) => item.knowledgeGraphLinkTags).slice(0, 5);
  const nextAction = uniqueDescriptorValue(evidence, (item) => item.zettelkastenNextAction ?? null);
  const clauses = [
    groupKey ? `Use this graph anchor: ${groupKey}.` : null,
    linkTags.length > 0 ? `Prefer these supertag links when finding related material: ${linkTags.join(", ")}.` : null,
    nextAction ? `Apply this next note move: ${nextAction}` : null,
  ].filter((value): value is string => Boolean(value));
  return clauses.length > 0 ? ` ${clauses.join(" ")}` : "";
}

export function buildStudySearchContinuationSeed(input: {
  evidence: AttachmentGroundingEvidence | null;
  query?: string | null;
  sections?: readonly StudySearchSection[];
}): OnboardingQuickStartSeed | null {
  const evidence = input.evidence;
  if (!evidence || evidence.sourceCount === 0) return null;

  const query = clean(input.query);
  const inferredReportKind = inferReportKindFromText(query);
  const inferredReport = reportCopy(inferredReportKind);
  const focusBadges = [...new Set([...reportFocusBadges(query), ...focusBadgesForEvidence(evidence)])];
  const context = contextLabel(evidence);
  const focusSuffix = followUpFocusSuffix(input.sections);
  const graphSuffix = graphContinuationSuffix(evidence);
  const adjacentSource = buildStudyAdjacentSourceRecommendation(evidence);

  if (evidence.retentionMode === "keep_nothing") {
    return {
      label: inferredReport.label ? inferredReport.rerunLabel : "Rerun this with memory",
      description: inferredReport.label
        ? inferredReport.description
        : "Repeat this grounded study run, but keep extracted notes so the material remains searchable afterward.",
      query: `I want to rerun the same study material and keep extracted notes this time. Using ${context}, extract the key concepts, connect the ideas, and tell me what I should revise first.${query ? ` Keep this question in focus: ${query}.` : ""}${focusSuffix}${graphSuffix}`,
      notice: "Retention-ready follow-up prompt loaded from your last grounded result.",
      helper: adjacentSource?.helperLabel ?? "Keep extracted notes on before you run this so Files, supertags, and the graph can reuse the material.",
      valuePromise: inferredReport.label
        ? inferredReport.valuePromise
        : "Turn a one-off answer into reusable study memory without re-explaining the same material.",
      recommendedUpload: adjacentSource?.recommendedUploadLabel ?? "Best with the same lecture, reading, or rough notes you just used.",
      knowledgeMode: evidence.knowledgeMode,
      retentionMode: "keep_extracted_only",
      originLabel: "From grounded result",
      focusBadges,
      checklist: [
        "Keep extracted notes on so the material stays searchable after this run.",
        "Reuse the same study files if you want Files and Linked ideas to retain them.",
        "Ask for concepts, overlaps, and revision priorities in one grounded pass.",
      ],
      nextSteps: [
        "Open Files to review the retained study pack.",
        "Open Linked ideas or Zettelkasten view after rerunning to inspect the new links.",
      ],
    };
  }

  if (evidence.knowledgeMode === "zettelkasten") {
    const stageLabel =
      uniqueDescriptorValue(evidence, (item) => item.zettelkastenStage ? humanize(item.zettelkastenStage) : null)
      ?? "current note chain";
    return {
      label: inferredReport.label ? inferredReport.continueLabel : "Continue this note chain",
      description: inferredReport.label
        ? inferredReport.description
        : "Keep developing the uploaded study material as Zettelkasten notes instead of starting from scratch.",
      query: `Using ${context} as Zettelkasten material, turn the strongest ideas into source notes and permanent notes, show what challenges or extends earlier notes, and tell me which branch to develop next from the ${stageLabel}.${query ? ` Keep this focus in view: ${query}.` : ""}${focusSuffix}${graphSuffix}`,
      notice: "Zettelkasten follow-up prompt loaded from your last grounded result.",
      helper: adjacentSource?.helperLabel ?? "Add one more related lecture, reading, or rough note if you want stronger note-chain development before running this.",
      valuePromise: inferredReport.label
        ? inferredReport.valuePromise
        : "Convert a useful grounded result into clearer note branches, permanent notes, and next-step review prompts.",
      recommendedUpload: adjacentSource?.recommendedUploadLabel ?? "Best with the retained study notes from this run plus one adjacent source.",
      knowledgeMode: "zettelkasten",
      retentionMode: evidence.retentionMode,
      originLabel: "From grounded result",
      focusBadges,
      checklist: [
        "Keep extracted notes so the note chain persists after this chat.",
        "Ask for permanent-note candidates, contradictions, and weak links.",
        "Use graph anchors and supertag links to connect this note chain to adjacent course material.",
        adjacentSource ? adjacentSource.nextSourceLabel : "Add one adjacent source that belongs to the same branch.",
        "Use the resulting branch suggestions to keep developing the same thread.",
      ],
      nextSteps: [
        "Open Zettelkasten view to inspect the note chain.",
        "Review the retained source notes in Files and continue the strongest branch.",
      ],
    };
  }

  if (evidence.sourceCount > 1) {
    return {
      label: inferredReport.label ? inferredReport.continueLabel : "Ask from these linked sources",
      description: inferredReport.label
        ? inferredReport.description
        : "Use the uploaded study pack as the basis for the next grounded comparison or revision pass.",
      query: `Using ${context}, compare the main concepts, show the overlap and contradictions, identify likely exam angles, and tell me what I should revise next.${query ? ` Also keep this focus in view: ${query}.` : ""}${focusSuffix}${graphSuffix}`,
      notice: "Connected-notes follow-up prompt loaded from your last grounded result.",
      helper: adjacentSource?.helperLabel ?? "This works best when you keep the current retained study pack and optionally add one more related source.",
      valuePromise: inferredReport.label
        ? inferredReport.valuePromise
        : "Carry the same grounded study pack into the next answer without repeating the source context.",
      recommendedUpload: adjacentSource?.recommendedUploadLabel ?? "Best with one lecture source plus one reading, tutorial, or rough note from the same topic.",
      knowledgeMode: "connected_notes",
      retentionMode: evidence.retentionMode,
      originLabel: "From grounded result",
      focusBadges,
      checklist: [
        "Keep extracted notes on so the same study pack remains searchable.",
        "Ask for overlap, contradictions, and revision priorities.",
        adjacentSource?.nextSourceLabel ?? "Add one more adjacent source if you want denser cross-source retrieval.",
      ],
      nextSteps: [
        "Open Files to review the retained pack behind this answer.",
        "Open Linked ideas to inspect the strongest cross-source connections.",
      ],
    };
  }

  return {
    label: inferredReport.label ? inferredReport.continueLabel : "Develop this study source",
    description: inferredReport.label
      ? inferredReport.description
      : "Keep working from the same grounded source instead of restarting with a generic question.",
      query: `Using ${context}, extract the key concepts, define the important terms, and tell me what I should revise first.${query ? ` Also keep this focus in view: ${query}.` : ""}${focusSuffix}${graphSuffix}`,
    notice: "Study follow-up prompt loaded from your last grounded result.",
    helper: adjacentSource?.helperLabel ?? "Add another related source if you want the next answer to move from one source into connected notes.",
    valuePromise: inferredReport.label
      ? inferredReport.valuePromise
      : "Keep the same grounded source in play and get the next useful study answer immediately.",
    recommendedUpload: adjacentSource?.recommendedUploadLabel ?? "Best with the retained source from this run, optionally plus one related reading or note.",
    knowledgeMode: "connected_notes",
    retentionMode: evidence.retentionMode,
    originLabel: "From grounded result",
    focusBadges,
    checklist: [
      "Keep extracted notes so the source remains searchable.",
      "Ask for key concepts, definitions, and revision priorities.",
      adjacentSource?.nextSourceLabel ?? "Add a second source when you want overlap and comparison rather than a single-source answer.",
    ],
    nextSteps: [
      "Review the retained source in Files.",
      "Upload a second related source to strengthen the graph and linked retrieval.",
    ],
  };
}

let pendingSeed: OnboardingQuickStartSeed | null = null;

export function saveStudySearchContinuationSeed(seed: OnboardingQuickStartSeed | null): void {
  pendingSeed = seed ? { ...seed } : null;
}

export function consumeStudySearchContinuationSeed(): OnboardingQuickStartSeed | null {
  if (!pendingSeed) return null;
  const next = { ...pendingSeed };
  pendingSeed = null;
  return next;
}
