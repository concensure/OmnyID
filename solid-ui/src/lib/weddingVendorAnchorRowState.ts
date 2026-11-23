import type {
  WeddingVendorRankedCandidate,
  WeddingVendorRankingRequirements,
  WeddingVendorUtilityComponent,
} from "@/lib/weddingVendorRankingState";

export type WeddingVendorAnchorRowStatus = "met" | "not_met" | "unknown";

export type WeddingVendorAnchorRow = {
  anchor: string;
  status: WeddingVendorAnchorRowStatus;
  detail: string;
  componentId: string;
  verifyQuestion: string | null;
};

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";

function tokens(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4);
}

function component(candidate: WeddingVendorRankedCandidate, id: string): WeddingVendorUtilityComponent | undefined {
  return candidate.components.find((item) => item.id === id);
}

function rowForComponent(
  anchor: string,
  item: WeddingVendorUtilityComponent | undefined,
  unknownDetail: string,
): WeddingVendorAnchorRow {
  if (!item?.known) return { anchor, status: "unknown", detail: unknownDetail, componentId: item?.id ?? "", verifyQuestion: `Could you confirm ${anchor.toLowerCase()}?` };
  if (item.value >= 0.6) return { anchor, status: "met", detail: "Matches the information on record", componentId: item.id, verifyQuestion: null };
  if (item.value < 0.4) return { anchor, status: "not_met", detail: "Does not match the information on record", componentId: item.id, verifyQuestion: null };
  return { anchor, status: "unknown", detail: unknownDetail, componentId: item.id, verifyQuestion: `Could you confirm ${anchor.toLowerCase()}?` };
}

function capacityRow(
  item: WeddingVendorUtilityComponent | undefined,
  guestCount: string,
): WeddingVendorAnchorRow {
  const anchor = `Capacity for ${guestCount} guests`;
  const verifyQuestion = "Could you share the seated and standing capacity for each relevant space?";
  if (!item?.known || (item.value >= 0.4 && item.value < 0.6)) {
    return { anchor, status: "unknown", detail: "Space capacities are not confirmed yet", componentId: item?.id ?? "capacity", verifyQuestion };
  }
  if (item.value >= 0.6) {
    return { anchor, status: "met", detail: "The recorded capacity fits your planned guest count", componentId: item.id, verifyQuestion: null };
  }
  return { anchor, status: "not_met", detail: "The recorded capacity does not fit your planned guest count", componentId: item.id, verifyQuestion: null };
}

/**
 * Creates the deliberately conservative v1 rows. A missed keyword is unknown,
 * never a negative: only a later facet reason ledger may produce a style con.
 */
export function weddingVendorAnchorRows(
  candidate: WeddingVendorRankedCandidate,
  requirements: Pick<WeddingVendorRankingRequirements, "topPriorities" | "location" | "budgetComfort" | "guestCount">,
): WeddingVendorAnchorRow[] {
  if (candidate.reasons) {
    return candidate.reasons.map((reason): WeddingVendorAnchorRow => {
      const detailPrefix = reason.anchor ? `${reason.anchor} — ` : "";
      return {
        anchor: reason.anchor ?? (reason.id === "quality" ? "Reviews and reputation" : reason.id),
        status: reason.polarity === "pro" ? "met" : reason.polarity === "con" ? "not_met" : "unknown",
        detail: reason.claim.startsWith(detailPrefix) ? reason.claim.slice(detailPrefix.length) : reason.claim,
        componentId: reason.id,
        verifyQuestion: reason.verifyQuestion,
      };
    }).slice(0, 4);
  }
  const style = component(candidate, "style");
  const matched = new Set(candidate.matchedPreferenceTokens.map((item) => item.toLowerCase()));
  const priorities = (requirements.topPriorities ?? []).map(clean).filter(Boolean).map((anchor): WeddingVendorAnchorRow => {
    const directMatch = tokens(anchor).some((token) => matched.has(token));
    return directMatch && (style?.value ?? 0) >= 0.6
      ? { anchor, status: "met", detail: "Matches wording in the vendor information", componentId: "style", verifyQuestion: null }
      : { anchor, status: "unknown", detail: "Not confirmed yet", componentId: "style", verifyQuestion: `Could you tell us how this fits ${anchor.toLowerCase()}?` };
  });
  const rows = [...priorities];
  const location = clean(requirements.location);
  if (location) rows.push(rowForComponent(location, component(candidate, "location"), "Location match not confirmed"));
  if (clean(requirements.budgetComfort)) rows.push(rowForComponent("Budget", component(candidate, "cost"), "No price on record"));
  const guestCount = clean(requirements.guestCount);
  if (guestCount) rows.push(capacityRow(component(candidate, "capacity"), guestCount));
  return rows.slice(0, 4);
}

export function weddingVendorVerifyQuestions(rows: readonly WeddingVendorAnchorRow[], unknownConstraints: readonly string[]): string[] {
  const questions = [
    ...unknownConstraints.map((constraint) => /guest|capacity/i.test(constraint)
      ? "Could you share the seated and standing capacity for each relevant space?"
      : `Could you confirm ${constraint}?`),
    ...rows.flatMap((row) => row.status === "unknown" && row.verifyQuestion ? [row.verifyQuestion] : []),
  ];
  return [...new Set(questions)].slice(0, 3);
}
