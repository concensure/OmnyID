const OMNYID_ADMIN_EMAIL = "admin@omnyid.com";

/**
 * Presentation-only safeguard while the OAuth session is being refreshed.
 * Server-provided `operator` remains the sole authority for admin data/actions.
 */
export function accountPrefersGeneralAdminWorkspace(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === OMNYID_ADMIN_EMAIL;
}
