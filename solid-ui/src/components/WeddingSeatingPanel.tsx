// @locs-version: 2.1
import { createMemo, createSignal, For, Show } from "solid-js";

import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import { WeddingSeatingCanvas } from "@/components/WeddingSeatingCanvas";
import { WeddingConfirmDialog } from "@/components/WeddingConfirmDialog";
import { WeddingInlineHelpNote } from "@/components/WeddingInlineHelpNote";
import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingResponseWorkspaceViewState } from "@/lib/weddingResponseWorkspaceViewState";
import {
  buildWeddingSeatingAlternativeResults,
  type WeddingSeatingOptimizationResult,
  weddingSeatingOptimizationFingerprint,
  weddingSeatingOptimizationResultToAfpSendInput,
} from "@/lib/weddingSeatingOptimizationState";
import { weddingSeatingDraftArchiveToAfpSendInput } from "@/lib/weddingSeatingDraftArchiveState";
import {
  runWeddingSeatingConstraintInstruction,
  weddingSeatingConstraintActionToAfpSendInput,
  type WeddingSeatingConstraintRunResult,
} from "@/lib/weddingSeatingConstraintActionState";
import { buildWeddingSeatingDraftSidebarAction } from "@/lib/weddingSeatingPanelActionState";
import type { WeddingWorkspaceSidebarAction } from "@/lib/weddingWorkspaceActionState";
import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

function seatingTaskSidebarAction(
  actionTitle: string,
  state: WeddingResponseWorkspaceViewState,
): WeddingWorkspaceSidebarAction {
  return {
    kind: "open_tasks",
    label: "Open wedding tasks",
    enabled: true,
    reason: null,
    metadata: {
      wedding_seating_task: {
        version: 1,
        title: actionTitle,
        unassigned_attending_count: state.seatingPlan.unassignedAttendingCount,
        table_count: state.seatingPlan.tableCount,
      },
    },
    contextLabels: [actionTitle, "Seating plan"],
  };
}

export function WeddingSeatingPanel(props: {
  state: WeddingResponseWorkspaceViewState;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onRefreshWorkspace?: () => void;
  onSelectMenu?: (menu: WeddingWorkspaceMenuId) => void;
  onSidebarAction: (action: WeddingWorkspaceSidebarAction) => void;
}) {
  const [saveNotice, setSaveNotice] = createSignal<string | null>(null);
  const [instructionNotice, setInstructionNotice] = createSignal<string | null>(null);
  const [seatingInstruction, setSeatingInstruction] = createSignal("");
  const [constraintRun, setConstraintRun] = createSignal<WeddingSeatingConstraintRunResult | null>(null);
  const [alternatives, setAlternatives] = createSignal<WeddingSeatingOptimizationResult[]>([]);
  const [saving, setSaving] = createSignal(false);
  const [confirmation, setConfirmation] = createSignal<{
    kind: "apply" | "alternative" | "hide";
    result?: WeddingSeatingOptimizationResult;
  } | null>(null);
  const displayedPreview = createMemo(() => constraintRun()?.optimization ?? props.state.seatingPlan.optimizationPreview);

  async function applySeatingDraft() {
    const preview = displayedPreview();
    if (!preview) {
      setSaveNotice("Add attending guests before saving a seating draft.");
      return;
    }
    if (!props.saveProjection) {
      setSaveNotice("This seating plan is ready, but saving is not connected for this account yet.");
      return;
    }
    setSaving(true);
    setSaveNotice(null);
    try {
      await props.saveProjection(weddingSeatingOptimizationResultToAfpSendInput({
        result: preview,
        metadata: props.state.workspace.metadata,
      }));
      setSaveNotice(`Seating plan applied for ${preview.assignments.length} guest${preview.assignments.length === 1 ? "" : "s"}.`);
      props.onRefreshWorkspace?.();
    } catch {
      setSaveNotice("The seating plan could not be applied. Your current plan has not changed.");
    } finally {
      setSaving(false);
    }
  }

  function showSeatingAlternatives() {
    const nextAlternatives = buildWeddingSeatingAlternativeResults({
      people: props.state.seatingPlan.optimizationPeople,
      tables: props.state.seatingPlan.optimizationTables,
      count: 2,
    });
    setAlternatives(nextAlternatives);
    setSaveNotice(nextAlternatives.length > 0
      ? "Here are other ways to seat people without changing your saved guest list."
      : "Add more tables or attending guests before OmnyID can show a different option.");
  }

  async function saveAlternativeDraft(result: WeddingSeatingOptimizationResult) {
    if (!props.saveProjection) {
      setSaveNotice("This option is ready to review. Saving needs account saving to be connected.");
      return;
    }
    setSaving(true);
    try {
      await props.saveProjection(weddingSeatingOptimizationResultToAfpSendInput({
        result,
        metadata: props.state.workspace.metadata,
      }));
      setSaveNotice("Alternative seating draft saved with this wedding.");
      props.onRefreshWorkspace?.();
    } catch {
      setSaveNotice("This option is ready, but it could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function hideSavedDraft(result: WeddingSeatingOptimizationResult) {
    const fingerprint = result.fingerprint || weddingSeatingOptimizationFingerprint(result);
    if (!fingerprint) {
      setSaveNotice("This saved draft cannot be hidden yet.");
      return;
    }
    if (!props.saveProjection) {
      setSaveNotice("This old draft can be hidden once account saving is connected.");
      return;
    }
    setSaving(true);
    try {
      await props.saveProjection(weddingSeatingDraftArchiveToAfpSendInput({
        fingerprint,
        metadata: props.state.workspace.metadata,
        reasonLabel: "Hidden from the saved draft list by the couple.",
      }));
      setSaveNotice("Old seating draft hidden.");
      props.onRefreshWorkspace?.();
    } catch {
      setSaveNotice("This old draft could not be hidden.");
    } finally {
      setSaving(false);
    }
  }

  function previewSeatingInstruction() {
    const result = runWeddingSeatingConstraintInstruction({
      instruction: seatingInstruction(),
      people: props.state.seatingPlan.optimizationPeople,
      tables: props.state.seatingPlan.optimizationTables,
    });
    setConstraintRun(result);
    setInstructionNotice(result.statusLabel);
  }

  async function saveSeatingInstruction() {
    const result = constraintRun() ?? runWeddingSeatingConstraintInstruction({
      instruction: seatingInstruction(),
      people: props.state.seatingPlan.optimizationPeople,
      tables: props.state.seatingPlan.optimizationTables,
    });
    setConstraintRun(result);
    if (!result.action) {
      setInstructionNotice(result.statusLabel);
      return;
    }
    if (!props.saveProjection) {
      setInstructionNotice("Preview updated. Saving this seating instruction needs account saving to be connected.");
      return;
    }
    setSaving(true);
    try {
      await props.saveProjection(weddingSeatingConstraintActionToAfpSendInput({
        action: result.action,
        metadata: props.state.workspace.metadata,
      }));
      await props.saveProjection(weddingSeatingOptimizationResultToAfpSendInput({
        result: result.optimization,
        metadata: props.state.workspace.metadata,
      }));
      setInstructionNotice("Seating change saved with this wedding.");
      props.onRefreshWorkspace?.();
    } catch {
      setInstructionNotice("The seating change preview is ready, but it could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  function confirmSeatingChange() {
    const pending = confirmation();
    if (!pending) return;
    setConfirmation(null);
    if (pending.kind === "apply") void applySeatingDraft();
    else if (pending.kind === "alternative" && pending.result) void saveAlternativeDraft(pending.result);
    else if (pending.kind === "hide" && pending.result) void hideSavedDraft(pending.result);
  }

  return (
    <div class="min-w-0 rounded-[24px] border border-sky-100/80 bg-sky-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #7C3AED" aria-hidden="true">
            <WeddingDashboardIcon id="table-cells" class="h-4 w-4" />
          </span>
          <p class="text-lg font-bold tracking-tight text-sky-950">Seating plan</p>
          <WeddingInfoTip title="Seating tip" tone="sky">
            Start with households, VIPs, accessibility needs, and known guest tensions. Share table counts and meal needs with vendors, but keep private relationship notes only for the couple.
          </WeddingInfoTip>
        </div>
        <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-sky-900">
          {props.state.seatingPlan.statusLabel}
        </span>
      </div>
      <p class="mt-2 text-sm leading-6 text-sky-900/75">
        {props.state.seatingPlan.summaryLabel}
      </p>
      <WeddingInlineHelpNote class="mt-3">Click or tap a guest, then a table, or drag their name. Hover or focus a name to see dietary, access and relationship notes.</WeddingInlineHelpNote>
      <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 px-3 py-2">
        <p class="text-sm font-semibold text-sky-950">
          {props.state.seatingPlan.guestRowsConsidered > 0 ? "Seating draft can start from your guest list." : "Add attending guests to start a seating draft."}
        </p>
        <p class="mt-1 text-xs leading-5 text-sky-950/70">
          {props.state.seatingPlan.guestRowsConsidered > 0
            ? "OmnyID can group guests into a first draft when the guest list includes names and attendance. Household, meal, access, and table notes make the draft better."
            : "Once attending guests are saved, this page can suggest table counts and seating follow-ups."}
        </p>
        <div class="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-full bg-sky-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-950"
            data-magic-action="assign-seat"
            data-magic-icon="seating"
            data-magic-label={props.state.seatingPlan.guestRowsConsidered > 0 ? "Draft seating plan" : "Add attending guests"}
            data-magic-id="wedding:seating:draft"
            onClick={() => props.onSidebarAction(buildWeddingSeatingDraftSidebarAction(props.state.seatingPlan))}
          >
            {props.state.seatingPlan.guestRowsConsidered > 0 ? "Draft seating plan" : "Add attending guests"}
          </button>
          <button
            type="button"
            class="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-950 transition hover:bg-white"
            data-magic-action="open"
            data-magic-icon="guests"
            data-magic-label="Open guest list"
            data-magic-id="wedding:seating:open-guests"
            onClick={() => props.onSelectMenu?.("guests")}
          >
            Open guest list
          </button>
        </div>
      </div>
      <div class="mt-3 grid grid-cols-3 gap-2">
        <div class="rounded-2xl border border-sky-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-sky-950/65">Assigned</p>
          <p class="mt-1 text-2xl font-semibold text-sky-950">{props.state.seatingPlan.assignedSeatCount}</p>
        </div>
        <div class="rounded-2xl border border-sky-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-sky-950/65">Unassigned</p>
          <p class="mt-1 text-2xl font-semibold text-sky-950">{props.state.seatingPlan.unassignedAttendingCount}</p>
        </div>
        <div class="rounded-2xl border border-sky-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-sky-950/65">Tables</p>
          <p class="mt-1 text-2xl font-semibold text-sky-950">{props.state.seatingPlan.suggestedTableCount}</p>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-1.5">
        <span class="max-w-full break-words rounded-full border border-sky-100 bg-white/80 px-2 py-1 text-xs text-sky-950/75">
          {props.state.seatingPlan.householdGroupCount} household group{props.state.seatingPlan.householdGroupCount === 1 ? "" : "s"}
        </span>
        <span class="max-w-full break-words rounded-full border border-sky-100 bg-white/80 px-2 py-1 text-xs text-sky-950/75">
          {props.state.seatingPlan.vipOrWeddingPartyCount} VIP/party guest{props.state.seatingPlan.vipOrWeddingPartyCount === 1 ? "" : "s"}
        </span>
      </div>
      <Show when={props.state.seatingPlan.warningLabels.length > 0} fallback={
        <p class="mt-3 rounded-2xl border border-sky-100 bg-white/70 px-2.5 py-2 text-sm leading-6 text-sky-950/75">
          Seating looks okay right now.
        </p>
      }>
        <ul class="mt-3 space-y-1">
          <For each={props.state.seatingPlan.warningLabels}>
            {(label) => <li class="text-xs leading-5 text-sky-950/70">{label}</li>}
          </For>
        </ul>
      </Show>
      <Show when={props.state.seatingPlan.actionItems.length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-sky-950/70">Seating to-dos</p>
          <ul class="mt-2 space-y-2">
            <For each={props.state.seatingPlan.actionItems.slice(0, 4)}>
              {(item) => (
                <li class="rounded-xl border border-sky-100 bg-sky-50/70 px-2.5 py-2 text-xs leading-5 text-sky-950/70">
                  <div class="flex flex-wrap items-center justify-between gap-2">
                    <span><span class="font-semibold">{item.title}</span> - {item.priorityLabel}</span>
                    <button
                      type="button"
                      class="rounded-full border border-sky-100 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-sky-950 transition hover:bg-white"
                      data-magic-action="open"
                      data-magic-icon="task"
                      data-magic-label={`Open task: ${item.title}`}
                      data-magic-id={`wedding:seating:task:${item.id}`}
                      onClick={() => props.onSidebarAction(seatingTaskSidebarAction(item.title, props.state))}
                    >
                      Open task
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={displayedPreview()}>
        {(preview) => (
          <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs font-semibold text-sky-950/70">Draft seating suggestion</p>
              <span class="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-950">
                {preview().assignments.length} placed
              </span>
            </div>
            <p class="mt-2 text-xs leading-5 text-sky-950/70">
              {preview().explanationLabels[0] ?? "OmnyID has a first seating draft ready for review."}
            </p>
            <Show when={preview().proactiveIssueLabels.length > 0}>
              <p class="mt-2 text-xs leading-5 text-sky-950/70">
                {preview().proactiveIssueLabels[0]}
              </p>
            </Show>
            <div class="mt-2 grid gap-1.5 sm:grid-cols-2">
              <For each={preview().assignments.slice(0, 4)}>
                {(assignment) => (
                  <p class="rounded-xl border border-sky-100 bg-sky-50/70 px-2.5 py-2 text-xs leading-5 text-sky-950/70">
                    <span class="font-semibold">{assignment.personLabel}</span> - {assignment.tableLabel}
                  </p>
                )}
              </For>
            </div>
            <div class="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving()}
                class="rounded-full bg-sky-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-950 disabled:cursor-not-allowed disabled:opacity-50"
                data-magic-action="approve"
                data-magic-icon="save"
                data-magic-label={saving() ? "Saving..." : preview().applyLabel}
                data-magic-id="wedding:seating:apply-draft"
                onClick={() => setConfirmation({ kind: "apply" })}
              >
                {saving() ? "Saving..." : preview().applyLabel}
              </button>
              <button
                type="button"
                class="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-950 transition hover:bg-white"
                data-magic-action="swap-table"
                data-magic-icon="swap"
                data-magic-label={preview().alternativeLabel}
                data-magic-id="wedding:seating:show-alternatives"
                onClick={showSeatingAlternatives}
              >
                {preview().alternativeLabel}
              </button>
            </div>
            <Show when={saveNotice()}>
              {(notice) => <p class="mt-2 text-xs leading-5 text-sky-950/65">{notice()}</p>}
            </Show>
            <Show when={alternatives().length > 0}>
              <div class="mt-3 space-y-2">
                <For each={alternatives()}>
                  {(option, index) => (
                    <div class="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <p class="text-xs font-semibold text-sky-950/70">Option {index() + 1}</p>
                        <span class="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold text-sky-950">
                          {option.totalScore >= 0 ? "+" : ""}{option.totalScore} fit
                        </span>
                      </div>
                      <p class="mt-1 text-xs leading-5 text-sky-950/65">
                        {option.explanationLabels[0] ?? "Alternative seating draft."}
                      </p>
                      <div class="mt-2 grid gap-1.5 sm:grid-cols-2">
                        <For each={option.assignments.slice(0, 4)}>
                          {(assignment) => (
                            <p class="rounded-xl border border-sky-100 bg-white/75 px-2.5 py-2 text-xs leading-5 text-sky-950/70">
                              <span class="font-semibold">{assignment.personLabel}</span> - {assignment.tableLabel}
                            </p>
                          )}
                        </For>
                      </div>
                      <button
                        type="button"
                        disabled={saving()}
                        class="mt-2 rounded-full bg-sky-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-950 disabled:cursor-not-allowed disabled:opacity-50"
                        data-magic-action="approve"
                        data-magic-icon="save"
                        data-magic-label={`Save seating option ${index() + 1}`}
                        data-magic-id={`wedding:seating:alternative:${index() + 1}:save`}
                        onClick={() => setConfirmation({ kind: "alternative", result: option })}
                      >
                        Save this option
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>
            <Show when={props.state.seatingDraftCards.length > 0}>
              <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
                <p class="text-xs font-semibold text-sky-950/70">Saved drafts</p>
                <div class="mt-2 space-y-2">
                  <For each={props.state.seatingDraftCards.slice(0, 4)}>
                    {(draft) => (
                      <div class="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                        <div class="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p class="text-xs font-semibold text-sky-950">{draft.title}</p>
                            <p class="mt-1 text-[11px] leading-4 text-sky-950/60">{draft.detailLabel}</p>
                          </div>
                          <span class="rounded-full bg-white/80 px-2 py-1 text-[11px] font-semibold text-sky-950">
                            {draft.statusLabel}
                          </span>
                        </div>
                        <div class="mt-2 flex flex-wrap gap-1.5">
                          <For each={draft.metadataLabels}>
                            {(label) => (
                              <span class="rounded-full border border-sky-100 bg-white/80 px-2 py-1 text-[11px] text-sky-950/70">
                                {label}
                              </span>
                            )}
                          </For>
                        </div>
                        <Show when={!draft.isCurrent}>
                          <div class="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={saving()}
                              class="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-950 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                              data-magic-action="approve"
                              data-magic-icon="save"
                              data-magic-label={`Make current: ${draft.title}`}
                              data-magic-id={`wedding:seating:saved-draft:${draft.id}:make-current`}
                              onClick={() => setConfirmation({ kind: "alternative", result: draft.result })}
                            >
                              Make current
                            </button>
                            <button
                              type="button"
                              disabled={saving()}
                              class="rounded-full border border-sky-100 bg-white/70 px-3 py-1.5 text-xs font-semibold text-sky-950/70 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                              data-magic-action="dismiss"
                              data-magic-icon="hide"
                              data-magic-label={`Hide old draft: ${draft.title}`}
                              data-magic-id={`wedding:seating:saved-draft:${draft.id}:hide`}
                              onClick={() => setConfirmation({ kind: "hide", result: draft.result })}
                            >
                              Hide old draft
                            </button>
                          </div>
                        </Show>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
            <div class="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
              <p class="text-xs font-semibold text-sky-950/70">Tell OmnyID what to change</p>
              <textarea
                class="mt-2 min-h-[72px] w-full resize-y rounded-2xl border border-sky-100 bg-white/90 px-3 py-2 text-sm leading-6 text-sky-950 outline-none transition placeholder:text-sky-950/40 focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
                placeholder="Example: Move Uncle David away from Mum."
                value={seatingInstruction()}
                onInput={(event) => {
                  setSeatingInstruction(event.currentTarget.value);
                  setConstraintRun(null);
                  setInstructionNotice(null);
                }}
              />
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!seatingInstruction().trim() || saving()}
                  class="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-950 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                  data-magic-action="open"
                  data-magic-icon="preview"
                  data-magic-label="Preview change"
                  data-magic-id="wedding:seating:instruction:preview"
                  onClick={previewSeatingInstruction}
                >
                  Preview change
                </button>
                <button
                  type="button"
                  disabled={!seatingInstruction().trim() || saving()}
                  class="rounded-full bg-sky-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-950 disabled:cursor-not-allowed disabled:opacity-50"
                  data-magic-action="approve"
                  data-magic-icon="save"
                  data-magic-label={saving() ? "Saving..." : "Save change"}
                  data-magic-id="wedding:seating:instruction:save"
                  onClick={() => void saveSeatingInstruction()}
                >
                  {saving() ? "Saving..." : "Save change"}
                </button>
              </div>
              <Show when={instructionNotice()}>
                {(notice) => <p class="mt-2 text-xs leading-5 text-sky-950/65">{notice()}</p>}
              </Show>
            </div>
          </div>
        )}
      </Show>
      <Show when={props.state.seatingPlan.optimizationPeople.length > 0}>
        <WeddingSeatingCanvas
          workspaceId={props.state.workspace.metadata.responseWorkspaceId}
          people={props.state.seatingPlan.optimizationPeople}
          tables={props.state.seatingPlan.optimizationTables}
          result={displayedPreview()}
          saving={saving()}
          onApply={(result) => setConfirmation({ kind: "alternative", result })}
        />
        <WeddingConfirmDialog
          open={Boolean(confirmation())}
          title={confirmation()?.kind === "hide" ? "Hide this seating draft?" : "Apply this seating change?"}
          detail={confirmation()?.kind === "hide"
            ? "The draft will leave the active saved-draft list. Your guest list and other seating drafts will not change."
            : "This saves the displayed table assignments as the current seating draft. Review the people and table counts before confirming."}
          confirmLabel={confirmation()?.kind === "hide" ? "Hide draft" : "Apply plan"}
          destructive={confirmation()?.kind === "hide"}
          busy={saving()}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmSeatingChange}
        />
      </Show>
      <Show when={props.state.seatingPlan.tableBriefs.length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-sky-950/70">Table notes</p>
          <div class="mt-2 space-y-1.5">
            <For each={props.state.seatingPlan.tableBriefs.slice(0, 4)}>
              {(brief) => (
                <p class="text-xs leading-5 text-sky-950/70">
                  <span class="font-semibold">{brief.tableLabel}</span> - {brief.summaryLabel}
                </p>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={props.state.seatingPlan.vendorBriefLines.length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-sky-950/70">Notes for vendors</p>
          <ul class="mt-2 space-y-1">
            <For each={props.state.seatingPlan.vendorBriefLines.slice(0, 4)}>
              {(line) => <li class="text-xs leading-5 text-sky-950/70">{line}</li>}
            </For>
          </ul>
        </div>
      </Show>
      <Show when={props.state.seatingPlan.dietaryAccessibilityBrief.dietarySummaryLabels.length > 0 || props.state.seatingPlan.dietaryAccessibilityBrief.accessibilitySummaryLabels.length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-xs font-semibold text-sky-950/65">Meal and access notes</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <For each={[...props.state.seatingPlan.dietaryAccessibilityBrief.dietarySummaryLabels, ...props.state.seatingPlan.dietaryAccessibilityBrief.accessibilitySummaryLabels].slice(0, 6)}>
              {(label) => (
                <span class="max-w-full break-words rounded-full border border-sky-100 bg-sky-50 px-2 py-1 text-xs text-sky-950/75">
                  {label}
                </span>
              )}
            </For>
          </div>
          <Show when={props.state.seatingPlan.dietaryAccessibilityBrief.approvalRequiredLabels.length > 0}>
            <ul class="mt-2 space-y-1">
              <For each={props.state.seatingPlan.dietaryAccessibilityBrief.approvalRequiredLabels.slice(0, 3)}>
                {(label) => <li class="text-xs leading-5 text-sky-950/70">{label}</li>}
              </For>
            </ul>
          </Show>
          <p class="mt-2 text-xs leading-5 text-sky-950/60">
            {props.state.seatingPlan.dietaryAccessibilityBrief.correctionLoopLabel}
          </p>
        </div>
      </Show>
      <Show when={props.state.seatingPlan.tableLabels.length > 0}>
        <p class="mt-3 text-xs leading-5 text-sky-950/65">
          Tables: {props.state.seatingPlan.tableLabels.slice(0, 6).join(", ")}
        </p>
      </Show>
    </div>
  );
}
