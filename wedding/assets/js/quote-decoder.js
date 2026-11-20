(function () {
  "use strict";

  const engine = window.OmnyVenueQuoteEngine;
  const form = document.querySelector("[data-quote-decoder]");
  if (!form || !engine) return;

  const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });
  const totalText = (result) => result.estimatedTotal == null ? "Not enough pricing stated" : money.format(result.estimatedTotal);
  const CACHE_KEY = "omnyid.wedding.quoteExtractionCache.v2";
  const CHOICE_KEY = "omnyid.wedding.quoteComparisonChoice.v1";
  const PDFJS_VERSION = "6.0.227";
  const PDFJS_MODULE_URL = `/wedding/assets/vendor/pdfjs/pdf.min.mjs?v=${PDFJS_VERSION}`;
  const PDFJS_WORKER_URL = `/wedding/assets/vendor/pdfjs/pdf.worker.min.mjs?v=${PDFJS_VERSION}`;
  const MAX_LOCAL_PDF_BYTES = 10_000_000;
  const MAX_LOCAL_PDF_PAGES = 80;
  const MAX_LOCAL_TEXT_CHARACTERS = 100_000;
  const fieldConfig = [
    ["pricing_model", "Pricing model", "select", [["unclear", "Not stated / unclear"], ["per_head", "Per-head package"], ["fixed", "Fixed or whole-package"], ["minimum_spend", "Minimum spend"], ["hybrid", "Fixed plus per-head"]]],
    ["per_head_rate", "Per-head package rate (AUD)", "number"],
    ["guest_count", "Guest count stated in quote", "number"],
    ["whole_package_amount", "Whole-package amount (AUD)", "number", null, "Only use an amount the proposal explicitly calls its package or grand total. Component subtotals belong in the line-item table."],
    ["fixed_fee", "Fixed or venue-hire fee (AUD)", "number"],
    ["minimum_spend", "Minimum spend (AUD)", "number", null, "A minimum spend is a payment floor, not the final quote total."],
    ["gst", "GST", "select", [["not_stated", "Not stated"], ["included", "Included"], ["excluded", "Excluded"], ["unclear", "Unclear"]]],
    ["service_charge_pct", "Service charge (%)", "number"],
    ["venue_hours", "Venue/package hours included", "number"],
    ["overtime_rate", "Overtime per hour (AUD)", "number"],
    ["payment_schedule", "Payment schedule", "text"],
    ["deposit_amount", "Deposit amount (AUD)", "number", null, "A deposit is a payment toward the total, not an extra charge. It is shown separately and never counted twice."],
    ["deposit_pct", "Deposit percentage (%)", "number"],
    ["deposit_due", "Deposit due date", "date"],
    ["cancellation_terms", "Cancellation and reschedule terms", "text"],
    ["quote_expiry", "Quote valid until", "date"],
    ["quoted_event_date", "Event date stated in quote", "date"],
    ["date_status", "Date eligibility", "select", [["not_stated", "Not stated"], ["available", "Vendor says available"], ["conditional", "Conditional / confirm again"], ["unavailable", "Vendor says unavailable"]]],
    ["minimum_guests", "Minimum guests", "number"],
    ["maximum_guests", "Maximum guests or capacity", "number"],
  ];
  const formName = (prefix, key) => `${prefix}_${key}`;
  const field = (name) => form.elements.namedItem(name);
  const value = (name) => String(field(name)?.value ?? "").trim();
  const escapeHtml = (text) => String(text ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const lineItems = { a: [], b: [] };
  const extracted = { a: null, b: null };
  const acceptedSources = { a: {}, b: {} };

  function mountFields(prefix) {
    const host = document.querySelector(`[data-commercial-fields="${prefix}"]`);
    host.innerHTML = fieldConfig.map(([key, label, type, options, help]) => {
      const name = formName(prefix, key);
      const helpMarkup = help ? `<span class="quote-field-help" role="img" aria-label="About ${escapeHtml(label)}: ${escapeHtml(help)}" title="${escapeHtml(help)}">i</span>` : "";
      const input = type === "select"
        ? `<select name="${name}" data-source-field="${prefix}:${key}">${options.map(([optionValue, optionLabel]) => `<option value="${optionValue}">${escapeHtml(optionLabel)}</option>`).join("")}</select>`
        : type === "text"
          ? `<textarea name="${name}" rows="2" maxlength="500" data-source-field="${prefix}:${key}" placeholder="Not stated"></textarea>`
          : type === "date"
            ? `<input name="${name}" type="date" data-source-field="${prefix}:${key}">`
          : `<input name="${name}" type="number" min="0" ${key === "guest_count" ? 'max="5000"' : key === "service_charge_pct" ? 'max="100"' : key === "venue_hours" ? 'max="48"' : ''} step="1" inputmode="numeric" data-source-field="${prefix}:${key}" placeholder="Not stated">`;
      return `<label class="magnet-field"><span>${escapeHtml(label)} ${helpMarkup}</span>${input}<small class="quote-field-state" data-field-state="${prefix}:${key}">Not analysed</small></label>`;
    }).join("");
    const target = document.querySelector(`[data-selection-target="${prefix}"]`);
    target.innerHTML = fieldConfig.map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join("");
  }

  mountFields("a"); mountFields("b");

  function renderLineItems(prefix) {
    // Rebuilding the editable line-item table must never reset reviewed
    // commercial terms elsewhere in the proposal card. Preserve them
    // explicitly because some mobile WebKit form implementations rehydrate
    // nearby generated controls when a details subtree changes.
    const preservedCommercialValues = Object.fromEntries(fieldConfig.map(([key]) => {
      const control = field(formName(prefix, key));
      return [key, control ? control.value : ""];
    }));
    const host = document.querySelector(`[data-line-items="${prefix}"]`);
    const rows = lineItems[prefix];
    host.innerHTML = rows.length ? `<div class="quote-line-table-wrap"><table class="quote-line-table"><thead><tr><th>Item</th><th>Quoted status</th><th>Basis</th><th>Amount</th><th><span title="Tick only when this is additional to the package figures above">In quoted total</span></th><th>Scenario</th><th>Quantity</th><th><span title="Tick only when this item's spend counts toward the stated minimum">Counts toward minimum</span></th><th></th></tr></thead><tbody>${rows.map((row, index) => `<tr>
      <td><input data-line-label="${prefix}:${index}" value="${escapeHtml(row.label)}" aria-label="Line item ${index + 1} name"><small>${escapeHtml(row.source_snippet || "Manually added")}</small></td>
      <td><select data-line-changeability="${prefix}:${index}" aria-label="Line item ${index + 1} quoted status"><option value="optional" ${row.changeability === "optional" ? "selected" : ""}>Optional</option><option value="mandatory" ${row.changeability === "mandatory" ? "selected" : ""}>Mandatory</option><option value="bundled" ${row.changeability === "bundled" ? "selected" : ""}>Bundled</option><option value="unknown" ${!row.changeability || row.changeability === "unknown" ? "selected" : ""}>Unknown</option></select></td>
      <td><select data-line-unit="${prefix}:${index}" aria-label="Line item ${index + 1} basis"><option value="included" ${row.unit === "included" ? "selected" : ""}>Included / don't add</option><option value="per_head" ${row.unit === "per_head" ? "selected" : ""}>Per head</option><option value="fixed" ${row.unit === "fixed" ? "selected" : ""}>Fixed</option><option value="unclear" ${row.unit === "unclear" ? "selected" : ""}>Unclear</option></select></td>
      <td><input data-line-amount="${prefix}:${index}" type="number" min="0" step="1" inputmode="numeric" value="${row.amount ?? ""}" aria-label="Line item ${index + 1} amount"></td>
      <td><input data-line-counted="${prefix}:${index}" type="checkbox" ${row.counted ? "checked" : ""} aria-label="Add line item ${index + 1} to original quoted total"></td>
      <td><label class="quote-scenario-toggle"><input data-line-scenario="${prefix}:${index}" type="checkbox" ${(row.scenarioIncluded ?? row.counted) ? "checked" : ""} ${(row.changeability === "mandatory" || row.changeability === "bundled") ? "disabled" : ""}><span>${row.changeability === "mandatory" ? "Required" : row.changeability === "bundled" ? "Bundled" : "Include"}</span></label></td>
      <td><input data-line-quantity="${prefix}:${index}" type="number" min="0" step="1" inputmode="numeric" value="${row.scenarioQuantity ?? row.originalQuantity ?? 1}" ${(row.changeability === "mandatory" || row.changeability === "bundled") ? "disabled" : ""} aria-label="Scenario quantity for line item ${index + 1}"></td>
      <td><input data-line-minimum="${prefix}:${index}" type="checkbox" ${row.minimumEligible ? "checked" : ""} aria-label="Line item ${index + 1} counts toward minimum spend"></td>
      <td><button type="button" class="quote-line-remove" data-remove-line="${prefix}:${index}" aria-label="Remove line item ${index + 1}">Remove</button></td>
    </tr>`).join("")}</tbody></table></div>` : `<p class="quote-empty-lines">No line items yet. Analyse the quote or add one manually.</p>`;
    host.querySelectorAll("[data-line-label],[data-line-changeability],[data-line-unit],[data-line-amount],[data-line-counted],[data-line-scenario],[data-line-quantity],[data-line-minimum]").forEach((control) => control.addEventListener("change", () => {
      const token = control.dataset.lineLabel || control.dataset.lineChangeability || control.dataset.lineUnit || control.dataset.lineAmount || control.dataset.lineCounted || control.dataset.lineScenario || control.dataset.lineQuantity || control.dataset.lineMinimum;
      const index = Number(token.split(":")[1]);
      if (control.dataset.lineLabel) rows[index].label = control.value;
      if (control.dataset.lineChangeability) rows[index].changeability = control.value;
      if (control.dataset.lineUnit) rows[index].unit = control.value;
      if (control.dataset.lineAmount) rows[index].amount = engine.finite(control.value);
      if (control.dataset.lineCounted) { rows[index].counted = control.checked; rows[index].originalCounted = control.checked; if (rows[index].scenarioIncluded == null) rows[index].scenarioIncluded = control.checked; }
      if (control.dataset.lineScenario) rows[index].scenarioIncluded = control.checked;
      if (control.dataset.lineQuantity) rows[index].scenarioQuantity = engine.finite(control.value) ?? 0;
      if (control.dataset.lineMinimum) rows[index].minimumEligible = control.checked;
      if (control.dataset.lineChangeability) renderLineItems(prefix);
      if (!document.querySelector("[data-quote-result]").hidden) renderComparison(false);
    }));
    host.querySelectorAll("[data-remove-line]").forEach((button) => button.addEventListener("click", () => {
      const row = rows[Number(button.dataset.removeLine.split(":")[1])];
      if (row?.changeability === "mandatory" || row?.changeability === "bundled") {
        const status = document.querySelector(`[data-analysis-status="${prefix}"]`);
        status.textContent = row.changeability === "bundled" ? "This item is bundled into another quoted amount and cannot be deducted on its own." : "This item is mandatory under the quoted terms and cannot be removed from the scenario.";
        status.dataset.kind = "error";
        return;
      }
      if (row?.source_snippet) {
        row.scenarioIncluded = false;
        row.changeability = "optional";
      } else rows.splice(Number(button.dataset.removeLine.split(":")[1]), 1);
      renderLineItems(prefix);
      if (!document.querySelector("[data-quote-result]").hidden) renderComparison(false);
    }));
    for (const [key, preservedValue] of Object.entries(preservedCommercialValues)) {
      const control = field(formName(prefix, key));
      if (control) control.value = preservedValue;
    }
  }

  renderLineItems("a"); renderLineItems("b");

  const cacheRead = () => {
    try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{"entries":[],"lastBySide":{}}'); }
    catch { return { entries: [], lastBySide: {} }; }
  };
  const cacheWrite = (cache) => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ entries: cache.entries.slice(-6), lastBySide: cache.lastBySide })); } catch { /* private mode */ }
  };
  async function digest(text) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  function setControl(prefix, key, next, source) {
    const control = field(formName(prefix, key));
    if (!control || next == null) return;
    control.value = String(next);
    if (source) acceptedSources[prefix][key] = source;
    const state = document.querySelector(`[data-field-state="${prefix}:${key}"]`);
    if (state) state.textContent = source ? "Applied from quoted source" : "Entered manually";
  }

  function highlightSource(prefix, source) {
    const textarea = field(`${prefix}_text`);
    const highlight = document.querySelector(`[data-source-highlight="${prefix}"]`);
    if (!textarea || !source) {
      if (highlight) highlight.hidden = true;
      return;
    }
    const start = textarea.value.indexOf(source);
    if (start < 0) return;
    if (highlight) {
      highlight.textContent = source;
      highlight.hidden = false;
    }
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(start, start + source.length);
    textarea.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function fieldDisplay(key, fieldValue) {
    if (fieldValue == null) return "Not stated in quote";
    if (["per_head_rate", "whole_package_amount", "fixed_fee", "minimum_spend", "overtime_rate"].includes(key)) return money.format(Number(fieldValue));
    if (key === "service_charge_pct") return `${fieldValue}%`;
    if (key === "venue_hours") return `${fieldValue} hours`;
    if (key === "guest_count") return `${fieldValue} guests`;
    return String(fieldValue).replaceAll("_", " ");
  }

  function applyField(prefix, key, fieldResult) {
    if (fieldResult?.value == null) return;
    setControl(prefix, key, fieldResult.value, fieldResult.source_snippet);
    highlightSource(prefix, fieldResult.source_snippet);
  }

  function renderSuggestions(prefix, result) {
    const host = document.querySelector(`[data-suggestions="${prefix}"]`);
    const entries = fieldConfig.map(([key, label]) => [key, label, result.fields?.[key] || { state: "not_found", reason: "Not returned by extractor" }]);
    const guest = result.fields?.guest_count?.value;
    const rate = result.fields?.per_head_rate?.value;
    const smart = guest && rate ? `<div class="quote-smart-pill"><strong>Detected ${money.format(rate)} per person for ${guest} guests.</strong><span>Deterministic package subtotal: ${money.format(Number(guest) * Number(rate))}. This is not treated as the quote's grand total.</span><button type="button" data-smart-per-head="${prefix}">Set per-head rate</button><button type="button" data-smart-ignore>Ignore</button></div>` : "";
    host.innerHTML = `<div class="quote-suggestion-head"><strong>Commercial-term review</strong><button type="button" data-apply-high="${prefix}">Apply all high-confidence fields</button></div>${smart}${entries.map(([key, label, item]) => {
      const stateLabel = item.state === "extracted" ? "Extracted" : item.state === "ambiguous" ? "Needs your choice" : "Not stated in quote";
      const source = item.source_snippet ? `<q>${escapeHtml(item.source_snippet)}</q>` : "";
      const controls = item.value != null ? `<button type="button" data-review-source="${prefix}:${key}">Show source</button><button type="button" data-apply-field="${prefix}:${key}">Apply to ${escapeHtml(label)}</button>` : "";
      return `<article class="quote-suggestion quote-state-${item.state || "not_found"}"><div><span class="quote-state-label">${stateLabel}</span><h3>${escapeHtml(label)}: ${escapeHtml(fieldDisplay(key, item.value))}</h3><p>${escapeHtml(item.reason || "No supporting wording was found.")}</p>${source}</div><div class="quote-suggestion-controls">${controls}</div></article>`;
    }).join("")}</div>`;
    host.querySelectorAll("[data-review-source]").forEach((button) => button.addEventListener("click", () => {
      const [side, key] = button.dataset.reviewSource.split(":"); highlightSource(side, result.fields[key].source_snippet);
    }));
    host.querySelectorAll("[data-apply-field]").forEach((button) => button.addEventListener("click", () => {
      const [side, key] = button.dataset.applyField.split(":"); applyField(side, key, result.fields[key]); button.textContent = "Applied"; button.disabled = true;
    }));
    host.querySelector("[data-apply-high]")?.addEventListener("click", () => {
      for (const [key, item] of Object.entries(result.fields || {})) if (item.state === "extracted" && item.confidence === "high" && item.value != null) applyField(prefix, key, item);
      host.querySelector("[data-apply-high]").textContent = "High-confidence fields applied";
    });
    host.querySelector("[data-smart-per-head]")?.addEventListener("click", () => applyField(prefix, "per_head_rate", result.fields.per_head_rate));
    host.querySelector("[data-smart-ignore]")?.addEventListener("click", (event) => { event.currentTarget.closest(".quote-smart-pill").hidden = true; });
  }

  function useExtraction(prefix, result, previous) {
    extracted[prefix] = result;
    lineItems[prefix] = [
      ...(result.line_items || []).map((item) => ({ ...item, counted: false, originalCounted: false, scenarioIncluded: false, originalQuantity: 1, scenarioQuantity: 1, changeability: item.changeability || "unknown", minimumEligible: item.minimum_spend_eligible === true })),
      ...(result.inclusions || []).map((item) => ({ label: item.label, unit: "included", amount: null, source_snippet: item.source_snippet, counted: false, originalCounted: false, scenarioIncluded: true, originalQuantity: 1, scenarioQuantity: 1, changeability: "bundled", minimumEligible: false })),
    ];
    renderLineItems(prefix);
    renderSuggestions(prefix, result);
    for (const [key, item] of Object.entries(result.fields || {})) {
      const control = field(formName(prefix, key));
      const current = String(control?.value ?? "").trim();
      const stillUnset = current === "" || current === "unclear" || current === "not_stated";
      if (item.state === "extracted" && item.confidence === "high" && item.value != null && stillUnset) {
        setControl(prefix, key, item.value, item.source_snippet);
      }
      const state = document.querySelector(`[data-field-state="${prefix}:${key}"]`);
      if (state) state.textContent = item.state === "extracted" && item.confidence === "high" && stillUnset
        ? "Applied from quoted source — review or correct"
        : item.state === "extracted" ? "Extracted — review before applying" : item.state === "ambiguous" ? "Ambiguous — choose before applying" : "Not stated in quote";
    }
    const changes = engine.compareFields(previous, result);
    const changeHost = document.querySelector(`[data-changes="${prefix}"]`);
    changeHost.hidden = !changes.length;
    changeHost.innerHTML = changes.length ? `<strong>What changed since the previous analysis</strong><ul>${changes.map((change) => `<li>${escapeHtml(change)}</li>`).join("")}</ul>` : "";
  }

  async function analyse(prefix) {
    const text = value(`${prefix}_text`);
    const status = document.querySelector(`[data-analysis-status="${prefix}"]`);
    const button = document.querySelector(`[data-analyse="${prefix}"]`);
    if (text.length < 40) { status.textContent = "Paste at least 40 characters from the proposal first."; status.dataset.kind = "error"; return; }
    if (text.length > 20_000) { status.textContent = "Use the relevant commercial sections and keep the pasted text under 20,000 characters."; status.dataset.kind = "error"; return; }
    button.disabled = true; button.textContent = "Analysing…"; status.textContent = "Looking for quoted commercial terms and exact source wording…"; status.dataset.kind = "";
    try {
      const key = await digest(text);
      const cache = cacheRead();
      const previous = cache.entries.find((entry) => entry.key === cache.lastBySide?.[prefix])?.result || null;
      const cached = cache.entries.find((entry) => entry.key === key);
      let result;
      if (cached) {
        result = cached.result;
        status.textContent = "Reused the structured analysis saved in this browser. No new model request was made.";
      } else {
        const response = await fetch("/wedding/quote-extract", { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify({ text, proposal: prefix.toUpperCase(), comparison_guests: engine.finite(value("comparison_guests")), company: value("company") }) });
        const responseText = await response.text();
        if (!response.ok) {
          const message = response.status === 429
            ? "This public analyser has reached its request limit. Wait a little, or enter the terms manually below."
            : "The analysis service is temporarily unavailable. Your pasted quote remains here; enter the terms manually or try again shortly.";
          throw new Error(message);
        }
        try { result = JSON.parse(responseText); }
        catch { throw new Error("The analysis service returned an unreadable response. Your pasted quote remains here; try again or enter the terms manually."); }
        if (result?.schema_version !== "quote-extraction.v2" || !result.fields || typeof result.fields !== "object") {
          throw new Error("The analysis response was incomplete, so no fields were changed. Try again or enter the terms manually.");
        }
        cache.entries.push({ key, result, saved_at: new Date().toISOString() });
        status.textContent = "Analysis ready. High-confidence stated terms were applied; review their source snippets and correct anything that differs from the quote.";
      }
      cache.lastBySide = { ...(cache.lastBySide || {}), [prefix]: key };
      cacheWrite(cache);
      status.dataset.kind = "success";
      if (result?.schema_version !== "quote-extraction.v2" || !result.fields || typeof result.fields !== "object") {
        throw new Error("The saved analysis was incomplete. Clear it and analyse this quote again.");
      }
      useExtraction(prefix, result, previous);
    } catch (error) {
      status.textContent = error?.message || "The analysis service is temporarily unavailable. Enter the commercial terms manually below.";
      status.dataset.kind = "error";
    } finally { button.disabled = false; button.textContent = "Analyse quote"; }
  }

  function proposal(prefix) {
    const item = engine.blankProposal(prefix);
    item.label = value(`${prefix}_label`) || item.label;
    item.text = value(`${prefix}_text`);
    item.pricingModel = value(formName(prefix, "pricing_model"));
    item.perHeadRate = engine.finite(value(formName(prefix, "per_head_rate")));
    item.quoteGuests = engine.finite(value(formName(prefix, "guest_count")));
    item.packageTotal = engine.finite(value(formName(prefix, "whole_package_amount")));
    item.fixedFee = engine.finite(value(formName(prefix, "fixed_fee")));
    item.minimumSpend = engine.finite(value(formName(prefix, "minimum_spend")));
    item.gst = value(formName(prefix, "gst"));
    item.servicePct = engine.finite(value(formName(prefix, "service_charge_pct")));
    item.includedHours = engine.finite(value(formName(prefix, "venue_hours")));
    item.overtimeRate = engine.finite(value(formName(prefix, "overtime_rate")));
    item.paymentSchedule = value(formName(prefix, "payment_schedule"));
    item.depositAmount = engine.finite(value(formName(prefix, "deposit_amount")));
    item.depositPct = engine.finite(value(formName(prefix, "deposit_pct")));
    item.depositDue = value(formName(prefix, "deposit_due"));
    item.cancellationTerms = value(formName(prefix, "cancellation_terms"));
    item.quoteExpiry = value(formName(prefix, "quote_expiry"));
    item.quotedEventDate = value(formName(prefix, "quoted_event_date"));
    item.dateStatus = value(formName(prefix, "date_status"));
    item.minimumGuests = engine.finite(value(formName(prefix, "minimum_guests")));
    item.maximumGuests = engine.finite(value(formName(prefix, "maximum_guests")));
    item.comparisonDate = value("comparison_date");
    item.lineItems = lineItems[prefix];
    item.inclusions = lineItems[prefix].filter((row) => row.unit === "included").map((row) => row.label);
    item.exclusions = (extracted[prefix]?.exclusions || []).map((row) => row.label);
    item.analysisState = extracted[prefix] ? "analysed" : "not_analysed";
    item.fields = extracted[prefix]?.fields || {};
    return item;
  }

  function isActive(item) {
    return item.prefix === "a" || Boolean(item.text || value(`${item.prefix}_label`) || item.perHeadRate != null || item.packageTotal != null || item.fixedFee != null || item.minimumSpend != null);
  }

  function renderFormula(item, result, budget) {
    const remaining = result.estimatedTotal == null || budget == null ? null : budget - result.estimatedTotal;
    const label = result.scenarioChanged ? "Scenario estimate" : "Estimated total from stated terms";
    const deposit = result.deposit ? `<p class="quote-deposit"><strong>Deposit (part of total, not added again):</strong> ${money.format(result.deposit.amount)}${result.deposit.due ? ` · due ${escapeHtml(result.deposit.due)}` : ""}</p>` : `<p class="quote-deposit quote-unknown">Deposit not stated</p>`;
    const confirmation = result.confirmationReasons.length ? `<div class="quote-confirmation"><strong>Vendor confirmation needed</strong><ul>${result.confirmationReasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></div>` : `<p class="quote-viable">Fits the stated date, guest and capacity terms currently entered.</p>`;
    return `<section class="quote-formula magnet-card"><h3>${escapeHtml(item.label)}</h3><p class="quote-total-label">${label}</p><strong class="quote-total">${escapeHtml(totalText(result))}</strong>${remaining == null ? "" : `<p class="quote-remaining"><strong>Wedding budget remaining:</strong> ${money.format(remaining)}</p>`}<ol>${result.lines.map((line) => `<li><span>${escapeHtml(line.label)} <small>${escapeHtml(line.basis)} · ${escapeHtml(line.kind)}</small></span><strong>${money.format(line.amount)}</strong></li>`).join("") || "<li>No core package price has been stated or applied yet.</li>"}</ol>${deposit}${confirmation}${result.assumptions.length ? `<p class="quote-assumption"><strong>Calculation assumptions:</strong> ${escapeHtml(result.assumptions.join(" "))}</p>` : ""}</section>`;
  }

  function renderComparison(scroll = true) {
    const guests = engine.finite(value("comparison_guests"));
    const hours = engine.finite(value("comparison_hours"));
    const status = document.querySelector("[data-quote-status]");
    if (!guests || guests > 500 || !hours || hours > 24) { status.textContent = "Enter 1–500 guests and an event length between 1 and 24 hours."; status.dataset.kind = "error"; return; }
    const allItems = [proposal("a"), proposal("b")];
    const items = allItems.filter(isActive);
    const budget = engine.finite(value("comparison_budget"));
    const results = Object.fromEntries(items.map((item) => [item.prefix, engine.calculate(item, guests, hours)]));
    status.textContent = "Comparison updated with deterministic arithmetic from the terms you reviewed or entered."; status.dataset.kind = "success";
    const bActive = items.some((item) => item.prefix === "b");
    document.querySelector('[data-result-label="b"]').hidden = !bActive;
    document.querySelector('[data-question-card="b"]').hidden = !bActive;
    for (const item of items) {
      document.querySelector(`[data-result-label="${item.prefix}"]`).textContent = item.label;
      document.querySelector(`[data-question-title="${item.prefix}"]`).textContent = `Questions for ${item.label}`;
      document.querySelector(`[data-questions="${item.prefix}"]`).innerHTML = engine.questions(item, results[item.prefix]).map((question) => `<li>${escapeHtml(question)}</li>`).join("");
    }
    const inclusions = [...new Set(items.flatMap((item) => item.inclusions))];
    const rows = [
      ["Pricing model", (item) => item.pricingModel.replaceAll("_", " "), ""],
      ["Estimated total from stated terms", (item) => totalText(results[item.prefix]), (item) => results[item.prefix].estimatedTotal == null ? "unknown" : ""],
      ["Scenario status", (item) => results[item.prefix].scenarioChanged ? "Scenario estimate — vendor confirmation may be needed" : "Original reviewed terms", (item) => results[item.prefix].scenarioChanged ? "unknown" : "included"],
      ["Date, guest and capacity check", (item) => results[item.prefix].viability === "viable_on_stated_terms" ? "Fits stated terms" : results[item.prefix].viability === "does_not_meet" ? "Does not meet a stated requirement" : "Vendor confirmation needed", (item) => results[item.prefix].viability === "viable_on_stated_terms" ? "included" : "unknown"],
      ["Deposit", (item) => results[item.prefix].deposit ? `${money.format(results[item.prefix].deposit.amount)} — part of total, not added again` : "Not stated", (item) => results[item.prefix].deposit ? "" : "unknown"],
      ["Remaining wedding budget", (item) => budget == null || results[item.prefix].estimatedTotal == null ? "Add a wedding budget to calculate" : money.format(budget - results[item.prefix].estimatedTotal), (item) => budget == null ? "unknown" : ""],
      ["Effective stated cost per guest", (item) => results[item.prefix].estimatedTotal == null ? "Not enough pricing stated" : money.format(results[item.prefix].estimatedTotal / guests), (item) => results[item.prefix].estimatedTotal == null ? "unknown" : ""],
      ["Commercial terms stated", (item) => `${results[item.prefix].statedFields} of ${results[item.prefix].totalFields}`, ""],
      ["Unknown or unanswered", (item) => `${results[item.prefix].unknowns.length} item${results[item.prefix].unknowns.length === 1 ? "" : "s"}`, "unknown"],
      ["GST", (item) => item.gst === "included" ? "Included" : item.gst === "excluded" ? "Added in formula" : "Not stated / unclear", (item) => ["included", "excluded"].includes(item.gst) ? "included" : "unknown"],
      ...inclusions.map((label) => [label, (item) => item.inclusions.includes(label) ? "Included" : item.exclusions.includes(label) ? "Not offered" : "Not stated", (item) => item.inclusions.includes(label) ? "included" : "unknown"]),
    ];
    document.querySelector("[data-result-body]").innerHTML = rows.map(([label, getter, kind]) => `<tr><th scope="row">${escapeHtml(label)}</th>${items.map((item) => { const cellKind = typeof kind === "function" ? kind(item) : kind; return `<td><span class="${cellKind === "unknown" ? "quote-unknown" : cellKind === "included" ? "quote-included" : ""}">${escapeHtml(getter(item))}</span></td>`; }).join("")}</tr>`).join("");
    document.querySelector("[data-formulas]").innerHTML = items.map((item) => renderFormula(item, results[item.prefix], budget)).join("");
    const summary = document.querySelector("[data-quote-summary]");
    if (bActive && results.a.estimatedTotal != null && results.b.estimatedTotal != null) {
      const difference = Math.abs(results.a.estimatedTotal - results.b.estimatedTotal);
      const lower = results.a.estimatedTotal <= results.b.estimatedTotal ? allItems[0].label : allItems[1].label;
      summary.textContent = `At ${guests} guests, ${lower} is ${money.format(difference)} lower on the figures currently stated or entered. Proposal A has ${results.a.unknowns.length} unknown(s); Proposal B has ${results.b.unknowns.length}. This is a difference summary, not a recommendation.`;
    } else if (bActive) {
      summary.textContent = `A fair cost difference cannot be calculated yet because ${[results.a.estimatedTotal == null ? allItems[0].label : null, results.b.estimatedTotal == null ? allItems[1].label : null].filter(Boolean).join(" and ")} has no stated or applied core package price. Review each quote's extracted terms and missing questions below.`;
    } else if (results.a.estimatedTotal != null) {
      summary.textContent = `At ${guests} guests, ${allItems[0].label} has an estimated ${money.format(results.a.estimatedTotal)} from stated or entered terms, with ${results.a.unknowns.length} unknown(s). Add Proposal B when another quote is available.`;
    } else {
      summary.textContent = `${allItems[0].label} does not yet contain enough stated or applied pricing to estimate a total. Analyse the quote or enter its commercial terms, then compare again.`;
    }
    const support = engine.decisionSupport(items, results, budget);
    document.querySelector("[data-decision-tradeoff]").textContent = support.tradeOff;
    document.querySelector("[data-decision-recommendation]").textContent = support.recommendation;
    document.querySelector("[data-material-unknown]").textContent = support.materialUnknown ? `The missing fact most likely to change this choice: ${support.materialUnknown}.` : "No material unknown has been identified from the entered terms.";
    document.querySelector("[data-decision-support] h3").textContent = support.lowerPrefix ? "A conditional preference, not a final booking decision" : "Keep the choice open until the figures are comparable";
    const result = document.querySelector("[data-quote-result]");
    result.hidden = false;
    // Live recalculation must not steal focus while a couple is moving through
    // the commercial-term fields. Focus and scroll only for an explicit
    // Compare submission.
    if (scroll) {
      result.focus({ preventScroll: true });
      result.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function shareSnapshot() {
    const guests = engine.finite(value("comparison_guests")) || 100;
    const hours = engine.finite(value("comparison_hours")) || 6;
    const items = [proposal("a"), proposal("b")].filter(isActive);
    return {
      generated_at: new Date().toISOString(),
      comparison_date: value("comparison_date") || null,
      comparison_guests: guests,
      comparison_hours: hours,
      comparison_budget: engine.finite(value("comparison_budget")),
      proposals: items.map((item) => {
        const result = engine.calculate(item, guests, hours);
        return {
          label: item.label,
          proposal_text: item.text,
          pricing_model: item.pricingModel,
          commercial_terms: {
            per_head_rate: item.perHeadRate,
            guest_count: item.quoteGuests,
            whole_package_amount: item.packageTotal,
            fixed_fee: item.fixedFee,
            minimum_spend: item.minimumSpend,
            gst: item.gst,
            service_charge_pct: item.servicePct,
            venue_hours: item.includedHours,
            overtime_rate: item.overtimeRate,
            payment_schedule: item.paymentSchedule,
            deposit_amount: item.depositAmount,
            deposit_pct: item.depositPct,
            deposit_due: item.depositDue,
            cancellation_terms: item.cancellationTerms,
            quote_expiry: item.quoteExpiry,
            quoted_event_date: item.quotedEventDate,
            date_status: item.dateStatus,
            minimum_guests: item.minimumGuests,
            maximum_guests: item.maximumGuests,
          },
          line_items: item.lineItems,
          estimated_total: result.estimatedTotal,
          scenario_estimate: result.scenarioChanged,
          viability: result.viability,
          vendor_confirmation_reasons: result.confirmationReasons,
          deposit: result.deposit,
          formula_lines: result.lines,
          assumptions: result.assumptions,
          unknowns: result.unknowns,
          follow_up_questions: engine.questions(item, result),
          extraction_fields: item.fields,
        };
      }),
    };
  }

  async function sharePdf(event) {
    event.preventDefault();
    const shareForm = event.currentTarget;
    const email = String(shareForm.elements.namedItem("share_email")?.value ?? "").trim();
    const company = String(shareForm.elements.namedItem("share_company")?.value ?? "").trim();
    const button = shareForm.querySelector("[data-share-submit]");
    const status = shareForm.querySelector("[data-share-status]");
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      status.textContent = "Enter a valid email address.";
      status.dataset.kind = "error";
      return;
    }
    button.disabled = true;
    button.textContent = "Preparing PDF…";
    status.textContent = "Preparing a private PDF attachment and sending it now…";
    status.dataset.kind = "";
    try {
      const response = await fetch("/wedding/quote-share", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ email, company, snapshot: shareSnapshot() }),
      });
      const responseText = await response.text();
      let payload = null;
      try { payload = JSON.parse(responseText); } catch { /* never expose gateway HTML */ }
      if (!response.ok) throw new Error(response.status === 429
        ? "Too many share requests were made. Wait a little before trying again."
        : payload?.message || "The PDF could not be sent just now. Your comparison is still available here.");
      status.textContent = payload?.message || `PDF sent to ${email}.`;
      status.dataset.kind = "success";
      button.textContent = "PDF sent";
    } catch (error) {
      status.textContent = error?.message || "The PDF could not be sent just now. Your comparison is still available here.";
      status.dataset.kind = "error";
      button.disabled = false;
      button.textContent = "Send PDF";
    }
  }

  function extractSelection(prefix) {
    const textarea = field(`${prefix}_text`);
    const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).trim();
    const status = document.querySelector(`[data-analysis-status="${prefix}"]`);
    if (!selected) { status.textContent = "Select the exact wording in the proposal first."; status.dataset.kind = "error"; return; }
    const key = document.querySelector(`[data-selection-target="${prefix}"]`).value;
    if (key === "payment_schedule") setControl(prefix, key, selected, selected);
    else if (key === "pricing_model") {
      const lower = selected.toLowerCase();
      const next = lower.includes("minimum") ? "minimum_spend" : lower.includes("hire") && /per head|per person|pp/.test(lower) ? "hybrid" : /per head|per person|pp/.test(lower) ? "per_head" : "fixed";
      setControl(prefix, key, next, selected);
    } else if (key === "gst") setControl(prefix, key, /exclud|plus gst/i.test(selected) ? "excluded" : /includ|inclusive/i.test(selected) ? "included" : "unclear", selected);
    else {
      const match = selected.match(/\d[\d,]*(?:\.\d+)?/);
      if (!match) { status.textContent = "The selected wording has no number to apply to that field."; status.dataset.kind = "error"; return; }
      setControl(prefix, key, match[0].replaceAll(",", ""), selected);
    }
    highlightSource(prefix, selected);
    status.textContent = "Applied your selected source to the chosen field."; status.dataset.kind = "success";
  }

  async function readPdfLocally(file) {
    if (file.size > MAX_LOCAL_PDF_BYTES) throw new Error("too_large");
    const pdfjs = await import(PDFJS_MODULE_URL);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    const pdf = await task.promise;
    try {
      if (pdf.numPages > MAX_LOCAL_PDF_PAGES) throw new Error("too_many_pages");
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").replace(/\s+/g, " ").trim();
        if (text) pages.push(text);
      }
      const extractedText = pages.join("\n\n").trim();
      if (!extractedText) throw new Error("no_selectable_text");
      return extractedText.slice(0, MAX_LOCAL_TEXT_CHARACTERS);
    } finally {
      await task.destroy();
    }
  }

  async function readFile(prefix, file) {
    const status = document.querySelector(`[data-file-status="${prefix}"]`);
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "txt", "md", "eml"].includes(extension)) { status.textContent = "This public tool reads selectable-text PDF, TXT, Markdown and email files locally. Use signed-in Quotes for Word files, or enter the terms manually; nothing was uploaded."; return; }
    if (extension !== "pdf" && file.size > 2_000_000) { status.textContent = "Choose a text file smaller than 2 MB or paste the relevant sections."; return; }
    try {
      status.textContent = `Reading ${file.name} on this device…`;
      const text = extension === "pdf" ? await readPdfLocally(file) : await file.text();
      field(`${prefix}_text`).value = text;
      const truncation = extension === "pdf" && text.length === MAX_LOCAL_TEXT_CHARACTERS ? " The local text was limited to 100,000 characters; keep the relevant quote sections before analysis." : "";
      status.textContent = `${file.name} was read on this device and was not uploaded.${truncation} Choose Analyse quote only if you want contextual extraction.`;
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      console.warn("Local PDF reader could not extract selectable text.", code || "unknown_error");
      status.textContent = code === "too_large"
        ? "Choose a PDF smaller than 10 MB, use signed-in Quotes, or enter the relevant terms manually. Nothing was uploaded."
        : code === "too_many_pages"
          ? "This PDF has more than 80 pages. Use signed-in Quotes or enter the relevant pages manually. Nothing was uploaded."
          : "No selectable quote text could be read from this file. If it is scanned, use signed-in Quotes or enter the stated terms manually. Nothing was uploaded.";
    }
  }

  form.addEventListener("submit", (event) => { event.preventDefault(); renderComparison(); });
  document.querySelectorAll("[data-analyse]").forEach((button) => button.addEventListener("click", () => void analyse(button.dataset.analyse)));
  document.querySelectorAll("[data-clear-analysis]").forEach((button) => button.addEventListener("click", () => {
    const prefix = button.dataset.clearAnalysis; const cache = cacheRead();
    const key = cache.lastBySide?.[prefix];
    if (key) cache.entries = cache.entries.filter((entry) => entry.key !== key);
    if (cache.lastBySide) delete cache.lastBySide[prefix]; cacheWrite(cache); extracted[prefix] = null; acceptedSources[prefix] = {}; lineItems[prefix] = []; renderLineItems(prefix);
    document.querySelector(`[data-suggestions="${prefix}"]`).innerHTML = "";
    const highlight = document.querySelector(`[data-source-highlight="${prefix}"]`); if (highlight) highlight.hidden = true;
    const status = document.querySelector(`[data-analysis-status="${prefix}"]`); status.textContent = "Saved analysis for this proposal was cleared. Manual fields were left unchanged."; status.dataset.kind = "success";
  }));
  document.querySelectorAll("[data-extract-selection]").forEach((button) => button.addEventListener("click", () => extractSelection(button.dataset.extractSelection)));
  document.querySelectorAll("[data-add-line]").forEach((button) => button.addEventListener("click", (event) => { event.preventDefault(); const prefix = button.dataset.addLine; lineItems[prefix].push({ label: "", unit: "fixed", amount: null, counted: false, originalCounted: false, scenarioIncluded: false, originalQuantity: 1, scenarioQuantity: 1, changeability: "optional", minimumEligible: false, source_snippet: "" }); renderLineItems(prefix); const status = document.querySelector(`[data-analysis-status="${prefix}"]`); status.textContent = "Blank optional line item added below."; status.dataset.kind = "success"; }));
  document.querySelectorAll("[data-source-field]").forEach((control) => {
    control.addEventListener("click", () => { const [prefix, key] = control.dataset.sourceField.split(":"); highlightSource(prefix, acceptedSources[prefix][key]); });
    control.addEventListener("change", () => { if (!document.querySelector("[data-quote-result]").hidden) renderComparison(false); });
  });
  for (const prefix of ["a", "b"]) field(`${prefix}_file`).addEventListener("change", (event) => void readFile(prefix, event.currentTarget.files?.[0]));
  document.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", async () => {
    const prefix = button.dataset.copy; const item = proposal(prefix); const result = engine.calculate(item, engine.finite(value("comparison_guests")) || 100, engine.finite(value("comparison_hours")) || 6);
    const body = `Hi ${item.label},\n\nThanks for the proposal. Before we decide, could you confirm:\n\n${engine.questions(item, result).map((question) => `- ${question}`).join("\n")}\n\nThank you.`;
    try { await navigator.clipboard.writeText(body); button.textContent = "Copied"; } catch { button.textContent = "Select the questions above to copy"; }
  }));
  document.querySelector("[data-print]").addEventListener("click", () => window.print());
  const shareForm = document.querySelector("[data-quote-share]");
  document.querySelector("[data-open-share]")?.addEventListener("click", () => { shareForm.hidden = false; shareForm.querySelector('[name="share_email"]')?.focus(); shareForm.scrollIntoView({ behavior: "smooth", block: "center" }); });
  document.querySelector("[data-share-cancel]")?.addEventListener("click", () => { shareForm.hidden = true; });
  shareForm?.addEventListener("submit", sharePdf);
  for (const name of ["comparison_date", "comparison_guests", "comparison_hours", "comparison_budget"]) {
    field(name)?.addEventListener("input", () => { if (!document.querySelector("[data-quote-result]").hidden) renderComparison(false); });
  }
  document.querySelectorAll("[data-choice]").forEach((button) => button.addEventListener("click", () => {
    const requested = button.dataset.choice;
    let choice = requested;
    if (requested === "confirm") {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(CHOICE_KEY) || "null"); } catch { /* invalid local state is ignored */ }
      choice = saved?.preference;
      if (!choice || !["a", "b"].includes(choice)) {
        document.querySelector("[data-choice-status]").textContent = "Choose Proposal A or Proposal B before confirming it.";
        return;
      }
    }
    const state = choice === "open" ? { status: "open", preference: null } : { status: requested === "confirm" ? "confirmed" : "preferred", preference: choice };
    try { localStorage.setItem(CHOICE_KEY, JSON.stringify({ ...state, saved_at: new Date().toISOString() })); }
    catch { document.querySelector("[data-choice-status]").textContent = "This browser could not save the preference. The comparison remains visible."; return; }
    document.querySelector("[data-choice-status]").textContent = state.status === "open" ? "Choice kept open on this device." : `${choice === "a" ? "Proposal A" : "Proposal B"} ${state.status === "confirmed" ? "confirmed" : "saved as the current preference"} on this device. Sign in to add the choice to the wedding ledger.`;
  }));
  window.OmnyVenueQuoteDecoder = { calculate: engine.calculate, proposal };
})();
