// @module-id: wedding.setup-decision-state
// @primary-capability: account-derived-wedding-setup-decision-ranking
import type { WeddingPersonalOsRankedItem } from "@/lib/weddingPersonalOsProjectionState";

export function buildWeddingSetupDecisionItems(input: {
  hasWeddingDate: boolean;
  hasBudgetTarget: boolean;
  guestCount: number;
}): WeddingPersonalOsRankedItem[] {
  const items: Array<WeddingPersonalOsRankedItem | null> = [
    !input.hasWeddingDate ? {
      id: "wedding-setup:date", kind: "decision", title: "Add wedding date",
      pressureFamily: "obligation", rankWeight: 100_000, dueLabel: "Start here", dueAt: null,
      explanation: "Your wedding date anchors the countdown, supplier timing and RSVP deadlines.",
      evidenceLabels: ["wedding setup", "date needed"], sourceSurface: "decision_queue",
      workspaceMenu: "timeline", actionMetadata: { wedding_workspace_menu: "timeline", wedding_setup_decision: "date" }, simulatorSeedKind: "decision",
    } : null,
    !input.hasBudgetTarget ? {
      id: "wedding-setup:budget", kind: "decision", title: "Set a wedding budget",
      pressureFamily: "obligation", rankWeight: 99_000, dueLabel: "Before comparing prices", dueAt: null,
      explanation: "A budget target lets quotes, commitments and remaining spend reconcile against the same plan.",
      evidenceLabels: ["wedding setup", "budget target needed"], sourceSurface: "decision_queue",
      workspaceMenu: "budget", actionMetadata: { wedding_workspace_menu: "budget", wedding_setup_decision: "budget" }, simulatorSeedKind: "decision",
    } : null,
    input.guestCount === 0 ? {
      id: "wedding-setup:guests", kind: "decision", title: "Start the guest list",
      pressureFamily: "attention", rankWeight: 98_000, dueLabel: "After date and budget", dueAt: null,
      explanation: "Adding the first guest unlocks RSVP, meal and seating projections without duplicating the guest list.",
      evidenceLabels: ["wedding setup", "guest list needed"], sourceSurface: "decision_queue",
      workspaceMenu: "guests", actionMetadata: { wedding_workspace_menu: "guests", wedding_setup_decision: "guests" }, simulatorSeedKind: "decision",
    } : null,
  ];
  return items.filter((item): item is WeddingPersonalOsRankedItem => item !== null);
}
