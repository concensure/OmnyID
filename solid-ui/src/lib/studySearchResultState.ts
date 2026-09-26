// @locs-version: 1.0
import type { AfpMessage, AfpView } from "@/lib/api";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";

export type StudySearchSection = {
  id: "concepts" | "overlaps" | "risks" | "actions" | "additional";
  title: string;
  items: string[];
};

export type StudySearchHighlight = {
  title: string;
  body: string;
  tone: "sky" | "amber" | "emerald" | "violet";
};

export type StudySearchSnapshot = {
  headline: string;
  subheadline: string;
  highlights: StudySearchHighlight[];
};

type StudySearchResultInput = {
  query?: string;
  summary?: string;
  bullets?: string[];
  uploadedSourceCount?: number;
  attachmentPolicyLabel?: string | null;
};

const STUDY_QUERY_MARKERS = [
  "study",
  "lecture",
  "reading",
  "revise",
  "revision",
  "exam",
  "tutorial",
  "course",
  "class",
  "notes",
  "slides",
  "professor",
  "week ",
  "assignment",
  "chapter",
  "syllabus",
];

const SECTION_MATCHERS: Array<{
  id: StudySearchSection["id"];
  title: string;
  keywords: string[];
}> = [
  {
    id: "actions",
    title: "Next revision actions",
    keywords: ["revise", "review", "practice", "focus", "next", "memor", "quiz", "test", "flashcard", "re-read", "ask"],
  },
  {
    id: "risks",
    title: "Exam risk and gaps",
    keywords: ["risk", "gap", "unclear", "confus", "missing", "weak", "challeng", "new", "difference", "contrast", "misunderstand", "exam"],
  },
  {
    id: "overlaps",
    title: "Overlaps and links",
    keywords: ["overlap", "connect", "linked", "relation", "compare", "similar", "also", "supports", "extends", "across", "between"],
  },
  {
    id: "concepts",
    title: "Main concepts",
    keywords: ["concept", "idea", "theme", "definition", "principle", "theory", "explains", "means", "topic", "covers"],
  },
];

function normalizeText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isStudySearchResult(input: StudySearchResultInput): boolean {
  if ((input.uploadedSourceCount ?? 0) > 0) return true;
  if ((input.attachmentPolicyLabel ?? "").trim()) return true;
  const query = normalizeText(input.query);
  const summary = normalizeText(input.summary);
  const joinedBullets = (input.bullets ?? []).join(" ").toLowerCase();
  return STUDY_QUERY_MARKERS.some((marker) =>
    query.includes(marker) || summary.includes(marker) || joinedBullets.includes(marker)
  );
}

function classifyBullet(bullet: string): StudySearchSection["id"] {
  const normalized = normalizeText(bullet);
  for (const matcher of SECTION_MATCHERS) {
    if (matcher.keywords.some((keyword) => normalized.includes(keyword))) {
      return matcher.id;
    }
  }
  return "additional";
}

function uniqueItems(items: string[]): string[] {
  return items.filter((item, index, all) => item.trim().length > 0 && all.indexOf(item) === index);
}

export function buildStudySearchSections(input: StudySearchResultInput): StudySearchSection[] {
  const bullets = uniqueItems(input.bullets ?? []);
  const buckets = new Map<StudySearchSection["id"], string[]>();
  for (const bullet of bullets) {
    const id = classifyBullet(bullet);
    buckets.set(id, [...(buckets.get(id) ?? []), bullet]);
  }

  if ((buckets.get("concepts") ?? []).length === 0 && bullets.length > 0) {
    const fallbackConcepts = bullets.slice(0, Math.min(2, bullets.length));
    buckets.set("concepts", fallbackConcepts);
    const remaining = bullets.filter((bullet) => !fallbackConcepts.includes(bullet));
    for (const bullet of remaining) {
      const id = classifyBullet(bullet);
      if (id === "concepts") continue;
      if (!(buckets.get(id) ?? []).includes(bullet)) {
        buckets.set(id, [...(buckets.get(id) ?? []), bullet]);
      }
    }
  }

  if ((buckets.get("actions") ?? []).length === 0 && bullets.length > 0) {
    const fallbackActions: string[] = [];
    if ((input.uploadedSourceCount ?? 0) > 1) {
      fallbackActions.push("Compare the retained sources in Linked ideas to see where the lecture and reading reinforce or diverge.");
    }
    fallbackActions.push("Review the retained extracted notes and turn the highest-priority concepts into a short revision checklist.");
    buckets.set("actions", fallbackActions);
  }

  const sections: StudySearchSection[] = [
    { id: "concepts", title: "Main concepts", items: buckets.get("concepts") ?? [] },
    { id: "overlaps", title: "Overlaps and links", items: buckets.get("overlaps") ?? [] },
    { id: "risks", title: "Exam risk and gaps", items: buckets.get("risks") ?? [] },
    { id: "actions", title: "Next revision actions", items: buckets.get("actions") ?? [] },
    { id: "additional", title: "Additional notes", items: buckets.get("additional") ?? [] },
  ];
  return sections.filter((section) => section.items.length > 0);
}

function firstSectionItem(
  sections: readonly StudySearchSection[],
  id: StudySearchSection["id"],
): string | null {
  const section = sections.find((entry) => entry.id === id);
  const item = section?.items[0]?.trim();
  return item ? item : null;
}

export function buildStudySearchSnapshot(input: {
  sections: readonly StudySearchSection[];
  uploadedSourceCount?: number;
  summary?: string;
}): StudySearchSnapshot | null {
  if (input.sections.length === 0) return null;
  const concept = firstSectionItem(input.sections, "concepts");
  const risk = firstSectionItem(input.sections, "risks");
  const action = firstSectionItem(input.sections, "actions");
  const overlap = firstSectionItem(input.sections, "overlaps");
  const sourceCount = Math.max(0, input.uploadedSourceCount ?? 0);

  const headline =
    sourceCount > 1
      ? `Grounded revision snapshot from ${sourceCount} study sources`
      : sourceCount === 1
        ? "Grounded revision snapshot from your uploaded study source"
        : "Grounded revision snapshot";
  const subheadline =
    action
      ? `Start with the next concrete revision step, then use the linked notes to go deeper.`
      : input.summary?.trim()
        ? input.summary.trim()
        : "Use this snapshot to decide what to revise first.";

  const highlights: StudySearchHighlight[] = [];
  if (concept) {
    highlights.push({
      title: "Focus first",
      body: concept,
      tone: "sky",
    });
  }
  if (risk) {
    highlights.push({
      title: "Biggest exam risk",
      body: risk,
      tone: "amber",
    });
  } else if (overlap) {
    highlights.push({
      title: "Strongest connection",
      body: overlap,
      tone: "violet",
    });
  }
  if (action) {
    highlights.push({
      title: "Do next",
      body: action,
      tone: "emerald",
    });
  }

  if (highlights.length === 0) return null;
  return {
    headline,
    subheadline,
    highlights,
  };
}

function studySectionsForMessage(message: AfpMessage): StudySearchSection[] {
  const content = decryptedDisplayContent(message);
  const query = typeof content.query === "string" ? content.query : "";
  const summary = typeof content.summary === "string" ? content.summary : "";
  const bullets = Array.isArray(content.bullets)
    ? content.bullets.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  const uploadedSourceCount =
    typeof message.metadata?.uploaded_source_count === "number"
      ? message.metadata.uploaded_source_count
      : 0;
  const attachmentPolicyLabel =
    typeof message.metadata?.attachment_policy_label === "string"
      ? message.metadata.attachment_policy_label
      : null;
  if (!isStudySearchResult({ query, summary, bullets, uploadedSourceCount, attachmentPolicyLabel })) {
    return [];
  }
  return buildStudySearchSections({ query, summary, bullets, uploadedSourceCount, attachmentPolicyLabel });
}

function viewWithStudySections(view: AfpView, sections: StudySearchSection[]): AfpView {
  if (view.format === "search_result") {
    return {
      ...view,
      content: {
        ...view.content,
        study_sections: sections,
      },
    };
  }

  if (
    view.format === "a2ui.v1"
    && view.content.kind === "panel"
    && Array.isArray(view.content.nodes)
  ) {
    const baseNodes = view.content.nodes.filter((node) => {
      if (typeof node !== "object" || node === null) return true;
      const id = "id" in node ? node.id : null;
      return typeof id !== "string" || !id.startsWith("study-section-");
    });
    const sectionNodes = sections
      .filter((section) => section.id !== "additional")
      .map((section) => ({
        id: `study-section-${section.id}`,
        type: "table",
        props: {
          columns: [section.title],
          rows: section.items.map((item) => [item]),
          caption: "Study synthesis",
        },
      }));
    const additional = sections.find((section) => section.id === "additional");
    if (additional) {
      sectionNodes.push({
        id: "study-section-additional",
        type: "table",
        props: {
          columns: [additional.title],
          rows: additional.items.map((item) => [item]),
          caption: "Study synthesis",
        },
      });
    }
    return {
      ...view,
      content: {
        ...view.content,
        study_sections: sections,
        nodes: [...baseNodes, ...sectionNodes],
      },
    };
  }

  return view;
}

export function explicitStudySearchSections(message: AfpMessage): StudySearchSection[] {
  const content = decryptedDisplayContent(message);
  if (Array.isArray(content.study_sections)) {
    return content.study_sections.flatMap((entry: unknown): StudySearchSection[] => {
      if (typeof entry !== "object" || entry === null) return [];
      const id = "id" in entry ? entry.id : null;
      const title = "title" in entry ? entry.title : null;
      const items = "items" in entry && Array.isArray(entry.items)
        ? entry.items.filter((item: unknown): item is string => typeof item === "string" && item.trim().length > 0)
        : [];
      if (
        (id === "concepts" || id === "overlaps" || id === "risks" || id === "actions" || id === "additional")
        && typeof title === "string"
        && items.length > 0
      ) {
        return [{ id, title, items }];
      }
      return [];
    });
  }
  return [];
}

export function decorateSearchPreviewMessageWithStudyStructure(message: AfpMessage): AfpMessage {
  const sections = studySectionsForMessage(message);
  if (sections.length === 0) return message;
  const content = decryptedDisplayContent(message);
  return {
    ...message,
    content: {
      ...content,
      study_sections: sections,
    },
    metadata: {
      ...(message.metadata ?? {}),
      study_result: true,
      study_section_count: sections.length,
    },
    views: message.views.map((view) => viewWithStudySections(view, sections)),
  };
}
