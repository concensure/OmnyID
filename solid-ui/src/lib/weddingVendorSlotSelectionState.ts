// @locs-version: 1.0
export type WeddingVendorSlotCandidate = {
  id: string;
  group: "bookable" | "verify";
  fit: number;
  fitUpper?: number;
  availabilityProbability?: number;
  verificationCost?: number;
  styleTags?: readonly string[];
  locationSettingClass?: string | null;
  suburb?: string | null;
};
function baseScore(candidate: WeddingVendorSlotCandidate): number {
  return candidate.group === "verify"
    ? (candidate.availabilityProbability ?? 0.5) * (candidate.fitUpper ?? candidate.fit) - (candidate.verificationCost ?? 0)
    : candidate.fit;
}
function features(candidate: WeddingVendorSlotCandidate): Set<string> {
  return new Set([...(candidate.styleTags ?? []), candidate.locationSettingClass ?? "", candidate.suburb ?? ""].map((value) => value.trim().toLowerCase()).filter(Boolean));
}
function similarity(left: WeddingVendorSlotCandidate, right: WeddingVendorSlotCandidate): number {
  const a = features(left); const b = features(right);
  if (!a.size || !b.size) return 0;
  let overlap = 0; for (const value of a) if (b.has(value)) overlap += 1;
  return overlap / (a.size + b.size - overlap);
}
function ranked(candidates: readonly WeddingVendorSlotCandidate[]): WeddingVendorSlotCandidate[] {
  return [...candidates].sort((left, right) => baseScore(right) - baseScore(left) || right.fit - left.fit || left.id.localeCompare(right.id));
}
export function selectWeddingVendorSlots(candidates: readonly WeddingVendorSlotCandidate[], limit = 3): WeddingVendorSlotCandidate[] {
  const bookable = ranked(candidates.filter((candidate) => candidate.group === "bookable"));
  const verify = ranked(candidates.filter((candidate) => candidate.group === "verify"));
  if (limit <= 0 || (!bookable.length && !verify.length)) return [];
  const first = bookable[0] && (!verify[0] || bookable[0].fit >= verify[0].fit - 15) ? bookable[0] : verify[0] ?? bookable[0];
  const selected = [first];
  const remaining = candidates.filter((candidate) => candidate.id !== first.id);
  let preferred: WeddingVendorSlotCandidate["group"] = first.group === "bookable" ? "verify" : "bookable";
  while (selected.length < limit && remaining.length) {
    const pool = remaining.some((candidate) => candidate.group === preferred) ? remaining.filter((candidate) => candidate.group === preferred) : remaining;
    const maxBase = Math.max(1, ...pool.map(baseScore));
    pool.sort((left, right) => {
      const mmr = (candidate: WeddingVendorSlotCandidate) => 0.7 * baseScore(candidate) / maxBase - 0.3 * Math.max(...selected.map((item) => similarity(candidate, item)), 0);
      return mmr(right) - mmr(left) || baseScore(right) - baseScore(left) || left.id.localeCompare(right.id);
    });
    const choice = pool[0];
    selected.push(choice);
    remaining.splice(remaining.findIndex((candidate) => candidate.id === choice.id), 1);
    preferred = choice.group === "bookable" ? "verify" : "bookable";
  }
  return selected;
}
