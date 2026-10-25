// @locs-version: 1.0
import { apiFetch } from "@/lib/api";

export type WeddingBlogPublicationInput = {
  slug: string;
  title: string;
  summary: string;
  category: string;
  html: string;
  status: "draft" | "published";
};

export type WeddingBlogPublicationResult = {
  publicUrl: string | null;
  revision: number;
  sanitization: string;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function normalizeWeddingBlogPublicationResult(value: unknown): WeddingBlogPublicationResult {
  const root = record(value);
  const publication = record(root.publication);
  return {
    publicUrl: typeof root.public_url === "string" ? root.public_url : null,
    revision: typeof publication.revision === "number" ? publication.revision : 0,
    sanitization: typeof root.sanitization === "string" ? root.sanitization : "Unsafe HTML removed",
  };
}

export const publishWeddingBlogHtml = (input: WeddingBlogPublicationInput) =>
  apiFetch<unknown>("/admin/wedding/blog-publications", { method: "POST", bodyJson: input })
    .then(normalizeWeddingBlogPublicationResult);
