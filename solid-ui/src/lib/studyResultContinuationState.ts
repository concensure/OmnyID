// @locs-version: 1.0
import type { AfpMessage } from "@/lib/api";
import type { AttachmentGroundingEvidence } from "@/lib/attachmentGroundingEvidence";
import { afpRecord } from "@/lib/afpMessageRecord";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import type { FileLibraryNavigationIntent } from "@/lib/fileLibraryNavigationState";
import type { KnowledgeGraphNavigationIntent } from "@/lib/knowledgeGraphNavigationState";

export type StudyResultContinuationAction = {
  id: "files" | "graph" | "search";
  label: string;
  description: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyResultContinuationState = {
  headline: string;
  detail: string;
  actions: StudyResultContinuationAction[];
};

function parseContinuationAction(value: unknown): StudyResultContinuationAction | null {
  const record = afpRecord(value);
  const id = typeof record.id === "string" ? record.id : null;
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const description = typeof record.description === "string" ? record.description.trim() : "";
  const tone = typeof record.tone === "string" ? record.tone : null;
  if (
    (id === "files" || id === "graph" || id === "search")
    && label
    && description
    && (tone === "sky" || tone === "emerald" || tone === "violet" || tone === "amber")
  ) {
    return { id, label, description, tone };
  }
  return null;
}

export function explicitStudyResultContinuation(message: AfpMessage): StudyResultContinuationState | null {
  const content = afpRecord(decryptedDisplayContent(message));
  const continuation = afpRecord(content.study_continuation);
  const headline = typeof continuation.headline === "string" ? continuation.headline.trim() : "";
  const detail = typeof continuation.detail === "string" ? continuation.detail.trim() : "";
  const actions = Array.isArray(continuation.actions)
    ? continuation.actions
        .map((action) => parseContinuationAction(action))
        .filter((action): action is StudyResultContinuationAction => action !== null)
    : [];

  if (!headline || !detail || actions.length === 0) return null;
  return { headline, detail, actions };
}

function graphPrimaryLabel(intent: KnowledgeGraphNavigationIntent | null): string {
  if (!intent) return "Open study graph";
  if (intent.activeLens === "zettelkasten") return "Open Zettelkasten view";
  if (intent.activeLens === "linked_ideas") return "Open Linked ideas";
  if (intent.activeLens === "study_materials") return "Open study graph";
  return "Open linked study graph";
}

function graphPrimaryDescription(intent: KnowledgeGraphNavigationIntent | null): string {
  if (!intent) return "Inspect how OmnyID connected this study material.";
  const context = [
    intent.knowledgeGraphGroupKey ? `graph anchor ${intent.knowledgeGraphGroupKey}` : null,
    ...(intent.knowledgeGraphLinkTags ?? []).slice(0, 4).map((tag) => `#${tag}`),
    intent.zettelkastenNextAction ? `next note move: ${intent.zettelkastenNextAction}` : null,
  ].filter((value): value is string => Boolean(value));
  const contextSuffix = context.length > 0
    ? ` Current focus: ${context.join(", ")}.`
    : "";
  if (intent.activeLens === "zettelkasten") {
    return `Review retained source notes, follow note links, and continue the Zettelkasten chain.${contextSuffix}`;
  }
  if (intent.activeLens === "linked_ideas") {
    return `Inspect overlap and divergence across the retained study sources without hunting through folders.${contextSuffix}`;
  }
  return `Inspect the connected study graph built from the retained sources, tags, and extracted notes.${contextSuffix}`;
}

function filesDescription(evidence: AttachmentGroundingEvidence | null): string {
  if (!evidence) return "Review the retained study sources in Files.";
  const graphAnchor = evidence.sourceDescriptors.find((descriptor) => descriptor.knowledgeGraphGroupKey)?.knowledgeGraphGroupKey?.trim();
  const linkTags = evidence.sourceDescriptors
    .flatMap((descriptor) => descriptor.knowledgeGraphLinkTags ?? [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 4);
  const contextSuffix = graphAnchor || linkTags.length > 0
    ? ` Filter by ${[graphAnchor ? `graph anchor ${graphAnchor}` : null, ...linkTags.map((tag) => `#${tag}`)].filter(Boolean).join(", ")} if the list is noisy.`
    : "";
  if (evidence.retentionMode === "keep_file") {
    return `Open Files to review the retained originals together with extracted notes and study metadata.${contextSuffix}`;
  }
  if (evidence.retentionMode === "keep_extracted_only") {
    return `Open Files to review the retained extracted notes, supertags, and study classifications immediately.${contextSuffix}`;
  }
  return "Open chat again and rerun this upload with retained notes if you want it to stay searchable.";
}

export function buildStudyResultContinuationState(input: {
  attachmentGrounding: AttachmentGroundingEvidence | null;
  fileLibraryIntent: FileLibraryNavigationIntent | null;
  knowledgeGraphIntent: KnowledgeGraphNavigationIntent | null;
}): StudyResultContinuationState | null {
  const evidence = input.attachmentGrounding;
  if (!evidence || evidence.sourceCount === 0) return null;

  if (evidence.retentionMode === "keep_nothing") {
    return {
      headline: "This answer is grounded, but nothing from the upload will remain afterward.",
      detail: "If you want Files, supertags, and the knowledge graph to remember this study material, rerun the upload with Keep extracted notes.",
      actions: [
        {
          id: "search",
          label: "Rerun with retention",
          description: "Go back to study chat and keep extracted notes on the next run so the material stays searchable.",
          tone: "amber",
        },
      ],
    };
  }

  const actions: StudyResultContinuationAction[] = [];
  if (input.fileLibraryIntent) {
    actions.push({
      id: "files",
      label: "Open retained sources",
      description: filesDescription(evidence),
      tone: "sky",
    });
  }
  if (input.knowledgeGraphIntent) {
    actions.push({
      id: "graph",
      label: graphPrimaryLabel(input.knowledgeGraphIntent),
      description: graphPrimaryDescription(input.knowledgeGraphIntent),
      tone: input.knowledgeGraphIntent.activeLens === "zettelkasten" ? "emerald" : "violet",
    });
  }

  const headline =
    evidence.knowledgeMode === "zettelkasten"
      ? "Your first study result can continue directly into a Zettelkasten workflow."
      : evidence.sourceCount > 1
        ? "Your first study result can continue directly into retained sources and Linked ideas."
        : "Your first study result can continue directly into retained sources and the study graph.";

  const detail =
    evidence.knowledgeMode === "zettelkasten"
      ? "OmnyID has already classified the uploaded material for note-chain development, so the next step is to inspect source notes and promote stronger notes."
      : evidence.sourceCount > 1
        ? "OmnyID has retained study material that should already be useful in Files and should expose cross-source overlap in the graph."
        : "OmnyID has retained a grounded study source that should already be useful in Files and ready to strengthen the graph with the next upload.";

  return {
    headline,
    detail,
    actions,
  };
}
