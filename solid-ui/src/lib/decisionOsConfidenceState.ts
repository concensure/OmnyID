// @locs-version: 1.0
export type DecisionOsConfidenceTone = "high" | "medium" | "low";

export function decisionOsConfidencePercent(confidence: number): number {
  return Math.round(confidence * 100);
}

export function decisionOsConfidenceTone(confidence: number): DecisionOsConfidenceTone {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.7) return "medium";
  return "low";
}

export function decisionOsConfidenceBadgeClass(confidence: number): string {
  switch (decisionOsConfidenceTone(confidence)) {
    case "high":
      return "bg-emerald-100 text-emerald-700";
    case "medium":
      return "bg-amber-100 text-amber-700";
    default:
      return "bg-red-100 text-red-700";
  }
}

export function decisionOsConfidenceStripClass(confidence: number): string {
  switch (decisionOsConfidenceTone(confidence)) {
    case "high":
      return "bg-emerald-400";
    case "medium":
      return "bg-amber-400";
    default:
      return "bg-red-400";
  }
}

export function decisionOsConfidenceTitle(confidence: number): string {
  switch (decisionOsConfidenceTone(confidence)) {
    case "high":
      return "Agent is confident";
    case "medium":
      return "Review recommended";
    default:
      return "Low confidence — manual review advised";
  }
}

export function decisionOsConfidenceLabel(confidence: number): string {
  return `${decisionOsConfidencePercent(confidence)}% confidence`;
}

export function decisionOsConfidenceFallbackTitle(): string {
  return "AI confidence score";
}
