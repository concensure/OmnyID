// @locs-version: 1.0
import { createResource, createSignal, For, Show } from "solid-js";

import { WeddingInlineHelpNote } from "@/components/WeddingInlineHelpNote";
import {
  downloadWeddingQuoteStudyDocument,
  listWeddingQuoteStudySubmissions,
  type WeddingQuoteStudySubmission,
} from "@/lib/weddingQuoteStudyAdminApi";

function bytesLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function evidenceLabel(submission: WeddingQuoteStudySubmission): string {
  const result = submission.analysis_result;
  const label = result && typeof result.confidence_label === "string" ? result.confidence_label : "No result summary";
  return label;
}

export default function UsageAdminWeddingQuoteStudyPanel() {
  const [submissions, { refetch }] = createResource(listWeddingQuoteStudySubmissions);
  const [busyId, setBusyId] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);

  async function download(submission: WeddingQuoteStudySubmission) {
    setBusyId(submission.submission_id);
    setNotice(null);
    try {
      await downloadWeddingQuoteStudyDocument(submission);
      setNotice(`Downloaded ${submission.file_name}. Treat the unencrypted study source as confidential.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The quote document could not be downloaded.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section class="mt-4 min-w-0 rounded-2xl border border-amber-200 bg-amber-50/65 p-3 sm:p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-900/70">Consented research documents</p>
          <h4 class="mt-1 text-base font-semibold text-slate-950">Wedding quote study uploads</h4>
          <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-700">Only submissions carrying the current explicit study and administrator-access consent appear here.</p>
        </div>
        <button type="button" class="min-h-11 rounded-xl border border-amber-300 bg-white px-4 text-sm font-bold text-amber-950" disabled={submissions.loading} onClick={() => void refetch()}>Refresh</button>
      </div>
      <WeddingInlineHelpNote class="mt-3">Originals are intentionally unencrypted for authorised review, but remain private SeaweedFS objects. Download only when required, do not redistribute, and honour deletion requests immediately.</WeddingInlineHelpNote>
      <Show when={submissions.error}><p class="mt-3 text-sm font-semibold text-rose-800" role="alert">{String(submissions.error)}</p></Show>
      <Show when={!submissions.loading && (submissions()?.length ?? 0) === 0}><p class="mt-3 rounded-xl bg-white p-4 text-sm text-slate-700">No consented quote-study documents are available.</p></Show>
      <div class="mt-3 grid gap-3">
        <For each={submissions() ?? []}>{(submission) => (
          <article class="rounded-xl border border-amber-200 bg-white p-3">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <h5 class="break-words text-sm font-bold text-slate-950">{submission.file_name}</h5>
                <p class="mt-1 text-xs text-slate-600">{submission.quote_category === "venue" ? "Venue quote" : "Other vendor quote"} · {bytesLabel(submission.size_bytes)} · {submission.analysis_status}</p>
                <p class="mt-1 break-all font-mono text-[10px] text-slate-500">Receipt {submission.public_receipt_id} · SHA-256 {submission.content_sha256}</p>
              </div>
              <button type="button" class="min-h-11 rounded-xl bg-amber-900 px-4 text-sm font-bold text-white disabled:opacity-50" disabled={busyId() === submission.submission_id} onClick={() => void download(submission)}>{busyId() === submission.submission_id ? "Preparing…" : "Download consented original"}</button>
            </div>
            <p class="mt-2 text-sm text-slate-700">{evidenceLabel(submission)}</p>
            <p class="mt-1 text-xs text-slate-500">Consent {submission.consent_version} recorded {new Date(submission.consented_at).toLocaleString()} · {submission.model ?? "No model receipt"}</p>
            <Show when={submission.failure_code}><p class="mt-2 text-xs font-semibold text-rose-800">Analysis failure: {submission.failure_code}</p></Show>
          </article>
        )}</For>
      </div>
      <Show when={notice()}>{(message) => <p class="mt-3 text-sm font-semibold text-slate-700" role="status">{message()}</p>}</Show>
    </section>
  );
}
