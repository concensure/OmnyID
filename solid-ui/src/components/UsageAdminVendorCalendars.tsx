import { createResource, createSignal, For, onCleanup, Show } from "solid-js";
import { apiFetch } from "@/lib/api";

type Inventory = { items: { vendor_id: string; vendor_name: string }[]; categories: string[]; next_cursor: string | null; through: string };
type Link = { vendor_id: string; vendor_name: string; management_url: string; expires_at: string };
type Batch = { created: Link[]; skipped: { vendor_id: string; reason: string }[] };

export default function UsageAdminVendorCalendars() {
  const [inventory] = createResource(() => apiFetch<Inventory>("/admin/wedding/vendor-calendar/vendors"));
  const [category, setCategory] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [links, setLinks] = createSignal<Link[]>([]);
  const [notice, setNotice] = createSignal("");
  let cancelled = false;
  onCleanup(() => { cancelled = true; });

  const generate = async () => {
    if (busy()) return;
    if (!confirm(`Generate private availability links for ${category() || "all vendor types"}? Valid older links will remain usable. No invitations will be sent.`)) return;
    cancelled = false; setBusy(true); setLinks([]); setNotice("");
    let cursor = ""; let through = ""; let skipped = 0;
    const selected = category();
    try {
      do {
        const query = new URLSearchParams({ category: selected, after: cursor });
        if (through) query.set("through", through);
        const page = await apiFetch<Inventory>(`/admin/wedding/vendor-calendar/vendors?${query}`);
        if (cancelled) break;
        through = page.through;
        if (page.items.length) {
          const batch = await apiFetch<Batch>("/admin/wedding/celebrant-management/links/batch", {
            method: "POST", bodyJson: { vendor_ids: page.items.map(v => v.vendor_id), expires_in_days: 14, preserve_existing: true },
          });
          if (cancelled) break;
          setLinks(current => [...current, ...batch.created]); skipped += batch.skipped.length;
          setNotice(`${links().length} links created; ${skipped} ineligible records skipped.`);
        }
        cursor = page.next_cursor || "";
        // Keep bounded requests within the operator rate limit. No automatic replay
        // after an ambiguous response: bearer values are intentionally shown once.
        if (cursor) await new Promise(resolve => setTimeout(resolve, 2200));
      } while (cursor && !cancelled);
      if (!cancelled) setNotice(`${links().length} links created; ${skipped} skipped. Copy the private links before leaving.`);
    } catch (error) {
      if (!cancelled) setNotice(`${error instanceof Error ? error.message : "Generation stopped"}. Already returned links are retained below. No failed batch was retried.`);
    } finally { if (!cancelled) setBusy(false); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(links().map(link => `${link.vendor_name}\n${link.management_url}\nExpires: ${link.expires_at}`).join("\n\n")); setNotice("Private links copied."); }
    catch { setNotice("Clipboard unavailable. Select and copy the links below."); }
  };
  return <section class="my-4 rounded-xl border border-slate-200 p-4" aria-labelledby="all-vendor-calendars">
    <h3 id="all-vendor-calendars" class="font-semibold">Availability links for every vendor</h3>
    <p class="mt-2 text-sm">Generate all vendors or one category in batches of 100. Each link controls only that vendor’s calendar. Valid links renew for 14 days when opened; expired or revoked links stay closed.</p>
    <div class="mt-3 flex flex-wrap gap-3">
      <label>Vendor type<select class="ml-2 min-h-11 rounded border px-2" value={category()} disabled={busy()} onChange={event => setCategory(event.currentTarget.value)}>
        <option value="">All vendor types</option><For each={inventory()?.categories || []}>{value => <option value={value}>{value}</option>}</For>
      </select></label>
      <button type="button" class="min-h-11 rounded bg-slate-900 px-4 text-white disabled:opacity-50" disabled={busy() || inventory.loading || !!inventory.error} onClick={() => void generate()}>{busy() ? "Generating…" : "Generate availability links"}</button>
    </div>
    <Show when={inventory.error}><p role="alert">Vendor categories could not be loaded. Refresh to try again.</p></Show>
    <p role="status" class="mt-3 text-sm">{notice()}</p>
    <Show when={links().length}><button type="button" class="my-2 min-h-11 rounded border px-3" onClick={() => void copy()}>Copy all private links</button>
      <div class="max-h-80 overflow-auto"><For each={links()}>{link => <details class="border-t p-2"><summary>{link.vendor_name}</summary><p class="break-all select-all text-sm">{link.management_url}</p><p class="text-xs">Expires {new Date(link.expires_at).toLocaleString("en-AU")}</p></details>}</For></div>
    </Show>
  </section>;
}
