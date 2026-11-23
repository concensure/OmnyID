import { createSignal, untrack } from "solid-js";
import type { AfpMessage, SendAfpMessageInput } from "@/lib/api";
import type { WeddingPersonalOsRankedItem } from "@/lib/weddingPersonalOsProjectionState";
import {
  applyCustomPlanDecision,
  applyDecisionApplicability,
  customPlanDecisionToAfpSendInput,
  decisionApplicabilityToAfpSendInput,
  decisionPlanEditStateFromMessages,
  directCausalDecisionFollowUps,
  loadDecisionPlanEditState,
  mergeDecisionPlanEditState,
  newCustomPlanDecision,
  saveDecisionPlanEditState,
  type DecisionPlanEditState,
  type DecisionPlanScope,
  type CustomPlanDecision,
} from "@/lib/decisionPlanEditState";

export function weddingCustomDecisionItem(decision: CustomPlanDecision): WeddingPersonalOsRankedItem {
  return {
    id: decision.id, kind: "decision", title: decision.title,
    pressureFamily: "attention", rankWeight: decision.dueAt ? 28 : 12,
    dueLabel: decision.dueAt ? `Due ${new Date(decision.dueAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}` : null,
    dueAt: decision.dueAt,
    explanation: decision.note || (decision.parentDecisionTitle ? `Follow-up to ${decision.parentDecisionTitle}.` : "Added by the couple to their wedding plan."),
    evidenceLabels: decision.parentDecisionTitle ? [`Linked to: ${decision.parentDecisionTitle}`] : [],
    sourceSurface: "decision_queue", simulatorSeedKind: "decision",
    linkedArtifactId: null, workspaceMenu: null,
    actionMetadata: { custom_plan_decision: true, custom_choices: decision.choices, parent_decision_id: decision.parentDecisionId },
    decisionContract: null,
  };
}

export function createWeddingDecisionPlanEditController(input: {
  scope: DecisionPlanScope;
  messages: readonly AfpMessage[];
  getItems: () => readonly WeddingPersonalOsRankedItem[];
  saveProjection?: ((value: SendAfpMessageInput) => Promise<unknown>) | null;
  refresh?: (() => void) | null;
}) {
  const initial = mergeDecisionPlanEditState(
    loadDecisionPlanEditState(input.scope),
    decisionPlanEditStateFromMessages(input.messages, input.scope),
  );
  const [state, setState] = createSignal<DecisionPlanEditState>(initial);
  const [notApplicableCandidate, setNotApplicableCandidate] = createSignal<WeddingPersonalOsRankedItem | null>(null);
  const [showEditor, setShowEditor] = createSignal(false);
  const [editorParent, setEditorParent] = createSignal<WeddingPersonalOsRankedItem | null>(null);
  const [title, setTitle] = createSignal("");
  const [choices, setChoices] = createSignal("");
  const [dueAt, setDueAt] = createSignal("");
  const [note, setNote] = createSignal("");
  const [notice, setNotice] = createSignal<string | null>(null);
  const [undoItem, setUndoItem] = createSignal<WeddingPersonalOsRankedItem | null>(null);

  const persist = (next: DecisionPlanEditState) => {
    setState(next);
    saveDecisionPlanEditState(input.scope, next);
  };
  const sync = (value: SendAfpMessageInput, fallback: string, refreshAfterSync = true) => {
    if (!input.saveProjection) return;
    void input.saveProjection(value).then(() => {
      if (refreshAfterSync) input.refresh?.();
    }).catch(() => setNotice(fallback));
  };
  const projectMessages = (messages: readonly AfpMessage[]) => {
    const next = mergeDecisionPlanEditState(untrack(state), decisionPlanEditStateFromMessages(messages, input.scope));
    persist(next);
  };
  const saveApplicability = (item: WeddingPersonalOsRankedItem, requestedState: "not_applicable" | "restored") => {
    const affected = requestedState === "not_applicable" ? directCausalDecisionFollowUps(input.getItems(), item.id) : [];
    const change = {
      decisionId: item.id,
      title: item.title,
      state: requestedState,
      affectedDecisionIds: affected.map((candidate) => candidate.id),
      affectedDecisionTitles: affected.map((candidate) => candidate.title),
      changedAt: new Date().toISOString(),
    } as const;
    persist(applyDecisionApplicability(state(), change));
    setNotApplicableCandidate(null);
    setUndoItem(requestedState === "not_applicable" ? item : null);
    setNotice(requestedState === "not_applicable"
      ? "Removed from Today. Notes, quotes, bookings and previous answers are still saved."
      : "Decision restored to the wedding plan.");
    sync(decisionApplicabilityToAfpSendInput(input.scope, change), "Saved on this device. OmnyID will sync the plan choice when the connection returns.");
  };
  const openEditor = (parent: WeddingPersonalOsRankedItem | null = null) => {
    setEditorParent(parent);
    setTitle(""); setChoices(""); setDueAt(""); setNote("");
    setShowEditor(true);
  };
  const saveDecision = () => {
    if (!title().trim()) return;
    const parent = editorParent();
    const decision = newCustomPlanDecision({
      title: title(), choices: choices().split(/\r?\n|,/),
      dueAt: dueAt() ? new Date(`${dueAt()}T12:00:00`).toISOString() : null,
      note: note(), parentDecisionId: parent?.id, parentDecisionTitle: parent?.title,
    });
    persist(applyCustomPlanDecision(state(), decision));
    setShowEditor(false);
    setNotice(parent ? "Follow-up decision added and linked to its source." : "Decision added to your wedding plan.");
    sync(customPlanDecisionToAfpSendInput(input.scope, decision), "Added on this device. OmnyID will sync the decision when the connection returns.", false);
  };
  const completeDecision = (item: WeddingPersonalOsRankedItem) => {
    const current = state().customDecisions.find((decision) => decision.id === item.id);
    if (!current) return;
    const completed = { ...current, status: "completed" as const, changedAt: new Date().toISOString() };
    persist(applyCustomPlanDecision(state(), completed));
    setNotice("Custom decision marked complete. You can still add a linked follow-up from Past decisions.");
    sync(customPlanDecisionToAfpSendInput(input.scope, completed), "Completed on this device. OmnyID will sync when the connection returns.");
  };

  return {
    state, projectMessages, notApplicableCandidate, setNotApplicableCandidate,
    showEditor, setShowEditor, editorParent, title, setTitle, choices, setChoices,
    dueAt, setDueAt, note, setNote, notice, undoItem,
    saveApplicability, openEditor, saveDecision, completeDecision,
  };
}
