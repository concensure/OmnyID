// @locs-version: 1.0
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseOllamaEmbeddingResponse(payload: unknown): number[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.embedding)) return null;
  const floats = payload.embedding
    .map((value) => (typeof value === "number" ? value : Number(value)))
    .filter((value) => Number.isFinite(value));
  return floats.length > 0 ? floats : null;
}
