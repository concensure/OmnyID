import { Show, createSignal } from "solid-js";
import { extractInlineKnowledgeText } from "../../lib/knowledgeAttachmentExtract";
import {
  QuotationRevisionUploadError, uploadQuotationRevision,
  type QuotationResponseSession, type QuotationRevisionReceipt,
} from "../../lib/quotationResponseSessionApi";

type Props = { session: QuotationResponseSession };

function extension(name: string): string {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export default function VendorRevisionUpload(props: Props) {
  const [file, setFile] = createSignal<File | null>(null);
  const [uploading, setUploading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [receipt, setReceipt] = createSignal<QuotationRevisionReceipt | null>(null);

  async function upload() {
    const selected = file();
    if (!selected || uploading()) return;
    setUploading(true);
    setError(null);
    try {
      const ext = extension(selected.name);
      let extractedText: string | undefined;
      if (ext === "pdf" || ext === "docx") {
        try {
          extractedText = (await extractInlineKnowledgeText(selected))?.text;
        } catch {
          if (ext === "docx") {
            throw new QuotationRevisionUploadError(
              "This DOCX could not be read safely. Save it as PDF or plain text, or reply by email.",
            );
          }
        }
      }
      setReceipt(await uploadQuotationRevision(props.session, selected, extractedText));
    } catch (caught) {
      setError(caught instanceof QuotationRevisionUploadError
        ? caught.message
        : "The document could not be prepared. Your typed response is unchanged.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <fieldset class="qr-upload">
      <legend>Revised quotation document (optional)</legend>
      <p class="qr-muted">Attach one PDF, DOCX, PNG, JPEG, WebP, or text file, up to 25 MiB. It will be reviewed with your typed response.</p>
      <Show when={!receipt()} fallback={
        <div class="qr-upload-receipt" role="status">
          <strong>Document prepared for review</strong>
          <span>{receipt()!.fileName}</span>
          <small>No booking, acceptance, or payment has occurred.</small>
        </div>
      }>
        <label for="quotation-revision-file">Quotation file</label>
        <input id="quotation-revision-file" type="file"
          accept=".pdf,.docx,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/png,image/jpeg,image/webp,text/plain,text/csv"
          disabled={uploading()}
          onChange={(event) => { setFile(event.currentTarget.files?.[0] ?? null); setError(null); }} />
        <button class="qr-secondary" type="button" disabled={!file() || uploading()} onClick={upload}>
          {uploading() ? "Checking document..." : "Prepare document"}
        </button>
      </Show>
      <Show when={error()}>{(message) => <p class="qr-upload-error" role="alert">{message()}</p>}</Show>
      <p class="qr-muted">If upload is unavailable, your typed fields stay here. You can retry or reply to the original email.</p>
    </fieldset>
  );
}
