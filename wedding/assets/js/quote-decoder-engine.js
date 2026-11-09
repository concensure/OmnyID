(function (global) {
  "use strict";

  const fieldLabels = {
    pricing_model: "Pricing model",
    per_head_rate: "Per-head package rate",
    guest_count: "Guest count in quote",
    whole_package_amount: "Whole-package amount",
    fixed_fee: "Fixed or hire fee",
    minimum_spend: "Minimum spend",
    gst: "GST treatment",
    service_charge_pct: "Service charge",
    venue_hours: "Hours included",
    overtime_rate: "Overtime rate",
    payment_schedule: "Payment schedule",
  };

  const finite = (value) => {
    if (value === "" || value == null) return null;
    const parsed = Number(String(value).replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  const unique = (items) => [...new Set(items.filter(Boolean))];

  function blankProposal(prefix) {
    return {
      prefix,
      label: `Proposal ${prefix.toUpperCase()}`,
      text: "",
      pricingModel: "unclear",
      perHeadRate: null,
      quoteGuests: null,
      packageTotal: null,
      fixedFee: null,
      minimumSpend: null,
      gst: "not_stated",
      servicePct: null,
      includedHours: null,
      overtimeRate: null,
      paymentSchedule: "",
      lineItems: [],
      inclusions: [],
      exclusions: [],
      analysisState: "not_analysed",
      fields: {},
    };
  }

  function calculate(item, guests, eventHours) {
    const lines = [];
    const unknowns = [];
    const assumptions = [];
    const add = (label, amount, basis, kind = "quoted") => {
      if (amount == null || !Number.isFinite(amount)) return;
      lines.push({ label, amount, basis, kind });
    };
    let base = 0;
    let baseKnown = false;
    const perHeadSubtotal = item.perHeadRate == null ? null : item.perHeadRate * guests;
    if (item.pricingModel === "per_head") {
      if (perHeadSubtotal == null) unknowns.push("per-head package rate");
      else { base += perHeadSubtotal; baseKnown = true; add("Per-head package", perHeadSubtotal, `${guests} × ${item.perHeadRate}`, "calculated"); }
      if (item.fixedFee != null) { base += item.fixedFee; baseKnown = true; add("Fixed fee", item.fixedFee, "quoted fixed amount"); }
    } else if (item.pricingModel === "fixed") {
      const fixed = item.packageTotal ?? item.fixedFee;
      if (fixed == null) unknowns.push("whole-package or fixed amount");
      else { base += fixed; baseKnown = true; add(item.packageTotal != null ? "Whole-package amount" : "Fixed fee", fixed, "quoted amount"); }
    } else if (item.pricingModel === "minimum_spend") {
      let spend = 0;
      let spendKnown = false;
      if (perHeadSubtotal != null) { spend += perHeadSubtotal; spendKnown = true; add("Per-head subtotal", perHeadSubtotal, `${guests} × ${item.perHeadRate}`, "calculated"); }
      if (item.fixedFee != null) { spend += item.fixedFee; spendKnown = true; add("Fixed fee", item.fixedFee, "quoted fixed amount"); }
      if (item.minimumSpend == null) unknowns.push("minimum-spend amount");
      if (item.minimumSpend != null) {
        base = Math.max(spendKnown ? spend : 0, item.minimumSpend);
        baseKnown = true;
        if (!spendKnown || spend < item.minimumSpend) add("Minimum-spend floor", item.minimumSpend - spend, `minimum ${item.minimumSpend}`, "calculated");
      } else if (spendKnown) { base = spend; baseKnown = true; }
    } else if (item.pricingModel === "hybrid") {
      if (item.packageTotal != null) { base += item.packageTotal; baseKnown = true; add("Whole-package amount", item.packageTotal, "quoted amount"); }
      else {
        if (perHeadSubtotal != null) { base += perHeadSubtotal; baseKnown = true; add("Per-head subtotal", perHeadSubtotal, `${guests} × ${item.perHeadRate}`, "calculated"); }
        if (item.fixedFee != null) { base += item.fixedFee; baseKnown = true; add("Fixed fee", item.fixedFee, "quoted fixed amount"); }
      }
      if (!baseKnown) unknowns.push("hybrid package base");
    } else {
      if (item.packageTotal != null) { base += item.packageTotal; baseKnown = true; add("Whole-package amount", item.packageTotal, "quoted amount"); }
      else if (perHeadSubtotal != null) { base += perHeadSubtotal; baseKnown = true; add("Per-head subtotal", perHeadSubtotal, `${guests} × ${item.perHeadRate}`, "calculated"); assumptions.push("Pricing model is unclear; the per-head rate was used as the visible base."); }
      else if (item.fixedFee != null) { base += item.fixedFee; baseKnown = true; add("Fixed fee", item.fixedFee, "quoted amount"); assumptions.push("Pricing model is unclear; the fixed fee was used as the visible base."); }
      else unknowns.push("pricing model and base amount");
    }

    for (const row of item.lineItems || []) {
      if (!row.counted || row.amount == null || row.unit === "included") continue;
      const amount = row.unit === "per_head" ? row.amount * guests : row.amount;
      base += amount;
      baseKnown = true;
      add(row.label || "Line item", amount, row.unit === "per_head" ? `${guests} × ${row.amount}` : "quoted fixed item", row.unit === "per_head" ? "calculated" : "quoted");
    }

    let subtotal = base;
    if (item.minimumSpend != null && item.pricingModel !== "minimum_spend" && subtotal < item.minimumSpend) {
      add("Minimum-spend shortfall", item.minimumSpend - subtotal, `minimum ${item.minimumSpend}`, "calculated");
      subtotal = item.minimumSpend;
    }
    if (item.servicePct != null) {
      if (baseKnown) {
        const service = subtotal * item.servicePct / 100;
        add(`Service charge (${item.servicePct}%)`, service, "applied to visible stated subtotal", "assumed");
        subtotal += service;
        assumptions.push("Service charge is applied to the visible stated subtotal; confirm the venue's calculation base.");
      } else unknowns.push("service-charge calculation base");
    } else unknowns.push("service charge");

    if (item.includedHours == null) unknowns.push("included venue hours");
    else if (eventHours > item.includedHours) {
      const extraHours = eventHours - item.includedHours;
      if (item.overtimeRate == null) unknowns.push(`overtime rate for ${extraHours} additional hour(s)`);
      else {
        const overtime = extraHours * item.overtimeRate;
        add("Overtime", overtime, `${extraHours} × ${item.overtimeRate}`, "calculated");
        subtotal += overtime;
      }
    }

    if (item.gst === "excluded") {
      const gst = subtotal * 0.1;
      add("GST added (10%)", gst, "quote says GST excluded", "calculated");
      subtotal += gst;
    } else if (item.gst === "not_stated" || item.gst === "unclear") unknowns.push("GST treatment");
    if (!item.paymentSchedule) unknowns.push("payment schedule");
    if (!(item.inclusions || []).some((entry) => /beverage|drink/i.test(entry))) unknowns.push("beverage pricing or inclusion");

    const statedFields = [item.pricingModel !== "unclear", item.perHeadRate != null, item.quoteGuests != null, item.packageTotal != null, item.fixedFee != null, item.minimumSpend != null, item.gst !== "not_stated", item.servicePct != null, item.includedHours != null, item.overtimeRate != null, Boolean(item.paymentSchedule)].filter(Boolean).length;
    return {
      // A missing core price is unknown, not a zero-dollar wedding. Keep the
      // arithmetic working internally for gap detection, but do not expose a
      // total until a stated base amount exists.
      estimatedTotal: baseKnown ? subtotal : null,
      lines,
      unknowns: unique(unknowns),
      assumptions: unique(assumptions),
      statedFields,
      totalFields: 11,
      baseKnown,
    };
  }

  function questions(item, result) {
    const mappings = [
      [/minimum/i, "What is the minimum spend, what counts toward it, and is any shortfall payable?"],
      [/service/i, "Is there a service charge, what percentage is it, and which items does it apply to?"],
      [/GST/i, "Is GST included in every amount shown?"],
      [/overtime|hours/i, "How many event hours are included, and what is the overtime rate and curfew?"],
      [/beverage|drink/i, "What drinks service is included, for how many hours, and what costs extra?"],
      [/payment/i, "What deposit and payment schedule applies, including final payment and cancellation terms?"],
    ];
    const output = [];
    for (const missing of result.unknowns) {
      const mapped = mappings.find(([pattern]) => pattern.test(missing));
      const question = mapped ? mapped[1] : `Could you confirm whether ${missing.toLowerCase()} is included and, if not, its price?`;
      if (!output.includes(question)) output.push(question);
    }
    return output.length ? output.slice(0, 12) : ["Could you confirm that these stated terms still apply to our date, guest count and event hours?"];
  }

  function compareFields(previous, next) {
    if (!previous) return [];
    const changes = [];
    for (const [key, label] of Object.entries(fieldLabels)) {
      const before = previous.fields?.[key]?.value ?? null;
      const after = next.fields?.[key]?.value ?? null;
      if (JSON.stringify(before) !== JSON.stringify(after)) changes.push(`${label}: ${before ?? "not stated"} → ${after ?? "not stated"}`);
    }
    const beforeItems = JSON.stringify(previous.line_items || []);
    const afterItems = JSON.stringify(next.line_items || []);
    if (beforeItems !== afterItems) changes.push("Line-item breakdown changed.");
    return changes;
  }

  global.OmnyVenueQuoteEngine = { blankProposal, calculate, questions, compareFields, finite, fieldLabels };
})(window);
