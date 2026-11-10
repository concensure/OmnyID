import { createResource, createSignal, For, Show } from "solid-js";
import { getVendorPublication, submitVendorPublication, type PublicationVisibility } from "@/lib/vendorPortalApi";

const labels: Record<keyof PublicationVisibility, string> = { description: "Description", email: "Email", phone: "Phone", website_url: "Website", instagram_url: "Instagram", facebook_url: "Facebook", photos: "Licensed photos" };

export function VendorPublicationPanel(props: { vendorSlug: string }) {
  const [publication, { refetch }] = createResource(() => props.vendorSlug, getVendorPublication);
  const [choices, setChoices] = createSignal<PublicationVisibility | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const visibility = () => choices() ?? publication()?.published.visibility;
  const toggle = (field: keyof PublicationVisibility) => setChoices({ ...(visibility() ?? Object.fromEntries(Object.keys(labels).map((key) => [key, true])) as PublicationVisibility), [field]: !(visibility()?.[field] ?? true) });
  const publish = async () => {
    const current = publication(); if (!current || busy()) return;
    setBusy(true); setNotice("");
    try { const result = await submitVendorPublication(props.vendorSlug, current.draft.revision, visibility()!); await refetch(); setChoices(null); setNotice(result.moderation_required ? "Description submitted for review. Your currently published version stays live until it is approved." : "Your selected contact fields are now published."); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "Publication could not be submitted."); }
    finally { setBusy(false); }
  };
  return <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm" aria-labelledby="vendor-publication-title">
    <h2 id="vendor-publication-title" class="text-lg font-semibold">Publish your listing</h2>
    <p class="mt-1 text-sm leading-6 text-wedding-muted">Choose what couples can see. Contact changes can publish immediately; changed descriptions keep the current version live during review.</p>
    <Show when={publication.loading}><p class="mt-3 text-sm" role="status">Loading publication state…</p></Show>
    <Show when={publication()}>{(current) => <>
      <fieldset class="mt-4 grid gap-2 sm:grid-cols-2"><legend class="mb-2 font-semibold">Visible fields</legend>
        <For each={Object.entries(labels) as Array<[keyof PublicationVisibility, string]>}>{([field, label]) => <label class="flex min-h-11 items-center gap-3 rounded-lg bg-wedding-surface px-3"><input type="checkbox" checked={visibility()?.[field] ?? true} onChange={() => toggle(field)} /><span>{label}</span></label>}</For>
      </fieldset>
      <div class="mt-4 rounded-lg bg-wedding-surface p-4"><p class="text-xs font-bold uppercase tracking-wide text-wedding-accent">Published preview</p><p class="mt-2 text-sm leading-6">{current().published.description || "No description is published yet."}</p><p class="mt-2 text-xs text-wedding-muted">Published revision {current().published.revision ?? "—"}</p></div>
      <button class="mt-4 min-h-11 rounded-lg bg-wedding-accent px-5 font-bold text-white disabled:opacity-50" type="button" disabled={busy()} onClick={() => void publish()}>{busy() ? "Submitting…" : "Publish selected fields"}</button>
      <Show when={notice()}><p class="mt-3 text-sm" role="status">{notice()}</p></Show>
      <Show when={current().revisions.length}><details class="mt-4"><summary class="cursor-pointer font-semibold">Publication history</summary><ul class="mt-2 grid gap-2 text-sm"><For each={current().revisions}>{(item) => <li class="rounded-lg border border-wedding-muted p-3">Revision {item.profile_revision}: <strong>{item.status.replaceAll("_", " ")}</strong><Show when={item.review_note}><span> — {item.review_note}</span></Show></li>}</For></ul></details></Show>
    </>}</Show>
  </section>;
}
