import { For } from "solid-js";

const JOURNEY_STEPS = ["Budget", "Venue", "Key vendors", "Guests", "Seating", "Booked"] as const;

export function WeddingPlanningJourneyStepper(props: {
  completedCount: number;
  totalCount: number;
}) {
  const completed = () => Math.max(0, Math.min(props.completedCount, props.totalCount));
  const percentage = () => props.totalCount === 0 ? 0 : completed() / props.totalCount;
  const currentIndex = () => Math.min(
    JOURNEY_STEPS.length - 1,
    Math.floor(percentage() * JOURNEY_STEPS.length),
  );
  const allDone = () => props.totalCount > 0 && completed() === props.totalCount;

  return (
    <div
      class="mt-5 overflow-x-auto rounded-lg pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wedding-primary [scrollbar-width:none]"
      role="img"
      tabIndex={0}
      aria-label={`${completed()} of ${props.totalCount} planning tasks complete`}
    >
      <div class="relative grid min-w-[34rem] grid-cols-6">
        <div class="absolute left-[8.333%] right-[8.333%] top-[11px] h-0.5 bg-wedding-border" aria-hidden="true" />
        <div
          class="absolute left-[8.333%] top-[11px] h-0.5 bg-wedding-primary transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${Math.max(0, Math.min(83.334, percentage() * 83.334))}%` }}
          aria-hidden="true"
        />
        <For each={JOURNEY_STEPS}>{(label, index) => {
          const isComplete = () => allDone() || index() < currentIndex();
          const isCurrent = () => !allDone() && index() === currentIndex();
          return (
            <div class="relative z-10 flex min-w-0 flex-col items-center text-center">
              <span
                class={`h-6 w-6 rounded-full border-2 ${isComplete()
                  ? "border-wedding-primary bg-wedding-primary"
                  : isCurrent()
                    ? "border-wedding-primary bg-wedding-card ring-4 ring-wedding-primary/10"
                    : "border-wedding-border bg-wedding-card"}`}
                aria-hidden="true"
              />
              <span class={`mt-2 px-1 text-[10px] font-semibold leading-4 ${isComplete() || isCurrent() ? "text-wedding-ink" : "text-wedding-ink/60"}`}>
                {label}
              </span>
            </div>
          );
        }}</For>
      </div>
    </div>
  );
}
