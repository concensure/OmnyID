// @locs-version: 2.0
import {
  normalizeWeddingArtifactSummaries,
  weddingArtifactCategoryLabel,
  type WeddingArtifactInput,
  type WeddingArtifactSummary,
} from "@/lib/weddingArtifactState";
import {
  normalizeWeddingPlanningMetadata,
  type WeddingArtifactKind,
  type WeddingPlanningMetadata,
} from "@/lib/weddingPlanningTemplateState";

export type WeddingResponseWorkspaceCategory = {
  id: WeddingArtifactKind;
  label: string;
  count: number;
  artifacts: WeddingArtifactSummary[];
};

export type WeddingResponseWorkspaceContinueContext = {
  weddingPlanId: string;
  responseWorkspaceId: string;
  sourceResponseId: string | null;
  activeArtifactId: string | null;
  supertags: string[];
};

export type WeddingResponseWorkspaceState = {
  metadata: WeddingPlanningMetadata;
  query: string;
  totalArtifacts: number;
  resultCount: number;
  hasNoMatches: boolean;
  summaryLabel: string;
  artifacts: WeddingArtifactSummary[];
  categories: WeddingResponseWorkspaceCategory[];
  results: WeddingArtifactSummary[];
  activeArtifact: WeddingArtifactSummary | null;
  continueContext: WeddingResponseWorkspaceContinueContext;
  emptyTitle: string | null;
  emptyDetail: string | null;
};

const CATEGORY_ORDER: WeddingArtifactKind[] = [
  "research",
  "vendor_table",
  "budget_sheet",
  "guest_list",
  "timeline",
  "email_draft",
  "legal",
  "registry",
  "map_collection",
  "decision_log",
];

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function queryTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

function matchesQuery(artifact: WeddingArtifactSummary, query: string): boolean {
  const terms = queryTerms(query);
  return terms.length === 0 || terms.every((term) => artifact.searchText.includes(term));
}

function firstArtifactForCategory(artifacts: readonly WeddingArtifactSummary[], kind: WeddingArtifactKind): WeddingArtifactSummary[] {
  return artifacts.filter((artifact) => artifact.kind === kind);
}

function activeArtifactFrom(
  artifacts: readonly WeddingArtifactSummary[],
  activeArtifactId?: string | null,
): WeddingArtifactSummary | null {
  const explicit = clean(activeArtifactId);
  if (explicit) return artifacts.find((artifact) => artifact.id === explicit) ?? artifacts[0] ?? null;
  return artifacts[0] ?? null;
}

export function buildWeddingResponseWorkspaceState(input: {
  metadata?: unknown;
  artifacts?: readonly WeddingArtifactInput[] | null;
  query?: string | null;
  activeArtifactId?: string | null;
}): WeddingResponseWorkspaceState {
  const metadata = normalizeWeddingPlanningMetadata(input.metadata);
  const query = clean(input.query);
  const artifacts = normalizeWeddingArtifactSummaries(input.artifacts ?? [])
    .filter((artifact) => artifact.metadata.responseWorkspaceId === metadata.responseWorkspaceId);
  const results = artifacts.filter((artifact) => matchesQuery(artifact, query));
  const categories = CATEGORY_ORDER
    .map((kind) => {
      const categoryArtifacts = firstArtifactForCategory(results, kind);
      return {
        id: kind,
        label: weddingArtifactCategoryLabel(kind),
        count: categoryArtifacts.length,
        artifacts: categoryArtifacts,
      };
    })
    .filter((category) => category.count > 0);
  const activeArtifact = activeArtifactFrom(results, input.activeArtifactId);
  const hasNoMatches = query.length > 0 && artifacts.length > 0 && results.length === 0;

  return {
    metadata,
    query,
    totalArtifacts: artifacts.length,
    resultCount: results.length,
    hasNoMatches,
    summaryLabel: query.length > 0
      ? `${results.length}/${artifacts.length} planning file${artifacts.length === 1 ? "" : "s"} matched`
      : `${artifacts.length} planning file${artifacts.length === 1 ? "" : "s"}`,
    artifacts,
    categories,
    results,
    activeArtifact,
    continueContext: {
      weddingPlanId: metadata.weddingPlanId,
      responseWorkspaceId: metadata.responseWorkspaceId,
      sourceResponseId: metadata.sourceResponseId,
      activeArtifactId: activeArtifact?.id ?? null,
      supertags: metadata.supertags,
    },
    emptyTitle: hasNoMatches
      ? "No wedding documents match this search."
      : artifacts.length === 0 ? "No wedding documents created yet." : null,
    emptyDetail: hasNoMatches
      ? "Try a vendor, location, artifact type, export format, source, approval state, or wedding tag."
      : artifacts.length === 0
        ? "Ask the agent to create research, vendor comparisons, a budget sheet, email drafts, a run sheet, maps, or registry ideas."
        : null,
  };
}
