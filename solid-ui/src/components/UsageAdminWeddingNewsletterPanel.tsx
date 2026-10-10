// @locs-version: 2.0
import { For, Show, createResource } from "solid-js";
import {
  activeSubscribersCsv,
  fetchAdminWeddingNewsletter,
  type AdminWeddingNewsletterList,
} from "@/lib/weddingNewsletterApi";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function downloadCsv(list: AdminWeddingNewsletterList) {
  const blob = new Blob([activeSubscribersCsv(list.subscribers)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `wedding-newsletter-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function UsageAdminWeddingNewsletterPanel() {
  const [list, { refetch }] = createResource<AdminWeddingNewsletterList>(fetchAdminWeddingNewsletter);

  return (
    <section class="mt-4 min-w-0 rounded-2xl border border-rose-200/70 bg-rose-50/60 p-3 sm:p-4">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-rose-700/70">Wedding newsletter</p>
          <h4 class="mt-1 break-words text-base font-semibold text-slate-950">Blog newsletter subscribers</h4>
          <p class="mt-1 max-w-3xl break-words text-sm leading-6 text-slate-700">
            Emails collected by the subscribe forms on omnyid.com/wedding. Export the active list to email new blog
            posts. Each subscriber has an unsubscribe token, so include the unsubscribe link in every send.
          </p>
        </div>
        <div class="flex shrink-0 gap-2">
          <button
            type="button"
            class="rounded-full border border-rose-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-white disabled:opacity-50"
            disabled={!list() || list()!.activeCount === 0}
            onClick={() => list() && downloadCsv(list()!)}
          >
            Export active CSV
          </button>
          <button
            type="button"
            class="rounded-full border border-rose-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-white"
            onClick={() => refetch()}
          >
            Refresh
          </button>
        </div>
      </div>

      <Show when={!list.loading} fallback={<p class="mt-3 text-sm text-slate-600">Loading subscribers…</p>}>
        <Show
          when={!list.error}
          fallback={<p class="mt-3 text-sm text-rose-800">Could not load the newsletter list. Try refreshing.</p>}
        >
          <p class="mt-3 text-sm text-slate-700">
            <span class="font-semibold">{list()?.activeCount ?? 0}</span> active ·{" "}
            <span class="font-semibold">{list()?.unsubscribedCount ?? 0}</span> unsubscribed
          </p>
          <Show
            when={(list()?.subscribers ?? []).length > 0}
            fallback={<p class="mt-3 text-sm text-slate-600">No newsletter subscribers yet.</p>}
          >
            <div class="mt-3 max-h-80 overflow-auto rounded-xl border border-white/70 bg-white/80">
              <table class="w-full min-w-[480px] text-left text-sm">
                <thead>
                  <tr class="border-b border-rose-100 text-[11px] uppercase tracking-[0.1em] text-rose-700/70">
                    <th class="px-3 py-2 font-semibold">Email</th>
                    <th class="px-3 py-2 font-semibold">Source</th>
                    <th class="px-3 py-2 font-semibold">Subscribed</th>
                    <th class="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={list()?.subscribers}>
                    {(subscriber) => (
                      <tr class="border-b border-rose-50 last:border-b-0">
                        <td class="break-all px-3 py-2 text-slate-900">{subscriber.email}</td>
                        <td class="break-words px-3 py-2 text-slate-700">{subscriber.source}</td>
                        <td class="break-words px-3 py-2 text-slate-500">{formatDate(subscriber.subscribedAt)}</td>
                        <td class="break-words px-3 py-2 text-slate-700">
                          {subscriber.unsubscribedAt ? `Unsubscribed ${formatDate(subscriber.unsubscribedAt)}` : "Active"}
                        </td>
                      </tr>
                    )}
                  </For>
                </tbody>
              </table>
            </div>
          </Show>
        </Show>
      </Show>
    </section>
  );
}
