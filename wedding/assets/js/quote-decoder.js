(function () {
  "use strict";

  const engine = window.OmnyVenueQuoteEngine;
  const form = document.querySelector("[data-quote-decoder]");
  if (!form || !engine) return;

  const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });
  const totalText = (result) => result.estimatedTotal == null ? "Not enough pricing stated" : money.format(result.estimatedTotal);
  const CACHE_KEY = "omnyid.wedding.quoteExtractionCache.v2";
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
          : `<input name="${name}" type="number" min="0" ${key === "guest_count" ? 'max="5000"' : key === "service_charge_pct" ? 'max="100"' : key === "venue_hours" ? 'max="48"' : ''} step="1" inputmode="numeric" data-source-field="${prefix}:${key}" placeholder="Not stated">`;
      return `<label class="magnet-field"><span>${escapeHtml(label)} ${helpMarkup}</span>${input}<small class="quote-field-state" data-field-state="${prefix}:${key}">Not analysed</small></label>`;
    }).join("");
    const target = document.querySelector(`[data-selection-target="${prefix}"]`);
    target.innerHTML = fieldConfig.map(([key, label]) => `<option value="${key}">${escapeHtml(label)}</option>`).join("");
  }

  mountFields("a"); mountFields("b");

  function renderLineItems(prefix) {
    const host = document.querySelector(`[data-line-items="${prefix}"]`);
    const rows = lineItems[prefix];
    host.innerHTML = rows.length ? `<div class="quote-line-table-wrap"><table class="quote-line-table"><thead><tr><th>Item</th><th>Basis</th><th>Amount</th><th><span title="Tick only when this is additional to the package figures above">Add to total</span></th><th></th></tr></thead><tbody>${rows.map((row, index) => `<tr>
      <td><input data-line-label="${prefix}:${index}" value="${escapeHtml(row.label)}" aria-label="Line item ${index + 1} name"><small>${escapeHtml(row.source_snippet || "Manually added")}</small></td>
      <td><select data-line-unit="${prefix}:${index}" aria-label="Line item ${index + 1} basis"><option value="included" ${row.unit === "included" ? "selected" : ""}>Included / don't add</option><option value="per_head" ${row.unit === "per_head" ? "selected" : ""}>Per head</option><option value="fixed" ${row.unit === "fixed" ? "selected" : ""}>Fixed</option><option value="unclear" ${row.unit === "unclear" ? "selected" : ""}>Unclear</option></select></td>
      <td><input data-line-amount="${prefix}:${index}" type="number" min="0" step="1" inputmode="numeric" value="${row.amount ?? ""}" aria-label="Line item ${index + 1} amount"></td>
      <td><input data-line-counted="${prefix}:${index}" type="checkbox" ${row.counted ? "checked" : ""} aria-label="Add line item ${index + 1} to total"></td>
      <td><button type="button" class="quote-line-remove" data-remove-line="${prefix}:${index}" aria-label="Remove line item ${index + 1}">Remove</button></td>
    </tr>`).join("")}</tbody></table></div>` : `<p class="quote-empty-lines">No line items yet. Analyse the quote or add one manually.</p>`;
    host.querySelectorAll("[data-line-label],[data-line-unit],[data-line-amount],[data-line-counted]").forEach((control) => control.addEventListener("change", () => {
      const token = control.dataset.lineLabel || control.dataset.lineUnit || control.dataset.lineAmount || control.dataset.lineCounted;
      const index = Number(token.split(":")[1]);
      if (control.dataset.lineLabel) rows[index].label = control.value;
      if (control.dataset.lineUnit) rows[index].unit = control.value;
      if (control.dataset.lineAmount) rows[index].amount = engine.finite(control.value);
      if (control.dataset.lineCounted) rows[index].counted = control.checked;
    }));
    host.querySelectorAll("[data-remove-line]").forEach((button) => button.addEventListener("click", () => {
      rows.splice(Number(button.dataset.removeLine.split(":")[1]), 1); renderLineItems(prefix);
    }));
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
      ...(result.line_items || []).map((item) => ({ ...item, counted: false })),
      ...(result.inclusions || []).map((item) => ({ label: item.label, unit: "included", amount: null, source_snippet: item.source_snippet, counted: false })),
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

  function renderFormula(item, result) {
    return `<section class="quote-formula magnet-card"><h3>${escapeHtml(item.label)}</h3><p class="quote-total-label">Estimated total from stated terms</p><strong class="quote-total">${escapeHtml(totalText(result))}</strong><ol>${result.lines.map((line) => `<li><span>${escapeHtml(line.label)} <small>${escapeHtml(line.basis)} · ${escapeHtml(line.kind)}</small></span><strong>${money.format(line.amount)}</strong></li>`).join("") || "<li>No core package price has been stated or applied yet.</li>"}</ol>${result.assumptions.length ? `<p class="quote-assumption"><strong>Calculation assumptions:</strong> ${escapeHtml(result.assumptions.join(" "))}</p>` : ""}</section>`;
  }

  function renderComparison() {
    const guests = engine.finite(value("comparison_guests"));
    const hours = engine.finite(value("comparison_hours"));
    const status = document.querySelector("[data-quote-status]");
    if (!guests || guests > 500 || !hours || hours > 24) { status.textContent = "Enter 1–500 guests and an event length between 1 and 24 hours."; status.dataset.kind = "error"; return; }
    const allItems = [proposal("a"), proposal("b")];
    const items = allItems.filter(isActive);
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
      ["Effective stated cost per guest", (item) => results[item.prefix].estimatedTotal == null ? "Not enough pricing stated" : money.format(results[item.prefix].estimatedTotal / guests), (item) => results[item.prefix].estimatedTotal == null ? "unknown" : ""],
      ["Commercial terms stated", (item) => `${results[item.prefix].statedFields} of ${results[item.prefix].totalFields}`, ""],
      ["Unknown or unanswered", (item) => `${results[item.prefix].unknowns.length} item${results[item.prefix].unknowns.length === 1 ? "" : "s"}`, "unknown"],
      ["GST", (item) => item.gst === "included" ? "Included" : item.gst === "excluded" ? "Added in formula" : "Not stated / unclear", (item) => ["included", "excluded"].includes(item.gst) ? "included" : "unknown"],
      ...inclusions.map((label) => [label, (item) => item.inclusions.includes(label) ? "Included" : item.exclusions.includes(label) ? "Not offered" : "Not stated", (item) => item.inclusions.includes(label) ? "included" : "unknown"]),
    ];
    document.querySelector("[data-result-body]").innerHTML = rows.map(([label, getter, kind]) => `<tr><th scope="row">${escapeHtml(label)}</th>${items.map((item) => { const cellKind = typeof kind === "function" ? kind(item) : kind; return `<td><span class="${cellKind === "unknown" ? "quote-unknown" : cellKind === "included" ? "quote-included" : ""}">${escapeHtml(getter(item))}</span></td>`; }).join("")}</tr>`).join("");
    document.querySelector("[data-formulas]").innerHTML = items.map((item) => renderFormula(item, results[item.prefix])).join("");
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
    const result = document.querySelector("[data-quote-result]"); result.hidden = false; result.focus({ preventScroll: true }); result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function shareSnapshot() {
    const guests = engine.finite(value("comparison_guests")) || 100;
    const hours = engine.finite(value("comparison_hours")) || 6;
    const items = [proposal("a"), proposal("b")].filter(isActive);
    return {
      generated_at: new Date().toISOString(),
      comparison_guests: guests,
      comparison_hours: hours,
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
          },
          line_items: item.lineItems,
          estimated_total: result.estimatedTotal,
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

  async function readFile(prefix, file) {
    const status = document.querySelector(`[data-file-status="${prefix}"]`);
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["txt", "md"].includes(extension)) { status.textContent = "This public tool reads TXT and Markdown locally. Open PDF or Word files and paste the relevant text; nothing was uploaded."; return; }
    if (file.size > 2_000_000) { status.textContent = "Choose a text file smaller than 2 MB or paste the relevant sections."; return; }
    try { field(`${prefix}_text`).value = await file.text(); status.textContent = `${file.name} was read on this device. Choose Analyse quote only if you want contextual extraction.`; }
    catch { status.textContent = "The file could not be read. Paste its text instead."; }
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
  document.querySelectorAll("[data-add-line]").forEach((button) => button.addEventListener("click", () => { const prefix = button.dataset.addLine; lineItems[prefix].push({ label: "", unit: "fixed", amount: null, counted: false, source_snippet: "" }); renderLineItems(prefix); const status = document.querySelector(`[data-analysis-status="${prefix}"]`); status.textContent = "Blank line item added below."; status.dataset.kind = "success"; }));
  document.querySelectorAll("[data-source-field]").forEach((control) => control.addEventListener("click", () => { const [prefix, key] = control.dataset.sourceField.split(":"); highlightSource(prefix, acceptedSources[prefix][key]); }));
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
  window.OmnyVenueQuoteDecoder = { calculate: engine.calculate, proposal };
})();
