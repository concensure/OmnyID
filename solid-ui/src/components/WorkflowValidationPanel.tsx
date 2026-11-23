// @locs-version: 1.0
import { For, Show, createMemo } from "solid-js";
import type { JSXElement } from "solid-js";

import {
  workflowApprovalGateCountSummary,
  workflowApprovalGateRequirementSummary,
} from "@/lib/workflowGraphCopy";
import type { WorkflowValidationResponse } from "@/lib/api";
import {
  workflowActivationFollowThroughNote,
  workflowCompiledAfpFamilyLabel,
  workflowCompiledApprovalManifestCountLabel,
  workflowAfpFamiliesEmptyState,
  workflowAfpFamiliesTitle,
  workflowCompiledContractPreviewSummaryNote,
  workflowCompiledContractChecklistNote,
  workflowCompiledContractPreviewTitle,
  workflowCompiledManifestCountLabel,
  workflowCompiledRuntimeKindLabel,
  workflowCompiledTriggerReadinessSubject,
  workflowCompiledWaitResumeCountLabel,
  workflowTemplateSuggestionAcceptLabel,
  workflowTemplateSuggestionAlignedLabel,
  workflowTemplateSuggestionDismissLabel,
  workflowTemplateSuggestionFamilyStatusLabel,
  workflowTemplateSuggestionMatchCountLabel,
  workflowTemplateSuggestionReliabilityLabel,
  workflowTemplateSuggestionRoleLabel,
  workflowTemplateSuggestionScoreLabel,
  workflowTemplateSuggestionsSummaryNote,
  workflowTemplateSuggestionsTitle,
  workflowTriggerReadinessAvailabilityNote,
  workflowPreActivationChecklistTitle,
  workflowTriggerReadinessTitle,
  workflowValidationHeadline,
  workflowValidationChecklistLabel,
  workflowValidationChecklistMarker,
  workflowValidationSummaryLine,
  workflowValidationClearNote,
  workflowRuntimeKindsEmptyState,
  workflowRuntimeKindsTitle,
  workflowWaitResumeChecklistNote,
  workflowWarningsChecklistNote,
  workflowTriggerReadinessBadgeLabel,
  workflowTriggerReadinessSupportNote,
  workflowTriggerReadinessTooltip,
  workflowCompiledContractUnavailableNote,
} from "@/lib/workflowDeploymentHelpers";

type CheckItem = { label: string; note?: string; ok: boolean };
type TemplateSuggestion = NonNullable<WorkflowValidationResponse["template_suggestions"]>[number];
type CompiledSummary = NonNullable<NonNullable<WorkflowValidationResponse["summary"]>["compiled"]>;
type TriggerReadinessSummary = NonNullable<
  NonNullable<WorkflowValidationResponse["summary"]>["trigger_readiness_summary"]
>;

type WorkflowValidationPanelProps = {
  result: WorkflowValidationResponse;
  onAcceptSuggestion?: (templateId: string, title: string, matchedNodeIds: string[]) => void;
  onDismissSuggestion?: (templateId: string, title: string, matchedNodeIds: string[]) => void;
};

type WorkflowValidationSectionId =
  | "header"
  | "checklist"
  | "suggestions"
  | "compiled"
  | "errors"
  | "warnings";

type CompiledBadgeItem = {
  className: string;
  label: string;
};

type WorkflowValidationPanelState = {
  afpFamilies: Array<[string, number]>;
  allChecksPassed: boolean;
  checklistToneClass: string;
  compiled: CompiledSummary | null;
  compiledBadges: CompiledBadgeItem[];
  errors: string[];
  headlineText: string;
  runtimeKinds: Array<[string, number]>;
  showCompiledUnavailable: boolean;
  showFollowThrough: boolean;
  summaryLineText: string;
  suggestions: TemplateSuggestion[];
  triggerReadiness: TriggerReadinessSummary | null;
  warnings: string[];
};

const WORKFLOW_VALIDATION_PANEL_CLASS = "rounded-[22px] border border-white/35 bg-white/45 p-4";
const WORKFLOW_VALIDATION_HEADER_TITLE_CLASS = "text-sm font-semibold text-on-surface";
const WORKFLOW_VALIDATION_HEADER_SUMMARY_CLASS = "mt-1 text-xs uppercase tracking-[0.18em] text-on-surface-variant";
const WORKFLOW_VALIDATION_FOLLOW_THROUGH_CLASS = "mt-1 text-xs text-amber-700";
const WORKFLOW_VALIDATION_UNAVAILABLE_CLASS = "mt-1 text-xs text-rose-700";
const WORKFLOW_VALIDATION_CHECKLIST_BASE_CLASS = "mt-3 rounded-[20px] border p-4";
const WORKFLOW_VALIDATION_CHECKLIST_PASS_CLASS = "border-emerald-200/60 bg-emerald-50/70";
const WORKFLOW_VALIDATION_CHECKLIST_WARN_CLASS = "border-amber-200/60 bg-amber-50/70";
const WORKFLOW_VALIDATION_SECTION_CARD_CLASS = "mt-4 rounded-[20px] border p-4";
const WORKFLOW_VALIDATION_SUGGESTIONS_CARD_CLASS = "border-violet-200/70 bg-violet-50/80";
const WORKFLOW_VALIDATION_COMPILED_CARD_CLASS = "border-sky-200/60 bg-sky-50/80";
const WORKFLOW_VALIDATION_LIST_STACK_CLASS = "mt-3 space-y-2";

function workflowValidationPanelState(props: WorkflowValidationPanelProps): WorkflowValidationPanelState {
  const compiled = props.result.summary?.compiled ?? null;
  const triggerReadiness = props.result.summary?.trigger_readiness_summary ?? null;
  const suggestions = [...(props.result.template_suggestions ?? [])].sort((a, b) => b.score - a.score);
  const runtimeKinds = Object.entries(compiled?.runtime_kind_counts ?? {}).sort((a, b) => b[1] - a[1]);
  const afpFamilies = Object.entries(compiled?.afp_message_family_counts ?? {}).sort((a, b) => b[1] - a[1]);

  const compiledBadges: CompiledBadgeItem[] = [];
  if (compiled) {
    compiledBadges.push(
      {
        className: "rounded-full border border-sky-200/70 bg-white/80 px-3 py-1 text-xs font-semibold text-sky-800",
        label: workflowCompiledManifestCountLabel(compiled.manifest_count ?? 0),
      },
      {
        className: "rounded-full border border-sky-200/70 bg-white/80 px-3 py-1 text-xs font-semibold text-sky-800",
        label: workflowCompiledWaitResumeCountLabel(compiled.wait_resume_count ?? 0),
      },
      {
        className: "rounded-full border border-sky-200/70 bg-white/80 px-3 py-1 text-xs font-semibold text-sky-800",
        label: workflowCompiledApprovalManifestCountLabel(compiled.approval_manifest_count ?? 0),
      },
    );
  }
  if (triggerReadiness) {
    compiledBadges.push({
      className:
        triggerReadiness.live_registration_supported === false
          ? "rounded-full border border-amber-200/70 bg-amber-50/85 px-3 py-1 text-xs font-semibold text-amber-800"
          : "rounded-full border border-emerald-200/70 bg-emerald-50/85 px-3 py-1 text-xs font-semibold text-emerald-800",
      label: workflowTriggerReadinessBadgeLabel(triggerReadiness) ?? workflowTriggerReadinessAvailabilityNote(),
    });
  }

  const preActivationChecks = (() => {
    const checks: CheckItem[] = [];

    checks.push({
      label: workflowValidationChecklistLabel("validation"),
      ok: props.result.errors.length === 0,
      note: workflowValidationClearNote(props.result.errors.length) ?? undefined,
    });

    checks.push({
      label: workflowValidationChecklistLabel("compiled"),
      ok: compiled != null,
      note:
        workflowCompiledContractChecklistNote(compiled?.manifest_count, props.result.errors.length > 0) ??
        undefined,
    });

    const sideEffectKinds = ["action", "email", "integration", "rest", "browser"];
    const hasSideEffects = Object.keys(compiled?.runtime_kind_counts ?? {}).some((kind) =>
      sideEffectKinds.some((sideEffectKind) => kind.toLowerCase().includes(sideEffectKind)),
    );
    if (hasSideEffects) {
      checks.push({
        label: workflowValidationChecklistLabel("approval"),
        ok: (compiled?.approval_manifest_count ?? 0) > 0,
        note:
          (compiled?.approval_manifest_count ?? 0) > 0
            ? workflowApprovalGateCountSummary(compiled?.approval_manifest_count ?? 0)
            : workflowApprovalGateRequirementSummary() ?? undefined,
      });
    }

    const hasLongRunningKind = Object.keys(compiled?.runtime_kind_counts ?? {}).some((kind) =>
      ["research", "orchestrate", "batch"].some((longRunningKind) => kind.toLowerCase().includes(longRunningKind)),
    );
    if (hasLongRunningKind) {
      checks.push({
        label: workflowValidationChecklistLabel("wait_resume"),
        ok: (compiled?.wait_resume_count ?? 0) > 0,
        note: workflowWaitResumeChecklistNote(compiled?.wait_resume_count ?? 0) ?? undefined,
      });
    }

    checks.push({
      label: workflowValidationChecklistLabel("warnings"),
      ok: props.result.warnings.length === 0,
      note: workflowWarningsChecklistNote(props.result.warnings.length) ?? undefined,
    });

    if (triggerReadiness) {
      const triggerReady = triggerReadiness.live_registration_supported !== false;
      checks.push({
        label: workflowValidationChecklistLabel("trigger_readiness"),
        ok: triggerReady,
        note: workflowTriggerReadinessSupportNote(triggerReadiness) ?? undefined,
      });
    }

    return checks;
  })();

  const allChecksPassed = preActivationChecks.every((check) => check.ok);

  return {
    afpFamilies,
    allChecksPassed,
    checklistToneClass: allChecksPassed
      ? `${WORKFLOW_VALIDATION_CHECKLIST_BASE_CLASS} ${WORKFLOW_VALIDATION_CHECKLIST_PASS_CLASS}`
      : `${WORKFLOW_VALIDATION_CHECKLIST_BASE_CLASS} ${WORKFLOW_VALIDATION_CHECKLIST_WARN_CLASS}`,
    compiled,
    compiledBadges,
    errors: props.result.errors,
    headlineText: workflowValidationHeadline(props.result.valid, allChecksPassed),
    runtimeKinds,
    showCompiledUnavailable: !compiled && props.result.errors.length > 0,
    showFollowThrough: props.result.valid && !allChecksPassed,
    summaryLineText: workflowValidationSummaryLine(
      props.result.summary?.node_count ?? 0,
      props.result.summary?.edge_count ?? 0,
    ),
    suggestions,
    triggerReadiness,
    warnings: props.result.warnings,
  };
}

type WorkflowValidationHeaderSectionProps = {
  state: WorkflowValidationPanelState;
};

function WorkflowValidationHeaderSection(props: WorkflowValidationHeaderSectionProps): JSXElement {
  return (
    <>
      <p class={WORKFLOW_VALIDATION_HEADER_TITLE_CLASS}>{props.state.headlineText}</p>
      <p class={WORKFLOW_VALIDATION_HEADER_SUMMARY_CLASS}>{props.state.summaryLineText}</p>
      <Show when={props.state.showFollowThrough}>
        <p class={WORKFLOW_VALIDATION_FOLLOW_THROUGH_CLASS}>{workflowActivationFollowThroughNote()}</p>
      </Show>
      <Show when={props.state.showCompiledUnavailable}>
        <p class={WORKFLOW_VALIDATION_UNAVAILABLE_CLASS}>{workflowCompiledContractUnavailableNote()}</p>
      </Show>
    </>
  );
}

type WorkflowValidationChecklistSectionProps = {
  checks: CheckItem[];
  state: WorkflowValidationPanelState;
};

function WorkflowValidationChecklistSection(props: WorkflowValidationChecklistSectionProps): JSXElement {
  return (
    <div class={props.state.checklistToneClass}>
      <p
        class={`text-xs font-semibold uppercase tracking-[0.18em] ${
          props.state.allChecksPassed ? "text-emerald-700" : "text-amber-700"
        }`}
      >
        {workflowPreActivationChecklistTitle()}
      </p>
      <div class="mt-3 space-y-1.5">
        <For each={props.checks}>
          {(check) => (
            <div class="flex items-start gap-2.5">
              <span
                class={`mt-0.5 flex-shrink-0 text-sm ${check.ok ? "text-emerald-600" : "text-amber-600"}`}
              >
                {workflowValidationChecklistMarker(check.ok)}
              </span>
              <div>
                <span class="text-xs font-medium text-slate-800">{check.label}</span>
                <Show when={check.note}>
                  <p class="text-[11px] text-slate-500">{check.note}</p>
                </Show>
              </div>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

type WorkflowValidationSuggestionsSectionProps = {
  onAcceptSuggestion?: WorkflowValidationPanelProps["onAcceptSuggestion"];
  onDismissSuggestion?: WorkflowValidationPanelProps["onDismissSuggestion"];
  state: WorkflowValidationPanelState;
};

function WorkflowValidationSuggestionsSection(props: WorkflowValidationSuggestionsSectionProps): JSXElement {
  return (
    <div class={`${WORKFLOW_VALIDATION_SECTION_CARD_CLASS} ${WORKFLOW_VALIDATION_SUGGESTIONS_CARD_CLASS}`}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
            {workflowTemplateSuggestionsTitle()}
          </p>
          <p class="mt-1 text-sm text-violet-950">{workflowTemplateSuggestionsSummaryNote()}</p>
        </div>
        <span class="rounded-full border border-violet-200/70 bg-white/85 px-3 py-1 text-xs font-semibold text-violet-800">
          {workflowTemplateSuggestionMatchCountLabel(props.state.suggestions.length)}
        </span>
      </div>

      <div class="mt-4 space-y-3">
        <For each={props.state.suggestions}>
          {(suggestion) => (
            <div class="rounded-[18px] border border-white/70 bg-white/80 p-3">
              <div class="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p class="text-sm font-semibold text-slate-900">{suggestion.title}</p>
                  <p class="mt-1 text-xs uppercase tracking-[0.16em] text-slate-500">
                    {workflowTemplateSuggestionFamilyStatusLabel(
                      suggestion.workflow_family,
                      suggestion.implementation_status,
                    )}
                  </p>
                </div>
                <div class="flex flex-wrap gap-2">
                  <span class="rounded-full border border-violet-200/70 bg-violet-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-violet-700">
                    {workflowTemplateSuggestionScoreLabel(suggestion.score)}
                  </span>
                  <span class="rounded-full border border-sky-200/70 bg-sky-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
                    {workflowTemplateSuggestionReliabilityLabel(suggestion.reliability)}
                  </span>
                  <Show when={suggestion.already_aligned}>
                    <span class="rounded-full border border-emerald-200/70 bg-emerald-50/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                      {workflowTemplateSuggestionAlignedLabel()}
                    </span>
                  </Show>
                </div>
              </div>
              <p class="mt-3 text-sm text-slate-700">{suggestion.rationale}</p>
              <p class="mt-2 text-xs text-slate-500">{suggestion.advisory}</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <For each={suggestion.semantic_roles}>
                  {(role) => (
                    <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-2.5 py-1 text-[11px] font-medium text-slate-700">
                      {workflowTemplateSuggestionRoleLabel(role)}
                    </span>
                  )}
                </For>
              </div>
              <Show when={!suggestion.already_aligned && (props.onAcceptSuggestion || props.onDismissSuggestion)}>
                <div class="mt-3 flex flex-wrap gap-2">
                  <Show when={props.onAcceptSuggestion}>
                    <button
                      type="button"
                      class="rounded-full border border-violet-200/70 bg-violet-50/90 px-3 py-2 text-xs font-semibold text-violet-700 transition hover:bg-violet-100"
                      onClick={() =>
                        props.onAcceptSuggestion?.(
                          suggestion.template_id,
                          suggestion.title,
                          suggestion.matched_node_ids,
                        )}
                    >
                      {workflowTemplateSuggestionAcceptLabel()}
                    </button>
                  </Show>
                  <Show when={props.onDismissSuggestion}>
                    <button
                      type="button"
                      class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                      onClick={() =>
                        props.onDismissSuggestion?.(
                          suggestion.template_id,
                          suggestion.title,
                          suggestion.matched_node_ids,
                        )}
                    >
                      {workflowTemplateSuggestionDismissLabel()}
                    </button>
                  </Show>
                </div>
              </Show>
            </div>
          )}
        </For>
      </div>
    </div>
  );
}

type WorkflowValidationCompiledSectionProps = {
  state: WorkflowValidationPanelState;
};

function WorkflowValidationCompiledSection(props: WorkflowValidationCompiledSectionProps): JSXElement {
  return (
    <div class={`${WORKFLOW_VALIDATION_SECTION_CARD_CLASS} ${WORKFLOW_VALIDATION_COMPILED_CARD_CLASS}`}>
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            {workflowCompiledContractPreviewTitle()}
          </p>
          <p class="mt-1 text-sm text-sky-950">{workflowCompiledContractPreviewSummaryNote()}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <For each={props.state.compiledBadges}>
            {(badge) => <span class={badge.className}>{badge.label}</span>}
          </For>
        </div>
      </div>

      <Show when={props.state.triggerReadiness}>
        {(summary) => (
          <div
            class={`mt-4 rounded-[18px] border px-3 py-3 ${
              summary().live_registration_supported === false
                ? "border-amber-200/70 bg-amber-50/80 text-amber-900"
                : "border-emerald-200/70 bg-emerald-50/80 text-emerald-900"
            }`}
          >
            <p class="text-xs font-semibold uppercase tracking-[0.18em]">{workflowTriggerReadinessTitle()}</p>
            <p class="mt-1 text-sm">
              {workflowTriggerReadinessTooltip(summary(), {
                subject: workflowCompiledTriggerReadinessSubject(),
              }) ?? workflowTriggerReadinessAvailabilityNote()}
            </p>
          </div>
        )}
      </Show>

      <div class="mt-4 grid gap-4 lg:grid-cols-2">
        <div class="rounded-[18px] border border-white/70 bg-white/70 p-3">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            {workflowRuntimeKindsTitle()}
          </p>
          <Show
            when={props.state.runtimeKinds.length > 0}
            fallback={<p class="mt-2 text-sm text-slate-500">{workflowRuntimeKindsEmptyState()}</p>}
          >
            <div class="mt-3 flex flex-wrap gap-2">
              <For each={props.state.runtimeKinds}>
                {([kind, count]) => (
                  <span class="rounded-full border border-slate-200/70 bg-slate-50/90 px-3 py-1 text-xs font-medium text-slate-700">
                    {workflowCompiledRuntimeKindLabel(kind, count)}
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>

        <div class="rounded-[18px] border border-white/70 bg-white/70 p-3">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            {workflowAfpFamiliesTitle()}
          </p>
          <Show
            when={props.state.afpFamilies.length > 0}
            fallback={<p class="mt-2 text-sm text-slate-500">{workflowAfpFamiliesEmptyState()}</p>}
          >
            <div class="mt-3 flex flex-wrap gap-2">
              <For each={props.state.afpFamilies}>
                {([family, count]) => (
                  <span class="rounded-full border border-emerald-200/70 bg-emerald-50/90 px-3 py-1 text-xs font-medium text-emerald-800">
                    {workflowCompiledAfpFamilyLabel(family, count)}
                  </span>
                )}
              </For>
            </div>
          </Show>
        </div>
      </div>
    </div>
  );
}

type WorkflowValidationMessageListSectionProps = {
  items: string[];
  tone: "error" | "warning";
};

function WorkflowValidationMessageListSection(props: WorkflowValidationMessageListSectionProps): JSXElement {
  return (
    <div class={WORKFLOW_VALIDATION_LIST_STACK_CLASS}>
      <For each={props.items}>
        {(item) => (
          <div
            class={`rounded-2xl border px-3 py-2 text-sm ${
              props.tone === "error"
                ? "border-rose-200/70 bg-rose-50/80 text-rose-700"
                : "border-amber-200/70 bg-amber-50/80 text-amber-700"
            }`}
          >
            {item}
          </div>
        )}
      </For>
    </div>
  );
}

export function WorkflowValidationPanel(props: WorkflowValidationPanelProps) {
  const panelState = createMemo(() => workflowValidationPanelState(props));
  const preActivationChecks = createMemo<CheckItem[]>(() => {
    const compiled = panelState().compiled;
    const triggerReadiness = panelState().triggerReadiness;
    const checks: CheckItem[] = [];

    checks.push({
      label: workflowValidationChecklistLabel("validation"),
      ok: props.result.errors.length === 0,
      note: workflowValidationClearNote(props.result.errors.length) ?? undefined,
    });
    checks.push({
      label: workflowValidationChecklistLabel("compiled"),
      ok: compiled != null,
      note:
        workflowCompiledContractChecklistNote(compiled?.manifest_count, props.result.errors.length > 0) ??
        undefined,
    });

    const sideEffectKinds = ["action", "email", "integration", "rest", "browser"];
    const hasSideEffects = Object.keys(compiled?.runtime_kind_counts ?? {}).some((kind) =>
      sideEffectKinds.some((sideEffectKind) => kind.toLowerCase().includes(sideEffectKind)),
    );
    if (hasSideEffects) {
      checks.push({
        label: workflowValidationChecklistLabel("approval"),
        ok: (compiled?.approval_manifest_count ?? 0) > 0,
        note:
          (compiled?.approval_manifest_count ?? 0) > 0
            ? workflowApprovalGateCountSummary(compiled?.approval_manifest_count ?? 0)
            : workflowApprovalGateRequirementSummary() ?? undefined,
      });
    }

    const hasLongRunningKind = Object.keys(compiled?.runtime_kind_counts ?? {}).some((kind) =>
      ["research", "orchestrate", "batch"].some((longRunningKind) => kind.toLowerCase().includes(longRunningKind)),
    );
    if (hasLongRunningKind) {
      checks.push({
        label: workflowValidationChecklistLabel("wait_resume"),
        ok: (compiled?.wait_resume_count ?? 0) > 0,
        note: workflowWaitResumeChecklistNote(compiled?.wait_resume_count ?? 0) ?? undefined,
      });
    }

    checks.push({
      label: workflowValidationChecklistLabel("warnings"),
      ok: props.result.warnings.length === 0,
      note: workflowWarningsChecklistNote(props.result.warnings.length) ?? undefined,
    });

    if (triggerReadiness) {
      checks.push({
        label: workflowValidationChecklistLabel("trigger_readiness"),
        ok: triggerReadiness.live_registration_supported !== false,
        note: workflowTriggerReadinessSupportNote(triggerReadiness) ?? undefined,
      });
    }

    return checks;
  });

  const visibleSections = createMemo<WorkflowValidationSectionId[]>(() => {
    const state = panelState();
    const sections: WorkflowValidationSectionId[] = ["header", "checklist"];
    if (state.suggestions.length > 0) {
      sections.push("suggestions");
    }
    if (state.compiled) {
      sections.push("compiled");
    }
    if (state.errors.length > 0) {
      sections.push("errors");
    }
    if (state.warnings.length > 0) {
      sections.push("warnings");
    }
    return sections;
  });

  return (
    <div class={WORKFLOW_VALIDATION_PANEL_CLASS}>
      <For each={visibleSections()}>
        {(sectionId) => {
          const state = panelState();
          if (sectionId === "header") {
            return <WorkflowValidationHeaderSection state={state} />;
          }
          if (sectionId === "checklist") {
            return <WorkflowValidationChecklistSection checks={preActivationChecks()} state={state} />;
          }
          if (sectionId === "suggestions") {
            return (
              <WorkflowValidationSuggestionsSection
                onAcceptSuggestion={props.onAcceptSuggestion}
                onDismissSuggestion={props.onDismissSuggestion}
                state={state}
              />
            );
          }
          if (sectionId === "compiled") {
            return <WorkflowValidationCompiledSection state={state} />;
          }
          if (sectionId === "errors") {
            return <WorkflowValidationMessageListSection items={state.errors} tone="error" />;
          }
          return <WorkflowValidationMessageListSection items={state.warnings} tone="warning" />;
        }}
      </For>
    </div>
  );
}
