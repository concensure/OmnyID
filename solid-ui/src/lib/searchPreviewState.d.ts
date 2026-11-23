// @locs-version: 1.0
export type SearchPreviewTone = "success" | "info" | "warning";

export type SearchPreviewSummary = {
  tone: SearchPreviewTone;
  title: string;
  detail: string;
};

export type SearchPreviewLink = {
  title?: string;
  url: string;
  snippet: string;
  origin?: string | null;
};

export function searchPreviewConfidence(copy: {
  sourceCount: number;
  bulletCount: number;
}): SearchPreviewSummary;

export function searchPreviewSourceDomain(url: string): string | null;

export function searchPreviewIsLikelyWorkspaceLink(link: SearchPreviewLink): boolean;

export function searchPreviewSourceSubtitle(link: SearchPreviewLink): string;

export function searchPreviewEvidenceOrigin(links: SearchPreviewLink[]): SearchPreviewSummary;

export function searchPreviewRefinementSuggestions(copy: {
  query: string;
  links: SearchPreviewLink[];
}): string[];
