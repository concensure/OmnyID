// @locs-version: 1.0
import { createMemo, createSignal, Show } from "solid-js";
import { sendAfpMessage } from "@/lib/api";
import {
  buildDatabaseExportSnapshot,
  databaseSnapshotEmailBody,
  databaseSnapshotHtml,
  databaseSnapshotSvg,
  type DatabaseExportRow,
} from "@/lib/databaseExportState";

function safeFilename(value: string): string {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "database";
}

function download(content: string, mimeType: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export function DatabaseExportShareControls(props: {
  databaseId: string;
  name: string;
  tableLabel?: string | null;
  columns: string[];
  rows: DatabaseExportRow[];
  senderAgentId?: string | null;
}) {
  const [open, setOpen] = createSignal(false);
  const [recipient, setRecipient] = createSignal("");
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal("");
  const snapshot = createMemo(() => buildDatabaseExportSnapshot({
    databaseId: props.databaseId, name: props.name, tableLabel: props.tableLabel,
    columns: props.columns, rows: props.rows,
  }));

  function exportImage() {
    download(databaseSnapshotSvg(snapshot()), "image/svg+xml", `${safeFilename(props.name)}.svg`);
    setNotice("Downloaded a scalable image of this database view.");
  }

  function printPdf() {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    if (!popup) { setNotice("Allow pop-ups to open the printable PDF view."); return; }
    popup.document.write(databaseSnapshotHtml(snapshot()).replace("</body>", "<script>window.onload=()=>window.print();<\/script></body>"));
    popup.document.close();
    setNotice("Opened the browser print dialog. Choose Save as PDF to export.");
  }

  async function share() {
    const target = recipient().trim();
    if (!target) { setNotice("Enter an email address or an OmnyID agent ID."); return; }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      const href = `mailto:${encodeURIComponent(target)}?subject=${encodeURIComponent(`${props.name} database view`)}&body=${encodeURIComponent(databaseSnapshotEmailBody(snapshot()))}`;
      window.location.href = href;
      setNotice("Opened your email app with a bounded database preview. Review it before sending.");
      return;
    }
    if (!target.startsWith("agent:") || !props.senderAgentId) {
      setNotice("Use a valid email address or an agent ID beginning with agent:.");
      return;
    }
    setBusy(true); setNotice("");
    try {
      const createdAt = new Date().toISOString();
      await sendAfpMessage({
        thread_id: `database-share:${props.databaseId}:${target}`,
        from: props.senderAgentId,
        to: [target], timestamp: createdAt, type: "database_view_share", kind: "database_view_share",
        content: { kind: "database_view_share", snapshot: snapshot(), review_required: true },
        views: [], attachments: [], supertags: ["database", "explicit_share"],
        metadata: { database_id: props.databaseId, explicit_user_share: true },
      });
      setNotice("Shared this bounded view with the selected OmnyID agent. The source database remains private.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The agent share could not be sent.");
    } finally { setBusy(false); }
  }

  return <section class="rounded-xl border border-outline/15 bg-white/55 p-3" aria-label="Export or share database">
    <div class="flex flex-wrap items-center justify-between gap-2"><div><p class="text-sm font-semibold text-on-surface">Export or share this view</p><p class="text-xs leading-5 text-on-surface-variant">Exports reflect the currently selected database and table. Review external copies before sending.</p></div><button type="button" onClick={() => setOpen((value) => !value)} class="min-h-10 rounded-full border border-primary/25 bg-white px-4 text-xs font-semibold text-primary">{open() ? "Close" : "Export or share"}</button></div>
    <Show when={open()}><div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <button type="button" onClick={exportImage} class="min-h-11 rounded-xl border border-primary/20 bg-white px-3 text-sm font-semibold text-primary">Download image</button>
      <button type="button" onClick={printPdf} class="min-h-11 rounded-xl border border-primary/20 bg-white px-3 text-sm font-semibold text-primary">Print / save PDF</button>
      <label class="sm:col-span-2 text-xs font-semibold text-on-surface-variant">Email or agent ID<input value={recipient()} onInput={(event) => setRecipient(event.currentTarget.value)} placeholder="name@example.com or agent:…" class="mt-1 min-h-11 w-full rounded-xl border border-outline/20 bg-white px-3 text-sm text-on-surface" /></label>
      <button type="button" disabled={busy()} onClick={() => void share()} class="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-start-4">{busy() ? "Sharing…" : "Share"}</button>
    </div></Show>
    <Show when={notice()}><p role="status" class="mt-2 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-on-surface-variant">{notice()}</p></Show>
  </section>;
}
