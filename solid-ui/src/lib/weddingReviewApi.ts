import { apiFetch } from "@/lib/api";

export type WeddingReviewStatus = {
  reviewId: string;
  vendorId: string | null;
  status: string;
  verificationState: string;
  currentRevision: number;
  publishedRevision: number | null;
  audience: "private_feedback" | "public_review";
  experienceKind: string;
  rating: number | null;
  updatedAt: string;
};

export type WeddingReviewDraft = {
  reviewId: string;
  revision: number;
  title: string;
  body: string;
  nextCoupleQuestion: string;
  contextTags: string[];
  displayMode: string;
};

export type WeddingReviewHistoryItem = {
  eventKind: string;
  actorRole: string;
  revision: number | null;
  reasonCode: string | null;
  occurredAt: string;
};

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): string => typeof value === "string" ? value : "";
const number = (value: unknown): number => typeof value === "number" && Number.isFinite(value) ? value : 0;

export async function listWeddingReviews(weddingPlanId: string): Promise<WeddingReviewStatus[]> {
  const response = object(await apiFetch<unknown>(`/wedding/reviews/status?wedding_plan_id=${encodeURIComponent(weddingPlanId)}`));
  const items = Array.isArray(response.items) ? response.items : [];
  return items.map((item) => object(item)).map((item) => ({
    reviewId: text(item.review_id),
    vendorId: text(item.vendor_id) || null,
    status: text(item.status),
    verificationState: text(item.verification_state),
    currentRevision: number(item.current_revision),
    publishedRevision: typeof item.published_revision === "number" ? item.published_revision : null,
    audience: (item.audience === "private_feedback" ? "private_feedback" : "public_review") as WeddingReviewStatus["audience"],
    experienceKind: text(item.experience_kind),
    rating: typeof item.rating === "number" ? item.rating : null,
    updatedAt: text(item.updated_at),
  })).filter((item) => item.reviewId);
}

export async function loadWeddingReviewDraft(reviewId: string): Promise<WeddingReviewDraft> {
  const value = object(await apiFetch<unknown>(`/wedding/reviews/${encodeURIComponent(reviewId)}/draft`));
  return {
    reviewId: text(value.review_id), revision: number(value.revision), title: text(value.title), body: text(value.body),
    nextCoupleQuestion: text(value.next_couple_question), contextTags: Array.isArray(value.context_tags) ? value.context_tags.filter((item): item is string => typeof item === "string") : [],
    displayMode: text(value.display_mode) || "omnyid_couple",
  };
}

export async function loadWeddingReviewHistory(reviewId: string): Promise<WeddingReviewHistoryItem[]> {
  const value = object(await apiFetch<unknown>(`/wedding/reviews/${encodeURIComponent(reviewId)}/status`));
  const history = Array.isArray(value.history) ? value.history : [];
  return history.map((item) => object(item)).map((item) => ({
    eventKind: text(item.event_kind),
    actorRole: text(item.actor_role),
    revision: typeof item.revision === "number" ? item.revision : null,
    reasonCode: text(item.reason_code) || null,
    occurredAt: text(item.occurred_at),
  })).filter((item) => item.eventKind && item.occurredAt);
}

export async function saveWeddingReview(input: {
  weddingPlanId: string;
  responseWorkspaceId: string;
  vendorId: string;
  audience: "private_feedback" | "public_review";
  rating: number | null;
  displayMode: string;
  title: string;
  body: string;
  nextCoupleQuestion: string;
  expectedRevision: number;
  action: "save_draft" | "submit";
  idempotencyKey: string;
}): Promise<{ reviewId: string; revision: number; status: string }> {
  const publicReview = input.audience === "public_review";
  const response = object(await apiFetch<unknown>("/wedding/reviews/revisions", {
    method: "POST",
    bodyJson: {
      wedding_plan_id: input.weddingPlanId,
      response_workspace_id: input.responseWorkspaceId,
      subject_kind: "vendor",
      vendor_id: input.vendorId,
      audience: input.audience,
      experience_kind: publicReview ? "wedding_held" : "enquiry_tour",
      experience_status: "completed",
      rating: publicReview ? input.rating : null,
      display_mode: input.displayMode,
      title: input.title,
      body: input.body,
      next_couple_question: input.nextCoupleQuestion || null,
      context_tags: [],
      invitation_origin: "profile_direct",
      expected_revision: input.expectedRevision,
      idempotency_key: input.idempotencyKey,
      action: input.action,
    },
  }));
  return { reviewId: text(response.review_id), revision: number(response.revision), status: text(response.status) };
}

export function withdrawWeddingReview(reviewId: string, expectedRevision: number, idempotencyKey: string) {
  return apiFetch<unknown>(`/wedding/reviews/${encodeURIComponent(reviewId)}/withdraw`, {
    method: "POST",
    bodyJson: { expected_revision: expectedRevision, idempotency_key: idempotencyKey, reason_code: "author_request" },
  });
}
