// @locs-version: 1.0
import { createResource, Show } from "solid-js";
import { fetchAdminWeddingQuoteShareMetrics } from "@/lib/api";

export default function UsageAdminWeddingQuoteSharePanel() {
  const [metrics, { refetch }] = createResource(fetchAdminWeddingQuoteShareMetrics);

  return (
    <section class="mt-5 rounded-2xl border border-primary/15 bg-primary/5 p-4" aria-labelledby="admin-quote-share-title">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-[0.18em] text-primary">Lead magnet</p>
          <h4 id="admin-quote-share-title" class="mt-1 text-base font-semibold text-on-surface">Venue quote comparison shares</h4>
          <p class="mt-1 max-w-2xl text-xs leading-5 text-on-surface-variant">Successful PDF deliveries only. Quote content and recipient addresses never enter this dashboard metric.</p>
        </div>
        <button type="button" class="rounded-full border border-primary/25 bg-white px-3 py-2 text-xs font-semibold text-primary" onClick={() => void refetch()}>Refresh</button>
      </div>
      <Show when={!metrics.loading} fallback={<p class="mt-4 text-sm text-on-surface-variant">Loading quote-share activity…</p>}>
        <Show when={!metrics.error && metrics()} fallback={<p class="mt-4 text-sm text-error">Quote-share activity could not be loaded.</p>}>
          {(value) => (
            <>
              <div class="mt-4 grid gap-3 sm:grid-cols-3">
                <div class="rounded-xl bg-white/75 p-3"><p class="text-xs text-on-surface-variant">PDFs sent</p><p class="mt-1 text-2xl font-semibold text-on-surface">{value().sentTotal}</p></div>
                <div class="rounded-xl bg-white/75 p-3"><p class="text-xs text-on-surface-variant">Last 7 days</p><p class="mt-1 text-2xl font-semibold text-on-surface">{value().sent7d}</p></div>
                <div class="rounded-xl bg-white/75 p-3"><p class="text-xs text-on-surface-variant">Latest delivery</p><p class="mt-1 text-sm font-semibold text-on-surface">{value().lastSentAt ? new Date(value().lastSentAt!).toLocaleString("en-AU") : "None yet"}</p></div>
              </div>
              <a class="mt-4 inline-flex min-h-11 items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white" href={value().toolUrl} target="_blank" rel="noopener noreferrer">Open quote comparison page</a>
            </>
          )}
        </Show>
      </Show>
    </section>
  );
}
