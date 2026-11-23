import { createSignal, onMount, Show } from "solid-js";
import type { PDFDocumentProxy } from "pdfjs-dist";

const BINDER_URL = "/wedding/downloads/wedding-day-binder-print.pdf";
const PDF_WORKER_SRC = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

export default function UsageAdminWeddingBinderCobrandPanel() {
  let canvas: HTMLCanvasElement | undefined;
  let pdf: PDFDocumentProxy | undefined;
  let logo: HTMLImageElement | undefined;
  const [logoReady, setLogoReady] = createSignal(false);
  const [page, setPage] = createSignal(1);
  const [pageCount, setPageCount] = createSignal(0);
  const [logoScale, setLogoScale] = createSignal(18);
  const [alignment, setAlignment] = createSignal<"left" | "centre" | "right">("centre");
  const [status, setStatus] = createSignal("Loading the print binder…");
  const [busy, setBusy] = createSignal(true);

  const drawLogo = (context: CanvasRenderingContext2D, width: number, height: number) => {
    if (!logo) return;
    const targetWidth = Math.min(width * (logoScale() / 100), logo.naturalWidth);
    const targetHeight = targetWidth * (logo.naturalHeight / logo.naturalWidth);
    const footerHeight = Math.max(targetHeight + 24, height * 0.055);
    const y = height - footerHeight + (footerHeight - targetHeight) / 2;
    const margin = width * 0.045;
    const x = alignment() === "left" ? margin : alignment() === "right" ? width - margin - targetWidth : (width - targetWidth) / 2;
    context.save();
    context.fillStyle = "rgba(255,255,255,0.94)";
    context.fillRect(0, height - footerHeight, width, footerHeight);
    context.drawImage(logo, x, y, targetWidth, targetHeight);
    context.restore();
  };

  const renderPage = async (nextPage = page()) => {
    if (!pdf || !canvas) return;
    const safePage = Math.max(1, Math.min(nextPage, pdf.numPages));
    setBusy(true);
    setStatus(`Rendering page ${safePage}…`);
    try {
      const pdfPage = await pdf.getPage(safePage);
      const viewport = pdfPage.getViewport({ scale: 1.65 });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas preview is unavailable in this browser.");
      await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
      drawLogo(context, canvas.width, canvas.height);
      setPage(safePage);
      setStatus(logo ? `Page ${safePage} preview includes the uploaded footer logo.` : `Page ${safePage} is ready. Add a logo to create the co-branded preview.`);
    } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : "The binder preview could not be rendered.");
    } finally {
      setBusy(false);
    }
  };

  onMount(() => {
    void (async () => {
      try {
        const response = await fetch(BINDER_URL, { credentials: "same-origin" });
        if (!response.ok) throw new Error(`The print binder could not be loaded (${response.status}).`);
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
        pdf = await pdfjs.getDocument({ data: await response.arrayBuffer() }).promise;
        setPageCount(pdf.numPages);
        await renderPage(1);
      } catch (reason) {
        setStatus(reason instanceof Error ? reason.message : "The print binder could not be loaded.");
        setBusy(false);
      }
    })();
  });

  const chooseLogo = (file: File | undefined) => {
    if (!file) return;
    if (!(["image/png", "image/jpeg", "image/webp"].includes(file.type)) || file.size > 5 * 1024 * 1024) {
      setStatus("Choose a PNG, JPEG or WebP logo no larger than 5 MB.");
      return;
    }
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      logo = image;
      setLogoReady(true);
      void renderPage();
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      setStatus("That logo could not be read. Try a PNG or JPEG file.");
    };
    image.src = objectUrl;
  };

  const download = (format: "png" | "jpeg") => {
    if (!canvas || !logo) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `omnyid-wedding-binder-cobranded-page-${String(page()).padStart(2, "0")}.${format === "jpeg" ? "jpg" : "png"}`;
      anchor.click();
      URL.revokeObjectURL(url);
    }, `image/${format}`, format === "jpeg" ? 0.94 : undefined);
  };

  return <section class="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="admin-binder-cobrand-title">
    <div><h2 id="admin-binder-cobrand-title" class="font-semibold text-slate-950">Day-of binder co-branding</h2><p class="mt-1 text-sm text-slate-600">Add an authorised celebrant logo to the footer, inspect any original binder page, then save that page as a PNG or JPG sample. The source PDF is never changed.</p></div>
    <div class="mt-4 grid gap-4 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <div class="space-y-3">
        <label class="block text-sm font-semibold">Celebrant logo<input type="file" accept="image/png,image/jpeg,image/webp" class="mt-1 block w-full rounded-lg border p-2 text-xs font-normal" onChange={(event) => chooseLogo(event.currentTarget.files?.[0])} /></label>
        <label class="block text-sm font-semibold">Preview page<input type="number" min="1" max={Math.max(1, pageCount())} value={page()} disabled={!pageCount() || busy()} class="mt-1 min-h-11 w-full rounded-lg border px-3 font-normal" onChange={(event) => void renderPage(Number(event.currentTarget.value))} /></label>
        <div class="grid grid-cols-2 gap-2"><button type="button" disabled={page() <= 1 || busy()} class="min-h-11 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50" onClick={() => void renderPage(page() - 1)}>Previous</button><button type="button" disabled={page() >= pageCount() || busy()} class="min-h-11 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50" onClick={() => void renderPage(page() + 1)}>Next</button></div>
        <label class="block text-sm font-semibold">Logo width: {logoScale()}%<input type="range" min="8" max="36" value={logoScale()} class="mt-2 w-full" onInput={(event) => { setLogoScale(Number(event.currentTarget.value)); void renderPage(); }} /></label>
        <label class="block text-sm font-semibold">Footer position<select value={alignment()} class="mt-1 min-h-11 w-full rounded-lg border bg-white px-3 font-normal" onChange={(event) => { setAlignment(event.currentTarget.value as "left" | "centre" | "right"); void renderPage(); }}><option value="left">Left</option><option value="centre">Centre</option><option value="right">Right</option></select></label>
        <div class="grid grid-cols-2 gap-2"><button type="button" disabled={!logoReady() || busy()} class="min-h-11 rounded-lg bg-slate-900 px-3 text-sm font-semibold text-white disabled:opacity-50" onClick={() => download("png")}>Save PNG</button><button type="button" disabled={!logoReady() || busy()} class="min-h-11 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50" onClick={() => download("jpeg")}>Save JPG</button></div>
        <p class="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-950">Use only logos you have permission to reproduce. Keep OmnyID attribution in the binder, and treat this export as a co-branded page preview—not an endorsement or a new licence to redistribute the full binder.</p>
      </div>
      <div class="min-w-0"><p class="mb-2 text-sm text-slate-600" role="status">{status()}</p><div class="max-h-[70vh] overflow-auto rounded-xl border bg-slate-100 p-2"><canvas ref={canvas} class="mx-auto h-auto max-w-full bg-white shadow" aria-label={`Co-branded binder preview, page ${page()} of ${pageCount() || "unknown"}`} /></div><Show when={pageCount()}><p class="mt-2 text-center text-xs text-slate-500">Page {page()} of {pageCount()}</p></Show></div>
    </div>
  </section>;
}
