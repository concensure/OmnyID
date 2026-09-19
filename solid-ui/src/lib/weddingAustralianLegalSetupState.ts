// @locs-version: 2.0
import {
  normalizeWeddingArtifactSummary,
  type WeddingArtifactSourceLink,
  type WeddingArtifactInput,
} from "@/lib/weddingArtifactState";
import type { WeddingGeneratedArtifact } from "@/lib/weddingArtifactGenerationState";
import {
  type WeddingPlanningScheduleItem,
  type WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingAustralianCelebrantPath =
  | "own_celebrant"
  | "public_or_registry_celebrant"
  | "need_options"
  | "unknown";

export type WeddingAustralianLegalSetupInput = {
  metadata?: unknown;
  weddingDateIso?: string | null;
  dateLabel?: string | null;
  location?: string | null;
  noimDownloaded?: boolean | "yes" | "no" | "unknown" | null;
  celebrantPath?: WeddingAustralianCelebrantPath | string | null;
  celebrantName?: string | null;
  sourceLabels?: readonly string[] | null;
};

export type WeddingAustralianLegalSetupState = {
  metadata: WeddingPlanningMetadata;
  artifact: WeddingGeneratedArtifact;
  artifactInput: WeddingArtifactInput;
  scheduleItems: WeddingPlanningScheduleItem[];
  taskItems: WeddingPlanningTaskItem[];
  guidanceCards: WeddingAustralianLegalGuidanceCard[];
  statusLabels: string[];
  caveatLabels: string[];
};

export type WeddingAustralianLegalGuidanceCard = {
  id: string;
  title: string;
  body: string;
  labels: string[];
  sourceLabels: string[];
};

const OFFICIAL_SOURCE_LABELS = [
  "Attorney-General's Department: Notice of Intended Marriage form",
  "Attorney-General's Department: Register of Marriage Celebrants",
];

const JURISDICTION_LABELS: Array<[RegExp, string]> = [
  [/\bnsw\b|new south wales|sydney|hunter valley|byron bay/i, "NSW"],
  [/\bvic\b|victoria|melbourne/i, "VIC"],
  [/\bqld\b|queensland|brisbane|gold coast/i, "QLD"],
  [/\bwa\b|western australia|perth/i, "WA"],
  [/\bsa\b|south australia|adelaide/i, "SA"],
  [/\btas\b|tasmania|hobart/i, "TAS"],
  [/\bact\b|australian capital territory|canberra/i, "ACT"],
  [/\bnt\b|northern territory|darwin/i, "NT"],
];

export const WEDDING_AUSTRALIAN_LEGAL_SOURCE_LINKS: WeddingArtifactSourceLink[] = [
  {
    label: "Attorney-General's Department: Notice of Intended Marriage",
    url: "https://www.ag.gov.au/families-and-marriage/publications/notice-intended-marriage",
  },
  {
    label: "Attorney-General's Department: marriage celebrant register",
    url: "https://marriage.ag.gov.au/",
  },
];

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueStrings(values: readonly unknown[], limit = 18): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = clean(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function noimStatus(value: WeddingAustralianLegalSetupInput["noimDownloaded"]): "downloaded" | "not_downloaded" | "unknown" {
  if (value === true || value === "yes") return "downloaded";
  if (value === false || value === "no") return "not_downloaded";
  return "unknown";
}

function celebrantStatus(value: WeddingAustralianLegalSetupInput["celebrantPath"]): WeddingAustralianCelebrantPath {
  const normalized = clean(value);
  if (normalized === "own_celebrant" || normalized === "public_or_registry_celebrant" || normalized === "need_options") {
    return normalized;
  }
  return "unknown";
}

function subtractOneMonth(dateIso: string): string | null {
  const date = new Date(`${dateIso}T09:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString();
}

function artifactId(metadata: WeddingPlanningMetadata): string {
  return `wedding_artifact:legal:${safeWeddingLabel(metadata.responseWorkspaceId)}:australian-legal-setup`;
}

function noimLine(status: ReturnType<typeof noimStatus>): string {
  if (status === "downloaded") return "NOIM form status: user says the form has been downloaded.";
  if (status === "not_downloaded") return "NOIM form status: user says the form has not been downloaded yet.";
  return "NOIM form status: not confirmed yet.";
}

function celebrantLine(status: WeddingAustralianCelebrantPath, name: string): string {
  if (status === "own_celebrant") return `Celebrant path: use own authorised celebrant${name ? ` (${name})` : ""}.`;
  if (status === "public_or_registry_celebrant") return "Celebrant path: compare public/registry-style authorised celebrant options.";
  if (status === "need_options") return "Celebrant path: compare own-celebrant and public/registry-style options.";
  return "Celebrant path: not confirmed yet.";
}

function jurisdictionLabel(location: unknown): string {
  const value = clean(location);
  const match = JURISDICTION_LABELS.find(([pattern]) => pattern.test(value));
  return match?.[1] ?? "Australia";
}

function guidanceCards(input: WeddingAustralianLegalSetupInput): WeddingAustralianLegalGuidanceCard[] {
  const noim = noimStatus(input.noimDownloaded);
  const celebrant = celebrantStatus(input.celebrantPath);
  const jurisdiction = jurisdictionLabel(input.location);
  const timingKnown = Boolean(clean(input.weddingDateIso));
  return [
    {
      id: "status",
      title: "Current legal setup status",
      body: `${noimLine(noim)} ${celebrantLine(celebrant, clean(input.celebrantName))}`,
      labels: [`jurisdiction:${jurisdiction}`, `noim:${noim}`, `celebrant:${celebrant}`],
      sourceLabels: OFFICIAL_SOURCE_LABELS,
    },
    {
      id: "how",
      title: "How to progress",
      body: "Use the official NOIM resource, keep identity-document details private by default, and coordinate submission steps directly with an authorised celebrant or registry/public ceremony provider.",
      labels: ["official form", "privacy guardrail", "no submission by OmnyID"],
      sourceLabels: OFFICIAL_SOURCE_LABELS,
    },
    {
      id: "when",
      title: "When to act",
      body: timingKnown
        ? "Create the NOIM deadline check from the wedding date and confirm current timing with the celebrant or authority before relying on it."
        : "Keep the NOIM reminder in review until a wedding date or target date is known.",
      labels: [timingKnown ? "calendar-ready" : "needs date review"],
      sourceLabels: OFFICIAL_SOURCE_LABELS,
    },
    {
      id: "where",
      title: "Where to coordinate",
      body: celebrant === "own_celebrant"
        ? "Coordinate directly with the chosen authorised celebrant and ask what documents, witnesses, ceremony wording, lodging, and rehearsal steps they require."
        : `Compare authorised celebrants and registry/public ceremony options for ${jurisdiction}; do not treat research results as live availability or a booking.`,
      labels: [`jurisdiction:${jurisdiction}`, celebrant === "own_celebrant" ? "own celebrant" : "compare options"],
      sourceLabels: OFFICIAL_SOURCE_LABELS,
    },
    {
      id: "cost",
      title: "Cost questions to ask",
      body: "Ask what is included in the celebrant or registry fee, then separately confirm travel, rehearsal, paperwork/lodging, ceremony customization, after-hours, and certificate-related fees.",
      labels: ["fee questions", "unknown costs separate", "budget handoff"],
      sourceLabels: OFFICIAL_SOURCE_LABELS,
    },
  ];
}

function buildMarkdown(
  input: WeddingAustralianLegalSetupInput,
  sources: string[],
  sourceLinks: readonly WeddingArtifactSourceLink[],
): string {
  const noim = noimStatus(input.noimDownloaded);
  const celebrant = celebrantStatus(input.celebrantPath);
  const celebrantName = clean(input.celebrantName);
  const jurisdiction = jurisdictionLabel(input.location);
  return [
    "# Australian legal setup",
    "",
    "This is a planning aid, not legal advice. OmnyID must not submit forms, book celebrants, or guarantee legal compliance.",
    "",
    "## Current status",
    "",
    `- ${noimLine(noim)}`,
    `- ${celebrantLine(celebrant, celebrantName)}`,
    `- Jurisdiction focus: ${jurisdiction}.`,
    `- Wedding timing: ${clean(input.dateLabel) || clean(input.weddingDateIso) || "not confirmed"}.`,
    `- Wedding location: ${clean(input.location) || "not confirmed"}.`,
    "",
    "## How",
    "",
    "- Use the official Notice of Intended Marriage form from the Australian Attorney-General's Department.",
    "- Give the completed form to an authorised marriage celebrant or relevant registry/public ceremony provider.",
    "- Keep identity, birth, divorce, death, or other legal document details private unless the user explicitly chooses to store them.",
    "",
    "## When",
    "",
    "- Track the NOIM as a legal setup milestone before ceremony planning is treated as complete.",
    "- Create a calendar reminder when the wedding date is known; otherwise keep the reminder as needing date review.",
    "- Ask the celebrant or registry to confirm current notice timing and any exceptional-process requirements.",
    "",
    "## Where",
    "",
    "- If the couple has their own celebrant, coordinate directly with that authorised celebrant.",
    "- If they need options, compare authorised celebrants or registry/public ceremony options for the selected state, territory, or region.",
    "",
    "## Cost questions",
    "",
    "- Ask what the celebrant or registry ceremony fee includes.",
    "- Confirm travel, rehearsal, paperwork, lodging, ceremony customization, after-hours, and certificate-related fees.",
    "- Keep quoted, estimated, and unknown costs separate in budget artifacts.",
    "",
    "## Sources to verify",
    "",
    ...sources.map((source) => `- ${source}`),
    ...sourceLinks.map((source) => `- ${source.label}: ${source.url}`),
  ].join("\n");
}

function taskItems(
  input: WeddingAustralianLegalSetupInput,
  metadata: WeddingPlanningMetadata,
  legalArtifactId: string,
): WeddingPlanningTaskItem[] {
  const noim = noimStatus(input.noimDownloaded);
  const celebrant = celebrantStatus(input.celebrantPath);
  return [
    noim === "downloaded"
      ? {
        id: `${legalArtifactId}:task:give-noim-to-celebrant`,
        title: "Confirm NOIM has been given to the authorised celebrant",
        kind: "legal",
        priority: "high",
        source: "agent",
        reviewStatus: "accepted",
        approvalState: "draft",
        metadata,
        linkedArtifactId: legalArtifactId,
        notes: "Confirm receipt and next paperwork steps with the celebrant or registry. Do not store identity document details by default.",
      }
      : {
        id: `${legalArtifactId}:task:download-noim`,
        title: "Download the official Notice of Intended Marriage form",
        kind: "legal",
        priority: "high",
        source: "agent",
        reviewStatus: "accepted",
        approvalState: "draft",
        metadata,
        linkedArtifactId: legalArtifactId,
        notes: "Use official Attorney-General's Department resources and confirm current requirements with the celebrant or registry.",
      },
    celebrant === "own_celebrant"
      ? {
        id: `${legalArtifactId}:task:contact-own-celebrant`,
        title: "Send NOIM and ceremony timing questions to the chosen celebrant",
        kind: "vendor_follow_up",
        priority: "high",
        source: "agent",
        reviewStatus: "accepted",
        approvalState: "pending_user_approval",
        metadata,
        linkedArtifactId: legalArtifactId,
        notes: "Use an approval-gated email draft. Ask about paperwork timing, fees, rehearsal, and ceremony requirements.",
      }
      : {
        id: `${legalArtifactId}:task:compare-authorised-celebrant-options`,
        title: "Compare authorised celebrant or registry/public ceremony options",
        kind: "research",
        priority: "high",
        source: "agent",
        reviewStatus: "accepted",
        approvalState: "draft",
        metadata,
        linkedArtifactId: legalArtifactId,
        notes: "Research only. Do not claim booking, live availability, or fee certainty until verified with the provider.",
      },
  ];
}

function scheduleItems(
  input: WeddingAustralianLegalSetupInput,
  metadata: WeddingPlanningMetadata,
  legalArtifactId: string,
): WeddingPlanningScheduleItem[] {
  const startAt = clean(input.weddingDateIso) ? subtractOneMonth(clean(input.weddingDateIso)) : null;
  return [{
    id: `${legalArtifactId}:calendar:noim-reminder`,
    title: "NOIM deadline check",
    kind: "noim_reminder",
    dateLabel: startAt ? "One month before wedding date" : "Needs wedding date before scheduling",
    startAt,
    allDay: true,
    location: clean(input.location) || null,
    source: "agent",
    reviewStatus: startAt ? "accepted" : "needs_review",
    approvalState: "draft",
    metadata,
    linkedArtifactId: legalArtifactId,
    notes: "Confirm the current Notice of Intended Marriage timing and requirements with the authorised celebrant or relevant authority.",
  }];
}

export function buildWeddingAustralianLegalSetupState(
  input: WeddingAustralianLegalSetupInput,
): WeddingAustralianLegalSetupState {
  const metadata = normalizeWeddingPlanningMetadata({
    ...(input.metadata && typeof input.metadata === "object" ? input.metadata as Record<string, unknown> : {}),
    artifactKind: "legal",
  });
  const id = artifactId(metadata);
  const sourceLabels = uniqueStrings([...(input.sourceLabels ?? []), ...OFFICIAL_SOURCE_LABELS]);
  const sourceLinks = WEDDING_AUSTRALIAN_LEGAL_SOURCE_LINKS;
  const guidance = guidanceCards(input);
  const markdown = buildMarkdown(input, sourceLabels, sourceLinks);
  const tasks = taskItems(input, metadata, id);
  const schedule = scheduleItems(input, metadata, id);
  const artifactInput: WeddingArtifactInput = {
    id,
    title: "Australian legal setup",
    kind: "legal",
    metadata,
    sourceLabels,
    sourceLinks,
    locationLabels: [clean(input.location)].filter(Boolean),
    linkedTaskIds: tasks.map((task) => task.id),
    linkedCalendarEventIds: schedule.map((item) => item.id),
    exportTargets: ["markdown", "html", "word_doc", "browser_pdf"],
    bodyText: markdown,
  };
  const summary = normalizeWeddingArtifactSummary(artifactInput);
  if (!summary) throw new Error("Australian legal setup artifact failed to normalize.");

  return {
    metadata,
    artifact: { input: artifactInput, summary, markdown, csv: null },
    artifactInput,
    scheduleItems: schedule,
    taskItems: tasks,
    guidanceCards: guidance,
    statusLabels: [
      `Jurisdiction: ${jurisdictionLabel(input.location)}`,
      `NOIM: ${noimStatus(input.noimDownloaded).replace(/_/g, " ")}`,
      `Celebrant: ${celebrantStatus(input.celebrantPath).replace(/_/g, " ")}`,
    ],
    caveatLabels: [
      "Planning aid only; confirm legal requirements with an authorised celebrant or official authority.",
      "No form is lodged and no celebrant is booked by this artifact.",
    ],
  };
}
