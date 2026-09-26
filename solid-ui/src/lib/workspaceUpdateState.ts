// @locs-version: 1.0
export function extractWorkspaceBundleSignature(html: string): string | null {
  const match = html.match(/src="[^"]*assets\/index-([^".]+)\.js"/);
  const signature = match?.[1]?.trim() ?? "";
  return signature || null;
}
