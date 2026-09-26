// @locs-version: 1.0
import type { KnowledgeOrganizationMode } from "./api";
import type { OnboardingQuickStartSeed } from "./onboardingQuickStart";
import { selectStudentAttachmentQuickStartForFiles, studentQuickStartForIntent } from "./onboardingQuickStart";

type AttachmentLike = {
  name: string;
  type?: string | null;
};

export const UNREADABLE_STUDY_ATTACHMENT_QUICK_START: OnboardingQuickStartSeed = {
  label: "Make these study files usable",
  description: "Figure out the fastest conversion path before running grounded study synthesis.",
  query:
    "These study files are attached but not readable yet. Tell me which files I should convert first, what format to use, and the fastest way to make them usable for connected notes.",
  notice:
    "Conversion-first study prompt loaded. OmnyID will help you make unreadable files usable before the main study run.",
  helper:
    "Use this when the attached files are not readable yet, or replace them with PDF, DOCX, Markdown, CSV, TXT, or common audio files.",
  valuePromise:
    "Get to a usable study run faster by identifying which file to convert first and which format OmnyID can synthesize reliably.",
  recommendedUpload:
    "Best when the current batch is unreadable or only partly supported and you want the fastest fix.",
  knowledgeMode: "connected_notes",
  retentionMode: "keep_extracted_only",
  checklist: [
    "Keep the current batch attached so OmnyID can reason about what is blocked.",
    "Ask which file to convert first and what target format is safest.",
    "Reattach the converted source, then rerun the grounded study prompt.",
  ],
  nextSteps: [
    "Convert the highest-value blocked file into PDF, DOCX, Markdown, CSV, TXT, or a common audio format.",
    "Return to the study run once at least one readable source is attached.",
  ],
};

export function selectAdaptiveStudyAttachmentQuickStart(input: {
  files: readonly AttachmentLike[];
  supportedCount: number;
  preferredKnowledgeMode?: KnowledgeOrganizationMode | null;
}): OnboardingQuickStartSeed | null {
  if (input.files.length === 0) return null;
  if (input.supportedCount === 0) return UNREADABLE_STUDY_ATTACHMENT_QUICK_START;
  if (input.preferredKnowledgeMode === "zettelkasten") {
    return studentQuickStartForIntent("zettelkasten_chain");
  }
  return selectStudentAttachmentQuickStartForFiles(input.files);
}
