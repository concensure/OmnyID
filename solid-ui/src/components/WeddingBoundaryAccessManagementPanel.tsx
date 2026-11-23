// @locs-version: 1.0
import { createMemo, createSignal, For, onMount, Show } from "solid-js";

import {
  createWeddingBoundaryDelegatedGrant,
  createWeddingBoundaryHelperGrant,
  listWeddingBoundaryDelegatedGrants,
  listWeddingBoundaryHelperGrants,
  loadWeddingBoundaryAccessCapabilities,
  revokeWeddingBoundaryDelegatedGrant,
  revokeWeddingBoundaryHelperGrant,
  type WeddingBoundaryAccessCapabilities,
  type WeddingBoundaryDelegatedGrant,
  type WeddingBoundaryDelegatedRole,
  type WeddingBoundaryHelperGrant,
} from "@/lib/weddingBoundaryGovernanceApi";
import type {
  WeddingBoundaryGuestProfile,
  WeddingBoundaryHousehold,
  WeddingBoundaryState,
} from "@/lib/weddingBoundaryLedgerState";

function localExpiry(days = 7): string {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  if (/not available|unavailable|503/i.test(error.message)) {
    return "This access type is not enabled for this wedding yet. Existing access can still be reviewed and revoked.";
  }
  return error.message || fallback;
}

function grantState(grant: { expires_at: string; revoked_at?: string | null }): "active" | "expired" | "revoked" {
  if (grant.revoked_at) return "revoked";
  return Date.parse(grant.expires_at) <= Date.now() ? "expired" : "active";
}

function formatExpiry(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleString() : "Unknown expiry";
}

function selectedValues(event: Event): string[] {
  const select = event.currentTarget as HTMLSelectElement;
  return Array.from(select.selectedOptions).map((option) => option.value);
}

export function WeddingBoundaryAccessManagementPanel(props: {
  state: WeddingBoundaryState;
  weddingPlanId: string;
  responseWorkspaceId: string;
}) {
  const [expanded, setExpanded] = createSignal(false);
  const [capabilities, setCapabilities] = createSignal<WeddingBoundaryAccessCapabilities | null>(null);
  const [helperGrants, setHelperGrants] = createSignal<WeddingBoundaryHelperGrant[]>([]);
  const [delegatedGrants, setDelegatedGrants] = createSignal<WeddingBoundaryDelegatedGrant[]>([]);
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const [revokeTarget, setRevokeTarget] = createSignal<{ kind: "helper" | "delegate"; id: string } | null>(null);
  const [helperLabel, setHelperLabel] = createSignal("");
  const [helperHouseholds, setHelperHouseholds] = createSignal<string[]>([]);
  const [helperCanPropose, setHelperCanPropose] = createSignal(false);
  const [helperExpiry, setHelperExpiry] = createSignal(localExpiry());
  const [oneTimeToken, setOneTimeToken] = createSignal("");
  const [delegateEmail, setDelegateEmail] = createSignal("");
  const [delegateRole, setDelegateRole] = createSignal<WeddingBoundaryDelegatedRole>("planner");
  const [delegateHouseholds, setDelegateHouseholds] = createSignal<string[]>([]);
  const [delegatePersonId, setDelegatePersonId] = createSignal("");
  const [delegateExpiry, setDelegateExpiry] = createSignal(localExpiry());

  const households = createMemo(() => props.state.allObjects.filter(
    (object): object is WeddingBoundaryHousehold => object.kind === "wedding_boundary_household" && object.status !== "archived",
  ));
  const guests = createMemo(() => props.state.allObjects.filter(
    (object): object is WeddingBoundaryGuestProfile => object.kind === "wedding_boundary_guest_profile" && object.status !== "archived",
  ));
  const activeCount = createMemo(() => [...helperGrants(), ...delegatedGrants()].filter((grant) => grantState(grant) === "active").length);

  async function refresh(): Promise<void> {
    const results = await Promise.allSettled([
      loadWeddingBoundaryAccessCapabilities(),
      listWeddingBoundaryHelperGrants(props.responseWorkspaceId),
      listWeddingBoundaryDelegatedGrants(props.responseWorkspaceId),
    ]);
    if (results[0].status === "fulfilled") setCapabilities(results[0].value);
    if (results[1].status === "fulfilled") setHelperGrants(results[1].value);
    if (results[2].status === "fulfilled") setDelegatedGrants(results[2].value);
  }

  onMount(() => void refresh());

  function validExpiry(value: string): string | null {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp < Date.now() + 15 * 60_000 || timestamp > Date.now() + 30 * 86_400_000) {
      return "Choose an expiry between 15 minutes and 30 days from now.";
    }
    return null;
  }

  async function createHelper(): Promise<void> {
    const expiryError = validExpiry(helperExpiry());
    if (!helperLabel().trim()) { setNotice("Name the helper or family group receiving access."); return; }
    if (helperHouseholds().length === 0) { setNotice("Choose at least one household this helper may see."); return; }
    if (expiryError) { setNotice(expiryError); return; }
    setBusy(true); setNotice(""); setOneTimeToken("");
    try {
      const result = await createWeddingBoundaryHelperGrant({
        weddingPlanId: props.weddingPlanId,
        responseWorkspaceId: props.responseWorkspaceId,
        principalLabel: helperLabel(),
        householdIds: helperHouseholds(),
        allowedActions: helperCanPropose() ? ["view_summary", "propose_request"] : ["view_summary"],
        expiresAt: new Date(helperExpiry()).toISOString(),
      });
      setHelperGrants((current) => [result.grant, ...current]);
      setOneTimeToken(result.token);
      setNotice("Access created. Nothing was sent. Copy the one-time code only to the named helper.");
      setHelperLabel(""); setHelperHouseholds([]); setHelperCanPropose(false);
    } catch (error) {
      setNotice(errorMessage(error, "Helper access could not be created."));
    } finally { setBusy(false); }
  }

  async function createDelegate(): Promise<void> {
    const expiryError = validExpiry(delegateExpiry());
    if (!delegateEmail().trim()) { setNotice("Enter the delegate's OmnyID account email."); return; }
    if (delegateRole() === "planner" && delegateHouseholds().length === 0) { setNotice("Choose the households this planner may see."); return; }
    if (delegateRole() === "rsvp_guest" && !delegatePersonId()) { setNotice("Choose the guest represented by this access."); return; }
    if (expiryError) { setNotice(expiryError); return; }
    setBusy(true); setNotice("");
    try {
      const grant = await createWeddingBoundaryDelegatedGrant({
        weddingPlanId: props.weddingPlanId,
        responseWorkspaceId: props.responseWorkspaceId,
        delegateEmail: delegateEmail(),
        role: delegateRole(),
        personId: delegateRole() === "rsvp_guest" ? delegatePersonId() : undefined,
        householdIds: delegateRole() === "planner" ? delegateHouseholds() : undefined,
        expiresAt: new Date(delegateExpiry()).toISOString(),
      });
      setDelegatedGrants((current) => [grant, ...current]);
      setNotice("Access added to that OmnyID account. It can only see the role and scope shown here.");
      setDelegateEmail(""); setDelegateHouseholds([]); setDelegatePersonId("");
    } catch (error) {
      setNotice(errorMessage(error, "Delegate access could not be created."));
    } finally { setBusy(false); }
  }

  async function revoke(): Promise<void> {
    const target = revokeTarget();
    if (!target || busy()) return;
    setBusy(true); setNotice("");
    try {
      if (target.kind === "helper") {
        const grant = await revokeWeddingBoundaryHelperGrant(target.id);
        setHelperGrants((current) => current.map((item) => item.grant_id === target.id ? grant : item));
      } else {
        const grant = await revokeWeddingBoundaryDelegatedGrant(target.id);
        setDelegatedGrants((current) => current.map((item) => item.grant_id === target.id ? grant : item));
      }
      setNotice("Access revoked. Future hosted access is refused; copies already shared outside OmnyID cannot be recalled.");
    } catch (error) {
      setNotice(errorMessage(error, "Access could not be revoked."));
    } finally { setBusy(false); setRevokeTarget(null); }
  }

  return <section class="mt-3 rounded-xl border border-cyan-100 bg-cyan-50/55 p-3 sm:p-4" aria-labelledby="family-access-title">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h3 id="family-access-title" class="font-bold text-cyan-950">Family and planner access</h3>
        <p class="mt-1 text-sm leading-6 text-cyan-950/75">Share the smallest useful view. Private notes, dietary details and seating-conflict reasons stay hidden.</p>
      </div>
      <button type="button" aria-expanded={expanded()} aria-controls="family-access-controls" onClick={() => setExpanded((value) => !value)} class="min-h-11 rounded-lg border-2 border-cyan-800 bg-white px-4 text-sm font-bold text-cyan-950">
        {expanded() ? "Close access settings" : `Manage access${activeCount() ? ` (${activeCount()})` : ""}`}
      </button>
    </div>

    <Show when={expanded()}>
      <div id="family-access-controls" class="mt-4 grid gap-4 xl:grid-cols-2">
        <section class="rounded-xl border border-cyan-100 bg-white p-3" aria-labelledby="family-helper-access-title">
          <h4 id="family-helper-access-title" class="font-bold text-cyan-950">Protected helper access</h4>
          <p class="mt-1 text-xs leading-5 text-cyan-950/70">A helper can see only named household summaries. Proposal access creates a request for your approval; it never edits the guest list directly.</p>
          <Show when={capabilities() && !capabilities()!.helper_links_enabled}>
            <p class="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950">New helper links are off in this environment. This rollout control does not affect your private planning.</p>
          </Show>
          <fieldset disabled={busy() || capabilities()?.helper_links_enabled === false} class="mt-3 disabled:opacity-60">
            <label class="block text-xs font-semibold text-cyan-950">Helper or family label<input value={helperLabel()} onInput={(event) => setHelperLabel(event.currentTarget.value)} maxlength="120" placeholder="Daniel's parents" class="mt-1 min-h-11 w-full rounded-lg border border-cyan-200 px-3 text-sm" /></label>
            <label class="mt-3 block text-xs font-semibold text-cyan-950">Households they can see<select multiple value={helperHouseholds()} onChange={(event) => setHelperHouseholds(selectedValues(event))} class="mt-1 min-h-24 w-full rounded-lg border border-cyan-200 p-2 text-sm"><For each={households()}>{(household) => <option value={household.householdId}>{household.displayName}</option>}</For></select><span class="mt-1 block font-normal text-cyan-950/65">Use Ctrl/Command or Shift to choose more than one.</span></label>
            <label class="mt-3 flex min-h-11 items-start gap-2 text-xs font-semibold text-cyan-950"><input type="checkbox" checked={helperCanPropose()} onChange={(event) => setHelperCanPropose(event.currentTarget.checked)} class="mt-0.5 h-5 w-5 accent-cyan-800" />Allow this helper to propose guest-list changes for review</label>
            <label class="mt-3 block text-xs font-semibold text-cyan-950">Access expires<input type="datetime-local" value={helperExpiry()} onInput={(event) => setHelperExpiry(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-cyan-200 px-3 text-sm" /></label>
            <button type="button" onClick={() => void createHelper()} class="mt-3 min-h-11 w-full rounded-lg bg-cyan-800 px-4 font-bold text-white">Create protected access</button>
          </fieldset>
          <Show when={oneTimeToken()}><div class="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3"><label class="text-xs font-bold text-emerald-950">Copy this one-time access code now<input readOnly value={oneTimeToken()} onFocus={(event) => event.currentTarget.select()} class="mt-1 min-h-11 w-full rounded-lg border border-emerald-200 bg-white px-3 text-sm" /></label><button type="button" onClick={() => void navigator.clipboard.writeText(oneTimeToken()).then(() => setNotice("Access code copied."))} class="mt-2 min-h-11 rounded-lg border-2 border-emerald-700 px-4 text-sm font-bold text-emerald-800">Copy code</button><p class="mt-2 text-xs text-emerald-950/75">Only a digest is stored. OmnyID cannot show the full code again.</p></div></Show>
        </section>

        <section class="rounded-xl border border-cyan-100 bg-white p-3" aria-labelledby="family-delegate-access-title">
          <h4 id="family-delegate-access-title" class="font-bold text-cyan-950">OmnyID account access</h4>
          <p class="mt-1 text-xs leading-5 text-cyan-950/70">A planner gets selected household summaries. RSVP guest access is limited to one invited person. Both roles may only propose changes.</p>
          <Show when={capabilities() && !capabilities()!.authenticated_delegates_enabled}>
            <p class="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950">New authenticated delegates are off for this account. Existing access remains visible and revocable.</p>
          </Show>
          <fieldset disabled={busy() || capabilities()?.authenticated_delegates_enabled === false} class="mt-3 disabled:opacity-60">
            <label class="block text-xs font-semibold text-cyan-950">Delegate's OmnyID email<input type="email" value={delegateEmail()} onInput={(event) => setDelegateEmail(event.currentTarget.value)} maxlength="320" autocomplete="off" placeholder="planner@example.com" class="mt-1 min-h-11 w-full rounded-lg border border-cyan-200 px-3 text-sm" /></label>
            <label class="mt-3 block text-xs font-semibold text-cyan-950">Role<select value={delegateRole()} onChange={(event) => { setDelegateRole(event.currentTarget.value as WeddingBoundaryDelegatedRole); setDelegateHouseholds([]); setDelegatePersonId(""); }} class="mt-1 min-h-11 w-full rounded-lg border border-cyan-200 px-3 text-sm"><option value="planner">Planner</option><option value="rsvp_guest">RSVP guest</option></select></label>
            <Show when={delegateRole() === "planner"} fallback={<label class="mt-3 block text-xs font-semibold text-cyan-950">Guest represented<select value={delegatePersonId()} onChange={(event) => setDelegatePersonId(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-cyan-200 px-3 text-sm"><option value="">Choose guest</option><For each={guests()}>{(guest) => <option value={guest.personId}>{guest.displayName}</option>}</For></select></label>}>
              <label class="mt-3 block text-xs font-semibold text-cyan-950">Households they can see<select multiple value={delegateHouseholds()} onChange={(event) => setDelegateHouseholds(selectedValues(event))} class="mt-1 min-h-24 w-full rounded-lg border border-cyan-200 p-2 text-sm"><For each={households()}>{(household) => <option value={household.householdId}>{household.displayName}</option>}</For></select></label>
            </Show>
            <label class="mt-3 block text-xs font-semibold text-cyan-950">Access expires<input type="datetime-local" value={delegateExpiry()} onInput={(event) => setDelegateExpiry(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-lg border border-cyan-200 px-3 text-sm" /></label>
            <button type="button" onClick={() => void createDelegate()} class="mt-3 min-h-11 w-full rounded-lg bg-cyan-800 px-4 font-bold text-white">Add account access</button>
          </fieldset>
        </section>
      </div>

      <Show when={notice()}><p role="status" class="mt-3 rounded-lg bg-white p-3 text-sm text-cyan-950">{notice()}</p></Show>

      <Show when={helperGrants().length + delegatedGrants().length > 0}>
        <section class="mt-4 border-t border-cyan-100 pt-4" aria-labelledby="family-current-access-title">
          <h4 id="family-current-access-title" class="text-xs font-bold uppercase tracking-wide text-cyan-950/70">Current and previous access</h4>
          <div class="mt-2 grid gap-2 md:grid-cols-2">
            <For each={helperGrants()}>{(grant) => <AccessRow label={grant.principal_label} detail={`Protected helper · ${grant.household_ids.length} household${grant.household_ids.length === 1 ? "" : "s"}`} grant={grant} kind="helper" onRevoke={setRevokeTarget} />}</For>
            <For each={delegatedGrants()}>{(grant) => <AccessRow label={grant.role === "planner" ? "Planner account" : "RSVP guest account"} detail={`${grant.allowed_actions.join(", ").replaceAll("_", " ")} · ${grant.role === "planner" ? `${grant.household_ids.length} household scope` : "one guest scope"}`} grant={grant} kind="delegate" onRevoke={setRevokeTarget} />}</For>
          </div>
        </section>
      </Show>

      <Show when={revokeTarget()}>
        <div role="alertdialog" aria-modal="true" aria-labelledby="family-revoke-title" class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
          <p id="family-revoke-title" class="font-bold text-red-950">Revoke this access?</p>
          <p class="mt-1 text-sm leading-6 text-red-950/80">Future hosted access will stop immediately. Information already copied, downloaded or forwarded outside OmnyID cannot be recalled.</p>
          <div class="mt-3 grid grid-cols-2 gap-2"><button type="button" onClick={() => setRevokeTarget(null)} class="min-h-11 rounded-lg border-2 border-cyan-800 bg-white font-bold text-cyan-950">Cancel</button><button type="button" disabled={busy()} onClick={() => void revoke()} class="min-h-11 rounded-lg bg-red-700 font-bold text-white">Confirm revoke</button></div>
        </div>
      </Show>
    </Show>
  </section>;
}

function AccessRow(props: {
  label: string;
  detail: string;
  grant: { grant_id: string; expires_at: string; revoked_at?: string | null };
  kind: "helper" | "delegate";
  onRevoke: (target: { kind: "helper" | "delegate"; id: string }) => void;
}) {
  const state = () => grantState(props.grant);
  return <article class="rounded-lg border border-cyan-100 bg-white p-3 text-sm">
    <div class="flex flex-wrap items-start justify-between gap-2"><div><p class="font-bold text-cyan-950">{props.label}</p><p class="mt-1 text-xs leading-5 text-cyan-950/70">{props.detail}</p><p class="text-xs text-cyan-950/70">{state() === "active" ? "Expires" : state() === "expired" ? "Expired" : "Revoked"} {formatExpiry(props.grant.expires_at)}</p></div><Show when={state() === "active"}><button type="button" onClick={() => props.onRevoke({ kind: props.kind, id: props.grant.grant_id })} class="min-h-11 rounded-lg border border-red-300 px-3 text-xs font-bold text-red-700">Revoke</button></Show></div>
  </article>;
}
