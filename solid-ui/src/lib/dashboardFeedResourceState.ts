// @locs-version: 1.0
import {
  fetchMessagesBySupertags,
  fetchSupertagDefinitions,
  fetchTopSupertags,
  type AfpMessage,
  type SupertagCount,
  type SupertagDefinitionRecord,
} from "@/lib/api";

export type DashboardFeedTopicBaseState = {
  tag: string;
  messages: AfpMessage[];
};

export type DashboardFeedTopicSelection = {
  tag: string;
  kind: string | null;
};

export type DashboardFeedTopicSelectionState = {
  tag: string;
  kind: string | null;
  messages: AfpMessage[];
};

export type DashboardFeedMetadataState = {
  supertags: SupertagCount[];
  definitions: SupertagDefinitionRecord[];
  supertagsError: unknown;
  definitionsError: unknown;
};

export type DashboardFeedTopicLensState = {
  base: DashboardFeedTopicBaseState | null;
  selection: DashboardFeedTopicSelectionState | null;
  baseError: unknown;
  selectionError: unknown;
};

export async function loadDashboardFeedTopSupertagsState(
  signedIn: boolean,
  deps: {
    loadTopSupertags?: typeof fetchTopSupertags;
  } = {},
): Promise<SupertagCount[]> {
  if (!signedIn) return [];
  const loadTopSupertags = deps.loadTopSupertags ?? fetchTopSupertags;
  const result = await loadTopSupertags(8);
  return result.supertags;
}

export async function loadDashboardFeedSupertagDefinitionsState(
  signedIn: boolean,
  deps: {
    loadDefinitions?: typeof fetchSupertagDefinitions;
  } = {},
): Promise<SupertagDefinitionRecord[]> {
  if (!signedIn) return [];
  const loadDefinitions = deps.loadDefinitions ?? fetchSupertagDefinitions;
  const result = await loadDefinitions();
  return result.definitions;
}

export async function loadDashboardFeedMetadataState(
  signedIn: boolean,
  deps: {
    loadTopSupertags?: typeof fetchTopSupertags;
    loadDefinitions?: typeof fetchSupertagDefinitions;
  } = {},
): Promise<DashboardFeedMetadataState> {
  if (!signedIn) {
    return {
      supertags: [],
      definitions: [],
      supertagsError: null,
      definitionsError: null,
    };
  }

  const [supertagsResult, definitionsResult] = await Promise.allSettled([
    loadDashboardFeedTopSupertagsState(signedIn, {
      loadTopSupertags: deps.loadTopSupertags,
    }),
    loadDashboardFeedSupertagDefinitionsState(signedIn, {
      loadDefinitions: deps.loadDefinitions,
    }),
  ]);

  return {
    supertags: supertagsResult.status === "fulfilled" ? supertagsResult.value : [],
    definitions: definitionsResult.status === "fulfilled" ? definitionsResult.value : [],
    supertagsError: supertagsResult.status === "rejected" ? supertagsResult.reason : null,
    definitionsError: definitionsResult.status === "rejected" ? definitionsResult.reason : null,
  };
}

export async function loadDashboardFeedTopicBaseState(
  signedIn: boolean,
  tag: string | null,
  deps: {
    loadMessages?: typeof fetchMessagesBySupertags;
  } = {},
): Promise<DashboardFeedTopicBaseState | null> {
  if (!signedIn || !tag) return null;
  const loadMessages = deps.loadMessages ?? fetchMessagesBySupertags;
  const result = await loadMessages([tag], {
    match: "any",
    limit: 48,
    expandHierarchy: true,
  });
  return { tag, messages: result.messages };
}

export async function loadDashboardFeedTopicSelectionState(
  signedIn: boolean,
  selection: DashboardFeedTopicSelection | null,
  deps: {
    loadMessages?: typeof fetchMessagesBySupertags;
  } = {},
): Promise<DashboardFeedTopicSelectionState | null> {
  if (!signedIn || !selection) return null;
  const loadMessages = deps.loadMessages ?? fetchMessagesBySupertags;
  const result = await loadMessages([selection.tag], {
    kind: selection.kind ?? undefined,
    match: "any",
    limit: 48,
    expandHierarchy: true,
  });
  return {
    tag: selection.tag,
    kind: selection.kind ?? null,
    messages: result.messages,
  };
}

export async function loadDashboardFeedTopicLensState(
  signedIn: boolean,
  selection: DashboardFeedTopicSelection | null,
  deps: {
    loadMessages?: typeof fetchMessagesBySupertags;
  } = {},
): Promise<DashboardFeedTopicLensState | null> {
  if (!signedIn || !selection?.tag) return null;

  const [baseResult, selectionResult] = await Promise.allSettled([
    loadDashboardFeedTopicBaseState(signedIn, selection.tag, {
      loadMessages: deps.loadMessages,
    }),
    loadDashboardFeedTopicSelectionState(signedIn, selection, {
      loadMessages: deps.loadMessages,
    }),
  ]);

  return {
    base: baseResult.status === "fulfilled" ? baseResult.value : null,
    selection: selectionResult.status === "fulfilled" ? selectionResult.value : null,
    baseError: baseResult.status === "rejected" ? baseResult.reason : null,
    selectionError: selectionResult.status === "rejected" ? selectionResult.reason : null,
  };
}
