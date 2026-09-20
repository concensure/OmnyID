// @locs-version: 1.0
import { createSignal, For, Show } from "solid-js";

import type { WeddingWorkspaceMenuId } from "@/lib/weddingWorkspaceMenuState";

type WeddingPlannerWalkthroughStep = {
  title: string;
  body: string;
  menuId?: WeddingWorkspaceMenuId;
  menuLabel?: string;
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
    examples: ["Partner can co-manage", "Planner can help with tasks", "Viewer can only read"],
  },
];

export function WeddingPlannerWalkthrough(props: {
  onClose: () => void;
  onSelectMenu: (menuId: WeddingWorkspaceMenuId) => void;
}) {
  const [stepIndex, setStepIndex] = createSignal(0);
  const currentStep = () => WEDDING_PLANNER_WALKTHROUGH_STEPS[stepIndex()] ?? WEDDING_PLANNER_WALKTHROUGH_STEPS[0];
  const isFirst = () => stepIndex() === 0;
  const isLast = () => stepIndex() === WEDDING_PLANNER_WALKTHROUGH_STEPS.length - 1;

  function close() {
    props.onClose();
  }

  function openStepMenu() {
    const menuId = currentStep().menuId;
    if (!menuId) return;
    props.onSelectMenu(menuId);
    close();
  }

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="wedding-walkthrough-title"
        class="relative w-full max-w-lg rounded-[28px] border border-rose-100 bg-white p-5 shadow-2xl sm:p-6"
      >
        <button
          type="button"
          aria-label="Close wedding planner guide"
          onClick={close}
          class="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-rose-100 bg-rose-50 text-sm font-semibold text-rose-950 transition hover:bg-rose-100"
        >
          X
        </button>

        <div class="pr-10">
          <p class="text-xs font-semibold uppercase tracking-[0.14em] text-rose-700/70">
            Wedding planner guide
          </p>
          <h2 id="wedding-walkthrough-title" class="mt-2 text-xl font-semibold text-rose-950">
            {currentStep().title}
          </h2>
          <p class="mt-3 text-sm leading-6 text-rose-950/75">
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
