// @locs-version: 1.0
import type { AttachmentRetentionMode, KnowledgeOrganizationMode } from "@/lib/api";

export type StudyFirstRunValuePathStep = {
  id: "answer" | "retention" | "follow_through";
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyFirstRunValuePathState = {
  headline: string;
  detail: string;
  badge: string;
  steps: StudyFirstRunValuePathStep[];
  primaryActionLabel: string;
};

function answerStep(
  knowledgeMode: KnowledgeOrganizationMode,
  supportedCount: number,
): StudyFirstRunValuePathStep {
  if (knowledgeMode === "zettelkasten") {
    return {
      id: "answer",
      label: "Answer now",
      detail:
        supportedCount >= 2
          ? "The first answer should turn the attached material into source notes, early links, and a clearer note chain."
          : "The first answer should turn the attached material into one usable source note instead of a disposable summary.",
      tone: "sky",
    };
  }
  return {
    id: "answer",
    label: "Answer now",
    detail:
      supportedCount >= 2
        ? "The first answer should surface concepts, overlap, and revision priorities across the attached sources."
        : "The first answer should surface the main concepts and revision priorities from the attached source immediately.",
    tone: "sky",
  };
}

function retentionStep(
  retentionMode: AttachmentRetentionMode,
  knowledgeMode: KnowledgeOrganizationMode,
): StudyFirstRunValuePathStep {
  if (retentionMode === "keep_nothing") {
    return {
      id: "retention",
      label: "Nothing stays",
      detail: "This run can still answer the question, but Files, supertags, and the graph will not remember the material afterward.",
      tone: "amber",
    };
  }
  if (retentionMode === "keep_file") {
    return {
      id: "retention",
      label: "File plus extracted notes stay",
      detail:
        knowledgeMode === "zettelkasten"
          ? "The original file stays in the account library, while extracted notes and Zettelkasten stages keep the note chain grounded."
          : "The original file stays in the account library, while extracted notes and supertags keep the source searchable without folders.",
      tone: "emerald",
    };
  }
  return {
    id: "retention",
    label: "Extracted content stays",
    detail:
      knowledgeMode === "zettelkasten"
        ? "The original file is removed, but the extracted source note, stages, and links remain available for the next review pass."
        : "The original file is removed, but extracted notes, academic tags, and supertags remain available in Files and linked retrieval.",
    tone: "emerald",
  };
}

function followThroughStep(
  knowledgeMode: KnowledgeOrganizationMode,
  retentionMode: AttachmentRetentionMode,
  supportedCount: number,
): StudyFirstRunValuePathStep {
  if (retentionMode === "keep_nothing") {
    return {
      id: "follow_through",
      label: "Rerun with retention",
      detail: "Use Keep extracted notes on the next run so the same study material becomes reusable instead of staying session-only.",
      tone: "amber",
    };
  }
  if (knowledgeMode === "zettelkasten") {
    return {
      id: "follow_through",
      label: "Continue the note chain",
      detail:
        supportedCount >= 2
          ? "After the answer, review the retained sources in Files and open the Zettelkasten lens to continue source notes, review queues, and permanent notes."
          : "After the answer, review the retained source in Files and use the next upload to strengthen the Zettelkasten chain.",
      tone: "violet",
    };
  }
  return {
    id: "follow_through",
    label: "Open Files, then Linked ideas",
    detail:
      supportedCount >= 2
        ? "After the answer, review the retained sources in Files, then inspect Linked ideas to see overlap, divergence, and revision gaps."
        : "After the answer, review the retained source in Files, then let Linked ideas grow as the next related upload arrives.",
    tone: "violet",
  };
}

export function buildStudyFirstRunValuePathState(input: {
  supportedCount: number;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
}): StudyFirstRunValuePathState {
  const steps = [
    answerStep(input.knowledgeMode, input.supportedCount),
    retentionStep(input.retentionMode, input.knowledgeMode),
    followThroughStep(input.knowledgeMode, input.retentionMode, input.supportedCount),
  ];

  if (input.retentionMode === "keep_nothing") {
    return {
      headline: "This run is useful now, but it will not compound.",
      detail: "The student may still get a grounded answer, but OmnyID will not build the reusable study system promised by connected notes or Zettelkasten unless retention is enabled.",
      badge: "Session only",
      steps,
      primaryActionLabel: "Use Keep extracted notes first",
    };
  }

  if (input.knowledgeMode === "zettelkasten") {
    return {
      headline: "This run should create a reusable study path, not just a one-off answer.",
      detail: "The commercial-standard outcome is a first answer that turns into retained source notes, staged review, and a stronger note chain over time.",
      badge: input.supportedCount >= 2 ? "Reusable chain" : "First source note",
      steps,
      primaryActionLabel: "Aim for retained source notes",
    };
  }

  return {
    headline: "This run should create immediate value and a reusable study trail.",
    detail: "The commercial-standard outcome is a first answer the student can use now, plus retained material that stays searchable in Files and grows stronger through linked retrieval.",
    badge: input.supportedCount >= 2 ? "Answer + linked memory" : "Answer + retained source",
    steps,
    primaryActionLabel: "Aim for retained connected notes",
  };
}
