const VISIT_KEY = "omnyid.public.visit.v1";
const LEGACY_VISIT_KEY = "omnyid.wedding.visit.v1";

export function sameSessionAcquisitionVisitId(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof sessionStorage === "undefined" ? null : sessionStorage,
): string | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(VISIT_KEY) ?? storage.getItem(LEGACY_VISIT_KEY) ?? "";
    return /^[a-zA-Z0-9]{12}$/.test(value) ? value : null;
  } catch {
    return null;
  }
}

