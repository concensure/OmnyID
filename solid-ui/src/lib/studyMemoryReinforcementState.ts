// @locs-version: 1.0
import type { AttachmentGroundingEvidence } from "@/lib/attachmentGroundingEvidence";

export type StudyMemoryReinforcementSignal = {
  label: string;
  value: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyMemoryReinforcementState = {
  grade: "one_off" | "fragile" | "developing" | "reinforced";
  headline: string;
  detail: string;
  badge: string;
  signals: StudyMemoryReinforcementSignal[];
};

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(
    values
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim()),
  )];
}

function repeatedAnchorCount(values: readonly string[]): number {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.values()].filter((count) => count >= 2).length;
}

export function buildStudyMemoryReinforcementState(
  evidence: AttachmentGroundingEvidence | null,
): StudyMemoryReinforcementState | null {
  if (!evidence || evidence.sourceDescriptors.length === 0) return null;

  const courseTags = uniqueNonEmpty(evidence.sourceDescriptors.map((item) => item.courseTag));
  const weekTags = uniqueNonEmpty(evidence.sourceDescriptors.map((item) => item.weekTag));
  const lectureTags = uniqueNonEmpty(evidence.sourceDescriptors.map((item) => item.lectureTag));
  const academicKinds = uniqueNonEmpty(evidence.sourceDescriptors.map((item) => item.academicKind));
  const zettelkastenStages = uniqueNonEmpty(evidence.sourceDescriptors.map((item) => item.zettelkastenStage));

  const repeatedCourseCount = repeatedAnchorCount(
    evidence.sourceDescriptors.map((item) => item.courseTag).filter((value): value is string => Boolean(value)),
  );
  const repeatedWeekCount = repeatedAnchorCount(
    evidence.sourceDescriptors.map((item) => item.weekTag).filter((value): value is string => Boolean(value)),
  );
  const repeatedLectureCount = repeatedAnchorCount(
    evidence.sourceDescriptors.map((item) => item.lectureTag).filter((value): value is string => Boolean(value)),
  );
  const mixedKindCount = academicKinds.length;

  if (evidence.retentionMode === "keep_nothing") {
    return {
      grade: "one_off",
      headline: "This run did not reinforce long-term study memory yet.",
      detail: "The answer is grounded, but none of the extracted study context will remain after this chat, so reinforcement cannot accumulate across uploads yet.",
      badge: "Session only",
      signals: [
        {
          label: "What is missing",
          value: "Retained extracted notes are required before repeated course or week anchors can strengthen retrieval over time.",
          tone: "amber",
        },
        {
          label: "Best fix",
          value: "Rerun with Keep extracted notes so the same material can be reinforced in Files, supertags, and the graph.",
          tone: "sky",
        },
      ],
    };
  }

  const reinforcementStrength =
    repeatedCourseCount * 2
    + repeatedWeekCount * 2
    + repeatedLectureCount
    + Math.max(0, mixedKindCount - 1)
    + (zettelkastenStages.length > 0 ? 1 : 0);

  const signals: StudyMemoryReinforcementSignal[] = [];

  if (repeatedCourseCount > 0 || repeatedWeekCount > 0 || repeatedLectureCount > 0) {
    const parts = [
      repeatedCourseCount > 0 ? `${repeatedCourseCount} repeated course anchor${repeatedCourseCount === 1 ? "" : "s"}` : null,
      repeatedWeekCount > 0 ? `${repeatedWeekCount} repeated week anchor${repeatedWeekCount === 1 ? "" : "s"}` : null,
      repeatedLectureCount > 0 ? `${repeatedLectureCount} repeated lecture anchor${repeatedLectureCount === 1 ? "" : "s"}` : null,
    ].filter((value): value is string => Boolean(value));
    signals.push({
      label: "Reinforced anchors",
      value: `This run repeated ${parts.join(", ")}, which makes later retrieval more trustworthy than a one-off upload.`,
      tone: "emerald",
    });
  } else {
    signals.push({
      label: "Anchor coverage",
      value: "The material is retained, but it still relies on one isolated anchor. A second related upload from the same course or week would reinforce retrieval much more.",
      tone: "amber",
    });
  }

  if (mixedKindCount >= 2) {
    signals.push({
      label: "Source mix",
      value: `${mixedKindCount} study source types are present, which is better for comparison and revision than repeating only one file type.`,
      tone: "violet",
    });
  } else if (academicKinds.length === 1) {
    signals.push({
      label: "Source mix",
      value: `Right now the retained pack leans on ${academicKinds[0].replace(/_/g, " ")} only. Add a reading, lecture, note, or audio companion to deepen reinforcement.`,
      tone: "sky",
    });
  }

  if (zettelkastenStages.length > 0) {
    signals.push({
      label: "Note-chain carryover",
      value: `Zettelkasten stages are present (${zettelkastenStages.join(", ")}), so reinforcement can continue through note review and promotion as well as source overlap.`,
      tone: "emerald",
    });
  } else if (courseTags.length === 1 && weekTags.length === 1) {
    signals.push({
      label: "Next reinforcement move",
      value: `Stay inside ${courseTags[0]} ${String.fromCharCode(183)} ${weekTags[0]} for the next upload so OmnyID strengthens one academic thread instead of fragmenting the graph.`,
      tone: "sky",
    });
  } else {
    signals.push({
      label: "Next reinforcement move",
      value: "Use the next upload or follow-up question on the same topic so OmnyID reinforces one study thread instead of creating disconnected material.",
      tone: "sky",
    });
  }

  if (reinforcementStrength >= 5 && evidence.sourceCount >= 2) {
    return {
      grade: "reinforced",
      headline: "This run reinforced a reusable study memory trail.",
      detail: "Repeated academic anchors and source diversity are strong enough here that later retrieval should be noticeably more trustworthy than a single isolated upload.",
      badge: "Reinforced memory",
      signals,
    };
  }

  if (reinforcementStrength >= 3) {
    return {
      grade: "developing",
      headline: "This run is starting to reinforce study memory across uploads.",
      detail: "Useful anchors are repeating, but the retained material still needs one more related source or follow-up to become reliably reusable under pressure.",
      badge: "Developing reinforcement",
      signals,
    };
  }

  return {
    grade: "fragile",
    headline: "This run created memory, but it is still fragile.",
    detail: "The retained material is useful, but reinforcement is still shallow. Right now the value comes more from storage and first-pass retrieval than from a durable connected study network.",
    badge: "Fragile memory",
    signals,
  };
}
