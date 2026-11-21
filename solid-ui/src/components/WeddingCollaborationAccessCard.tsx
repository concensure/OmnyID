// @locs-version: 2.0
import { createMemo, createSignal, For, onMount, Show } from "solid-js";

import { WeddingInfoTip } from "@/components/WeddingInfoTip";
import {
  inviteWeddingPartner,
  leaveWeddingPartnerPlan,
  listWeddingPartnerMembers,
  listWeddingSharedContacts,
  revokeWeddingPartner,
  revokeWeddingSharedContact,
  shareWeddingContact,
  type WeddingPartnerMember,
  type WeddingPartnerInviteSummary,
  type WeddingPartnerScope,
  type WeddingSharedContact,
} from "@/lib/api";
import { loadContacts } from "@/lib/contactsLocalState";
import { buildWeddingCoworkingJourneyState } from "@/lib/weddingCoworkingJourneyState";
import {
  buildWeddingSharedContactDrafts,
  DEFAULT_WEDDING_SHARED_CONTACT_FIELDS,
  type WeddingSharedContactFieldSelection,
} from "@/lib/weddingSharedContactState";
import type { WeddingPlanningMetadata } from "@/lib/weddingPlanningTemplateState";
import type {
  WeddingCollaborationState,
  WeddingCollaboratorRole,
} from "@/lib/weddingCollaborationState";

type DraftRoleAssignment = {
  id: string;
  name: string;
  email: string;
  role: WeddingCollaboratorRole;
  roleLabel: string;
};

export function WeddingCollaborationAccessCard(props: {
  state: WeddingCollaborationState;
  metadata: WeddingPlanningMetadata;
  contactUserId?: string | null;
}) {
  const [openRole, setOpenRole] = createSignal<string | null>(null);
  const [personName, setPersonName] = createSignal("");
  const [personEmail, setPersonEmail] = createSignal("");
  const [selectedRole, setSelectedRole] = createSignal<WeddingCollaboratorRole>("co_owner");
  const [draftAssignments, setDraftAssignments] = createSignal<DraftRoleAssignment[]>([]);
  const [members, setMembers] = createSignal<WeddingPartnerMember[]>([]);
  const [invites, setInvites] = createSignal<WeddingPartnerInviteSummary[]>([]);
  const [scope, setScope] = createSignal<WeddingPartnerScope | null>(null);
  const [sharedWithMe, setSharedWithMe] = createSignal<WeddingSharedContact[]>([]);
  const [sharedByMe, setSharedByMe] = createSignal<WeddingSharedContact[]>([]);
  const [selectedRecipient, setSelectedRecipient] = createSignal("");
  const [contactRoleFilter, setContactRoleFilter] = createSignal("all");
  const [selectedContactIds, setSelectedContactIds] = createSignal<string[]>([]);
  const [sharedContactFields, setSharedContactFields] = createSignal<WeddingSharedContactFieldSelection>({ ...DEFAULT_WEDDING_SHARED_CONTACT_FIELDS });
  const [reviewingContacts, setReviewingContacts] = createSignal(false);
  const [sharingNotice, setSharingNotice] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const journey = createMemo(() => buildWeddingCoworkingJourneyState({ members: members(), invites: invites() }));
  const contacts = createMemo(() => loadContacts(props.contactUserId));
  const contactRoles = createMemo(() => Array.from(new Set(contacts().flatMap((contact) => contact.roles ?? []))).sort());
  const visibleContacts = createMemo(() => contactRoleFilter() === "all"
    ? contacts()
    : contacts().filter((contact) => (contact.roles ?? []).includes(contactRoleFilter())));
  const sharingRecipients = createMemo(() => members().filter((member) => member.user_id !== scope()?.member_user_id));
  const selectedRecipientName = createMemo(() => sharingRecipients().find((member) => member.user_id === selectedRecipient())?.display_name ?? "your partner");
  const selectedContactDrafts = createMemo(() => buildWeddingSharedContactDrafts(
    contacts(),
    selectedContactIds(),
    sharedContactFields(),
  ));

  async function refreshMembers() {
    try {
      const [response, sharedContacts] = await Promise.all([
        listWeddingPartnerMembers(props.metadata.weddingPlanId, props.metadata.responseWorkspaceId),
        listWeddingSharedContacts(props.metadata.weddingPlanId, props.metadata.responseWorkspaceId),
      ]);
      setMembers(response.members);
      setInvites(response.invites ?? []);
      setScope(response.scope);
      setSharedWithMe(sharedContacts.contacts);
      setSharedByMe(sharedContacts.shared_by_me ?? []);
      const recipient = response.members.find((member) => member.user_id !== response.scope.member_user_id);
      if (recipient && !selectedRecipient()) setSelectedRecipient(recipient.user_id);
    } catch {
      // The plan may not have a sharing membership until its first invitation.
    }
  }

  onMount(() => void refreshMembers());

  function roleLabel(role: WeddingCollaboratorRole): string {
    return props.state.roleAssignmentOptions.find((option) => option.role === role)?.title ?? role;
  }

  async function addDraftAssignment() {
    const name = personName().trim();
    const email = personEmail().trim();
    if (!email || selectedRole() !== "co_owner") {
      setSharingNotice("Partner sharing currently requires an email and the Co-owner role. Other helper roles remain private drafts.");
      return;
    }
    const role = selectedRole();
    setBusy(true);
    setSharingNotice(null);
    try {
      const result = await inviteWeddingPartner({
        weddingPlanId: props.metadata.weddingPlanId,
        responseWorkspaceId: props.metadata.responseWorkspaceId,
        email,
      });
      setSharingNotice(result.delivered
        ? "Invitation sent. The partner must sign in with that exact email before the Wedding plan is shared."
        : `Invitation created but email delivery needs retry. Copy this private link: ${result.invite_url}`);
      await refreshMembers();
    } catch (error) {
      setSharingNotice(error instanceof Error ? error.message : "The invitation could not be sent.");
      setBusy(false);
      return;
    }
    setDraftAssignments((current) => [
      ...current,
      {
        id: `wedding-role-${Date.now()}-${current.length}`,
        name: name || email,
        email,
        role,
        roleLabel: roleLabel(role),
      },
    ]);
    setPersonName("");
    setPersonEmail("");
    setBusy(false);
  }

  function toggleContact(contactId: string) {
    setReviewingContacts(false);
    setSelectedContactIds((current) => current.includes(contactId)
      ? current.filter((id) => id !== contactId)
      : [...current, contactId]);
  }

  function setSharedContactField(field: keyof WeddingSharedContactFieldSelection, value: boolean) {
    setReviewingContacts(false);
    setSharedContactFields((current) => ({ ...current, [field]: value }));
  }

  async function shareSelectedContacts() {
    const recipient = selectedRecipient();
    if (!recipient || selectedContactIds().length === 0) return;
    setBusy(true);
    setSharingNotice(null);
    try {
      const drafts = selectedContactDrafts();
      for (const draft of drafts) {
        await shareWeddingContact({
          weddingPlanId: props.metadata.weddingPlanId,
          responseWorkspaceId: props.metadata.responseWorkspaceId,
          recipientUserId: recipient,
          contactRef: draft.contactRef,
          contact: draft.contact,
        });
      }
      setSelectedContactIds([]);
      setReviewingContacts(false);
      setSharingNotice(`${drafts.length} selected contact${drafts.length === 1 ? "" : "s"} shared with this partner. Unselected fields and other contacts remain private.`);
      await refreshMembers();
    } catch (error) {
      setSharingNotice(error instanceof Error ? error.message : "The selected contacts could not be shared.");
    } finally {
      setBusy(false);
    }
  }

  async function revokeSharedContact(grant: WeddingSharedContact) {
    if (!window.confirm(`Stop sharing ${grant.contact.name} with ${grant.recipient_display_name}?`)) return;
    setBusy(true);
    setSharingNotice(null);
    try {
      const result = await revokeWeddingSharedContact(
        props.metadata.weddingPlanId,
        props.metadata.responseWorkspaceId,
        grant.share_id,
      );
      setSharingNotice(result.revoked
        ? `${grant.contact.name} is no longer shared with ${grant.recipient_display_name}.`
        : "That contact snapshot was already revoked.");
      await refreshMembers();
    } catch (error) {
      setSharingNotice(error instanceof Error ? error.message : "The shared contact could not be revoked.");
    } finally {
      setBusy(false);
    }
  }

  async function removePartner(member: WeddingPartnerMember) {
    if (!window.confirm(`Remove ${member.display_name} from this Wedding plan? Their personal account and private data will not be deleted.`)) return;
    setBusy(true);
    setSharingNotice(null);
    try {
      const result = await revokeWeddingPartner(
        props.metadata.weddingPlanId,
        props.metadata.responseWorkspaceId,
        member.user_id,
      );
      setSharingNotice(result.revoked ? `${member.display_name} no longer has access to this Wedding plan.` : "That partner was already removed.");
      await refreshMembers();
    } catch (error) {
      setSharingNotice(error instanceof Error ? error.message : "The partner could not be removed.");
    } finally {
      setBusy(false);
    }
  }

  async function leavePlan() {
    if (!window.confirm("Leave this shared Wedding plan? Your personal account and private data will remain available.")) return;
    setBusy(true);
    setSharingNotice(null);
    try {
      const result = await leaveWeddingPartnerPlan(
        props.metadata.weddingPlanId,
        props.metadata.responseWorkspaceId,
      );
      setSharingNotice(result.left ? "You have left this Wedding plan. Your personal account was not changed." : "You had already left this plan.");
      await refreshMembers();
    } catch (error) {
      setSharingNotice(error instanceof Error ? error.message : "The plan could not be left.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="min-w-0 rounded-[24px] border border-sky-100/80 bg-sky-50/80 p-3 shadow-card sm:rounded-[28px] sm:p-4">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2">
          <p class="text-base font-semibold text-sky-950">Share the plan</p>
          <WeddingInfoTip title="Sharing tip" tone="sky">
            Start with the smallest useful access. Give helpers logistics access, give family suggestion access, and keep budget notes private unless you choose to share them.
          </WeddingInfoTip>
        </div>
        <span class="max-w-full break-words rounded-full bg-white/80 px-2 py-1 text-xs font-semibold text-sky-900">
          {props.state.statusLabel}
        </span>
      </div>
      <p class="mt-2 text-sm leading-6 text-sky-900/75">{props.state.summaryLabel}</p>
      <p class="mt-2 rounded-2xl border border-sky-100 bg-white/75 px-3 py-2 text-xs leading-5 text-sky-950/75">
        A partner gets equal access to this Wedding plan only. Your personal contacts, diary, chats, files, databases and AI memory stay in your own account unless you explicitly share an item.
      </p>
      <section class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3" aria-label="Partner collaboration steps">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm font-semibold text-sky-950">Plan together, one step at a time</p>
          <span class="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-900">{journey().actionLabel}</span>
        </div>
        <ol class="mt-2 grid gap-2 md:grid-cols-3">
          <li class="rounded-xl border border-sky-100 bg-sky-50/60 p-2 text-xs leading-5 text-sky-950/75"><strong class="block text-sky-950">Current</strong>{journey().currentStep}</li>
          <li class="rounded-xl border border-sky-100 bg-sky-50/60 p-2 text-xs leading-5 text-sky-950/75"><strong class="block text-sky-950">Next</strong>{journey().nextStep}</li>
          <li class="rounded-xl border border-sky-100 bg-sky-50/60 p-2 text-xs leading-5 text-sky-950/75"><strong class="block text-sky-950">Then</strong>{journey().followingStep}</li>
        </ol>
      </section>
      <Show when={members().length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-sky-950">People sharing this Wedding</p>
          <div class="mt-2 space-y-2">
            <For each={members()}>
              {(member) => (
                <div class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-100 bg-sky-50/60 px-3 py-2">
                  <div>
                    <p class="text-xs font-semibold text-sky-950">{member.display_name}</p>
                    <p class="text-xs text-sky-950/65">{member.role === "owner" ? "Plan owner" : "Partner"}</p>
                  </div>
                  <Show when={scope()?.role === "owner" && member.role === "co_owner"}>
                    <button type="button" class="rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-950 disabled:opacity-50" disabled={busy()} onClick={() => void removePartner(member)}>
                      Remove access
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
          <Show when={scope()?.role === "co_owner"}>
            <button type="button" class="mt-3 rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-950 disabled:opacity-50" disabled={busy()} onClick={() => void leavePlan()}>
              Leave this Wedding plan
            </button>
          </Show>
        </div>
      </Show>
      <Show when={scope()?.role === "owner" && invites().length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-sky-950">Partner invitation history</p>
          <p class="mt-1 text-xs leading-5 text-sky-950/70">Email addresses are deliberately not retained here. Expired links never grant access; send a fresh invitation only after confirming the recipient.</p>
          <div class="mt-2 space-y-2">
            <For each={invites()}>
              {(invite) => {
                const label = () => invite.status === "pending"
                  ? "Awaiting response"
                  : invite.status === "accepted"
                    ? "Accepted"
                    : invite.status === "expired"
                      ? "Expired — no access granted"
                      : "Revoked — no access granted";
                return (
                  <div class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-100 bg-sky-50/60 px-3 py-2">
                    <div>
                      <p class="text-xs font-semibold text-sky-950">{label()}</p>
                      <p class="text-[11px] text-sky-950/65">
                        Created {new Date(invite.created_at).toLocaleDateString()} · expires {new Date(invite.expires_at).toLocaleDateString()}
                      </p>
                    </div>
                    <span class={`rounded-full px-2 py-1 text-[11px] font-semibold ${invite.status === "pending" ? "bg-amber-100 text-amber-900" : invite.status === "accepted" ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-700"}`}>
                      {invite.status}
                    </span>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
      <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
        <p class="text-sm font-semibold text-sky-950">Add someone</p>
        <p class="mt-1 text-xs leading-5 text-sky-950/70">
          Choose a contact or type a name, then pick what they can help with.
        </p>
        <div class="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <label class="text-xs font-semibold text-sky-950">
            Name or contact
            <input
              class="mt-1 w-full rounded-full border border-sky-100 bg-white px-3 py-2 text-xs font-medium text-sky-950 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              value={personName()}
              onInput={(event) => setPersonName(event.currentTarget.value)}
              placeholder="Alex, Sam, Mum..."
            />
          </label>
          <label class="text-xs font-semibold text-sky-950">
            Partner email
            <input
              class="mt-1 w-full rounded-full border border-sky-100 bg-white px-3 py-2 text-xs font-medium text-sky-950 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              value={personEmail()}
              onInput={(event) => setPersonEmail(event.currentTarget.value)}
              placeholder="name@example.com"
            />
          </label>
          <label class="text-xs font-semibold text-sky-950">
            Role
            <select
              class="mt-1 w-full rounded-full border border-sky-100 bg-white px-3 py-2 text-xs font-medium text-sky-950 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
              value={selectedRole()}
              onChange={(event) => setSelectedRole(event.currentTarget.value as WeddingCollaboratorRole)}
            >
              <For each={props.state.roleAssignmentOptions}>
                {(role) => <option value={role.role}>{role.title}</option>}
              </For>
            </select>
          </label>
        </div>
        <div class="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="rounded-full bg-sky-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy() || scope()?.role === "co_owner" || members().some((member) => member.role === "co_owner") || !personEmail().trim()}
            data-magic-action="invite"
            data-magic-icon="person-add"
            data-magic-label="Add person"
            data-magic-id="wedding:collaboration:add-person"
            onClick={() => void addDraftAssignment()}
          >
            {busy() ? "Sending…" : members().some((member) => member.role === "co_owner") ? "Partner already added" : "Send partner invite"}
          </button>
          <span class="text-xs leading-5 text-sky-950/60">
            Send the invite after you review their role.
          </span>
        </div>
        <Show when={sharingNotice()}>
          <p class="mt-2 break-words rounded-2xl border border-sky-100 bg-white px-3 py-2 text-xs leading-5 text-sky-950" role="status">{sharingNotice()}</p>
        </Show>
        <Show when={draftAssignments().length > 0}>
          <div class="mt-3 space-y-2">
            <For each={draftAssignments()}>
              {(assignment) => (
                <div class="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-sky-100 bg-sky-50/70 px-3 py-2">
                  <div class="min-w-0">
                    <p class="break-words text-xs font-semibold text-sky-950">{assignment.name}</p>
                    <p class="break-words text-xs leading-5 text-sky-950/65">
                      {assignment.roleLabel}{assignment.email ? ` - ${assignment.email}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="rounded-full border border-sky-100 bg-white px-2 py-1 text-[11px] font-semibold text-sky-950"
                    data-magic-action="revoke"
                    data-magic-icon="remove"
                    data-magic-label={`Remove ${assignment.name}`}
                    data-magic-id={`wedding:collaboration:draft:${assignment.id}:remove`}
                    onClick={() => setDraftAssignments((current) => current.filter((item) => item.id !== assignment.id))}
                  >
                    Remove
                  </button>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
      <Show when={sharingRecipients().length > 0 && contacts().length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-sky-950">Share selected contacts</p>
          <p class="mt-1 text-xs leading-5 text-sky-950/70">Contacts stay in your account unless you select them here. Review the recipient, contacts and exact fields before confirming.</p>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <label class="text-xs font-semibold text-sky-950">Partner
              <select class="mt-1 w-full rounded-full border border-sky-100 bg-white px-3 py-2" value={selectedRecipient()} onChange={(event) => { setSelectedRecipient(event.currentTarget.value); setReviewingContacts(false); }}>
                <For each={sharingRecipients()}>
                  {(member) => <option value={member.user_id}>{member.display_name}</option>}
                </For>
              </select>
            </label>
            <label class="text-xs font-semibold text-sky-950">Contact role
              <select class="mt-1 w-full rounded-full border border-sky-100 bg-white px-3 py-2" value={contactRoleFilter()} onChange={(event) => setContactRoleFilter(event.currentTarget.value)}>
                <option value="all">All roles</option>
                <For each={contactRoles()}>{(role) => <option value={role}>{role}</option>}</For>
              </select>
            </label>
          </div>
          <fieldset class="mt-3 rounded-2xl border border-sky-100 bg-sky-50/60 p-3">
            <legend class="px-1 text-xs font-semibold text-sky-950">Fields to include</legend>
            <div class="flex flex-wrap gap-x-4 gap-y-2 text-xs text-sky-950">
              <span class="font-semibold">Name (required)</span>
              <For each={([
                ["email", "Email"],
                ["phone", "Phone"],
                ["relationship", "Relationship"],
                ["roles", "Wedding roles"],
              ] as const)}>
                {([field, label]) => (
                  <label class="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={sharedContactFields()[field]}
                      onChange={(event) => setSharedContactField(field, event.currentTarget.checked)}
                    />
                    {label}
                  </label>
                )}
              </For>
            </div>
            <p class="mt-2 text-[11px] leading-5 text-sky-950/65">Private notes, agent IDs and unselected fields never cross this sharing boundary.</p>
          </fieldset>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <For each={visibleContacts()}>
              {(contact) => (
                <label class="flex items-start gap-2 rounded-2xl border border-sky-100 bg-sky-50/60 p-2 text-xs text-sky-950">
                  <input type="checkbox" checked={selectedContactIds().includes(contact.id)} onChange={() => toggleContact(contact.id)} />
                  <span><strong>{contact.name}</strong><br /><span class="text-sky-950/65">{(contact.roles ?? [contact.relationshipKind]).join(", ")}</span></span>
                </label>
              )}
            </For>
          </div>
          <Show when={!reviewingContacts()}>
            <button type="button" class="mt-3 rounded-full bg-sky-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={busy() || !selectedRecipient() || selectedContactDrafts().length === 0} onClick={() => setReviewingContacts(true)}>
              Review before sharing
            </button>
          </Show>
          <Show when={reviewingContacts()}>
            <div class="mt-3 rounded-2xl border border-sky-200 bg-white p-3" role="region" aria-label="Contact sharing review">
              <p class="text-sm font-semibold text-sky-950">Confirm what {selectedRecipientName()} will receive</p>
              <p class="mt-1 text-xs leading-5 text-sky-950/70">This creates Wedding-only snapshots. It does not copy your private contact list.</p>
              <div class="mt-2 grid gap-2 sm:grid-cols-2">
                <For each={selectedContactDrafts()}>
                  {(draft) => (
                    <article class="rounded-2xl border border-sky-100 bg-sky-50/60 p-3 text-xs text-sky-950">
                      <p class="font-semibold">{draft.contact.name}</p>
                      <Show when={draft.contact.email}><p class="mt-1 break-all">{draft.contact.email}</p></Show>
                      <Show when={draft.contact.phone}><p class="mt-1">{draft.contact.phone}</p></Show>
                      <Show when={draft.contact.relationshipKind}><p class="mt-1">Relationship: {draft.contact.relationshipKind}</p></Show>
                      <Show when={(draft.contact.roles?.length ?? 0) > 0}><p class="mt-1">Roles: {draft.contact.roles?.join(", ")}</p></Show>
                      <p class="mt-2 text-[11px] text-sky-950/65">Included: {draft.includedFieldLabels.join(", ")}</p>
                      <Show when={draft.privateFieldLabels.length > 0}><p class="mt-1 text-[11px] text-sky-950/65">Stays private: {draft.privateFieldLabels.join(", ")}</p></Show>
                    </article>
                  )}
                </For>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button type="button" class="rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-950" disabled={busy()} onClick={() => setReviewingContacts(false)}>Back</button>
                <button type="button" class="rounded-full bg-sky-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" disabled={busy() || selectedContactDrafts().length === 0} onClick={() => void shareSelectedContacts()}>
                  {busy() ? "Sharing…" : `Confirm share with ${selectedRecipientName()}`}
                </button>
              </div>
            </div>
          </Show>
        </div>
      </Show>
      <Show when={sharedByMe().length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-sky-950">Contacts you shared</p>
          <p class="mt-1 text-xs leading-5 text-sky-950/70">Each snapshot names its recipient. Revoke it here without deleting the source contact from your account.</p>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <For each={sharedByMe()}>
              {(grant) => (
                <article class="rounded-2xl border border-sky-100 bg-sky-50/60 p-3 text-xs text-sky-950">
                  <p class="font-semibold">{grant.contact.name}</p>
                  <p class="mt-1 text-sky-950/65">Shared by {grant.shared_by_display_name} with {grant.recipient_display_name}</p>
                  <p class="mt-1 text-sky-950/65">Fields: {[grant.contact.email ? "email" : null, grant.contact.phone ? "phone" : null, grant.contact.relationship_kind ? "relationship" : null, grant.contact.roles.length > 0 ? "roles" : null].filter(Boolean).join(", ") || "name only"}</p>
                  <button type="button" class="mt-2 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-950 disabled:opacity-50" disabled={busy()} onClick={() => void revokeSharedContact(grant)}>Stop sharing</button>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>
      <Show when={sharedWithMe().length > 0}>
        <div class="mt-3 rounded-2xl border border-sky-100 bg-white/75 p-3">
          <p class="text-sm font-semibold text-sky-950">Contacts shared with you</p>
          <p class="mt-1 text-xs leading-5 text-sky-950/70">
            These contacts were shared for this Wedding plan only. They have not been copied into your private contact list.
          </p>
          <div class="mt-3 grid gap-2 sm:grid-cols-2">
            <For each={sharedWithMe()}>
              {(grant) => (
                <article class="rounded-2xl border border-sky-100 bg-sky-50/60 p-3 text-xs text-sky-950">
                  <p class="font-semibold">{grant.contact.name}</p>
                  <p class="mt-1 text-sky-950/65">Shared by {grant.shared_by_display_name} with {grant.recipient_display_name}</p>
                  <Show when={grant.contact.roles.length > 0 || grant.contact.relationship_kind}>
                    <p class="mt-1 text-sky-950/65">
                      {[...grant.contact.roles, grant.contact.relationship_kind].filter(Boolean).join(", ")}
                    </p>
                  </Show>
                  <Show when={grant.contact.email}>
                    <a class="mt-2 block break-all font-semibold text-sky-900 underline" href={`mailto:${grant.contact.email}`}>{grant.contact.email}</a>
                  </Show>
                  <Show when={grant.contact.phone}>
                    <a class="mt-1 block font-semibold text-sky-900 underline" href={`tel:${grant.contact.phone?.replace(/[^+\d]/g, "")}`}>{grant.contact.phone}</a>
                  </Show>
                </article>
              )}
            </For>
          </div>
        </div>
      </Show>
      <div class="mt-3 flex flex-wrap gap-1.5">
        <For each={props.state.roleAssignmentOptions}>
          {(role) => (
            <span
              class="max-w-full break-words rounded-full border border-sky-100 bg-white/80 px-2 py-1 text-xs font-semibold text-sky-950/75"
              title={role.hoverHelpLabel}
            >
              {role.title}
            </span>
          )}
        </For>
      </div>
      <details class="mt-3 rounded-2xl border border-sky-100 bg-white/70 p-3">
        <summary class="cursor-pointer text-xs font-semibold text-sky-950/70 outline-none focus-visible:ring-2 focus-visible:ring-sky-300">
          What people can do
        </summary>
        <div class="mt-2 space-y-2">
          <For each={props.state.roleAssignmentOptions}>
            {(role) => (
              <article class="rounded-2xl border border-sky-100 bg-sky-50/70 p-2" title={role.hoverHelpLabel}>
                <div class="flex items-start justify-between gap-2">
                  <p class="text-xs font-semibold text-sky-950">{role.title}</p>
                  <button
                    type="button"
                    class="rounded-full border border-sky-100 bg-white/85 px-2 py-1 text-[10px] font-semibold text-sky-950 transition hover:border-sky-200 hover:bg-white"
                    data-magic-action="open"
                    data-magic-icon="access"
                    data-magic-label={openRole() === role.role ? "Hide details" : "Show details"}
                    data-magic-id={`wedding:collaboration:role:${role.role}:details`}
                    onClick={() => setOpenRole(openRole() === role.role ? null : role.role)}
                  >
                    {openRole() === role.role ? "Hide details" : "Show details"}
                  </button>
                </div>
                <p class="mt-1 text-xs leading-5 text-sky-950/70">{role.summaryLabel}</p>
                <p class="mt-1 text-xs leading-5 text-sky-950/60">{role.hoverHelpLabel}</p>
                <button
                  type="button"
                  class="mt-1 text-left text-xs font-semibold leading-5 text-sky-900 underline decoration-sky-300 underline-offset-2"
                  data-magic-action="open"
                  data-magic-icon="access"
                  data-magic-label={role.mobileDisclosureLabel}
                  data-magic-id={`wedding:collaboration:role:${role.role}:mobile-details`}
                  onClick={() => setOpenRole(openRole() === role.role ? null : role.role)}
                >
                  {role.mobileDisclosureLabel}
                </button>
                <Show when={openRole() === role.role}>
                  <div class="mt-2 rounded-2xl border border-sky-100 bg-white/80 p-2">
                    <p class="text-xs font-semibold text-sky-950/70">Can do</p>
                    <ul class="mt-1 space-y-1">
                      <For each={role.capabilityLabels}>
                        {(label) => <li class="text-xs leading-5 text-sky-950/70">{label}</li>}
                      </For>
                    </ul>
                    <Show when={role.restrictionLabels.length > 0}>
                      <p class="mt-2 text-xs font-semibold text-sky-950/70">Limits</p>
                      <ul class="mt-1 space-y-1">
                        <For each={role.restrictionLabels}>
                          {(label) => <li class="text-xs leading-5 text-sky-950/65">{label}</li>}
                        </For>
                      </ul>
                    </Show>
                  </div>
                </Show>
              </article>
            )}
          </For>
        </div>
      </details>
      <div class="mt-3 space-y-2">
        <For each={props.state.editingSurfaces.slice(0, 3)}>
          {(surface) => (
            <article class="rounded-2xl border border-sky-100 bg-white/75 p-3">
              <p class="break-words text-xs font-semibold text-sky-950">{surface.title}</p>
              <p class="mt-1 text-xs leading-5 text-sky-900/70">{surface.summaryLabel}</p>
              <p class="mt-2 text-xs leading-5 text-sky-950/65">
                Can edit: {surface.editorRoleLabels.join(", ")}
              </p>
            </article>
          )}
        </For>
      </div>
      <div class="mt-3 rounded-2xl border border-sky-100 bg-white/70 p-3">
        <p class="text-xs font-semibold text-sky-950/70">Access check</p>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <For each={props.state.permissionProofCards}>
            {(permission) => (
              <span class={`max-w-full break-words rounded-full border px-2 py-1 text-xs font-semibold ${
                permission.allowed
                  ? "border-emerald-100 bg-emerald-50 text-emerald-900"
                  : "border-sky-100 bg-sky-50 text-sky-950/70"
              }`}>
                {permission.statusLabel}: {permission.requiredRoleLabels.join("/")}
              </span>
            )}
          </For>
        </div>
      </div>
      <Show when={props.state.invites.length > 0} fallback={
        <p class="mt-3 rounded-2xl border border-sky-100 bg-white/70 px-3 py-2 text-sm leading-6 text-sky-950/75">
          Invite partner as co-owner, planner with planning access, contributors for assigned tasks, or viewers for approved read-only files.
        </p>
      }>
        <div class="mt-3 space-y-2">
          <For each={props.state.invites.slice(0, 4)}>
            {(invite) => (
              <article class="rounded-2xl border border-sky-100 bg-white/75 p-3">
                <div class="flex items-start justify-between gap-2">
                  <p class="break-words text-xs font-semibold text-sky-950">{invite.displayName}</p>
                  <span class="max-w-full break-words rounded-full bg-sky-50 px-2 py-1 text-xs text-sky-900">
                    {invite.readyForInvite ? "Ready" : "Add details"}
                  </span>
                </div>
                <p class="mt-1 text-xs leading-5 text-sky-900/75">
                  {invite.roleLabel} - {invite.email || "email needed"}
                </p>
                <details class="mt-2 rounded-2xl border border-sky-100 bg-sky-50/70 px-2.5 py-2">
                  <summary
                    class="cursor-pointer text-xs font-semibold text-sky-950 outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
                    title={`${invite.roleLabel}: ${invite.roleSummaryLabel}`}
                  >
                    What this role can do
                  </summary>
                  <p class="mt-1 text-xs leading-5 text-sky-950/70">{invite.roleSummaryLabel}</p>
                  <ul class="mt-2 space-y-1">
                    <For each={invite.roleCapabilityLabels.slice(0, 3)}>
                      {(label) => <li class="text-xs leading-5 text-sky-950/65">{label}</li>}
                    </For>
                  </ul>
                  <Show when={invite.roleRestrictionLabels.length > 0}>
                    <p class="mt-2 text-xs font-semibold text-sky-950/70">Limits</p>
                    <ul class="mt-1 space-y-1">
                      <For each={invite.roleRestrictionLabels.slice(0, 2)}>
                        {(label) => <li class="text-xs leading-5 text-sky-950/65">{label}</li>}
                      </For>
                    </ul>
                  </Show>
                </details>
                <p class="mt-1 text-xs leading-5 text-sky-950/65">
                  {invite.lifecycleLabel} - {invite.nextActionLabel}
                </p>
                <Show when={invite.riskLabels.length > 0}>
                  <ul class="mt-2 space-y-1">
                    <For each={invite.riskLabels}>
                      {(label) => <li class="text-xs leading-5 text-sky-950/65">{label}</li>}
                    </For>
                  </ul>
                </Show>
              </article>
            )}
          </For>
        </div>
      </Show>
      <Show when={props.state.blockerLabels.length > 0}>
        <ul class="mt-3 space-y-1">
          <For each={props.state.blockerLabels.slice(0, 4)}>
            {(label) => <li class="text-xs leading-5 text-sky-950/65">{label}</li>}
          </For>
        </ul>
      </Show>
    </div>
  );
}
