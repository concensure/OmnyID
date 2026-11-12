(() => {
  "use strict";
  const form = document.querySelector("[data-quote-study-form]");
  if (!form) return;

  const byId = (id) => document.getElementById(id);
  const status = byId("quoteStudyStatus");
  const submit = byId("quoteStudySubmit");
  const results = byId("quoteStudyResults");
  const resultBody = byId("quoteStudyResultBody");
  const quoteText = byId("quoteStudyText");
  const quoteFile = byId("quoteStudyFile");
  const guestCount = byId("quoteStudyGuests");
  const FIELD_LABELS = {
    pricing_model: "Pricing model",
    per_head_rate: "Per-person rate",
    guest_count: "Guest count stated in quote",
    whole_package_amount: "Whole-package amount",
    fixed_fee: "Fixed fee",
    minimum_spend: "Minimum spend",
    gst: "GST",
    service_charge_pct: "Service charge",
    venue_hours: "Venue hours",
    overtime_rate: "Overtime rate",
    payment_schedule: "Payment schedule",
  };

  const node = (tag, text = "", className = "") => {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const setStatus = (message, kind = "") => {
    status.textContent = message;
    status.dataset.kind = kind;
  };
  const moneyKeys = new Set(["per_head_rate", "whole_package_amount", "fixed_fee", "minimum_spend", "overtime_rate"]);
  const formatValue = (key, value) => {
    if (value === null || value === undefined || value === "") return "Not stated";
    if (moneyKeys.has(key) && Number.isFinite(Number(value))) return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(value));
    if (key === "service_charge_pct" && Number.isFinite(Number(value))) return `${Number(value)}%`;
    return String(value).replaceAll("_", " ");
  };
  const sourceBlock = (snippet) => {
    const block = node("blockquote", snippet, "quote-study-source-snippet");
    block.setAttribute("aria-label", "Exact wording from the quote");
    return block;
  };
  const quoteLengthIsReady = () => {
    const length = quoteText?.value?.trim().length ?? 0;
    return length >= 40 && length <= 20_000;
  };
  const refreshSubmitState = () => {
    if (!submit) return;
    submit.disabled = !quoteLengthIsReady();
    submit.setAttribute("aria-disabled", submit.disabled ? "true" : "false");
  };

  function renderEvidenceList(title, items) {
    const card = node("section", "", "quote-study-result-card");
    card.append(node("h3", title));
    if (!items.length) {
      card.append(node("p", "None identified in this section."));
      return card;
    }
    const list = node("ul");
    items.forEach((item) => {
      const li = node("li");
      li.append(node("strong", item.label || "Quoted item"));
      if (item.value !== undefined && item.value !== null) li.append(document.createTextNode(`: ${item.value}`));
      else if (item.amount !== undefined && item.amount !== null) li.append(document.createTextNode(`: ${formatValue("fixed_fee", item.amount)}${item.unit ? ` · ${String(item.unit).replaceAll("_", " ")}` : ""}`));
      if (item.source_snippet) li.append(sourceBlock(String(item.source_snippet)));
      list.append(li);
    });
    card.append(list);
    return card;
  }

  function renderAnalysis(payload) {
    resultBody.replaceChildren();
    const summary = node("div", "", "quote-study-summary");
    summary.append(node("strong", "Evidence-backed extraction complete"));
    summary.append(node("p", "Check each exact source excerpt. Missing wording remains unknown; it is never treated as free or included."));
    resultBody.append(summary);

    const grid = node("div", "", "quote-study-result-grid");
    const found = node("section", "", "quote-study-result-card");
    found.append(node("h3", "Commercial terms found"));
    const foundList = node("div", "", "quote-study-term-list");
    const missing = [];
    Object.entries(FIELD_LABELS).forEach(([key, label]) => {
      const field = payload.fields?.[key];
      if (!field || field.state === "not_found" || field.value === null || field.value === undefined) {
        missing.push(label);
        return;
      }
      const item = node("article", "", "quote-study-term");
      item.append(node("strong", label), node("p", formatValue(key, field.value)));
      if (field.source_snippet) item.append(sourceBlock(String(field.source_snippet)));
      if (field.state === "ambiguous") item.append(node("p", `Needs confirmation: ${field.reason || "the wording is ambiguous."}`, "quote-study-caution"));
      foundList.append(item);
    });
    if (!foundList.childElementCount) foundList.append(node("p", "No commercial term was grounded strongly enough to show as extracted."));
    found.append(foundList);

    const gaps = node("section", "", "quote-study-result-card");
    gaps.append(node("h3", "Not stated or not safely identified"));
    const gapList = node("ul");
    missing.forEach((label) => gapList.append(node("li", label)));
    gaps.append(gapList.childElementCount ? gapList : node("p", "All core fields were addressed; still verify them against the original quote."));
    grid.append(found, gaps);
    grid.append(renderEvidenceList("Line items", Array.isArray(payload.line_items) ? payload.line_items : []));
    grid.append(renderEvidenceList("Inclusions", Array.isArray(payload.inclusions) ? payload.inclusions : []));
    grid.append(renderEvidenceList("Exclusions", Array.isArray(payload.exclusions) ? payload.exclusions : []));
    resultBody.append(grid);

    const next = node("p", "", "quote-study-next");
    next.append(document.createTextNode("Want deterministic totals or a side-by-side comparison? "));
    const link = node("a", "Open the full Wedding Venue Quote Decoder");
    link.href = "/wedding/compare-wedding-venue-quotes.html";
    next.append(link, document.createTextNode(". Arithmetic is calculated in the browser, not by the AI model."));
    resultBody.append(next);
  }

  quoteFile?.addEventListener("change", async () => {
    const file = quoteFile.files?.[0];
    if (!file) return;
    if (file.size > 96 * 1024) {
      quoteFile.value = "";
      setStatus("Choose a text-based quote smaller than 96 KB, or paste the relevant wording.", "error");
      return;
    }
    try {
      quoteText.value = await file.text();
      quoteText.dispatchEvent(new Event("input", { bubbles: true }));
      refreshSubmitState();
      setStatus(`${file.name} was read on this device. Nothing is sent until you choose Analyse quote.`, "success");
    } catch (_) {
      setStatus("That file could not be read as text. Paste the quote wording instead.", "error");
    }
  });

  quoteText?.addEventListener("input", refreshSubmitState);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const text = quoteText.value.trim();
    if (text.length < 40 || text.length > 20_000) {
      setStatus("Paste between 40 and 20,000 characters of quote wording.", "error");
      quoteText.focus();
      return;
    }
    submit.disabled = true;
    results.hidden = true;
    setStatus("Analysing the quote against exact source wording…");
    try {
      const response = await fetch("/wedding/quote-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          proposal: byId("quoteStudyCategory").value,
          text,
          comparison_guests: guestCount.value ? Number(guestCount.value) : null,
          company: byId("quoteStudyWebsite").value,
        }),
      });
      const responseText = await response.text();
      let payload = {};
      try { payload = responseText ? JSON.parse(responseText) : {}; } catch (_) { payload = { error: responseText }; }
      if (!response.ok) throw new Error(payload.error || payload.message || "Quote analysis is temporarily unavailable.");
      if (payload.schema_version !== "quote-extraction.v2") throw new Error("The quote analyser returned an unsupported result.");
      renderAnalysis(payload);
      results.hidden = false;
      results.focus();
      setStatus("Your source-grounded quote summary is ready. OmnyID did not retain the proposal text.", "success");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Quote analysis is temporarily unavailable.", "error");
    } finally {
      refreshSubmitState();
    }
  });

  refreshSubmitState();
  setStatus("Ready. Paste quote wording or choose a text file to enable Analyse quote. Nothing is sent until you choose Analyse quote.", "success");
})();
