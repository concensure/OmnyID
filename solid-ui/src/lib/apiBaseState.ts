// @locs-version: 1.0
function isLoopbackHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return lower === "localhost" || lower === "127.0.0.1" || lower === "::1";
}

export function deriveDefaultApiBase(origin: string): string {
  try {
    const url = new URL(origin);
    const hostname = url.hostname.toLowerCase();

    if (isLoopbackHostname(hostname) || hostname.startsWith("api.") || hostname.startsWith("cloud.")) {
      return url.origin;
    }

    if (!hostname.includes(".")) {
      return url.origin;
    }

    const apiUrl = new URL(url.origin);
    apiUrl.hostname = `api.${hostname}`;
    return apiUrl.origin;
  } catch {
    return origin;
  }
}
