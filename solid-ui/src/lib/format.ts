// @locs-version: 1.0
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export function confColor(c: number): string {
  if (c >= 0.85) return "text-emerald-400";
  if (c >= 0.6)  return "text-amber-400";
  return "text-red-400";
}
