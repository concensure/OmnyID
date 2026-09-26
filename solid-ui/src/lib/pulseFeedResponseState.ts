// @locs-version: 1.0
import { isRecord } from "@/lib/eventDetail";
import type { GoalDomain } from "@/lib/profileLedger";
import {
  activeGoalsToPulseGoalOptions,
  normalizeActiveGoalsResponse,
} from "@/lib/activeGoalsResponseState";

export type PulseNewsCategory =
  | "technology"
  | "finance"
  | "health"
  | "science"
  | "politics"
  | "culture"
  | "sports"
  | "local"
  | "environment"
  | "business"
  | "entertainment"
  | "education"
  | "travel"
  | "food";

export type PulseNewsGranularity = "headlines" | "summaries" | "deep";
export type PulseNewsFrequency = "realtime" | "daily" | "weekly";

export interface PulseNewsChannel {
  channel_id: string;
  label: string;
  categories: PulseNewsCategory[];
  locality?: string;
  granularity: PulseNewsGranularity;
  frequency: PulseNewsFrequency;
  sources: string[];
  goal_id?: string;
  enabled: boolean;
  created_at: string;
}

export interface PulseNewsItem {
  id: string;
  channel_id: string;
  url?: string;
  headline?: string;
  summary?: string;
  source_name?: string;
  published_at?: string;
  reading_time_min?: number;
  goal_relevance: boolean;
  categories: PulseNewsCategory[];
  deep_content?: string;
  dismissed: boolean;
  saved_to_knowledge: boolean;
}

export interface PulseGoalOption {
  goal_id: string;
  domain: GoalDomain;
  title: string;
}

const NEWS_CATEGORIES = new Set<PulseNewsCategory>([
  "technology",
  "finance",
  "health",
  "science",
  "politics",
  "culture",
  "sports",
  "local",
  "environment",
  "business",
  "entertainment",
  "education",
  "travel",
  "food",
]);

const NEWS_GRANULARITIES = new Set<PulseNewsGranularity>(["headlines", "summaries", "deep"]);
const NEWS_FREQUENCIES = new Set<PulseNewsFrequency>(["realtime", "daily", "weekly"]);

function scalarString(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeCategory(value: unknown): PulseNewsCategory | null {
  return typeof value === "string" && NEWS_CATEGORIES.has(value as PulseNewsCategory)
    ? value as PulseNewsCategory
    : null;
}

function normalizeCategories(value: unknown): PulseNewsCategory[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((category): PulseNewsCategory[] => {
    const normalized = normalizeCategory(category);
    return normalized ? [normalized] : [];
  });
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): string[] => {
    const text = scalarString(entry).trim();
    return text ? [text] : [];
  });
}

function normalizeGranularity(value: unknown): PulseNewsGranularity {
  return typeof value === "string" && NEWS_GRANULARITIES.has(value as PulseNewsGranularity)
    ? value as PulseNewsGranularity
    : "summaries";
}

function normalizeFrequency(value: unknown): PulseNewsFrequency {
  return typeof value === "string" && NEWS_FREQUENCIES.has(value as PulseNewsFrequency)
    ? value as PulseNewsFrequency
    : "daily";
}

export function normalizePulseNewsChannel(value: unknown): PulseNewsChannel | null {
  if (!isRecord(value) || typeof value.channel_id !== "string") return null;
  return {
    channel_id: value.channel_id,
    label: scalarString(value.label, "Untitled channel"),
    categories: normalizeCategories(value.categories),
    locality: optionalString(value.locality),
    granularity: normalizeGranularity(value.granularity),
    frequency: normalizeFrequency(value.frequency),
    sources: normalizeStringList(value.sources),
    goal_id: optionalString(value.goal_id),
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    created_at: scalarString(value.created_at),
  };
}

export function normalizePulseNewsItem(value: unknown): PulseNewsItem | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.channel_id !== "string") return null;
  return {
    id: value.id,
    channel_id: value.channel_id,
    url: optionalString(value.url),
    headline: optionalString(value.headline),
    summary: optionalString(value.summary),
    source_name: optionalString(value.source_name),
    published_at: optionalString(value.published_at),
    reading_time_min: finiteNumber(value.reading_time_min),
    goal_relevance: typeof value.goal_relevance === "boolean" ? value.goal_relevance : false,
    categories: normalizeCategories(value.categories),
    deep_content: optionalString(value.deep_content),
    dismissed: typeof value.dismissed === "boolean" ? value.dismissed : false,
    saved_to_knowledge: typeof value.saved_to_knowledge === "boolean" ? value.saved_to_knowledge : false,
  };
}

export function normalizePulseGoalOption(value: unknown): PulseGoalOption | null {
  if (!isRecord(value) || typeof value.goal_id !== "string" || typeof value.title !== "string") return null;
  return {
    goal_id: value.goal_id,
    domain: scalarString(value.domain, "personal") as GoalDomain,
    title: value.title,
  };
}

export function normalizePulseChannelsResponse(payload: unknown): PulseNewsChannel[] {
  if (!isRecord(payload) || !Array.isArray(payload.channels)) return [];
  return payload.channels.flatMap((channel): PulseNewsChannel[] => {
    const normalized = normalizePulseNewsChannel(channel);
    return normalized ? [normalized] : [];
  });
}

export function normalizePulseGoalsResponse(payload: unknown): PulseGoalOption[] {
  return activeGoalsToPulseGoalOptions(normalizeActiveGoalsResponse(payload));
}

export function normalizePulseItemsResponse(payload: unknown): PulseNewsItem[] {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return [];
  return payload.items.flatMap((item): PulseNewsItem[] => {
    const normalized = normalizePulseNewsItem(item);
    return normalized ? [normalized] : [];
  });
}
