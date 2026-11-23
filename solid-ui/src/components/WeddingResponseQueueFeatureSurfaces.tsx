import { ErrorBoundary, lazy, Suspense, type JSX } from "solid-js";

export const LazyWeddingSiteIntakeWizard = lazy(() =>
  import("@/components/WeddingSiteIntakeWizard").then((module) => ({
    default: module.WeddingSiteIntakeWizard,
  })),
);

export const LazyWeddingRichResponseView = lazy(() =>
  import("@/components/WeddingRichResponseView").then((module) => ({
    default: module.WeddingRichResponseView,
  })),
);

export const LazyWeddingResponseWorkspaceView = lazy(() =>
  import("@/components/WeddingResponseWorkspaceView").then((module) => ({
    default: module.WeddingResponseWorkspaceView,
  })),
);

export function WeddingResponseFeatureFallback(props: { label: string }) {
  return (
    <div
      class="rounded-2xl border border-rose-100 bg-white/85 px-4 py-5 text-sm text-slate-700 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <span class="font-semibold text-slate-900">{props.label}</span>
      <span class="ml-2">Loading…</span>
    </div>
  );
}

export function WeddingResponseFeatureBoundary(props: { label: string; children: JSX.Element }) {
  return (
    <ErrorBoundary fallback={() => (
      <div
        class="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-950 shadow-sm"
        role="alert"
      >
        <p class="font-semibold">This part of your planner could not open.</p>
        <p class="mt-1">Your saved planning details have not changed.</p>
        <button
          type="button"
          class="mt-3 min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2 font-semibold hover:bg-amber-100"
          onClick={() => window.location.reload()}
        >
          Reload this view
        </button>
      </div>
    )}>
      <Suspense fallback={<WeddingResponseFeatureFallback label={props.label} />}>
        {props.children}
      </Suspense>
    </ErrorBoundary>
  );
}
