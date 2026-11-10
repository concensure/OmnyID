import { createResource, createSignal, For, Show } from "solid-js";
import { decideVendorPublication, getPendingVendorPublications, type PendingVendorPublication } from "@/lib/vendorPortalApi";

export default function VendorPublicationReviewPanel() {
  const [items, { refetch }] = createResource(getPendingVendorPublications);
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const decide = async (item: PendingVendorPublication, decision: "publish" | "reject") => {
    const note = prompt(`${decision === "publish" ? "Approval" : "Rejection"} note for ${item.vendor_name}`, decision === "publish" ? "Reviewed public description and approved." : "Please revise the public description.")?.trim();
    if (!note || note.length < 10 || busy()) return;
    setBusy(true); setNotice("");
    try { await decideVendorPublication(item.revision_id, decision, note); await refetch(); setNotice(`Publication ${decision === "publish" ? "approved" : "returned"}.`); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "The publication decision could not be saved."); }
    finally { setBusy(false); }
  };
  return <section class="mt-4 rounded-xl border border-rose-200 bg-white p-4" aria-labelledby="vendor-publication-review-title"><h4 id="vendor-publication-review-title" class="font-semibold">Vendor publication review</h4><p class="mt-1 text-sm text-slate-600">Only changed public descriptions wait here. Previously published information stays live during review.</p>
    <Show when={items.loading}><p class="mt-3 text-sm">Loading reviews…</p></Show>
    <div class="mt-3 grid gap-3"><For each={items() ?? []} fallback={<p class="rounded-lg bg-slate-50 p-3 text-sm">No vendor descriptions are waiting for review.</p>}>{(item) => <article class="rounded-lg border p-3"><div class="flex flex-wrap justify-between gap-2"><div><strong>{item.vendor_name}</strong><p class="text-xs text-slate-500">{item.category} · revision {item.profile_revision}</p></div><span class="text-xs text-slate-500">{new Date(item.submitted_at).toLocaleString("en-AU")}</span></div><p class="mt-3 whitespace-pre-wrap text-sm leading-6">{item.snapshot.description || "No description"}</p><div class="mt-3 flex gap-2"><button type="button" disabled={busy()} class="min-h-11 rounded-lg bg-emerald-700 px-4 font-bold text-white" onClick={() => void decide(item, "publish")}>Publish</button><button type="button" disabled={busy()} class="min-h-11 rounded-lg border border-red-300 px-4 font-bold text-red-800" onClick={() => void decide(item, "reject")}>Return for revision</button></div></article>}</For></div>
    <Show when={notice()}><p class="mt-3 text-sm" role="status">{notice()}</p></Show>
  </section>;
}
