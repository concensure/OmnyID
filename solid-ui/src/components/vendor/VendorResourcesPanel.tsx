import { createResource, createSignal, For, Show } from "solid-js";
import { createVendorResource, getVendorResources, updateVendorResource, type VendorResource } from "@/lib/vendorPortalApi";

const numberOrNull = (value: string) => value ? Number(value) : null;

export function VendorResourcesPanel(props: { vendorSlug: string }) {
  const [resources, { refetch }] = createResource(() => props.vendorSlug, getVendorResources);
  const [open, setOpen] = createSignal(false);
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [seated, setSeated] = createSignal("");
  const [standing, setStanding] = createSignal("");
  const [inclusions, setInclusions] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const save = async () => {
    if (!name().trim() || busy()) return;
    setBusy(true); setNotice("");
    try {
      await createVendorResource(props.vendorSlug, { name: name().trim(), description: description().trim(), capacitySeated: numberOrNull(seated()), capacityStanding: numberOrNull(standing()), inclusions: inclusions().split(/[\n,]/).map((value) => value.trim()).filter(Boolean) });
      setName(""); setDescription(""); setSeated(""); setStanding(""); setInclusions(""); setOpen(false); await refetch(); setNotice("Resource added. Choose it when creating availability dates.");
    } catch (reason) { setNotice(reason instanceof Error ? reason.message : "The resource could not be added."); }
    finally { setBusy(false); }
  };
  const archive = async (resource: VendorResource) => {
    if (busy() || !confirm(`Archive ${resource.name}? Confirmed future bookings will prevent this change.`)) return;
    setBusy(true); setNotice("");
    try { await updateVendorResource(props.vendorSlug, resource, "archived"); await refetch(); setNotice("Resource archived. Existing booking evidence was retained."); }
    catch (reason) { setNotice(reason instanceof Error ? reason.message : "The resource could not be archived."); }
    finally { setBusy(false); }
  };
  return <section class="rounded-xl border border-wedding-muted bg-white p-5 shadow-sm" aria-labelledby="vendor-resources-title">
    <div class="flex flex-wrap items-start justify-between gap-3"><div><h2 id="vendor-resources-title" class="text-lg font-semibold">Spaces and service resources</h2><p class="mt-1 text-sm leading-6 text-wedding-muted">Keep separate calendars for rooms, photographers, vehicles or service teams. Confirmed bookings cannot be overwritten by bulk changes.</p></div><button type="button" class="min-h-11 rounded-lg border border-wedding-accent px-4 font-bold text-wedding-accent" onClick={() => setOpen(!open())}>{open() ? "Cancel" : "Add resource"}</button></div>
    <Show when={open()}><div class="mt-4 grid gap-3 rounded-lg bg-wedding-surface p-4 sm:grid-cols-2">
      <label class="text-sm font-medium">Name<input class="mt-1 min-h-11 w-full rounded-lg border px-3" value={name()} onInput={(event) => setName(event.currentTarget.value)} /></label>
      <label class="text-sm font-medium">Description<input class="mt-1 min-h-11 w-full rounded-lg border px-3" value={description()} onInput={(event) => setDescription(event.currentTarget.value)} /></label>
      <label class="text-sm font-medium">Seated capacity<input type="number" min="0" class="mt-1 min-h-11 w-full rounded-lg border px-3" value={seated()} onInput={(event) => setSeated(event.currentTarget.value)} /></label>
      <label class="text-sm font-medium">Standing capacity<input type="number" min="0" class="mt-1 min-h-11 w-full rounded-lg border px-3" value={standing()} onInput={(event) => setStanding(event.currentTarget.value)} /></label>
      <label class="text-sm font-medium sm:col-span-2">Inclusions, separated by commas<input class="mt-1 min-h-11 w-full rounded-lg border px-3" value={inclusions()} onInput={(event) => setInclusions(event.currentTarget.value)} /></label>
      <button type="button" class="min-h-11 rounded-lg bg-wedding-accent px-4 font-bold text-white" disabled={busy() || !name().trim()} onClick={() => void save()}>Save resource</button>
    </div></Show>
    <div class="mt-4 grid gap-3"><For each={resources() ?? []}>{(resource) => <article class="rounded-lg border border-wedding-muted p-4"><div class="flex flex-wrap items-start justify-between gap-3"><div><h3 class="font-semibold">{resource.name}</h3><p class="mt-1 text-sm text-wedding-muted">{resource.description || "No description"} · {resource.capacity_seated ?? "—"} seated · {resource.date_count} dates · {resource.booked_count} booked</p></div><Show when={resource.status === "active"}><button type="button" class="min-h-11 rounded-lg border px-3 text-sm font-bold" onClick={() => void archive(resource)}>Archive</button></Show></div></article>}</For></div>
    <Show when={!resources.loading && !(resources()?.length)}><p class="mt-4 rounded-lg bg-wedding-surface p-4 text-sm">Add the first named space or service resource, then attach availability to it below.</p></Show>
    <Show when={notice()}><p class="mt-3 text-sm" role="status">{notice()}</p></Show>
  </section>;
}
