// @locs-version: 1.0
export type WeddingComparisonColumnKind =
  | "option"
  | "price"
  | "style_match"
  | "availability"
  | "location"
  | "included"
  | "risk"
  | "notes"
  | "action"
  | "text";

export type WeddingComparisonColumnState = {
  header: string;
  label: string;
  kind: WeddingComparisonColumnKind;
  tone: "status" | "money" | "match" | "available" | "risk" | "action";
};

function normalized(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function weddingComparisonColumnKind(header: string): WeddingComparisonColumnKind {
  const value = normalized(header);
  if (/\b(name|vendor|venue|supplier|option|choice)\b/.test(value)) return "option";
  if (/\b(price|cost|quote|estimate|fee|total|spend|budget|deposit|balance|due)\b/.test(value)) return "price";
  if (/\b(style|fit|match|vibe|preference|score|rating)\b/.test(value)) return "style_match";
  if (/\b(available|availability|date|held|hold|booked|confirmed)\b/.test(value)) return "availability";
  if (/\b(location|address|suburb|city|distance|travel)\b/.test(value)) return "location";
  if (/\b(included|includes|package|hours|coverage|guest|capacity)\b/.test(value)) return "included";
  if (/\b(risk|warning|issue|caveats?|gap|constraint|conflict)\b/.test(value)) return "risk";
  if (/\b(next|action|approve|choose|decision|status)\b/.test(value)) return "action";
  if (/\b(note|notes|comment|detail|why)\b/.test(value)) return "notes";
  return "text";
}

export function weddingComparisonColumnLabel(kind: WeddingComparisonColumnKind, fallback: string): string {
  if (kind === "option") return "Option";
  if (kind === "price") return "Price";
  if (kind === "style_match") return "Style match";
  if (kind === "availability") return "Availability";
  if (kind === "location") return "Location";
  if (kind === "included") return "Included";
  if (kind === "risk") return "Watch-outs";
  if (kind === "action") return "Next step";
  if (kind === "notes") return "Notes";
  return fallback.trim() || "Detail";
}

function toneFor(kind: WeddingComparisonColumnKind): WeddingComparisonColumnState["tone"] {
  if (kind === "price") return "money";
  if (kind === "style_match") return "match";
  if (kind === "availability") return "available";
  if (kind === "risk") return "risk";
  if (kind === "action") return "action";
  return "status";
}

export function buildWeddingComparisonColumns(headers: readonly string[]): WeddingComparisonColumnState[] {
  return headers.map((header) => {
    const kind = weddingComparisonColumnKind(header);
    return {
      header,
      kind,
      label: weddingComparisonColumnLabel(kind, header),
      tone: toneFor(kind),
    };
  });
}
