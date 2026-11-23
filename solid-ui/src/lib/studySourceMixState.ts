// @locs-version: 1.0
export type StudySourceMixTone = "sky" | "emerald" | "amber";

export type StudySourceMixState = {
  tone: StudySourceMixTone;
  headline: string;
  detail: string;
  graphOutcome: string;
  supertagOutcome: string;
  primaryActionId: "pick_files" | "run_now" | "compare_path";
  primaryActionLabel: string;
  secondaryActionId: "pick_files" | "week_path" | "compare_path" | "none";
  secondaryActionLabel: string | null;
};

type SourceKind = "lecture" | "reading" | "notes" | "audio" | "image" | "other";

type InputFile = {
  name: string;
  type?: string | null;
};

function lower(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function inferSourceKind(file: InputFile): SourceKind {
  const name = lower(file.name);
  const type = lower(file.type);

  if (/\breading\b|\bchapter\b|\bpaper\b|\barticle\b|\bjournal\b|\btextbook\b/.test(name)) {
    return "reading";
  }
  if (/\blecture\b|\bslides?\b|\bdeck\b|\btutorial\b|\bwk[\s_-]?\d+\b/.test(name)) {
    return "lecture";
  }
  if (/\bnote\b|\bnotes\b|\brevision\b|\bsummary\b|\bflashcard\b|\bdraft\b/.test(name)) {
    return "notes";
  }
  if (type.startsWith("audio/") || /\.(m4a|mp3|wav|ogg|aac)$/i.test(file.name)) {
    return "audio";
  }
  if (type.startsWith("image/") || /\.(png|jpe?g|webp|heic)$/i.test(file.name)) {
    return "image";
  }
  return "other";
}

function countKinds(files: readonly InputFile[]) {
  return files.reduce<Record<SourceKind, number>>(
    (counts, file) => {
      counts[inferSourceKind(file)] += 1;
      return counts;
    },
    {
      lecture: 0,
      reading: 0,
      notes: 0,
      audio: 0,
      image: 0,
      other: 0,
    },
  );
}

export function buildStudySourceMixState(input: {
  files: readonly InputFile[];
  supportedCount: number;
}): StudySourceMixState | null {
  const fileCount = input.files.length;
  if (fileCount === 0) {
    return {
      tone: "sky",
      headline: "Start with one real class source, then add one related source if you have it.",
      detail: "The fastest student path is one lecture file, reading, rough note, or voice memo now. A second related source makes connected notes and comparison much stronger.",
      graphOutcome: "One readable source starts the retained study trail. Two related sources create stronger cross-source graph links.",
      supertagOutcome: "Supertags still classify one source, but they become much more useful when they can connect two related sources by topic, week, or course.",
      primaryActionId: "pick_files",
      primaryActionLabel: "Choose study files",
      secondaryActionId: "none",
      secondaryActionLabel: null,
    };
  }

  if (input.supportedCount === 0) {
    return {
      tone: "amber",
      headline: "These files are attached, but none are readable enough for a strong study run yet.",
      detail: "Convert at least one file into a readable format such as PDF, DOCX, TXT, Markdown, CSV, or common audio before running the study workflow.",
      graphOutcome: "Without one readable source, OmnyID cannot extract reliable concepts or build useful graph links.",
      supertagOutcome: "Without readable text or transcript content, supertags cannot classify the material well enough for later retrieval.",
      primaryActionId: "pick_files",
      primaryActionLabel: "Replace files",
      secondaryActionId: "none",
      secondaryActionLabel: null,
    };
  }

  const counts = countKinds(input.files);
  const hasLecture = counts.lecture > 0;
  const hasReading = counts.reading > 0;
  const hasNotes = counts.notes > 0;
  const hasAudio = counts.audio > 0;
  const richMix = (hasLecture && hasReading) || (hasLecture && hasNotes) || (hasReading && hasNotes) || input.supportedCount >= 3;

  if (richMix) {
    return {
      tone: "emerald",
      headline: "This source mix is strong enough to produce better connected notes, not just a summary.",
      detail: "You already have the kind of overlap that helps OmnyID compare ideas, surface revision gaps, and create denser study links across sources.",
      graphOutcome: "The graph should be able to form stronger topic, week, and concept links because this run has more than one perspective on the same material.",
      supertagOutcome: "Supertags should reinforce each other across lecture, reading, and note context, making later retrieval and pack filtering much stronger.",
      primaryActionId: "run_now",
      primaryActionLabel: "Run grounded study answer",
      secondaryActionId: "compare_path",
      secondaryActionLabel: "Use compare path",
    };
  }

  if (hasLecture && !hasReading && !hasNotes) {
    return {
      tone: "sky",
      headline: "A lecture file is enough to start, but one reading or rough note would make the result much stronger.",
      detail: "Run now if you need speed, or add one related reading, tutorial sheet, or rough note to help OmnyID find overlap and missing pieces.",
      graphOutcome: "One lecture source creates a grounded entry point. Adding a second source turns it into a better linked study pack.",
      supertagOutcome: "The lecture will still get course and week supertags, but a second source gives those supertags something meaningful to connect.",
      primaryActionId: "run_now",
      primaryActionLabel: "Run from lecture source",
      secondaryActionId: "pick_files",
      secondaryActionLabel: "Add reading or note",
    };
  }

  if (hasReading && !hasLecture && !hasNotes) {
    return {
      tone: "sky",
      headline: "A reading source is grounded, but a lecture file would make exam-focused retrieval much better.",
      detail: "Run now if you only have the reading, or add lecture slides or tutorial notes so OmnyID can compare what class emphasized versus what the reading adds.",
      graphOutcome: "One reading source creates a grounded note base. A lecture source makes later linked-idea review more reliable.",
      supertagOutcome: "The reading can be tagged and retained alone, but supertags become more useful when they bridge reading and lecture context.",
      primaryActionId: "run_now",
      primaryActionLabel: "Run from reading",
      secondaryActionId: "pick_files",
      secondaryActionLabel: "Add lecture file",
    };
  }

  if (hasAudio && !hasLecture && !hasReading && !hasNotes) {
    return {
      tone: "sky",
      headline: "An audio recording can start the study run, but it becomes far stronger with slides or notes.",
      detail: "If this is a lecture recording, attach slides or rough notes too so OmnyID can connect spoken material to structured study content.",
      graphOutcome: "Transcript-only runs can work, but graph links are stronger when audio is reinforced by slides, notes, or readings.",
      supertagOutcome: "Supertags can classify the transcript, but they gain much more reuse value when another study source confirms the same concepts.",
      primaryActionId: "run_now",
      primaryActionLabel: "Run from transcript",
      secondaryActionId: "pick_files",
      secondaryActionLabel: "Add slides or notes",
    };
  }

  return {
    tone: "sky",
    headline: "This study pack can run now, and one related source would make later retrieval stronger.",
    detail: "If you want immediate value, run now. If you want denser connected notes, add one lecture, reading, or rough note that covers the same week or topic.",
    graphOutcome: "The graph should start from this pack now, but more overlap will make its links more reliable.",
    supertagOutcome: "Supertags will classify this pack, but they become more useful for search and filtering once a second related source is retained.",
    primaryActionId: "run_now",
    primaryActionLabel: "Run first study answer",
    secondaryActionId: "pick_files",
    secondaryActionLabel: "Add one related source",
  };
}
