// @locs-version: 1.0
import { createEffect, createSignal, For, onMount, Show } from "solid-js";
import { sendDatabaseSavedView } from "@/lib/databaseMessageCommands";
import {
  createWeddingRunSheetShare, listWeddingRunSheetShareGrants, loadWeddingRunSheetShareCapability,
  revokeWeddingRunSheetShare, weddingRunSheetGrantState, weddingRunSheetProtectedLink,
  type WeddingRunSheetShareGrant,
} from "@/lib/weddingRunSheetShareApi";
import { buildWeddingRunSheetSavedViewContent, type WeddingRunSheetSavedViewPreset } from "@/lib/weddingRunSheetSavedViewState";

const roleByPreset: Partial<Record<WeddingRunSheetSavedViewPreset["id"], WeddingRunSheetShareGrant["recipient_role"]>> = {
  vendor: "vendor", photo_video: "photo_video", vip: "vip", guest: "guest",
};

function localInput(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

const stateLabels = {
  revoked: "Revoked", expired: "Expired", changes_requested: "Changes requested",
  acknowledged: "Acknowledged", awaiting_signoff: "Awaiting sign-off", active: "Active",
};

export function WeddingRunSheetShareControls(props: {
  databaseId: string;
  weddingPlanId: string;
  preset: WeddingRunSheetSavedViewPreset;
  recordIds: string[];
  archived: boolean;
}) {
  const [enabled, setEnabled] = createSignal(false);
  const [loaded, setLoaded] = createSignal(false);
  const [grants, setGrants] = createSignal<WeddingRunSheetShareGrant[]>([]);
  const [recipient, setRecipient] = createSignal("");
  const [expiresAt, setExpiresAt] = createSignal(localInput(7));
  const [signoff, setSignoff] = createSignal(true);
  const [signoffDueAt, setSignoffDueAt] = createSignal(localInput(2));
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [protectedLink, setProtectedLink] = createSignal("");
  const [confirmRevoke, setConfirmRevoke] = createSignal<string | null>(null);

  async function refresh() {
    try { setGrants(await listWeddingRunSheetShareGrants(props.databaseId)); }
    catch { setGrants([]); }
  }

  onMount(async () => {
    try { setEnabled((await loadWeddingRunSheetShareCapability()).enabled); }
    catch { setEnabled(false); }
    await refresh(); setLoaded(true);
  });

  createEffect(() => {
    props.databaseId;
    setProtectedLink(""); setNotice(""); setConfirmRevoke(null);
  });

  async function createLink() {
    const role = roleByPreset[props.preset.id];
    if (!role || busy() || props.archived) return;
    if (!recipient().trim()) { setNotice("Add the recipient's business or role label."); return; }
    setBusy(true); setNotice(""); setProtectedLink("");
    try {
      const view = buildWeddingRunSheetSavedViewContent({ databaseId: props.databaseId, preset: props.preset });
      await sendDatabaseSavedView({
        databaseId: view.database_id, viewId: view.view_id, name: view.name,
        revision: view.revision, profileRevision: view.profile_revision, columns: view.columns,
        sort: view.sort, filters: view.filters, fieldPolicy: view.field_policy,
      });
      const result = await createWeddingRunSheetShare({
        databaseId: props.databaseId, weddingPlanId: props.weddingPlanId,
        viewId: view.view_id, viewRevision: view.revision, recipientRole: role,
        recipientLabel: recipient(), recordIds: props.recordIds,
        signoffRequired: role === "vendor" && signoff(),
        signoffDueAt: role === "vendor" && signoff() ? new Date(signoffDueAt()).toISOString() : null,
        expiresAt: new Date(expiresAt()).toISOString(),
      });
      setProtectedLink(weddingRunSheetProtectedLink(result.token));
      setGrants((current) => [result.grant, ...current]);
      setNotice("Protected link created. Nothing was sent; copy it only to the recipient shown above.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "The protected link could not be created."); }
    finally { setBusy(false); }
  }

  async function revoke(grantId: string) {
    if (busy()) return;
    setBusy(true); setNotice("");
    try {
      const revoked = await revokeWeddingRunSheetShare(grantId);
      setGrants((current) => current.map((grant) => grant.grant_id === grantId ? revoked : grant));
      setNotice("Link revoked. Hosted access now fails. Downloaded or printed copies cannot be recalled.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "The link could not be revoked."); }
    finally { setBusy(false); setConfirmRevoke(null); }
  }

  return <section class="mt-4 rounded-lg border border-wedding-border bg-wedding-bg p-4" aria-labelledby="runsheet-share-title">
    <h3 id="runsheet-share-title" class="font-bold text-wedding-text">Protected hosted sharing</h3>
    <Show when={roleByPreset[props.preset.id]} fallback={<p class="mt-1 text-xs text-wedding-muted">Choose Vendor, Photo/video, VIP or Guest to create a least-privilege hosted view. Master and Print views stay local.</p>}>
      <Show when={loaded()} fallback={<p role="status" class="mt-2 text-xs text-wedding-muted">Checking hosted sharing…</p>}>
        <Show when={enabled()} fallback={<p class="mt-2 text-xs leading-5 text-wedding-muted">Hosted sharing is off by default in this environment. Previewing, saving and printing remain available, and any existing links can still be revoked below.</p>}>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <label class="text-xs font-medium text-wedding-muted">Recipient business or role<input value={recipient()} onInput={(event) => setRecipient(event.currentTarget.value)} maxlength="120" placeholder="Venue manager" class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 text-sm text-wedding-text" /></label>
            <label class="text-xs font-medium text-wedding-muted">Link expires<input type="datetime-local" value={expiresAt()} onInput={(event) => setExpiresAt(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 text-sm text-wedding-text" /></label>
          </div>
          <Show when={props.preset.id === "vendor"}><div class="mt-3 rounded-lg bg-white p-3">
            <label class="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={signoff()} onChange={(event) => setSignoff(event.currentTarget.checked)} /> Request final vendor sign-off</label>
            <Show when={signoff()}><label class="mt-2 block text-xs font-medium text-wedding-muted">Sign-off due<input type="datetime-local" value={signoffDueAt()} onInput={(event) => setSignoffDueAt(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border px-3 text-sm text-wedding-text sm:max-w-sm" /></label></Show>
          </div></Show>
          <button type="button" disabled={busy() || props.archived || props.recordIds.length === 0} onClick={() => void createLink()} class="mt-3 min-h-12 w-full rounded-lg bg-wedding-action px-4 font-bold text-white disabled:opacity-50">{busy() ? "Creating…" : "Create protected link"}</button>
          <p class="mt-2 text-xs leading-5 text-wedding-muted">This creates a revocable capability; it does not email or message anyone. The exact preview above is the content the link can project.</p>
        </Show>
      </Show>
    </Show>
    <Show when={protectedLink()}><div class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
      <label class="text-xs font-bold text-wedding-text">Copy this link now<input readOnly value={protectedLink()} onFocus={(event) => event.currentTarget.select()} class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3 text-sm" /></label>
      <button type="button" onClick={() => void navigator.clipboard.writeText(protectedLink()).then(() => setNotice("Protected link copied."))} class="mt-2 min-h-11 rounded-lg border-2 border-wedding-action px-4 font-bold text-wedding-action">Copy link</button>
      <p class="mt-2 text-xs text-wedding-muted">OmnyID stores only a digest of this capability. The full link is not shown again.</p>
    </div></Show>
    <Show when={notice()}><p role="status" class="mt-3 rounded-lg bg-white p-3 text-xs text-wedding-text">{notice()}</p></Show>
    <Show when={grants().length}><div class="mt-4 border-t border-wedding-border pt-3">
      <h4 class="text-xs font-bold uppercase tracking-wide text-wedding-muted">Hosted links</h4>
      <div class="mt-2 grid gap-2"><For each={grants()}>{(grant) => {
        const state = () => weddingRunSheetGrantState(grant);
        const canRevoke = () => state() !== "revoked" && state() !== "expired";
        return <article class="rounded-lg bg-white p-3 text-sm">
          <div class="flex flex-wrap items-start justify-between gap-2"><div><p class="font-bold">{grant.recipient_label}</p><p class="text-xs text-wedding-muted">{stateLabels[state()]} · expires {new Date(grant.expires_at).toLocaleString()} · {grant.view_count} view{grant.view_count === 1 ? "" : "s"}</p></div><Show when={canRevoke()}><button type="button" onClick={() => setConfirmRevoke(grant.grant_id)} class="min-h-11 rounded-lg border border-red-300 px-3 text-xs font-bold text-red-700">Revoke</button></Show></div>
          <Show when={grant.acknowledgement}><p class="mt-2 text-xs text-wedding-muted">Latest response from {grant.acknowledgement?.actor_label}: {stateLabels[state()]}.</p></Show>
          <Show when={confirmRevoke() === grant.grant_id}><div class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3"><p class="text-xs">Revoke this link now? Hosted access cannot be restored. Downloaded or printed copies remain outside OmnyID.</p><div class="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setConfirmRevoke(null)} class="min-h-11 rounded-lg border-2 border-wedding-action font-bold text-wedding-action">Cancel</button><button type="button" onClick={() => void revoke(grant.grant_id)} class="min-h-11 rounded-lg bg-red-700 font-bold text-white">Confirm revoke</button></div></div></Show>
        </article>;
      }}</For></div>
    </div></Show>
  </section>;
}
