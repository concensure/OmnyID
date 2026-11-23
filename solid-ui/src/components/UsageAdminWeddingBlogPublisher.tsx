// @locs-version: 1.0
import { createSignal, Show } from "solid-js";

import { WeddingConfirmDialog } from "@/components/WeddingConfirmDialog";
import { WeddingInlineHelpNote } from "@/components/WeddingInlineHelpNote";
import { publishWeddingBlogHtml } from "@/lib/weddingBlogAdminApi";

function slugFromFile(name: string): string {
  return name.replace(/\.html?$/i, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 96);
}

export default function UsageAdminWeddingBlogPublisher() {
  const [slug, setSlug] = createSignal("");
  const [title, setTitle] = createSignal("");
  const [summary, setSummary] = createSignal("");
  const [category, setCategory] = createSignal("planning");
  const [html, setHtml] = createSignal("");
  const [fileName, setFileName] = createSignal<string | null>(null);
  const [publishNow, setPublishNow] = createSignal(true);
  const [confirmOpen, setConfirmOpen] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [notice, setNotice] = createSignal<string | null>(null);
  const [publicUrl, setPublicUrl] = createSignal<string | null>(null);

  const ready = () => slug().length > 0 && title().trim().length >= 3 && summary().trim().length >= 10 && html().trim().length >= 20;

  async function chooseFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!/\.html?$/i.test(file.name) || file.size > 256 * 1024) {
      setNotice("Choose one .html file no larger than 256 KiB.");
      return;
    }
    const source = await file.text();
    setHtml(source);
    setFileName(file.name);
    if (!slug()) setSlug(slugFromFile(file.name));
    setNotice("HTML loaded locally. Nothing is uploaded until you confirm.");
  }

  async function submit() {
    setConfirmOpen(false);
    setBusy(true);
    setNotice(null);
    try {
      const result = await publishWeddingBlogHtml({
        slug: slug(), title: title(), summary: summary(), category: category(), html: html(),
        status: publishNow() ? "published" : "draft",
      });
      setPublicUrl(result.publicUrl);
      setNotice(`${publishNow() ? "Published" : "Draft saved"} as revision ${result.revision}. ${result.sanitization}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The article could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="mt-4 min-w-0 rounded-2xl border border-violet-200 bg-violet-50/60 p-3 sm:p-4">
      <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-violet-800/70">Wedding publishing</p>
      <h4 class="mt-1 text-base font-semibold text-slate-950">Publish an HTML wedding article</h4>
      <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-700">Articles are sanitised and stored in Postgres, not copied into the application worktree. A later source deploy therefore cannot remove them.</p>
      <WeddingInlineHelpNote class="mt-3">Upload content HTML only. Scripts, forms, iframes, event handlers and unsafe links are removed on the server before storage.</WeddingInlineHelpNote>
      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <label class="text-xs font-semibold text-slate-800">HTML file
          <input type="file" accept=".html,.htm,text/html" class="mt-1 block min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm" onChange={(event) => void chooseFile(event.currentTarget.files)} />
          <Show when={fileName()}>{(name) => <span class="mt-1 block font-normal text-slate-600">Loaded: {name()}</span>}</Show>
        </label>
        <label class="text-xs font-semibold text-slate-800">URL slug
          <input value={slug()} onInput={(event) => setSlug(slugFromFile(event.currentTarget.value))} placeholder="calm-wedding-planning" class="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-normal" />
        </label>
        <label class="text-xs font-semibold text-slate-800">Title
          <input value={title()} maxlength={140} onInput={(event) => setTitle(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-normal" />
        </label>
        <label class="text-xs font-semibold text-slate-800">Category
          <select value={category()} onChange={(event) => setCategory(event.currentTarget.value)} class="mt-1 min-h-11 w-full rounded-xl border border-violet-200 bg-white px-3 text-sm font-normal">
            <option value="planning">Planning</option><option value="budget">Budget</option><option value="legal">Legal &amp; Australia</option><option value="ai-trust">AI &amp; Trust</option><option value="vendors">Vendors</option><option value="etiquette">Etiquette</option><option value="real-weddings">Real weddings</option>
          </select>
        </label>
        <label class="text-xs font-semibold text-slate-800 md:col-span-2">Summary
          <textarea value={summary()} maxlength={320} onInput={(event) => setSummary(event.currentTarget.value)} class="mt-1 min-h-24 w-full rounded-xl border border-violet-200 bg-white p-3 text-sm font-normal" />
        </label>
      </div>
      <label class="mt-3 flex min-h-11 items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 text-sm font-semibold text-slate-800">
        <input type="checkbox" checked={publishNow()} onChange={(event) => setPublishNow(event.currentTarget.checked)} class="h-4 w-4 accent-violet-800" /> Publish immediately on omnyid.com/wedding
      </label>
      <button type="button" disabled={!ready() || busy()} class="mt-3 min-h-11 rounded-xl bg-violet-800 px-4 text-sm font-bold text-white disabled:opacity-50" onClick={() => setConfirmOpen(true)}>{publishNow() ? "Review publication" : "Review draft save"}</button>
      <Show when={notice()}>{(message) => <p class="mt-2 text-sm font-semibold text-slate-700" role="status">{message()}</p>}</Show>
      <Show when={publicUrl()}>{(url) => <a class="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-violet-900 underline" href={url()} target="_blank" rel="noopener noreferrer">Open published article</a>}</Show>
      <WeddingConfirmDialog open={confirmOpen()} title={publishNow() ? "Publish this article now?" : "Save this article as a draft?"} detail={publishNow() ? `This will make “${title()}” public at /wedding/published/${slug()}. Existing content with this slug will be replaced with a new revision.` : "This stores a private operator draft. It will not appear on the public wedding site."} confirmLabel={publishNow() ? "Publish article" : "Save draft"} busy={busy()} onCancel={() => setConfirmOpen(false)} onConfirm={() => void submit()} />
    </section>
  );
}
