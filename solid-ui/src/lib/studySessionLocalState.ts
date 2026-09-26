// @locs-version: 1.0
import { parseJsonValue } from "@/lib/jsonParseState";
import type { ReportKind } from "@/lib/reportGeneratorState";

export const STUDY_SESSIONS_KEY = "omnyid.study-sessions";
export const STUDY_SESSION_SAVED_EVENT = "omnyid:study-session-saved";
const MAX_STUDY_SESSIONS = 50;

export type StudySessionDuration = "20_min" | "45_min" | "custom";
export type StudySessionStatus = "planned" | "completed";

export type StudySession = {
  id: string;
  title: string;
  status: StudySessionStatus;
  duration: StudySessionDuration;
  courseTag: string | null;
  sourceCount: number;
  deadlineCount: number;
  attemptCount: number;
  nextAction: string | null;
  source: "study_lens" | "reports" | "focused_screen";
  createdAt: number;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNullable(value: unknown): string | null {
  const normalized = clean(value);
  return normalized ? normalized : null;
}

function normalizeCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeDuration(value: unknown): StudySessionDuration {
  if (value === "45_min" || value === "custom") return value;
  return "20_min";
}

function normalizeStatus(value: unknown): StudySessionStatus {
  return value === "completed" ? "completed" : "planned";
}

function normalizeSource(value: unknown): StudySession["source"] {
  if (value === "reports" || value === "focused_screen") return value;
  return "study_lens";
}

function stableIdPart(value: string | null): string {
  return (value ?? "all")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "all";
}

export function normalizeStudySession(value: unknown): StudySession | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const title = clean(record.title);
  const createdAt = typeof record.createdAt === "number" && Number.isFinite(record.createdAt)
    ? record.createdAt
    : Date.now();
  if (!title) return null;
  return {
    id: clean(record.id) || `session:${stableIdPart(title)}:${createdAt}`,
    title,
    status: normalizeStatus(record.status),
    duration: normalizeDuration(record.duration),
    courseTag: cleanNullable(record.courseTag),
    sourceCount: normalizeCount(record.sourceCount),
    deadlineCount: normalizeCount(record.deadlineCount),
    attemptCount: normalizeCount(record.attemptCount),
    nextAction: cleanNullable(record.nextAction),
    source: normalizeSource(record.source),
    createdAt,
  };
}

export function normalizeStudySessions(value: unknown): StudySession[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const sessions: StudySession[] = [];
  for (const entry of value) {
    const session = normalizeStudySession(entry);
    if (!session || seen.has(session.id)) continue;
    seen.add(session.id);
    sessions.push(session);
  }
  return sessions
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_STUDY_SESSIONS);
}

export function loadStudySessions(storage: Storage = localStorage): StudySession[] {
  const raw = storage.getItem(STUDY_SESSIONS_KEY);
  if (!raw) return [];
  const parsed = parseJsonValue(raw);
  if (!parsed.ok) {
    storage.removeItem(STUDY_SESSIONS_KEY);
    return [];
  }
  const sessions = normalizeStudySessions(parsed.value);
  if (sessions.length === 0) storage.removeItem(STUDY_SESSIONS_KEY);
  else storage.setItem(STUDY_SESSIONS_KEY, JSON.stringify(sessions));
  return sessions;
}

export function saveStudySession(session: StudySession, storage: Storage = localStorage): StudySession {
  const normalized = normalizeStudySession(session) ?? session;
  const existing = loadStudySessions(storage).filter((item) => item.id !== normalized.id);
  const next = normalizeStudySessions([normalized, ...existing]);
  storage.setItem(STUDY_SESSIONS_KEY, JSON.stringify(next));
  return next.find((item) => item.id === normalized.id) ?? normalized;
}

export function buildStudySessionFromReportLaunch(input: {
  reportKind: ReportKind;
  title?: string | null;
  courseTag?: string | null;
  sourceCount?: number | null;
  deadlineCount?: number | null;
  attemptCount?: number | null;
  nextAction?: string | null;
  now?: number;
}): StudySession | null {
  if (input.reportKind !== "guided_study_session") return null;
  const createdAt = input.now ?? Date.now();
  const courseTag = cleanNullable(input.courseTag);
  const title = clean(input.title) || (courseTag ? `Guided study session for ${courseTag}` : "Guided study session");
  return {
    id: `report-launch:guided:${stableIdPart(courseTag)}:${createdAt}`,
    title,
    status: "planned",
    duration: "20_min",
    courseTag,
    sourceCount: normalizeCount(input.sourceCount ?? 0),
    deadlineCount: normalizeCount(input.deadlineCount ?? 0),
    attemptCount: normalizeCount(input.attemptCount ?? 0),
    nextAction: cleanNullable(input.nextAction),
    source: "reports",
    createdAt,
  };
}

export function emitStudySessionSaved(session: StudySession): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(STUDY_SESSION_SAVED_EVENT, { detail: session }));
}
