// @locs-version: 1.0
import { createSignal, Show } from "solid-js";
import { submitUiCommand } from "@/lib/api";
import { isRecord } from "@/lib/eventDetail";

const IMPROVE_OPTIONS = [
  "Make it shorter",
  "Make it more formal",
  "Translate to English",
  "Fix grammar",
] as const;

type ImproveOption = (typeof IMPROVE_OPTIONS)[number];

function improvedTextFromResponse(payload: unknown): string {
  if (!isRecord(payload) || typeof payload.text !== "string") {
    throw new Error("Improve response did not include replacement text.");
  }
  return payload.text;
}

export function AgentImproveButton(props: {
  text: string;
  onReplace: (newText: string) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [pendingReview, setPendingReview] = createSignal<{
    instruction: ImproveOption;
    before: string;
    after: string;
  } | null>(null);

  async function runImprove(instruction: ImproveOption) {
    setOpen(false);
    setLoading(true);
    setError(null);
    try {
      const result = await submitUiCommand({
        text: props.text,
        instruction,
        context: "editor_improve",
      });
      setPendingReview({
        instruction,
        before: props.text,
        after: improvedTextFromResponse(result),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Improve failed");
      setTimeout(() => setError(null), 3000);
    }
    setLoading(false);
  }

  function acceptPendingReview() {
    const review = pendingReview();
    if (!review) return;
    props.onReplace(review.after);
    setPendingReview(null);
  }

  return (
    <Show when={props.text.trim().length > 0}>
      <div class="relative inline-flex">
        <button
          type="button"
          title="Improve with AI"
          disabled={loading()}
          onClick={() => setOpen(v => !v)}
          class={`flex h-6 w-6 items-center justify-center rounded-full text-xs transition ${
            loading()
              ? "animate-pulse bg-primary/20 text-primary"
              : "bg-white/30 text-on-surface-variant hover:bg-primary/20 hover:text-primary"
          }`}
        >
          {loading() ? "…" : "✦"}
        </button>
        <Show when={error()}>
          <span class="absolute -top-7 left-0 whitespace-nowrap rounded bg-red-500 px-2 py-0.5 text-[10px] text-white shadow">
            {error()}
          </span>
        </Show>
        <Show when={open()}>
          <div
            class="absolute bottom-8 left-0 z-40 min-w-[160px] rounded-xl border border-white/40 bg-white/95 py-1 shadow-xl backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            {IMPROVE_OPTIONS.map((opt) => (
              <button
                type="button"
                class="flex w-full items-center px-3 py-2 text-xs text-on-surface transition hover:bg-primary/10 hover:text-primary"
                onClick={() => void runImprove(opt)}
              >
                {opt}
              </button>
            ))}
            <button
              type="button"
              class="mt-0.5 flex w-full items-center px-3 py-1.5 text-[10px] text-on-surface-variant/50 transition hover:text-on-surface-variant"
              onClick={() => setOpen(false)}
            >
              Cancel
            </button>
          </div>
        </Show>
        <Show when={pendingReview()}>
          {(review) => (
            <div
              class="absolute bottom-8 left-0 z-50 w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-white/45 bg-white/97 p-3 shadow-xl backdrop-blur"
              onClick={(event) => event.stopPropagation()}
            >
              <div class="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-on-surface-variant/60">
                    Agent Improve
                  </p>
                  <p class="mt-0.5 text-sm font-medium text-on-surface">{review().instruction}</p>
                </div>
                <button
                  type="button"
                  class="rounded-full border border-white/20 bg-white/70 px-2.5 py-1 text-[10px] font-medium text-on-surface-variant transition hover:bg-white"
                  onClick={() => setPendingReview(null)}
                >
                  Close
                </button>
              </div>
              <div class="grid gap-3 md:grid-cols-2">
                <div class="rounded-xl border border-white/30 bg-white/50 p-3">
                  <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-on-surface-variant/55">
                    Original
                  </p>
                  <pre class="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-on-surface">
                    {review().before}
                  </pre>
                </div>
                <div class="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <p class="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-primary/70">
                    Improved
                  </p>
                  <pre class="max-h-56 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-on-surface">
                    {review().after}
                  </pre>
                </div>
              </div>
              <div class="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  class="rounded-full border border-white/25 bg-white/70 px-3 py-1.5 text-xs font-medium text-on-surface-variant transition hover:bg-white"
                  onClick={() => setPendingReview(null)}
                >
                  Keep original
                </button>
                <button
                  type="button"
                  class="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary/90"
                  onClick={acceptPendingReview}
                >
                  Accept improved
                </button>
              </div>
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}
