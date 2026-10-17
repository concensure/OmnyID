// @locs-version: 1.0
// Authentication can finish before the Wedding planner has plan metadata.
// This session marker lets the mounted planner consume the import exactly once.
const IMPORT_REQUEST_KEY = "omnyid.wedding.understanding.import.requested.v1";
let requestedInCurrentPage = false;

function session(target: Window): Storage | null {
  try { return target.sessionStorage; } catch { return null; }
}

export function requestWeddingLeadMagnetImport(target: Window = window): void {
  requestedInCurrentPage = true;
  try { session(target)?.setItem(IMPORT_REQUEST_KEY, "1"); } catch { /* current-page marker still works */ }
  target.dispatchEvent(new Event("omnyid:wedding-lead-magnet-import-requested"));
}

export function weddingLeadMagnetImportRequested(target: Window = window): boolean {
  return requestedInCurrentPage || session(target)?.getItem(IMPORT_REQUEST_KEY) === "1";
}

/** Failed AFP writes deliberately retain the marker for the next sign-in. */
export function completeWeddingLeadMagnetImportRequest(target: Window = window): void {
  requestedInCurrentPage = false;
  try { target.sessionStorage.removeItem(IMPORT_REQUEST_KEY); } catch { /* deterministic AFP id protects a retry */ }
}
