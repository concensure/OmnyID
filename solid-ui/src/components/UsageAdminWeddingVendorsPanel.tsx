// @locs-version: 2.0
import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import {
  createAdminWeddingVendor,
  deleteAdminWeddingVendor,
  fetchAdminWeddingVendors,
  updateAdminWeddingVendor,
  type WeddingVendor,
} from "@/lib/api";
import {
  adminWeddingVendorDraftFromVendor,
  buildAdminWeddingVendorPayload,
  emptyAdminWeddingVendorDraft,
  type AdminWeddingVendorDraft,
} from "@/lib/adminWeddingVendorFormState";
import UsageAdminWeddingVendorAttributesEditor from "@/components/UsageAdminWeddingVendorAttributesEditor";
import {
  buildWeddingVendorAttributeWrites,
  weddingVendorAttributeCoverage,
  weddingVendorAttributeRows,
  type WeddingVendorAttributeCatalogEntry,
  type WeddingVendorAttributeEdit,
} from "@/lib/weddingVendorAttributeCatalogState";
import type { WeddingVendorAttributeEvidence } from "@/lib/weddingVendorRankingState";

export default function UsageAdminWeddingVendorsPanel() {
  const [query, setQuery] = createSignal("");
  const [appliedQuery, setAppliedQuery] = createSignal("");
  const [draft, setDraft] = createSignal<AdminWeddingVendorDraft>(emptyAdminWeddingVendorDraft());
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [validationErrors, setValidationErrors] = createSignal<string[]>([]);
  const [attributeCatalog, setAttributeCatalog] = createSignal<WeddingVendorAttributeCatalogEntry[]>([]);
  const [attributeBaseline, setAttributeBaseline] = createSignal<Record<string, WeddingVendorAttributeEvidence>>({});
  const [attributeEdits, setAttributeEdits] = createSignal<Record<string, WeddingVendorAttributeEdit | undefined>>({});
  const attributeRows = createMemo(() =>
    weddingVendorAttributeRows({ catalog: attributeCatalog(), attributes: attributeBaseline(), category: draft().category }),
  );
  const [vendors, { refetch }] = createResource(appliedQuery, async (nextQuery) =>
    fetchAdminWeddingVendors({ limit: 200, query: nextQuery || undefined }).then((response) => {
      setAttributeCatalog(response.attributeCatalog ?? []);
      return response.vendors;
    }),
  );
  const attributeCoverage = createMemo(() => weddingVendorAttributeCoverage({
    catalog: attributeCatalog(),
    vendors: vendors() ?? [],
  }));

  function selectVendorForEdit(vendor: WeddingVendor | null) {
    setValidationErrors([]);
    setDraft(vendor ? adminWeddingVendorDraftFromVendor(vendor) : emptyAdminWeddingVendorDraft());
    setAttributeBaseline(vendor?.attributes ?? {});
    setAttributeEdits({});
  }

  function updateDraft<K extends keyof AdminWeddingVendorDraft>(key: K, value: AdminWeddingVendorDraft[K]) {
    setValidationErrors([]);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveVendor(event: Event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setValidationErrors([]);
    try {
      const current = draft();
      const { payload, errors } = buildAdminWeddingVendorPayload(current);
      const { writes, errors: attributeErrors } = buildWeddingVendorAttributeWrites({ rows: attributeRows(), edits: attributeEdits() });
      if (!payload || attributeErrors.length > 0) {
        setValidationErrors([...errors, ...attributeErrors]);
        return;
      }
      const body = writes.length > 0 ? { ...payload, attributes: writes } : payload;
      const response = current.vendorId
        ? await updateAdminWeddingVendor(current.vendorId, body)
        : await createAdminWeddingVendor(body);
      setNotice(current.vendorId ? "Vendor updated." : "Vendor created.");
      const refreshed = await refetch();
      selectVendorForEdit(refreshed?.find((vendor) => vendor.vendorId === response.vendor?.vendorId) ?? response.vendor);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vendor save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function removeVendor(vendor: WeddingVendor) {
    if (typeof window !== "undefined" && !window.confirm(`Delete ${vendor.vendorName}? This removes the vendor for all wedding users.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    setValidationErrors([]);
    try {
      await deleteAdminWeddingVendor(vendor.vendorId);
      if (draft().vendorId === vendor.vendorId) selectVendorForEdit(null);
      setNotice("Vendor deleted.");
      await refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vendor delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="mt-4 min-w-0 rounded-2xl border border-rose-200/70 bg-white/80 p-3 sm:p-4">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div class="min-w-0">
          <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-rose-700/70">Wedding vendors</p>
          <h4 class="mt-1 break-words text-base font-semibold text-slate-950">Editable vendor database</h4>
          <p class="mt-1 max-w-3xl break-words text-sm leading-6 text-slate-700">
            Admin-managed vendors are available to the wedding planner and master agent. Outreach updates are stored per user so follow-ups can be timed without changing global vendor facts.
          </p>
        </div>
        <form
          class="flex min-w-0 gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedQuery(query().trim());
          }}
        >
          <input
            class="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            value={query()}
            placeholder="Search vendors"
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
          <button class="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800" type="submit">
            Search
          </button>
        </form>
      </div>

      <Show when={notice()}>
        {(message) => <p class="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message()}</p>}
      </Show>
      <Show when={error()}>
        {(message) => <p class="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">{message()}</p>}
      </Show>

      <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <div class="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/70">
          <Show when={!vendors.loading} fallback={<p class="p-3 text-sm text-slate-600">Loading vendors...</p>}>
            <Show when={!vendors.error} fallback={<p class="p-3 text-sm text-red-800">Could not load vendors.</p>}>
              <For each={vendors() ?? []} fallback={<p class="p-3 text-sm text-slate-600">No vendors found.</p>}>
                {(vendor) => (
                  <article class="border-b border-slate-200 bg-white p-3 last:border-b-0">
                    <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div class="min-w-0">
                        <p class="break-words text-sm font-semibold text-slate-950">{vendor.vendorName}</p>
                        <p class="mt-1 break-words text-xs text-slate-600">{vendor.category} · {vendor.serviceArea}</p>
                        <Show when={vendor.address}>
                          {(address) => <p class="mt-1 break-words text-xs text-slate-500">{address()}</p>}
                        </Show>
                        <p class="mt-1 break-words text-xs text-slate-500">
                          {vendor.contactEmail || vendor.contactPhone || "No contact details mounted"}
                        </p>
                      </div>
                      <div class="flex shrink-0 gap-2">
                        <button
                          type="button"
                          class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                          onClick={() => selectVendorForEdit(vendor)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          class="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800"
                          disabled={busy()}
                          onClick={() => void removeVendor(vendor)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <Show when={vendor.photos.length > 0}>
                      <div class="mt-3 grid gap-2 sm:grid-cols-3">
                        <For each={vendor.photos.slice(0, 3)}>
                          {(photo) => (
                            <img
                              class="h-20 w-full rounded-lg border border-slate-200 object-cover"
                              src={photo.photoUrl}
                              alt={photo.altText ?? vendor.vendorName}
                              loading="lazy"
                            />
                          )}
                        </For>
                      </div>
                    </Show>
                  </article>
                )}
              </For>
            </Show>
          </Show>
        </div>

        <form class="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3" onSubmit={(event) => void saveVendor(event)}>
          <div class="flex items-center justify-between gap-3">
            <p class="text-sm font-semibold text-slate-950">{draft().vendorId ? "Edit vendor" : "Add vendor"}</p>
            <button
              type="button"
              class="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              onClick={() => selectVendorForEdit(null)}
            >
              New
            </button>
          </div>

          <Show when={validationErrors().length > 0}>
            <ul class="mt-3 space-y-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <For each={validationErrors()}>
                {(message) => <li class="text-xs leading-5 text-red-900">{message}</li>}
              </For>
            </ul>
          </Show>

          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Vendor name" required value={draft().vendorName} onInput={(event) => updateDraft("vendorName", event.currentTarget.value)} />
            <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="vendor-slug" value={draft().vendorSlug} onInput={(event) => updateDraft("vendorSlug", event.currentTarget.value)} />
            <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Category" required value={draft().category} onInput={(event) => updateDraft("category", event.currentTarget.value)} />
            <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Service area" required value={draft().serviceArea} onInput={(event) => updateDraft("serviceArea", event.currentTarget.value)} />
            <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm sm:col-span-2" placeholder="Venue address or service address" value={draft().address} onInput={(event) => updateDraft("address", event.currentTarget.value)} />
            <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Website URL" type="url" value={draft().websiteUrl} onInput={(event) => updateDraft("websiteUrl", event.currentTarget.value)} />
            <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Contact email" type="email" value={draft().contactEmail} onInput={(event) => updateDraft("contactEmail", event.currentTarget.value)} />
            <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Contact phone" type="tel" value={draft().contactPhone} onInput={(event) => updateDraft("contactPhone", event.currentTarget.value)} />
            <select class="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={draft().status} onChange={(event) => updateDraft("status", event.currentTarget.value as AdminWeddingVendorDraft["status"])}>
              <option value="active">Active</option>
              <option value="hidden">Hidden</option>
              <option value="archived">Archived</option>
            </select>
            <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Source URL" type="url" value={draft().sourceUrl} onInput={(event) => updateDraft("sourceUrl", event.currentTarget.value)} />
            <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Source label" value={draft().sourceLabel} onInput={(event) => updateDraft("sourceLabel", event.currentTarget.value)} />
            <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Source checked date YYYY-MM-DD" type="date" value={draft().sourceCheckedAt} onInput={(event) => updateDraft("sourceCheckedAt", event.currentTarget.value)} />
          </div>

          <div class="mt-3 grid gap-2">
            <For each={[1, 2, 3] as const}>
              {(slot) => (
                <div class="grid gap-2 sm:grid-cols-[80px_minmax(0,1fr)_minmax(0,1fr)]">
                  <p class="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">Photo {slot}</p>
                  <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Photo URL" type="url" value={draft()[`photo${slot}Url` as keyof AdminWeddingVendorDraft] as string} onInput={(event) => updateDraft(`photo${slot}Url` as keyof AdminWeddingVendorDraft, event.currentTarget.value as never)} />
                  <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Alt text" value={draft()[`photo${slot}Alt` as keyof AdminWeddingVendorDraft] as string} onInput={(event) => updateDraft(`photo${slot}Alt` as keyof AdminWeddingVendorDraft, event.currentTarget.value as never)} />
                  <span aria-hidden="true" />
                  <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Photo source URL" type="url" value={draft()[`photo${slot}SourceUrl` as keyof AdminWeddingVendorDraft] as string} onInput={(event) => updateDraft(`photo${slot}SourceUrl` as keyof AdminWeddingVendorDraft, event.currentTarget.value as never)} />
                  <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Retrieved date" type="date" value={draft()[`photo${slot}RetrievedAt` as keyof AdminWeddingVendorDraft] as string} onInput={(event) => updateDraft(`photo${slot}RetrievedAt` as keyof AdminWeddingVendorDraft, event.currentTarget.value as never)} />
                  <span aria-hidden="true" />
                  <input class="rounded-lg border border-slate-200 px-3 py-2 text-sm sm:col-span-2" placeholder='Licence metadata JSON, e.g. {"use":"editorial"}' value={draft()[`photo${slot}LicenceMetadata` as keyof AdminWeddingVendorDraft] as string} onInput={(event) => updateDraft(`photo${slot}LicenceMetadata` as keyof AdminWeddingVendorDraft, event.currentTarget.value as never)} />
                </div>
              )}
            </For>
          </div>

          <UsageAdminWeddingVendorAttributesEditor
            groups={attributeRows()}
            edits={attributeEdits()}
            disabled={busy()}
            onEdit={(key, edit) => setAttributeEdits((current) => ({ ...current, [key]: edit }))}
          />

          <textarea class="mt-3 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Notes" value={draft().notes} onInput={(event) => updateDraft("notes", event.currentTarget.value)} />
          <textarea class="mt-2 min-h-20 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Caveat labels, one per line" value={draft().caveatLabels} onInput={(event) => updateDraft("caveatLabels", event.currentTarget.value)} />

          <button
            class="mt-3 w-full rounded-xl border border-rose-300 bg-rose-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            type="submit"
            disabled={busy()}
          >
            {busy() ? "Saving..." : "Save vendor"}
          </button>
        </form>
      </div>
      <details class="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <summary class="cursor-pointer text-sm font-semibold text-slate-950">Active vendor attribute coverage</summary>
        <div class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          <For each={attributeCoverage()}>
            {(row) => (
              <div class="rounded-lg border border-slate-100 bg-slate-50 p-2">
                <div class="flex items-center justify-between gap-2"><span class="text-xs font-semibold text-slate-900">{row.label}</span><span class="text-xs font-bold text-rose-800">{row.percentage}%</span></div>
                <p class="mt-1 text-[11px] text-slate-600">{row.covered} of {row.total} · {Object.entries(row.authorities).map(([authority, count]) => `${authority.replace(/_/g, " ")} ${count}`).join(", ") || "no sourced values"}</p>
              </div>
            )}
          </For>
        </div>
      </details>
    </section>
  );
}
