// @locs-version: 1.0
import type { AttachmentRetentionMode, KnowledgeOrganizationMode } from "./api";

export type StudyAttachmentSetupSnapshotCard = {
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyAttachmentSetupSnapshotState = {
  headline: string;
  detail: string;
  badge: string;
  tone: "sky" | "emerald" | "violet" | "amber";
  cards: StudyAttachmentSetupSnapshotCard[];
  primaryActionId: "pick_files" | "use_recommended_setup" | "load_prompt" | "run_now";
  primaryActionLabel: string;
  secondaryActionId: "pick_files" | "use_recommended_setup" | "load_prompt" | "run_now" | null;
  secondaryActionLabel: string | null;
};

function storageDetail(mode: AttachmentRetentionMode): string {
  if (mode === "keep_file") {
    return "The original file stays in Files alongside extracted notes, supertags, and knowledge links for exact-file recall later.";
  }
  if (mode === "keep_nothing") {
    return "Nothing is kept after the answer, so the student gets a one-off result but no reusable study memory.";
  }
  return "OmnyID keeps the extracted notes, supertags, and graph links while dropping the original file to keep storage lighter.";
}

function organizationDetail(
  mode: KnowledgeOrganizationMode,
  readableCount: number,
): string {
  if (mode === "zettelkasten") {
    return readableCount > 0
      ? "Readable material is positioned for source-note development, permanent-note candidates, and deliberate note chains, with supertags supporting retrieval across the wider workspace."
      : "Zettelkasten mode is selected, but it still needs a readable source before OmnyID can start a meaningful note chain.";
  }
  if (mode === "standard") {
    return "Material can remain searchable, but the stronger connected-notes and graph behavior is reduced, so follow-up retrieval will be less seamless.";
  }
  return readableCount > 0
    ? "Readable material can become connected notes with supertags and graph links so later questions can reuse it without manual folders."
    : "Connected-notes mode is selected, but it still needs a readable source before OmnyID can create strong reusable links.";
}

function immediateValueDetail(
  attachedCount: number,
  readableCount: number,
): string {
  if (readableCount > 1) {
    return `The first run can synthesize across ${readableCount} readable study sources immediately instead of treating them as isolated uploads.`;
  }
  if (readableCount === 1) {
    return "The first run can ground a useful answer on one readable source now, then become more valuable as adjacent material is added.";
  }
  if (attachedCount > 0) {
    return "Files are attached, but immediate grounded value is weaker until at least one readable source is available for extraction.";
  }
  return "No study source is attached yet, so OmnyID cannot demonstrate connected-note value in the first run.";
}

export function buildStudyAttachmentSetupSnapshotState(input: {
  attachedCount: number;
  readableCount: number;
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
  queryReady: boolean;
}): StudyAttachmentSetupSnapshotState {
  const recommendedSetupActive =
    input.knowledgeMode === "connected_notes"
    && input.retentionMode === "keep_extracted_only";
  const valueReady = input.readableCount > 0;

  const tone: StudyAttachmentSetupSnapshotState["tone"] =
    !valueReady
      ? "amber"
      : input.retentionMode === "keep_nothing"
        ? "amber"
        : input.knowledgeMode === "zettelkasten"
          ? "violet"
          : recommendedSetupActive
            ? "emerald"
            : input.knowledgeMode === "standard"
              ? "sky"
              : "sky";

  const headline =
    !valueReady
      ? "This setup is not yet strong enough to prove connected-note value on the first run."
      : input.retentionMode === "keep_nothing"
        ? "This setup can answer now, but it will not compound into reusable study memory."
        : input.knowledgeMode === "zettelkasten"
          ? "This setup can turn the first run into the start of a deliberate note chain."
          : recommendedSetupActive
            ? "This setup is ready for a strong first-run connected-notes experience."
            : "This setup can work, but it is not the strongest connected-notes default.";

  const detail =
    !valueReady
      ? "Attach at least one readable lecture file, note, PDF, transcript, or recording so OmnyID can extract usable content before the student judges the product."
      : input.retentionMode === "keep_nothing"
        ? "The student will see immediate output, but nothing remains in Files, supertags, or the knowledge graph afterward."
        : input.knowledgeMode === "zettelkasten"
          ? "This is best when the student wants uploads to become source notes and future permanent-note material, not just summaries."
          : recommendedSetupActive
            ? "For most stressed uni students, this is the cleanest commercial-standard default: fast grounded value now, lighter storage, and retained retrieval later."
            : "This choice still gives value, but the connected-notes workflow becomes less automatic than the recommended default.";

  const badge =
    !valueReady
      ? "Needs readable source"
      : input.retentionMode === "keep_nothing"
        ? "One-off only"
        : input.knowledgeMode === "zettelkasten"
          ? "Zettelkasten path"
          : recommendedSetupActive
            ? "Recommended setup"
            : "Usable with tradeoffs";

  const primaryActionId: StudyAttachmentSetupSnapshotState["primaryActionId"] =
    !valueReady
      ? "pick_files"
      : !recommendedSetupActive && input.knowledgeMode !== "zettelkasten"
        ? "use_recommended_setup"
        : input.queryReady
          ? "run_now"
          : "load_prompt";

  const primaryActionLabel =
    primaryActionId === "pick_files"
      ? "Add a readable study file"
      : primaryActionId === "use_recommended_setup"
        ? "Use recommended setup"
        : primaryActionId === "run_now"
          ? "Run first study pass"
          : "Load study prompt";

  const secondaryActionId: StudyAttachmentSetupSnapshotState["secondaryActionId"] =
    !valueReady
      ? input.knowledgeMode !== "connected_notes" || input.retentionMode !== "keep_extracted_only"
        ? "use_recommended_setup"
        : null
      : primaryActionId === "use_recommended_setup"
        ? input.queryReady
          ? "run_now"
          : "load_prompt"
        : primaryActionId === "run_now"
          ? null
          : "run_now";

  const secondaryActionLabel =
    secondaryActionId === "use_recommended_setup"
      ? "Use recommended setup"
      : secondaryActionId === "run_now"
        ? "Run anyway"
        : secondaryActionId === "load_prompt"
          ? "Load study prompt"
          : secondaryActionId === "pick_files"
            ? "Add a readable study file"
            : null;

  return {
    headline,
    detail,
    badge,
    tone,
    cards: [
      {
        label: "Immediate value",
        detail: immediateValueDetail(input.attachedCount, input.readableCount),
        tone: valueReady ? "sky" : "amber",
      },
      {
        label: "What stays after the run",
        detail: storageDetail(input.retentionMode),
        tone: input.retentionMode === "keep_nothing" ? "amber" : "emerald",
      },
      {
        label: "How OmnyID organizes it",
        detail: organizationDetail(input.knowledgeMode, input.readableCount),
        tone: input.knowledgeMode === "zettelkasten"
          ? "violet"
          : input.knowledgeMode === "standard"
            ? "sky"
            : "emerald",
      },
    ],
    primaryActionId,
    primaryActionLabel,
    secondaryActionId,
    secondaryActionLabel,
  };
}
