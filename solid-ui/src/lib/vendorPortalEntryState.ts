export type VendorPortalEntrySession = {
  user?: {
    email?: string | null;
  } | null;
} | null | undefined;

const OMNYID_ADMIN_EMAIL = "admin@omnyid.com";

/**
 * The named OmnyID operator account belongs in the existing general Workspace,
 * where its established admin controls are available. This is navigation only:
 * it grants no role or server authority and intentionally does not use broad
 * admin-looking email heuristics.
 */
export function vendorPortalWorkspaceRedirect(session: VendorPortalEntrySession): string | null {
  const email = session?.user?.email?.trim().toLowerCase() ?? "";
  return email === OMNYID_ADMIN_EMAIL ? "/workspace/" : null;
}
