// @locs-version: 1.0
import type { WeddingVendorContactWorkspaceCard } from "@/lib/weddingResponseWorkspaceViewState";

export function weddingVendorFollowUpAlertLabel(activeCount: number): string | null {
  if (activeCount <= 0) return null;
  return activeCount === 1 ? "One thing needs you today." : `${activeCount} things need you today.`;
}

export function weddingVendorFollowUpCardHeadline(card: WeddingVendorContactWorkspaceCard): string {
  if (card.stage === "closed") return `${card.vendorName} replied to your enquiry.`;
  if (card.stage === "escalate_to_user") return `${card.vendorName} hasn't replied yet — time to decide.`;
  if (card.stage === "mark_unresponsive") return `${card.vendorName} may be unresponsive.`;
  if (card.stage === "follow_up_due") return `${card.vendorName} is due a follow-up.`;
  if (card.stage === "waiting_for_reply") return `Waiting on ${card.vendorName} to reply.`;
  return `Ready to reach out to ${card.vendorName}.`;
}

// "Why we suggest this" strip content — built only from facts actually recorded
// on the contact row. Returns null (an honest "still reviewing" state) rather
// than fabricating a reason when nothing is known yet.
export function weddingVendorFollowUpCardRationale(card: WeddingVendorContactWorkspaceCard): string | null {
  const facts: string[] = [];
  if (card.lastContactLabel) facts.push(`you contacted them on ${card.lastContactLabel}`);
  if (card.followUpDueLabel && card.stage !== "closed") facts.push(`a follow-up was due ${card.followUpDueLabel}`);
  if (card.replyLabel) facts.push(`they replied on ${card.replyLabel}`);
  if (facts.length === 0) return null;
  return `Why we suggest this: ${facts.join("; ")}.`;
}
