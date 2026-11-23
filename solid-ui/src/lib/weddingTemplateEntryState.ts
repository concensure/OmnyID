// @locs-version: 2.0
import {
  buildWeddingArtifactGenerationState,
  type WeddingArtifactGenerationState,
} from "@/lib/weddingArtifactGenerationState";
import {
  buildWeddingAustralianLegalSetupState,
  type WeddingAustralianLegalSetupState,
} from "@/lib/weddingAustralianLegalSetupState";
import {
  buildWeddingKnowledgeGraphState,
  type WeddingKnowledgeGraphState,
} from "@/lib/weddingKnowledgeGraphState";
import {
  buildWeddingPresentationState,
  type WeddingPresentationState,
} from "@/lib/weddingPresentationState";
import {
  buildWeddingResponseWorkspaceViewState,
  type WeddingResponseWorkspaceViewState,
} from "@/lib/weddingResponseWorkspaceViewState";
import {
  buildWeddingRichResponseRendererState,
  type WeddingRichResponseRendererState,
} from "@/lib/weddingRichResponseRendererState";
import {
  normalizeWeddingPlanningMetadata,
  safeWeddingLabel,
  weddingPlanIdFromSeed,
  weddingResponseWorkspaceIdFromSeed,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";
import type {
  WeddingPlanningScheduleItem,
  WeddingPlanningTaskItem,
} from "@/lib/weddingCalendarProjectionState";
import { WEDDING_FORMAT_RECOMMENDED_STARTERS, type WeddingFormat } from "@/lib/weddingFormatState";

export type WeddingTemplateStarterIntent =
  | "venue_search"
  | "budget_plan"
  | "guest_list"
  | "vendor_emails"
  | "run_sheet"
  | "registry";

export type WeddingTemplateStarterPrompt = {
  intent: WeddingTemplateStarterIntent;
  label: string;
  prompt: string;
  recommended: boolean;
};

export type WeddingTemplateEntryState = {
  templateId: "wedding_planning";
  label: string;
  description: string;
  metadata: WeddingPlanningMetadata;
  starterPrompts: WeddingTemplateStarterPrompt[];
  firstResponseInstruction: string;
  canStartUnder60Seconds: boolean;
};

export type WeddingTemplateDemoState = {
  entry: WeddingTemplateEntryState;
  artifactGeneration: WeddingArtifactGenerationState;
  legalSetup: WeddingAustralianLegalSetupState;
  knowledgeGraph: WeddingKnowledgeGraphState;
  presentation: WeddingPresentationState;
  richResponse: WeddingRichResponseRendererState;
  workspaceView: WeddingResponseWorkspaceViewState;
  scheduleItems: WeddingPlanningScheduleItem[];
  taskItems: WeddingPlanningTaskItem[];
  demoLabels: string[];
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function demoProjectionStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    removeItem: (key: string) => {
      values.delete(key);
    },
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

export function weddingTemplateStarterPrompts(weddingFormat?: WeddingFormat | null): WeddingTemplateStarterPrompt[] {
  const intimate = weddingFormat === "elopement" || weddingFormat === "micro";
  const recommended = new Set(weddingFormat ? WEDDING_FORMAT_RECOMMENDED_STARTERS[weddingFormat] : ["venue_search"]);
  return [
    {
      intent: "venue_search",
      label: "Find venues",
      prompt: intimate
        ? "Help me compare ceremony and reception options that work for our smaller guest count, priorities, minimum spends, accessibility, and location."
        : "Help me compare wedding venues for our date, guest count, budget comfort, priorities, and location.",
      recommended: recommended.has("venue_search"),
    },
    {
      intent: "budget_plan",
      label: "Build budget",
      prompt: weddingFormat === "undecided" ? "Compare what 10, 30 and 80 guests would mean for our budget and plan." : "Create a wedding budget sheet with estimates, deposits, due amounts, hidden-cost warnings, and next checks.",
      recommended: recommended.has("budget_plan"),
    },
    {
      intent: "guest_list",
      label: "Organize guests",
      prompt: "Help me structure a guest list, RSVP tracking plan, family groups, dietary notes, and privacy-safe sharing.",
      recommended: recommended.has("guest_list"),
    },
    {
      intent: "vendor_emails",
      label: "Draft vendor emails",
      prompt: weddingFormat === "elopement" ? "Draft approval-gated enquiries to a celebrant and photographer asking about availability, inclusions and legal paperwork." : "Draft approval-gated vendor emails that ask for availability, packages, inclusions, and next steps.",
      recommended: recommended.has("vendor_emails"),
    },
    {
      intent: "run_sheet",
      label: "Make run sheet",
      prompt: weddingFormat === "elopement" ? "Create a wedding run sheet with ceremony, vendor arrival, photos, and contingency timing." : "Create a wedding run sheet with ceremony, reception, vendor arrival, photos, transport, and contingency timing.",
      recommended: false,
    },
    {
      intent: "registry",
      label: "Draft registry",
      prompt: "Create a private registry draft with categories, priorities, price bands, and export options.",
      recommended: false,
    },
  ];
}

export function buildWeddingTemplateEntryState(input: {
  seed?: string | null;
  sourceResponseId?: string | null;
  weddingFormat?: "elopement" | "micro" | "undecided" | "larger" | null;
} = {}): WeddingTemplateEntryState {
  const seed = clean(input.seed) || "wedding planning";
  const weddingPlanId = weddingPlanIdFromSeed(seed);
  const responseWorkspaceId = weddingResponseWorkspaceIdFromSeed(`${safeWeddingLabel(seed)}-first-response`, weddingPlanId);
  const metadata = normalizeWeddingPlanningMetadata({
    weddingPlanId,
    responseWorkspaceId,
    sourceResponseId: input.sourceResponseId ?? null,
    supertags: ["template:wedding_planning", "event:wedding", "response_workspace"],
  });

  return {
    templateId: "wedding_planning",
    label: "Wedding Planning",
    description: "Plan only what your kind of wedding needs, from legal essentials and a small ceremony to a larger celebration.",
    metadata,
    starterPrompts: weddingTemplateStarterPrompts(input.weddingFormat),
    firstResponseInstruction: [
      "Create a wedding planning response with one simple question if details are missing.",
      "Attach generated wedding documents and keep emails or sharing approval-gated.",
      "Do not claim live availability, payment, booking, registry publishing, or external calendar sync unless an integration proves it.",
      "Use the saved celebration format to order suggestions, but never infer that format as a settled choice from guest count alone.",
    ].join(" "),
    canStartUnder60Seconds: true,
  };
}

export function buildWeddingTemplateDemoState(): WeddingTemplateDemoState {
  const entry = buildWeddingTemplateEntryState({
    seed: "sample harbour wedding",
    sourceResponseId: "demo:wedding-response",
    weddingFormat: "micro",
  });
  const demoMetadata = {
    weddingPlanId: entry.metadata.weddingPlanId,
    responseWorkspaceId: entry.metadata.responseWorkspaceId,
    sourceResponseId: entry.metadata.sourceResponseId,
    supertags: [...entry.metadata.supertags, "demo:wedding_planning", "sample_data"],
  };
  const artifactGeneration = buildWeddingArtifactGenerationState({
    metadata: demoMetadata,
    title: "Sample harbour wedding research",
    researchNotes: [
      "Sample venue comparison focuses on water views, wet-weather backup, and transport access.",
      "Sample timeline assumes a spring ceremony and early-evening reception.",
    ],
    assumptions: ["Sample data only; not real vendor availability.", "Guest count example: 24.", "Celebration format: micro wedding."],
    verificationActions: ["Replace sample vendors with real venues.", "Confirm live pricing and inclusions before booking."],
    sourceLabels: ["Sample demo data"],
    locationLabels: ["Sydney Harbour"],
    vendors: [
      {
        name: "Harbour House",
        category: "venue",
        location: "Sydney Harbour",
        priceEstimate: "Sample $22k-$30k",
        capacity: "Sample 20-40",
        fitReason: "Water views and indoor backup.",
        risks: "Sample only; availability unverified.",
        contact: "demo-only@example.invalid",
        source: "Sample demo data",
      },
      {
        name: "Garden Hall",
        category: "venue",
        location: "Inner West",
        priceEstimate: "Sample $18k-$26k",
        capacity: "Sample 80-110",
        fitReason: "Lower transport friction and garden photos.",
        risks: "Sample only; package inclusions unverified.",
        contact: "demo-only@example.invalid",
        source: "Sample demo data",
      },
    ],
    budgetRows: [
      { category: "Venue", estimate: "Sample $25000", paidAmount: "$0", dueAmount: "Unknown", vendor: "Harbour House" },
      { category: "Catering", estimate: "Sample $14000", paidAmount: "$0", dueAmount: "Unknown", warning: "Check staffing and cakeage." },
    ],
    emailDrafts: [{
      recipientLabel: "Harbour House events team",
      subject: "Sample wedding availability request",
      body: "This is a sample draft. Please replace with real details before sending.",
      disclosureSummary: "Demo only; no real email should be sent.",
      vendor: "Harbour House",
    }],
    registryRows: [
      { item: "Dinnerware set", category: "Kitchen", priority: "high", priceBand: "Sample $100-$200", source: "Sample demo data" },
    ],
  });
  const legalSetup = buildWeddingAustralianLegalSetupState({
    metadata: demoMetadata,
    weddingDateIso: "2027-10-03",
    dateLabel: "3 Oct 2027",
    location: "Sydney, NSW",
    noimDownloaded: "unknown",
    celebrantPath: "need_options",
    sourceLabels: ["Sample demo data"],
  });
  const artifactInputs = [
    ...artifactGeneration.artifactInputs,
    legalSetup.artifactInput,
  ];
  const artifactSummaries = [
    ...artifactGeneration.summaries,
    legalSetup.artifact.summary,
  ];
  const scheduleItems: WeddingPlanningScheduleItem[] = [
    ...legalSetup.scheduleItems,
    {
      id: "demo-venue-tour",
      title: "Sample venue tour",
      kind: "venue_tour",
      startAt: "2027-09-18T10:00:00+10:00",
      location: "Sydney Harbour",
      source: "agent",
      metadata: demoMetadata,
      linkedArtifactId: artifactGeneration.summaries.find((artifact) => artifact.kind === "vendor_table")?.id ?? null,
    },
  ];
  const taskItems: WeddingPlanningTaskItem[] = [
    ...legalSetup.taskItems,
    {
      id: "demo-confirm-backup-plan",
      title: "Confirm wet-weather backup",
      kind: "vendor_follow_up",
      dueAt: "2027-08-01T17:00:00+10:00",
      priority: "high",
      metadata: demoMetadata,
      linkedArtifactId: artifactGeneration.summaries.find((artifact) => artifact.kind === "vendor_table")?.id ?? null,
    },
  ];
  const knowledgeGraph = buildWeddingKnowledgeGraphState({
    metadata: demoMetadata,
    artifacts: artifactSummaries,
    scheduleItems,
    taskItems,
    decisions: [{ title: "Choose venue", status: "open", constrains: ["Budget allocation"], requiresApproval: true }],
    risks: [{ title: "Sample availability is not verified", severity: "medium", evidence: "Demo vendors are synthetic." }],
  });
  const presentation = buildWeddingPresentationState({
    title: "Sample harbour wedding plan",
    metadata: demoMetadata,
    planningContext: {
      weddingFormat: "micro",
      weddingFormatSource: "explicit",
      dateOrSeason: "Spring 2027",
      location: "Sydney",
      countryCode: "AU",
      guestCount: 24,
      budgetComfort: "mid-range",
      topPriorities: ["water views", "low stress", "food"],
      noimDownloaded: "unknown",
      celebrantPath: "need_options",
    },
    artifacts: artifactInputs,
    knowledgeGraph,
  });
  const workspaceView = buildWeddingResponseWorkspaceViewState({
    metadata: demoMetadata,
    artifacts: artifactInputs,
    generatedArtifacts: [...artifactGeneration.artifacts, legalSetup.artifact],
    scheduleItems,
    taskItems,
    projectionStorage: demoProjectionStorage(),
  });
  const richResponse = buildWeddingRichResponseRendererState(presentation);

  return {
    entry: { ...entry, metadata: normalizeWeddingPlanningMetadata(demoMetadata) },
    artifactGeneration,
    legalSetup,
    knowledgeGraph,
    presentation,
    richResponse,
    workspaceView,
    scheduleItems,
    taskItems,
    demoLabels: ["Sample data", "No live availability", "No external action taken"],
  };
}
