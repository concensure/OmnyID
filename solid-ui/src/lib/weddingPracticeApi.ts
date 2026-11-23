import { apiFetch } from "@/lib/api";
import { assertPracticeBootstrap, type PracticeBootstrap } from "./weddingPracticeState";

export async function fetchPracticeBootstrap(practice: string | null, signal: AbortSignal): Promise<PracticeBootstrap> {
  const query = practice ? `?practice_id=${encodeURIComponent(practice)}` : "";
  const data = await apiFetch<PracticeBootstrap>(`/practice/bootstrap${query}`, { signal, cache: "no-store" });
  assertPracticeBootstrap(data, practice);
  return data;
}
