import { For, Match, Show, Switch, createMemo, createSignal, onMount } from "solid-js";
import { render } from "solid-js/web";
import { WeddingRsvpExperienceHeader } from "@/components/WeddingRsvpExperienceHeader";
import {
  weddingRsvpTestEnvelopeFromHash,
  type WeddingRsvpHouseholdExperience,
} from "@/lib/weddingRsvpHouseholdExperienceState";

import {
  openWeddingRsvpCapability,
  submitWeddingRsvpCapabilityResponse,
  type WeddingRsvpCapabilityInvitation,
  type WeddingRsvpCapabilityLatestResponse,
  type WeddingRsvpCapabilityQuestion,
  type WeddingRsvpCapabilityScope,
} from "@/lib/weddingRsvpCapabilityApi";
import { encryptVendorAgentEnvelope } from "@/lib/vendorAgentKeys";
import "./index.css";

type Attendance = "" | "attending" | "not_attending";
type GuestDraft = {
  attendance: Attendance;
  answers: Record<string, string>;
  privateAnswers: Record<string, string>;
  dietaryCategory: string;
  dietaryDetail: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  relationshipToCouple: string;
  savedPrivateQuestionIds: string[];
};

function initialAttendance(invitation: WeddingRsvpCapabilityInvitation): Attendance {
  if (invitation.invitation_status === "rsvp_yes") return "attending";
  if (invitation.invitation_status === "rsvp_no") return "not_attending";
  return "";
}

function initialDraft(invitation: WeddingRsvpCapabilityInvitation, latest?: WeddingRsvpCapabilityLatestResponse): GuestDraft {
  return {
    attendance: latest?.attendance === "attending" || latest?.attendance === "not_attending" ? latest.attendance : initialAttendance(invitation),
    answers: { ...(latest?.answers ?? {}) }, privateAnswers: {}, dietaryCategory: "", dietaryDetail: "",
    // The public capability never returns the couple's private contact record.
    // Name is already part of the invitation; the guest supplies the other
    // details explicitly when the couple requests them.
    contactName: invitation.display_name, contactEmail: "",
    contactPhone: "", relationshipToCouple: "",
    savedPrivateQuestionIds: [...(latest?.private_answer_question_ids ?? [])],
  };
}

function encodedEnvelope(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return `encrypted:v1:${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

function questionLabel(question: WeddingRsvpCapabilityQuestion): string {
  return question.prompt?.trim() || question.label;
}

function entitlementLabel(invitation: WeddingRsvpCapabilityInvitation): string | null {
  if (invitation.guest_role === "plus_one") {
    return invitation.name_pending
      ? "Plus-one place · the couple can replace this placeholder with the guest's name later"
      : "Named plus-one · this person has their own RSVP";
  }
  if (invitation.guest_role === "child") {
    const age = invitation.age_band === "child_under_12" ? "under 12" : invitation.age_band === "teen" ? "teen" : "age to confirm";
    const seat = invitation.seat_requirement === "high_chair" ? "high chair" : invitation.seat_requirement === "booster" ? "booster seat" : invitation.seat_requirement === "standard" ? "standard seat" : invitation.seat_requirement === "none" ? "no seat" : "seat to confirm";
    const meal = invitation.meal_requirement === "child" ? "child meal" : invitation.meal_requirement === "adult" ? "adult meal" : invitation.meal_requirement === "none" ? "no meal" : "meal to confirm";
    return `Child · ${age} · ${seat} · ${meal}`;
  }
  if (invitation.plus_one_allowed || invitation.children_invited) {
    return `${invitation.plus_one_allowed ? "Plus-one included as a separate guest. " : ""}${invitation.children_invited ? "Named children are included as separate guests." : ""}`.trim();
  }
  return null;
}

function PrivateQuestion(props: {
  question: WeddingRsvpCapabilityQuestion;
  value: string;
  onInput: (value: string) => void;
}) {
  return <label class="block text-sm font-semibold text-teal-950">
    {questionLabel(props.question)} {!props.question.required && <span class="font-normal text-teal-800">(optional)</span>}
    <textarea rows="3" maxlength="400" value={props.value} onInput={(event) => props.onInput(event.currentTarget.value)} class="mt-1 w-full rounded-xl border border-teal-200 bg-white p-3 font-normal focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-100" />
  </label>;
}

function WeddingRsvpPage() {
  const [scope, setScope] = createSignal<WeddingRsvpCapabilityScope | null>(null);
  const [drafts, setDrafts] = createSignal<Record<string, GuestDraft>>({});
  const [token, setToken] = createSignal("");
  const [phase, setPhase] = createSignal<"loading" | "answer" | "review" | "submitting" | "receipt" | "error">("loading");
  const [error, setError] = createSignal("");
  const [notice, setNotice] = createSignal("");
  const [idempotencyKeys, setIdempotencyKeys] = createSignal<Record<string, string>>({});
  const [latestResponses, setLatestResponses] = createSignal<WeddingRsvpCapabilityLatestResponse[]>([]);
  const [impactLabels, setImpactLabels] = createSignal<string[]>([]);
  const [testExperience, setTestExperience] = createSignal<WeddingRsvpHouseholdExperience | null>(null);

  const attendeeQuestions = createMemo(() => (scope()?.questions ?? []).filter((question) => question.id !== "attendance"));
  const hasSensitiveQuestions = createMemo(() => attendeeQuestions().some((question) => question.sensitive));

  function latestFor(invitationId: string): WeddingRsvpCapabilityLatestResponse | undefined {
    return latestResponses().find((response) => response.invitation_id === invitationId);
  }

  function publicDraftChanged(invitationId: string, draft: GuestDraft): boolean {
    const latest = latestFor(invitationId);
    if (!latest) return true;
    if (draft.attendance !== latest.attendance) return true;
    const answers = draft.attendance === "attending" ? draft.answers : {};
    return JSON.stringify(Object.entries(answers).sort()) !== JSON.stringify(Object.entries(latest.answers).sort());
  }

  function draftNeedsSubmission(invitationId: string, draft: GuestDraft): boolean {
    if (scope()?.request_contact_details) return true;
    if (publicDraftChanged(invitationId, draft)) return true;
    return Boolean(draft.dietaryCategory || Object.values(draft.privateAnswers).some((value) => value.trim()));
  }

  onMount(async () => {
    const testEnvelope = weddingRsvpTestEnvelopeFromHash(window.location.hash);
    if (window.location.hash.startsWith("#test.")) {
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      document.title = "Test RSVP — OmnyID Wedding";
      if (!testEnvelope) {
        setError("This test view has expired. Open a fresh test view from RSVP setup.");
        setPhase("error");
        return;
      }
      setTestExperience(testEnvelope.experience);
      setPhase("receipt");
      return;
    }
    const fragmentToken = window.location.hash.slice(1).trim();
    if (fragmentToken) history.replaceState(null, "", `${location.pathname}${location.search}`);
    if (!fragmentToken) {
      setError("This RSVP invitation is not available. Ask the couple for a new link.");
      setPhase("error");
      return;
    }
    setToken(fragmentToken);
    try {
      const opened = await openWeddingRsvpCapability(fragmentToken);
      setScope(opened);
      const latestByInvitation = new Map((opened.latest_responses ?? []).map((response) => [response.invitation_id, response]));
      for (const invitation of opened.invitations) {
        const latest = latestByInvitation.get(invitation.invitation_id);
        if (latest && latest.revision > invitation.response_revision) invitation.response_revision = latest.revision;
      }
      setLatestResponses(opened.latest_responses ?? []);
      setDrafts(Object.fromEntries(opened.invitations.map((invitation) => [invitation.invitation_id, initialDraft(invitation, latestByInvitation.get(invitation.invitation_id))])));
      if ((opened.latest_responses ?? []).length > 0) {
        setNotice("This is the latest RSVP saved through this private link.");
        setPhase("receipt");
      } else {
        setPhase("answer");
      }
    } catch {
      setError("This RSVP invitation is not available. It may have expired or been replaced. Ask the couple for a new link.");
      setPhase("error");
    }
  });

  function updateDraft(invitationId: string, update: (current: GuestDraft) => GuestDraft) {
    setDrafts((current) => ({ ...current, [invitationId]: update(current[invitationId] ?? initialDraft(scope()!.invitations.find((item) => item.invitation_id === invitationId)!)) }));
    setNotice("");
  }

  function setEveryone(attendance: Exclude<Attendance, "">) {
    setDrafts((current) => Object.fromEntries(Object.entries(current).map(([id, draft]) => [id, {
      ...draft,
      attendance,
      ...(attendance === "not_attending" ? { answers: {}, privateAnswers: {}, dietaryCategory: "", dietaryDetail: "", savedPrivateQuestionIds: [] } : {}),
    }])));
    setNotice(`${attendance === "attending" ? "Attending" : "Not attending"} selected for each named guest. You can still change anyone individually.`);
  }

  function focusField(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus());
  }

  function review() {
    const currentScope = scope();
    if (!currentScope) return;
    for (const invitation of currentScope.invitations) {
      const draft = drafts()[invitation.invitation_id];
      if (!draft?.attendance) {
        setNotice(`Choose whether ${invitation.display_name} is attending.`);
        focusField(`attendance-${invitation.invitation_id}`);
        return;
      }
      if (currentScope.request_contact_details) {
        const requested = [
          ["name", draft.contactName, `contact-name-${invitation.invitation_id}`],
          ["email", draft.contactEmail, `contact-email-${invitation.invitation_id}`],
          ["phone", draft.contactPhone, `contact-phone-${invitation.invitation_id}`],
          ["relationship", draft.relationshipToCouple, `contact-relationship-${invitation.invitation_id}`],
        ] as const;
        const missing = requested.find(([, value]) => !value.trim());
        if (missing) {
          setNotice(`Add ${missing[0]} for ${invitation.display_name}.`);
          focusField(missing[2]);
          return;
        }
      }
      if (draft.attendance === "not_attending") continue;
      for (const question of attendeeQuestions().filter((item) => item.required)) {
        const present = question.id === "dietary_requirements"
          ? Boolean(draft.dietaryCategory) || (!publicDraftChanged(invitation.invitation_id, draft) && draft.savedPrivateQuestionIds.includes(question.id))
          : question.sensitive
            ? Boolean(draft.privateAnswers[question.id]?.trim()) || (!publicDraftChanged(invitation.invitation_id, draft) && draft.savedPrivateQuestionIds.includes(question.id))
            : Boolean(draft.answers[question.id]?.trim());
        if (!present) {
          setNotice(`Answer “${questionLabel(question)}” for ${invitation.display_name}.`);
          focusField(`${question.id}-${invitation.invitation_id}`);
          return;
        }
      }
    }
    setNotice("");
    setPhase("review");
    focusField("review-title");
  }

  async function encryptedPrivateAnswers(
    currentScope: WeddingRsvpCapabilityScope,
    invitation: WeddingRsvpCapabilityInvitation,
    draft: GuestDraft,
  ): Promise<{ ids: string[]; ciphertext: string | null }> {
    const values: Record<string, unknown> = { ...draft.privateAnswers };
    delete values.dietary_requirements;
    if (draft.dietaryCategory) values.dietary_requirements = { category: draft.dietaryCategory, detail: draft.dietaryDetail.trim() || null };
    const ids = Object.entries(values).filter(([, value]) => typeof value !== "string" || value.trim()).map(([id]) => id).sort();
    if (ids.length === 0) return { ids, ciphertext: null };
    const aad = { capability_id: currentScope.capability_id, invitation_id: invitation.invitation_id, event_id: invitation.event_id, question_ids: ids };
    const envelope = await encryptVendorAgentEnvelope(currentScope.encryption_public_key_hex, Object.fromEntries(ids.map((id) => [id, values[id]])), aad);
    return { ids, ciphertext: encodedEnvelope(envelope) };
  }

  async function submit() {
    const currentScope = scope();
    if (!currentScope || phase() === "submitting") return;
    setPhase("submitting");
    setNotice("Saving your RSVP securely…");
    const savedNames: string[] = [];
    const effects = new Set<string>();
    try {
      const changedInvitations = currentScope.invitations.filter((invitation) => draftNeedsSubmission(invitation.invitation_id, drafts()[invitation.invitation_id]!));
      if (changedInvitations.length === 0) {
        setNotice("No changes were submitted. Your latest RSVP remains saved.");
        setPhase("receipt");
        focusField("receipt-title");
        return;
      }
      for (const invitation of changedInvitations) {
        const draft = drafts()[invitation.invitation_id]!;
        const privatePayload = draft.attendance === "attending"
          ? await encryptedPrivateAnswers(currentScope, invitation, draft)
          : { ids: [], ciphertext: null };
        let idempotencyKey = idempotencyKeys()[invitation.invitation_id];
        if (!idempotencyKey) {
          idempotencyKey = `guest-rsvp:${crypto.randomUUID()}`;
          setIdempotencyKeys((current) => ({ ...current, [invitation.invitation_id]: idempotencyKey! }));
        }
        const result = await submitWeddingRsvpCapabilityResponse({
          token: token(), invitationId: invitation.invitation_id, personId: invitation.person_id,
          eventId: invitation.event_id, attendance: draft.attendance || "pending",
          expectedRevision: invitation.response_revision, idempotencyKey,
          answers: draft.attendance === "attending" ? draft.answers : {},
          privateAnswerQuestionIds: privatePayload.ids,
          privateAnswersCiphertext: privatePayload.ciphertext,
          contactDetails: currentScope.request_contact_details ? {
            displayName: draft.contactName.trim(), email: draft.contactEmail.trim().toLowerCase(),
            phone: draft.contactPhone.trim(), relationshipToCouple: draft.relationshipToCouple.trim(),
          } : null,
        });
        savedNames.push(invitation.display_name);
        const impactEffects = Array.isArray(result.impact_receipt.effects) ? result.impact_receipt.effects : [];
        for (const effect of impactEffects) if (typeof effect === "string") effects.add(effect);
        const revision = Number(result.response.revision);
        if (Number.isSafeInteger(revision)) invitation.response_revision = revision;
        const submittedAt = typeof result.response.responded_at === "string" ? result.response.responded_at : new Date().toISOString();
        const safeResponse: WeddingRsvpCapabilityLatestResponse = {
          invitation_id: invitation.invitation_id,
          person_id: invitation.person_id,
          event_id: invitation.event_id,
          attendance: draft.attendance || "pending",
          answers: draft.attendance === "attending" ? { ...draft.answers } : {},
          private_answer_question_ids: [...privatePayload.ids],
          has_private_answers: privatePayload.ids.length > 0,
          revision: Number.isSafeInteger(revision) ? revision : invitation.response_revision,
          submitted_at: submittedAt,
          complete: true,
        };
        setLatestResponses((current) => [...current.filter((item) => item.invitation_id !== invitation.invitation_id), safeResponse]);
        setDrafts((current) => ({ ...current, [invitation.invitation_id]: { ...current[invitation.invitation_id], savedPrivateQuestionIds: [...privatePayload.ids] } }));
      }
      setIdempotencyKeys({});
      setImpactLabels([...effects]);
      setNotice("Your RSVP changes have been recorded.");
      setPhase("receipt");
      focusField("receipt-title");
    } catch (caught) {
      const reason = caught instanceof Error ? caught.message : "Your RSVP could not be saved. Review the answers and try again.";
      setNotice(savedNames.length > 0 ? `${savedNames.join(" and ")} saved successfully. Another response was not saved: ${reason} Retry only the unsaved response.` : reason);
      setPhase("review");
      focusField("review-title");
    }
  }

  return <main class="min-h-screen min-w-0 overflow-x-hidden bg-[#f7fbf8] px-3 py-6 text-teal-950 sm:px-6 sm:py-10">
    <div class="mx-auto w-full max-w-2xl">
      <p class="text-sm font-semibold text-teal-800">OmnyID Wedding</p>
      <Switch>
        <Match when={phase() === "loading"}><div class="mt-4 rounded-2xl border border-teal-100 bg-white p-5" role="status">Opening your private RSVP…</div></Match>
        <Match when={phase() === "error"}><section class="mt-4 rounded-2xl border border-rose-200 bg-white p-5"><h1 class="text-2xl font-bold">RSVP unavailable</h1><p class="mt-2 text-sm leading-6 text-teal-900/75">{error()}</p></section></Match>
        <Match when={testExperience()}>{(experience) => <section aria-label="Test RSVP view">
          <WeddingRsvpExperienceHeader experience={experience()} />
          <div class="mt-4 rounded-2xl border border-sky-200 bg-white p-5"><h2 class="text-xl font-bold">Test view only</h2><p class="mt-2 text-sm leading-6 text-teal-900/75">This short-lived view cannot submit an RSVP, open a production invitation or change household lifecycle evidence. Return to RSVP setup to make changes.</p><p class="mt-2 text-xs text-teal-800">Test expires {new Date(experience().expiresAt ?? "").toLocaleString()}.</p></div>
        </section>}</Match>
        <Match when={scope()}>{(loaded) => <>
          <WeddingRsvpExperienceHeader experience={{
            mode: "production", householdLabel: loaded().household_id,
            recipientLabels: loaded().invitations.map((invitation) => invitation.display_name),
            hostLabel: loaded().host_label, eventLabel: loaded().event_label,
            responseDeadline: loaded().response_deadline, eventDate: loaded().event_date ?? null,
            eventLocalTime: loaded().event_local_time ?? null, eventTimeZone: loaded().event_time_zone ?? null,
            venueName: loaded().venue_name ?? null, venueAddress: loaded().venue_address ?? null,
            questions: loaded().questions.map((question) => ({ label: questionLabel(question), required: question.required, sensitive: question.sensitive })),
            expiresAt: loaded().expires_at,
          }} showRsvpAction={phase() === "receipt"} onRsvp={() => setPhase("answer")} />
          <Show when={loaded().loom_video_url}>{(url) => <a class="mt-4 inline-flex min-h-11 items-center rounded-xl border border-teal-300 bg-white px-4 text-sm font-bold text-teal-900" href={url()} target="_blank" rel="noreferrer">Watch the couple's short video</a>}</Show>
          <Show when={phase() === "answer"}>
            <section class="mt-4 rounded-2xl border border-teal-100 bg-white p-4 sm:p-6" aria-labelledby="people-title">
              <h2 id="people-title" class="text-xl font-bold">Who can make it?</h2>
              <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><button type="button" class="min-h-12 rounded-xl border-2 border-teal-700 font-semibold text-teal-900" onClick={() => setEveryone("attending")}>Everyone is attending</button><button type="button" class="min-h-12 rounded-xl border-2 border-teal-300 font-semibold text-teal-900" onClick={() => setEveryone("not_attending")}>No one can attend</button></div>
              <Show when={hasSensitiveQuestions()}><div class="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-950"><strong>Private answer notice.</strong> Dietary, accessibility, travel and other personal answers are encrypted in this browser for the couple. They are not used for marketing and are not shared with vendors unless the couple later previews and approves a minimum-necessary brief.</div></Show>
              <div class="mt-4 grid gap-4">
                <For each={loaded().invitations}>{(invitation) => {
                  const draft = () => drafts()[invitation.invitation_id] ?? initialDraft(invitation);
                  return <fieldset id={`attendance-${invitation.invitation_id}`} tabindex="-1" class="min-w-0 rounded-2xl border border-teal-100 p-4">
                    <legend class="px-1 text-base font-bold">{invitation.display_name}</legend>
                    <Show when={loaded().request_contact_details}>
                      <div class="mb-4 rounded-xl border border-teal-200 bg-teal-50/60 p-3">
                        <p class="text-sm font-bold text-teal-950">Your contact details</p>
                        <p class="mt-1 text-xs leading-5 text-teal-900/75">The couple asked you to confirm these details for invitations and day-of updates. They stay in this wedding's private guest list.</p>
                        <div class="mt-3 grid gap-3 sm:grid-cols-2">
                          <label class="text-sm font-semibold">Name<input id={`contact-name-${invitation.invitation_id}`} maxlength="160" class="mt-1 min-h-12 w-full rounded-xl border border-teal-200 bg-white px-3 font-normal" value={draft().contactName} onInput={(event) => updateDraft(invitation.invitation_id, (current) => ({ ...current, contactName: event.currentTarget.value }))} /></label>
                          <label class="text-sm font-semibold">Relationship to the couple<input id={`contact-relationship-${invitation.invitation_id}`} maxlength="80" class="mt-1 min-h-12 w-full rounded-xl border border-teal-200 bg-white px-3 font-normal" value={draft().relationshipToCouple} onInput={(event) => updateDraft(invitation.invitation_id, (current) => ({ ...current, relationshipToCouple: event.currentTarget.value }))} placeholder="Friend, parent, cousin…" /></label>
                          <label class="text-sm font-semibold">Email<input id={`contact-email-${invitation.invitation_id}`} type="email" autocomplete="email" maxlength="254" class="mt-1 min-h-12 w-full rounded-xl border border-teal-200 bg-white px-3 font-normal" value={draft().contactEmail} onInput={(event) => updateDraft(invitation.invitation_id, (current) => ({ ...current, contactEmail: event.currentTarget.value }))} /></label>
                          <label class="text-sm font-semibold">Phone<input id={`contact-phone-${invitation.invitation_id}`} type="tel" autocomplete="tel" maxlength="40" class="mt-1 min-h-12 w-full rounded-xl border border-teal-200 bg-white px-3 font-normal" value={draft().contactPhone} onInput={(event) => updateDraft(invitation.invitation_id, (current) => ({ ...current, contactPhone: event.currentTarget.value }))} /></label>
                        </div>
                      </div>
                    </Show>
                    <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"><label class="flex min-h-12 items-center gap-3 rounded-xl border border-teal-200 p-3 font-semibold"><input type="radio" name={`attendance-${invitation.invitation_id}`} class="h-5 w-5 accent-teal-800" checked={draft().attendance === "attending"} onChange={() => updateDraft(invitation.invitation_id, (current) => ({ ...current, attendance: "attending" }))} />Attending</label><label class="flex min-h-12 items-center gap-3 rounded-xl border border-teal-200 p-3 font-semibold"><input type="radio" name={`attendance-${invitation.invitation_id}`} class="h-5 w-5 accent-teal-800" checked={draft().attendance === "not_attending"} onChange={() => updateDraft(invitation.invitation_id, (current) => ({ ...current, attendance: "not_attending", answers: {}, privateAnswers: {}, dietaryCategory: "", dietaryDetail: "", savedPrivateQuestionIds: [] }))} />Not attending</label></div>
                    <Show when={draft().attendance === "attending"}><div class="mt-4 grid gap-4">
                      <Show when={draft().savedPrivateQuestionIds.length > 0}><p class="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm leading-6 text-sky-950"><strong>Private details are saved.</strong> They are not displayed by this public link. If you change this person's public response, re-enter each private answer you want the couple to keep. Unchanged people remain saved.</p></Show>
                      <For each={attendeeQuestions()}>{(question) => <Show when={question.id === "meal_choice"} fallback={<Show when={question.id === "dietary_requirements"} fallback={<PrivateQuestion question={question} value={draft().privateAnswers[question.id] ?? ""} onInput={(value) => updateDraft(invitation.invitation_id, (current) => ({ ...current, privateAnswers: { ...current.privateAnswers, [question.id]: value } }))} />}>
                        <div id={`dietary_requirements-${invitation.invitation_id}`} tabindex="-1" class="grid gap-2"><label class="text-sm font-semibold">Dietary or allergy category {!question.required && <span class="font-normal text-teal-800">(optional)</span>}<select class="mt-1 min-h-12 w-full rounded-xl border border-teal-200 bg-white px-3" value={draft().dietaryCategory} onChange={(event) => updateDraft(invitation.invitation_id, (current) => ({ ...current, dietaryCategory: event.currentTarget.value }))}><option value="">Choose one</option><option value="none">None</option><option value="allergy">Allergy</option><option value="coeliac">Coeliac</option><option value="preference">Preference</option><option value="other">Other</option></select></label><Show when={draft().dietaryCategory && draft().dietaryCategory !== "none"}><label class="text-sm font-semibold">Details <span class="font-normal text-teal-800">(optional)</span><textarea rows="2" maxlength="400" class="mt-1 w-full rounded-xl border border-teal-200 p-3" value={draft().dietaryDetail} onInput={(event) => updateDraft(invitation.invitation_id, (current) => ({ ...current, dietaryDetail: event.currentTarget.value }))} /></label></Show></div>
                      </Show>}>
                        <label id={`meal_choice-${invitation.invitation_id}`} tabindex="-1" class="text-sm font-semibold">Meal choice {!question.required && <span class="font-normal text-teal-800">(optional)</span>}<select class="mt-1 min-h-12 w-full rounded-xl border border-teal-200 bg-white px-3" value={draft().answers.meal_choice ?? ""} onChange={(event) => updateDraft(invitation.invitation_id, (current) => ({ ...current, answers: { ...current.answers, meal_choice: event.currentTarget.value } }))}><option value="">Choose one</option><For each={question.options}>{(option) => <option value={option}>{option}</option>}</For></select></label>
                      </Show>}</For>
                    </div></Show>
                    <Show when={entitlementLabel(invitation)}>{(label) => <p class="mt-3 rounded-lg bg-teal-50 px-2.5 py-2 text-xs font-semibold leading-5 text-teal-900">{label()}</p>}</Show>
                  </fieldset>;
                }}</For>
              </div>
              <Show when={notice()}><p role="alert" class="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{notice()}</p></Show>
              <button type="button" class="mt-4 min-h-12 w-full rounded-xl bg-teal-800 px-4 font-bold text-white" onClick={review}>Review RSVP</button>
            </section>
          </Show>
          <Show when={phase() === "review" || phase() === "submitting"}><section class="mt-4 rounded-2xl border border-teal-100 bg-white p-5"><h2 id="review-title" tabindex="-1" class="text-xl font-bold focus:outline-none">Review before sending</h2><p class="mt-1 text-sm text-teal-800">Only the answers shown here will be submitted. Private answers remain encrypted for the couple.</p><div class="mt-4 grid gap-3"><For each={loaded().invitations}>{(invitation) => { const draft = () => drafts()[invitation.invitation_id]!; return <div class="rounded-xl border border-teal-100 p-3"><p class="font-bold">{invitation.display_name}</p><p class="mt-1 text-sm">{draft().attendance === "attending" ? "Attending" : "Not attending"}</p><Show when={loaded().request_contact_details}><p class="mt-2 text-sm text-teal-900/75"><strong>Contact:</strong> {draft().contactName} · {draft().relationshipToCouple} · {draft().contactEmail} · {draft().contactPhone}</p></Show><Show when={draft().attendance === "attending"}><For each={attendeeQuestions()}>{(question) => <p class="mt-1 break-words text-sm text-teal-900/75"><strong>{questionLabel(question)}:</strong> {question.id === "dietary_requirements" ? draft().dietaryCategory || "Not answered" : question.sensitive ? draft().privateAnswers[question.id] || "Not answered" : draft().answers[question.id] || "Not answered"}</p>}</For></Show></div>; }}</For></div><Show when={notice()}><p role="status" class="mt-4 text-sm">{notice()}</p></Show><div class="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" disabled={phase() === "submitting"} class="min-h-12 rounded-xl border-2 border-teal-700 font-bold text-teal-900" onClick={() => setPhase("answer")}>Edit answers</button><button type="button" disabled={phase() === "submitting"} class="min-h-12 rounded-xl bg-teal-800 font-bold text-white disabled:bg-teal-300" onClick={() => void submit()}>{phase() === "submitting" ? "Saving…" : "Submit RSVP"}</button></div></section></Show>
          <Show when={phase() === "receipt"}><section class="mt-4 rounded-2xl border border-emerald-200 bg-white p-5"><h2 id="receipt-title" tabindex="-1" class="text-2xl font-bold focus:outline-none">Your RSVP confirmation</h2><p class="mt-2 text-sm leading-6 text-teal-900/75">{notice()}</p><div class="mt-4 grid gap-3"><For each={loaded().invitations}>{(invitation) => { const saved = () => latestResponses().find((response) => response.invitation_id === invitation.invitation_id); return <article class="rounded-xl border border-teal-100 p-3"><p class="font-bold">{invitation.display_name}</p><Show when={saved()} fallback={<p class="mt-1 text-sm font-semibold text-amber-800">No response saved yet</p>}>{(response) => <><p class="mt-1 text-sm font-semibold">{response().attendance === "attending" ? "Attending" : response().attendance === "not_attending" ? "Not attending" : "Response incomplete"}</p><For each={loaded().questions.filter((question) => question.id !== "attendance" && !question.sensitive && response().answers[question.id])}>{(question) => <p class="mt-1 text-sm text-teal-900/75"><strong>{questionLabel(question)}:</strong> {response().answers[question.id]}</p>}</For><For each={response().private_answer_question_ids}>{(questionId) => <p class="mt-1 text-sm text-teal-900/75"><strong>{questionLabel(loaded().questions.find((question) => question.id === questionId) ?? { id: questionId, label: "Private detail", required: false, sensitive: true, options: [] })}:</strong> Private detail saved</p>}</For><Show when={response().submitted_at}><p class="mt-2 text-xs text-teal-800">Saved {new Date(response().submitted_at).toLocaleString()} · revision {response().revision}</p></Show><Show when={response().locked_at}><p class="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs font-semibold text-amber-950">Locked for planning. Contact the couple to request a late-change review.</p></Show></>}</Show></article>; }}</For></div><Show when={impactLabels().length > 0}><p class="mt-3 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-950"><strong>What updated:</strong> guest attendance, the RSVP summary, the Wedding Home guest tile and final guest-count readiness.</p></Show><Show when={latestResponses().some((response) => response.locked_at)} fallback={<button type="button" class="mt-4 min-h-12 rounded-xl border-2 border-teal-700 px-4 font-bold text-teal-900" onClick={() => { setPhase("answer"); setNotice("Your saved public answers are filled in. Unchanged people stay saved; re-enter private details only for a person whose response you change."); }}>Edit RSVP</button>}><p class="mt-4 text-sm font-semibold text-amber-950">Need a change? Contact the couple; this RSVP is locked and cannot be silently overwritten.</p></Show></section></Show>
          <p class="my-5 text-center text-xs text-teal-800">Private RSVP powered by OmnyID · No account required</p>
        </>}</Match>
      </Switch>
    </div>
  </main>;
}

render(() => <WeddingRsvpPage />, document.getElementById("root")!);
