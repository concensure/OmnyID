// @locs-version: 1.0
import type { AttachmentRetentionMode, KnowledgeOrganizationMode } from "@/lib/api";
import type { OnboardingQuickStartFlowKind } from "@/lib/onboardingQuickStart";

export type StudyImmediateValuePlan = {
  firstResultLabel: string;
  retentionLabel: string;
  retrievalLabel: string;
  readinessLabel: string;
  readinessDetail: string;
  nextSurfaceLabel: string;
};

function sourceCountLabel(
  attachedCount: number,
  supportedCount: number,
  flowKind: OnboardingQuickStartFlowKind | null | undefined,
): string {
  if (supportedCount >= 2) return `${supportedCount} study sources`;
  if (supportedCount === 1) return "your first study source";
  if (flowKind === "grounded_followup" || flowKind === "adjacent_source_planning") {
    return "your retained study context";
  }
  if (attachedCount >= 2) return `${attachedCount} attached files`;
  if (attachedCount === 1) return "your attached file";
  return "your study material";
}

function firstResultLabel(
  knowledgeMode: KnowledgeOrganizationMode,
  sourceLabel: string,
  valuePromise?: string | null,
): string {
  if (valuePromise?.trim()) return valuePromise.trim();
  if (knowledgeMode === "zettelkasten") {
    return `OmnyID turns ${sourceLabel} into source notes, emerging links, and a review-ready note chain.`;
  }
  if (knowledgeMode === "connected_notes") {
    return `OmnyID turns ${sourceLabel} into connected notes with concepts, overlaps, and revision priorities.`;
  }
  return `OmnyID extracts the important ideas from ${sourceLabel} so you can study them immediately.`;
}

function retentionLabel(retentionMode: AttachmentRetentionMode): string {
  if (retentionMode === "keep_file") {
    return "Original files stay in Files together with extracted text, source metadata, and supertags.";
  }
  if (retentionMode === "keep_extracted_only") {
    return "Only extracted study content is kept, but it remains searchable in Files and linked by supertags.";
  }
  return "Nothing is retained after this answer, so use this only for one-off questions.";
}

function retrievalLabel(knowledgeMode: KnowledgeOrganizationMode): string {
  if (knowledgeMode === "zettelkasten") {
    return "Supertags, review stages, and note links keep the material discoverable as a Zettelkasten-style chain rather than a loose file dump.";
  }
  if (knowledgeMode === "connected_notes") {
    return "Supertags connect concepts, weeks, and courses so later searches and Linked ideas can bring the material back without folders.";
  }
  return "The extracted notes stay grounded to the source so the material can still be found again later.";
}

function readinessLabel(
  attachedCount: number,
  supportedCount: number,
  knowledgeMode: KnowledgeOrganizationMode,
  retentionMode: AttachmentRetentionMode,
  flowKind: OnboardingQuickStartFlowKind | null | undefined,
): string {
  if (retentionMode === "keep_nothing") {
    return "This run can answer the question, but it will not produce a retained study-ready source afterward."
  }
  if (flowKind === "adjacent_source_planning") {
    return "This run can deliver value immediately from retained study context by identifying the single best next source to attach."
  }
  if (flowKind === "grounded_followup") {
    return "This run can deliver value immediately from retained study context without requiring a new upload first."
  }
  if (supportedCount === 0) {
    return attachedCount > 0
      ? "No attached source is study-ready yet because none of the current files can be read in this run."
      : "Your first study-ready source appears after you attach a readable study file and run a grounded question."
  }
  if (knowledgeMode === "zettelkasten") {
    return supportedCount >= 2
      ? "This run should leave you with retained source notes that are ready to start a stronger Zettelkasten chain."
      : "This run should leave you with one retained source note that is ready to begin a Zettelkasten chain."
  }
  if (supportedCount >= 2) {
    return "This run should leave you with study-ready retained sources plus cross-source overlap you can inspect in Linked ideas."
  }
  return "This run should leave you with one study-ready retained source in Files immediately after the answer is generated."
}

function readinessDetail(
  attachedCount: number,
  supportedCount: number,
  knowledgeMode: KnowledgeOrganizationMode,
  retentionMode: AttachmentRetentionMode,
  flowKind: OnboardingQuickStartFlowKind | null | undefined,
): string {
  if (retentionMode === "keep_nothing") {
    return "Switch to keeping extracted notes when you want Files, supertags, and the knowledge graph to remember this material after the current chat."
  }
  if (flowKind === "adjacent_source_planning") {
    return "Use the retained Files or graph context now, then attach the recommended adjacent lecture, reading, note, or recording so OmnyID can strengthen the same cluster on the next run."
  }
  if (flowKind === "grounded_followup") {
    return "The retained Files or graph context is already enough for a grounded follow-up. Add another source only when you want denser supertags, stronger overlap, or better graph coverage."
  }
  if (supportedCount === 0) {
    return "Use a readable format such as PDF, DOCX, TXT, Markdown, CSV, or common audio so OmnyID can extract concepts, apply supertags, and retain usable study material."
  }
  if (knowledgeMode === "zettelkasten") {
    return supportedCount >= 2
      ? "Retained source notes, review stages, and note links should be available right away, while additional uploads strengthen the longer note chain."
      : "The first retained source note should be available right away in Files, and the next lecture, reading, or rough note will strengthen the chain."
  }
  if (supportedCount >= 2) {
    return "OmnyID should retain extracted study content, academic metadata, and supertags so Files and the knowledge graph can surface overlaps, revision gaps, and linked material right away."
  }
  return "OmnyID should retain extracted study content, academic metadata, and supertags so the source is searchable in Files immediately, even before the graph becomes dense.";
}

function nextSurfaceLabel(
  knowledgeMode: KnowledgeOrganizationMode,
  retentionMode: AttachmentRetentionMode,
  flowKind: OnboardingQuickStartFlowKind | null | undefined,
): string {
  if (retentionMode === "keep_nothing") {
    return "Best next step: keep extracted notes on the next run so the result stays searchable after this chat.";
  }
  if (flowKind === "adjacent_source_planning") {
    return "Best next step: attach the recommended adjacent source, then rerun so Files, supertags, and the graph strengthen the same study thread.";
  }
  if (knowledgeMode === "zettelkasten") {
    return "Best next step: review the retained source note in Files, then open the Zettelkasten lens to continue the note chain.";
  }
  if (knowledgeMode === "connected_notes") {
    return "Best next step: review the retained source in Files, then open Linked ideas to inspect cross-source overlaps and revision gaps.";
  }
  return "Best next step: review the retained source in Files so the extracted notes stay grounded for later search and reuse.";
}

export function buildStudyImmediateValuePlan(input: {
  attachedCount: number;
  supportedCount: number;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
  valuePromise?: string | null;
  flowKind?: OnboardingQuickStartFlowKind | null;
}): StudyImmediateValuePlan {
  const sourceLabel = sourceCountLabel(input.attachedCount, input.supportedCount, input.flowKind);
  return {
    firstResultLabel: firstResultLabel(input.knowledgeMode, sourceLabel, input.valuePromise),
    retentionLabel: retentionLabel(input.retentionMode),
    retrievalLabel: retrievalLabel(input.knowledgeMode),
    readinessLabel: readinessLabel(
      input.attachedCount,
      input.supportedCount,
      input.knowledgeMode,
      input.retentionMode,
      input.flowKind,
    ),
    readinessDetail: readinessDetail(
      input.attachedCount,
      input.supportedCount,
      input.knowledgeMode,
      input.retentionMode,
      input.flowKind,
    ),
    nextSurfaceLabel: nextSurfaceLabel(input.knowledgeMode, input.retentionMode, input.flowKind),
  };
}
