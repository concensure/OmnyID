// @locs-version: 1.0
import type { QueueEntry } from "@/lib/decisionQueueModel";
import type { FocusDeckItem } from "@/lib/mobileFocusHomeState";
import type { WeddingDecisionFocusItemCard } from "@/lib/weddingDecisionFocusDisplayState";
import type { WeddingWorkspaceArtifactPreview } from "@/lib/weddingResponseWorkspaceViewState";

export const DECISION_CARD_PATTERNS = [
  "choose", "approve_act", "compare", "notice_decide", "clarify", "coordinate", "review", "record",
] as const;

export type DecisionCardPattern = (typeof DECISION_CARD_PATTERNS)[number];
export type DecisionCardDomain = "wedding" | "general";
export type DecisionCardMode = "glance" | "compact" | "standard" | "full";
export type DecisionCardPressure = "urgent" | "high" | "medium" | "low" | "informational";
export type DecisionCardActionRole = "primary" | "secondary" | "dismiss";

export type DecisionCardAction = {
  id: string;
  label: string;
  role: DecisionCardActionRole;
  effect: string;
  intent: string;
  disabledReason?: string | null;
};

export type DecisionCardEvidence = {
  label: string;
  ref: string;
  sourceKind: string;
  observedAt?: string | null;
  freshness: "current" | "aging" | "unknown";
};

export type DecisionCardOption = {
  id: string;
  name: string;
  summary?: string | null;
  recommended?: boolean;
};

export type DecisionCardModel = {
  schema: "content.decision_card";
  pattern: DecisionCardPattern;
  patternVersion: "1.0";
  id: string;
  title: string;
  domain: DecisionCardDomain;
  pressure: DecisionCardPressure;
  whyItMatters: string;
  recommendation?: { summary: string; reasons: string[] } | null;
  actions: DecisionCardAction[];
  evidence: DecisionCardEvidence[];
  confidence?: { label: string; reason: string } | null;
  timeSensitivity?: { label: string; at?: string | null } | null;
  visual?: { kind: "image" | "icon" | "none"; url?: string | null; alt?: string | null } | null;
  unknowns: string[];
  patternSlots: {
    options?: DecisionCardOption[];
    payloadPreview?: string | null;
    question?: string | null;
    changeSummary?: string | null;
    parties?: string[];
    reviewItems?: string[];
    recordSummary?: string | null;
  };
  verification: { status: "verified" | "partial" | "unverified"; label: string };
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function evidenceFromLabels(labels: readonly string[], prefix: string): DecisionCardEvidence[] {
  return labels.map(clean).filter(Boolean).slice(0, 4).map((label, index) => ({
    label,
    ref: `${prefix}:${index + 1}`,
    sourceKind: "continuity",
    freshness: "unknown" as const,
  }));
}

export function validateDecisionCard(card: DecisionCardModel): string[] {
  const errors: string[] = [];
  if (!DECISION_CARD_PATTERNS.includes(card.pattern)) errors.push("unsupported pattern");
  if (!clean(card.title)) errors.push("title is required");
  if (card.actions.filter((action) => action.role === "primary").length !== 1) errors.push("exactly one primary action is required");
  if (card.recommendation && (card.recommendation.reasons.length === 0 || card.evidence.length === 0)) {
    errors.push("recommendations require reasons and evidence");
  }
  if (card.evidence.some((item) => !clean(item.ref))) errors.push("evidence refs are required");
  return errors;
}

export function decisionCardFromQueueEntry(entry: QueueEntry): DecisionCardModel {
  const decision = entry.decision;
  const refs = entry.source === "priority"
    ? entry.queuePriorityCard?.source_refs ?? []
    : entry.queueActionItem?.source_refs ?? [];
  const evidence = evidenceFromLabels(refs, `decision:${entry.id}`);
  const recommended = decision.options.find((option) => option.aiRecommended);
  const reasons = (decision.whyBullets ?? []).map((bullet) => clean(bullet.text)).filter(Boolean);
  return {
    schema: "content.decision_card",
    pattern: decision.options.length > 1 ? "choose" : "approve_act",
    patternVersion: "1.0",
    id: entry.id,
    title: decision.title,
    domain: "general",
    pressure: decision.urgency,
    whyItMatters: clean(decision.whyMatters) || decision.context,
    recommendation: recommended && evidence.length > 0 && reasons.length > 0
      ? { summary: recommended.label, reasons: reasons.slice(0, 3) }
      : null,
    actions: [
      { id: "open", label: decision.options.length > 0 ? "Review options" : "Review details", role: "primary", effect: "Opens the source workflow", intent: "review" },
      { id: "later", label: "Decide later", role: "dismiss", effect: "No change is made", intent: "defer", disabledReason: "Open the source workflow to defer this decision safely." },
    ],
    evidence,
    confidence: decision.confidenceReason
      ? { label: typeof decision.confidence === "number" ? `${Math.round(decision.confidence <= 1 ? decision.confidence * 100 : decision.confidence)}% confidence` : "Confidence noted", reason: decision.confidenceReason }
      : null,
    timeSensitivity: { label: `${decision.urgency} priority` },
    visual: { kind: "none" },
    unknowns: evidence.length === 0 ? ["No source reference is attached yet."] : [],
    patternSlots: {
      options: decision.options.map((option) => ({ id: option.id, name: option.label, summary: option.detail, recommended: option.aiRecommended })),
      payloadPreview: decision.context,
    },
    verification: evidence.length > 0
      ? { status: "partial", label: `${evidence.length} source reference${evidence.length === 1 ? "" : "s"}` }
      : { status: "unverified", label: "Source not attached" },
  };
}

export function decisionCardFromWeddingFocus(card: WeddingDecisionFocusItemCard): DecisionCardModel {
  const item = card.item;
  const evidence = evidenceFromLabels(item.evidenceLabels, `wedding:${item.id}`);
  const pattern: DecisionCardPattern = item.sourceSurface === "approval_queue"
    ? "approve_act"
    : item.sourceSurface === "decision_queue" ? "choose" : item.pressureFamily === "knowledge" ? "clarify" : "review";
  return {
    schema: "content.decision_card",
    pattern,
    patternVersion: "1.0",
    id: card.id,
    title: card.title,
    domain: "wedding",
    pressure: item.pressureFamily === "obligation" ? "high" : item.pressureFamily === "attention" ? "medium" : "low",
    whyItMatters: card.whyNowLabel,
    recommendation: evidence.length > 0 ? { summary: card.recommendedActionLabel, reasons: [card.whyNowLabel] } : null,
    actions: [
      { id: "open", label: card.compareLabel, role: "primary", effect: "Opens the related wedding workflow", intent: "review" },
      { id: "why", label: "Show me why", role: "secondary", effect: "Shows the ranking evidence", intent: "explain" },
      { id: "later", label: "Decide later", role: "dismiss", effect: "Records a deferral and removes this from the top three", intent: "defer" },
    ],
    evidence,
    timeSensitivity: { label: card.neededByLabel, at: item.dueAt },
    visual: { kind: "none" },
    unknowns: evidence.length === 0 ? ["OmnyID has not attached evidence yet."] : [],
    patternSlots: { payloadPreview: card.recommendedActionLabel },
    verification: evidence.length > 0 ? { status: "partial", label: card.checkedLabel } : { status: "unverified", label: card.checkedLabel },
  };
}

export function decisionCardFromFocusDeckItem(item: FocusDeckItem): DecisionCardModel {
  const evidence = evidenceFromLabels(item.evidenceLabels, `focus:${item.id}`);
  return {
    schema: "content.decision_card",
    pattern: item.kind === "response" ? "approve_act" : "review",
    patternVersion: "1.0",
    id: item.id,
    title: item.title,
    domain: "wedding",
    pressure: "medium",
    whyItMatters: item.whyNowLabel,
    recommendation: evidence.length > 0 ? { summary: item.recommendedActionLabel, reasons: [item.whyNowLabel] } : null,
    actions: [{ id: "review", label: item.kind === "response" ? "Open agent draft" : "Review", role: "primary", effect: "Opens the guarded review flow", intent: "review" }],
    evidence,
    timeSensitivity: item.dueAt ? { label: "Time-sensitive", at: item.dueAt } : null,
    visual: { kind: "none" },
    unknowns: evidence.length === 0 ? ["No source evidence is attached yet."] : [],
    patternSlots: { payloadPreview: item.recommendedActionLabel },
    verification: evidence.length > 0 ? { status: "partial", label: `${evidence.length} evidence signal${evidence.length === 1 ? "" : "s"}` } : { status: "unverified", label: "Evidence pending" },
  };
}

export function decisionCardFromWeddingVendorComparison(preview: WeddingWorkspaceArtifactPreview): DecisionCardModel {
  const evidence: DecisionCardEvidence[] = preview.sourceLinks.slice(0, 4).map((source) => ({
    label: source.label,
    ref: source.url,
    sourceKind: "vendor_research",
    freshness: "unknown",
  }));
  const handoff = preview.vendorComparisonHandoff;
  return {
    schema: "content.decision_card",
    pattern: "choose",
    patternVersion: "1.0",
    id: `vendor-comparison:${preview.artifactId}`,
    title: preview.title,
    domain: "wedding",
    pressure: "medium",
    whyItMatters: handoff?.nextActionLabel ?? "Compare the source-backed shortlist before choosing who to contact.",
    recommendation: handoff && evidence.length > 0 && handoff.whyLabels.length > 0
      ? { summary: handoff.recommendationLabel, reasons: handoff.whyLabels.slice(0, 3) }
      : null,
    actions: [{ id: "open", label: "Open comparison", role: "primary", effect: "Opens the persisted comparison in Documents", intent: "review" }],
    evidence,
    confidence: handoff ? { label: handoff.confidenceLabel, reason: handoff.whyLabels.join(" ") } : null,
    timeSensitivity: null,
    visual: { kind: "none" },
    unknowns: preview.vendorComparisonCards.flatMap((card) => card.unknownConstraints).filter((value, index, values) => values.indexOf(value) === index).slice(0, 4),
    patternSlots: {
      options: preview.vendorComparisonCards.slice(0, 3).map((card) => ({
        id: card.choiceId,
        name: card.title,
        summary: card.situationFit,
        recommended: card.rank === 1,
      })),
    },
    verification: evidence.length > 0
      ? { status: "partial", label: preview.evidenceSummary.statusLabel }
      : { status: "unverified", label: preview.evidenceSummary.warningLabel ?? "Sources not attached" },
  };
}
