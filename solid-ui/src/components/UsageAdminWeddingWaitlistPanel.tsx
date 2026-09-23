// @locs-version: 2.0
import { For, Show, createResource } from "solid-js";
import { fetchAdminWeddingWaitlist, type AdminWeddingWaitlistSignup } from "@/lib/api";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function UsageAdminWeddingWaitlistPanel() {
  const [signups, { refetch }] = createResource<AdminWeddingWaitlistSignup[]>(async () => {
    const response = await fetchAdminWeddingWaitlist();
    return response.signups;
  });

  return (
    <section class="mt-4 min-w-0 rounded-2xl border border-rose-200/70 bg-rose-50/60 p-3 sm:p-4">
      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div class="min-w-0">
          <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-rose-700/70">Wedding waitlist</p>
          <h4 class="mt-1 break-words text-base font-semibold text-slate-950">
            Signups from the wedding marketing site
          </h4>
          <p class="mt-1 max-w-3xl break-words text-sm leading-6 text-slate-700">
            Email, name, and expected wedding date collected from omnyid.com/wedding's waitlist form.
          </p>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-full border border-rose-300 bg-white/80 px-3 py-1.5 text-xs font-semibold text-rose-800 hover:bg-white"
          onClick={() => refetch()}
        >
          Refresh
        </button>
      </div>

      <Show when={!signups.loading} fallback={<p class="mt-3 text-sm text-slate-600">Loading signups…</p>}>
        <Show when={!signups.error} fallback={<p class="mt-3 text-sm text-rose-800">Could not load the waitlist. Try refreshing.</p>}>
          <Show
            when={(signups() ?? []).length > 0}
            fallback={<p class="mt-3 text-sm text-slate-600">No waitlist signups yet.</p>}
          >
            <div class="mt-3 overflow-x-auto rounded-xl border border-white/70 bg-white/80">
              <table class="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr class="border-b border-rose-100 text-[11px] uppercase tracking-[0.1em] text-rose-700/70">
                    <th class="px-3 py-2 font-semibold">Name</th>
                    <th class="px-3 py-2 font-semibold">Email</th>
                    <th class="px-3 py-2 font-semibold">Expected wedding date</th>
                    <th class="px-3 py-2 font-semibold">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  <For each={signups()}>
                    {(signup) => (
                      <tr class="border-b border-rose-50 last:border-b-0">
                        <td class="break-words px-3 py-2 text-slate-900">
                          {signup.firstName} {signup.lastName}
                        </td>
                        <td class="break-words px-3 py-2 text-slate-700">{signup.email}</td>
                        <td class="break-words px-3 py-2 text-slate-700">{formatDate(signup.expectedWeddingDate)}</td>
                        <td class="break-words px-3 py-2 text-slate-500">{formatDate(signup.createdAt)}</td>
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
