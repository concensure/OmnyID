(() => {
  "use strict";
  const form = document.querySelector("[data-quote-study-form]");
  if (!form) return;
  const byId = (id) => document.getElementById(id);
  const status = byId("quoteStudyStatus");
  const submit = byId("quoteStudySubmit");
  const consentCopy = byId("quoteStudyConsentCopy");
  const consentVersion = byId("quoteStudyConsentVersion");
  const filePanel = byId("quoteStudyFilePanel");
  const textPanel = byId("quoteStudyTextPanel");
  const results = byId("quoteStudyResults");
  const resultBody = byId("quoteStudyResultBody");
  const receipt = byId("quoteStudyReceipt");
  const downloadReceipt = byId("quoteStudyDownloadReceipt");
  const deleteButton = byId("quoteStudyDelete");
  const dialog = byId("quoteStudyDeleteDialog");
  const cancelDelete = byId("quoteStudyCancelDelete");
  const confirmDelete = byId("quoteStudyConfirmDelete");
  let notice = null;
  let currentReceipt = null;
  let restoreFocus = null;
  submit.disabled = true;
  downloadReceipt.disabled = true;
  deleteButton.disabled = true;

  const setStatus = (message, kind = "") => {
    status.textContent = message;
    status.dataset.kind = kind;
  };
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const cleanArray = (value) => Array.isArray(value) ? value.filter((item) => item && typeof item === "object") : [];

  function syncSource() {
    const mode = form.querySelector('input[name="source_mode"]:checked')?.value || "file";
    filePanel.hidden = mode !== "file";
    textPanel.hidden = mode !== "text";
    byId("quoteStudyFile").required = mode === "file";
    byId("quoteStudyText").required = mode === "text";
  }

  function listCard(title, items, render) {
    const card = node("section", "", "quote-study-result-card");
    card.append(node("h3", title));
    if (!items.length) {
      card.append(node("p", "Nothing was confidently identified in this section."));
      return card;
    }
    const list = node("ul");
    items.forEach((item) => list.append(render(item)));
    card.append(list);
    return card;
  }

  function renderAnalysis(analysis) {
    resultBody.replaceChildren();
    const summary = node("div", "", "quote-study-summary");
    summary.append(node("strong", typeof analysis.confidence_label === "string" ? analysis.confidence_label : "Review the evidence and unknowns below."));
    summary.append(node("p", "Unknown items are questions to confirm with the vendor, not assumed costs."));
    resultBody.append(summary);
    const grid = node("div", "", "quote-study-result-grid");
    grid.append(listCard("Extracted facts and interpretations", cleanArray(analysis.facts), (item) => {
      const li = node("li");
      li.append(node("strong", `${item.label || "Quoted item"}: `));
      li.append(document.createTextNode(String(item.value || "Not confirmed")));
      if (item.evidence_state !== "confirmed") li.append(node("p", "Needs confirmation — this is not a directly confirmed quote fact."));
      if (item.exact_excerpt) {
        const details = node("details");
        details.append(node("summary", "Show quote evidence"), node("p", String(item.exact_excerpt)));
        li.append(details);
      }
      return li;
    }));
    const evidenceItem = (item) => {
      const li = node("li");
      li.append(node("strong", String(item.label || "Quoted item")));
      if (item.exact_excerpt) li.append(node("p", `“${String(item.exact_excerpt)}”`));
      return li;
    };
    grid.append(listCard("Explicitly stated as included", cleanArray(analysis.stated_inclusions), evidenceItem));
    grid.append(listCard("Explicitly stated as excluded", cleanArray(analysis.stated_exclusions), evidenceItem));
    grid.append(listCard("Missing or not confirmed", cleanArray(analysis.missing_material_items), (item) => {
      const li = node("li");
      li.append(node("strong", String(item.label || "Material item")), node("p", String(item.question || "Ask the vendor to confirm this term.")));
      return li;
    }));
    grid.append(listCard("Potential cost escalations", cleanArray(analysis.potential_cost_escalations), (item) => {
      const li = node("li");
      li.append(node("strong", String(item.label || "Cost term")), node("p", String(item.reason || "The final cost may change until this is confirmed.")));
      return li;
    }));
    grid.append(listCard("Unclear wording to review", cleanArray(analysis.unclear_or_unmapped_items), (item) => {
      const li = node("li");
      li.append(node("strong", String(item.label || "Unmapped quote wording")));
      if (item.exact_excerpt) li.append(node("p", `“${String(item.exact_excerpt)}”`));
      return li;
    }));
    resultBody.append(grid);
    const limitations = cleanArray(analysis.limitations).length ? analysis.limitations : (Array.isArray(analysis.limitations) ? analysis.limitations : []);
    if (limitations.length) {
      const note = node("div", "", "quote-study-result-card");
      note.append(node("h3", "Keep in mind"));
      const list = node("ul");
      limitations.forEach((item) => list.append(node("li", String(item))));
      note.append(list);
      resultBody.append(note);
    }
  }

  function showReceipt(payload) {
    currentReceipt = { receipt_id: payload.receipt_id, deletion_token: payload.deletion_token, saved_at: new Date().toISOString() };
    receipt.textContent = `Receipt ${payload.receipt_id}. Download and keep the private deletion token; it is not shown again after this page closes.`;
    downloadReceipt.disabled = false;
    deleteButton.disabled = false;
  }

  async function loadNotice() {
    try {
      const response = await fetch("/wedding/quote-study/notice", { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error();
      notice = await response.json();
      consentCopy.textContent = notice.consent_notice;
      consentVersion.value = notice.consent_version;
      submit.disabled = !notice.enabled;
      setStatus(notice.enabled ? "Ready when you are. Nothing is uploaded until you select Analyse my quote." : "The research preview is not accepting quotes yet.", notice.enabled ? "success" : "");
    } catch (_) {
      submit.disabled = true;
      setStatus("Quote analysis is temporarily unavailable. The consent and storage notice remains above; no quote has been uploaded.", "error");
    }
  }

  form.querySelectorAll('input[name="source_mode"]').forEach((input) => input.addEventListener("change", syncSource));
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!notice?.enabled || !form.reportValidity()) return;
    submit.disabled = true;
    results.hidden = true;
    setStatus("Checking and analysing your quote. A PDF or image may take a minute…");
    const data = new FormData();
    data.set("quote_category", byId("quoteStudyCategory").value);
    data.set("consent_version", consentVersion.value);
    data.set("study_consent", byId("quoteStudyConsent").checked ? "true" : "false");
    data.set("authority_confirmed", byId("quoteStudyAuthority").checked ? "true" : "false");
    data.set("website", byId("quoteStudyWebsite").value);
    const mode = form.querySelector('input[name="source_mode"]:checked')?.value;
    if (mode === "text") data.set("quote_text", byId("quoteStudyText").value);
    else data.set("file", byId("quoteStudyFile").files[0]);
    try {
      const response = await fetch("/wedding/quote-study", { method: "POST", body: data });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || payload.error || "Your quote could not be analysed.");
      showReceipt(payload);
      if (payload.analysis) {
        renderAnalysis(payload.analysis);
        setStatus("Your evidence-led quote summary is ready.", "success");
      } else {
        resultBody.replaceChildren(node("p", payload.message || "Analysis could not finish. Keep your receipt for support or deletion."));
        setStatus("The quote was received, but analysis could not finish.", "error");
      }
      results.hidden = false;
      results.focus();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Your quote could not be analysed.", "error");
    } finally {
      submit.disabled = !notice?.enabled;
    }
  });

  downloadReceipt.addEventListener("click", () => {
    if (!currentReceipt) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(currentReceipt, null, 2) + "\n"], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${currentReceipt.receipt_id}-deletion-receipt.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 4_000);
  });
  deleteButton.addEventListener("click", () => {
    if (!currentReceipt) return;
    restoreFocus = document.activeElement;
    dialog.hidden = false;
    cancelDelete.focus();
  });
  cancelDelete.addEventListener("click", () => {
    dialog.hidden = true;
    restoreFocus?.focus();
  });
  confirmDelete.addEventListener("click", async () => {
    if (!currentReceipt) return;
    confirmDelete.disabled = true;
    try {
      const response = await fetch("/wedding/quote-study", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(currentReceipt) });
      if (!response.ok) throw new Error(await response.text() || "The quote could not be deleted yet.");
      currentReceipt = null;
      dialog.hidden = true;
      results.hidden = true;
      form.reset();
      syncSource();
      setStatus("Your original quote and analysis were deleted.", "success");
      submit.focus();
    } catch (error) {
      dialog.hidden = true;
      setStatus(error instanceof Error ? error.message : "The quote could not be deleted yet.", "error");
    } finally {
      confirmDelete.disabled = false;
    }
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") cancelDelete.click();
  });

  syncSource();
  void loadNotice();
})();
