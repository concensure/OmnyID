// @locs-version: 1.0
export type WeddingVendorSearchNoticeInput = {
  ok: boolean;
  message?: string | null;
  sourceCount?: number | null;
  providerLabel?: string | null;
  receiptMetadata?: Record<string, unknown> | null;
};

export type WeddingVendorSearchExecutionNoticeInput = {
  status: string;
  message?: string | null;
  sourceCount?: number | null;
  providerLabel?: string | null;
  receiptMetadata?: Record<string, unknown> | null;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function boundedLine(value: string): string {
  return value.slice(0, 280);
}

function metadataStrings(metadata: Record<string, unknown> | null | undefined, key: string): string[] {
  const value = metadata?.[key];
  if (!Array.isArray(value)) return [];
  return value
    .map(clean)
    .filter(Boolean)
    .map(boundedLine)
    .slice(0, 3);
}

function includesMeaningfully(base: string, detail: string): boolean {
  const normalizedBase = base.toLowerCase();
  const normalizedDetail = detail.toLowerCase();
  return normalizedBase.includes(normalizedDetail.slice(0, Math.min(48, normalizedDetail.length)));
}

export function buildWeddingVendorSearchNoticeState(input: WeddingVendorSearchNoticeInput): string {
  const sourceCount = Math.max(0, input.sourceCount ?? 0);
  const hasUsableSources = sourceCount > 0;
  const successful = input.ok && hasUsableSources;
  const base = clean(input.message)
    || (successful
      ? `Vendor search completed with ${sourceCount} source${sourceCount === 1 ? "" : "s"}.`
      : "No live vendor sources were returned. Try a more specific vendor type and location, or check the provider detail below.");
  if (successful) return boundedLine(base);
  const failures = metadataStrings(input.receiptMetadata, "failed_messages")
    .filter((failure) => !includesMeaningfully(base, failure));
  if (failures.length === 0) return boundedLine(base);
  return boundedLine(`${base} Provider detail: ${failures.join(" ")}`);
}

export function buildWeddingVendorSearchExecutionNoticeState(input: WeddingVendorSearchExecutionNoticeInput): string {
  return buildWeddingVendorSearchNoticeState({
    ok: (input.status === "executed" || input.status === "cached") && Math.max(0, input.sourceCount ?? 0) > 0,
    message: input.message,
    sourceCount: input.sourceCount,
    providerLabel: input.providerLabel,
    receiptMetadata: input.receiptMetadata,
  });
}
