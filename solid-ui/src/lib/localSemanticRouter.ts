// @locs-version: 1.0
import type { PGlite, Results } from "@electric-sql/pglite";
import { API_BASE, readSession } from "@/lib/api";
import {
  SemanticRouter,
  parseQuery,
  type LocalStore,
  type MetadataFilter,
  type ScoredRow,
  type EdgeRow,
  type RouterResult,
  type IndexedMessage,
} from "afp-ts/semantic-router";
import type { AfpMessage } from "@/lib/api";
import {
  localRouterProjectionHealth,
  refreshLocalRouterDerivedStateIfStale,
  type LocalRouterProjectionHealth,
  type QueryableDb,
} from "@/lib/localRouterProjector";
import {
  localRouterBroadRefreshRecommendation,
  localRouterForcedRefreshOutcomeLabel,
  localRouterProjectionMeta as formatLocalRouterProjectionMeta,
  localRouterPreviewFreshnessMeta as formatLocalRouterPreviewFreshnessMeta,
} from "@/lib/localRouterCopy.js";
import { createPreviewController } from "@/lib/localRouterPreviewControllerCore";
import { isRecord } from "@/lib/eventDetail";
import { decryptedDisplayContent } from "@/lib/decryptedDisplayState";
import { rowToLocalRouterAfpMessage } from "@/lib/localRouterAfpRowState";
import { parseOllamaEmbeddingResponse } from "@/lib/ollamaEmbeddingResponseState";
import { PGliteStore, type DecryptFn, type Embedder } from "@/lib/pglite-store";

const NOOP_EMBEDDER = async () => [] as number[];
const NOOP_DECRYPT = async () => new Map<string, string>();
const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_OLLAMA_EMBED_MODEL = "nomic-embed-text";
let decryptModulePromise: Promise<typeof import("@/lib/decrypt")> | null = null;
let syncModulePromise: Promise<typeof import("@/lib/sync")> | null = null;

function loadDecryptModule() {
  if (!decryptModulePromise) decryptModulePromise = import("@/lib/decrypt");
  return decryptModulePromise;
}

function loadSyncModule() {
  if (!syncModulePromise) syncModulePromise = import("@/lib/sync");
  return syncModulePromise;
}

type LocalRouterEmbedderFactory = (db: PGlite) => Promise<Embedder | null> | Embedder | null;
type LocalRouterDecryptFactory = (db: PGlite) => Promise<DecryptFn | null> | DecryptFn | null;
type LocalRouterProviderRegistration<T> = {
  factory: T | null;
  label: string | null;
};
type ActiveRouterDb = PGlite & QueryableDb;

function activeRouterDb(value: unknown): ActiveRouterDb | null {
  return value ? (value as ActiveRouterDb) : null;
}

export type LocalRouterCapabilities = {
  hasReplica: boolean;
  hasIndex: boolean;
  hasLexical: boolean;
  hasTopology: boolean;
  hasVector: boolean;
  canDecrypt: boolean;
  vectorProvider?: string | null;
  decryptProvider?: string | null;
  projectionHealth?: LocalRouterProjectionHealth;
};

export type LocalSemanticRouterPreview = {
  result: RouterResult | null;
  capabilities: LocalRouterCapabilities;
};

export type LocalRouterProjectionBadge = {
  label: string;
  tone: "info" | "warning";
};

export type LocalRouterProjectionState = {
  badges: LocalRouterProjectionBadge[];
  detail: string | null;
  meta: string | null;
  recommendation: string | null;
};

export type LocalRouterExecutionState = {
  executionBadges: string[];
  skipBadges: string[];
  densityBadges: string[];
  budgetDetail: string | null;
  budgetBadges: string[];
  layerLabel: string | null;
};

export type LocalRouterIndexRefreshResult = {
  available: boolean;
  refreshed: boolean;
  before: LocalRouterProjectionHealth;
  after: LocalRouterProjectionHealth;
  reducedWarning: boolean;
  warningCleared: boolean;
  stillWarning: boolean;
};

export const LOCAL_ROUTER_PREVIEW_DELAY_MS = 70;

export type LocalRouterPreviewProfile = "thread" | "object" | "workspace";

type LocalRouterProfileBudget = {
  maxLatencyMs: number;
  maxWorkingSet: number;
  maxTokens: number;
  maxDecryptions: number;
  maxEmbeddings: number;
};

const LOCAL_ROUTER_PROFILE_BUDGETS: Record<
  LocalRouterPreviewProfile,
  LocalRouterProfileBudget
> = {
  thread: {
    maxLatencyMs: 90,
    maxWorkingSet: 24,
    maxTokens: 0,
    maxDecryptions: 0,
    maxEmbeddings: 0,
  },
  object: {
    maxLatencyMs: 120,
    maxWorkingSet: 32,
    maxTokens: 240,
    maxDecryptions: 2,
    maxEmbeddings: 1,
  },
  workspace: {
    maxLatencyMs: 140,
    maxWorkingSet: 40,
    maxTokens: 360,
    maxDecryptions: 3,
    maxEmbeddings: 1,
  },
};

class CapabilityAwareStore implements LocalStore {
  constructor(
    private readonly base: PGliteStore,
    private readonly capabilities: LocalRouterCapabilities,
  ) {}

  queryMetadata(filter: MetadataFilter): Promise<IndexedMessage[]> {
    return this.capabilities.hasIndex ? this.base.queryMetadata(filter) : Promise.resolve([]);
  }

  fullTextSearch(text: string, filter: MetadataFilter, limit: number): Promise<ScoredRow[]> {
    return this.capabilities.hasLexical
      ? this.base.fullTextSearch(text, filter, limit)
      : Promise.resolve([]);
  }

  vectorSearch(embedding: number[], filter: MetadataFilter, limit: number): Promise<ScoredRow[]> {
    return this.capabilities.hasVector
      ? this.base.vectorSearch(embedding, filter, limit)
      : Promise.resolve([]);
  }

  neighbors(messageIds: string[], maxDepth: number, limit: number): Promise<EdgeRow[]> {
    return this.capabilities.hasTopology
      ? this.base.neighbors(messageIds, maxDepth, limit)
      : Promise.resolve([]);
  }

  decryptBodies(messageIds: string[]): Promise<Map<string, string>> {
    return this.capabilities.canDecrypt
      ? this.base.decryptBodies(messageIds)
      : Promise.resolve(new Map<string, string>());
  }

  embed(text: string): Promise<number[]> {
    return this.capabilities.hasVector ? this.base.embed(text) : Promise.resolve([]);
  }
}

let cachedDb: unknown | null = null;
let cachedCapabilities: LocalRouterCapabilities | null = null;
let cachedRouter: SemanticRouter | null = null;
let registeredEmbedderFactory: LocalRouterProviderRegistration<LocalRouterEmbedderFactory> = {
  factory: null,
  label: null,
};
let registeredDecryptFactory: LocalRouterProviderRegistration<LocalRouterDecryptFactory> = {
  factory: null,
  label: null,
};

type RawRouterMessageRow = {
  id: string;
  thread_id: string;
  from_agent: string;
  to_agents: string[] | null;
  timestamp: string;
  type: string;
  subtype: string | null;
  content: Record<string, unknown>;
  metadata: Record<string, unknown> | null;
  views: Array<Record<string, unknown>>;
  references: Array<Record<string, unknown>>;
  attachments: Array<Record<string, unknown>>;
  encryption: Record<string, unknown> | null;
};

function invalidateCachedRouterState() {
  cachedDb = null;
  cachedCapabilities = null;
  cachedRouter = null;
}

export function invalidateLocalSemanticRouterState() {
  invalidateCachedRouterState();
}

export async function getLocalRouterCapabilitiesSnapshot(): Promise<LocalRouterCapabilities> {
  const { capabilities } = await routerStateForActiveDb();
  return capabilities;
}

function projectionHealthWarningActive(health: LocalRouterProjectionHealth): boolean {
  return (health?.consecutiveFullRefreshes ?? 0) >= 2;
}

export async function refreshLocalRouterIndexNow(): Promise<LocalRouterIndexRefreshResult> {
  const { getActiveSyncDb } = await loadSyncModule();
  const activeDb = activeRouterDb(getActiveSyncDb());
  if (!activeDb) {
    return {
      available: false,
      refreshed: false,
      before: null,
      after: null,
      reducedWarning: false,
      warningCleared: false,
      stillWarning: false,
    };
  }
  const before = await localRouterProjectionHealth(activeDb);
  invalidateCachedRouterState();
  const refreshed = await refreshLocalRouterDerivedStateIfStale(activeDb, { force: true });
  const after = await localRouterProjectionHealth(activeDb);
  invalidateCachedRouterState();
  const beforeWarning = projectionHealthWarningActive(before);
  const afterWarning = projectionHealthWarningActive(after);
  return {
    available: true,
    refreshed,
    before,
    after,
    reducedWarning:
      ((before?.consecutiveFullRefreshes ?? 0) > (after?.consecutiveFullRefreshes ?? 0)),
    warningCleared: beforeWarning && !afterWarning,
    stillWarning: afterWarning,
  };
}

export function registerLocalRouterEmbedderFactory(factory: LocalRouterEmbedderFactory | null) {
  registeredEmbedderFactory = {
    factory,
    label: factory ? "Custom vector" : null,
  };
  invalidateCachedRouterState();
}

export function registerLocalRouterDecryptFactory(factory: LocalRouterDecryptFactory | null) {
  registeredDecryptFactory = {
    factory,
    label: factory ? "Custom decrypt" : null,
  };
  invalidateCachedRouterState();
}

export function registerLocalRouterOllamaEmbedder(config?: {
  ollamaUrl?: string | null;
  model?: string | null;
} | null) {
  if (!config) {
    registerLocalRouterEmbedderFactory(null);
    return;
  }
  const normalizedUrl = config.ollamaUrl?.trim() || DEFAULT_OLLAMA_URL;
  const normalizedModel = config.model?.trim() || DEFAULT_OLLAMA_EMBED_MODEL;
  registeredEmbedderFactory = {
    factory: () => createOllamaEmbedder(normalizedUrl, normalizedModel),
    label: "Ollama vector",
  };
  invalidateCachedRouterState();
}

export function localRouterCapabilityBadges(capabilities: LocalRouterCapabilities | null | undefined): string[] {
  if (!capabilities?.hasReplica || !capabilities.hasIndex) return [];
  const badges = ["Local index"];
  if (capabilities.hasTopology) badges.push("Topology");
  if (capabilities.hasVector) badges.push(capabilities.vectorProvider?.trim() || "Vector");
  if (capabilities.canDecrypt) badges.push(capabilities.decryptProvider?.trim() || "Local decrypt");
  return badges;
}

export function localRouterProjectionBadges(
  capabilities: LocalRouterCapabilities | null | undefined,
): LocalRouterProjectionBadge[] {
  return localRouterProjectionState(capabilities).badges;
}

export function localRouterProjectionState(
  capabilities: LocalRouterCapabilities | null | undefined,
): LocalRouterProjectionState {
  const projectionHealth = capabilities?.projectionHealth;
  if (!capabilities?.hasReplica || !capabilities.hasIndex || !projectionHealth) {
    return {
      badges: [],
      detail: null,
      meta: null,
      recommendation: null,
    };
  }
  const badges: LocalRouterProjectionBadge[] = [];
  if (projectionHealth.lastRefreshMode === "full") {
    badges.push({
      label: "Index refresh: full",
      tone: projectionHealth.consecutiveFullRefreshes >= 2 ? "warning" : "info",
    });
  } else if (projectionHealth.lastRefreshMode === "partial") {
    badges.push({ label: "Index refresh: partial", tone: "info" });
  }
  if (projectionHealth.consecutiveFullRefreshes >= 2) {
    badges.push({
      label: `${projectionHealth.consecutiveFullRefreshes} full refreshes`,
      tone: "warning",
    });
  }
  if (projectionHealth.lastChangedCount > 0) {
    badges.push({
      label: `${projectionHealth.lastChangedCount} changed`,
      tone:
        projectionHealth.lastRefreshMode === "full" && projectionHealth.consecutiveFullRefreshes >= 2
          ? "warning"
          : "info",
    });
  }
  if (projectionHealth.lastRemovedCount > 0) {
    badges.push({
      label: `${projectionHealth.lastRemovedCount} removed`,
      tone:
        projectionHealth.lastRefreshMode === "full" && projectionHealth.consecutiveFullRefreshes >= 2
          ? "warning"
          : "info",
    });
  }
  const detailParts: string[] = [];
  if (projectionHealth.lastRefreshMode) {
    detailParts.push(`Last index refresh was ${projectionHealth.lastRefreshMode}.`);
  }
  if (projectionHealth.consecutiveFullRefreshes >= 2) {
    detailParts.push(`${projectionHealth.consecutiveFullRefreshes} consecutive full refreshes.`);
  }
  if (projectionHealth.lastPartialRefreshAt) {
    const lastPartialRefreshAt = new Date(projectionHealth.lastPartialRefreshAt);
    if (!Number.isNaN(lastPartialRefreshAt.getTime())) {
      detailParts.push(`Last partial recovery ${lastPartialRefreshAt.toLocaleString()}.`);
    }
  }
  if (projectionHealth.lastForcedRefreshAt) {
    const lastForcedRefreshAt = new Date(projectionHealth.lastForcedRefreshAt);
    if (!Number.isNaN(lastForcedRefreshAt.getTime())) {
      const forcedOutcome = localRouterForcedRefreshOutcomeLabel({
        clearedWarning: projectionHealth.lastForcedRefreshClearedWarning,
        reducedWarning: projectionHealth.lastForcedRefreshReducedWarning,
      });
      detailParts.push(`Last manual refresh ${lastForcedRefreshAt.toLocaleString()} and ${forcedOutcome}.`);
    }
  }
  const meta = formatLocalRouterProjectionMeta({
    refreshedAt: projectionHealth.refreshedAt,
    sourceMessageCount: projectionHealth.sourceMessageCount,
  });
  const recommendation = projectionHealth.consecutiveFullRefreshes < 2
    ? null
    : localRouterBroadRefreshRecommendation({
      lastChangedCount: projectionHealth.lastChangedCount,
      hadRecentPartialRecovery: !!projectionHealth.lastPartialRefreshAt,
      recentManualRefreshFailed:
        !!projectionHealth.lastForcedRefreshAt && !projectionHealth.lastForcedRefreshReducedWarning,
    });

  return {
    badges,
    detail: detailParts.length > 0 ? detailParts.join(" ") : null,
    meta,
    recommendation,
  };
}

export function localRouterProjectionDetail(
  capabilities: LocalRouterCapabilities | null | undefined,
): string | null {
  return localRouterProjectionState(capabilities).detail;
}

export function localRouterProjectionMeta(
  capabilities: LocalRouterCapabilities | null | undefined,
): string | null {
  return localRouterProjectionState(capabilities).meta;
}

export function localRouterPreviewFreshnessMeta(
  capabilities: LocalRouterCapabilities | null | undefined,
  lastPreviewRefreshAt: string | null | undefined,
): string | null {
  const projectionHealth = capabilities?.projectionHealth;
  if (!capabilities?.hasReplica || !capabilities.hasIndex || !projectionHealth) return null;
  return formatLocalRouterPreviewFreshnessMeta({
    indexRefreshedAt: projectionHealth.refreshedAt,
    lastPreviewRefreshAt: lastPreviewRefreshAt ?? null,
  });
}

export function localRouterProjectionRecommendation(
  capabilities: LocalRouterCapabilities | null | undefined,
): string | null {
  return localRouterProjectionState(capabilities).recommendation;
}

export function localRouterExecutionState(
  result: RouterResult | null | undefined,
  capabilities: LocalRouterCapabilities | null | undefined,
  options?: {
    budgetLabel?: string;
  },
): LocalRouterExecutionState {
  const budgetLabel = options?.budgetLabel?.trim() || "Local router";
  const densityBadges: string[] = [];
  const budgetBadges = (result?.budget.exhausted ?? []).map((entry) => {
    switch (entry) {
      case "latency":
        return "Latency cap reached";
      case "embeddings":
        return "Embedding cap reached";
      case "decryptions":
        return "Decryption cap reached";
      case "tokens":
        return "Token cap reached";
      default:
        return entry;
    }
  });

  if (result) {
    const sourceCount = result.sources.length;
    if (sourceCount > 0) {
      densityBadges.push(`${sourceCount} local source${sourceCount === 1 ? "" : "s"}`);
    }
    const layerCount = new Set(
      result.candidates.flatMap((candidate) => Object.keys(candidate.scores)),
    ).size;
    if (layerCount > 0) {
      densityBadges.push(`${layerCount} evidence layer${layerCount === 1 ? "" : "s"}`);
    }
    const excerptCount = result.candidates.filter((candidate) => !!candidate.decryptedExcerpt).length;
    if (excerptCount > 0) {
      densityBadges.push(`${excerptCount} excerpt${excerptCount === 1 ? "" : "s"}`);
    }
  }

  let budgetDetail: string | null = null;
  const budget = result?.budget;
  if (budget) {
    const parts = [`${budget.elapsedMs} ms`];
    if (budget.embeddings > 0) parts.push(`${budget.embeddings} embedding${budget.embeddings === 1 ? "" : "s"}`);
    if (budget.decryptions > 0) parts.push(`${budget.decryptions} decryptions`);
    if (budget.tokens > 0) parts.push(`${budget.tokens} tokens`);
    budgetDetail = `${budgetLabel} used ${parts.join(" · ")}.`;
  }

  let layerLabel: string | null = null;
  switch (result?.terminalLayer) {
    case "metadata":
      layerLabel = "Metadata-first";
      break;
    case "lexical":
      layerLabel = "Lexical";
      break;
    case "vector":
      layerLabel = "Semantic";
      break;
    case "topology":
      layerLabel = "Topology";
      break;
    case "deep":
      layerLabel = "Deep";
      break;
    default:
      layerLabel = null;
  }

  return {
    executionBadges: localRouterExecutionBadges(result, capabilities),
    skipBadges: localRouterSkipBadges(result, capabilities),
    densityBadges,
    budgetDetail,
    budgetBadges,
    layerLabel,
  };
}

export function localRouterExecutionBadges(
  result: RouterResult | null | undefined,
  capabilities: LocalRouterCapabilities | null | undefined,
): string[] {
  if (!result) return [];
  const badges: string[] = [];
  const topologyCandidateCount = result.candidates.filter((candidate) => (candidate.scores.topology ?? 0) > 0).length;
  const excerptCount = result.candidates.filter((candidate) => !!candidate.decryptedExcerpt).length;
  if (result.terminalLayer === "topology" || result.terminalLayer === "deep") {
    badges.push(
      topologyCandidateCount > 0
        ? `Topology used (${topologyCandidateCount} linked result${topologyCandidateCount === 1 ? "" : "s"})`
        : "Topology used",
    );
  }
  if ((result.budget.embeddings ?? 0) > 0) {
    const label = capabilities?.vectorProvider?.trim() ? capabilities.vectorProvider.trim() : "Vector";
    const embeddingCount = result.budget.embeddings;
    badges.push(`${label} used (${embeddingCount} embedding${embeddingCount === 1 ? "" : "s"})`);
  }
  if ((result.budget.decryptions ?? 0) > 0 || result.terminalLayer === "deep") {
    const label = capabilities?.decryptProvider?.trim() ? capabilities.decryptProvider.trim() : "Deep";
    const decryptionCount = result.budget.decryptions ?? 0;
    if (decryptionCount > 0 || excerptCount > 0) {
      const detailParts: string[] = [];
      if (decryptionCount > 0) {
        detailParts.push(`${decryptionCount} bod${decryptionCount === 1 ? "y" : "ies"} reranked`);
      }
      if (excerptCount > 0) {
        detailParts.push(`${excerptCount} excerpt${excerptCount === 1 ? "" : "s"}`);
      }
      badges.push(`${label} used (${detailParts.join(", ")})`);
    } else {
      badges.push(`${label} used`);
    }
  }
  return badges;
}

export function localRouterSkipBadges(
  result: RouterResult | null | undefined,
  capabilities: LocalRouterCapabilities | null | undefined,
): string[] {
  if (!result) return [];
  const badges: string[] = [];
  const exhausted = new Set(result.budget.exhausted ?? []);
  const bodyCandidates = result.candidates.filter((candidate) => candidate.message.body_available);

  if (capabilities?.hasVector && result.budget.embeddings === 0 && result.terminalLayer !== "vector" && result.terminalLayer !== "deep") {
    if (exhausted.has("embeddings")) {
      badges.push("Vector skipped: embedding budget");
    } else {
      badges.push("Vector skipped: lexical/topology sufficient");
    }
  }

  if (capabilities?.canDecrypt && result.budget.decryptions === 0 && result.terminalLayer !== "deep") {
    if (exhausted.has("decryptions")) {
      badges.push("Deep skipped: decrypt budget");
    } else if (bodyCandidates.length === 0) {
      badges.push("Deep skipped: no local bodies");
    } else {
      badges.push("Deep skipped: shortlist stayed shallow");
    }
  }

  return badges;
}

function resolvePreviewBudget(
  text: string,
  profile: LocalRouterPreviewProfile,
  capabilities: LocalRouterCapabilities,
): LocalRouterProfileBudget {
  const profileBudget = LOCAL_ROUTER_PROFILE_BUDGETS[profile];
  const parsed = parseQuery(text);
  const hasResidualText = parsed.freeText.trim().length > 0 && !parsed.isStructuredOnly;
  const allowVector = capabilities.hasVector && hasResidualText && profileBudget.maxEmbeddings > 0;
  const allowDeep = capabilities.canDecrypt && hasResidualText && profileBudget.maxDecryptions > 0;

  return {
    maxEmbeddings: allowVector ? profileBudget.maxEmbeddings : 0,
    maxDecryptions: allowDeep ? profileBudget.maxDecryptions : 0,
    maxTokens: allowDeep ? profileBudget.maxTokens : 0,
    maxLatencyMs: profileBudget.maxLatencyMs + (allowDeep ? 35 : allowVector ? 10 : 0),
    maxWorkingSet: profileBudget.maxWorkingSet + (allowDeep ? 8 : allowVector ? 4 : 0),
  };
}

function extractPlainTextFromValue(value: unknown, fragments: string[]) {
  if (value === null || value === undefined) return;
  if (typeof value === "string") {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized) fragments.push(normalized);
    return;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    fragments.push(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) extractPlainTextFromValue(item, fragments);
    return;
  }
  if (isRecord(value)) {
    for (const nested of Object.values(value)) {
      extractPlainTextFromValue(nested, fragments);
    }
  }
}

function decryptedMessageBodyText(message: AfpMessage): string | null {
  const fragments: string[] = [];
  extractPlainTextFromValue(decryptedDisplayContent(message), fragments);
  if (fragments.length === 0) return null;
  return fragments.join(" ").replace(/\s+/g, " ").trim();
}

function createOllamaEmbedder(ollamaUrl: string, model: string): Embedder {
  const endpoint = `${ollamaUrl.replace(/\/+$/, "")}/api/embeddings`;
  return async (text: string) => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text }),
    });
    if (!response.ok) throw new Error(`Ollama embedding request failed: ${response.status}`);
    const embedding = parseOllamaEmbeddingResponse(await response.json());
    if (!embedding) throw new Error("Ollama embedding response missing embedding array");
    return embedding;
  };
}

async function defaultDecryptProvider(db: PGlite): Promise<DecryptFn | null> {
  const { isDecryptReady, tryDecryptMessage } = await loadDecryptModule();
  if (!isDecryptReady()) return null;
  return async (messageIds: string[]) => {
    if (messageIds.length === 0) return new Map<string, string>();
    const rows: Results<RawRouterMessageRow> = await db.query(
      `SELECT id,
              thread_id,
              from_agent,
              to_agents,
              timestamp::text AS timestamp,
              type,
              subtype,
              content,
              metadata,
              views,
              "references" AS references,
              attachments,
              encryption
       FROM messages
       WHERE id = ANY($1)`,
      [messageIds],
    );
    const decrypted = new Map<string, string>();
    for (const row of rows.rows) {
      const plaintext = decryptedMessageBodyText(tryDecryptMessage(rowToLocalRouterAfpMessage(row)));
      if (plaintext) decrypted.set(row.id, plaintext);
    }
    return decrypted;
  };
}

async function resolveRouterProviders(db: PGlite): Promise<{
  embedder: Embedder;
  decryptFn: DecryptFn;
  embedderAvailable: boolean;
  decryptAvailable: boolean;
  vectorProviderLabel: string | null;
  decryptProviderLabel: string | null;
}> {
  const resolvedEmbedder = registeredEmbedderFactory.factory
    ? await registeredEmbedderFactory.factory(db)
    : null;
  const resolvedDecrypt =
    (registeredDecryptFactory.factory ? await registeredDecryptFactory.factory(db) : null)
    ?? await defaultDecryptProvider(db);
  return {
    embedder: resolvedEmbedder ?? NOOP_EMBEDDER,
    decryptFn: resolvedDecrypt ?? NOOP_DECRYPT,
    embedderAvailable: !!resolvedEmbedder,
    decryptAvailable: !!resolvedDecrypt,
    vectorProviderLabel: resolvedEmbedder ? registeredEmbedderFactory.label : null,
    decryptProviderLabel: resolvedDecrypt ? (registeredDecryptFactory.label ?? "Local decrypt") : null,
  };
}

async function detectCapabilities(
  db: PGlite,
  providers: {
    embedderAvailable: boolean;
    decryptAvailable: boolean;
    vectorProviderLabel: string | null;
    decryptProviderLabel: string | null;
  },
): Promise<LocalRouterCapabilities> {
  const tableRows: Results<{ tablename: string }> = await db.query(
    `SELECT tablename
     FROM pg_catalog.pg_tables
     WHERE schemaname = 'public'
       AND tablename = ANY($1)`,
    [["router_index", "router_links", "router_embeddings"]],
  );
  const tables = new Set(tableRows.rows.map((row) => row.tablename));
  return {
    hasReplica: true,
    hasIndex: tables.has("router_index"),
    hasLexical: tables.has("router_index"),
    hasTopology: tables.has("router_index") && tables.has("router_links"),
    hasVector: tables.has("router_index") && tables.has("router_embeddings") && providers.embedderAvailable,
    canDecrypt: providers.decryptAvailable,
    vectorProvider: providers.embedderAvailable ? providers.vectorProviderLabel : null,
    decryptProvider: providers.decryptAvailable ? providers.decryptProviderLabel : null,
  };
}

async function routerStateForActiveDb(): Promise<{
  router: SemanticRouter | null;
  capabilities: LocalRouterCapabilities;
}> {
  const { ensureSyncReady, getActiveSyncDb } = await loadSyncModule();
  if (readSession()?.token) {
    await ensureSyncReady(API_BASE);
  }
  const activeDb = activeRouterDb(getActiveSyncDb());
  if (!activeDb) {
    return {
      router: null,
      capabilities: {
        hasReplica: false,
        hasIndex: false,
        hasLexical: false,
        hasTopology: false,
        hasVector: false,
        canDecrypt: false,
      },
    };
  }
  if (cachedRouter && cachedCapabilities && cachedDb === activeDb) {
    return { router: cachedRouter, capabilities: cachedCapabilities };
  }
  await refreshLocalRouterDerivedStateIfStale(activeDb);
  const projectionHealth = await localRouterProjectionHealth(activeDb);
  const providers = await resolveRouterProviders(activeDb);
  const capabilities = await detectCapabilities(activeDb, providers);
  capabilities.projectionHealth = projectionHealth;
  cachedDb = activeDb;
  cachedCapabilities = capabilities;
  if (!capabilities.hasIndex) {
    cachedRouter = null;
    return { router: null, capabilities };
  }
  const baseStore = new PGliteStore(activeDb, providers.embedder, providers.decryptFn);
  cachedRouter = new SemanticRouter(new CapabilityAwareStore(baseStore, capabilities));
  return { router: cachedRouter, capabilities };
}

export async function runLocalSemanticRouterPreview(
  text: string,
  options?: {
    limit?: number;
    profile?: LocalRouterPreviewProfile;
  },
): Promise<LocalSemanticRouterPreview> {
  const limit = options?.limit ?? 6;
  const profile = options?.profile ?? "workspace";
  const normalized = text.trim();
  if (!normalized) {
    return {
      result: null,
      capabilities: {
        hasReplica: false,
        hasIndex: false,
        hasLexical: false,
        hasTopology: false,
        hasVector: false,
        canDecrypt: false,
      },
    };
  }
  const { router, capabilities } = await routerStateForActiveDb();
  if (!router) return { result: null, capabilities };
  try {
    const profileBudget = resolvePreviewBudget(normalized, profile, capabilities);
    const result = await router.route({
      text: normalized,
      limit,
      budget: {
        maxEmbeddings: profileBudget.maxEmbeddings,
        maxDecryptions: profileBudget.maxDecryptions,
        maxTokens: profileBudget.maxTokens,
        maxLatencyMs: profileBudget.maxLatencyMs,
        maxWorkingSet: profileBudget.maxWorkingSet,
      },
    });
    return { result, capabilities };
  } catch {
    return { result: null, capabilities };
  }
}

export function createLocalSemanticRouterPreviewController(options?: {
  delayMs?: number;
  limit?: number;
  profile?: LocalRouterPreviewProfile;
}) {
  const delayMs = options?.delayMs ?? LOCAL_ROUTER_PREVIEW_DELAY_MS;
  const limit = options?.limit ?? 6;
  const profile = options?.profile ?? "workspace";
  const controller = createPreviewController(
    (query) => runLocalSemanticRouterPreview(query, { limit, profile }),
    { delayMs },
  );

  return {
    preview: controller.preview,
    result: () => controller.preview()?.result ?? null,
    capabilities: () => controller.preview()?.capabilities ?? null,
    set: controller.set,
    clear: controller.clear,
    load: controller.load,
    schedule: controller.schedule,
  };
}
