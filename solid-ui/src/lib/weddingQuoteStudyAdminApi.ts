// @locs-version: 1.0
import { apiFetch, apiUrlForPath, sessionBearerToken } from "@/lib/api";

export type WeddingQuoteStudySubmission = {
  submission_id: string;
  public_receipt_id: string;
  source_mode: "file" | "pasted_text";
  quote_category: "venue" | "other";
  file_name: string;
  mime_type: string;
  size_bytes: number;
  content_sha256: string;
  consent_version: string;
  consented_at: string;
  analysis_status: "processing" | "completed" | "failed";
  analysis_result: Record<string, unknown> | null;
  provider: string | null;
  model: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  failure_code: string | null;
  created_at: string;
  analysed_at: string | null;
};

export const listWeddingQuoteStudySubmissions = () =>
  apiFetch<{ submissions: WeddingQuoteStudySubmission[] }>("/admin/wedding/quote-study")
    .then((value) => Array.isArray(value.submissions) ? value.submissions : []);

export async function downloadWeddingQuoteStudyDocument(submission: WeddingQuoteStudySubmission): Promise<void> {
  const headers = new Headers();
  const token = sessionBearerToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(apiUrlForPath(`/admin/wedding/quote-study/${encodeURIComponent(submission.submission_id)}/document`), {
    credentials: "include",
    headers,
  });
  if (!response.ok) throw new Error(await response.text() || "The quote document could not be downloaded.");
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = submission.file_name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 4_000);
}
