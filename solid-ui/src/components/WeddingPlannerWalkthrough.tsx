// @locs-version: 1.0
import { createEffect, createSignal, For, onCleanup, onMount, Show } from "solid-js";

import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

type WeddingPlannerWalkthroughStep = {
  title: string;
  body: string;
  menuId?: WeddingWorkspaceMenuId;
  menuLabel?: string;
  shareLabel?: string;
  sectionLinks?: Array<{ label: string; menuId: WeddingWorkspaceMenuId }>;
  examples: string[];
};

const WEDDING_PLANNER_WALKTHROUGH_STEPS: WeddingPlannerWalkthroughStep[] = [
  {
    title: "Start with the main plan",
    body: "Home shows the choices that need your yes or no, plus the budget left and days to the wedding.",
    menuId: "home",
    menuLabel: "Open Home",
    examples: ["What should we decide next?", "How much budget is left?", "What files are ready to review?"],
  },
  {
    title: "Bring in what you already have",
    body: "Use Upload lists for guest lists, budgets, spreadsheets, Google Sheets exports, or The Knot exports. The original files stay saved for later.",
    examples: ["Guest list spreadsheet", "Budget sheet", "Vendor shortlist"],
  },
  {
    title: "Match each planning job to a section",
    body: "Use the top menu like a wedding planning map. Each section keeps one part of the wedding clear.",
    sectionLinks: [
      { label: "Budget", menuId: "budget" },
      { label: "Guests", menuId: "guests" },
      { label: "Seating", menuId: "seating" },
      { label: "Timeline", menuId: "timeline" },
    ],
    examples: ["Budget for costs and quotes", "Guests for RSVPs and meals", "Seating for tables", "Timeline for dated tasks"],
  },
  {
    title: "Use follow-ups to close the loop",
    body: "Follow-ups shows vendor replies, pending outreach, and planning items that may need another message.",
    menuId: "response_queue",
    menuLabel: "Open Follow-ups",
    examples: ["Who needs a reminder?", "Which vendor has not replied?", "What should we send next?"],
  },
  {
    title: "Use sharing when people help",
    body: "Share the Plan lets you review roles for a partner, planner, helper, or viewer before giving access.",
    shareLabel: "Open sharing",
    examples: ["Partner can co-manage", "Planner can help with tasks", "Viewer can only read"],
  },
];

export function WeddingPlannerWalkthrough(props: {
  onClose: () => void;
  onOpenSharePlan?: () => void;
  onSelectMenu: (menuId: WeddingWorkspaceMenuId) => void;
}) {
  const [stepIndex, setStepIndex] = createSignal(0);
  let closeButtonRef: HTMLButtonElement | undefined;
  const currentStep = () => WEDDING_PLANNER_WALKTHROUGH_STEPS[stepIndex()] ?? WEDDING_PLANNER_WALKTHROUGH_STEPS[0];
  const isFirst = () => stepIndex() === 0;
  const isLast = () => stepIndex() === WEDDING_PLANNER_WALKTHROUGH_STEPS.length - 1;
  const stepCountLabel = () => `Step ${stepIndex() + 1} of ${WEDDING_PLANNER_WALKTHROUGH_STEPS.length}`;

  function close() {
    props.onClose();
  }

  function openStepMenu() {
    const menuId = currentStep().menuId;
    if (!menuId) return;
    props.onSelectMenu(menuId);
    close();
  }

  function openLinkedSection(menuId: WeddingWorkspaceMenuId) {
    props.onSelectMenu(menuId);
    close();
  }

  function openSharePlan() {
    props.onOpenSharePlan?.();
    close();
  }

  onMount(() => {
    closeButtonRef?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
    };
    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  // Keep the background workspace pointed at whatever section the current
  // guide step is describing, so the guide narrates the section the user
  // can already see behind it instead of a hidden/unrelated one.
  createEffect(() => {
    const step = currentStep();
    const targetMenuId = step.menuId ?? step.sectionLinks?.[0]?.menuId;
    if (targetMenuId) props.onSelectMenu(targetMenuId);
    else if (step.shareLabel) props.onOpenSharePlan?.();
  });

  return (
    <div class="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-4 sm:justify-end sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="wedding-walkthrough-title"
        aria-describedby="wedding-walkthrough-body"
        class="pointer-events-auto relative w-full max-w-md rounded-[28px] border border-rose-100 bg-white p-5 shadow-2xl sm:p-6"
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close wedding planner guide"
          onClick={close}
          class="absolute right-4 top-4 inline-flex min-h-8 items-center justify-center rounded-full border border-rose-100 bg-rose-50 px-3 text-xs font-semibold text-rose-950 transition hover:bg-rose-100"
        >
          Close
        </button>

        <div class="pr-10">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700/70">
            Wedding planner guide - {stepCountLabel()}
          </p>
          <h2 id="wedding-walkthrough-title" class="mt-2 text-xl font-semibold text-rose-950">
            {currentStep().title}
          </h2>
          <p id="wedding-walkthrough-body" class="mt-3 text-sm leading-6 text-rose-950/75">
            {currentStep().body}
          </p>
        </div>

        <div class="mt-4 rounded-2xl border border-rose-100 bg-rose-50/70 p-3">
          <p class="text-xs font-semibold text-rose-950/65">Use this for</p>
          <ul class="mt-2 space-y-1">
            <For each={currentStep().examples}>
              {(example) => <li class="text-sm leading-6 text-rose-950">{example}</li>}
            </For>
          </ul>
        </div>

        <Show when={currentStep().sectionLinks?.length}>
          <div class="mt-3 flex flex-wrap gap-2">
            <For each={currentStep().sectionLinks}>
              {(section) => (
                <button
                  type="button"
                  class="rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-950 transition hover:bg-rose-50"
                  onClick={() => openLinkedSection(section.menuId)}
                >
                  Open {section.label}
                </button>
              )}
            </For>
          </div>
        </Show>

        <div class="mt-5 flex items-center justify-center gap-1.5" aria-label="Guide progress">
          <For each={WEDDING_PLANNER_WALKTHROUGH_STEPS}>
            {(_, index) => (
              <span
                class={`h-1.5 rounded-full transition-all ${
                  index() === stepIndex() ? "w-8 bg-rose-500" : "w-3 bg-rose-100"
                }`}
              />
            )}
          </For>
        </div>

        <div class="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            type="button"
            class="rounded-full border border-rose-100 bg-white px-4 py-2 text-sm font-semibold text-rose-950 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={isFirst()}
            onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
          >
            Back
          </button>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Show when={currentStep().menuId}>
              <button
                type="button"
                class="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-950 transition hover:bg-rose-100"
                onClick={openStepMenu}
              >
                {currentStep().menuLabel ?? "Open section"}
              </button>
            </Show>
            <Show when={currentStep().shareLabel}>
              {(label) => (
                <button
                  type="button"
                  class="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-semibold text-rose-950 transition hover:bg-rose-100"
                  onClick={openSharePlan}
                >
                  {label()}
                </button>
              )}
            </Show>
            <Show
              when={!isLast()}
              fallback={
                <button
                  type="button"
                  class="rounded-full border border-rose-500 bg-rose-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
                  onClick={close}
                >
                  Start planning
                </button>
              }
            >
              <button
                type="button"
                class="rounded-full border border-rose-500 bg-rose-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-600"
                onClick={() => setStepIndex((current) => Math.min(WEDDING_PLANNER_WALKTHROUGH_STEPS.length - 1, current + 1))}
              >
                Next
              </button>
            </Show>
          </div>
        </div>
      </section>
    </div>
  );
}
