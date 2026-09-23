// @locs-version: 2.0
import { For, Show } from "solid-js";

import type { WeddingApprovalExecutionState } from "@/lib/weddingApprovalExecutionState";
import type { WeddingApprovalRequestState } from "@/lib/weddingApprovalState";
import {
  buildWeddingProviderExecutorReadinessState,
  type WeddingProviderExecutorReadinessState,
} from "@/lib/weddingProviderExecutorReadinessState";
import { buildWeddingProviderSetupPresentationState } from "@/lib/weddingProviderSetupPresentationState";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";
import type { ViewName } from "@/lib/viewNames";

function approvalLabel(preview: WeddingWorkspaceArtifactPreview): string {
  return preview.approvalRequest?.approvalButtonLabel ?? preview.approvalState.replace(/_/g, " ");
}

function providerMissingLabel(capability: WeddingProviderExecutorReadinessState["capability"]): string {
  if (capability === "email") return "Connect Gmail to send this";
  if (capability === "calendar") return "Connect Calendar to schedule this";
  if (capability === "registry") return "Connect a registry app first";
  if (capability === "vendor_search") return "Connect vendor search first";
  return "Connect this app first";
}

function approvalBlockLabel(
  request: WeddingApprovalRequestState,
  readiness: WeddingProviderExecutorReadinessState,
): string | null {
  if (!request.blockKind) return null;
  if (request.blockKind === "needs_user_approval") return "Needs approval";
  if (request.blockKind === "provider_missing") return providerMissingLabel(readiness.capability);
  if (request.blockKind === "privacy_scope") return "Fix privacy scope";
  return "Unsupported integration";
}

export function WeddingApprovalPreviewPanel(props: {
  preview: WeddingWorkspaceArtifactPreview;
  approvalRunning: boolean;
  approvalReceipt: WeddingApprovalExecutionState | null;
  approvalReceiptSaveNotice: string | null;
  approvedRequest: (request: WeddingApprovalRequestState) => WeddingApprovalRequestState;
  onApprove: (request: WeddingApprovalRequestState) => void;
  onExecute: (request: WeddingApprovalRequestState) => void;
  onProviderSetup?: (view: ViewName) => void;
}) {
  return (
    <Show when={props.preview.approvalRequest}>
        {(request) => {
          const approved = () => props.approvedRequest(request());
          const providerReadiness = (): WeddingProviderExecutorReadinessState =>
            buildWeddingProviderExecutorReadinessState({ request: approved() });
          const providerSetup = () => buildWeddingProviderSetupPresentationState(providerReadiness());
          return (
            <div class="min-w-0 rounded-2xl border border-amber-100 bg-amber-50/75 p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <p class="text-sm font-semibold text-amber-900">Review before anything is sent</p>
                <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-[10px] font-semibold text-amber-950">
                  {approvalLabel(props.preview)}
                </span>
              </div>
              <div class="mt-3 space-y-2">
              <div class="rounded-xl border border-amber-100 bg-white/70 px-3 py-2">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <p class="break-words text-[11px] font-semibold text-amber-950">
                    {props.preview.integrationReadiness.title}
                  </p>
                  <span class="max-w-full break-words rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-950">
                    {props.preview.integrationReadiness.status.replace(/_/g, " ")}
                  </span>
                </div>
                <p class="mt-1 break-words text-[11px] leading-5 text-amber-900/75">
                  {props.preview.integrationReadiness.detail}
                </p>
                <Show when={props.preview.integrationReadiness.setupActionLabel}>
                  {(label) => (
                    <span class="mt-2 inline-flex max-w-full break-words rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-950">
                      {label()}
                    </span>
                  )}
                </Show>
              </div>
              <details class="rounded-xl border border-amber-100 bg-white/70 px-3 py-2">
                <summary class="cursor-pointer text-[11px] font-semibold text-amber-950">
                  How this will send
                </summary>
                <p class="mt-2 break-words text-[11px] leading-5 text-amber-900/75">
                  {providerReadiness().detail}
                </p>
                <div class="mt-2 flex flex-wrap gap-1.5">
                  <span class={`max-w-full break-words rounded-full px-2 py-1 text-[10px] font-semibold ${
                    providerReadiness().productionReady
                      ? "bg-emerald-100 text-emerald-900"
                      : "bg-amber-100 text-amber-950"
                  }`}>
                    {providerReadiness().productionReady ? "ready to send" : "needs connected app"}
                  </span>
                  <Show when={providerReadiness().requiredProvider}>
                    {(provider) => (
                      <span class="max-w-full break-words rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-950">
                        {provider()}
                      </span>
                    )}
                  </Show>
                </div>
                <Show when={providerReadiness().setupView}>
                  {(view) => (
                    <button
                      type="button"
                      onClick={() => props.onProviderSetup?.(view())}
                      class="mt-2 w-full rounded-full border border-amber-200 bg-white/85 px-2.5 py-2 text-[10px] font-semibold text-amber-950 transition hover:bg-white sm:w-auto sm:py-1"
                    >
                      {providerSetup().buttonLabel}
                    </button>
                  )}
                </Show>
              </details>
              <Show when={approved().blockedReason}>
                {(reason) => (
                  <p class="rounded-xl border border-amber-200 bg-white/70 px-3 py-2 text-[11px] leading-5 text-amber-950">
                    <Show when={approvalBlockLabel(approved(), providerReadiness())}>
                      {(label) => (
                        <span class="mb-1 inline-flex max-w-full break-words rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-950">
                          {label()}
                        </span>
                      )}
                    </Show>
                    {reason()}
                  </p>
                )}
              </Show>
              <div class="flex flex-wrap gap-1.5">
                <For each={request().riskLabels.slice(0, 4)}>
                  {(risk) => (
                    <span class="max-w-full break-words rounded-full border border-amber-200 bg-white/75 px-2 py-1 text-[10px] font-medium text-amber-950">
                      {risk}
                    </span>
                  )}
                </For>
              </div>
              <details class="rounded-xl border border-amber-100 bg-white/70 px-3 py-2">
                <summary class="cursor-pointer text-[11px] font-semibold text-amber-950">
                  What would be shared
                </summary>
                <ul class="mt-2 space-y-1">
                  <For each={request().disclosureLines.slice(0, 8)}>
                    {(line) => <li class="text-[11px] leading-5 text-amber-900/80">{line}</li>}
                  </For>
                </ul>
              </details>
              <div class="grid gap-2 sm:flex sm:flex-wrap">
                <button
                  type="button"
                  disabled={approved().userApproved}
                  onClick={() => props.onApprove(request())}
                  class="rounded-full border border-amber-200 bg-white/80 px-3 py-2 text-[11px] font-semibold text-amber-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:py-1.5"
                >
                  {approved().userApproved ? "Approved" : request().approvalButtonLabel}
                </button>
                <button
                  type="button"
                  disabled={props.approvalRunning || !approved().canExecute}
                  onClick={() => props.onExecute(request())}
                  class="rounded-full bg-amber-900 px-3 py-2 text-[11px] font-semibold text-white shadow-sm transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:bg-amber-300 sm:py-1.5"
                >
                  {props.approvalRunning ? "Working..." : approved().executeButtonLabel}
                </button>
              </div>
              <Show when={props.approvalReceipt}>
                {(receipt) => (
                  <p class="rounded-xl border border-amber-100 bg-white/70 px-3 py-2 text-[11px] leading-5 text-amber-950">
                    {receipt().message}
                  </p>
                )}
              </Show>
              <Show when={props.approvalReceiptSaveNotice}>
                {(notice) => (
                  <p class="rounded-xl border border-amber-100 bg-white/60 px-3 py-2 text-[11px] leading-5 text-amber-950/75">
                    {notice()}
                  </p>
                )}
              </Show>
              </div>
            </div>
          );
        }}
    </Show>
  );
}
