import { For, Match, Show, Switch, createMemo, createSignal, onMount } from "solid-js";
import { render } from "solid-js/web";

import {
  openWeddingRsvpCapability,
  submitWeddingRsvpCapabilityResponse,
  type WeddingRsvpCapabilityInvitation,
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
};

function initialAttendance(invitation: WeddingRsvpCapabilityInvitation): Attendance {
  if (invitation.invitation_status === "rsvp_yes") return "attending";
  if (invitation.invitation_status === "rsvp_no") return "not_attending";
  return "";
}

function initialDraft(invitation: WeddingRsvpCapabilityInvitation): GuestDraft {
  return { attendance: initialAttendance(invitation), answers: {}, privateAnswers: {}, dietaryCategory: "", dietaryDetail: "" };
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

  const attendeeQuestions = createMemo(() => (scope()?.questions ?? []).filter((question) => question.id !== "attendance"));
  const hasSensitiveQuestions = createMemo(() => attendeeQuestions().some((question) => question.sensitive));

  onMount(async () => {
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
      setDrafts(Object.fromEntries(opened.invitations.map((invitation) => [invitation.invitation_id, initialDraft(invitation)])));
      setPhase("answer");
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
      ...(attendance === "not_attending" ? { answers: {}, privateAnswers: {}, dietaryCategory: "", dietaryDetail: "" } : {}),
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
      if (draft.attendance === "not_attending") continue;
      for (const question of attendeeQuestions().filter((item) => item.required)) {
        const present = question.id === "dietary_requirements"
          ? Boolean(draft.dietaryCategory)
          : question.sensitive
            ? Boolean(draft.privateAnswers[question.id]?.trim())
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
    try {
      for (const invitation of currentScope.invitations) {
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
        });
        const revision = Number(result.response.revision);
        if (Number.isSafeInteger(revision)) invitation.response_revision = revision;
      }
      setIdempotencyKeys({});
      setNotice("Your RSVP has been recorded for each named guest.");
      setPhase("receipt");
      focusField("receipt-title");
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Your RSVP could not be saved. Review the answers and try again.");
      setPhase("review");
      focusField("review-title");
    }
  }

  return <main class="min-h-screen bg-[#f7fbf8] px-3 py-6 text-teal-950 sm:px-6 sm:py-10">
    <div class="mx-auto w-full max-w-2xl">
      <p class="text-sm font-semibold text-teal-800">OmnyID Wedding</p>
      <Switch>
        <Match when={phase() === "loading"}><div class="mt-4 rounded-2xl border border-teal-100 bg-white p-5" role="status">Opening your private RSVP…</div></Match>
        <Match when={phase() === "error"}><section class="mt-4 rounded-2xl border border-rose-200 bg-white p-5"><h1 class="text-2xl font-bold">RSVP unavailable</h1><p class="mt-2 text-sm leading-6 text-teal-900/75">{error()}</p></section></Match>
        <Match when={scope()}>{(loaded) => <>
          <header class="mt-3 rounded-2xl border border-teal-100 bg-white p-5 shadow-sm sm:p-7">
            <p class="text-sm font-semibold text-teal-700">{loaded().host_label}</p>
            <h1 class="mt-1 text-2xl font-bold sm:text-3xl">RSVP for {loaded().event_label}</h1>
            <p class="mt-2 text-sm text-teal-800">Please respond by <time datetime={loaded().response_deadline}>{new Date(`${loaded().response_deadline}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "long" })}</time>.</p>
          </header>
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
                    <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"><label class="flex min-h-12 items-center gap-3 rounded-xl border border-teal-200 p-3 font-semibold"><input type="radio" name={`attendance-${invitation.invitation_id}`} class="h-5 w-5 accent-teal-800" checked={draft().attendance === "attending"} onChange={() => updateDraft(invitation.invitation_id, (current) => ({ ...current, attendance: "attending" }))} />Attending</label><label class="flex min-h-12 items-center gap-3 rounded-xl border border-teal-200 p-3 font-semibold"><input type="radio" name={`attendance-${invitation.invitation_id}`} class="h-5 w-5 accent-teal-800" checked={draft().attendance === "not_attending"} onChange={() => updateDraft(invitation.invitation_id, (current) => ({ ...current, attendance: "not_attending", answers: {}, privateAnswers: {}, dietaryCategory: "", dietaryDetail: "" }))} />Not attending</label></div>
                    <Show when={draft().attendance === "attending"}><div class="mt-4 grid gap-4">
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
          <Show when={phase() === "review" || phase() === "submitting"}><section class="mt-4 rounded-2xl border border-teal-100 bg-white p-5"><h2 id="review-title" tabindex="-1" class="text-xl font-bold focus:outline-none">Review before sending</h2><p class="mt-1 text-sm text-teal-800">Only the answers shown here will be submitted. Private answers remain encrypted for the couple.</p><div class="mt-4 grid gap-3"><For each={loaded().invitations}>{(invitation) => { const draft = () => drafts()[invitation.invitation_id]!; return <div class="rounded-xl border border-teal-100 p-3"><p class="font-bold">{invitation.display_name}</p><p class="mt-1 text-sm">{draft().attendance === "attending" ? "Attending" : "Not attending"}</p><Show when={draft().attendance === "attending"}><For each={attendeeQuestions()}>{(question) => <p class="mt-1 break-words text-sm text-teal-900/75"><strong>{questionLabel(question)}:</strong> {question.id === "dietary_requirements" ? draft().dietaryCategory || "Not answered" : question.sensitive ? draft().privateAnswers[question.id] || "Not answered" : draft().answers[question.id] || "Not answered"}</p>}</For></Show></div>; }}</For></div><Show when={notice()}><p role="status" class="mt-4 text-sm">{notice()}</p></Show><div class="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" disabled={phase() === "submitting"} class="min-h-12 rounded-xl border-2 border-teal-700 font-bold text-teal-900" onClick={() => setPhase("answer")}>Edit answers</button><button type="button" disabled={phase() === "submitting"} class="min-h-12 rounded-xl bg-teal-800 font-bold text-white disabled:bg-teal-300" onClick={() => void submit()}>{phase() === "submitting" ? "Saving…" : "Submit RSVP"}</button></div></section></Show>
          <Show when={phase() === "receipt"}><section class="mt-4 rounded-2xl border border-emerald-200 bg-white p-5"><h2 id="receipt-title" tabindex="-1" class="text-2xl font-bold focus:outline-none">Thank you — RSVP received</h2><p class="mt-2 text-sm leading-6 text-teal-900/75">{notice()}</p><button type="button" class="mt-4 min-h-12 rounded-xl border-2 border-teal-700 px-4 font-bold text-teal-900" onClick={() => { setPhase("answer"); setNotice("Update the answers, then review and submit the amendment."); }}>Amend response</button></section></Show>
          <p class="my-5 text-center text-xs text-teal-800">Private RSVP powered by OmnyID · No account required</p>
        </>}</Match>
      </Switch>
    </div>
  </main>;
}

render(() => <WeddingRsvpPage />, document.getElementById("root")!);
