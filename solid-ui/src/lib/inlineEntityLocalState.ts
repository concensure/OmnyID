// @locs-version: 1.0
export const INLINE_ENTITY_PRODUCT_LINK_PREFERENCE_KEY = "omnyid.product-link-preference";
export const INLINE_ENTITY_ICONS_KEY = "omnyid.inline-entity-icons";

export type ProductLinkPreference = "amazon" | "ebay" | "google-shopping";

export function loadProductLinkPreference(): ProductLinkPreference {
  try {
    const stored = localStorage.getItem(INLINE_ENTITY_PRODUCT_LINK_PREFERENCE_KEY);
    if (stored === "amazon" || stored === "ebay" || stored === "google-shopping") return stored;
    if (stored !== null) localStorage.setItem(INLINE_ENTITY_PRODUCT_LINK_PREFERENCE_KEY, "amazon");
    return "amazon";
  } catch {
    return "amazon";
  }
}

export function loadInlineEntityIconsEnabled(): boolean {
  try {
    const stored = localStorage.getItem(INLINE_ENTITY_ICONS_KEY);
    if (stored === "0") return false;
    if (stored === "1" || stored === null) return true;
    localStorage.setItem(INLINE_ENTITY_ICONS_KEY, "1");
    return true;
  } catch {
    return true;
  }
}
