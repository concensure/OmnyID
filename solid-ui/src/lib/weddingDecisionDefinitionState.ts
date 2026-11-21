// @module-id: wedding.decision-definition-state
// @primary-capability: select-one-evidence-led-wedding-decision-before-presentation
// @locs-version: 1.0
import type { WeddingPlanningTaskItem, WeddingPlanningTaskKind } from "@/lib/weddingCalendarProjectionState";

export type WeddingDecisionType =
  | "setup_date"
  | "setup_budget"
  | "setup_guests"
  | "venue"
  | "vendor_choice"
  | "quote_choice"
  | "guest_count"
  | "rsvp"
  | "seating"
  | "transport"
  | "legal"
  | "payment"
  | "run_sheet"
  | "approval"
  | "planning_task";

export type WeddingDecisionPrerequisiteKey =
  | "wedding_date"
  | "budget_target"
  | "guest_scope"
  | "requirements"
  | "selected_option"
  | "source_evidence";

export type WeddingDecisionEvidence = {
  label: string;
  ref: string;
  sourceKind: "wedding_plan" | "quote" | "vendor_source" | "task" | "calendar" | "approval";
  status: "confirmed" | "estimate" | "unknown";
};

export type WeddingDecisionPrerequisite = {
  key: WeddingDecisionPrerequisiteKey;
  label: string;
  satisfied: boolean;
  resolutionQuestion: string;
  resolutionActionLabel: string;
};

export type WeddingDecisionOption = {
  id: string;
  label: string;
  summary: string;
};

export type WeddingDecisionContract = {
  decisionType: WeddingDecisionType;
  question: string;
  options: WeddingDecisionOption[];
  prerequisites: WeddingDecisionPrerequisite[];
  missingPrerequisite: WeddingDecisionPrerequisite | null;
  answerRecord: string;
  deadlinePolicy: "hard_deadline" | "lead_time" | "sequence" | "no_deadline";
  deadlineReason: string;
  primaryActionLabel: string;
  primaryOutcome: string;
  knownFacts: string[];
  oneThingToConfirm: string | null;
  evidence: WeddingDecisionEvidence[];
  recommendationSupported: boolean;
  approvalRequiredBeforeExternalAction: boolean;
  settled: boolean;
};

export type WeddingDecisionSavedFacts = {
  weddingDate?: string | null;
  budgetTargetAmount?: number | null;
  guestCount?: number | null;
  selectedDecisionLabels?: readonly string[] | null;
};

type DecisionDefinition = {
  decisionType: WeddingDecisionType;
  question: (task: WeddingPlanningTaskItem) => string;
  options: WeddingDecisionOption[];
  prerequisiteKeys: WeddingDecisionPrerequisiteKey[];
  answerRecord: string;
  deadlinePolicy: WeddingDecisionContract["deadlinePolicy"];
  primaryActionLabel: string;
  primaryOutcome: string;
  approvalRequiredBeforeExternalAction?: boolean;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(clean).filter(Boolean) : [];
}

function unique(values: readonly string[], limit = 8): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const normalized = clean(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key) || seen.size >= limit) return [];
    seen.add(key);
    return [normalized];
  });
}

function options(...values: Array<[string, string, string]>): WeddingDecisionOption[] {
  return values.map(([id, label, summary]) => ({ id, label, summary }));
}

const GENERIC_BY_KIND: Record<WeddingPlanningTaskKind, Omit<DecisionDefinition, "question">> = {
  research: { decisionType: "planning_task", options: options(["research", "Research it", "Gather the missing sourced facts before choosing."], ["use_saved", "Use saved information", "Continue only with facts already recorded."]), prerequisiteKeys: [], answerRecord: "wedding_planning_task", deadlinePolicy: "lead_time", primaryActionLabel: "Review the research question", primaryOutcome: "Define the one fact the research must resolve." },
  vendor_follow_up: { decisionType: "vendor_choice", options: options(["follow_up", "Follow up", "Prepare a follow-up for review."], ["wait", "Wait", "Keep the choice open until the stated date."], ["move_on", "Move on", "Continue with another suitable option."]), prerequisiteKeys: ["selected_option", "source_evidence"], answerRecord: "wedding_vendor_outreach", deadlinePolicy: "lead_time", primaryActionLabel: "Review follow-up options", primaryOutcome: "Choose the next vendor step without sending anything yet.", approvalRequiredBeforeExternalAction: true },
  budget_review: { decisionType: "quote_choice", options: options(["compare", "Compare on the same basis", "Check totals, inclusions and unknowns."], ["clarify", "Clarify missing costs", "Prepare a question for review before sending."], ["keep_open", "Keep the choice open", "Wait for complete cost evidence."]), prerequisiteKeys: ["budget_target", "source_evidence"], answerRecord: "quotation_comparison", deadlinePolicy: "hard_deadline", primaryActionLabel: "Review the money decision", primaryOutcome: "Record a budget or quote choice without counting an estimate as confirmed.", approvalRequiredBeforeExternalAction: true },
  guest_list: { decisionType: "guest_count", options: options(["confirm", "Use this count", "Record the count as the current planning basis."], ["review", "Review the list", "Resolve missing or duplicate guests first."], ["keep_open", "Keep it open", "Retain the working count until the deadline."]), prerequisiteKeys: ["guest_scope"], answerRecord: "wedding_guest", deadlinePolicy: "hard_deadline", primaryActionLabel: "Review the guest decision", primaryOutcome: "Update the canonical guest list or final-count decision." },
  legal: { decisionType: "legal", options: options(["prepare", "Prepare the requirement", "Collect the information for authorised review."], ["ask_celebrant", "Ask the celebrant", "Prepare a question for approval before sending."], ["review", "Review what is saved", "Check the current record without lodging anything."]), prerequisiteKeys: ["wedding_date"], answerRecord: "wedding_legal_administration", deadlinePolicy: "hard_deadline", primaryActionLabel: "Review the legal next step", primaryOutcome: "Record preparation work without implying legal completion or lodging.", approvalRequiredBeforeExternalAction: true },
  vow: { decisionType: "planning_task", options: options(["draft", "Start a private draft", "Use confirmed relationship facts only."], ["outline", "Choose an outline", "Record the preferred structure first."], ["later", "Decide later", "Keep this private task open."]), prerequisiteKeys: [], answerRecord: "wedding_planning_task", deadlinePolicy: "lead_time", primaryActionLabel: "Choose the vow next step", primaryOutcome: "Advance one private preparation step." },
  rings: { decisionType: "vendor_choice", options: options(["compare", "Compare ring options", "Review style, metal, sizing, timing and budget."], ["existing", "Use existing rings", "Record that no supplier search is needed."], ["later", "Decide later", "Keep the choice open."]), prerequisiteKeys: ["budget_target", "requirements"], answerRecord: "wedding_decision_selection", deadlinePolicy: "lead_time", primaryActionLabel: "Choose how to compare rings", primaryOutcome: "Save the ring requirements before any supplier contact.", approvalRequiredBeforeExternalAction: true },
  first_dance: { decisionType: "planning_task", options: options(["choose_song", "Choose a song", "Record the preferred song and version."], ["skip", "Skip a formal first dance", "Record that this tradition is not required."], ["keep_open", "Keep it open", "Return after checking the run sheet."]), prerequisiteKeys: [], answerRecord: "wedding_planning_task", deadlinePolicy: "sequence", primaryActionLabel: "Choose the first-dance direction", primaryOutcome: "Record one clear run-sheet choice." },
  cake: { decisionType: "vendor_choice", options: options(["compare", "Compare cake options", "Review serves, dietary needs, design and total cost."], ["alternative", "Use another dessert", "Record a non-cake direction."], ["keep_open", "Keep it open", "Wait for missing requirements."]), prerequisiteKeys: ["guest_scope", "budget_target", "requirements"], answerRecord: "wedding_decision_selection", deadlinePolicy: "lead_time", primaryActionLabel: "Review cake options", primaryOutcome: "Save the dessert requirements or preferred direction.", approvalRequiredBeforeExternalAction: true },
  transport: { decisionType: "transport", options: options(["hired", "Hire transport", "Compare capacity, route, timing and full cost."], ["existing", "Use existing vehicles", "Coordinate drivers, parking and return travel."], ["none", "No extra transport", "Use this when the day stays in one place and everyone has a safe plan."]), prerequisiteKeys: ["requirements"], answerRecord: "wedding_planning_task", deadlinePolicy: "lead_time", primaryActionLabel: "Confirm who needs transport", primaryOutcome: "Save passenger, route and timing requirements before comparing options.", approvalRequiredBeforeExternalAction: true },
  attire: { decisionType: "vendor_choice", options: options(["buy", "Buy", "Compare lead time, alterations and total cost."], ["hire", "Hire", "Compare availability, sizing and return terms."], ["existing", "Use existing attire", "Record what is already arranged."]), prerequisiteKeys: ["budget_target", "requirements"], answerRecord: "wedding_decision_selection", deadlinePolicy: "lead_time", primaryActionLabel: "Choose the attire direction", primaryOutcome: "Save the requirements before ordering or booking.", approvalRequiredBeforeExternalAction: true },
  hen_party: { decisionType: "planning_task", options: options(["relaxed", "Relaxed gathering", "Prioritise conversation, access and an affordable shared plan."], ["activity", "Group activity", "Compare attendance, comfort, transport and per-person cost."], ["skip", "No organised event", "Record that no separate event is needed."]), prerequisiteKeys: ["requirements", "budget_target"], answerRecord: "wedding_planning_task", deadlinePolicy: "lead_time", primaryActionLabel: "Choose the celebration format", primaryOutcome: "Save the format before collecting money or booking." },
  beauty: { decisionType: "vendor_choice", options: options(["vendor", "Book a professional", "Compare trial, timing, travel and total price."], ["self", "Do it yourselves", "Record products, timing and help required."], ["mixed", "Use a mixed plan", "Choose which services need a professional."]), prerequisiteKeys: ["requirements", "budget_target"], answerRecord: "wedding_decision_selection", deadlinePolicy: "lead_time", primaryActionLabel: "Choose the beauty-service direction", primaryOutcome: "Save the service scope before supplier contact.", approvalRequiredBeforeExternalAction: true },
  music: { decisionType: "vendor_choice", options: options(["dj", "DJ", "Compare coverage, equipment, requests and price."], ["live", "Live music", "Compare lineup, set times, space and sound limits."], ["playlist", "Curated playlist", "Record equipment and who will operate it."]), prerequisiteKeys: ["requirements", "budget_target"], answerRecord: "wedding_decision_selection", deadlinePolicy: "lead_time", primaryActionLabel: "Choose the music direction", primaryOutcome: "Save the entertainment scope before enquiries.", approvalRequiredBeforeExternalAction: true },
  contract_review: { decisionType: "quote_choice", options: options(["accept", "Proceed to approval", "Review the exact terms before any signature or payment."], ["clarify", "Clarify a term", "Prepare a question for review before sending."], ["decline", "Do not proceed", "Keep the current choice open or move to an alternative."]), prerequisiteKeys: ["selected_option", "source_evidence"], answerRecord: "quotation_review", deadlinePolicy: "hard_deadline", primaryActionLabel: "Review the contract choice", primaryOutcome: "Record the review outcome without signing or paying automatically.", approvalRequiredBeforeExternalAction: true },
  rsvp: { decisionType: "rsvp", options: options(["remind", "Prepare a reminder", "Review a contextual reminder before sending."], ["call", "Follow up another way", "Record a phone or personal follow-up."], ["wait", "Wait", "Keep the response open until the deadline."]), prerequisiteKeys: ["wedding_date", "guest_scope"], answerRecord: "wedding_event_response", deadlinePolicy: "hard_deadline", primaryActionLabel: "Choose the RSVP next step", primaryOutcome: "Update the existing RSVP follow-up workflow without changing a guest response.", approvalRequiredBeforeExternalAction: true },
  seating: { decisionType: "seating", options: options(["place", "Place the guest", "Update the current seating scenario."], ["resolve", "Resolve a constraint", "Confirm the relationship, access or household rule first."], ["keep_open", "Leave unassigned", "Keep the seat open until the missing fact is known."]), prerequisiteKeys: ["guest_scope", "requirements"], answerRecord: "wedding_seating_assignment", deadlinePolicy: "sequence", primaryActionLabel: "Review the seating choice", primaryOutcome: "Update the existing seating plan and its constraints." },
  vendor_coordination: { decisionType: "run_sheet", options: options(["confirm", "Confirm the responsibility", "Record owner, time and dependency."], ["change", "Change the arrangement", "Update the existing coordination task."], ["clarify", "Clarify first", "Resolve the one missing operational fact."]), prerequisiteKeys: ["selected_option"], answerRecord: "wedding_planning_task", deadlinePolicy: "hard_deadline", primaryActionLabel: "Review the coordination choice", primaryOutcome: "Update the existing task or run sheet without contacting a vendor.", approvalRequiredBeforeExternalAction: true },
  document_checklist: { decisionType: "legal", options: options(["record", "Record what is ready", "Update the existing checklist."], ["ask", "Ask what is required", "Prepare a question for authorised review."], ["later", "Not ready yet", "Keep the item open with its deadline."]), prerequisiteKeys: ["wedding_date"], answerRecord: "wedding_legal_administration", deadlinePolicy: "hard_deadline", primaryActionLabel: "Review the document requirement", primaryOutcome: "Update the existing checklist without asserting legal completion.", approvalRequiredBeforeExternalAction: true },
  run_sheet: { decisionType: "run_sheet", options: options(["confirm", "Confirm this timing", "Update the installed run sheet."], ["change", "Change the timing", "Review dependencies before moving it."], ["clarify", "Clarify an owner or dependency", "Resolve the blocker before confirming."]), prerequisiteKeys: ["wedding_date", "selected_option"], answerRecord: "wedding_runsheet_item", deadlinePolicy: "sequence", primaryActionLabel: "Review the run-sheet decision", primaryOutcome: "Update the installed run-sheet record." },
  weather_contingency: { decisionType: "venue", options: options(["indoor", "Use the indoor fallback", "Confirm capacity, access and changeover timing."], ["covered", "Use a covered alternative", "Confirm weather limits and guest comfort."], ["relocate", "Relocate the activity", "Review travel and run-sheet effects."]), prerequisiteKeys: ["selected_option", "source_evidence"], answerRecord: "wedding_planning_task", deadlinePolicy: "hard_deadline", primaryActionLabel: "Choose the fallback to verify", primaryOutcome: "Record the fallback and its trigger without inventing a forecast.", approvalRequiredBeforeExternalAction: true },
  email_draft: { decisionType: "approval", options: options(["approve", "Approve the exact draft", "Send only through the existing guarded provider flow."], ["edit", "Edit it", "Change the recipient or wording before approval."], ["do_not_send", "Do not send", "Leave the external action unexecuted."]), prerequisiteKeys: ["selected_option", "source_evidence"], answerRecord: "approval_receipt", deadlinePolicy: "hard_deadline", primaryActionLabel: "Review the draft", primaryOutcome: "Approve, edit or reject the exact draft before any send.", approvalRequiredBeforeExternalAction: true },
  registry: { decisionType: "planning_task", options: options(["create", "Create a registry", "Record what is useful and appropriate for guests."], ["alternative", "Use an alternative", "Record a wishing well, charity or non-gift direction."], ["none", "No registry", "Record that gifts are not requested."]), prerequisiteKeys: [], answerRecord: "wedding_planning_task", deadlinePolicy: "sequence", primaryActionLabel: "Choose the registry direction", primaryOutcome: "Save one guest-facing direction." },
  decision: { decisionType: "planning_task", options: options(["review", "Review the options", "Compare the available evidence and unknowns."], ["keep_open", "Keep it open", "Wait for the missing fact."], ["record", "Record our choice", "Update the existing decision record."]), prerequisiteKeys: ["requirements"], answerRecord: "wedding_decision_selection", deadlinePolicy: "sequence", primaryActionLabel: "Review this choice", primaryOutcome: "Update the existing decision record." },
  other: { decisionType: "planning_task", options: options(["do_next", "Do the next step", "Open the existing task and update it."], ["clarify", "Clarify what is missing", "Record the one fact needed before proceeding."], ["later", "Decide later", "Keep the task open with its reminder."]), prerequisiteKeys: [], answerRecord: "wedding_planning_task", deadlinePolicy: "no_deadline", primaryActionLabel: "Review the next step", primaryOutcome: "Update the existing planning task." },
};

const PREREQUISITES: Record<WeddingDecisionPrerequisiteKey, Omit<WeddingDecisionPrerequisite, "satisfied">> = {
  wedding_date: { key: "wedding_date", label: "Wedding date", resolutionQuestion: "What date or planning window should this decision use?", resolutionActionLabel: "Set the wedding date" },
  budget_target: { key: "budget_target", label: "Budget target", resolutionQuestion: "What budget should this choice fit within?", resolutionActionLabel: "Set the budget" },
  guest_scope: { key: "guest_scope", label: "Guest scope", resolutionQuestion: "Who needs to be included in this decision?", resolutionActionLabel: "Review the guest list" },
  requirements: { key: "requirements", label: "Requirements", resolutionQuestion: "Which requirement matters most for this choice?", resolutionActionLabel: "Confirm the requirements" },
  selected_option: { key: "selected_option", label: "Selected option", resolutionQuestion: "Which option should this follow-up apply to?", resolutionActionLabel: "Choose an option first" },
  source_evidence: { key: "source_evidence", label: "Source evidence", resolutionQuestion: "Which quote, term or source should this decision rely on?", resolutionActionLabel: "Open the source evidence" },
};

const PREREQUISITE_ANSWER_RECORD: Partial<Record<WeddingDecisionPrerequisiteKey, string>> = {
  wedding_date: "wedding_event_setup",
  budget_target: "wedding_budget_allocation",
  guest_scope: "wedding_guest",
  selected_option: "wedding_decision_selection",
  source_evidence: "wedding_evidence_reference",
};

function classify(task: WeddingPlanningTaskItem): DecisionDefinition {
  const text = `${task.title} ${task.notes ?? ""} ${task.kind}`.toLowerCase();
  const base = GENERIC_BY_KIND[task.kind];
  const venueDefinition: Omit<DecisionDefinition, "question"> = {
    ...GENERIC_BY_KIND.decision,
    decisionType: "venue",
    prerequisiteKeys: ["wedding_date", "budget_target", "guest_scope", "requirements"],
    answerRecord: "wedding_decision_selection",
    deadlinePolicy: "lead_time",
    primaryActionLabel: "Compare venue options",
    primaryOutcome: "Save a venue preference without booking it.",
    approvalRequiredBeforeExternalAction: true,
  };
  const overridden = /transport|limousine|shuttle|pickup/.test(text) ? GENERIC_BY_KIND.transport
    : /final (guest|caterer|catering|head)count|final numbers/.test(text) ? GENERIC_BY_KIND.guest_list
      : /rsvp|guest response/.test(text) ? GENERIC_BY_KIND.rsvp
        : /seating|table plan/.test(text) ? GENERIC_BY_KIND.seating
          : /noim|legal|marriage document|proof of (birth|identity)/.test(text) ? GENERIC_BY_KIND.legal
            : /deposit|balance|payment/.test(text) ? { ...GENERIC_BY_KIND.budget_review, decisionType: "payment" as const, answerRecord: "wedding_payment_review" }
              : /quote|minimum spend|inclusion|package price/.test(text) ? GENERIC_BY_KIND.budget_review
                : /run[ -]?sheet|timeline|pickup schedule/.test(text) ? GENERIC_BY_KIND.run_sheet
                  : /venue|ceremony location|reception location/.test(text) && /choose|compare|shortlist|select|book/.test(text) ? venueDefinition
                    : base;
  return {
    ...overridden,
    question: () => questionFor(overridden.decisionType, task.title),
  };
}

function questionFor(type: WeddingDecisionType, title: string): string {
  const subject = clean(title).replace(/^(choose|decide|confirm|review|verify|book|add|prepare|finalise|finalize|compare|check)\s+/i, "").replace(/[.!?]+$/, "");
  if (type === "transport") return "How should your wedding party travel?";
  if (type === "guest_count") return "Which guest count can you stand behind?";
  if (type === "rsvp") return "What is the right next step for these unanswered RSVPs?";
  if (type === "seating") return "What seating choice needs your confirmation?";
  if (type === "venue") return "Which venue option best fits your wedding?";
  if (type === "quote_choice") return "Which option fits the agreed scope and budget?";
  if (type === "payment") return "Is this payment ready to approve?";
  if (type === "approval") return "Do you want to approve this exact action?";
  if (type === "legal") return "What must be prepared or confirmed next?";
  if (type === "run_sheet") return "Which timing or responsibility should be confirmed next?";
  if (type === "vendor_choice") return `Which ${subject || "supplier option"} best fits your priorities?`;
  return subject ? `What should you do about ${subject.charAt(0).toLowerCase()}${subject.slice(1)}?` : "What is the next choice to make?";
}

function hasRequirementEvidence(task: WeddingPlanningTaskItem): boolean {
  const metadata = record(task.metadata);
  return metadata.requirements_confirmed === true
    || metadata.scope_confirmed === true
    || metadata.guest_final_count_decision === true
    || strings(metadata.second_order_evidence_labels).some((label) => /requirement|scope|guest|location|route|count|priority|preference/i.test(label));
}

function taskEvidence(task: WeddingPlanningTaskItem, facts: WeddingDecisionSavedFacts): WeddingDecisionEvidence[] {
  const metadata = record(task.metadata);
  const urls = unique([
    ...strings(metadata.source_urls),
    ...strings(metadata.sourceUrls),
  ], 8).filter((value) => /^https?:\/\//i.test(value));
  const refs = unique([
    ...strings(metadata.source_refs),
    ...strings(metadata.sourceRefs),
    clean(task.linkedArtifactId),
  ], 8);
  const quoteLabels = unique([
    ...strings(metadata.quote_lines),
    ...strings(metadata.quote_line_labels),
    ...strings(metadata.inclusions).map((value) => `Included: ${value}`),
    clean(metadata.quoted_total),
    clean(metadata.minimum_spend),
    clean(metadata.constraint_label),
  ], 6);
  const labels = unique([
    ...quoteLabels,
    ...strings(metadata.second_order_evidence_labels),
    ...strings(metadata.evidence_labels),
  ], 8);
  const evidence = labels.map((label, index): WeddingDecisionEvidence => ({
    label,
    ref: urls[index] ?? refs[index] ?? `task:${task.id}`,
    sourceKind: quoteLabels.includes(label) ? "quote" : urls[index] ? "vendor_source" : "task",
    status: /estimate|tbc|unknown|unconfirmed/i.test(label) ? "estimate" : "confirmed",
  }));
  for (let index = evidence.length; index < urls.length; index += 1) evidence.push({
    label: `Source ${index + 1}`,
    ref: urls[index]!,
    sourceKind: "vendor_source",
    status: "confirmed",
  });
  if (facts.weddingDate) evidence.push({ label: `Wedding date: ${facts.weddingDate}`, ref: "wedding_plan:date", sourceKind: "wedding_plan", status: "confirmed" });
  if (typeof facts.budgetTargetAmount === "number" && facts.budgetTargetAmount > 0) evidence.push({ label: `Budget target: ${new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(facts.budgetTargetAmount)}`, ref: "wedding_plan:budget", sourceKind: "wedding_plan", status: "confirmed" });
  if (typeof facts.guestCount === "number" && facts.guestCount > 0) evidence.push({ label: `Current guest list: ${facts.guestCount}`, ref: "wedding_plan:guests", sourceKind: "wedding_plan", status: "confirmed" });
  return evidence.slice(0, 8);
}

function selectedOptionMatches(task: WeddingPlanningTaskItem, facts: WeddingDecisionSavedFacts): boolean {
  const labels = facts.selectedDecisionLabels ?? [];
  if (labels.length === 0) return false;
  const taskWords = `${task.title} ${task.kind}`.toLowerCase().split(/[^a-z0-9]+/).filter((value) => value.length >= 5);
  return labels.some((label) => taskWords.some((word) => label.toLowerCase().includes(word)));
}

function isSettled(task: WeddingPlanningTaskItem): boolean {
  const metadata = record(task.metadata);
  return task.approvalState === "archived"
    || metadata.decision_settled === true
    || metadata.task_completed === true
    || metadata.completed === true
    || (task.semanticTags ?? []).some((tag) => /wedding_task_status:(done|completed|settled)/i.test(tag));
}

function deadlineReason(task: WeddingPlanningTaskItem, policy: WeddingDecisionContract["deadlinePolicy"]): string {
  if (task.dueAt || task.dueLabel) return `${clean(task.dueLabel) || "The saved deadline"} determines when this choice becomes urgent.`;
  if (policy === "lead_time") return "Supplier or preparation lead time determines priority; no unsupported urgency is added.";
  if (policy === "sequence") return "This choice becomes actionable when its prerequisites are settled.";
  if (policy === "hard_deadline") return "Use the saved contractual or statutory deadline; no deadline is invented.";
  return "No sourced deadline is saved, so this remains below dated blockers.";
}

export function buildWeddingTaskDecisionContract(input: {
  task: WeddingPlanningTaskItem;
  facts?: WeddingDecisionSavedFacts | null;
}): WeddingDecisionContract {
  const { task } = input;
  const facts = input.facts ?? {};
  const definition = classify(task);
  const evidence = taskEvidence(task, facts);
  const selected = selectedOptionMatches(task, facts);
  const prerequisiteSatisfied: Record<WeddingDecisionPrerequisiteKey, boolean> = {
    wedding_date: Boolean(clean(facts.weddingDate)),
    budget_target: typeof facts.budgetTargetAmount === "number" && facts.budgetTargetAmount > 0,
    guest_scope: typeof facts.guestCount === "number" && facts.guestCount > 0,
    requirements: hasRequirementEvidence(task),
    selected_option: selected || record(task.metadata).selected_option_confirmed === true || Boolean(clean(record(task.metadata).selected_option_id)),
    source_evidence: evidence.some((item) => item.ref !== `task:${task.id}`),
  };
  const prerequisites = definition.prerequisiteKeys.map((key): WeddingDecisionPrerequisite => ({
    ...PREREQUISITES[key],
    satisfied: prerequisiteSatisfied[key],
  }));
  const missingPrerequisite = prerequisites.find((item) => !item.satisfied) ?? null;
  const question = missingPrerequisite?.resolutionQuestion ?? definition.question(task);
  const primaryActionLabel = missingPrerequisite?.resolutionActionLabel ?? definition.primaryActionLabel;
  const settled = isSettled(task);
  const recommendationSupported = !missingPrerequisite
    && evidence.some((item) => item.status === "confirmed" && (/^https?:\/\//i.test(item.ref) || item.sourceKind === "quote"))
    && definition.options.length > 1;
  return {
    decisionType: definition.decisionType,
    question,
    options: definition.options,
    prerequisites,
    missingPrerequisite,
    answerRecord: missingPrerequisite
      ? PREREQUISITE_ANSWER_RECORD[missingPrerequisite.key] ?? definition.answerRecord
      : definition.answerRecord,
    deadlinePolicy: definition.deadlinePolicy,
    deadlineReason: deadlineReason(task, definition.deadlinePolicy),
    primaryActionLabel,
    primaryOutcome: missingPrerequisite
      ? `Update the existing ${missingPrerequisite.label.toLowerCase()} record before returning to this decision.`
      : definition.primaryOutcome,
    knownFacts: unique(evidence.filter((item) => item.status !== "unknown").map((item) => item.label), 3),
    oneThingToConfirm: missingPrerequisite?.label ?? (evidence.some((item) => item.status === "unknown" || item.status === "estimate") ? "The estimated or unknown source detail" : null),
    evidence,
    recommendationSupported,
    approvalRequiredBeforeExternalAction: definition.approvalRequiredBeforeExternalAction === true,
    settled,
  };
}

export function buildWeddingSetupDecisionContract(
  setup: "date" | "budget" | "guests",
): WeddingDecisionContract {
  const map = {
    date: { decisionType: "setup_date" as const, question: "What date or planning window should your wedding use?", action: "Set the wedding date", outcome: "Update the existing Wedding plan date used by deadlines and availability checks.", record: "wedding_event_setup" },
    budget: { decisionType: "setup_budget" as const, question: "What total budget should the plan work within?", action: "Set the budget", outcome: "Update the existing Wedding budget target and category allocations.", record: "wedding_budget_allocation" },
    guests: { decisionType: "setup_guests" as const, question: "Who should be included in the first guest-list version?", action: "Start the guest list", outcome: "Add people to the existing canonical guest list.", record: "wedding_guest" },
  }[setup];
  return {
    decisionType: map.decisionType,
    question: map.question,
    options: [],
    prerequisites: [],
    missingPrerequisite: null,
    answerRecord: map.record,
    deadlinePolicy: "sequence",
    deadlineReason: "This setup choice unlocks dependent planning decisions.",
    primaryActionLabel: map.action,
    primaryOutcome: map.outcome,
    knownFacts: [],
    oneThingToConfirm: null,
    evidence: [],
    recommendationSupported: false,
    approvalRequiredBeforeExternalAction: false,
    settled: false,
  };
}

export function buildWeddingSelectedDecisionContract(input: {
  label: string;
  preferenceSummary?: string | null;
  tradeoffLabels?: readonly string[] | null;
  missingPreferenceLabels?: readonly string[] | null;
  sourceLabels?: readonly string[] | null;
  sourceUrls?: readonly string[] | null;
}): WeddingDecisionContract {
  const tradeoffs = unique([...(input.tradeoffLabels ?? []), ...(input.missingPreferenceLabels ?? [])], 6);
  const urls = unique(input.sourceUrls ?? [], 6).filter((value) => /^https?:\/\//i.test(value));
  const evidence = unique([clean(input.preferenceSummary), ...(input.sourceLabels ?? []), ...tradeoffs], 8).map((label, index): WeddingDecisionEvidence => ({
    label,
    ref: urls[index] ?? `wedding_decision_selection:${clean(input.label).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    sourceKind: urls[index] ? "vendor_source" : "wedding_plan",
    status: /missing|unknown|unconfirmed|verify|tbc/i.test(label) ? "unknown" : "confirmed",
  }));
  const sourceReady = evidence.some((item) => item.status === "confirmed") && urls.length > 0;
  return {
    decisionType: "vendor_choice",
    question: tradeoffs.length > 0 ? `What should you verify before keeping ${clean(input.label)}?` : `Do you want to keep ${clean(input.label)} as your choice?`,
    options: options(
      ["keep", `Keep ${clean(input.label)}`, "Retain the selection after reviewing the remaining uncertainty."],
      ["clarify", "Clarify the missing fact", "Prepare a question for review before any external contact."],
      ["change", "Review alternatives", "Reopen the existing comparison without erasing this selection."],
    ),
    prerequisites: [{ ...PREREQUISITES.source_evidence, satisfied: sourceReady }],
    missingPrerequisite: sourceReady ? null : { ...PREREQUISITES.source_evidence, satisfied: false },
    answerRecord: "wedding_decision_selection",
    deadlinePolicy: "sequence",
    deadlineReason: "A selected choice stays below sourced deadlines unless a quote or hold records one.",
    primaryActionLabel: sourceReady ? "Review the remaining trade-off" : PREREQUISITES.source_evidence.resolutionActionLabel,
    primaryOutcome: sourceReady ? "Keep, clarify or reopen the existing selection." : "Open the linked source before reconfirming the selection.",
    knownFacts: evidence.filter((item) => item.status === "confirmed").map((item) => item.label).slice(0, 3),
    oneThingToConfirm: tradeoffs[0] ?? (sourceReady ? null : "The source supporting this selection"),
    evidence,
    recommendationSupported: sourceReady,
    approvalRequiredBeforeExternalAction: true,
    settled: tradeoffs.length === 0,
  };
}

export function buildWeddingApprovalDecisionContract(input: {
  title: string;
  blockedReason?: string | null;
  riskLabels?: readonly string[] | null;
}): WeddingDecisionContract {
  const evidence = unique([clean(input.blockedReason), ...(input.riskLabels ?? [])], 6).map((label) => ({
    label,
    ref: "approval_receipt:pending",
    sourceKind: "approval" as const,
    status: "confirmed" as const,
  }));
  return {
    decisionType: "approval",
    question: `Do you want to approve this exact action: ${clean(input.title)}?`,
    options: options(["approve", "Approve", "Execute only through the existing guarded provider flow."], ["edit", "Review or edit", "Return to the prepared action before approval."], ["reject", "Do not approve", "Keep the external action unexecuted."]),
    prerequisites: [],
    missingPrerequisite: null,
    answerRecord: "approval_receipt",
    deadlinePolicy: "hard_deadline",
    deadlineReason: "Approval priority follows any deadline on the exact prepared action; none is invented here.",
    primaryActionLabel: "Review the exact action",
    primaryOutcome: "Approve, edit or reject without bypassing the provider receipt flow.",
    knownFacts: evidence.map((item) => item.label).slice(0, 3),
    oneThingToConfirm: "Whether the exact recipient, content and consequence are correct",
    evidence,
    recommendationSupported: false,
    approvalRequiredBeforeExternalAction: true,
    settled: false,
  };
}

export function buildWeddingCalendarDecisionContract(input: {
  title: string;
  kind: string;
  startAt?: string | null;
  location?: string | null;
}): WeddingDecisionContract {
  const facts = unique([clean(input.startAt) ? `Scheduled: ${clean(input.startAt)}` : "", clean(input.location) ? `Location: ${clean(input.location)}` : ""], 4);
  return {
    decisionType: "run_sheet",
    question: `What should be confirmed for ${clean(input.title).replace(/[.!?]+$/, "")}?`,
    options: options(["confirm", "Confirm it", "Keep the saved date and responsibility."], ["change", "Change it", "Review affected tasks and dependencies first."], ["clarify", "Clarify a detail", "Resolve the owner, time or location before confirming."]),
    prerequisites: [],
    missingPrerequisite: null,
    answerRecord: "calendar_event",
    deadlinePolicy: "hard_deadline",
    deadlineReason: "The saved calendar date determines priority.",
    primaryActionLabel: "Review the date and next step",
    primaryOutcome: "Update the existing calendar or run-sheet record.",
    knownFacts: facts,
    oneThingToConfirm: "The owner, exact time or dependency that is still open",
    evidence: facts.map((label) => ({ label, ref: `calendar:${clean(input.kind)}`, sourceKind: "calendar", status: "confirmed" })),
    recommendationSupported: false,
    approvalRequiredBeforeExternalAction: false,
    settled: false,
  };
}

export type WeddingDecisionAuditFinding = {
  itemId: string;
  kind: "compound_decision" | "missing_prerequisite" | "unsupported_recommendation" | "repeats_settled_choice";
  detail: string;
};

export function auditWeddingDecisionContracts(items: readonly {
  id: string;
  title: string;
  recommendedActionLabel?: string | null;
  decisionContract?: WeddingDecisionContract | null;
}[]): WeddingDecisionAuditFinding[] {
  return items.flatMap((item) => {
    const contract = item.decisionContract;
    if (!contract) return [{ itemId: item.id, kind: "missing_prerequisite" as const, detail: "No declared decision contract is attached." }];
    const findings: WeddingDecisionAuditFinding[] = [];
    if (/\b(book|choose|confirm|review|compare|prepare)\b.*\b(and|then)\b.*\b(book|choose|confirm|review|compare|prepare|schedule)\b/i.test(item.title)) {
      findings.push({ itemId: item.id, kind: "compound_decision", detail: "The source title combines more than one decision stage; the card must use the contract question." });
    }
    if (contract.missingPrerequisite && contract.question !== contract.missingPrerequisite.resolutionQuestion) {
      findings.push({ itemId: item.id, kind: "missing_prerequisite", detail: `Missing ${contract.missingPrerequisite.label} is not surfaced first.` });
    }
    if (clean(item.recommendedActionLabel) && !contract.recommendationSupported && !/^(open|review|confirm|set|start|choose|prepare|compare|add|message|search)/i.test(clean(item.recommendedActionLabel))) {
      findings.push({ itemId: item.id, kind: "unsupported_recommendation", detail: "Recommendation copy has no confirmed quote or linked source evidence." });
    }
    if (contract.settled) findings.push({ itemId: item.id, kind: "repeats_settled_choice", detail: "The source decision is settled and should leave the actionable queue." });
    return findings;
  });
}
