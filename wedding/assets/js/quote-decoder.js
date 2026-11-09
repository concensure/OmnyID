(function () {
  "use strict";

  const inclusionFields = [
    ["ceremony", "Ceremony space"], ["furniture", "Tables and chairs"],
    ["linen", "Linen, cutlery and glassware"], ["av", "AV and microphone"],
    ["dance_floor", "Dance floor and lighting"], ["weather", "Wet-weather backup"],
    ["coordinator", "On-site coordinator"], ["parking", "Parking or transport"],
    ["accommodation", "Accommodation"],
  ];
  const money = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });
  const form = document.querySelector("[data-quote-decoder]");
  if (!form) return;

  const number = (value) => {
    if (value === "" || value == null) return null;
    const parsed = Number(String(value).replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const field = (name) => form.elements.namedItem(name);
  const value = (name) => String(field(name)?.value ?? "").trim();
  const setValue = (name, next) => {
    const control = field(name);
    if (control) control.value = String(next);
  };
  const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

  function mountInclusions(prefix) {
    const host = document.querySelector(`[data-inclusions="${prefix}"]`);
    if (!host) return;
    host.innerHTML = inclusionFields.map(([id, label]) => `<label class="quote-inclusion"><span>${label}</span><select name="${prefix}_inc_${id}" aria-label="${label} in Proposal ${prefix.toUpperCase()}"><option value="not_stated">Not stated</option><option value="included">Included</option><option value="extra">Extra cost</option><option value="excluded">Not offered</option></select></label>`).join("");
  }
  mountInclusions("a"); mountInclusions("b");

  function proposal(prefix) {
    const inclusions = Object.fromEntries(inclusionFields.map(([id]) => [id, value(`${prefix}_inc_${id}`)]));
    return {
      prefix,
      label: value(`${prefix}_label`) || `Proposal ${prefix.toUpperCase()}`,
      text: value(`${prefix}_text`), model: value(`${prefix}_model`),
      core: number(value(`${prefix}_core`)), minimum: number(value(`${prefix}_minimum`)),
      drinks: number(value(`${prefix}_drinks`)), gst: value(`${prefix}_gst`),
      service: number(value(`${prefix}_service`)), hours: number(value(`${prefix}_hours`)),
      overtime: number(value(`${prefix}_overtime`)), extras: number(value(`${prefix}_extras`)) ?? 0,
      inclusions,
    };
  }

  function isActive(item) {
    return item.prefix === "a" || Boolean(item.text || value(`${item.prefix}_label`) || item.core != null || item.minimum != null || item.drinks != null);
  }

  function costAt(item, guests, eventHours) {
    const lines = [];
    const unpriced = [];
    let subtotal = 0;
    let baseKnown = item.core != null;
    if (!baseKnown) unpriced.push("core venue/package price");
    if (baseKnown) {
      if (item.model === "per_head") {
        subtotal += item.core * guests;
        lines.push(["Core package", item.core * guests]);
      } else if (item.model === "hire_plus") {
        subtotal += item.core;
        lines.push(["Venue hire", item.core]);
      } else if (item.model === "minimum") {
        const variable = item.core * guests;
        if (item.minimum == null) {
          subtotal += variable;
          lines.push(["Stated per-head amount", variable]);
          unpriced.push("minimum-spend amount");
        } else {
          subtotal += Math.max(variable, item.minimum);
          lines.push([variable < item.minimum ? "Minimum spend" : "Per-head amount", Math.max(variable, item.minimum)]);
        }
      } else {
        subtotal += item.core;
        lines.push(["All-inclusive stated amount", item.core]);
      }
    }
    if (item.drinks != null) {
      subtotal += item.drinks * guests;
      lines.push(["Separate drinks", item.drinks * guests]);
    } else if (item.model !== "all_inclusive") {
      unpriced.push("drinks price or inclusion");
    }
    if (item.extras > 0) {
      subtotal += item.extras;
      lines.push(["Other stated fixed costs", item.extras]);
    }
    if (item.service != null) {
      if (baseKnown) {
        const charge = subtotal * item.service / 100;
        subtotal += charge;
        lines.push([`Service charge (${item.service}%)`, charge]);
      } else unpriced.push("service-charge calculation base");
    } else unpriced.push("service charge");
    if (item.hours == null) unpriced.push("included hours");
    else if (eventHours > item.hours) {
      if (item.overtime == null) unpriced.push(`overtime for ${eventHours - item.hours} extra hour(s)`);
      else {
        const overtime = (eventHours - item.hours) * item.overtime;
        subtotal += overtime;
        lines.push(["Overtime", overtime]);
      }
    }
    if (item.gst === "excluded") {
      const gst = subtotal * 0.1;
      subtotal += gst;
      lines.push(["GST added (10%)", gst]);
    } else if (item.gst === "not_stated") unpriced.push("GST treatment");
    const unknownInclusions = inclusionFields.filter(([id]) => item.inclusions[id] === "not_stated").map(([, label]) => label);
    const extraInclusions = inclusionFields.filter(([id]) => item.inclusions[id] === "extra").map(([, label]) => label);
    unknownInclusions.forEach((label) => unpriced.push(label));
    extraInclusions.forEach((label) => unpriced.push(`${label} extra-cost amount`));
    const statedCount = [item.core, item.minimum, item.drinks, item.service, item.hours, item.overtime].filter((entry) => entry != null).length
      + (item.gst !== "not_stated" ? 1 : 0)
      + Object.values(item.inclusions).filter((entry) => entry !== "not_stated").length;
    return { statedTotal: subtotal, lines, unpriced: [...new Set(unpriced)], statedCount, totalTerms: 16 };
  }

  function questions(item, result) {
    const priority = [
      ["minimum-spend", "What is the minimum spend, what counts toward it, and is any shortfall payable?"],
      ["service", "Is there a service charge, what percentage is it, and which items does it apply to?"],
      ["GST", "Is GST included in every amount shown?"],
      ["overtime", "How many event hours are included, and what is the overtime rate and curfew?"],
      ["drinks", "What drinks service is included, for how many hours, and what costs extra?"],
    ];
    const list = [];
    for (const [needle, question] of priority) if (result.unpriced.some((entry) => entry.toLowerCase().includes(needle.toLowerCase()))) list.push(question);
    for (const missing of result.unpriced) {
      if (list.length >= 10) break;
      if (!priority.some(([needle]) => missing.toLowerCase().includes(needle.toLowerCase()))) list.push(`Could you confirm whether ${missing.toLowerCase()} is included and, if not, its price?`);
    }
    return list.length ? list : ["Could you confirm that the stated inclusions and total still apply to our date, guest count and event hours?"];
  }

  function resultCell(text, kind) {
    return `<span class="${kind === "unknown" ? "quote-unknown" : kind === "included" ? "quote-included" : ""}">${escapeHtml(text)}</span>`;
  }

  function render() {
    const guests = number(value("comparison_guests"));
    const hours = number(value("comparison_hours"));
    const status = document.querySelector("[data-quote-status]");
    if (!guests || guests < 1 || guests > 500 || !hours || hours > 24) {
      status.textContent = "Enter 1–500 guests and an event length between 1 and 24 hours.";
      status.dataset.kind = "error";
      return;
    }
    const items = [proposal("a"), proposal("b")];
    const active = items.filter(isActive);
    const results = Object.fromEntries(active.map((item) => [item.prefix, costAt(item, guests, hours)]));
    status.textContent = "Comparison updated from the terms you entered."; status.dataset.kind = "success";
    active.forEach((item) => {
      document.querySelector(`[data-result-label="${item.prefix}"]`).textContent = item.label;
      document.querySelector(`[data-question-title="${item.prefix}"]`).textContent = `Questions for ${item.label}`;
    });
    const bActive = active.some((item) => item.prefix === "b");
    document.querySelector('[data-result-label="b"]').hidden = !bActive;
    document.querySelector('[data-question-card="b"]').hidden = !bActive;
    const rows = [
      ["Stated total", (item) => money.format(results[item.prefix].statedTotal), ""],
      ["Effective stated cost per guest", (item) => money.format(results[item.prefix].statedTotal / guests), ""],
      ["Completeness", (item) => `${results[item.prefix].statedCount} of ${results[item.prefix].totalTerms} terms stated`, ""],
      ["Unpriced or unanswered", (item) => `${results[item.prefix].unpriced.length} item${results[item.prefix].unpriced.length === 1 ? "" : "s"}`, "unknown"],
      ["GST", (item) => item.gst === "included" ? "Included" : item.gst === "excluded" ? "Added to stated figures" : "Not stated", (item) => item.gst === "not_stated" ? "unknown" : "included"],
      ...inclusionFields.map(([id, label]) => [label, (item) => ({ included: "Included", extra: "Extra cost (amount unknown)", excluded: "Not offered", not_stated: "Not stated" })[item.inclusions[id]], (item) => item.inclusions[id] === "included" ? "included" : item.inclusions[id] === "not_stated" || item.inclusions[id] === "extra" ? "unknown" : ""]),
    ];
    document.querySelector("[data-result-body]").innerHTML = rows.map(([label, getter, kind]) => `<tr><th scope="row">${escapeHtml(label)}</th>${active.map((item) => `<td>${resultCell(getter(item), typeof kind === "function" ? kind(item) : kind)}</td>`).join("")}</tr>`).join("");
    const summary = document.querySelector("[data-quote-summary]");
    if (bActive) {
      const a = results.a, b = results.b, difference = Math.abs(a.statedTotal - b.statedTotal);
      const lower = a.statedTotal <= b.statedTotal ? items[0].label : items[1].label;
      summary.textContent = `On stated terms at ${guests} guests, ${lower} is ${money.format(difference)} lower. Proposal A leaves ${a.unpriced.length} item(s) unpriced; Proposal B leaves ${b.unpriced.length}. This is a difference summary, not a recommendation.`;
    } else summary.textContent = `At ${guests} guests, ${items[0].label} states ${money.format(results.a.statedTotal)} while ${results.a.unpriced.length} item(s) still need an answer. Add Proposal B when you have another quote.`;
    active.forEach((item) => {
      const list = questions(item, results[item.prefix]);
      document.querySelector(`[data-questions="${item.prefix}"]`).innerHTML = list.map((question) => `<li>${escapeHtml(question)}</li>`).join("");
    });
    const result = document.querySelector("[data-quote-result]");
    result.hidden = false; result.focus({ preventScroll: true }); result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scan(prefix) {
    const text = value(`${prefix}_text`);
    const host = document.querySelector(`[data-suggestions="${prefix}"]`);
    if (!text) { host.textContent = "Paste proposal text first. Nothing has been applied."; return; }
    const suggestions = [];
    const total = text.match(/(?:grand\s+)?total(?:[^\n$]{0,50})\$\s*([\d,]+(?:\.\d{1,2})?)/i);
    const minimum = text.match(/minimum\s+(?:spend|numbers?)[^\n$]{0,50}\$\s*([\d,]+(?:\.\d{1,2})?)/i);
    const service = text.match(/(\d+(?:\.\d+)?)\s*%[^\n]{0,45}(?:service|gratuity)/i) || text.match(/(?:service|gratuity)[^\n]{0,45}(\d+(?:\.\d+)?)\s*%/i);
    const hours = text.match(/(\d+(?:\.\d+)?)\s*[- ]?hour[^\n]{0,35}(?:package|included)/i);
    if (total) suggestions.push({ name: `${prefix}_core`, value: total[1].replaceAll(",", ""), model: "all_inclusive", label: `Possible stated total: $${total[1]}`, source: total[0] });
    if (minimum) suggestions.push({ name: `${prefix}_minimum`, value: minimum[1].replaceAll(",", ""), label: `Possible minimum spend: $${minimum[1]}`, source: minimum[0] });
    if (service) suggestions.push({ name: `${prefix}_service`, value: service[1], label: `Possible service charge: ${service[1]}%`, source: service[0] });
    if (hours) suggestions.push({ name: `${prefix}_hours`, value: hours[1], label: `Possible included time: ${hours[1]} hours`, source: hours[0] });
    if (/all (?:amounts|prices)[^\n]{0,20}(?:include|inclusive of) GST/i.test(text) || /GST\s+inclusive/i.test(text)) suggestions.push({ name: `${prefix}_gst`, value: "included", label: "Possible GST treatment: included", source: "GST inclusive wording" });
    host.innerHTML = suggestions.length ? suggestions.map((item, index) => `<div class="quote-suggestion"><p><strong>${escapeHtml(item.label)}</strong><br><q>${escapeHtml(item.source.slice(0, 160))}</q></p><button type="button" data-apply-suggestion="${prefix}:${index}">Apply</button></div>`).join("") : "No confident terms found. Enter the figures manually; no value was guessed.";
    host.querySelectorAll("[data-apply-suggestion]").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.applySuggestion.split(":")[1]);
      const item = suggestions[index]; setValue(item.name, item.value); if (item.model) setValue(`${prefix}_model`, item.model);
      button.textContent = "Applied"; button.disabled = true;
    }));
  }

  async function readFile(prefix, file) {
    const status = document.querySelector(`[data-file-status="${prefix}"]`);
    if (!file) return;
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!new Set(["txt", "md"]).has(extension)) {
      status.textContent = "This browser-only version cannot reliably read that format. Open the file and paste its text; nothing was uploaded.";
      return;
    }
    if (file.size > 2_000_000) { status.textContent = "Choose a text file smaller than 2 MB or paste the relevant sections."; return; }
    try { setValue(`${prefix}_text`, await file.text()); status.textContent = `${file.name} was read on this device. Select “Find possible terms” to review suggestions.`; }
    catch { status.textContent = "The file could not be read. Paste its text instead."; }
  }

  form.addEventListener("submit", (event) => { event.preventDefault(); render(); });
  document.querySelectorAll("[data-scan]").forEach((button) => button.addEventListener("click", () => scan(button.dataset.scan)));
  for (const prefix of ["a", "b"]) field(`${prefix}_file`).addEventListener("change", (event) => void readFile(prefix, event.currentTarget.files?.[0]));
  document.querySelectorAll("[data-copy]").forEach((button) => button.addEventListener("click", async () => {
    const prefix = button.dataset.copy, item = proposal(prefix), result = costAt(item, number(value("comparison_guests")) || 100, number(value("comparison_hours")) || 6);
    const body = `Hi ${item.label},\n\nThanks for the proposal. Before we decide, could you confirm:\n\n${questions(item, result).map((question) => `- ${question}`).join("\n")}\n\nThank you.`;
    try { await navigator.clipboard.writeText(body); button.textContent = "Copied"; } catch { button.textContent = "Select the questions above to copy"; }
  }));
  document.querySelector("[data-print]").addEventListener("click", () => window.print());
  window.OmnyVenueQuoteDecoder = { costAt };
})();
