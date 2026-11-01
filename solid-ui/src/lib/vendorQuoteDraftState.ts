import type { QuotationVendorResponse } from "afp-ts/quotation";

export type VendorQuoteLine = {
  id: string;
  description: string;
  quantity: number;
  unitAmount: string;
};

export type VendorQuoteDraft = {
  currency: "AUD" | "NZD" | "USD";
  taxTreatment: "inclusive" | "exclusive" | "exempt";
  taxAmount: string;
  expiresOn: string;
  guestBasis?: number;
  conditions?: string;
  lines: VendorQuoteLine[];
};

export type VendorQuotePreview = {
  subtotalMinor: number;
  taxMinor: number;
  totalMinor: number;
  currency: VendorQuoteDraft["currency"];
  expiresAt: string;
  facts: QuotationVendorResponse["commercial_facts"];
  explanation: string;
};

export function parseMoneyMinor(value: string): number | null {
  const normalized = value.trim().replaceAll(",", "");
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

function dateAtEndOfDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = `${value}T23:59:59.000Z`;
  return Number.isFinite(Date.parse(timestamp)) ? timestamp : null;
}

export function buildVendorQuotePreview(draft: VendorQuoteDraft): VendorQuotePreview {
  if (draft.lines.length === 0 || draft.lines.length > 20) {
    throw new Error("Add at least one quote line (up to 20).");
  }
  const expiresAt = dateAtEndOfDay(draft.expiresOn);
  if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
    throw new Error("Choose a quote expiry date in the future.");
  }
  if (draft.guestBasis !== undefined
      && (!Number.isSafeInteger(draft.guestBasis) || draft.guestBasis < 1 || draft.guestBasis > 10_000)) {
    throw new Error("Guest basis must be a whole number between 1 and 10,000.");
  }
  const lineFacts: QuotationVendorResponse["commercial_facts"] = [];
  let subtotalMinor = 0;
  draft.lines.forEach((line, index) => {
    const description = line.description.trim();
    const unitAmountMinor = parseMoneyMinor(line.unitAmount);
    if (!description || description.length > 300) {
      throw new Error(`Quote line ${index + 1} needs a description under 300 characters.`);
    }
    if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 10_000) {
      throw new Error(`Quote line ${index + 1} needs a whole-number quantity.`);
    }
    if (unitAmountMinor === null) {
      throw new Error(`Quote line ${index + 1} needs a valid unit price.`);
    }
    const lineTotal = unitAmountMinor * line.quantity;
    if (!Number.isSafeInteger(lineTotal)) throw new Error("The quote total is too large.");
    subtotalMinor += lineTotal;
    lineFacts.push(
      {
        fact_id: `quote-line-${index + 1}-description`, key: `quote.line.${index + 1}.description`,
        state: "proposed", value: { kind: "text", value: description }, anchors: [],
      },
      {
        fact_id: `quote-line-${index + 1}-quantity`, key: `quote.line.${index + 1}.quantity`,
        state: "proposed", value: { kind: "integer", value: line.quantity }, anchors: [],
      },
      {
        fact_id: `quote-line-${index + 1}-unit-price`, key: `quote.line.${index + 1}.unit_price`,
        state: "proposed", value: { kind: "money", value: { amount_minor: unitAmountMinor, currency: draft.currency } }, anchors: [],
      },
      {
        fact_id: `quote-line-${index + 1}-total`, key: `quote.line.${index + 1}.total`,
        state: "proposed", value: { kind: "money", value: { amount_minor: lineTotal, currency: draft.currency } }, anchors: [],
      },
    );
  });
  if (!Number.isSafeInteger(subtotalMinor)) throw new Error("The quote total is too large.");
  const enteredTaxMinor = draft.taxTreatment === "exempt" ? 0 : parseMoneyMinor(draft.taxAmount);
  if (enteredTaxMinor === null) throw new Error("Enter the tax amount shown in this quote.");
  if (draft.taxTreatment === "inclusive" && enteredTaxMinor > subtotalMinor) {
    throw new Error("Included tax cannot exceed the quote subtotal.");
  }
  const taxMinor = enteredTaxMinor;
  const totalMinor = draft.taxTreatment === "exclusive" ? subtotalMinor + taxMinor : subtotalMinor;
  if (!Number.isSafeInteger(totalMinor)) throw new Error("The quote total is too large.");
  const conditions = draft.conditions?.trim();
  if (conditions && conditions.length > 4_000) throw new Error("Keep quote conditions under 4,000 characters.");
  const facts: QuotationVendorResponse["commercial_facts"] = [
    ...lineFacts,
    {
      fact_id: "quote-subtotal", key: "quote.subtotal", state: "proposed",
      value: { kind: "money", value: { amount_minor: subtotalMinor, currency: draft.currency } }, anchors: [],
    },
    {
      fact_id: "quote-tax", key: "quote.tax", state: "proposed",
      value: { kind: "money", value: { amount_minor: taxMinor, currency: draft.currency } }, anchors: [],
    },
    {
      fact_id: "quote-tax-treatment", key: "quote.tax_treatment", state: "proposed",
      value: { kind: "text", value: draft.taxTreatment }, anchors: [],
    },
    {
      fact_id: "quote-total", key: "quote.total", state: "proposed",
      value: { kind: "money", value: { amount_minor: totalMinor, currency: draft.currency } }, anchors: [],
    },
    {
      fact_id: "quote-expiry", key: "quote.expires_at", state: "proposed",
      value: { kind: "date", value: expiresAt }, anchors: [],
    },
  ];
  if (draft.guestBasis !== undefined) facts.push({
    fact_id: "quote-guest-basis", key: "quote.guest_basis", state: "proposed",
    value: { kind: "integer", value: draft.guestBasis }, anchors: [],
  });
  if (conditions) facts.push({
    fact_id: "quote-conditions", key: "quote.conditions", state: "proposed",
    value: { kind: "text", value: conditions }, anchors: [],
  });
  return {
    subtotalMinor, taxMinor, totalMinor, currency: draft.currency, expiresAt, facts,
    explanation: conditions || "Itemised quote supplied for the couple's review.",
  };
}

export function formatQuoteMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(amountMinor / 100);
}
