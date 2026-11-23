// @locs-version: 1.0
import type { MedicalConceptEdgeAttempt } from "@/lib/medicalConceptEdgeAttemptLocalState";

function scorePercent(attempt: MedicalConceptEdgeAttempt): number {
  return Math.round((attempt.correctItems / attempt.totalItems) * 100);
}

function compactRelationshipLabel(relationshipId: string): string {
  const parts = relationshipId.split(":").filter(Boolean);
  const candidate = parts.find((part) => /_to_|concept_link/i.test(part)) ?? parts.at(-1) ?? relationshipId;
  return candidate.replace(/_to_/g, " -> ").replace(/_/g, " ");
}

function sourceLabel(source: MedicalConceptEdgeAttempt["source"]): string {
  switch (source) {
    case "focused_screen":
      return "focused screen";
    case "report_followup":
      return "report follow-up";
    case "manual":
      return "manual";
  }
}

export function medicalConceptEdgeAttemptLabel(attempt: MedicalConceptEdgeAttempt): string {
  const course = attempt.courseTag ? ` (${attempt.courseTag})` : "";
  return `Edge attempt${course}: ${compactRelationshipLabel(attempt.relationshipId)} - ${attempt.correctItems}/${attempt.totalItems} (${scorePercent(attempt)}%), ${sourceLabel(attempt.source)}`;
}

export function medicalConceptEdgeAttemptLabels(input: {
  attempts: readonly MedicalConceptEdgeAttempt[];
  courseTag?: string | null;
  limit?: number;
}): string[] {
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.floor(input.limit ?? 2)) : 2;
  const courseTag = input.courseTag?.trim();
  return input.attempts
    .filter((attempt) => !courseTag || attempt.courseTag === courseTag || !attempt.courseTag)
    .slice()
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, limit)
    .map(medicalConceptEdgeAttemptLabel);
}
