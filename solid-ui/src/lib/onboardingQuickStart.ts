// @locs-version: 1.0
import type { AttachmentRetentionMode, KnowledgeOrganizationMode } from "@/lib/api";

export type OnboardingQuickStartFlowKind =
  | "initial_upload"
  | "grounded_followup"
  | "adjacent_source_planning";

export type OnboardingQuickStartSeed = {
  query: string;
  notice: string;
  helper: string;
  label: string;
  description: string;
  flowKind?: OnboardingQuickStartFlowKind;
  entryPoint?: "onboarding" | "files" | "knowledge_graph" | "search_result" | "workspace";
  timeToValueLabel?: string;
  valuePromise: string;
  recommendedUpload: string;
  firstOutputs?: string[];
  knowledgeMode: KnowledgeOrganizationMode;
  retentionMode: AttachmentRetentionMode;
  checklist: string[];
  nextSteps: string[];
  originLabel?: string | null;
  focusBadges?: string[];
};

export const STUDENT_ONBOARDING_QUICK_STARTS: OnboardingQuickStartSeed[] = [
  {
    label: "Connect my study material",
    description: "Turn lecture slides, notes, readings, or voice memos into connected notes.",
    flowKind: "initial_upload",
    timeToValueLabel: "Useful answer in the first run",
    query:
      "Turn these lecture slides, readings, notes, or voice memos into connected notes. Show the main concepts, overlaps, and what I should revise first.",
    notice:
      "Starter study prompt loaded. Add lecture slides, notes, readings, or voice memos to experience connected notes immediately.",
    helper:
      "Drag in a PDF, DOCX, Markdown note, screenshot, or lecture audio, then press Enter.",
    valuePromise: "See the main concepts, overlaps, and first revision priorities from your own study material in one run.",
    recommendedUpload: "Best with one lecture source plus one rough note or reading.",
    firstOutputs: [
      "Main concepts explained in plain study language",
      "Overlap and differences across attached sources",
      "Revision priorities so the student knows what to study next",
    ],
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    checklist: [
      "Upload one lecture PDF, reading, or rough note.",
      "Keep extracted notes so the result stays searchable after this chat.",
      "Ask for concepts, overlaps, and what to revise first.",
    ],
    nextSteps: [
      "Browse the retained study sources in Files.",
      "Open Linked ideas to review how supertags and graph links connected the material.",
    ],
  },
  {
    label: "Summarize week 3",
    description: "Extract the examinable ideas from a specific lecture or tutorial pack.",
    flowKind: "initial_upload",
    timeToValueLabel: "Week-specific revision snapshot",
    query:
      "Summarize this week 3 lecture material, pull out the examinable ideas, and tell me what matters most before class or revision.",
    notice:
      "Week-focused study prompt loaded. Add lecture slides or notes to get a grounded summary in one step.",
    helper:
      "Attach week 3 slides, lecture notes, or a reading pack, then press Enter.",
    valuePromise: "Get a week-specific summary that tells you what is examinable before class, tutorial, or revision.",
    recommendedUpload: "Best with one week-specific lecture pack, tutorial sheet, or reading bundle.",
    firstOutputs: [
      "Examinable ideas and definitions for that week",
      "Likely tutorial or quiz angles to pay attention to",
      "A short list of what matters most before revision",
    ],
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    checklist: [
      "Attach the lecture slides or tutorial pack for one specific week.",
      "Keep extracted notes only so revision material is saved without storing the full file.",
      "Ask for examinable ideas, definitions, and likely revision priorities.",
    ],
    nextSteps: [
      "Review the extracted notes in Files.",
      "Use the graph and supertags to compare week-specific ideas against later uploads.",
    ],
  },
  {
    label: "Compare lecture and reading",
    description: "Find overlap, differences, and gaps between class material and assigned reading.",
    flowKind: "initial_upload",
    timeToValueLabel: "Cross-source comparison in one pass",
    query:
      "Compare this lecture material with the reading I attached. Show the overlap, what is new, and the questions I should ask or revise next.",
    notice:
      "Comparison prompt loaded. Add a lecture file and a reading file to see where they connect.",
    helper:
      "Attach at least two study sources, then press Enter for a grounded comparison.",
    valuePromise: "See where lecture material and assigned reading overlap, differ, and leave revision gaps.",
    recommendedUpload: "Best with one lecture source plus one reading, tutorial, or textbook chapter.",
    firstOutputs: [
      "What the lecture and reading agree on",
      "What is new or missing across the two sources",
      "Questions, gaps, or follow-up revision tasks",
    ],
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    checklist: [
      "Attach one lecture source and one reading or tutorial source.",
      "Keep extracted notes so both sources remain available for later synthesis.",
      "Ask for overlap, new material, and revision gaps.",
    ],
    nextSteps: [
      "Open Linked ideas to inspect the overlap between sources.",
      "Keep building the graph and supertag trail by uploading the next lecture or tutorial pack.",
    ],
  },
  {
    label: "Turn assignment brief into plan",
    description: "Break down an assignment sheet or rubric into tasks, risks, and what to start first.",
    flowKind: "initial_upload",
    timeToValueLabel: "Action plan from the brief",
    query:
      "Use this assignment brief, rubric, or task sheet to explain what is being asked, break it into steps, show likely risks, and tell me what to do first.",
    notice:
      "Assignment-planning prompt loaded. Add the brief, rubric, or task sheet to get a grounded plan immediately.",
    helper:
      "Attach the assignment brief, rubric, or marking guide, then press Enter.",
    valuePromise: "Turn a stressful assignment brief into a clearer action plan without manually extracting all the requirements.",
    recommendedUpload: "Best with the assignment brief, rubric, or instructions sheet.",
    firstOutputs: [
      "What the assignment is actually asking for",
      "A step-by-step plan with the best place to start",
      "Risk areas that could cost marks or waste time",
    ],
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    checklist: [
      "Attach the assignment brief, rubric, or task sheet.",
      "Keep extracted notes only so the key requirements stay searchable.",
      "Ask for a task breakdown, risk areas, and the best first step.",
    ],
    nextSteps: [
      "Review the retained brief summary in Files.",
      "Add lecture notes or readings later so OmnyID can connect the assignment to course material.",
    ],
  },
  {
    label: "Turn lecture recording into revision notes",
    description: "Convert a lecture audio file into grounded notes, concepts, and what to revisit.",
    flowKind: "initial_upload",
    timeToValueLabel: "Audio to usable notes",
    query:
      "Turn this lecture recording into revision notes. Show the key concepts, any repeated emphasis from the lecturer, and what I should revisit first.",
    notice:
      "Lecture-audio prompt loaded. Add a lecture recording, then connect it to slides or notes later for stronger linked study memory.",
    helper:
      "Attach a lecture recording or voice memo, then press Enter.",
    valuePromise: "Turn a long lecture recording into usable revision notes without relistening from the start.",
    recommendedUpload: "Best with one lecture recording, optionally followed by slides or rough notes.",
    firstOutputs: [
      "Key concepts mentioned in the lecture",
      "Important emphasis, repetition, or likely exam cues",
      "A short list of what to revisit next",
    ],
    knowledgeMode: "connected_notes",
    retentionMode: "keep_extracted_only",
    checklist: [
      "Attach a lecture recording or study voice memo.",
      "Keep extracted notes so the transcript remains reusable later.",
      "Ask for key concepts, repeated emphasis, and revision priorities.",
    ],
    nextSteps: [
      "Review the retained transcript-derived notes in Files.",
      "Add slides or lecture notes later so OmnyID can strengthen the graph with cross-source overlap.",
    ],
  },
  {
    label: "Start a source-note chain",
    description: "Turn one reading, lecture, or rough note into the first step of a Zettelkasten study thread.",
    flowKind: "initial_upload",
    timeToValueLabel: "First source note in one run",
    query:
      "Use this lecture, reading, or rough note as Zettelkasten source material. Extract the strongest ideas as source notes, show what seems worth turning into a permanent note later, and tell me which branch to develop next.",
    notice:
      "Zettelkasten starter loaded. Add one reading, lecture, or rough note to begin a reusable source-note chain.",
    helper:
      "Attach one lecture, reading, Markdown note, or rough study note, then press Enter.",
    valuePromise: "Turn one study source into a reusable source note, emerging links, and the next step in a longer note chain.",
    recommendedUpload: "Best with one reading, lecture source, or rough note that contains a single strong idea worth developing.",
    firstOutputs: [
      "Source-note candidates grounded in the uploaded material",
      "One or two promising permanent-note directions",
      "The best next branch to continue instead of starting over",
    ],
    knowledgeMode: "zettelkasten",
    retentionMode: "keep_extracted_only",
    checklist: [
      "Attach one reading, lecture, or rough study note.",
      "Keep extracted notes so the source note and review path stay reusable.",
      "Ask for source notes, promising permanent notes, and the next branch to develop.",
    ],
    nextSteps: [
      "Review the retained source note in Files.",
      "Open the Zettelkasten lens to continue the strongest branch and promote notes later.",
    ],
  },
];

export const DEFAULT_STUDENT_ONBOARDING_QUICK_START =
  STUDENT_ONBOARDING_QUICK_STARTS[0];

export type StudentQuickStartIntent =
  | "first_upload"
  | "week_summary"
  | "compare_sources"
  | "assignment_plan"
  | "lecture_audio"
  | "zettelkasten_chain";

export function studentQuickStartForIntent(intent: StudentQuickStartIntent): OnboardingQuickStartSeed {
  switch (intent) {
    case "week_summary":
      return STUDENT_ONBOARDING_QUICK_STARTS[1] ?? DEFAULT_STUDENT_ONBOARDING_QUICK_START;
    case "compare_sources":
      return STUDENT_ONBOARDING_QUICK_STARTS[2] ?? DEFAULT_STUDENT_ONBOARDING_QUICK_START;
    case "assignment_plan":
      return STUDENT_ONBOARDING_QUICK_STARTS[3] ?? DEFAULT_STUDENT_ONBOARDING_QUICK_START;
    case "lecture_audio":
      return STUDENT_ONBOARDING_QUICK_STARTS[4] ?? DEFAULT_STUDENT_ONBOARDING_QUICK_START;
    case "zettelkasten_chain":
      return STUDENT_ONBOARDING_QUICK_STARTS[5] ?? DEFAULT_STUDENT_ONBOARDING_QUICK_START;
    default:
      return DEFAULT_STUDENT_ONBOARDING_QUICK_START;
  }
}

export function selectStudentAttachmentQuickStart(fileCount: number): OnboardingQuickStartSeed {
  if (fileCount >= 2) {
    return studentQuickStartForIntent("compare_sources");
  }
  if (fileCount === 1) {
    return studentQuickStartForIntent("first_upload");
  }
  return DEFAULT_STUDENT_ONBOARDING_QUICK_START;
}

type AttachmentQuickStartFile = {
  name: string;
  type?: string | null;
};

function normalizedFileName(file: AttachmentQuickStartFile): string {
  return file.name.trim().toLowerCase();
}

function fileNameMatches(file: AttachmentQuickStartFile, pattern: RegExp): boolean {
  return pattern.test(normalizedFileName(file));
}

function looksLikeWeekScopedStudyFile(file: AttachmentQuickStartFile): boolean {
  return fileNameMatches(file, /\bweek[\s_-]?\d+\b|\bwk[\s_-]?\d+\b|\blecture[\s_-]?\d+\b|\btutorial[\s_-]?\d+\b/);
}

function looksLikeLectureFile(file: AttachmentQuickStartFile): boolean {
  return fileNameMatches(file, /\blecture\b|\bslides?\b|\bdeck\b|\btutorial\b|\bclass\b/);
}

function looksLikeReadingFile(file: AttachmentQuickStartFile): boolean {
  return fileNameMatches(file, /\breading\b|\bchapter\b|\btextbook\b|\barticle\b|\bjournal\b|\bpaper\b/);
}

function looksLikeAssignmentFile(file: AttachmentQuickStartFile): boolean {
  return fileNameMatches(file, /\bassignment\b|\bbrief\b|\brubric\b|\btask\b|\bassessment\b|\bmarking\b/);
}

function looksLikeAudioStudyFile(file: AttachmentQuickStartFile): boolean {
  const type = file.type?.toLowerCase().trim() ?? "";
  return type.startsWith("audio/")
    || fileNameMatches(file, /\.(mp3|m4a|wav|aac|ogg|flac)$/)
    || fileNameMatches(file, /\brecording\b|\blecture audio\b|\bvoice memo\b/);
}

export function selectStudentAttachmentQuickStartForFiles(
  files: readonly AttachmentQuickStartFile[],
): OnboardingQuickStartSeed {
  if (files.length === 0) return DEFAULT_STUDENT_ONBOARDING_QUICK_START;

  const hasWeekScopedFile = files.some(looksLikeWeekScopedStudyFile);
  const hasLectureFile = files.some(looksLikeLectureFile);
  const hasReadingFile = files.some(looksLikeReadingFile);
  const hasAssignmentFile = files.some(looksLikeAssignmentFile);
  const hasAudioStudyFile = files.some(looksLikeAudioStudyFile);

  if (hasAssignmentFile) {
    return studentQuickStartForIntent("assignment_plan");
  }
  if (hasAudioStudyFile && files.length === 1 && !hasReadingFile) {
    return studentQuickStartForIntent("lecture_audio");
  }
  if (files.length >= 2 && (hasLectureFile || hasWeekScopedFile) && hasReadingFile) {
    return studentQuickStartForIntent("compare_sources");
  }
  if (files.length >= 2) {
    return studentQuickStartForIntent("compare_sources");
  }
  if (hasWeekScopedFile) {
    return studentQuickStartForIntent("week_summary");
  }
  return studentQuickStartForIntent("first_upload");
}
