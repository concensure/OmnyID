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
    deposit_amount: "Deposit amount",
    deposit_pct: "Deposit percentage",
    deposit_due: "Deposit due date",
    cancellation_terms: "Cancellation and reschedule terms",
    quote_expiry: "Quote expiry",
    quoted_event_date: "Quoted event date",
    date_status: "Date eligibility",
    minimum_guests: "Minimum guests",
    maximum_guests: "Maximum guests or capacity",
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
      depositAmount: null,
      depositPct: null,
      depositDue: "",
      cancellationTerms: "",
      quoteExpiry: "",
      quotedEventDate: "",
      dateStatus: "not_stated",
      minimumGuests: null,
      maximumGuests: null,
      lineItems: [],
      inclusions: [],
      exclusions: [],
      analysisState: "not_analysed",
      fields: {},
    };
  }

  function calculate(item, guests, eventHours, options = {}) {
    const lines = [];
    const unknowns = [];
    const assumptions = [];
    const add = (label, amount, basis, kind = "quoted") => {
      if (amount == null || !Number.isFinite(amount)) return;
      lines.push({ label, amount, basis, kind });
    };
    let base = 0;
    let baseKnown = false;
    let minimumEligibleBase = 0;
    let minimumIneligibleBase = 0;
    let minimumSpendApplies = false;
    let scenarioChanged = false;
    const confirmationReasons = [];
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
      base = spend;
      baseKnown = spendKnown || item.minimumSpend != null;
      minimumEligibleBase = spend;
      minimumSpendApplies = item.minimumSpend != null;
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

    if (item.minimumSpend != null && item.pricingModel !== "minimum_spend") {
      minimumEligibleBase = base;
      minimumSpendApplies = true;
    } else if (!minimumSpendApplies) {
      minimumIneligibleBase = base;
    }

    let minimumEligibleItems = 0;
    let minimumIneligibleItems = 0;
    for (const row of item.lineItems || []) {
      const originalIncluded = row.originalCounted ?? row.counted ?? false;
      const originalQuantity = finite(row.originalQuantity ?? row.quantity) ?? 1;
      const requestedIncluded = options.original ? originalIncluded : (row.scenarioIncluded ?? originalIncluded);
      const requestedQuantity = options.original ? originalQuantity : (finite(row.scenarioQuantity) ?? originalQuantity);
      const locked = row.changeability === "mandatory" || row.changeability === "bundled";
      if (row.unit === "included") continue;
      const included = locked ? originalIncluded : requestedIncluded;
      const quantity = locked ? originalQuantity : requestedQuantity;
      if (!options.original && (included !== originalIncluded || quantity !== originalQuantity)) scenarioChanged = true;
      if (locked && (requestedIncluded !== originalIncluded || requestedQuantity !== originalQuantity)) {
        assumptions.push(row.changeability === "bundled"
          ? `${row.label || "A bundled item"} cannot be deducted independently because it is part of another quoted amount.`
          : `${row.label || "A mandatory item"} cannot be removed under the stated quote terms.`);
      }
      if (!included) continue;
      if (row.amount == null || row.unit === "unclear") {
        unknowns.push(`${row.label || "selected line item"} price`);
        continue;
      }
      const unitAmount = row.unit === "per_head" ? row.amount * guests : row.amount;
      const amount = unitAmount * quantity;
      const minimumEligible = row.minimumEligible === true;
      if (minimumSpendApplies && minimumEligible) minimumEligibleItems += amount;
      else minimumIneligibleItems += amount;
      baseKnown = true;
      add(row.label || "Line item", amount, row.unit === "per_head"
        ? `${guests} × ${row.amount}${quantity !== 1 ? ` × ${quantity}` : ""}`
        : `${row.amount}${quantity !== 1 ? ` × ${quantity}` : ""}`,
      options.original ? "quoted" : scenarioChanged ? "scenario" : "quoted");
    }

    let subtotal = minimumIneligibleBase + minimumIneligibleItems;
    if (minimumSpendApplies) {
      const eligibleSpend = minimumEligibleBase + minimumEligibleItems;
      const floor = Math.max(eligibleSpend, item.minimumSpend);
      if (eligibleSpend < item.minimumSpend) add("Minimum-spend adjustment", item.minimumSpend - eligibleSpend, `${eligibleSpend} eligible spend; minimum ${item.minimumSpend}`, "calculated");
      subtotal += floor;
    } else {
      subtotal += minimumEligibleBase + minimumEligibleItems;
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
    if (item.depositAmount == null && item.depositPct == null) unknowns.push("deposit amount or percentage");
    if (!item.cancellationTerms) unknowns.push("cancellation and reschedule terms");
    if (!(item.inclusions || []).some((entry) => /beverage|drink/i.test(entry))) unknowns.push("beverage pricing or inclusion");
    if (!(item.inclusions || []).some((entry) => /staff|coordinat|waiter|server/i.test(entry))) unknowns.push("staffing cost or inclusion");

    const packageGuestMismatch = item.packageTotal != null && item.quoteGuests != null && guests !== item.quoteGuests;
    if (packageGuestMismatch) {
      unknowns.push(`revised package total for ${guests} guests (quote is for ${item.quoteGuests})`);
      assumptions.push(`The quoted package amount applies to ${item.quoteGuests} guests and has not been scaled to ${guests}.`);
    }
    if (item.minimumSpend != null) unknowns.push("minimum-spend scope and which components count toward it");

    if (item.minimumGuests != null && guests < item.minimumGuests) confirmationReasons.push(`Guest count is below the quoted minimum of ${item.minimumGuests}.`);
    if (item.maximumGuests != null && guests > item.maximumGuests) confirmationReasons.push(`Guest count exceeds the stated capacity or maximum of ${item.maximumGuests}.`);
    if (item.dateStatus === "unavailable") confirmationReasons.push("The vendor marked this date unavailable.");
    if (item.dateStatus === "conditional") confirmationReasons.push("The date or rate is conditional and needs vendor confirmation.");
    if (item.dateStatus === "not_stated") unknowns.push("availability for the comparison date");
    if (item.comparisonDate && item.quotedEventDate && item.comparisonDate !== item.quotedEventDate) confirmationReasons.push(`The quote is dated for ${item.quotedEventDate}, not ${item.comparisonDate}.`);
    if (item.quoteExpiry && /^\d{4}-\d{2}-\d{2}$/.test(item.quoteExpiry) && item.quoteExpiry < new Date().toISOString().slice(0, 10)) confirmationReasons.push(`The quote expired on ${item.quoteExpiry}.`);
    if (packageGuestMismatch) confirmationReasons.push(`The package total was quoted for ${item.quoteGuests} guests.`);

    const statedFields = [item.pricingModel !== "unclear", item.perHeadRate != null, item.quoteGuests != null, item.packageTotal != null, item.fixedFee != null, item.minimumSpend != null, item.gst !== "not_stated", item.servicePct != null, item.includedHours != null, item.overtimeRate != null, Boolean(item.paymentSchedule)].filter(Boolean).length;
    return {
      // A missing core price is unknown, not a zero-dollar wedding. Keep the
      // arithmetic working internally for gap detection, but do not expose a
      // total until a stated base amount exists.
      // A whole-package figure tied to a different guest count cannot be
      // scaled safely. Preserve it as the original quote and require a fresh
      // vendor confirmation rather than presenting it as a scenario total.
      estimatedTotal: baseKnown && !packageGuestMismatch ? subtotal : null,
      lines,
      unknowns: unique(unknowns),
      assumptions: unique(assumptions),
      statedFields,
      totalFields: 11,
      baseKnown,
      deposit: item.depositAmount != null
        ? { amount: item.depositAmount, basis: "quoted amount", due: item.depositDue || null }
        : item.depositPct != null && baseKnown
          ? { amount: subtotal * item.depositPct / 100, basis: `${item.depositPct}% of scenario total`, due: item.depositDue || null }
          : null,
      scenarioChanged: scenarioChanged || packageGuestMismatch,
      confirmationReasons: unique(confirmationReasons),
      viability: confirmationReasons.some((reason) => /unavailable|exceeds/i.test(reason)) ? "does_not_meet" : confirmationReasons.length ? "confirmation_needed" : "viable_on_stated_terms",
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
      [/deposit/i, "What deposit is required, when is it due, and is it part of rather than additional to the quoted total?"],
      [/cancellation|reschedule/i, "What cancellation and reschedule terms apply, including any non-refundable amounts?"],
      [/staff/i, "Is staffing included for our guest count and event duration, and what could cost extra?"],
      [/availability/i, "Can you confirm our date and that these rates still apply to it?"],
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

  function decisionSupport(items, results, budget) {
    const complete = items.filter((item) => results[item.prefix]?.estimatedTotal != null);
    const viable = complete.filter((item) => results[item.prefix]?.viability !== "does_not_meet");
    const difference = viable.length > 1 ? Math.abs(results[viable[0].prefix].estimatedTotal - results[viable[1].prefix].estimatedTotal) : null;
    const lower = viable.length > 1
      ? viable.reduce((best, item) => results[item.prefix].estimatedTotal < results[best.prefix].estimatedTotal ? item : best)
      : viable[0] || null;
    const unknowns = unique(items.flatMap((item) => results[item.prefix]?.unknowns || []));
    const materialUnknown = unknowns.find((value) => /staff/i.test(value)) || unknowns.find((value) => /availability|GST|minimum|service|beverage|deposit|cancellation/i.test(value)) || unknowns[0] || null;
    const tradeOff = lower && difference != null
      ? `${lower.label} is ${difference.toLocaleString("en-AU", { style: "currency", currency: "AUD" })} lower on this scenario's stated and reviewed figures.`
      : lower && complete.length > viable.length
        ? `${lower.label} is the only priced option that currently meets the common date, capacity and guest-count basis.`
        : lower ? `${lower.label} is the only option with enough stated pricing for this scenario.`
          : complete.length ? "The priced options do not currently meet the common comparison basis." : "Neither proposal has enough stated pricing for a cost comparison.";
    const recommendation = lower
      ? `${lower.label} is the current cost-led preference, conditional on equivalent scope${materialUnknown ? ` and confirmation of ${materialUnknown}` : ""}.`
      : "Keep the choice open until each proposal has a comparable core price.";
    return { lowerPrefix: lower?.prefix || null, difference, tradeOff, recommendation, materialUnknown, budget: finite(budget) };
  }

  global.OmnyVenueQuoteEngine = { blankProposal, calculate, questions, compareFields, decisionSupport, finite, fieldLabels };
})(window);
