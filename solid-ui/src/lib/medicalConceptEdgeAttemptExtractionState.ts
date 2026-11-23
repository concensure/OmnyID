// @locs-version: 1.0
import {
  buildMedicalConceptEdgeAttempt,
  type MedicalConceptEdgeAttempt,
} from "@/lib/medicalConceptEdgeAttemptLocalState";
import type { StudyReportArtifact } from "@/lib/studyReportArtifactLocalState";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fieldFromLine(line: string, field: string): string {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = line.match(new RegExp(`(?:^|[|;\\[]|\\s)${escaped}\\s*:\\s*([^|;\\]]+)`, "i"));
  return match?.[1]?.trim() ?? "";
}

function numberField(line: string, field: string): number {
  const raw = fieldFromLine(line, field);
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

function stripMarkdownPrefix(line: string): string {
  return line
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .trim();
}

function parseAttemptLine(line: string, artifact: StudyReportArtifact): MedicalConceptEdgeAttempt | null {
  if (!/\bmedical_edge_attempt\b/i.test(line)) return null;
  const relationshipId = fieldFromLine(line, "relationship_id") || fieldFromLine(line, "relationshipId");
  const totalItems = numberField(line, "total_items") || numberField(line, "totalItems");
  const correctItems = numberField(line, "correct_items") || numberField(line, "correctItems");
  const courseTag = fieldFromLine(line, "course_tag") || artifact.courseTag || null;
  return buildMedicalConceptEdgeAttempt({
    relationshipId,
    totalItems,
    correctItems,
    courseTag,
    source: "report_followup",
    now: artifact.createdAt,
  });
}

export function extractMedicalConceptEdgeAttemptsFromArtifact(
  artifact: StudyReportArtifact,
): MedicalConceptEdgeAttempt[] {
  const attempts: MedicalConceptEdgeAttempt[] = [];
  const seen = new Set<string>();
  for (const rawLine of artifact.markdown.split(/\r?\n/)) {
    const line = stripMarkdownPrefix(rawLine.trim());
    const attempt = parseAttemptLine(line, artifact);
    if (!attempt || seen.has(attempt.relationshipId)) continue;
    seen.add(attempt.relationshipId);
    attempts.push(attempt);
    if (attempts.length >= 24) break;
  }
  return attempts;
}
