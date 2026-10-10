// @locs-version: 2.0
import { apiFetch } from "@/lib/api";

export type AdminWeddingNewsletterSubscriber = {
  subscriberId: string;
  email: string;
  source: string;
  subscribedAt: string;
  unsubscribedAt: string | null;
};

export type AdminWeddingNewsletterList = {
  subscribers: AdminWeddingNewsletterSubscriber[];
  activeCount: number;
  unsubscribedCount: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeSubscriber(value: unknown): AdminWeddingNewsletterSubscriber | null {
  if (!isRecord(value) || typeof value.subscriber_id !== "string" || typeof value.email !== "string") {
    return null;
  }
  return {
    subscriberId: value.subscriber_id,
    email: value.email,
    source: typeof value.source === "string" ? value.source : "wedding_site",
    subscribedAt: typeof value.subscribed_at === "string" ? value.subscribed_at : "",
    unsubscribedAt: typeof value.unsubscribed_at === "string" ? value.unsubscribed_at : null,
  };
}

export function normalizeAdminWeddingNewsletterList(value: unknown): AdminWeddingNewsletterList {
  const record = isRecord(value) ? value : {};
  const subscribers = Array.isArray(record.subscribers)
    ? record.subscribers.flatMap((entry) => {
        const normalized = normalizeSubscriber(entry);
        return normalized ? [normalized] : [];
      })
    : [];
  return {
    subscribers,
    activeCount: typeof record.active_count === "number" ? record.active_count : 0,
    unsubscribedCount: typeof record.unsubscribed_count === "number" ? record.unsubscribed_count : 0,
  };
}

export const fetchAdminWeddingNewsletter = () =>
  apiFetch<unknown>("/admin/wedding/newsletter").then(normalizeAdminWeddingNewsletterList);

function csvCell(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** Active subscribers only, so an export can be pasted straight into a mailer. */
export function activeSubscribersCsv(subscribers: AdminWeddingNewsletterSubscriber[]): string {
  const rows = subscribers
    .filter((subscriber) => subscriber.unsubscribedAt === null)
    .map((subscriber) => [subscriber.email, subscriber.source, subscriber.subscribedAt].map(csvCell).join(","));
  return ["email,source,subscribed_at", ...rows].join("\r\n");
}
