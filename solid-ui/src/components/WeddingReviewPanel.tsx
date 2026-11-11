import { createEffect, createSignal, For, Show } from "solid-js";

import {
  listWeddingReviews,
  loadWeddingReviewDraft,
  saveWeddingReview,
  withdrawWeddingReview,
  type WeddingReviewStatus,
} from "@/lib/weddingReviewApi";

const retryKey = (prefix: string): string => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function WeddingReviewPanel(props: {
  weddingPlanId: string;
  responseWorkspaceId: string;
  vendorId: string;
  vendorName: string;
}) {
  const [open, setOpen] = createSignal(false);
  const [loading, setLoading] = createSignal(false);
  const [saving, setSaving] = createSignal(false);
  const [status, setStatus] = createSignal<WeddingReviewStatus | null>(null);
  const [title, setTitle] = createSignal("");
  const [body, setBody] = createSignal("");
  const [question, setQuestion] = createSignal("");
  const [rating, setRating] = createSignal<number | null>(null);
  const [displayMode, setDisplayMode] = createSignal("omnyid_couple");
  const [audience, setAudience] = createSignal<"private_feedback" | "public_review">("public_review");
  const [preview, setPreview] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [error, setError] = createSignal<string | null>(null);

  async function load(): Promise<void> {
    setLoading(true); setError(null);
    try {
      const current = (await listWeddingReviews(props.weddingPlanId)).find((item) => item.vendorId === props.vendorId) ?? null;
      setStatus(current);
      if (current) {
        const draft = await loadWeddingReviewDraft(current.reviewId);
        setTitle(draft.title); setBody(draft.body); setQuestion(draft.nextCoupleQuestion);
        setDisplayMode(draft.displayMode); setAudience(current.audience); setRating(current.rating);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The review could not be loaded just now.");
    } finally { setLoading(false); }
  }

  createEffect(() => { if (open()) void load(); });

  async function save(action: "save_draft" | "submit"): Promise<void> {
    setSaving(true); setError(null); setNotice(null);
    try {
      const result = await saveWeddingReview({
        weddingPlanId: props.weddingPlanId, responseWorkspaceId: props.responseWorkspaceId,
        vendorId: props.vendorId, audience: audience(), rating: rating(), displayMode: displayMode(),
        title: title(), body: body(), nextCoupleQuestion: question(), expectedRevision: status()?.currentRevision ?? 0,
        action, idempotencyKey: retryKey(`review-${action}`),
      });
      setStatus((current) => ({
        reviewId: result.reviewId, vendorId: props.vendorId, status: result.status,
        verificationState: current?.verificationState ?? "unreviewed", currentRevision: result.revision,
        publishedRevision: current?.publishedRevision ?? null, audience: audience(), experienceKind: audience() === "public_review" ? "wedding_held" : "enquiry_tour",
        rating: audience() === "public_review" ? rating() : null, updatedAt: new Date().toISOString(),
      }));
      setPreview(false);
      setNotice(action === "submit" ? (audience() === "public_review" ? "Submitted for independent review. Nothing is public until approved." : "Private feedback saved. It will not appear publicly.") : "Draft saved privately.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The review could not be saved."); }
    finally { setSaving(false); }
  }

  async function withdraw(): Promise<void> {
    const current = status(); if (!current) return;
    setSaving(true); setError(null);
    try {
      await withdrawWeddingReview(current.reviewId, current.currentRevision, retryKey("review-withdraw"));
      setStatus({ ...current, status: "withdrawn" }); setNotice("Review withdrawn. Any public copy was removed immediately.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "The review could not be withdrawn."); }
    finally { setSaving(false); }
  }

  const canSubmit = () => title().trim().length > 0 && body().trim().length >= 20 && (audience() === "private_feedback" || rating() !== null);
  const statusLabel = () => ({ draft: "Private draft", submitted: "Awaiting review", moderation_pending: "Awaiting review", evidence_requested: "More evidence requested", published: "Published", edit_pending: "Correction awaiting review", rejected: "Returned", restricted: "Temporarily restricted", restored: "Published", withdrawn: "Withdrawn" }[status()?.status ?? ""] ?? status()?.status ?? "Not started");

  return <section class="mt-3 rounded-lg border border-wedding-border bg-wedding-page p-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div><p class="text-sm font-bold text-wedding-ink">Your experience with {props.vendorName}</p><p class="mt-0.5 text-xs text-wedding-ink/65">{statusLabel()}</p></div>
      <button type="button" class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-sm font-bold text-wedding-secondary" aria-expanded={open()} onClick={() => setOpen((value) => !value)}>{open() ? "Close" : status() ? "View or correct review" : "Write a review"}</button>
    </div>
    <Show when={open()}>
      <Show when={!loading()} fallback={<p class="mt-3 text-sm text-wedding-ink/65">Loading your private review…</p>}>
        <div class="mt-3 space-y-3">
          <fieldset><legend class="text-sm font-semibold text-wedding-ink">Where should this go?</legend><div class="mt-2 grid gap-2 sm:grid-cols-2">
            <label class="rounded-lg border border-wedding-border bg-white p-3 text-sm"><input type="radio" name={`review-audience-${props.vendorId}`} checked={audience() === "private_feedback"} onChange={() => setAudience("private_feedback")} /> <span class="font-semibold">Private feedback</span><span class="mt-1 block text-xs text-wedding-ink/65">Kept out of the public directory.</span></label>
            <label class="rounded-lg border border-wedding-border bg-white p-3 text-sm"><input type="radio" name={`review-audience-${props.vendorId}`} checked={audience() === "public_review"} onChange={() => setAudience("public_review")} /> <span class="font-semibold">Public review</span><span class="mt-1 block text-xs text-wedding-ink/65">Shown only after eligibility and policy review.</span></label>
          </div></fieldset>
          <Show when={audience() === "public_review"}><fieldset><legend class="text-sm font-semibold text-wedding-ink">Overall experience <span class="font-normal text-wedding-ink/60">(nothing selected yet)</span></legend><div class="mt-2 flex flex-wrap gap-2"><For each={[1,2,3,4,5]}>{(value) => <button type="button" class={`min-h-11 min-w-11 rounded-lg border text-sm font-bold ${rating() === value ? "border-wedding-primary bg-wedding-primary text-white" : "border-wedding-border bg-white text-wedding-ink"}`} aria-pressed={rating() === value} onClick={() => setRating(rating() === value ? null : value)}>{value}</button>}</For></div></fieldset></Show>
          <label class="block text-sm font-semibold text-wedding-ink">Short title<input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3" maxlength="180" value={title()} onInput={(event) => setTitle(event.currentTarget.value)} placeholder="What would help another couple understand?" /></label>
          <label class="block text-sm font-semibold text-wedding-ink">Your experience<textarea class="mt-1 min-h-32 w-full rounded-lg border border-wedding-border bg-white p-3" maxlength="8000" value={body()} onInput={(event) => setBody(event.currentTarget.value)} placeholder="Describe what happened in your own words. Avoid contact details or private information." /></label>
          <label class="block text-sm font-semibold text-wedding-ink">A useful question for another couple <span class="font-normal text-wedding-ink/60">(optional)</span><input class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3" maxlength="500" value={question()} onInput={(event) => setQuestion(event.currentTarget.value)} /></label>
          <Show when={audience() === "public_review"}><label class="block text-sm font-semibold text-wedding-ink">Public name<select class="mt-1 min-h-11 w-full rounded-lg border border-wedding-border bg-white px-3" value={displayMode()} onChange={(event) => setDisplayMode(event.currentTarget.value)}><option value="omnyid_couple">OmnyID couple</option><option value="first_names">First names</option><option value="first_name_and_initial">First name and initial</option></select></label></Show>
          <Show when={preview()}><article class="rounded-lg border-2 border-wedding-primary bg-white p-3" aria-label="Exact public preview"><p class="text-xs font-bold uppercase tracking-wide text-wedding-primary">Exact public preview</p><p class="mt-2 text-sm font-bold text-wedding-ink">{title() || "No title yet"}</p><p class="mt-2 whitespace-pre-wrap text-sm leading-6 text-wedding-ink/80">{body() || "No review text yet"}</p><Show when={rating()}>{(value) => <p class="mt-2 text-sm font-semibold">{value()} of 5</p>}</Show><p class="mt-2 text-xs text-wedding-ink/60">Published as {displayMode() === "omnyid_couple" ? "OmnyID couple" : "your selected name format"}. Evidence and account details are never included.</p></article></Show>
          <div class="flex flex-wrap gap-2"><button type="button" class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-sm font-bold text-wedding-secondary disabled:opacity-50" disabled={saving()} onClick={() => void save("save_draft")}>Save private draft</button><Show when={audience() === "public_review"}><button type="button" class="min-h-11 rounded-lg border border-wedding-secondary bg-white px-3 text-sm font-bold text-wedding-secondary" onClick={() => setPreview((value) => !value)}>{preview() ? "Hide preview" : "Preview exactly"}</button></Show><button type="button" class="min-h-11 rounded-lg bg-wedding-primary px-3 text-sm font-bold text-white disabled:opacity-50" disabled={saving() || !canSubmit() || (audience() === "public_review" && !preview())} onClick={() => void save("submit")}>{audience() === "public_review" ? "Submit public review" : "Save private feedback"}</button><Show when={status() && status()?.status !== "withdrawn"}><button type="button" class="min-h-11 rounded-lg border border-red-300 bg-white px-3 text-sm font-semibold text-red-800" disabled={saving()} onClick={() => void withdraw()}>Withdraw review</button></Show></div>
          <Show when={notice()}>{(message) => <p class="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900" role="status">{message()}</p>}</Show><Show when={error()}>{(message) => <p class="rounded-lg bg-red-50 p-3 text-sm text-red-900" role="alert">{message()}</p>}</Show>
        </div>
      </Show>
    </Show>
  </section>;
}
