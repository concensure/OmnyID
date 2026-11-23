// @locs-version: 1.0
import type { AttachmentGroundingEvidence } from "@/lib/attachmentGroundingEvidence";
import type { OnboardingQuickStartSeed } from "@/lib/onboardingQuickStart";
import {
  extractReportSeedMetadata,
  isReportQuickStartSeed,
} from "@/lib/reportSeedMetadata";
import {
  normalizeStudyLaunchMetadata,
  studyAcademicScopeFromStudyLaunchMetadata,
} from "@/lib/studyLaunchMetadataState";
import {
  buildStudyAcademicScopeCarryoverBadges,
} from "@/lib/studyAcademicScopeState";

export type StudyNextSessionCarryoverCard = {
  label: string;
  detail: string;
  tone: "sky" | "emerald" | "violet" | "amber";
};

export type StudyNextSessionCarryoverState = {
  headline: string;
  detail: string;
  badge: string;
  cards: StudyNextSessionCarryoverCard[];
  focusBadges: string[];
  primaryActionLabel: string;
  secondaryActionLabel: string | null;
};

const INTERNAL_BADGE_PREFIXES = [
  "academic_kind:",
  "chapter:",
  "chapter_tag:",
  "coverage:",
  "deadline:",
  "due:",
  "module:",
  "output_format:",
  "provider:",
  "readiness:",
  "report_kind:",
  "retention:",
  "route_source:",
  "session:",
  "source_need:",
  "stress:",
  "unit:",
  "unit_tag:",
  "urgency:",
];

function displayBadge(value: string | null | undefined): string | null {
  const cleaned = value?.trim();
  return cleaned && cleaned.length > 0 ? cleaned : null;
}

function normalizedSeedBadges(seed: OnboardingQuickStartSeed | null): string[] {
  return (seed?.focusBadges ?? [])
    .map((badge) => badge.trim())
    .filter((badge) => badge.length > 0);
}

function hasBadge(seed: OnboardingQuickStartSeed | null, badge: string): boolean {
  const normalizedBadge = badge.toLowerCase();
  return normalizedSeedBadges(seed).some((value) => value.toLowerCase() === normalizedBadge);
}

function medicalTopologyCarryoverBadges(seed: OnboardingQuickStartSeed | null): string[] {
  if (!hasBadge(seed, "medical_topology_coverage")) return [];
  return [
    "medical topology coverage",
    hasBadge(seed, "topology_gap:source_only") ? "source-only topology gap" : null,
    hasBadge(seed, "topology_gap:needs_locator") ? "needs source locator" : null,
    hasBadge(seed, "topology_gap:overload") ? "review overload" : null,
  ].filter((value): value is string => Boolean(value));
}

function fallbackFocusBadges(seed: OnboardingQuickStartSeed | null): string[] {
  const launchMetadata = normalizeStudyLaunchMetadata(seed);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const badge of [
    ...buildStudyAcademicScopeCarryoverBadges({
      ...studyAcademicScopeFromStudyLaunchMetadata(launchMetadata),
    }, { limit: 5 }),
    ...(seed?.focusBadges ?? [])
      .map((badge) => badge.trim())
      .filter((badge) => {
        const normalized = badge.toLowerCase();
        return badge.length > 0 && !INTERNAL_BADGE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
      }),
  ]) {
    const item = displayBadge(badge);
    const key = item?.toLowerCase();
    if (!item || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= 6) break;
  }
  return result;
}

function focusBadges(seed: OnboardingQuickStartSeed | null): string[] {
  if (seed && isReportQuickStartSeed(seed)) {
    const metadata = extractReportSeedMetadata(seed);
    return [
      metadata.label,
      ...buildStudyAcademicScopeCarryoverBadges(metadata, { limit: 5 }),
      ...medicalTopologyCarryoverBadges(seed),
    ]
      .map(displayBadge)
      .filter((badge): badge is string => Boolean(badge))
      .slice(0, 8);
  }
  return fallbackFocusBadges(seed);
}

function medicalTopologyCarryoverCard(seed: OnboardingQuickStartSeed | null): StudyNextSessionCarryoverCard | null {
  if (!hasBadge(seed, "medical_topology_coverage")) return null;
  if (hasBadge(seed, "topology_gap:needs_locator")) {
    return {
      label: "Medical topology carryover",
      detail: "Next run should preserve the medical topology scope and fix source-locator gaps before treating generated cloze or vignette rows as source-grounded.",
      tone: "amber",
    };
  }
  if (hasBadge(seed, "topology_gap:overload")) {
    return {
      label: "Medical topology carryover",
      detail: "Next run should reduce review load by upgrading, consolidating, or targeting shallow duplicate cards instead of expanding card count.",
      tone: "amber",
    };
  }
  if (hasBadge(seed, "topology_gap:source_only")) {
    return {
      label: "Medical topology carryover",
      detail: "Next run should use the same source-only topology gap to generate only missing source-backed cloze or short-vignette rows.",
      tone: "sky",
    };
  }
  return {
    label: "Medical topology carryover",
    detail: "Next run can reuse the medical topology coverage scope, concept tags, and source-locator state instead of starting from a generic deck prompt.",
    tone: "sky",
  };
}

function rememberedMaterialLabel(evidence: AttachmentGroundingEvidence): string {
  if (evidence.retentionMode === "keep_file") {
    return "The next study session can reuse the original files, extracted content, study metadata, and supertags from this run.";
  }
  if (evidence.retentionMode === "keep_extracted_only") {
    return "The next study session can reuse extracted content, study metadata, and supertags from this run without needing the original file again.";
  }
  return "Nothing from this run will carry into the next session unless the same material is rerun with retention enabled.";
}

function nextRunLabel(
  evidence: AttachmentGroundingEvidence,
  seed: OnboardingQuickStartSeed | null,
): string {
  if (evidence.retentionMode === "keep_nothing") {
    return "Best next run: repeat this grounded question with kept extracted notes so the result stops being session-only.";
  }
  if (seed?.valuePromise?.trim()) {
    return `Best next run: ${seed.valuePromise.trim()}`;
  }
  if (evidence.knowledgeMode === "zettelkasten") {
    return "Best next run: continue the same note chain, promote stronger source notes, and identify permanent-note candidates.";
  }
  if (evidence.sourceCount > 1) {
    return "Best next run: stay on the same topic, compare the retained sources again, and sharpen revision priorities.";
  }
  return "Best next run: keep working from the same retained source instead of restarting with a generic study prompt.";
}

function strengthenLabel(
  evidence: AttachmentGroundingEvidence,
  seed: OnboardingQuickStartSeed | null,
): string {
  if (evidence.retentionMode === "keep_nothing") {
    return "First fix retention, then add one adjacent lecture, reading, or note if you want stronger carryover next time.";
  }
  if (evidence.knowledgeMode === "zettelkasten") {
    return "Add one adjacent source or follow-up question to deepen the same branch instead of opening a new disconnected topic.";
  }
  if (evidence.sourceCount > 1) {
    return "Add one adjacent source from the same course or week only when you want denser overlap, not when the current pack already answers the question.";
  }
  return seed?.recommendedUpload?.trim()
    ? `To strengthen the next session, follow the same pattern: ${seed.recommendedUpload.trim()}.`
    : "To strengthen the next session, add one adjacent lecture, reading, or rough note from the same topic.";
}

export function buildStudyNextSessionCarryoverState(input: {
  evidence: AttachmentGroundingEvidence | null;
  continuationSeed: OnboardingQuickStartSeed | null;
}): StudyNextSessionCarryoverState | null {
  const evidence = input.evidence;
  if (!evidence || evidence.sourceCount === 0) return null;

  const carryoverReady = evidence.retentionMode !== "keep_nothing";
  const carryoverBadges = focusBadges(input.continuationSeed);
  const medicalCarryoverCard = medicalTopologyCarryoverCard(input.continuationSeed);

  return {
    headline: carryoverReady
      ? "The next study session can start from this result instead of starting from scratch."
      : "This result is grounded, but the next study session will not inherit it yet.",
    detail: carryoverReady
      ? evidence.knowledgeMode === "zettelkasten"
        ? "Because this run retained note-ready material, OmnyID should be able to reopen the same thread as source notes, review stages, and permanent-note candidates."
        : "Because this run retained study material, OmnyID should be able to reopen the same topic through Files, supertags, and linked retrieval without the student re-explaining the sources."
      : "Retention is the missing piece. Until extracted notes or files are kept, OmnyID cannot turn this answer into a reusable study trail across sessions.",
    badge: carryoverReady ? "Next session ready" : "Session-only result",
    cards: [
      {
        label: "What OmnyID remembers",
        detail: rememberedMaterialLabel(evidence),
        tone: carryoverReady ? "emerald" : "amber",
      },
      {
        label: "Best next run",
        detail: nextRunLabel(evidence, input.continuationSeed),
        tone: "sky",
      },
      medicalCarryoverCard,
      {
        label: "How to make the carryover stronger",
        detail: strengthenLabel(evidence, input.continuationSeed),
        tone: evidence.knowledgeMode === "zettelkasten" ? "violet" : "emerald",
      },
    ].filter((card): card is StudyNextSessionCarryoverCard => Boolean(card)),
    focusBadges: carryoverBadges,
    primaryActionLabel: carryoverReady ? "Load next study run" : "Rerun with retention",
    secondaryActionLabel: carryoverReady ? "Review retained sources first" : null,
  };
}
