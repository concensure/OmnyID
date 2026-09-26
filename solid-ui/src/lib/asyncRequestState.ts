// @locs-version: 1.0
export function nextAsyncRequestId(current: number): number {
  return current + 1;
}

export function isCurrentAsyncRequest(latest: number, requestId: number): boolean {
  return latest === requestId;
}
