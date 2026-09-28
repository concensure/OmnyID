// @locs-version: 1.0
import { For, Show, createMemo, type JSXElement, type ParentProps } from "solid-js";
import { isRecord } from "@/lib/eventDetail";

type WorkflowRunStructuredResultEntry = {
  key: string;
  present: boolean;
  rawValue: unknown;
  valueLabel: string;
  valueJson: string | null;
};

type WorkflowRunStructuredResultPanelProps = {
  detail: string | null;
  entries: WorkflowRunStructuredResultEntry[];
  headline: string;
  summaryMode: string | null;
};

type WorkflowRunStructuredResultPanelState = {
  detail: string | null;
  entriesByKey: Map<string, WorkflowRunStructuredResultEntry>;
  genericEntries: WorkflowRunStructuredResultEntry[];
  headline: string;
  mode: {
    draftStudyPlan: boolean;
    financeDigest: boolean;
    researchBrief: boolean;
    reviewableBookingRecommendation: boolean;
    reviewablePublicationDraft: boolean;
    reviewableReceiptEntry: boolean;
    reviewableReplyDraft: boolean;
    reviewableScheduleRecommendation: boolean;
  };
  summaryMode: string | null;
};

type StructuredResultLabelValueItem = {
  label: string;
  value: string;
};

type StructuredResultCandidateItem = {
  detailText: string;
  rankText: string;
};

type StructuredResultCandidateSection = {
  objectItems: StructuredResultCandidateItem[];
  stringItems: string[];
  title: string;
};

type StructuredResultBodyBlockState = {
  bodyText: string;
  title: string;
};

type StructuredResultNoteSectionState = {
  emptyText: string;
  items: string[];
  title: string;
};

type StructuredResultEventItem = {
  flagItems: string[];
  startText: string;
  titleText: string;
};

type StructuredResultFocusItem = {
  chipItems: string[];
  descriptionText: string | null;
  titleText: string;
};

type StructuredResultDetailListItem = {
  detailText: string;
  shellClass?: string;
  supportText?: string | null;
  titleText: string;
};

type StructuredResultStudyBlockItem = {
  anchorFlags: string[];
  anchorText: string | null;
  focusKindText: string | null;
  nextActionText: string | null;
  policyChipItems: string[];
  slotBasisText: string | null;
  statusText: string | null;
  summaryText: string;
  titleText: string;
  windowText: string | null;
};

type StructuredResultSourceReferenceItem = {
  domainText: string | null;
  extraEntries: Array<[string, string]>;
  plainText: string | null;
  publishedAtText: string | null;
  sourceTypeText: string | null;
  titleText: string | null;
  urlText: string | null;
};

type StructuredResultGenericEntryState = {
  keyText: string;
  presenceClass: string;
  presenceLabel: string;
  shellClass: string;
  valueJson: string | null;
  valueText: string;
};

type StructuredResultChipItem = {
  text: string;
};

type StructuredResultInfoCardItem = {
  text: string;
  textClass: string;
};

type StructuredResultCalendarContextState = {
  anchorFlags: string[];
  anchorLocationText: string | null;
  anchorText: string | null;
  eventItems: StructuredResultEventItem[];
  leadTimeText: string | null;
  nextEventText: string | null;
  summaryText: string;
};

type StructuredResultStudyInputContextState = {
  focusItems: StructuredResultFocusItem[];
  nextFocusText: string | null;
  summaryText: string;
};

type StructuredResultFinanceCategoryItem = {
  detailText: string;
  titleText: string;
};

type StructuredResultFinanceAnomalyItem = {
  detailText: string;
  reasonText: string | null;
  titleText: string;
};

type StructuredResultFinanceMonthlyTotalItem = {
  detailText: string;
  titleText: string;
};

type StructuredResultFinanceInputContextState = {
  anomalyItems: StructuredResultFinanceAnomalyItem[];
  monthlyTotalItems: StructuredResultFinanceMonthlyTotalItem[];
  summaryText: string;
  topSpendCategoryItems: StructuredResultFinanceCategoryItem[];
  topSpendText: string | null;
};

type StructuredResultBookingCandidateSectionState = {
  objectItems: StructuredResultCandidateItem[];
  showObjectItems: boolean;
  stringItems: string[];
  title: string;
};

type StructuredResultSectionShellState = {
  titleText: string;
};

type StructuredResultPrimaryCardState = {
  artifactText: string | null;
  fallbackText: string;
  keyValueEntries: Array<[string, string]>;
  nextActionText: string | null;
  policyChipItems: string[];
  proposalSummaryText: string | null;
  rawRecord: Record<string, unknown> | null;
};

type StructuredResultBookingCardState = {
  approvalTargetText: string | null;
  artifactText: string | null;
  candidateSections: StructuredResultCandidateSection[];
  fallbackText: string;
  headlineText: string | null;
  keyValueEntries: Array<[string, string]>;
  nextActionText: string | null;
  outlineBody: StructuredResultBodyBlockState | null;
  policyChipItems: string[];
  primaryOptionItems: StructuredResultLabelValueItem[];
  proposalSummaryText: string | null;
  rawRecord: Record<string, unknown> | null;
  scopeText: string | null;
  segmentItems: Array<{ detailText: string; labelText: string }>;
  summaryItems: StructuredResultLabelValueItem[];
};

type StructuredResultRecommendedSlotState = {
  anchorLocationText: string | null;
  anchorText: string | null;
  fallbackText: string;
  focusKindText: string | null;
  keyValueEntries: Array<[string, string]>;
  nextActionText: string | null;
  noteKindText: string | null;
  policyChipItems: string[];
  prepLeadText: string | null;
  rawRecord: Record<string, unknown> | null;
  slotBasisText: string | null;
  windowText: string | null;
};

type StructuredResultPrimarySectionState = StructuredResultPrimaryCardState & {
  body?: StructuredResultBodyBlockState | null;
  chipItems?: StructuredResultChipItem[];
  infoItems: StructuredResultInfoCardItem[];
  tagItems?: string[];
};

type StructuredResultPrimaryBranchView = {
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionState: StructuredResultPrimarySectionState;
  show: boolean;
};

type StructuredResultFinanceBranchView = {
  anomalyItems: StructuredResultDetailListItem[];
  inputEntry?: WorkflowRunStructuredResultEntry;
  inputState: StructuredResultFinanceInputContextState;
  monthlyTotalItems: StructuredResultDetailListItem[];
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionState: StructuredResultPrimarySectionState;
  show: boolean;
  showInput: boolean;
  topSpendCategoryItems: StructuredResultDetailListItem[];
};

type StructuredResultResearchBranchView = StructuredResultPrimaryBranchView & {
  sourceReferenceEntry?: WorkflowRunStructuredResultEntry;
  sourceReferenceItems: StructuredResultSourceReferenceItem[];
};

type StructuredResultScheduleBranchView = {
  calendarEntry?: WorkflowRunStructuredResultEntry;
  calendarState: StructuredResultCalendarContextState;
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionState: StructuredResultRecommendedSlotState;
  show: boolean;
  showCalendar: boolean;
};

type StructuredResultStudyBranchView = {
  calendarEntry?: WorkflowRunStructuredResultEntry;
  calendarState: StructuredResultCalendarContextState;
  inputEntry?: WorkflowRunStructuredResultEntry;
  inputState: StructuredResultStudyInputContextState;
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionItems: StructuredResultStudyBlockItem[];
  show: boolean;
  showCalendar: boolean;
  showInput: boolean;
};

type StructuredResultBookingBranchView = {
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionState: StructuredResultBookingCardState & {
    candidateSections: StructuredResultBookingCandidateSectionState[];
    infoItems: StructuredResultInfoCardItem[];
    segmentDetailItems: StructuredResultDetailListItem[];
  };
  show: boolean;
};

type StructuredResultNoteStateKey =
  | "anomaly"
  | "booking"
  | "keyFindings"
  | "publication"
  | "receipt"
  | "reminders"
  | "scheduling"
  | "triage";

type StructuredResultNoteStateMap = Record<StructuredResultNoteStateKey, StructuredResultNoteSectionState>;

const STRUCTURED_RESULT_PANEL_CLASS = "mt-3 rounded-[22px] border border-emerald-200/70 bg-emerald-50/70 p-4";
const STRUCTURED_RESULT_HEADER_CLASS = "flex flex-wrap items-center gap-2";
const STRUCTURED_RESULT_TITLE_CLASS = "text-sm font-semibold text-emerald-900";
const STRUCTURED_RESULT_HEADLINE_CLASS =
  "rounded-full border border-emerald-200/70 bg-white/85 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700";
const STRUCTURED_RESULT_DETAIL_CLASS = "mt-1 text-xs text-emerald-800/85";
const STRUCTURED_RESULT_GENERIC_LIST_CLASS = "mt-3 space-y-3";
const STRUCTURED_RESULT_WIDE_GRID_CLASS = "mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]";
const STRUCTURED_RESULT_BALANCED_GRID_CLASS = "mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]";
const STRUCTURED_RESULT_CONTENT_GRID_CLASS = "mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]";
const STRUCTURED_RESULT_THREE_COLUMN_GRID_CLASS = "mt-3 grid gap-2 sm:grid-cols-3";
const STRUCTURED_RESULT_TWO_COLUMN_GRID_CLASS = "mt-3 grid gap-2 sm:grid-cols-2";
const STRUCTURED_RESULT_POLICY_CHIP_ROW_CLASS = "mt-2 flex flex-wrap gap-2";
const STRUCTURED_RESULT_POLICY_CHIP_CLASS =
  "rounded-full border border-emerald-100/80 bg-emerald-50/60 px-2 py-1 text-[11px] text-emerald-800";
const STRUCTURED_RESULT_SECONDARY_CHIP_ROW_CLASS = "mt-2 flex flex-wrap gap-2";
const STRUCTURED_RESULT_SECONDARY_CHIP_CLASS =
  "rounded-full border border-emerald-100/80 bg-white/70 px-2 py-1 text-[11px] text-emerald-800";
const STRUCTURED_RESULT_JSON_PREVIEW_CLASS =
  "mt-2 overflow-x-auto rounded-2xl border border-slate-200/70 bg-slate-950 px-4 py-3 text-xs text-slate-100";
const STRUCTURED_RESULT_NOTE_LIST_CLASS = "mt-2 space-y-2 text-sm text-slate-900";
const STRUCTURED_RESULT_NOTE_ITEM_CLASS = "rounded-xl border border-emerald-100/80 bg-emerald-50/60 px-3 py-2";
const STRUCTURED_RESULT_RECORD_ITEM_CLASS = "rounded-xl border border-emerald-100/80 bg-emerald-50/60 px-3 py-2";
const STRUCTURED_RESULT_INFO_CARD_CLASS = "rounded-xl border border-emerald-100/80 bg-white/70 px-3 py-2";
const STRUCTURED_RESULT_OPTION_CARD_CLASS = "rounded-xl border border-emerald-100/80 bg-white/75 px-3 py-2";
const STRUCTURED_RESULT_CANDIDATE_ROW_CLASS = "rounded-lg border border-emerald-100/80 bg-white/70 px-2 py-2";
const STRUCTURED_RESULT_SOFT_SECTION_CARD_CLASS = "rounded-xl border border-emerald-100/80 bg-emerald-50/50 px-3 py-2";
const STRUCTURED_RESULT_CONTEXT_CARD_CLASS = "rounded-xl border border-emerald-100/80 bg-emerald-50/60 px-3 py-2";
const STRUCTURED_RESULT_CONTEXT_SUBCARD_CLASS = "rounded-xl border border-emerald-100/80 bg-white/70 px-3 py-2";
const STRUCTURED_RESULT_BODY_BLOCK_CLASS = "mt-3 rounded-2xl border border-emerald-100/80 bg-white/80 px-3 py-3";
const STRUCTURED_RESULT_BODY_BLOCK_TITLE_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700";
const STRUCTURED_RESULT_SUBCARD_TITLE_CLASS =
  "text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700";
const STRUCTURED_RESULT_REFERENCE_CARD_CLASS = "rounded-xl border border-emerald-100/80 bg-white/70 px-3 py-2";
const STRUCTURED_RESULT_REFERENCE_CHIP_CLASS =
  "rounded-full border border-emerald-100/80 bg-emerald-50/60 px-2 py-1";
const STRUCTURED_RESULT_SECONDARY_WHITE_CHIP_CLASS =
  "rounded-full border border-emerald-100/80 bg-white/70 px-2 py-1 text-[11px] text-emerald-800";
const STRUCTURED_RESULT_EMERALD_CHIP_CLASS =
  "rounded-full border border-emerald-100/80 bg-emerald-50/60 px-2 py-1 text-[11px] text-emerald-800";

const STRUCTURED_RESULT_GENERIC_EXCLUSIONS: Record<string, string[]> = {
  draft_study_plan: ["study_blocks", "reminders", "study_input_context", "calendar_context"],
  finance_digest: ["finance_digest", "anomaly_notes", "finance_input_context"],
  research_brief: ["research_brief", "key_findings", "source_refs"],
  reviewable_booking_recommendation: ["booking_recommendation", "booking_notes"],
  reviewable_publication_draft: ["publication_draft", "publication_notes"],
  reviewable_receipt_entry: ["receipt_entry", "receipt_notes"],
  reviewable_reply_draft: ["reply_draft", "triage_notes"],
  reviewable_schedule_recommendation: ["recommended_slot", "scheduling_notes", "calendar_context"],
};

const RECOMMENDED_SLOT_EXCLUDED_KEYS = [
  "review_required",
  "external_write",
  "approval_state",
  "next_action",
  "note_count",
];

const RECEIPT_ENTRY_EXCLUDED_KEYS = [
  "proposal_summary",
  "next_action",
  "receipt_artifact_path",
  "review_required",
  "external_write",
  "note_count",
  "category",
  "receipt_status",
];

const FINANCE_DIGEST_EXCLUDED_KEYS = [
  "proposal_summary",
  "next_action",
  "finance_artifact_path",
  "review_required",
  "external_write",
  "note_count",
  "digest_scope",
  "status",
];

const RESEARCH_BRIEF_EXCLUDED_KEYS = [
  "brief_body",
  "proposal_summary",
  "research_artifact_path",
  "next_action",
  "review_required",
  "external_write",
  "include_sources",
  "source_count",
];

const SOURCE_REFERENCE_EXCLUDED_KEYS = ["title", "url", "domain", "source_type", "published_at"];

const REPLY_DRAFT_EXCLUDED_KEYS = [
  "reply_body",
  "reply_subject",
  "draft_artifact_path",
  "approval_target",
  "proposal_summary",
  "next_action",
  "review_required",
  "external_write",
  "approval_state",
];

const PUBLICATION_DRAFT_EXCLUDED_KEYS = [
  "draft_body",
  "draft_tags",
  "draft_title",
  "draft_artifact_path",
  "visibility",
  "proposal_summary",
  "next_action",
  "review_required",
  "external_write",
  "approval_target",
  "approval_state",
];

const BOOKING_RECOMMENDATION_EXCLUDED_KEYS = [
  "booking_outline",
  "booking_segments",
  "primary_flight_option",
  "primary_stay_option",
  "primary_transfer_option",
  "flight_candidates",
  "stay_candidates",
  "transfer_candidates",
  "flight_candidate_objects",
  "stay_candidate_objects",
  "transfer_candidate_objects",
  "booking_artifact_path",
  "booking_headline",
  "booking_scope",
  "approval_target",
  "proposal_summary",
  "next_action",
  "review_required",
  "external_write",
  "approval_state",
];

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function objectEntries(value: unknown): Array<[string, string]> {
  if (!isRecord(value)) return [];
  return Object.entries(value).flatMap(([key, entryValue]) => {
    if (entryValue === null || entryValue === undefined) return [];
    if (typeof entryValue === "string" && entryValue.trim().length > 0) return [[key, entryValue]];
    if (typeof entryValue === "number" || typeof entryValue === "boolean") return [[key, String(entryValue)]];
    return [[key, JSON.stringify(entryValue)]];
  });
}

function objectEntriesExcept(value: unknown, excludedKeys: string[]): Array<[string, string]> {
  return objectEntries(value).filter(([key]) => !excludedKeys.includes(key));
}

function objectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function hasObjectArray(value: unknown): boolean {
  return objectArray(value).length > 0;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function profileFlags(value: unknown): string[] {
  const profile = recordValue(value);
  if (!profile) return [];
  const flags: string[] = [];
  if (typeof profile.schedule_anchor_type === "string") {
    flags.push(`anchor: ${String(profile.schedule_anchor_type).replaceAll("_", " ")}`);
  }
  if (typeof profile.academic_event_type === "string") {
    flags.push(`academic: ${String(profile.academic_event_type).replaceAll("_", " ")}`);
  }
  if (profile.has_high_importance_signal === true) flags.push("high importance");
  if (profile.has_agenda_signal === true) flags.push("agenda present");
  if (typeof profile.prep_lead_minutes === "number") flags.push(`${String(profile.prep_lead_minutes)} min lead`);
  return flags;
}

function structuredPolicyChips(value: unknown): string[] {
  const record = recordValue(value);
  if (!record) return [];
  const chips: string[] = [];
  if (record.review_required === true) chips.push("human review required");
  if (record.external_write === false) chips.push("no external write");
  if (typeof record.approval_state === "string" && String(record.approval_state).trim().length > 0) {
    chips.push(String(record.approval_state).replaceAll("_", " "));
  }
  if (record.include_sources === true) chips.push("sources included");
  if (typeof record.note_count === "number" && record.note_count > 0) {
    chips.push(`${String(record.note_count)} notes`);
  }
  if (typeof record.source_count === "number" && record.source_count > 0) {
    chips.push(`${String(record.source_count)} sources`);
  }
  return chips;
}

function humanizeToken(value: string): string {
  return value.replaceAll("_", " ");
}

function formatCents(value: unknown): string {
  return `${String(value ?? 0)} cents`;
}

function structuredResultEntryClass(entry: WorkflowRunStructuredResultEntry): string {
  return `rounded-2xl border px-4 py-3 ${
    entry.present
      ? "border-emerald-200/70 bg-white/85"
      : "border-amber-200/70 bg-amber-50/80"
  }`;
}

function structuredResultSectionCardClass(
  entry: WorkflowRunStructuredResultEntry | undefined,
  options?: { withMarginTop?: boolean },
): string {
  const sectionEntry = entry ?? {
    key: "",
    present: false,
    rawValue: null,
    valueJson: null,
    valueLabel: "",
  };
  return `${options?.withMarginTop ? "mt-3 " : ""}${structuredResultEntryClass(sectionEntry)}`;
}

function structuredResultPresenceChipClass(entry: WorkflowRunStructuredResultEntry): string {
  return `rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
    entry.present ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
  }`;
}

function structuredResultMissingText(
  entry: WorkflowRunStructuredResultEntry | undefined,
  missingLabel: string,
): string {
  return entry?.present ? entry.valueLabel : `No ${missingLabel} returned in this run result.`;
}

function structuredResultPolicyChipItems(value: unknown): string[] {
  return structuredPolicyChips(value);
}

function structuredResultObjectEntries(
  value: unknown,
  excludedKeys: string[],
): Array<[string, string]> {
  return objectEntriesExcept(value, excludedKeys);
}

function structuredResultNestedObjectItems(
  value: unknown,
  key: string,
): Array<Record<string, unknown>> {
  return objectArray(recordValue(value)?.[key]);
}

function structuredResultHasNestedObjectItems(value: unknown, key: string): boolean {
  return structuredResultNestedObjectItems(value, key).length > 0;
}

function structuredResultNestedStringItems(value: unknown, key: string): string[] {
  return stringList(recordValue(value)?.[key]);
}

function structuredResultNestedProfileFlags(value: unknown, key: string): string[] {
  return profileFlags(recordValue(value)?.[key]);
}

function structuredResultLabelValueItems(
  items: Array<{ label: string; value: unknown }>,
): StructuredResultLabelValueItem[] {
  return items.flatMap((item) =>
    typeof item.value === "string" && item.value.trim().length > 0
      ? [{ label: item.label, value: item.value }]
      : [],
  );
}

function structuredResultCandidateItems(
  value: unknown,
  key: string,
  fallbackDetail: string,
): StructuredResultCandidateItem[] {
  return structuredResultNestedObjectItems(value, key).map((candidate) => ({
    detailText: typeof candidate.detail === "string" ? candidate.detail : fallbackDetail,
    rankText: candidate.is_primary === true ? "Primary" : `Rank ${String(candidate.rank ?? "")}`,
  }));
}

function structuredResultBookingCandidateSections(value: unknown): StructuredResultCandidateSection[] {
  return [
    {
      objectItems: structuredResultCandidateItems(value, "flight_candidate_objects", "Flight candidate"),
      stringItems: structuredResultNestedStringItems(value, "flight_candidates"),
      title: "Flight candidates",
    },
    {
      objectItems: structuredResultCandidateItems(value, "stay_candidate_objects", "Stay candidate"),
      stringItems: structuredResultNestedStringItems(value, "stay_candidates"),
      title: "Stay candidates",
    },
    {
      objectItems: structuredResultCandidateItems(value, "transfer_candidate_objects", "Transfer candidate"),
      stringItems: structuredResultNestedStringItems(value, "transfer_candidates"),
      title: "Transfer candidates",
    },
  ].filter((section) => section.objectItems.length > 0 || section.stringItems.length > 0);
}

function structuredResultBodyBlockState(
  title: string,
  value: unknown,
): StructuredResultBodyBlockState | null {
  return typeof value === "string" && value.trim().length > 0
    ? { bodyText: value, title }
    : null;
}

function structuredResultNoteSectionState(
  entry: WorkflowRunStructuredResultEntry | undefined,
  missingLabel: string,
  title: string,
): StructuredResultNoteSectionState {
  return {
    emptyText: structuredResultMissingText(entry, missingLabel),
    items: stringList(entry?.rawValue),
    title,
  };
}

function structuredResultEventItems(value: unknown, key: string): StructuredResultEventItem[] {
  return structuredResultNestedObjectItems(value, key).map((event) => ({
    flagItems: profileFlags(event.profile),
    startText: typeof event.start_at === "string" ? event.start_at : "No start time",
    titleText: typeof event.title === "string" ? event.title : "Calendar event",
  }));
}

function structuredResultFocusItems(value: unknown, key: string): StructuredResultFocusItem[] {
  return structuredResultNestedObjectItems(value, key).map((item) => {
    const chipItems = [
      typeof item.priority === "string" ? String(item.priority).replaceAll("_", " ") : null,
      typeof item.urgency === "string" ? String(item.urgency).replaceAll("_", " ") : null,
      typeof item.due_at === "string" ? `due ${String(item.due_at)}` : null,
    ].filter((chip): chip is string => Boolean(chip));

    return {
      chipItems,
      descriptionText: typeof item.description === "string" ? String(item.description) : null,
      titleText: typeof item.title === "string" ? item.title : "Pending focus item",
    };
  });
}

function structuredResultAnchorText(
  prefix: string,
  title: unknown,
  startAt: unknown,
): string | null {
  return typeof title === "string" && typeof startAt === "string"
    ? `${prefix}: ${title} at ${startAt}`
    : null;
}

function structuredResultNextActionText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? `Next action: ${value}`
    : null;
}

function structuredResultInfoCardText(label: string, value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? `${label}: ${value}`
    : null;
}

function structuredResultSecondaryText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function structuredResultChipItems(
  items: Array<{ label?: string; value: unknown; humanize?: boolean }>,
): StructuredResultChipItem[] {
  return items.flatMap((item) => {
    if (typeof item.value !== "string" || item.value.trim().length === 0) return [];
    const valueText = item.humanize ? humanizeToken(item.value) : item.value;
    return [{ text: item.label ? `${item.label}: ${valueText}` : valueText }];
  });
}

function structuredResultInfoCardItems(
  items: Array<{ text: string | null; textClass: string }>,
): StructuredResultInfoCardItem[] {
  return items.flatMap((item) => (item.text ? [{ text: item.text, textClass: item.textClass }] : []));
}

function structuredResultCalendarContextState(
  value: unknown,
  fallbackText: string,
  options: {
    anchorKey: string;
    anchorLabel: string;
    eventKey: string;
    locationLabel?: string;
  },
): StructuredResultCalendarContextState {
  const context = recordValue(value);
  const anchorRecord = recordValue(context?.[options.anchorKey]);
  return {
    anchorFlags: profileFlags(anchorRecord?.profile ?? anchorRecord),
    anchorLocationText:
      options.locationLabel && typeof anchorRecord?.location === "string"
        ? `${options.locationLabel}: ${anchorRecord.location}`
        : null,
    anchorText: structuredResultAnchorText(
      options.anchorLabel,
      anchorRecord?.title,
      anchorRecord?.start_at,
    ),
    eventItems: structuredResultEventItems(context, options.eventKey),
    leadTimeText:
      typeof anchorRecord?.prep_lead_minutes === "number"
        ? `Suggested lead time: ${String(anchorRecord.prep_lead_minutes)} minutes`
        : null,
    nextEventText: structuredResultAnchorText(
      "Next event",
      context?.next_event_title,
      context?.next_event_start_at,
    ),
    summaryText:
      typeof context?.upcoming_event_count === "number"
        ? `${context.upcoming_event_count} upcoming events in the next ${String(context.window_days ?? "0")} days.`
        : fallbackText,
  };
}

function structuredResultStudyInputContextState(
  value: unknown,
  fallbackText: string,
): StructuredResultStudyInputContextState {
  const context = recordValue(value);
  return {
    focusItems: structuredResultFocusItems(context, "pending_focus_items"),
    nextFocusText:
      typeof context?.next_focus_title === "string"
        ? `Next focus: ${String(context.next_focus_title)}${
            typeof context.next_focus_due_at === "string" ? ` due ${String(context.next_focus_due_at)}` : ""
          }`
        : null,
    summaryText:
      typeof context?.pending_focus_count === "number"
        ? `${String(context.pending_focus_count)} pending focus items, with ${String(context.due_soon_focus_count ?? 0)} due soon and ${String(context.overdue_focus_count ?? 0)} overdue.`
        : fallbackText,
  };
}

function structuredResultFinanceInputContextState(
  value: unknown,
  fallbackText: string,
): StructuredResultFinanceInputContextState {
  const context = recordValue(value);
  return {
    anomalyItems: structuredResultNestedObjectItems(context, "recent_anomalies").map((anomaly) => ({
      detailText: `${typeof anomaly.txn_date === "string" ? anomaly.txn_date : "No date"} | ${formatCents(anomaly.amount_cents)}`,
      reasonText: typeof anomaly.anomaly_reason === "string" ? anomaly.anomaly_reason : null,
      titleText: typeof anomaly.description === "string" ? anomaly.description : "Anomaly",
    })),
    monthlyTotalItems: structuredResultNestedObjectItems(context, "monthly_totals").map((month) => ({
      detailText: `Expenses: ${formatCents(month.expenses_cents)} | Income: ${formatCents(month.income_cents)}`,
      titleText: typeof month.month === "string" ? month.month : "Month",
    })),
    summaryText:
      typeof context?.recent_transaction_count === "number"
        ? `${context.recent_transaction_count} recent transactions across ${String(context.account_count ?? 0)} active accounts.`
        : fallbackText,
    topSpendCategoryItems: structuredResultNestedObjectItems(context, "top_spend_categories").map((category) => ({
      detailText: `${formatCents(category.total_cents)} across ${String(category.txn_count ?? 0)} transactions`,
      titleText: typeof category.category === "string" ? humanizeToken(category.category) : "Category",
    })),
    topSpendText:
      typeof context?.top_spend_category === "string" && typeof context?.top_spend_total_cents === "number"
        ? `Top spend category: ${humanizeToken(String(context.top_spend_category))} at ${formatCents(context.top_spend_total_cents)}`
        : null,
  };
}

function structuredResultSectionShellState(titleText: string): StructuredResultSectionShellState {
  return { titleText };
}

function structuredResultStudyBlockItems(value: unknown): StructuredResultStudyBlockItem[] {
  return objectArray(value).map((block) => ({
    anchorFlags: profileFlags(block.anchor_event_profile),
    anchorText: structuredResultAnchorText(
      "Anchored to",
      block.anchor_event_title,
      block.anchor_event_start_at,
    ),
    focusKindText:
      typeof block.focus_kind === "string"
        ? String(block.focus_kind).replaceAll("_", " ")
        : null,
    nextActionText: structuredResultNextActionText(block.next_action),
    policyChipItems: structuredResultPolicyChipItems(block),
    slotBasisText: typeof block.slot_basis === "string" ? block.slot_basis : null,
    statusText:
      typeof block.status === "string"
        ? String(block.status).replaceAll("_", " ")
        : null,
    summaryText:
      typeof block.focus_summary === "string"
        ? block.focus_summary
        : typeof block.summary === "string"
          ? block.summary
          : "Structured study block",
    titleText: typeof block.label === "string" ? block.label : "Study block",
    windowText:
      typeof block.planned_start_at === "string" && typeof block.planned_end_at === "string"
        ? `Planned window: ${String(block.planned_start_at)} to ${String(block.planned_end_at)}`
        : null,
  }));
}

function structuredResultSourceReferenceItems(value: unknown): StructuredResultSourceReferenceItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(Boolean)
    .map((source) => {
      if (typeof source === "string") {
        return {
          domainText: null,
          extraEntries: [],
          plainText: source,
          publishedAtText: null,
          sourceTypeText: null,
          titleText: null,
          urlText: null,
        };
      }

      const sourceRecord = recordValue(source);
      return {
        domainText: typeof sourceRecord?.domain === "string" ? sourceRecord.domain : null,
        extraEntries: structuredResultObjectEntries(source, SOURCE_REFERENCE_EXCLUDED_KEYS),
        plainText: null,
        publishedAtText:
          typeof sourceRecord?.published_at === "string" ? sourceRecord.published_at : null,
        sourceTypeText:
          typeof sourceRecord?.source_type === "string"
            ? String(sourceRecord.source_type).replaceAll("_", " ")
            : null,
        titleText: typeof sourceRecord?.title === "string" ? sourceRecord.title : null,
        urlText: typeof sourceRecord?.url === "string" ? sourceRecord.url : null,
      };
    });
}

function structuredResultGenericEntryState(
  entry: WorkflowRunStructuredResultEntry,
): StructuredResultGenericEntryState {
  return {
    keyText: entry.key,
    presenceClass: structuredResultPresenceChipClass(entry),
    presenceLabel: entry.present ? "present" : "missing",
    shellClass: structuredResultEntryClass(entry),
    valueJson: entry.valueJson,
    valueText: entry.valueLabel,
  };
}

function structuredResultPrimaryCardState(
  entry: WorkflowRunStructuredResultEntry | undefined,
  excludedKeys: string[],
  options?: { artifactLabel?: string; missingLabel?: string },
): StructuredResultPrimaryCardState {
  const rawRecord = recordValue(entry?.rawValue);
  return {
    artifactText: options?.artifactLabel
      ? structuredResultInfoCardText(options.artifactLabel, rawRecord?.[
          options.artifactLabel === "Receipt artifact"
            ? "receipt_artifact_path"
            : options.artifactLabel === "Finance artifact"
              ? "finance_artifact_path"
              : options.artifactLabel === "Research artifact"
                ? "research_artifact_path"
                : options.artifactLabel === "Draft artifact"
                  ? "draft_artifact_path"
                  : "booking_artifact_path"
        ])
      : null,
    fallbackText: structuredResultMissingText(entry, options?.missingLabel ?? entry?.key ?? "result"),
    keyValueEntries: structuredResultObjectEntries(entry?.rawValue, excludedKeys),
    nextActionText: structuredResultNextActionText(rawRecord?.next_action),
    policyChipItems: structuredResultPolicyChipItems(entry?.rawValue),
    proposalSummaryText: structuredResultSecondaryText(rawRecord?.proposal_summary),
    rawRecord,
  };
}

function structuredResultBookingCardState(
  entry: WorkflowRunStructuredResultEntry | undefined,
): StructuredResultBookingCardState {
  const rawRecord = recordValue(entry?.rawValue);
  return {
    approvalTargetText: structuredResultInfoCardText("Approval target", rawRecord?.approval_target),
    artifactText: structuredResultInfoCardText("Draft artifact", rawRecord?.booking_artifact_path),
    candidateSections: structuredResultBookingCandidateSections(entry?.rawValue),
    fallbackText: structuredResultMissingText(entry, "booking recommendation"),
    headlineText: structuredResultInfoCardText("Draft plan", rawRecord?.booking_headline),
    keyValueEntries: structuredResultObjectEntries(entry?.rawValue, BOOKING_RECOMMENDATION_EXCLUDED_KEYS),
    nextActionText: structuredResultNextActionText(rawRecord?.next_action),
    outlineBody: structuredResultBodyBlockState("Booking outline", rawRecord?.booking_outline),
    policyChipItems: structuredResultPolicyChipItems(entry?.rawValue),
    primaryOptionItems: structuredResultLabelValueItems([
      { label: "Flight option", value: rawRecord?.primary_flight_option },
      { label: "Stay option", value: rawRecord?.primary_stay_option },
      { label: "Transfer option", value: rawRecord?.primary_transfer_option },
    ]),
    proposalSummaryText: structuredResultSecondaryText(rawRecord?.proposal_summary),
    rawRecord,
    scopeText:
      typeof rawRecord?.booking_scope === "string"
        ? String(rawRecord.booking_scope).replaceAll("_", " ")
        : null,
    segmentItems: structuredResultNestedObjectItems(entry?.rawValue, "booking_segments").map((segment) => ({
      detailText: typeof segment.detail === "string" ? segment.detail : "Structured booking segment",
      labelText: typeof segment.label === "string" ? segment.label : "Segment",
    })),
    summaryItems: structuredResultLabelValueItems([
      { label: "Route", value: rawRecord?.route_summary },
      { label: "Stay", value: rawRecord?.stay_summary },
    ]),
  };
}

function structuredResultRecommendedSlotState(
  entry: WorkflowRunStructuredResultEntry | undefined,
): StructuredResultRecommendedSlotState {
  const rawRecord = recordValue(entry?.rawValue);
  return {
    anchorLocationText:
      typeof rawRecord?.anchor_event_location === "string" ? rawRecord.anchor_event_location : null,
    anchorText: structuredResultAnchorText(
      "Anchored to",
      rawRecord?.anchor_event_title,
      rawRecord?.anchor_event_start_at,
    ),
    fallbackText: structuredResultMissingText(entry, "recommended slot"),
    focusKindText:
      typeof rawRecord?.focus_kind === "string"
        ? String(rawRecord.focus_kind).replaceAll("_", " ")
        : null,
    keyValueEntries: structuredResultObjectEntries(entry?.rawValue, RECOMMENDED_SLOT_EXCLUDED_KEYS),
    nextActionText: structuredResultNextActionText(rawRecord?.next_action),
    noteKindText:
      typeof rawRecord?.anchor_note_kind === "string"
        ? String(rawRecord.anchor_note_kind).replaceAll("_", " ")
        : null,
    policyChipItems: structuredResultPolicyChipItems(entry?.rawValue),
    prepLeadText:
      typeof rawRecord?.prep_lead_minutes === "number"
        ? `Preserves ${String(rawRecord.prep_lead_minutes)} minutes of prep or buffer time before the anchor event.`
        : null,
    rawRecord,
    slotBasisText: typeof rawRecord?.slot_basis === "string" ? rawRecord.slot_basis : null,
    windowText:
      typeof rawRecord?.proposed_start_at === "string" && typeof rawRecord?.proposed_end_at === "string"
        ? `Draft window: ${String(rawRecord.proposed_start_at)} to ${String(rawRecord.proposed_end_at)}`
        : null,
  };
}

function structuredResultNoteStateMap(entries: {
  anomalyNotes?: WorkflowRunStructuredResultEntry;
  bookingNotes?: WorkflowRunStructuredResultEntry;
  keyFindings?: WorkflowRunStructuredResultEntry;
  publicationNotes?: WorkflowRunStructuredResultEntry;
  receiptNotes?: WorkflowRunStructuredResultEntry;
  reminders?: WorkflowRunStructuredResultEntry;
  schedulingNotes?: WorkflowRunStructuredResultEntry;
  triageNotes?: WorkflowRunStructuredResultEntry;
}): StructuredResultNoteStateMap {
  return {
    anomaly: structuredResultNoteSectionState(entries.anomalyNotes, "anomaly notes", "Anomaly notes"),
    booking: structuredResultNoteSectionState(entries.bookingNotes, "booking notes", "Booking notes"),
    keyFindings: structuredResultNoteSectionState(entries.keyFindings, "key findings", "Key findings"),
    publication: structuredResultNoteSectionState(entries.publicationNotes, "publication notes", "Publication notes"),
    receipt: structuredResultNoteSectionState(entries.receiptNotes, "receipt notes", "Posting notes"),
    reminders: structuredResultNoteSectionState(entries.reminders, "reminders", "Reminders"),
    scheduling: structuredResultNoteSectionState(entries.schedulingNotes, "scheduling notes", "Scheduling notes"),
    triage: structuredResultNoteSectionState(entries.triageNotes, "triage notes", "Triage notes"),
  };
}

function structuredResultPrimarySectionState(
  base: StructuredResultPrimaryCardState,
  options: {
    bodyTitle?: string;
    bodyValue?: unknown;
    chipItems?: StructuredResultChipItem[];
    infoItems: StructuredResultInfoCardItem[];
    tagItems?: string[];
  },
): StructuredResultPrimarySectionState {
  return {
    ...base,
    ...(options.bodyTitle
      ? { body: structuredResultBodyBlockState(options.bodyTitle, options.bodyValue) }
      : {}),
    ...(options.chipItems ? { chipItems: options.chipItems } : {}),
    infoItems: options.infoItems,
    ...(options.tagItems ? { tagItems: options.tagItems } : {}),
  };
}

function structuredResultPrimaryBranchView(options: {
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionState: StructuredResultPrimarySectionState;
  show: boolean;
}): StructuredResultPrimaryBranchView {
  return {
    noteEntry: options.noteEntry,
    noteState: options.noteState,
    sectionEntry: options.sectionEntry,
    sectionState: options.sectionState,
    show: options.show,
  };
}

function structuredResultFinanceBranchView(options: {
  financeInputEntry?: WorkflowRunStructuredResultEntry;
  financeInputState: StructuredResultFinanceInputContextState;
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionState: StructuredResultPrimarySectionState;
  show: boolean;
  showInput: boolean;
}): StructuredResultFinanceBranchView {
  return {
    anomalyItems: options.financeInputState.anomalyItems.map((anomaly) => ({
      detailText: anomaly.detailText,
      supportText: anomaly.reasonText,
      titleText: anomaly.titleText,
    })),
    inputEntry: options.financeInputEntry,
    inputState: options.financeInputState,
    monthlyTotalItems: options.financeInputState.monthlyTotalItems.map((month) => ({
      detailText: month.detailText,
      shellClass: STRUCTURED_RESULT_CONTEXT_SUBCARD_CLASS,
      titleText: month.titleText,
    })),
    noteEntry: options.noteEntry,
    noteState: options.noteState,
    sectionEntry: options.sectionEntry,
    sectionState: options.sectionState,
    show: options.show,
    showInput: options.showInput,
    topSpendCategoryItems: options.financeInputState.topSpendCategoryItems.map((category) => ({
      detailText: category.detailText,
      shellClass: STRUCTURED_RESULT_CONTEXT_SUBCARD_CLASS,
      titleText: category.titleText,
    })),
  };
}

function structuredResultResearchBranchView(options: {
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionState: StructuredResultPrimarySectionState;
  show: boolean;
  sourceReferenceEntry?: WorkflowRunStructuredResultEntry;
}): StructuredResultResearchBranchView {
  return {
    ...structuredResultPrimaryBranchView({
      noteEntry: options.noteEntry,
      noteState: options.noteState,
      sectionEntry: options.sectionEntry,
      sectionState: options.sectionState,
      show: options.show,
    }),
    sourceReferenceEntry: options.sourceReferenceEntry,
    sourceReferenceItems: structuredResultSourceReferenceItems(options.sourceReferenceEntry?.rawValue),
  };
}

function structuredResultScheduleBranchView(options: {
  calendarEntry?: WorkflowRunStructuredResultEntry;
  calendarState: StructuredResultCalendarContextState;
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionState: StructuredResultRecommendedSlotState;
  show: boolean;
  showCalendar: boolean;
}): StructuredResultScheduleBranchView {
  return {
    calendarEntry: options.calendarEntry,
    calendarState: options.calendarState,
    noteEntry: options.noteEntry,
    noteState: options.noteState,
    sectionEntry: options.sectionEntry,
    sectionState: options.sectionState,
    show: options.show,
    showCalendar: options.showCalendar,
  };
}

function structuredResultStudyBranchView(options: {
  calendarEntry?: WorkflowRunStructuredResultEntry;
  calendarState: StructuredResultCalendarContextState;
  inputEntry?: WorkflowRunStructuredResultEntry;
  inputState: StructuredResultStudyInputContextState;
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  show: boolean;
  showCalendar: boolean;
  showInput: boolean;
}): StructuredResultStudyBranchView {
  return {
    calendarEntry: options.calendarEntry,
    calendarState: options.calendarState,
    inputEntry: options.inputEntry,
    inputState: options.inputState,
    noteEntry: options.noteEntry,
    noteState: options.noteState,
    sectionEntry: options.sectionEntry,
    sectionItems: structuredResultStudyBlockItems(options.sectionEntry?.rawValue),
    show: options.show,
    showCalendar: options.showCalendar,
    showInput: options.showInput,
  };
}

function structuredResultBookingBranchView(options: {
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionState: StructuredResultBookingCardState;
  show: boolean;
}): StructuredResultBookingBranchView {
  return {
    noteEntry: options.noteEntry,
    noteState: options.noteState,
    sectionEntry: options.sectionEntry,
    sectionState: {
      ...options.sectionState,
      candidateSections: options.sectionState.candidateSections.map((section) => ({
        objectItems: section.objectItems,
        showObjectItems: section.objectItems.length > 0,
        stringItems: section.stringItems,
        title: section.title,
      })),
      infoItems: structuredResultInfoCardItems([
        { text: options.sectionState.artifactText, textClass: "text-xs text-slate-900" },
        { text: options.sectionState.headlineText, textClass: "text-xs text-slate-900" },
        { text: options.sectionState.approvalTargetText, textClass: "text-xs text-slate-900" },
        { text: options.sectionState.nextActionText, textClass: "text-sm text-slate-900" },
      ]),
      segmentDetailItems: options.sectionState.segmentItems.map((segment) => ({
        detailText: segment.detailText,
        shellClass: STRUCTURED_RESULT_RECORD_ITEM_CLASS,
        titleText: segment.labelText,
      })),
    },
    show: options.show,
  };
}

function workflowRunStructuredResultPanelState(
  props: WorkflowRunStructuredResultPanelProps,
): WorkflowRunStructuredResultPanelState {
  const entriesByKey = new Map(props.entries.map((entry) => [entry.key, entry]));
  const excludedKeys = new Set(
    props.summaryMode ? (STRUCTURED_RESULT_GENERIC_EXCLUSIONS[props.summaryMode] ?? []) : [],
  );

  return {
    detail: props.detail,
    entriesByKey,
    genericEntries: props.entries.filter((entry) => !excludedKeys.has(entry.key)),
    headline: props.headline,
    mode: {
      draftStudyPlan: props.summaryMode === "draft_study_plan",
      financeDigest: props.summaryMode === "finance_digest",
      researchBrief: props.summaryMode === "research_brief",
      reviewableBookingRecommendation: props.summaryMode === "reviewable_booking_recommendation",
      reviewablePublicationDraft: props.summaryMode === "reviewable_publication_draft",
      reviewableReceiptEntry: props.summaryMode === "reviewable_receipt_entry",
      reviewableReplyDraft: props.summaryMode === "reviewable_reply_draft",
      reviewableScheduleRecommendation: props.summaryMode === "reviewable_schedule_recommendation",
    },
    summaryMode: props.summaryMode,
  };
}

function StructuredResultNoteSection(props: {
  sectionEntry?: WorkflowRunStructuredResultEntry;
  state: StructuredResultNoteSectionState;
}) {
  const shellState = () => structuredResultSectionShellState(props.state.title);
  return (
    <StructuredResultSectionCard sectionEntry={props.sectionEntry} title={shellState().titleText}>
      <Show
        when={props.state.items.length > 0}
        fallback={<p class="mt-2 text-sm text-slate-900">{props.state.emptyText}</p>}
      >
        <ul class={STRUCTURED_RESULT_NOTE_LIST_CLASS}>
          <For each={props.state.items}>
            {(note) => <li class={STRUCTURED_RESULT_NOTE_ITEM_CLASS}>{note}</li>}
          </For>
        </ul>
      </Show>
    </StructuredResultSectionCard>
  );
}

function StructuredResultSectionCard(props: ParentProps<{
  sectionEntry?: WorkflowRunStructuredResultEntry;
  title: string;
  withMarginTop?: boolean;
}>) {
  return (
    <div class={structuredResultSectionCardClass(props.sectionEntry, { withMarginTop: props.withMarginTop })}>
      <p class="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{props.title}</p>
      {props.children}
    </div>
  );
}

function StructuredResultPolicyRecordSection(props: ParentProps<{
  entries: Array<[string, string]>;
  fallbackText: string;
  policyChipItems: string[];
  sectionEntry?: WorkflowRunStructuredResultEntry;
  title: string;
  withMarginTop?: boolean;
}>) {
  return (
    <StructuredResultSectionCard sectionEntry={props.sectionEntry} title={props.title} withMarginTop={props.withMarginTop}>
      <StructuredResultPolicyChipRow items={props.policyChipItems} />
      <StructuredResultRecordEntries entries={props.entries} fallbackText={props.fallbackText} />
      {props.children}
    </StructuredResultSectionCard>
  );
}

function StructuredResultPolicySummaryInfoSection(props: {
  bodyState?: StructuredResultBodyBlockState | null;
  entries: Array<[string, string]>;
  fallbackText: string;
  infoItems: StructuredResultInfoCardItem[];
  policyChipItems: string[];
  secondaryChipItems?: StructuredResultChipItem[] | string[];
  sectionEntry?: WorkflowRunStructuredResultEntry;
  summaryText: string | null;
  title: string;
}) {
  return (
    <StructuredResultPolicyRecordSection
      sectionEntry={props.sectionEntry}
      title={props.title}
      policyChipItems={props.policyChipItems}
      entries={props.entries}
      fallbackText={props.fallbackText}
    >
      <Show when={props.bodyState}>
        {(bodyState) => <StructuredResultBodyBlock state={bodyState()} />}
      </Show>
      <StructuredResultSummaryText text={props.summaryText} />
      <Show when={props.secondaryChipItems && props.secondaryChipItems.length > 0}>
        <StructuredResultSecondaryChipRow items={props.secondaryChipItems ?? []} />
      </Show>
      <StructuredResultInfoCardList items={props.infoItems} />
    </StructuredResultPolicyRecordSection>
  );
}

function StructuredResultBodyBlock(props: { state: StructuredResultBodyBlockState }) {
  return (
    <div class={STRUCTURED_RESULT_BODY_BLOCK_CLASS}>
      <p class={STRUCTURED_RESULT_BODY_BLOCK_TITLE_CLASS}>{props.state.title}</p>
      <pre class="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-900">{props.state.bodyText}</pre>
    </div>
  );
}

function StructuredResultJsonPreview(props: { json: string }) {
  return (
    <pre class={STRUCTURED_RESULT_JSON_PREVIEW_CLASS}>
      <code>{props.json}</code>
    </pre>
  );
}

function StructuredResultPolicyChipRow(props: { items: string[] }) {
  return (
    <Show when={props.items.length > 0}>
      <div class={STRUCTURED_RESULT_POLICY_CHIP_ROW_CLASS}>
        <For each={props.items}>
          {(chip) => <span class={STRUCTURED_RESULT_POLICY_CHIP_CLASS}>{chip}</span>}
        </For>
      </div>
    </Show>
  );
}

function StructuredResultRecordEntries(props: {
  entries: Array<[string, string]>;
  fallbackText: string;
}) {
  return (
    <Show
      when={props.entries.length > 0}
      fallback={<p class="mt-2 text-sm text-slate-900">{props.fallbackText}</p>}
    >
      <dl class="mt-2 space-y-2">
        <For each={props.entries}>
          {([key, value]) => (
            <div class={STRUCTURED_RESULT_RECORD_ITEM_CLASS}>
              <dt class="font-mono text-xs font-semibold text-emerald-800">{key}</dt>
              <dd class="mt-1 text-sm text-slate-900">{value}</dd>
            </div>
          )}
        </For>
      </dl>
    </Show>
  );
}

function StructuredResultInfoCardList(props: { items: StructuredResultInfoCardItem[] }) {
  return (
    <Show when={props.items.length > 0}>
      <For each={props.items}>
        {(item) => (
          <p class={`mt-2 ${STRUCTURED_RESULT_INFO_CARD_CLASS} ${item.textClass}`}>
            {item.text}
          </p>
        )}
      </For>
    </Show>
  );
}

function StructuredResultInlineCardText(props: {
  text: string | null;
  shellClass: string;
  textClass: string;
  marginClass?: string;
}) {
  return (
    <Show when={props.text}>
      {(text) => (
        <p class={`${props.marginClass ?? "mt-2"} ${props.shellClass} ${props.textClass}`}>
          {text()}
        </p>
      )}
    </Show>
  );
}

function StructuredResultSupportText(props: {
  text: string | null;
  className?: string;
  marginClass?: string;
}) {
  return (
    <Show when={props.text}>
      {(text) => (
        <p class={`${props.marginClass ?? "mt-2"} ${props.className ?? "text-xs text-emerald-800/80"}`}>
          {text()}
        </p>
      )}
    </Show>
  );
}

function StructuredResultCueText(props: {
  text: string | null;
  className?: string;
  marginClass?: string;
}) {
  return (
    <Show when={props.text}>
      {(text) => (
        <p
          class={`${
            props.marginClass ?? "mt-2"
          } ${props.className ?? "text-xs font-medium uppercase tracking-[0.12em] text-emerald-700/90"}`}
        >
          {text()}
        </p>
      )}
    </Show>
  );
}

function StructuredResultSecondaryChipRow(props: { items: StructuredResultChipItem[] | string[] }) {
  return (
    <Show when={props.items.length > 0}>
      <div class={STRUCTURED_RESULT_SECONDARY_CHIP_ROW_CLASS}>
        <For each={props.items}>
          {(chip) => (
            <span class={STRUCTURED_RESULT_SECONDARY_CHIP_CLASS}>
              {typeof chip === "string" ? chip : chip.text}
            </span>
          )}
        </For>
      </div>
    </Show>
  );
}

function StructuredResultWhiteChipRow(props: { items: string[] }) {
  return (
    <Show when={props.items.length > 0}>
      <div class="mt-2 flex flex-wrap gap-2">
        <For each={props.items}>
          {(chip) => <span class={STRUCTURED_RESULT_SECONDARY_WHITE_CHIP_CLASS}>{chip}</span>}
        </For>
      </div>
    </Show>
  );
}

function StructuredResultEmeraldChipRow(props: { items: string[] }) {
  return (
    <Show when={props.items.length > 0}>
      <div class="mt-2 flex flex-wrap gap-2">
        <For each={props.items}>
          {(chip) => <span class={STRUCTURED_RESULT_EMERALD_CHIP_CLASS}>{chip}</span>}
        </For>
      </div>
    </Show>
  );
}

function StructuredResultPlainItemList(props: { items: string[] }) {
  return (
    <Show when={props.items.length > 0}>
      <ul class="mt-2 space-y-1 text-sm text-slate-900">
        <For each={props.items}>
          {(item) => <li>{item}</li>}
        </For>
      </ul>
    </Show>
  );
}

function StructuredResultOptionCardGrid(props: {
  className: string;
  items: StructuredResultLabelValueItem[];
}) {
  return (
    <Show when={props.items.length > 0}>
      <div class={props.className}>
        <For each={props.items}>
          {(item) => (
            <div class={STRUCTURED_RESULT_OPTION_CARD_CLASS}>
              <p class={STRUCTURED_RESULT_SUBCARD_TITLE_CLASS}>{item.label}</p>
              <p class="mt-1 text-sm text-slate-900">{item.value}</p>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

function StructuredResultEventItemList(props: { items: StructuredResultEventItem[] }) {
  return (
    <Show when={props.items.length > 0}>
      <ul class="mt-2 space-y-2 text-sm text-slate-900">
        <For each={props.items}>
          {(event) => (
            <li class={STRUCTURED_RESULT_CONTEXT_CARD_CLASS}>
              <p class="font-medium text-slate-900">{event.titleText}</p>
              <p class="mt-1 text-xs text-emerald-800">{event.startText}</p>
              <StructuredResultWhiteChipRow items={event.flagItems} />
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

function StructuredResultFocusItemList(props: { items: StructuredResultFocusItem[] }) {
  return (
    <Show when={props.items.length > 0}>
      <ul class="mt-2 space-y-2 text-sm text-slate-900">
        <For each={props.items}>
          {(item) => (
            <li class={STRUCTURED_RESULT_CONTEXT_CARD_CLASS}>
              <p class="font-medium text-slate-900">{item.titleText}</p>
              <Show when={item.descriptionText}>
                <p class="mt-1 text-xs text-slate-700">{item.descriptionText}</p>
              </Show>
              <StructuredResultWhiteChipRow items={item.chipItems} />
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

function StructuredResultDetailItemList(props: { items: StructuredResultDetailListItem[] }) {
  return (
    <Show when={props.items.length > 0}>
      <ul class="mt-2 space-y-2 text-sm text-slate-900">
        <For each={props.items}>
          {(item) => (
            <li class={item.shellClass ?? STRUCTURED_RESULT_CONTEXT_CARD_CLASS}>
              <p class="font-medium text-slate-900">{item.titleText}</p>
              <p class="mt-1 text-xs text-emerald-800">{item.detailText}</p>
              <Show when={item.supportText}>
                {(supportText) => <p class="mt-1 text-xs text-slate-900">{supportText()}</p>}
              </Show>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

function StructuredResultCalendarContextSection(props: {
  sectionEntry?: WorkflowRunStructuredResultEntry;
  state: StructuredResultCalendarContextState;
  title: string;
  withMarginTop?: boolean;
}) {
  return (
    <StructuredResultSectionCard sectionEntry={props.sectionEntry} title={props.title} withMarginTop={props.withMarginTop}>
      <p class="mt-2 text-sm text-slate-900">{props.state.summaryText}</p>
      <StructuredResultInlineCardText
        text={props.state.nextEventText}
        shellClass={STRUCTURED_RESULT_RECORD_ITEM_CLASS}
        textClass="text-sm text-slate-900"
      />
      <StructuredResultInlineCardText
        text={props.state.anchorText}
        shellClass={STRUCTURED_RESULT_INFO_CARD_CLASS}
        textClass="text-sm text-slate-900"
      />
      <StructuredResultSupportText text={props.state.anchorLocationText} />
      <StructuredResultSupportText text={props.state.leadTimeText} />
      <StructuredResultEmeraldChipRow items={props.state.anchorFlags} />
      <StructuredResultEventItemList items={props.state.eventItems} />
    </StructuredResultSectionCard>
  );
}

function StructuredResultSummaryLeadSection(props: ParentProps<{
  leadShellClass: string;
  leadText: string | null;
  leadTextClass: string;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  summaryText: string;
  title: string;
  withMarginTop?: boolean;
}>) {
  return (
    <StructuredResultSectionCard sectionEntry={props.sectionEntry} title={props.title} withMarginTop={props.withMarginTop}>
      <p class="mt-2 text-sm text-slate-900">{props.summaryText}</p>
      <StructuredResultInlineCardText
        text={props.leadText}
        shellClass={props.leadShellClass}
        textClass={props.leadTextClass}
      />
      {props.children}
    </StructuredResultSectionCard>
  );
}

function StructuredResultCollectionSection(props: ParentProps<{
  sectionEntry?: WorkflowRunStructuredResultEntry;
  summaryText: string;
  title: string;
  withMarginTop?: boolean;
}>) {
  return (
    <StructuredResultSectionCard sectionEntry={props.sectionEntry} title={props.title} withMarginTop={props.withMarginTop}>
      <p class="mt-2 text-sm text-slate-900">{props.summaryText}</p>
      {props.children}
    </StructuredResultSectionCard>
  );
}

function StructuredResultPolicyContentSection(props: ParentProps<{
  entries: Array<[string, string]>;
  fallbackText: string;
  infoItems: StructuredResultInfoCardItem[];
  policyChipItems: string[];
  sectionEntry?: WorkflowRunStructuredResultEntry;
  summaryText: string | null;
  title: string;
}>) {
  return (
    <StructuredResultPolicyRecordSection
      sectionEntry={props.sectionEntry}
      title={props.title}
      policyChipItems={props.policyChipItems}
      entries={props.entries}
      fallbackText={props.fallbackText}
    >
      {props.children}
      <StructuredResultSummaryText text={props.summaryText} />
      <StructuredResultInfoCardList items={props.infoItems} />
    </StructuredResultPolicyRecordSection>
  );
}

function StructuredResultSplitLayout(props: ParentProps<{ className: string }>) {
  return <div class={props.className}>{props.children}</div>;
}

function StructuredResultSideStack(props: ParentProps) {
  return <div class="grid gap-3">{props.children}</div>;
}

function StructuredResultBookingCandidateSections(props: {
  sections: StructuredResultBookingCandidateSectionState[];
  itemBuilder: (section: StructuredResultBookingCandidateSectionState) => StructuredResultDetailListItem[];
}) {
  return (
    <Show when={props.sections.length > 0}>
      <div class={STRUCTURED_RESULT_THREE_COLUMN_GRID_CLASS}>
        <For each={props.sections}>
          {(section) => (
            <div class={STRUCTURED_RESULT_SOFT_SECTION_CARD_CLASS}>
              <p class={STRUCTURED_RESULT_SUBCARD_TITLE_CLASS}>{section.title}</p>
              <Show
                when={section.showObjectItems}
                fallback={<StructuredResultPlainItemList items={section.stringItems} />}
              >
                <StructuredResultDetailItemList items={props.itemBuilder(section)} />
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

function StructuredResultStudyBlockCard(props: { block: StructuredResultStudyBlockItem }) {
  return (
    <div class={STRUCTURED_RESULT_RECORD_ITEM_CLASS}>
      <dt class="font-mono text-xs font-semibold text-emerald-800">{props.block.titleText}</dt>
      <dd class="mt-1 text-sm text-slate-900">{props.block.summaryText}</dd>
      <Show when={props.block.windowText}>
        <p class="mt-1 text-xs text-emerald-800">{props.block.windowText}</p>
      </Show>
      <StructuredResultCueText text={props.block.focusKindText} marginClass="mt-1" />
      <StructuredResultWhiteChipRow items={props.block.policyChipItems} />
      <StructuredResultSupportText text={props.block.slotBasisText} marginClass="mt-1" />
      <StructuredResultInlineCardText
        text={props.block.anchorText}
        shellClass={STRUCTURED_RESULT_INFO_CARD_CLASS}
        textClass="text-xs text-slate-900"
        marginClass="mt-1"
      />
      <StructuredResultWhiteChipRow items={props.block.anchorFlags} />
      <StructuredResultCueText
        text={props.block.statusText}
        className="text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-700"
        marginClass="mt-1"
      />
      <StructuredResultInlineCardText
        text={props.block.nextActionText}
        shellClass={STRUCTURED_RESULT_INFO_CARD_CLASS}
        textClass="text-sm text-slate-900"
      />
    </div>
  );
}

function StructuredResultStudyBlockList(props: {
  entry?: WorkflowRunStructuredResultEntry;
  items: StructuredResultStudyBlockItem[];
}) {
  return (
    <>
      <Show
        when={props.items.length > 0}
        fallback={
          <p class="mt-2 text-sm text-slate-900">
            {props.entry?.present
              ? props.entry?.valueLabel
              : "No study blocks returned in this run result."}
          </p>
        }
      >
        <dl class="mt-2 space-y-2">
          <For each={props.items}>
            {(block) => <StructuredResultStudyBlockCard block={block} />}
          </For>
        </dl>
      </Show>
      <Show
        when={
          objectArray(props.entry?.rawValue).length === 0
            ? (props.entry?.valueJson ?? null)
            : null
        }
      >
        {(json) => <StructuredResultJsonPreview json={json()} />}
      </Show>
    </>
  );
}

function StructuredResultSummaryText(props: { text: string | null }) {
  return <StructuredResultSupportText text={props.text} />;
}

function StructuredResultSourceReferenceList(props: {
  items: StructuredResultSourceReferenceItem[];
  emptyText: string;
}) {
  return (
    <Show
      when={props.items.length > 0}
      fallback={<p class="mt-2 text-sm text-slate-900">{props.emptyText}</p>}
    >
      <ul class={STRUCTURED_RESULT_NOTE_LIST_CLASS}>
        <For each={props.items}>
          {(source) => (
            <li class={STRUCTURED_RESULT_REFERENCE_CARD_CLASS}>
              <Show
                when={source.plainText}
                fallback={
                  <div class="space-y-2">
                    <Show when={source.titleText}>
                      {(title) => <p class="font-medium text-slate-900">{title()}</p>}
                    </Show>
                    <Show when={source.urlText}>
                      {(url) => <p class="text-xs text-emerald-800 break-all">{url()}</p>}
                    </Show>
                    <div class="flex flex-wrap gap-2 text-[11px] text-emerald-800">
                      <Show when={source.domainText}>
                        {(domain) => (
                          <span class={STRUCTURED_RESULT_REFERENCE_CHIP_CLASS}>{domain()}</span>
                        )}
                      </Show>
                      <Show when={source.sourceTypeText}>
                        {(sourceTypeText) => (
                          <span class={STRUCTURED_RESULT_REFERENCE_CHIP_CLASS}>
                            {sourceTypeText()}
                          </span>
                        )}
                      </Show>
                      <Show when={source.publishedAtText}>
                        {(publishedAtText) => (
                          <span class={STRUCTURED_RESULT_REFERENCE_CHIP_CLASS}>
                            {publishedAtText()}
                          </span>
                        )}
                      </Show>
                    </div>
                    <dl class="space-y-1">
                      <For each={source.extraEntries}>
                        {([key, value]) => (
                          <div>
                            <dt class="font-mono text-[11px] font-semibold text-emerald-800">{key}</dt>
                            <dd class="text-xs text-slate-900">{value}</dd>
                          </div>
                        )}
                      </For>
                    </dl>
                  </div>
                }
              >
                <p class="text-sm text-slate-900">{source.plainText}</p>
              </Show>
            </li>
          )}
        </For>
      </ul>
    </Show>
  );
}

function StructuredResultGenericEntryList(props: { items: StructuredResultGenericEntryState[] }) {
  return (
    <Show when={props.items.length > 0}>
      <div class={STRUCTURED_RESULT_GENERIC_LIST_CLASS}>
        <For each={props.items}>
          {(entry) => (
            <div class={entry.shellClass}>
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-mono text-xs font-semibold text-emerald-900">{entry.keyText}</span>
                <span class={entry.presenceClass}>{entry.presenceLabel}</span>
              </div>
              <p class="mt-2 text-sm text-slate-800">{entry.valueText}</p>
              <Show when={entry.valueJson}>
                {(json) => <StructuredResultJsonPreview json={json()} />}
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  );
}

function StructuredResultSectionWithNote(
  props: ParentProps<{
    className: string;
    noteEntry?: WorkflowRunStructuredResultEntry;
    noteState: StructuredResultNoteSectionState;
  }>,
) {
  return (
    <StructuredResultSplitLayout className={props.className}>
      {props.children}
      <StructuredResultNoteSection sectionEntry={props.noteEntry} state={props.noteState} />
    </StructuredResultSplitLayout>
  );
}

function StructuredResultSectionSideStack(
  props: ParentProps<{
    noteEntry?: WorkflowRunStructuredResultEntry;
    noteState: StructuredResultNoteSectionState;
  }>,
) {
  return (
    <StructuredResultSideStack>
      <StructuredResultNoteSection sectionEntry={props.noteEntry} state={props.noteState} />
      {props.children}
    </StructuredResultSideStack>
  );
}

function StructuredResultPolicySummaryInfoWithNote(props: {
  bodyState?: StructuredResultBodyBlockState | null;
  className: string;
  entries: Array<[string, string]>;
  fallbackText: string;
  infoItems: StructuredResultInfoCardItem[];
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  policyChipItems: string[];
  sectionEntry?: WorkflowRunStructuredResultEntry;
  secondaryChipItems?: string[] | StructuredResultChipItem[];
  summaryText?: string | null;
  title: string;
}) {
  return (
    <StructuredResultSectionWithNote
      className={props.className}
      noteEntry={props.noteEntry}
      noteState={props.noteState}
    >
      <StructuredResultPolicySummaryInfoSection
        sectionEntry={props.sectionEntry}
        title={props.title}
        policyChipItems={props.policyChipItems}
        entries={props.entries}
        fallbackText={props.fallbackText}
        bodyState={props.bodyState}
        summaryText={props.summaryText ?? null}
        secondaryChipItems={props.secondaryChipItems}
        infoItems={props.infoItems}
      />
    </StructuredResultSectionWithNote>
  );
}

function StructuredResultPolicyContentWithNote(
  props: ParentProps<{
    className: string;
    entries: Array<[string, string]>;
    fallbackText: string;
    infoItems: StructuredResultInfoCardItem[];
    noteEntry?: WorkflowRunStructuredResultEntry;
    noteState: StructuredResultNoteSectionState;
    policyChipItems: string[];
    sectionEntry?: WorkflowRunStructuredResultEntry;
    summaryText?: string | null;
    title: string;
  }>,
) {
  return (
    <StructuredResultSectionWithNote
      className={props.className}
      noteEntry={props.noteEntry}
      noteState={props.noteState}
    >
      <StructuredResultPolicyContentSection
        sectionEntry={props.sectionEntry}
        title={props.title}
        policyChipItems={props.policyChipItems}
        entries={props.entries}
        fallbackText={props.fallbackText}
        summaryText={props.summaryText ?? null}
        infoItems={props.infoItems}
      >
        {props.children}
      </StructuredResultPolicyContentSection>
    </StructuredResultSectionWithNote>
  );
}

function StructuredResultScheduleSection(props: {
  calendarEntry?: WorkflowRunStructuredResultEntry;
  calendarState: StructuredResultCalendarContextState;
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionState: StructuredResultRecommendedSlotState;
  showCalendar: boolean;
}) {
  return (
    <>
      <StructuredResultSectionWithNote
        className={STRUCTURED_RESULT_WIDE_GRID_CLASS}
        noteEntry={props.noteEntry}
        noteState={props.noteState}
      >
        <StructuredResultPolicyRecordSection
          sectionEntry={props.sectionEntry}
          title="Recommended slot"
          policyChipItems={props.sectionState.policyChipItems}
          entries={props.sectionState.keyValueEntries}
          fallbackText={props.sectionState.fallbackText}
        >
          <StructuredResultInlineCardText
            text={props.sectionState.windowText}
            shellClass={STRUCTURED_RESULT_RECORD_ITEM_CLASS}
            textClass="text-sm text-slate-900"
          />
          <StructuredResultCueText text={props.sectionState.focusKindText} />
          <StructuredResultSupportText text={props.sectionState.prepLeadText} />
          <StructuredResultSupportText text={props.sectionState.slotBasisText} />
          <StructuredResultInlineCardText
            text={props.sectionState.anchorText}
            shellClass={STRUCTURED_RESULT_INFO_CARD_CLASS}
            textClass="text-xs text-slate-900"
          />
          <StructuredResultSupportText
            text={
              props.sectionState.anchorLocationText
                ? `Location: ${props.sectionState.anchorLocationText}`
                : null
            }
          />
          <StructuredResultCueText text={props.sectionState.noteKindText} />
          <StructuredResultInlineCardText
            text={props.sectionState.nextActionText}
            shellClass={STRUCTURED_RESULT_INFO_CARD_CLASS}
            textClass="text-sm text-slate-900"
          />
          <Show
            when={
              props.sectionState.keyValueEntries.length === 0
                ? (props.sectionEntry?.valueJson ?? null)
                : null
            }
          >
            {(json) => <StructuredResultJsonPreview json={json()} />}
          </Show>
        </StructuredResultPolicyRecordSection>
      </StructuredResultSectionWithNote>
      <Show when={props.showCalendar}>
        <StructuredResultCalendarContextSection
          sectionEntry={props.calendarEntry}
          state={props.calendarState}
          title="Calendar context"
          withMarginTop
        />
      </Show>
    </>
  );
}

function StructuredResultResearchSection(props: {
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionState: StructuredResultPrimarySectionState;
  sourceReferenceEntry?: WorkflowRunStructuredResultEntry;
  sourceReferenceItems: StructuredResultSourceReferenceItem[];
}) {
  return (
    <StructuredResultSplitLayout className={STRUCTURED_RESULT_BALANCED_GRID_CLASS}>
      <StructuredResultPolicySummaryInfoSection
        sectionEntry={props.sectionEntry}
        title="Research brief"
        policyChipItems={props.sectionState.policyChipItems}
        entries={props.sectionState.keyValueEntries}
        fallbackText={props.sectionState.fallbackText}
        bodyState={props.sectionState.body}
        summaryText={props.sectionState.proposalSummaryText}
        infoItems={props.sectionState.infoItems}
      />
      <StructuredResultSectionSideStack noteEntry={props.noteEntry} noteState={props.noteState}>
        <StructuredResultSectionCard sectionEntry={props.sourceReferenceEntry} title="Source references">
          <StructuredResultSourceReferenceList
            items={props.sourceReferenceItems}
            emptyText={structuredResultMissingText(props.sourceReferenceEntry, "source references")}
          />
        </StructuredResultSectionCard>
      </StructuredResultSectionSideStack>
    </StructuredResultSplitLayout>
  );
}

function StructuredResultStudySection(props: {
  calendarEntry?: WorkflowRunStructuredResultEntry;
  calendarState: StructuredResultCalendarContextState;
  inputEntry?: WorkflowRunStructuredResultEntry;
  inputState: StructuredResultStudyInputContextState;
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionItems: StructuredResultStudyBlockItem[];
  showCalendar: boolean;
  showInput: boolean;
}) {
  return (
    <>
      <StructuredResultSectionWithNote
        className={STRUCTURED_RESULT_WIDE_GRID_CLASS}
        noteEntry={props.noteEntry}
        noteState={props.noteState}
      >
        <StructuredResultSectionCard sectionEntry={props.sectionEntry} title="Study blocks">
          <StructuredResultStudyBlockList entry={props.sectionEntry} items={props.sectionItems} />
        </StructuredResultSectionCard>
      </StructuredResultSectionWithNote>
      <Show when={props.showInput}>
        <StructuredResultSummaryLeadSection
          sectionEntry={props.inputEntry}
          title="Study input context"
          summaryText={props.inputState.summaryText}
          leadText={props.inputState.nextFocusText}
          leadShellClass={STRUCTURED_RESULT_RECORD_ITEM_CLASS}
          leadTextClass="text-sm text-slate-900"
          withMarginTop
        >
          <StructuredResultFocusItemList items={props.inputState.focusItems} />
        </StructuredResultSummaryLeadSection>
      </Show>
      <Show when={props.showCalendar}>
        <StructuredResultCalendarContextSection
          sectionEntry={props.calendarEntry}
          state={props.calendarState}
          title="Calendar context"
          withMarginTop
        />
      </Show>
    </>
  );
}

function StructuredResultFinanceSection(props: {
  anomalyItems: StructuredResultDetailListItem[];
  inputEntry?: WorkflowRunStructuredResultEntry;
  inputState: StructuredResultFinanceInputContextState;
  monthlyTotalItems: StructuredResultDetailListItem[];
  noteEntry?: WorkflowRunStructuredResultEntry;
  noteState: StructuredResultNoteSectionState;
  sectionEntry?: WorkflowRunStructuredResultEntry;
  sectionState: StructuredResultPrimarySectionState;
  showInput: boolean;
  topSpendCategoryItems: StructuredResultDetailListItem[];
}) {
  return (
    <>
      <StructuredResultPolicySummaryInfoWithNote
        className={STRUCTURED_RESULT_BALANCED_GRID_CLASS}
        noteEntry={props.noteEntry}
        noteState={props.noteState}
        sectionEntry={props.sectionEntry}
        title="Finance digest"
        policyChipItems={props.sectionState.policyChipItems}
        entries={props.sectionState.keyValueEntries}
        fallbackText={props.sectionState.fallbackText}
        summaryText={props.sectionState.proposalSummaryText}
        secondaryChipItems={props.sectionState.chipItems}
        infoItems={props.sectionState.infoItems}
      />
      <Show when={props.showInput}>
        <StructuredResultCollectionSection
          sectionEntry={props.inputEntry}
          title="Finance input context"
          summaryText={props.inputState.summaryText}
          withMarginTop
        >
          <StructuredResultInlineCardText
            text={props.inputState.topSpendText}
            shellClass={STRUCTURED_RESULT_INFO_CARD_CLASS}
            textClass="text-sm text-slate-900"
          />
          <StructuredResultDetailItemList items={props.topSpendCategoryItems} />
          <StructuredResultDetailItemList items={props.anomalyItems} />
          <StructuredResultDetailItemList items={props.monthlyTotalItems} />
        </StructuredResultCollectionSection>
      </Show>
    </>
  );
}

function StructuredResultReceiptSection(props: StructuredResultPrimaryBranchView) {
  return (
    <StructuredResultPolicySummaryInfoWithNote
      className={STRUCTURED_RESULT_BALANCED_GRID_CLASS}
      noteEntry={props.noteEntry}
      noteState={props.noteState}
      sectionEntry={props.sectionEntry}
      title="Receipt entry"
      policyChipItems={props.sectionState.policyChipItems}
      entries={props.sectionState.keyValueEntries}
      fallbackText={props.sectionState.fallbackText}
      summaryText={props.sectionState.proposalSummaryText}
      secondaryChipItems={props.sectionState.chipItems}
      infoItems={props.sectionState.infoItems}
    />
  );
}

function StructuredResultReplySection(props: StructuredResultPrimaryBranchView) {
  return (
    <StructuredResultPolicySummaryInfoWithNote
      className={STRUCTURED_RESULT_CONTENT_GRID_CLASS}
      noteEntry={props.noteEntry}
      noteState={props.noteState}
      sectionEntry={props.sectionEntry}
      title="Reply draft"
      policyChipItems={props.sectionState.policyChipItems}
      entries={props.sectionState.keyValueEntries}
      fallbackText={props.sectionState.fallbackText}
      bodyState={props.sectionState.body}
      summaryText={props.sectionState.proposalSummaryText}
      infoItems={props.sectionState.infoItems}
    />
  );
}

function StructuredResultPublicationSection(props: StructuredResultPrimaryBranchView) {
  return (
    <StructuredResultPolicyContentWithNote
      className={STRUCTURED_RESULT_CONTENT_GRID_CLASS}
      noteEntry={props.noteEntry}
      noteState={props.noteState}
      sectionEntry={props.sectionEntry}
      title="Publication draft"
      policyChipItems={props.sectionState.policyChipItems}
      entries={props.sectionState.keyValueEntries}
      fallbackText={props.sectionState.fallbackText}
      summaryText={props.sectionState.proposalSummaryText}
      infoItems={props.sectionState.infoItems}
    >
      <Show when={props.sectionState.body}>
        {(bodyState) => <StructuredResultBodyBlock state={bodyState()} />}
      </Show>
      <StructuredResultSecondaryChipRow items={props.sectionState.tagItems ?? []} />
      <StructuredResultSecondaryChipRow items={props.sectionState.chipItems ?? []} />
    </StructuredResultPolicyContentWithNote>
  );
}

function StructuredResultBookingSection(props: StructuredResultBookingBranchView) {
  return (
    <StructuredResultPolicyContentWithNote
      className={STRUCTURED_RESULT_CONTENT_GRID_CLASS}
      noteEntry={props.noteEntry}
      noteState={props.noteState}
      sectionEntry={props.sectionEntry}
      title="Booking recommendation"
      policyChipItems={props.sectionState.policyChipItems}
      entries={props.sectionState.keyValueEntries}
      fallbackText={props.sectionState.fallbackText}
      summaryText={props.sectionState.proposalSummaryText}
      infoItems={props.sectionState.infoItems}
    >
      <StructuredResultOptionCardGrid
        className={STRUCTURED_RESULT_THREE_COLUMN_GRID_CLASS}
        items={props.sectionState.primaryOptionItems}
      />
      <StructuredResultBookingCandidateSections
        sections={props.sectionState.candidateSections}
        itemBuilder={(section) =>
          section.objectItems.map((candidate) => ({
            detailText: candidate.detailText,
            shellClass: STRUCTURED_RESULT_CANDIDATE_ROW_CLASS,
            supportText: candidate.rankText,
            titleText: candidate.detailText,
          }))
        }
      />
      <StructuredResultOptionCardGrid
        className={STRUCTURED_RESULT_TWO_COLUMN_GRID_CLASS}
        items={props.sectionState.summaryItems}
      />
      <Show when={props.sectionState.segmentDetailItems.length > 0}>
        <div class="mt-3">
          <StructuredResultDetailItemList items={props.sectionState.segmentDetailItems} />
        </div>
      </Show>
      <Show when={props.sectionState.outlineBody}>
        {(outlineBody) => <StructuredResultBodyBlock state={outlineBody()} />}
      </Show>
      <StructuredResultCueText text={props.sectionState.scopeText} />
    </StructuredResultPolicyContentWithNote>
  );
}

function StructuredResultPanelFrame(
  props: ParentProps<{
    detailText: string | null;
    headlineText: string;
  }>,
) {
  return (
    <div class={STRUCTURED_RESULT_PANEL_CLASS}>
      <div class={STRUCTURED_RESULT_HEADER_CLASS}>
        <p class={STRUCTURED_RESULT_TITLE_CLASS}>Structured result</p>
        <span class={STRUCTURED_RESULT_HEADLINE_CLASS}>{props.headlineText}</span>
      </div>
      <Show when={props.detailText}>
        {(detail) => <p class={STRUCTURED_RESULT_DETAIL_CLASS}>{detail()}</p>}
      </Show>
      {props.children}
    </div>
  );
}

export function WorkflowRunStructuredResultPanel(props: WorkflowRunStructuredResultPanelProps) {
  const panelViewState = createMemo(() => {
    const state = workflowRunStructuredResultPanelState(props);
    const entries = {
      anomalyNotes: state.entriesByKey.get("anomaly_notes"),
      bookingNotes: state.entriesByKey.get("booking_notes"),
      bookingRecommendation: state.entriesByKey.get("booking_recommendation"),
      calendarContext: state.entriesByKey.get("calendar_context"),
      financeDigest: state.entriesByKey.get("finance_digest"),
      financeInputContext: state.entriesByKey.get("finance_input_context"),
      keyFindings: state.entriesByKey.get("key_findings"),
      publicationDraft: state.entriesByKey.get("publication_draft"),
      publicationNotes: state.entriesByKey.get("publication_notes"),
      receiptEntry: state.entriesByKey.get("receipt_entry"),
      receiptNotes: state.entriesByKey.get("receipt_notes"),
      recommendedSlot: state.entriesByKey.get("recommended_slot"),
      reminders: state.entriesByKey.get("reminders"),
      replyDraft: state.entriesByKey.get("reply_draft"),
      researchBrief: state.entriesByKey.get("research_brief"),
      schedulingNotes: state.entriesByKey.get("scheduling_notes"),
      sourceRefs: state.entriesByKey.get("source_refs"),
      studyBlocks: state.entriesByKey.get("study_blocks"),
      studyInputContext: state.entriesByKey.get("study_input_context"),
      triageNotes: state.entriesByKey.get("triage_notes"),
    };
    const notes = structuredResultNoteStateMap(entries);
    const schedulingCalendar = structuredResultCalendarContextState(
      entries.calendarContext?.rawValue,
      entries.calendarContext?.valueLabel ?? "",
      {
        anchorKey: "next_schedule_anchor",
        anchorLabel: "Schedule anchor",
        eventKey: "upcoming_events",
        locationLabel: "Anchor location",
      },
    );
    const studyCalendar = structuredResultCalendarContextState(
      entries.calendarContext?.rawValue,
      entries.calendarContext?.valueLabel ?? "",
      {
        anchorKey: "next_academic_anchor",
        anchorLabel: "Academic anchor",
        eventKey: "upcoming_events",
      },
    );
    const financeInput = structuredResultFinanceInputContextState(
      entries.financeInputContext?.rawValue,
      entries.financeInputContext?.valueLabel ?? "",
    );
    const studyInput = structuredResultStudyInputContextState(
      entries.studyInputContext?.rawValue,
      entries.studyInputContext?.valueLabel ?? "",
    );
    const receipt = structuredResultPrimaryCardState(entries.receiptEntry, RECEIPT_ENTRY_EXCLUDED_KEYS, {
      artifactLabel: "Receipt artifact",
      missingLabel: "receipt entry",
    });
    const finance = structuredResultPrimaryCardState(entries.financeDigest, FINANCE_DIGEST_EXCLUDED_KEYS, {
      artifactLabel: "Finance artifact",
      missingLabel: "finance digest",
    });
    const research = structuredResultPrimaryCardState(entries.researchBrief, RESEARCH_BRIEF_EXCLUDED_KEYS, {
      artifactLabel: "Research artifact",
      missingLabel: "research brief",
    });
    const reply = structuredResultPrimaryCardState(entries.replyDraft, REPLY_DRAFT_EXCLUDED_KEYS, {
      artifactLabel: "Draft artifact",
      missingLabel: "reply draft",
    });
    const publication = structuredResultPrimaryCardState(entries.publicationDraft, PUBLICATION_DRAFT_EXCLUDED_KEYS, {
      artifactLabel: "Draft artifact",
      missingLabel: "publication draft",
    });
    const booking = structuredResultBookingCardState(entries.bookingRecommendation);
    const recommended = structuredResultRecommendedSlotState(entries.recommendedSlot);
    const showCalendarContext = recordValue(entries.calendarContext?.rawValue) !== null;
    const showFinanceInputContext = recordValue(entries.financeInputContext?.rawValue) !== null;
    const showStudyInputContext = recordValue(entries.studyInputContext?.rawValue) !== null;

    return {
      booking: structuredResultBookingBranchView({
        noteEntry: entries.bookingNotes,
        noteState: notes.booking,
        sectionEntry: entries.bookingRecommendation,
        sectionState: booking,
        show: state.mode.reviewableBookingRecommendation,
      }),
      detailText: state.detail,
      finance: structuredResultFinanceBranchView({
        financeInputEntry: entries.financeInputContext,
        financeInputState: financeInput,
        noteEntry: entries.anomalyNotes,
        noteState: notes.anomaly,
        sectionEntry: entries.financeDigest,
        sectionState: structuredResultPrimarySectionState(finance, {
          chipItems: structuredResultChipItems([
            { label: "Scope", value: finance.rawRecord?.digest_scope, humanize: true },
            { label: "Status", value: finance.rawRecord?.status, humanize: true },
          ]),
          infoItems: structuredResultInfoCardItems([
            { text: finance.nextActionText, textClass: "text-sm text-slate-900" },
            { text: finance.artifactText, textClass: "text-xs text-slate-900" },
          ]),
        }),
        show: state.mode.financeDigest,
        showInput: showFinanceInputContext,
      }),
      genericEntryItems: state.genericEntries.map((genericEntry) =>
        structuredResultGenericEntryState(genericEntry),
      ),
      headlineText: state.headline,
      publication: structuredResultPrimaryBranchView({
        noteEntry: entries.publicationNotes,
        noteState: notes.publication,
        sectionEntry: entries.publicationDraft,
        sectionState: structuredResultPrimarySectionState(publication, {
          bodyTitle: "Draft body",
          bodyValue: publication.rawRecord?.draft_body,
          chipItems: structuredResultChipItems([
            { value: publication.rawRecord?.visibility, humanize: true },
          ]),
          infoItems: structuredResultInfoCardItems([
            {
              text: structuredResultInfoCardText("Draft title", publication.rawRecord?.draft_title),
              textClass: "text-xs text-slate-900",
            },
            { text: publication.artifactText, textClass: "text-xs text-slate-900" },
            { text: publication.nextActionText, textClass: "text-sm text-slate-900" },
          ]),
          tagItems: structuredResultNestedStringItems(publication.rawRecord, "draft_tags"),
        }),
        show: state.mode.reviewablePublicationDraft,
      }),
      receipt: structuredResultPrimaryBranchView({
        noteEntry: entries.receiptNotes,
        noteState: notes.receipt,
        sectionEntry: entries.receiptEntry,
        sectionState: structuredResultPrimarySectionState(receipt, {
          chipItems: structuredResultChipItems([
            { label: "Category", value: receipt.rawRecord?.category, humanize: true },
            { label: "Status", value: receipt.rawRecord?.receipt_status, humanize: true },
          ]),
          infoItems: structuredResultInfoCardItems([
            { text: receipt.nextActionText, textClass: "text-sm text-slate-900" },
            { text: receipt.artifactText, textClass: "text-xs text-slate-900" },
          ]),
        }),
        show: state.mode.reviewableReceiptEntry,
      }),
      reply: structuredResultPrimaryBranchView({
        noteEntry: entries.triageNotes,
        noteState: notes.triage,
        sectionEntry: entries.replyDraft,
        sectionState: structuredResultPrimarySectionState(reply, {
          bodyTitle: "Draft body",
          bodyValue: reply.rawRecord?.reply_body,
          infoItems: structuredResultInfoCardItems([
            {
              text: structuredResultInfoCardText("Subject", reply.rawRecord?.reply_subject),
              textClass: "text-sm text-slate-900",
            },
            {
              text: structuredResultInfoCardText("Approval target", reply.rawRecord?.approval_target),
              textClass: "text-xs text-slate-900",
            },
            { text: reply.artifactText, textClass: "text-xs text-slate-900" },
            { text: reply.nextActionText, textClass: "text-sm text-slate-900" },
          ]),
        }),
        show: state.mode.reviewableReplyDraft,
      }),
      research: structuredResultResearchBranchView({
        noteEntry: entries.keyFindings,
        noteState: notes.keyFindings,
        sectionEntry: entries.researchBrief,
        sectionState: structuredResultPrimarySectionState(research, {
          bodyTitle: "Brief body",
          bodyValue: research.rawRecord?.brief_body,
          infoItems: structuredResultInfoCardItems([
            { text: research.artifactText, textClass: "text-xs text-slate-900" },
            { text: research.nextActionText, textClass: "text-sm text-slate-900" },
          ]),
        }),
        show: state.mode.researchBrief,
        sourceReferenceEntry: entries.sourceRefs,
      }),
      schedule: structuredResultScheduleBranchView({
        calendarEntry: entries.calendarContext,
        calendarState: schedulingCalendar,
        noteEntry: entries.schedulingNotes,
        noteState: notes.scheduling,
        sectionEntry: entries.recommendedSlot,
        sectionState: recommended,
        show: state.mode.reviewableScheduleRecommendation,
        showCalendar: showCalendarContext,
      }),
      study: structuredResultStudyBranchView({
        calendarEntry: entries.calendarContext,
        calendarState: studyCalendar,
        inputEntry: entries.studyInputContext,
        inputState: studyInput,
        noteEntry: entries.reminders,
        noteState: notes.reminders,
        sectionEntry: entries.studyBlocks,
        show: state.mode.draftStudyPlan,
        showCalendar: showCalendarContext,
        showInput: showStudyInputContext,
      }),
    };
  });

  const visibleSections = createMemo(() => {
    const panel = panelViewState();
    const sections: JSXElement[] = [];

    if (panel.schedule.show) {
      sections.push(
        <StructuredResultScheduleSection
          calendarEntry={panel.schedule.calendarEntry}
          calendarState={panel.schedule.calendarState}
          noteEntry={panel.schedule.noteEntry}
          noteState={panel.schedule.noteState}
          sectionEntry={panel.schedule.sectionEntry}
          sectionState={panel.schedule.sectionState}
          showCalendar={panel.schedule.showCalendar}
        />,
      );
    }

    if (panel.receipt.show) {
      sections.push(<StructuredResultReceiptSection {...panel.receipt} />);
    }

    if (panel.finance.show) {
      sections.push(
        <StructuredResultFinanceSection
          anomalyItems={panel.finance.anomalyItems}
          inputEntry={panel.finance.inputEntry}
          inputState={panel.finance.inputState}
          monthlyTotalItems={panel.finance.monthlyTotalItems}
          noteEntry={panel.finance.noteEntry}
          noteState={panel.finance.noteState}
          sectionEntry={panel.finance.sectionEntry}
          sectionState={panel.finance.sectionState}
          showInput={panel.finance.showInput}
          topSpendCategoryItems={panel.finance.topSpendCategoryItems}
        />,
      );
    }

    if (panel.research.show) {
      sections.push(
        <StructuredResultResearchSection
          noteEntry={panel.research.noteEntry}
          noteState={panel.research.noteState}
          sectionEntry={panel.research.sectionEntry}
          sectionState={panel.research.sectionState}
          sourceReferenceEntry={panel.research.sourceReferenceEntry}
          sourceReferenceItems={panel.research.sourceReferenceItems}
        />,
      );
    }

    if (panel.reply.show) {
      sections.push(<StructuredResultReplySection {...panel.reply} />);
    }

    if (panel.publication.show) {
      sections.push(<StructuredResultPublicationSection {...panel.publication} />);
    }

    if (panel.study.show) {
      sections.push(
        <StructuredResultStudySection
          calendarEntry={panel.study.calendarEntry}
          calendarState={panel.study.calendarState}
          inputEntry={panel.study.inputEntry}
          inputState={panel.study.inputState}
          noteEntry={panel.study.noteEntry}
          noteState={panel.study.noteState}
          sectionEntry={panel.study.sectionEntry}
          sectionItems={panel.study.sectionItems}
          showCalendar={panel.study.showCalendar}
          showInput={panel.study.showInput}
        />,
      );
    }

    if (panel.booking.show) {
      sections.push(<StructuredResultBookingSection {...panel.booking} />);
    }

    sections.push(<StructuredResultGenericEntryList items={panel.genericEntryItems} />);
    return sections;
  });

  return (
    <StructuredResultPanelFrame
      headlineText={panelViewState().headlineText}
      detailText={panelViewState().detailText}
    >
      <For each={visibleSections()}>{(section) => section}</For>
    </StructuredResultPanelFrame>
  );
}
