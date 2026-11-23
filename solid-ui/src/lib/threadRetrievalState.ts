// @locs-version: 1.0
import type { DashboardBootstrap } from "./api";

type ThreadRetrievalState = DashboardBootstrap["thread_retrieval_state"];

type ThreadRetrievalStateCarrier = {
  thread_retrieval_state?: ThreadRetrievalState | null;
} | null | undefined;

type PreparedDraftThreadRetrievalStateCarrier = {
  prepared_draft_thread_retrieval_state?: ThreadRetrievalState | null;
} | null | undefined;

export function threadRetrievalState(
  value?: ThreadRetrievalStateCarrier,
): ThreadRetrievalState | null {
  return value?.thread_retrieval_state ?? null;
}

export function hasThreadRetrievalState(
  value?: ThreadRetrievalStateCarrier,
): boolean {
  return threadRetrievalState(value) !== null;
}

export function preparedDraftThreadRetrievalState(
  value?: PreparedDraftThreadRetrievalStateCarrier,
): ThreadRetrievalState | null {
  return value?.prepared_draft_thread_retrieval_state ?? null;
}

export function hasPreparedDraftThreadRetrievalState(
  value?: PreparedDraftThreadRetrievalStateCarrier,
): boolean {
  return preparedDraftThreadRetrievalState(value) !== null;
}
