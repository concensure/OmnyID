// @locs-version: 2.0
import { createSignal, For, Show } from "solid-js";

import { WeddingDashboardIcon } from "@/components/WeddingDashboardIcons";
import type { WeddingBoundaryState } from "@/lib/weddingBoundaryLedgerState";
import type { WeddingBoundaryTopologyState } from "@/lib/weddingBoundaryTopologyState";

export function WeddingBoundaryManagementCard(props: {
  state: WeddingBoundaryState;
  topology: WeddingBoundaryTopologyState;
}) {
  const [showRules, setShowRules] = createSignal(false);
  const [showPeople, setShowPeople] = createSignal(false);
  const [includeText, setIncludeText] = createSignal("Named guests, assigned helpers, approved family viewers");
  const [excludeText, setExcludeText] = createSignal("Extra plus-ones, private notes, couple-only reasons");
  const policyNodes = () => props.topology.nodes.filter((node) => node.kind === "boundary_policy");
  const roleNodes = () => props.topology.nodes.filter((node) => node.kind === "boundary_role");
  const guestNodes = () => props.topology.nodes.filter((node) => node.kind === "guest");

  return (
    <div class="min-w-0 rounded-[24px] border border-cyan-100/80 bg-cyan-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white" style="background-color: #0E7490" aria-hidden="true">
              <WeddingDashboardIcon id="shield-check" class="h-4 w-4" />
            </span>
            <p class="text-lg font-bold tracking-tight text-cyan-950">Family boundaries</p>
          </div>
          <p class="mt-1 text-sm leading-6 text-cyan-900/75">
            Make it clear who can see, suggest, or approve guest-list changes.
          </p>
        </div>
        <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-cyan-900">
          {props.state.pendingApprovalCount} to review
        </span>
      </div>

      <div class="mt-3 grid grid-cols-3 gap-2">
        <div class="rounded-2xl border border-cyan-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-cyan-950/65">Rules</p>
          <p class="mt-1 text-2xl font-semibold text-cyan-950">{props.state.activePolicyCount}</p>
        </div>
        <div class="rounded-2xl border border-cyan-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-cyan-950/65">People</p>
          <p class="mt-1 text-2xl font-semibold text-cyan-950">{props.state.guestCount}</p>
        </div>
        <div class="rounded-2xl border border-cyan-100 bg-white/75 px-2.5 py-2">
          <p class="text-xs font-semibold text-cyan-950/65">Shared</p>
          <p class="mt-1 text-2xl font-semibold text-cyan-950">{props.state.familyVisibleCount}</p>
        </div>
      </div>

      <p class="mt-3 rounded-2xl border border-cyan-100 bg-white/70 px-3 py-2 text-sm leading-6 text-cyan-950/75">
        {props.state.summaryLabel}
      </p>

      <div class="mt-3 grid gap-2 md:grid-cols-2">
        <label class="rounded-2xl border border-cyan-100 bg-white/75 p-3 text-xs font-semibold text-cyan-950">
          Include
          <textarea
            value={includeText()}
            onInput={(event) => setIncludeText(event.currentTarget.value)}
            rows="2"
            class="mt-1 w-full resize-none rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 py-2 text-xs font-normal leading-5 text-cyan-950 outline-none focus:border-cyan-300"
          />
        </label>
        <label class="rounded-2xl border border-cyan-100 bg-white/75 p-3 text-xs font-semibold text-cyan-950">
          Exclude
          <textarea
            value={excludeText()}
            onInput={(event) => setExcludeText(event.currentTarget.value)}
            rows="2"
            class="mt-1 w-full resize-none rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 py-2 text-xs font-normal leading-5 text-cyan-950 outline-none focus:border-cyan-300"
          />
        </label>
      </div>

      <div class="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-full border border-cyan-200 bg-white/85 px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-white sm:py-1.5"
          onClick={() => setShowRules(!showRules())}
        >
          {showRules() ? "Hide rules" : "Review rules"}
        </button>
        <button
          type="button"
          class="rounded-full border border-cyan-200 bg-white/85 px-3 py-2 text-xs font-semibold text-cyan-950 transition hover:bg-white sm:py-1.5"
          onClick={() => setShowPeople(!showPeople())}
        >
          {showPeople() ? "Hide people" : "Who can see what"}
        </button>
      </div>

      <Show when={showRules()}>
        <div class="mt-3 space-y-2">
          <For each={policyNodes()}>
            {(node) => (
              <article class="rounded-2xl border border-cyan-100 bg-white/75 p-3">
                <div class="flex items-start justify-between gap-2">
                  <p class="break-words text-sm font-semibold text-cyan-950">{node.label}</p>
                  <span class="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-900">
                    {String(node.metadata.enforcement ?? "rule").replace(/_/g, " ")}
                  </span>
                </div>
                <p class="mt-1 text-xs leading-5 text-cyan-950/70">{String(node.metadata.plain_language ?? "This rule protects the couple's decision.")}</p>
              </article>
            )}
          </For>
        </div>
      </Show>

      <Show when={showPeople()}>
        <div class="mt-3 rounded-2xl border border-cyan-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-cyan-950">Visibility map</p>
          <div class="mt-2 flex flex-wrap gap-1.5">
            <For each={roleNodes().slice(0, 8)}>
              {(node) => (
                <span class="max-w-full break-words rounded-full border border-cyan-100 bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-950/75">
                  {node.label}: {String(node.metadata.role ?? "helper").replace(/_/g, " ")}
                </span>
              )}
            </For>
            <For each={guestNodes().slice(0, 8)}>
              {(node) => (
                <span class="max-w-full break-words rounded-full border border-cyan-100 bg-white px-2 py-1 text-xs text-cyan-950/70">
                  {node.label}
                </span>
              )}
            </For>
          </div>
          <Show when={props.state.privateObjectCount > 0}>
            <p class="mt-2 text-xs leading-5 text-cyan-950/60">
              {props.state.privateObjectCount} private item{props.state.privateObjectCount === 1 ? "" : "s"} stay visible only to the couple.
            </p>
          </Show>
        </div>
      </Show>

      <Show when={props.state.warningLabels.length > 0}>
        <ul class="mt-3 space-y-1">
          <For each={props.state.warningLabels}>
            {(label) => <li class="text-xs leading-5 text-cyan-950/70">{label}</li>}
          </For>
        </ul>
      </Show>
    </div>
  );
}
