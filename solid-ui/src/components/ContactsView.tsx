// @locs-version: 1.0
import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { postAgentMessage, readSession } from "@/lib/api";
import type { ResponseQueueRelationship } from "@/lib/responseQueuePolicy";
import { EmptyState } from "@/components/EmptyState";
import { ContactEditControls } from "@/components/ContactEditControls";
import { ContactImportControls } from "@/components/ContactImportControls";
import { ContactRoleChips, ContactRoleInput } from "@/components/ContactRoleControls";
import {
  contactStorageEventMatchesUser,
  loadContacts,
  saveContacts,
  subscribeContactsChangedEvent,
  type Contact,
} from "@/lib/contactsLocalState";
import { findDuplicateContact, replaceContact } from "@/lib/contactManagementState";
import { removeContactRole } from "@/lib/contactRoleState";
import {
  buildContactsFailureReceipt,
  type ContactsFailureReceipt,
} from "@/lib/contactsFailureState";
import {
  buildContactImportState,
  type ContactImportSource,
} from "@/lib/contactImportState";
import { buildContactEngagementState } from "@/lib/contactEngagementState";
import { buildContactFollowUpQueueState } from "@/lib/contactFollowUpQueueState";
import {
  applyContactFollowUpOutcome,
  type ContactFollowUpOutcome,
} from "@/lib/contactFollowUpOutcomeState";
import {
  buildContactFollowUpOutcomeProjectionState,
  runContactFollowUpOutcomeDispatch,
  type ContactFollowUpOutcomeDispatchReceipt,
} from "@/lib/contactFollowUpOutcomeProjectionState";
import { buildContactFollowUpTaskProjectionState } from "@/lib/contactFollowUpTaskProjectionState";
import { applyContactResponseSummary } from "@/lib/contactResponseSummaryState";
import {
  buildContactResponseEvidenceProjectionState,
  runContactResponseEvidenceDispatch,
  type ContactResponseEvidenceDispatchReceipt,
} from "@/lib/contactResponseEvidenceProjectionState";
import { buildContactOutreachHealthState } from "@/lib/contactOutreachHealthState";
import {
  buildContactOutreachHealthProjectionState,
  runContactOutreachHealthDispatch,
  type ContactOutreachHealthDispatchReceipt,
} from "@/lib/contactOutreachHealthProjectionState";
import {
  runContactFollowUpTaskDispatch,
  type ContactFollowUpTaskDispatchReceipt,
} from "@/lib/contactFollowUpTaskDispatchState";

export function ContactsView() {
  const sessionUserId = readSession()?.user?.id ?? null;
  const [contacts, setContacts] = createSignal<Contact[]>(loadContacts(sessionUserId));
  const [filter, setFilter] = createSignal("");
  const [showAdd, setShowAdd] = createSignal(false);
  const [showImport, setShowImport] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [newEmail, setNewEmail] = createSignal("");
  const [newPhone, setNewPhone] = createSignal("");
  const [newRelationshipKind, setNewRelationshipKind] = createSignal<ResponseQueueRelationship>("other");
  const [newRoles, setNewRoles] = createSignal<string[]>([]);
  const [newResponseSlaHours, setNewResponseSlaHours] = createSignal("24");
  const [busy, setBusy] = createSignal(false);
  const [syncFailure, setSyncFailure] = createSignal<ContactsFailureReceipt | null>(null);
  const [importSource, setImportSource] = createSignal<ContactImportSource>("gmail");
  const [importText, setImportText] = createSignal("");
  const [importRoles, setImportRoles] = createSignal<string[]>([]);
  const [importNotice, setImportNotice] = createSignal<string | null>(null);
  const [savingFollowUpTasks, setSavingFollowUpTasks] = createSignal(false);
  const [followUpTaskReceipt, setFollowUpTaskReceipt] = createSignal<ContactFollowUpTaskDispatchReceipt | null>(null);
  const [followUpTaskRevision, setFollowUpTaskRevision] = createSignal(0);
  const [savingResponseEvidence, setSavingResponseEvidence] = createSignal(false);
  const [responseEvidenceReceipt, setResponseEvidenceReceipt] = createSignal<ContactResponseEvidenceDispatchReceipt | null>(null);
  const [responseEvidenceRevision, setResponseEvidenceRevision] = createSignal(0);
  const [savingFollowUpOutcome, setSavingFollowUpOutcome] = createSignal(false);
  const [followUpOutcomeReceipt, setFollowUpOutcomeReceipt] = createSignal<ContactFollowUpOutcomeDispatchReceipt | null>(null);
  const [followUpOutcomeRevision, setFollowUpOutcomeRevision] = createSignal(0);
  const [savingOutreachHealth, setSavingOutreachHealth] = createSignal(false);
  const [outreachHealthReceipt, setOutreachHealthReceipt] = createSignal<ContactOutreachHealthDispatchReceipt | null>(null);
  const [outreachHealthRevision, setOutreachHealthRevision] = createSignal(0);
  const [responseEditorContactId, setResponseEditorContactId] = createSignal<string | null>(null);
  const [responseDraft, setResponseDraft] = createSignal("");
  const [roleEditorContactId, setRoleEditorContactId] = createSignal<string | null>(null);
  const [contactEditorContactId, setContactEditorContactId] = createSignal<string | null>(null);
  const [contactNotice, setContactNotice] = createSignal<string | null>(null);
  const [responseSummariesEnabled, setResponseSummariesEnabled] = createSignal(
    contacts().some((contact) => contact.responseSummaryEnabled),
  );

  onMount(() => {
    const refreshContacts = () => {
      const next = loadContacts(sessionUserId);
      setContacts(next);
      setResponseSummariesEnabled(next.some((contact) => contact.responseSummaryEnabled));
    };
    const unsubscribe = subscribeContactsChangedEvent((detail) => {
      if ((detail.userId ?? null) !== (sessionUserId ?? null)) return;
      refreshContacts();
    });
    const handleStorage = (event: StorageEvent) => {
      if (contactStorageEventMatchesUser(event, sessionUserId)) refreshContacts();
    };
    window.addEventListener("storage", handleStorage);
    onCleanup(() => {
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
    });
  });
  const importState = () => buildContactImportState({
    source: importSource(),
    text: importText(),
    defaultRelationshipKind: "supplier",
    defaultRoles: importRoles(),
    existingContacts: contacts(),
  });
  const followUpQueue = () => buildContactFollowUpQueueState({ contacts: contacts() });
  const followUpTaskProjection = () => {
    followUpTaskRevision();
    return buildContactFollowUpTaskProjectionState({
      queue: followUpQueue(),
      storage: typeof localStorage === "undefined" ? null : localStorage,
      userId: sessionUserId,
    });
  };
  const responseEvidenceProjection = () => {
    responseEvidenceRevision();
    return buildContactResponseEvidenceProjectionState({
      contacts: contacts(),
      storage: typeof localStorage === "undefined" ? null : localStorage,
      userId: sessionUserId,
    });
  };
  const followUpOutcomeProjection = () => {
    followUpOutcomeRevision();
    return buildContactFollowUpOutcomeProjectionState({
      contacts: contacts(),
      storage: typeof localStorage === "undefined" ? null : localStorage,
      userId: sessionUserId,
    });
  };
  const outreachHealth = () => buildContactOutreachHealthState({
    contacts: contacts(),
    queue: followUpQueue(),
    taskProjection: followUpTaskProjection(),
    evidenceProjection: responseEvidenceProjection(),
    outcomeProjection: followUpOutcomeProjection(),
  });
  const outreachHealthProjection = () => {
    outreachHealthRevision();
    return buildContactOutreachHealthProjectionState({
      health: outreachHealth(),
      storage: typeof localStorage === "undefined" ? null : localStorage,
      userId: sessionUserId,
    });
  };

  async function addContact() {
    if (!newName().trim()) return;
    const duplicate = findDuplicateContact(contacts(), {
      name: newName(),
      email: newEmail(),
      phone: newPhone(),
    });
    if (duplicate) {
      setContactNotice(`${duplicate.contact.name} already looks like this contact. Open the existing contact to update roles or details.`);
      return;
    }
    setBusy(true);
    setSyncFailure(null);
    setContactNotice(null);
    const contact: Contact = {
      id: `contact-${Date.now()}`,
      name: newName().trim(),
      email: newEmail().trim() || undefined,
      phone: newPhone().trim() || undefined,
      relationshipKind: newRelationshipKind(),
      ...(newRoles().length > 0 ? { roles: newRoles() } : {}),
      responseSlaHours: Number(newResponseSlaHours()) || undefined,
    };

    try {
      await postAgentMessage({
        to: ["agent://master"],
        content: { kind: "contact_add", name: contact.name, email: contact.email, phone: contact.phone, roles: contact.roles ?? [] },
      });
    } catch (error: unknown) {
      setSyncFailure(
        buildContactsFailureReceipt(
          "Contact sync",
          error instanceof Error ? error.message : "Saved locally, but failed to sync contact to the agent.",
        ),
      );
    }

    const next = [...contacts(), contact];
    saveContacts(next, sessionUserId);
    setContacts(next);
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setNewRelationshipKind("other");
    setNewRoles([]);
    setNewResponseSlaHours("24");
    setShowAdd(false);
    setBusy(false);
  }

  function removeContact(id: string) {
    const next = contacts().filter((contact) => contact.id !== id);
    saveContacts(next, sessionUserId);
    setContacts(next);
  }

  function saveNextContacts(next: Contact[]) {
    saveContacts(next, sessionUserId);
    setContacts(next);
  }

  function updateContact(updated: Contact): boolean {
    const duplicate = findDuplicateContact(contacts(), updated, updated.id);
    if (duplicate) {
      setContactNotice(`${duplicate.contact.name} already uses those contact details. Update that contact instead, or use a different email or phone number.`);
      return false;
    }
    setContactNotice(null);
    saveNextContacts(replaceContact(contacts(), updated));
    return true;
  }

  function removeRoleFromContact(contact: Contact, role: string) {
    const nextRoles = removeContactRole(contact.roles, role);
    saveNextContacts(contacts().map((item) => item.id === contact.id ? {
      ...item,
      ...(nextRoles.length > 0 ? { roles: nextRoles } : { roles: undefined }),
    } : item));
  }

  function importContacts() {
    const state = importState();
    if (state.importableContacts.length === 0) {
      setImportNotice(state.aiHandoffRequired
        ? "This file needs AI extraction before contacts can be trusted. Ask the agent to extract contact rows from the selected file."
        : "No new contacts were found to import.");
      return;
    }
    saveNextContacts([...contacts(), ...state.importableContacts]);
    setImportNotice(`Imported ${state.importableContacts.length} contact${state.importableContacts.length === 1 ? "" : "s"}.`);
  }

  function toggleResponseSummaries(enabled: boolean) {
    setResponseSummariesEnabled(enabled);
    saveNextContacts(contacts().map((contact) => ({ ...contact, responseSummaryEnabled: enabled })));
  }

  function markContacted(contact: Contact, by: "user" | "agent") {
    saveNextContacts(contacts().map((item) => item.id === contact.id
      ? { ...item, lastContactedAt: new Date().toISOString(), lastContactedBy: by }
      : item));
  }

  function openResponseEditor(contact: Contact) {
    setResponseEditorContactId(contact.id);
    setResponseDraft(contact.lastResponseSummary ?? "");
  }

  function saveResponseSummary(contact: Contact) {
    const result = applyContactResponseSummary({
      contacts: contacts(),
      contactId: contact.id,
      summary: responseDraft(),
      respondedAt: new Date(),
      source: "user",
    });
    if (!result.updated) return;
    setResponseSummariesEnabled(true);
    saveNextContacts(result.contacts);
    setResponseEditorContactId(null);
    setResponseDraft("");
    setFollowUpTaskRevision((value) => value + 1);
    setResponseEvidenceRevision((value) => value + 1);
  }

  function recordFollowUpOutcome(contactId: string, outcome: ContactFollowUpOutcome, note?: string) {
    const result = applyContactFollowUpOutcome({
      contacts: contacts(),
      contactId,
      outcome,
      note,
      decidedAt: new Date(),
    });
    if (!result.updated) return;
    saveNextContacts(result.contacts);
    setFollowUpTaskRevision((value) => value + 1);
    setOutreachHealthRevision((value) => value + 1);
    setFollowUpOutcomeRevision((value) => value + 1);
  }

  async function saveFollowUpTasks() {
    const projection = followUpTaskProjection();
    if (projection.taskCount === 0) return;
    setSavingFollowUpTasks(true);
    try {
      const receipt = await runContactFollowUpTaskDispatch({
        projection,
        storage: typeof localStorage === "undefined" ? null : localStorage,
        userId: sessionUserId,
      });
      setFollowUpTaskReceipt(receipt);
      setFollowUpTaskRevision((value) => value + 1);
    } finally {
      setSavingFollowUpTasks(false);
    }
  }

  async function saveResponseEvidence() {
    const projection = responseEvidenceProjection();
    if (projection.evidenceCount === 0) return;
    setSavingResponseEvidence(true);
    try {
      const receipt = await runContactResponseEvidenceDispatch({
        projection,
        storage: typeof localStorage === "undefined" ? null : localStorage,
        userId: sessionUserId,
      });
      setResponseEvidenceReceipt(receipt);
      setResponseEvidenceRevision((value) => value + 1);
    } finally {
      setSavingResponseEvidence(false);
    }
  }

  async function saveFollowUpOutcomes() {
    const projection = followUpOutcomeProjection();
    if (projection.outcomeCount === 0) return;
    setSavingFollowUpOutcome(true);
    try {
      const receipt = await runContactFollowUpOutcomeDispatch({
        projection,
        storage: typeof localStorage === "undefined" ? null : localStorage,
        userId: sessionUserId,
      });
      setFollowUpOutcomeReceipt(receipt);
      setFollowUpOutcomeRevision((value) => value + 1);
      setOutreachHealthRevision((value) => value + 1);
    } finally {
      setSavingFollowUpOutcome(false);
    }
  }

  async function saveOutreachHealth() {
    const projection = outreachHealthProjection();
    if (projection.snapshotCount === 0) return;
    setSavingOutreachHealth(true);
    try {
      const receipt = await runContactOutreachHealthDispatch({
        projection,
        storage: typeof localStorage === "undefined" ? null : localStorage,
        userId: sessionUserId,
      });
      setOutreachHealthReceipt(receipt);
      setOutreachHealthRevision((value) => value + 1);
    } finally {
      setSavingOutreachHealth(false);
    }
  }

  const visible = () => {
    const q = filter().toLowerCase();
    if (!q) return contacts();
    return contacts().filter(
      (contact) => contact.name.toLowerCase().includes(q)
        || (contact.email ?? "").toLowerCase().includes(q)
        || (contact.phone ?? "").toLowerCase().includes(q)
        || contact.relationshipKind.toLowerCase().includes(q)
        || (contact.roles ?? []).some((role) => role.toLowerCase().includes(q)),
    );
  };

  return (
    <div class="min-w-0 animate-fade-in space-y-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0">
          <p class="font-mono text-[10px] uppercase tracking-[0.28em] text-outline">Contacts</p>
          <h2 class="mt-1 break-words text-xl font-bold text-on-surface">Your network</h2>
          <p class="mt-0.5 text-sm text-on-surface-variant">Agents, people, and organisations you interact with in this workspace.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd((v) => !v)}
          class="w-full rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-primary/80 sm:mt-2 sm:w-auto sm:py-1.5"
        >
          + Add
        </button>
      </div>

      <div class="rounded-2xl border border-sky-200/60 bg-sky-50/80 px-4 py-3 text-sm text-sky-900 shadow-sm">
        Contacts are currently <span class="font-semibold">stored locally in this workspace</span> and synced to the agent on a best-effort basis.
        If sync fails, your local contact list is still preserved here.
      </div>

      <div class="grid min-w-0 gap-3 rounded-2xl border border-emerald-200/70 bg-emerald-50/80 p-4 shadow-sm lg:grid-cols-[1fr_auto] lg:items-start">
        <div class="min-w-0">
          <p class="text-sm font-semibold text-emerald-950">Reach-out strength</p>
          <p class="mt-1 text-xs leading-5 text-emerald-900/75">
            Import contacts from Gmail/Google Contacts exports, contact files, or messy files for AI extraction. Contact cards can show whether you or the agent last contacted someone, plus a response summary only when enabled.
          </p>
          <div class="mt-3 min-w-0 rounded-2xl border border-emerald-200 bg-white/70 p-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="min-w-0 break-words text-xs font-semibold text-emerald-950">{outreachHealth().summaryLabel}</p>
              <span class="max-w-full rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-800 break-words">
                {outreachHealth().status.replace(/_/g, " ")}
              </span>
            </div>
            <p class="mt-1 break-words text-[11px] leading-4 text-emerald-900/75">{outreachHealth().nextActionLabel}</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <For each={outreachHealth().metricLabels.slice(0, 7)}>
                {(label) => (
                  <span class="max-w-full break-words rounded-full border border-emerald-100 bg-emerald-50/70 px-2 py-1 text-[10px] text-emerald-900/80">
                    {label}
                  </span>
                )}
              </For>
            </div>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void saveOutreachHealth()}
                disabled={savingOutreachHealth() || outreachHealthProjection().snapshotCount === 0}
                class="w-full rounded-full border border-emerald-200 bg-white/80 px-3 py-2 text-[10px] font-semibold text-emerald-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-1"
              >
                {savingOutreachHealth() ? "Saving health..." : "Save health snapshot"}
              </button>
              <span class="break-words text-[10px] text-emerald-900/65">{outreachHealthProjection().summaryLabel}</span>
            </div>
            <Show when={outreachHealthReceipt()}>
              {(receipt) => (
                <p classList={{
                  "mt-2 rounded-xl border px-3 py-2 text-[11px] leading-4": true,
                  "border-emerald-200 bg-emerald-50/80 text-emerald-800": receipt().failedCount === 0,
                  "border-rose-200 bg-rose-50/80 text-rose-800": receipt().failedCount > 0,
                }}>
                  {receipt().summaryLabel}
                </p>
              )}
            </Show>
          </div>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:justify-end">
          <button
            type="button"
            onClick={() => setShowImport((value) => !value)}
            class="rounded-full border border-emerald-200 bg-white/80 px-3 py-2 text-xs font-semibold text-emerald-950 transition hover:bg-white sm:py-1.5"
          >
            Import contacts
          </button>
          <label class="inline-flex items-center justify-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-2 text-xs font-semibold text-emerald-950 sm:justify-start sm:py-1.5">
            <input
              type="checkbox"
              checked={responseSummariesEnabled()}
              onChange={(event) => toggleResponseSummaries(event.currentTarget.checked)}
              class="h-4 w-4 rounded border-emerald-200 text-emerald-600"
            />
            Response summaries
          </label>
        </div>
      </div>

      <Show when={showImport()}>
        <ContactImportControls
          contacts={contacts()}
          importSource={importSource()}
          onImportSourceChange={setImportSource}
          importText={importText()}
          onImportTextChange={setImportText}
          importRoles={importRoles()}
          onImportRolesChange={setImportRoles}
          importState={importState()}
          onImportContacts={importContacts}
          importNotice={importNotice()}
          onImportNoticeChange={setImportNotice}
        />
      </Show>

      <Show when={showAdd()}>
        <div class="min-w-0 animate-fade-in space-y-2 rounded-2xl border border-white/50 bg-white/60 p-4 shadow-card">
          <p class="mb-1 font-mono text-[9px] uppercase tracking-[0.2em] text-outline">New Contact</p>
          <input
            type="text"
            placeholder="Name *"
            value={newName()}
            onInput={(e) => setNewName(e.currentTarget.value)}
            class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm outline-none transition focus:border-primary/50"
          />
          <input
            type="text"
            placeholder="Email or Agent ID (optional)"
            value={newEmail()}
            onInput={(e) => setNewEmail(e.currentTarget.value)}
            class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm outline-none transition focus:border-primary/50"
          />
          <input
            type="tel"
            placeholder="Phone (optional)"
            value={newPhone()}
            onInput={(e) => setNewPhone(e.currentTarget.value)}
            class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm outline-none transition focus:border-primary/50"
          />
          <div class="grid gap-2 sm:grid-cols-2">
            <label class="space-y-1">
              <span class="text-[11px] text-on-surface-variant/70">Follow-up type</span>
              <select
                value={newRelationshipKind()}
                onInput={(e) => setNewRelationshipKind(e.currentTarget.value as ResponseQueueRelationship)}
                class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm outline-none transition focus:border-primary/50"
              >
                <option value="other">Other</option>
                <option value="supplier">Supplier</option>
                <option value="client">Client</option>
                <option value="team">Team</option>
                <option value="friend">Friend</option>
              </select>
            </label>
            <label class="space-y-1">
              <span class="text-[11px] text-on-surface-variant/70">Reply SLA hours</span>
              <input
                type="number"
                min="1"
                max="336"
                value={newResponseSlaHours()}
                onInput={(e) => setNewResponseSlaHours(e.currentTarget.value)}
                class="w-full rounded-xl border border-white/40 bg-white/60 px-3 py-2 text-sm outline-none transition focus:border-primary/50"
              />
            </label>
          </div>
          <ContactRoleInput
            id="contact-role-options-new"
            contacts={contacts()}
            roles={newRoles()}
            onChange={setNewRoles}
            placeholder="Guest, parent, vendor, helper, custom role..."
            description="Use roles to mark wedding guests, family helpers, vendors, or any custom label. The contact can still be reused outside the wedding planner."
          />
          <div class="flex flex-col gap-2 pt-1 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setNewName("");
                setNewEmail("");
                setNewPhone("");
                setNewRelationshipKind("other");
                setNewRoles([]);
                setNewResponseSlaHours("24");
              }}
              class="flex-1 rounded-xl border border-outline/20 py-2.5 text-xs text-on-surface-variant transition hover:bg-on-surface/5 sm:py-2"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void addContact()}
              disabled={busy() || !newName().trim()}
              class="flex-1 rounded-xl bg-primary py-2.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-50 sm:py-2"
            >
              {busy() ? "Saving..." : "Add Contact"}
            </button>
          </div>
        </div>
      </Show>

      <Show when={contactNotice()}>
        {(notice) => (
          <div class="rounded-xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-xs text-amber-800 shadow-sm">
            {notice()}
          </div>
        )}
      </Show>

      <Show when={syncFailure()}>
        {(receipt) => (
          <div
            classList={{
              "rounded-xl border px-4 py-3 text-xs shadow-sm": true,
              "border-rose-200/70 bg-rose-50/80 text-rose-700": receipt().tone === "danger",
              "border-amber-200/60 bg-amber-50/80 text-amber-700": receipt().tone === "warning",
            }}
          >
            <p class="font-semibold">{receipt().title}</p>
            <p class="mt-1">{receipt().summary}</p>
            <p class="mt-1 opacity-90">{receipt().nextStep}</p>
          </div>
        )}
      </Show>

      <input
        type="text"
        placeholder="Find contacts by name, email, phone, role, or follow-up type..."
        value={filter()}
        onInput={(e) => setFilter(e.currentTarget.value)}
        class="w-full rounded-xl border border-white/35 bg-white/30 px-4 py-2 text-sm text-on-surface outline-none transition placeholder:text-on-surface-variant/40 focus:border-primary/40 focus:bg-white/50"
      />

      <div class="min-w-0 rounded-2xl border border-amber-200/70 bg-amber-50/80 p-4 shadow-sm">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-amber-950">Contact follow-up queue</p>
            <p class="mt-1 break-words text-xs leading-5 text-amber-900/75">{followUpQueue().summaryLabel}</p>
            <p class="mt-1 break-words text-[11px] leading-4 text-amber-900/70">{followUpQueue().nextActionLabel}</p>
          </div>
          <div class="w-full space-y-2 sm:w-auto">
            <div class="flex flex-wrap justify-end gap-1.5">
              <span class="max-w-full rounded-full border border-amber-200 bg-white/80 px-2 py-1 text-[10px] font-semibold text-amber-900 break-words">
                {followUpQueue().dueCount} due
              </span>
              <span class="max-w-full rounded-full border border-sky-200 bg-white/80 px-2 py-1 text-[10px] font-semibold text-sky-900 break-words">
                {followUpQueue().awaitingCount} waiting
              </span>
              <span class="max-w-full rounded-full border border-emerald-200 bg-white/80 px-2 py-1 text-[10px] font-semibold text-emerald-900 break-words">
                {followUpQueue().responseRecordedCount} replied
              </span>
              <span class="max-w-full rounded-full border border-indigo-200 bg-white/80 px-2 py-1 text-[10px] font-semibold text-indigo-900 break-words">
                {followUpTaskProjection().taskCount} task-ready
              </span>
            </div>
            <button
              type="button"
              onClick={() => void saveFollowUpTasks()}
              disabled={savingFollowUpTasks() || followUpTaskProjection().taskCount === 0}
              class="w-full rounded-full bg-amber-700 px-3 py-2 text-[11px] font-semibold text-white transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50 sm:py-1.5"
            >
              {savingFollowUpTasks() ? "Saving tasks..." : "Save follow-up tasks"}
            </button>
            <button
              type="button"
              onClick={() => void saveResponseEvidence()}
              disabled={savingResponseEvidence() || responseEvidenceProjection().evidenceCount === 0}
              class="w-full rounded-full border border-emerald-200 bg-white/80 px-3 py-2 text-[11px] font-semibold text-emerald-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:py-1.5"
            >
              {savingResponseEvidence() ? "Saving evidence..." : `Save response evidence (${responseEvidenceProjection().evidenceCount})`}
            </button>
            <button
              type="button"
              onClick={() => void saveFollowUpOutcomes()}
              disabled={savingFollowUpOutcome() || followUpOutcomeProjection().outcomeCount === 0}
              class="w-full rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-[11px] font-semibold text-slate-800 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:py-1.5"
            >
              {savingFollowUpOutcome() ? "Saving outcomes..." : `Save outcome evidence (${followUpOutcomeProjection().outcomeCount})`}
            </button>
          </div>
        </div>
        <p class="mt-2 break-words text-[11px] leading-4 text-amber-900/70">
          {followUpTaskProjection().summaryLabel}. External sends stay blocked until explicit approval.
        </p>
        <p class="mt-1 break-words text-[11px] leading-4 text-emerald-900/70">
          {responseEvidenceProjection().summaryLabel}. This saves user-entered reply evidence for Search, Knowledge Graph, Contacts, and DecisionOS.
        </p>
        <p class="mt-1 break-words text-[11px] leading-4 text-slate-700">
          {followUpOutcomeProjection().summaryLabel}. This records called, move-on, and unresponsive outcomes without sending external messages.
        </p>
        <Show when={followUpTaskReceipt()}>
          {(receipt) => (
            <p classList={{
              "mt-2 rounded-xl border px-3 py-2 text-[11px] leading-4": true,
              "border-emerald-200 bg-emerald-50/80 text-emerald-800": receipt().failedCount === 0,
              "border-rose-200 bg-rose-50/80 text-rose-800": receipt().failedCount > 0,
            }}>
              {receipt().summaryLabel}
            </p>
          )}
        </Show>
        <Show when={responseEvidenceReceipt()}>
          {(receipt) => (
            <p classList={{
              "mt-2 rounded-xl border px-3 py-2 text-[11px] leading-4": true,
              "border-emerald-200 bg-emerald-50/80 text-emerald-800": receipt().failedCount === 0,
              "border-rose-200 bg-rose-50/80 text-rose-800": receipt().failedCount > 0,
            }}>
              {receipt().summaryLabel}
            </p>
          )}
        </Show>
        <Show when={followUpOutcomeReceipt()}>
          {(receipt) => (
            <p classList={{
              "mt-2 rounded-xl border px-3 py-2 text-[11px] leading-4": true,
              "border-emerald-200 bg-emerald-50/80 text-emerald-800": receipt().failedCount === 0,
              "border-rose-200 bg-rose-50/80 text-rose-800": receipt().failedCount > 0,
            }}>
              {receipt().summaryLabel}
            </p>
          )}
        </Show>
        <Show when={followUpQueue().items.length > 0}>
          <div class="mt-3 grid gap-2 md:grid-cols-2">
            <For each={followUpQueue().items.slice(0, 4)}>
              {(item) => (
                <article class="min-w-0 rounded-2xl border border-amber-100 bg-white/80 p-3">
                  <div class="flex items-start justify-between gap-2">
                    <p class="min-w-0 break-words text-xs font-semibold text-amber-950">{item.title}</p>
                    <span class="max-w-full rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900 break-words">
                      {item.priority}
                    </span>
                  </div>
                  <p class="mt-1 break-words text-[11px] leading-4 text-amber-900/75">{item.reasonLabel}</p>
                  <p class="mt-1 break-words text-[10px] font-semibold uppercase tracking-wide text-amber-800">{item.escalationLabel}</p>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <For each={item.evidenceLabels.slice(0, 3)}>
                      {(label) => (
                        <span class="max-w-full break-words rounded-full border border-amber-100 bg-amber-50/70 px-2 py-1 text-[10px] text-amber-900/80">
                          {label}
                        </span>
                      )}
                    </For>
                  </div>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => recordFollowUpOutcome(item.contactId, "called", "User chose to call instead of sending another follow-up.")}
                      class="rounded-full border border-slate-200 bg-white/80 px-2.5 py-1.5 text-[10px] text-slate-700 transition hover:bg-white"
                    >
                      Mark called
                    </button>
                    <button
                      type="button"
                      onClick={() => recordFollowUpOutcome(item.contactId, "move_on", "User chose to move on from this contact.")}
                      class="rounded-full border border-sky-200 bg-sky-50/80 px-2.5 py-1.5 text-[10px] text-sky-700 transition hover:bg-sky-100"
                    >
                      Move on
                    </button>
                    <Show when={item.escalationStage === "mark_unresponsive"}>
                      <button
                        type="button"
                        onClick={() => recordFollowUpOutcome(item.contactId, "unresponsive", "No reply after the escalation window; review alternatives.")}
                        class="rounded-full border border-rose-200 bg-rose-50/80 px-2.5 py-1.5 text-[10px] text-rose-700 transition hover:bg-rose-100"
                      >
                        Mark unresponsive
                      </button>
                    </Show>
                  </div>
                </article>
              )}
            </For>
          </div>
        </Show>
      </div>

      <Show
        when={visible().length > 0}
        fallback={
          <Show
            when={filter().trim().length > 0}
            fallback={<EmptyState icon="CT" title="No contacts yet" body="Add people and agents you communicate with in this workspace." />}
          >
            <EmptyState icon="CT" title="No contacts match this filter" body="Try a broader name or email search." />
          </Show>
        }
      >
        <div class="grid justify-items-start gap-2 sm:grid-cols-2">
          <For each={visible()}>
            {(contact) => (
              <div class="group flex w-full min-w-0 items-start gap-3 rounded-2xl border border-white/50 bg-white/40 px-4 py-3 shadow-card">
                <div class="flex h-9 w-9 flex-shrink-0 select-none items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {contact.name.charAt(0).toUpperCase()}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="break-words text-sm font-medium text-on-surface">{contact.name}</p>
                  <Show when={contact.email}>
                    <p class="break-all text-xs text-on-surface-variant">{contact.email}</p>
                  </Show>
                  <Show when={contact.phone}>
                    <p class="break-all text-xs text-on-surface-variant">{contact.phone}</p>
                  </Show>
                  <div class="mt-1 flex flex-wrap gap-1.5">
                    {(() => {
                      const engagement = buildContactEngagementState({ contact });
                      return (
                        <>
                          <span classList={{
                            "max-w-full rounded-full border px-2 py-1 text-[10px] break-words": true,
                            "border-slate-200/70 bg-slate-50/80 text-slate-600": engagement.status === "not_contacted",
                            "border-sky-200/70 bg-sky-50/80 text-sky-700": engagement.status === "awaiting_response",
                            "border-amber-200/70 bg-amber-50/80 text-amber-700": engagement.status === "follow_up_due",
                            "border-emerald-200/70 bg-emerald-50/80 text-emerald-700": engagement.status === "response_recorded",
                            "border-slate-300/70 bg-slate-100/80 text-slate-700": engagement.status === "closed_without_response",
                          }}>
                            {engagement.statusLabel}
                          </span>
                          <Show when={engagement.lastContactedLabel}>
                            {(label) => (
                              <span class="max-w-full rounded-full border border-emerald-200/70 bg-emerald-50/80 px-2 py-1 text-[10px] text-emerald-700 break-words">
                                {label()}
                              </span>
                            )}
                          </Show>
                        </>
                      );
                    })()}
                    <span class="max-w-full rounded-full border border-slate-200/70 bg-slate-50/80 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-600 break-words">
                      {contact.relationshipKind}
                    </span>
                    <ContactRoleChips roles={contact.roles ?? []} onRemove={(role) => removeRoleFromContact(contact, role)} />
                    <Show when={contact.responseSlaHours}>
                      <span class="max-w-full rounded-full border border-sky-200/70 bg-sky-50/80 px-2 py-1 text-[10px] text-sky-700 break-words">
                        Reply in {contact.responseSlaHours}h
                      </span>
                    </Show>
                  </div>
                  <p class="mt-2 break-words text-[11px] leading-4 text-on-surface-variant">
                    {buildContactEngagementState({ contact }).detailLabel}
                  </p>
                  <Show when={responseSummariesEnabled() && contact.lastResponseSummary}>
                    <p class="mt-2 break-words rounded-xl border border-slate-200/70 bg-slate-50/80 px-2 py-1.5 text-[11px] leading-4 text-slate-700">
                      Last response: {contact.lastResponseSummary}
                      <Show when={buildContactEngagementState({ contact }).responseRecordedLabel}>
                        {(label) => <span class="mt-1 block text-[10px] text-slate-500">{label()}</span>}
                      </Show>
                    </p>
                  </Show>
                  <Show when={buildContactEngagementState({ contact }).followUpOutcomeLabel}>
                    {(label) => (
                      <p class="mt-2 break-words rounded-xl border border-slate-200/70 bg-slate-50/80 px-2 py-1.5 text-[11px] leading-4 text-slate-700">
                        Follow-up outcome: {label()}
                        <Show when={contact.followUpOutcomeNote}>
                          {(note) => <span class="mt-1 block text-[10px] text-slate-500">{note()}</span>}
                        </Show>
                      </p>
                    )}
                  </Show>
                  <Show when={responseEditorContactId() === contact.id}>
                    <div class="mt-2 space-y-2 rounded-xl border border-emerald-200/70 bg-emerald-50/80 p-2">
                      <textarea
                        value={responseDraft()}
                        onInput={(event) => setResponseDraft(event.currentTarget.value)}
                        placeholder="Summarise the latest reply, e.g. Confirmed availability; asked for deposit invoice..."
                        class="min-h-16 w-full rounded-lg border border-emerald-100 bg-white/80 px-2 py-1.5 text-[11px] text-slate-800 outline-none transition focus:border-emerald-400"
                      />
                      <div class="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => saveResponseSummary(contact)}
                          disabled={!responseDraft().trim()}
                          class="rounded-full bg-emerald-600 px-2.5 py-1.5 text-[10px] font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Save response
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setResponseEditorContactId(null);
                            setResponseDraft("");
                          }}
                          class="rounded-full border border-emerald-200 bg-white/70 px-2.5 py-1.5 text-[10px] text-emerald-800 transition hover:bg-white"
                        >
                          Cancel
                        </button>
                      </div>
                      <p class="text-[10px] leading-4 text-emerald-900/70">
                        This closes the follow-up loop from user-entered evidence. It does not read or scrape your inbox.
                      </p>
                    </div>
                  </Show>
                  <Show when={roleEditorContactId() === contact.id}>
                    <div class="mt-2">
                      <ContactRoleInput
                        id={`contact-role-options-${contact.id}`}
                        compact
                        contacts={contacts()}
                        roles={contact.roles ?? []}
                        onChange={(roles) => saveNextContacts(contacts().map((item) => item.id === contact.id ? { ...item, roles } : item))}
                        placeholder="Add a role, e.g. Guest, celebrant, cousin..."
                        description="Suggestions include roles already used here plus wedding roles. Custom roles are accepted."
                      />
                    </div>
                  </Show>
                  <Show when={contactEditorContactId() === contact.id}>
                    <ContactEditControls
                      contact={contact}
                      onSave={updateContact}
                      onCancel={() => setContactEditorContactId(null)}
                    />
                  </Show>
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => markContacted(contact, "user")}
                      class="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1.5 text-[10px] text-slate-700 transition hover:bg-white"
                    >
                      Mark user contact
                    </button>
                    <button
                      type="button"
                      onClick={() => markContacted(contact, "agent")}
                      class="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1.5 text-[10px] text-slate-700 transition hover:bg-white"
                    >
                      Mark agent contact
                    </button>
                    <button
                      type="button"
                      onClick={() => openResponseEditor(contact)}
                      class="rounded-full border border-emerald-200 bg-emerald-50/80 px-2.5 py-1.5 text-[10px] text-emerald-700 transition hover:bg-emerald-100"
                    >
                      Record response
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRoleEditorContactId(roleEditorContactId() === contact.id ? null : contact.id);
                      }}
                      class="rounded-full border border-primary/15 bg-primary/10 px-2.5 py-1.5 text-[10px] text-primary transition hover:bg-primary/15"
                    >
                      {roleEditorContactId() === contact.id ? "Close roles" : "Add role"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setContactEditorContactId(contactEditorContactId() === contact.id ? null : contact.id)}
                      class="rounded-full border border-slate-200 bg-white/70 px-2.5 py-1.5 text-[10px] text-slate-700 transition hover:bg-white"
                    >
                      {contactEditorContactId() === contact.id ? "Close edit" : "Edit contact"}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeContact(contact.id)}
                  class="rounded-full px-2 py-1 text-[11px] text-outline/60 opacity-100 transition hover:bg-white/60 hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100"
                  aria-label="Remove contact"
                >
                  x
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
