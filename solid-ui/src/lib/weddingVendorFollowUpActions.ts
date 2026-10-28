import type { SendAfpMessageInput } from "@/lib/api";
import type { WeddingVendorContactWorkspaceCard } from "@/lib/weddingResponseWorkspaceViewState";
import { rescheduleWeddingVendorFollowUp } from "@/lib/weddingVendorFollowUpApi";
import {
  weddingVendorFollowUpDismissalToAfpSendInput,
  weddingVendorReminderToAfpSendInput,
} from "@/lib/weddingVendorLifecycleState";

type FollowUpActionInput = {
  card: WeddingVendorContactWorkspaceCard;
  metadata: unknown;
  saveProjection?: ((input: SendAfpMessageInput) => Promise<unknown>) | null;
  onSaved?: () => void;
};

function localToday(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export async function saveWeddingVendorFollowUpDate(
  input: FollowUpActionInput & { date: string },
): Promise<boolean> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date < localToday() || !input.saveProjection) return false;
  try {
    const reminderAt = new Date(`${input.date}T12:00:00`).toISOString();
    await input.saveProjection(weddingVendorReminderToAfpSendInput({
      metadata: input.metadata,
      vendorId: input.card.vendorId,
      vendorName: input.card.vendorName,
      reminderAt,
    }));
    if (input.card.vendorId) {
      await rescheduleWeddingVendorFollowUp(input.card.vendorId, reminderAt).catch(() => null);
    }
    input.onSaved?.();
    return true;
  } catch {
    return false;
  }
}

export async function dismissWeddingVendorFollowUp(input: FollowUpActionInput): Promise<boolean> {
  if (!input.saveProjection) return false;
  try {
    await input.saveProjection(weddingVendorFollowUpDismissalToAfpSendInput({
      metadata: input.metadata,
      vendorId: input.card.vendorId,
      vendorName: input.card.vendorName,
    }));
    input.onSaved?.();
    return true;
  } catch {
    return false;
  }
}
